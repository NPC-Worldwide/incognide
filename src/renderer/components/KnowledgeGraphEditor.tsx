import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    GitBranch, Brain, Zap, Loader, Plus, Link, X, Trash2, Repeat, Search,
    ChevronDown, ChevronUp, ChevronRight, ArrowRight, BarChart3, Network,
    FolderTree, LayoutGrid, Table2
} from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import { useAiEnabled } from './AiFeatureContext';

type ViewTab = 'graph' | 'table' | 'tree' | 'groups';

interface KnowledgeGraphEditorProps {
    isModal?: boolean;
    onClose?: () => void;
}

const KnowledgeGraphEditor: React.FC<KnowledgeGraphEditorProps> = ({ isModal = false, onClose }) => {
    const aiEnabled = useAiEnabled();

    // Data state
    const [kgData, setKgData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [kgGenerations, setKgGenerations] = useState<number[]>([]);
    const [currentKgGeneration, setCurrentKgGeneration] = useState<number | null>(null);
    const [kgLoading, setKgLoading] = useState(true);
    const [kgError, setKgError] = useState<string | null>(null);
    const [kgViewMode, setKgViewMode] = useState('full');
    const [kgNodeFilter, setKgNodeFilter] = useState('all');
    const [networkStats, setNetworkStats] = useState<any>(null);
    const [cooccurrenceData, setCooccurrenceData] = useState<any>(null);
    const [centralityData, setCentralityData] = useState<any>(null);
    const [selectedKgNode, setSelectedKgNode] = useState<any>(null);
    const graphRef = useRef<any>(null);

    // View tab
    const [activeTab, setActiveTab] = useState<ViewTab>('graph');

    // Quick-add (always visible)
    const [newNodeName, setNewNodeName] = useState('');
    const [newNodeType, setNewNodeType] = useState<'concept' | 'fact'>('concept');
    const [newEdgeSource, setNewEdgeSource] = useState('');
    const [newEdgeTarget, setNewEdgeTarget] = useState('');
    const [showEdgeAdd, setShowEdgeAdd] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ facts: any[], concepts: any[] }>({ facts: [], concepts: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Multi-select
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

    // Table sort
    const [tableSortField, setTableSortField] = useState<'name' | 'type' | 'connections'>('connections');
    const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
    const [tableFilter, setTableFilter] = useState('');

    // Tree state
    const [treeRootId, setTreeRootId] = useState<string | null>(null);
    const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
    const [treeBreadcrumbs, setTreeBreadcrumbs] = useState<string[]>([]);

    // Auto-sizing for graph
    const graphContainerRef = useRef<HTMLDivElement>(null);
    const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 500 });

    useEffect(() => {
        if (!graphContainerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setGraphDimensions({
                    width: Math.floor(entry.contentRect.width),
                    height: Math.floor(entry.contentRect.height),
                });
            }
        });
        observer.observe(graphContainerRef.current);
        return () => observer.disconnect();
    }, [activeTab]);

    const fetchKgData = useCallback(async (generation?: number) => {
        setKgLoading(true);
        setKgError(null);
        const genToFetch = generation !== undefined ? generation : (currentKgGeneration !== null ? currentKgGeneration : null);
        try {
            const [generationsRes, graphDataRes, statsRes, cooccurRes, centralityRes] = await Promise.all([
                (window as any).api?.kg_listGenerations?.() || { generations: [] },
                (window as any).api?.kg_getGraphData?.({ generation: genToFetch }) || { graph: { nodes: [], links: [] } },
                (window as any).api?.kg_getNetworkStats?.({ generation: genToFetch }) || {},
                (window as any).api?.kg_getCooccurrenceNetwork?.({ generation: genToFetch }) || {},
                (window as any).api?.kg_getCentralityData?.({ generation: genToFetch }) || {},
            ]);
            if (generationsRes.error) throw new Error(`Generations Error: ${generationsRes.error}`);
            setKgGenerations(generationsRes.generations || []);
            const gens = generationsRes.generations || [];
            if (currentKgGeneration === null && gens.length > 0) {
                setCurrentKgGeneration(Math.max(...gens));
            }
            if (graphDataRes.error) throw new Error(`Graph Data Error: ${graphDataRes.error}`);
            setKgData(graphDataRes.graph || { nodes: [], links: [] });
            if (!statsRes.error) setNetworkStats(statsRes.stats);
            if (!cooccurRes.error) setCooccurrenceData(cooccurRes.network);
            if (!centralityRes.error) setCentralityData(centralityRes.centrality);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    }, [currentKgGeneration]);

    useEffect(() => { fetchKgData(); }, [fetchKgData]);

    // Escape key handler
    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

    // Search
    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) {
            setSearchResults({ facts: [], concepts: [] });
            setHighlightedNodes(new Set());
            setShowSearchResults(false);
            return;
        }
        setIsSearching(true);
        try {
            const result = await (window as any).api?.kg_search?.({
                q: searchQuery, generation: currentKgGeneration, type: 'both', limit: 50
            });
            if (result && !result.error) {
                setSearchResults({ facts: result.facts || [], concepts: result.concepts || [] });
                const matches = new Set<string>();
                (result.facts || []).forEach((f: any) => matches.add(f.statement));
                (result.concepts || []).forEach((c: any) => matches.add(c.name));
                setHighlightedNodes(matches);
                setShowSearchResults(true);
            }
        } catch (err: any) {
            console.error('Search error:', err);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, currentKgGeneration]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults({ facts: [], concepts: [] });
        setHighlightedNodes(new Set());
        setShowSearchResults(false);
    }, []);

    // Processed graph data
    const processedGraphData = useMemo(() => {
        let sourceNodes: any[] = [];
        let sourceLinks: any[] = [];
        if (kgViewMode === 'cooccurrence' && cooccurrenceData) {
            sourceNodes = cooccurrenceData.nodes || [];
            sourceLinks = cooccurrenceData.links || [];
        } else if (kgData && kgData.nodes) {
            sourceNodes = kgData.nodes;
            sourceLinks = kgData.links;
        }
        if (kgNodeFilter === 'high-degree' && networkStats?.node_degrees) {
            const avgDegree = networkStats.avg_degree || 0;
            const degreeThreshold = avgDegree > 1 ? avgDegree * 1.2 : 2;
            const highDegreeNodeIds = new Set(Object.keys(networkStats.node_degrees).filter(id => networkStats.node_degrees[id] >= degreeThreshold));
            const filteredNodes = sourceNodes.filter(n => highDegreeNodeIds.has(n.id));
            const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
            const filteredLinks = sourceLinks.filter(l => filteredNodeIds.has(l.source?.id || l.source) && filteredNodeIds.has(l.target?.id || l.target));
            return { nodes: filteredNodes, links: filteredLinks };
        }
        return { nodes: sourceNodes, links: sourceLinks };
    }, [kgData, kgViewMode, kgNodeFilter, networkStats, cooccurrenceData]);

    // Node degree map for table/tree
    const nodeDegreeMap = useMemo(() => {
        const map: Record<string, number> = {};
        processedGraphData.links.forEach((l: any) => {
            const src = typeof l.source === 'string' ? l.source : l.source?.id;
            const tgt = typeof l.target === 'string' ? l.target : l.target?.id;
            if (src) map[src] = (map[src] || 0) + 1;
            if (tgt) map[tgt] = (map[tgt] || 0) + 1;
        });
        return map;
    }, [processedGraphData]);

    // Adjacency map for tree view
    const adjacencyMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        processedGraphData.links.forEach((l: any) => {
            const src = typeof l.source === 'string' ? l.source : l.source?.id;
            const tgt = typeof l.target === 'string' ? l.target : l.target?.id;
            if (src && tgt) {
                if (!map[src]) map[src] = [];
                if (!map[tgt]) map[tgt] = [];
                map[src].push(tgt);
                map[tgt].push(src);
            }
        });
        return map;
    }, [processedGraphData]);

    // Community grouping
    const communityGroups = useMemo(() => {
        const groups: Record<string, any[]> = {};
        processedGraphData.nodes.forEach((n: any) => {
            const community = n.community !== undefined ? `Community ${n.community}` : 'Ungrouped';
            if (!groups[community]) groups[community] = [];
            groups[community].push(n);
        });
        return groups;
    }, [processedGraphData]);

    // Graph rendering helpers
    const getNodeColor = useCallback((node: any) => {
        if (selectedNodeIds.has(node.id)) return '#f59e0b';
        if (highlightedNodes.size > 0 && highlightedNodes.has(node.id)) return '#22c55e';
        if (kgViewMode === 'cooccurrence') {
            const community = node.community || 0;
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16'];
            return colors[community % colors.length];
        }
        if (highlightedNodes.size > 0) {
            return node.type === 'concept' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)';
        }
        return node.type === 'concept' ? '#a855f7' : '#3b82f6';
    }, [kgViewMode, highlightedNodes, selectedNodeIds]);

    const getNodeSize = useCallback((node: any) => {
        if (networkStats?.node_degrees?.[node.id]) {
            const degree = networkStats.node_degrees[node.id];
            const maxDegree = Math.max(1, ...Object.values(networkStats.node_degrees) as number[]);
            return 4 + (degree / maxDegree) * 12;
        }
        return node.type === 'concept' ? 6 : 4;
    }, [networkStats]);

    const getLinkWidth = useCallback((link: any) => (link.weight ? Math.min(5, link.weight / 2) : 1), []);

    // Actions
    const handleKgProcessTrigger = async (type: string) => {
        setKgLoading(true);
        setKgError(null);
        try {
            await (window as any).api?.kg_triggerProcess?.({ type });
            setCurrentKgGeneration(null);
            fetchKgData();
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleKgRollback = async () => {
        if (currentKgGeneration && currentKgGeneration > 0) {
            const targetGen = currentKgGeneration - 1;
            setKgLoading(true);
            try {
                await (window as any).api?.kg_rollback?.({ generation: targetGen });
                setCurrentKgGeneration(targetGen);
            } catch (err: any) {
                setKgError(err.message);
                setKgLoading(false);
            }
        }
    };

    const handleAddKgNode = async () => {
        if (!newNodeName.trim()) return;
        setKgLoading(true);
        try {
            await (window as any).api?.kg_addNode?.({ nodeId: newNodeName.trim(), nodeType: newNodeType });
            setNewNodeName('');
            fetchKgData(currentKgGeneration ?? undefined);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleDeleteKgNode = async (nodeId: string) => {
        if (!confirm(`Delete node "${nodeId}" and all its connections?`)) return;
        setKgLoading(true);
        try {
            await (window as any).api?.kg_deleteNode?.({ nodeId });
            setSelectedKgNode(null);
            selectedNodeIds.delete(nodeId);
            setSelectedNodeIds(new Set(selectedNodeIds));
            fetchKgData(currentKgGeneration ?? undefined);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedNodeIds.size === 0) return;
        if (!confirm(`Delete ${selectedNodeIds.size} selected nodes and all their connections?`)) return;
        setKgLoading(true);
        try {
            for (const nodeId of selectedNodeIds) {
                await (window as any).api?.kg_deleteNode?.({ nodeId });
            }
            setSelectedNodeIds(new Set());
            setSelectedKgNode(null);
            fetchKgData(currentKgGeneration ?? undefined);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleAddKgEdge = async () => {
        if (!newEdgeSource.trim() || !newEdgeTarget.trim()) return;
        setKgLoading(true);
        try {
            await (window as any).api?.kg_addEdge?.({ sourceId: newEdgeSource.trim(), targetId: newEdgeTarget.trim() });
            setNewEdgeSource('');
            setNewEdgeTarget('');
            setShowEdgeAdd(false);
            fetchKgData(currentKgGeneration ?? undefined);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleDeleteKgEdge = async (sourceId: string, targetId: string) => {
        if (!confirm(`Delete connection from "${sourceId}" to "${targetId}"?`)) return;
        setKgLoading(true);
        try {
            await (window as any).api?.kg_deleteEdge?.({ sourceId, targetId });
            fetchKgData(currentKgGeneration ?? undefined);
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleNodeClick = useCallback((node: any, event?: MouseEvent) => {
        if (event?.shiftKey) {
            // Multi-select with shift
            setSelectedNodeIds(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
            });
        } else {
            setSelectedKgNode(node);
            setSelectedNodeIds(new Set());
        }
    }, []);

    const toggleTableSort = (field: 'name' | 'type' | 'connections') => {
        if (tableSortField === field) {
            setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setTableSortField(field);
            setTableSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    // Table data
    const tableData = useMemo(() => {
        let nodes = processedGraphData.nodes.map((n: any) => ({
            ...n,
            connections: nodeDegreeMap[n.id] || 0,
        }));
        if (tableFilter) {
            const q = tableFilter.toLowerCase();
            nodes = nodes.filter((n: any) => n.id.toLowerCase().includes(q));
        }
        nodes.sort((a: any, b: any) => {
            let cmp = 0;
            if (tableSortField === 'name') cmp = a.id.localeCompare(b.id);
            else if (tableSortField === 'type') cmp = (a.type || '').localeCompare(b.type || '');
            else cmp = a.connections - b.connections;
            return tableSortDir === 'asc' ? cmp : -cmp;
        });
        return nodes;
    }, [processedGraphData, nodeDegreeMap, tableFilter, tableSortField, tableSortDir]);

    // Tree root: default to highest-degree node
    useEffect(() => {
        if (treeRootId || processedGraphData.nodes.length === 0) return;
        let best = processedGraphData.nodes[0]?.id;
        let bestDeg = 0;
        processedGraphData.nodes.forEach((n: any) => {
            const deg = nodeDegreeMap[n.id] || 0;
            if (deg > bestDeg) { bestDeg = deg; best = n.id; }
        });
        if (best) {
            setTreeRootId(best);
            setTreeBreadcrumbs([best]);
            setTreeExpanded(new Set([best]));
        }
    }, [processedGraphData, nodeDegreeMap, treeRootId]);

    const setTreeRoot = (nodeId: string) => {
        setTreeRootId(nodeId);
        setTreeBreadcrumbs(prev => [...prev, nodeId]);
        setTreeExpanded(new Set([nodeId]));
    };

    const toggleTreeExpand = (nodeId: string) => {
        setTreeExpanded(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    };

    // --- Render: Tab bar ---
    const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
        { id: 'graph', label: 'Graph', icon: <Network size={14} /> },
        { id: 'table', label: 'Table', icon: <Table2 size={14} /> },
        { id: 'tree', label: 'Tree', icon: <FolderTree size={14} /> },
        { id: 'groups', label: 'Groups', icon: <LayoutGrid size={14} /> },
    ];

    // --- Render: Tree node recursion ---
    const renderTreeNode = (nodeId: string, depth: number, visited: Set<string>) => {
        if (visited.has(nodeId)) return null;
        visited.add(nodeId);
        const node = processedGraphData.nodes.find((n: any) => n.id === nodeId);
        if (!node) return null;
        const children = (adjacencyMap[nodeId] || []).filter(id => !visited.has(id));
        const isExpanded = treeExpanded.has(nodeId);
        const isSelected = selectedKgNode?.id === nodeId;
        const hasChildren = children.length > 0;

        return (
            <div key={nodeId} style={{ paddingLeft: depth * 20 }}>
                <div
                    className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm cursor-pointer transition-colors ${
                        isSelected ? 'theme-bg-active theme-text-primary' : 'hover:theme-bg-hover theme-text-secondary'
                    }`}
                    onClick={() => setSelectedKgNode(node)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleTreeExpand(nodeId); }}
                            className="p-0.5 theme-text-muted hover:theme-text-primary"
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    ) : (
                        <span className="w-5" />
                    )}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${node.type === 'concept' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                    <span className="truncate flex-1 font-mono text-xs" title={nodeId}>{nodeId}</span>
                    <span className="text-xs theme-text-muted">{nodeDegreeMap[nodeId] || 0}</span>
                    {hasChildren && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setTreeRoot(nodeId); }}
                            className="p-0.5 theme-text-muted hover:text-blue-400"
                            title="Set as root"
                        >
                            <ArrowRight size={12} />
                        </button>
                    )}
                </div>
                {isExpanded && hasChildren && children.map(childId => renderTreeNode(childId, depth + 1, new Set(visited)))}
            </div>
        );
    };

    // --- Render: Selected node detail panel ---
    const renderNodeDetail = () => {
        if (!selectedKgNode) return null;
        const outgoing = processedGraphData.links.filter((l: any) =>
            (typeof l.source === 'string' ? l.source : l.source?.id) === selectedKgNode.id
        );
        const incoming = processedGraphData.links.filter((l: any) =>
            (typeof l.target === 'string' ? l.target : l.target?.id) === selectedKgNode.id
        );
        return (
            <div className="theme-bg-secondary p-3 rounded-lg border theme-border">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold text-sm theme-text-primary">Selected Node</h5>
                    <button onClick={() => setSelectedKgNode(null)} className="theme-text-muted hover:theme-text-primary"><X size={14} /></button>
                </div>
                <p className="text-sm font-mono text-blue-400 truncate mb-1" title={selectedKgNode.id}>{selectedKgNode.id}</p>
                <p className="text-xs theme-text-muted mb-2">Type: {selectedKgNode.type || 'concept'}</p>
                <button
                    onClick={() => handleDeleteKgNode(selectedKgNode.id)}
                    className="w-full text-xs py-1.5 bg-red-600 hover:bg-red-500 text-white rounded flex items-center justify-center gap-2 transition-colors mb-3"
                >
                    <Trash2 size={14} /> Delete Node
                </button>
                <div className="border-t theme-border pt-2">
                    <h6 className="text-xs theme-text-muted font-semibold mb-2">
                        Connections ({outgoing.length + incoming.length})
                    </h6>
                    {outgoing.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] theme-text-muted flex items-center gap-1 mb-1">→ Outgoing ({outgoing.length})</span>
                            <div className="space-y-1">
                                {outgoing.map((edge: any, i: number) => {
                                    const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;
                                    return (
                                        <div key={i} className="flex items-center gap-1 text-xs theme-bg-primary rounded px-2 py-1">
                                            <span className="theme-text-secondary truncate flex-1 font-mono" title={targetId}>{targetId}</span>
                                            <button
                                                onClick={() => handleDeleteKgEdge(selectedKgNode.id, targetId)}
                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0"
                                                title="Remove connection"
                                            ><X size={12} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {incoming.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] theme-text-muted flex items-center gap-1 mb-1">← Incoming ({incoming.length})</span>
                            <div className="space-y-1">
                                {incoming.map((edge: any, i: number) => {
                                    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
                                    return (
                                        <div key={i} className="flex items-center gap-1 text-xs theme-bg-primary rounded px-2 py-1">
                                            <span className="theme-text-secondary truncate flex-1 font-mono" title={sourceId}>{sourceId}</span>
                                            <button
                                                onClick={() => handleDeleteKgEdge(sourceId, selectedKgNode.id)}
                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0"
                                                title="Remove connection"
                                            ><X size={12} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {outgoing.length === 0 && incoming.length === 0 && (
                        <p className="text-xs theme-text-muted italic">No connections</p>
                    )}
                </div>
            </div>
        );
    };

    // --- Main content ---
    const content = (
        <div className="flex flex-col h-full theme-bg-primary">
            {/* Header: title + actions */}
            <div className="flex items-center justify-between px-4 py-2 border-b theme-border flex-shrink-0">
                <h4 className="text-base font-semibold flex items-center gap-2 theme-text-primary">
                    <GitBranch className="text-green-400" size={18} />Knowledge Graph
                </h4>
                <div className="flex items-center gap-2">
                    {aiEnabled && (
                        <>
                            <button onClick={() => handleKgProcessTrigger('sleep')} disabled={kgLoading} className="px-3 py-1 text-xs theme-bg-secondary hover:opacity-80 theme-text-secondary rounded flex items-center gap-1.5 disabled:opacity-50 border theme-border"><Zap size={13} /> Sleep</button>
                            <button onClick={() => handleKgProcessTrigger('dream')} disabled={kgLoading} className="px-3 py-1 text-xs theme-bg-secondary hover:opacity-80 theme-text-secondary rounded flex items-center gap-1.5 disabled:opacity-50 border theme-border"><Brain size={13} /> Dream</button>
                        </>
                    )}
                    {kgGenerations.length > 0 && (
                        <div className="flex items-center gap-1.5 ml-2">
                            <span className="text-xs theme-text-muted">Gen:</span>
                            <select
                                value={currentKgGeneration ?? ''}
                                onChange={(e) => {
                                    const gen = parseInt(e.target.value);
                                    setCurrentKgGeneration(gen);
                                    fetchKgData(gen);
                                }}
                                className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded"
                            >
                                {kgGenerations.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button onClick={handleKgRollback} disabled={currentKgGeneration === 0 || kgLoading} className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50" title="Rollback one generation"><Repeat size={14} /></button>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick-add bar + search */}
            <div className="flex items-center gap-2 px-4 py-2 border-b theme-border flex-shrink-0 flex-wrap">
                {/* Quick-add node */}
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={newNodeName}
                        onChange={(e) => setNewNodeName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddKgNode()}
                        placeholder="Add node..."
                        className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-36 focus:outline-none focus:border-green-500"
                    />
                    <select
                        value={newNodeType}
                        onChange={(e) => setNewNodeType(e.target.value as 'concept' | 'fact')}
                        className="px-1 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded"
                    >
                        <option value="concept">Concept</option>
                        <option value="fact">Fact</option>
                    </select>
                    <button
                        onClick={handleAddKgNode}
                        disabled={!newNodeName.trim() || kgLoading}
                        className="p-1 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50"
                        title="Add node"
                    ><Plus size={14} /></button>
                </div>

                {/* Add edge toggle */}
                <button
                    onClick={() => setShowEdgeAdd(!showEdgeAdd)}
                    className={`p-1 rounded text-xs flex items-center gap-1 border ${showEdgeAdd ? 'border-blue-500 text-blue-400' : 'theme-border theme-text-muted'}`}
                    title="Add edge"
                ><Link size={14} /></button>
                {showEdgeAdd && (
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={newEdgeSource}
                            onChange={(e) => setNewEdgeSource(e.target.value)}
                            placeholder="From..."
                            className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-28 focus:outline-none focus:border-blue-500"
                        />
                        <ArrowRight size={12} className="theme-text-muted" />
                        <input
                            type="text"
                            value={newEdgeTarget}
                            onChange={(e) => setNewEdgeTarget(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddKgEdge()}
                            placeholder="To..."
                            className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-28 focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={handleAddKgEdge}
                            disabled={!newEdgeSource.trim() || !newEdgeTarget.trim() || kgLoading}
                            className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
                        ><Plus size={14} /></button>
                    </div>
                )}

                <div className="flex-1" />

                {/* Bulk actions */}
                {selectedNodeIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs theme-text-muted">{selectedNodeIds.size} selected</span>
                        <button onClick={handleBulkDelete} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                        <button onClick={() => setSelectedNodeIds(new Set())} className="px-2 py-1 text-xs theme-bg-secondary theme-text-muted rounded border theme-border">Clear</button>
                    </div>
                )}

                {/* Search */}
                <div className="flex items-center gap-1">
                    <div className="relative">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search..."
                            className="pl-7 pr-7 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-40 focus:outline-none focus:border-green-500"
                        />
                        {searchQuery && (
                            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-primary"><X size={12} /></button>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching || !searchQuery.trim()}
                        className="p-1 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50"
                    >{isSearching ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}</button>
                </div>
            </div>

            {/* Search results dropdown */}
            {showSearchResults && (searchResults.facts.length > 0 || searchResults.concepts.length > 0) && (
                <div className="mx-4 mt-1 theme-bg-secondary border theme-border rounded-lg max-h-36 overflow-y-auto flex-shrink-0">
                    <button
                        onClick={() => setShowSearchResults(false)}
                        className="w-full px-3 py-1.5 flex items-center justify-between text-xs theme-text-secondary hover:theme-bg-hover"
                    >
                        <span>Results: {searchResults.facts.length} facts, {searchResults.concepts.length} concepts</span>
                        <ChevronUp size={12} />
                    </button>
                    <div className="px-3 pb-2 space-y-1">
                        {searchResults.concepts.map((c: any, i: number) => (
                            <div
                                key={`c-${i}`}
                                className="text-xs p-1.5 bg-purple-900/20 rounded cursor-pointer hover:bg-purple-900/40"
                                onClick={() => { setSelectedKgNode({ id: c.name, type: 'concept' }); graphRef.current?.centerAt?.(0, 0, 500); }}
                            >
                                <span className="text-purple-400 font-medium">[Concept]</span> {c.name}
                            </div>
                        ))}
                        {searchResults.facts.map((f: any, i: number) => (
                            <div
                                key={`f-${i}`}
                                className="text-xs p-1.5 bg-blue-900/20 rounded cursor-pointer hover:bg-blue-900/40"
                                onClick={() => { setSelectedKgNode({ id: f.statement, type: 'fact' }); graphRef.current?.centerAt?.(0, 0, 500); }}
                            >
                                <span className="text-blue-400 font-medium">[Fact]</span> {f.statement}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* View tabs */}
            <div className="flex items-center gap-1 px-4 py-1.5 border-b theme-border flex-shrink-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 transition-colors ${
                            activeTab === tab.id
                                ? 'bg-green-600 text-white'
                                : 'theme-bg-secondary theme-text-muted hover:theme-text-primary border theme-border'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
                {activeTab === 'graph' && (
                    <div className="flex items-center gap-2 ml-4">
                        <select value={kgViewMode} onChange={(e) => setKgViewMode(e.target.value)} className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded">
                            <option value="full">Full Network</option>
                            <option value="cooccurrence">Co-occurrence</option>
                        </select>
                        <select value={kgNodeFilter} onChange={(e) => setKgNodeFilter(e.target.value)} className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded">
                            <option value="all">All Nodes</option>
                            <option value="high-degree">High-Degree</option>
                        </select>
                    </div>
                )}
                <div className="flex-1" />
                <span className="text-xs theme-text-muted">{processedGraphData.nodes.length} nodes · {processedGraphData.links.length} edges</span>
            </div>

            {kgError && <div className="text-red-400 text-center text-xs py-2 px-4 flex-shrink-0">{kgError}</div>}

            {/* Main view area */}
            {kgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader className="animate-spin text-green-400" size={32} />
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden">
                    {/* View content */}
                    <div className="flex-1 overflow-auto">
                        {/* === GRAPH VIEW === */}
                        {activeTab === 'graph' && (
                            <div ref={graphContainerRef} className="w-full h-full">
                                <ForceGraph2D
                                    ref={graphRef}
                                    graphData={processedGraphData}
                                    nodeLabel="id"
                                    nodeVal={getNodeSize}
                                    nodeColor={(node: any) => selectedKgNode?.id === node.id ? '#f59e0b' : getNodeColor(node)}
                                    linkWidth={getLinkWidth}
                                    linkDirectionalParticles={kgViewMode === 'full' ? 1 : 0}
                                    linkDirectionalParticleWidth={2}
                                    linkColor={() => 'rgba(255,255,255,0.3)'}
                                    onNodeClick={(node: any, event: MouseEvent) => handleNodeClick(node, event)}
                                    width={graphDimensions.width}
                                    height={graphDimensions.height}
                                    backgroundColor="transparent"
                                />
                            </div>
                        )}

                        {/* === TABLE VIEW === */}
                        {activeTab === 'table' && (
                            <div className="p-3">
                                <div className="mb-2">
                                    <input
                                        type="text"
                                        value={tableFilter}
                                        onChange={(e) => setTableFilter(e.target.value)}
                                        placeholder="Filter nodes..."
                                        className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-60 focus:outline-none focus:border-green-500"
                                    />
                                </div>
                                <div className="overflow-auto max-h-full">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b theme-border">
                                                <th className="w-8 p-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedNodeIds.size === tableData.length && tableData.length > 0}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedNodeIds(new Set(tableData.map((n: any) => n.id)));
                                                            } else {
                                                                setSelectedNodeIds(new Set());
                                                            }
                                                        }}
                                                        className="accent-green-500"
                                                    />
                                                </th>
                                                <th className="text-left p-2 cursor-pointer hover:text-green-400 theme-text-secondary" onClick={() => toggleTableSort('name')}>
                                                    Name {tableSortField === 'name' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="text-left p-2 cursor-pointer hover:text-green-400 theme-text-secondary w-24" onClick={() => toggleTableSort('type')}>
                                                    Type {tableSortField === 'type' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="text-left p-2 cursor-pointer hover:text-green-400 theme-text-secondary w-28" onClick={() => toggleTableSort('connections')}>
                                                    Connections {tableSortField === 'connections' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="w-20 p-2 theme-text-secondary text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.map((node: any) => (
                                                <tr
                                                    key={node.id}
                                                    className={`border-b theme-border transition-colors cursor-pointer ${
                                                        selectedKgNode?.id === node.id ? 'theme-bg-active' : 'hover:theme-bg-hover'
                                                    }`}
                                                    onClick={() => setSelectedKgNode(node)}
                                                >
                                                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedNodeIds.has(node.id)}
                                                            onChange={() => {
                                                                setSelectedNodeIds(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(node.id)) next.delete(node.id);
                                                                    else next.add(node.id);
                                                                    return next;
                                                                });
                                                            }}
                                                            className="accent-green-500"
                                                        />
                                                    </td>
                                                    <td className="p-2 font-mono theme-text-primary truncate max-w-xs" title={node.id}>{node.id}</td>
                                                    <td className="p-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                            node.type === 'concept' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                            {node.type || 'concept'}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 theme-text-secondary">{node.connections}</td>
                                                    <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleDeleteKgNode(node.id)}
                                                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                                                            title="Delete node"
                                                        ><Trash2 size={12} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {tableData.length === 0 && (
                                        <p className="text-center theme-text-muted text-xs py-8">No nodes found</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* === TREE VIEW === */}
                        {activeTab === 'tree' && (
                            <div className="p-3">
                                {/* Breadcrumbs */}
                                {treeBreadcrumbs.length > 1 && (
                                    <div className="flex items-center gap-1 mb-2 flex-wrap">
                                        {treeBreadcrumbs.map((crumb, i) => (
                                            <React.Fragment key={i}>
                                                {i > 0 && <ChevronRight size={10} className="theme-text-muted" />}
                                                <button
                                                    onClick={() => {
                                                        setTreeRootId(crumb);
                                                        setTreeBreadcrumbs(treeBreadcrumbs.slice(0, i + 1));
                                                        setTreeExpanded(new Set([crumb]));
                                                    }}
                                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                                        i === treeBreadcrumbs.length - 1 ? 'text-green-400 font-medium' : 'theme-text-muted hover:theme-text-primary'
                                                    }`}
                                                >
                                                    {crumb.length > 30 ? crumb.slice(0, 30) + '...' : crumb}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}
                                <div className="overflow-auto max-h-full">
                                    {treeRootId ? renderTreeNode(treeRootId, 0, new Set()) : (
                                        <p className="text-center theme-text-muted text-xs py-8">No nodes in graph</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* === GROUPS VIEW === */}
                        {activeTab === 'groups' && (
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(communityGroups).sort(([, a], [, b]) => b.length - a.length).map(([groupName, nodes]) => (
                                    <div key={groupName} className="theme-bg-secondary border theme-border rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <h5 className="text-sm font-semibold theme-text-primary">{groupName}</h5>
                                            <span className="text-xs theme-text-muted">{nodes.length} nodes</span>
                                        </div>
                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                            {nodes.slice(0, 20).map((node: any) => (
                                                <div
                                                    key={node.id}
                                                    className={`flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                                                        selectedKgNode?.id === node.id ? 'theme-bg-active' : 'hover:theme-bg-hover'
                                                    }`}
                                                    onClick={() => setSelectedKgNode(node)}
                                                >
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${node.type === 'concept' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                                                    <span className="font-mono theme-text-secondary truncate flex-1">{node.id}</span>
                                                    <span className="theme-text-muted">{nodeDegreeMap[node.id] || 0}</span>
                                                </div>
                                            ))}
                                            {nodes.length > 20 && (
                                                <p className="text-xs theme-text-muted text-center py-1">+{nodes.length - 20} more</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(communityGroups).length === 0 && (
                                    <p className="text-center theme-text-muted text-xs py-8 col-span-full">No groups detected</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right sidebar: node detail + stats */}
                    <div className="w-64 flex-shrink-0 border-l theme-border overflow-y-auto p-3 space-y-3">
                        {renderNodeDetail()}

                        <div className="theme-bg-secondary p-3 rounded-lg border theme-border">
                            <h5 className="font-semibold text-xs mb-2 theme-text-primary">Stats</h5>
                            <p className="text-xs theme-text-muted">Nodes: <span className="font-bold theme-text-primary">{processedGraphData.nodes.length}</span></p>
                            <p className="text-xs theme-text-muted">Edges: <span className="font-bold theme-text-primary">{processedGraphData.links.length}</span></p>
                            {networkStats && (
                                <>
                                    <p className="text-xs theme-text-muted">Density: <span className="font-bold theme-text-primary">{networkStats.density?.toFixed(4)}</span></p>
                                    <p className="text-xs theme-text-muted">Avg Degree: <span className="font-bold theme-text-primary">{networkStats.avg_degree?.toFixed(2)}</span></p>
                                </>
                            )}
                        </div>

                        {centralityData?.degree && (
                            <div className="theme-bg-secondary p-3 rounded-lg border theme-border">
                                <h5 className="font-semibold text-xs mb-2 theme-text-primary">Top Central</h5>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {Object.entries(centralityData.degree).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 8).map(([node, score]) => (
                                        <div
                                            key={node}
                                            className="text-xs cursor-pointer hover:theme-bg-hover p-1 rounded"
                                            title={node}
                                            onClick={() => setSelectedKgNode({ id: node })}
                                        >
                                            <div className="truncate font-mono theme-text-secondary">{node}</div>
                                            <div className="text-green-400 font-semibold">{(score as number).toFixed(3)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
                <div
                    className="theme-bg-primary rounded-lg shadow-xl w-[90vw] max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-3 border-b theme-border">
                        <h3 className="text-base font-semibold flex items-center gap-2 theme-text-primary">
                            <GitBranch className="text-green-400" size={18} />
                            Knowledge Graph
                        </h3>
                        <button onClick={onClose} className="p-1 hover:theme-bg-hover rounded theme-text-muted">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    return content;
};

export default KnowledgeGraphEditor;
