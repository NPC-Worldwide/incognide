import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, X, Save, FolderOpen, Trash, RefreshCw, Plus, Play, Square, Focus, Minimize2, Maximize2, ArrowRightLeft, ChevronDown, ChevronRight, Eye } from 'lucide-react';

interface WindowInfo {
    windowId: number;
    folderPath: string | null;
    title: string;
    bounds: { x: number; y: number; width: number; height: number };
    display: number;
    isMinimized?: boolean;
    isMaximized?: boolean;
    isFocused?: boolean;
}

interface DisplayInfo {
    id: number;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    workArea: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    isPrimary: boolean;
    size: { width: number; height: number };
}

interface WindowPresetEntry {
    folderPath: string;
    bounds: { x: number; y: number; width: number; height: number };
    workspace: any | null;
}

interface WindowPreset {
    name: string;
    windows: WindowPresetEntry[];
    savedAt: number;
}

const STORAGE_KEY = 'incognide_windowPresets';

function loadPresets(): WindowPreset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const old = localStorage.getItem('incognide_windowSets');
        if (!raw && old) {
            const oldSets = JSON.parse(old);
            return oldSets.map((s: any) => ({
                name: s.name,
                windows: (s.folders || []).map((f: string) => ({
                    folderPath: f,
                    bounds: { x: 0, y: 0, width: 1200, height: 800 },
                    workspace: null,
                })),
                savedAt: s.savedAt || Date.now(),
            }));
        }
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePresets(presets: WindowPreset[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

const WindowManagerPane: React.FC = () => {
    const [windows, setWindows] = useState<WindowInfo[]>([]);
    const [displays, setDisplays] = useState<DisplayInfo[]>([]);
    const [presets, setPresets] = useState<WindowPreset[]>(loadPresets);
    const [newPresetName, setNewPresetName] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [launching, setLaunching] = useState<string | null>(null);
    const [displaysCollapsed, setDisplaysCollapsed] = useState(false);
    const [windowsCollapsed, setWindowsCollapsed] = useState(false);
    const [presetsCollapsed, setPresetsCollapsed] = useState(false);
    const [moveDropdown, setMoveDropdown] = useState<number | null>(null);

    const api = (window as any).api;

    const refreshWindows = useCallback(async () => {
        setLoading(true);
        try {
            const info = await api?.getAllWindowsInfo?.();
            if (Array.isArray(info)) setWindows(info);
        } catch (err) {
            console.error('Failed to get windows info:', err);
        }
        try {
            const displayInfo = await api?.getDisplays?.();
            if (Array.isArray(displayInfo)) setDisplays(displayInfo);
        } catch (err) {
            console.error('Failed to get displays:', err);
        }
        setLoading(false);
    }, [api]);

    useEffect(() => {
        refreshWindows();
        const interval = setInterval(refreshWindows, 5000);
        return () => clearInterval(interval);
    }, [refreshWindows]);

    const handleFocusWindow = useCallback(async (windowId: number) => {
        try {
            await api?.focusWindowById?.(windowId);
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to focus window:', err);
        }
    }, [api, refreshWindows]);

    const handleMinimizeWindow = useCallback(async (windowId: number) => {
        try {
            await api?.minimizeWindowById?.(windowId);
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to minimize window:', err);
        }
    }, [api, refreshWindows]);

    const handleMaximizeWindow = useCallback(async (windowId: number) => {
        try {
            await api?.maximizeWindowById?.(windowId);
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to maximize window:', err);
        }
    }, [api, refreshWindows]);

    const handleCloseWindow = useCallback(async (windowId: number) => {
        try {
            await api?.closeWindowById?.(windowId);
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to close window:', err);
        }
    }, [api, refreshWindows]);

    const handleMoveToDisplay = useCallback(async (windowId: number, displayId: number) => {
        try {
            await api?.moveWindowToDisplay?.(windowId, displayId);
            setMoveDropdown(null);
            setTimeout(refreshWindows, 300);
        } catch (err) {
            console.error('Failed to move window:', err);
        }
    }, [api, refreshWindows]);

    const handleSavePreset = useCallback(async () => {
        const name = newPresetName.trim();
        if (!name) return;
        const validWindows = windows.filter(w => w.folderPath);
        if (validWindows.length === 0) return;

        setSaving(true);
        try {
            const entries: WindowPresetEntry[] = [];
            for (const w of validWindows) {
                let workspace = null;
                try { workspace = await api?.requestWindowWorkspace?.(w.windowId); } catch {}
                entries.push({ folderPath: w.folderPath!, bounds: w.bounds, workspace });
            }
            const newPreset: WindowPreset = { name, windows: entries, savedAt: Date.now() };
            const updated = [...presets.filter(p => p.name !== name), newPreset];
            setPresets(updated);
            savePresets(updated);
            setNewPresetName('');
        } finally {
            setSaving(false);
        }
    }, [newPresetName, windows, presets, api]);

    const handleLaunchPreset = useCallback(async (preset: WindowPreset) => {
        setLaunching(preset.name);
        try {
            for (const entry of preset.windows) {
                const windowId = await api?.openNewWindow?.(entry.folderPath, {
                    bounds: entry.bounds,
                    skipDedup: true,
                });
                if (entry.workspace && windowId) {
                    setTimeout(async () => {
                        try { await api?.restoreWindowWorkspace?.(windowId, entry.workspace); } catch (e) {
                            console.error('Failed to restore workspace for window:', e);
                        }
                    }, 2000);
                }
            }
            setTimeout(refreshWindows, 1000);
        } finally {
            setTimeout(() => setLaunching(null), 500);
        }
    }, [api, refreshWindows]);

    const handleDeletePreset = useCallback((name: string) => {
        const updated = presets.filter(p => p.name !== name);
        setPresets(updated);
        savePresets(updated);
    }, [presets]);

    const displayGroups = new Map<number, WindowInfo[]>();
    for (const w of windows) {
        const d = w.display ?? 0;
        if (!displayGroups.has(d)) displayGroups.set(d, []);
        displayGroups.get(d)!.push(w);
    }

    const folderCount = windows.filter(w => w.folderPath).length;

    const SectionHeader = ({ title, count, collapsed, onToggle, color = 'teal' }: {
        title: string; count?: number; collapsed: boolean; onToggle: () => void; color?: string;
    }) => (
        <button
            onClick={onToggle}
            className={`flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wide theme-text-muted mb-2 hover:text-${color}-400 transition-colors`}
        >
            <ChevronRight size={12} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            {title}
            {count !== undefined && <span className="text-[10px] font-normal opacity-60">({count})</span>}
        </button>
    );

    return (
        <div className="h-full flex flex-col theme-bg-primary theme-text-primary overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b theme-border shrink-0">
                <Monitor size={18} className="text-teal-400" />
                <span className="font-semibold text-sm">Window Manager</span>
                <div className="flex-1" />
                <span className="text-[10px] theme-text-muted">
                    {windows.length} window{windows.length !== 1 ? 's' : ''} · {displays.length} display{displays.length !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={refreshWindows}
                    className="p-1.5 rounded hover:bg-teal-500/20 transition-all theme-text-muted"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">

                <div>
                    <SectionHeader title="Displays" count={displays.length} collapsed={displaysCollapsed} onToggle={() => setDisplaysCollapsed(!displaysCollapsed)} color="blue" />
                    {!displaysCollapsed && (
                        displays.length === 0 ? (
                            <p className="text-xs theme-text-muted italic">No display info available</p>
                        ) : (
                            <div className="space-y-1.5">
                                {displays.map(d => (
                                    <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded theme-bg-secondary text-xs">
                                        <Monitor size={14} className={d.isPrimary ? 'text-blue-400' : 'text-gray-500'} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-medium">{d.label || `Display ${d.id}`}</span>
                                                {d.isPrimary && (
                                                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">Primary</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] theme-text-muted">
                                                {d.size.width}×{d.size.height} · {d.scaleFactor}x scale · Work area: {d.workArea.width}×{d.workArea.height}
                                            </div>
                                        </div>
                                        <span className="text-[10px] theme-text-muted shrink-0">
                                            {displayGroups.get(d.id)?.length || 0} win
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                <div>
                    <SectionHeader title="Open Windows" count={windows.length} collapsed={windowsCollapsed} onToggle={() => setWindowsCollapsed(!windowsCollapsed)} />
                    {!windowsCollapsed && (
                        windows.length === 0 ? (
                            <p className="text-xs theme-text-muted italic">No windows detected</p>
                        ) : (
                            <div className="space-y-3">
                                {[...displayGroups.entries()].map(([displayId, wins]) => {
                                    const displayInfo = displays.find(d => d.id === displayId);
                                    return (
                                        <div key={displayId}>
                                            <div className="flex items-center gap-1 mb-1">
                                                <Monitor size={11} className="text-blue-400" />
                                                <span className="text-[10px] text-blue-400 font-medium">
                                                    {displayInfo?.label || `Display ${displayId}`}
                                                    {displayInfo?.isPrimary && ' (Primary)'}
                                                </span>
                                                <span className="text-[10px] theme-text-muted">
                                                    — {wins.length} window{wins.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div className="space-y-1 pl-2 border-l border-blue-500/20">
                                                {wins.map((w) => (
                                                    <div
                                                        key={w.windowId}
                                                        className="flex items-center gap-2 px-3 py-2 rounded theme-bg-secondary text-sm group"
                                                    >
                                                        <FolderOpen size={14} className="text-teal-400 shrink-0" />
                                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleFocusWindow(w.windowId)} title="Click to bring forward">
                                                            <div className="truncate font-medium text-xs">
                                                                {w.title || 'Untitled'}
                                                            </div>
                                                            {w.folderPath && (
                                                                <div className="truncate text-[10px] theme-text-muted">
                                                                    {w.folderPath}
                                                                </div>
                                                            )}
                                                            <div className="text-[9px] theme-text-muted">
                                                                {w.bounds.width}×{w.bounds.height} at ({w.bounds.x}, {w.bounds.y})
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            <button
                                                                onClick={() => handleFocusWindow(w.windowId)}
                                                                className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-teal-500/20 text-teal-400 transition-all"
                                                                title="Bring to front"
                                                            >
                                                                <Eye size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMinimizeWindow(w.windowId)}
                                                                className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-yellow-500/20 text-yellow-400 transition-all"
                                                                title="Minimize"
                                                            >
                                                                <Minimize2 size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMaximizeWindow(w.windowId)}
                                                                className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-blue-500/20 text-blue-400 transition-all"
                                                                title="Maximize / Restore"
                                                            >
                                                                <Maximize2 size={13} />
                                                            </button>
                                                            {displays.length > 1 && (
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={() => setMoveDropdown(moveDropdown === w.windowId ? null : w.windowId)}
                                                                        className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-purple-500/20 text-purple-400 transition-all"
                                                                        title="Move to display"
                                                                    >
                                                                        <ArrowRightLeft size={13} />
                                                                    </button>
                                                                    {moveDropdown === w.windowId && (
                                                                        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 min-w-[140px]">
                                                                            {displays
                                                                                .filter(d => d.id !== displayId)
                                                                                .map(d => (
                                                                                    <button
                                                                                        key={d.id}
                                                                                        onClick={() => handleMoveToDisplay(w.windowId, d.id)}
                                                                                        className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-purple-500/20 text-gray-300 flex items-center gap-1.5"
                                                                                    >
                                                                                        <Monitor size={11} className={d.isPrimary ? 'text-blue-400' : 'text-gray-500'} />
                                                                                        {d.label || `Display ${d.id}`}
                                                                                        {d.isPrimary && <span className="text-[9px] text-blue-400">(primary)</span>}
                                                                                    </button>
                                                                                ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => handleCloseWindow(w.windowId)}
                                                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                                                title="Close window"
                                                            >
                                                                <X size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                </div>

                <div>
                    <SectionHeader title="Save Multi-Window Preset" collapsed={false} onToggle={() => {}} />
                    <p className="text-[10px] theme-text-muted mb-2">
                        Saves all open windows with their positions, sizes, and pane layouts.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                            placeholder="Preset name..."
                            className="flex-1 px-3 py-1.5 rounded border theme-border theme-bg-secondary text-sm theme-text-primary"
                        />
                        <button
                            onClick={handleSavePreset}
                            disabled={!newPresetName.trim() || folderCount === 0 || saving}
                            className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-sm disabled:opacity-40 transition-all flex items-center gap-1"
                        >
                            <Save size={14} />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>

                <div>
                    <SectionHeader title="Saved Presets" count={presets.length} collapsed={presetsCollapsed} onToggle={() => setPresetsCollapsed(!presetsCollapsed)} />
                    {!presetsCollapsed && (
                        presets.length === 0 ? (
                            <p className="text-xs theme-text-muted italic">No saved presets</p>
                        ) : (
                            <div className="space-y-2">
                                {presets.map((preset) => (
                                    <div
                                        key={preset.name}
                                        className="px-3 py-2 rounded theme-bg-secondary border theme-border"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-sm">{preset.name}</span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleLaunchPreset(preset)}
                                                    disabled={launching === preset.name}
                                                    className="p-1 rounded hover:bg-teal-500/20 text-teal-400 transition-all"
                                                    title="Launch this preset"
                                                >
                                                    {launching === preset.name
                                                        ? <RefreshCw size={14} className="animate-spin" />
                                                        : <Play size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePreset(preset.name)}
                                                    className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-all"
                                                    title="Delete this preset"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-xs theme-text-muted">
                                            {preset.windows.length} window{preset.windows.length !== 1 ? 's' : ''}
                                            {preset.windows.some(w => w.workspace) && ' (with layouts)'}
                                            <span className="mx-1">·</span>
                                            {new Date(preset.savedAt).toLocaleDateString()}
                                        </div>
                                        <div className="mt-1 space-y-0.5">
                                            {preset.windows.map((entry, i) => (
                                                <div key={i} className="text-[10px] theme-text-muted truncate pl-2 border-l-2 border-teal-500/30 flex items-center gap-1">
                                                    <span className="truncate">{entry.folderPath}</span>
                                                    <span className="shrink-0 text-[9px] opacity-60">
                                                        {entry.bounds.width}×{entry.bounds.height}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default WindowManagerPane;
