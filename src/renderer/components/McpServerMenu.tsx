import React, { useState, useEffect } from 'react';
import { Server, Loader, ChevronRight, X, Play, Square, RefreshCw, SlidersHorizontal } from 'lucide-react';

const McpServerMenu = ({ isOpen, onClose, currentPath }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState(null);
    const [tools, setTools] = useState([]);
    const [toolLoading, setToolLoading] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const loadServers = async () => {
        if (!isOpen) return;
        setLoading(true);
        setError(null);
        const response = await window.api.getMcpServers(currentPath);
        if (response.error) {
            setError(response.error);
            setLoading(false);
            return;
        }
        setServers(response.servers || []);
        setLoading(false);
    };

    useEffect(() => {
        loadServers();
    }, [isOpen]);

    const refreshTools = async (serverPath) => {
        setToolLoading(true);
        const res = await window.api.listMcpTools({ serverPath, currentPath });
        setToolLoading(false);
        if (res.error) {
            setError(res.error);
            setTools([]);
            return;
        }
        setTools(res.tools || []);
    };

    const handleStart = async () => {
        if (!selectedServer) return;
        setToolLoading(true);
        await window.api.startMcpServer({ serverPath: selectedServer.serverPath, currentPath });
        await loadServers();
        await refreshTools(selectedServer.serverPath);
        setToolLoading(false);
    };

    const handleStop = async () => {
        if (!selectedServer) return;
        setToolLoading(true);
        await window.api.stopMcpServer({ serverPath: selectedServer.serverPath });
        await loadServers();
        setToolLoading(false);
    };

    const renderStatus = (server) => {
        const status = server.status || 'unknown';
        const color = status === 'running' ? 'text-green-400' : status === 'exited' ? 'text-yellow-400' : 'text-gray-400';
        return <span className={`text-xs ${color}`}>{status}</span>;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="theme-bg-secondary rounded-lg shadow-xl w-full max-w-4xl h-[70vh] flex flex-col">
                <header className="w-full border-b theme-border p-4 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <SlidersHorizontal className="text-blue-400" /> MCP Server Management
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full theme-hover">
                        <X size={20} />
                    </button>
                </header>

                <main className="flex flex-1 min-h-0">
                    <div className="w-1/3 border-r theme-border flex flex-col min-h-0">
                        <div className="p-2 border-b theme-border flex-shrink-0 flex items-center justify-between">
                            <span className="text-xs theme-text-secondary">From .ctx</span>
                            <button onClick={loadServers} className="theme-button px-2 py-1 text-xs rounded flex items-center gap-1">
                                <RefreshCw size={12} /> Refresh
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {loading ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader className="animate-spin" />
                                </div>
                            ) : error ? (
                                <div className="text-red-400 p-4">{error}</div>
                            ) : (
                                <div className="space-y-2">
                                    {servers.map((server, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setSelectedServer(server);
                                                refreshTools(server.serverPath);
                                            }}
                                            className={`w-full flex items-center justify-between p-3 rounded border theme-border hover:border-blue-500 transition ${selectedServer === server ? 'border-blue-500 bg-blue-500/10' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <Server className="text-blue-400" size={16} />
                                                <div className="text-left">
                                                    <div className="text-sm theme-text-primary font-medium">{server.serverPath.split('/').pop()}</div>
                                                    <div className="text-xs theme-text-muted truncate max-w-[180px]" title={server.serverPath}>{server.serverPath}</div>
                                                    {server.origin && (
                                                        <div className={`text-xs mt-0.5 ${server.origin.startsWith('auto:') ? 'text-green-400' : 'text-blue-400'}`}>
                                                            {server.origin.startsWith('auto:') ? `Auto (${server.origin.slice(5)})` : server.origin}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {renderStatus(server)}
                                            <ChevronRight size={16} className="theme-text-muted" />
                                        </button>
                                    ))}
                                    {servers.length === 0 && (
                                        <div className="text-center theme-text-secondary py-8 text-sm">
                                            No MCP servers found in contexts.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                        {selectedServer ? (
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold theme-text-primary break-all">
                                        {selectedServer.serverPath}
                                    </h4>
                                    <div className="flex gap-2">
                                        <button onClick={handleStart} className="theme-button-primary px-3 py-1 rounded text-sm flex items-center gap-2">
                                            <Play size={14} /> Start
                                        </button>
                                        <button onClick={handleStop} className="theme-button px-3 py-1 rounded text-sm flex items-center gap-2">
                                            <Square size={14} /> Stop
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-xs theme-text-secondary">
                                    Status: {renderStatus(selectedServer)}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h5 className="font-semibold text-sm theme-text-primary">Tools (via /api/mcp_tools)</h5>
                                        {toolLoading && <Loader size={14} className="animate-spin" />}
                                    </div>
                                    <div className="space-y-2">
                                        {tools.map((tool, idx) => (
                                            <div key={idx} className="p-2 rounded border theme-border">
                                                <div className="text-sm theme-text-primary font-medium">{tool.function?.name}</div>
                                                <div className="text-xs theme-text-secondary">{tool.function?.description}</div>
                                            </div>
                                        ))}
                                        {tools.length === 0 && (
                                            <div className="text-xs theme-text-muted">No tools available.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full theme-text-secondary flex-col gap-4">
                                <Server size={48} className="text-gray-600" />
                                <div>Select an MCP server</div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default McpServerMenu;
