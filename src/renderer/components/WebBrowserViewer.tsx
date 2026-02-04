import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Globe, Home, X, Plus, Settings, Trash2, Lock, GripVertical, Puzzle, Download, FolderOpen, Key, Eye, EyeOff, Shield, Check, Maximize2, Minimize2 } from 'lucide-react';

// Global cache to persist browser state across tab switches (prevents reload on switch back)
const browserStateCache = new Map<string, {
    initialized: boolean;
    lastUrl: string;
}>();

const WebBrowserViewer = memo(({
    nodeId,
    contentDataRef,
    currentPath,
    setBrowserContextMenuPos,
    handleNewBrowserTab,
    setRootLayoutNode,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane,
    performSplit,
    // Zen mode props for unified header behavior
    onToggleZen,
    isZenMode,
    // Whether we're showing as part of tab bar (hides our zen/close)
    hasTabBar
}) => {
    const webviewRef = useRef(null);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const [currentUrl, setCurrentUrl] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('Browser');
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [error, setError] = useState(null);
    const [showSessionMenu, setShowSessionMenu] = useState(false);
    const [showExtensionsMenu, setShowExtensionsMenu] = useState(false);
    const [extensions, setExtensions] = useState([]);
    const [installedBrowsers, setInstalledBrowsers] = useState([]);
    const [importStatus, setImportStatus] = useState<{ importing: boolean; message?: string } | null>(null);
    const [isSecure, setIsSecure] = useState(false);

    // Password management state
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [pendingCredentials, setPendingCredentials] = useState<{ site: string; username: string; password: string } | null>(null);
    const [savedPasswords, setSavedPasswords] = useState<any[]>([]);
    const [showPasswordFill, setShowPasswordFill] = useState(false);
    const [showPasswordInPrompt, setShowPasswordInPrompt] = useState(false);
    const [showPasswordsMenu, setShowPasswordsMenu] = useState(false);
    const [allPasswords, setAllPasswords] = useState<any[]>([]);
    const [showPasswordValue, setShowPasswordValue] = useState<string | null>(null);

    // Find in page state
    const [findText, setFindText] = useState('');
    const [showFindBar, setShowFindBar] = useState(false);
    const [findResults, setFindResults] = useState<{ activeMatchOrdinal: number; matches: number } | null>(null);
    const findInputRef = useRef<HTMLInputElement>(null);

    // Site permissions state
    const [sitePermissions, setSitePermissions] = useState<Record<string, string[]>>(() => {
        try {
            return JSON.parse(localStorage.getItem('npc-browser-site-permissions') || '{}');
        } catch { return {}; }
    });
    const [showPermissionsMenu, setShowPermissionsMenu] = useState(false);

    // Privacy & ad blocking state
    const [adBlockEnabled, setAdBlockEnabled] = useState(() => {
        return localStorage.getItem('npc-browser-adblock') !== 'false'; // Default enabled
    });
    const [trackingProtection, setTrackingProtection] = useState(() => {
        return localStorage.getItem('npc-browser-tracking-protection') !== 'false'; // Default enabled
    });

    // Cookie inheritance state
    const [showCookieManager, setShowCookieManager] = useState(false);
    const [knownPartitions, setKnownPartitions] = useState<Array<{ partition: string; folderPath: string; lastUsed: number }>>([]);
    const [cookieDomains, setCookieDomains] = useState<string[]>([]);
    const [importStatusCookies, setImportStatusCookies] = useState<string | null>(null);

    // Search engine configuration
    const SEARCH_ENGINES = {
        duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
        startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
        google: { name: 'Google', url: 'https://www.google.com/search?q=' },
        perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
        brave: { name: 'Brave', url: 'https://search.brave.com/search?q=' },
    };
    const [searchEngine, setSearchEngine] = useState(() => {
        return localStorage.getItem('npc-browser-search-engine') || 'duckduckgo';
    });

    // Track navigation type for history graph
    const isManualNavigationRef = useRef(false);
    const previousUrlRef = useRef<string | null>(null);
    const lastHistorySaveRef = useRef<string | null>(null);
    const historyDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const hasInitializedRef = useRef(false);
    const lastKnownPaneUrlRef = useRef<string | null>(null);
    // Track the current tab ID to prevent URL bleeding between tabs during async navigation callbacks
    const currentTabIdRef = useRef<string | null>(null);

    const paneData = contentDataRef.current[nodeId];
    // Capture initial URL only once using a ref to prevent reload loops
    const initialUrlRef = useRef(paneData?.browserUrl || 'about:blank');
    // Use project-based session so each folder has its own cookies/logins
    // This allows users to be logged into different accounts per project
    // Hash the path to create a valid partition name
    const projectPartition = currentPath
        ? `project-${currentPath.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}`
        : 'default-browser-session';
    const viewId = projectPartition;

    // Expose browser automation methods through contentDataRef
    useEffect(() => {
        if (contentDataRef.current[nodeId]) {
            // Get page content as text
            contentDataRef.current[nodeId].getPageContent = async () => {
                const webview = webviewRef.current;
                if (!webview) return { success: false, content: '', url: '', title: '' };

                try {
                    const content = await webview.executeJavaScript(`
                        (function() {
                            const main = document.querySelector('main, article, .content, #content') || document.body;
                            const clone = main.cloneNode(true);
                            clone.querySelectorAll('script, style, nav, footer, aside, .nav, .footer, .ads').forEach(el => el.remove());
                            let text = clone.innerText || clone.textContent;
                            text = text.replace(/\\s+/g, ' ').trim();
                            return text.substring(0, 8000);
                        })();
                    `);
                    return {
                        success: true,
                        content: content,
                        url: webview.getURL(),
                        title: webview.getTitle()
                    };
                } catch (err) {
                    console.error('[WebBrowser] Failed to get page content:', err);
                    return { success: false, content: '', url: currentUrl, title: title };
                }
            };

            // Click on element by selector or text content
            contentDataRef.current[nodeId].browserClick = async (selector: string, options?: { text?: string; index?: number }) => {
                const webview = webviewRef.current;
                if (!webview) return { success: false, error: 'Webview not available' };

                try {
                    const result = await webview.executeJavaScript(`
                        (function() {
                            const selector = ${JSON.stringify(selector)};
                            const text = ${JSON.stringify(options?.text || null)};
                            const index = ${JSON.stringify(options?.index ?? 0)};

                            let elements = [];

                            // Try CSS selector first
                            if (selector) {
                                try {
                                    elements = Array.from(document.querySelectorAll(selector));
                                } catch (e) {
                                    // Invalid selector, try text search
                                }
                            }

                            // If text is provided, filter by text content
                            if (text) {
                                const textLower = text.toLowerCase();
                                if (elements.length === 0) {
                                    // Search all clickable elements by text
                                    const clickables = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], [onclick]');
                                    elements = Array.from(clickables).filter(el =>
                                        el.textContent?.toLowerCase().includes(textLower) ||
                                        el.getAttribute('aria-label')?.toLowerCase().includes(textLower) ||
                                        el.getAttribute('title')?.toLowerCase().includes(textLower)
                                    );
                                } else {
                                    elements = elements.filter(el =>
                                        el.textContent?.toLowerCase().includes(textLower)
                                    );
                                }
                            }

                            if (elements.length === 0) {
                                return { success: false, error: 'Element not found: ' + (selector || text) };
                            }

                            const element = elements[Math.min(index, elements.length - 1)];
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.click();

                            return {
                                success: true,
                                clicked: element.tagName + (element.id ? '#' + element.id : ''),
                                text: element.textContent?.substring(0, 100).trim()
                            };
                        })();
                    `);
                    return result;
                } catch (err) {
                    console.error('[WebBrowser] Click failed:', err);
                    return { success: false, error: err.message };
                }
            };

            // Type text into an input element
            contentDataRef.current[nodeId].browserType = async (selector: string, text: string, options?: { clear?: boolean; submit?: boolean }) => {
                const webview = webviewRef.current;
                if (!webview) return { success: false, error: 'Webview not available' };

                try {
                    const result = await webview.executeJavaScript(`
                        (function() {
                            const selector = ${JSON.stringify(selector)};
                            const text = ${JSON.stringify(text)};
                            const clear = ${JSON.stringify(options?.clear ?? true)};
                            const submit = ${JSON.stringify(options?.submit ?? false)};

                            let element = null;

                            // Try CSS selector
                            try {
                                element = document.querySelector(selector);
                            } catch (e) {}

                            // Fallback: find by placeholder, name, or aria-label
                            if (!element) {
                                const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
                                const selectorLower = selector.toLowerCase();
                                element = Array.from(inputs).find(el =>
                                    el.placeholder?.toLowerCase().includes(selectorLower) ||
                                    el.name?.toLowerCase().includes(selectorLower) ||
                                    el.getAttribute('aria-label')?.toLowerCase().includes(selectorLower) ||
                                    el.id?.toLowerCase().includes(selectorLower)
                                );
                            }

                            if (!element) {
                                return { success: false, error: 'Input element not found: ' + selector };
                            }

                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.focus();

                            if (clear) {
                                element.value = '';
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                            }

                            // Set value and trigger events
                            if (element.isContentEditable) {
                                element.textContent = text;
                            } else {
                                element.value = text;
                            }
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));

                            if (submit) {
                                const form = element.closest('form');
                                if (form) {
                                    form.submit();
                                } else {
                                    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                                }
                            }

                            return {
                                success: true,
                                element: element.tagName + (element.id ? '#' + element.id : ''),
                                typed: text.length + ' characters'
                            };
                        })();
                    `);
                    return result;
                } catch (err) {
                    console.error('[WebBrowser] Type failed:', err);
                    return { success: false, error: err.message };
                }
            };

            // Get screenshot of the page
            contentDataRef.current[nodeId].browserScreenshot = async () => {
                const webview = webviewRef.current;
                if (!webview) return { success: false, error: 'Webview not available' };

                try {
                    const image = await webview.capturePage();
                    const dataUrl = image.toDataURL();
                    return {
                        success: true,
                        screenshot: dataUrl,
                        url: webview.getURL(),
                        title: webview.getTitle()
                    };
                } catch (err) {
                    console.error('[WebBrowser] Screenshot failed:', err);
                    return { success: false, error: err.message };
                }
            };

            // Execute arbitrary JavaScript (for advanced automation)
            contentDataRef.current[nodeId].browserEval = async (code: string) => {
                const webview = webviewRef.current;
                if (!webview) return { success: false, error: 'Webview not available' };

                try {
                    const result = await webview.executeJavaScript(code);
                    return { success: true, result };
                } catch (err) {
                    console.error('[WebBrowser] Eval failed:', err);
                    return { success: false, error: err.message };
                }
            };
        }
    }, [nodeId, currentUrl, title]);

    // Track the current tab ID to prevent URL bleeding between tabs
    // This updates whenever the active tab changes
    useEffect(() => {
        const paneData = contentDataRef.current[nodeId];
        if (paneData?.tabs && paneData.activeTabIndex !== undefined) {
            const activeTab = paneData.tabs[paneData.activeTabIndex];
            currentTabIdRef.current = activeTab?.id || null;
        } else {
            currentTabIdRef.current = null;
        }
    });

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        // Only set the URL on first initialization to prevent reload loops
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            const initialUrl = initialUrlRef.current;
            let urlToLoad = initialUrl;
            if (!initialUrl.startsWith('http') && initialUrl !== 'about:blank') {
                const isLocalhost = initialUrl.startsWith('localhost') || initialUrl.startsWith('127.0.0.1');
                urlToLoad = isLocalhost ? `http://${initialUrl}` : `https://${initialUrl}`;
            }

            setCurrentUrl(urlToLoad);
            setUrlInput(urlToLoad === 'about:blank' ? '' : urlToLoad);
            webview.src = urlToLoad;

            // Focus URL input for blank tabs
            if (urlToLoad === 'about:blank') {
                setTimeout(() => {
                    urlInputRef.current?.focus();
                    urlInputRef.current?.select();
                }, 100);
            }
        }
        webview.setAttribute('partition', `persist:${viewId}`); // Ensure persistence per pane

        const handleDidStartLoading = () => setLoading(true);
        const handleDidStopLoading = () => {
            setLoading(false);
            if (webview) {
                setCanGoBack(webview.canGoBack());
                setCanGoForward(webview.canGoForward());
                // Update title in contentDataRef for PaneHeader (use ref to avoid closure issues)
                if (contentDataRef.current[nodeId]) {
                    contentDataRef.current[nodeId].browserTitle = webview.getTitle();
                }
            }
        };

        const handleDidNavigate = (e) => {
            // Only handle main frame navigations - ignore iframes (like Google's contacts widget)
            if (e.isMainFrame === false) {
                return;
            }

            const url = e.url;

            // Skip if this is the same URL we just processed (prevents loops)
            if (url === previousUrlRef.current) {
                return;
            }

            const fromUrl = previousUrlRef.current;
            const navigationType = isManualNavigationRef.current ? 'manual' : 'click';

            setCurrentUrl(url);
            setUrlInput(url);
            setError(null);
            setIsSecure(url.startsWith('https://'));

            // Debounce history saves to prevent rapid-fire saves during redirects
            if (url && url !== 'about:blank' && url !== lastHistorySaveRef.current) {
                // Clear any pending history save
                if (historyDebounceRef.current) {
                    clearTimeout(historyDebounceRef.current);
                }

                // Debounce the history save by 2 seconds to let redirects fully settle
                historyDebounceRef.current = setTimeout(() => {
                    // Only save if URL hasn't changed since the timeout was set
                    const currentWebviewUrl = webview?.getURL?.();
                    if (currentWebviewUrl && url === currentWebviewUrl) {
                        lastHistorySaveRef.current = url;
                        (window as any).api?.browserAddToHistory?.({
                            url,
                            title: webview.getTitle() || url,
                            folderPath: currentPath,
                            paneId: nodeId,
                            navigationType,
                            fromUrl
                        }).catch((err: any) => console.error('[Browser] History save error:', err));
                    }
                }, 2000);
            }

            // Update tracking refs
            previousUrlRef.current = url;
            isManualNavigationRef.current = false; // Reset after navigation

            // Update paneData url to reflect navigation (but don't trigger re-renders)
            if (contentDataRef.current[nodeId]) {
                contentDataRef.current[nodeId].browserUrl = url;
                // Also update our tracking ref to prevent the tab-switch effect from re-navigating
                lastKnownPaneUrlRef.current = url;

                // Update the tab's browserUrl using tab ID (not activeTabIndex) to prevent URL bleeding
                // This ensures we update the correct tab even if a tab switch happened during navigation
                const paneData = contentDataRef.current[nodeId];
                if (paneData?.tabs && currentTabIdRef.current) {
                    // Find the tab by ID, not by activeTabIndex
                    const tabToUpdate = paneData.tabs.find(t => t.id === currentTabIdRef.current);
                    if (tabToUpdate && tabToUpdate.contentType === 'browser') {
                        tabToUpdate.browserUrl = url;
                    }
                }
            }
        };

        const handlePageTitleUpdated = (e) => {
            const newTitle = e.title || 'Browser';
            setTitle(newTitle);

            // Update paneData title without triggering layout re-renders
            // The title state update above handles the local display
            if (contentDataRef.current[nodeId]) {
                contentDataRef.current[nodeId].browserTitle = newTitle;

                // Update the tab's browserTitle using tab ID (not activeTabIndex) to prevent title bleeding
                const paneData = contentDataRef.current[nodeId];
                if (paneData?.tabs && currentTabIdRef.current) {
                    // Find the tab by ID, not by activeTabIndex
                    const tabToUpdate = paneData.tabs.find(t => t.id === currentTabIdRef.current);
                    if (tabToUpdate && tabToUpdate.contentType === 'browser') {
                        tabToUpdate.browserTitle = newTitle;
                    }
                }
            }
            // NOTE: Removed setRootLayoutNode call - it was causing render loops
            // The pane header will get the title from local state instead
        };
        const handleDidFailLoad = (e) => {
            if (e.errorCode !== -3) { // Ignore aborted loads
                setLoading(false);
                setError(`Failed to load page (Error ${e.errorCode}: ${e.validatedURL})`);
            }
        };

        // Event listener for context menu from webview
        const handleWebviewContextMenu = (e) => {
            e.preventDefault();
            setBrowserContextMenuPos({
                x: e.x,
                y: e.y,
                selectedText: '', // Selection text must come from IPC
                viewId: nodeId // Use nodeId for pane identification
            });
        };
        // NOTE: webview.addEventListener for contextmenu is problematic.
        // IPC from main process is generally more reliable.
        // Assuming window.api.onBrowserShowContextMenu from Enpistu handles this.

        // Handle links that try to open in new windows (target="_blank", window.open, ctrl+click, middle-click)
        const handleNewWindow = (e) => {
            e.preventDefault();
            const url = e.url;
            if (!url || url === 'about:blank') return;

            // Check disposition to determine if user wants new tab
            // 'background-tab' = middle-click or ctrl+click
            // 'foreground-tab' = shift+click or explicit new tab request
            const shouldOpenInNewTab = e.disposition === 'background-tab' ||
                                       e.disposition === 'foreground-tab' ||
                                       e.disposition === 'new-window';

            if (shouldOpenInNewTab && handleNewBrowserTab) {
                // Open in a new tab within the same pane
                handleNewBrowserTab(url, nodeId);
            } else {
                // Open in the same webview (default behavior for regular link clicks)
                webview.src = url;
            }
        };

        // Handle permission requests (camera, microphone, geolocation, etc.)
        const handlePermissionRequest = (e) => {
            // Check stored site permissions
            try {
                const storedPerms = JSON.parse(localStorage.getItem('npc-browser-site-permissions') || '{}');
                const url = webview.getURL?.();
                let site = '';
                try {
                    site = new URL(url).hostname;
                } catch { site = url; }
                const sitePerms = storedPerms[site] || [];

                // Allow if permission is explicitly granted for this site
                if (sitePerms.includes(e.permission)) {
                    e.request.allow();
                    return;
                }
            } catch { /* ignore parsing errors */ }

            // Default: allow common safe permissions, deny others
            const defaultAllowed = ['clipboard-read', 'clipboard-write', 'notifications'];
            if (defaultAllowed.includes(e.permission)) {
                e.request.allow();
            } else {
                e.request.deny();
            }
        };

        webview.addEventListener('did-start-loading', handleDidStartLoading);
        webview.addEventListener('did-stop-loading', handleDidStopLoading);
        webview.addEventListener('did-navigate', handleDidNavigate);
        webview.addEventListener('did-navigate-in-page', handleDidNavigate);
        webview.addEventListener('page-title-updated', handlePageTitleUpdated);
        webview.addEventListener('did-fail-load', handleDidFailLoad);
        webview.addEventListener('new-window', handleNewWindow);
        // webview.addEventListener('context-menu', handleWebviewContextMenu); // Use IPC instead

        return () => {
            // Clear debounce timeouts
            if (historyDebounceRef.current) {
                clearTimeout(historyDebounceRef.current);
            }

            if (webview) {
                webview.removeEventListener('did-start-loading', handleDidStartLoading);
                webview.removeEventListener('did-stop-loading', handleDidStopLoading);
                webview.removeEventListener('did-navigate', handleDidNavigate);
                webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
                webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
                webview.removeEventListener('did-fail-load', handleDidFailLoad);
                webview.removeEventListener('new-window', handleNewWindow);
                // webview.removeEventListener('context-menu', handleWebviewContextMenu);
            }
        };
    // Note: initialUrl and paneData removed from deps to prevent reload loops
    // The initial URL is captured in a ref and only used once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPath, viewId, nodeId, setBrowserContextMenuPos, setRootLayoutNode]);

    // Effect to handle tab switching - navigate when paneData.browserUrl changes externally
    // This should ONLY trigger when switching between tabs within this pane that have different URLs
    useEffect(() => {
        const webview = webviewRef.current;
        const paneUrl = contentDataRef.current[nodeId]?.browserUrl;

        // Initialize the ref on first run
        if (lastKnownPaneUrlRef.current === null) {
            lastKnownPaneUrlRef.current = paneUrl || null;
            return;
        }

        // Only navigate if the paneUrl changed externally (tab switch) and differs from current webview URL
        if (webview && paneUrl && hasInitializedRef.current && paneUrl !== lastKnownPaneUrlRef.current) {
            // Get the current URL from the webview to compare
            const currentWebviewUrl = webview.getURL?.() || '';

            let urlToLoad = paneUrl;
            if (!paneUrl.startsWith('http') && paneUrl !== 'about:blank') {
                const isLocalhost = paneUrl.startsWith('localhost') || paneUrl.startsWith('127.0.0.1');
                urlToLoad = isLocalhost ? `http://${paneUrl}` : `https://${paneUrl}`;
            }

            // Only actually navigate if the webview is showing a different URL
            // This prevents reloading when just switching panes or re-rendering
            if (currentWebviewUrl !== urlToLoad && currentWebviewUrl !== paneUrl) {
                lastKnownPaneUrlRef.current = paneUrl;
                webview.src = urlToLoad;
            } else {
                // Just update the ref without navigating
                lastKnownPaneUrlRef.current = paneUrl;
            }
        }
    });

    const handleNavigate = useCallback(() => {
        const input = urlInput.trim();
        if (!input) return;

        let finalUrl = input;

        // Check if it's a URL or a search query
        // Simple rule: if it has a dot and no spaces, treat it as a URL
        const isUrl = input.startsWith('http://') ||
                      input.startsWith('https://') ||
                      input.startsWith('localhost') ||
                      (input.includes('.') && !input.includes(' '));

        if (isUrl) {
            // It's a URL - add protocol if missing
            if (!input.startsWith('http')) {
                const isLocalhost = input.startsWith('localhost') || input.startsWith('127.0.0.1');
                finalUrl = isLocalhost ? `http://${input}` : `https://${input}`;
            }
        } else {
            // It's a search query - use the configured search engine
            const engine = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.duckduckgo;
            finalUrl = engine.url + encodeURIComponent(input);
        }

        // Mark this as manual navigation (user typed URL)
        isManualNavigationRef.current = true;
        if (webviewRef.current) webviewRef.current.src = finalUrl;
    }, [urlInput, searchEngine]);

    const handleBack = useCallback(() => webviewRef.current?.goBack(), []);
    const handleForward = useCallback(() => webviewRef.current?.goForward(), []);
    const handleRefresh = useCallback(() => webviewRef.current?.reload(), []);
    // Handle find in page
    const handleFindInPage = useCallback((text: string, forward: boolean = true) => {
        const webview = webviewRef.current;
        if (!webview || !text) return;
        
        webview.findInPage(text, { forward, findNext: true });
    }, []);

    const handleStopFindInPage = useCallback(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        
        webview.stopFindInPage('clearSelection');
        setShowFindBar(false);
        setFindText('');
        setFindResults(null);
    }, []);

    // Listen for find results from webview
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleFoundInPage = (e: any) => {
            if (e.result) {
                setFindResults({
                    activeMatchOrdinal: e.result.activeMatchOrdinal,
                    matches: e.result.matches
                });
            }
        };

        webview.addEventListener('found-in-page', handleFoundInPage);
        return () => webview.removeEventListener('found-in-page', handleFoundInPage);
    }, []);

    // Listen for menu-triggered find (Ctrl+F from menu accelerator)
    useEffect(() => {
        const handleOpenFindBar = (e: CustomEvent) => {
            if (e.detail?.paneId === nodeId) {
                setShowFindBar(true);
                setTimeout(() => {
                    findInputRef.current?.focus();
                    findInputRef.current?.select();
                }, 50);
            }
        };

        window.addEventListener('incognide-open-find-bar', handleOpenFindBar as EventListener);
        return () => window.removeEventListener('incognide-open-find-bar', handleOpenFindBar as EventListener);
    }, [nodeId]);

    const handleHardRefresh = useCallback(() => webviewRef.current?.reloadIgnoringCache(), []);

    // Keyboard shortcuts: Backspace for back, Ctrl/Cmd+F for find (only when this pane is focused)
    // Note: Ctrl+R, Ctrl+T, Ctrl+N are handled globally in Enpistu.tsx and main.js
    useEffect(() => {
        const containerRef = document.querySelector(`[data-pane-id="${nodeId}"]`);

        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle shortcuts if this browser pane is focused
            // Check if the event target is within this pane's container
            const target = e.target as HTMLElement;
            const isWithinThisPane = containerRef?.contains(target) ||
                                      target.closest(`[data-pane-id="${nodeId}"]`) !== null;

            if (!isWithinThisPane) return;

            // Ctrl+F / Cmd+F - open find bar
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                setShowFindBar(true);
                // Focus the find input after a short delay to ensure it's rendered
                setTimeout(() => {
                    findInputRef.current?.focus();
                    findInputRef.current?.select();
                }, 50);
                return;
            }

            // Escape - close find bar
            if (e.key === 'Escape' && showFindBar) {
                e.preventDefault();
                handleStopFindInPage();
                return;
            }

            // Ctrl+G / Cmd+G - find next (when find bar is open and has text)
            if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey && findText) {
                e.preventDefault();
                e.stopPropagation();
                handleFindInPage(findText, true);
                return;
            }

            // Ctrl+Shift+G / Cmd+Shift+G - find previous
            if ((e.ctrlKey || e.metaKey) && e.key === 'g' && e.shiftKey && findText) {
                e.preventDefault();
                e.stopPropagation();
                handleFindInPage(findText, false);
                return;
            }

            // Backspace = go back (only if not in a text input)
            if (e.key === 'Backspace') {
                const isTextInput = target.tagName === 'INPUT' ||
                                   target.tagName === 'TEXTAREA' ||
                                   target.isContentEditable;
                if (!isTextInput && canGoBack) {
                    e.preventDefault();
                    handleBack();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [canGoBack, handleBack, nodeId, showFindBar, findText, handleFindInPage, handleStopFindInPage]);
    const handleHome = useCallback(() => {
        const initial = initialUrlRef.current;
        let homeUrl = initial;
        if (!initial.startsWith('http') && initial !== 'about:blank') {
            const isLocalhost = initial.startsWith('localhost') || initial.startsWith('127.0.0.1');
            homeUrl = isLocalhost ? `http://${initial}` : `https://${initial}`;
        }
        if (webviewRef.current) webviewRef.current.src = homeUrl;
        // Focus URL input if going to blank page
        if (initial === 'about:blank' && urlInputRef.current) {
            urlInputRef.current.focus();
            urlInputRef.current.select();
        }
    }, []);

    const handleClearSessionData = useCallback(async () => {
        if (!webviewRef.current) return;
        try {
            // Clear session data via the webview's session
            const webContents = webviewRef.current.getWebContents?.();
            if (webContents) {
                await webContents.session.clearStorageData({
                    storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage'],
                });
                // Reload the page after clearing
                webviewRef.current.reload();
            }
            setShowSessionMenu(false);
        } catch (err) {
            console.error('[Browser] Failed to clear session data:', err);
        }
    }, []);

    const handleClearCookies = useCallback(async () => {
        if (!webviewRef.current) return;
        try {
            const webContents = webviewRef.current.getWebContents?.();
            if (webContents) {
                await webContents.session.clearStorageData({
                    storages: ['cookies'],
                });
                webviewRef.current.reload();
            }
            setShowSessionMenu(false);
        } catch (err) {
            console.error('[Browser] Failed to clear cookies:', err);
        }
    }, []);

    const handleClearCache = useCallback(async () => {
        if (!webviewRef.current) return;
        try {
            const webContents = webviewRef.current.getWebContents?.();
            if (webContents) {
                await webContents.session.clearCache();
                webviewRef.current.reload();
            }
            setShowSessionMenu(false);
        } catch (err) {
            console.error('[Browser] Failed to clear cache:', err);
        }
    }, []);

    // Extension management
    const loadExtensions = useCallback(async () => {
        const result = await (window as any).api?.browserGetExtensions?.();
        if (result?.success) {
            setExtensions(result.extensions || []);
        }
        const browsersResult = await (window as any).api?.browserGetInstalledBrowsers?.();
        if (browsersResult?.success) {
            setInstalledBrowsers(browsersResult.browsers || []);
        }
    }, []);

    const handleAddExtension = useCallback(async () => {
        const result = await (window as any).api?.browserSelectExtensionFolder?.();
        if (result?.success && result.path) {
            const loadResult = await (window as any).api?.browserLoadExtension?.(result.path);
            if (loadResult?.success) {
                loadExtensions();
            } else {
                console.error('[Extensions] Failed to load:', loadResult?.error);
            }
        }
    }, [loadExtensions]);

    const handleRemoveExtension = useCallback(async (extId: string) => {
        const result = await (window as any).api?.browserRemoveExtension?.(extId);
        if (result?.success) {
            loadExtensions();
        }
    }, [loadExtensions]);

    const handleImportFromBrowser = useCallback(async (browserKey: string) => {
        setImportStatus({ importing: true, message: 'Importing...' });
        const result = await (window as any).api?.browserImportExtensionsFrom?.({ browserKey });
        if (result?.success) {
            const imported = result.imported?.length || 0;
            const skipped = result.skipped?.length || 0;
            let msg = `Imported ${imported} extension${imported !== 1 ? 's' : ''}`;
            if (skipped > 0) {
                msg += `, skipped ${skipped} (MV3)`;
            }
            setImportStatus({ importing: false, message: msg });
            loadExtensions();
            setTimeout(() => setImportStatus(null), 3000);
        } else {
            setImportStatus({ importing: false, message: result?.error || 'Import failed' });
            setTimeout(() => setImportStatus(null), 3000);
        }
    }, [loadExtensions]);

    // Load extensions when menu opens
    useEffect(() => {
        if (showExtensionsMenu) {
            loadExtensions();
        }
    }, [showExtensionsMenu, loadExtensions]);

    // Register this partition on mount
    useEffect(() => {
        if (currentPath && viewId) {
            (window as any).api?.browserRegisterPartition?.({ partition: viewId, folderPath: currentPath });
        }
    }, [currentPath, viewId]);

    // Load known partitions and cookie domains when cookie manager opens
    const loadCookieManagerData = useCallback(async () => {
        const [partitionsResult, domainsResult] = await Promise.all([
            (window as any).api?.browserGetKnownPartitions?.(),
            (window as any).api?.browserGetCookieDomains?.({ partition: viewId })
        ]);
        if (partitionsResult?.success) {
            // Filter out current partition and sort by last used
            setKnownPartitions(
                partitionsResult.partitions
                    .filter((p: any) => p.partition !== viewId)
                    .sort((a: any, b: any) => b.lastUsed - a.lastUsed)
            );
        }
        if (domainsResult?.success) {
            setCookieDomains(domainsResult.domains);
        }
    }, [viewId]);

    useEffect(() => {
        if (showCookieManager) {
            loadCookieManagerData();
        }
    }, [showCookieManager, loadCookieManagerData]);

    // Import cookies from another folder
    const handleImportCookies = useCallback(async (sourcePartition: string, domain?: string) => {
        setImportStatusCookies('Importing...');
        const result = await (window as any).api?.browserImportCookiesFromPartition?.({
            sourcePartition,
            targetPartition: viewId,
            domain
        });
        if (result?.success) {
            setImportStatusCookies(`Imported ${result.imported} cookies`);
            setTimeout(() => setImportStatusCookies(null), 2000);
            // Reload the page to apply new cookies
            if (webviewRef.current) {
                webviewRef.current.reload();
            }
        } else {
            setImportStatusCookies(result?.error || 'Import failed');
            setTimeout(() => setImportStatusCookies(null), 3000);
        }
    }, [viewId]);

    // Get domains from a source partition for selective import
    const [sourceDomainsMap, setSourceDomainsMap] = useState<Record<string, string[]>>({});
    const loadSourceDomains = useCallback(async (partition: string) => {
        const result = await (window as any).api?.browserGetCookieDomains?.({ partition });
        if (result?.success) {
            setSourceDomainsMap(prev => ({ ...prev, [partition]: result.domains }));
        }
    }, []);

    // Password management functions
    const getSiteFromUrl = useCallback((url: string) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url;
        }
    }, []);

    const checkForSavedPasswords = useCallback(async (url: string) => {
        const site = getSiteFromUrl(url);
        try {
            const result = await (window as any).api?.passwordGetForSite?.(site);
            if (result?.success && result.credentials?.length > 0) {
                setSavedPasswords(result.credentials);
                setShowPasswordFill(true);
            } else {
                setSavedPasswords([]);
                setShowPasswordFill(false);
            }
        } catch (err) {
            console.error('[Browser] Failed to check saved passwords:', err);
        }
    }, [getSiteFromUrl]);

    const handleSavePassword = useCallback(async () => {
        if (!pendingCredentials) return;
        try {
            await (window as any).api?.passwordSave?.(pendingCredentials);
            setShowPasswordPrompt(false);
            setPendingCredentials(null);
        } catch (err) {
            console.error('[Browser] Failed to save password:', err);
        }
    }, [pendingCredentials]);

    const handleFillPassword = useCallback(async (credential: any) => {
        const webview = webviewRef.current;
        if (!webview) return;

        try {
            // Fetch the full credential with password
            const result = await (window as any).api?.passwordGet?.(credential.id);
            if (!result?.success || !result.credential) {
                console.error('[Browser] Failed to get credential for fill');
                return;
            }
            const fullCredential = result.credential;

            // Inject script to fill the login form
            await webview.executeJavaScript(`
                (function() {
                    const username = ${JSON.stringify(fullCredential.username)};
                    const pwd = ${JSON.stringify(fullCredential.password)};

                    // Find username/email fields
                    const usernameInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"], input[id*="user"], input[id*="email"], input[id*="login"]');
                    const passwordInputs = document.querySelectorAll('input[type="password"]');

                    // Fill username - try to find the best match
                    for (const input of usernameInputs) {
                        if (input.offsetParent !== null) { // visible
                            input.value = username;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }

                    // Fill password
                    for (const input of passwordInputs) {
                        if (input.offsetParent !== null) { // visible
                            input.value = pwd;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }
                })();
            `);
            setShowPasswordFill(false);
        } catch (err) {
            console.error('[Browser] Failed to fill password:', err);
        }
    }, []);

    const loadAllPasswords = useCallback(async () => {
        try {
            const result = await (window as any).api?.passwordList?.();
            if (result?.success) {
                setAllPasswords(result.credentials || []);
            }
        } catch (err) {
            console.error('[Browser] Failed to load passwords:', err);
        }
    }, []);

    const handleDeletePassword = useCallback(async (id: string) => {
        try {
            await (window as any).api?.passwordDelete?.(id);
            loadAllPasswords();
        } catch (err) {
            console.error('[Browser] Failed to delete password:', err);
        }
    }, [loadAllPasswords]);

    // Inject form detection script when page loads
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleDomReady = async () => {
            // Check for saved passwords for this site
            const url = webview.getURL?.();
            if (url) {
                checkForSavedPasswords(url);
            }

            // Inject ad blocking CSS only (non-invasive, won't break sites)
            const isAdBlockOn = localStorage.getItem('npc-browser-adblock') !== 'false';

            if (isAdBlockOn) {
                try {
                    await webview.executeJavaScript(`
                        (function() {
                            if (window.__npcAdBlockInstalled) return;
                            window.__npcAdBlockInstalled = true;

                            // CSS-only ad blocking - safe, won't break site functionality
                            const style = document.createElement('style');
                            style.textContent = \`
                                .adsbygoogle, ins.adsbygoogle, [id*="google_ads"], [class*="GoogleAd"],
                                [id*="taboola"], [id*="outbrain"], [class*="taboola"], [class*="outbrain"],
                                iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
                                [data-ad], [data-ads], [data-advertisement],
                                [aria-label="advertisement"], [aria-label="sponsored"] {
                                    display: none !important;
                                }
                            \`;
                            document.head.appendChild(style);
                            console.log('[NPC Studio] Ad blocking (CSS-only) active');
                        })();
                    `);
                } catch (err) {
                    // Ignore - some pages block script injection
                }
            }

            // Inject script to detect login form submissions
            try {
                await webview.executeJavaScript(`
                    (function() {
                        if (window.__npcPasswordDetectorInstalled) return;
                        window.__npcPasswordDetectorInstalled = true;

                        // Track last known credentials
                        let lastUsername = '';
                        let lastPassword = '';

                        // Scan page for credentials
                        function scanForCredentials() {
                            const passwordInputs = document.querySelectorAll('input[type="password"]');
                            if (passwordInputs.length === 0) return null;

                            let password = '';
                            for (const input of passwordInputs) {
                                if (input.value) {
                                    password = input.value;
                                    break;
                                }
                            }

                            // Find username/email - search whole page, not just form
                            const usernameInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"], input[autocomplete*="user"], input[autocomplete="email"]');
                            let username = '';
                            for (const input of usernameInputs) {
                                if (input.value && input.value.includes('@')) {
                                    username = input.value;
                                    break;
                                }
                            }
                            // Fallback - any text input with value
                            if (!username) {
                                for (const input of usernameInputs) {
                                    if (input.value) {
                                        username = input.value;
                                        break;
                                    }
                                }
                            }

                            return { username, password };
                        }

                        // Signal credentials are ready
                        function signalCredentials(username, password) {
                            if (username && password) {
                                window.__npcPendingCredentials = {
                                    site: window.location.hostname,
                                    username: username,
                                    password: password,
                                    timestamp: Date.now()
                                };
                                console.log('npc-credentials-ready');
                            }
                        }

                        // Listen for form submit
                        document.addEventListener('submit', function(e) {
                            const creds = scanForCredentials();
                            if (creds) signalCredentials(creds.username, creds.password);
                        }, true);

                        // Track password field changes
                        document.addEventListener('input', function(e) {
                            if (e.target.type === 'password' && e.target.value) {
                                lastPassword = e.target.value;
                            }
                            if ((e.target.type === 'text' || e.target.type === 'email') && e.target.value) {
                                lastUsername = e.target.value;
                            }
                        }, true);

                        // Detect button clicks that might submit (for JS-based forms)
                        document.addEventListener('click', function(e) {
                            const btn = e.target.closest('button, input[type="submit"], [role="button"]');
                            if (btn) {
                                // Check if there's a password field with value
                                setTimeout(() => {
                                    const creds = scanForCredentials();
                                    if (creds && creds.password) {
                                        signalCredentials(creds.username || lastUsername, creds.password);
                                    } else if (lastPassword) {
                                        signalCredentials(lastUsername, lastPassword);
                                    }
                                }, 100);
                            }
                        }, true);

                        // Also check before navigation
                        window.addEventListener('beforeunload', function() {
                            if (lastPassword) {
                                signalCredentials(lastUsername, lastPassword);
                            }
                        });
                    })();
                `);
            } catch (err) {
                // Ignore errors for pages that don't allow JS injection
            }
        };

        const handleIpcMessage = (event: any) => {
            if (event.channel === 'password-detected') {
                const { site, username, password } = event.args[0];
                setPendingCredentials({ site, username, password });
                setShowPasswordPrompt(true);
            }
        };

        // Listen for console messages signaling credentials are ready
        const handleConsoleMessage = async (event: any) => {
            try {
                if (event.message === 'npc-credentials-ready') {
                    // Retrieve credentials securely via executeJavaScript
                    const creds = await webview.executeJavaScript(`
                        (function() {
                            const c = window.__npcPendingCredentials;
                            window.__npcPendingCredentials = null;
                            return c;
                        })();
                    `);
                    if (creds && creds.username && creds.password) {
                        // Check if this exact credential is already saved
                        const existingResult = await (window as any).api?.passwordGetForSite?.(creds.site);
                        const isDuplicate = existingResult?.credentials?.some(
                            (saved: any) => saved.username === creds.username && saved.password === creds.password
                        );
                        if (!isDuplicate) {
                            setPendingCredentials(creds);
                            setShowPasswordPrompt(true);
                        }
                    }
                }
            } catch { /* ignore errors */ }
        };

        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('ipc-message', handleIpcMessage);
        webview.addEventListener('console-message', handleConsoleMessage);

        return () => {
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('ipc-message', handleIpcMessage);
            webview.removeEventListener('console-message', handleConsoleMessage);
        };
    }, [checkForSavedPasswords]);

    // Site permission management
    const getPermissionsForSite = useCallback((url: string) => {
        const site = getSiteFromUrl(url);
        return sitePermissions[site] || [];
    }, [sitePermissions, getSiteFromUrl]);

    const toggleSitePermission = useCallback((permission: string) => {
        const site = getSiteFromUrl(currentUrl);
        setSitePermissions(prev => {
            const current = prev[site] || [];
            const updated = current.includes(permission)
                ? current.filter(p => p !== permission)
                : [...current, permission];
            const newPerms = { ...prev, [site]: updated };
            localStorage.setItem('npc-browser-site-permissions', JSON.stringify(newPerms));
            return newPerms;
        });
    }, [currentUrl, getSiteFromUrl]);

    const AVAILABLE_PERMISSIONS = [
        { id: 'clipboard-read', name: 'Clipboard Read', desc: 'Read from clipboard' },
        { id: 'clipboard-write', name: 'Clipboard Write', desc: 'Write to clipboard' },
        { id: 'notifications', name: 'Notifications', desc: 'Show notifications' },
        { id: 'geolocation', name: 'Location', desc: 'Access your location' },
        { id: 'media', name: 'Camera/Mic', desc: 'Access camera and microphone' },
    ];

    // Load passwords when menu opens
    useEffect(() => {
        if (showPasswordsMenu) {
            loadAllPasswords();
        }
    }, [showPasswordsMenu, loadAllPasswords]);

    // Re-introducing drag-and-drop and context menu for the pane itself
    const handleDragStart = useCallback((e) => {
        e.dataTransfer.effectAllowed = 'move';
        const nodePath = findNodePath(rootLayoutNode, nodeId);
        e.dataTransfer.setData('application/json',
            JSON.stringify({ type: 'pane', id: nodeId, nodePath })
        );
        setTimeout(() => setDraggedItem({ type: 'pane', id: nodeId, nodePath }), 0);
    }, [findNodePath, rootLayoutNode, nodeId, setDraggedItem]);

    const handleDragEnd = useCallback(() => setDraggedItem(null), [setDraggedItem]);

    const handleContextMenu = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setPaneContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            nodeId,
            nodePath: findNodePath(rootLayoutNode, nodeId)
        });
    }, [setPaneContextMenu, findNodePath, rootLayoutNode, nodeId]);


    return (
        <div
            className="flex flex-col flex-1 w-full min-h-0 theme-bg-secondary"
        >
            {/* Browser Header */}
            <div
                className="flex theme-bg-tertiary border-b theme-border flex-shrink-0 cursor-move"
                draggable={true}
                onDragStart={(e) => {
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    if (nodePath) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                        setTimeout(() => {
                            setDraggedItem({ type: 'pane', id: nodeId, nodePath });
                        }, 0);
                    }
                }}
                onDragEnd={() => setDraggedItem(null)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    setPaneContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, nodePath });
                }}
            >
                {/* Zen mode button - only show when no tab bar */}
                {!hasTabBar && onToggleZen && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleZen(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-1.5 theme-hover rounded flex-shrink-0 ${isZenMode ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                        title={isZenMode ? "Exit zen mode (Esc)" : "Enter zen mode"}
                    >
                        {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                )}
                {/* Left: Nav buttons */}
                <div className="flex items-center gap-0.5 px-1 border-r theme-border">
                    <button onClick={handleBack} disabled={!canGoBack} className="p-1 theme-hover rounded disabled:opacity-30" title="Back"><ArrowLeft size={16} /></button>
                    <button onClick={handleForward} disabled={!canGoForward} className="p-1 theme-hover rounded disabled:opacity-30" title="Forward"><ArrowRight size={16} /></button>
                    <button
                        onClick={(e) => e.shiftKey ? handleHardRefresh() : handleRefresh()}
                        onContextMenu={(e) => { e.preventDefault(); handleHardRefresh(); }}
                        className="p-1 theme-hover rounded"
                        title="Refresh (Ctrl+R) | Shift+Click or Right-click for Hard Refresh (Ctrl+Shift+R)"
                    >
                        <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={handleHome} className="p-1 theme-hover rounded" title="Home"><Home size={16} /></button>
                </div>

                {/* Center: Address bar */}
                <div className="flex-1 flex items-center min-w-0 px-1 gap-1">
                    <GripVertical size={12} className="flex-shrink-0 theme-text-muted" />
                    <div className="flex-1 max-w-[60%] flex items-center gap-1 min-w-0 theme-bg-secondary rounded px-1.5 py-1">
                        {isSecure ? <Lock size={12} className="text-green-400 flex-shrink-0" /> : <Globe size={12} className="text-gray-400 flex-shrink-0" />}
                        <input ref={urlInputRef} type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNavigate()} placeholder="Search or enter URL..." className="flex-1 bg-transparent text-xs theme-text-primary outline-none min-w-0" onDragStart={(e) => e.stopPropagation()} draggable={false} />
                    </div>
                    <button onClick={() => handleNewBrowserTab('', nodeId)} className="p-0.5 theme-hover rounded" title="New tab (Ctrl+T)"><Plus size={12} /></button>
                </div>

                {/* Far right: Passwords + Permissions + Extensions + Settings + Close in one row */}
                <div className="flex items-center gap-0.5 px-1 border-l theme-border">
                    {/* Saved passwords indicator */}
                    {savedPasswords.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowPasswordFill(!showPasswordFill)}
                                className="p-1 theme-hover rounded text-green-400"
                                title={`${savedPasswords.length} saved password(s) available`}
                            >
                                <Key size={16} />
                            </button>
                            {showPasswordFill && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowPasswordFill(false)} />
                                    <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded-lg shadow-lg z-50 min-w-[220px]">
                                        <div className="p-2 border-b theme-border">
                                            <span className="text-xs font-medium theme-text-primary">Auto-fill Credentials</span>
                                        </div>
                                        {savedPasswords.map((pwd: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleFillPassword(pwd)}
                                                className="flex items-center gap-2 w-full px-3 py-2 text-left theme-hover"
                                            >
                                                <Key size={14} className="text-green-400" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs theme-text-primary truncate">{pwd.username}</div>
                                                    <div className="text-[10px] theme-text-muted">{pwd.site}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Site permissions button */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowPermissionsMenu(!showPermissionsMenu); setShowSessionMenu(false); setShowExtensionsMenu(false); setShowPasswordsMenu(false); }}
                            className={`p-1 theme-hover rounded ${getPermissionsForSite(currentUrl).length > 0 ? 'text-blue-400' : ''}`}
                            title="Site Permissions"
                        >
                            <Shield size={16} />
                        </button>
                        {showPermissionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowPermissionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded-lg shadow-lg z-50 min-w-[250px]">
                                    <div className="p-2 border-b theme-border">
                                        <span className="text-xs font-medium theme-text-primary">Permissions for {getSiteFromUrl(currentUrl)}</span>
                                    </div>
                                    <div className="py-1">
                                        {AVAILABLE_PERMISSIONS.map(perm => {
                                            const isAllowed = getPermissionsForSite(currentUrl).includes(perm.id);
                                            return (
                                                <button
                                                    key={perm.id}
                                                    onClick={() => toggleSitePermission(perm.id)}
                                                    className="flex items-center gap-2 w-full px-3 py-2 text-left theme-hover"
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isAllowed ? 'bg-green-500 border-green-500' : 'border-gray-500'}`}>
                                                        {isAllowed && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-xs theme-text-primary">{perm.name}</div>
                                                        <div className="text-[10px] theme-text-muted">{perm.desc}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Passwords manager button */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowPasswordsMenu(!showPasswordsMenu); setShowSessionMenu(false); setShowExtensionsMenu(false); setShowPermissionsMenu(false); }}
                            className="p-1 theme-hover rounded"
                            title="Saved Passwords"
                        >
                            <Key size={16} />
                        </button>
                        {showPasswordsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowPasswordsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded-lg shadow-lg z-50 min-w-[280px] max-h-[400px] overflow-auto">
                                    <div className="p-2 border-b theme-border">
                                        <span className="text-xs font-medium theme-text-primary">Saved Passwords</span>
                                    </div>
                                    {allPasswords.length > 0 ? (
                                        <div className="py-1">
                                            {allPasswords.map((pwd: any) => (
                                                <div key={pwd.id} className="flex items-center gap-2 px-3 py-2 theme-hover">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs theme-text-primary truncate">{pwd.site}</div>
                                                        <div className="text-[10px] theme-text-muted truncate">{pwd.username}</div>
                                                        <div className="text-[10px] font-mono theme-text-muted">
                                                            {showPasswordValue === pwd.id ? pwd.password : '••••••••'}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowPasswordValue(showPasswordValue === pwd.id ? null : pwd.id)}
                                                        className="p-1 theme-hover rounded"
                                                        title={showPasswordValue === pwd.id ? "Hide password" : "Show password"}
                                                    >
                                                        {showPasswordValue === pwd.id ? <EyeOff size={12} /> : <Eye size={12} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePassword(pwd.id)}
                                                        className="p-1 theme-hover rounded text-red-400"
                                                        title="Delete password"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-4 text-xs theme-text-muted text-center">
                                            No saved passwords
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Extensions button */}
                    <div className="relative">
                        <button onClick={() => { setShowExtensionsMenu(!showExtensionsMenu); setShowSessionMenu(false); setShowPasswordsMenu(false); setShowPermissionsMenu(false); }} className={`p-1 theme-hover rounded ${extensions.length > 0 ? 'text-purple-400' : ''}`} title="Extensions"><Puzzle size={16} /></button>
                        {showExtensionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowExtensionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded-lg shadow-lg z-50 min-w-[280px] max-h-[400px] overflow-auto">
                                    <div className="p-2 border-b theme-border flex items-center justify-between">
                                        <span className="text-xs font-medium theme-text-primary">Extensions</span>
                                        <button onClick={handleAddExtension} className="p-1 theme-hover rounded text-green-400" title="Add extension from folder"><FolderOpen size={14} /></button>
                                    </div>

                                    {/* Installed extensions */}
                                    {extensions.length > 0 ? (
                                        <div className="py-1 border-b theme-border">
                                            {extensions.map((ext: any) => (
                                                <div key={ext.id} className="flex items-center justify-between px-3 py-1.5 theme-hover">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs theme-text-primary truncate">{ext.name}</div>
                                                        <div className="text-[10px] theme-text-muted">v{ext.version}</div>
                                                    </div>
                                                    <button onClick={() => handleRemoveExtension(ext.id)} className="p-1 theme-hover rounded text-red-400" title="Remove"><Trash2 size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-xs theme-text-muted text-center border-b theme-border">No extensions installed</div>
                                    )}

                                    {/* Import status */}
                                    {importStatus && (
                                        <div className={`px-3 py-2 text-xs text-center border-b theme-border ${importStatus.importing ? 'text-blue-400' : 'text-green-400'}`}>
                                            {importStatus.message}
                                        </div>
                                    )}

                                    {/* Import from browsers */}
                                    {installedBrowsers.length > 0 && !importStatus?.importing && (
                                        <div className="py-1">
                                            <div className="px-3 py-1 text-[10px] theme-text-muted uppercase">Import from (MV2 only)</div>
                                            {installedBrowsers.filter((b: any) => b.key !== 'firefox').map((browser: any) => (
                                                <button key={browser.key} onClick={() => handleImportFromBrowser(browser.key)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs theme-hover text-left">
                                                    <Download size={12} />{browser.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Settings button */}
                    <div className="relative">
                        <button onClick={() => { setShowSessionMenu(!showSessionMenu); setShowExtensionsMenu(false); }} className="p-1 theme-hover rounded" title="Settings"><Settings size={16} /></button>
                        {showSessionMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSessionMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 theme-bg-secondary border theme-border rounded-lg shadow-lg z-50 min-w-[200px]">
                                    <div className="p-2 border-b theme-border">
                                        <span className="text-xs theme-text-muted block mb-1">Search Engine</span>
                                        <select value={searchEngine} onChange={(e) => { setSearchEngine(e.target.value); localStorage.setItem('npc-browser-search-engine', e.target.value); }} className="w-full text-xs theme-input rounded px-2 py-1">
                                            {Object.entries(SEARCH_ENGINES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                                        </select>
                                    </div>
                                    {/* Privacy Settings */}
                                    <div className="p-2 border-b theme-border">
                                        <span className="text-xs theme-text-muted block mb-2">Privacy & Ad Blocking</span>
                                        <label className="flex items-center justify-between py-1 cursor-pointer">
                                            <span className="text-xs theme-text-primary">Block Ads</span>
                                            <button
                                                onClick={() => {
                                                    const newVal = !adBlockEnabled;
                                                    setAdBlockEnabled(newVal);
                                                    localStorage.setItem('npc-browser-adblock', String(newVal));
                                                }}
                                                className={`w-8 h-4 rounded-full transition-colors ${adBlockEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                                            >
                                                <div className={`w-3 h-3 rounded-full bg-white transform transition-transform ${adBlockEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                            </button>
                                        </label>
                                        <label className="flex items-center justify-between py-1 cursor-pointer">
                                            <span className="text-xs theme-text-primary">Block Trackers</span>
                                            <button
                                                onClick={() => {
                                                    const newVal = !trackingProtection;
                                                    setTrackingProtection(newVal);
                                                    localStorage.setItem('npc-browser-tracking-protection', String(newVal));
                                                }}
                                                className={`w-8 h-4 rounded-full transition-colors ${trackingProtection ? 'bg-green-500' : 'bg-gray-600'}`}
                                            >
                                                <div className={`w-3 h-3 rounded-full bg-white transform transition-transform ${trackingProtection ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                            </button>
                                        </label>
                                        <div className="text-[10px] theme-text-muted mt-1">
                                            Blocks ads, trackers, and analytics scripts. Reload page after changing.
                                        </div>
                                    </div>
                                    {/* Cookie Inheritance */}
                                    <div className="p-2 border-b theme-border">
                                        <button
                                            onClick={() => setShowCookieManager(!showCookieManager)}
                                            className="flex items-center justify-between w-full text-xs theme-text-primary"
                                        >
                                            <span className="flex items-center gap-2">
                                                <FolderOpen size={12} />
                                                Import Logins from Other Folders
                                            </span>
                                            <span className="text-gray-500">{showCookieManager ? '▲' : '▼'}</span>
                                        </button>
                                        {showCookieManager && (
                                            <div className="mt-2 space-y-2">
                                                {importStatusCookies && (
                                                    <div className="text-[10px] text-blue-400 py-1">{importStatusCookies}</div>
                                                )}
                                                {knownPartitions.length === 0 ? (
                                                    <div className="text-[10px] theme-text-muted py-1">
                                                        No other folders with saved logins yet.
                                                    </div>
                                                ) : (
                                                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                                                        {knownPartitions.map((p) => (
                                                            <div key={p.partition} className="theme-bg-tertiary rounded p-2">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-[10px] theme-text-primary truncate max-w-[120px]" title={p.folderPath}>
                                                                        {p.folderPath.split('/').pop() || p.folderPath}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleImportCookies(p.partition)}
                                                                        className="text-[9px] px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
                                                                    >
                                                                        Import All
                                                                    </button>
                                                                </div>
                                                                <div className="text-[9px] theme-text-muted truncate" title={p.folderPath}>
                                                                    {p.folderPath}
                                                                </div>
                                                                {/* Show domains for selective import */}
                                                                {!sourceDomainsMap[p.partition] ? (
                                                                    <button
                                                                        onClick={() => loadSourceDomains(p.partition)}
                                                                        className="text-[9px] text-blue-400 hover:underline mt-1"
                                                                    >
                                                                        Show sites...
                                                                    </button>
                                                                ) : sourceDomainsMap[p.partition].length > 0 ? (
                                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                                        {sourceDomainsMap[p.partition].slice(0, 8).map((domain) => (
                                                                            <button
                                                                                key={domain}
                                                                                onClick={() => handleImportCookies(p.partition, domain)}
                                                                                className="text-[9px] px-1 py-0.5 bg-gray-700 hover:bg-gray-600 rounded truncate max-w-[80px]"
                                                                                title={`Import ${domain} cookies`}
                                                                            >
                                                                                {domain.replace('www.', '')}
                                                                            </button>
                                                                        ))}
                                                                        {sourceDomainsMap[p.partition].length > 8 && (
                                                                            <span className="text-[9px] theme-text-muted">
                                                                                +{sourceDomainsMap[p.partition].length - 8} more
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[9px] theme-text-muted mt-1">No cookies saved</div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {cookieDomains.length > 0 && (
                                                    <div className="text-[10px] theme-text-muted border-t theme-border pt-2 mt-2">
                                                        <span className="font-medium">This folder has logins for:</span>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {cookieDomains.slice(0, 6).map((d) => (
                                                                <span key={d} className="px-1 py-0.5 bg-gray-700 rounded text-[9px]">
                                                                    {d.replace('www.', '')}
                                                                </span>
                                                            ))}
                                                            {cookieDomains.length > 6 && (
                                                                <span className="text-[9px]">+{cookieDomains.length - 6} more</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="py-1">
                                        <button onClick={handleClearCookies} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs theme-hover text-left"><Trash2 size={12} />Clear Cookies</button>
                                        <button onClick={handleClearCache} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs theme-hover text-left"><Trash2 size={12} />Clear Cache</button>
                                        <button onClick={handleClearSessionData} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 theme-hover text-left"><Trash2 size={12} />Clear All</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {/* Close button - only show when no tab bar */}
                    {!hasTabBar && closeContentPane && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const nodePath = findNodePath(rootLayoutNode, nodeId);
                                closeContentPane(nodeId, nodePath);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1.5 theme-hover rounded flex-shrink-0 text-gray-400 hover:text-red-400"
                            title="Close pane"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Webview Container */}
            <div className="flex-1 relative theme-bg-secondary min-h-0">
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 p-4">
                        <div className="text-center p-6 max-w-md theme-bg-tertiary rounded-lg border theme-border">
                            <h3 className="text-lg font-medium theme-text-primary mb-2">Failed to Load Page</h3>
                            <p className="theme-text-muted text-sm mb-4">{error}</p>
                            <button onClick={handleRefresh} className="px-4 py-2 theme-button-primary rounded">Try Again</button>
                        </div>
                    </div>
                )}

                <webview
                    ref={webviewRef}
                    className="absolute inset-0 w-full h-full"
                    partition={`persist:${viewId}`}
                    allowpopups="true"
                    allowusermedia="true"
                    webpreferences="contextIsolation=no, javascript=yes, webSecurity=yes, allowRunningInsecureContent=no, spellcheck=yes, enableRemoteModule=no"
                    style={{ visibility: error ? 'hidden' : 'visible' }}
                />

                {/* Overlay to block webview interaction during layout resize/drag */}
                <div className="webview-resize-overlay absolute inset-0 z-10" />

                {/* Find Bar */}
                {showFindBar && (
                    <div className="absolute top-0 right-0 z-50 m-2 flex items-center gap-2 theme-bg-secondary border theme-border rounded-lg shadow-lg px-3 py-2">
                        <input
                            ref={findInputRef}
                            type="text"
                            value={findText}
                            onChange={(e) => {
                                setFindText(e.target.value);
                                if (e.target.value) {
                                    handleFindInPage(e.target.value, true);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleFindInPage(findText, !e.shiftKey);
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleStopFindInPage();
                                }
                            }}
                            placeholder="Find in page..."
                            className="w-48 px-2 py-1 text-sm theme-bg-primary theme-text-primary border theme-border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                        />
                        {findResults && (
                            <span className="text-xs theme-text-muted whitespace-nowrap">
                                {findResults.matches > 0
                                    ? `${findResults.activeMatchOrdinal}/${findResults.matches}`
                                    : 'No matches'}
                            </span>
                        )}
                        <button
                            onClick={() => handleFindInPage(findText, false)}
                            disabled={!findText}
                            className="p-1 theme-hover rounded disabled:opacity-50"
                            title="Previous (Shift+Enter)"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <button
                            onClick={() => handleFindInPage(findText, true)}
                            disabled={!findText}
                            className="p-1 theme-hover rounded disabled:opacity-50"
                            title="Next (Enter)"
                        >
                            <ArrowRight size={14} />
                        </button>
                        <button
                            onClick={handleStopFindInPage}
                            className="p-1 theme-hover rounded"
                            title="Close (Esc)"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Password Save Prompt */}
                {showPasswordPrompt && pendingCredentials && (
                    <div className="absolute bottom-4 right-4 z-50 theme-bg-secondary border theme-border rounded-lg shadow-lg p-4 max-w-sm">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-green-500/20">
                                <Key size={20} className="text-green-400" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-medium theme-text-primary mb-1">Save password?</h4>
                                <p className="text-xs theme-text-muted mb-2">
                                    Save credentials for <span className="font-medium">{pendingCredentials.site}</span>
                                </p>
                                <div className="text-xs theme-text-muted mb-3">
                                    <div className="flex items-center gap-1">
                                        <span className="text-gray-500">Username:</span>
                                        <span>{pendingCredentials.username}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-gray-500">Password:</span>
                                        <span>{showPasswordInPrompt ? pendingCredentials.password : '••••••••'}</span>
                                        <button
                                            onClick={() => setShowPasswordInPrompt(!showPasswordInPrompt)}
                                            className="p-0.5 theme-hover rounded"
                                        >
                                            {showPasswordInPrompt ? <EyeOff size={10} /> : <Eye size={10} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSavePassword}
                                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => { setShowPasswordPrompt(false); setPendingCredentials(null); }}
                                        className="flex-1 px-3 py-1.5 theme-bg-tertiary theme-hover text-xs rounded"
                                    >
                                        Not now
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowPasswordPrompt(false); setPendingCredentials(null); }}
                                className="p-1 theme-hover rounded"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => prevProps.nodeId === nextProps.nodeId);

export default WebBrowserViewer;