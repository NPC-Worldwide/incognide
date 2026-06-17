import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
    GitBranch, Brain, Zap, Loader, Plus, Link, X, Trash2, Repeat, Search,
    ChevronDown, ChevronUp, ChevronRight, ArrowRight, BarChart3, Network,
    FolderTree, LayoutGrid, Table2, Edit3, Check, ZoomIn, Minus, Maximize2,
    Clock, Upload, MessageSquare, FileText, Send, Dna
} from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import { useAiEnabled } from './AiFeatureContext';
import KgIcon from './icons/KgIcon';
const SememolutionPanel = lazy(() => import('./SememolutionPanel'));
const KgPipelinePanel = lazy(() => import('./KgPipelinePanel'));

type ViewTab = 'graph' | 'table' | 'tree' | 'groups' | 'sememolution';

interface KnowledgeGraphEditorProps {
    isModal?: boolean;
    onClose?: () => void;
    currentPath?: string;
    memories?: any[];
    knowledge?: any[];
}

const KnowledgeGraphEditor: React.FC<KnowledgeGraphEditorProps> = ({ isModal = false, onClose, currentPath, memories: memoriesProp, knowledge: knowledgeProp }) => {
    const aiEnabled = useAiEnabled();

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
    const [sourceMemoryId, setSourceMemoryId] = useState<number | null>(null);
    const [sourceMemory, setSourceMemory] = useState<any>(null);
    const [sourceMemoryLoading, setSourceMemoryLoading] = useState(false);

    const [stores, setStores] = useState<any[]>([]);
    const [selectedStorePaths, setSelectedStorePaths] = useState<string[]>([]);

    useEffect(() => {
        if (sourceMemoryId == null) { setSourceMemory(null); return; }
        let cancelled = false;
        (async () => {
            setSourceMemoryLoading(true);
            try {
                const r = await (window as any).api?.executeSQL?.({
                    query: `SELECT id, conversation_id, message_id, npc, team, directory_path, timestamp, initial_memory, final_memory, status, model, provider, created_at FROM memory_lifecycle WHERE id = ${Number(sourceMemoryId)} LIMIT 1`,
                });
                if (cancelled) return;
                const rows = Array.isArray(r?.result) ? r.result : Array.isArray(r) ? r : (r?.rows || r?.data || []);
                setSourceMemory(rows?.[0] || null);
            } catch {
                setSourceMemory(null);
            } finally {
                if (!cancelled) setSourceMemoryLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [sourceMemoryId]);
    const graphRef = useRef<any>(null);

    const [activeTab, setActiveTab] = useState<ViewTab>('graph');

    const [newNodeName, setNewNodeName] = useState('');
    const [newNodeType, setNewNodeType] = useState<'concept' | 'fact'>('concept');

    const [newEdgeSource, setNewEdgeSource] = useState('');
    const [newEdgeTarget, setNewEdgeTarget] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ facts: any[], concepts: any[] }>({ facts: [], concepts: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
    const [showSearchResults, setShowSearchResults] = useState(false);

    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());


    const [showImportPanel, setShowImportPanel] = useState(false);
    const [importText, setImportText] = useState('');
    const [importGuidance, setImportGuidance] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importMsg, setImportMsg] = useState<string | null>(null);

    const [showQueryPanel, setShowQueryPanel] = useState(false);
    const [showPipelinePanel, setShowPipelinePanel] = useState(false);
    const [queryInput, setQueryInput] = useState('');
    const [queryHistory, setQueryHistory] = useState<{ q: string; a: string; sources: string[]; candidates?: any[] }[]>([]);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryMode, setQueryMode] = useState<'keyword' | 'traversal' | 'sememolution'>('keyword');
    const [queryLambdaDepth, setQueryLambdaDepth] = useState(2.0);
    const [queryLambdaBreadth, setQueryLambdaBreadth] = useState(5.0);
    const [querySimilarityThreshold, setQuerySimilarityThreshold] = useState(0.6);
    const [queryPopulationId, setQueryPopulationId] = useState<string>('');
    const [availablePopulations, setAvailablePopulations] = useState<Array<{ id: string; name: string }>>([]);

    useEffect(() => {
        (async () => {
            try {
                const r = await (window as any).api?.kg_population_list?.();
                if (Array.isArray(r?.populations)) {
                    setAvailablePopulations(r.populations);
                    if (!queryPopulationId && r.populations[0]) setQueryPopulationId(r.populations[0].id);
                }
            } catch {}
        })();
    }, [queryPopulationId]);

    const [tableSortField, setTableSortField] = useState<'name' | 'type' | 'connections'>('connections');
    const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
    const [tableFilter, setTableFilter] = useState('');
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editingNodeName, setEditingNodeName] = useState('');

    const [treeRootId, setTreeRootId] = useState<string | null>(null);
    const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
    const [treeBreadcrumbs, setTreeBreadcrumbs] = useState<string[]>([]);

    const [showDetail, setShowDetail] = useState(true);

    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const [connectMode, setConnectMode] = useState(false);
    const [connectSource, setConnectSource] = useState<string | null>(null);
    const [newNodePopup, setNewNodePopup] = useState<{ x: number; y: number } | null>(null);
    const [newNodePopupName, setNewNodePopupName] = useState('');
    const [newNodePopupType, setNewNodePopupType] = useState<'concept' | 'fact'>('concept');
    const lastBgClickTime = useRef(0);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: any } | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

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

    const [localKnowledge, setLocalKnowledge] = useState<any>(null);
    const [knowledgeLoading, setKnowledgeLoading] = useState(true);

    const buildGraphFromData = useCallback((memories: any[], knowledge: any[]) => {
        const seen = new Set<string>();
        const mems = [];
        const linkSeen = new Set<string>();
        const links = [];
        for (const m of memories || []) {
            const key = String(m.id);
            if (seen.has(key)) continue;
            seen.add(key);
            mems.push(m);
        }
        for (const l of knowledge || []) {
            const key = `${String(l.from)}|${String(l.to)}|${l.relation}`;
            if (linkSeen.has(key)) continue;
            linkSeen.add(key);
            links.push(l);
        }
        setLocalKnowledge({ memories: mems, knowledge: links, directory: currentPath });
        const nodes = mems.map((m: any) => ({
            ...m,
            id: String(m.id),
            label: m.initial_memory || m.final_memory || String(m.id),
            type: 'memory',
        }));
        const graphLinks = links.map((l: any) => ({
            source: String(l.from),
            target: String(l.to),
            relation: l.relation,
            agent: l.agent,
            timestamp: l.created_at,
        }));
        setKgData({ nodes, links: graphLinks });
    }, [currentPath]);

    const fetchLocalKnowledge = useCallback(async () => {
        if (memoriesProp && knowledgeProp) {
            buildGraphFromData(memoriesProp, knowledgeProp);
            setKgLoading(false);
            return;
        }
        setKnowledgeLoading(true);
        setKgError(null);
        try {
            const data = await (window as any).api?.kgLoadStoreData?.({ storePaths: selectedStorePaths }).catch(() => ({}));
            buildGraphFromData(data.memories || [], data.knowledge || []);
        } catch (err: any) {
            setKgError(err?.message || String(err));
        } finally {
            setKnowledgeLoading(false);
            setKgLoading(false);
        }
    }, [selectedStorePaths, memoriesProp, knowledgeProp, buildGraphFromData]);

    const fetchKgData = useCallback(async () => {
        try {
            const graphResult = await (window as any).api?.kg_getGraphData?.({ storePaths: selectedStorePaths });
            if (graphResult && !graphResult.error && graphResult.graph) {
                setKgData(graphResult.graph);
            }
            const genResult = await (window as any).api?.kg_listGenerations?.();
            if (genResult && Array.isArray(genResult.generations)) {
                setKgGenerations(genResult.generations);
            }
        } catch (err: any) {
            console.error('KG fetch error:', err);
        }
    }, [selectedStorePaths]);

    const handleRefreshStores = useCallback(async () => {
        try {
            const r = await (window as any).api?.scanKnowledgeStores?.();
            const list = (r?.stores || []) as any[];
            setStores(list);
            setSelectedStorePaths(list.map((s) => s.directory));
        } catch {}
    }, []);


    useEffect(() => { fetchLocalKnowledge(); }, [fetchLocalKnowledge]);

    useEffect(() => { handleRefreshStores(); }, [handleRefreshStores]);

    useEffect(() => {
        if (selectedStorePaths.length === 0) return;
        fetchKgData();
    }, [selectedStorePaths, fetchKgData]);

    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

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
                q: searchQuery, storePaths: selectedStorePaths, type: 'both', limit: 50
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
    }, [searchQuery, currentKgGeneration, selectedStorePaths]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults({ facts: [], concepts: [] });
        setHighlightedNodes(new Set());
        setShowSearchResults(false);
    }, []);

    const processedGraphData = useMemo(() => {
        let sourceNodes: any[] = [];
        let sourceLinks: any[] = [];
        if (kgViewMode === 'cooccurrence' && cooccurrenceData) {
            sourceNodes = cooccurrenceData.nodes || [];
            sourceLinks = cooccurrenceData.links || [];
        } else if (kgData && kgData.nodes) {
            sourceNodes = kgData.nodes;
            sourceLinks = kgData.links || [];
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

    const allNodeNames = useMemo(() => [...new Set(processedGraphData.nodes.map((n: any) => n.id))], [processedGraphData]);

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

    const connectedComponents = useMemo(() => {
        const visited = new Set<string>();
        const components: { root: string; nodes: string[] }[] = [];
        processedGraphData.nodes.forEach((n: any) => {
            if (visited.has(n.id)) return;
            const comp: string[] = [];
            const stack = [n.id];
            while (stack.length > 0) {
                const curr = stack.pop()!;
                if (visited.has(curr)) continue;
                visited.add(curr);
                comp.push(curr);
                (adjacencyMap[curr] || []).forEach(nb => { if (!visited.has(nb)) stack.push(nb); });
            }
            let best = comp[0], bestDeg = 0;
            comp.forEach(id => { const d = nodeDegreeMap[id] || 0; if (d > bestDeg) { bestDeg = d; best = id; } });
            components.push({ root: best, nodes: comp });
        });
        return components.sort((a, b) => b.nodes.length - a.nodes.length);
    }, [processedGraphData, adjacencyMap, nodeDegreeMap]);

    const communityGroups = useMemo(() => {
        const groups: Record<string, any[]> = {};
        processedGraphData.nodes.forEach((n: any) => {
            const community = n.community !== undefined ? `Community ${n.community}` : 'Ungrouped';
            if (!groups[community]) groups[community] = [];
            groups[community].push(n);
        });
        return groups;
    }, [processedGraphData]);

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

    const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.id;
        const size = getNodeSize(node);
        const color = connectSource === node.id ? '#f97316' : selectedKgNode?.id === node.id ? '#f59e0b' : getNodeColor(node);

        const isHovered = hoveredNodeId === node.id;
        const isHoverNeighbor = hoveredNodeId ? (adjacencyMap[hoveredNodeId] || []).includes(node.id) : false;
        const isImportant = highlightedNodes.has(node.id) || selectedKgNode?.id === node.id || selectedNodeIds.has(node.id) || isHovered;
        if (hoveredNodeId && !isHovered && !isHoverNeighbor && !isImportant) {
            ctx.globalAlpha = 0.15;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();

        if (node.type === 'concept') {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        if (isHovered) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI, false);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        if (connectSource === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI, false);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (isImportant || globalScale > 3.5) {
            const fontSize = Math.max(10, 12 / globalScale);
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            const maxLen = globalScale > 2 ? 40 : 20;
            const displayLabel = label.length > maxLen ? label.slice(0, maxLen) + '...' : label;

            const textWidth = ctx.measureText(displayLabel).width;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(node.x - textWidth / 2 - 2, node.y + size + 2, textWidth + 4, fontSize + 2);

            ctx.fillStyle = isImportant ? '#fff' : 'rgba(255,255,255,0.8)';
            ctx.fillText(displayLabel, node.x, node.y + size + 3);
        }
        ctx.globalAlpha = 1;
    }, [getNodeColor, getNodeSize, highlightedNodes, selectedKgNode, selectedNodeIds, connectSource, hoveredNodeId, adjacencyMap]);

    const handleIngestText = async () => {
        if (!importText.trim()) return;
        setImportLoading(true);
        setImportMsg(null);
        try {
            const result = await (window as any).api?.kg_ingest?.({
                content: importText,
                context: importGuidance || undefined,
                get_concepts: true,
                link_concepts_facts: true,
                storePaths: selectedStorePaths
            });
            if (result?.error) {
                setImportMsg(`Error: ${result.error}`);
            } else {
                setImportMsg(`Ingested! Gen ${result.generation}: ${result.facts} facts, ${result.concepts} concepts`);
                setImportText('');
                setCurrentKgGeneration(null);
                fetchKgData();
            }
        } catch (err: any) {
            setImportMsg(`Error: ${err.message}`);
        } finally {
            setImportLoading(false);
        }
    };

    const handleIngestFile = async () => {
        try {
            const filePaths = await (window as any).api?.showOpenDialog?.({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Text & Data', extensions: ['txt', 'md', 'csv', 'tsv', 'json', 'jsonl'] }
                ]
            });
            if (!filePaths || filePaths.length === 0) return;

            setImportLoading(true);
            setImportMsg(null);

            let allText = '';
            for (const fp of filePaths) {
                const content = await (window as any).api?.readFile?.(fp);
                if (content) {
                    allText += `\n--- ${fp} ---\n${content}\n`;
                }
            }

            if (!allText.trim()) {
                setImportMsg('No readable content found in selected files.');
                setImportLoading(false);
                return;
            }

            const result = await (window as any).api?.kg_ingest?.({
                content: allText,
                context: importGuidance || undefined,
                get_concepts: true,
                link_concepts_facts: true,
                storePaths: selectedStorePaths
            });
            if (result?.error) {
                setImportMsg(`Error: ${result.error}`);
            } else {
                setImportMsg(`Ingested ${filePaths.length} file(s)! Gen ${result.generation}: ${result.facts} facts, ${result.concepts} concepts`);
                setCurrentKgGeneration(null);
                fetchKgData();
            }
        } catch (err: any) {
            setImportMsg(`Error: ${err.message}`);
        } finally {
            setImportLoading(false);
        }
    };

    const handleQueryKg = async () => {
        if (!queryInput.trim()) return;
        const q = queryInput.trim();
        setQueryInput('');
        setQueryLoading(true);
        try {
            const payload: any = {
                question: q,
                top_k: 15,
                mode: queryMode,
                lambda_depth: queryLambdaDepth,
                lambda_breadth: queryLambdaBreadth,
                similarity_threshold: querySimilarityThreshold,
                storePaths: selectedStorePaths,
            };
            if (queryMode === 'sememolution' && queryPopulationId) {
                payload.population_id = queryPopulationId;
            }
            const result = await (window as any).api?.kg_query?.({ ...payload });
            if (result?.error) {
                setQueryHistory(prev => [...prev, { q, a: `Error: ${result.error}`, sources: [] }]);
            } else if (result?.candidates) {
                const top = result.candidates[0];
                const a = top?.response || 'No ranked candidates.';
                const sources = top?.context_facts || [];
                setQueryHistory(prev => [...prev, { q, a, sources, candidates: result.candidates }]);
            } else {
                setQueryHistory(prev => [...prev, {
                    q,
                    a: result.answer || 'No answer generated.',
                    sources: result.sources || []
                }]);
            }
        } catch (err: any) {
            setQueryHistory(prev => [...prev, { q, a: `Error: ${err.message}`, sources: [] }]);
        } finally {
            setQueryLoading(false);
        }
    };

    const handleKgProcessTrigger = async (type: string) => {
        setKgLoading(true);
        setKgError(null);
        try {
            await (window as any).api?.kg_triggerProcess?.({ type, storePaths: selectedStorePaths });
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
            setKgLoading(true);
            try {
                await (window as any).api?.kg_rollback?.({ storePaths: selectedStorePaths });
                setCurrentKgGeneration(0);
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
            await (window as any).api?.kg_addNode?.({ nodeId: newNodeName.trim(), nodeType: newNodeType, storePaths: selectedStorePaths });
            setNewNodeName('');
            fetchKgData();
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleDeleteKgNode = async (nodeId: string) => {
        setKgLoading(true);
        try {
            await (window as any).api?.kg_deleteNode?.({ nodeId, storePaths: selectedStorePaths });
            setSelectedKgNode(null);
            selectedNodeIds.delete(nodeId);
            setSelectedNodeIds(new Set(selectedNodeIds));
            setPendingDelete(null);
            fetchKgData();
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedNodeIds.size === 0) return;
        setKgLoading(true);
        try {
            for (const nodeId of selectedNodeIds) {
                await (window as any).api?.kg_deleteNode?.({ nodeId, storePaths: selectedStorePaths });
            }
            setSelectedNodeIds(new Set());
            setSelectedKgNode(null);
            setPendingDelete(null);
            fetchKgData();
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleAddKgEdge = async () => {
        const src = newEdgeSource.trim();
        const tgt = newEdgeTarget.trim();
        if (!src || !tgt) return;
        try {
            const r = await (window as any).api?.kg_addEdge?.({ sourceId: src, targetId: tgt, storePaths: selectedStorePaths });
            if (r?.error) { setKgError(r.error); return; }
            setNewEdgeSource('');
            setNewEdgeTarget('');
            setKgData(prev => {
                if (prev.links.some((l: any) => (l.source === src || l.source?.id === src) && (l.target === tgt || l.target?.id === tgt))) return prev;
                return { ...prev, links: [...prev.links, { source: src, target: tgt, type: 'related_to', weight: 1 }] };
            });
        } catch (err: any) {
            setKgError(err.message);
        }
    };

    const handleDeleteKgEdge = async (sourceId: string, targetId: string) => {
        try {
            const r = await (window as any).api?.kg_deleteEdge?.({ sourceId, targetId, storePaths: selectedStorePaths });
            if (r?.error) { setKgError(r.error); return; }
            setKgData(prev => ({
                ...prev,
                links: prev.links.filter((l: any) => {
                    const s = l.source?.id ?? l.source;
                    const t = l.target?.id ?? l.target;
                    return !(s === sourceId && t === targetId);
                }),
            }));
        } catch (err: any) {
            setKgError(err.message);
        }
    };

    const handlePopupAddNode = async () => {
        if (!newNodePopupName.trim()) return;
        setKgLoading(true);
        try {
            await (window as any).api?.kg_addNode?.({ nodeId: newNodePopupName.trim(), nodeType: newNodePopupType, storePaths: selectedStorePaths });
            setNewNodePopup(null);
            setNewNodePopupName('');
            fetchKgData();
        } catch (err: any) {
            setKgError(err.message);
        } finally {
            setKgLoading(false);
        }
    };

    const handleBackgroundClick = useCallback((event: MouseEvent) => {
        setContextMenu(null);
        if (connectMode) {
            setConnectSource(null);
            return;
        }
        const now = Date.now();
        if (now - lastBgClickTime.current < 400) {
            const rect = graphContainerRef.current?.getBoundingClientRect();
            if (rect) {
                setNewNodePopup({ x: event.clientX - rect.left, y: event.clientY - rect.top });
                setNewNodePopupName('');
                setNewNodePopupType('concept');
            }
            lastBgClickTime.current = 0;
        } else {
            lastBgClickTime.current = now;
            setNewNodePopup(null);
        }
    }, [connectMode]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (contextMenu) setContextMenu(null);
                else if (newNodePopup) setNewNodePopup(null);
                else if (connectMode) { setConnectMode(false); setConnectSource(null); }
            }

            if ((e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey)) && selectedKgNode && !editingNodeId) {
                const tag = (document.activeElement as HTMLElement)?.tagName;
                if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
                    e.preventDefault();
                    setPendingDelete(selectedKgNode.id);
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [connectMode, newNodePopup, contextMenu, selectedKgNode, editingNodeId]);

    const handleNodeClick = useCallback((node: any, event?: MouseEvent) => {
        if (connectMode) {
            if (!connectSource) {
                setConnectSource(node.id);
            } else if (connectSource !== node.id) {
                const src = connectSource;
                const tgt = node.id;
                (async () => {
                    try {
                        const r = await (window as any).api?.kg_addEdge?.({ sourceId: src, targetId: tgt, storePaths: selectedStorePaths });
                        setConnectSource(null);
                        if (r?.error) { setKgError(r.error); return; }
                        setKgData(prev => {
                            if (prev.links.some((l: any) => (l.source === src || l.source?.id === src) && (l.target === tgt || l.target?.id === tgt))) return prev;
                            return { ...prev, links: [...prev.links, { source: src, target: tgt, type: 'related_to', weight: 1 }] };
                        });
                    } catch (err: any) {
                        setKgError(err.message);
                    }
                })();
            }
            return;
        }
        if (event?.shiftKey) {
            setSelectedNodeIds(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
            });
        } else {
            setSelectedKgNode(node);
            setSelectedNodeIds(new Set());
            setShowDetail(true);
        }
    }, [connectMode, connectSource, fetchKgData, currentKgGeneration, selectedStorePaths]);

    const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
        event.preventDefault();
        const rect = graphContainerRef.current?.getBoundingClientRect();
        if (rect) {
            setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, node });
        }
    }, []);

    const handleNodeHover = useCallback((node: any | null) => {
        setHoveredNodeId(node ? node.id : null);
    }, []);

    const handleZoomIn = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300), []);
    const handleZoomOut = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 300), []);
    const handleZoomFit = useCallback(() => graphRef.current?.zoomToFit(400, 40), []);

    const centerOnNode = useCallback((nodeId: string) => {
        const node = processedGraphData.nodes.find((n: any) => n.id === nodeId);
        if (node && graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 500);
            graphRef.current.zoom(3, 500);
        }
        setSelectedKgNode(node || { id: nodeId });
        setShowDetail(true);
        setActiveTab('graph');
    }, [processedGraphData]);

    const toggleTableSort = (field: 'name' | 'type' | 'connections') => {
        if (tableSortField === field) {
            setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setTableSortField(field);
            setTableSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

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

    const DeleteConfirm = ({ nodeId, onConfirm, onCancel }: { nodeId: string; onConfirm: () => void; onCancel: () => void }) => (
        <span className="inline-flex items-center gap-1 ml-1">
            <span className="text-[10px] text-red-400">Delete?</span>
            <button onClick={(e) => { e.stopPropagation(); onConfirm(); }} className="p-0.5 bg-red-600 hover:bg-red-500 text-white rounded" title="Confirm delete"><Check size={10} /></button>
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="p-0.5 theme-bg-secondary theme-text-muted rounded" title="Cancel"><X size={10} /></button>
        </span>
    );

    const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
        { id: 'graph', label: 'Graph', icon: <Network size={14} /> },
        { id: 'table', label: 'Table', icon: <Table2 size={14} /> },
        { id: 'tree', label: 'Tree', icon: <FolderTree size={14} /> },
        { id: 'groups', label: 'Groups', icon: <LayoutGrid size={14} /> },
        { id: 'sememolution', label: 'Sememolution', icon: <Dna size={14} /> },
    ];

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
                    className={`flex items-center gap-2 py-1 px-2 rounded text-sm cursor-pointer transition-colors group ${
                        isSelected ? 'theme-bg-active theme-text-primary' : 'hover:theme-bg-hover theme-text-secondary'
                    }`}
                    onClick={() => { setSelectedKgNode(node); setShowDetail(true); }}
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
                    <div className="hidden group-hover:flex items-center gap-1">
                        {hasChildren && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setTreeRoot(nodeId); }}
                                className="p-0.5 theme-text-muted hover:text-blue-400"
                                title="Set as root"
                            >
                                <ArrowRight size={12} />
                            </button>
                        )}
                        {pendingDelete === nodeId ? (
                            <DeleteConfirm nodeId={nodeId} onConfirm={() => handleDeleteKgNode(nodeId)} onCancel={() => setPendingDelete(null)} />
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(nodeId); }}
                                className="p-0.5 text-red-400 hover:text-red-300"
                                title="Delete"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                </div>
                {isExpanded && hasChildren && children.map(childId => renderTreeNode(childId, depth + 1, new Set(visited)))}
            </div>
        );
    };

    const renderNodeDetail = () => {
        if (!selectedKgNode) return (
            <div className="text-xs theme-text-muted text-center py-6 italic">
                Click a node to see details
            </div>
        );
        const outgoing = processedGraphData.links.filter((l: any) =>
            (typeof l.source === 'string' ? l.source : l.source?.id) === selectedKgNode.id
        );
        const incoming = processedGraphData.links.filter((l: any) =>
            (typeof l.target === 'string' ? l.target : l.target?.id) === selectedKgNode.id
        );
        return (
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold text-xs theme-text-primary">Selected Node</h5>
                    <button onClick={() => { setSelectedKgNode(null); setPendingDelete(null); }} className="theme-text-muted hover:theme-text-primary"><X size={14} /></button>
                </div>
                <p className="text-xs font-mono text-blue-400 break-words mb-1" title={selectedKgNode.id}>{selectedKgNode.id}</p>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        selectedKgNode.type === 'concept' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                        {selectedKgNode.type || 'concept'}
                    </span>
                    {selectedKgNode.type === 'memory' && (
                        <button
                            onClick={() => setSourceMemoryId(selectedKgNode.id)}
                            className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30"
                            title="View the source memory"
                        >
                            <MessageSquare size={10} /> memory #{selectedKgNode.id}
                        </button>
                    )}
                    <button
                        onClick={() => centerOnNode(selectedKgNode.id)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                    >
                        <ZoomIn size={10} /> Focus
                    </button>
                    <button
                        onClick={() => { setConnectMode(true); setConnectSource(selectedKgNode.id); setActiveTab('graph'); }}
                        className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-0.5"
                    >
                        <Link size={10} /> Connect
                    </button>
                    <button
                        onClick={() => { setTreeRootId(selectedKgNode.id); setTreeBreadcrumbs([selectedKgNode.id]); setTreeExpanded(new Set([selectedKgNode.id])); setActiveTab('tree'); }}
                        className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-0.5"
                    >
                        <FolderTree size={10} /> Tree
                    </button>
                </div>

                {selectedKgNode.type === 'memory' && (
                    <div className="mb-3 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                        <p className="text-xs theme-text-secondary whitespace-pre-wrap">{selectedKgNode.initial_memory || selectedKgNode.final_memory || selectedKgNode.label || '—'}</p>
                        {selectedKgNode.final_memory && selectedKgNode.final_memory !== selectedKgNode.initial_memory && (
                            <p className="text-[10px] theme-text-muted mt-1 border-t border-amber-500/10 pt-1">Edited: {selectedKgNode.final_memory}</p>
                        )}
                        {(selectedKgNode.source_type || selectedKgNode.source_id) && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                                {selectedKgNode.source_type && (
                                    <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                                        selectedKgNode.source_type === 'conversation' ? 'bg-blue-500/20 text-blue-400' :
                                        selectedKgNode.source_type === 'file' ? 'bg-green-500/20 text-green-400' :
                                        selectedKgNode.source_type === 'url' ? 'bg-purple-500/20 text-purple-400' :
                                        'bg-gray-500/20 text-gray-400'
                                    }`}>
                                        {selectedKgNode.source_type}
                                    </span>
                                )}
                                {selectedKgNode.source_id && (
                                    <span className="theme-text-muted truncate flex-1">{selectedKgNode.source_id}</span>
                                )}
                            </div>
                        )}
                        <div className="mt-1.5 space-y-0.5 text-[10px] theme-text-muted">
                            {Object.entries(selectedKgNode)
                                .filter(([k, v]) => v != null && v !== '' &&
                                    !['id','label','type','x','y','vx','vy','fx','fy','index','__indexColor','__colorValue','initial_memory','final_memory','source_type','source_id'].includes(k)
                                )
                                .map(([k, v]) => (
                                    <div key={k} className={k === 'directory_path' ? 'truncate' : ''} title={k === 'directory_path' ? String(v) : undefined}>
                                        {k}: {String(v)}
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {pendingDelete === selectedKgNode.id ? (
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-red-400">Delete this node?</span>
                        <button onClick={() => handleDeleteKgNode(selectedKgNode.id)} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded">Yes</button>
                        <button onClick={() => setPendingDelete(null)} className="px-2 py-1 text-xs theme-bg-secondary theme-text-muted rounded border theme-border">No</button>
                    </div>
                ) : (
                    <button
                        onClick={() => setPendingDelete(selectedKgNode.id)}
                        className="w-full text-xs py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded flex items-center justify-center gap-2 transition-colors mb-3 border border-red-900/50"
                    >
                        <Trash2 size={12} /> Delete Node
                    </button>
                )}

                <div className="border-t theme-border pt-2">
                    <h6 className="text-xs theme-text-muted font-semibold mb-2">
                        Connections ({outgoing.length + incoming.length})
                    </h6>
                    {outgoing.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] theme-text-muted flex items-center gap-1 mb-1">→ Outgoing ({outgoing.length})</span>
                            <div className="space-y-0.5">
                                {outgoing.map((edge: any, i: number) => {
                                    const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;
                                    return (
                                        <div key={i} className="flex items-center gap-1 text-xs theme-bg-primary rounded px-2 py-1 group">
                                            <span
                                                className="theme-text-secondary truncate flex-1 font-mono cursor-pointer hover:text-blue-400"
                                                title={targetId}
                                                onClick={() => centerOnNode(targetId)}
                                            >{targetId}</span>
                                            <button
                                                onClick={() => handleDeleteKgEdge(selectedKgNode.id, targetId)}
                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0 opacity-0 group-hover:opacity-100"
                                                title="Remove connection"
                                            ><X size={10} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {incoming.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] theme-text-muted flex items-center gap-1 mb-1">← Incoming ({incoming.length})</span>
                            <div className="space-y-0.5">
                                {incoming.map((edge: any, i: number) => {
                                    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
                                    return (
                                        <div key={i} className="flex items-center gap-1 text-xs theme-bg-primary rounded px-2 py-1 group">
                                            <span
                                                className="theme-text-secondary truncate flex-1 font-mono cursor-pointer hover:text-blue-400"
                                                title={sourceId}
                                                onClick={() => centerOnNode(sourceId)}
                                            >{sourceId}</span>
                                            <button
                                                onClick={() => handleDeleteKgEdge(sourceId, selectedKgNode.id)}
                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0 opacity-0 group-hover:opacity-100"
                                                title="Remove connection"
                                            ><X size={10} /></button>
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

    const renderEmptyState = () => (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <GitBranch className="text-green-400/30" size={48} />
            <div className="text-center">
                <h3 className="text-sm font-semibold theme-text-primary mb-1">Knowledge Graph is Empty</h3>
                <p className="text-xs theme-text-muted max-w-xs">
                    Add concepts and facts using the bar above, or chat with an AI model to automatically build your knowledge graph over time.
                </p>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs theme-text-muted">
                    <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Concepts
                </div>
                <div className="flex items-center gap-1 text-xs theme-text-muted">
                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Facts
                </div>
            </div>
        </div>
    );

    const nodeDatalist = (
        <datalist id="kg-node-names">
            {allNodeNames.map(name => <option key={name} value={name} />)}
        </datalist>
    );

    const content = (
        <div className="flex flex-col h-full theme-bg-primary">
            {nodeDatalist}

            <div className="flex items-center justify-between px-3 py-1.5 border-b theme-border flex-shrink-0">
                <h4 className="text-sm font-semibold flex items-center gap-2 theme-text-primary">
                    <KgIcon className="text-green-400" size={16} />Knowledge Graph
                    <span className="text-xs theme-text-muted font-normal">{processedGraphData.nodes.length} nodes · {processedGraphData.links.length} edges</span>
                </h4>
                <div className="flex items-center gap-1.5">
                    {aiEnabled && (
                        <>
                            <button
                                onClick={() => { setShowPipelinePanel(!showPipelinePanel); setShowImportPanel(false); setShowQueryPanel(false); }}
                                className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 border theme-border ${showPipelinePanel ? 'bg-green-600/30 text-green-300' : 'theme-bg-secondary theme-text-secondary hover:opacity-80'}`}
                            >
                                <Zap size={11} /> Steps
                            </button>
                            <button
                                onClick={() => { setShowImportPanel(!showImportPanel); setShowQueryPanel(false); }}
                                className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 border theme-border ${showImportPanel ? 'bg-blue-600/30 text-blue-300' : 'theme-bg-secondary theme-text-secondary hover:opacity-80'}`}
                            >
                                <Upload size={11} /> Import
                            </button>
                            <button
                                onClick={() => { setShowQueryPanel(!showQueryPanel); setShowImportPanel(false); }}
                                className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 border theme-border ${showQueryPanel ? 'bg-purple-600/30 text-purple-300' : 'theme-bg-secondary theme-text-secondary hover:opacity-80'}`}
                            >
                                <Search size={11} /> Ask KG
                            </button>
                        </>
                    )}
                    {kgGenerations.length > 0 && (
                        <div className="flex items-center gap-1 ml-1">
                            <span className="text-[11px] theme-text-muted">Gen:</span>
                            <select
                                value={currentKgGeneration ?? ''}
                                onChange={(e) => {
                                    const gen = parseInt(e.target.value);
                                    setCurrentKgGeneration(gen);
                                    fetchKgData(gen);
                                }}
                                className="px-1.5 py-0.5 text-[11px] theme-bg-secondary theme-text-primary border theme-border rounded"
                            >
                                {kgGenerations.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button onClick={handleKgRollback} disabled={currentKgGeneration === 0 || kgLoading} className="p-0.5 text-red-400 hover:text-red-300 disabled:opacity-50" title="Rollback one generation"><Repeat size={13} /></button>
                        </div>
                    )}
                </div>
            </div>

            {showImportPanel && (
                <div className="px-3 py-2 border-b theme-border flex-shrink-0 space-y-2 bg-blue-950/20">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Upload size={12} className="text-blue-400" /> Import Data into KG
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleIngestFile}
                                disabled={importLoading}
                                className="px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 flex items-center gap-1"
                            >
                                <FileText size={11} /> Browse Files
                            </button>
                            <button
                                onClick={handleIngestText}
                                disabled={importLoading || !importText.trim()}
                                className="px-2 py-1 text-[11px] bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 flex items-center gap-1"
                            >
                                {importLoading ? <Loader size={11} className="animate-spin" /> : <Zap size={11} />}
                                Ingest Text
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder="Paste text, CSV data, or any content to extract facts from..."
                        rows={4}
                        className="w-full px-2 py-1.5 text-[11px] bg-gray-800 text-white border border-gray-600 rounded resize-none placeholder-gray-600 font-mono"
                    />
                    <input
                        type="text"
                        value={importGuidance}
                        onChange={e => setImportGuidance(e.target.value)}
                        placeholder="Guidance: e.g. Extract relationships between people and organizations..."
                        className="w-full px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-600 rounded placeholder-gray-600"
                    />
                    {importMsg && (
                        <div className={`text-[11px] px-2 py-1 rounded ${importMsg.startsWith('Error') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
                            {importMsg}
                        </div>
                    )}
                </div>
            )}

            {showQueryPanel && (
                <div className="px-3 py-2 border-b theme-border flex-shrink-0 bg-purple-950/20" style={{ maxHeight: '40%', display: 'flex', flexDirection: 'column' }}>
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2">
                        <MessageSquare size={12} className="text-purple-400" /> Ask the Knowledge Graph
                    </span>
                    <div className="flex-1 overflow-y-auto space-y-2 mb-2 min-h-0" style={{ maxHeight: '200px' }}>
                        {queryHistory.length === 0 && (
                            <div className="text-[11px] text-gray-500 italic">Ask a question about your knowledge graph data...</div>
                        )}
                        {queryHistory.map((entry, i) => (
                            <div key={i} className="space-y-1">
                                <div className="text-[11px] text-blue-300 font-medium">{entry.q}</div>
                                <div className="text-[11px] text-gray-300 bg-gray-800/50 p-2 rounded whitespace-pre-wrap">{entry.a}</div>
                                {entry.sources.length > 0 && (
                                    <div className="text-[10px] text-gray-500">
                                        Sources: {entry.sources.slice(0, 3).map((s, j) => (
                                            <span key={j} className="inline-block bg-gray-800 px-1.5 py-0.5 rounded mr-1 mt-0.5">{s.length > 60 ? s.slice(0, 60) + '...' : s}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap text-[10px]">
                        <select value={queryMode} onChange={e => setQueryMode(e.target.value as any)}
                            className="px-1.5 py-0.5 theme-bg-secondary border theme-border rounded font-mono">
                            <option value="keyword">mode: keyword</option>
                            <option value="traversal">mode: traversal</option>
                            <option value="sememolution">mode: sememolution</option>
                        </select>
                        {(queryMode === 'traversal' || queryMode === 'sememolution') && (
                            <>
                                <label className="flex items-center gap-1 theme-text-muted">
                                    λdepth
                                    <input type="number" step="0.1" min="0.1" max="10" value={queryLambdaDepth}
                                        onChange={e => setQueryLambdaDepth(parseFloat(e.target.value))}
                                        className="w-14 px-1 py-0.5 theme-bg-secondary border theme-border rounded font-mono" />
                                </label>
                                <label className="flex items-center gap-1 theme-text-muted">
                                    λbreadth
                                    <input type="number" step="0.5" min="1" max="50" value={queryLambdaBreadth}
                                        onChange={e => setQueryLambdaBreadth(parseFloat(e.target.value))}
                                        className="w-14 px-1 py-0.5 theme-bg-secondary border theme-border rounded font-mono" />
                                </label>
                                <label className="flex items-center gap-1 theme-text-muted">
                                    sim
                                    <input type="number" step="0.05" min="0" max="1" value={querySimilarityThreshold}
                                        onChange={e => setQuerySimilarityThreshold(parseFloat(e.target.value))}
                                        className="w-14 px-1 py-0.5 theme-bg-secondary border theme-border rounded font-mono" />
                                </label>
                            </>
                        )}
                        {queryMode === 'sememolution' && (
                            <select value={queryPopulationId} onChange={e => setQueryPopulationId(e.target.value)}
                                className="px-1.5 py-0.5 theme-bg-secondary border theme-border rounded font-mono">
                                <option value="">-- pick population --</option>
                                {availablePopulations.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={queryInput}
                            onChange={e => setQueryInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !queryLoading && handleQueryKg()}
                            placeholder="Ask a question..."
                            className="flex-1 px-2 py-1.5 text-[11px] bg-gray-800 text-white border border-gray-600 rounded placeholder-gray-600"
                        />
                        <button
                            onClick={handleQueryKg}
                            disabled={queryLoading || !queryInput.trim() || (queryMode === 'sememolution' && !queryPopulationId)}
                            className="px-2 py-1.5 text-[11px] bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 flex items-center gap-1"
                        >
                            {queryLoading ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
                        </button>
                    </div>
                </div>
            )}

            {showPipelinePanel && (
                <Suspense fallback={<div className="flex items-center justify-center py-4 theme-text-muted text-xs">Loading Steps…</div>}>
                    <KgPipelinePanel currentPath={currentPath} />
                </Suspense>
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={newNodeName}
                        onChange={(e) => setNewNodeName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddKgNode()}
                        placeholder="Add node..."
                        className="px-2 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-32 focus:outline-none focus:border-green-500"
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

                <button
                    onClick={() => { setConnectMode(!connectMode); setConnectSource(null); }}
                    className={`p-1 rounded text-xs flex items-center gap-1 border transition-colors ${
                        connectMode ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'theme-border theme-text-muted hover:theme-text-primary'
                    }`}
                    title={connectMode ? 'Exit connect mode (Esc)' : 'Connect mode: click two nodes to link them'}
                >
                    <Link size={14} />
                    {connectMode && <span className="text-[10px]">Linking...</span>}
                </button>
                {connectSource && (
                    <span className="text-[10px] text-orange-400 animate-pulse">
                        {connectSource.length > 20 ? connectSource.slice(0, 20) + '...' : connectSource} → ?
                    </span>
                )}

                <div className="flex-1" />

                {selectedNodeIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs theme-text-muted">{selectedNodeIds.size} selected</span>
                        <button onClick={handleBulkDelete} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                        <button onClick={() => setSelectedNodeIds(new Set())} className="px-2 py-1 text-xs theme-bg-secondary theme-text-muted rounded border theme-border">Clear</button>
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search..."
                            className="pl-6 pr-6 py-1 text-xs theme-bg-secondary theme-text-primary border theme-border rounded w-36 focus:outline-none focus:border-green-500"
                        />
                        {searchQuery && (
                            <button onClick={clearSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-primary"><X size={11} /></button>
                        )}
                    </div>
                </div>
            </div>

            {showSearchResults && (searchResults.facts.length > 0 || searchResults.concepts.length > 0) && (
                <div className="mx-3 mt-1 theme-bg-secondary border theme-border rounded-lg max-h-32 overflow-y-auto flex-shrink-0">
                    <button
                        onClick={() => setShowSearchResults(false)}
                        className="w-full px-3 py-1 flex items-center justify-between text-xs theme-text-secondary hover:theme-bg-hover"
                    >
                        <span>{searchResults.facts.length + searchResults.concepts.length} results</span>
                        <ChevronUp size={12} />
                    </button>
                    <div className="px-3 pb-2 space-y-0.5">
                        {searchResults.concepts.map((c: any, i: number) => (
                            <div
                                key={`c-${i}`}
                                className="text-xs p-1.5 bg-purple-900/20 rounded cursor-pointer hover:bg-purple-900/40 flex items-center gap-2"
                                onClick={() => centerOnNode(c.name)}
                            >
                                <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                                <span className="truncate">{c.name}</span>
                            </div>
                        ))}
                        {searchResults.facts.map((f: any, i: number) => (
                            <div
                                key={`f-${i}`}
                                className="text-xs p-1.5 bg-blue-900/20 rounded cursor-pointer hover:bg-blue-900/40 flex items-center gap-2"
                                onClick={() => centerOnNode(f.statement)}
                            >
                                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                <span className="truncate">{f.statement}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-1 px-3 py-1 border-b theme-border flex-shrink-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-2.5 py-1 text-[11px] rounded flex items-center gap-1 transition-colors ${
                            activeTab === tab.id
                                ? 'bg-green-600 text-white'
                                : 'theme-bg-secondary theme-text-muted hover:theme-text-primary border theme-border'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
                {activeTab === 'graph' && (
                    <div className="flex items-center gap-1.5 ml-3">
                        <select value={kgViewMode} onChange={(e) => setKgViewMode(e.target.value)} className="px-1.5 py-0.5 text-[11px] theme-bg-secondary theme-text-primary border theme-border rounded">
                            <option value="full">Full Network</option>
                            <option value="cooccurrence">Co-occurrence</option>
                        </select>
                        <select value={kgNodeFilter} onChange={(e) => setKgNodeFilter(e.target.value)} className="px-1.5 py-0.5 text-[11px] theme-bg-secondary theme-text-primary border theme-border rounded">
                            <option value="all">All Nodes</option>
                            <option value="high-degree">High-Degree</option>
                        </select>
                    </div>
                )}
            </div>

            {kgError && <div className="text-red-400 text-center text-xs py-1.5 px-3 flex-shrink-0">{kgError}</div>}

            {kgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader className="animate-spin text-green-400" size={32} />
                </div>
            ) : processedGraphData.nodes.length === 0 ? (
                renderEmptyState()
            ) : (
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-auto">
                        {activeTab === 'graph' && (
                            <div ref={graphContainerRef} className="flex-1 relative">
                                <ForceGraph2D
                                    ref={graphRef}
                                    graphData={processedGraphData}
                                    nodeCanvasObject={nodeCanvasObject}
                                    nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                                        const size = getNodeSize(node);
                                        ctx.beginPath();
                                        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI, false);
                                        ctx.fillStyle = color;
                                        ctx.fill();
                                    }}
                                    linkWidth={getLinkWidth}
                                    linkDirectionalParticles={kgViewMode === 'full' ? 1 : 0}
                                    linkDirectionalParticleWidth={2}
                                    linkColor={(link: any) => {
                                        if (!hoveredNodeId) return 'rgba(255,255,255,0.2)';
                                        const src = typeof link.source === 'string' ? link.source : link.source?.id;
                                        const tgt = typeof link.target === 'string' ? link.target : link.target?.id;
                                        if (src === hoveredNodeId || tgt === hoveredNodeId) return 'rgba(255,255,255,0.7)';
                                        return 'rgba(255,255,255,0.05)';
                                    }}
                                    onNodeClick={(node: any, event: MouseEvent) => handleNodeClick(node, event)}
                                    onNodeRightClick={handleNodeRightClick}
                                    onNodeHover={handleNodeHover}
                                    onBackgroundClick={handleBackgroundClick}
                                    width={graphDimensions.width}
                                    height={graphDimensions.height}
                                    backgroundColor="transparent"
                                />
                                {contextMenu && (
                                    <div
                                        className="absolute z-30 theme-bg-secondary border theme-border rounded-lg shadow-xl py-1 min-w-[140px]"
                                        style={{ left: contextMenu.x, top: contextMenu.y }}
                                        onClick={() => setContextMenu(null)}
                                    >
                                        <button
                                            onClick={() => centerOnNode(contextMenu.node.id)}
                                            className="w-full text-left px-3 py-1.5 text-xs theme-text-secondary hover:theme-bg-hover flex items-center gap-2"
                                        ><ZoomIn size={12} /> Focus</button>
                                        <button
                                            onClick={() => { setConnectMode(true); setConnectSource(contextMenu.node.id); }}
                                            className="w-full text-left px-3 py-1.5 text-xs theme-text-secondary hover:theme-bg-hover flex items-center gap-2"
                                        ><Link size={12} /> Connect from here</button>
                                        <button
                                            onClick={() => { setTreeRootId(contextMenu.node.id); setTreeBreadcrumbs([contextMenu.node.id]); setTreeExpanded(new Set([contextMenu.node.id])); setActiveTab('tree'); }}
                                            className="w-full text-left px-3 py-1.5 text-xs theme-text-secondary hover:theme-bg-hover flex items-center gap-2"
                                        ><FolderTree size={12} /> View in tree</button>
                                        <div className="border-t theme-border my-1" />
                                        <button
                                            onClick={() => { setPendingDelete(contextMenu.node.id); setSelectedKgNode(contextMenu.node); setShowDetail(true); }}
                                            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                                        ><Trash2 size={12} /> Delete</button>
                                    </div>
                                )}
                                <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
                                    <button onClick={handleZoomIn} className="p-1.5 theme-bg-secondary/80 border theme-border rounded hover:theme-bg-hover backdrop-blur-sm" title="Zoom in"><ZoomIn size={14} className="theme-text-muted" /></button>
                                    <button onClick={handleZoomOut} className="p-1.5 theme-bg-secondary/80 border theme-border rounded hover:theme-bg-hover backdrop-blur-sm" title="Zoom out"><Minus size={14} className="theme-text-muted" /></button>
                                    <button onClick={handleZoomFit} className="p-1.5 theme-bg-secondary/80 border theme-border rounded hover:theme-bg-hover backdrop-blur-sm" title="Fit all"><Maximize2 size={14} className="theme-text-muted" /></button>
                                </div>
                                {!connectMode && !newNodePopup && !contextMenu && processedGraphData.nodes.length > 0 && (
                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] theme-text-muted/50 pointer-events-none select-none">
                                        Double-click to add node · Right-click for options · Shift+click to multi-select
                                    </div>
                                )}
                                {connectMode && (
                                    <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500/20 border border-orange-500/50 rounded-full text-xs text-orange-400 z-10 pointer-events-none">
                                        {connectSource
                                            ? `Click target node to connect from "${connectSource.length > 15 ? connectSource.slice(0, 15) + '...' : connectSource}"`
                                            : 'Click first node to start connection'}
                                    </div>
                                )}
                                {newNodePopup && (
                                    <div
                                        className="absolute z-20 theme-bg-secondary border theme-border rounded-lg shadow-xl p-2"
                                        style={{ left: newNodePopup.x, top: newNodePopup.y, transform: 'translate(-50%, -100%) translateY(-8px)' }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={newNodePopupName}
                                                onChange={(e) => setNewNodePopupName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && newNodePopupName.trim()) handlePopupAddNode();
                                                    else if (e.key === 'Escape') setNewNodePopup(null);
                                                }}
                                                placeholder="Node name..."
                                                className="px-2 py-1 text-xs theme-bg-primary theme-text-primary border theme-border rounded w-32 focus:outline-none focus:border-green-500"
                                                autoFocus
                                            />
                                            <select
                                                value={newNodePopupType}
                                                onChange={(e) => setNewNodePopupType(e.target.value as 'concept' | 'fact')}
                                                className="px-1 py-1 text-[10px] theme-bg-primary theme-text-primary border theme-border rounded"
                                            >
                                                <option value="concept">Concept</option>
                                                <option value="fact">Fact</option>
                                            </select>
                                            <button
                                                onClick={handlePopupAddNode}
                                                disabled={!newNodePopupName.trim()}
                                                className="p-1 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50"
                                            ><Plus size={14} /></button>
                                            <button onClick={() => setNewNodePopup(null)} className="p-1 theme-text-muted hover:theme-text-primary"><X size={12} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                                    <span className="text-xs theme-text-muted ml-2">{tableData.length} nodes</span>
                                </div>
                                <div className="overflow-auto max-h-full">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b theme-border">
                                                <th className="w-8 p-1.5">
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
                                                <th className="text-left p-1.5 cursor-pointer hover:text-green-400 theme-text-secondary" onClick={() => toggleTableSort('name')}>
                                                    Name {tableSortField === 'name' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="text-left p-1.5 cursor-pointer hover:text-green-400 theme-text-secondary w-20" onClick={() => toggleTableSort('type')}>
                                                    Type {tableSortField === 'type' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="text-left p-1.5 cursor-pointer hover:text-green-400 theme-text-secondary w-16" onClick={() => toggleTableSort('connections')}>
                                                    Links {tableSortField === 'connections' && (tableSortDir === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th className="w-20 p-1.5 theme-text-secondary text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.map((node: any) => (
                                                <tr
                                                    key={node.id}
                                                    className={`border-b theme-border transition-colors cursor-pointer ${
                                                        selectedKgNode?.id === node.id ? 'theme-bg-active' : 'hover:theme-bg-hover'
                                                    }`}
                                                    onClick={() => { setSelectedKgNode(node); setShowDetail(true); }}
                                                >
                                                    <td className="p-1.5" onClick={(e) => e.stopPropagation()}>
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
                                                    <td className="p-1.5 font-mono theme-text-primary max-w-xs" title={node.id}>
                                                        {editingNodeId === node.id ? (
                                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="text"
                                                                    value={editingNodeName}
                                                                    onChange={(e) => setEditingNodeName(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {

                                                                            setEditingNodeId(null);
                                                                        } else if (e.key === 'Escape') {
                                                                            setEditingNodeId(null);
                                                                        }
                                                                    }}
                                                                    className="px-1 py-0.5 text-xs theme-bg-primary border theme-border rounded w-full focus:outline-none focus:border-green-500"
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => setEditingNodeId(null)} className="p-0.5 theme-text-muted"><X size={12} /></button>
                                                            </div>
                                                        ) : (
                                                            <span className="truncate block">{node.id}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                            node.type === 'concept' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                            {node.type || 'concept'}
                                                        </span>
                                                    </td>
                                                    <td className="p-1.5 theme-text-secondary">{node.connections}</td>
                                                    <td className="p-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => centerOnNode(node.id)}
                                                                className="p-1 theme-text-muted hover:text-blue-400 rounded"
                                                                title="Focus in graph"
                                                            ><ZoomIn size={12} /></button>
                                                            {pendingDelete === node.id ? (
                                                                <DeleteConfirm nodeId={node.id} onConfirm={() => handleDeleteKgNode(node.id)} onCancel={() => setPendingDelete(null)} />
                                                            ) : (
                                                                <button
                                                                    onClick={() => setPendingDelete(node.id)}
                                                                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                                                                    title="Delete node"
                                                                ><Trash2 size={12} /></button>
                                                            )}
                                                        </div>
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

                        {activeTab === 'tree' && (
                            <div className="p-3">
                                {treeRootId && treeBreadcrumbs.length > 0 && (
                                    <div className="flex items-center gap-1 mb-2 flex-wrap">
                                        <button
                                            onClick={() => { setTreeRootId(null); setTreeBreadcrumbs([]); setTreeExpanded(new Set()); }}
                                            className="text-xs px-1.5 py-0.5 rounded theme-text-muted hover:theme-text-primary"
                                        >All</button>
                                        {treeBreadcrumbs.map((crumb, i) => (
                                            <React.Fragment key={i}>
                                                <ChevronRight size={10} className="theme-text-muted" />
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
                                    {treeRootId ? (
                                        renderTreeNode(treeRootId, 0, new Set())
                                    ) : connectedComponents.length > 0 ? (
                                        connectedComponents.map((comp, ci) => (
                                            <div key={ci} className={ci > 0 ? 'mt-2 pt-2 border-t theme-border' : ''}>
                                                {connectedComponents.length > 1 && (
                                                    <div className="text-[10px] theme-text-muted mb-1 px-2">
                                                        {comp.nodes.length} nodes
                                                    </div>
                                                )}
                                                {renderTreeNode(comp.root, 0, new Set())}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center theme-text-muted text-xs py-8">No nodes in graph</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'groups' && (
                            <div className="p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(communityGroups).sort(([, a], [, b]) => b.length - a.length).map(([groupName, nodes]) => {
                                    const topNodes = [...nodes].sort((a: any, b: any) => (nodeDegreeMap[b.id] || 0) - (nodeDegreeMap[a.id] || 0)).slice(0, 3);
                                    return (
                                    <div key={groupName} className="theme-bg-secondary border theme-border rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <h5 className="text-sm font-semibold theme-text-primary">{groupName}</h5>
                                            <span className="text-xs theme-text-muted">{nodes.length}</span>
                                        </div>
                                        <div className="text-[10px] theme-text-muted mb-2 truncate">
                                            {topNodes.map((n: any) => n.id).join(', ')}
                                        </div>
                                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                            {nodes.slice(0, 30).map((node: any) => (
                                                <div
                                                    key={node.id}
                                                    className={`flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors group ${
                                                        selectedKgNode?.id === node.id ? 'theme-bg-active' : 'hover:theme-bg-hover'
                                                    }`}
                                                    onClick={() => { setSelectedKgNode(node); setShowDetail(true); }}
                                                >
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${node.type === 'concept' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                                                    <span className="font-mono theme-text-secondary truncate flex-1">{node.id}</span>
                                                    <span className="theme-text-muted text-[10px]">{nodeDegreeMap[node.id] || 0}</span>
                                                    {pendingDelete === node.id ? (
                                                        <DeleteConfirm nodeId={node.id} onConfirm={() => handleDeleteKgNode(node.id)} onCancel={() => setPendingDelete(null)} />
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setPendingDelete(node.id); }}
                                                            className="p-0.5 text-red-400 hover:text-red-300 rounded opacity-0 group-hover:opacity-100"
                                                            title="Delete"
                                                        ><Trash2 size={11} /></button>
                                                    )}
                                                </div>
                                            ))}
                                            {nodes.length > 30 && (
                                                <p className="text-xs theme-text-muted text-center py-1">+{nodes.length - 30} more</p>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                                {Object.keys(communityGroups).length === 0 && (
                                    <p className="text-center theme-text-muted text-xs py-8 col-span-full">No groups detected</p>
                                )}
                            </div>
                            </div>
                        )}

                        {activeTab === 'sememolution' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 theme-text-muted text-xs">Loading Sememolution…</div>}>
                                <SememolutionPanel />
                            </Suspense>
                        )}
                    </div>

                    {showDetail && (
                        <div className="w-56 flex-shrink-0 border-l theme-border overflow-y-auto p-2.5 space-y-2.5">
                            {renderNodeDetail()}

                            <div className="theme-bg-secondary p-2.5 rounded-lg border theme-border">
                                <h5 className="font-semibold text-[11px] mb-1.5 theme-text-primary">Stats</h5>
                                <div className="space-y-0.5 text-[11px]">
                                    <p className="theme-text-muted">Nodes: <span className="font-bold theme-text-primary">{processedGraphData.nodes.length}</span></p>
                                    <p className="theme-text-muted">Edges: <span className="font-bold theme-text-primary">{processedGraphData.links.length}</span></p>
                                    {networkStats && (
                                        <>
                                            <p className="theme-text-muted">Density: <span className="font-bold theme-text-primary">{networkStats.density?.toFixed(4)}</span></p>
                                            <p className="theme-text-muted">Avg Degree: <span className="font-bold theme-text-primary">{networkStats.avg_degree?.toFixed(1)}</span></p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {centralityData?.degree && (
                                <div className="theme-bg-secondary p-2.5 rounded-lg border theme-border">
                                    <h5 className="font-semibold text-[11px] mb-1.5 theme-text-primary">Most Connected</h5>
                                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                        {Object.entries(centralityData.degree).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 6).map(([node, score]) => (
                                            <div
                                                key={node}
                                                className="text-[11px] cursor-pointer hover:theme-bg-hover p-1 rounded flex items-center gap-1.5"
                                                title={node}
                                                onClick={() => centerOnNode(node)}
                                            >
                                                <span className="truncate font-mono theme-text-secondary flex-1">{node}</span>
                                                <span className="text-green-400 font-semibold">{(score as number).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {sourceMemoryId != null && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={() => setSourceMemoryId(null)}>
                    <div onClick={e => e.stopPropagation()} className="theme-bg-primary border theme-border rounded-lg shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b theme-border">
                            <div className="flex items-center gap-2">
                                <MessageSquare size={14} className="text-amber-400" />
                                <h4 className="text-sm font-semibold">Source memory #{sourceMemoryId}</h4>
                                {sourceMemory?.status && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                        sourceMemory.status === 'human-approved' ? 'bg-green-600/30 text-green-300' :
                                        sourceMemory.status === 'human-edited' ? 'bg-blue-600/30 text-blue-300' :
                                        sourceMemory.status === 'pending_approval' ? 'bg-yellow-600/30 text-yellow-300' :
                                        'bg-gray-600/30 text-gray-300'
                                    }`}>{sourceMemory.status}</span>
                                )}
                            </div>
                            <button onClick={() => setSourceMemoryId(null)} className="theme-text-muted hover:theme-text-primary"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-3 text-xs">
                            {sourceMemoryLoading ? (
                                <div className="text-center theme-text-muted py-8">Loading…</div>
                            ) : !sourceMemory ? (
                                <div className="text-center text-red-400 py-8">Memory #{sourceMemoryId} not found.</div>
                            ) : (<>
                                <div className="grid grid-cols-2 gap-2 theme-text-muted">
                                    <div><span className="font-semibold">NPC:</span> {sourceMemory.npc || '—'}</div>
                                    <div><span className="font-semibold">Team:</span> {sourceMemory.team || '—'}</div>
                                    <div><span className="font-semibold">Model:</span> {sourceMemory.model || '—'}</div>
                                    <div><span className="font-semibold">Provider:</span> {sourceMemory.provider || '—'}</div>
                                    <div className="col-span-2"><span className="font-semibold">Conversation:</span> <span className="font-mono">{sourceMemory.conversation_id}</span></div>
                                    <div className="col-span-2"><span className="font-semibold">Path:</span> <span className="font-mono break-all">{sourceMemory.directory_path}</span></div>
                                    <div><span className="font-semibold">Created:</span> {sourceMemory.created_at}</div>
                                    <div><span className="font-semibold">Timestamp:</span> {sourceMemory.timestamp}</div>
                                </div>
                                {sourceMemory.initial_memory && (
                                    <div>
                                        <div className="theme-text-muted font-semibold mb-1">Initial memory (extraction)</div>
                                        <pre className="whitespace-pre-wrap bg-black/30 rounded p-2 text-gray-200">{sourceMemory.initial_memory}</pre>
                                    </div>
                                )}
                                {sourceMemory.final_memory && sourceMemory.final_memory !== sourceMemory.initial_memory && (
                                    <div>
                                        <div className="theme-text-muted font-semibold mb-1">Final memory (after human review)</div>
                                        <pre className="whitespace-pre-wrap bg-black/30 rounded p-2 text-gray-200">{sourceMemory.final_memory}</pre>
                                    </div>
                                )}
                            </>)}
                        </div>
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
                    <div className="flex-1 overflow-hidden">{content}</div>
                </div>
            </div>
        );
    }

    return content;
};

export default KnowledgeGraphEditor;
