import { useState, useCallback, useRef, useEffect } from 'react';
import { generateId, findNodePath } from '../components/utils';
import { syncLayoutWithContentData, collectPaneIds } from '../components/LayoutNode';

interface UseLayoutManagerParams {
    trackActivity: (action: string, data?: any) => void;
}

export function getConversationStats(messages: any[]) {
    if (!messages || messages.length === 0) {
        return { messageCount: 0, tokenCount: 0, models: new Set(), agents: new Set(), providers: new Set() };
    }
    return messages.reduce((acc: any, msg: any) => {
        if (msg.content) {
            acc.tokenCount += Math.ceil(msg.content.length / 4);
        }
        if (msg.reasoningContent) {
            acc.tokenCount += Math.ceil(msg.reasoningContent.length / 4);
        }
        if (msg.role !== 'user') {
            if (msg.model) acc.models.add(msg.model);
            if (msg.npc) acc.agents.add(msg.npc);
            if (msg.provider) acc.providers.add(msg.provider);
        }
        return acc;
    }, { messageCount: messages.length, tokenCount: 0, models: new Set(), agents: new Set(), providers: new Set() });
}

export function useLayoutManager({ trackActivity }: UseLayoutManagerParams) {
    const [rootLayoutNode, setRootLayoutNode] = useState<any>(null);
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

    // Keep rootLayoutNodeRef in sync
    useEffect(() => {
        rootLayoutNodeRef.current = rootLayoutNode;
    }, [rootLayoutNode]);

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
        } else if (newContentType === 'browser') {
            paneData.chatMessages = null;
            paneData.fileContent = null;
            paneData.browserUrl = newContentId;
        } else if (newContentType === 'chat') {
            if (!paneData.chatMessages) {
                paneData.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
            }
            if (paneData.executionMode === undefined) {
                const savedMode = localStorage.getItem('npcStudioExecutionMode');
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

            const newRoot = JSON.parse(JSON.stringify(oldRoot));
            let targetNode = newRoot;

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

            let parentNode = newRoot;
            for (let i = 0; i < targetNodePath.length - 1; i++) {
                parentNode = parentNode.children[targetNodePath[i]];
            }
            parentNode.children[targetNodePath[targetNodePath.length - 1]] = newSplitNode;

            return newRoot;
        });

        setActiveContentPaneId(newPaneId);

        if (newContentType === 'editor' || newContentType === 'chat') {
            updateContentPane(newPaneId, newContentType, newContentId);
        }
    }, [updateContentPane]);

    // Close a content pane
    const closeContentPane = useCallback((paneId: string, nodePath?: number[]) => {
        const paneData = contentDataRef.current[paneId];
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

            const newRoot = JSON.parse(JSON.stringify(oldRoot));

            if (!nodePath || nodePath.length === 0) {
                delete contentDataRef.current[paneId];
                return null;
            }

            let parentNode = newRoot;
            for (let i = 0; i < nodePath.length - 1; i++) {
                parentNode = parentNode.children[nodePath[i]];
            }

            const indexToRemove = nodePath[nodePath.length - 1];

            if (parentNode.type === 'split' && parentNode.children.length === 2) {
                const siblingIndex = indexToRemove === 0 ? 1 : 0;
                const sibling = parentNode.children[siblingIndex];

                if (nodePath.length === 1) {
                    delete contentDataRef.current[paneId];
                    return sibling;
                } else {
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

    // Helper to find an empty pane (disabled)
    const findEmptyPaneId = useCallback(() => {
        return null;
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

        const newPaneId = generateId();

        contentDataRef.current[newPaneId] = {
            contentType,
            contentId: finalContentId,
            ...extraProps
        };

        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) {
                return { id: newPaneId, type: 'content' };
            }

            const collectIds = (node: any): string[] => {
                if (!node) return [];
                if (node.type === 'content') return [node.id];
                if (node.type === 'split') {
                    return node.children.flatMap((child: any) => collectIds(child));
                }
                return [];
            };

            const existingPaneIds = collectIds(oldRoot);
            const allPaneIds = [...existingPaneIds, newPaneId];
            const totalPanes = allPaneIds.length;

            const cols = Math.ceil(Math.sqrt(totalPanes));
            const rows = Math.ceil(totalPanes / cols);

            const buildGridLayout = (paneIds: string[], numRows: number, numCols: number): any => {
                if (paneIds.length === 0) return null;
                if (paneIds.length === 1) {
                    return { id: paneIds[0], type: 'content' };
                }

                const rowNodes: any[] = [];
                let paneIndex = 0;

                for (let r = 0; r < numRows && paneIndex < paneIds.length; r++) {
                    const panesInThisRow = Math.min(numCols, paneIds.length - paneIndex);
                    const rowPaneIds = paneIds.slice(paneIndex, paneIndex + panesInThisRow);
                    paneIndex += panesInThisRow;

                    if (rowPaneIds.length === 1) {
                        rowNodes.push({ id: rowPaneIds[0], type: 'content' });
                    } else {
                        rowNodes.push({
                            id: generateId(),
                            type: 'split',
                            direction: 'horizontal',
                            children: rowPaneIds.map(id => ({ id, type: 'content' })),
                            sizes: new Array(rowPaneIds.length).fill(100 / rowPaneIds.length)
                        });
                    }
                }

                if (rowNodes.length === 1) {
                    return rowNodes[0];
                }

                return {
                    id: generateId(),
                    type: 'split',
                    direction: 'vertical',
                    children: rowNodes,
                    sizes: new Array(rowNodes.length).fill(100 / rowNodes.length)
                };
            };

            return buildGridLayout(allPaneIds, rows, cols);
        });

        setActiveContentPaneId(newPaneId);
        return newPaneId;
    }, []);

    // Move a content pane (drag & drop)
    const moveContentPane = useCallback((draggedId: string, draggedPath: number[], targetPath: number[], dropSide: string) => {
        setRootLayoutNode((oldRoot: any) => {
            if (!oldRoot) return oldRoot;

            let newRoot = JSON.parse(JSON.stringify(oldRoot));

            const findNodeByPath = (root: any, path: number[]) => {
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
                setRootLayoutNode((prev: any) => ({ ...prev }));
            }
        }
    }, [rootLayoutNode]);

    // Keep function refs in sync for external consumers
    useEffect(() => { performSplitRef.current = performSplit; }, [performSplit]);
    useEffect(() => { closeContentPaneRef.current = closeContentPane; }, [closeContentPane]);
    useEffect(() => { updateContentPaneRef.current = updateContentPane; }, [updateContentPane]);

    return {
        // State
        rootLayoutNode, setRootLayoutNode,
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
        moveContentPane,
    };
}
