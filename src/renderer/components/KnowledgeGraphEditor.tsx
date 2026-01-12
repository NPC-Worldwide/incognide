import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GitBranch, Brain, Zap, Loader, Edit, Plus, Link, X, Trash2, Repeat, Search, ChevronDown, ChevronUp } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';

interface KnowledgeGraphEditorProps {
    isModal?: boolean;
    onClose?: () => void;
}

const KnowledgeGraphEditor: React.FC<KnowledgeGraphEditorProps> = ({ isModal = false, onClose }) => {
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
    const [kgEditMode, setKgEditMode] = useState<'view' | 'edit'>('view');
    const [newNodeName, setNewNodeName] = useState('');
    const [newEdgeSource, setNewEdgeSource] = useState('');
    const [newEdgeTarget, setNewEdgeTarget] = useState('');
    const graphRef = useRef<any>(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ facts: any[], concepts: any[] }>({ facts: [], concepts: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
    const [showSearchResults, setShowSearchResults] = useState(false);

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

    useEffect(() => {
        fetchKgData();
    }, [fetchKgData]);

    // Search function
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
                q: searchQuery,
                generation: currentKgGeneration,
                type: 'both',
                limit: 50
            });

            if (result && !result.error) {
                setSearchResults({ facts: result.facts || [], concepts: result.concepts || [] });

                // Build set of matching node IDs for highlighting
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

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults({ facts: [], concepts: [] });
        setHighlightedNodes(new Set());
        setShowSearchResults(false);
    }, []);

    // Escape key handler
    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

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

    const getNodeColor = useCallback((node: any) => {
        // Highlight search matches
        if (highlightedNodes.size > 0 && highlightedNodes.has(node.id)) {
            return '#22c55e'; // Green for matches
        }
        if (kgViewMode === 'cooccurrence') {
            const community = node.community || 0;
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16'];
            return colors[community % colors.length];
        }
        // Dim non-matching nodes when search is active
        if (highlightedNodes.size > 0) {
            return node.type === 'concept' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)';
        }
        return node.type === 'concept' ? '#a855f7' : '#3b82f6';
    }, [kgViewMode, highlightedNodes]);

    const getNodeSize = useCallback((node: any) => {
        if (networkStats?.node_degrees?.[node.id]) {
            const degree = networkStats.node_degrees[node.id];
            const maxDegree = Math.max(1, ...Object.values(networkStats.node_degrees) as number[]);
            return 4 + (degree / maxDegree) * 12;
        }
        return node.type === 'concept' ? 6 : 4;
    }, [networkStats]);

    const getLinkWidth = useCallback((link: any) => (link.weight ? Math.min(5, link.weight / 2) : 1), []);

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
            await (window as any).api?.kg_addNode?.({ nodeId: newNodeName.trim(), nodeType: 'concept' });
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

    const content = (
        <div className="p-4 bg-gray-900/50">
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-lg font-semibold flex items-center gap-3 text-white">
                    <GitBranch className="text-green-400" />Knowledge Graph Editor
                </h4>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setKgEditMode(kgEditMode === 'view' ? 'edit' : 'view')}
                        className={`px-3 py-1 text-xs rounded flex items-center gap-2 transition-colors ${
                            kgEditMode === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                    >
                        <Edit size={14} /> {kgEditMode === 'edit' ? 'Editing' : 'View Only'}
                    </button>
                    <button onClick={() => handleKgProcessTrigger('sleep')} disabled={kgLoading} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-2 disabled:opacity-50"><Zap size={14} /> Sleep</button>
                    <button onClick={() => handleKgProcessTrigger('dream')} disabled={kgLoading} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-2 disabled:opacity-50"><Brain size={14} /> Dream</button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search facts and concepts..."
                            className="w-full pl-10 pr-10 py-2 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-green-500 focus:outline-none"
                        />
                        {searchQuery && (
                            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSearching ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
                        Search
                    </button>
                </div>

                {/* Search Results */}
                {showSearchResults && (searchResults.facts.length > 0 || searchResults.concepts.length > 0) && (
                    <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                        <button
                            onClick={() => setShowSearchResults(!showSearchResults)}
                            className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-300 hover:bg-gray-700"
                        >
                            <span>Results: {searchResults.facts.length} facts, {searchResults.concepts.length} concepts</span>
                            {showSearchResults ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <div className="px-3 pb-2 space-y-1">
                            {searchResults.concepts.map((c, i) => (
                                <div
                                    key={`c-${i}`}
                                    className="text-xs p-2 bg-purple-900/30 rounded cursor-pointer hover:bg-purple-900/50"
                                    onClick={() => {
                                        setSelectedKgNode({ id: c.name, type: 'concept' });
                                        graphRef.current?.centerAt?.(0, 0, 500);
                                    }}
                                >
                                    <span className="text-purple-400 font-medium">[Concept]</span> {c.name}
                                    {c.description && <p className="text-gray-400 mt-1 truncate">{c.description}</p>}
                                </div>
                            ))}
                            {searchResults.facts.map((f, i) => (
                                <div
                                    key={`f-${i}`}
                                    className="text-xs p-2 bg-blue-900/30 rounded cursor-pointer hover:bg-blue-900/50"
                                    onClick={() => {
                                        setSelectedKgNode({ id: f.statement, type: 'fact' });
                                        graphRef.current?.centerAt?.(0, 0, 500);
                                    }}
                                >
                                    <span className="text-blue-400 font-medium">[Fact]</span> {f.statement}
                                    {f.source_text && <p className="text-gray-500 mt-1 truncate italic">Source: {f.source_text}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">View Mode</label>
                    <select value={kgViewMode} onChange={(e) => setKgViewMode(e.target.value)} className="w-full px-2 py-1.5 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-blue-500 focus:outline-none">
                        <option value="full">Full Network</option>
                        <option value="cooccurrence">Concept Co-occurrence</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">Node Filter</label>
                    <select value={kgNodeFilter} onChange={(e) => setKgNodeFilter(e.target.value)} className="w-full px-2 py-1.5 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-blue-500 focus:outline-none">
                        <option value="all">Show All Nodes</option>
                        <option value="high-degree">Show High-Degree Nodes</option>
                    </select>
                </div>
                {kgEditMode === 'edit' && (
                    <>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Add Node</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={newNodeName}
                                    onChange={(e) => setNewNodeName(e.target.value)}
                                    placeholder="Node name..."
                                    className="flex-1 px-2 py-1.5 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-green-500 focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddKgNode()}
                                />
                                <button
                                    onClick={handleAddKgNode}
                                    disabled={!newNodeName.trim() || kgLoading}
                                    className="px-2 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Add Edge (source → target)</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={newEdgeSource}
                                    onChange={(e) => setNewEdgeSource(e.target.value)}
                                    placeholder="From..."
                                    className="w-1/3 px-2 py-1.5 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
                                />
                                <input
                                    type="text"
                                    value={newEdgeTarget}
                                    onChange={(e) => setNewEdgeTarget(e.target.value)}
                                    placeholder="To..."
                                    className="w-1/3 px-2 py-1.5 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddKgEdge()}
                                />
                                <button
                                    onClick={handleAddKgEdge}
                                    disabled={!newEdgeSource.trim() || !newEdgeTarget.trim() || kgLoading}
                                    className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Link size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {kgError && <div className="text-red-400 text-center p-4">{kgError}</div>}

            {kgLoading ? (
                <div className="h-96 flex items-center justify-center bg-gray-800 rounded-lg">
                    <Loader className="animate-spin text-green-400" size={32} />
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 flex flex-col gap-4">
                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                            <h5 className="font-semibold text-sm mb-2 text-white">Controls</h5>
                            <label className="text-xs text-gray-400">Active Generation</label>
                            <div className="flex items-center gap-2">
                                <input type="range" min="0" max={kgGenerations.length > 0 ? Math.max(...kgGenerations) : 0} value={currentKgGeneration || 0} onChange={(e) => setCurrentKgGeneration(parseInt(e.target.value))} className="w-full accent-green-500" disabled={kgGenerations.length === 0} />
                                <span className="font-mono text-sm p-1 bg-gray-700 text-white rounded">{currentKgGeneration}</span>
                            </div>
                            <button onClick={handleKgRollback} disabled={currentKgGeneration === 0 || kgLoading} className="w-full mt-3 text-xs py-1.5 bg-red-900 hover:bg-red-800 text-red-300 rounded flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"><Repeat size={14} /> Rollback One Gen</button>
                        </div>

                        {selectedKgNode && (() => {
                            const outgoingEdges = processedGraphData.links.filter((l: any) =>
                                (typeof l.source === 'string' ? l.source : l.source?.id) === selectedKgNode.id
                            );
                            const incomingEdges = processedGraphData.links.filter((l: any) =>
                                (typeof l.target === 'string' ? l.target : l.target?.id) === selectedKgNode.id
                            );
                            return (
                                <div className={`bg-gray-800 p-3 rounded-lg border max-h-96 overflow-y-auto ${kgEditMode === 'edit' ? 'border-blue-600' : 'border-green-600'}`}>
                                    <h5 className="font-semibold text-sm mb-2 text-white flex items-center justify-between">
                                        Selected Node {kgEditMode === 'view' && <span className="text-xs text-green-400 font-normal">(View Mode)</span>}
                                        <button onClick={() => setSelectedKgNode(null)} className="text-gray-400 hover:text-white">
                                            <X size={14} />
                                        </button>
                                    </h5>
                                    <p className="text-sm font-mono text-blue-400 truncate mb-2" title={selectedKgNode.id}>{selectedKgNode.id}</p>
                                    <p className="text-xs text-gray-400 mb-2">Type: {selectedKgNode.type || 'concept'}</p>
                                    {kgEditMode === 'edit' && (
                                        <button
                                            onClick={() => handleDeleteKgNode(selectedKgNode.id)}
                                            className="w-full text-xs py-1.5 bg-red-600 hover:bg-red-500 text-white rounded flex items-center justify-center gap-2 transition-colors mb-3"
                                        >
                                            <Trash2 size={14} /> Delete Node
                                        </button>
                                    )}

                                    <div className={kgEditMode === 'edit' ? 'border-t border-gray-700 pt-2' : ''}>
                                        <h6 className="text-xs text-gray-400 font-semibold mb-2">
                                            Connections ({outgoingEdges.length + incomingEdges.length})
                                        </h6>

                                        {outgoingEdges.length > 0 && (
                                            <div className="mb-2">
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1 mb-1">
                                                    → Outgoing ({outgoingEdges.length})
                                                </span>
                                                <div className="space-y-1">
                                                    {outgoingEdges.map((edge: any, i: number) => {
                                                        const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;
                                                        return (
                                                            <div key={i} className="flex items-center gap-1 text-xs bg-gray-900 rounded px-2 py-1">
                                                                <span className="text-gray-300 truncate flex-1 font-mono" title={targetId}>{targetId}</span>
                                                                {kgEditMode === 'edit' && (
                                                                    <button
                                                                        onClick={() => handleDeleteKgEdge(selectedKgNode.id, targetId)}
                                                                        className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0"
                                                                        title="Remove connection"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {incomingEdges.length > 0 && (
                                            <div className="mb-2">
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1 mb-1">
                                                    ← Incoming ({incomingEdges.length})
                                                </span>
                                                <div className="space-y-1">
                                                    {incomingEdges.map((edge: any, i: number) => {
                                                        const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
                                                        return (
                                                            <div key={i} className="flex items-center gap-1 text-xs bg-gray-900 rounded px-2 py-1">
                                                                <span className="text-gray-300 truncate flex-1 font-mono" title={sourceId}>{sourceId}</span>
                                                                {kgEditMode === 'edit' && (
                                                                    <button
                                                                        onClick={() => handleDeleteKgEdge(sourceId, selectedKgNode.id)}
                                                                        className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0"
                                                                        title="Remove connection"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {outgoingEdges.length === 0 && incomingEdges.length === 0 && (
                                            <p className="text-xs text-gray-500 italic">No connections</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                            <h5 className="font-semibold text-sm mb-2 text-white">Current View Stats</h5>
                            <p className="text-xs text-gray-400">Nodes: <span className="font-bold text-white">{processedGraphData.nodes.length}</span></p>
                            <p className="text-xs text-gray-400">Links: <span className="font-bold text-white">{processedGraphData.links.length}</span></p>
                            {networkStats && kgViewMode === 'full' && (
                                <>
                                    <p className="text-xs text-gray-400">Density: <span className="font-bold text-white">{networkStats.density?.toFixed(4)}</span></p>
                                    <p className="text-xs text-gray-400">Avg Degree: <span className="font-bold text-white">{networkStats.avg_degree?.toFixed(2)}</span></p>
                                </>
                            )}
                        </div>

                        {centralityData?.degree && (
                            <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                                <h5 className="font-semibold text-sm mb-2 text-white">Top Central Concepts</h5>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {Object.entries(centralityData.degree).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 10).map(([node, score]) => (
                                        <div key={node} className="text-xs cursor-pointer hover:bg-gray-700 p-1 rounded" title={node} onClick={() => setSelectedKgNode({ id: node })}>
                                            <div className="truncate font-mono text-gray-300">{node}</div>
                                            <div className="text-green-400 font-semibold">{(score as number).toFixed(3)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="col-span-3 h-96 bg-gray-800 rounded-lg relative overflow-hidden border border-gray-700">
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
                            onNodeClick={(node: any) => setSelectedKgNode(node)}
                            width={800}
                            height={384}
                            backgroundColor="transparent"
                        />
                    </div>
                </div>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
                <div
                    className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b theme-border">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <GitBranch className="text-green-400" size={20} />
                            Knowledge Graph Editor
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                            <span className="text-xl">&times;</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    return content;
};

export default KnowledgeGraphEditor;
