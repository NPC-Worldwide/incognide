

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Server, Play, Square, RefreshCw, Plus, Trash2, ChevronRight, ChevronDown,
    Loader, AlertCircle, CheckCircle, Circle, Wrench, Settings, FolderOpen,
    Globe, Lock, Search, Copy, ExternalLink, Zap, X, RotateCcw, Mail,
    Eye, EyeOff, Terminal, FileText, Package, ArrowLeft, Key, ShieldCheck
} from 'lucide-react';
import { getFileName } from './utils';

interface McpServer {
    serverPath: string;
    status?: string;
    origin?: string;
    name?: string;
    id?: string;
    env?: Record<string, string>;
    pid?: number;
}

interface McpTool {
    function?: {
        name: string;
        description: string;
        parameters?: {
            type: string;
            properties?: Record<string, { type: string; description?: string; default?: any; enum?: string[] }>;
            required?: string[];
        };
    };
}

interface McpManagerProps {
    currentPath: string;
    embedded?: boolean;
}

type ViewMode = 'servers' | 'tools' | 'config';
type ScopeTab = 'all' | 'global' | 'project';

const STATUS_COLORS: Record<string, string> = {
    running: 'text-green-400',
    exited: 'text-yellow-400',
    stopped: 'text-gray-400',
    error: 'text-red-400',
    unknown: 'text-gray-500',
};

const STATUS_DOT_COLORS: Record<string, string> = {
    running: 'bg-green-400',
    exited: 'bg-yellow-400',
    stopped: 'bg-gray-400',
    error: 'bg-red-400',
    unknown: 'bg-gray-500',
};

interface MarketplaceItem {
    id: string;
    name: string;
    description: string;
    category: 'data' | 'dev' | 'web' | 'productivity' | 'ai' | 'system';
    install: string;
    transport: 'stdio' | 'sse';
    envVars?: { key: string; label: string; placeholder: string; secret?: boolean }[];
    repo?: string;
}

const MCP_MARKETPLACE: MarketplaceItem[] = [

    { id: 'sqlite', name: 'SQLite', description: 'Query and manage SQLite databases', category: 'data', install: 'npx -y @modelcontextprotocol/server-sqlite', transport: 'stdio', repo: 'modelcontextprotocol/servers' },
    { id: 'postgres', name: 'PostgreSQL', description: 'Query PostgreSQL databases with read-only access', category: 'data', install: 'npx -y @modelcontextprotocol/server-postgres', transport: 'stdio', envVars: [{ key: 'POSTGRES_CONNECTION_STRING', label: 'Connection String', placeholder: 'postgresql://user:pass@localhost/db' }], repo: 'modelcontextprotocol/servers' },
    { id: 'redis', name: 'Redis', description: 'Interact with Redis key-value stores', category: 'data', install: 'uvx mcp-server-redis', transport: 'stdio', envVars: [{ key: 'REDIS_URL', label: 'Redis URL', placeholder: 'redis://localhost:6379' }] },

    { id: 'github', name: 'GitHub', description: 'Manage repos, issues, PRs, and files via GitHub API', category: 'dev', install: 'npx -y @modelcontextprotocol/server-github', transport: 'stdio', envVars: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Token', placeholder: 'ghp_...', secret: true }], repo: 'modelcontextprotocol/servers' },
    { id: 'gitlab', name: 'GitLab', description: 'Manage GitLab projects, issues, and merge requests', category: 'dev', install: 'npx -y @modelcontextprotocol/server-gitlab', transport: 'stdio', envVars: [{ key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'GitLab Token', placeholder: 'glpat-...', secret: true }, { key: 'GITLAB_API_URL', label: 'API URL', placeholder: 'https://gitlab.com/api/v4' }], repo: 'modelcontextprotocol/servers' },
    { id: 'filesystem', name: 'Filesystem', description: 'Secure file operations with configurable access controls', category: 'dev', install: 'npx -y @modelcontextprotocol/server-filesystem', transport: 'stdio', repo: 'modelcontextprotocol/servers' },
    { id: 'git', name: 'Git', description: 'Read and search through git repositories', category: 'dev', install: 'uvx mcp-server-git', transport: 'stdio' },

    { id: 'brave-search', name: 'Brave Search', description: 'Web and local search using Brave Search API', category: 'web', install: 'npx -y @modelcontextprotocol/server-brave-search', transport: 'stdio', envVars: [{ key: 'BRAVE_API_KEY', label: 'Brave API Key', placeholder: 'BSA...', secret: true }], repo: 'modelcontextprotocol/servers' },
    { id: 'fetch', name: 'Fetch', description: 'Fetch and convert web pages to markdown', category: 'web', install: 'uvx mcp-server-fetch', transport: 'stdio' },
    { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation and web scraping', category: 'web', install: 'npx -y @modelcontextprotocol/server-puppeteer', transport: 'stdio', repo: 'modelcontextprotocol/servers' },

    { id: 'slack', name: 'Slack', description: 'Channel management and messaging in Slack', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-slack', transport: 'stdio', envVars: [{ key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...', secret: true }, { key: 'SLACK_TEAM_ID', label: 'Team ID', placeholder: 'T0...' }], repo: 'modelcontextprotocol/servers' },
    { id: 'google-drive', name: 'Google Drive', description: 'Search and access Google Drive files', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-gdrive', transport: 'stdio', repo: 'modelcontextprotocol/servers' },
    { id: 'google-maps', name: 'Google Maps', description: 'Location services, directions, and place details', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-google-maps', transport: 'stdio', envVars: [{ key: 'GOOGLE_MAPS_API_KEY', label: 'API Key', placeholder: 'AIza...', secret: true }], repo: 'modelcontextprotocol/servers' },
    { id: 'memory', name: 'Memory', description: 'Knowledge graph-based persistent memory', category: 'ai', install: 'npx -y @modelcontextprotocol/server-memory', transport: 'stdio', repo: 'modelcontextprotocol/servers' },

    { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'Dynamic problem-solving through thought sequences', category: 'ai', install: 'npx -y @modelcontextprotocol/server-sequential-thinking', transport: 'stdio', repo: 'modelcontextprotocol/servers' },

    { id: 'everything', name: 'Everything Search', description: 'Fast file search using Everything SDK (Windows)', category: 'system', install: 'npx -y @modelcontextprotocol/server-everything', transport: 'stdio', repo: 'modelcontextprotocol/servers' },
    { id: 'time', name: 'Time', description: 'Time and timezone conversion utilities', category: 'system', install: 'uvx mcp-server-time', transport: 'stdio' },
    { id: 'docker', name: 'Docker', description: 'Manage Docker containers, images, and volumes', category: 'dev', install: 'uvx mcp-server-docker', transport: 'stdio' },
    { id: 'sentry', name: 'Sentry', description: 'Retrieve and analyze error reports from Sentry', category: 'dev', install: 'npx -y @modelcontextprotocol/server-sentry', transport: 'stdio', envVars: [{ key: 'SENTRY_AUTH_TOKEN', label: 'Auth Token', placeholder: 'sntrys_...', secret: true }] },
    { id: 'notion', name: 'Notion', description: 'Search, read, and comment on Notion pages', category: 'productivity', install: 'npx -y @notionhq/notion-mcp-server', transport: 'stdio', envVars: [{ key: 'OPENAPI_MCP_HEADERS', label: 'Notion Auth Header', placeholder: '{"Authorization":"Bearer ntn_...","Notion-Version":"2022-06-28"}' }] },
    { id: 'todoist', name: 'Todoist', description: 'Manage tasks and projects in Todoist', category: 'productivity', install: 'npx -y @abhiz123/todoist-mcp-server', transport: 'stdio', envVars: [{ key: 'TODOIST_API_TOKEN', label: 'API Token', placeholder: '', secret: true }] },
];

const CATEGORY_COLORS: Record<string, string> = {
    data: 'text-blue-400 bg-blue-500/20',
    dev: 'text-green-400 bg-green-500/20',
    web: 'text-purple-400 bg-purple-500/20',
    productivity: 'text-orange-400 bg-orange-500/20',
    ai: 'text-cyan-400 bg-cyan-500/20',
    system: 'text-gray-400 bg-gray-500/20',
};

const McpManager: React.FC<McpManagerProps> = ({ currentPath, embedded = true }) => {

    const [servers, setServers] = useState<McpServer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
    const [tools, setTools] = useState<McpTool[]>([]);
    const [toolsLoading, setToolsLoading] = useState(false);
    const [toolsError, setToolsError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
    const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    const [showAddServer, setShowAddServer] = useState(false);
    const [newServerPath, setNewServerPath] = useState('');
    const [addScope, setAddScope] = useState<'global' | 'project'>('project');
    const [addMode, setAddMode] = useState<'local' | 'remote' | 'marketplace'>('local');
    const [remoteUrl, setRemoteUrl] = useState('');
    const [marketplaceSearch, setMarketplaceSearch] = useState('');

    const [configuringItem, setConfiguringItem] = useState<MarketplaceItem | null>(null);
    const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

    const [showEnvVars, setShowEnvVars] = useState(false);
    const [serverLogs, setServerLogs] = useState<string[]>([]);

    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const loadServers = useCallback(async () => {
        try {
            setError(null);
            const response = await (window as any).api.getMcpServers(currentPath);
            if (response?.error) {
                setError(response.error);
                return;
            }
            const serverList = response?.servers || [];
            setServers(serverList);

            if (selectedServer) {
                const updated = serverList.find((s: McpServer) => s.serverPath === selectedServer.serverPath);
                if (updated) setSelectedServer(updated);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load servers');
        } finally {
            setLoading(false);
        }
    }, [currentPath, selectedServer?.serverPath]);

    useEffect(() => {
        loadServers();
    }, [currentPath]);

    useEffect(() => {
        pollRef.current = setInterval(() => {
            loadServers();
        }, 10000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [loadServers]);

    const loadTools = useCallback(async (serverPath: string) => {
        setToolsLoading(true);
        setToolsError(null);
        try {
            const res = await (window as any).api.listMcpTools({ serverPath, currentPath });
            if (res?.error) {
                setToolsError(res.error);
                setTools([]);
            } else {
                setTools(res?.tools || []);
            }
        } catch (err: any) {
            setToolsError(err.message);
            setTools([]);
        } finally {
            setToolsLoading(false);
        }
    }, [currentPath]);

    const handleSelectServer = useCallback((server: McpServer) => {
        setSelectedServer(server);
        setExpandedTools(new Set());
        loadTools(server.serverPath);
    }, [loadTools]);

    const handleStart = useCallback(async (server: McpServer) => {
        setActionInProgress(server.serverPath);
        try {
            await (window as any).api.startMcpServer({
                serverPath: server.serverPath,
                currentPath,
                envVars: server.env,
            });
            await loadServers();
            if (selectedServer?.serverPath === server.serverPath) {
                await loadTools(server.serverPath);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionInProgress(null);
        }
    }, [currentPath, loadServers, loadTools, selectedServer]);

    const handleStop = useCallback(async (server: McpServer) => {
        setActionInProgress(server.serverPath);
        try {
            await (window as any).api.stopMcpServer({
                serverPath: server.serverPath,
            });
            await loadServers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionInProgress(null);
        }
    }, [loadServers]);

    const handleRestart = useCallback(async (server: McpServer) => {
        setActionInProgress(server.serverPath);
        try {
            await (window as any).api.stopMcpServer({ serverPath: server.serverPath });
            await new Promise(r => setTimeout(r, 500));
            await (window as any).api.startMcpServer({
                serverPath: server.serverPath,
                currentPath,
                envVars: server.env,
            });
            await loadServers();
            if (selectedServer?.serverPath === server.serverPath) {
                await loadTools(server.serverPath);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionInProgress(null);
        }
    }, [currentPath, loadServers, loadTools, selectedServer]);

    const handleAddServer = useCallback(async (overridePath?: string, envVars?: Record<string, string>, itemId?: string, itemName?: string) => {
        const serverValue = overridePath || newServerPath.trim();
        if (!serverValue) return;
        try {
            setError(null);

            const hasExtras = envVars && Object.keys(envVars).length > 0;
            const entry: any = hasExtras
                ? { value: serverValue, id: itemId, name: itemName, env: envVars }
                : serverValue;

            if (addScope === 'global') {
                const current = await (window as any).api.getGlobalContext();
                const ctx = current?.context || {};
                const servers = ctx.mcp_servers || [];

                const existing = servers.findIndex((s: any) =>
                    (typeof s === 'string' ? s : s.value) === serverValue
                );
                if (existing >= 0) {
                    servers[existing] = entry;
                } else {
                    servers.push(entry);
                }
                await (window as any).api.saveGlobalContext({ ...ctx, mcp_servers: servers });
            } else {
                const current = await (window as any).api.getProjectContext(currentPath);
                const ctx = current?.context || {};
                const servers = ctx.mcp_servers || [];
                const existing = servers.findIndex((s: any) =>
                    (typeof s === 'string' ? s : s.value) === serverValue
                );
                if (existing >= 0) {
                    servers[existing] = entry;
                } else {
                    servers.push(entry);
                }
                await (window as any).api.saveProjectContext({
                    path: currentPath,
                    contextData: { ...ctx, mcp_servers: servers },
                });
            }
            setNewServerPath('');
            setRemoteUrl('');
            setShowAddServer(false);
            setConfiguringItem(null);
            setEnvVarValues({});
            await loadServers();
        } catch (err: any) {
            setError(err.message);
        }
    }, [newServerPath, addScope, currentPath, loadServers]);

    const handleMarketplaceAdd = useCallback((item: MarketplaceItem) => {
        if (item.envVars && item.envVars.length > 0) {
            setConfiguringItem(item);

            const vals: Record<string, string> = {};
            item.envVars.forEach(ev => { vals[ev.key] = ''; });
            setEnvVarValues(vals);
            setShowSecrets({});
        } else {
            handleAddServer(item.install, undefined, item.id, item.name);
        }
    }, [handleAddServer]);

    const handleConfirmMarketplaceAdd = useCallback(() => {
        if (!configuringItem) return;

        const envVars: Record<string, string> = {};
        Object.entries(envVarValues).forEach(([k, v]) => {
            if (v.trim()) envVars[k] = v.trim();
        });
        handleAddServer(configuringItem.install, envVars, configuringItem.id, configuringItem.name);
    }, [configuringItem, envVarValues, handleAddServer]);

    const handleRemoveServer = useCallback(async (server: McpServer) => {
        try {
            setError(null);

            if (server.status === 'running') {
                await (window as any).api.stopMcpServer({ serverPath: server.serverPath });
            }

            const isGlobal = server.origin?.includes('global') || server.origin?.startsWith('auto:');
            if (isGlobal) {
                const current = await (window as any).api.getGlobalContext();
                const ctx = current?.context || {};
                ctx.mcp_servers = (ctx.mcp_servers || []).filter(
                    (s: any) => (typeof s === 'string' ? s : s.value) !== server.serverPath
                );
                await (window as any).api.saveGlobalContext(ctx);
            } else {
                const current = await (window as any).api.getProjectContext(currentPath);
                const ctx = current?.context || {};
                ctx.mcp_servers = (ctx.mcp_servers || []).filter(
                    (s: any) => (typeof s === 'string' ? s : s.value) !== server.serverPath
                );
                await (window as any).api.saveProjectContext({ path: currentPath, contextData: ctx });
            }

            if (selectedServer?.serverPath === server.serverPath) {
                setSelectedServer(null);
                setTools([]);
            }
            await loadServers();
        } catch (err: any) {
            setError(err.message);
        }
    }, [currentPath, loadServers, selectedServer]);

    const filteredServers = servers.filter(s => {
        if (scopeTab === 'global' && !s.origin?.includes('global') && !s.origin?.startsWith('auto:')) return false;
        if (scopeTab === 'project' && (s.origin?.includes('global') || s.origin?.startsWith('auto:'))) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return s.serverPath.toLowerCase().includes(q) ||
                   s.name?.toLowerCase().includes(q) ||
                   s.status?.toLowerCase().includes(q);
        }
        return true;
    });

    const filteredTools = tools.filter(t => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.function?.name?.toLowerCase().includes(q) ||
               t.function?.description?.toLowerCase().includes(q);
    });

    const toggleToolExpanded = (name: string) => {
        setExpandedTools(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const getServerDisplayName = (server: McpServer): string => {
        if (server.name) return server.name;
        const fileName = getFileName(server.serverPath) || server.serverPath;
        return fileName.replace(/_mcp_server\.py$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const getOriginBadge = (server: McpServer) => {
        if (!server.origin) return null;
        if (server.origin.startsWith('auto:')) {
            return (
                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
                    Auto
                </span>
            );
        }
        if (server.origin.includes('global')) {
            return (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                    Global
                </span>
            );
        }
        return (
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">
                Project
            </span>
        );
    };

    const runningCount = servers.filter(s => s.status === 'running').length;

    return (
        <div className="flex flex-col h-full theme-bg-primary text-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Server size={18} className="text-blue-400" />
                    <h2 className="font-semibold theme-text-primary">MCP Servers</h2>
                    <span className="text-xs theme-text-muted">
                        {servers.length} server{servers.length !== 1 ? 's' : ''}
                        {runningCount > 0 && (
                            <span className="text-green-400 ml-1">({runningCount} running)</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowAddServer(!showAddServer)}
                        className="theme-button px-2 py-1 rounded text-xs flex items-center gap-1"
                        title="Add MCP server"
                    >
                        <Plus size={12} /> Add
                    </button>
                    <button
                        onClick={() => { setLoading(true); loadServers(); }}
                        className="theme-button p-1 rounded"
                        title="Refresh servers"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/30 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300 flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                        <X size={12} />
                    </button>
                </div>
            )}

            {showAddServer && (
                <div className="border-b theme-border bg-blue-500/5">
                    <div className="flex items-center gap-0 border-b theme-border">
                        {([
                            { key: 'local' as const, label: 'Local Script', icon: <FileText size={12} /> },
                            { key: 'remote' as const, label: 'Remote URL', icon: <Globe size={12} /> },
                            { key: 'marketplace' as const, label: 'Marketplace', icon: <Zap size={12} /> },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setAddMode(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs transition ${
                                    addMode === tab.key
                                        ? 'theme-text-primary border-b-2 border-blue-400 bg-blue-500/10'
                                        : 'theme-text-muted hover:theme-text-secondary'
                                }`}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                        <button
                            onClick={() => { setShowAddServer(false); setNewServerPath(''); setRemoteUrl(''); }}
                            className="px-2 py-2 theme-text-muted hover:theme-text-primary"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs theme-text-secondary">Add to:</span>
                            <button
                                onClick={() => setAddScope('project')}
                                className={`text-xs px-2 py-0.5 rounded ${addScope === 'project' ? 'bg-purple-500/30 text-purple-300' : 'theme-text-muted hover:theme-text-secondary'}`}
                            >
                                Project
                            </button>
                            <button
                                onClick={() => setAddScope('global')}
                                className={`text-xs px-2 py-0.5 rounded ${addScope === 'global' ? 'bg-blue-500/30 text-blue-300' : 'theme-text-muted hover:theme-text-secondary'}`}
                            >
                                Global
                            </button>
                        </div>

                        {addMode === 'local' && (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newServerPath}
                                        onChange={(e) => setNewServerPath(e.target.value)}
                                        placeholder="Path to MCP server script (e.g., ~/.npcsh/my_mcp_server.py)"
                                        className="flex-1 theme-input text-xs font-mono px-2 py-1.5 rounded"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
                                        autoFocus
                                    />
                                    <button
                                        onClick={async () => {
                                            const result = await (window as any).api?.showOpenDialog?.({
                                                properties: ['openFile'],
                                                filters: [{ name: 'Scripts', extensions: ['py', 'js', 'ts'] }]
                                            });
                                            if (result?.filePaths?.[0]) setNewServerPath(result.filePaths[0]);
                                        }}
                                        className="theme-button px-2 py-1.5 rounded text-xs"
                                        title="Browse for file"
                                    >
                                        <FolderOpen size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={handleAddServer}
                                    disabled={!newServerPath.trim()}
                                    className="theme-button-primary px-3 py-1.5 rounded text-xs disabled:opacity-50 w-full"
                                >
                                    Add Local Server
                                </button>
                            </div>
                        )}

                        {addMode === 'remote' && (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={remoteUrl}
                                    onChange={(e) => setRemoteUrl(e.target.value)}
                                    placeholder="MCP server URL, npx command, or uvx command"
                                    className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && remoteUrl.trim()) {
                                            handleAddServer(remoteUrl.trim());
                                        }
                                    }}
                                    autoFocus
                                />
                                <div className="text-[10px] theme-text-muted space-y-1">
                                    <div>Supported formats:</div>
                                    <div className="pl-2 space-y-0.5">
                                        <div><code className="text-blue-300">npx -y @modelcontextprotocol/server-github</code> — npm package</div>
                                        <div><code className="text-blue-300">uvx mcp-server-fetch</code> — Python package</div>
                                        <div><code className="text-blue-300">https://mcp.example.com/sse</code> — SSE endpoint</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        if (remoteUrl.trim()) handleAddServer(remoteUrl.trim());
                                    }}
                                    disabled={!remoteUrl.trim()}
                                    className="theme-button-primary px-3 py-1.5 rounded text-xs disabled:opacity-50 w-full"
                                >
                                    Add Remote Server
                                </button>
                            </div>
                        )}

                        {addMode === 'marketplace' && (
                            <div className="space-y-2">
                                {configuringItem ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { setConfiguringItem(null); setEnvVarValues({}); }}
                                                className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
                                            >
                                                <ArrowLeft size={14} />
                                            </button>
                                            <Package size={14} className="text-blue-400" />
                                            <span className="text-xs font-medium theme-text-primary">{configuringItem.name}</span>
                                            <span className={`text-[9px] px-1.5 py-0 rounded-full ${CATEGORY_COLORS[configuringItem.category]}`}>
                                                {configuringItem.category}
                                            </span>
                                        </div>
                                        <div className="text-[10px] theme-text-muted">{configuringItem.description}</div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-[10px] font-medium theme-text-secondary">
                                                <Key size={10} />
                                                Configuration
                                            </div>
                                            {configuringItem.envVars?.map(ev => (
                                                <div key={ev.key} className="space-y-0.5">
                                                    <label className="text-[10px] theme-text-secondary flex items-center gap-1">
                                                        {ev.label}
                                                        {ev.secret && <Lock size={8} className="text-yellow-500/70" />}
                                                    </label>
                                                    <div className="flex gap-1">
                                                        <input
                                                            type={ev.secret && !showSecrets[ev.key] ? 'password' : 'text'}
                                                            value={envVarValues[ev.key] || ''}
                                                            onChange={(e) => setEnvVarValues(prev => ({ ...prev, [ev.key]: e.target.value }))}
                                                            placeholder={ev.placeholder}
                                                            className="flex-1 theme-input text-xs font-mono px-2 py-1.5 rounded"
                                                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmMarketplaceAdd()}
                                                        />
                                                        {ev.secret && (
                                                            <button
                                                                onClick={() => setShowSecrets(prev => ({ ...prev, [ev.key]: !prev[ev.key] }))}
                                                                className="px-1.5 theme-button rounded"
                                                                title={showSecrets[ev.key] ? 'Hide' : 'Show'}
                                                            >
                                                                {showSecrets[ev.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[9px] theme-text-muted font-mono">{ev.key}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="text-[9px] theme-text-muted flex items-center gap-1">
                                            <ShieldCheck size={9} />
                                            Env vars are stored locally and passed to the server process
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleConfirmMarketplaceAdd}
                                                className="flex-1 theme-button-primary px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1"
                                            >
                                                <Plus size={12} /> Add {configuringItem.name}
                                            </button>
                                            <button
                                                onClick={() => {

                                                    handleAddServer(configuringItem.install, undefined, configuringItem.id, configuringItem.name);
                                                }}
                                                className="theme-button px-3 py-1.5 rounded text-xs"
                                                title="Add without configuration (can configure later)"
                                            >
                                                Skip
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                                            <input
                                                type="text"
                                                value={marketplaceSearch}
                                                onChange={(e) => setMarketplaceSearch(e.target.value)}
                                                placeholder="Search MCP servers..."
                                                className="w-full theme-input text-xs pl-7 pr-2 py-1.5 rounded"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="max-h-64 overflow-y-auto space-y-1">
                                            {MCP_MARKETPLACE
                                                .filter(item => {
                                                    if (!marketplaceSearch) return true;
                                                    const q = marketplaceSearch.toLowerCase();
                                                    return item.name.toLowerCase().includes(q) ||
                                                           item.description.toLowerCase().includes(q) ||
                                                           item.category.toLowerCase().includes(q);
                                                })
                                                .map(item => {
                                                    const isInstalled = servers.some(s =>
                                                        s.serverPath.includes(item.id) || s.name?.toLowerCase() === item.name.toLowerCase()
                                                    );
                                                    const hasConfig = item.envVars && item.envVars.length > 0;
                                                    return (
                                                        <div key={item.id} className="flex items-start gap-2 p-2 rounded border theme-border hover:theme-bg-secondary transition">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-medium theme-text-primary">{item.name}</span>
                                                                    <span className={`text-[9px] px-1.5 py-0 rounded-full ${CATEGORY_COLORS[item.category]}`}>
                                                                        {item.category}
                                                                    </span>
                                                                    {hasConfig && (
                                                                        <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 rounded-full flex items-center gap-0.5">
                                                                            <Key size={7} /> config
                                                                        </span>
                                                                    )}
                                                                    {isInstalled && (
                                                                        <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 rounded-full">installed</span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] theme-text-muted mt-0.5">{item.description}</div>
                                                                <div className="text-[9px] text-blue-400/60 font-mono mt-0.5 truncate">{item.install}</div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleMarketplaceAdd(item)}
                                                                disabled={isInstalled}
                                                                className={`flex-shrink-0 px-2 py-1 rounded text-[10px] ${
                                                                    isInstalled
                                                                        ? 'theme-text-muted cursor-not-allowed'
                                                                        : 'theme-button-primary hover:opacity-90'
                                                                }`}
                                                            >
                                                                {isInstalled ? 'Added' : hasConfig ? 'Setup' : 'Add'}
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="px-4 py-2 border-b theme-border flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={selectedServer ? "Filter tools..." : "Filter servers..."}
                        className="w-full theme-input text-xs pl-7 pr-2 py-1.5 rounded"
                    />
                </div>
                {!selectedServer && (
                    <div className="flex gap-0.5 rounded theme-bg-secondary p-0.5">
                        {(['all', 'global', 'project'] as ScopeTab[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setScopeTab(tab)}
                                className={`text-[10px] px-2 py-1 rounded capitalize ${
                                    scopeTab === tab
                                        ? 'theme-bg-primary theme-text-primary shadow-sm'
                                        : 'theme-text-muted hover:theme-text-secondary'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-1 min-h-0">
                <div className={`${selectedServer ? 'w-72' : 'w-full'} border-r theme-border flex flex-col min-h-0 transition-all`}>
                    <div className="flex-1 overflow-y-auto">
                        {loading && servers.length === 0 ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader size={20} className="animate-spin theme-text-muted" />
                            </div>
                        ) : filteredServers.length === 0 ? (
                            <div className="text-center py-8 px-4">
                                <Server size={32} className="mx-auto mb-3 theme-text-muted opacity-40" />
                                <div className="text-xs theme-text-muted">
                                    {searchQuery ? 'No servers match your search' : 'No MCP servers configured'}
                                </div>
                                {!searchQuery && (
                                    <button
                                        onClick={() => setShowAddServer(true)}
                                        className="mt-3 text-xs text-blue-400 hover:underline"
                                    >
                                        Add your first server
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {filteredServers.map((server, idx) => {
                                    const isSelected = selectedServer?.serverPath === server.serverPath;
                                    const isActioning = actionInProgress === server.serverPath;
                                    const status = server.status || 'unknown';

                                    return (
                                        <div
                                            key={server.serverPath + idx}
                                            onClick={() => handleSelectServer(server)}
                                            className={`group cursor-pointer rounded-lg p-2.5 border transition-all ${
                                                isSelected
                                                    ? 'border-blue-500/50 bg-blue-500/10'
                                                    : 'border-transparent hover:theme-bg-secondary hover:border-gray-600/30'
                                            }`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT_COLORS[status] || STATUS_DOT_COLORS.unknown}`} />

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium theme-text-primary truncate">
                                                            {getServerDisplayName(server)}
                                                        </span>
                                                        {getOriginBadge(server)}
                                                    </div>
                                                    <div className="text-[10px] theme-text-muted font-mono truncate mt-0.5" title={server.serverPath}>
                                                        {server.serverPath}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[10px] ${STATUS_COLORS[status] || STATUS_COLORS.unknown}`}>
                                                            {status}
                                                        </span>
                                                        {server.pid && (
                                                            <span className="text-[10px] theme-text-muted">PID: {server.pid}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                    {isActioning ? (
                                                        <Loader size={14} className="animate-spin theme-text-muted" />
                                                    ) : status === 'running' ? (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRestart(server); }}
                                                                className="p-1 rounded hover:bg-yellow-500/20 text-yellow-400"
                                                                title="Restart"
                                                            >
                                                                <RotateCcw size={12} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleStop(server); }}
                                                                className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                                                title="Stop"
                                                            >
                                                                <Square size={12} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleStart(server); }}
                                                            className="p-1 rounded hover:bg-green-500/20 text-green-400"
                                                            title="Start"
                                                        >
                                                            <Play size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {selectedServer && (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="px-4 py-3 border-b theme-border flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <button
                                        onClick={() => { setSelectedServer(null); setTools([]); setSearchQuery(''); }}
                                        className="theme-text-muted hover:theme-text-primary"
                                    >
                                        <ChevronRight size={16} className="rotate-180" />
                                    </button>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold theme-text-primary truncate">
                                            {getServerDisplayName(selectedServer)}
                                        </h3>
                                        <div className="text-[10px] theme-text-muted font-mono truncate">
                                            {selectedServer.serverPath}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`flex items-center gap-1.5 text-xs ${STATUS_COLORS[selectedServer.status || 'unknown']}`}>
                                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[selectedServer.status || 'unknown']}`} />
                                        {selectedServer.status || 'unknown'}
                                    </span>
                                    <div className="flex gap-1 ml-2">
                                        {actionInProgress === selectedServer.serverPath ? (
                                            <Loader size={16} className="animate-spin" />
                                        ) : selectedServer.status === 'running' ? (
                                            <>
                                                <button
                                                    onClick={() => handleRestart(selectedServer)}
                                                    className="theme-button px-2 py-1 rounded text-xs flex items-center gap-1"
                                                >
                                                    <RotateCcw size={12} /> Restart
                                                </button>
                                                <button
                                                    onClick={() => handleStop(selectedServer)}
                                                    className="px-2 py-1 rounded text-xs flex items-center gap-1 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                                >
                                                    <Square size={12} /> Stop
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleStart(selectedServer)}
                                                className="theme-button-primary px-2 py-1 rounded text-xs flex items-center gap-1"
                                            >
                                                <Play size={12} /> Start
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleRemoveServer(selectedServer)}
                                            className="px-2 py-1 rounded text-xs flex items-center gap-1 text-red-400 hover:bg-red-500/20"
                                            title="Remove server"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mt-2">
                                {getOriginBadge(selectedServer)}
                                {selectedServer.pid && (
                                    <span className="text-[10px] theme-text-muted">PID: {selectedServer.pid}</span>
                                )}
                                {selectedServer.env && Object.keys(selectedServer.env).length > 0 && (
                                    <button
                                        onClick={() => setShowEnvVars(!showEnvVars)}
                                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        {showEnvVars ? <EyeOff size={10} /> : <Eye size={10} />}
                                        {Object.keys(selectedServer.env).length} env var{Object.keys(selectedServer.env).length !== 1 ? 's' : ''}
                                    </button>
                                )}
                            </div>

                            {showEnvVars && selectedServer.env && (
                                <div className="mt-2 p-2 rounded theme-bg-secondary text-[10px] font-mono space-y-0.5">
                                    {Object.entries(selectedServer.env).map(([key, value]) => (
                                        <div key={key} className="flex gap-2">
                                            <span className="text-purple-400">{key}</span>
                                            <span className="theme-text-muted">=</span>
                                            <span className="theme-text-secondary truncate">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between px-4 py-2 border-b theme-border flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Wrench size={14} className="text-blue-400" />
                                <span className="text-xs font-medium theme-text-primary">
                                    Tools
                                    {tools.length > 0 && (
                                        <span className="theme-text-muted ml-1">({filteredTools.length})</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {toolsLoading && <Loader size={12} className="animate-spin" />}
                                <button
                                    onClick={() => loadTools(selectedServer.serverPath)}
                                    className="p-1 rounded theme-hover"
                                    title="Refresh tools"
                                >
                                    <RefreshCw size={12} className="theme-text-muted" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {toolsError ? (
                                <div className="p-4 text-center">
                                    <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
                                    <div className="text-xs text-red-300">{toolsError}</div>
                                    <button
                                        onClick={() => loadTools(selectedServer.serverPath)}
                                        className="mt-2 text-xs text-blue-400 hover:underline"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : toolsLoading && tools.length === 0 ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader size={20} className="animate-spin theme-text-muted" />
                                </div>
                            ) : filteredTools.length === 0 ? (
                                <div className="text-center py-8 px-4">
                                    <Wrench size={24} className="mx-auto mb-2 theme-text-muted opacity-40" />
                                    <div className="text-xs theme-text-muted">
                                        {searchQuery
                                            ? 'No tools match your search'
                                            : selectedServer.status === 'running'
                                                ? 'No tools available'
                                                : 'Start the server to see available tools'}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-2 space-y-1">
                                    {filteredTools.map((tool, idx) => {
                                        const name = tool.function?.name || `tool-${idx}`;
                                        const desc = tool.function?.description || '';
                                        const params = tool.function?.parameters;
                                        const isExpanded = expandedTools.has(name);
                                        const hasParams = params?.properties && Object.keys(params.properties).length > 0;

                                        return (
                                            <div
                                                key={name}
                                                className="rounded-lg border theme-border overflow-hidden"
                                            >
                                                <button
                                                    onClick={() => toggleToolExpanded(name)}
                                                    className="w-full text-left px-3 py-2 hover:theme-bg-secondary transition flex items-start gap-2"
                                                >
                                                    <ChevronRight
                                                        size={12}
                                                        className={`mt-0.5 theme-text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-medium text-blue-300">
                                                                {name}
                                                            </span>
                                                            {hasParams && (
                                                                <span className="text-[9px] theme-text-muted">
                                                                    {Object.keys(params!.properties!).length} param{Object.keys(params!.properties!).length !== 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!isExpanded && desc && (
                                                            <div className="text-[10px] theme-text-muted mt-0.5 line-clamp-1">
                                                                {desc.split('\n')[0]}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="px-3 pb-3 border-t theme-border theme-bg-secondary">
                                                        {desc && (
                                                            <div className="text-[11px] theme-text-secondary mt-2 whitespace-pre-wrap leading-relaxed">
                                                                {desc}
                                                            </div>
                                                        )}

                                                        {hasParams && (
                                                            <div className="mt-3">
                                                                <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1.5">
                                                                    Parameters
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {Object.entries(params!.properties!).map(([pName, pInfo]) => {
                                                                        const isRequired = params!.required?.includes(pName);
                                                                        return (
                                                                            <div key={pName} className="flex items-start gap-2 text-[11px]">
                                                                                <code className={`font-mono flex-shrink-0 ${isRequired ? 'text-orange-300' : 'text-gray-400'}`}>
                                                                                    {pName}
                                                                                    {isRequired && <span className="text-red-400">*</span>}
                                                                                </code>
                                                                                <span className="text-purple-400 text-[10px] flex-shrink-0">
                                                                                    {pInfo.type}
                                                                                    {pInfo.enum && ` [${pInfo.enum.join('|')}]`}
                                                                                </span>
                                                                                {pInfo.description && (
                                                                                    <span className="theme-text-muted">
                                                                                        {pInfo.description}
                                                                                    </span>
                                                                                )}
                                                                                {pInfo.default !== undefined && (
                                                                                    <span className="theme-text-muted flex-shrink-0">
                                                                                        (default: {JSON.stringify(pInfo.default)})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default McpManager;
