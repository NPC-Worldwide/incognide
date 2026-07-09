import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Cpu, Plus, X, RefreshCw, Star, ListFilter } from 'lucide-react';
import yaml from 'js-yaml';
import { API_PROVIDER_META } from './ModelManager';

export interface ModelItem {
    value: string;
    display_name?: string;
    provider?: string;
    base_url?: string;
    api_key_var?: string;
    [key: string]: any;
}

const modelLabel = (m?: ModelItem, fallback?: string) => {
    const raw = m?.display_name || m?.value || fallback || '';
    const withoutProvider = raw.split(' | ')[0] || raw;
    if (withoutProvider.includes('/') && withoutProvider.includes('.')) {
        return withoutProvider.split('/').pop() || withoutProvider;
    }
    return withoutProvider;
};

interface ModelSelectorProps {
    availableModels: ModelItem[];
    selectedModel?: string | null;
    onSelect?: (model: ModelItem) => void;
    multiSelect?: boolean;
    selectedModels?: string[];
    onSelectModels?: (models: string[]) => void;
    placeholder?: string;
    loading?: boolean;
    error?: string | null;
    disabled?: boolean;
    teamPathForCtx?: string | null;
    teamCtxProviders?: any[];
    placement?: 'bottom' | 'top';
    className?: string;
    onModelsChanged?: () => void;
    allowAdd?: boolean;
    toolbar?: React.ReactNode;
    favoriteModels?: Set<string>;
    onToggleFavorite?: (value: string) => void;
    showAllModels?: boolean;
    onToggleShowAll?: () => void;
}

const preprocessJinja = (content: string) =>
    content.replace(/(?<!["'])\{\{[^{}]*\}\}(?!["'])/g, (match) => `"${match}"`);

const findCtxFile = async (dirPath: string) => {
    try {
        const items = await (window as any).api.readDirectory(dirPath);
        const ctxFiles = (items || []).filter((item: any) => item.name && item.name.endsWith('.ctx'));
        if (ctxFiles.length > 0) return ctxFiles[0].name;
    } catch {}
    return null;
};

export const saveProviderToTeamCtx = async (
    teamPath: string,
    providerName: string,
    models: string[] | null,
    options?: { apiUrl?: string; apiKey?: string; providerType?: string }
) => {
    if (!teamPath) throw new Error('No team path available.');
    const ctxFile = await findCtxFile(teamPath);
    const targetFile = ctxFile || 'team.ctx';
    const filePath = `${teamPath}/${targetFile}`;

    let rawCtx: string | null = null;
    try {
        const result = await (window as any).api.readFileContent(filePath);
        rawCtx = typeof result === 'string' ? result : result?.content;
    } catch {}

    let ctx: any = {};
    if (rawCtx) {
        try {
            ctx = yaml.load(preprocessJinja(rawCtx)) || {};
        } catch {
            ctx = {};
        }
    }

    const providers: any[] = Array.isArray(ctx.providers) ? [...ctx.providers] : [];
    const existing = providers.find((p: any) => p.name === providerName);
    const newEntry: any = {
        name: providerName,
        provider_type: options?.providerType || providerName,
        ...(options?.apiUrl ? { api_url: options.apiUrl } : {}),
        ...(options?.apiKey ? { api_key: options.apiKey } : {}),
    };
    if (Array.isArray(models) && models.length > 0) {
        const existingModels = new Set(existing?.models || []);
        models.forEach((m) => existingModels.add(m));
        newEntry.models = Array.from(existingModels);
    }

    if (!existing) {
        providers.push(newEntry);
    } else {
        const idx = providers.indexOf(existing);
        providers[idx] = { ...existing, ...newEntry };
    }

    const cleanCtx = { ...ctx, providers };
    delete cleanCtx.external_jinx_teams;
    delete cleanCtx.EXTERNAL_JINX_TEAMS;

    const result = await (window as any).api.writeFileContent(filePath, yaml.dump(cleanCtx, { lineWidth: -1 }));
    if (result?.error) throw new Error(result.error);
    return { filePath, targetFile };
};

export const ModelSelectorDropdown = ({
    buttonRef,
    availableModels,
    selectedModel,
    multiSelect,
    selectedModels,
    onSelect,
    onSelectModels,
    modelDropdownSearch,
    setModelDropdownSearch,
    expandedModelProviders,
    setExpandedModelProviders,
    onClose,
    placement,
    toolbar,
    favoriteModels,
    onToggleFavorite,
    children,
}: any) => {
    const [pos, setPos] = useState<{ top?: number; left?: number; bottom?: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            if (placement === 'top') {
                setPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
            } else {
                setPos({ top: rect.bottom + 4, left: rect.left });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [buttonRef, placement]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!buttonRef.current?.contains(target) && !document.getElementById('model-selector-dropdown-portal')?.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [buttonRef, onClose]);

    if (!pos) return null;

    const filtered = availableModels.filter((m: ModelItem) => {
        if (!modelDropdownSearch) return true;
        const text = `${m.display_name || m.value} ${m.provider || ''}`.toLowerCase();
        return text.includes(modelDropdownSearch.toLowerCase());
    });

    const byProvider: Record<string, ModelItem[]> = {};
    for (const m of filtered) {
        const p = m.provider || 'Other';
        if (!byProvider[p]) byProvider[p] = [];
        byProvider[p].push(m);
    }
    for (const p of Object.keys(byProvider)) {
        byProvider[p].sort((a: ModelItem, b: ModelItem) =>
            (a.display_name || a.value).localeCompare(b.display_name || b.value)
        );
    }

    return (
        <div
            id="model-selector-dropdown-portal"
            className="fixed z-[100] theme-bg-primary border theme-border rounded-lg shadow-2xl overflow-hidden min-w-[260px] w-auto max-w-[25vw]"
            style={pos}
        >
            <div className="px-2 py-1.5 border-b theme-border">
                <input
                    type="text"
                    placeholder="Search models..."
                    className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                    value={modelDropdownSearch}
                    onChange={(e) => setModelDropdownSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
            {toolbar && <div className="px-2 py-1 border-b theme-border">{toolbar}</div>}
            <div className="max-h-72 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">No models found</div>
                ) : (
                    (() => {
                        const items: React.ReactNode[] = [];
                        const providers = Object.keys(byProvider).sort();
                        for (const provider of providers) {
                            const meta = API_PROVIDER_META[provider];
                            const isExpanded = expandedModelProviders.has(provider) || !!modelDropdownSearch;
                            items.push(
                                <button
                                    key={`provider-${provider}`}
                                    onClick={() => setExpandedModelProviders((prev: Set<string>) => {
                                        const next = new Set(prev);
                                        if (next.has(provider)) next.delete(provider); else next.add(provider);
                                        return next;
                                    })}
                                    className="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-white/5 text-left"
                                >
                                    <ChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    {meta ? (
                                        <span className={`${meta.color}`}>{meta.name}</span>
                                    ) : (
                                        <span>{provider}</span>
                                    )}
                                </button>
                            );
                            if (isExpanded) {
                                for (const m of byProvider[provider]) {
                                    if (multiSelect) {
                                        const checked = (selectedModels || []).includes(m.value);
                                        items.push(
                                            <div
                                                key={m.value}
                                                onClick={() => {
                                                    if (!onSelectModels) return;
                                                    const next = (selectedModels || []).includes(m.value)
                                                        ? (selectedModels || []).filter((x: string) => x !== m.value)
                                                        : [...(selectedModels || []), m.value];
                                                    onSelectModels(next);
                                                }}
                                                className={`pl-6 pr-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2 transition-all ${checked ? 'bg-blue-500/20 text-blue-200' : 'hover:bg-white/5'}`}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                                                    {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <span className="truncate flex-1">{m.display_name || m.value}</span>
                                                {favoriteModels?.has(m.value) && <Star size={9} className="text-yellow-400 flex-shrink-0" />}
                                            </div>
                                        );
                                    } else {
                                        const isSelected = selectedModel === m.value;
                                        items.push(
                                            <button
                                                key={m.value}
                                                onClick={() => onSelect?.(m)}
                                                className={`flex items-center gap-2 w-full pl-6 pr-2 py-1 text-xs text-left ${isSelected ? 'bg-purple-600/50' : 'hover:bg-white/5'}`}
                                            >
                                                <Cpu size={12} className="text-purple-400" />
                                                <span className="truncate flex-1">{m.display_name || m.value}</span>
                                                {favoriteModels?.has(m.value) && <Star size={9} className="text-yellow-400 flex-shrink-0" />}
                                            </button>
                                        );
                                    }
                                }
                            }
                        }
                        return items;
                    })()
                )}
            </div>
            {children}
        </div>
    );
};

export const AddProviderPanel = ({
    teamPath,
    teamCtxProviders: teamCtxProvidersProp,
    onAdded,
}: {
    teamPath: string;
    teamCtxProviders?: any[];
    onAdded: (modelValue?: string) => void;
}) => {
    const [providerName, setProviderName] = useState('');
    const [providerType, setProviderType] = useState('');
    const [modelName, setModelName] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [providerModelSelector, setProviderModelSelector] = useState<{
        provider: any;
        models: string[];
        selected: Set<string>;
        loading: boolean;
        error: string | null;
    } | null>(null);
    const [detectedProviders, setDetectedProviders] = useState<any[]>([]);
    const [detectedProvidersLoading, setDetectedProvidersLoading] = useState(false);
    const [teamCtxProviders, setTeamCtxProviders] = useState<any[]>(teamCtxProvidersProp || []);
    const addModelNameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => addModelNameRef.current?.focus(), 50);
    }, []);

    useEffect(() => {
        if (teamCtxProvidersProp) {
            setTeamCtxProviders(teamCtxProvidersProp);
            return;
        }
        if (!teamPath) return;
        let cancelled = false;
        (async () => {
            try {
                const ctxFile = await findCtxFile(teamPath);
                if (!ctxFile) return;
                const result = await (window as any).api.readFileContent(`${teamPath}/${ctxFile}`);
                const raw = typeof result === 'string' ? result : result?.content;
                if (!raw) return;
                const ctx = yaml.load(preprocessJinja(raw)) || {};
                if (!cancelled) setTeamCtxProviders(Array.isArray(ctx.providers) ? ctx.providers : []);
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [teamPath, teamCtxProvidersProp]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setDetectedProvidersLoading(true);
            try {
                const d = await (window as any).api?.detectProviderKeys?.();
                if (!cancelled) setDetectedProviders(Array.isArray(d) ? d : []);
            } catch {
                if (!cancelled) setDetectedProviders([]);
            }
            if (!cancelled) setDetectedProvidersLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const ctxProviderNames = useMemo(() => {
        return new Set(teamCtxProviders.map((p: any) => p.name || p.provider));
    }, [teamCtxProviders]);

    const extraDetectedProviders = useMemo(() => {
        return detectedProviders.filter((d: any) => {
            const name = d.provider || d.name;
            return name && !ctxProviderNames.has(name);
        });
    }, [detectedProviders, ctxProviderNames]);

    const openProviderModelSelector = async (prov: any) => {
        const providerName = prov.name || prov.displayName || prov.provider;
        const providerTypeVal = prov.provider || providerName;
        const existingModels = Array.isArray(prov.models) ? prov.models : [];
        setProviderModelSelector({ provider: prov, models: [], selected: new Set(), loading: true, error: null });
        try {
            let fetchedModels: string[] = [];
            if (providerTypeVal === 'ollama') {
                const res = await (window as any).api.getLocalOllamaModels();
                fetchedModels = (res?.models || []).map((m: any) => m.name || m.model || m.id).filter(Boolean);
            } else if (['lmstudio', 'llamacpp', 'gguf'].includes(providerTypeVal)) {
                const res = await (window as any).api.scanLocalModels?.(providerTypeVal);
                fetchedModels = (res?.models || []).map((m: any) => m.name || m.path || m.id).filter(Boolean);
            } else {
                const result = await (window as any).api.getProviderModels({ provider: providerTypeVal });
                fetchedModels = (result?.models || []).map((m: any) => m.id || m.name || m.value).filter(Boolean);
            }
            const models = fetchedModels.length > 0 ? fetchedModels : existingModels;
            setProviderModelSelector({
                provider: prov,
                models,
                selected: new Set(models),
                loading: false,
                error: models.length === 0 ? 'No models found for this provider.' : null,
            });
        } catch (err: any) {
            setProviderModelSelector({
                provider: prov,
                models: existingModels,
                selected: new Set(existingModels),
                loading: false,
                error: err.message || 'Failed to load models.',
            });
        }
    };

    const handleSaveSelectedProviderModels = async () => {
        if (!providerModelSelector || providerModelSelector.selected.size === 0) return;
        const prov = providerModelSelector.provider;
        const providerName = prov.name || prov.displayName || prov.provider;
        const providerTypeVal = prov.provider || providerName;
        setSaving(true);
        setError(null);
        try {
            const allSelected = providerModelSelector.selected.size === providerModelSelector.models.length && providerModelSelector.models.length > 0;
            await saveProviderToTeamCtx(teamPath, providerName, allSelected ? null : Array.from(providerModelSelector.selected), {
                providerType: providerTypeVal,
            });
            const first = allSelected ? providerModelSelector.models[0] : Array.from(providerModelSelector.selected)[0];
            onAdded(`${providerName}/${first}`);
        } catch (err: any) {
            setError(err.message || 'Failed to save models.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNewModel = async () => {
        const mName = modelName.trim();
        const pName = providerName.trim();
        if (!mName || !pName) {
            setError('Model name and provider are required.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await saveProviderToTeamCtx(teamPath, pName, [mName], {
                apiUrl: apiUrl.trim() || undefined,
                apiKey: apiKey.trim() || undefined,
                providerType: providerType.trim() || pName,
            });
            setModelName('');
            setProviderName('');
            setProviderType('');
            setApiUrl('');
            setApiKey('');
            onAdded(`${pName}/${mName}`);
        } catch (err: any) {
            setError(err.message || 'Failed to save model.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-blue-300">Add model to team .ctx</span>
                <button onClick={() => onAdded()} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                <input
                    ref={addModelNameRef}
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Model name"
                    className="theme-input text-xs px-2 py-1 rounded"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewModel(); } }}
                />
                <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder="Provider name"
                    className="theme-input text-xs px-2 py-1 rounded"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewModel(); } }}
                />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                <input
                    type="text"
                    value={providerType}
                    onChange={(e) => setProviderType(e.target.value)}
                    placeholder="Provider type (optional)"
                    className="theme-input text-xs px-2 py-1 rounded"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewModel(); } }}
                />
                <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="API URL (optional)"
                    className="theme-input text-xs px-2 py-1 rounded"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewModel(); } }}
                />
            </div>
            <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key (optional)"
                className="w-full theme-input text-xs px-2 py-1 rounded"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewModel(); } }}
            />
            {providerModelSelector ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-blue-300">
                            {providerModelSelector.loading ? 'Loading models...' : `Select models for ${providerModelSelector.provider?.name || providerModelSelector.provider?.displayName || providerModelSelector.provider?.provider}`}
                        </span>
                        <button onClick={() => setProviderModelSelector(null)} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
                    </div>
                    {providerModelSelector.loading ? (
                        <div className="text-[10px] text-gray-400">Loading... (uses .ctx models as fallback)</div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <button
                                    onClick={() => setProviderModelSelector(prev => prev ? { ...prev, selected: new Set(prev.models) } : null)}
                                    className="text-blue-400 hover:text-blue-300"
                                >All</button>
                                <button
                                    onClick={() => setProviderModelSelector(prev => prev ? { ...prev, selected: new Set() } : null)}
                                    className="text-blue-400 hover:text-blue-300"
                                >None</button>
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 p-1 border theme-border rounded">
                                {providerModelSelector.models.map((m: string) => {
                                    const checked = providerModelSelector.selected.has(m);
                                    return (
                                        <label key={m} className={`flex items-center gap-2 px-2 py-1 text-[10px] rounded cursor-pointer ${checked ? 'bg-blue-500/20 text-blue-200' : 'hover:bg-white/5'}`}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setProviderModelSelector(prev => {
                                                    if (!prev) return null;
                                                    const next = new Set(prev.selected);
                                                    if (next.has(m)) next.delete(m); else next.add(m);
                                                    return { ...prev, selected: next };
                                                })}
                                                className="w-3.5 h-3.5 accent-blue-500"
                                            />
                                            <span className="truncate">{m}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {providerModelSelector.error && <div className="text-[10px] text-red-400">{providerModelSelector.error}</div>}
                            <button
                                onClick={handleSaveSelectedProviderModels}
                                disabled={saving || providerModelSelector.selected.size === 0}
                                className="w-full text-[10px] px-2 py-1 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white transition-colors"
                            >
                                {saving ? 'Saving...' : `Add ${providerModelSelector.selected.size} model(s) to team .ctx`}
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-1">
                    {teamCtxProviders.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {teamCtxProviders.map((prov: any, idx: number) => {
                                const providerName = prov.name || prov.displayName || prov.provider || `Provider ${idx + 1}`;
                                return (
                                    <button
                                        key={`ctx-${providerName}-${idx}`}
                                        onClick={() => openProviderModelSelector(prov)}
                                        disabled={saving}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                    >
                                        + {providerName}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {extraDetectedProviders.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-[10px] text-gray-400">Detected API keys in env — click to add to .ctx:</div>
                            <div className="flex flex-wrap gap-1">
                                {extraDetectedProviders.map((prov: any, idx: number) => {
                                    const providerName = prov.displayName || prov.name || prov.provider || `Provider ${idx + 1}`;
                                    return (
                                        <button
                                            key={`env-${providerName}-${idx}`}
                                            onClick={() => openProviderModelSelector(prov)}
                                            disabled={saving}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                        >
                                            + {providerName}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {detectedProvidersLoading && (
                        <div className="text-[10px] text-gray-400">Scanning env for API keys…</div>
                    )}
                    <div className="space-y-1 pt-1 border-t theme-border">
                        <div className="text-[10px] text-gray-400">Scan local providers:</div>
                        <div className="flex flex-wrap gap-1">
                            {[
                                { key: 'ollama', label: 'Ollama' },
                                { key: 'lmstudio', label: 'LM Studio' },
                                { key: 'llamacpp', label: 'llama.cpp' },
                                { key: 'gguf', label: 'GGUF' },
                            ].map((lp) => (
                                <button
                                    key={`local-${lp.key}`}
                                    onClick={() => openProviderModelSelector({ name: lp.key, provider: lp.key, displayName: lp.label })}
                                    disabled={saving}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-orange-300 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                                >
                                    + {lp.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {teamCtxProviders.length === 0 && extraDetectedProviders.length === 0 && !detectedProvidersLoading && (
                        <div className="text-[10px] text-gray-400">No providers found in team .ctx or env. Add one manually below.</div>
                    )}
                </div>
            )}
            {error && (
                <div className="text-[10px] text-red-400">{error}</div>
            )}
            <button
                onClick={handleSaveNewModel}
                disabled={saving || !modelName.trim() || !providerName.trim()}
                className="w-full text-[10px] px-2 py-1 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white transition-colors"
            >
                {saving ? 'Saving...' : 'Save to team .ctx'}
            </button>
        </div>
    );
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
    availableModels,
    selectedModel,
    onSelect,
    multiSelect = false,
    selectedModels = [],
    onSelectModels,
    placeholder = 'Select a Model',
    loading = false,
    error = null,
    disabled = false,
    teamPathForCtx,
    teamCtxProviders,
    placement = 'bottom',
    className = '',
    onModelsChanged,
    allowAdd = true,
    toolbar,
    favoriteModels,
    onToggleFavorite,
    showAllModels,
    onToggleShowAll,
}) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
    const [showAddPanel, setShowAddPanel] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    const selectedObj = multiSelect
        ? availableModels.find((m) => m.value === selectedModels[0])
        : availableModels.find((m) => m.value === selectedModel);
    const buttonLabel = loading
        ? 'Loading...'
        : error
            ? 'Error'
            : multiSelect
                ? selectedModels.length === 0
                    ? placeholder
                    : selectedModels.length === 1
                        ? modelLabel(selectedObj, selectedModels[0])
                        : `${selectedModels.length} models`
                : modelLabel(selectedObj, selectedModel || placeholder);

    const handleSelect = (model: ModelItem) => {
        onSelect?.(model);
        setDropdownOpen(false);
        setSearch('');
        setShowAddPanel(false);
    };

    const handleSelectModels = (next: string[]) => {
        onSelectModels?.(next);
    };

    const handleAdded = async (modelValue?: string) => {
        setShowAddPanel(false);
        onModelsChanged?.();
        if (!modelValue || !teamPathForCtx) return;
        try {
            const response = await (window as any).api.getAvailableModels(teamPathForCtx);
            const models = Array.isArray(response) ? response : response?.models || [];
            const found = models.find((m: ModelItem) => m.value === modelValue);
            if (found) {
                if (multiSelect) {
                    handleSelectModels([...(selectedModels || []), found.value]);
                } else {
                    handleSelect(found);
                }
            }
        } catch {}
    };

    return (
        <div className="inline-block">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={disabled || loading || !!error}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm theme-bg-secondary theme-text-primary theme-border border hover:bg-white/5 disabled:opacity-40 min-w-[200px] w-auto max-w-[25vw] ${className}`}
            >
                <Cpu size={14} className="text-purple-400" />
                <span className="flex-1 truncate text-left">{buttonLabel}</span>
                <ChevronRight
                    size={12}
                    className={`transition-transform flex-shrink-0 ${dropdownOpen ? 'rotate-90' : ''}`}
                />
            </button>
            {dropdownOpen && createPortal(
                <ModelSelectorDropdown
                    buttonRef={buttonRef}
                    availableModels={availableModels}
                    selectedModel={selectedModel}
                    multiSelect={multiSelect}
                    selectedModels={selectedModels}
                    onSelect={handleSelect}
                    onSelectModels={handleSelectModels}
                    modelDropdownSearch={search}
                    setModelDropdownSearch={setSearch}
                    expandedModelProviders={expandedProviders}
                    setExpandedModelProviders={setExpandedProviders}
                    onClose={() => { setDropdownOpen(false); setShowAddPanel(false); setSearch(''); }}
                    placement={placement}
                    toolbar={toolbar}
                    favoriteModels={favoriteModels}
                    onToggleFavorite={onToggleFavorite}
                >
                    {allowAdd && teamPathForCtx ? (
                        <div className="border-t theme-border p-1.5">
                            {showAddPanel ? (
                                <AddProviderPanel teamPath={teamPathForCtx} teamCtxProviders={teamCtxProviders} onAdded={handleAdded} />
                            ) : (
                                <button
                                    onClick={() => setShowAddPanel(true)}
                                    disabled={!teamPathForCtx}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
                                    title={teamPathForCtx ? 'Add a model to team .ctx' : 'No team path available'}
                                >
                                    <Plus size={12} /> Add Model to Team
                                </button>
                            )}
                        </div>
                    ) : null}
                </ModelSelectorDropdown>,
                document.body
            )}
        </div>
    );
};

export default ModelSelector;
