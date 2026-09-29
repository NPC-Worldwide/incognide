import React, { useMemo } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import yaml from 'js-yaml';
import { API_PROVIDER_META } from './ModelManager';
import { ModelSelector as NpctsModelSelector } from 'npcts';
import type { ModelInfo } from 'npcts/core';

export interface ModelItem {
    value: string;
    display_name?: string;
    provider?: string;
    base_url?: string;
    api_key_var?: string;
    [key: string]: any;
}

const providerKey = (prov?: any) => prov?.provider || prov?.provider_type || prov?.name || '';

const providerLabel = (prov?: any) => {
    const key = providerKey(prov);
    const meta = key ? API_PROVIDER_META[key as keyof typeof API_PROVIDER_META] : undefined;
    return (meta as any)?.name || prov?.displayName || prov?.name || key || 'Provider';
};

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

export const removeProviderFromTeamCtx = async (teamPath: string, providerName: string) => {
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
    const filtered = providers.filter((p: any) => p.name !== providerName && p.provider_type !== providerName);
    if (filtered.length === providers.length) {
        throw new Error(`Provider "${providerName}" not found in team .ctx.`);
    }

    const cleanCtx = { ...ctx, providers: filtered };
    delete cleanCtx.external_jinx_teams;
    delete cleanCtx.EXTERNAL_JINX_TEAMS;

    const result = await (window as any).api.writeFileContent(filePath, yaml.dump(cleanCtx, { lineWidth: -1 }));
    if (result?.error) throw new Error(result.error);
    return { filePath, targetFile };
};

export const saveProviderToTeamCtx = async (
    teamPath: string,
    providerName: string,
    models: string[] | null,
    options?: { apiUrl?: string; apiKey?: string; providerType?: string }
) => {
    if (!teamPath) throw new Error('No team path available.');
    return await (window as any).api.teamUpdateProvider({
        teamPath,
        providerName,
        models,
        options,
    });
};

const AddProviderPanel = ({
    teamPath,
    teamCtxProviders: teamCtxProvidersProp,
    onAdded,
}: {
    teamPath: string;
    teamCtxProviders?: any[];
    onAdded: (modelValue?: string) => void;
}) => {
    const [providerName, setProviderName] = React.useState('');
    const [providerType, setProviderType] = React.useState('');
    const [modelName, setModelName] = React.useState('');
    const [apiUrl, setApiUrl] = React.useState('');
    const [apiKey, setApiKey] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [providerModelSelector, setProviderModelSelector] = React.useState<{
        provider: any;
        models: string[];
        selected: Set<string>;
        loading: boolean;
        error: string | null;
    } | null>(null);
    const [detectedProviders, setDetectedProviders] = React.useState<any[]>([]);
    const [detectedProvidersLoading, setDetectedProvidersLoading] = React.useState(false);
    const [teamCtxProviders, setTeamCtxProviders] = React.useState<any[]>(teamCtxProvidersProp || []);
    const addModelNameRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setTimeout(() => addModelNameRef.current?.focus(), 50);
    }, []);

    React.useEffect(() => {
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

    React.useEffect(() => {
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

    const ctxProviderNames = React.useMemo(() => {
        return new Set(teamCtxProviders.map((p: any) => providerKey(p)).filter(Boolean));
    }, [teamCtxProviders]);

    const extraDetectedProviders = React.useMemo(() => {
        return detectedProviders.filter((d: any) => {
            const name = d.provider || d.name;
            return name && !ctxProviderNames.has(name);
        });
    }, [detectedProviders, ctxProviderNames]);

    const knownCloudProviders = React.useMemo(() => {
        const ctxKeys = new Set(teamCtxProviders.map((p: any) => providerKey(p)).filter(Boolean));
        const detectedKeys = new Set(detectedProviders.map((d: any) => d.provider || d.name).filter(Boolean));
        return Object.entries(API_PROVIDER_META)
            .filter(([key]) => !ctxKeys.has(key) && !detectedKeys.has(key))
            .map(([key, meta]) => ({ key, name: meta.name, defaultModel: meta.defaultModel }));
    }, [teamCtxProviders, detectedProviders]);

    const openProviderModelSelector = async (prov: any) => {
        const pName = providerKey(prov);
        const providerTypeVal = pName;
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
            const fallbackModels = fetchedModels.length > 0 ? fetchedModels : existingModels;
            const meta = API_PROVIDER_META[providerTypeVal as keyof typeof API_PROVIDER_META];
            const models = fallbackModels.length > 0 ? fallbackModels : (meta?.defaultModel ? [meta.defaultModel] : []);
            setProviderModelSelector({
                provider: prov,
                models,
                selected: new Set(models),
                loading: false,
                error: models.length === 0 ? 'No models found for this provider.' : null,
            });
        } catch (err: any) {
            const meta = API_PROVIDER_META[providerTypeVal as keyof typeof API_PROVIDER_META];
            const fallback = meta?.defaultModel ? [meta.defaultModel] : existingModels;
            setProviderModelSelector({
                provider: prov,
                models: fallback,
                selected: new Set(fallback),
                loading: false,
                error: fallback.length === 0 ? (err.message || 'Failed to load models.') : null,
            });
        }
    };

    const handleSaveSelectedProviderModels = async () => {
        if (!providerModelSelector || providerModelSelector.selected.size === 0) return;
        const prov = providerModelSelector.provider;
        const pName = providerKey(prov);
        const providerTypeVal = pName;
        setSaving(true);
        setError(null);
        try {
            const selectedModels = Array.from(providerModelSelector.selected);
            const allSelected = selectedModels.length === providerModelSelector.models.length && providerModelSelector.models.length > 0;
            await saveProviderToTeamCtx(teamPath, pName, allSelected ? null : selectedModels, {
                providerType: providerTypeVal,
            });
            onAdded(selectedModels.join('\n'));
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
        const detectedMatch = detectedProviders.find(
            (d: any) =>
                d.provider?.toLowerCase() === pName.toLowerCase() ||
                d.displayName?.toLowerCase() === pName.toLowerCase() ||
                d.name?.toLowerCase() === pName.toLowerCase()
        );
        const saveName = (detectedMatch?.provider || pName).replace(/\s+/g, '').toLowerCase();
        const resolvedType = (detectedMatch?.provider || providerType.trim() || pName).replace(/\s+/g, '').toLowerCase();
        try {
            await saveProviderToTeamCtx(teamPath, saveName, [mName], {
                apiUrl: apiUrl.trim() || undefined,
                apiKey: apiKey.trim() || undefined,
                providerType: resolvedType,
            });
            setModelName('');
            setProviderName('');
            setProviderType('');
            setApiUrl('');
            setApiKey('');
            onAdded(mName);
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
                            {providerModelSelector.loading ? 'Loading models...' : `Select models for ${providerLabel(providerModelSelector.provider)}`}
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
                                const pKey = providerKey(prov);
                                const pLabel = providerLabel(prov);
                                return (
                                    <div key={`ctx-${pKey || idx}-${idx}`} className="flex items-center gap-1">
                                        <button
                                            onClick={() => openProviderModelSelector(prov)}
                                            disabled={saving}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                        >
                                            + {pLabel}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!teamPath || !pKey) return;
                                                setSaving(true);
                                                setError(null);
                                                try {
                                                    await removeProviderFromTeamCtx(teamPath, pKey);
                                                    onAdded();
                                                } catch (err: any) {
                                                    setError(err.message || 'Failed to remove provider.');
                                                } finally {
                                                    setSaving(false);
                                                }
                                            }}
                                            disabled={saving}
                                            className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-300 hover:text-white hover:bg-red-500/40 transition-colors disabled:opacity-50"
                                            title={`Remove ${pLabel} provider from team .ctx`}
                                        >
                                            <Trash2 size={12} />
                                            <span>Remove</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {extraDetectedProviders.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-[10px] text-gray-400">Detected API keys in env — click to add to .ctx:</div>
                            <div className="flex flex-wrap gap-1">
                                {extraDetectedProviders.map((prov: any, idx: number) => {
                                    const pKey = providerKey(prov);
                                    const pLabel = providerLabel(prov);
                                    return (
                                        <button
                                            key={`env-${pKey || idx}-${idx}`}
                                            onClick={() => openProviderModelSelector(prov)}
                                            disabled={saving}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                        >
                                            + {pLabel}
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
                    {knownCloudProviders.length > 0 && (
                        <div className="space-y-1 pt-1 border-t theme-border">
                            <div className="text-[10px] text-gray-400">Known cloud providers:</div>
                            <div className="flex flex-wrap gap-1">
                                {knownCloudProviders.map((prov: any, idx: number) => (
                                    <button
                                        key={`known-${prov.key || idx}-${idx}`}
                                        onClick={() => openProviderModelSelector({ name: prov.key, provider_type: prov.key, displayName: prov.name })}
                                        disabled={saving}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                                    >
                                        + {prov.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {teamCtxProviders.length === 0 && extraDetectedProviders.length === 0 && knownCloudProviders.length === 0 && !detectedProvidersLoading && (
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
    onModelsChanged?: (addedModelValue?: string) => void;
    allowAdd?: boolean;
    toolbar?: React.ReactNode;
    favoriteModels?: Set<string>;
    onToggleFavorite?: (value: string) => void;
    showAllModels?: boolean;
    onToggleShowAll?: () => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
    availableModels,
    selectedModel,
    onSelect,
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
}) => {
    const modelMap = React.useMemo(() => {
        const map = new Map<string, ModelItem>();
        for (const m of availableModels) map.set(m.value, m);
        return map;
    }, [availableModels]);

    const models = React.useMemo<ModelInfo[]>(() =>
        availableModels.map(m => ({
            id: m.value,
            displayName: m.display_name || m.value,
            provider: m.provider || 'Other',
        })), [availableModels]);

    const byProvider = React.useMemo(() => {
        const map: Record<string, ModelInfo[]> = {};
        for (const m of models) {
            const p = m.provider || 'Other';
            if (!map[p]) map[p] = [];
            map[p].push(m);
        }
        for (const p of Object.keys(map)) {
            map[p].sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
        }
        return map;
    }, [models]);

    const providers = React.useMemo(() => Object.keys(byProvider).sort(), [byProvider]);

    const handleSelect = (m: ModelInfo) => {
        const original = modelMap.get(m.id);
        onSelect?.(original || { value: m.id, display_name: m.displayName, provider: m.provider });
    };

    const handleRemoveProvider = async (providerName: string) => {
        if (!teamPathForCtx) return;
        try {
            await removeProviderFromTeamCtx(teamPathForCtx, providerName);
            onModelsChanged?.();
        } catch (err: any) {
            // eslint-disable-next-line no-console
            console.error('Failed to remove provider:', err);
        }
    };

    return (
        <NpctsModelSelector
            models={models}
            byProvider={byProvider}
            providers={providers}
            selectedModelId={selectedModel}
            onSelect={handleSelect}
            loading={loading}
            error={error}
            disabled={disabled}
            placeholder={placeholder}
            favoriteModels={favoriteModels}
            onToggleFavorite={onToggleFavorite}
            toolbar={toolbar}
            placement={placement}
            className={className}
            onRemoveProvider={teamPathForCtx ? handleRemoveProvider : undefined}
            dropdownFooter={teamPathForCtx && allowAdd ? (close) => (
                <AddProviderPanel
                    teamPath={teamPathForCtx}
                    teamCtxProviders={teamCtxProviders}
                    onAdded={(val) => { close(); onModelsChanged?.(val); }}
                />
            ) : undefined}
        />
    );
};

export default ModelSelector;
