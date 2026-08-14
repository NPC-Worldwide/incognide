import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Search, Trash2, ChevronRight, ChevronDown, Folder, MoreVertical, AlertTriangle, Play, Link2, BrainCircuit } from 'lucide-react';

interface Location {
    path: string;
    directory: string;
    knowledge_enabled: boolean;
    index_files: boolean;
    link_knowledge: boolean;
    extract_memories: boolean;
    auto_index: boolean;
    discovered_from: string;
    last_seen_at: string | null;
    memoryCount?: number;
    knowledgeCount?: number;
    conceptCount?: number;
    linkCount?: number;
    lastExtractedAt?: string | null;
    hasStoreFile?: boolean;
    staleReasons?: string[];
}

interface TreeNode {
    name: string;
    path: string;
    children: Record<string, TreeNode>;
    isLeaf: boolean;
    location?: Location;
}

function buildTree(locations: Location[]): TreeNode {
    const root: TreeNode = { name: '', path: '', children: {}, isLeaf: false };
    for (const loc of locations) {
        const parts = loc.directory.split('/').filter(Boolean);
        let node = root;
        let built = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            built = built ? `${built}/${part}` : `/${part}`;
            if (!node.children[part]) {
                node.children[part] = {
                    name: part,
                    path: built,
                    children: {},
                    isLeaf: i === parts.length - 1,
                    location: i === parts.length - 1 ? loc : undefined,
                };
            }
            node = node.children[part];
        }
        node.isLeaf = true;
        node.location = loc;
    }
    return root;
}

interface Props {
    onSaved?: () => void;
}

const StoreRegistryPanel: React.FC<Props> = ({ onSaved }) => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [menuOpen, setMenuOpen] = useState<string | null>(null);

    const api = (window as any).api;

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api?.indexLocationsList?.();
            const list = (r?.locations || []) as Location[];
            const enriched = await Promise.all(list.map(async (loc) => {
                try {
                    const store = await api?.scanKnowledgeStores?.(loc.directory);
                    const found = store?.stores?.find((s: any) => s.directory === loc.directory);
                    if (found) {
                        return { ...loc, ...found, hasStoreFile: true };
                    }
                } catch {}
                return { ...loc, hasStoreFile: false };
            }));
            setLocations(enriched);
            const allPaths = new Set<string>();
            for (const s of enriched) {
                const parts = s.directory.split('/').filter(Boolean);
                let built = '';
                for (const part of parts) {
                    built = built ? `${built}/${part}` : `/${part}`;
                    allPaths.add(built);
                }
            }
            setExpanded(allPaths);
        } catch (err) {
            console.error('Error loading index locations:', err);
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const toggleExpanded = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const updateLocation = async (dir: string, updates: Partial<Location>) => {
        try {
            await api?.indexLocationsUpdate?.(dir, updates);
            await refresh();
            onSaved?.();
        } catch (err) {
            console.error('Error updating index location:', err);
        }
    };

    const handleEnable = async (dir: string) => {
        try {
            await api?.indexLocationsEnable?.(dir);
            await refresh();
            onSaved?.();
        } catch (err) {
            console.error('Error enabling knowledge location:', err);
        }
    };

    const handleReset = async (dir: string) => {
        if (!confirm(`Reset knowledge store for ${dir}? This deletes its .knowledge.yaml and starts fresh.`)) return;
        try {
            await api?.indexLocationsReset?.(dir);
            await refresh();
            onSaved?.();
        } catch (err) {
            console.error('Error resetting knowledge store:', err);
        }
    };

    const handleRunIndex = async (dir: string) => {
        try {
            await api?.kgPipelineRun?.({ step: 'assimilate', storePaths: [dir] });
        } catch (err) {
            console.error('Error running index:', err);
        }
    };

    const toggleStore = (dir: string, field: keyof Location) => async (e: React.ChangeEvent<HTMLInputElement>) => {
        await updateLocation(dir, { [field]: e.target.checked } as any);
    };

    const sourceLabel = (source?: string) => {
        if (!source) return 'unknown';
        const labels: Record<string, string> = {
            recent: 'recent',
            workspace: 'workspace',
            conversation: 'chat',
            terminal: 'terminal',
            registry: 'registry',
            bookmark: 'bookmark',
            browser: 'browser',
            manual: 'manual',
        };
        return labels[source] || source;
    };

    const renderLocationRow = (loc: Location) => {
        const enabled = loc.knowledge_enabled;
        const stale = (loc.staleReasons?.length || 0) > 0;
        return (
            <div key={loc.directory} className="flex flex-col gap-1 px-2 py-2 border-b border-gray-700/30 last:border-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0">📁</span>
                    <span className="flex-1 text-xs font-mono truncate theme-text-secondary" title={loc.directory}>
                        {loc.directory}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 theme-text-muted capitalize">
                        {sourceLabel(loc.discovered_from)}
                    </span>
                    {stale && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1" title={loc.staleReasons?.join(', ')}>
                            <AlertTriangle size={10} /> stale
                        </span>
                    )}
                    <button
                        onClick={() => setMenuOpen(menuOpen === loc.directory ? null : loc.directory)}
                        className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded shrink-0"
                        title="Actions"
                    >
                        <MoreVertical size={12} />
                    </button>
                </div>

                {!enabled ? (
                    <div className="flex items-center justify-between pl-5">
                        <span className="text-[10px] theme-text-muted">Not building knowledge</span>
                        <button
                            onClick={() => handleEnable(loc.directory)}
                            className="px-2 py-0.5 text-[10px] bg-green-700 hover:bg-green-600 text-white rounded font-medium"
                        >
                            Start building knowledge
                        </button>
                    </div>
                ) : (
                    <div className="pl-5 flex flex-col gap-1">
                        <div className="flex items-center gap-3 text-[10px]">
                            <label className="flex items-center gap-1 cursor-pointer theme-text-muted">
                                <input type="checkbox" checked={loc.index_files} onChange={toggleStore(loc.directory, 'index_files')} className="accent-green-500" />
                                Index files
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer theme-text-muted">
                                <input type="checkbox" checked={loc.link_knowledge} onChange={toggleStore(loc.directory, 'link_knowledge')} className="accent-green-500" />
                                Link
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer theme-text-muted">
                                <input type="checkbox" checked={loc.extract_memories} onChange={toggleStore(loc.directory, 'extract_memories')} className="accent-green-500" />
                                Extract
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer theme-text-muted">
                                <input type="checkbox" checked={loc.auto_index} onChange={toggleStore(loc.directory, 'auto_index')} className="accent-green-500" />
                                Auto
                            </label>
                        </div>
                        {(loc.memoryCount || loc.conceptCount || loc.linkCount) ? (
                            <span className="text-[9px] theme-text-muted">
                                M{loc.memoryCount ?? 0} · C{loc.conceptCount ?? 0} · L{loc.linkCount ?? 0}
                                {loc.lastExtractedAt ? ` · indexed ${new Date(loc.lastExtractedAt).toLocaleDateString()}` : ''}
                            </span>
                        ) : null}
                    </div>
                )}

                {menuOpen === loc.directory && (
                    <div className="pl-5 flex flex-wrap items-center gap-1">
                        {enabled && (
                            <button
                                onClick={() => { handleRunIndex(loc.directory); setMenuOpen(null); }}
                                className="px-2 py-0.5 text-[10px] bg-blue-700 hover:bg-blue-600 text-white rounded flex items-center gap-1"
                            >
                                <Play size={10} /> Run index
                            </button>
                        )}
                        <button
                            onClick={() => { handleReset(loc.directory); setMenuOpen(null); }}
                            className="px-2 py-0.5 text-[10px] bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded flex items-center gap-1"
                        >
                            <RefreshCw size={10} /> Reinitialize
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const tree = buildTree(locations);

    const renderNode = (node: TreeNode, depth: number) => {
        const children = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(node.path);

        if (node.isLeaf && !hasChildren && node.location) {
            return (
                <div key={node.path} style={{ paddingLeft: depth * 12 }}>
                    {renderLocationRow(node.location)}
                </div>
            );
        }

        return (
            <div key={node.path}>
                <div
                    className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-800/40"
                    onClick={() => toggleExpanded(node.path)}
                >
                    <span style={{ width: depth * 12 }} />
                    {isExpanded ? (
                        <ChevronDown size={12} className="text-gray-500 shrink-0" />
                    ) : (
                        <ChevronRight size={12} className="text-gray-500 shrink-0" />
                    )}
                    <Folder size={12} className="text-gray-500 shrink-0" />
                    <span className="text-xs font-semibold theme-text-primary">{node.name || 'root'}</span>
                    {node.isLeaf && node.location?.knowledge_enabled && (
                        <span className="text-[10px] theme-text-muted shrink-0 ml-1">building knowledge</span>
                    )}
                </div>
                {isExpanded && (
                    <div>
                        {children.map((child) => renderNode(child, depth + 1))}
                        {node.isLeaf && node.location && renderLocationRow(node.location)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-gray-900/30 border-b theme-border">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold theme-text-primary flex items-center gap-1">
                    <BrainCircuit size={12} className="text-green-400" />
                    Knowledge Locations
                </span>
                <span className="text-[10px] theme-text-muted">{locations.filter(l => l.knowledge_enabled).length}/{locations.length} active</span>
            </div>

            <div className="max-h-72 overflow-y-auto border border-gray-700/50 rounded">
                {locations.length === 0 && !loading && (
                    <div className="text-xs theme-text-muted italic px-2 py-2">No locations discovered.</div>
                )}
                {Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)).map((child) => renderNode(child, 0))}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-medium flex items-center gap-1 disabled:opacity-50"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Rescan
                </button>
            </div>
        </div>
    );
};

export default StoreRegistryPanel;
