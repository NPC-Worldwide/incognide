import React, { useCallback, memo, useState, useEffect, useRef } from 'react';
import {
    BarChart3, Loader, X, ServerCrash, MessageSquare, Bot,
    ChevronDown, ChevronRight, Database, Table, LineChart, BarChart as BarChartIcon,
    Star, Trash2, Play, Copy, Download, Plus, Settings2, Edit, Terminal, Globe,
    GitBranch, Brain, Zap, Clock, ChevronsRight, Repeat, ListFilter, File as FileIcon,
    Image as ImageIcon, Tag, Folder, Users, Settings, Images, BookOpen,
    FolderCog, HardDrive, Tags, Network, LayoutDashboard, Share2, Maximize2, Minimize2,
    FlaskConical, HelpCircle, Search, Music, Save, ZoomIn, ZoomOut, RotateCw, RefreshCw,
    Box, Grid3X3, Eye, EyeOff, RotateCcw
} from 'lucide-react';
import PaneHeader from './PaneHeader';
import PaneTabBar from './PaneTabBar';
import { getFileName, getFileIcon } from './utils';
import ChatInput from './ChatInput';
import DiffViewer from './DiffViewer';
import { ChatHeaderContent } from './pane-headers';

// Token cost calculator based on model pricing ($ per 1K tokens)
// Source: Helicone LLM API Pricing - Updated Nov 2025


// Generate a unique ID for layout nodes
const generateLayoutId = () => `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Deep-clone a layout tree creating new object references for ALL nodes.
// This forces all memo'd LayoutNodes to re-render (since prev.node !== next.node).
// Use this for infrequent operations (tab switch, drag-drop, workspace restore).
// For resize (high-frequency), use structural sharing instead.
export const forceFullRerender = (root: any): any => {
    if (!root) return null;
    return {
        ...root,
        children: root.children ? root.children.map(forceFullRerender) : undefined,
        sizes: root.sizes ? [...root.sizes] : undefined,
    };
};

// Collect all pane IDs from a layout node
export const collectPaneIds = (node: any): string[] => {
    if (!node) return [];
    if (node.type === 'content') return [node.id];
    if (node.type === 'split') {
        return node.children.flatMap((child: any) => collectPaneIds(child));
    }
    return [];
};

// Build a balanced grid layout from pane IDs
// Returns a layout tree where rows and columns differ by at most 1
export const buildBalancedGridLayout = (paneIds: string[]): any => {
    if (paneIds.length === 0) return null;
    if (paneIds.length === 1) {
        return { id: paneIds[0], type: 'content' };
    }

    const totalPanes = paneIds.length;
    const cols = Math.ceil(Math.sqrt(totalPanes));
    const rows = Math.ceil(totalPanes / cols);

    const rowNodes: any[] = [];
    let paneIndex = 0;

    for (let r = 0; r < rows && paneIndex < paneIds.length; r++) {
        const panesInThisRow = Math.min(cols, paneIds.length - paneIndex);
        const rowPaneIds = paneIds.slice(paneIndex, paneIndex + panesInThisRow);
        paneIndex += panesInThisRow;

        if (rowPaneIds.length === 1) {
            rowNodes.push({ id: rowPaneIds[0], type: 'content' });
        } else {
            rowNodes.push({
                id: generateLayoutId(),
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
        id: generateLayoutId(),
        type: 'split',
        direction: 'vertical',
        children: rowNodes,
        sizes: new Array(rowNodes.length).fill(100 / rowNodes.length)
    };
};

// Add a new pane to an existing layout, preserving existing sizes and structure.
// Splits the root horizontally (or adds to the top-level split) instead of rebuilding.
export const addPaneToLayout = (oldRoot: any, newPaneId: string): any => {
    if (!oldRoot) {
        return { id: newPaneId, type: 'content' };
    }

    const newPaneNode = { id: newPaneId, type: 'content' };

    // If root is a horizontal split, append the new pane to it
    if (oldRoot.type === 'split' && oldRoot.direction === 'horizontal') {
        const newChildren = [...oldRoot.children, newPaneNode];
        // Shrink existing panes proportionally to make room for the new one
        const newPaneShare = 100 / newChildren.length;
        const scaleFactor = (100 - newPaneShare) / 100;
        const newSizes = oldRoot.sizes.map((s: number) => s * scaleFactor);
        newSizes.push(newPaneShare);
        return { ...oldRoot, children: newChildren, sizes: newSizes };
    }

    // Otherwise, wrap existing root + new pane in a horizontal split
    const existingPaneCount = collectPaneIds(oldRoot).length;
    const newPaneShare = 100 / (existingPaneCount + 1);
    return {
        id: generateLayoutId(),
        type: 'split',
        direction: 'horizontal',
        children: [oldRoot, newPaneNode],
        sizes: [100 - newPaneShare, newPaneShare],
    };
};

// Exported utility function for syncing layout with content data
// IMPORTANT: This function removes layout nodes that don't have valid content to prevent empty panes
export const syncLayoutWithContentData = (layoutNode: any, contentData: Record<string, any>): any => {
    if (!layoutNode) {
        // If layoutNode is null, ensure contentData is also empty
        if (Object.keys(contentData).length > 0) {
            console.log('[SYNC] Layout node is null, clearing contentData.');
            for (const key in contentData) {
                delete contentData[key];
            }
        }
        return null; // Return null if the layout itself is null
    }

    // First, identify which panes have valid content (have contentType)
    const validContentPaneIds = new Set(
        Object.entries(contentData)
            .filter(([_, data]) => data?.contentType)
            .map(([id]) => id)
    );

    // Clean the layout to remove pane nodes without valid content
    const cleanLayout = (node: any): any => {
        if (!node) return null;
        if (node.type === 'content') {
            // Remove this pane if it doesn't have valid content
            if (!validContentPaneIds.has(node.id)) {
                console.warn('[SYNC] Removing pane from layout (no valid content):', node.id);
                // Also remove from contentData if it exists but is empty
                if (contentData[node.id] && !contentData[node.id].contentType) {
                    delete contentData[node.id];
                }
                return null;
            }
            return node;
        }
        if (node.type === 'split') {
            const cleanedChildren = node.children
                .map((child: any) => cleanLayout(child))
                .filter((child: any) => child !== null);
            if (cleanedChildren.length === 0) return null;
            if (cleanedChildren.length === 1) return cleanedChildren[0];
            return { ...node, children: cleanedChildren, sizes: new Array(cleanedChildren.length).fill(100 / cleanedChildren.length) };
        }
        return node;
    };

    const cleanedLayout = cleanLayout(layoutNode);

    // Remove orphaned panes from contentData (not in layout anymore)
    const collectPaneIds = (node: any): Set<string> => {
        if (!node) return new Set();
        if (node.type === 'content') return new Set([node.id]);
        if (node.type === 'split') {
            return node.children.reduce((acc: Set<string>, child: any) => {
                const childIds = collectPaneIds(child);
                childIds.forEach(id => acc.add(id));
                return acc;
            }, new Set());
        }
        return new Set();
    };

    const paneIdsInCleanedLayout = collectPaneIds(cleanedLayout);
    Object.keys(contentData).forEach(id => {
        if (!paneIdsInCleanedLayout.has(id)) {
            // Only remove if the pane has no valid content
            // Panes with valid contentType might be pending layout updates (race condition)
            if (!contentData[id]?.contentType) {
                console.warn('[SYNC] Removing orphaned empty pane from contentData:', id);
                delete contentData[id];
            }
        }
    });

    return cleanedLayout;
};

// CODE FRAGMENTS BELOW - These are incomplete code snippets meant to be inside Enpistu.tsx
// They reference parent scope variables and can't work as standalone exports
// Commenting out to prevent module-level execution errors

/*
const cleanupPhantomPanes = useCallback(() => {
  const validPaneIds = new Set();

  const collectPaneIds = (node) => {
    if (!node) return;
    if (node.type === 'content') validPaneIds.add(node.id);
    if (node.type === 'split') {
      node.children.forEach(collectPaneIds);
    }
  };

  collectPaneIds(rootLayoutNode);

  // Remove any contentDataRef entries not in the layout
  Object.keys(contentDataRef.current).forEach(paneId => {
    if (!validPaneIds.has(paneId)) {
      console.log(`Removing phantom pane: ${paneId}`);
      delete contentDataRef.current[paneId];
    }
  });
}, [rootLayoutNode]);

const renderPaneContextMenu = () => {
  if (!paneContextMenu?.isOpen) return null;
  const { x, y, nodeId, nodePath } = paneContextMenu;

  const closePane = () => {
    closeContentPane(nodeId, nodePath);
    setPaneContextMenu(null);
  };

  const splitPane = (side) => {
    performSplit(nodePath, side, 'chat', null); // or appropriate contentType and contentId
    setPaneContextMenu(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" onMouseDown={() => setPaneContextMenu(null)} />
      <div
        className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm"
        style={{ top: y, left: x }}
        onMouseLeave={() => setPaneContextMenu(null)}
      >
        <button onClick={closePane} className="block px-4 py-2 w-full text-left theme-hover">
          Close Pane
        </button>
        <div className="border-t theme-border my-1" />
        <button onClick={() => splitPane('left')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Left
        </button>
        <button onClick={() => splitPane('right')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Right
        </button>
        <button onClick={() => splitPane('top')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Top
        </button>
        <button onClick={() => splitPane('bottom')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Bottom
        </button>
      </div>
    </>
  );
};
*/

// End of commented-out fragments

export const LayoutNode = memo(({ node, path, component: componentRef, contentVersion }) => {
    // component is a ref — always read .current for the latest value.
    // contentVersion bumps on content changes (force re-render).
    // Resize uses setRootLayoutNodeQuiet which doesn't bump contentVersion.
    const component = componentRef.current;
    if (!node) return null;

    if (node.type === 'split') {
        const handleResize = (e, index) => {
            e.preventDefault();
            const parentNode = componentRef.current.findNodeByPath(componentRef.current.rootLayoutNode, path);
            if (!parentNode) return;
            const startSizes = [...parentNode.sizes];
            const isHorizontal = parentNode.direction === 'horizontal';
            const startPos = isHorizontal ? e.clientX : e.clientY;
            const container = e.currentTarget.parentElement;
            const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight;

            // Get the child elements for direct DOM manipulation during drag
            const childElements = Array.from(container.children).filter(
                (el: Element) => !el.classList.contains('cursor-col-resize') && !el.classList.contains('cursor-row-resize')
            ) as HTMLElement[];

            let currentSizes = [...startSizes];

            const cleanup = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.removeEventListener('keydown', onKeyDown);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.body.classList.remove('layout-resizing');
            };

            const onMouseMove = (moveEvent: MouseEvent) => {
                const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
                const deltaPercent = ((currentPos - startPos) / containerSize) * 100;
                const newSizes = [...startSizes];
                const amount = Math.min(newSizes[index + 1] - 5, Math.max(-(newSizes[index] - 5), deltaPercent));
                newSizes[index] += amount;
                newSizes[index + 1] -= amount;
                currentSizes = newSizes;

                // Direct DOM update for smooth resizing (no React re-render)
                childElements.forEach((el, i) => {
                    if (newSizes[i] !== undefined) {
                        el.style.flexBasis = `${newSizes[i]}%`;
                    }
                });
            };

            const onKeyDown = (keyEvent: KeyboardEvent) => {
                if (keyEvent.key === 'Escape') {
                    keyEvent.preventDefault();
                    // Restore original sizes via DOM
                    childElements.forEach((el, i) => {
                        if (startSizes[i] !== undefined) {
                            el.style.flexBasis = `${startSizes[i]}%`;
                        }
                    });
                    cleanup();
                }
            };

            const onMouseUp = () => {
                // Commit final sizes to React state (structural sharing — only clone along path)
                // Use quiet setter so contentVersion doesn't bump — prevents unnecessary child re-renders
                componentRef.current.setRootLayoutNodeQuiet((currentRoot: any) => {
                    if (path.length === 0) {
                        return { ...currentRoot, sizes: currentSizes };
                    }
                    const newRoot = { ...currentRoot, children: [...currentRoot.children], sizes: currentRoot.sizes ? [...currentRoot.sizes] : undefined };
                    let current = newRoot;
                    for (let i = 0; i < path.length - 1; i++) {
                        const idx = path[i];
                        current.children[idx] = { ...current.children[idx], children: [...current.children[idx].children], sizes: current.children[idx].sizes ? [...current.children[idx].sizes] : undefined };
                        current = current.children[idx];
                    }
                    const lastIdx = path[path.length - 1];
                    current.children[lastIdx] = { ...current.children[lastIdx], sizes: currentSizes };
                    return newRoot;
                });
                cleanup();
            };

            // Set cursor for entire document during drag
            document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
            // Add class to block webview interaction during resize
            document.body.classList.add('layout-resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp, { once: true });
            document.addEventListener('keydown', onKeyDown);
        };

        return (
            <div className={`flex flex-1 ${node.direction === 'horizontal' ? 'flex-row' : 'flex-col'} w-full h-full overflow-hidden`}>
                {node.children.map((child, index) => (
                    <React.Fragment key={child.id}>
                        <div className="flex overflow-hidden" style={{ flexBasis: `${node.sizes[index]}%` }}>
                            <LayoutNode node={child} path={[...path, index]} component={componentRef} contentVersion={contentVersion} />
                        </div>
                        {index < node.children.length - 1 && (
                            <div
                                className={`flex-shrink-0 relative flex items-center justify-center group ${node.direction === 'horizontal' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}
                                onMouseDown={(e) => handleResize(e, index)}
                                style={{ touchAction: 'none' }}
                            >
                                {/* Visible resize bar - smaller visual but larger hit area via parent */}
                                <div className={`${node.direction === 'horizontal' ? 'w-px h-full' : 'h-px w-full'} bg-gray-600 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors`} />
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    if (node.type === 'content') {
        const { activeContentPaneId, setActiveContentPaneId, draggedItem,
            setDraggedItem, dropTarget, setDropTarget, contentDataRef,
            updateContentPane, performSplit, setRootLayoutNode,
            paneRenderers,
            moveContentPane,
            findNodePath, rootLayoutNode, setPaneContextMenu, closeContentPane,
            // Destructure the new chat-specific props from component:
            autoScrollEnabled, setAutoScrollEnabled,
            messageSelectionMode, toggleMessageSelectionMode, selectedMessages,
            conversationBranches, showBranchingUI, setShowBranchingUI,
            // ChatInput props function for rendering input in chat panes (takes paneId)
            getChatInputProps,
            // Zen mode props
            zenModePaneId, toggleZenMode,
            // Renaming props
            renamingPaneId, setRenamingPaneId, editedFileName, setEditedFileName, handleConfirmRename,
            // Script running
            onRunScript,
            // Top bar collapse
            topBarCollapsed,
            onExpandTopBar,
            // Current working directory
            currentPath,
            // Pane locking (per-pane)
            lockedPanes, togglePaneLocked,
        } = component;

        // Get chat input props for this specific pane
        const chatInputProps = getChatInputProps ? getChatInputProps(node.id) : null;

        const isActive = node.id === activeContentPaneId;

        // Local drag-over state — pane detects drags via native HTML5 events
        // so it doesn't need to re-render when global draggedItem changes.
        const [localDragOver, setLocalDragOver] = useState(false);
        const [localDropSide, setLocalDropSide] = useState<string | null>(null);
        const dragCounterRef = useRef(0); // Track enter/leave balance

        const onDrop = (e, side) => {
            e.preventDefault();
            e.stopPropagation();
            const comp = componentRef.current;
            if (!comp.draggedItem) return;

            if (comp.draggedItem.type === 'pane') {
                if (comp.draggedItem.id === node.id) return;

                // When dropping pane on CENTER, add it as a tab instead of moving
                if (side === 'center') {
                    const sourcePaneData = contentDataRef.current[comp.draggedItem.id];
                    const targetPaneData = contentDataRef.current[node.id];

                    if (sourcePaneData?.contentType && targetPaneData) {
                        // Initialize target tabs if needed
                        if (!targetPaneData.tabs || targetPaneData.tabs.length === 0) {
                            const targetTitle = targetPaneData.contentType === 'browser'
                                ? (targetPaneData.browserUrl || 'Browser')
                                : (getFileName(targetPaneData.contentId) || targetPaneData.contentType);
                            targetPaneData.tabs = [{
                                id: `tab_${Date.now()}_0`,
                                contentType: targetPaneData.contentType,
                                contentId: targetPaneData.contentId,
                                browserUrl: targetPaneData.browserUrl,
                                fileContent: targetPaneData.fileContent,
                                fileChanged: targetPaneData.fileChanged,
                                _scrollTopPos: targetPaneData._scrollTopPos,
                                title: targetTitle
                            }];
                            targetPaneData.activeTabIndex = 0;
                        }

                        // If source pane has tabs, add all of them
                        if (sourcePaneData.tabs && sourcePaneData.tabs.length > 0) {
                            // Sync virtual data → tab objects before transfer (editors write to virtual data, not tabs)
                            sourcePaneData.tabs.forEach((tab: any) => {
                                const vd = contentDataRef.current[`${comp.draggedItem.id}_${tab.id}`];
                                if (vd) {
                                    if (vd.fileContent !== undefined) tab.fileContent = vd.fileContent;
                                    if (vd.fileChanged !== undefined) tab.fileChanged = vd.fileChanged;
                                    if (vd._scrollTopPos !== undefined) tab._scrollTopPos = vd._scrollTopPos;
                                }
                            });
                            sourcePaneData.tabs.forEach(tab => {
                                targetPaneData.tabs.push({
                                    ...tab,
                                    id: `tab_${Date.now()}_${targetPaneData.tabs.length}`
                                });
                            });
                        } else {
                            // Add source content as a single new tab
                            const sourceTitle = sourcePaneData.contentType === 'browser'
                                ? (sourcePaneData.browserUrl || 'Browser')
                                : (getFileName(sourcePaneData.contentId) || sourcePaneData.contentType);
                            targetPaneData.tabs.push({
                                id: `tab_${Date.now()}_${targetPaneData.tabs.length}`,
                                contentType: sourcePaneData.contentType,
                                contentId: sourcePaneData.contentId,
                                browserUrl: sourcePaneData.browserUrl,
                                fileContent: sourcePaneData.fileContent,
                                fileChanged: sourcePaneData.fileChanged,
                                _scrollTopPos: sourcePaneData._scrollTopPos,
                                title: sourceTitle
                            });
                        }

                        // Switch to the newly added tab
                        targetPaneData.activeTabIndex = targetPaneData.tabs.length - 1;
                        const activeTab = targetPaneData.tabs[targetPaneData.activeTabIndex];
                        targetPaneData.contentType = activeTab.contentType;
                        targetPaneData.contentId = activeTab.contentId;
                        // Preserve browserUrl for browser tabs
                        if (activeTab.contentType === 'browser' && activeTab.browserUrl) {
                            targetPaneData.browserUrl = activeTab.browserUrl;
                        }
                        // Preserve fileContent for editor tabs
                        if ((activeTab.contentType === 'editor' || activeTab.contentType === 'latex') && activeTab.fileContent !== undefined) {
                            targetPaneData.fileContent = activeTab.fileContent;
                            targetPaneData.fileChanged = activeTab.fileChanged || false;
                        }

                        // Clean up orphaned virtual data entries from source pane
                        if (sourcePaneData.tabs) {
                            sourcePaneData.tabs.forEach((tab: any) => {
                                delete contentDataRef.current[`${comp.draggedItem.id}_${tab.id}`];
                            });
                        }

                        // Close the source pane
                        closeContentPane(comp.draggedItem.id, comp.draggedItem.nodePath);

                        setRootLayoutNode?.(prev => ({ ...prev }));
                        comp.setDraggedItem(null);
                        comp.setDropTarget(null);
                        return;
                    }
                }

                // For non-center drops, use normal move behavior
                comp.moveContentPane(comp.draggedItem.id, comp.draggedItem.nodePath, path, side);
                comp.setDraggedItem(null);
                comp.setDropTarget(null);
                return;
            }

            // Handle tab drag from another pane's tab bar
            if (comp.draggedItem.type === 'tab') {
                const { sourceNodeId, tabIndex, contentType: tabContentType, contentId: tabContentId, browserUrl, fileChanged } = comp.draggedItem;
                const draggedTabId = comp.draggedItem.id; // Stable tab ID
                const targetPaneData = contentDataRef.current[node.id];
                const sourcePaneData = contentDataRef.current[sourceNodeId];
                // Get fileContent from virtual data (authoritative) or fallback to drag data
                const sourceVirtualId = `${sourceNodeId}_${draggedTabId}`;
                const sourceVirtualData = contentDataRef.current[sourceVirtualId];
                const fileContent = sourceVirtualData?.fileContent ?? comp.draggedItem.fileContent;

                // Don't drop on the same pane's center (that's reorder, handled by PaneTabBar)
                if (sourceNodeId === node.id && side === 'center') {
                    comp.setDraggedItem(null);
                    comp.setDropTarget(null);
                    return;
                }

                if (side === 'center' && targetPaneData) {
                    // Add as tab to target pane
                    if (!targetPaneData.tabs || targetPaneData.tabs.length === 0) {
                        const targetTitle = targetPaneData.contentType === 'browser'
                            ? (targetPaneData.browserUrl || 'Browser')
                            : (getFileName(targetPaneData.contentId) || targetPaneData.contentType);
                        targetPaneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: targetPaneData.contentType,
                            contentId: targetPaneData.contentId,
                            browserUrl: targetPaneData.browserUrl,
                            fileContent: targetPaneData.fileContent,
                            fileChanged: targetPaneData.fileChanged,
                            _scrollTopPos: targetPaneData._scrollTopPos,
                            title: targetTitle
                        }];
                        targetPaneData.activeTabIndex = 0;
                    }

                    // Add the dragged tab
                    const newTabTitle = tabContentType === 'browser'
                        ? (browserUrl || tabContentId || 'Browser')
                        : (getFileName(tabContentId) || tabContentType);
                    const dragScrollPos = sourceVirtualData?._scrollTopPos ?? comp.draggedItem._scrollTopPos;
                    targetPaneData.tabs.push({
                        id: `tab_${Date.now()}_${targetPaneData.tabs.length}`,
                        contentType: tabContentType,
                        contentId: tabContentId,
                        browserUrl,
                        fileContent,
                        fileChanged,
                        _scrollTopPos: dragScrollPos,
                        title: newTabTitle
                    });
                    targetPaneData.activeTabIndex = targetPaneData.tabs.length - 1;
                    targetPaneData.contentType = tabContentType;
                    targetPaneData.contentId = tabContentId;
                    if (tabContentType === 'browser' && browserUrl) {
                        targetPaneData.browserUrl = browserUrl;
                    }
                } else {
                    // Create new pane with the tab's content
                    // Track existing pane IDs before split to find the new one
                    const existingPaneIds = new Set(Object.keys(contentDataRef.current));
                    performSplit(path, side, tabContentType, tabContentId);

                    // Find the newly created pane and set browserUrl/fileContent directly
                    const newPaneId = Object.keys(contentDataRef.current).find(id => !existingPaneIds.has(id));
                    if (newPaneId && contentDataRef.current[newPaneId]) {
                        if (tabContentType === 'browser' && browserUrl) {
                            contentDataRef.current[newPaneId].browserUrl = browserUrl;
                        }
                        if (fileContent !== undefined) {
                            contentDataRef.current[newPaneId].fileContent = fileContent;
                            contentDataRef.current[newPaneId].fileChanged = fileChanged || false;
                        }
                        // Transfer scroll position so the new pane restores it
                        const splitScrollPos = sourceVirtualData?._scrollTopPos ?? comp.draggedItem._scrollTopPos;
                        if (splitScrollPos != null) {
                            contentDataRef.current[newPaneId]._scrollTopPos = splitScrollPos;
                        }
                    }
                }

                // Remove the tab from source pane
                if (sourcePaneData?.tabs && sourcePaneData.tabs.length > 0) {
                    // Save ALL tabs' content from virtual data before splice
                    // (ensures remaining tabs have up-to-date fileContent in their tab objects)
                    sourcePaneData.tabs.forEach((tab: any) => {
                        const vd = contentDataRef.current[`${sourceNodeId}_${tab.id}`];
                        if (vd) {
                            if (vd.fileContent !== undefined) tab.fileContent = vd.fileContent;
                            if (vd.fileChanged !== undefined) tab.fileChanged = vd.fileChanged;
                            if (vd._scrollTopPos !== undefined) tab._scrollTopPos = vd._scrollTopPos;
                            if (tab.contentType === 'browser') {
                                if (vd.browserUrl) tab.browserUrl = vd.browserUrl;
                                if (vd.browserTitle) tab.browserTitle = vd.browserTitle;
                            }
                            if (tab.contentType === 'chat') {
                                tab.chatMessages = vd.chatMessages ?? sourcePaneData.chatMessages;
                                tab.executionMode = vd.executionMode ?? sourcePaneData.executionMode;
                                tab.selectedJinx = vd.selectedJinx ?? sourcePaneData.selectedJinx;
                                tab.chatStats = vd.chatStats ?? sourcePaneData.chatStats;
                            }
                        }
                    });

                    // Clean up virtual data for the removed tab
                    delete contentDataRef.current[sourceVirtualId];

                    sourcePaneData.tabs.splice(tabIndex, 1);
                    if (sourcePaneData.tabs.length === 0) {
                        // Close the pane if no tabs left
                        const sourcePath = comp.draggedItem.sourcePath || findNodePath(comp.rootLayoutNode, sourceNodeId);
                        if (sourcePath) closeContentPane(sourceNodeId, sourcePath);
                    } else {
                        // Adjust active index
                        if (sourcePaneData.activeTabIndex >= sourcePaneData.tabs.length) {
                            sourcePaneData.activeTabIndex = sourcePaneData.tabs.length - 1;
                        }
                        const newActiveTab = sourcePaneData.tabs[sourcePaneData.activeTabIndex];
                        sourcePaneData.contentType = newActiveTab.contentType;
                        sourcePaneData.contentId = newActiveTab.contentId;
                        // Sync fileContent from virtual data (authoritative) or tab object
                        const activeVd = contentDataRef.current[`${sourceNodeId}_${newActiveTab.id}`];
                        sourcePaneData.fileContent = activeVd?.fileContent ?? newActiveTab.fileContent;
                        sourcePaneData.fileChanged = activeVd?.fileChanged ?? newActiveTab.fileChanged ?? false;
                        if (newActiveTab.contentType === 'browser') {
                            sourcePaneData.browserUrl = newActiveTab.browserUrl;
                        }
                        // Transition to single-tab: copy virtual data to real pane
                        if (sourcePaneData.tabs.length === 1) {
                            const lastTab = sourcePaneData.tabs[0];
                            const lastVd = contentDataRef.current[`${sourceNodeId}_${lastTab.id}`];
                            if (lastVd) {
                                if (lastVd.fileContent !== undefined) sourcePaneData.fileContent = lastVd.fileContent;
                                if (lastVd.fileChanged !== undefined) sourcePaneData.fileChanged = lastVd.fileChanged;
                                if (lastVd._scrollTopPos !== undefined) sourcePaneData._scrollTopPos = lastVd._scrollTopPos;
                            } else {
                                // Virtual data missing — sync from tab object
                                sourcePaneData.fileContent = lastTab.fileContent;
                                sourcePaneData.fileChanged = lastTab.fileChanged ?? false;
                            }
                            delete contentDataRef.current[`${sourceNodeId}_${lastTab.id}`];
                        }
                    }
                }

                setRootLayoutNode?.(prev => ({ ...prev }));
                comp.setDraggedItem(null);
                comp.setDropTarget(null);
                return;
            }

            let contentType;
            if (comp.draggedItem.type === 'conversation') {
                contentType = 'chat';
            } else if (comp.draggedItem.type === 'folder') {
                contentType = 'folder';
            } else if (comp.draggedItem.type === 'file') {
                const ext = comp.draggedItem.id.split('.').pop()?.toLowerCase();
                if (ext === 'pdf') contentType = 'pdf';
                else if (['csv', 'xlsx', 'xls'].includes(ext)) contentType = 'csv';
                else if (['docx', 'doc'].includes(ext)) contentType = 'docx';
                else if (ext === 'pptx') contentType = 'pptx';
                else if (ext === 'tex') contentType = 'latex';
                else if (ext === 'mindmap') contentType = 'mindmap';
                else if (ext === 'zip') contentType = 'zip';
                else contentType = 'editor';
            } else if (comp.draggedItem.type === 'browser') {
                contentType = 'browser';
            } else if (comp.draggedItem.type === 'terminal') {
                contentType = 'terminal';
            } else {
                return;
            }

            if (side === 'center') {
                const paneData = contentDataRef.current[node.id];
                // Dropping on center ALWAYS adds as a tab (not replace)
                if (paneData?.contentType) {
                    // Initialize tabs if this pane doesn't have them yet
                    if (!paneData.tabs || paneData.tabs.length === 0) {
                        // Convert current content to first tab
                        const currentTitle = paneData.contentType === 'browser'
                            ? (paneData.browserUrl || 'Browser')
                            : (getFileName(paneData.contentId) || paneData.contentType);
                        paneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: paneData.contentType,
                            contentId: paneData.contentId,
                            browserUrl: paneData.browserUrl,
                            fileContent: paneData.fileContent,
                            fileChanged: paneData.fileChanged,
                            isUntitled: paneData.isUntitled,
                            _scrollTopPos: paneData._scrollTopPos,
                            _editorStateJSON: paneData._editorStateJSON,
                            _cursorPos: paneData._cursorPos,
                            title: currentTitle
                        }];
                        paneData.activeTabIndex = 0;
                    }
                    // Add new content as new tab
                    const browserUrl = comp.draggedItem.url || comp.draggedItem.browserUrl; // Support both property names
                    const newTabTitle = contentType === 'browser'
                        ? (browserUrl || comp.draggedItem.id || 'Browser')
                        : (getFileName(comp.draggedItem.id) || contentType);
                    const newTab = {
                        id: `tab_${Date.now()}_${paneData.tabs.length}`,
                        contentType,
                        contentId: comp.draggedItem.id,
                        browserUrl: browserUrl, // Preserve browser URL from dragged item
                        fileContent: comp.draggedItem.fileContent, // Preserve file content from dragged item
                        fileChanged: comp.draggedItem.fileChanged, // Preserve file changed state
                        title: newTabTitle
                    };
                    // Save current tab's content before switching to new tab
                    const currentTabIndex = paneData.activeTabIndex || 0;
                    if (paneData.tabs[currentTabIndex]) {
                        const curVd = contentDataRef.current[`${node.id}_${paneData.tabs[currentTabIndex].id}`];
                        paneData.tabs[currentTabIndex].fileContent = curVd?.fileContent ?? paneData.fileContent;
                        paneData.tabs[currentTabIndex].fileChanged = curVd?.fileChanged ?? paneData.fileChanged;
                    }

                    paneData.tabs.push(newTab);
                    paneData.activeTabIndex = paneData.tabs.length - 1;
                    // Update main paneData to reflect the new active tab
                    paneData.contentType = contentType;
                    paneData.contentId = comp.draggedItem.id;
                    // Clear fileContent for new tab (will be loaded below if editor)
                    paneData.fileContent = null;
                    paneData.fileChanged = false;
                    if (contentType === 'browser' && browserUrl) {
                        paneData.browserUrl = browserUrl;
                    }

                    // For editor files, load the content if not already loaded
                    if (contentType === 'editor' && !comp.draggedItem.fileContent) {
                        // Load file content asynchronously
                        (async () => {
                            try {
                                const response = await (window as any).api.readFileContent(comp.draggedItem.id);
                                const fileContent = response.error ? `Error: ${response.error}` : response.content;
                                paneData.fileContent = fileContent;
                                // Also update the tab's fileContent
                                const tabIndex = paneData.tabs.length - 1;
                                if (paneData.tabs[tabIndex]) {
                                    paneData.tabs[tabIndex].fileContent = fileContent;
                                }
                                setRootLayoutNode?.(prev => ({ ...prev }));
                            } catch (err) {
                                console.error('Error loading file content:', err);
                            }
                        })();
                    }

                    setRootLayoutNode?.(prev => ({ ...prev }));
                } else {
                    // Empty pane - just set content directly
                    updateContentPane(node.id, contentType, comp.draggedItem.id);
                }
            } else {
                performSplit(path, side, contentType, comp.draggedItem.id);
                // For browser splits, we need to set the browserUrl after performSplit creates the pane
                // performSplit sets contentDataRef synchronously, so we can update it immediately
                const splitBrowserUrl = comp.draggedItem.url || comp.draggedItem.browserUrl;
                if (contentType === 'browser' && splitBrowserUrl) {
                    // Find the newly created pane and set its browserUrl
                    // performSplit creates a new pane ID, but we don't have access to it here
                    // We need to update performSplit to accept additional data, or handle this differently
                    // For now, we'll check all panes for new browser panes without a URL
                    setTimeout(() => {
                        Object.entries(contentDataRef.current).forEach(([id, data]) => {
                            if (data.contentType === 'browser' && data.contentId === comp.draggedItem.id && !data.browserUrl) {
                                data.browserUrl = splitBrowserUrl;
                            }
                        });
                    }, 0);
                }
            }
            comp.setDraggedItem(null);
            comp.setDropTarget(null);
        };

        const paneData = contentDataRef.current[node.id];

        // Tab support: only show tabs when there are multiple
        const tabs = paneData?.tabs || [];
        const activeTabIndex = paneData?.activeTabIndex ?? 0;
        const showTabBar = tabs.length > 1; // Only show when multiple tabs

        // Get content type/id from active tab if tabs exist, otherwise use paneData directly
        const activeTab = tabs.length > 0 ? tabs[activeTabIndex] : null;
        const contentType = activeTab?.contentType || paneData?.contentType;
        const contentId = activeTab?.contentId || paneData?.contentId;

        // Tab management handlers
        const handleTabSelect = (index: number) => {
            if (paneData && tabs[index]) {
                // Save current tab's content before switching
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    // In multi-tab mode, the editor writes to virtual pane data, not the real pane
                    const currentVirtualId = `${node.id}_${tabs[currentTabIndex].id}`;
                    const currentVirtualData = contentDataRef.current[currentVirtualId];
                    tabs[currentTabIndex].fileContent = currentVirtualData?.fileContent ?? paneData.fileContent;
                    tabs[currentTabIndex].fileChanged = currentVirtualData?.fileChanged ?? paneData.fileChanged;
                    tabs[currentTabIndex].isUntitled = currentVirtualData?.isUntitled ?? paneData.isUntitled;
                    // Save editor state (scroll, cursor, undo history) for editor/latex tabs
                    if (currentVirtualData) {
                        tabs[currentTabIndex]._editorStateJSON = currentVirtualData._editorStateJSON;
                        tabs[currentTabIndex]._cursorPos = currentVirtualData._cursorPos;
                        tabs[currentTabIndex]._scrollTopPos = currentVirtualData._scrollTopPos;
                    }
                    // Save chat state for chat tabs
                    if (tabs[currentTabIndex].contentType === 'chat') {
                        tabs[currentTabIndex].chatMessages = paneData.chatMessages;
                        tabs[currentTabIndex].executionMode = paneData.executionMode;
                        tabs[currentTabIndex].selectedJinx = paneData.selectedJinx;
                        tabs[currentTabIndex].chatStats = paneData.chatStats;
                    }
                    // IMPORTANT: Save browserUrl and browserTitle for browser tabs
                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }
                }

                paneData.activeTabIndex = index;
                // Update paneData with the selected tab's content
                const selectedTab = tabs[index];
                const selectedVirtualId = `${node.id}_${tabs[index].id}`;
                const selectedVirtualData = contentDataRef.current[selectedVirtualId];
                paneData.contentType = selectedTab.contentType;
                paneData.contentId = selectedTab.contentId;
                // Restore fileContent from virtual data (authoritative) or tab object (fallback)
                paneData.fileContent = selectedVirtualData?.fileContent ?? selectedTab.fileContent;
                paneData.fileChanged = selectedVirtualData?.fileChanged ?? selectedTab.fileChanged ?? false;
                paneData.isUntitled = selectedVirtualData?.isUntitled ?? selectedTab.isUntitled ?? false;
                // Also sync the selected tab's virtual data from tab object if virtual data is stale
                if (selectedVirtualData) {
                    if (selectedTab._editorStateJSON) {
                        selectedVirtualData._editorStateJSON = selectedTab._editorStateJSON;
                        selectedVirtualData._cursorPos = selectedTab._cursorPos;
                        selectedVirtualData._scrollTopPos = selectedTab._scrollTopPos;
                    }
                }
                // Restore chat state for chat tabs
                if (selectedTab.contentType === 'chat') {
                    paneData.chatMessages = selectedTab.chatMessages;
                    paneData.executionMode = selectedTab.executionMode;
                    paneData.selectedJinx = selectedTab.selectedJinx;
                    paneData.chatStats = selectedTab.chatStats;
                }
                // Preserve browserUrl and browserTitle for browser tabs
                if (selectedTab.contentType === 'browser') {
                    paneData.browserUrl = selectedTab.browserUrl || 'about:blank';
                    paneData.browserTitle = selectedTab.browserTitle || 'Browser';
                }
                // Force re-render
                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        const handleTabClose = (index: number) => {
            if (paneData && tabs.length > 0) {
                // Save current tab state before closing
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    // In multi-tab mode, editors write to virtual pane data
                    const closeVirtualId = `${node.id}_${tabs[currentTabIndex].id}`;
                    const closeVirtualData = contentDataRef.current[closeVirtualId];
                    // Save browser URL/title for browser tabs
                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }
                    // Save file content for editor tabs (prefer virtual data over real pane data)
                    if (tabs[currentTabIndex].contentType === 'editor' || tabs[currentTabIndex].contentType === 'latex') {
                        tabs[currentTabIndex].fileContent = closeVirtualData?.fileContent ?? paneData.fileContent;
                        tabs[currentTabIndex].fileChanged = closeVirtualData?.fileChanged ?? paneData.fileChanged;
                    }
                    // Save chat state for chat tabs
                    if (tabs[currentTabIndex].contentType === 'chat') {
                        tabs[currentTabIndex].chatMessages = paneData.chatMessages;
                        tabs[currentTabIndex].executionMode = paneData.executionMode;
                        tabs[currentTabIndex].selectedJinx = paneData.selectedJinx;
                        tabs[currentTabIndex].chatStats = paneData.chatStats;
                    }
                }

                const newTabs = [...tabs];
                newTabs.splice(index, 1);

                // Clean up virtual pane data for removed tab (stable ID — no remapping needed)
                delete contentDataRef.current[`${node.id}_${tabs[index].id}`];

                if (newTabs.length === 0) {
                    // Close the pane if no tabs left
                    closeContentPane(node.id, path);
                } else {
                    paneData.tabs = newTabs;
                    // Adjust active index if needed
                    if (paneData.activeTabIndex >= newTabs.length) {
                        paneData.activeTabIndex = newTabs.length - 1;
                    }
                    // Restore state from new active tab (prefer virtual data as authoritative)
                    const newActiveTab = newTabs[paneData.activeTabIndex];
                    const newActiveVd = newActiveTab ? contentDataRef.current[`${node.id}_${newActiveTab.id}`] : null;
                    if (newActiveTab) {
                        paneData.contentType = newActiveTab.contentType;
                        paneData.contentId = newActiveTab.contentId;
                        // Always restore fileContent from virtual data (authoritative) or tab object
                        paneData.fileContent = newActiveVd?.fileContent ?? newActiveTab.fileContent;
                        paneData.fileChanged = newActiveVd?.fileChanged ?? newActiveTab.fileChanged ?? false;
                    }
                    if (newActiveTab?.contentType === 'browser' && newActiveTab.browserUrl) {
                        paneData.browserUrl = newActiveTab.browserUrl;
                        paneData.browserTitle = newActiveTab.browserTitle || 'Browser';
                    }
                    // Restore chat state for chat tabs
                    if (newActiveTab?.contentType === 'chat') {
                        paneData.chatMessages = newActiveTab.chatMessages;
                        paneData.executionMode = newActiveTab.executionMode;
                        paneData.selectedJinx = newActiveTab.selectedJinx;
                        paneData.chatStats = newActiveTab.chatStats;
                    }
                    // If only one tab left, transition back to single-tab mode
                    // Copy virtual data back to real pane so the editor can use node.id
                    if (newTabs.length === 1) {
                        const lastTab = newTabs[0];
                        const lastVd = contentDataRef.current[`${node.id}_${lastTab.id}`];
                        if (lastVd) {
                            if (lastVd.fileContent !== undefined) paneData.fileContent = lastVd.fileContent;
                            if (lastVd.fileChanged !== undefined) paneData.fileChanged = lastVd.fileChanged;
                            if (lastVd._editorStateJSON) paneData._editorStateJSON = lastVd._editorStateJSON;
                            if (lastVd._cursorPos !== undefined) paneData._cursorPos = lastVd._cursorPos;
                            if (lastVd._scrollTopPos !== undefined) paneData._scrollTopPos = lastVd._scrollTopPos;
                        } else {
                            // Virtual data missing — sync from tab object
                            paneData.fileContent = lastTab.fileContent;
                            paneData.fileChanged = lastTab.fileChanged ?? false;
                            if (lastTab._scrollTopPos !== undefined) paneData._scrollTopPos = lastTab._scrollTopPos;
                        }
                        delete contentDataRef.current[`${node.id}_${lastTab.id}`];
                    }
                    setRootLayoutNode?.(prev => ({ ...prev }));
                }
            }
        };

        const handleTabReorder = (fromIndex: number, toIndex: number) => {
            if (paneData && tabs.length > 0) {
                // Save current tab state before reordering
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    if (tabs[currentTabIndex].contentType === 'browser' && paneData.browserUrl) {
                        tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                    }
                    if (tabs[currentTabIndex].contentType === 'editor' || tabs[currentTabIndex].contentType === 'latex') {
                        const reorderVd = contentDataRef.current[`${node.id}_${tabs[currentTabIndex].id}`];
                        tabs[currentTabIndex].fileContent = reorderVd?.fileContent ?? paneData.fileContent;
                        tabs[currentTabIndex].fileChanged = reorderVd?.fileChanged ?? paneData.fileChanged;
                    }
                    if (tabs[currentTabIndex].contentType === 'chat') {
                        tabs[currentTabIndex].chatMessages = paneData.chatMessages;
                        tabs[currentTabIndex].executionMode = paneData.executionMode;
                        tabs[currentTabIndex].selectedJinx = paneData.selectedJinx;
                        tabs[currentTabIndex].chatStats = paneData.chatStats;
                    }
                }

                const newTabs = [...tabs];
                const [movedTab] = newTabs.splice(fromIndex, 1);
                newTabs.splice(toIndex, 0, movedTab);
                paneData.tabs = newTabs;
                // Update active index to follow the moved tab if it was active
                if (paneData.activeTabIndex === fromIndex) {
                    paneData.activeTabIndex = toIndex;
                } else if (fromIndex < paneData.activeTabIndex && toIndex >= paneData.activeTabIndex) {
                    paneData.activeTabIndex--;
                } else if (fromIndex > paneData.activeTabIndex && toIndex <= paneData.activeTabIndex) {
                    paneData.activeTabIndex++;
                }
                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        // Handler for adding new tabs from the + button
        const handleAddTab = (contentType: string) => {
            if (paneData) {
                // Initialize tabs if needed (convert current content to first tab)
                if (!paneData.tabs || paneData.tabs.length === 0) {
                    if (paneData.contentType) {
                        paneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: paneData.contentType,
                            contentId: paneData.contentId,
                            fileContent: paneData.fileContent,
                            fileChanged: paneData.fileChanged,
                            isUntitled: paneData.isUntitled,
                            _scrollTopPos: paneData._scrollTopPos,
                            _editorStateJSON: paneData._editorStateJSON,
                            _cursorPos: paneData._cursorPos,
                            title: getFileName(paneData.contentId) || paneData.contentType
                        }];
                    } else {
                        paneData.tabs = [];
                    }
                    paneData.activeTabIndex = 0;
                }

                // Create new tab based on content type
                const newTabId = `tab_${Date.now()}_${paneData.tabs.length}`;
                let newContentId = null;
                let title = contentType;
                let extraChatProps: any = {};

                if (contentType === 'chat') {
                    newContentId = `conv_${Date.now()}`;
                    title = 'New Chat';
                    // Initialize chat state immediately so it doesn't show "No messages"
                    const savedMode = localStorage.getItem('incognideExecutionMode');
                    extraChatProps = {
                        chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 },
                        executionMode: savedMode ? JSON.parse(savedMode) : 'chat',
                        selectedJinx: null,
                        chatStats: { messageCount: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() },
                    };
                } else if (contentType === 'terminal') {
                    newContentId = `term_${Date.now()}`;
                    title = 'Terminal';
                } else if (contentType === 'browser') {
                    newContentId = 'https://google.com';
                    title = 'Browser';
                } else if (contentType === 'library') {
                    newContentId = 'library';
                    title = 'Library';
                } else if (contentType === 'python') {
                    newContentId = `python_${Date.now()}`;
                    title = 'Python';
                } else if (contentType === 'notebook') {
                    newContentId = `notebook_${Date.now()}`;
                    title = 'Notebook';
                }

                const newTab = {
                    id: newTabId,
                    contentType,
                    contentId: newContentId,
                    title,
                    ...extraChatProps,
                };

                paneData.tabs.push(newTab);
                paneData.activeTabIndex = paneData.tabs.length - 1;

                // Also update main paneData to reflect active tab
                paneData.contentType = contentType;
                paneData.contentId = newContentId;
                // Apply chat state to pane data
                if (extraChatProps.chatMessages) {
                    paneData.chatMessages = extraChatProps.chatMessages;
                    paneData.executionMode = extraChatProps.executionMode;
                    paneData.selectedJinx = extraChatProps.selectedJinx;
                    paneData.chatStats = extraChatProps.chatStats;
                }

                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        let headerIcon = <FileIcon size={14} className="text-gray-400" />;
        let headerTitle = contentType || 'Pane';

        if (contentType === 'chat') {
            headerIcon = <MessageSquare size={14} className="text-blue-400" />;
            headerTitle = 'Chat';
        } else if (contentType === 'editor' && contentId) {
            headerIcon = getFileIcon(contentId);
            headerTitle = getFileName(contentId);
        } else if (contentType === 'editor' && !contentId) {
            headerIcon = <FileIcon size={14} className="text-gray-400" />;
            headerTitle = 'Untitled';
        } else if (contentType === 'browser') {
            headerIcon = <Globe size={14} className="text-blue-400" />;
            headerTitle = paneData.browserTitle || paneData.browserUrl || 'Web Browser';
        } else if (contentType === 'terminal') {
            headerIcon = <Terminal size={14} className="text-green-400" />;
            headerTitle = 'Terminal';
        } else if (contentType === 'image') {
            headerIcon = <ImageIcon size={14} className="text-purple-400" />;
            headerTitle = getFileName(contentId) || 'Image Viewer';
        } else if (contentType === 'stl') {
            headerIcon = <Box size={14} className="text-cyan-400" />;
            headerTitle = getFileName(contentId) || 'STL Viewer';
        } else if (contentType === 'folder') {
            headerIcon = <Folder size={14} className="text-yellow-400" />;
            headerTitle = getFileName(contentId) || 'Folder';
        } else if (contentType === 'dbtool') {
            headerIcon = <Database size={14} className="text-cyan-400" />;
            headerTitle = 'Database Tool';
        } else if (contentType === 'jinx') {
            headerIcon = <Zap size={14} className="text-yellow-400" />;
            headerTitle = 'Jinx Manager';
        } else if (contentType === 'npcteam') {
            headerIcon = <Bot size={14} className="text-purple-400" />;
            headerTitle = 'NPC Team';
        } else if (contentType === 'teammanagement') {
            headerIcon = <Users size={14} className="text-indigo-400" />;
            headerTitle = 'Team Management';
        } else if (contentType === 'settings') {
            headerIcon = <Settings size={14} className="text-gray-400" />;
            headerTitle = 'Settings';
        } else if (contentType === 'photoviewer') {
            headerIcon = <Images size={14} className="text-pink-400" />;
            headerTitle = 'Vixynt';
        } else if (contentType === 'scherzo') {
            headerIcon = <Music size={14} className="text-purple-400" />;
            headerTitle = 'Scherzo';
        } else if (contentType === 'library') {
            headerIcon = <BookOpen size={14} className="text-amber-400" />;
            headerTitle = 'Library';
        } else if (contentType === 'help') {
            headerIcon = <HelpCircle size={14} className="text-blue-400" />;
            headerTitle = 'Help';
        } else if (contentType === 'git') {
            headerIcon = <GitBranch size={14} className="text-purple-400" />;
            headerTitle = 'Git';
        } else if (contentType === 'projectenv') {
            headerIcon = <FolderCog size={14} className="text-orange-400" />;
            headerTitle = 'Project Environment';
        } else if (contentType === 'diskusage') {
            headerIcon = <HardDrive size={14} className="text-slate-400" />;
            headerTitle = 'Disk Usage';
        } else if (contentType === 'data-labeler') {
            headerIcon = <Tags size={14} className="text-teal-400" />;
            headerTitle = 'Data Labeler';
        } else if (contentType === 'graph-viewer') {
            headerIcon = <Network size={14} className="text-violet-400" />;
            headerTitle = 'Graph Viewer';
        } else if (contentType === 'browsergraph') {
            headerIcon = <Share2 size={14} className="text-sky-400" />;
            headerTitle = 'Browser Graph';
        } else if (contentType === 'datadash') {
            headerIcon = <LayoutDashboard size={14} className="text-emerald-400" />;
            headerTitle = 'Data Dashboard';
        } else if (contentType === 'mindmap') {
            headerIcon = <Brain size={14} className="text-rose-400" />;
            headerTitle = 'Map Document';
        } else if (contentType === 'markdown-preview') {
            headerIcon = <FileIcon size={14} className="text-blue-400" />;
            headerTitle = `Preview: ${getFileName(contentId) || 'Markdown'}`;
        } else if (contentType === 'html-preview') {
            headerIcon = <Globe size={14} className="text-orange-400" />;
            headerTitle = `Preview: ${getFileName(contentId) || 'HTML'}`;
        } else if (contentType === 'pdf') {
            headerIcon = <FileIcon size={14} className="text-red-400" />;
            headerTitle = getFileName(contentId) || 'PDF Viewer';
        } else if (contentType === 'csv') {
            headerIcon = <Table size={14} className="text-green-400" />;
            headerTitle = getFileName(contentId) || 'CSV Viewer';
        } else if (contentType === 'latex') {
            headerIcon = <FileIcon size={14} className="text-teal-400" />;
            headerTitle = getFileName(contentId) || 'LaTeX Editor';
        } else if (contentType === 'docx') {
            headerIcon = <FileIcon size={14} className="text-blue-500" />;
            headerTitle = getFileName(contentId) || 'Document';
        } else if (contentType === 'pptx') {
            headerIcon = <FileIcon size={14} className="text-orange-500" />;
            headerTitle = getFileName(contentId) || 'Presentation';
        } else if (contentType === 'zip') {
            headerIcon = <FileIcon size={14} className="text-yellow-500" />;
            headerTitle = getFileName(contentId) || 'Archive';
        } else if (contentType === 'exp') {
            headerIcon = <FlaskConical size={14} className="text-purple-400" />;
            headerTitle = getFileName(contentId) || 'Experiment';
        } else if (contentType === 'tilejinx') {
            headerIcon = <Zap size={14} className="text-amber-400" />;
            headerTitle = contentId?.replace('.jinx', '') || 'Tile';
        } else if (contentType === 'branches') {
            headerIcon = <GitBranch size={14} className="text-purple-400" />;
            headerTitle = 'Branch Comparison';
        } else if (contentType === 'diff') {
            headerIcon = <GitBranch size={14} className="text-orange-400" />;
            headerTitle = `Diff: ${getFileName(contentId) || 'File'}`;
        } else if (contentId) {
            headerIcon = getFileIcon(contentId);
            headerTitle = getFileName(contentId);
        }

        // Conditionally construct children for PaneHeader (type-specific buttons)
        let paneHeaderChildren = null;
        // Custom header content for panes that need full header customization
        let headerContent = null;

        // Markdown preview button for .md files
        const isMarkdownFile = contentType === 'editor' && contentId?.toLowerCase().endsWith('.md');
        // HTML preview button for .html/.htm files
        const isHtmlFile = contentType === 'editor' && (contentId?.toLowerCase().endsWith('.html') || contentId?.toLowerCase().endsWith('.htm'));

        // Editor pane buttons (copy, save, and optionally preview)
        if (contentType === 'editor') {
            const handleCopyFile = () => {
                const content = paneData?.fileContent || '';
                navigator.clipboard.writeText(content);
            };

            paneHeaderChildren = (
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleCopyFile(); }}
                        className="p-1 rounded text-xs theme-button theme-hover"
                        title="Copy file contents"
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (paneData?.onSave) paneData.onSave();
                        }}
                        className="p-1 rounded text-xs theme-button theme-hover"
                        title="Save file (Ctrl+S)"
                    >
                        <Save size={12} />
                    </button>
                    {isMarkdownFile && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const nodePath = findNodePath(rootLayoutNode, node.id);
                                if (nodePath) {
                                    performSplit(nodePath, 'right', 'markdown-preview', contentId);
                                }
                            }}
                            className="p-1 rounded text-xs theme-button theme-hover"
                            title="Preview Markdown"
                        >
                            <Play size={12} />
                        </button>
                    )}
                    {isHtmlFile && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const nodePath = findNodePath(rootLayoutNode, node.id);
                                if (nodePath) {
                                    performSplit(nodePath, 'right', 'html-preview', contentId);
                                }
                            }}
                            className="p-1 rounded text-xs theme-button theme-hover"
                            title="Preview HTML"
                        >
                            <Play size={12} />
                        </button>
                    )}
                </div>
            );
        }

        // Terminal pane settings button
        if (contentType === 'terminal') {
            paneHeaderChildren = (
                <button
                    onClick={(e) => { e.stopPropagation(); paneData?.toggleSettings?.(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 rounded text-xs theme-button theme-hover"
                    title="Terminal Settings"
                    style={{ flexShrink: 0 }}
                >
                    <Settings size={12} />
                </button>
            );
        }

        // Image pane toolbar buttons (zoom, rotate, fit, reset, download)
        if (contentType === 'image') {
            paneHeaderChildren = (
                <div className="flex items-center gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); paneData?.zoomOut?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Zoom Out"><ZoomOut size={12} /></button>
                    <span className="text-[10px] theme-text-muted min-w-[32px] text-center">{Math.round((paneData?.scale || 1) * 100)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); paneData?.zoomIn?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Zoom In"><ZoomIn size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); paneData?.rotate?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Rotate 90°"><RotateCw size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); paneData?.fitToScreen?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Fit to Screen"><Maximize2 size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); paneData?.resetView?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Reset View"><RefreshCw size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); paneData?.download?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Download"><Download size={12} /></button>
                </div>
            );
        }

        // STL 3D viewer pane toolbar buttons
        if (contentType === 'stl') {
            // Read methods from contentDataRef directly at click time to avoid stale closures
            const getStlPane = () => contentDataRef.current[node.id];
            paneHeaderChildren = (
                <div className="flex items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.toggleWireframe?.(); }} className={`p-1 rounded text-xs theme-button theme-hover ${paneData?.wireframe ? 'text-blue-400' : ''}`} title="Toggle Wireframe"><Grid3X3 size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.toggleAxes?.(); }} className={`p-1 rounded text-xs theme-button theme-hover ${paneData?.showAxes ? 'text-blue-400' : ''}`} title="Toggle Axes">{paneData?.showAxes ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.toggleGrid?.(); }} className={`p-1 rounded text-xs theme-button theme-hover ${paneData?.showGrid ? 'text-blue-400' : ''}`} title="Toggle Grid"><LayoutDashboard size={12} /></button>
                    <div className="w-px h-3 theme-border mx-0.5" />
                    <input
                        type="range" min="0.1" max="1" step="0.05"
                        value={paneData?.opacity ?? 1}
                        onChange={(e) => { e.stopPropagation(); getStlPane()?.setOpacity?.(parseFloat(e.target.value)); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-12 h-3 accent-cyan-400 cursor-pointer"
                        title={`Opacity: ${Math.round((paneData?.opacity ?? 1) * 100)}%`}
                    />
                    <div className="w-px h-3 theme-border mx-0.5" />
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.viewAxis?.('x'); }} className="p-1 rounded text-xs font-bold theme-button theme-hover" style={{ color: '#ef4444' }} title="View X">X</button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.viewAxis?.('y'); }} className="p-1 rounded text-xs font-bold theme-button theme-hover" style={{ color: '#22c55e' }} title="View Y">Y</button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.viewAxis?.('z'); }} className="p-1 rounded text-xs font-bold theme-button theme-hover" style={{ color: '#3b82f6' }} title="View Z">Z</button>
                    <div className="w-px h-3 theme-border mx-0.5" />
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.resetCamera?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Reset Camera"><RotateCcw size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); getStlPane()?.takeScreenshot?.(); }} className="p-1 rounded text-xs theme-button theme-hover" title="Screenshot"><Download size={12} /></button>
                </div>
            );
        }

        // LaTeX pane — no paneHeaderChildren needed, toolbar is integrated in LatexViewer

        // Chat pane uses custom header content
        if (contentType === 'chat') {
            const chatStats = paneData?.chatStats || { messageCount: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() };
            headerContent = (
                <ChatHeaderContent
                    icon={headerIcon}
                    title={headerTitle}
                    chatStats={chatStats}
                    autoScrollEnabled={autoScrollEnabled}
                    setAutoScrollEnabled={setAutoScrollEnabled}
                    messageSelectionMode={messageSelectionMode}
                    toggleMessageSelectionMode={toggleMessageSelectionMode}
                    selectedMessages={selectedMessages}
                    showBranchingUI={showBranchingUI}
                    setShowBranchingUI={setShowBranchingUI}
                    topBarCollapsed={topBarCollapsed}
                    onExpandTopBar={onExpandTopBar}
                    conversationBranches={conversationBranches}
                />
            );
        }
// DUPLICATE/CONFLICTING DECLARATION COMMENTED OUT - closeContentPane is expected to be passed via props
// const closeContentPane = useCallback((paneId, nodePath) => { ... }, [activeContentPaneId, findNodeByPath,rootLayoutNode]);

        // Auto-scroll ref and effect for chat pane
        const chatScrollRef = useRef<HTMLDivElement>(null);
        const chatMessages = paneData?.chatMessages?.messages || [];
        const lastMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
        const lastMessageContent = lastMessage?.content || '';
        const lastMessageReasoning = lastMessage?.reasoningContent || '';

        useEffect(() => {
            if (autoScrollEnabled && chatScrollRef.current && contentType === 'chat') {
                chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
        }, [chatMessages.length, lastMessageContent, lastMessageReasoning, autoScrollEnabled, contentType]);

        // For multi-tab panes, ensure each tab has its own virtual pane entry for persistent rendering
        // This allows browsers/terminals to stay mounted when switching tabs
        if (tabs.length > 1) {
            tabs.forEach((tab, index) => {
                const virtualId = `${node.id}_${tab.id}`;
                const isActiveTab = index === activeTabIndex;
                const existingVd = contentDataRef.current[virtualId];
                // Create virtual pane data for this tab if it doesn't exist yet,
                // or if the contentId changed (e.g., file was renamed/saved-as)
                if (!existingVd || existingVd.contentId !== tab.contentId || existingVd.isUntitled !== tab.isUntitled) {
                    contentDataRef.current[virtualId] = {
                        contentType: tab.contentType,
                        contentId: tab.contentId,
                        browserUrl: tab.browserUrl,
                        browserTitle: tab.browserTitle,
                        fileContent: tab.fileContent,
                        fileChanged: tab.fileChanged,
                        isUntitled: tab.isUntitled,
                        _editorStateJSON: tab._editorStateJSON,
                        _cursorPos: tab._cursorPos,
                        _scrollTopPos: tab._scrollTopPos,
                        chatMessages: tab.chatMessages,
                        executionMode: tab.executionMode,
                        selectedJinx: tab.selectedJinx,
                        chatStats: tab.chatStats,
                    };
                }
                const vd = contentDataRef.current[virtualId];
                // Sync file content when virtual data hasn't been populated yet
                // (handles async file load timing — virtual data created before readFileContent resolves)
                if (vd && (vd.fileContent === undefined || vd.fileContent === null)) {
                    const src = tab.fileContent ?? (isActiveTab ? paneData?.fileContent : undefined);
                    if (src !== undefined && src !== null) {
                        vd.fileContent = src;
                    }
                }
                // Reverse sync: keep tab object updated from virtual data (authoritative)
                // so handleTabSelect always has fresh content when restoring a tab
                if (vd && vd.fileContent !== undefined && vd.fileContent !== null) {
                    tab.fileContent = vd.fileContent;
                    tab.fileChanged = vd.fileChanged;
                }
                // Also sync editor state if not yet set (e.g., transitioning from single to multi-tab)
                if (vd && vd._editorStateJSON === undefined && tab._editorStateJSON) {
                    vd._editorStateJSON = tab._editorStateJSON;
                    vd._cursorPos = tab._cursorPos;
                    vd._scrollTopPos = tab._scrollTopPos;
                }
                // Reverse sync scroll position from virtual data to tab
                if (vd && vd._scrollTopPos !== undefined) {
                    tab._scrollTopPos = vd._scrollTopPos;
                }
                // For the active tab, keep chat state synced from the real pane data
                // (updateContentPane sets chat props on paneData, not on the tab object)
                if (isActiveTab && vd) {
                    vd.chatMessages = paneData?.chatMessages;
                    vd.executionMode = paneData?.executionMode;
                    vd.selectedJinx = paneData?.selectedJinx;
                    vd.chatStats = paneData?.chatStats;
                }
            });
        }

        // Render content for a specific tab (used for multi-tab persistent rendering)
        const renderTabContent = (tab: any, tabIndex: number) => {
            const virtualId = `${node.id}_${tab.id}`;
            const tabContentType = tab.contentType;
            const isActiveTab = tabIndex === activeTabIndex;

            // Special case: chat needs ChatInput wrapper and uses real pane ID for active tab
            if (tabContentType === 'chat') {
                if (isActiveTab) {
                    return (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                                {paneRenderers.chat?.({ nodeId: node.id })}
                            </div>
                            {chatInputProps && (
                                <ChatInput
                                    {...chatInputProps}
                                    paneId={node.id}
                                    onFocus={() => setActiveContentPaneId(node.id)}
                                />
                            )}
                        </div>
                    );
                }
                // Inactive chat tab: minimal placeholder (it's hidden anyway)
                return <div />;
            }

            // Special case: browser needs extra props
            if (tabContentType === 'browser') {
                return paneRenderers.browser?.({
                    nodeId: virtualId,
                    hasTabBar: showTabBar,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id
                });
            }

            // Use registry for all other tab types
            const renderer = paneRenderers[tabContentType];
            return renderer ? renderer({
                nodeId: virtualId,
                onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                isZenMode: zenModePaneId === node.id,
                onClose: () => {
                    const tabs = paneData?.tabs;
                    if (tabs && tabs.length > 1) {
                        handleTabClose(paneData.activeTabIndex || 0);
                    } else {
                        closeContentPane(node.id, path);
                    }
                },
                renamingPaneId,
                setRenamingPaneId,
                editedFileName,
                setEditedFileName,
                handleConfirmRename,
            }) : null;
        };

        const renderPaneContent = () => {
            // Special cases that need extra handling
            if (contentType === 'chat') {
                return (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                            {paneRenderers.chat?.({ nodeId: node.id })}
                        </div>
                        {chatInputProps && (
                            <ChatInput
                                {...chatInputProps}
                                paneId={node.id}
                                onFocus={() => setActiveContentPaneId(node.id)}
                            />
                        )}
                    </div>
                );
            }
            if (contentType === 'browser') {
                return paneRenderers.browser?.({
                    nodeId: node.id,
                    hasTabBar: showTabBar,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id
                });
            }
            if (contentType === 'search') {
                return paneRenderers.search?.({ nodeId: node.id, initialQuery: paneData?.initialQuery });
            }
            if (contentType === 'python') {
                return paneRenderers.terminal?.({ nodeId: node.id, shell: 'python3' });
            }
            if (contentType === 'diff') {
                return (
                    <DiffViewer
                        filePath={contentId || ''}
                        diffStatus={paneData?.diffStatus}
                        currentPath={currentPath}
                    />
                );
            }
            // Close handler: close active tab if multiple, else close pane
            const handleClose = () => {
                const tabs = paneData?.tabs;
                if (tabs && tabs.length > 1) {
                    handleTabClose(paneData.activeTabIndex || 0);
                } else {
                    closeContentPane(node.id, path);
                }
            };

            if (contentType === 'latex') {
                return paneRenderers.latex?.({
                    nodeId: node.id,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id,
                    onClose: handleClose,
                    renamingPaneId,
                    setRenamingPaneId,
                    editedFileName,
                    setEditedFileName,
                    handleConfirmRename,
                });
            }

            // Registry lookup for all standard pane types
            // Pass rename + zen props so custom-toolbar panes (docx, csv, pptx) can use them
            const renderer = paneRenderers[contentType];
            return renderer ? renderer({
                nodeId: node.id,
                onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                isZenMode: zenModePaneId === node.id,
                onClose: handleClose,
                renamingPaneId,
                setRenamingPaneId,
                editedFileName,
                setEditedFileName,
                handleConfirmRename,
            }) : null;
        };

        return (
            <div
                className={`flex-1 flex flex-col border ${isActive ? 'border-blue-500 ring-1 ring-blue-500' : 'theme-border'}`}
                style={{ position: 'relative', overflow: 'hidden' }}
                data-pane-id={node.id}
                data-pane-type={contentType}
                onClick={() => componentRef.current.setActiveContentPaneId(node.id)}
                onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setLocalDragOver(true); }}
                onDragLeave={(e) => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); } }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, localDropSide || 'center'); }}
            >
                {/* Tab bar - shows when there are multiple tabs */}
                {showTabBar && (
                    <PaneTabBar
                        tabs={tabs}
                        activeTabIndex={activeTabIndex}
                        onTabSelect={handleTabSelect}
                        onTabClose={handleTabClose}
                        onTabReorder={handleTabReorder}
                        nodeId={node.id}
                        onToggleZen={contentType === 'browser' && toggleZenMode ? () => toggleZenMode(node.id) : undefined}
                        isZenMode={contentType === 'browser' ? zenModePaneId === node.id : undefined}
                        onClosePane={contentType === 'browser' ? () => closeContentPane(node.id, path) : undefined}
                        onTabAdd={contentType === 'browser' && component.handleNewBrowserTab ? () => componentRef.current.handleNewBrowserTab('', node.id) : undefined}
                        setDraggedItem={setDraggedItem}
                        findNodePath={findNodePath}
                        rootLayoutNode={rootLayoutNode}
                        contentDataRef={contentDataRef}
                        nodePath={path}
                    />
                )}

                {/* Header - PaneHeader includes expand and close buttons */}
                {/* Skip PaneHeader for browser, docx, pptx, csv, latex - they have their own integrated toolbars */}
                {contentType !== 'browser' && contentType !== 'docx' && contentType !== 'pptx' && contentType !== 'csv' && contentType !== 'latex' && (
                    <PaneHeader
                        nodeId={node.id}
                        icon={headerIcon}
                        title={headerTitle}
                        // Custom header content for panes that override the default
                        headerContent={headerContent}
                        findNodePath={findNodePath}
                        rootLayoutNode={rootLayoutNode}
                        setDraggedItem={setDraggedItem}
                        setPaneContextMenu={setPaneContextMenu}
                        fileChanged={paneData?.fileChanged || activeTab?.fileChanged}
                        onSave={() => { if (paneData?.onSave) paneData.onSave(); }}
                        onStartRename={() => {
                            setRenamingPaneId(node.id);
                            setEditedFileName(getFileName(contentId) || headerTitle || '');
                        }}
                        // Renaming props
                        isRenaming={renamingPaneId === node.id}
                        editedFileName={editedFileName}
                        setEditedFileName={setEditedFileName}
                        onConfirmRename={() => handleConfirmRename?.(node.id, contentId)}
                        onCancelRename={() => setRenamingPaneId(null)}
                        filePath={contentId}
                        onRunScript={onRunScript}
                        // Close and zen mode props — close active tab if multiple, else close pane
                        onClose={() => {
                            const tabs = paneData?.tabs;
                            if (tabs && tabs.length > 1) {
                                handleTabClose(paneData.activeTabIndex || 0);
                            } else {
                                closeContentPane(node.id, path);
                            }
                        }}
                        onToggleZen={toggleZenMode ? () => toggleZenMode(node.id) : null}
                        isZenMode={zenModePaneId === node.id}
                        // Tab management
                        onAddTab={handleAddTab}
                        // Top bar collapse
                        topBarCollapsed={topBarCollapsed}
                        onExpandTopBar={onExpandTopBar}
                        // Pane locking
                        panesLocked={lockedPanes.has(node.id)}
                        onTogglePanesLocked={() => togglePaneLocked(node.id)}
                    >
                        {paneHeaderChildren} {/* Pass the conditional children here */}
                    </PaneHeader>
                )}
                {/* Browser handles its own header with zen/close buttons inside WebBrowserViewer */}


                {localDragOver && !lockedPanes.has(node.id) && (
                    <>
                        {/* Center drop zone - explicit zone for adding as tab */}
                        <div
                            className={`absolute left-1/4 right-1/4 top-1/4 bottom-1/4 z-[20] ${localDropSide === 'center' ? 'bg-green-500/30 border-2 border-dashed border-green-400' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLocalDropSide('center'); }}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, 'center'); }}
                        />
                        <div className={`absolute left-0 top-0 bottom-0 w-1/4 z-[20] ${localDropSide === 'left' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLocalDropSide('left'); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, 'left'); }} />
                        <div className={`absolute right-0 top-0 bottom-0 w-1/4 z-[20] ${localDropSide === 'right' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLocalDropSide('right'); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, 'right'); }} />
                        <div className={`absolute left-0 top-0 right-0 h-1/4 z-[20] ${localDropSide === 'top' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLocalDropSide('top'); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, 'top'); }} />
                        <div className={`absolute left-0 bottom-0 right-0 h-1/4 z-[20] ${localDropSide === 'bottom' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLocalDropSide('bottom'); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, 'bottom'); }} />
                    </>
                )}
                {/* Render content - for multi-tab panes, render ALL tabs to keep them mounted with individual state */}
                {tabs.length > 1 ? (
                    // Multi-tab: render all tabs, hide inactive ones — each gets its own virtualId
                    tabs.map((tab, index) => (
                        <div
                            key={tab.id}
                            className="flex-1 flex flex-col min-h-0"
                            style={{ display: index === activeTabIndex ? 'flex' : 'none' }}
                        >
                            {renderTabContent(tab, index) || renderPaneContent()}
                        </div>
                    ))
                ) : (
                    // Single tab: render normally
                    renderPaneContent()
                )}
            </div>
        );
    }
    return null;
}, (prev, next) => prev.node === next.node && prev.contentVersion === next.contentVersion);



// DUPLICATE REMOVED - syncLayoutWithContentData is now exported at the top of the file
// const syncLayoutWithContentData = useCallback((layoutNode, contentData) => { ... }, []);

/*
// CODE FRAGMENTS BELOW - More incomplete code using hooks at module level
// These reference parent scope variables and can't work as standalone exports
// Commenting out to prevent hook errors

    const updateContentPane = useCallback(async (paneId, newContentType, newContentId, skipMessageLoad = false) => {
  // Verify this paneId exists in the layout tree
  const paneExistsInLayout = (node, targetId) => {
    if (!node) return false;
    if (node.type === 'content' && node.id === targetId) return true;
    if (node.type === 'split') {
      return node.children.some(child => paneExistsInLayout(child, targetId));
    }
    return false;
  };

  if (!paneExistsInLayout(rootLayoutNodeRef.current, paneId)) {
    console.warn(`[updateContentPane] Pane ${paneId} not found in layout tree yet, waiting...`);
    // Don't abort - the layout update might be pending
  }

  if (!contentDataRef.current[paneId]) {
    contentDataRef.current[paneId] = {};
  }
  const paneData = contentDataRef.current[paneId];

  paneData.contentType = newContentType;
  paneData.contentId = newContentId;

  if (newContentType === 'editor') {
    try {
      const response = await window.api.readFileContent(newContentId);
      paneData.fileContent = response.error ? `Error: ${response.error}` : response.content;
      paneData.fileChanged = false;
    } catch (err) {
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

    if (skipMessageLoad) {
      paneData.chatMessages.messages = [];
      paneData.chatMessages.allMessages = [];
      paneData.chatStats = getConversationStats([]);
    } else {
      try {
        const msgs = await window.api.getConversationMessages(newContentId);
        const parseMaybeJson = (val) => {
          if (!val || typeof val !== 'string') return val;
          try { return JSON.parse(val); } catch { return val; }
        };
        const formatted = [];
        let lastAssistant = null;
        if (msgs && Array.isArray(msgs)) {
          msgs.forEach(raw => {
            const msg = { ...raw, id: raw.id || generateId() };
            msg.content = parseMaybeJson(msg.content);
            if (msg.role === 'assistant') {
              if (!Array.isArray(msg.toolCalls)) msg.toolCalls = [];
              // If content is a tool_call wrapper, normalize into toolCalls list
              if (msg.content && typeof msg.content === 'object' && msg.content.tool_call) {
                const tc = msg.content.tool_call;
                msg.toolCalls.push({
                  id: tc.id || tc.tool_call_id || generateId(),
                  function: { name: tc.function_name || tc.name || 'tool', arguments: tc.arguments || '' }
                });
                msg.content = '';
              }
              // Reconstruct contentParts for assistant messages with tool calls from DB
              if (msg.toolCalls && msg.toolCalls.length > 0) {
                const contentParts: any[] = [];
                if (msg.content) {
                  contentParts.push({ type: 'text', content: msg.content });
                }
                msg.toolCalls.forEach((tc: any) => {
                  contentParts.push({
                    type: 'tool_call',
                    call: {
                      id: tc.id,
                      function_name: tc.function_name || tc.function?.name,
                      arguments: tc.arguments || tc.function?.arguments,
                      status: 'complete'
                    }
                  });
                });
                msg.contentParts = contentParts;
              }
              formatted.push(msg);
              lastAssistant = msg;
            } else if (msg.role === 'tool') {
              const toolPayload = msg.content && typeof msg.content === 'object' ? msg.content : { content: msg.content };
              const tcId = toolPayload.tool_call_id || generateId();
              const tcName = toolPayload.tool_name || 'tool';
              const tcContent = toolPayload.content !== undefined ? toolPayload.content : msg.content;
              if (lastAssistant) {
                if (!Array.isArray(lastAssistant.toolCalls)) lastAssistant.toolCalls = [];
                lastAssistant.toolCalls.push({
                  id: tcId,
                  function: { name: tcName, arguments: toolPayload.arguments || '' },
                  result_preview: typeof tcContent === 'string' ? tcContent : JSON.stringify(tcContent)
                });
              } else {
                formatted.push({
                  id: generateId(),
                  role: 'assistant',
                  content: '',
                  toolCalls: [{
                    id: tcId,
                    function: { name: tcName, arguments: toolPayload.arguments || '' },
                    result_preview: typeof tcContent === 'string' ? tcContent : JSON.stringify(tcContent)
                  }]
                });
                lastAssistant = formatted[formatted.length - 1];
              }
            } else {
              formatted.push(msg);
            }
          });
        }

        paneData.chatMessages.allMessages = formatted;
        const count = paneData.chatMessages.displayedMessageCount || 20;
        paneData.chatMessages.messages = formatted.slice(-count);
        paneData.chatStats = getConversationStats(formatted);
      } catch (err) {
        paneData.chatMessages.messages = [];
        paneData.chatMessages.allMessages = [];
        paneData.chatStats = getConversationStats([]);
      }
    }
  } else if (newContentType === 'terminal') {
    paneData.chatMessages = null;
    paneData.fileContent = null;
  } else if (newContentType === 'pdf') {
    paneData.chatMessages = null;
    paneData.fileContent = null;
  }

  setRootLayoutNode(oldRoot => {
    const syncedRoot = syncLayoutWithContentData(oldRoot, contentDataRef.current);
    return syncedRoot;
  });
}, [syncLayoutWithContentData]);


    const findNodeByPath = useCallback((node, path) => {
        if (!node || !path) return null;
        let currentNode = node;
        for (const index of path) {
            if (currentNode && currentNode.children && currentNode.children[index]) {
                currentNode = currentNode.children[index];
            } else {
                return null;
            }
        }
        return currentNode;
    }, []);

    const findNodePath = useCallback((node, id, currentPath = []) => {
        if (!node) return null;
        if (node.id === id) return currentPath;
        if (node.type === 'split') {
            for (let i = 0; i < node.children.length; i++) {
                const result = findNodePath(node.children[i], id, [...currentPath, i]);
                if (result) return result;
            }
        }
        return null;
    }, []);



    const performSplit = useCallback((targetNodePath, side, newContentType, newContentId) => {
        setRootLayoutNode(oldRoot => {
            if (!oldRoot) return oldRoot;
    
            const newRoot = JSON.parse(JSON.stringify(oldRoot));
            let parentNode = null;
            let targetNode = newRoot;
            let targetIndexInParent = -1;
    
            for (let i = 0; i < targetNodePath.length; i++) {
                parentNode = targetNode;
                targetIndexInParent = targetNodePath[i];
                targetNode = targetNode.children[targetIndexInParent];
            }
    
            const newPaneId = generateId();
            const newPaneNode = { id: newPaneId, type: 'content' };
    
            contentDataRef.current[newPaneId] = {};
            updateContentPane(newPaneId, newContentType, newContentId);
    
            const isHorizontalSplit = side === 'left' || side === 'right';
            const newSplitNode = {
                id: generateId(),
                type: 'split',
                direction: isHorizontalSplit ? 'horizontal' : 'vertical',
                children: [],
                sizes: [50, 50]
            };
    
            if (side === 'left' || side === 'top') {
                newSplitNode.children = [newPaneNode, targetNode];
            } else {
                newSplitNode.children = [targetNode, newPaneNode];
            }
    
            if (parentNode) {
                parentNode.children[targetIndexInParent] = newSplitNode;
            } else {
                return newSplitNode;
            }
    
            setActiveContentPaneId(newPaneId);
            return newRoot;
        });
    }, [updateContentPane]);

*/

// End of commented-out fragments with hooks
// LayoutNode component export is at line 137