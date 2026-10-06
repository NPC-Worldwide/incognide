import React, { useMemo, useState } from 'react';
import { ModelSelector as NpctsModelSelector, type AddProviderPayload, type ModelInfo } from 'npcts';
import yaml from 'js-yaml';
import { Plus, X } from 'lucide-react';

export interface ModelItem {
    value: string;
    display_name?: string;
    provider?: string;
    base_url?: string;
    api_key_var?: string;
    context_window?: number | null;
    [key: string]: any;
}

const providerKey = (prov?: any) =>
    (prov?.name || prov?.provider || '').toLowerCase().replace(/\s+/g, '');

const toNpctsModel = (m: ModelItem) => ({
    id: m.value,
    displayName: m.display_name || m.value,
    provider: m.provider || 'unknown',
    contextWindow: m.context_window ?? undefined,
});

const KNOWN_PROVIDERS = new Set([
    'openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'groq', 'moonshot',
    'mistral', 'together', 'xai', 'perplexity', 'ollama', 'lmstudio', 'llamacpp',
]);

const DEFAULT_MODELS: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4',
    gemini: 'gemini-2.5-flash',
    openrouter: 'openai/gpt-4o',
    deepseek: 'deepseek-chat',
    groq: 'llama-3.3-70b-versatile',
    moonshot: 'moonshot-v1-8k',
    mistral: 'mistral-large-latest',
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    xai: 'grok-3',
    perplexity: 'sonar-pro',
    ollama: 'qwen3.5:4b',
};

const saveProviderToUserModels = async (payload: AddProviderPayload) => {
    const pKey = payload.provider.toLowerCase().replace(/\s+/g, '');
    const isKnown = KNOWN_PROVIDERS.has(pKey);
    const res = await (window as any).api.userModelsUpdate({
        providerName: pKey,
        models: [payload.model],
        options: isKnown ? {} : {
            ...(payload.apiUrl ? { apiUrl: payload.apiUrl } : {}),
            ...(payload.apiKey ? { apiKey: payload.apiKey } : {}),
        },
    });
    if (res?.error) throw new Error(res.error);
};

const PROVIDER_DEFAULTS: Record<string, {
    name: string;
    color: string;
    apiUrl?: string;
    apiKeyVar?: string;
    defaultModel?: string;
    local?: boolean;
}> = {
    openai: { name: 'OpenAI', color: 'text-green-400' },
    anthropic: { name: 'Anthropic', color: 'text-orange-400' },
    gemini: { name: 'Gemini', color: 'text-blue-400' },
    openrouter: { name: 'OpenRouter', color: 'text-purple-400' },
    deepseek: { name: 'DeepSeek', color: 'text-cyan-400' },
    groq: { name: 'Groq', color: 'text-indigo-400' },
    moonshot: { name: 'Moonshot', color: 'text-pink-400' },
    ollama: { name: 'Ollama', color: 'text-amber-400', local: true },
    lmstudio: { name: 'LM Studio', color: 'text-yellow-400', local: true },
    llamacpp: { name: 'llama.cpp', color: 'text-red-400', local: true },
};

const API_SHORTCUTS = ['openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'moonshot', 'perplexity'];
const LOCAL_SHORTCUTS = ['ollama', 'lmstudio', 'llamacpp'];

const providerMeta: Record<string, { name: string; color: string }> = Object.fromEntries(
    Object.entries(PROVIDER_DEFAULTS).map(([k, v]) => [k, { name: v.name, color: v.color }])
);

const detectProviderConfig = async (key: string): Promise<{ baseUrl?: string; apiKeyVar?: string } | null> => {
    try {
        const detected = await (window as any).api.detectProviderKeys?.();
        if (Array.isArray(detected)) {
            const d = detected.find((x: any) => (x.provider || '').toLowerCase().replace(/\s+/g, '') === key);
            if (d) return { baseUrl: d.baseUrl, apiKeyVar: d.envVar };
        }
    } catch {}
    return null;
};

const scanProviderModels = async (key: string, baseUrl?: string, apiKeyVar?: string): Promise<string[]> => {
    try {
        if (key === 'ollama') {
            const result = await window.api.getLocalOllamaModels();
            return (result?.models || []).map((m: any) => m.name || m.id || m);
        }
        if (key === 'lmstudio' || key === 'llamacpp') {
            const result = await (window as any).api.scanLocalModels?.(key);
            return (result?.models || []).map((m: any) => m.name || m.id || m.filename || m);
        }
        if (baseUrl && apiKeyVar) {
            const result = await (window as any).api.getProviderModels({ provider: key, baseUrl, apiKeyVar });
            return (result?.models || []).map((m: any) => m.name || m.id || m);
        }
    } catch {}
    return [];
};

const removeProviderFromUserModels = async (providerName: string) => {
    const homeDir = await (window as any).api.getHomeDir();
    const filePath = `${homeDir}/.incognide/models.yaml`;
    const result = await (window as any).api.readFileContent(filePath);
    const raw = typeof result === 'string' ? result : result?.content;
    const parsed = raw ? yaml.load(raw) || {} : {};
    const providers = Array.isArray(parsed.providers) ? parsed.providers : [];
    const pKey = providerName.toLowerCase().replace(/\s+/g, '');
    const nextProviders = providers.filter((p: any) => providerKey(p) !== pKey);
    if (nextProviders.length === providers.length) {
        throw new Error(`Provider "${providerName}" not found in models.yaml.`);
    }
    const writeRes = await (window as any).api.writeFileContent(
        filePath,
        yaml.dump({ providers: nextProviders }, { sortKeys: false })
    );
    if (writeRes?.error) throw new Error(writeRes.error);
};

interface ModelSelectorProps {
    availableModels: ModelItem[];
    selectedModel?: string | null;
    onSelect?: (model: ModelItem) => void;
    placeholder?: string;
    loading?: boolean;
    error?: string | null;
    disabled?: boolean;
    userModelsProviders?: any[];
    onModelsChanged?: (addedModel?: string) => void;
    favoriteModels?: Set<string>;
    onToggleFavorite?: (value: string) => void;
    showAllModels?: boolean;
    onToggleShowAll?: () => void;
    className?: string;
    toolbar?: React.ReactNode;
    placement?: 'top' | 'bottom';
}

const QuickAddChip: React.FC<{ keyName: string; active: boolean; loading: boolean; onClick: () => void }> = ({ keyName, active, loading, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`px-1.5 py-0.5 rounded border theme-border text-[10px] transition-colors disabled:opacity-40 ${active ? 'bg-blue-600/30 border-blue-500/50' : 'bg-white/5 hover:bg-white/10'} ${providerMeta[keyName]?.color || 'theme-text-secondary'}`}
    >
        {loading ? '…' : (providerMeta[keyName]?.name || keyName)}
    </button>
);

const AddProviderInline: React.FC<{
    onSave: (payload: AddProviderPayload) => void | Promise<void>;
    onCancel: () => void;
    saving: boolean;
    onQuickAdd: (key: string) => void | Promise<void>;
    quickAdding: string | null;
    existingProviders?: Set<string>;
}> = ({ onSave, onCancel, saving, onQuickAdd, quickAdding, existingProviders }) => {
    const [provider, setProvider] = useState('');
    const [model, setModel] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');

    const handleSave = () => {
        const p = provider.trim();
        const m = model.trim();
        if (!p || !m) return;
        onSave({ provider: p, model: m, apiUrl: apiUrl.trim() || undefined, apiKey: apiKey.trim() || undefined });
    };

    const chipGroup = (label: string, keys: string[]) => {
        const visible = keys.filter(s => providerMeta[s] && !existingProviders?.has(s));
        if (visible.length === 0) return null;
        return (
            <div className="space-y-1">
                <span className="text-[10px] theme-text-muted uppercase tracking-wider">{label}</span>
                <div className="flex flex-wrap gap-1">
                    {visible.map(s => (
                        <QuickAddChip key={s} keyName={s} active={provider === s} loading={quickAdding === s} onClick={() => onQuickAdd(s)} />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-1.5 text-xs border-t theme-border pt-2">
            {chipGroup('API', API_SHORTCUTS)}
            {chipGroup('Local', LOCAL_SHORTCUTS)}
            <div className="grid grid-cols-2 gap-1.5">
                <input
                    type="text"
                    value={provider}
                    onChange={e => setProvider(e.target.value)}
                    placeholder="Provider"
                    className="w-full theme-input theme-border border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500/50"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
                />
                <input
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="Model"
                    className="w-full theme-input theme-border border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500/50"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
                />
            </div>
            <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="API URL (optional)"
                className="w-full theme-input theme-border border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500/50"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
            />
            <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="API key (optional)"
                className="w-full theme-input theme-border border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500/50"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
            />
            <div className="flex gap-2 pt-1">
                <button onClick={onCancel} disabled={saving} className="flex-1 px-2 py-1 rounded bg-white/5 theme-text-secondary hover:bg-white/10 text-[10px] transition-colors disabled:opacity-40">Cancel</button>
                <button onClick={handleSave} disabled={saving || !provider.trim() || !model.trim()} className="flex-1 px-2 py-1 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white text-[10px] transition-colors">{saving ? 'Saving…' : 'Save'}</button>
            </div>
        </div>
    );
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
    availableModels,
    selectedModel,
    onSelect,
    placeholder = 'Select a model',
    loading = false,
    error = null,
    disabled = false,
    userModelsProviders = [],
    onModelsChanged,
    favoriteModels,
    onToggleFavorite,
    showAllModels = true,
    onToggleShowAll,
    className = '',
    toolbar,
    placement = 'bottom',
}) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [quickAdding, setQuickAdding] = useState<string | null>(null);
    const models = useMemo<ModelInfo[]>(() => availableModels.map(toNpctsModel), [availableModels]);

    const byProvider = useMemo<Record<string, ModelInfo[]>>(() => {
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

    const providers = useMemo(() => Object.keys(byProvider).sort(), [byProvider]);

    const userProviderKeys = useMemo(
        () => new Set(userModelsProviders.map((p: any) => providerKey(p)).filter(Boolean)),
        [userModelsProviders]
    );

    const removableProviders = useMemo(
        () => new Set(Array.from(userProviderKeys)),
        [userProviderKeys]
    );

    const handleAdd = async (payload: AddProviderPayload) => {
        setSaving(true);
        try {
            await saveProviderToUserModels(payload);
            setShowAddForm(false);
            onModelsChanged?.(payload.model);
        } catch (err: any) {
            console.error('[ModelSelector] add provider failed:', err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleQuickAdd = async (key: string) => {
        setQuickAdding(key);
        try {
            const isKnown = KNOWN_PROVIDERS.has(key);
            const models: string[] = DEFAULT_MODELS[key] ? [DEFAULT_MODELS[key]] : [];
            const res = await (window as any).api.userModelsUpdate({
                providerName: key,
                models,
                options: isKnown ? {} : {
                    apiUrl: '',
                    apiKeyVar: '',
                },
            });
            if (res?.error) throw new Error(res.error);
            setShowAddForm(false);
            onModelsChanged?.();
        } catch (err: any) {
            console.error('[ModelSelector] quick add failed:', err.message);
        } finally {
            setQuickAdding(null);
        }
    };

    const addProviderFooter = (
        <div className="space-y-2">
            <div className="flex items-center justify-end text-xs">
                <button
                    onClick={() => setShowAddForm(v => !v)}
                    className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1"
                >
                    {showAddForm ? <X size={10} /> : <Plus size={10} />}
                    {showAddForm ? 'Cancel' : 'Add provider'}
                </button>
            </div>
            {showAddForm && (
                <AddProviderInline onSave={handleAdd} onCancel={() => setShowAddForm(false)} saving={saving} onQuickAdd={handleQuickAdd} quickAdding={quickAdding} existingProviders={userProviderKeys} />
            )}
        </div>
    );

    const favoriteFooter = onToggleShowAll && favoriteModels && favoriteModels.size > 0 ? (
        <button
            onClick={onToggleShowAll}
            className={`text-[10px] ${showAllModels ? 'text-gray-400 hover:text-gray-300' : 'text-blue-400 hover:text-blue-300'}`}
        >
            {showAllModels ? 'Show favorites' : 'Show all'}
        </button>
    ) : null;

    return (
        <NpctsModelSelector
            models={models}
            byProvider={byProvider}
            providers={providers}
            selectedModelId={selectedModel || null}
            onSelect={(m) => {
                const item = availableModels.find((x) => x.value === m.id);
                if (item) onSelect?.(item);
            }}
            loading={loading}
            error={error}
            placeholder={placeholder}
            favoriteModels={favoriteModels}
            onToggleFavorite={onToggleFavorite}
            disabled={disabled}
            toolbar={toolbar}
            placement={placement}
            className={className}
            removableProviders={removableProviders}
            onRemoveProvider={async (provider) => {
                try {
                    await removeProviderFromUserModels(provider);
                    onModelsChanged?.();
                } catch (err: any) {
                    console.error('[ModelSelector] remove provider failed:', err.message);
                    throw err;
                }
            }}
            dropdownFooter={favoriteFooter ? (
                <div className="space-y-2">
                    {favoriteFooter}
                    {addProviderFooter}
                </div>
            ) : addProviderFooter}
        />
    );
};

export default ModelSelector;
