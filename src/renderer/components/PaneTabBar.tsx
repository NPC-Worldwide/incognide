import { getFileName } from './utils';
import React, { useCallback, useRef, useState } from 'react';
import {
    X, Plus, MessageSquare, Terminal, Globe, FileText, Image, Book, File, GripVertical, Folder,
    Database, Zap, Users, Settings, Images, BookOpen, FolderCog, HardDrive, Tags, Network,
    LayoutDashboard, Share2, Brain, Table, Bot, Maximize2, Minimize2, Music
} from 'lucide-react';

interface Tab {
    id: string;
    contentType: string;
    contentId: string;
    title?: string;
    browserTitle?: string;
    browserUrl?: string;
    fileContent?: string;
    fileChanged?: boolean;
}

interface PaneTabBarProps {
    tabs: Tab[];
    activeTabIndex: number;
    onTabSelect: (index: number) => void;
    onTabClose: (index: number) => void;
    onTabAdd?: () => void;
    onTabReorder?: (fromIndex: number, toIndex: number) => void;
    onReceiveExternalTab?: (tab: Tab, insertIndex: number) => void;
    nodeId: string;
    // Zen mode and close pane
    onToggleZen?: () => void;
    isZenMode?: boolean;
    onClosePane?: () => void;
    // For dragging tabs out to form new panes
    setDraggedItem?: (item: any) => void;
    findNodePath?: (node: any, id: string) => number[] | null;
    rootLayoutNode?: any;
    contentDataRef?: any;
    nodePath?: number[];
}

const getTabIcon = (contentType: string) => {
    switch (contentType) {
        case 'chat':
            return <MessageSquare size={12} className="text-blue-400" />;
        case 'terminal':
            return <Terminal size={12} className="text-green-400" />;
        case 'browser':
            return <Globe size={12} className="text-blue-400" />;
        case 'pdf':
            return <FileText size={12} className="text-red-400" />;
        case 'epub':
            return <Book size={12} className="text-green-400" />;
        case 'image':
            return <Image size={12} className="text-purple-400" />;
        case 'editor':
            return <FileText size={12} className="text-gray-400" />;
        case 'folder':
            return <Folder size={12} className="text-yellow-400" />;
        case 'dbtool':
            return <Database size={12} className="text-cyan-400" />;
        case 'jinx':
            return <Zap size={12} className="text-yellow-400" />;
        case 'npcteam':
            return <Bot size={12} className="text-purple-400" />;
        case 'teammanagement':
            return <Users size={12} className="text-indigo-400" />;
        case 'settings':
            return <Settings size={12} className="text-gray-400" />;
        case 'photoviewer':
            return <Images size={12} className="text-pink-400" />;
        case 'scherzo':
            return <Music size={12} className="text-purple-400" />;
        case 'library':
            return <BookOpen size={12} className="text-amber-400" />;
        case 'projectenv':
            return <FolderCog size={12} className="text-orange-400" />;
        case 'diskusage':
            return <HardDrive size={12} className="text-slate-400" />;
        case 'data-labeler':
            return <Tags size={12} className="text-teal-400" />;
        case 'graph-viewer':
            return <Network size={12} className="text-violet-400" />;
        case 'browsergraph':
            return <Share2 size={12} className="text-sky-400" />;
        case 'datadash':
            return <LayoutDashboard size={12} className="text-emerald-400" />;
        case 'mindmap':
            return <Brain size={12} className="text-rose-400" />;
        case 'markdown-preview':
            return <FileText size={12} className="text-blue-400" />;
        case 'csv':
            return <Table size={12} className="text-green-400" />;
        case 'latex':
            return <FileText size={12} className="text-teal-400" />;
        case 'docx':
            return <FileText size={12} className="text-blue-500" />;
        case 'pptx':
            return <FileText size={12} className="text-orange-500" />;
        case 'zip':
            return <File size={12} className="text-yellow-500" />;
        default:
            return <File size={12} className="text-gray-400" />;
    }
};

const getTabTitle = (tab: Tab): string => {
    if (tab.title) return tab.title;

    switch (tab.contentType) {
        case 'chat':
            return `Chat ${tab.contentId?.slice(-6) || ''}`;
        case 'terminal':
            return 'Terminal';
        case 'browser':
            // Use browserTitle if available, truncate long titles
            if (tab.browserTitle && tab.browserTitle !== 'Browser') {
                const title = tab.browserTitle;
                return title.length > 25 ? title.slice(0, 22) + '...' : title;
            }
            return 'Browser';
        case 'dbtool':
            return 'Database Tool';
        case 'jinx':
            return 'Jinx Manager';
        case 'npcteam':
            return 'NPC Team';
        case 'teammanagement':
            return 'Team Management';
        case 'settings':
            return 'Settings';
        case 'photoviewer':
            return 'Vixynt';
        case 'scherzo':
            return 'Scherzo';
        case 'library':
            return 'Library';
        case 'projectenv':
            return 'Project Environment';
        case 'diskusage':
            return 'Disk Usage';
        case 'data-labeler':
            return 'Data Labeler';
        case 'graph-viewer':
            return 'Graph Viewer';
        case 'browsergraph':
            return 'Browser Graph';
        case 'datadash':
            return 'Data Dashboard';
        case 'mindmap':
            return 'Mind Map';
        case 'markdown-preview':
            return `Preview: ${getFileName(tab.contentId) || 'Markdown'}`;
        case 'pdf':
            return getFileName(tab.contentId) || 'PDF';
        case 'csv':
            return getFileName(tab.contentId) || 'CSV';
        case 'latex':
            return getFileName(tab.contentId) || 'LaTeX';
        case 'docx':
            return getFileName(tab.contentId) || 'Document';
        case 'pptx':
            return getFileName(tab.contentId) || 'Presentation';
        case 'zip':
            return getFileName(tab.contentId) || 'Archive';
        case 'image':
            return getFileName(tab.contentId) || 'Image';
        case 'folder':
            return getFileName(tab.contentId) || 'Folder';
        default:
            return getFileName(tab.contentId) || 'Tab';
    }
};

export const PaneTabBar: React.FC<PaneTabBarProps> = ({
    tabs,
    activeTabIndex,
    onTabSelect,
    onTabClose,
    onTabAdd,
    onTabReorder,
    nodeId,
    onToggleZen,
    isZenMode,
    onClosePane,
    setDraggedItem,
    findNodePath,
    rootLayoutNode,
    contentDataRef,
    nodePath
}) => {
    const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const tabBarRef = useRef<HTMLDivElement>(null);

    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `tab:${nodeId}:${index}`);
        setDraggedTabIndex(index);

        // Set draggedItem for external drops (to other panes)
        // Use setTimeout to allow drag event to fully initialize before state update
        if (setDraggedItem && tabs[index]) {
            const tab = tabs[index];
            // For browser tabs, get browserUrl from pane data as it's always up-to-date
            // The tab object might not have the latest URL if no navigation event occurred
            const paneData = contentDataRef?.current?.[nodeId];
            const isActiveTab = index === (paneData?.activeTabIndex ?? 0);
            const browserUrl = tab.contentType === 'browser' && isActiveTab
                ? (paneData?.browserUrl || tab.browserUrl)
                : tab.browserUrl;
            setTimeout(() => {
                setDraggedItem({
                    type: 'tab',
                    id: tab.id,
                    tabIndex: index,
                    sourceNodeId: nodeId,
                    sourcePath: nodePath,
                    contentType: tab.contentType,
                    contentId: tab.contentId,
                    browserUrl: browserUrl,
                    fileContent: tab.fileContent,
                    fileChanged: tab.fileChanged
                });
            }, 0);
        }
    }, [nodeId, tabs, setDraggedItem, nodePath]);

    const handleDragEnd = useCallback(() => {
        setDraggedTabIndex(null);
        setDragOverIndex(null);
        // Clear the global draggedItem
        if (setDraggedItem) {
            setDraggedItem(null);
        }
    }, [setDraggedItem]);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedTabIndex !== null && draggedTabIndex !== index) {
            setDragOverIndex(index);
        }
    }, [draggedTabIndex]);

    const handleDrop = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedTabIndex !== null && onTabReorder) {
            onTabReorder(draggedTabIndex, index);
        }
        setDraggedTabIndex(null);
        setDragOverIndex(null);
    }, [draggedTabIndex, onTabReorder]);

    const handleTabClose = useCallback((e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        onTabClose(index);
    }, [onTabClose]);

    // Middle-click (auxclick with button 1) to close tab
    const handleTabAuxClick = useCallback((e: React.MouseEvent, index: number) => {
        // button 1 = middle mouse button
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            onTabClose(index);
        }
    }, [onTabClose]);

    return (
        <div
            ref={tabBarRef}
            className="flex items-center gap-0.5 px-1 py-0.5 theme-bg-tertiary border-b theme-border overflow-x-auto"
            style={{ minHeight: '28px' }}
        >
            {/* Zen mode button - left side */}
            {onToggleZen && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleZen(); }}
                    className={`p-1 rounded flex-shrink-0 ${isZenMode ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'} hover:bg-gray-700/50`}
                    title={isZenMode ? "Exit zen mode (Esc)" : "Enter zen mode"}
                >
                    {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            )}
            {tabs.map((tab, index) => (
                <div
                    key={tab.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => onTabSelect(index)}
                    onAuxClick={(e) => handleTabAuxClick(e, index)}
                    className={`
                        flex items-center gap-1.5 pl-2 pr-6 py-1 rounded-t text-xs cursor-pointer
                        transition-colors group relative min-w-[40px] max-w-[150px]
                        ${index === activeTabIndex
                            ? 'bg-gray-800 text-white border-t border-l border-r theme-border'
                            : 'hover:bg-gray-700/50 text-gray-400'
                        }
                        ${dragOverIndex === index ? 'border-l-2 border-blue-500' : ''}
                        ${draggedTabIndex === index ? 'opacity-50' : ''}
                    `}
                >
                    {getTabIcon(tab.contentType)}
                    <span className="truncate">{getTabTitle(tab)}</span>
                    <button
                        onClick={(e) => handleTabClose(e, index)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-gray-600 hover:bg-red-500/50 transition-colors z-10"
                    >
                        <X size={10} className="text-gray-300 hover:text-white" />
                    </button>
                </div>
            ))}

            {onTabAdd && (
                <button
                    onClick={onTabAdd}
                    className="p-1 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                    title="New tab"
                >
                    <Plus size={14} />
                </button>
            )}

            {/* Spacer to push close button to right */}
            <div className="flex-1" />

            {/* Close pane button - right side */}
            {onClosePane && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClosePane(); }}
                    className="p-1 rounded flex-shrink-0 text-gray-400 hover:text-red-400 hover:bg-gray-700/50"
                    title="Close pane"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
};

export default PaneTabBar;
