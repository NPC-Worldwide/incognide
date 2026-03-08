import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Globe, Loader, RefreshCw } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';

interface BrowserHistoryWebProps {
    isModal?: boolean;
    onClose?: () => void;
    currentPath?: string;
}

const BrowserHistoryWeb: React.FC<BrowserHistoryWebProps> = ({ isModal = false, onClose, currentPath }) => {
    const [historyGraphData, setHistoryGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [historyGraphStats, setHistoryGraphStats] = useState<any>(null);
    const [historyGraphLoading, setHistoryGraphLoading] = useState(false);
    const [historyGraphError, setHistoryGraphError] = useState<string | null>(null);
    const [historyMinVisits, setHistoryMinVisits] = useState(1);
    const [historyEdgeFilter, setHistoryEdgeFilter] = useState<'all' | 'click' | 'manual'>('all');
    const [selectedHistoryNode, setSelectedHistoryNode] = useState<any>(null);
    const historyGraphRef = useRef<any>(null);

    const fetchHistoryGraph = useCallback(async () => {
        if (!currentPath) return;
        setHistoryGraphLoading(true);
        setHistoryGraphError(null);
        try {
            const result = await (window as any).api?.browserGetHistoryGraph?.({
                folderPath: currentPath,
                minVisits: historyMinVisits
            });
            if (result?.success) {
                setHistoryGraphData({ nodes: result.nodes || [], links: result.links || [] });
                setHistoryGraphStats(result.stats || null);
            } else {
                setHistoryGraphError(result?.error || 'Failed to load history graph');
            }
        } catch (err: any) {
            setHistoryGraphError(err.message || 'Failed to fetch history graph');
        } finally {
            setHistoryGraphLoading(false);
        }
    }, [currentPath, historyMinVisits]);

    useEffect(() => {
        fetchHistoryGraph();
    }, [fetchHistoryGraph]);

    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

    const processedHistoryGraphData = useMemo(() => {
        let filteredLinks = historyGraphData.links;

        if (historyEdgeFilter !== 'all') {
            filteredLinks = historyGraphData.links.filter(link => {
                if (historyEdgeFilter === 'click') return link.clickWeight > 0;
                if (historyEdgeFilter === 'manual') return link.manualWeight > 0;
                return true;
            });
        }

        const connectedNodeIds = new Set<string>();
        filteredLinks.forEach(link => {
            connectedNodeIds.add(typeof link.source === 'string' ? link.source : link.source?.id);
            connectedNodeIds.add(typeof link.target === 'string' ? link.target : link.target?.id);
        });

        const filteredNodes = filteredLinks.length > 0
            ? historyGraphData.nodes.filter(n => connectedNodeIds.has(n.id))
            : historyGraphData.nodes;

        return { nodes: filteredNodes, links: filteredLinks };
    }, [historyGraphData, historyEdgeFilter]);

    const getHistoryNodeColor = useCallback((node: any) => {
        const maxVisits = Math.max(1, ...historyGraphData.nodes.map(n => n.visitCount || 1));
        const intensity = (node.visitCount || 1) / maxVisits;
        if (intensity < 0.33) return '#3b82f6';
        if (intensity < 0.66) return '#8b5cf6';
        return '#ef4444';
    }, [historyGraphData.nodes]);

    const getHistoryNodeSize = useCallback((node: any) => {
        const maxVisits = Math.max(1, ...historyGraphData.nodes.map(n => n.visitCount || 1));
        const normalized = (node.visitCount || 1) / maxVisits;
        return 4 + normalized * 16;
    }, [historyGraphData.nodes]);

    const getHistoryLinkColor = useCallback((link: any) => {
        if (link.clickWeight > 0 && link.manualWeight === 0) return 'rgba(34, 197, 94, 0.6)';
        if (link.manualWeight > 0 && link.clickWeight === 0) return 'rgba(249, 115, 22, 0.6)';
        return 'rgba(156, 163, 175, 0.4)';
    }, []);

    const getHistoryLinkWidth = useCallback((link: any) => {
        return Math.min(8, 1 + (link.weight || 1) / 2);
    }, []);

    const content = (
        <div className="p-4">
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-lg font-semibold flex items-center gap-3">
                    <Globe className="text-blue-400" />Browser History Web
                </h4>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchHistoryGraph}
                        disabled={historyGraphLoading}
                        className="px-3 py-1 text-xs theme-button rounded flex items-center gap-2"
                    >
                        <RefreshCw size={14} className={historyGraphLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                    <label className="text-xs theme-text-secondary mb-1 block">Min Visits</label>
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value={historyMinVisits}
                        onChange={(e) => setHistoryMinVisits(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2 py-1 text-xs theme-input rounded"
                    />
                </div>
                <div>
                    <label className="text-xs theme-text-secondary mb-1 block">Edge Filter</label>
                    <select
                        value={historyEdgeFilter}
                        onChange={(e) => setHistoryEdgeFilter(e.target.value as 'all' | 'click' | 'manual')}
                        className="w-full px-2 py-1 text-xs theme-input rounded"
                    >
                        <option value="all">All Navigations</option>
                        <option value="click">Link Clicks Only</option>
                        <option value="manual">Manual Entry Only</option>
                    </select>
                </div>
                <div className="col-span-2">
                    <label className="text-xs theme-text-secondary mb-1 block">Legend</label>
                    <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> Link Click</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500"></span> Manual Entry</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Low Visits</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> High Visits</span>
                    </div>
                </div>
            </div>

            {historyGraphError && <div className="text-red-400 text-center p-4">{historyGraphError}</div>}

            {historyGraphLoading ? (
                <div className="h-96 flex items-center justify-center theme-bg-tertiary rounded-lg">
                    <Loader className="animate-spin text-blue-400" size={32} />
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 flex flex-col gap-4">
                        <div className="theme-bg-tertiary p-3 rounded-lg">
                            <h5 className="font-semibold text-sm mb-2">Graph Stats</h5>
                            <p className="text-xs theme-text-secondary">Domains: <span className="font-bold theme-text-primary">{processedHistoryGraphData.nodes.length}</span></p>
                            <p className="text-xs theme-text-secondary">Connections: <span className="font-bold theme-text-primary">{processedHistoryGraphData.links.length}</span></p>
                            {historyGraphStats && (
                                <>
                                    <p className="text-xs theme-text-secondary">Total Visits: <span className="font-bold theme-text-primary">{historyGraphStats.totalVisits}</span></p>
                                    <p className="text-xs theme-text-secondary">Total Navigations: <span className="font-bold theme-text-primary">{historyGraphStats.totalNavigations}</span></p>
                                </>
                            )}
                        </div>

                        {historyGraphStats?.topDomains && (
                            <div className="theme-bg-tertiary p-3 rounded-lg">
                                <h5 className="font-semibold text-sm mb-2">Top Domains</h5>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {historyGraphStats.topDomains.map((d: { domain: string; visits: number }) => (
                                        <div key={d.domain} className="text-xs flex justify-between items-center">
                                            <div className="truncate flex-1 font-mono" title={d.domain}>{d.domain}</div>
                                            <span className="text-blue-400 font-semibold ml-2">{d.visits}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedHistoryNode && (
                            <div className="theme-bg-tertiary p-3 rounded-lg">
                                <h5 className="font-semibold text-sm mb-2">Selected: {selectedHistoryNode.label}</h5>
                                <p className="text-xs theme-text-secondary">Visits: <span className="font-bold">{selectedHistoryNode.visitCount}</span></p>
                                <p className="text-xs theme-text-secondary mb-2">Last Visited: <span className="font-bold">{new Date(selectedHistoryNode.lastVisited).toLocaleString()}</span></p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    <p className="text-xs theme-text-secondary font-semibold">Pages:</p>
                                    {selectedHistoryNode.urls?.slice(0, 5).map((u: { url: string; title: string; visits: number }, i: number) => (
                                        <div key={i} className="text-xs truncate" title={u.url}>
                                            <span className="text-blue-400">[{u.visits}]</span> {u.title || u.url}
                                        </div>
                                    ))}
                                    {selectedHistoryNode.urls?.length > 5 && (
                                        <p className="text-xs theme-text-muted">...and {selectedHistoryNode.urls.length - 5} more</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="col-span-3 h-96 theme-bg-tertiary rounded-lg relative overflow-hidden">
                        {processedHistoryGraphData.nodes.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center theme-text-muted">
                                <Globe size={48} className="mb-4 opacity-50" />
                                <p>No browsing history yet</p>
                                <p className="text-xs mt-2">Browse some websites to see your history web</p>
                            </div>
                        ) : (
                            <ForceGraph2D
                                ref={historyGraphRef}
                                graphData={processedHistoryGraphData}
                                nodeLabel={(node: any) => `${node.label} (${node.visitCount} visits)`}
                                nodeVal={getHistoryNodeSize}
                                nodeColor={getHistoryNodeColor}
                                linkWidth={getHistoryLinkWidth}
                                linkColor={getHistoryLinkColor}
                                linkDirectionalArrowLength={4}
                                linkDirectionalArrowRelPos={0.9}
                                linkCurvature={0.1}
                                onNodeClick={(node: any) => setSelectedHistoryNode(node)}
                                width={800}
                                height={384}
                                backgroundColor="transparent"
                            />
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
                    className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b theme-border">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Globe className="text-blue-400" size={20} />
                            Browser History Web
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

export default BrowserHistoryWeb;
