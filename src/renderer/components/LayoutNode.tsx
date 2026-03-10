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

const generateLayoutId = () => `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const forceFullRerender = (root: any): any => {
    if (!root) return null;
    return {
        ...root,
        children: root.children ? root.children.map(forceFullRerender) : undefined,
        sizes: root.sizes ? [...root.sizes] : undefined,
    };
};

export const collectPaneIds = (node: any): string[] => {
    if (!node) return [];
    if (node.type === 'content') return [node.id];
    if (node.type === 'split') {
        return node.children.flatMap((child: any) => collectPaneIds(child));
    }
    return [];
};

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

export const addPaneToLayout = (oldRoot: any, newPaneId: string): any => {
    if (!oldRoot) {
        return { id: newPaneId, type: 'content' };
    }

    const newPaneNode = { id: newPaneId, type: 'content' };

    if (oldRoot.type === 'split' && oldRoot.direction === 'horizontal') {
        const newChildren = [...oldRoot.children, newPaneNode];
        const newPaneShare = 100 / newChildren.length;
        const scaleFactor = (100 - newPaneShare) / 100;
        const newSizes = oldRoot.sizes.map((s: number) => s * scaleFactor);
        newSizes.push(newPaneShare);
        return { ...oldRoot, children: newChildren, sizes: newSizes };
    }

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

export const syncLayoutWithContentData = (layoutNode: any, contentData: Record<string, any>): any => {
    if (!layoutNode) {
        if (Object.keys(contentData).length > 0) {
            console.log('[SYNC] Layout node is null, clearing contentData.');
            for (const key in contentData) {
                delete contentData[key];
            }
        }
        return null;
    }

    const validContentPaneIds = new Set(
        Object.entries(contentData)
            .filter(([_, data]) => data?.contentType)
            .map(([id]) => id)
    );

    const cleanLayout = (node: any): any => {
        if (!node) return null;
        if (node.type === 'content') {
            if (!validContentPaneIds.has(node.id)) {
                console.warn('[SYNC] Removing pane from layout (no valid content):', node.id);

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

            if (!contentData[id]?.contentType) {
                console.warn('[SYNC] Removing orphaned empty pane from contentData:', id);
                delete contentData[id];
            }
        }
    });

    return cleanedLayout;
};

export const LayoutNode = memo(({ node, path, component: componentRef }) => {

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

                childElements.forEach((el, i) => {
                    if (newSizes[i] !== undefined) {
                        el.style.flexBasis = `${newSizes[i]}%`;
                    }
                });
            };

            const onKeyDown = (keyEvent: KeyboardEvent) => {
                if (keyEvent.key === 'Escape') {
                    keyEvent.preventDefault();

                    childElements.forEach((el, i) => {
                        if (startSizes[i] !== undefined) {
                            el.style.flexBasis = `${startSizes[i]}%`;
                        }
                    });
                    cleanup();
                }
            };

            const onMouseUp = () => {

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

            document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';

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
                            <LayoutNode node={child} path={[...path, index]} component={componentRef} />
                        </div>
                        {index < node.children.length - 1 && (
                            <div
                                className={`flex-shrink-0 relative flex items-center justify-center group ${node.direction === 'horizontal' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}
                                onMouseDown={(e) => handleResize(e, index)}
                                style={{ touchAction: 'none' }}
                            >
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

            autoScrollEnabled, setAutoScrollEnabled,
            messageSelectionMode, toggleMessageSelectionMode, selectedMessages,
            conversationBranches, showBranchingUI, setShowBranchingUI,

            getChatInputProps,

            zenModePaneId, toggleZenMode,

            renamingPaneId, setRenamingPaneId, editedFileName, setEditedFileName, handleConfirmRename,

            onRunScript,

            topBarCollapsed,
            onExpandTopBar,

            currentPath,

            lockedPanes, togglePaneLocked,
        } = component;

        const chatInputProps = getChatInputProps ? getChatInputProps(node.id) : null;

        const [localDragOver, setLocalDragOver] = useState(false);
        const [localDropSide, setLocalDropSide] = useState<string | null>(null);
        const dragCounterRef = useRef(0);

        const onDrop = (e, side) => {
            e.preventDefault();
            e.stopPropagation();
            const comp = componentRef.current;
            if (!comp.draggedItem) return;

            if (comp.draggedItem.type === 'pane') {
                if (comp.draggedItem.id === node.id) return;

                if (side === 'center') {
                    const sourcePaneData = contentDataRef.current[comp.draggedItem.id];
                    const targetPaneData = contentDataRef.current[node.id];

                    if (sourcePaneData?.contentType && targetPaneData) {

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

                        if (sourcePaneData.tabs && sourcePaneData.tabs.length > 0) {

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

                        targetPaneData.activeTabIndex = targetPaneData.tabs.length - 1;
                        const activeTab = targetPaneData.tabs[targetPaneData.activeTabIndex];
                        targetPaneData.contentType = activeTab.contentType;
                        targetPaneData.contentId = activeTab.contentId;

                        if (activeTab.contentType === 'browser' && activeTab.browserUrl) {
                            targetPaneData.browserUrl = activeTab.browserUrl;
                        }

                        if ((activeTab.contentType === 'editor' || activeTab.contentType === 'latex') && activeTab.fileContent !== undefined) {
                            targetPaneData.fileContent = activeTab.fileContent;
                            targetPaneData.fileChanged = activeTab.fileChanged || false;
                        }

                        if (sourcePaneData.tabs) {
                            sourcePaneData.tabs.forEach((tab: any) => {
                                delete contentDataRef.current[`${comp.draggedItem.id}_${tab.id}`];
                            });
                        }

                        closeContentPane(comp.draggedItem.id, comp.draggedItem.nodePath);

                        setRootLayoutNode?.(prev => ({ ...prev }));
                        comp.setDraggedItem(null);
                        comp.setDropTarget(null);
                        return;
                    }
                }

                comp.moveContentPane(comp.draggedItem.id, comp.draggedItem.nodePath, path, side);
                comp.setDraggedItem(null);
                comp.setDropTarget(null);
                return;
            }

            if (comp.draggedItem.type === 'tab') {
                const { sourceNodeId, tabIndex, contentType: tabContentType, contentId: tabContentId, browserUrl, fileChanged } = comp.draggedItem;
                const draggedTabId = comp.draggedItem.id;
                const targetPaneData = contentDataRef.current[node.id];
                const sourcePaneData = contentDataRef.current[sourceNodeId];

                const sourceVirtualId = `${sourceNodeId}_${draggedTabId}`;
                const sourceVirtualData = contentDataRef.current[sourceVirtualId];
                const fileContent = sourceVirtualData?.fileContent ?? comp.draggedItem.fileContent;

                if (sourceNodeId === node.id && side === 'center') {
                    comp.setDraggedItem(null);
                    comp.setDropTarget(null);
                    return;
                }

                if (side === 'center' && targetPaneData) {

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

                    const existingPaneIds = new Set(Object.keys(contentDataRef.current));
                    performSplit(path, side, tabContentType, tabContentId);

                    const newPaneId = Object.keys(contentDataRef.current).find(id => !existingPaneIds.has(id));
                    if (newPaneId && contentDataRef.current[newPaneId]) {
                        if (tabContentType === 'browser' && browserUrl) {
                            contentDataRef.current[newPaneId].browserUrl = browserUrl;
                        }
                        if (fileContent !== undefined) {
                            contentDataRef.current[newPaneId].fileContent = fileContent;
                            contentDataRef.current[newPaneId].fileChanged = fileChanged || false;
                        }

                        const splitScrollPos = sourceVirtualData?._scrollTopPos ?? comp.draggedItem._scrollTopPos;
                        if (splitScrollPos != null) {
                            contentDataRef.current[newPaneId]._scrollTopPos = splitScrollPos;
                        }
                    }
                }

                if (sourcePaneData?.tabs && sourcePaneData.tabs.length > 0) {

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

                    delete contentDataRef.current[sourceVirtualId];

                    sourcePaneData.tabs.splice(tabIndex, 1);
                    if (sourcePaneData.tabs.length === 0) {

                        const sourcePath = comp.draggedItem.sourcePath || findNodePath(comp.rootLayoutNode, sourceNodeId);
                        if (sourcePath) closeContentPane(sourceNodeId, sourcePath);
                    } else {

                        if (sourcePaneData.activeTabIndex >= sourcePaneData.tabs.length) {
                            sourcePaneData.activeTabIndex = sourcePaneData.tabs.length - 1;
                        }
                        const newActiveTab = sourcePaneData.tabs[sourcePaneData.activeTabIndex];
                        sourcePaneData.contentType = newActiveTab.contentType;
                        sourcePaneData.contentId = newActiveTab.contentId;

                        const activeVd = contentDataRef.current[`${sourceNodeId}_${newActiveTab.id}`];
                        sourcePaneData.fileContent = activeVd?.fileContent ?? newActiveTab.fileContent;
                        sourcePaneData.fileChanged = activeVd?.fileChanged ?? newActiveTab.fileChanged ?? false;
                        if (newActiveTab.contentType === 'browser') {
                            sourcePaneData.browserUrl = newActiveTab.browserUrl;
                        }

                        if (sourcePaneData.tabs.length === 1) {
                            const lastTab = sourcePaneData.tabs[0];
                            const lastVd = contentDataRef.current[`${sourceNodeId}_${lastTab.id}`];
                            if (lastVd) {
                                if (lastVd.fileContent !== undefined) sourcePaneData.fileContent = lastVd.fileContent;
                                if (lastVd.fileChanged !== undefined) sourcePaneData.fileChanged = lastVd.fileChanged;
                                if (lastVd._scrollTopPos !== undefined) sourcePaneData._scrollTopPos = lastVd._scrollTopPos;
                            } else {

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

                if (paneData?.contentType) {

                    if (!paneData.tabs || paneData.tabs.length === 0) {

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

                    const browserUrl = comp.draggedItem.url || comp.draggedItem.browserUrl;
                    const newTabTitle = contentType === 'browser'
                        ? (browserUrl || comp.draggedItem.id || 'Browser')
                        : (getFileName(comp.draggedItem.id) || contentType);
                    const newTab = {
                        id: `tab_${Date.now()}_${paneData.tabs.length}`,
                        contentType,
                        contentId: comp.draggedItem.id,
                        browserUrl: browserUrl,
                        fileContent: comp.draggedItem.fileContent,
                        fileChanged: comp.draggedItem.fileChanged,
                        title: newTabTitle
                    };

                    const currentTabIndex = paneData.activeTabIndex || 0;
                    if (paneData.tabs[currentTabIndex]) {
                        const curVd = contentDataRef.current[`${node.id}_${paneData.tabs[currentTabIndex].id}`];
                        paneData.tabs[currentTabIndex].fileContent = curVd?.fileContent ?? paneData.fileContent;
                        paneData.tabs[currentTabIndex].fileChanged = curVd?.fileChanged ?? paneData.fileChanged;
                    }

                    paneData.tabs.push(newTab);
                    paneData.activeTabIndex = paneData.tabs.length - 1;

                    paneData.contentType = contentType;
                    paneData.contentId = comp.draggedItem.id;

                    paneData.fileContent = null;
                    paneData.fileChanged = false;
                    if (contentType === 'browser' && browserUrl) {
                        paneData.browserUrl = browserUrl;
                    }

                    if (contentType === 'editor' && !comp.draggedItem.fileContent) {

                        (async () => {
                            try {
                                const response = await (window as any).api.readFileContent(comp.draggedItem.id);
                                const fileContent = response.error ? `Error: ${response.error}` : response.content;
                                paneData.fileContent = fileContent;

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

                    updateContentPane(node.id, contentType, comp.draggedItem.id);
                }
            } else {
                performSplit(path, side, contentType, comp.draggedItem.id);

                const splitBrowserUrl = comp.draggedItem.url || comp.draggedItem.browserUrl;
                if (contentType === 'browser' && splitBrowserUrl) {

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

        const tabs = paneData?.tabs || [];
        const activeTabIndex = paneData?.activeTabIndex ?? 0;
        const showTabBar = tabs.length > 1;

        const activeTab = tabs.length > 0 ? tabs[activeTabIndex] : null;
        const contentType = activeTab?.contentType || paneData?.contentType;
        const contentId = activeTab?.contentId || paneData?.contentId;

        const handleTabSelect = (index: number) => {
            if (paneData && tabs[index]) {

                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {

                    const currentVirtualId = `${node.id}_${tabs[currentTabIndex].id}`;
                    const currentVirtualData = contentDataRef.current[currentVirtualId];
                    tabs[currentTabIndex].fileContent = currentVirtualData?.fileContent ?? paneData.fileContent;
                    tabs[currentTabIndex].fileChanged = currentVirtualData?.fileChanged ?? paneData.fileChanged;
                    tabs[currentTabIndex].isUntitled = currentVirtualData?.isUntitled ?? paneData.isUntitled;

                    if (currentVirtualData) {
                        tabs[currentTabIndex]._editorStateJSON = currentVirtualData._editorStateJSON;
                        tabs[currentTabIndex]._cursorPos = currentVirtualData._cursorPos;
                        tabs[currentTabIndex]._scrollTopPos = currentVirtualData._scrollTopPos;
                    }

                    if (tabs[currentTabIndex].contentType === 'chat') {
                        tabs[currentTabIndex].chatMessages = paneData.chatMessages;
                        tabs[currentTabIndex].executionMode = paneData.executionMode;
                        tabs[currentTabIndex].selectedJinx = paneData.selectedJinx;
                        tabs[currentTabIndex].chatStats = paneData.chatStats;
                    }

                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }
                }

                paneData.activeTabIndex = index;

                const selectedTab = tabs[index];
                const selectedVirtualId = `${node.id}_${tabs[index].id}`;
                const selectedVirtualData = contentDataRef.current[selectedVirtualId];
                paneData.contentType = selectedTab.contentType;
                paneData.contentId = selectedTab.contentId;

                paneData.fileContent = selectedVirtualData?.fileContent ?? selectedTab.fileContent;
                paneData.fileChanged = selectedVirtualData?.fileChanged ?? selectedTab.fileChanged ?? false;
                paneData.isUntitled = selectedVirtualData?.isUntitled ?? selectedTab.isUntitled ?? false;

                if (selectedVirtualData) {
                    if (selectedTab._editorStateJSON) {
                        selectedVirtualData._editorStateJSON = selectedTab._editorStateJSON;
                        selectedVirtualData._cursorPos = selectedTab._cursorPos;
                        selectedVirtualData._scrollTopPos = selectedTab._scrollTopPos;
                    }
                }

                if (selectedTab.contentType === 'chat') {
                    paneData.chatMessages = selectedTab.chatMessages;
                    paneData.executionMode = selectedTab.executionMode;
                    paneData.selectedJinx = selectedTab.selectedJinx;
                    paneData.chatStats = selectedTab.chatStats;
                }

                if (selectedTab.contentType === 'browser') {
                    paneData.browserUrl = selectedTab.browserUrl || 'about:blank';
                    paneData.browserTitle = selectedTab.browserTitle || 'Browser';
                }

                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        const handleTabClose = (index: number) => {
            if (paneData && tabs.length > 0) {

                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {

                    const closeVirtualId = `${node.id}_${tabs[currentTabIndex].id}`;
                    const closeVirtualData = contentDataRef.current[closeVirtualId];

                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }

                    if (tabs[currentTabIndex].contentType === 'editor' || tabs[currentTabIndex].contentType === 'latex') {
                        tabs[currentTabIndex].fileContent = closeVirtualData?.fileContent ?? paneData.fileContent;
                        tabs[currentTabIndex].fileChanged = closeVirtualData?.fileChanged ?? paneData.fileChanged;
                    }

                    if (tabs[currentTabIndex].contentType === 'chat') {
                        tabs[currentTabIndex].chatMessages = paneData.chatMessages;
                        tabs[currentTabIndex].executionMode = paneData.executionMode;
                        tabs[currentTabIndex].selectedJinx = paneData.selectedJinx;
                        tabs[currentTabIndex].chatStats = paneData.chatStats;
                    }
                }

                const newTabs = [...tabs];
                newTabs.splice(index, 1);

                delete contentDataRef.current[`${node.id}_${tabs[index].id}`];

                if (newTabs.length === 0) {

                    closeContentPane(node.id, path);
                } else {
                    paneData.tabs = newTabs;

                    if (paneData.activeTabIndex >= newTabs.length) {
                        paneData.activeTabIndex = newTabs.length - 1;
                    }

                    const newActiveTab = newTabs[paneData.activeTabIndex];
                    const newActiveVd = newActiveTab ? contentDataRef.current[`${node.id}_${newActiveTab.id}`] : null;
                    if (newActiveTab) {
                        paneData.contentType = newActiveTab.contentType;
                        paneData.contentId = newActiveTab.contentId;

                        paneData.fileContent = newActiveVd?.fileContent ?? newActiveTab.fileContent;
                        paneData.fileChanged = newActiveVd?.fileChanged ?? newActiveTab.fileChanged ?? false;
                    }
                    if (newActiveTab?.contentType === 'browser' && newActiveTab.browserUrl) {
                        paneData.browserUrl = newActiveTab.browserUrl;
                        paneData.browserTitle = newActiveTab.browserTitle || 'Browser';
                    }

                    if (newActiveTab?.contentType === 'chat') {
                        paneData.chatMessages = newActiveTab.chatMessages;
                        paneData.executionMode = newActiveTab.executionMode;
                        paneData.selectedJinx = newActiveTab.selectedJinx;
                        paneData.chatStats = newActiveTab.chatStats;
                    }

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

        const handleAddTab = (contentType: string) => {
            if (paneData) {

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

                const newTabId = `tab_${Date.now()}_${paneData.tabs.length}`;
                let newContentId = null;
                let title = contentType;
                let extraChatProps: any = {};

                if (contentType === 'chat') {
                    newContentId = `conv_${Date.now()}`;
                    title = 'New Chat';

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

                paneData.contentType = contentType;
                paneData.contentId = newContentId;

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

        let paneHeaderChildren = null;

        let headerContent = null;

        const isMarkdownFile = contentType === 'editor' && contentId?.toLowerCase().endsWith('.md');

        const isHtmlFile = contentType === 'editor' && (contentId?.toLowerCase().endsWith('.html') || contentId?.toLowerCase().endsWith('.htm'));

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

        if (contentType === 'stl') {

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

        if (tabs.length > 1) {
            tabs.forEach((tab, index) => {
                const virtualId = `${node.id}_${tab.id}`;
                const isActiveTab = index === activeTabIndex;
                const existingVd = contentDataRef.current[virtualId];

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

                if (vd && (vd.fileContent === undefined || vd.fileContent === null)) {
                    const src = tab.fileContent ?? (isActiveTab ? paneData?.fileContent : undefined);
                    if (src !== undefined && src !== null) {
                        vd.fileContent = src;
                    }
                }

                if (vd && vd.fileContent !== undefined && vd.fileContent !== null) {
                    tab.fileContent = vd.fileContent;
                    tab.fileChanged = vd.fileChanged;
                }

                if (vd && vd._editorStateJSON === undefined && tab._editorStateJSON) {
                    vd._editorStateJSON = tab._editorStateJSON;
                    vd._cursorPos = tab._cursorPos;
                    vd._scrollTopPos = tab._scrollTopPos;
                }

                if (vd && vd._scrollTopPos !== undefined) {
                    tab._scrollTopPos = vd._scrollTopPos;
                }

                if (isActiveTab && vd) {
                    vd.chatMessages = paneData?.chatMessages;
                    vd.executionMode = paneData?.executionMode;
                    vd.selectedJinx = paneData?.selectedJinx;
                    vd.chatStats = paneData?.chatStats;
                }
            });
        }

        const renderTabContent = (tab: any, tabIndex: number) => {
            const virtualId = `${node.id}_${tab.id}`;
            const tabContentType = tab.contentType;
            const isActiveTab = tabIndex === activeTabIndex;

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

                return <div />;
            }

            if (tabContentType === 'browser') {
                return paneRenderers.browser?.({
                    nodeId: virtualId,
                    hasTabBar: showTabBar,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id
                });
            }

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
                className="flex-1 flex flex-col border theme-border"
                style={{ position: 'relative', overflow: 'hidden' }}
                data-pane-id={node.id}
                data-pane-type={contentType}
                onClick={() => componentRef.current.setActiveContentPaneId(node.id)}
                onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setLocalDragOver(true); }}
                onDragLeave={(e) => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); } }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { dragCounterRef.current = 0; setLocalDragOver(false); setLocalDropSide(null); onDrop(e, localDropSide || 'center'); }}
            >
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

                {contentType !== 'browser' && contentType !== 'docx' && contentType !== 'pptx' && contentType !== 'csv' && contentType !== 'latex' && (
                    <PaneHeader
                        nodeId={node.id}
                        icon={headerIcon}
                        title={headerTitle}

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

                        isRenaming={renamingPaneId === node.id}
                        editedFileName={editedFileName}
                        setEditedFileName={setEditedFileName}
                        onConfirmRename={() => handleConfirmRename?.(node.id, contentId)}
                        onCancelRename={() => setRenamingPaneId(null)}
                        filePath={contentId}
                        onRunScript={onRunScript}

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

                        onAddTab={handleAddTab}

                        topBarCollapsed={topBarCollapsed}
                        onExpandTopBar={onExpandTopBar}

                        panesLocked={lockedPanes.has(node.id)}
                        onTogglePanesLocked={() => togglePaneLocked(node.id)}
                    >
                        {paneHeaderChildren}
                    </PaneHeader>
                )}

                {localDragOver && !lockedPanes.has(node.id) && (
                    <>
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
                {tabs.length > 1 ? (

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

                    renderPaneContent()
                )}
            </div>
        );
    }
    return null;
}, (prev, next) => prev.node === next.node);

