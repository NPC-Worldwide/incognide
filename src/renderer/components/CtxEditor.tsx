import React, { useState, useEffect } from 'react';
import { FileJson, X, Save, Plus, Trash2, Search, ChevronDown, Server, Database, RefreshCw } from 'lucide-react';
import yaml from 'js-yaml';
import AutosizeTextarea from './AutosizeTextarea';

function preprocessJinja(content: string): string {
    return content.replace(
        /(?<!["'])\{\{[^{}]*\}\}(?!["'])/g,
        (match) => `"${match}"`
    );
}

interface ProviderConfig {
    name: string;
    provider_type?: string;
    api_url?: string;
    api_key?: string;
    model?: string;
    models?: string[];
}

interface McpMarketplaceItem {
    id: string;
    name: string;
    description: string;
    category: string;
    install: string;
    envVars?: { key: string; label: string; placeholder: string; secret?: boolean }[];
}

const MCP_MARKETPLACE: McpMarketplaceItem[] = [
    { id: 'sqlite', name: 'SQLite', description: 'Query and manage SQLite databases', category: 'data', install: 'npx -y mcp-server-sqlite' },
    { id: 'postgres', name: 'PostgreSQL', description: 'Query PostgreSQL databases with read-only access', category: 'data', install: 'npx -y @modelcontextprotocol/server-postgres', envVars: [{ key: 'POSTGRES_CONNECTION_STRING', label: 'Connection String', placeholder: 'postgresql://user:pass@localhost/db' }] },
    { id: 'redis', name: 'Redis', description: 'Interact with Redis key-value stores', category: 'data', install: 'uvx mcp-server-redis', envVars: [{ key: 'REDIS_URL', label: 'Redis URL', placeholder: 'redis://localhost:6379' }] },
    { id: 'github', name: 'GitHub', description: 'Manage repos, issues, PRs, and files via GitHub API', category: 'dev', install: 'npx -y @modelcontextprotocol/server-github', envVars: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Token', placeholder: 'ghp_...', secret: true }] },
    { id: 'gitlab', name: 'GitLab', description: 'Manage GitLab projects, issues, and merge requests', category: 'dev', install: 'npx -y @modelcontextprotocol/server-gitlab', envVars: [{ key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'GitLab Token', placeholder: 'glpat-...', secret: true }, { key: 'GITLAB_API_URL', label: 'API URL', placeholder: 'https://gitlab.com/api/v4' }] },
    { id: 'filesystem', name: 'Filesystem', description: 'Secure file operations with configurable access controls', category: 'dev', install: 'npx -y @modelcontextprotocol/server-filesystem' },
    { id: 'git', name: 'Git', description: 'Read and search through git repositories', category: 'dev', install: 'uvx mcp-server-git' },
    { id: 'brave-search', name: 'Brave Search', description: 'Web and local search using Brave Search API', category: 'web', install: 'npx -y @modelcontextprotocol/server-brave-search', envVars: [{ key: 'BRAVE_API_KEY', label: 'Brave API Key', placeholder: 'BSA...', secret: true }] },
    { id: 'fetch', name: 'Fetch', description: 'Fetch and convert web pages to markdown', category: 'web', install: 'uvx mcp-server-fetch' },
    { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation and web scraping', category: 'web', install: 'npx -y @modelcontextprotocol/server-puppeteer' },
    { id: 'slack', name: 'Slack', description: 'Channel management and messaging in Slack', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-slack', envVars: [{ key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...', secret: true }, { key: 'SLACK_TEAM_ID', label: 'Team ID', placeholder: 'T0...' }] },
    { id: 'google-drive', name: 'Google Drive', description: 'Search and access Google Drive files', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-gdrive' },
    { id: 'google-maps', name: 'Google Maps', description: 'Location services, directions, and place details', category: 'productivity', install: 'npx -y @modelcontextprotocol/server-google-maps', envVars: [{ key: 'GOOGLE_MAPS_API_KEY', label: 'API Key', placeholder: 'AIza...', secret: true }] },
    { id: 'memory', name: 'Memory', description: 'Knowledge graph-based persistent memory', category: 'ai', install: 'npx -y @modelcontextprotocol/server-memory' },
    { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'Dynamic problem-solving through thought sequences', category: 'ai', install: 'npx -y @modelcontextprotocol/server-sequential-thinking' },
    { id: 'time', name: 'Time', description: 'Time and timezone conversion utilities', category: 'system', install: 'uvx mcp-server-time' },
    { id: 'docker', name: 'Docker', description: 'Manage Docker containers, images, and volumes', category: 'dev', install: 'uvx mcp-server-docker' },
    { id: 'sentry', name: 'Sentry', description: 'Retrieve and analyze error reports from Sentry', category: 'dev', install: 'npx -y @modelcontextprotocol/server-sentry', envVars: [{ key: 'SENTRY_AUTH_TOKEN', label: 'Auth Token', placeholder: 'sntrys_...', secret: true }] },
    { id: 'todoist', name: 'Todoist', description: 'Manage tasks and projects in Todoist', category: 'productivity', install: 'npx -y @abhiz123/todoist-mcp-server', envVars: [{ key: 'TODOIST_API_TOKEN', label: 'API Token', placeholder: '', secret: true }] },
];

const CtxEditor = ({ isOpen, onClose, teamPath, embedded = false }) => {
    const [ctx, setCtx] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ctxFileName, setCtxFileName] = useState<string | null>(null);
    const [availableJinxes, setAvailableJinxes] = useState<any[]>([]);
    const [jinxDropdownOpen, setJinxDropdownOpen] = useState(false);
    const [jinxDropdownSearch, setJinxDropdownSearch] = useState('');
    const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false);
    const [mcpDropdownSearch, setMcpDropdownSearch] = useState('');
    const [providerScan, setProviderScan] = useState<Record<number, { loading: boolean; error?: string; models?: string[]; open: boolean }>>({});

    const findCtxFile = async (dirPath: string) => {
        try {
            const items = await (window as any).api.readDirectory(dirPath);
            const ctxFiles = (items || []).filter(item => item.name && item.name.endsWith('.ctx'));
            if (ctxFiles.length > 0) {
                return ctxFiles[0].name;
            }
        } catch {
        }
        return null;
    };

    useEffect(() => {
        if (isOpen && teamPath) {
            loadContext();
            loadJinxes();
        }
    }, [isOpen, teamPath]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const loadContext = async () => {
        if (!teamPath) {
            setCtx({});
            setCtxFileName(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const foundFile = await findCtxFile(teamPath);
            if (foundFile) {
                setCtxFileName(foundFile);
                const result = await (window as any).api.readFileContent(teamPath + '/' + foundFile);
                const text = typeof result === 'string' ? result : result?.content;
                if (text != null) {
                    const processed = preprocessJinja(text);
                    setCtx(yaml.load(processed) || {});
                } else {
                    setCtx({});
                }
            } else {
                setCtxFileName(null);
                setCtx({});
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to load context');
            setCtxFileName(null);
            setCtx({});
        } finally {
            setIsLoading(false);
        }
    };

    const loadJinxes = async () => {
        if (!teamPath) return;
        try {
            const jinxResponse = await (window as any).api.getJinxesProject?.(teamPath);
            setAvailableJinxes(jinxResponse?.jinxes || []);
        } catch {
            setAvailableJinxes([]);
        }
    };

    const handleSave = async () => {
        if (!teamPath) return;
        setIsLoading(true);
        setError(null);
        try {
            let targetFile = ctxFileName;
            if (!targetFile) {
                targetFile = 'team.ctx';
                setCtxFileName(targetFile);
            }
            const cleanCtx = { ...ctx };
            delete cleanCtx.external_jinx_teams;
            delete cleanCtx.EXTERNAL_JINX_TEAMS;
            const result = await (window as any).api.writeFileContent(teamPath + '/' + targetFile, yaml.dump(cleanCtx));
            if (result?.error) {
                setError(result.error);
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to save context');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFieldChange = (field, value) => {
        setCtx(prev => ({ ...prev, [field]: value }));
    };

    const getProviders = (): ProviderConfig[] => {
        const p = ctx.providers;
        if (!p) return [];
        if (Array.isArray(p)) return p;
        return [];
    };

    const addProvider = () => {
        const current = getProviders();
        setCtx(prev => ({
            ...prev,
            providers: [...current, { name: '', provider_type: '', api_url: '', api_key: '', model: '', models: [] }]
        }));
    };

    const updateProvider = (index: number, field: keyof ProviderConfig, value: any) => {
        const current = getProviders();
        const next = [...current];
        next[index] = { ...next[index], [field]: value };
        setCtx(prev => ({ ...prev, providers: next }));
    };

    const addProviderModel = (index: number, modelName: string) => {
        if (!modelName.trim()) return;
        const current = getProviders();
        const next = [...current];
        const models = next[index].models || [];
        if (!models.includes(modelName.trim())) {
            next[index] = { ...next[index], models: [...models, modelName.trim()] };
            setCtx(prev => ({ ...prev, providers: next }));
        }
    };

    const removeProviderModel = (index: number, modelIdx: number) => {
        const current = getProviders();
        const next = [...current];
        const models = [...(next[index].models || [])];
        models.splice(modelIdx, 1);
        next[index] = { ...next[index], models };
        setCtx(prev => ({ ...prev, providers: next }));
    };

    const removeProvider = (index: number) => {
        const current = getProviders();
        const next = current.filter((_, i) => i !== index);
        if (next.length === 0) {
            setCtx(prev => {
                const { providers: _, ...rest } = prev;
                return rest;
            });
        } else {
            setCtx(prev => ({ ...prev, providers: next }));
        }
    };

    const scanProviderModels = async (index: number) => {
        const providers = getProviders();
        const prov = providers[index];
        const providerName = (prov?.provider_type || prov?.name || '').trim();
        if (!providerName) {
            setProviderScan(prev => ({ ...prev, [index]: { open: true, error: 'Provider name or type required', loading: false } }));
            return;
        }
        setProviderScan(prev => ({ ...prev, [index]: { open: true, loading: true } }));
        try {
            const res = await (window as any).api.getProviderModels({ provider: providerName });
            if (res?.error) throw new Error(res.error);
            const models = (res?.models || [])
                .map((m: any) => (typeof m === 'string' ? m : (m.id || m.name || m.value || m.display_name)))
                .filter(Boolean);
            setProviderScan(prev => ({ ...prev, [index]: { open: true, loading: false, models } }));
        } catch (err: any) {
            setProviderScan(prev => ({ ...prev, [index]: { open: true, loading: false, error: err.message || 'Failed to discover models' } }));
        }
    };

    const closeProviderScan = (index: number) => {
        setProviderScan(prev => ({ ...prev, [index]: { ...prev[index], open: false } }));
    };

    const getJinxes = (): string[] => {
        const val = ctx.jinxes;
        if (!val) return [];
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === 'string') return [val];
        return [];
    };

    const addJinx = (jinxName: string) => {
        if (!jinxName) return;
        const current = getJinxes();
        if (current.includes(jinxName)) return;
        setCtx(prev => ({ ...prev, jinxes: [...current, jinxName] }));
    };

    const removeJinx = (index: number) => {
        const current = getJinxes();
        const next = [...current];
        next.splice(index, 1);
        if (next.length === 0) {
            setCtx(prev => {
                const { jinxes: _, ...rest } = prev;
                return rest;
            });
        } else {
            setCtx(prev => ({ ...prev, jinxes: next }));
        }
    };

    const getMcpServers = (): any[] => {
        const val = ctx.mcp_servers;
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return [];
    };

    const addMcp = (item: McpMarketplaceItem, env?: Record<string, string>) => {
        const current = getMcpServers();
        const entry: any = env && Object.keys(env).length > 0
            ? { value: item.install, id: item.id, name: item.name, env }
            : item.install;
        const existing = current.findIndex((s: any) =>
            (typeof s === 'string' ? s : s.value) === item.install
        );
        if (existing >= 0) {
            const next = [...current];
            next[existing] = entry;
            setCtx(prev => ({ ...prev, mcp_servers: next }));
        } else {
            setCtx(prev => ({ ...prev, mcp_servers: [...current, entry] }));
        }
    };

    const addCustomMcp = (value: string) => {
        if (!value.trim()) return;
        const current = getMcpServers();
        const exists = current.some((s: any) =>
            (typeof s === 'string' ? s : s.value) === value.trim()
        );
        if (!exists) {
            setCtx(prev => ({ ...prev, mcp_servers: [...current, value.trim()] }));
        }
    };

    const removeMcp = (index: number) => {
        const current = getMcpServers();
        const next = [...current];
        next.splice(index, 1);
        if (next.length === 0) {
            setCtx(prev => {
                const { mcp_servers: _, ...rest } = prev;
                return rest;
            });
        } else {
            setCtx(prev => ({ ...prev, mcp_servers: next }));
        }
    };

    interface DatabaseEntry {
        name?: string;
        path: string;
    }

    const getDatabases = (): DatabaseEntry[] => {
        const val = ctx.databases;
        if (!val) return [];
        if (Array.isArray(val)) {
            return val.map((d: any) => {
                if (typeof d === 'string') return { path: d };
                return { name: d.name, path: d.path || d.value || '' };
            });
        }
        return [];
    };

    const addDatabase = (template: 'sqlite' | 'postgres' | 'snowflake' | 'mysql') => {
        const templates: Record<string, DatabaseEntry> = {
            sqlite: { name: 'SQLite', path: '~/history.db' },
            postgres: { name: 'PostgreSQL', path: 'postgresql://user:pass@localhost:5432/db' },
            snowflake: { name: 'Snowflake', path: 'snowflake://account/warehouse/database/schema' },
            mysql: { name: 'MySQL', path: 'mysql://user:pass@localhost:3306/db' },
        };
        const current = getDatabases();
        const entry = templates[template] || { path: '' };
        setCtx(prev => ({ ...prev, databases: [...current, entry] }));
    };

    const removeDatabase = (index: number) => {
        const current = getDatabases();
        const next = current.filter((_, i) => i !== index);
        if (next.length === 0) {
            setCtx(prev => {
                const { databases: _, ...rest } = prev;
                return rest;
            });
        } else {
            setCtx(prev => ({ ...prev, databases: next }));
        }
    };

    const updateDatabase = (index: number, field: keyof DatabaseEntry, value: string) => {
        const current = getDatabases();
        const next = [...current];
        next[index] = { ...next[index], [field]: value };
        setCtx(prev => ({ ...prev, databases: next }));
    };

    const renderJinxDropdown = () => {
        const currentJinxes = new Set(getJinxes());
        const filtered = availableJinxes.filter(j => {
            const n = j.name || j.jinx_name;
            if (currentJinxes.has(n)) return false;
            if (!jinxDropdownSearch) return true;
            return n.toLowerCase().includes(jinxDropdownSearch.toLowerCase());
        });

        const byFolder: Record<string, any[]> = {};
        for (const j of filtered.sort((a, b) =>
            (a.name || a.jinx_name).localeCompare(b.name || b.jinx_name)
        )) {
            const n = j.name || j.jinx_name;
            const parts = (j.path || n).split('/');
            const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
            if (!byFolder[folder]) byFolder[folder] = [];
            byFolder[folder].push(j);
        }

        return (
            <div className="space-y-2">
                <label className="block text-sm theme-text-secondary mb-1">Team Jinxes</label>
                <div className="relative">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search jinxes..."
                                className="w-full theme-input pl-7 pr-2 py-1.5 rounded text-xs"
                                value={jinxDropdownSearch}
                                onChange={(e) => {
                                    setJinxDropdownSearch(e.target.value);
                                    setJinxDropdownOpen(true);
                                }}
                                onFocus={() => setJinxDropdownOpen(true)}
                            />
                        </div>
                        <button
                            onClick={() => setJinxDropdownOpen(!jinxDropdownOpen)}
                            className="p-1.5 theme-button-subtle rounded"
                        >
                            <ChevronDown
                                size={14}
                                className={`text-gray-500 transition-transform ${jinxDropdownOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </div>

                    {jinxDropdownOpen && (
                        <div className="absolute z-10 left-0 right-0 mt-0.5 border rounded theme-border theme-bg-secondary shadow-lg max-h-56 overflow-y-auto">
                            {Object.keys(byFolder).length === 0 ? (
                                <p className="text-xs theme-text-secondary italic p-2">No jinxes found</p>
                            ) : (
                                Object.entries(byFolder).map(([folder, jinxes]) => (
                                    <div key={folder}>
                                        <div className="px-2 py-0.5 text-[10px] uppercase tracking-wider theme-text-muted font-semibold bg-gray-900/30">
                                            {folder}
                                        </div>
                                        {jinxes.map(j => {
                                            const n = j.name || j.jinx_name;
                                            return (
                                                <button
                                                    key={n}
                                                    onClick={() => {
                                                        addJinx(n);
                                                        setJinxDropdownSearch('');
                                                        setJinxDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-2 py-1 text-xs theme-text-primary hover:bg-white/5 truncate"
                                                >
                                                    {n}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                
                {getJinxes().length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {getJinxes().map((jinxName, idx) => (
                            <span key={`${jinxName}-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border theme-border text-xs theme-text-primary">
                                {jinxName}
                                <button
                                    onClick={() => removeJinx(idx)}
                                    className="text-red-400 hover:text-red-300"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const [mcpConfigItem, setMcpConfigItem] = useState<McpMarketplaceItem | null>(null);
    const [mcpEnvValues, setMcpEnvValues] = useState<Record<string, string>>({});

    const renderMcpDropdown = () => {
        const current = getMcpServers();
        const currentValues = new Set(current.map((s: any) => typeof s === 'string' ? s : s.value));
        const filtered = MCP_MARKETPLACE.filter(item => {
            if (currentValues.has(item.install)) return false;
            if (!mcpDropdownSearch) return true;
            const q = mcpDropdownSearch.toLowerCase();
            return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
        });

        return (
            <div className="space-y-2">
                <label className="block text-sm theme-text-secondary mb-1 flex items-center gap-1.5">
                    <Server size={12} className="text-blue-400" /> MCP Servers
                </label>
                {mcpConfigItem ? (
                    <div className="space-y-2 p-2 rounded border theme-border bg-gray-900/30">
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setMcpConfigItem(null); setMcpEnvValues({}); }} className="p-1 rounded theme-hover theme-text-muted">
                                <ChevronDown size={12} className="rotate-90" />
                            </button>
                            <span className="text-xs font-medium theme-text-primary">{mcpConfigItem.name}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">{mcpConfigItem.category}</span>
                        </div>
                        <div className="text-[10px] theme-text-muted">{mcpConfigItem.description}</div>
                        {mcpConfigItem.envVars?.map(ev => (
                            <div key={ev.key} className="space-y-0.5">
                                <label className="text-[10px] theme-text-secondary">{ev.label}</label>
                                <input
                                    type={ev.secret ? 'password' : 'text'}
                                    value={mcpEnvValues[ev.key] || ''}
                                    onChange={e => setMcpEnvValues(prev => ({ ...prev, [ev.key]: e.target.value }))}
                                    placeholder={ev.placeholder}
                                    className="w-full theme-input text-xs font-mono px-2 py-1 rounded"
                                />
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <button
                                onClick={() => { addMcp(mcpConfigItem, mcpEnvValues); setMcpConfigItem(null); setMcpEnvValues({}); setMcpDropdownSearch(''); }}
                                className="flex-1 theme-button-primary px-2 py-1 rounded text-xs"
                            >
                                Add {mcpConfigItem.name}
                            </button>
                            <button
                                onClick={() => { addMcp(mcpConfigItem, {}); setMcpConfigItem(null); setMcpDropdownSearch(''); }}
                                className="theme-button px-2 py-1 rounded text-xs"
                            >
                                Skip Config
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search MCP servers..."
                                    className="w-full theme-input pl-7 pr-2 py-1.5 rounded text-xs"
                                    value={mcpDropdownSearch}
                                    onChange={(e) => {
                                        setMcpDropdownSearch(e.target.value);
                                        setMcpDropdownOpen(true);
                                    }}
                                    onFocus={() => setMcpDropdownOpen(true)}
                                />
                            </div>
                            <button
                                onClick={() => setMcpDropdownOpen(!mcpDropdownOpen)}
                                className="p-1.5 theme-button-subtle rounded"
                            >
                                <ChevronDown size={14} className={`text-gray-500 transition-transform ${mcpDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {mcpDropdownOpen && (
                            <div className="absolute z-10 left-0 right-0 mt-0.5 border rounded theme-border theme-bg-secondary shadow-lg max-h-56 overflow-y-auto">
                                {filtered.length === 0 ? (
                                    <p className="text-xs theme-text-secondary italic p-2">No MCP servers found</p>
                                ) : (
                                    filtered.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                if (item.envVars && item.envVars.length > 0) {
                                                    const vals: Record<string, string> = {};
                                                    item.envVars.forEach(ev => { vals[ev.key] = ''; });
                                                    setMcpEnvValues(vals);
                                                    setMcpConfigItem(item);
                                                } else {
                                                    addMcp(item);
                                                    setMcpDropdownSearch('');
                                                    setMcpDropdownOpen(false);
                                                }
                                            }}
                                            className="w-full text-left px-2 py-1.5 text-xs theme-text-primary hover:bg-white/5 flex items-center gap-2"
                                        >
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-[9px] px-1 py-0 rounded bg-blue-500/20 text-blue-400">{item.category}</span>
                                            {item.envVars && item.envVars.length > 0 && <span className="text-[9px] text-yellow-400">config required</span>}
                                        </button>
                                    ))
                                )}
                                {mcpDropdownSearch && !MCP_MARKETPLACE.some(m => m.name.toLowerCase().includes(mcpDropdownSearch.toLowerCase())) && (
                                    <button
                                        onClick={() => {
                                            addCustomMcp(mcpDropdownSearch);
                                            setMcpDropdownSearch('');
                                            setMcpDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-2 py-1 text-xs text-blue-400 hover:bg-white/5 border-t theme-border"
                                    >
                                        Add custom: {mcpDropdownSearch}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {current.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {current.map((s: any, idx: number) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border theme-border text-xs theme-text-primary">
                                {typeof s === 'string' ? s.split(/\s+/).pop() || s : s.name || s.value.split(/\s+/).pop() || s.value}
                                <button onClick={() => removeMcp(idx)} className="text-red-400 hover:text-red-300">
                                    <Trash2 size={10} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderDatabasesSection = () => {
        const dbs = getDatabases();
        const templates = [
            { key: 'sqlite', label: 'SQLite', icon: '📁' },
            { key: 'postgres', label: 'PostgreSQL', icon: '🔐' },
            { key: 'snowflake', label: 'Snowflake', icon: '❄️' },
            { key: 'mysql', label: 'MySQL', icon: '🐍' },
        ] as { key: 'sqlite' | 'postgres' | 'snowflake' | 'mysql'; label: string; icon: string }[];

        return (
            <div className="space-y-3 border-t theme-border pt-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm theme-text-primary font-semibold flex items-center gap-2">
                        <Database size={14} className="text-blue-400" /> Databases
                    </h4>
                    <div className="flex gap-1">
                        {templates.map(t => (
                            <button
                                key={t.key}
                                onClick={() => addDatabase(t.key)}
                                className="text-[10px] theme-button-subtle px-2 py-1 rounded flex items-center gap-1"
                                title={`Add ${t.label} template`}
                            >
                                <span>{t.icon}</span> {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    {dbs.map((db, idx) => (
                        <div key={idx} className="flex gap-2 items-center theme-bg-tertiary p-2 rounded-lg">
                            <input
                                type="text"
                                value={db.name || ''}
                                onChange={(e) => updateDatabase(idx, 'name', e.target.value)}
                                placeholder="DB name"
                                className="w-32 theme-input text-xs"
                            />
                            <input
                                type="text"
                                value={db.path || ''}
                                onChange={(e) => updateDatabase(idx, 'path', e.target.value)}
                                placeholder="~/path/to/db or connection string"
                                className="flex-1 theme-input text-xs font-mono"
                            />
                            <button
                                onClick={() => removeDatabase(idx)}
                                className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {dbs.length === 0 && (
                        <p className="text-xs theme-text-muted italic">No databases configured. Use the template buttons above to add one.</p>
                    )}
                </div>
            </div>
        );
    };

    const renderForm = () => {
        if (!teamPath) {
            return <div className="p-4 theme-text-muted">No team path selected.</div>;
        }

        const providers = getProviders();

        return (
            <div className="space-y-6 py-2">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">Orchestrator</label>
                        <input
                            type="text"
                            value={ctx.forenpc || ''}
                            onChange={(e) => handleFieldChange('forenpc', e.target.value)}
                            className="w-full theme-input text-sm"
                            placeholder="Agent that coordinates the team"
                        />
                    </div>
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">Default Model</label>
                        <input
                            type="text"
                            list="model-suggestions"
                            value={ctx.model || ''}
                            onChange={(e) => handleFieldChange('model', e.target.value)}
                            className="w-full theme-input text-sm"
                            placeholder=""
                        />
                        <datalist id="model-suggestions">
                            {Array.from(new Set([
                                ...getProviders().flatMap(p => [...(p.models || []), p.model]),
                                'llama3', 'llama3.1', 'llama3.2', 'gpt-4o', 'gpt-4o-mini',
                                'claude-3-5-sonnet', 'claude-sonnet-4', 'gemini-2.5-pro',
                                'gemini-2.5-flash', 'nomic-text-embed'
                            ].filter(Boolean))).map(m => <option key={m} value={m} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">Default Provider</label>
                        <input
                            type="text"
                            list="provider-suggestions"
                            value={ctx.provider || ''}
                            onChange={(e) => handleFieldChange('provider', e.target.value)}
                            className="w-full theme-input text-sm"
                            placeholder=""
                        />
                        <datalist id="provider-suggestions">
                            {Array.from(new Set([
                                ...getProviders().map(p => p.provider_type),
                                'ollama', 'openai', 'anthropic', 'gemini', 'lmstudio',
                                'llamacpp', 'transformers', 'lora', 'airllm', 'enpisi', 'deepseek'
                            ].filter(Boolean))).map(p => <option key={p} value={p} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">API URL</label>
                        <input
                            type="text"
                            value={ctx.api_url || ''}
                            onChange={(e) => handleFieldChange('api_url', e.target.value)}
                            className="w-full theme-input text-sm"
                            placeholder=""
                        />
                    </div>
                </div>

                
                <div>
                    <label className="block text-sm theme-text-secondary mb-1">General Context</label>
                    <AutosizeTextarea
                        value={ctx.context || ''}
                        onChange={(e) => handleFieldChange('context', e.target.value)}
                        className="w-full theme-input min-h-[96px] resize-y text-sm"
                        placeholder="A brief description of this project or team's purpose."
                    />
                </div>

                
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm theme-text-primary font-semibold">Allowed Providers & Models</h4>
                        <button
                            onClick={addProvider}
                            className="text-sm theme-button-subtle flex items-center gap-1 px-2 py-1 rounded"
                        >
                            <Plus size={14} /> Add Provider
                        </button>
                    </div>
                    {providers.length === 0 && (
                        <p className="text-xs theme-text-muted italic">No providers configured. Agents will use the default model/provider above.</p>
                    )}
                    {providers.map((prov, idx) => (
                        <div key={idx} className="p-3 bg-gray-900/50 rounded border theme-border space-y-2">
                            
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                <input
                                    type="text"
                                    value={prov.name || ''}
                                    onChange={e => updateProvider(idx, 'name', e.target.value)}
                                    className="theme-input text-sm"
                                    placeholder="Provider name"
                                />
                                <input
                                    type="text"
                                    value={prov.provider_type || ''}
                                    onChange={e => updateProvider(idx, 'provider_type', e.target.value)}
                                    className="theme-input text-sm"
                                    placeholder="Provider type"
                                />
                                <input
                                    type="text"
                                    value={prov.api_url || ''}
                                    onChange={e => updateProvider(idx, 'api_url', e.target.value)}
                                    className="theme-input text-sm"
                                    placeholder="API URL"
                                />
                                <input
                                    type="password"
                                    value={prov.api_key || ''}
                                    onChange={e => updateProvider(idx, 'api_key', e.target.value)}
                                    className="theme-input text-sm"
                                    placeholder="API Key"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={prov.model || ''}
                                        onChange={e => updateProvider(idx, 'model', e.target.value)}
                                        className="flex-1 theme-input text-sm"
                                        placeholder="Default model"
                                    />
                                    <button
                                        onClick={() => removeProvider(idx)}
                                        className="p-2 rounded hover:bg-red-900/50 text-red-400 hover:text-red-300 flex-shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs theme-text-muted">Allowed Models</label>
                                    <button
                                        onClick={() => providerScan[idx]?.open ? closeProviderScan(idx) : scanProviderModels(idx)}
                                        disabled={providerScan[idx]?.loading}
                                        className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-700/50 hover:bg-cyan-700 text-cyan-100 disabled:opacity-40"
                                    >
                                        <RefreshCw size={10} className={providerScan[idx]?.loading ? 'animate-spin' : ''} />
                                        {providerScan[idx]?.loading ? 'Scanning...' : 'Scan'}
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(prov.models || []).map((m, mIdx) => (
                                        <span key={`${m}-${mIdx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border theme-border text-xs theme-text-primary">
                                            {m}
                                            <button
                                                onClick={() => removeProviderModel(idx, mIdx)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </span>
                                    ))}
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            placeholder="Add model..."
                                            className="w-32 theme-input text-xs px-2 py-1 rounded"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    addProviderModel(idx, e.currentTarget.value);
                                                    e.currentTarget.value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                {providerScan[idx]?.open && (
                                    <div className="mt-2 border theme-border rounded bg-black/20 p-2 space-y-1">
                                        {providerScan[idx]?.loading ? (
                                            <p className="text-[10px] theme-text-muted animate-pulse">Discovering models for {prov.provider_type || prov.name}...</p>
                                        ) : providerScan[idx]?.error ? (
                                            <p className="text-[10px] text-red-400">{providerScan[idx].error}</p>
                                        ) : (providerScan[idx]?.models || []).length === 0 ? (
                                            <p className="text-[10px] theme-text-muted">No models discovered. Make sure the provider is running or API key is set.</p>
                                        ) : (
                                            <div className="max-h-32 overflow-y-auto space-y-1">
                                                <p className="text-[10px] theme-text-muted">Click a model to add it:</p>
                                                {providerScan[idx].models.map((m) => (
                                                    <button
                                                        key={m}
                                                        onClick={() => {
                                                            addProviderModel(idx, m);
                                                            closeProviderScan(idx);
                                                        }}
                                                        disabled={(prov.models || []).includes(m)}
                                                        className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-700 theme-text-primary disabled:opacity-40 disabled:cursor-not-allowed truncate"
                                                    >
                                                        {(prov.models || []).includes(m) ? `${m} ✓` : m}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                
                {renderJinxDropdown()}


                {renderMcpDropdown()}

                {renderDatabasesSection()}
            </div>
        );
    };

    if (!isOpen && !embedded) return null;

    const content = (
        <>
            <div className="flex-1 overflow-y-auto">
                {isLoading ? <p className="text-center theme-text-muted">Loading...</p> : error ? <p className="text-red-500">{error}</p> : (
                    renderForm()
                )}
            </div>

            <div className="border-t theme-border pt-4 mt-4 flex justify-end">
                <button onClick={handleSave} className="theme-button-primary flex items-center gap-2 px-4 py-2 rounded text-sm" disabled={isLoading}>
                    <Save size={16} />
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </>
    );

    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl w-full max-w-5xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 flex justify-between items-center border-b theme-border flex-shrink-0">
                    <h3 className="text-lg flex items-center gap-2 theme-text-primary">
                        <FileJson className="text-blue-400" />
                        {ctxFileName ? ctxFileName.replace(/\.ctx$/, '') : 'Team'} <span className="text-blue-400">.ctx</span>
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full theme-hover">
                        <X size={20} />
                    </button>
                </header>
                <main className="p-6 flex-grow overflow-hidden">
                    {content}
                </main>
            </div>
        </div>
    );
};

export default CtxEditor;
