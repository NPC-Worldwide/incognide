import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Search, Trash2, ChevronRight, ChevronDown, Folder } from 'lucide-react';

interface StoreEntry {
    directory: string;
    memoryCount?: number;
    knowledgeCount?: number;
}

interface TreeNode {
    name: string;
    path: string;
    children: Record<string, TreeNode>;
    isLeaf: boolean;
    counts?: { memoryCount?: number; knowledgeCount?: number };
}

function buildTree(entries: StoreEntry[]): TreeNode {
    const root: TreeNode = { name: '', path: '', children: {}, isLeaf: false };
    for (const entry of entries) {
        const parts = entry.directory.split('/').filter(Boolean);
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
                    counts: i === parts.length - 1 ? { memoryCount: entry.memoryCount, knowledgeCount: entry.knowledgeCount } : undefined,
                };
            }
            node = node.children[part];
        }
        node.isLeaf = true;
        node.counts = { memoryCount: entry.memoryCount, knowledgeCount: entry.knowledgeCount };
    }
    return root;
}

interface Props {
    onSaved?: () => void;
}

const StoreRegistryPanel: React.FC<Props> = ({ onSaved }) => {
    const [stores, setStores] = useState<StoreEntry[]>([]);
    const [addPath, setAddPath] = useState('');
    const [scanPath, setScanPath] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const refresh = useCallback(async () => {
        try {
            const r = await (window as any).api?.scanKnowledgeStores?.();
            const list = (r?.stores || []) as StoreEntry[];
            setStores(list);
            const allPaths = new Set<string>();
            for (const s of list) {
                const parts = s.directory.split('/').filter(Boolean);
                let built = '';
                for (const part of parts) {
                    built = built ? `${built}/${part}` : `/${part}`;
                    allPaths.add(built);
                }
            }
            setExpanded(allPaths);
        } catch {}
    }, []);

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

    const handleAdd = useCallback(async () => {
        const trimmed = addPath.trim();
        if (!trimmed) return;
        try {
            await (window as any).api?.kgRegisterStore?.(trimmed);
            setAddPath('');
            await refresh();
            onSaved?.();
        } catch {}
    }, [addPath, refresh, onSaved]);

    const handleScan = useCallback(async () => {
        const trimmed = scanPath.trim();
        if (!trimmed) return;
        try {
            await (window as any).api?.kgScanAndRegister?.(trimmed);
            setScanPath('');
            await refresh();
            onSaved?.();
        } catch {}
    }, [scanPath, refresh, onSaved]);

    const handleDelete = useCallback(async (dir: string) => {
        try {
            await (window as any).api?.kgUnregisterStore?.(dir);
            await refresh();
            onSaved?.();
        } catch {}
    }, [refresh, onSaved]);

    const tree = buildTree(stores);

    const renderNode = (node: TreeNode, depth: number) => {
        const children = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(node.path);

        if (node.isLeaf && !hasChildren) {
            return (
                <div key={node.path} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40">
                    <span style={{ width: depth * 12 }} />
                    <span className="text-xs text-gray-400 shrink-0">📁</span>
                    <span className="flex-1 text-xs font-mono truncate theme-text-secondary">{node.name}</span>
                    {node.counts && (
                        <span className="text-[10px] theme-text-muted shrink-0">{node.counts.memoryCount ?? 0} mem · {node.counts.knowledgeCount ?? 0} links</span>
                    )}
                    <button
                        onClick={() => handleDelete(node.path)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded shrink-0"
                        title="Unregister"
                    >
                        <Trash2 size={12} />
                    </button>
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
                    {node.isLeaf && node.counts && (
                        <span className="text-[10px] theme-text-muted shrink-0 ml-1">{node.counts.memoryCount ?? 0} mem · {node.counts.knowledgeCount ?? 0} links</span>
                    )}
                    {node.isLeaf && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(node.path); }}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded shrink-0 ml-auto"
                            title="Unregister"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
                {isExpanded && (
                    <div>
                        {children.map((child) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-gray-900/30 border-b theme-border">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold theme-text-primary">Knowledge Stores</span>
                <span className="text-[10px] theme-text-muted">{stores.length} registered</span>
            </div>

            <div className="max-h-48 overflow-y-auto border border-gray-700/50 rounded">
                {stores.length === 0 && (
                    <div className="text-xs theme-text-muted italic px-2 py-2">No stores registered.</div>
                )}
                {Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)).map((child) => renderNode(child, 0))}
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={addPath}
                    onChange={(e) => setAddPath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Add path"
                    className="flex-1 px-2 py-1 text-xs bg-gray-800 text-white border border-gray-600 rounded focus:outline-none focus:border-green-500 placeholder-gray-600 font-mono"
                />
                <button
                    onClick={handleAdd}
                    className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded font-medium flex items-center gap-1"
                >
                    <Save size={12} /> Register
                </button>
                <div className="w-px h-5 bg-gray-700" />
                <input
                    type="text"
                    value={scanPath}
                    onChange={(e) => setScanPath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                    placeholder="Scan directory"
                    className="w-40 px-2 py-1 text-xs bg-gray-800 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500 placeholder-gray-600 font-mono"
                />
                <button
                    onClick={handleScan}
                    className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded font-medium flex items-center gap-1"
                >
                    <Search size={12} /> Scan
                </button>
                <button
                    onClick={refresh}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-medium flex items-center gap-1"
                >
                    <RefreshCw size={12} />
                </button>
            </div>
        </div>
    );
};

export default StoreRegistryPanel;
