import { getFileName, getFileIcon } from './utils';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, File, Folder, Trash2, Plus, ChevronDown, ChevronRight, FileText, FileCode, FileJson, Image, Eye, EyeOff } from 'lucide-react';
import { ContextFile, ContextFileStorage } from './MessageLabeling';

interface ContextFilesPanelProps {
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    contextFiles: ContextFile[];
    setContextFiles: React.Dispatch<React.SetStateAction<ContextFile[]>>;
    onFileClick?: (file: ContextFile) => void;
    currentPath?: string;
}

export const ContextFilesPanel: React.FC<ContextFilesPanelProps> = ({
    isCollapsed = false,
    onToggleCollapse,
    contextFiles,
    setContextFiles,
    onFileClick,
    currentPath,
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [showContent, setShowContent] = useState<string | null>(null);

    // Handle drag events for external files
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        // Let sidebar-file drops bubble up to ChatInput
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
                if (data.type === 'sidebar-file') {
                    return; // Don't handle, let it bubble
                }
            } catch (err) {}
        }

        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const addFileFromPath = (filePath: string, source: 'sidebar' | 'external') => {
        const name = getFileName(filePath) || filePath;
        const newFile: ContextFile = {
            id: crypto.randomUUID(),
            path: filePath,
            name: name,
            content: '',
            size: 0,
            addedAt: new Date().toISOString(),
            source: source
        };

        setContextFiles(prev => {
            if (prev.find(f => f.path === filePath)) return prev;
            const updated = [...prev, newFile];
            ContextFileStorage.add(newFile);
            return updated;
        });
    };

    const removeFile = (fileId: string) => {
        setContextFiles(prev => prev.filter(f => f.id !== fileId));
        ContextFileStorage.remove(fileId);
    };

    const clearAll = () => {
        setContextFiles([]);
        ContextFileStorage.clear();
    };

    // Group files by source
    const groupedFiles = useMemo(() => {
        const groups: { [key: string]: ContextFile[] } = {
            'sidebar': [],
            'external': [],
            'open-pane': []
        };
        contextFiles.forEach(file => {
            groups[file.source]?.push(file);
        });
        return groups;
    }, [contextFiles]);

    const totalSize = useMemo(() => {
        return contextFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    }, [contextFiles]);

    if (isCollapsed) {
        return (
            <div
                className="border-b theme-border"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <button
                    onClick={onToggleCollapse}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium theme-text-muted hover:theme-bg-secondary transition-colors ${
                        isDragOver ? 'bg-blue-900/30 border-blue-500' : ''
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <ChevronRight size={14} />
                        <File size={14} />
                        <span>Context Files</span>
                        {contextFiles.length > 0 && (
                            <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-300 rounded text-[10px]">
                                {contextFiles.length}
                            </span>
                        )}
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div
            className={`border-b theme-border ${isDragOver ? 'bg-blue-900/20 ring-2 ring-blue-500 ring-inset' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b theme-border">
                <button
                    onClick={onToggleCollapse}
                    className="flex items-center gap-2 text-xs font-medium theme-text-muted hover:text-white"
                >
                    <ChevronDown size={14} />
                    <File size={14} />
                    <span>Context Files</span>
                    {contextFiles.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-300 rounded text-[10px]">
                            {contextFiles.length}
                        </span>
                    )}
                </button>
                {contextFiles.length > 0 && (
                    <button
                        onClick={clearAll}
                        className="p-1 text-gray-500 hover:text-red-400 rounded"
                        title="Clear all"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            {/* Drop zone hint - compact version */}
            {contextFiles.length === 0 && (
                <div className={`px-3 py-2 text-center border-2 border-dashed mx-2 my-1 rounded transition-colors ${
                    isDragOver ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
                }`}>
                    <p className="text-[10px] text-gray-500">
                        Drag files here from sidebar or drop external files
                    </p>
                </div>
            )}

            {/* File list */}
            {contextFiles.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                    {Object.entries(groupedFiles).map(([source, files]) => {
                        if (files.length === 0) return null;
                        return (
                            <div key={source} className="px-2 py-1">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider px-1 py-0.5">
                                    {source === 'sidebar' ? 'From Sidebar' : source === 'external' ? 'External' : 'Open Panes'}
                                </div>
                                {files.map(file => (
                                    <div
                                        key={file.id}
                                        className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer"
                                        onClick={() => onFileClick?.(file)}
                                    >
                                        {getFileIcon(file.name)}
                                        <span className="flex-1 text-xs text-gray-300 truncate" title={file.path}>
                                            {file.name}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowContent(showContent === file.id ? null : file.id);
                                            }}
                                            className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300"
                                            title="Toggle content preview"
                                        >
                                            {showContent === file.id ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFile(file.id);
                                            }}
                                            className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                {files.map(file => showContent === file.id && (
                                    <div key={`content-${file.id}`} className="mx-2 mb-2 p-2 bg-gray-800 rounded text-[10px] font-mono text-gray-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                        {file.content?.slice(0, 500) || 'No content loaded'}
                                        {(file.content?.length || 0) > 500 && '...'}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Stats */}
            {contextFiles.length > 0 && (
                <div className="px-3 py-1 border-t theme-border text-[10px] text-gray-500 flex justify-between">
                    <span>{contextFiles.length} files</span>
                    <span>~{Math.ceil(totalSize / 4)} tokens</span>
                </div>
            )}
        </div>
    );
};

export default ContextFilesPanel;
