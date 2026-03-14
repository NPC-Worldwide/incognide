import React, { useState, useEffect, useCallback } from 'react';
import { Layers, X, Save, FolderOpen, Trash, RefreshCw, Plus } from 'lucide-react';

interface WindowInfo {
    windowId: number;
    folderPath: string | null;
    title: string;
}

interface WindowSet {
    name: string;
    folders: string[];
    savedAt: number;
}

const STORAGE_KEY = 'incognide_windowSets';

function loadWindowSets(): WindowSet[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveWindowSets(sets: WindowSet[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

const WindowManagerPane: React.FC = () => {
    const [windows, setWindows] = useState<WindowInfo[]>([]);
    const [windowSets, setWindowSets] = useState<WindowSet[]>(loadWindowSets);
    const [newSetName, setNewSetName] = useState('');
    const [loading, setLoading] = useState(false);

    const api = (window as any).api;

    const refreshWindows = useCallback(async () => {
        setLoading(true);
        try {
            const info = await api?.getAllWindowsInfo?.();
            if (Array.isArray(info)) {
                setWindows(info);
            }
        } catch (err) {
            console.error('Failed to get windows info:', err);
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        refreshWindows();
    }, [refreshWindows]);

    const handleCloseWindow = useCallback(async (windowId: number) => {
        try {
            await api?.closeWindowById?.(windowId);
            // Refresh after a short delay to let the window close
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to close window:', err);
        }
    }, [api, refreshWindows]);

    const handleSaveSet = useCallback(() => {
        const name = newSetName.trim();
        if (!name) return;

        const folders = windows
            .map(w => w.folderPath)
            .filter((f): f is string => !!f);

        if (folders.length === 0) return;

        const newSet: WindowSet = { name, folders, savedAt: Date.now() };
        const updated = [...windowSets.filter(s => s.name !== name), newSet];
        setWindowSets(updated);
        saveWindowSets(updated);
        setNewSetName('');
    }, [newSetName, windows, windowSets]);

    const handleLoadSet = useCallback(async (set: WindowSet) => {
        for (const folder of set.folders) {
            try {
                await api?.openNewWindow?.(folder);
            } catch (err) {
                console.error('Failed to open window for folder:', folder, err);
            }
        }
        setTimeout(refreshWindows, 500);
    }, [api, refreshWindows]);

    const handleDeleteSet = useCallback((name: string) => {
        const updated = windowSets.filter(s => s.name !== name);
        setWindowSets(updated);
        saveWindowSets(updated);
    }, [windowSets]);

    const folderCount = windows.filter(w => w.folderPath).length;

    return (
        <div className="h-full flex flex-col theme-bg-primary theme-text-primary overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b theme-border shrink-0">
                <Layers size={18} className="text-teal-400" />
                <span className="font-semibold text-sm">Window Manager</span>
                <div className="flex-1" />
                <button
                    onClick={refreshWindows}
                    className="p-1.5 rounded hover:bg-teal-500/20 transition-all theme-text-muted"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Open Windows Section */}
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide theme-text-muted mb-2">
                        Open Windows ({windows.length})
                    </h3>
                    {windows.length === 0 ? (
                        <p className="text-xs theme-text-muted italic">No windows detected</p>
                    ) : (
                        <div className="space-y-1">
                            {windows.map((w) => (
                                <div
                                    key={w.windowId}
                                    className="flex items-center gap-2 px-3 py-2 rounded theme-bg-secondary text-sm group"
                                >
                                    <FolderOpen size={14} className="text-teal-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate font-medium text-xs">
                                            {w.title || 'Untitled'}
                                        </div>
                                        {w.folderPath && (
                                            <div className="truncate text-xs theme-text-muted">
                                                {w.folderPath}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleCloseWindow(w.windowId)}
                                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all shrink-0"
                                        title="Close this window"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save Current Set */}
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide theme-text-muted mb-2">
                        Save Current Windows as Set
                    </h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newSetName}
                            onChange={(e) => setNewSetName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSet(); }}
                            placeholder="Set name..."
                            className="flex-1 px-3 py-1.5 rounded border theme-border theme-bg-secondary text-sm theme-text-primary"
                        />
                        <button
                            onClick={handleSaveSet}
                            disabled={!newSetName.trim() || folderCount === 0}
                            className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-sm disabled:opacity-40 transition-all flex items-center gap-1"
                            title={folderCount === 0 ? 'No windows with folders to save' : 'Save window set'}
                        >
                            <Save size={14} />
                            Save
                        </button>
                    </div>
                    {folderCount === 0 && windows.length > 0 && (
                        <p className="text-xs theme-text-muted mt-1 italic">
                            No windows have workspace folders set.
                        </p>
                    )}
                </div>

                {/* Saved Window Sets */}
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide theme-text-muted mb-2">
                        Saved Window Sets ({windowSets.length})
                    </h3>
                    {windowSets.length === 0 ? (
                        <p className="text-xs theme-text-muted italic">No saved window sets</p>
                    ) : (
                        <div className="space-y-2">
                            {windowSets.map((set) => (
                                <div
                                    key={set.name}
                                    className="px-3 py-2 rounded theme-bg-secondary border theme-border"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-sm">{set.name}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleLoadSet(set)}
                                                className="p-1 rounded hover:bg-teal-500/20 text-teal-400 transition-all"
                                                title="Load this window set"
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSet(set.name)}
                                                className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-all"
                                                title="Delete this window set"
                                            >
                                                <Trash size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs theme-text-muted">
                                        {set.folders.length} folder{set.folders.length !== 1 ? 's' : ''}
                                        <span className="mx-1">-</span>
                                        {new Date(set.savedAt).toLocaleDateString()}
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                        {set.folders.map((folder, i) => (
                                            <div key={i} className="text-xs theme-text-muted truncate pl-2 border-l-2 border-teal-500/30">
                                                {folder}
                                            </div>
                                        ))}
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

export default WindowManagerPane;
