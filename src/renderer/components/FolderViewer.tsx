import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Folder, File, ChevronLeft, ChevronRight, Home, Grid, List,
    ArrowUp, RefreshCw, Search, SortAsc, SortDesc, Image, FileText,
    Music, Video, Archive, Code, Database, Terminal as TerminalIcon,
    ChevronDown, Check
} from 'lucide-react';
import { getFileIcon } from './utils';

interface FolderViewerProps {
    folderPath: string;
    onOpenFile?: (filePath: string) => void;
    onOpenFolder?: (folderPath: string) => void;
    onNavigate?: (newPath: string) => void;
}

interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
    extension?: string;
}

const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (isoString: string): string => {
    if (!isoString) return '--';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '--';
    }
};

const getFileTypeIcon = (item: FileItem) => {
    if (item.type === 'directory') {
        return <Folder size={20} className="text-yellow-400" />;
    }

    const ext = item.extension?.toLowerCase() || '';

    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
        return <Image size={20} className="text-purple-400" />;
    }
    // Documents
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
        return <FileText size={20} className="text-blue-400" />;
    }
    // Audio
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext)) {
        return <Music size={20} className="text-green-400" />;
    }
    // Video
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'].includes(ext)) {
        return <Video size={20} className="text-red-400" />;
    }
    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
        return <Archive size={20} className="text-orange-400" />;
    }
    // Code
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'rs', 'go', 'rb', 'php', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'xml', 'sh', 'bash'].includes(ext)) {
        return <Code size={20} className="text-cyan-400" />;
    }
    // Data
    if (['csv', 'xlsx', 'xls', 'db', 'sqlite', 'sql'].includes(ext)) {
        return <Database size={20} className="text-emerald-400" />;
    }

    return <File size={20} className="text-gray-400" />;
};

export const FolderViewer: React.FC<FolderViewerProps> = ({
    folderPath,
    onOpenFile,
    onOpenFolder,
    onNavigate
}) => {
    const [currentPath, setCurrentPath] = useState(folderPath);
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('modified');
    const [sortAsc, setSortAsc] = useState(false);
    const [foldersFirst, setFoldersFirst] = useState(false);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [history, setHistory] = useState<string[]>([folderPath]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const sortMenuRef = useRef<HTMLDivElement>(null);

    // Close sort menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setShowSortMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadDirectory = useCallback(async (dirPath: string) => {
        setLoading(true);
        setError(null);
        try {
            const result = await (window as any).api?.readDirectory?.(dirPath);
            console.log('readDirectory result:', result);
            if (!result || !Array.isArray(result)) {
                setError('Failed to read directory');
                setItems([]);
            } else {
                const processed = result.map((item: any) => ({
                    name: item.name,
                    path: item.path,
                    type: item.isDirectory ? 'directory' : 'file',
                    size: item.size ?? 0,
                    modified: item.modified ?? '',
                    extension: item.name.includes('.') ? item.name.split('.').pop() : ''
                }));
                console.log('processed items:', processed);
                setItems(processed);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load directory');
            setItems([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadDirectory(currentPath);
    }, [currentPath, loadDirectory]);

    useEffect(() => {
        setCurrentPath(folderPath);
        setHistory([folderPath]);
        setHistoryIndex(0);
    }, [folderPath]);

    const navigateTo = (path: string) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(path);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPath(path);
        setSelectedItems(new Set());
        onNavigate?.(path);
    };

    const goBack = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setCurrentPath(history[historyIndex - 1]);
        }
    };

    const goForward = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setCurrentPath(history[historyIndex + 1]);
        }
    };

    const goUp = () => {
        const parentPath = currentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '/';
        navigateTo(parentPath);
    };

    const handleItemClick = (item: FileItem, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const newSelected = new Set(selectedItems);
            if (newSelected.has(item.path)) {
                newSelected.delete(item.path);
            } else {
                newSelected.add(item.path);
            }
            setSelectedItems(newSelected);
        } else {
            setSelectedItems(new Set([item.path]));
        }
    };

    const handleItemDoubleClick = (item: FileItem) => {
        if (item.type === 'directory') {
            navigateTo(item.path);
            onOpenFolder?.(item.path);
        } else {
            onOpenFile?.(item.path);
        }
    };

    const sortedItems = [...items]
        .filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            const aHidden = a.name.startsWith('.');
            const bHidden = b.name.startsWith('.');
            const aIsDir = a.type === 'directory';
            const bIsDir = b.type === 'directory';

            // Sort order: non-hidden files, non-hidden folders, hidden items
            // Files before folders (unless foldersFirst is enabled)
            if (aHidden !== bHidden) {
                return aHidden ? 1 : -1; // Hidden items last
            }

            if (foldersFirst && aIsDir !== bIsDir) {
                return aIsDir ? -1 : 1; // Folders first if enabled
            } else if (!foldersFirst && aIsDir !== bIsDir) {
                return aIsDir ? 1 : -1; // Files first by default
            }

            let comparison = 0;
            if (sortBy === 'name') {
                // Case-insensitive name comparison
                comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            } else if (sortBy === 'size') {
                comparison = (a.size || 0) - (b.size || 0);
            } else if (sortBy === 'modified') {
                comparison = (a.modified || '').localeCompare(b.modified || '');
            } else if (sortBy === 'type') {
                comparison = (a.extension || '').localeCompare(b.extension || '');
            }
            return sortAsc ? comparison : -comparison;
        });

    const sortLabels: Record<string, string> = {
        name: 'Name',
        size: 'Size',
        modified: 'Date Modified',
        type: 'Type'
    };

    const pathParts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);

    return (
        <div className="flex-1 flex flex-col min-h-0 theme-bg-primary">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b theme-border theme-bg-secondary">
                <button
                    onClick={goBack}
                    disabled={historyIndex <= 0}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Back"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={goForward}
                    disabled={historyIndex >= history.length - 1}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Forward"
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    onClick={goUp}
                    className="p-1.5 rounded hover:bg-gray-700"
                    title="Go up"
                >
                    <ArrowUp size={16} />
                </button>
                <button
                    onClick={() => loadDirectory(currentPath)}
                    className="p-1.5 rounded hover:bg-gray-700"
                    title="Refresh"
                >
                    <RefreshCw size={16} />
                </button>

                {/* Breadcrumb path */}
                <div className="flex-1 flex items-center gap-1 px-2 py-1 rounded bg-gray-800 text-xs overflow-x-auto">
                    <button
                        onClick={() => navigateTo('/')}
                        className="hover:text-blue-400 flex-shrink-0"
                    >
                        <Home size={14} />
                    </button>
                    {pathParts.map((part, i) => (
                        <React.Fragment key={i}>
                            <span className="text-gray-500">/</span>
                            <button
                                onClick={() => navigateTo('/' + pathParts.slice(0, i + 1).join('/'))}
                                className="hover:text-blue-400 truncate max-w-[150px]"
                                title={part}
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="pl-7 pr-2 py-1 text-xs rounded bg-gray-800 border theme-border focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
                    />
                </div>

                {/* View mode */}
                <div className="flex border theme-border rounded overflow-hidden">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 ${viewMode === 'grid' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                        title="Grid view"
                    >
                        <Grid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 ${viewMode === 'list' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                        title="List view"
                    >
                        <List size={14} />
                    </button>
                </div>

                {/* Sort dropdown */}
                <div className="relative" ref={sortMenuRef}>
                    <button
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-700 border theme-border"
                        title="Sort options"
                    >
                        {sortAsc ? <SortAsc size={14} /> : <SortDesc size={14} />}
                        <span className="hidden sm:inline">{sortLabels[sortBy]}</span>
                        <ChevronDown size={12} />
                    </button>
                    {showSortMenu && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border theme-border rounded-lg shadow-xl z-50 py-1">
                            <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wide">Sort by</div>
                            {(['modified', 'name', 'size', 'type'] as const).map(option => (
                                <button
                                    key={option}
                                    onClick={() => { setSortBy(option); }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center justify-between ${sortBy === option ? 'text-blue-400' : 'text-gray-300'}`}
                                >
                                    {sortLabels[option]}
                                    {sortBy === option && <Check size={12} />}
                                </button>
                            ))}
                            <div className="border-t theme-border my-1" />
                            <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wide">Order</div>
                            <button
                                onClick={() => setSortAsc(true)}
                                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center justify-between ${sortAsc ? 'text-blue-400' : 'text-gray-300'}`}
                            >
                                Ascending
                                {sortAsc && <Check size={12} />}
                            </button>
                            <button
                                onClick={() => setSortAsc(false)}
                                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center justify-between ${!sortAsc ? 'text-blue-400' : 'text-gray-300'}`}
                            >
                                Descending
                                {!sortAsc && <Check size={12} />}
                            </button>
                            <div className="border-t theme-border my-1" />
                            <button
                                onClick={() => setFoldersFirst(!foldersFirst)}
                                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center justify-between ${foldersFirst ? 'text-blue-400' : 'text-gray-300'}`}
                            >
                                Folders first
                                {foldersFirst && <Check size={12} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-2">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <RefreshCw size={24} className="animate-spin mr-2" />
                        Loading...
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-400">
                        {error}
                    </div>
                ) : sortedItems.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        {searchQuery ? 'No matching items' : 'Empty folder'}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                        {sortedItems.map(item => (
                            <div
                                key={item.path}
                                onClick={(e) => handleItemClick(item, e)}
                                onDoubleClick={() => handleItemDoubleClick(item)}
                                className={`flex flex-col items-center gap-1 p-3 rounded cursor-pointer transition-colors ${
                                    selectedItems.has(item.path)
                                        ? 'bg-blue-600/30 ring-1 ring-blue-500'
                                        : 'hover:bg-gray-800'
                                }`}
                            >
                                {getFileTypeIcon(item)}
                                <span className="text-xs text-center truncate w-full" title={item.name}>
                                    {item.name}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {/* List header */}
                        <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 border-b theme-border">
                            <button
                                onClick={() => { setSortBy('name'); if (sortBy === 'name') setSortAsc(!sortAsc); }}
                                className="flex-1 text-left hover:text-gray-300"
                            >
                                Name {sortBy === 'name' && (sortAsc ? '↑' : '↓')}
                            </button>
                            <button
                                onClick={() => { setSortBy('type'); if (sortBy === 'type') setSortAsc(!sortAsc); }}
                                className="w-16 text-center hover:text-gray-300"
                            >
                                Type {sortBy === 'type' && (sortAsc ? '↑' : '↓')}
                            </button>
                            <button
                                onClick={() => { setSortBy('size'); if (sortBy === 'size') setSortAsc(!sortAsc); }}
                                className="w-20 text-right hover:text-gray-300"
                            >
                                Size {sortBy === 'size' && (sortAsc ? '↑' : '↓')}
                            </button>
                            <button
                                onClick={() => { setSortBy('modified'); if (sortBy === 'modified') setSortAsc(!sortAsc); }}
                                className="w-40 text-right hover:text-gray-300"
                            >
                                Modified {sortBy === 'modified' && (sortAsc ? '↑' : '↓')}
                            </button>
                        </div>
                        {sortedItems.map(item => (
                            <div
                                key={item.path}
                                onClick={(e) => handleItemClick(item, e)}
                                onDoubleClick={() => handleItemDoubleClick(item)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                    selectedItems.has(item.path)
                                        ? 'bg-blue-600/30 ring-1 ring-blue-500'
                                        : 'hover:bg-gray-800'
                                }`}
                            >
                                {getFileTypeIcon(item)}
                                <span className="flex-1 text-sm truncate" title={item.name}>
                                    {item.name}
                                </span>
                                <span className="w-16 text-xs text-gray-500 text-center uppercase">
                                    {item.type === 'directory' ? 'folder' : (item.extension || '--')}
                                </span>
                                <span className="w-20 text-xs text-gray-500 text-right">
                                    {item.type === 'file' ? formatFileSize(item.size || 0) : '--'}
                                </span>
                                <span className="w-40 text-xs text-gray-500 text-right truncate">
                                    {formatDate(item.modified || '')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1 text-xs text-gray-500 border-t theme-border theme-bg-secondary">
                <span>{sortedItems.length} items</span>
                <span>{selectedItems.size} selected</span>
            </div>
        </div>
    );
};

export default FolderViewer;
