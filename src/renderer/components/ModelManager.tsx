import React, { useState, useEffect, useRef, useMemo } from "react";
import { DownloadCloud, Trash2, MessageSquare, Send, X, ChevronRight, RefreshCw, Plus, Globe } from "lucide-react";
import { Card, Button, Input } from "npcts";

const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.toLowerCase().includes('mac');

const LOCAL_PROVIDERS: Record<string, any> = {
    gguf: { name: 'GGUF/GGML', description: 'Direct model files (no server)', defaultPort: null, docsUrl: 'https://huggingface.co/docs/hub/gguf', color: 'text-orange-400', bgColor: 'bg-orange-600', local: true },
    llamacpp: { name: 'llama.cpp Server', description: 'C++ inference server', defaultPort: 8080, docsUrl: 'https://github.com/ggerganov/llama.cpp', color: 'text-green-400', bgColor: 'bg-green-600', local: true },
    lmstudio: { name: 'LM Studio', description: 'Desktop local LLM runner', defaultPort: 1234, docsUrl: 'https://lmstudio.ai', color: 'text-purple-400', bgColor: 'bg-purple-600', local: true },
    ollama: { name: 'Ollama', description: 'Local LLM server', defaultPort: 11434, docsUrl: 'https://ollama.ai', color: 'text-blue-400', bgColor: 'bg-blue-600', local: true },
    ...(isMac ? { omlx: { name: 'OMLX', description: 'Apple Silicon optimized', defaultPort: 8000, docsUrl: 'https://github.com/jundot/omlx', color: 'text-pink-400', bgColor: 'bg-pink-600', local: true } } : {}),
};

const API_PROVIDER_META: Record<string, { name: string; color: string; bgColor: string; docsUrl: string }> = {
    anthropic: { name: 'Anthropic', color: 'text-amber-400', bgColor: 'bg-amber-600', docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models' },
    deepseek: { name: 'DeepSeek', color: 'text-cyan-400', bgColor: 'bg-cyan-600', docsUrl: 'https://api-docs.deepseek.com/' },
    gemini: { name: 'Gemini', color: 'text-blue-400', bgColor: 'bg-blue-600', docsUrl: 'https://ai.google.dev/gemini-api/docs/models' },
    groq: { name: 'Groq', color: 'text-orange-400', bgColor: 'bg-orange-600', docsUrl: 'https://console.groq.com/docs/models' },
    mistral: { name: 'Mistral', color: 'text-indigo-400', bgColor: 'bg-indigo-600', docsUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/' },
    openai: { name: 'OpenAI', color: 'text-green-400', bgColor: 'bg-green-600', docsUrl: 'https://platform.openai.com/docs/models' },
    openrouter: { name: 'OpenRouter', color: 'text-violet-400', bgColor: 'bg-violet-600', docsUrl: 'https://openrouter.ai/models' },
    perplexity: { name: 'Perplexity', color: 'text-sky-400', bgColor: 'bg-sky-600', docsUrl: 'https://docs.perplexity.ai/' },
    together: { name: 'Together', color: 'text-teal-400', bgColor: 'bg-teal-600', docsUrl: 'https://docs.together.ai/docs/models' },
    xai: { name: 'xAI', color: 'text-gray-300', bgColor: 'bg-gray-600', docsUrl: 'https://docs.x.ai/' },
};

const ModelList = ({ models, activeProvider, isDeleting, onDelete, onStartChat }: any) => {
    if (!models.length) return <p className="text-gray-500 text-center py-3 text-xs">No models found</p>;

    return (
        <div className="overflow-y-auto max-h-48 border border-gray-700 rounded divide-y divide-gray-700/50">
            {models.map((model: any, idx: number) => {
                const name = model.name || model.id || model.filename || model;
                const source = model.source || model.provider || '';
                const modelPath = model.path || '';
                const isLocal = LOCAL_PROVIDERS[activeProvider];
                const key = model.path || model.id || `${name}-${idx}`;
                return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800/50 group">
                        <span className="text-xs text-white truncate flex-1 font-mono">{name}</span>
                        {source && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 flex-shrink-0">{source}</span>}
                        {model.size > 0 && <span className="text-[10px] text-gray-500 flex-shrink-0">{(model.size / 1e9).toFixed(1)}GB</span>}
                        <>
                            <button onClick={() => {
                                const chatProvider = activeProvider === 'gguf' || activeProvider === 'ggml' ? 'llamacpp' : activeProvider;
                                onStartChat?.(modelPath || name, chatProvider);
                            }}
                                className="p-0.5 text-gray-500 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" title="New chat">
                                <MessageSquare size={11} />
                            </button>
                            {isLocal && activeProvider === 'ollama' && (
                                <button onClick={() => onDelete(name)} disabled={isDeleting === name}
                                    className="p-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30">
                                    {isDeleting === name ? '…' : <Trash2 size={11} />}
                                </button>
                            )}
                        </>
                    </div>
                );
            })}
        </div>
    );
};

const ModelManager = ({ onStartChat }: { onStartChat?: (model: string, provider: string) => void } = {}) => {
    // Local provider state
    const [providerStatuses, setProviderStatuses] = useState<Record<string, string>>({
        gguf: 'ready', llamacpp: 'checking', lmstudio: 'checking',
        ollama: 'checking', ...(isMac ? { omlx: 'checking' } : {})
    });
    const [providerModels, setProviderModels] = useState<Record<string, any[]>>({
        gguf: [], llamacpp: [], lmstudio: [], ollama: [],
        ...(isMac ? { omlx: [] } : {})
    });
    const [ggufDirectory, setGgufDirectory] = useState('');
    const [scannedDirectories, setScannedDirectories] = useState<string[]>([]);
    const [pullModelName, setPullModelName] = useState('qwen3.5:4b');
    const [pullProgress, setPullProgress] = useState<any>(null);
    const [isPulling, setIsPulling] = useState(false);
    const [isDeleting, setIsDeleting] = useState<any>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [hfModelUrl, setHfModelUrl] = useState('');
    const [hfDownloadProgress, setHfDownloadProgress] = useState<any>(null);
    const [isDownloadingHf, setIsDownloadingHf] = useState(false);
    const [hfSearchQuery, setHfSearchQuery] = useState('');
    const [hfSearchResults, setHfSearchResults] = useState<any[]>([]);
    const [isSearchingHf, setIsSearchingHf] = useState(false);
    const [selectedHfRepo, setSelectedHfRepo] = useState<any>(null);
    const [hfRepoFiles, setHfRepoFiles] = useState<any[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

    // API provider state
    const [detectedProviders, setDetectedProviders] = useState<any[]>([]);
    const [customProviders, setCustomProviders] = useState<Record<string, any>>({});
    const [apiModels, setApiModels] = useState<Record<string, any[]>>({});
    const [apiLoading, setApiLoading] = useState<Record<string, boolean>>({});
    const [apiErrors, setApiErrors] = useState<Record<string, string>>({});
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [showAddProvider, setShowAddProvider] = useState(false);
    const [newProviderName, setNewProviderName] = useState('');
    const [newProviderUrl, setNewProviderUrl] = useState('');
    const [newProviderKeyVar, setNewProviderKeyVar] = useState('');

    const fetchModelsForProvider = async (provider: string) => {
        if (provider === 'ollama') {
            const result = await window.api.getLocalOllamaModels();
            if (result && !result.error) setProviderModels(prev => ({ ...prev, ollama: result.models || [] }));
        } else if (provider === 'gguf') {
            const result = await window.api.scanGgufModels?.(ggufDirectory || null);
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, gguf: result.models || [] }));
                if (result.scannedDirectories) setScannedDirectories(result.scannedDirectories);
            }
        } else {
            const result = await window.api.scanLocalModels?.(provider);
            if (result && !result.error) setProviderModels(prev => ({ ...prev, [provider]: result.models || [] }));
        }
    };

    const fetchApiModels = async (providerKey: string, baseUrl: string, apiKeyVar: string) => {
        setApiLoading(prev => ({ ...prev, [providerKey]: true }));
        setApiErrors(prev => ({ ...prev, [providerKey]: '' }));
        try {
            const result = await (window as any).api.getProviderModels({ provider: providerKey, baseUrl, apiKeyVar });
            if (result.error) {
                setApiErrors(prev => ({ ...prev, [providerKey]: result.error }));
                setApiModels(prev => ({ ...prev, [providerKey]: [] }));
            } else {
                setApiModels(prev => ({ ...prev, [providerKey]: result.models || [] }));
            }
        } catch (err: any) {
            setApiErrors(prev => ({ ...prev, [providerKey]: err.message || 'Failed to fetch' }));
        } finally {
            setApiLoading(prev => ({ ...prev, [providerKey]: false }));
        }
    };

    const checkAllStatuses = async () => {
        const ollamaStatus = await window.api.checkOllamaStatus();
        const ollamaStatusStr = ollamaStatus?.running ? 'running' : (ollamaStatus?.installed === false ? 'not_found' : 'not_running');
        setProviderStatuses(prev => ({ ...prev, ollama: ollamaStatusStr }));
        if (ollamaStatusStr === 'running') fetchModelsForProvider('ollama');

        let llamacppStatus: string = 'not_found';
        for (const provider of ['lmstudio', 'llamacpp', ...(isMac ? ['omlx'] : [])]) {
            try {
                const status = await window.api.getLocalModelStatus?.(provider);
                const s = status?.running ? 'running' : (status?.installed ? 'not_running' : 'not_found');
                if (provider === 'llamacpp') llamacppStatus = s;
                setProviderStatuses(prev => ({ ...prev, [provider]: s }));
                if (status?.running) fetchModelsForProvider(provider);
            } catch {
                if (provider === 'llamacpp') llamacppStatus = 'not_found';
                setProviderStatuses(prev => ({ ...prev, [provider]: 'not_found' }));
            }
        }
        setProviderStatuses(prev => ({ ...prev, gguf: 'ready' }));
    };

    const loadApiProviders = async () => {
        try {
            const detected = await (window as any).api?.detectProviderKeys?.();
            if (Array.isArray(detected)) setDetectedProviders(detected);
        } catch {}
        try {
            const cpData = await (window as any).api.customProvidersRead();
            if (cpData?.providers) setCustomProviders(cpData.providers);
        } catch {}
    };

    const handleAddCustomProvider = async () => {
        if (!newProviderName.trim() || !newProviderUrl.trim()) return;
        const updated = {
            ...customProviders,
            [newProviderName.toLowerCase()]: {
                base_url: newProviderUrl,
                api_key_var: newProviderKeyVar || `${newProviderName.toUpperCase()}_API_KEY`,
            },
        };
        await (window as any).api.customProvidersWrite(updated);
        setCustomProviders(updated);
        setNewProviderName(''); setNewProviderUrl(''); setNewProviderKeyVar('');
        setShowAddProvider(false);
        loadApiProviders();
    };

    const toggleExpand = (key: string) => {
        setExpanded(prev => {
            const next = !prev[key];
            // Auto-fetch models on first expand
            if (next && !providerModels[key] && !apiModels[key] && !apiLoading[key]) {
                const local = LOCAL_PROVIDERS[key];
                if (local) {
                    fetchModelsForProvider(key);
                } else {
                    const p = allProviders.find(a => a.key === key);
                    if (p && p.baseUrl) fetchApiModels(key, p.baseUrl, p.apiKeyVar);
                }
            }
            return { ...prev, [key]: next };
        });
    };

    useEffect(() => {
        checkAllStatuses();
        loadApiProviders();
        const cleanupProgress = window.api.onOllamaPullProgress((progress: any) => setPullProgress(progress));
        const cleanupComplete = window.api.onOllamaPullComplete(() => {
            setIsPulling(false);
            setPullProgress({ status: 'Success!', details: 'Model installed.' });
            setTimeout(() => { setPullProgress(null); setPullModelName(''); fetchModelsForProvider('ollama'); }, 2000);
        });
        const cleanupError = window.api.onOllamaPullError((error: any) => { setIsPulling(false); setPullProgress({ status: 'Error', details: error }); });
        return () => { cleanupProgress(); cleanupComplete(); cleanupError(); };
    }, []);

    // Build unified provider list: local first, then detected API, then custom
    const allProviders = useMemo(() => {
        const seen = new Set<string>();
        const list: Array<{ key: string; name: string; baseUrl: string; apiKeyVar: string; local: boolean; custom?: boolean; color: string; bgColor: string; description?: string; docsUrl?: string; defaultPort?: number | null }> = [];

        // Local providers
        for (const [key, info] of Object.entries(LOCAL_PROVIDERS)) {
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({ key, name: info.name, baseUrl: '', apiKeyVar: '', local: true, color: info.color, bgColor: info.bgColor, description: info.description, docsUrl: info.docsUrl, defaultPort: info.defaultPort });
        }

        // Detected API providers from env
        for (const d of detectedProviders) {
            if (seen.has(d.provider)) continue;
            seen.add(d.provider);
            const meta = API_PROVIDER_META[d.provider];
            list.push({
                key: d.provider,
                name: meta?.name || d.provider.charAt(0).toUpperCase() + d.provider.slice(1),
                baseUrl: d.baseUrl,
                apiKeyVar: d.envVar,
                local: false,
                custom: d.custom,
                color: meta?.color || 'text-cyan-400',
                bgColor: meta?.bgColor || 'bg-cyan-600',
                docsUrl: meta?.docsUrl,
            });
        }

        // Custom providers from YAML — only show if the API key exists in environment
        const detectedEnvVars = new Set(detectedProviders.map(d => d.envVar));
        for (const [name, config] of Object.entries(customProviders)) {
            if (seen.has(name)) continue;
            const apiKeyVar = (config as any).api_key_var || `${name.toUpperCase()}_API_KEY`;
            if (!detectedEnvVars.has(apiKeyVar)) continue;
            seen.add(name);
            list.push({
                key: name,
                name: name.charAt(0).toUpperCase() + name.slice(1),
                baseUrl: (config as any).base_url || '',
                apiKeyVar,
                local: false,
                custom: true,
                color: 'text-cyan-400',
                bgColor: 'bg-cyan-600',
            });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [detectedProviders, customProviders]);

    const handlePullModel = async () => {
        if (!pullModelName.trim() || isPulling) return;
        setIsPulling(true);
        setPullProgress({ status: 'Starting download...' });
        await window.api.pullOllamaModel({ model: pullModelName });
    };

    const handleDeleteModel = async (modelName: string) => {
        if (isDeleting) return;
        setIsDeleting(modelName);
        await window.api.deleteOllamaModel({ model: modelName });
        fetchModelsForProvider('ollama');
        setIsDeleting(null);
    };

    const handleScanModels = async () => { setIsScanning(true); await fetchModelsForProvider('ollama' /* use currently expanded local */); setIsScanning(false); };

    const handleSearchHf = async () => {
        if (!hfSearchQuery.trim() || isSearchingHf) return;
        setIsSearchingHf(true); setSelectedHfRepo(null); setHfRepoFiles([]);
        try {
            const result = await (window as any).api.searchHfModels?.({ query: hfSearchQuery, limit: 20 });
            setHfSearchResults(result?.error ? [] : (result?.models || []));
        } catch { setHfSearchResults([]); }
        finally { setIsSearchingHf(false); }
    };

    const handleSelectHfRepo = async (repoId: string) => {
        setSelectedHfRepo(repoId); setIsLoadingFiles(true);
        try {
            const result = await (window as any).api.listHfFiles?.({ repoId });
            setHfRepoFiles(result?.error ? [] : (result?.files || []));
        } catch { setHfRepoFiles([]); }
        finally { setIsLoadingFiles(false); }
    };

    const statusColor = (s: string) => s === 'running' || s === 'ready' ? 'bg-green-400' : s === 'checking' ? 'bg-yellow-400 animate-pulse' : s === 'not_running' ? 'bg-yellow-600' : 'bg-red-400';
    const statusLabel = (s: string) => s === 'running' ? 'Running' : s === 'ready' ? 'Ready' : s === 'checking' ? 'Checking...' : s === 'not_running' ? 'Not Running' : 'Not Found';

    return (
        <div className="space-y-3 h-full overflow-y-auto">
            {/* Add custom provider */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold theme-text-secondary">All Providers</h4>
                <button onClick={() => setShowAddProvider(!showAddProvider)}
                    className="text-[10px] px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white flex items-center gap-1">
                    <Plus size={10} /> Add Provider
                </button>
            </div>

            {showAddProvider && (
                <div className="theme-bg-tertiary p-3 rounded-lg border theme-border space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] theme-text-muted block mb-0.5">Name</label>
                            <input value={newProviderName} onChange={e => setNewProviderName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                placeholder="myllm" className="w-full theme-input text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] theme-text-muted block mb-0.5">Base URL</label>
                            <input value={newProviderUrl} onChange={e => setNewProviderUrl(e.target.value)}
                                placeholder="https://api.example.com/v1" className="w-full theme-input text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] theme-text-muted block mb-0.5">API Key Env Var</label>
                            <input value={newProviderKeyVar} onChange={e => setNewProviderKeyVar(e.target.value)}
                                placeholder="MYLLM_API_KEY" className="w-full theme-input text-xs" />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowAddProvider(false)} className="text-xs px-2 py-1 theme-text-muted hover:theme-text-primary">Cancel</button>
                        <button onClick={handleAddCustomProvider} disabled={!newProviderName.trim() || !newProviderUrl.trim()}
                            className="text-xs px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40">Save</button>
                    </div>
                </div>
            )}

            {/* Provider list */}
            {allProviders.map(p => {
                const isExpanded = expanded[p.key];
                const isLocal = p.local;
                const status = isLocal ? providerStatuses[p.key] : undefined;
                const models = isLocal ? (providerModels[p.key] || []) : (apiModels[p.key] || []);
                const error = isLocal ? undefined : apiErrors[p.key];
                const loading = isLocal ? false : apiLoading[p.key];

                return (
                    <div key={p.key} className="border theme-border rounded-lg overflow-hidden">
                        <button
                            onClick={() => toggleExpand(p.key)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                        >
                            <ChevronRight size={14} className={`theme-text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.bgColor}`} />
                            <span className={`text-sm font-medium flex-1 ${p.color}`}>{p.name}</span>
                            {p.custom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">custom</span>}
                            {p.apiKeyVar && <span className="text-[9px] theme-text-muted font-mono">{p.apiKeyVar}</span>}
                            {isLocal && <span className={`text-[9px] px-1.5 py-0.5 rounded ${status === 'running' || status === 'ready' ? 'bg-green-900/50 text-green-300' : status === 'not_running' ? 'bg-yellow-900/50 text-yellow-300' : status === 'checking' ? 'bg-yellow-900/50 text-yellow-300 animate-pulse' : 'bg-red-900/50 text-red-300'}`}>{statusLabel(status || '')}</span>}
                            {models.length > 0 && <span className="text-[10px] theme-text-muted">{models.length}</span>}
                            {loading && <span className="text-[10px] theme-text-muted animate-pulse">loading</span>}
                        </button>

                        {isExpanded && (
                            <div className="border-t theme-border bg-black/10 px-3 py-2 space-y-2">
                                {/* Local provider controls */}
                                {isLocal && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] theme-text-muted">{p.description}</p>
                                            <div className="flex items-center gap-1">
                                                {p.defaultPort && <span className="text-[9px] theme-text-muted">Port {p.defaultPort}</span>}
                                                {status === 'not_running' && p.key !== 'gguf' && (
                                                    <button onClick={async () => {
                                                        setProviderStatuses(prev => ({ ...prev, [p.key]: 'checking' }));
                                                        const res = await (window as any).api.startLocalProvider?.(p.key);
                                                        if (res && !res.success) alert(res.error || 'Failed to start');
                                                        setTimeout(() => checkAllStatuses(), 1500);
                                                    }} className="text-[10px] px-1.5 py-0.5 rounded bg-green-700 hover:bg-green-600 text-white">Start</button>
                                                )}
                                                {status === 'running' && p.key !== 'gguf' && (
                                                    <button onClick={async () => {
                                                        const res = await (window as any).api.stopLocalProvider?.(p.key);
                                                        if (res && !res.success) alert(res.error || 'Failed to stop');
                                                        setTimeout(() => checkAllStatuses(), 1000);
                                                    }} className="text-[10px] px-1.5 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white">Stop</button>
                                                )}
                                                {p.docsUrl && <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-cyan-400 hover:text-cyan-300">Docs</a>}
                                            </div>
                                        </div>

                                        {/* Ollama pull */}
                                        {p.key === 'ollama' && status === 'running' && (
                                            <div className="flex gap-1.5">
                                                <input value={pullModelName} onChange={e => setPullModelName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handlePullModel()}
                                                    placeholder="model name" disabled={isPulling}
                                                    className="flex-1 theme-input text-xs" />
                                                <button onClick={handlePullModel} disabled={isPulling || !pullModelName.trim()}
                                                    className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">
                                                    {isPulling ? 'Pulling...' : 'Pull'}
                                                </button>
                                            </div>
                                        )}
                                        {isPulling && pullProgress && p.key === 'ollama' && (
                                            <div className="text-xs theme-text-muted">
                                                <span className="font-medium">{pullProgress.status}</span>
                                                {pullProgress.details && <span className="ml-1 font-mono">{pullProgress.details}</span>}
                                                {pullProgress.percent && (
                                                    <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1">
                                                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pullProgress.percent}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* GGUF section */}
                                        {p.key === 'gguf' && (
                                            <div className="space-y-2">
                                                <div className="flex gap-1.5">
                                                    <button onClick={async () => {
                                                        const result = await window.api.browseGgufFile?.();
                                                        if (result?.success && result.model) {
                                                            setProviderModels(prev => ({ ...prev, gguf: [...(prev.gguf || []).filter(m => m.path !== result.model.path), result.model] }));
                                                        }
                                                    }} className="text-[10px] px-2 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white">Browse GGUF File...</button>
                                                    <button onClick={() => fetchModelsForProvider('gguf')} disabled={isScanning}
                                                        className="text-[10px] px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40">
                                                        {isScanning ? 'Scanning...' : 'Scan'}
                                                    </button>
                                                </div>
                                                <details className="text-[10px]">
                                                    <summary className="theme-text-muted cursor-pointer">Search HuggingFace for GGUF models</summary>
                                                    <div className="flex gap-1.5 mt-1.5">
                                                        <input value={hfSearchQuery} onChange={e => setHfSearchQuery(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && handleSearchHf()}
                                                            placeholder="Search: llama, qwen, phi..." className="flex-1 theme-input text-[10px]" />
                                                        <button onClick={handleSearchHf} disabled={isSearchingHf || !hfSearchQuery.trim()}
                                                            className="text-[10px] px-2 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40">
                                                            {isSearchingHf ? '...' : 'Search'}
                                                        </button>
                                                    </div>
                                                    {hfSearchResults.length > 0 && (
                                                        <div className="max-h-32 overflow-y-auto mt-1 border border-gray-700 rounded p-1">
                                                            {hfSearchResults.map((repo: any) => (
                                                                <button key={repo.id} onClick={() => handleSelectHfRepo(repo.id)}
                                                                    className={`w-full text-left px-1.5 py-1 rounded text-[10px] ${selectedHfRepo === repo.id ? 'bg-orange-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
                                                                    {repo.id} <span className="text-gray-500">↓{repo.downloads?.toLocaleString()}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </details>
                                                {hfDownloadProgress && (
                                                    <div className="text-[10px] theme-text-muted">
                                                        <span className="font-medium">{hfDownloadProgress.status}</span>
                                                        {hfDownloadProgress.details && <span className="ml-1 font-mono">{hfDownloadProgress.details}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* API provider controls */}
                                {!isLocal && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] theme-text-muted truncate max-w-[70%]">{p.baseUrl}</span>
                                        <button onClick={() => fetchApiModels(p.key, p.baseUrl, p.apiKeyVar)} disabled={loading}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 theme-text-primary flex items-center gap-1 disabled:opacity-40">
                                            <RefreshCw size={9} /> Refresh
                                        </button>
                                    </div>
                                )}

                                {error && <p className="text-[10px] text-red-400">{error}</p>}

                                {/* Models list */}
                                {models.length > 0 ? (
                                    <ModelList models={models} activeProvider={p.key} isDeleting={isDeleting} onDelete={handleDeleteModel} onStartChat={onStartChat} />
                                ) : !loading && !error && (
                                    <p className="text-[10px] theme-text-muted text-center py-2">
                                        {isLocal ? (status === 'running' ? 'No models found. Try scanning.' : 'Provider not running.') : 'Click Refresh to load models.'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {allProviders.length === 0 && (
                <div className="text-center py-8 theme-text-muted text-sm">
                    <Globe size={24} className="mx-auto mb-2 opacity-50" />
                    <p>No providers detected.</p>
                    <p className="text-xs mt-1">Set API keys in your shell config or add a custom provider above.</p>
                </div>
            )}
        </div>
    );
};

export default ModelManager;