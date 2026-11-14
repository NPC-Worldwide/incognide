import { useState, useEffect, useMemo, useRef } from 'react';
import {
    mergeModelLists,
    mergeProviderEntries,
    providerKeyOf,
    shouldDiscoverProvider,
} from '../utils/modelResolution';

const LOAD_RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

const loadUserModelsConfig = async (): Promise<any> => {
    const result = await (window as any).api.userModelsLoad();
    if (result?.error) throw new Error(result.error);
    return result?.config || { providers: [] };
};

export function useModelSelection() {
    const [currentModel, setCurrentModel] = useState<string | null>(null);
    const [currentProvider, setCurrentProvider] = useState<string | null>(null);
    const [currentNPC, setCurrentNPC] = useState(() => {
        const saved = localStorage.getItem('incognideCurrentNPC');
        return saved ? JSON.parse(saved) : null;
    });
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [selectedNPCs, setSelectedNPCs] = useState<string[]>(() => {
        const saved = localStorage.getItem('incognideCurrentNPC');
        const npc = saved ? JSON.parse(saved) : null;
        return npc ? [npc] : [];
    });
    const [broadcastMode, setBroadcastMode] = useState(false);
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState(null);
    const [ollamaToolModels, setOllamaToolModels] = useState<Set<string>>(new Set());
    const [availableNPCs, setAvailableNPCs] = useState<any[]>([]);
    const [npcsLoading, setNpcsLoading] = useState(false);
    const [npcsError, setNpcsError] = useState(null);
    const [executionMode, setExecutionMode] = useState(() => {
        const saved = localStorage.getItem('incognideExecutionMode');
        return saved ? JSON.parse(saved) : 'chat';
    });
    const [favoriteModels, setFavoriteModels] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('incognideFavoriteModels');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [showAllModels, setShowAllModels] = useState(true);
    const [teamConfigs, setTeamConfigs] = useState<Record<string, any>>({});
    const [userModelsConfig, setUserModelsConfig] = useState<{ providers: any[] }>({ providers: [] });
    const [modelWarning, setModelWarning] = useState<string | null>(null);
    const [pendingAddedModels, setPendingAddedModels] = useState<string[]>([]);
    const pendingAddedModelsRef = useRef(pendingAddedModels);
    useEffect(() => {
        pendingAddedModelsRef.current = pendingAddedModels;
    }, [pendingAddedModels]);
    const [fetchedProviderModels, setFetchedProviderModels] = useState<Record<string, string[]>>({});
    const fetchedProviderModelsRef = useRef(fetchedProviderModels);
    useEffect(() => {
        fetchedProviderModelsRef.current = fetchedProviderModels;
    }, [fetchedProviderModels]);
    // modelId -> context window, mirroring fetchedProviderModels. Kept separate so the
    // string[] shape other memos depend on is untouched.
    const [providerModelContext, setProviderModelContext] = useState<Record<string, Record<string, number>>>({});
    const [providerFetchLoading, setProviderFetchLoading] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let cancelled = false;
        const timers: number[] = [];
        const sleep = (ms: number) => new Promise<void>((resolve) => {
            timers.push(setTimeout(resolve, ms));
        });
        (async () => {
            for (let attempt = 0; ; attempt++) {
                try {
                    const config = await loadUserModelsConfig();
                    if (!cancelled) setUserModelsConfig(config);
                    return;
                } catch {
                    if (cancelled) return;
                    if (attempt >= LOAD_RETRY_DELAYS.length) {
                        if (!cancelled) setUserModelsConfig({ providers: [] });
                        return;
                    }
                    await sleep(LOAD_RETRY_DELAYS[attempt]);
                }
            }
        })();
        return () => {
            cancelled = true;
            timers.forEach((t) => clearTimeout(t));
        };
    }, []);

    const currentNpcObject = useMemo(() => {
        if (!currentNPC || availableNPCs.length === 0) return null;
        return availableNPCs.find((n: any) => n.value === currentNPC || n.name === currentNPC) || null;
    }, [currentNPC, availableNPCs]);

    useEffect(() => {
        if (!currentNPC || availableNPCs.length === 0) return;
        if (availableNPCs.some((n: any) => n.value === currentNPC)) return;
        const matched = availableNPCs.find((n: any) => n.name === currentNPC);
        if (matched) setCurrentNPC(matched.value);
    }, [currentNPC, availableNPCs]);

    const npcScopedModels = useMemo(() => {
        if (!currentNpcObject) return [];
        let m = currentNpcObject.model || null;
        let p = currentNpcObject.provider || null;
        if (!m || !p) {
            const tConf = currentNpcObject._teamConfig || teamConfigs[currentNpcObject.team];
            if (tConf) {
                if (!m) m = tConf.model || null;
                if (!p) p = tConf.provider || null;
            }
        }
        if (!m || !p) {
            return [];
        }
        return [{ value: m, display_name: `${m} | ${p}`, provider: p, context_window: providerModelContext[p]?.[m] ?? null }];
    }, [currentNpcObject, teamConfigs, providerModelContext]);

    const providerKey = providerKeyOf;

    const ctxProviders = useMemo(() => {
        // Prefer the live teamConfigs state (updated when the .ctx file changes) over the
        // static _teamConfig embedded on the NPC object.
        const tConf = (currentNpcObject?.team ? teamConfigs[currentNpcObject.team] : null) || currentNpcObject?._teamConfig;
        const teamProviders = Array.isArray(tConf?.providers) ? tConf.providers : [];
        const userProviders = Array.isArray(userModelsConfig.providers) ? userModelsConfig.providers : [];
        // Same gap-filling merge the team view uses, so a provider configured in
        // both places is not listed twice with different model sets.
        return mergeProviderEntries(teamProviders, userProviders);
    }, [currentNpcObject, teamConfigs, userModelsConfig]);

    useEffect(() => {
        let cancelled = false;
        const timers: number[] = [];
        const sleep = (ms: number) => new Promise<void>((resolve) => {
            timers.push(setTimeout(resolve, ms));
        });
        const fetchMissing = async () => {
            const nextLoading: Record<string, boolean> = {};
            const fetches: Promise<void>[] = [];
            for (const prov of ctxProviders) {
                const pKey = providerKey(prov);
                if (!pKey) continue;
                const allowedModels = Array.isArray(prov.models) ? prov.models : [];
                // Local providers (ollama &c) keep a hardcoded default list from
                // older builds; always re-discover those instead of trusting it.
                if (!shouldDiscoverProvider(pKey, allowedModels.length)) continue;
                if (fetchedProviderModelsRef.current[pKey] !== undefined) continue;
                nextLoading[pKey] = true;
                fetches.push((async () => {
                    for (let attempt = 0; ; attempt++) {
                        try {
                            const res = await (window as any).api?.getProviderModels?.({ provider: pKey });
                            const rawModels: any[] = res?.models || [];
                            const list: string[] = [];
                            const contextById: Record<string, number> = {};
                            for (const m of rawModels) {
                                const id = m?.id || m?.name || m?.value;
                                if (!id) continue;
                                list.push(id);
                                const ctx = m?.context_window ?? m?.context_length ?? m?.max_input_tokens;
                                if (typeof ctx === 'number' && ctx > 0) contextById[id] = ctx;
                            }
                            if (!cancelled) {
                                setFetchedProviderModels(prev => ({ ...prev, [pKey]: list }));
                                setProviderModelContext(prev => ({ ...prev, [pKey]: contextById }));
                            }
                            return;
                        } catch {
                            if (cancelled) return;
                            if (attempt >= LOAD_RETRY_DELAYS.length) {
                                if (!cancelled) {
                                    setFetchedProviderModels(prev => ({ ...prev, [pKey]: [] }));
                                }
                                return;
                            }
                            await sleep(LOAD_RETRY_DELAYS[attempt]);
                        }
                    }
                })());
            }
            setProviderFetchLoading(prev => ({ ...prev, ...nextLoading }));
            await Promise.all(fetches);
            if (!cancelled) {
                setProviderFetchLoading(prev => {
                    const cleaned = { ...prev };
                    for (const k of Object.keys(nextLoading)) delete cleaned[k];
                    return cleaned;
                });
                const pending = pendingAddedModelsRef.current;
                if (pending.length > 0) {
                    const pendingSet = new Set(pending);
                    const found = availableModelsFromTeamCtx.some((m: any) => pendingSet.has(m.value));
                    if (found) {
                        setPendingAddedModels([...pending]);
                    }
                }
            }
        };
        fetchMissing();
        return () => {
            cancelled = true;
            timers.forEach((t) => clearTimeout(t));
        };
    }, [ctxProviders]);

    const availableModelsFromTeamCtx = useMemo(() => {
        const perProvider: any[][] = [];
        for (const prov of ctxProviders) {
            const pKey = providerKey(prov);
            if (!pKey) continue;
            const allowedModels = Array.isArray(prov.models) ? prov.models : [];
            const fetched = fetchedProviderModels[pKey] || [];
            const ctxById = providerModelContext[pKey] || {};
            const effectiveModels = fetched.length > 0 ? fetched : allowedModels;
            const group: any[] = [];
            if (prov.model) {
                group.push({ value: prov.model, display_name: `${prov.model} | ${pKey}`, provider: pKey, context_window: ctxById[prov.model] ?? null });
            }
            for (const m of effectiveModels) {
                group.push({ value: m, display_name: `${m} | ${pKey}`, provider: pKey, context_window: ctxById[m] ?? null });
            }
            perProvider.push(group);
        }
        // Shared dedupe so casing ("Ollama" vs "ollama") cannot duplicate a model.
        return mergeModelLists(perProvider);
    }, [ctxProviders, fetchedProviderModels, providerModelContext]);

    const effectiveAvailableModels = useMemo(
        () => mergeModelLists([npcScopedModels, availableModelsFromTeamCtx]),
        [availableModelsFromTeamCtx, npcScopedModels]
    );

    useEffect(() => {
        setAvailableModels(effectiveAvailableModels);
    }, [effectiveAvailableModels]);

    const modelResolver = useMemo(() => {
        const isValid = (m: string | null) => !!m && effectiveAvailableModels.some((model: any) => model.value === m);
        const providerFor = (m: string) => effectiveAvailableModels.find((model: any) => model.value === m)?.provider || null;
        return { isValid, providerFor };
    }, [effectiveAvailableModels]);

    useEffect(() => {
        const { isValid, providerFor } = modelResolver;

        let desiredModel: string | null = null;
        let desiredProvider: string | null = null;
        let desiredSelectedModels: string[] | null = null;
        let pendingConsumed = false;

        if (pendingAddedModels.length > 0) {
            const validPending = pendingAddedModels.filter(isValid);
            if (validPending.length > 0) {
                desiredModel = validPending[0];
                desiredProvider = providerFor(desiredModel);
                desiredSelectedModels = [desiredModel];
                pendingConsumed = true;
            }
        }

        if (!desiredModel) {
            if (isValid(currentModel)) {
                desiredModel = currentModel;
                desiredProvider = providerFor(currentModel) || currentProvider;
            }
        }

        if (pendingConsumed) {
            setPendingAddedModels([]);
        }

        if (desiredModel !== currentModel || desiredProvider !== currentProvider) {
            setCurrentModel(desiredModel);
            setCurrentProvider(desiredProvider);
            setModelWarning(null);
        }
        if (desiredSelectedModels) {
            setSelectedModels(desiredSelectedModels);
        }
    }, [modelResolver, currentModel, currentProvider, pendingAddedModels]);


    useEffect(() => {
        if (effectiveAvailableModels.length === 0) {
            setSelectedModels([]);
            return;
        }
        setSelectedModels(prev => {
            if (prev.length === 0) {
                return currentModel ? [currentModel] : [];
            }
            const valid = prev.filter((v: string) => effectiveAvailableModels.some((m: any) => m.value === v));
            if (valid.length === 0) {
                return currentModel ? [currentModel] : [];
            }
            if (valid.length === prev.length) return prev;
            return valid;
        });
    }, [effectiveAvailableModels, currentModel]);

    useEffect(() => {
        if (currentNPC !== null) {
            localStorage.setItem('incognideCurrentNPC', JSON.stringify(currentNPC));
        }
    }, [currentNPC]);

    useEffect(() => {
        if (!broadcastMode) {
            setSelectedModels(prev => {
                if (prev.length === 0) {
                    return currentModel ? [currentModel] : [];
                }
                const valid = prev.filter((v: string) => effectiveAvailableModels.some((m: any) => m.value === v));
                if (valid.length === 0) {
                    return currentModel ? [currentModel] : [];
                }
                if (valid.length === prev.length) return prev;
                return valid;
            });
        }
    }, [currentModel, broadcastMode, effectiveAvailableModels]);

    useEffect(() => {
        if (!broadcastMode) {
            setSelectedNPCs(prev => {
                const next = currentNPC ? [currentNPC] : [];
                if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
                    return prev;
                }
                return next;
            });
        }
    }, [currentNPC, broadcastMode]);

    useEffect(() => {
        localStorage.setItem('incognideExecutionMode', JSON.stringify(executionMode));
    }, [executionMode]);

    const toggleFavoriteModel = (modelValue: string) => {
        if (!modelValue) return;
        setFavoriteModels(prev => {
            const newFavorites = new Set(prev);
            if (newFavorites.has(modelValue)) {
                newFavorites.delete(modelValue);
            } else {
                newFavorites.add(modelValue);
            }
            localStorage.setItem('incognideFavoriteModels', JSON.stringify(Array.from(newFavorites)));
            return newFavorites;
        });
    };

    const modelsToDisplay = useMemo(() => {
        if (favoriteModels.size === 0) return effectiveAvailableModels;
        if (showAllModels) return effectiveAvailableModels;
        return effectiveAvailableModels.filter((m: any) => favoriteModels.has(m.value));
    }, [effectiveAvailableModels, favoriteModels, showAllModels]);

    const reloadUserModelsConfig = async () => {
        try {
            const config = await loadUserModelsConfig();
            setUserModelsConfig(config);
        } catch {
        }
    };

    useEffect(() => {
        if (!(window as any).api?.onTeamConfigsUpdated) return;
        const cleanup = (window as any).api.onTeamConfigsUpdated(() => {
            reloadUserModelsConfig();
        });
        return cleanup;
    }, []);

    return {
        currentModel,
        setCurrentModel,
        currentProvider,
        setCurrentProvider,
        currentNPC,
        setCurrentNPC,
        selectedModels,
        setSelectedModels,
        selectedNPCs,
        setSelectedNPCs,
        broadcastMode,
        setBroadcastMode,
        availableModels,
        setAvailableModels,
        modelsLoading,
        setModelsLoading,
        modelsError,
        setModelsError,
        ollamaToolModels,
        setOllamaToolModels,
        availableNPCs,
        setAvailableNPCs,
        npcsLoading,
        setNpcsLoading,
        npcsError,
        setNpcsError,
        executionMode,
        setExecutionMode,
        favoriteModels,
        setFavoriteModels,
        showAllModels,
        setShowAllModels,
        toggleFavoriteModel,
        modelsToDisplay,
        teamConfigs,
        setTeamConfigs,
        modelWarning,
        setModelWarning,
        pendingAddedModels,
        setPendingAddedModels,
        userModelsConfig,
        reloadUserModelsConfig,
    };
}
