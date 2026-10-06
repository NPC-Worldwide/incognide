import React, { useState, useEffect, useCallback, useMemo } from 'react';
import yaml from 'js-yaml';
import { Plus, Trash2, Save, FileCode, LayoutList, AlertCircle, Check, ExternalLink } from 'lucide-react';

interface ProviderEntry {
    name: string;
    api_url?: string;
    api_key?: string;
    api_key_var?: string;
    models?: string[];
    [key: string]: any;
}

interface KnownProvider {
    provider: string;
    envVar: string;
    baseUrl: string;
    displayName: string;
    openAiCompatible?: boolean;
    authBaseUrl?: string;
    keyDashboardUrl?: string;
    [key: string]: any;
}

interface UserModelsConfig {
    providers: ProviderEntry[];
}

const DEFAULT_CONFIG: UserModelsConfig = { providers: [] };

const knownProviderDefaults: Record<string, { api_url: string; api_key_var: string }> = {
    openai: { api_url: 'https://api.openai.com/v1', api_key_var: 'OPENAI_API_KEY' },
    anthropic: { api_url: 'https://api.anthropic.com/v1', api_key_var: 'ANTHROPIC_API_KEY' },
    gemini: { api_url: 'https://generativelanguage.googleapis.com/v1beta', api_key_var: 'GEMINI_API_KEY' },
    deepseek: { api_url: 'https://api.deepseek.com/v1', api_key_var: 'DEEPSEEK_API_KEY' },
    moonshot: { api_url: 'https://api.moonshot.cn/v1', api_key_var: 'MOONSHOT_API_KEY' },
    perplexity: { api_url: 'https://api.perplexity.ai', api_key_var: 'PERPLEXITY_API_KEY' },
    openrouter: { api_url: 'https://openrouter.ai/api/v1', api_key_var: 'OPENROUTER_API_KEY' },
    orcarouter: { api_url: 'https://api.orcarouter.ai/v1', api_key_var: 'ORCAROUTER_API_KEY' },
    groq: { api_url: 'https://api.groq.com/openai/v1', api_key_var: 'GROQ_API_KEY' },
    mistral: { api_url: 'https://api.mistral.ai/v1', api_key_var: 'MISTRAL_API_KEY' },
    together: { api_url: 'https://api.together.xyz/v1', api_key_var: 'TOGETHER_API_KEY' },
    xai: { api_url: 'https://api.x.ai/v1', api_key_var: 'XAI_API_KEY' },
    ollama: { api_url: 'http://localhost:11434', api_key_var: 'OLLAMA_API_KEY' },
    lmstudio: { api_url: 'http://localhost:1234/v1', api_key_var: 'LMSTUDIO_API_KEY' },
    llamacpp: { api_url: 'http://localhost:8080/v1', api_key_var: 'LLAMACPP_API_KEY' },
};

const loadKnownProviders = async (): Promise<KnownProvider[]> => {
    try {
        const res = await (window as any).api.getKnownProviders?.();
        return Array.isArray(res) ? res : [];
    } catch {
        return [];
    }
};

const loadConfig = async (): Promise<{ config: UserModelsConfig; raw: string; path: string }> => {
    const homeDir = await (window as any).api.getHomeDir();
    const filePath = `${homeDir}/.incognide/models.yaml`;
    const result = await (window as any).api.readFileContent(filePath);
    const raw = typeof result === 'string' ? result : result?.content || '';
    let config = DEFAULT_CONFIG;
    try {
        const parsed = raw ? yaml.load(raw) || {} : {};
        config = { providers: Array.isArray(parsed.providers) ? parsed.providers : [] };
    } catch {}
    return { config, raw, path: filePath };
};

const saveConfig = async (filePath: string, config: UserModelsConfig): Promise<void> => {
    const cleanProviders = config.providers.map(p => {
        const next: ProviderEntry = {
            name: p.name,
            ...(p.api_url ? { api_url: p.api_url } : {}),
            ...(p.api_key ? { api_key: p.api_key } : {}),
            ...(p.api_key_var ? { api_key_var: p.api_key_var } : {}),
            ...(Array.isArray(p.models) && p.models.length > 0 ? { models: p.models } : {}),
        };
        return next;
    });
    const content = yaml.dump({ providers: cleanProviders }, { lineWidth: -1, sortKeys: false });
    const res = await (window as any).api.writeFileContent(filePath, content);
    if (res?.error) throw new Error(res.error);
};

export const UserModelsEditor: React.FC<{ onSaved?: () => void; onOpenRaw?: (path: string) => void }> = ({ onSaved, onOpenRaw }) => {
    const [filePath, setFilePath] = useState('');
    const [config, setConfig] = useState<UserModelsConfig>(DEFAULT_CONFIG);
    const [raw, setRaw] = useState('');
    const [mode, setMode] = useState<'form' | 'raw'>('form');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [knownProviders, setKnownProviders] = useState<KnownProvider[]>([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([loadConfig(), loadKnownProviders()]).then(([{ config, raw, path }, known]) => {
            if (cancelled) return;
            setConfig(config);
            setRaw(raw);
            setFilePath(path);
            setKnownProviders(known);
            setDirty(false);
            setError(null);
        }).catch((err: any) => {
            if (!cancelled) setError(err.message || 'Failed to load models.yaml');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (mode === 'form') {
            const nextRaw = yaml.dump({ providers: config.providers }, { lineWidth: -1, sortKeys: false });
            if (nextRaw !== raw && !loading) {
                setDirty(true);
            }
        }
    }, [config, raw, mode, loading]);

    useEffect(() => {
        if (mode === 'raw') {
            setDirty(true);
        }
    }, [raw, mode]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            let nextConfig: UserModelsConfig;
            if (mode === 'raw') {
                const parsed = yaml.load(raw) || {};
                nextConfig = { providers: Array.isArray(parsed.providers) ? parsed.providers : [] };
            } else {
                nextConfig = config;
            }
            await saveConfig(filePath, nextConfig);
            setConfig(nextConfig);
            setRaw(yaml.dump({ providers: nextConfig.providers }, { lineWidth: -1, sortKeys: false }));
            setDirty(false);
            setSaved(true);
            onSaved?.();
            setTimeout(() => setSaved(false), 1500);
        } catch (err: any) {
            setError(err.message || 'Failed to save models.yaml');
        } finally {
            setSaving(false);
        }
    }, [config, filePath, mode, raw, onSaved]);

    const updateProvider = useCallback((idx: number, patch: Partial<ProviderEntry>) => {
        setConfig(prev => {
            const next = { ...prev, providers: [...prev.providers] };
            next.providers[idx] = { ...next.providers[idx], ...patch };
            return next;
        });
    }, []);

    const removeProvider = useCallback((idx: number, name: string) => {
        if (!window.confirm(`Are you sure you want to remove the ${name} provider?`)) return;
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.filter((_, i) => i !== idx),
        }));
    }, []);

    const addProvider = useCallback(() => {
        setConfig(prev => ({
            ...prev,
            providers: [...prev.providers, { name: 'newprovider', api_url: '', models: [] }],
        }));
    }, []);

    const addKnownProvider = useCallback((key: string) => {
        const defaults = knownProviderDefaults[key];
        if (!defaults) return;
        const existing = config.providers.find(p => p.name === key);
        if (existing) return;
        setConfig(prev => ({
            ...prev,
            providers: [...prev.providers, { name: key, api_url: defaults.api_url, api_key_var: defaults.api_key_var, models: [] }],
        }));
    }, [config.providers]);

    const addModel = useCallback((providerIdx: number) => {
        setConfig(prev => {
            const next = { ...prev, providers: [...prev.providers] };
            const p = next.providers[providerIdx];
            next.providers[providerIdx] = {
                ...p,
                models: [...(p.models || []), ''],
            };
            return next;
        });
    }, []);

    const updateModel = useCallback((providerIdx: number, modelIdx: number, value: string) => {
        setConfig(prev => {
            const next = { ...prev, providers: [...prev.providers] };
            const p = next.providers[providerIdx];
            const models = [...(p.models || [])];
            models[modelIdx] = value;
            next.providers[providerIdx] = { ...p, models };
            return next;
        });
    }, []);

    const removeModel = useCallback((providerIdx: number, modelIdx: number, modelName: string) => {
        if (!window.confirm(`Are you sure you want to remove the model ${modelName}?`)) return;
        setConfig(prev => {
            const next = { ...prev, providers: [...prev.providers] };
            const p = next.providers[providerIdx];
            const models = (p.models || []).filter((_, i) => i !== modelIdx);
            next.providers[providerIdx] = { ...p, models };
            return next;
        });
    }, []);

    const providerList = useMemo(() => config.providers, [config]);
    const knownChips = useMemo(() => {
        return Object.entries(knownProviderDefaults)
            .filter(([key]) => !config.providers.some(p => p.name === key))
            .map(([key, info]) => ({ key, ...info }));
    }, [config.providers]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMode('form')}
                        className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors ${mode === 'form' ? 'bg-blue-600 text-white' : 'bg-white/5 theme-text-secondary hover:bg-white/10'}`}
                    >
                        <LayoutList size={10} /> Form
                    </button>
                    <button
                        onClick={() => setMode('raw')}
                        className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors ${mode === 'raw' ? 'bg-blue-600 text-white' : 'bg-white/5 theme-text-secondary hover:bg-white/10'}`}
                    >
                        <FileCode size={10} /> Raw YAML
                    </button>
                    <button
                        onClick={() => onOpenRaw?.(filePath)}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 theme-text-secondary hover:bg-white/10 flex items-center gap-1 transition-colors"
                        title="Open in text editor"
                    >
                        <ExternalLink size={10} /> Open file
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {dirty && <span className="text-[10px] text-yellow-400">unsaved</span>}
                    {saved && <span className="text-[10px] text-green-400 flex items-center gap-1"><Check size={10} /> saved</span>}
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="text-[10px] px-2 py-1 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white flex items-center gap-1 transition-colors"
                    >
                        <Save size={10} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-red-400 bg-red-500/10 border-b theme-border">
                    <AlertCircle size={12} />
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {loading && (
                    <div className="text-xs text-gray-500 text-center py-8">Loading models.yaml…</div>
                )}

                {!loading && mode === 'raw' && (
                    <textarea
                        value={raw}
                        onChange={e => setRaw(e.target.value)}
                        spellCheck={false}
                        className="w-full h-full min-h-[300px] theme-input font-mono text-xs p-3 resize-none focus:outline-none"
                    />
                )}

                {!loading && mode === 'form' && (
                    <div className="space-y-3">
                        {knownChips.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {knownChips.map(c => (
                                    <button
                                        key={c.key}
                                        onClick={() => addKnownProvider(c.key)}
                                        className="text-[10px] px-2 py-1 rounded bg-white/5 theme-text-secondary hover:bg-white/10 border theme-border transition-colors"
                                    >
                                        + {c.key}
                                    </button>
                                ))}
                            </div>
                        )}

                        {providerList.length === 0 && (
                            <div className="text-xs text-gray-500 text-center py-8">No providers in models.yaml.</div>
                        )}
                        {providerList.map((p, idx) => (
                            <div key={idx} className="theme-bg-secondary border theme-border rounded-lg p-3 space-y-2">
                                <div>
                                    <label className="text-[10px] theme-text-muted block mb-0.5">Name</label>
                                    <input
                                        value={p.name || ''}
                                        onChange={e => updateProvider(idx, { name: e.target.value })}
                                        className="w-full theme-input text-xs"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] theme-text-muted block mb-0.5">API URL</label>
                                        <input
                                            value={p.api_url || ''}
                                            onChange={e => updateProvider(idx, { api_url: e.target.value })}
                                            className="w-full theme-input text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] theme-text-muted block mb-0.5">API Key</label>
                                        <input
                                            type="password"
                                            value={p.api_key || ''}
                                            onChange={e => updateProvider(idx, { api_key: e.target.value })}
                                            className="w-full theme-input text-xs"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] theme-text-muted">Models</label>
                                        <button
                                            onClick={() => addModel(idx)}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 theme-text-secondary hover:bg-white/10 flex items-center gap-1"
                                        >
                                            <Plus size={10} /> Add model
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {(p.models || []).length === 0 && (
                                            <div className="text-[10px] text-gray-500 py-1">No models listed. The provider may still fetch models dynamically.</div>
                                        )}
                                        {(p.models || []).map((m, mIdx) => (
                                            <div key={mIdx} className="flex items-center gap-2">
                                                <input
                                                    value={m}
                                                    onChange={e => updateModel(idx, mIdx, e.target.value)}
                                                    className="flex-1 theme-input text-xs"
                                                />
                                                <button
                                                    onClick={() => removeModel(idx, mIdx, m)}
                                                    className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end pt-1">
                                    <button
                                        onClick={() => removeProvider(idx, p.name)}
                                        className="text-[10px] px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 size={10} /> Remove provider
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button
                            onClick={addProvider}
                            className="w-full py-2 rounded border border-dashed theme-border theme-text-secondary hover:bg-white/5 text-xs flex items-center justify-center gap-1 transition-colors"
                        >
                            <Plus size={12} /> Add provider
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserModelsEditor;
