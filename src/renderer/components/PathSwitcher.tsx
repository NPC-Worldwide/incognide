import React, { useState, useEffect, useRef } from 'react';
import {
    Folder, FolderOpen, ChevronRight, Clock,
    HardDrive, FolderPlus, X, ChevronDown, ArrowUp, KeyRound
} from 'lucide-react';

const splitPath = (p: string): string[] => p.split(/[\\/]/).filter(Boolean);

const isWindowsPath = (p: string): boolean => /^[A-Za-z]:/.test(p);

const joinPath = (segments: string[], originalPath: string): string => {
    if (!segments.length) return originalPath;

    if (isWindowsPath(originalPath)) {
        return segments[0] + '\\' + segments.slice(1).join('\\');
    }
    return '/' + segments.join('/');
};

interface PathSwitcherProps {
    currentPath: string;
    baseDir: string;
    onPathChange: (path: string) => void;
    onGoUp: () => void;
    onOpenEnv?: () => void;
    onOpenFolderPane?: (path: string) => void;
}

const RECENT_PATHS_KEY = 'incognide-recent-paths';
const MAX_RECENT_PATHS = 10;

export const PathSwitcher: React.FC<PathSwitcherProps> = ({
    currentPath,
    baseDir,
    onPathChange,
    onGoUp,
    onOpenEnv,
    onOpenFolderPane
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedPath, setEditedPath] = useState(currentPath);
    const [recentPaths, setRecentPaths] = useState<string[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(RECENT_PATHS_KEY);
            if (stored) {
                setRecentPaths(JSON.parse(stored));
            }
        } catch {}
    }, []);

    useEffect(() => {
        if (currentPath && currentPath !== baseDir) {
            setRecentPaths(prev => {
                const filtered = prev.filter(p => p !== currentPath);
                const updated = [currentPath, ...filtered].slice(0, MAX_RECENT_PATHS);
                localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(updated));
                return updated;
            });
        }
    }, [currentPath, baseDir]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const pathSegments = currentPath ? splitPath(currentPath) : [];
    const isAtRoot = currentPath === baseDir || !currentPath;
    const baseDirSegments = baseDir ? splitPath(baseDir) : [];
    const rawRootName = baseDirSegments[baseDirSegments.length - 1] || '';

    const getRootDisplayName = (name: string) => {
        if (name === '.npcsh' || name === 'npcsh') return 'Global';
        if (name.startsWith('.')) return name.slice(1);
        return name || 'Workspace';
    };
    const rootFolderName = getRootDisplayName(rawRootName);

    const handleOpenFolderPicker = async () => {
        try {
            const result = await (window as any).api.open_directory_picker();
            if (result) {
                onPathChange(result);
                setIsOpen(false);
            }
        } catch (err) {
            console.error('Failed to open folder picker:', err);
        }
    };

    const handleSegmentClick = (index: number) => {
        const newPath = joinPath(pathSegments.slice(0, index + 1), currentPath);
        onPathChange(newPath);
    };

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (editedPath.trim()) {
                onPathChange(editedPath.trim());
            }
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedPath(currentPath);
        }
    };

    const getFolderName = (path: string) => {
        const parts = splitPath(path);
        return parts[parts.length - 1] || path;
    };

    return (
        <div className="relative flex w-full" ref={dropdownRef}>
            <button
                onClick={() => onOpenFolderPane?.(currentPath)}
                className="flex-1 py-4 theme-bg-tertiary border-y border-l theme-border transition-all flex items-center justify-center hover:bg-green-500/10"
                title="Open current folder in pane"
            >
                <FolderOpen size={18} className="text-green-400" />
            </button>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex-[4] flex items-center gap-2 px-3 py-4 theme-bg-tertiary border theme-border hover:bg-purple-500/10 transition-all min-w-0"
            >
                <div className="flex-shrink-0">
                    {isAtRoot ? (
                        <Folder size={18} className="text-purple-400" />
                    ) : (
                        <FolderOpen size={18} className="text-yellow-400" />
                    )}
                </div>

                <div className="flex items-center overflow-hidden flex-1 min-w-0">
                    <span className="text-[10px] theme-text-primary font-medium truncate" title={currentPath}>
                        {isAtRoot ? rootFolderName : pathSegments[pathSegments.length - 1]}
                    </span>
                </div>

                <ChevronDown
                    size={12}
                    className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            <button
                onClick={handleOpenFolderPicker}
                className="flex-1 py-4 theme-bg-tertiary border-y theme-border hover:bg-blue-500/10 transition-all flex items-center justify-center"
                title="Browse folders (native picker)"
            >
                <FolderPlus size={18} className="text-blue-400" />
            </button>

            {onOpenEnv && (
                <button
                    onClick={onOpenEnv}
                    className="flex-1 py-4 theme-bg-tertiary border-y border-r theme-border hover:bg-amber-500/10 transition-all flex items-center justify-center"
                    title="Environment Settings"
                >
                    <KeyRound size={18} className="text-amber-400" />
                </button>
            )}

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 theme-bg-secondary border theme-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b theme-border">
                        <div className="flex items-center gap-2">
                            <HardDrive size={14} className="text-gray-400 flex-shrink-0" />
                            {isEditing ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editedPath}
                                    onChange={(e) => setEditedPath(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    onBlur={() => setIsEditing(false)}
                                    className="flex-1 text-xs theme-input rounded px-2 py-1 font-mono"
                                    placeholder="/path/to/folder"
                                />
                            ) : (
                                <button
                                    onClick={() => { setEditedPath(currentPath); setIsEditing(true); }}
                                    className="flex-1 text-left text-xs theme-text-muted font-mono truncate hover:theme-text-primary px-2 py-1 rounded theme-hover"
                                    title="Click to edit path"
                                >
                                    {currentPath || 'No folder selected'}
                                </button>
                            )}
                            {isEditing && (
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="p-1 hover:bg-red-500/20 rounded"
                                >
                                    <X size={12} className="text-red-400" />
                                </button>
                            )}
                        </div>
                    </div>

                    {pathSegments.length > 0 && (
                        <div className="p-2 border-b theme-border">
                            <div className="text-[10px] uppercase text-gray-500 px-2 mb-1">Navigate To</div>
                            <div className="flex flex-wrap gap-1">
                                <button
                                    onClick={() => { onPathChange(baseDir); setIsOpen(false); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs rounded theme-hover bg-purple-500/10 text-purple-400"
                                >
                                    <Folder size={10} /> {rootFolderName}
                                </button>
                                {pathSegments.map((segment, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { handleSegmentClick(i); setIsOpen(false); }}
                                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded theme-hover ${
                                            i === pathSegments.length - 1
                                                ? 'bg-yellow-500/10 text-yellow-400 font-medium'
                                                : 'bg-gray-500/10 theme-text-muted'
                                        }`}
                                    >
                                        <Folder size={10} /> {segment}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {recentPaths.length > 0 && (
                        <div className="p-2 max-h-48 overflow-y-auto">
                            <div className="text-[10px] uppercase text-gray-500 px-2 mb-1 flex items-center gap-1">
                                <Clock size={10} /> Recent
                            </div>
                            {recentPaths
                                .filter(p => p !== currentPath)
                                .slice(0, 8)
                                .map((path, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { onPathChange(path); setIsOpen(false); }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded theme-hover text-left group"
                                    >
                                        <Folder size={12} className="text-yellow-400 flex-shrink-0" />
                                        <span className="truncate theme-text-muted group-hover:theme-text-primary">
                                            {getFolderName(path)}
                                        </span>
                                        <span className="text-[10px] text-gray-600 truncate ml-auto max-w-[120px]">
                                            {path}
                                        </span>
                                    </button>
                                ))}
                        </div>
                    )}

                    <div className="p-2 border-t theme-border bg-black/20 flex gap-2">
                        <button
                            onClick={handleOpenFolderPicker}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        >
                            <FolderPlus size={14} /> Browse...
                        </button>
                        <button
                            onClick={() => { onPathChange(baseDir); setIsOpen(false); }}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg theme-button theme-hover"
                            title={baseDir}
                        >
                            <Folder size={14} /> {rootFolderName}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PathSwitcher;
