import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Save, Download, Plus, Trash2, X, Edit, Link, Unlink, Palette, Eye, Edit2, ArrowRight, ArrowLeft, GitBranch, Map, Network, Workflow } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';

// Map types/archetypes
type MapType = 'freeform' | 'flowchart' | 'coordinate' | 'hierarchy';

interface MindMapNode {
    id: string;
    label: string;
    x: number;
    y: number;
    color: string;
    parentId: string | null;
    // For coordinate maps - actual geographic or custom coordinates
    lat?: number;
    lng?: number;
    // For flowchart - node type
    nodeType?: 'start' | 'end' | 'process' | 'decision' | 'default';
    // For hierarchy - level
    level?: number;
}

interface MindMapLink {
    source: string;
    target: string;
    label?: string; // For flowchart - edge labels like "yes"/"no"
}

interface MindMapData {
    name: string;
    mapType: MapType;
    nodes: MindMapNode[];
    links: MindMapLink[];
    // For coordinate maps - bounds
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

const NODE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const MAP_TYPE_INFO: Record<MapType, { label: string; description: string; icon: any }> = {
    freeform: { label: 'Free Association', description: 'Free-form mind map with no structure', icon: Network },
    flowchart: { label: 'Flowchart', description: 'Process flow with decisions and steps', icon: Workflow },
    coordinate: { label: 'Coordinate Map', description: 'Spatial map with queryable coordinates', icon: Map },
    hierarchy: { label: 'Hierarchy', description: 'Tree structure with parent-child relationships', icon: GitBranch },
};

const MindMapViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane
}) => {
    const [nodes, setNodes] = useState<MindMapNode[]>([]);
    const [links, setLinks] = useState<MindMapLink[]>([]);
    const [mapName, setMapName] = useState('Untitled Mind Map');
    const [mapType, setMapType] = useState<MapType>('freeform');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [newNodeLabel, setNewNodeLabel] = useState('');
    const [editingNode, setEditingNode] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [linkMode, setLinkMode] = useState<{ active: boolean; sourceId: string | null }>({ active: false, sourceId: null });
    const [isEditMode, setIsEditMode] = useState(true); // Default to edit mode for new maps
    const [pendingNodePosition, setPendingNodePosition] = useState<{ x: number; y: number } | null>(null);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickAddLabel, setQuickAddLabel] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; canvasX?: number; canvasY?: number } | null>(null);
    const graphRef = useRef<any>();
    const containerRef = useRef<HTMLDivElement>(null);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    // Load mind map from file - supports both .mapx (YAML) and .mindmap (JSON)
    useEffect(() => {
        const loadMindMap = async () => {
            if (!filePath) return;

            try {
                // Try loading via backend API first (handles YAML .mapx files)
                if (filePath.endsWith('.mapx')) {
                    const response = await (window as any).api?.loadMap?.(filePath);
                    if (response && !response.error) {
                        setMapName(response.name || 'Untitled Mind Map');
                        setMapType(response.mapType || 'freeform');
                        setNodes(response.nodes || []);
                        setLinks(response.links || []);
                        return;
                    }
                }

                // Fallback: load as JSON (for .mindmap files or if API fails)
                const response = await (window as any).api?.readFile?.(filePath);
                if (response && !response.error) {
                    const content = response.content || response;
                    // Try parsing as JSON first
                    try {
                        const data: MindMapData = JSON.parse(content);
                        setMapName(data.name || 'Untitled Mind Map');
                        setMapType(data.mapType || 'freeform');
                        setNodes(data.nodes || []);
                        setLinks(data.links || []);
                    } catch {
                        // If JSON parse fails, it might be YAML - backend will handle conversion
                        console.log('File may be YAML format, attempting backend load');
                    }
                }
            } catch (err) {
                console.error('Error loading mind map:', err);
            }
        };
        loadMindMap();
    }, [filePath]);

    // Save mind map - uses backend API for .mapx (YAML), direct write for .mindmap (JSON)
    const saveMindMap = useCallback(async () => {
        if (!filePath) return;
        setIsSaving(true);

        try {
            const data: MindMapData = { name: mapName, mapType, nodes, links };

            // For .mapx files, use backend API which will save as YAML
            if (filePath.endsWith('.mapx')) {
                const response = await (window as any).api?.saveMap?.({
                    map: data,
                    filePath,
                    // YAML structure for npcpy processing
                    yaml_format: {
                        map_name: mapName,
                        map_type: mapType,
                        nodes: nodes.map(n => ({
                            id: n.id,
                            label: n.label,
                            position: { x: n.x, y: n.y },
                            color: n.color,
                            parent_id: n.parentId,
                            ...(n.lat !== undefined && { lat: n.lat }),
                            ...(n.lng !== undefined && { lng: n.lng }),
                            ...(n.nodeType && { node_type: n.nodeType }),
                            ...(n.level !== undefined && { level: n.level }),
                        })),
                        links: links.map(l => ({
                            source: l.source,
                            target: l.target,
                            ...(l.label && { label: l.label }),
                        })),
                    }
                });

                if (response?.error) {
                    console.error('Error saving map via API:', response.error);
                    // Fallback to local JSON save
                    await (window as any).api?.writeFile?.(filePath, JSON.stringify(data, null, 2));
                }
            } else {
                // For .mindmap files, save as JSON directly
                await (window as any).api?.writeFile?.(filePath, JSON.stringify(data, null, 2));
            }

            setHasChanges(false);
        } catch (err) {
            console.error('Error saving mind map:', err);
        } finally {
            setIsSaving(false);
        }
    }, [filePath, mapName, mapType, nodes, links]);

    // Handle double-click on canvas to add node
    const handleCanvasDoubleClick = useCallback((event: React.MouseEvent) => {
        if (!isEditMode) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Store position and show quick add dialog
        setPendingNodePosition({ x, y });
        setShowQuickAdd(true);
        setQuickAddLabel('');
    }, [isEditMode]);

    // Quick add node at position
    const handleQuickAddNode = useCallback(() => {
        if (!quickAddLabel.trim() || !pendingNodePosition) return;

        const id = `node_${Date.now()}`;
        const color = NODE_COLORS[nodes.length % NODE_COLORS.length];

        const newNode: MindMapNode = {
            id,
            label: quickAddLabel.trim(),
            x: pendingNodePosition.x,
            y: pendingNodePosition.y,
            color,
            parentId: selectedNode, // If a node is selected, make it parent
            level: selectedNode ? (nodes.find(n => n.id === selectedNode)?.level || 0) + 1 : 0,
        };

        setNodes(prev => [...prev, newNode]);

        // Auto-link to selected node if one exists
        if (selectedNode) {
            setLinks(prev => [...prev, { source: selectedNode, target: id }]);
        }

        setQuickAddLabel('');
        setShowQuickAdd(false);
        setPendingNodePosition(null);
        setSelectedNode(id);
        setHasChanges(true);
    }, [quickAddLabel, pendingNodePosition, selectedNode, nodes]);

    // Handle right-click on canvas
    const handleCanvasContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        if (!isEditMode) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            canvasX,
            canvasY
        });
    }, [isEditMode]);

    // Handle right-click on node (from ForceGraph)
    const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
        event.preventDefault();
        if (!isEditMode) return;

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id
        });
    }, [isEditMode]);

    // Add node from context menu at specific position
    const handleContextMenuAddNode = useCallback((connectToSelected: boolean = false) => {
        if (!contextMenu) return;

        const id = `node_${Date.now()}`;
        const color = NODE_COLORS[nodes.length % NODE_COLORS.length];

        let x = contextMenu.canvasX || 200;
        let y = contextMenu.canvasY || 200;

        const newNode: MindMapNode = {
            id,
            label: 'New Node',
            x,
            y,
            color,
            parentId: connectToSelected ? selectedNode : null,
            level: connectToSelected && selectedNode ? (nodes.find(n => n.id === selectedNode)?.level || 0) + 1 : 0,
        };

        setNodes(prev => [...prev, newNode]);

        if (connectToSelected && selectedNode) {
            setLinks(prev => [...prev, { source: selectedNode, target: id }]);
        }

        setContextMenu(null);
        setSelectedNode(id);
        setEditingNode(id);
        setEditLabel('New Node');
        setHasChanges(true);
    }, [contextMenu, selectedNode, nodes]);

    // Add connected node from a specific node
    const handleAddConnectedNode = useCallback(() => {
        if (!contextMenu?.nodeId) return;

        const parentNode = nodes.find(n => n.id === contextMenu.nodeId);
        if (!parentNode) return;

        const id = `node_${Date.now()}`;
        const color = NODE_COLORS[nodes.length % NODE_COLORS.length];

        // Position new node relative to parent
        const childCount = links.filter(l => l.source === contextMenu.nodeId).length;
        const angle = (childCount * 60 + 30) * (Math.PI / 180);
        const x = parentNode.x + Math.cos(angle) * 150;
        const y = parentNode.y + Math.sin(angle) * 120;

        const newNode: MindMapNode = {
            id,
            label: 'New Node',
            x,
            y,
            color,
            parentId: contextMenu.nodeId,
            level: (parentNode.level || 0) + 1,
        };

        setNodes(prev => [...prev, newNode]);
        setLinks(prev => [...prev, { source: contextMenu.nodeId!, target: id }]);

        setContextMenu(null);
        setSelectedNode(id);
        setEditingNode(id);
        setEditLabel('New Node');
        setHasChanges(true);
    }, [contextMenu, nodes, links]);

    // Start linking from context menu node
    const handleStartLinking = useCallback(() => {
        if (!contextMenu?.nodeId) return;
        setLinkMode({ active: true, sourceId: contextMenu.nodeId });
        setContextMenu(null);
    }, [contextMenu]);

    // Add node
    const handleAddNode = useCallback((parentId: string | null = null) => {
        if (!newNodeLabel.trim()) return;
        const id = `node_${Date.now()}`;
        const color = NODE_COLORS[nodes.length % NODE_COLORS.length];

        let x = 400, y = 200;
        if (parentId) {
            const parent = nodes.find(n => n.id === parentId);
            if (parent) {
                const childCount = links.filter(l => l.source === parentId).length;
                const angle = (childCount * 45 + 45) * (Math.PI / 180);
                x = parent.x + Math.cos(angle) * 150;
                y = parent.y + Math.sin(angle) * 100;
            }
        } else {
            x = 200 + Math.random() * 400;
            y = 100 + Math.random() * 200;
        }

        const newNode: MindMapNode = { id, label: newNodeLabel.trim(), x, y, color, parentId };
        setNodes(prev => [...prev, newNode]);

        if (parentId) {
            setLinks(prev => [...prev, { source: parentId, target: id }]);
        }

        setNewNodeLabel('');
        setSelectedNode(id);
        setHasChanges(true);
    }, [newNodeLabel, nodes, links]);

    // Delete node and descendants
    const handleDeleteNode = useCallback((nodeId: string) => {
        const getDescendants = (id: string): string[] => {
            const children = links.filter(l => l.source === id).map(l => l.target);
            return [id, ...children.flatMap(getDescendants)];
        };
        const toDelete = new Set(getDescendants(nodeId));

        setNodes(prev => prev.filter(n => !toDelete.has(n.id)));
        setLinks(prev => prev.filter(l => !toDelete.has(l.source) && !toDelete.has(l.target)));
        if (selectedNode && toDelete.has(selectedNode)) {
            setSelectedNode(null);
        }
        setHasChanges(true);
    }, [links, selectedNode]);

    // Update node
    const handleUpdateNode = useCallback((nodeId: string, updates: Partial<MindMapNode>) => {
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...updates } : n));
        setHasChanges(true);
    }, []);

    // Start editing node label
    const startEditingNode = useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            setEditingNode(nodeId);
            setEditLabel(node.label);
        }
    }, [nodes]);

    // Save edited label
    const saveEditedLabel = useCallback(() => {
        if (editingNode && editLabel.trim()) {
            handleUpdateNode(editingNode, { label: editLabel.trim() });
        }
        setEditingNode(null);
        setEditLabel('');
    }, [editingNode, editLabel, handleUpdateNode]);

    // Add/remove link between nodes
    const handleLinkClick = useCallback((nodeId: string) => {
        if (!linkMode.active) return;

        if (!linkMode.sourceId) {
            setLinkMode({ active: true, sourceId: nodeId });
        } else if (linkMode.sourceId !== nodeId) {
            // Check if link already exists
            const existingLink = links.find(l =>
                (l.source === linkMode.sourceId && l.target === nodeId) ||
                (l.source === nodeId && l.target === linkMode.sourceId)
            );

            if (existingLink) {
                // Remove link
                setLinks(prev => prev.filter(l => l !== existingLink));
            } else {
                // Add link
                setLinks(prev => [...prev, { source: linkMode.sourceId!, target: nodeId }]);
            }
            setLinkMode({ active: false, sourceId: null });
            setHasChanges(true);
        }
    }, [linkMode, links]);

    // Remove a specific link
    const handleRemoveLink = useCallback((sourceId: string, targetId: string) => {
        setLinks(prev => prev.filter(l => !(l.source === sourceId && l.target === targetId)));
        setHasChanges(true);
    }, []);

    // Get edges for a selected node (both incoming and outgoing)
    const getNodeEdges = useCallback((nodeId: string) => {
        const outgoing = links.filter(l => l.source === nodeId);
        const incoming = links.filter(l => l.target === nodeId);
        return { outgoing, incoming };
    }, [links]);

    // Graph data
    const graphData = useMemo(() => ({
        nodes: nodes.map(n => ({ ...n, val: n.parentId ? 6 : 10 })),
        links: links.map(l => ({ ...l }))
    }), [nodes, links]);

    const selectedNodeData = nodes.find(n => n.id === selectedNode);
    const selectedNodeEdges = selectedNode ? getNodeEdges(selectedNode) : { outgoing: [], incoming: [] };

    return (
        <div className="h-full flex flex-col bg-gray-900">
            {/* Toolbar */}
            <div className="flex-shrink-0 border-b border-gray-700 p-2 flex items-center gap-2 bg-gray-800">
                <input
                    type="text"
                    value={mapName}
                    onChange={(e) => { setMapName(e.target.value); setHasChanges(true); }}
                    className="px-2 py-1 text-sm bg-gray-700 text-white border border-gray-600 rounded focus:border-cyan-500 focus:outline-none w-40"
                />
                <div className="h-4 w-px bg-gray-600" />
                {/* Map Type Selector */}
                <select
                    value={mapType}
                    onChange={(e) => { setMapType(e.target.value as MapType); setHasChanges(true); }}
                    className="px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded focus:border-cyan-500 focus:outline-none"
                    title="Map Type"
                >
                    {Object.entries(MAP_TYPE_INFO).map(([type, info]) => (
                        <option key={type} value={type}>{info.label}</option>
                    ))}
                </select>
                <div className="h-4 w-px bg-gray-600" />
                <button
                    onClick={saveMindMap}
                    disabled={isSaving || !hasChanges}
                    className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                    title="Save"
                >
                    <Save size={18} />
                </button>
                <div className="h-4 w-px bg-gray-600" />
                {/* View/Edit mode toggle */}
                <div className="flex items-center gap-1 px-1 py-0.5 bg-gray-800 rounded border border-gray-600">
                    <button
                        onClick={() => setIsEditMode(false)}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${!isEditMode ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        title="View mode - Select nodes to see properties"
                    >
                        <Eye size={14} /> View
                    </button>
                    <button
                        onClick={() => setIsEditMode(true)}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${isEditMode ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        title="Edit mode - Double-click canvas to add nodes"
                    >
                        <Edit2 size={14} /> Edit
                    </button>
                </div>
                <div className="h-4 w-px bg-gray-600" />
                {isEditMode && (
                    <button
                        onClick={() => setLinkMode({ active: !linkMode.active, sourceId: null })}
                        className={`p-1.5 rounded transition-colors ${linkMode.active ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                        title={linkMode.active ? 'Cancel linking' : 'Link/unlink nodes'}
                    >
                        <Link size={18} />
                    </button>
                )}
                <div className="flex-1" />
                {isEditMode && <span className="text-[10px] text-gray-500">Double-click canvas to add node</span>}
                <span className="text-xs text-gray-500 ml-2">
                    {nodes.length} nodes, {links.length} links
                    {hasChanges && <span className="text-yellow-500 ml-2">*</span>}
                </span>
                <button onClick={() => closeContentPane?.(nodeId)} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Main content */}
            <div className="flex-1 flex">
                {/* Sidebar */}
                <div className="w-64 border-r border-gray-700 p-3 flex flex-col gap-3 bg-gray-800/50">
                    {/* Map Type Info */}
                    <div className="border border-gray-700 rounded-lg p-2 bg-gray-900/50">
                        <div className="flex items-center gap-2 mb-1">
                            {(() => {
                                const Icon = MAP_TYPE_INFO[mapType].icon;
                                return <Icon size={14} className="text-cyan-400" />;
                            })()}
                            <span className="text-xs font-medium text-white">{MAP_TYPE_INFO[mapType].label}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{MAP_TYPE_INFO[mapType].description}</p>
                        {mapType === 'coordinate' && (
                            <p className="text-[10px] text-cyan-400 mt-1">Nodes can have lat/lng for spatial queries</p>
                        )}
                        {mapType === 'flowchart' && (
                            <p className="text-[10px] text-cyan-400 mt-1">Use node types: start, end, process, decision</p>
                        )}
                    </div>

                    {/* Add node - only in edit mode */}
                    {isEditMode && (
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Add Node (or double-click canvas)</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={newNodeLabel}
                                    onChange={(e) => setNewNodeLabel(e.target.value)}
                                    placeholder="Node text..."
                                    className="flex-1 px-2 py-1.5 text-sm bg-gray-900 text-white border border-gray-600 rounded focus:border-cyan-500 focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNode(selectedNode)}
                                />
                                <button
                                    onClick={() => handleAddNode(selectedNode)}
                                    disabled={!newNodeLabel.trim()}
                                    className="px-2 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded disabled:opacity-50 transition-colors"
                                    title={selectedNode ? 'Add as child' : 'Add root node'}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Selected node info */}
                    {selectedNodeData && (
                        <div className="border border-gray-700 rounded-lg p-2 bg-gray-900/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-400">Selected Node</span>
                                <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-white">
                                    <X size={12} />
                                </button>
                            </div>

                            {isEditMode && editingNode === selectedNode ? (
                                <div className="flex gap-1 mb-2">
                                    <input
                                        type="text"
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        className="flex-1 px-2 py-1 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-cyan-500 focus:outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && saveEditedLabel()}
                                        autoFocus
                                    />
                                    <button onClick={saveEditedLabel} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs">OK</button>
                                </div>
                            ) : (
                                <p className="text-sm text-white mb-2 truncate" title={selectedNodeData.label}>{selectedNodeData.label}</p>
                            )}

                            {/* Edit mode actions */}
                            {isEditMode && (
                                <>
                                    <div className="flex gap-1 mb-2">
                                        <button
                                            onClick={() => startEditingNode(selectedNode)}
                                            className="flex-1 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs flex items-center justify-center gap-1 transition-colors"
                                        >
                                            <Edit size={12} /> Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteNode(selectedNode)}
                                            className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    {/* Color picker */}
                                    <div className="mb-2">
                                        <label className="text-xs text-gray-400 mb-1 block">Color</label>
                                        <div className="flex gap-1 flex-wrap">
                                            {NODE_COLORS.map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => handleUpdateNode(selectedNode, { color })}
                                                    className={`w-5 h-5 rounded ${selectedNodeData.color === color ? 'ring-2 ring-white' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Node properties (always visible) */}
                            <div className="border-t border-gray-700 pt-2 mt-2">
                                <label className="text-xs text-gray-400 mb-1 block">Properties</label>
                                <div className="text-xs space-y-0.5">
                                    <div className="flex justify-between"><span className="text-gray-500">ID:</span><span className="text-gray-300 font-mono">{selectedNodeData.id.slice(0, 12)}</span></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500">Color:</span>
                                        <span className="w-4 h-4 rounded" style={{ backgroundColor: selectedNodeData.color }} />
                                    </div>
                                    <div className="flex justify-between"><span className="text-gray-500">Position:</span><span className="text-gray-300">({Math.round(selectedNodeData.x)}, {Math.round(selectedNodeData.y)})</span></div>
                                </div>
                            </div>

                            {/* Edges section */}
                            <div className="border-t border-gray-700 pt-2 mt-2">
                                <label className="text-xs text-gray-400 mb-1 block">
                                    Connections ({selectedNodeEdges.outgoing.length + selectedNodeEdges.incoming.length})
                                </label>

                                {/* Outgoing links */}
                                {selectedNodeEdges.outgoing.length > 0 && (
                                    <div className="mb-2">
                                        <span className="text-[10px] text-gray-500 flex items-center gap-1 mb-1"><ArrowRight size={10} /> Outgoing</span>
                                        <div className="space-y-1">
                                            {selectedNodeEdges.outgoing.map((link, i) => {
                                                const targetNode = nodes.find(n => n.id === link.target);
                                                return (
                                                    <div key={i} className="flex items-center gap-1 text-xs bg-gray-800 rounded px-2 py-1">
                                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: targetNode?.color }} />
                                                        <span className="text-gray-300 truncate flex-1">{targetNode?.label || link.target}</span>
                                                        {isEditMode && (
                                                            <button
                                                                onClick={() => handleRemoveLink(link.source, link.target)}
                                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                                                                title="Remove link"
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

                                {/* Incoming links */}
                                {selectedNodeEdges.incoming.length > 0 && (
                                    <div>
                                        <span className="text-[10px] text-gray-500 flex items-center gap-1 mb-1"><ArrowLeft size={10} /> Incoming</span>
                                        <div className="space-y-1">
                                            {selectedNodeEdges.incoming.map((link, i) => {
                                                const sourceNode = nodes.find(n => n.id === link.source);
                                                return (
                                                    <div key={i} className="flex items-center gap-1 text-xs bg-gray-800 rounded px-2 py-1">
                                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sourceNode?.color }} />
                                                        <span className="text-gray-300 truncate flex-1">{sourceNode?.label || link.source}</span>
                                                        {isEditMode && (
                                                            <button
                                                                onClick={() => handleRemoveLink(link.source, link.target)}
                                                                className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                                                                title="Remove link"
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

                                {selectedNodeEdges.outgoing.length === 0 && selectedNodeEdges.incoming.length === 0 && (
                                    <p className="text-xs text-gray-500 italic">No connections</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Link mode indicator */}
                    {linkMode.active && (
                        <div className="border border-cyan-600 rounded-lg p-2 bg-cyan-900/30">
                            <p className="text-xs text-cyan-400">
                                {linkMode.sourceId
                                    ? `Click another node to link/unlink from "${nodes.find(n => n.id === linkMode.sourceId)?.label}"`
                                    : 'Click a node to start linking'}
                            </p>
                            <button
                                onClick={() => setLinkMode({ active: false, sourceId: null })}
                                className="mt-1 text-xs text-cyan-500 hover:text-cyan-300"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Node list */}
                    <div className="flex-1 overflow-y-auto">
                        <label className="text-xs text-gray-400 mb-1 block">All Nodes ({nodes.length})</label>
                        <div className="space-y-1">
                            {nodes.map(node => (
                                <button
                                    key={node.id}
                                    onClick={() => linkMode.active ? handleLinkClick(node.id) : setSelectedNode(node.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                        selectedNode === node.id ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: node.color }} />
                                    <span className="truncate">{node.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Graph canvas */}
                <div
                    ref={containerRef}
                    className="flex-1 bg-gray-900 relative"
                    onDoubleClick={handleCanvasDoubleClick}
                    onContextMenu={handleCanvasContextMenu}
                >
                    {nodes.length === 0 ? (
                        <div
                            className="h-full flex flex-col items-center justify-center text-gray-500"
                            onDoubleClick={handleCanvasDoubleClick}
                        >
                            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <p>Start building your mind map</p>
                            <p className="text-xs mt-1">{isEditMode ? 'Double-click or right-click to add a node' : 'Switch to Edit mode to add nodes'}</p>
                        </div>
                    ) : (
                        <ForceGraph2D
                            ref={graphRef}
                            graphData={graphData}
                            nodeLabel={(node: any) => node.label}
                            nodeVal={(node: any) => node.val}
                            nodeColor={(node: any) => {
                                if (linkMode.sourceId === node.id) return '#fbbf24';
                                if (selectedNode === node.id) return '#f59e0b';
                                return node.color;
                            }}
                            nodeCanvasObject={(node: any, ctx, globalScale) => {
                                const label = node.label;
                                const fontSize = 12 / globalScale;
                                ctx.font = `${fontSize}px Sans-Serif`;
                                const textWidth = ctx.measureText(label).width;
                                const bckgDimensions = [textWidth + fontSize * 0.8, fontSize * 1.4];

                                let fillColor = node.color;
                                if (linkMode.sourceId === node.id) fillColor = '#fbbf24';
                                else if (selectedNode === node.id) fillColor = '#f59e0b';

                                ctx.fillStyle = fillColor;
                                ctx.beginPath();
                                ctx.roundRect(
                                    node.x - bckgDimensions[0] / 2,
                                    node.y - bckgDimensions[1] / 2,
                                    bckgDimensions[0],
                                    bckgDimensions[1],
                                    4
                                );
                                ctx.fill();

                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillStyle = '#fff';
                                ctx.fillText(label, node.x, node.y);
                            }}
                            linkWidth={2}
                            linkColor={() => 'rgba(255,255,255,0.3)'}
                            linkDirectionalArrowLength={6}
                            linkDirectionalArrowRelPos={0.9}
                            onNodeClick={(node: any) => {
                                if (linkMode.active) {
                                    handleLinkClick(node.id);
                                } else {
                                    setSelectedNode(node.id);
                                }
                            }}
                            onNodeRightClick={handleNodeRightClick}
                            onNodeDragEnd={(node: any) => {
                                handleUpdateNode(node.id, { x: node.x, y: node.y });
                            }}
                            enableNodeDrag={!linkMode.active}
                            backgroundColor="transparent"
                        />
                    )}

                    {/* Quick Add Node Popup */}
                    {showQuickAdd && pendingNodePosition && (
                        <div
                            className="absolute bg-gray-800 border border-cyan-500 rounded-lg shadow-xl p-3 z-50"
                            style={{
                                left: Math.min(pendingNodePosition.x, (containerRef.current?.clientWidth || 300) - 220),
                                top: Math.min(pendingNodePosition.y, (containerRef.current?.clientHeight || 200) - 100)
                            }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Plus size={14} className="text-cyan-400" />
                                <span className="text-xs text-white font-medium">Quick Add Node</span>
                                <button
                                    onClick={() => { setShowQuickAdd(false); setPendingNodePosition(null); }}
                                    className="ml-auto text-gray-400 hover:text-white"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                            <input
                                type="text"
                                value={quickAddLabel}
                                onChange={(e) => setQuickAddLabel(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleQuickAddNode();
                                    if (e.key === 'Escape') { setShowQuickAdd(false); setPendingNodePosition(null); }
                                }}
                                placeholder="Node label..."
                                className="w-48 px-2 py-1.5 text-sm bg-gray-900 text-white border border-gray-600 rounded focus:border-cyan-500 focus:outline-none"
                                autoFocus
                            />
                            {selectedNode && (
                                <p className="text-[10px] text-cyan-400 mt-1">
                                    Will link to: {nodes.find(n => n.id === selectedNode)?.label}
                                </p>
                            )}
                            <div className="flex gap-1 mt-2">
                                <button
                                    onClick={handleQuickAddNode}
                                    disabled={!quickAddLabel.trim()}
                                    className="flex-1 px-2 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded disabled:opacity-50 transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setShowQuickAdd(false); setPendingNodePosition(null); }}
                                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Right-click Context Menu */}
                    {contextMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setContextMenu(null)}
                            />
                            <div
                                className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
                                style={{ top: contextMenu.y, left: contextMenu.x }}
                            >
                                {contextMenu.nodeId ? (
                                    // Node context menu
                                    <>
                                        <div className="px-3 py-1 text-[10px] text-gray-500 border-b border-gray-700">
                                            Node: {nodes.find(n => n.id === contextMenu.nodeId)?.label}
                                        </div>
                                        <button
                                            onClick={handleAddConnectedNode}
                                            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-white"
                                        >
                                            <Plus size={14} className="text-green-400" />
                                            Add Connected Node
                                        </button>
                                        <button
                                            onClick={handleStartLinking}
                                            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-white"
                                        >
                                            <Link size={14} className="text-cyan-400" />
                                            Link to Another Node
                                        </button>
                                        <button
                                            onClick={() => {
                                                startEditingNode(contextMenu.nodeId!);
                                                setContextMenu(null);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-white"
                                        >
                                            <Edit size={14} className="text-yellow-400" />
                                            Edit Label
                                        </button>
                                        <div className="border-t border-gray-700 my-1" />
                                        <button
                                            onClick={() => {
                                                handleDeleteNode(contextMenu.nodeId!);
                                                setContextMenu(null);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-red-400"
                                        >
                                            <Trash2 size={14} />
                                            Delete Node
                                        </button>
                                    </>
                                ) : (
                                    // Canvas context menu
                                    <>
                                        <button
                                            onClick={() => handleContextMenuAddNode(false)}
                                            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-white"
                                        >
                                            <Plus size={14} className="text-green-400" />
                                            Add Node Here
                                        </button>
                                        {selectedNode && (
                                            <button
                                                onClick={() => handleContextMenuAddNode(true)}
                                                className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-700 text-sm text-white"
                                            >
                                                <Link size={14} className="text-cyan-400" />
                                                Add & Link to Selected
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(MindMapViewer, arePropsEqual);
