import { useState, useCallback, useRef, useEffect } from 'react';
import { generateId, findNodePath } from '../components/utils';
import { syncLayoutWithContentData, collectPaneIds, addPaneToLayout } from '../components/LayoutNode';

interface UseLayoutManagerParams {
    trackActivity: (action: string, data?: any) => void;
    openModeRef?: React.MutableRefObject<'pane' | 'tab'>;
}

export function getConversationStats(messages: any[]) {
    if (!messages || messages.length === 0) {
        return { messageCount: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() };
    }
    return messages.reduce((acc: any, msg: any) => {
        acc.inputTokens += (msg.input_tokens || 0);
        acc.outputTokens += (msg.output_tokens || 0);
        if (msg.cost) acc.totalCost += msg.cost;
        if (msg.role !== 'user') {
            if (msg.model) acc.models.add(msg.model);
            if (msg.npc) acc.agents.add(msg.npc);
            if (msg.provider) acc.providers.add(msg.provider);
        }
        return acc;
    }, { messageCount: messages.length, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() });
}

export function useLayoutManager({ trackActivity, openModeRef }: UseLayoutManagerParams) {
    const [rootLayoutNode, rawSetRootLayoutNode] = useState<any>(null);
    const [contentVersion, setContentVersion] = useState(0);
    // Normal setter — bumps contentVersion so all LayoutNodes re-render
    const setRootLayoutNode = useCallback((updater: any) => {
        setContentVersion(v => v + 1);
        rawSetRootLayoutNode(updater);
    }, []);
    // Quiet setter — for resize only, doesn't bump contentVersion
    const setRootLayoutNodeQuiet = rawSetRootLayoutNode;
    const [activeContentPaneId, setActiveContentPaneId] = useState<string | null>(null);
    const contentDataRef = useRef<Record<string, any>>({});
    const rootLayoutNodeRef = useRef(rootLayoutNode);
    const closedTabsRef = useRef<Array<{ contentType: string; contentId: string; browserUrl?: string; browserTitle?: string }>>([]);
    const [zenModePaneId, setZenModePaneId] = useState<string | null>(null);
    const [renamingPaneId, setRenamingPaneId] = useState<string | null>(null);
    const [editedFileName, setEditedFileName] = useState('');
    const [paneContextMenu, setPaneContextMenu] = useState<any>(null);

    // Refs for external consumers (e.g. MCP polling, studio actions)
    const performSplitRef = useRef<((targetNodePath: number[], side: string, newContentType: string, newContentId: string) => void) | null>(null);
    const closeContentPaneRef = useRef<((paneId: string, nodePath: string[]) => void) | null>(null);
    const updateContentPaneRef = useRef<((paneId: string, contentType: string, contentId: string, skipMessageLoad?: boolean) => void) | null>(null);

    // Keep refs in sync
    const activeContentPaneIdRef = useRef(activeContentPaneId);
    activeContentPaneIdRef.current = activeContentPaneId;
    useEffect(() => {
        rootLayoutNodeRef.current = rootLayoutNode;
    }, [rootLayoutNode]);

    // Add content as tab on active pane (tab mode) or as new pane (pane mode)
    const addPaneOrTab = useCallback((newPaneId: string) => {
        if (openModeRef?.current === 'tab' && activeContentPaneIdRef.current) {
            const activePaneData = contentDataRef.current[activeContentPaneIdRef.current];
            const newPaneData = contentDataRef.current[newPaneId];
            if (activePaneData && newPaneData) {
                // Save current active pane content into its first tab if tabs not yet initialized
                if (!activePaneData.tabs || activePaneData.tabs.length === 0) {
                    activePaneData.tabs = [{
                        id: `tab_${Date.now()}_0`,
                        contentType: activePaneData.contentType,
                        contentId: activePaneData.contentId,
                        title: activePaneData.contentType,
                        browserUrl: activePaneData.browserUrl,
                        fileContent: activePaneData.fileContent,
                        fileChanged: activePaneData.fileChanged,
                        isUntitled: activePaneData.isUntitled,
                        _editorStateJSON: activePaneData._editorStateJSON,
                        _cursorPos: activePaneData._cursorPos,
                        _scrollTopPos: activePaneData._scrollTopPos,
                        chatMessages: activePaneData.chatMessages,
                        executionMode: activePaneData.executionMode,
                        selectedJinx: activePaneData.selectedJinx,
                        chatStats: activePaneData.chatStats,
                    }];
                }
                // Add new content as a new tab, preserving all relevant properties
                activePaneData.tabs.push({
                    id: `tab_${Date.now()}_${activePaneData.tabs.length}`,
                    contentType: newPaneData.contentType,
                    contentId: newPaneData.contentId,
                    title: newPaneData.contentType,
                    browserUrl: newPaneData.browserUrl,
                    fileContent: newPaneData.fileContent,
                    fileChanged: newPaneData.fileChanged,
                    isUntitled: newPaneData.isUntitled,
                    chatMessages: newPaneData.chatMessages,
                    executionMode: newPaneData.executionMode,
                    selectedJinx: newPaneData.selectedJinx,
                    chatStats: newPaneData.chatStats,
                });
                activePaneData.activeTabIndex = activePaneData.tabs.length - 1;
                // Copy all relevant properties to the active pane
                activePaneData.contentType = newPaneData.contentType;
                activePaneData.contentId = newPaneData.contentId;
                activePaneData.browserUrl = newPaneData.browserUrl;
                activePaneData.fileContent = newPaneData.fileContent;
                activePaneData.fileChanged = newPaneData.fileChanged;
                activePaneData.isUntitled = newPaneData.isUntitled;
                activePaneData.chatMessages = newPaneData.chatMessages;
                activePaneData.executionMode = newPaneData.executionMode;
                activePaneData.selectedJinx = newPaneData.selectedJinx;
                activePaneData.chatStats = newPaneData.chatStats;
                delete contentDataRef.current[newPaneId];
                setRootLayoutNode((prev: any) => prev ? { ...prev } : prev);
                return activeContentPaneIdRef.current;
            }
        }
        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) return { id: newPaneId, type: 'content' };
            return addPaneToLayout(oldRoot, newPaneId);
        });
        setActiveContentPaneId(newPaneId);
        return newPaneId;
    }, []);

    // Update content pane with new content type and ID
    const updateContentPane = useCallback(async (paneId: string, newContentType: string, newContentId: string | null, skipMessageLoad = false) => {
        if (!contentDataRef.current[paneId]) {
            contentDataRef.current[paneId] = {};
        }
        const paneData = contentDataRef.current[paneId];

        trackActivity('pane_open', {
            paneType: newContentType,
            filePath: newContentType === 'editor' ? newContentId : undefined,
            url: newContentType === 'browser' ? newContentId : undefined,
            fileType: newContentType === 'editor' ? newContentId?.split('.').pop() : undefined,
        });

        paneData.contentType = newContentType;
        paneData.contentId = newContentId;

        if (newContentType === 'editor') {
            try {
                const response = await (window as any).api.readFileContent(newContentId);
                paneData.fileContent = response.error ? `Error: ${response.error}` : response.content;
                paneData.fileChanged = false;
            } catch (err: any) {
                paneData.fileContent = `Error loading file: ${err.message}`;
            }
            // Sync loaded content to the active tab so it persists across tab switches
            if (paneData.tabs && Array.isArray(paneData.tabs)) {
                const activeTabIndex = paneData.activeTabIndex ?? 0;
                if (paneData.tabs[activeTabIndex] && paneData.tabs[activeTabIndex].contentId === newContentId) {
                    paneData.tabs[activeTabIndex].fileContent = paneData.fileContent;
                    paneData.tabs[activeTabIndex].fileChanged = paneData.fileChanged;
                }
            }
        } else if (newContentType === 'browser') {
            paneData.chatMessages = null;
            paneData.fileContent = null;
            paneData.browserUrl = newContentId;
        } else if (newContentType === 'chat') {
            if (!paneData.chatMessages) {
                paneData.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
            }
            if (paneData.executionMode === undefined) {
                const savedMode = localStorage.getItem('incognideExecutionMode');
                paneData.executionMode = savedMode ? JSON.parse(savedMode) : 'chat';
                paneData.selectedJinx = null;
                paneData.showJinxDropdown = false;
            }
            if (skipMessageLoad) {
                paneData.chatMessages.messages = [];
                paneData.chatMessages.allMessages = [];
                paneData.chatStats = getConversationStats([]);
            } else {
                try {
                    const msgs = await (window as any).api.getConversationMessages(newContentId);
                    const assistantMsgs = msgs?.filter((m: any) => m.role === 'assistant') || [];
                    console.log('[LOAD_MSGS] Total:', msgs?.length, 'Assistant msgs:', assistantMsgs.length,
                        'With parentMessageId:', assistantMsgs.filter((m: any) => m.parentMessageId).length);
                    if (assistantMsgs.length > 0) {
                        console.log('[LOAD_MSGS] Assistant message details:', assistantMsgs.map((m: any) => ({
                            id: String(m.message_id || '').slice(0, 8),
                            parent: String(m.parentMessageId || 'NONE').slice(0, 8),
                            npc: m.npc
                        })));
                    }
                    const formatted = (msgs && Array.isArray(msgs))
                        ? msgs.map((m: any) => {
                            const msg = { ...m, id: m.message_id || m.id || generateId() };
                            if (msg.role === 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls)) {
                                const contentParts: any[] = [];
                                if (msg.content) {
                                    contentParts.push({ type: 'text', content: msg.content });
                                }
                                msg.toolCalls.forEach((tc: any) => {
                                    contentParts.push({
                                        type: 'tool_call',
                                        call: {
                                            id: tc.id,
                                            function_name: tc.function_name,
                                            arguments: tc.arguments,
                                            status: 'complete'
                                        }
                                    });
                                });
                                msg.contentParts = contentParts;
                            }
                            return msg;
                        })
                        : [];
                    paneData.chatMessages.allMessages = formatted;
                    paneData.chatMessages.messages = formatted.slice(-paneData.chatMessages.displayedMessageCount);
                    paneData.chatStats = getConversationStats(formatted);
                } catch (err) {
                    paneData.chatMessages.messages = [];
                    paneData.chatMessages.allMessages = [];
                    paneData.chatStats = getConversationStats([]);
                }
            }
            // Sync loaded chat state to the active tab so it persists across tab switches
            if (paneData.tabs && Array.isArray(paneData.tabs)) {
                const activeTabIndex = paneData.activeTabIndex ?? 0;
                if (paneData.tabs[activeTabIndex] && paneData.tabs[activeTabIndex].contentId === newContentId) {
                    paneData.tabs[activeTabIndex].chatMessages = paneData.chatMessages;
                    paneData.tabs[activeTabIndex].executionMode = paneData.executionMode;
                    paneData.tabs[activeTabIndex].selectedJinx = paneData.selectedJinx;
                    paneData.tabs[activeTabIndex].chatStats = paneData.chatStats;
                }
            }
        } else if (newContentType === 'terminal' || newContentType === 'pdf') {
            paneData.chatMessages = null;
            paneData.fileContent = null;
        }

        setRootLayoutNode((prev: any) => ({ ...prev }));
    }, [trackActivity, getConversationStats]);

    // Perform split on a pane
    const performSplit = useCallback((targetNodePath: number[], side: string, newContentType: string, newContentId: string | null) => {
        const newPaneId = generateId();

        contentDataRef.current[newPaneId] = {
            contentType: newContentType,
            contentId: newContentId
        };

        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) return oldRoot;

            // Walk to the target node (use original references — no cloning)
            let targetNode = oldRoot;
            for (let i = 0; i < targetNodePath.length; i++) {
                targetNode = targetNode.children[targetNodePath[i]];
            }

            const newPaneNode = { id: newPaneId, type: 'content' };

            const isHorizontalSplit = side === 'left' || side === 'right';
            const newSplitNode = {
                id: generateId(),
                type: 'split',
                direction: isHorizontalSplit ? 'horizontal' : 'vertical',
                children: side === 'left' || side === 'top' ? [newPaneNode, targetNode] : [targetNode, newPaneNode],
                sizes: [50, 50]
            };

            if (targetNodePath.length === 0) {
                return newSplitNode;
            }

            // Shallow-clone only nodes on the path from root to the target's parent.
            // All other subtrees keep their original references — React memo skips them.
            const newRoot = { ...oldRoot, children: [...oldRoot.children], sizes: oldRoot.sizes ? [...oldRoot.sizes] : undefined };
            let current = newRoot;
            for (let i = 0; i < targetNodePath.length - 1; i++) {
                const idx = targetNodePath[i];
                current.children[idx] = { ...current.children[idx], children: [...current.children[idx].children], sizes: current.children[idx].sizes ? [...current.children[idx].sizes] : undefined };
                current = current.children[idx];
            }
            current.children[targetNodePath[targetNodePath.length - 1]] = newSplitNode;

            return newRoot;
        });

        setActiveContentPaneId(newPaneId);

        if (newContentType === 'editor' || newContentType === 'chat') {
            updateContentPane(newPaneId, newContentType, newContentId);
        }
    }, [updateContentPane]);

    // Close a content pane (with unsaved changes warning)
    const closeContentPane = useCallback((paneId: string, nodePath?: number[]) => {
        const paneData = contentDataRef.current[paneId];

        // Check for unsaved changes before closing
        if (paneData && (paneData.fileChanged || paneData.hasChanges)) {
            const fileName = paneData.contentId?.split('/').pop() || 'this file';
            if (!confirm(`"${fileName}" has unsaved changes. Close anyway?`)) {
                return; // User cancelled
            }
        }

        if (paneData) {
            trackActivity('pane_close', {
                paneType: paneData.contentType,
                filePath: paneData.contentId,
            });
            closedTabsRef.current.push({
                contentType: paneData.contentType,
                contentId: paneData.contentId,
                browserUrl: paneData.browserUrl,
                browserTitle: paneData.browserTitle
            });
            if (closedTabsRef.current.length > 20) {
                closedTabsRef.current.shift();
            }
        }

        if (!nodePath) {
            nodePath = findNodePath(rootLayoutNodeRef.current, paneId) || [];
        }

        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) return oldRoot;

            if (oldRoot.type === 'content' && oldRoot.id === paneId) {
                delete contentDataRef.current[paneId];
                return null;
            }

            if (!nodePath || nodePath.length === 0) {
                delete contentDataRef.current[paneId];
                return null;
            }

            // Shallow-clone only nodes on the path — preserve all other subtree references
            const newRoot = { ...oldRoot, children: [...oldRoot.children], sizes: oldRoot.sizes ? [...oldRoot.sizes] : undefined };
            let parentNode = newRoot;
            for (let i = 0; i < nodePath.length - 1; i++) {
                const idx = nodePath[i];
                parentNode.children[idx] = { ...parentNode.children[idx], children: [...parentNode.children[idx].children], sizes: parentNode.children[idx].sizes ? [...parentNode.children[idx].sizes] : undefined };
                parentNode = parentNode.children[idx];
            }

            const indexToRemove = nodePath[nodePath.length - 1];

            if (parentNode.type === 'split' && parentNode.children.length === 2) {
                const siblingIndex = indexToRemove === 0 ? 1 : 0;
                const sibling = parentNode.children[siblingIndex];

                if (nodePath.length === 1) {
                    delete contentDataRef.current[paneId];
                    return sibling;
                } else {
                    // Walk the shallow-cloned path to grandparent
                    let grandParentNode = newRoot;
                    for (let i = 0; i < nodePath.length - 2; i++) {
                        grandParentNode = grandParentNode.children[nodePath[i]];
                    }
                    grandParentNode.children[nodePath[nodePath.length - 2]] = sibling;
                }
            } else if (parentNode.type === 'split' && parentNode.children.length > 2) {
                parentNode.children.splice(indexToRemove, 1);
                const equalSize = 100 / parentNode.children.length;
                parentNode.sizes = parentNode.children.map(() => equalSize);
            }

            delete contentDataRef.current[paneId];

            // If we closed the active pane, switch to another
            setActiveContentPaneId((currentActive: string | null) => {
                if (currentActive === paneId) {
                    const findFirstContentPane = (node: any): string | null => {
                        if (!node) return null;
                        if (node.type === 'content') return node.id;
                        if (node.type === 'split') {
                            for (const child of node.children) {
                                const found = findFirstContentPane(child);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    return findFirstContentPane(newRoot) || null;
                }
                return currentActive;
            });

            return newRoot;
        });
    }, [trackActivity]);

    // Helper to find an empty pane that can be reused
    const findEmptyPaneId = useCallback(() => {
        const findEmpty = (node: any): string | null => {
            if (!node) return null;
            if (node.type === 'content') {
                const data = contentDataRef.current[node.id];
                if (!data || !data.contentType) return node.id;
                return null;
            }
            if (node.type === 'split') {
                for (const child of node.children) {
                    const found = findEmpty(child);
                    if (found) return found;
                }
            }
            return null;
        };
        return findEmpty(rootLayoutNodeRef.current);
    }, []);

    // Create and add a new pane to the layout
    const createAndAddPaneNodeToLayout = useCallback((contentTypeOrOptions: string | { contentType: string; contentId?: string | null; diffStatus?: string; [key: string]: any }, contentId?: string | null) => {
        let contentType: string;
        let finalContentId: string | null;
        let extraProps: Record<string, any> = {};

        if (typeof contentTypeOrOptions === 'object') {
            contentType = contentTypeOrOptions.contentType;
            finalContentId = contentTypeOrOptions.contentId || null;
            const { contentType: _, contentId: __, id: ___, ...rest } = contentTypeOrOptions;
            extraProps = rest;
        } else {
            contentType = contentTypeOrOptions;
            finalContentId = contentId || null;
        }

        if (!contentType) {
            console.error('[createAndAddPaneNodeToLayout] Cannot create pane without contentType!');
            return null;
        }

        // Singleton pane types — only one instance allowed, refocus if exists
        const singletonTypes = new Set([
            'settings', 'npcteam', 'teammanagement', 'jinx', 'library', 'help',
            'git', 'projectenv', 'diskusage', 'data-labeler', 'graph-viewer',
            'browsergraph', 'datadash', 'photoviewer', 'scherzo',
        ]);

        // Check for existing pane to refocus instead of creating duplicate
        for (const [paneId, data] of Object.entries(contentDataRef.current)) {
            if (!data?.contentType) continue;
            // Skip virtual tab panes (they have _tab_ in ID)
            if (paneId.includes('_tab_')) continue;

            // Singleton: match by contentType only
            if (singletonTypes.has(contentType) && data.contentType === contentType) {
                setActiveContentPaneId(paneId);
                return paneId;
            }

            // Document/file types: match by contentType + contentId
            if (finalContentId && data.contentType === contentType && data.contentId === finalContentId) {
                setActiveContentPaneId(paneId);
                return paneId;
            }

            // Also check tabs for matching content
            if (data.tabs && Array.isArray(data.tabs)) {
                const tabIndex = data.tabs.findIndex((tab: any) =>
                    (singletonTypes.has(contentType) && tab.contentType === contentType) ||
                    (finalContentId && tab.contentType === contentType && tab.contentId === finalContentId)
                );
                if (tabIndex >= 0) {
                    // Switch to the matching tab
                    data.activeTabIndex = tabIndex;
                    const tab = data.tabs[tabIndex];
                    data.contentType = tab.contentType;
                    data.contentId = tab.contentId;
                    data.fileContent = tab.fileContent;
                    data.fileChanged = tab.fileChanged;
                    data.isUntitled = tab.isUntitled;
                    if (tab.contentType === 'browser') data.browserUrl = tab.browserUrl;
                    if (tab.contentType === 'chat') {
                        data.chatMessages = tab.chatMessages;
                        data.executionMode = tab.executionMode;
                    }
                    setActiveContentPaneId(paneId);
                    setRootLayoutNode((prev: any) => prev ? ({ ...prev }) : prev);
                    return paneId;
                }
            }
        }

        const newPaneId = generateId();

        contentDataRef.current[newPaneId] = {
            contentType,
            contentId: finalContentId,
            ...extraProps
        };

        const resultPaneId = addPaneOrTab(newPaneId);

        // In tab mode, content was merged into active pane (newPaneId deleted)
        const targetId = resultPaneId || newPaneId;
        if (contentType === 'editor' || contentType === 'chat') {
            updateContentPane(targetId, contentType, finalContentId);
        }

        return targetId;
    }, [updateContentPane, addPaneOrTab]);

    // Move a content pane (drag & drop)
    const moveContentPane = useCallback((draggedId: string, draggedPath: number[], targetPath: number[], dropSide: string) => {
        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) return oldRoot;

            // Structural clone: shallow-clone split nodes but preserve pane node references
            // so LayoutNode memo comparator (prev.node === next.node) skips unchanged panes
            const structuralClone = (node: any): any => {
                if (!node) return null;
                if (node.type === 'content') return node;
                return {
                    ...node,
                    children: node.children ? node.children.map(structuralClone) : [],
                    sizes: node.sizes ? [...node.sizes] : undefined
                };
            };
            let newRoot = structuralClone(oldRoot);

            const findNodeByPath = (root: any, path: number[]) => {
                if (!Array.isArray(path)) return null;
                let node = root;
                for (const idx of path) {
                    if (!node?.children?.[idx]) return null;
                    node = node.children[idx];
                }
                return node;
            };

            const draggedNode = findNodeByPath(newRoot, draggedPath);
            if (!draggedNode) {
                console.error("Could not find dragged node in layout copy.");
                return oldRoot;
            }

            const removeNode = (root: any, path: number[]) => {
                if (path.length === 1) {
                    root.children.splice(path[0], 1);
                    root.sizes.splice(path[0], 1);
                    return root;
                }

                const parent = findNodeByPath(root, path.slice(0, -1));
                const childIndex = path[path.length - 1];
                if (parent && parent.children) {
                    parent.children.splice(childIndex, 1);
                    parent.sizes.splice(childIndex, 1);
                }
                return root;
            };

            newRoot = removeNode(newRoot, draggedPath);

            const cleanup = (node: any): any => {
                if (!node) return null;
                if (node.type === 'split') {
                    if (node.children.length === 1) {
                        return cleanup(node.children[0]);
                    }
                    node.children = node.children.map(cleanup).filter(Boolean);
                    if (node.children.length === 0) return null;
                    const equalSize = 100 / node.children.length;
                    node.sizes = new Array(node.children.length).fill(equalSize);
                }
                return node;
            };

            newRoot = cleanup(newRoot);
            if (!newRoot) return draggedNode;

            const newTargetPath = findNodePath(newRoot, findNodeByPath(oldRoot, targetPath)?.id);
            if (!newTargetPath) {
                console.error("Could not find target node path after removal. Aborting drop.");
                return oldRoot;
            }

            const insertNode = (root: any, path: number[], nodeToInsert: any, side: string) => {
                const targetNode = findNodeByPath(root, path);
                if (!targetNode) return root;

                const isHorizontal = side === 'left' || side === 'right';
                const newSplit = {
                    id: generateId(),
                    type: 'split',
                    direction: isHorizontal ? 'horizontal' : 'vertical',
                    children: [] as any[],
                    sizes: [50, 50],
                };

                if (side === 'left' || side === 'top') {
                    newSplit.children = [nodeToInsert, targetNode];
                } else {
                    newSplit.children = [targetNode, nodeToInsert];
                }

                if (path.length === 0) {
                    return newSplit;
                }

                const parent = findNodeByPath(root, path.slice(0, -1));
                const childIndex = path[path.length - 1];
                if (parent && parent.children) {
                    parent.children[childIndex] = newSplit;
                }
                return root;
            };

            newRoot = insertNode(newRoot, newTargetPath, draggedNode, dropSide);

            setActiveContentPaneId(draggedId);
            return newRoot;
        });
    }, []);

    // Sync contentDataRef with layout changes
    useEffect(() => {
        if (rootLayoutNode) {
            const synchronizedContentData = { ...contentDataRef.current };
            const originalContentDataKeys = Object.keys(contentDataRef.current);

            const updatedLayoutNode = syncLayoutWithContentData(rootLayoutNode, synchronizedContentData);

            const newContentDataKeys = Object.keys(synchronizedContentData);

            if (originalContentDataKeys.length !== newContentDataKeys.length ||
                !originalContentDataKeys.every(key => synchronizedContentData.hasOwnProperty(key)) ||
                !newContentDataKeys.every(key => contentDataRef.current.hasOwnProperty(key))
            ) {
                contentDataRef.current = synchronizedContentData;
                setRootLayoutNode((prev: any) => ({ ...prev }));
            }

            const originalPaneCount = collectPaneIds(rootLayoutNode).length;
            const updatedPaneCount = collectPaneIds(updatedLayoutNode).length;
            if (updatedPaneCount !== originalPaneCount) {
                setRootLayoutNode(updatedLayoutNode);
            }
        } else {
            if (Object.keys(contentDataRef.current).length > 0) {
                contentDataRef.current = {};
            }
        }
    }, [rootLayoutNode]);

    // Keep function refs in sync for external consumers
    useEffect(() => { performSplitRef.current = performSplit; }, [performSplit]);
    useEffect(() => { closeContentPaneRef.current = closeContentPane; }, [closeContentPane]);
    useEffect(() => { updateContentPaneRef.current = updateContentPane; }, [updateContentPane]);

    return {
        // State
        rootLayoutNode, setRootLayoutNode, setRootLayoutNodeQuiet,
        contentVersion,
        activeContentPaneId, setActiveContentPaneId,
        contentDataRef,
        rootLayoutNodeRef,
        closedTabsRef,
        zenModePaneId, setZenModePaneId,
        renamingPaneId, setRenamingPaneId,
        editedFileName, setEditedFileName,
        paneContextMenu, setPaneContextMenu,
        // Function refs
        performSplitRef,
        closeContentPaneRef,
        updateContentPaneRef,
        // Functions
        updateContentPane,
        performSplit,
        closeContentPane,
        findEmptyPaneId,
        createAndAddPaneNodeToLayout,
        addPaneOrTab,
        moveContentPane,
    };
}
