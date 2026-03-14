import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, FolderOpen, CheckCircle, XCircle, Loader, Trash2, ExternalLink, Pause, Play, Square } from 'lucide-react';

interface DownloadItem {
    id: string;
    url: string;
    filename: string;
    tempFilename?: string;
    savePath: string | null;
    status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    received: number;
    total: number;
    error?: string;
    startTime: number;
}

let toastCallback: ((message: string, filename: string) => void) | null = null;
export const setDownloadToastCallback = (cb: (message: string, filename: string) => void) => {
    toastCallback = cb;
};

let allCompleteCallback: (() => void) | null = null;
export const setDownloadAllCompleteCallback = (cb: () => void) => {
    allCompleteCallback = cb;
};

interface DownloadManagerProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string;
}

let globalDownloads: DownloadItem[] = [];
let downloadListeners: ((downloads: DownloadItem[]) => void)[] = [];

const notifyListeners = () => {
    downloadListeners.forEach(fn => fn([...globalDownloads]));
};

export const addDownload = (url: string, filename: string) => {
    const download: DownloadItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url,
        filename,
        tempFilename: `${filename}.downloading`,
        savePath: null,
        status: 'pending',
        progress: 0,
        received: 0,
        total: 0,
        startTime: Date.now()
    };
    globalDownloads.unshift(download);
    notifyListeners();

    if (toastCallback) {
        toastCallback('Download started', filename);
    }

    return download.id;
};

export const cancelDownload = (id: string) => {
    const download = globalDownloads.find(d => d.id === id);
    if (download && (download.status === 'downloading' || download.status === 'pending' || download.status === 'paused')) {
        (window as any).api?.cancelDownload?.(download.filename);
        updateDownload(id, { status: 'cancelled' });
    }
};

export const pauseDownload = (id: string) => {
    const download = globalDownloads.find(d => d.id === id);
    if (download && download.status === 'downloading') {
        (window as any).api?.pauseDownload?.(download.filename);
        updateDownload(id, { status: 'paused' });
    }
};

export const resumeDownload = (id: string) => {
    const download = globalDownloads.find(d => d.id === id);
    if (download && download.status === 'paused') {
        (window as any).api?.resumeDownload?.(download.filename);
        updateDownload(id, { status: 'downloading' });
    }
};

export const deleteDownload = (id: string) => {
    globalDownloads = globalDownloads.filter(d => d.id !== id);
    notifyListeners();
};

let previousActiveCount = 0;

export const updateDownload = (id: string, updates: Partial<DownloadItem>) => {
    const idx = globalDownloads.findIndex(d => d.id === id);
    if (idx !== -1) {
        const prevActive = globalDownloads.filter(d => d.status === 'pending' || d.status === 'downloading').length;
        globalDownloads[idx] = { ...globalDownloads[idx], ...updates };
        notifyListeners();
        const nowActive = globalDownloads.filter(d => d.status === 'pending' || d.status === 'downloading').length;
        const hasCompleted = globalDownloads.some(d => d.status === 'completed');
        if (prevActive > 0 && nowActive === 0 && hasCompleted && allCompleteCallback) {
            allCompleteCallback();
        }
    }
};

export const getActiveDownloadsCount = () => {
    return globalDownloads.filter(d => d.status === 'pending' || d.status === 'downloading').length;
};

const DownloadManager: React.FC<DownloadManagerProps> = ({ isOpen, onClose, currentPath }) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>(globalDownloads);
    const [saveDir, setSaveDir] = useState(currentPath);

    useEffect(() => {
        setSaveDir(currentPath);
    }, [currentPath]);

    useEffect(() => {
        const listener = (newDownloads: DownloadItem[]) => setDownloads(newDownloads);
        downloadListeners.push(listener);
        return () => {
            downloadListeners = downloadListeners.filter(l => l !== listener);
        };
    }, []);

    useEffect(() => {
        const api = (window as any).api;

        const handleDownloadRequested = async (data: { url: string; filename: string }) => {
            const id = addDownload(data.url, data.filename);

            try {
                updateDownload(id, { status: 'downloading', savePath: null });

                const result = await api?.browserSaveLink?.(data.url, data.filename, saveDir);

                if (result?.success) {
                    updateDownload(id, {
                        status: 'completed',
                        progress: 100,
                        savePath: result.path
                    });
                } else if (result?.canceled) {
                    updateDownload(id, { status: 'cancelled' });
                } else {
                    updateDownload(id, {
                        status: 'failed',
                        error: result?.error || 'Download failed'
                    });
                }
            } catch (err: any) {
                updateDownload(id, {
                    status: 'failed',
                    error: err.message
                });
            }
        };

        const handleProgress = (data: { filename: string; received: number; total: number; percent: number }) => {
            const download = globalDownloads.find(d => d.filename === data.filename && d.status === 'downloading');
            if (download) {
                updateDownload(download.id, {
                    received: data.received,
                    total: data.total,
                    progress: data.percent
                });
            }
        };

        const handleComplete = (data: { filename: string; path: string; state: string; error?: string }) => {
            const download = globalDownloads.find(d => d.filename === data.filename &&
                (d.status === 'downloading' || d.status === 'pending'));
            if (download) {
                updateDownload(download.id, {
                    status: data.state === 'completed' ? 'completed' : 'failed',
                    progress: data.state === 'completed' ? 100 : download.progress,
                    savePath: data.path,
                    error: data.error
                });
            }
        };

        const unsubRequest = api?.onBrowserDownloadRequested?.(handleDownloadRequested);
        const unsubProgress = api?.onDownloadProgress?.(handleProgress);
        const unsubComplete = api?.onDownloadComplete?.(handleComplete);

        return () => {
            unsubRequest?.();
            unsubProgress?.();
            unsubComplete?.();
        };
    }, [saveDir]);

    const clearCompleted = useCallback(() => {
        globalDownloads = globalDownloads.filter(d => d.status === 'downloading' || d.status === 'pending');
        notifyListeners();
    }, []);

    const openFile = useCallback((path: string) => {
        (window as any).api?.openFile?.(path);
    }, []);

    const openFolder = useCallback((filePath: string) => {
        (window as any).api?.showItemInFolder?.(filePath);
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-[600px] max-h-[80vh] theme-bg-primary rounded-lg shadow-xl border theme-border flex flex-col">
                <div className="flex items-center justify-between p-4 border-b theme-border">
                    <div className="flex items-center gap-2">
                        <Download size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold theme-text-primary">Downloads</h2>
                        {getActiveDownloadsCount() > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                                {getActiveDownloadsCount()} active
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {downloads.some(d => d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled') && (
                            <button
                                onClick={clearCompleted}
                                className="text-xs px-2 py-1 theme-hover rounded flex items-center gap-1"
                            >
                                <Trash2 size={12} />
                                Clear completed
                            </button>
                        )}
                        <button onClick={onClose} className="p-1 theme-hover rounded">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="px-4 py-2 border-b theme-border bg-gray-800/30">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <FolderOpen size={12} />
                        <span>Saving to: {saveDir}</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {downloads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                            <Download size={48} className="mb-4 opacity-30" />
                            <p>No downloads yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {downloads.map(download => (
                                <div
                                    key={download.id}
                                    className="p-3 theme-bg-secondary rounded-lg border theme-border"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {download.status === 'completed' && (
                                                    <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                                                )}
                                                {download.status === 'failed' && (
                                                    <XCircle size={14} className="text-red-400 flex-shrink-0" />
                                                )}
                                                {download.status === 'cancelled' && (
                                                    <XCircle size={14} className="text-gray-400 flex-shrink-0" />
                                                )}
                                                {download.status === 'downloading' && (
                                                    <Loader size={14} className="text-blue-400 flex-shrink-0 animate-spin" />
                                                )}
                                                {download.status === 'pending' && (
                                                    <Loader size={14} className="text-yellow-400 flex-shrink-0 animate-spin" />
                                                )}
                                                {download.status === 'paused' && (
                                                    <Pause size={14} className="text-yellow-400 flex-shrink-0" />
                                                )}
                                                <span className="font-medium theme-text-primary truncate">
                                                    {(download.status === 'downloading' || download.status === 'pending' || download.status === 'paused')
                                                        ? download.tempFilename || `${download.filename}.downloading`
                                                        : download.filename}
                                                </span>
                                            </div>

                                            {(download.status === 'downloading' || download.status === 'paused') && (
                                                <div className="mt-2">
                                                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-300 ${download.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                                            style={{ width: `${download.progress}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between mt-1 text-xs text-gray-400">
                                                        <span>{formatBytes(download.received)} / {formatBytes(download.total)}</span>
                                                        <span>{download.progress}% {download.status === 'paused' && '(Paused)'}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {download.status === 'failed' && download.error && (
                                                <p className="text-xs text-red-400 mt-1">{download.error}</p>
                                            )}

                                            {download.status === 'completed' && download.savePath && (
                                                <p className="text-xs text-gray-400 mt-1 truncate">{download.savePath}</p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <span className="text-xs text-gray-500">
                                                {formatTime(Date.now() - download.startTime)}
                                            </span>

                                            {download.status === 'downloading' && (
                                                <>
                                                    <button
                                                        onClick={() => pauseDownload(download.id)}
                                                        className="p-1 theme-hover rounded text-yellow-400"
                                                        title="Pause"
                                                    >
                                                        <Pause size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => cancelDownload(download.id)}
                                                        className="p-1 theme-hover rounded text-red-400"
                                                        title="Stop"
                                                    >
                                                        <Square size={14} />
                                                    </button>
                                                </>
                                            )}

                                            {download.status === 'paused' && (
                                                <>
                                                    <button
                                                        onClick={() => resumeDownload(download.id)}
                                                        className="p-1 theme-hover rounded text-green-400"
                                                        title="Resume"
                                                    >
                                                        <Play size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => cancelDownload(download.id)}
                                                        className="p-1 theme-hover rounded text-red-400"
                                                        title="Stop"
                                                    >
                                                        <Square size={14} />
                                                    </button>
                                                </>
                                            )}

                                            {download.status === 'pending' && (
                                                <button
                                                    onClick={() => cancelDownload(download.id)}
                                                    className="p-1 theme-hover rounded text-red-400"
                                                    title="Cancel"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}

                                            {(download.status === 'completed' || download.status === 'failed' || download.status === 'cancelled') && (
                                                <button
                                                    onClick={() => deleteDownload(download.id)}
                                                    className="p-1 theme-hover rounded text-gray-400"
                                                    title="Remove from list"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}

                                            {download.status === 'completed' && download.savePath && (
                                                <>
                                                    <button
                                                        onClick={() => openFile(download.savePath!)}
                                                        className="p-1 theme-hover rounded"
                                                        title="Open file"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => openFolder(download.savePath!)}
                                                        className="p-1 theme-hover rounded"
                                                        title="Open folder"
                                                    >
                                                        <FolderOpen size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DownloadManager;
