import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Archive, FolderArchive, FileIcon, Download, FolderOpen, X, RefreshCw, ChevronRight, ChevronDown, Folder } from 'lucide-react';

interface ZipEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    compressedSize: number;
    children?: ZipEntry[];
}

interface TreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    compressedSize: number;
    children: Map<string, TreeNode>;
}

const ZipViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane
}) => {
    const [entries, setEntries] = useState<ZipEntry[]>([]);
    const [treeData, setTreeData] = useState<TreeNode | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [extractModal, setExtractModal] = useState<{ entry: ZipEntry | null; extractAll: boolean } | null>(null);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    // Build tree structure from flat entries
    const buildTree = useCallback((flatEntries: ZipEntry[]): TreeNode => {
        const root: TreeNode = {
            name: filePath?.split('/').pop() || 'archive.zip',
            path: '',
            isDirectory: true,
            size: 0,
            compressedSize: 0,
            children: new Map()
        };

        for (const entry of flatEntries) {
            const parts = entry.path.split('/').filter(Boolean);
            let current = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                const currentPath = parts.slice(0, i + 1).join('/');

                if (!current.children.has(part)) {
                    current.children.set(part, {
                        name: part,
                        path: currentPath,
                        isDirectory: isLast ? entry.isDirectory : true,
                        size: isLast ? entry.size : 0,
                        compressedSize: isLast ? entry.compressedSize : 0,
                        children: new Map()
                    });
                }

                current = current.children.get(part)!;
            }
        }

        return root;
    }, [filePath]);

    const loadZipContents = useCallback(async () => {
        if (!filePath) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await (window as any).api.readZipContents(filePath);
            if (result?.error) throw new Error(result.error);
            setEntries(result.entries || []);
            setTreeData(buildTree(result.entries || []));
            // Expand root by default
            setExpandedPaths(new Set(['']));
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setIsLoading(false);
        }
    }, [filePath, buildTree]);

    useEffect(() => {
        loadZipContents();
    }, [loadZipContents]);

    const toggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const handleExtract = useCallback(async (entry: ZipEntry | null) => {
        // entry=null means extract all
        setExtractModal({ entry, extractAll: entry === null });
    }, []);

    const executeExtract = useCallback(async (targetDir: string) => {
        if (!extractModal || !filePath) return;
        setIsExtracting(true);
        try {
            const result = await (window as any).api.extractZip(
                filePath,
                targetDir,
                extractModal.extractAll ? null : extractModal.entry?.path
            );
            if (result?.error) throw new Error(result.error);
            setExtractModal(null);
            // Could show success message or refresh sidebar
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setIsExtracting(false);
        }
    }, [extractModal, filePath]);

    const selectExtractDirectory = useCallback(async () => {
        try {
            const result = await (window as any).api.selectDirectory();
            if (result && !result.canceled && result.filePaths?.[0]) {
                await executeExtract(result.filePaths[0]);
            }
        } catch (e: any) {
            setError(e.message || String(e));
        }
    }, [executeExtract]);

    const extractToSameDir = useCallback(async () => {
        if (!filePath) return;
        const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
        await executeExtract(parentDir);
    }, [filePath, executeExtract]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const renderTreeNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        const childrenArray = Array.from(node.children.values()).sort((a, b) => {
            // Directories first, then alphabetically
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        return (
            <div key={node.path || 'root'}>
                <div
                    className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:theme-bg-tertiary ${isSelected ? 'theme-bg-tertiary' : ''}`}
                    style={{ paddingLeft: `${depth * 16 + 8}px` }}
                    onClick={() => {
                        setSelectedPath(node.path);
                        if (node.isDirectory && node.children.size > 0) {
                            toggleExpand(node.path);
                        }
                    }}
                    onDoubleClick={() => {
                        if (!node.isDirectory) {
                            handleExtract({
                                name: node.name,
                                path: node.path,
                                isDirectory: false,
                                size: node.size,
                                compressedSize: node.compressedSize
                            });
                        }
                    }}
                >
                    {node.isDirectory ? (
                        <>
                            {node.children.size > 0 ? (
                                isExpanded ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />
                            ) : <span className="w-[14px]" />}
                            <Folder size={14} className="flex-shrink-0 text-yellow-500" />
                        </>
                    ) : (
                        <>
                            <span className="w-[14px]" />
                            <FileIcon size={14} className="flex-shrink-0 theme-text-muted" />
                        </>
                    )}
                    <span className="truncate flex-1 text-sm">{node.name}</span>
                    {!node.isDirectory && (
                        <span className="text-xs theme-text-muted flex-shrink-0">{formatSize(node.size)}</span>
                    )}
                </div>
                {node.isDirectory && isExpanded && childrenArray.map(child => renderTreeNode(child, depth + 1))}
            </div>
        );
    };

    if (error && !entries.length) {
        return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center theme-bg-secondary">
                <div className="flex items-center gap-2 theme-text-muted">
                    <RefreshCw className="animate-spin" size={16} />
                    <span>Loading archive...</span>
                </div>
            </div>
        );
    }

    const totalSize = entries.reduce((acc, e) => acc + e.size, 0);
    const compressedSize = entries.reduce((acc, e) => acc + e.compressedSize, 0);
    const fileCount = entries.filter(e => !e.isDirectory).length;
    const dirCount = entries.filter(e => e.isDirectory).length;

    return (
        <div className="h-full flex flex-col theme-bg-secondary overflow-hidden">
            {/* Header */}
            <div
                draggable="true"
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                    setTimeout(() => setDraggedItem({ type: 'pane', id: nodeId, nodePath }), 0);
                }}
                onDragEnd={() => setDraggedItem(null)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPaneContextMenu({
                        isOpen: true,
                        x: e.clientX,
                        y: e.clientY,
                        nodeId,
                        nodePath: findNodePath(rootLayoutNode, nodeId)
                    });
                }}
                className="p-2 border-b theme-border text-xs theme-text-muted flex-shrink-0 theme-bg-secondary cursor-move"
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 truncate">
                        <Archive size={14} className="text-orange-500" />
                        <span className="font-semibold truncate">
                            {filePath ? filePath.split('/').pop() : 'Archive'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleExtract(null)}
                            className="p-1 theme-hover rounded"
                            title="Extract All"
                        >
                            <FolderOpen size={14} />
                        </button>
                        <button
                            onClick={loadZipContents}
                            className="p-1 theme-hover rounded"
                            title="Refresh"
                        >
                            <RefreshCw size={14} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeContentPane(nodeId, findNodePath(rootLayoutNode, nodeId));
                            }}
                            className="p-1 theme-hover rounded-full"
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats bar */}
            <div className="px-3 py-2 border-b theme-border text-xs theme-text-muted flex items-center gap-4 flex-shrink-0">
                <span>{fileCount} files</span>
                <span>{dirCount} folders</span>
                <span>Size: {formatSize(totalSize)}</span>
                <span>Compressed: {formatSize(compressedSize)}</span>
            </div>

            {/* Tree view */}
            <div className="flex-1 overflow-auto">
                {treeData && renderTreeNode(treeData)}
            </div>

            {/* Selected item actions */}
            {selectedPath !== null && selectedPath !== '' && (
                <div className="p-2 border-t theme-border flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => {
                            const entry = entries.find(e => e.path === selectedPath);
                            if (entry) handleExtract(entry);
                        }}
                        className="px-3 py-1 text-xs theme-bg-tertiary rounded theme-hover flex items-center gap-1"
                    >
                        <Download size={12} />
                        Extract Selected
                    </button>
                    <span className="text-xs theme-text-muted truncate flex-1">{selectedPath}</span>
                </div>
            )}

            {/* Extract Modal */}
            {extractModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setExtractModal(null)}>
                    <div className="theme-bg-secondary rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <FolderArchive size={16} />
                            {extractModal.extractAll ? 'Extract All' : `Extract: ${extractModal.entry?.name}`}
                        </h3>
                        <p className="text-sm theme-text-muted mb-4">
                            Choose where to extract the {extractModal.extractAll ? 'archive contents' : 'selected item'}:
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={extractToSameDir}
                                disabled={isExtracting}
                                className="w-full px-3 py-2 text-sm theme-bg-tertiary rounded theme-hover disabled:opacity-50"
                            >
                                {isExtracting ? 'Extracting...' : 'Extract Here (Same Folder)'}
                            </button>
                            <button
                                onClick={selectExtractDirectory}
                                disabled={isExtracting}
                                className="w-full px-3 py-2 text-sm theme-bg-tertiary rounded theme-hover disabled:opacity-50"
                            >
                                Choose Folder...
                            </button>
                            <button
                                onClick={() => setExtractModal(null)}
                                disabled={isExtracting}
                                className="w-full px-3 py-2 text-sm rounded border theme-border theme-hover disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-2 border-t border-red-500/30 bg-red-500/10 text-xs text-red-500">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(ZipViewer, arePropsEqual);
