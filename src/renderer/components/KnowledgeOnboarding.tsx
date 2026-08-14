import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrainCircuit, FolderOpen, Link2, Search, Sparkles, ChevronRight, ChevronLeft, X, RefreshCw, ChevronDown, Folder, Plus } from 'lucide-react';

interface KnowledgeLocation {
    directory: string;
    knowledge_enabled: boolean;
    index_files: boolean;
    link_knowledge: boolean;
    extract_memories: boolean;
    auto_index: boolean;
    discovered_from: string;
    staleReasons?: string[];
}

type OnboardingStep = 'intro' | 'select' | 'confirm' | 'done';

interface KnowledgeOnboardingProps {
    onComplete: () => void;
}

interface PathTreeNode {
    name: string;
    path: string;
    children: Record<string, PathTreeNode>;
    location?: KnowledgeLocation;
}

function buildPathTree(locations: KnowledgeLocation[]): PathTreeNode {
    const root: PathTreeNode = { name: '', path: '', children: {} };
    for (const loc of locations) {
        const normalized = loc.directory.replace(/\/$/, '');
        const parts = normalized.split('/').filter(Boolean);
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
                };
            }
            node = node.children[part];
        }
        node.location = loc;
    }
    return root;
}

function isUnder(childPath: string, parentPath: string): boolean {
    if (!parentPath) return false;
    const child = childPath.replace(/\/$/, '');
    const parent = parentPath.replace(/\/$/, '');
    return child !== parent && child.startsWith(parent + '/');
}

const KnowledgeOnboarding: React.FC<KnowledgeOnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<OnboardingStep>('intro');
    const [locations, setLocations] = useState<KnowledgeLocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [toggles, setToggles] = useState({
        index_files: true,
        link_knowledge: true,
        extract_memories: true,
        auto_index: false,
    });
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [customPath, setCustomPath] = useState('');
    const [customPathError, setCustomPathError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const api = (window as any).api;

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await api?.indexLocationsList?.();
            const list = (r?.locations || []) as KnowledgeLocation[];
            setLocations(list);
        } catch (err) {
            console.error('Failed to load knowledge locations:', err);
            setError('Could not load discovered folders. You can set this up later in Settings → Knowledge.');
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const activeLocations = useMemo(() => locations.filter((l) => l.knowledge_enabled), [locations]);

    const tree = useMemo(() => buildPathTree(locations), [locations]);

    const toggleExpanded = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const isPathCovered = (path: string) => {
        return Array.from(selected).some((s) => isUnder(path, s));
    };

    const isPathSelected = (path: string) => {
        return selected.has(path) || isPathCovered(path);
    };

    const selectPath = (path: string, includeChildren = true) => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const s of prev) {
                if (isUnder(s, path)) next.delete(s);
            }
            for (const s of prev) {
                if (isUnder(path, s)) next.delete(s);
            }
            next.add(path);
            return next;
        });
        if (includeChildren) setExpanded((prev) => new Set([...prev, path]));
    };

    const deselectPath = (path: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.delete(path);
            for (const s of prev) {
                if (isUnder(s, path)) next.delete(s);
            }
            return next;
        });
    };

    const togglePath = (path: string) => {
        if (isPathCovered(path)) {
            // Clicking a child covered by an ancestor narrows scope: keep only this path and drop the ancestor.
            setSelected((prev) => {
                const next = new Set(prev);
                for (const s of prev) {
                    if (isUnder(path, s) || s === path || isUnder(s, path)) next.delete(s);
                }
                next.add(path);
                return next;
            });
            setExpanded((prev) => new Set([...prev, path]));
        } else if (selected.has(path)) {
            deselectPath(path);
        } else {
            selectPath(path);
        }
    };

    const handleAddCustomPath = async () => {
        const trimmed = customPath.trim();
        if (!trimmed) return;
        setCustomPathError(null);
        try {
            await api?.indexLocationsUpdate?.(trimmed, { discovered_from: 'manual', knowledge_enabled: false });
            await refresh();
            setCustomPath('');
        } catch (err) {
            setCustomPathError(`Could not add ${trimmed}. Make sure the path exists and is accessible.`);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            for (const dir of selected) {
                await api?.indexLocationsUpdate?.(dir, {
                    knowledge_enabled: true,
                    index_files: toggles.index_files,
                    link_knowledge: toggles.link_knowledge,
                    extract_memories: toggles.extract_memories,
                    auto_index: toggles.auto_index,
                });
            }
            await api?.profileSave?.({ knowledgeOnboardingComplete: true });
            setStep('done');
        } catch (err) {
            console.error('Failed to save knowledge onboarding:', err);
            setError('Failed to enable knowledge. You can retry or configure it later in Settings → Knowledge.');
        } finally {
            setSaving(false);
        }
    };

    const handleSkip = async () => {
        try {
            await api?.profileSave?.({ knowledgeOnboardingComplete: true });
        } catch (err) {
            console.error('Failed to mark knowledge onboarding complete:', err);
        }
        onComplete();
    };

    const handleFinish = async () => {
        try {
            await api?.profileSave?.({ knowledgeOnboardingComplete: true });
        } catch (err) {
            console.error('Failed to mark knowledge onboarding complete:', err);
        }
        onComplete();
    };

    const close = () => {
        handleSkip();
    };

    const renderTreeNode = (node: PathTreeNode, depth = 0) => {
        const hasChildren = Object.keys(node.children).length > 0;
        const isExpanded = expanded.has(node.path);
        const isSelected = selected.has(node.path);
        const coveredByAncestor = !isSelected && Array.from(selected).some((s) => isUnder(node.path, s));
        const isChecked = isSelected || coveredByAncestor;

        return (
            <div key={node.path}>
                <div
                    className={`flex items-center gap-2 py-1 cursor-pointer transition-colors ${isChecked ? 'bg-green-900/20' : 'hover:bg-gray-800/50'}`}
                    style={{ paddingLeft: `${depth * 16 + 12}px` }}
                    onClick={(e) => {
                        if ((e.target as HTMLElement).tagName === 'INPUT') return;
                        if (hasChildren) toggleExpanded(node.path);
                        togglePath(node.path);
                    }}
                >
                    {hasChildren ? (
                        isExpanded ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />
                    ) : (
                        <span className="w-3" />
                    )}
                    <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePath(node.path)}
                        className="accent-green-500"
                    />
                    <Folder size={12} className={isChecked ? 'text-green-400' : 'text-gray-500'} />
                    <span className={`text-xs truncate ${isChecked ? 'text-green-300' : 'text-gray-300'}`} title={node.path}>
                        {node.name || node.path}
                    </span>
                    {coveredByAncestor && <span className="text-[9px] text-gray-500 ml-auto">included via parent</span>}
                </div>
                {hasChildren && isExpanded && (
                    <div>
                        {Object.values(node.children).map((child) => renderTreeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <BrainCircuit size={18} className="text-green-400" />
                        Knowledge Setup
                    </div>
                    <button onClick={close} className="text-gray-500 hover:text-gray-300">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {step === 'intro' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-300 leading-relaxed">
                                Incognide can keep a private knowledge store for each folder you work in. It can index files,
                                link related concepts into a knowledge graph, and extract memories from your conversations.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-gray-800/50 rounded border border-gray-700/50">
                                    <Search size={16} className="text-blue-400 mb-2" />
                                    <div className="text-xs font-medium text-gray-300">Index files</div>
                                    <div className="text-[10px] text-gray-500 mt-1">Embed and search file contents per directory.</div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded border border-gray-700/50">
                                    <Link2 size={16} className="text-purple-400 mb-2" />
                                    <div className="text-xs font-medium text-gray-300">Link knowledge</div>
                                    <div className="text-[10px] text-gray-500 mt-1">Connect concepts across files and memories.</div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded border border-gray-700/50">
                                    <Sparkles size={16} className="text-amber-400 mb-2" />
                                    <div className="text-xs font-medium text-gray-300">Extract memories</div>
                                    <div className="text-[10px] text-gray-500 mt-1">Turn chat insights into retrievable facts.</div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded border border-gray-700/50">
                                    <FolderOpen size={16} className="text-cyan-400 mb-2" />
                                    <div className="text-xs font-medium text-gray-300">Auto-index</div>
                                    <div className="text-[10px] text-gray-500 mt-1">Keep active folders up to date automatically.</div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Everything is opt-in. You choose which folders to build knowledge for, and you can change this
                                anytime in Settings → Knowledge.
                            </p>
                        </div>
                    )}

                    {step === 'select' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-300">
                                Choose folders to start building knowledge for. Selecting a parent folder includes everything under it.
                                Select a child to narrow the scope. AI features work better when relevant project context is indexed.
                            </p>

                            <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-500">
                                    {locations.length} discovered · {activeLocations.length} already active
                                </div>
                                <button onClick={refresh} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50">
                                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={customPath}
                                    onChange={(e) => setCustomPath(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomPath(); }}
                                    placeholder="Add a path, e.g. /Users/you or ~/projects"
                                    className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                                />
                                <button
                                    onClick={handleAddCustomPath}
                                    disabled={!customPath.trim()}
                                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 disabled:opacity-50 flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            {customPathError && <div className="text-xs text-red-400">{customPathError}</div>}

                            {loading ? (
                                <div className="text-sm text-gray-500">Loading discovered folders...</div>
                            ) : locations.length === 0 ? (
                                <div className="text-sm text-gray-500">
                                    No folders discovered yet. Add a path above or open a project folder and they will appear here.
                                </div>
                            ) : (
                                <div className="border border-gray-700/50 rounded max-h-60 overflow-y-auto">
                                    {renderTreeNode(tree)}
                                </div>
                            )}

                            <div className="space-y-2 p-3 bg-gray-800/30 rounded border border-gray-700/50">
                                <div className="text-xs font-medium text-gray-300">What to enable for selected folders</div>
                                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                    <input type="checkbox" checked={toggles.index_files} onChange={(e) => setToggles({ ...toggles, index_files: e.target.checked })} className="accent-green-500" />
                                    Index files
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                    <input type="checkbox" checked={toggles.link_knowledge} onChange={(e) => setToggles({ ...toggles, link_knowledge: e.target.checked })} className="accent-green-500" />
                                    Link knowledge
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                    <input type="checkbox" checked={toggles.extract_memories} onChange={(e) => setToggles({ ...toggles, extract_memories: e.target.checked })} className="accent-green-500" />
                                    Extract memories
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                    <input type="checkbox" checked={toggles.auto_index} onChange={(e) => setToggles({ ...toggles, auto_index: e.target.checked })} className="accent-green-500" />
                                    Auto-index active folders
                                </label>
                            </div>

                            {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{error}</div>}
                        </div>
                    )}

                    {step === 'confirm' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-300">
                                You are about to enable knowledge for {selected.size} folder{selected.size === 1 ? '' : 's'} with:
                            </p>
                            <ul className="text-xs text-gray-400 space-y-1">
                                {toggles.index_files && <li>• File indexing</li>}
                                {toggles.link_knowledge && <li>• Knowledge linking</li>}
                                {toggles.extract_memories && <li>• Memory extraction</li>}
                                {toggles.auto_index && <li>• Auto-index</li>}
                                {!toggles.index_files && !toggles.link_knowledge && !toggles.extract_memories && !toggles.auto_index && (
                                    <li>• Knowledge enabled, all features off (you can toggle later)</li>
                                )}
                            </ul>
                            <div className="text-xs text-gray-500">
                                Selected paths:
                            </div>
                            <ul className="text-xs text-gray-400 max-h-32 overflow-y-auto border border-gray-700/50 rounded p-2 space-y-1">
                                {Array.from(selected).map((dir) => (
                                    <li key={dir} className="font-mono truncate" title={dir}>{dir}</li>
                                ))}
                            </ul>
                            {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{error}</div>}
                        </div>
                    )}

                    {step === 'done' && (
                        <div className="space-y-3 text-center py-4">
                            <BrainCircuit size={32} className="text-green-400 mx-auto" />
                            <h3 className="text-lg font-semibold text-white">Knowledge setup complete</h3>
                            <p className="text-sm text-gray-300">
                                {selected.size} folder{selected.size === 1 ? '' : 's'} will start building knowledge.
                            </p>
                            <p className="text-xs text-gray-500">
                                You can always add or remove folders, reinitialize stores, and change indexing options in
                                Settings → Knowledge.
                            </p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                    {step === 'intro' && (
                        <>
                            <button onClick={handleSkip} className="text-xs text-gray-500 hover:text-gray-300">Set up later</button>
                            <button onClick={() => setStep('select')} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium">
                                Choose folders <ChevronRight size={14} />
                            </button>
                        </>
                    )}
                    {step === 'select' && (
                        <>
                            <button onClick={() => setStep('intro')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
                                <ChevronLeft size={14} /> Back
                            </button>
                            <button
                                onClick={() => setStep('confirm')}
                                disabled={selected.size === 0}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs rounded-lg font-medium"
                            >
                                Review {selected.size > 0 ? `(${selected.size})` : ''} <ChevronRight size={14} />
                            </button>
                        </>
                    )}
                    {step === 'confirm' && (
                        <>
                            <button onClick={() => setStep('select')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
                                <ChevronLeft size={14} /> Back
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white text-xs rounded-lg font-medium"
                            >
                                {saving ? 'Saving...' : 'Enable knowledge'}
                            </button>
                        </>
                    )}
                    {step === 'done' && (
                        <button onClick={handleFinish} className="ml-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium">
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KnowledgeOnboarding;
