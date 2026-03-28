import React, { useEffect, useRef, memo, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as TerminalIcon, Code, Sparkles, Settings, X, Type, Palette } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const SHELL_PROMPT_KEY = 'incognide-shell-profile-prompted';

const MAX_TERMINAL_CONTEXT_LINES = 100;

function getSmartSelection(term: Terminal): string {
    const selection = term.getSelection();
    if (!selection) return '';

    const selPos = term.getSelectionPosition();
    if (!selPos) return selection;

    const buffer = term.buffer.active;
    const rawLines = selection.split('\n');
    const result: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
        const bufferY = selPos.start.y + i;
        const bufferLine = buffer.getLine(bufferY);

        if (i > 0 && bufferLine?.isWrapped) {

            result[result.length - 1] = result[result.length - 1].replace(/\s+$/, '') + rawLines[i];
        } else {
            result.push(rawLines[i]);
        }
    }

    return result.join('\n');
}

const THEME_PRESETS = {
    'default': {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selection: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6'
    },
    'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selection: '#44475a',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2'
    },
    'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selection: '#49483e',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2'
    },
    'solarized-dark': {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#839496',
        selection: '#073642',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5'
    },
    'solarized-light': {
        background: '#fdf6e3',
        foreground: '#657b83',
        cursor: '#657b83',
        selection: '#eee8d5',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#fdf6e3'
    },
    'nord': {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#d8dee9',
        selection: '#434c5e',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0'
    },
    'gruvbox': {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#ebdbb2',
        selection: '#504945',
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984'
    },
    'one-dark': {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#abb2bf',
        selection: '#3e4451',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf'
    },
    'light': {
        background: '#ffffff',
        foreground: '#333333',
        cursor: '#333333',
        selection: '#d0d0d0',
        black: '#000000',
        red: '#c41a16',
        green: '#007400',
        yellow: '#826b28',
        blue: '#0000ff',
        magenta: '#a90d91',
        cyan: '#3971ed',
        white: '#c7c7c7'
    }
};

const TerminalView = ({ nodeId, contentDataRef, currentPath, activeContentPaneId, setActiveContentPaneId, shell, isDarkMode = true }) => {
    const terminalRef = useRef(null);
    const xtermInstance = useRef(null);
    const fitAddonRef = useRef(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const handleWindowResizeRef = useRef<(() => void) | null>(null);
    const isSessionReady = useRef(false);
    const terminalOutputBuffer = useRef<string[]>([]);
    const initialPathRef = useRef(currentPath);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [showShellPrompt, setShowShellPrompt] = useState(false);
    const [activeShell, setActiveShell] = useState<string>('system');
    const [pythonEnv, setPythonEnv] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('terminal-font-size');
        return saved ? parseInt(saved) : 14;
    });
    const [fontFamily, setFontFamily] = useState(() => {
        return localStorage.getItem('terminal-font-family') || '"Fira Code", monospace';
    });
    const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>(() => {
        return (localStorage.getItem('terminal-cursor-style') as any) || 'block';
    });
    const [cursorBlink, setCursorBlink] = useState(() => {
        return localStorage.getItem('terminal-cursor-blink') !== 'false';
    });
    const [lineHeight, setLineHeight] = useState(() => {
        const saved = localStorage.getItem('terminal-line-height');
        return saved ? parseFloat(saved) : 1.2;
    });
    const [scrollback, setScrollback] = useState(() => {
        const saved = localStorage.getItem('terminal-scrollback');
        return saved ? parseInt(saved) : 1000;
    });
    const [bellSound, setBellSound] = useState(() => {
        return localStorage.getItem('terminal-bell-sound') === 'true';
    });
    const [bellStyle, setBellStyle] = useState<'none' | 'sound' | 'visual' | 'both'>(() => {
        return (localStorage.getItem('terminal-bell-style') as any) || 'none';
    });
    const [letterSpacing, setLetterSpacing] = useState(() => {
        const saved = localStorage.getItem('terminal-letter-spacing');
        return saved ? parseFloat(saved) : 0;
    });
    const [fontWeight, setFontWeight] = useState<'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'>(() => {
        return (localStorage.getItem('terminal-font-weight') as any) || 'normal';
    });
    const [fontWeightBold, setFontWeightBold] = useState<'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'>(() => {
        return (localStorage.getItem('terminal-font-weight-bold') as any) || 'bold';
    });
    const [drawBoldTextInBrightColors, setDrawBoldTextInBrightColors] = useState(() => {
        return localStorage.getItem('terminal-bold-bright') !== 'false';
    });
    const [minimumContrastRatio, setMinimumContrastRatio] = useState(() => {
        const saved = localStorage.getItem('terminal-contrast-ratio');
        return saved ? parseFloat(saved) : 1;
    });
    const [settingsTab, setSettingsTab] = useState<'font' | 'cursor' | 'behavior' | 'theme'>('font');
    const [darkThemePreset, setDarkThemePreset] = useState(() => {
        return localStorage.getItem('terminal-dark-theme') || 'default';
    });
    const [lightThemePreset, setLightThemePreset] = useState(() => {
        return localStorage.getItem('terminal-light-theme') || 'light';
    });
    const [defaultShell, setDefaultShell] = useState(() => {
        return localStorage.getItem('terminal-default-shell') || 'system';
    });
    const [copyOnSelect, setCopyOnSelect] = useState(() => {
        return localStorage.getItem('terminal-copy-on-select') === 'true';
    });
    const [rightClickPaste, setRightClickPaste] = useState(() => {
        return localStorage.getItem('terminal-right-click-paste') !== 'false';
    });
    const [macOptionIsMeta, setMacOptionIsMeta] = useState(() => {
        return localStorage.getItem('terminal-mac-option-meta') === 'true';
    });
    const [altClickMoveCursor, setAltClickMoveCursor] = useState(() => {
        return localStorage.getItem('terminal-alt-click-cursor') !== 'false';
    });
    const [pasteNotification, setPasteNotification] = useState<{ message: string; isError?: boolean } | null>(null);
    const pasteNotificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const paneData = contentDataRef.current[nodeId];
    const terminalId = paneData?.contentId;

    useEffect(() => {
        if (nodeId && contentDataRef.current[nodeId]) {
            contentDataRef.current[nodeId].getTerminalContext = () => {
                return terminalOutputBuffer.current.join('').slice(-10000);
            };
            contentDataRef.current[nodeId].toggleSettings = () => setShowSettings(prev => !prev);
        }
    }, [nodeId, contentDataRef]);

    const shellType = shell || paneData?.shellType || 'system';

    const handleCopy = useCallback(() => {
        if (xtermInstance.current) {
            const selection = getSmartSelection(xtermInstance.current);
            if (selection) {
                navigator.clipboard.writeText(selection);
            }
        }
        setContextMenu(null);
    }, []);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (isSessionReady.current && text) {

                const bracketedText = '\x1b[200~' + text + '\x1b[201~';
                window.api.writeToTerminal({ id: terminalId, data: bracketedText });
            }
        } catch (err) {
            console.error('Failed to paste:', err);
        }
        setContextMenu(null);
    }, [terminalId]);

    const handleClear = useCallback(() => {
        if (xtermInstance.current) {
            xtermInstance.current.clear();
        }
        setContextMenu(null);
    }, []);

    const handleSelectAll = useCallback(() => {
        if (xtermInstance.current) {
            xtermInstance.current.selectAll();
        }
        setContextMenu(null);
    }, []);

    const handleSelectAllAndCopy = useCallback(() => {
        if (xtermInstance.current) {
            xtermInstance.current.selectAll();
            const selection = xtermInstance.current.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection);
            }
        }
        setContextMenu(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const getShellProfileCommand = useCallback(() => {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) {
            return 'source ~/.zshrc 2>/dev/null || source ~/.zprofile 2>/dev/null';
        } else {
            return 'source ~/.bashrc 2>/dev/null || source ~/.bash_profile 2>/dev/null';
        }
    }, []);

    const handleSourceProfile = useCallback(() => {
        if (isSessionReady.current && terminalId) {
            const cmd = getShellProfileCommand();
            window.api.writeToTerminal({ id: terminalId, data: cmd + '\n' });
        }
        localStorage.setItem(SHELL_PROMPT_KEY, 'true');
        setShowShellPrompt(false);
    }, [terminalId, getShellProfileCommand]);

    const handleDismissPrompt = useCallback(() => {
        localStorage.setItem(SHELL_PROMPT_KEY, 'true');
        setShowShellPrompt(false);
    }, []);

    useEffect(() => {
        if (!terminalRef.current || !terminalId) return;

        if (!xtermInstance.current) {
            const initPresetKey = isDarkMode ? darkThemePreset : lightThemePreset;
            const initPreset = THEME_PRESETS[initPresetKey] || THEME_PRESETS['default'];
            const term = new Terminal({
                cursorBlink: true,
                fontFamily: '"Fira Code", monospace',
                fontSize: 14,
                scrollback: scrollback,
                theme: {
                    background: initPreset.background,
                    foreground: initPreset.foreground,
                    cursor: initPreset.cursor,
                    selectionBackground: initPreset.selection,
                    black: initPreset.black,
                    red: initPreset.red,
                    green: initPreset.green,
                    yellow: initPreset.yellow,
                    blue: initPreset.blue,
                    magenta: initPreset.magenta,
                    cyan: initPreset.cyan,
                    white: initPreset.white,
                },
            });
            const fitAddon = new FitAddon();
            fitAddonRef.current = fitAddon;
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            xtermInstance.current = term;

            // Restore saved terminal buffer from previous mount (move/de-tab)
            const savedBuffer = paneData?._terminalBuffer
                || ((window as any).__terminalBuffers?.[terminalId]);
            if (savedBuffer) {
                term.write(savedBuffer.replace(/\n/g, '\r\n'));
                delete paneData?._terminalBuffer;
                if ((window as any).__terminalBuffers?.[terminalId]) {
                    delete (window as any).__terminalBuffers[terminalId];
                }
            }

            requestAnimationFrame(() => {
                try { fitAddon.fit(); } catch (e) { /* terminal may not be visible yet */ }
            });
            // Delayed re-fit for when pane layout settles after tab drags/moves
            setTimeout(() => {
                try { fitAddon.fit(); } catch {}
            }, 50);
            setTimeout(() => {
                try { fitAddon.fit(); } catch {}
                if (isSessionReady.current) {
                    window.api.resizeTerminal?.({ id: terminalId, cols: term.cols, rows: term.rows });
                }
            }, 300);

            term.registerLinkProvider({
                provideLinks: (lineNumber: number, callback: (links: any[]) => void) => {
                    const line = term.buffer.active.getLine(lineNumber - 1);
                    if (!line) { callback([]); return; }
                    const text = line.translateToString();
                    const links: any[] = [];

                    const regex = /(?:^|\s|['"`(])([.\/~]?(?:[\w\-./]+\/)?[\w\-]+\.[\w]+):(\d+)(?::(\d+))?/g;
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        const filePath = match[1];
                        const line = parseInt(match[2]);
                        const col = match[3] ? parseInt(match[3]) : 1;
                        const startIdx = match.index + match[0].indexOf(filePath);
                        links.push({
                            range: { start: { x: startIdx + 1, y: lineNumber }, end: { x: startIdx + filePath.length + 1 + match[2].length + (match[3] ? match[3].length + 1 : 0), y: lineNumber } },
                            text: `${filePath}:${line}${match[3] ? ':' + col : ''}`,
                            activate: async () => {
                                // Get the terminal's actual cwd for resolving relative paths
                                let termCwd = currentPath;
                                try {
                                    const result = await (window as any).api?.getTerminalCwd?.(terminalId);
                                    if (result?.cwd) termCwd = result.cwd;
                                } catch {}
                                window.dispatchEvent(new CustomEvent('terminal-open-file', {
                                    detail: { filePath, line, col, currentPath: termCwd }
                                }));
                            }
                        });
                    }
                    // Also match URLs and open them in browser panes
                    const urlRegex = /https?:\/\/[^\s'"<>)\]]+/g;
                    let urlMatch;
                    while ((urlMatch = urlRegex.exec(text)) !== null) {
                        const url = urlMatch[0].replace(/[.,;:!?)]+$/, ''); // trim trailing punctuation
                        links.push({
                            range: { start: { x: urlMatch.index + 1, y: lineNumber }, end: { x: urlMatch.index + url.length + 1, y: lineNumber } },
                            text: url,
                            activate: () => {
                                window.dispatchEvent(new CustomEvent('terminal-open-file', {
                                    detail: { filePath: url, isUrl: true }
                                }));
                            }
                        });
                    }

                    callback(links);
                }
            });

            let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
            const resizeObserver = new ResizeObserver(() => {
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {

                        const wasAtBottom = term.buffer.active?.viewportY === term.buffer.active?.baseY;
                        const scrollOffset = term.buffer.active?.viewportY ?? 0;

                        try { fitAddon.fit(); } catch (e) { /* terminal may not be visible in tab stack */ }

                        if (wasAtBottom) {
                            term.scrollToBottom();
                        } else if (scrollOffset !== term.buffer.active?.viewportY) {
                            term.scrollToLine(scrollOffset);
                        }

                        if (isSessionReady.current) {
                            window.api.resizeTerminal?.({
                                id: terminalId,
                                cols: term.cols,
                                rows: term.rows
                            });
                        }
                    });
                }, 30);
            });
            resizeObserverRef.current = resizeObserver;
            resizeObserver.observe(terminalRef.current);

            // Fallback: window resize doesn't always trigger ResizeObserver
            // on the terminal div (e.g. single pane filling the window)
            const handleWindowResize = () => {
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        try { fitAddon.fit(); } catch {}
                        if (isSessionReady.current) {
                            window.api.resizeTerminal?.({
                                id: terminalId,
                                cols: term.cols,
                                rows: term.rows
                            });
                        }
                    });
                }, 30);
            };
            handleWindowResizeRef.current = handleWindowResize;
            window.addEventListener('resize', handleWindowResize);

            term.attachCustomKeyEventHandler((event) => {

                if (event.type !== 'keydown') return true;

                const isMeta = event.ctrlKey || event.metaKey;
                const key = event.key.toLowerCase();
                const isMac = navigator.platform.toLowerCase().includes('mac');

                if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\t' });
                    }
                    return false;
                }

                if (event.key === 'Escape') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1b' });
                    }
                    return false;
                }

                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'c') {
                    const selection = getSmartSelection(term);
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                        return false;
                    }

                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x03' });
                    }
                    return false;
                }

                if (isMeta && key === 'v') {
                    event.preventDefault();
                    event.stopPropagation();
                    navigator.clipboard.readText().then(text => {
                        if (isSessionReady.current && text) {

                            const bracketedText = '\x1b[200~' + text + '\x1b[201~';
                            window.api.writeToTerminal({ id: terminalId, data: bracketedText });
                        }
                    });
                    return false;
                }

                if (isMeta && event.shiftKey && key === 'c') {
                    event.stopPropagation();
                    const selection = getSmartSelection(term);
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                    }
                    return false;
                }

                if (event.metaKey && !event.ctrlKey && !event.shiftKey && key === 'c') {
                    const selection = getSmartSelection(term);
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                        return false;
                    }
                }

                if (isMeta && key === 'l') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x0c' });
                    }
                    return false;
                }

                if (key === 'a' && (
                    (event.metaKey && !event.ctrlKey) ||
                    (event.ctrlKey && event.shiftKey)
                )) {
                    term.selectAll();
                    return false;
                }

                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'a') {
                    // Let xterm pass Ctrl+A through to the PTY naturally
                    return true;
                }

                if (event.ctrlKey && !event.metaKey && key === 'e') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x05' });
                    }
                    return false;
                }

                if (isMeta && key === 'u') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x15' });
                    }
                    return false;
                }

                if (isMeta && key === 'k') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x0b' });
                    }
                    return false;
                }

                if (isMeta && key === 'w') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x17' });
                    }
                    return false;
                }

                if (event.altKey && key === 'b') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bb' });
                    }
                    return false;
                }

                if (event.altKey && key === 'f') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bf' });
                    }
                    return false;
                }

                if (event.altKey && key === 'd') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bd' });
                    }
                    return false;
                }

                if (event.altKey && event.key === 'Backspace') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1b\x7f' });
                    }
                    return false;
                }

                if (isMeta && event.key === 'ArrowLeft') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bb' });
                    }
                    return false;
                }

                if (isMeta && event.key === 'ArrowRight') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bf' });
                    }
                    return false;
                }

                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'n') {
                    event.preventDefault();
                    event.stopPropagation();

                    (window as any).api?.triggerNewTextFile?.();
                    return false;
                }

                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 't') {
                    event.preventDefault();
                    event.stopPropagation();

                    (window as any).api?.triggerBrowserNewTab?.();
                    return false;
                }

                return true;
            });

        }

        // Handle image paste — save to temp file and type path into terminal
        const showPasteNotification = (message: string, isError = false) => {
            if (pasteNotificationTimer.current) clearTimeout(pasteNotificationTimer.current);
            setPasteNotification({ message, isError });
            pasteNotificationTimer.current = setTimeout(() => {
                setPasteNotification(null);
                pasteNotificationTimer.current = null;
            }, 3000);
        };

        const handleImagePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
            if (!imageItem) return;
            e.preventDefault();
            e.stopPropagation();
            const blob = imageItem.getAsFile();
            if (!blob) return;

            if (!(window as any).api?.saveTempFile) {
                showPasteNotification('Image paste unavailable: saveTempFile API not found', true);
                return;
            }

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const ext = imageItem.type.split('/')[1] || 'png';
                const fileName = `pasted-image-${Date.now()}.${ext}`;
                try {
                    const result = await (window as any).api.saveTempFile({
                        name: fileName,
                        data: base64,
                        encoding: 'base64'
                    });
                    if (result?.path && isSessionReady.current) {
                        const bracketedText = '\x1b[200~' + result.path + '\x1b[201~';
                        window.api.writeToTerminal({ id: terminalId, data: bracketedText });
                        showPasteNotification(`Image saved: ${fileName}`);
                    } else if (!result?.path) {
                        showPasteNotification('Image paste failed: no path returned', true);
                    }
                } catch (err) {
                    console.error('Failed to paste image into terminal:', err);
                    showPasteNotification(`Image paste failed: ${err instanceof Error ? err.message : 'unknown error'}`, true);
                }
            };
            reader.readAsDataURL(blob);
        };
        const pasteContainer = terminalRef.current;
        pasteContainer?.addEventListener('paste', handleImagePaste, true);

        let isEffectCancelled = false;

        isSessionReady.current = false;

        const dataCallback = (_, { id, data }) => {
            if (id === terminalId && !isEffectCancelled) {
                xtermInstance.current?.write(data);

                terminalOutputBuffer.current.push(data);

                const fullOutput = terminalOutputBuffer.current.join('');
                const lines = fullOutput.split('\n');
                if (lines.length > MAX_TERMINAL_CONTEXT_LINES) {
                    terminalOutputBuffer.current = [lines.slice(-MAX_TERMINAL_CONTEXT_LINES).join('\n')];
                }
            }
        };
        const closedCallback = (_, { id }) => {
            if (id === terminalId && !isEffectCancelled) {
                isSessionReady.current = false;
                xtermInstance.current?.write('\r\n[Session Closed]\r\n');
            }
        };

        const removeDataListener = window.api.onTerminalData(dataCallback);
        const removeClosedListener = window.api.onTerminalClosed(closedCallback);
        const inputHandler = xtermInstance.current.onData(input => {
            if (isSessionReady.current && !isEffectCancelled) {
                window.api.writeToTerminal({ id: terminalId, data: input });
            }
        });

        const initBackendSession = async () => {
            try {
                fitAddonRef.current?.fit();
                const result = await window.api.createTerminalSession({
                    id: terminalId,
                    cwd: initialPathRef.current,
                    cols: xtermInstance.current.cols,
                    rows: xtermInstance.current.rows,
                    shellType: shellType
                });
                if (isEffectCancelled) return;
                if (result.success) {
                    isSessionReady.current = true;
                    setActiveShell(result.shell || 'system');

                    requestAnimationFrame(() => {
                        try { fitAddonRef.current?.fit(); } catch {}
                        window.api.resizeTerminal?.({
                            id: terminalId,
                            cols: xtermInstance.current?.cols || 80,
                            rows: xtermInstance.current?.rows || 24
                        });
                    });
                    if (activeContentPaneId === nodeId) {
                        xtermInstance.current.focus();
                    }
                    // Send Enter to trigger a fresh prompt (in case
                    // the initial prompt was lost during strict mode re-mount)
                    window.api.writeToTerminal({ id: terminalId, data: '\r' });

                    const hasBeenPrompted = localStorage.getItem(SHELL_PROMPT_KEY);
                    if (!hasBeenPrompted && result.shell === 'system') {
                        setShowShellPrompt(true);
                    }
                } else {
                    xtermInstance.current.write(`[FATAL] Backend failed: ${result.error}\r\n`);
                }
            } catch (err) {
                if (!isEffectCancelled) xtermInstance.current.write(`[FATAL] IPC Error: ${err.message}\r\n`);
            }
        };

        const loadPythonEnv = async () => {
            try {
                const envConfig = await (window as any).api?.pythonEnvGet?.(initialPathRef.current);
                if (envConfig) {
                    if (envConfig.type === 'venv' || envConfig.type === 'uv') {
                        setPythonEnv(`${envConfig.type}:${envConfig.venvPath || '.venv'}`);
                    } else if (envConfig.type === 'pyenv') {
                        setPythonEnv(`pyenv:${envConfig.pyenvVersion}`);
                    } else if (envConfig.type === 'conda') {
                        setPythonEnv(`conda:${envConfig.condaEnv}`);
                    } else if (envConfig.type === 'custom') {
                        setPythonEnv('custom');
                    }
                }
            } catch (e) {

            }
        };

        initBackendSession();
        loadPythonEnv();

        return () => {
            isEffectCancelled = true;
            inputHandler.dispose();
            removeDataListener();
            removeClosedListener();
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;
            if (handleWindowResizeRef.current) {
                window.removeEventListener('resize', handleWindowResizeRef.current);
                handleWindowResizeRef.current = null;
            }
            pasteContainer?.removeEventListener('paste', handleImagePaste, true);

            // Save terminal buffer so history survives moves/de-tabs
            if (xtermInstance.current) {
                const buf = xtermInstance.current.buffer.active;
                const lines: string[] = [];
                for (let i = 0; i < buf.length; i++) {
                    const line = buf.getLine(i);
                    if (line) lines.push(line.translateToString(true));
                }
                // Store on the pane data (may be same pane or a new one after de-tab)
                const pd = contentDataRef.current[nodeId];
                if (pd) pd._terminalBuffer = lines.join('\n');
                // Also store by terminalId for tab scenarios
                if (terminalId) {
                    (window as any).__terminalBuffers = (window as any).__terminalBuffers || {};
                    (window as any).__terminalBuffers[terminalId] = lines.join('\n');
                }
            }

            window.api.closeTerminalSession(terminalId);
        };
    }, [terminalId, shellType]);

    useEffect(() => {
        if (activeContentPaneId === nodeId && xtermInstance.current) {
            xtermInstance.current.focus();
        }
    }, [activeContentPaneId, nodeId]);

    useEffect(() => {
        if (!xtermInstance.current) return;
        const presetKey = isDarkMode ? darkThemePreset : lightThemePreset;
        const preset = THEME_PRESETS[presetKey] || THEME_PRESETS['default'];
        xtermInstance.current.options.theme = {
            background: preset.background,
            foreground: preset.foreground,
            cursor: preset.cursor,
            selectionBackground: preset.selection,
            black: preset.black,
            red: preset.red,
            green: preset.green,
            yellow: preset.yellow,
            blue: preset.blue,
            magenta: preset.magenta,
            cyan: preset.cyan,
            white: preset.white,
        };
        xtermInstance.current.refresh(0, xtermInstance.current.rows - 1);
    }, [isDarkMode, darkThemePreset, lightThemePreset]);

    useEffect(() => {
        if (xtermInstance.current) {
            xtermInstance.current.options.fontSize = fontSize;
            xtermInstance.current.options.fontFamily = fontFamily;
            xtermInstance.current.options.cursorStyle = cursorStyle;
            xtermInstance.current.options.cursorBlink = cursorBlink;
            xtermInstance.current.options.lineHeight = lineHeight;
            xtermInstance.current.options.scrollback = scrollback;
            xtermInstance.current.options.letterSpacing = letterSpacing;
            xtermInstance.current.options.fontWeight = fontWeight;
            xtermInstance.current.options.fontWeightBold = fontWeightBold;
            xtermInstance.current.options.drawBoldTextInBrightColors = drawBoldTextInBrightColors;
            xtermInstance.current.options.minimumContrastRatio = minimumContrastRatio;
            xtermInstance.current.options.bellStyle = bellStyle;
            fitAddonRef.current?.fit();

            localStorage.setItem('terminal-font-size', String(fontSize));
            localStorage.setItem('terminal-font-family', fontFamily);
            localStorage.setItem('terminal-cursor-style', cursorStyle);
            localStorage.setItem('terminal-cursor-blink', String(cursorBlink));
            localStorage.setItem('terminal-line-height', String(lineHeight));
            localStorage.setItem('terminal-scrollback', String(scrollback));
            localStorage.setItem('terminal-letter-spacing', String(letterSpacing));
            localStorage.setItem('terminal-font-weight', fontWeight);
            localStorage.setItem('terminal-font-weight-bold', fontWeightBold);
            localStorage.setItem('terminal-bold-bright', String(drawBoldTextInBrightColors));
            localStorage.setItem('terminal-contrast-ratio', String(minimumContrastRatio));
            localStorage.setItem('terminal-bell-style', bellStyle);
            localStorage.setItem('terminal-copy-on-select', String(copyOnSelect));
            localStorage.setItem('terminal-right-click-paste', String(rightClickPaste));
            localStorage.setItem('terminal-mac-option-meta', String(macOptionIsMeta));
            localStorage.setItem('terminal-alt-click-cursor', String(altClickMoveCursor));
            localStorage.setItem('terminal-dark-theme', darkThemePreset);
            localStorage.setItem('terminal-light-theme', lightThemePreset);
            localStorage.setItem('terminal-default-shell', defaultShell);

            xtermInstance.current.options.rightClickSelectsWord = rightClickPaste;
            xtermInstance.current.options.macOptionIsMeta = macOptionIsMeta;
            xtermInstance.current.options.altClickMovesCursor = altClickMoveCursor;
        }
    }, [fontSize, fontFamily, cursorStyle, cursorBlink, lineHeight, scrollback, letterSpacing, fontWeight, fontWeightBold, drawBoldTextInBrightColors, minimumContrastRatio, bellStyle, copyOnSelect, rightClickPaste, macOptionIsMeta, altClickMoveCursor, defaultShell, darkThemePreset, lightThemePreset]);

    if (!paneData) return null;

    return (
        <div
            className="flex-1 flex flex-col theme-bg-secondary relative h-full min-h-0 overflow-hidden"
            onContextMenu={handleContextMenu}
            data-terminal="true"
        >
            {showSettings && (
                <div className="absolute top-10 right-2 z-30 w-80 theme-bg-secondary rounded-lg border theme-border shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between p-3 border-b theme-border">
                        <span className="text-sm font-medium theme-text-primary">Terminal Settings</span>
                        <button onClick={() => setShowSettings(false)} className="p-1 theme-hover rounded">
                            <X size={14}/>
                        </button>
                    </div>

                    <div className="flex border-b theme-border">
                        {(['font', 'cursor', 'behavior', 'theme'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setSettingsTab(tab)}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                    settingsTab === tab
                                        ? 'theme-bg-tertiary theme-text-primary border-b-2 border-purple-500'
                                        : 'theme-text-muted theme-hover'
                                }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="p-3 max-h-80 overflow-y-auto">
                        {settingsTab === 'font' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Font Family</label>
                                    <select
                                        value={fontFamily}
                                        onChange={(e) => setFontFamily(e.target.value)}
                                        className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                    >
                                        <option value='"Fira Code", monospace'>Fira Code</option>
                                        <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
                                        <option value='"Source Code Pro", monospace'>Source Code Pro</option>
                                        <option value='"SF Mono", monospace'>SF Mono</option>
                                        <option value='Menlo, monospace'>Menlo</option>
                                        <option value='Monaco, monospace'>Monaco</option>
                                        <option value='"Cascadia Code", monospace'>Cascadia Code</option>
                                        <option value='Consolas, monospace'>Consolas</option>
                                        <option value='"IBM Plex Mono", monospace'>IBM Plex Mono</option>
                                        <option value='"Roboto Mono", monospace'>Roboto Mono</option>
                                        <option value='"Ubuntu Mono", monospace'>Ubuntu Mono</option>
                                        <option value='"Hack", monospace'>Hack</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Font Size: {fontSize}px</label>
                                    <input
                                        type="range"
                                        min={8}
                                        max={32}
                                        value={fontSize}
                                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Line Height: {lineHeight.toFixed(1)}</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={2}
                                        step={0.1}
                                        value={lineHeight}
                                        onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Letter Spacing: {letterSpacing}px</label>
                                    <input
                                        type="range"
                                        min={-2}
                                        max={5}
                                        step={0.5}
                                        value={letterSpacing}
                                        onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs theme-text-muted mb-1 block">Font Weight</label>
                                        <select
                                            value={fontWeight}
                                            onChange={(e) => setFontWeight(e.target.value as any)}
                                            className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                            <option value="100">100</option>
                                            <option value="200">200</option>
                                            <option value="300">300</option>
                                            <option value="400">400</option>
                                            <option value="500">500</option>
                                            <option value="600">600</option>
                                            <option value="700">700</option>
                                            <option value="800">800</option>
                                            <option value="900">900</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs theme-text-muted mb-1 block">Bold Weight</label>
                                        <select
                                            value={fontWeightBold}
                                            onChange={(e) => setFontWeightBold(e.target.value as any)}
                                            className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                            <option value="100">100</option>
                                            <option value="200">200</option>
                                            <option value="300">300</option>
                                            <option value="400">400</option>
                                            <option value="500">500</option>
                                            <option value="600">600</option>
                                            <option value="700">700</option>
                                            <option value="800">800</option>
                                            <option value="900">900</option>
                                        </select>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={drawBoldTextInBrightColors}
                                        onChange={(e) => setDrawBoldTextInBrightColors(e.target.checked)}
                                        className="accent-purple-500"
                                    />
                                    <span className="theme-text-secondary">Bold text in bright colors</span>
                                </label>
                            </div>
                        )}

                        {settingsTab === 'cursor' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Cursor Style</label>
                                    <div className="grid grid-cols-3 gap-1">
                                        {(['block', 'underline', 'bar'] as const).map(style => (
                                            <button
                                                key={style}
                                                onClick={() => setCursorStyle(style)}
                                                className={`px-3 py-2 text-xs rounded flex flex-col items-center gap-1 ${
                                                    cursorStyle === style
                                                        ? 'bg-purple-600 text-white'
                                                        : 'theme-bg-tertiary theme-hover theme-text-secondary'
                                                }`}
                                            >
                                                <span className="font-mono text-lg">
                                                    {style === 'block' ? '█' : style === 'underline' ? '_' : '│'}
                                                </span>
                                                <span>{style}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={cursorBlink}
                                        onChange={(e) => setCursorBlink(e.target.checked)}
                                        className="accent-purple-500"
                                    />
                                    <span className="theme-text-secondary">Cursor blink</span>
                                </label>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Minimum Contrast: {minimumContrastRatio.toFixed(1)}</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={21}
                                        step={0.5}
                                        value={minimumContrastRatio}
                                        onChange={(e) => setMinimumContrastRatio(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                    <p className="text-[10px] theme-text-muted mt-1">Higher values ensure better readability</p>
                                </div>
                            </div>
                        )}

                        {settingsTab === 'behavior' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Scrollback Lines: {scrollback}</label>
                                    <input
                                        type="range"
                                        min={100}
                                        max={10000}
                                        step={100}
                                        value={scrollback}
                                        onChange={(e) => setScrollback(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Default Shell</label>
                                    <select
                                        value={defaultShell}
                                        onChange={(e) => setDefaultShell(e.target.value)}
                                        className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                    >
                                        <option value="system">System (Bash/Zsh)</option>
                                        <option value="npcsh">npcsh</option>
                                        <option value="python3">Python REPL</option>
                                        <option value="node">Node.js REPL</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Bell Style</label>
                                    <select
                                        value={bellStyle}
                                        onChange={(e) => setBellStyle(e.target.value as any)}
                                        className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                    >
                                        <option value="none">None</option>
                                        <option value="sound">Sound</option>
                                        <option value="visual">Visual</option>
                                        <option value="both">Both</option>
                                    </select>
                                </div>
                                <div className="space-y-2 pt-2 border-t theme-border">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={copyOnSelect}
                                            onChange={(e) => setCopyOnSelect(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="theme-text-secondary">Copy on select</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rightClickPaste}
                                            onChange={(e) => setRightClickPaste(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="theme-text-secondary">Right-click to paste</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={macOptionIsMeta}
                                            onChange={(e) => setMacOptionIsMeta(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="theme-text-secondary">Option as Meta key (Mac)</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={altClickMoveCursor}
                                            onChange={(e) => setAltClickMoveCursor(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="theme-text-secondary">Alt+Click moves cursor</span>
                                    </label>
                                </div>
                                <div className="pt-2 border-t theme-border space-y-2">
                                    <button
                                        onClick={handleClear}
                                        className="w-full text-xs px-3 py-2 theme-bg-tertiary theme-hover rounded theme-text-primary"
                                    >
                                        Clear Terminal
                                    </button>
                                </div>
                            </div>
                        )}

                        {settingsTab === 'theme' && (
                            <div className="space-y-3">
                                <p className="text-xs theme-text-muted">Terminal auto-switches between your dark and light presets when you toggle the app theme.</p>

                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Dark Mode Theme</label>
                                    <select
                                        value={darkThemePreset}
                                        onChange={(e) => setDarkThemePreset(e.target.value)}
                                        className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                    >
                                        {Object.keys(THEME_PRESETS).map(key => (
                                            <option key={key} value={key}>{key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs theme-text-muted mb-1 block">Light Mode Theme</label>
                                    <select
                                        value={lightThemePreset}
                                        onChange={(e) => setLightThemePreset(e.target.value)}
                                        className="w-full text-xs theme-bg-tertiary border theme-border rounded px-2 py-1.5 theme-text-primary"
                                    >
                                        {Object.keys(THEME_PRESETS).map(key => (
                                            <option key={key} value={key}>{key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs theme-text-muted">Current: {isDarkMode ? 'Dark' : 'Light'} mode — using <strong>{isDarkMode ? darkThemePreset : lightThemePreset}</strong></p>
                                    <div className="grid grid-cols-6 gap-1">
                                        {(() => {
                                            const presetKey = isDarkMode ? darkThemePreset : lightThemePreset;
                                            const preset = THEME_PRESETS[presetKey] || THEME_PRESETS['default'];
                                            return Object.entries(preset).map(([key, color]) => (
                                                <div key={key} className="flex flex-col items-center gap-0.5">
                                                    <div className="w-5 h-5 rounded border theme-border" style={{ backgroundColor: color as string }} title={`${key}: ${color}`} />
                                                    <span className="text-[8px] theme-text-muted truncate w-full text-center">{key}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>

                                <div className="pt-2 border-t theme-border">
                                    <button
                                        onClick={() => {

                                            setFontSize(14);
                                            setFontFamily('"Fira Code", monospace');
                                            setCursorStyle('block');
                                            setCursorBlink(true);
                                            setLineHeight(1.2);
                                            setScrollback(1000);
                                            setLetterSpacing(0);
                                            setFontWeight('normal');
                                            setFontWeightBold('bold');
                                            setDrawBoldTextInBrightColors(true);
                                            setMinimumContrastRatio(1);
                                            setBellStyle('none');
                                            setDarkThemePreset('default');
                                            setLightThemePreset('light');
                                            setCopyOnSelect(false);
                                            setRightClickPaste(true);
                                            setMacOptionIsMeta(false);
                                            setAltClickMoveCursor(true);
                                        }}
                                        className="w-full text-xs px-3 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 rounded"
                                    >
                                        Reset All to Defaults
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div ref={terminalRef} className="w-full h-full" />

            {pasteNotification && (
                <div
                    className={`absolute top-2 right-2 z-30 px-3 py-2 rounded-md shadow-lg text-xs max-w-[320px] truncate border ${
                        pasteNotification.isError
                            ? 'bg-red-900/90 text-red-200 border-red-700'
                            : 'bg-green-900/90 text-green-200 border-green-700'
                    }`}
                    style={{ pointerEvents: 'none' }}
                >
                    {pasteNotification.message}
                </div>
            )}

            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onMouseDown={() => setContextMenu(null)}
                    />
                    <div
                        className="fixed theme-bg-tertiary shadow-lg rounded-md py-1 z-50 min-w-[140px] border theme-border"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <button
                            onClick={handleCopy}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Copy <span className="float-right text-xs opacity-50">Ctrl+Shift+C</span>
                        </button>
                        <button
                            onClick={handlePaste}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Paste <span className="float-right text-xs opacity-50">Ctrl+V</span>
                        </button>
                        <div className="border-t theme-border my-1" />
                        <button
                            onClick={handleSelectAll}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Select All
                        </button>
                        <button
                            onClick={handleSelectAllAndCopy}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Select All & Copy
                        </button>
                        <button
                            onClick={handleClear}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Clear
                        </button>
                    </div>
                </>
            )}

            {showShellPrompt && (
                <div className="absolute top-0 left-0 right-0 bg-blue-900/90 border-b border-blue-700 px-3 py-2 z-30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-blue-100">
                        <span className="text-blue-300">Tip:</span>
                        <span>Source your shell profile to load aliases and environment?</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSourceProfile}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                        >
                            Source Profile
                        </button>
                        <button
                            onClick={handleDismissPrompt}
                            className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId
        && prevProps.isDarkMode === nextProps.isDarkMode;
};

export default memo(TerminalView, arePropsEqual);