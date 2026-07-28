import { useState, useEffect, useMemo, useRef } from 'react';

export function useModelSelection() {
    const [currentModel, setCurrentModel] = useState<string | null>(() => {
        try { return JSON.parse(localStorage.getItem('incognideLastModel') || 'null'); } catch { return null; }
    });
    const [currentProvider, setCurrentProvider] = useState<string | null>(() => {
        try { return JSON.parse(localStorage.getItem('incognideLastProvider') || 'null'); } catch { return null; }
    });
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
    const [ollamaToolModels, setOllamaToolModels] = useState(new Set());
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
    const [modelWarning, setModelWarning] = useState<string | null>(null);
    const [pendingAddedModels, setPendingAddedModels] = useState<string[]>([]);
    const pendingAddedModelsRef = useRef(pendingAddedModels);
    useEffect(() => {
        pendingAddedModelsRef.current = pendingAddedModels;
    }, [pendingAddedModels]);
    const [fetchedProviderModels, setFetchedProviderModels] = useState<Record<string, string[]>>({});
    const [providerFetchLoading, setProviderFetchLoading] = useState<Record<string, boolean>>({});

    const currentNpcObject = useMemo(() => {
        if (!currentNPC || availableNPCs.length === 0) return null;
        return availableNPCs.find((n: any) => n.name === currentNPC || n.value === currentNPC) || null;
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
        return [{ value: m, display_name: `${m} | ${p}`, provider: p }];
    }, [currentNpcObject, teamConfigs]);

    const providerKey = (prov: any) => prov?.provider_type || prov?.name || prov?.provider || '';

    const ctxProviders = useMemo(() => {
        // Prefer the live teamConfigs state (updated when the .ctx file changes) over the
        // static _teamConfig embedded on the NPC object.
        const tConf = (currentNpcObject?.team ? teamConfigs[currentNpcObject.team] : null) || currentNpcObject?._teamConfig;
        return Array.isArray(tConf?.providers) ? tConf.providers : [];
    }, [currentNpcObject, teamConfigs]);

    useEffect(() => {
        let cancelled = false;
        const fetchMissing = async () => {
            const nextLoading: Record<string, boolean> = {};
            const fetches: Promise<void>[] = [];
            for (const prov of ctxProviders) {
                const pKey = providerKey(prov);
                if (!pKey) continue;
                const allowedModels = Array.isArray(prov.models) ? prov.models : [];
                if (allowedModels.length > 0) continue;
                if (fetchedProviderModels[pKey] !== undefined) continue;
                nextLoading[pKey] = true;
                fetches.push((async () => {
                    try {
                        const res = await (window as any).api?.getProviderModels?.({ provider: pKey });
                        const list = (res?.models || []).map((m: any) => m.id || m.name || m.value).filter(Boolean);
                        if (!cancelled) {
                            setFetchedProviderModels(prev => ({ ...prev, [pKey]: list }));
                        }
                    } catch {
                        if (!cancelled) {
                            setFetchedProviderModels(prev => ({ ...prev, [pKey]: [] }));
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
                // Re-evaluate pending models now that fetched models may be available.
                const pending = pendingAddedModelsRef.current;
                if (pending.length > 0) {
                    const pendingSet = new Set(pending);
                    const found = availableModelsFromTeamCtx.some((m: any) => pendingSet.has(m.value));
                    if (found) {
                        // Models are now present — rerun the selection effect by bumping state.
                        setPendingAddedModels([...pending]);
                    }
                }
            }
        };
        fetchMissing();
        return () => { cancelled = true; };
    }, [ctxProviders]);

    const availableModelsFromTeamCtx = useMemo(() => {
        const models: any[] = [];
        for (const prov of ctxProviders) {
            const pKey = providerKey(prov);
            if (!pKey) continue;
            const baseModel = prov.model;
            const allowedModels = Array.isArray(prov.models) ? prov.models : [];
            const seen = new Set<string>();
            if (baseModel && !seen.has(baseModel)) {
                seen.add(baseModel);
                models.push({ value: baseModel, display_name: `${baseModel} | ${pKey}`, provider: pKey });
            }
            const fetched = fetchedProviderModels[pKey] || [];
            const effectiveModels = allowedModels.length > 0 ? allowedModels : fetched;
            for (const m of effectiveModels) {
                if (!seen.has(m)) {
                    seen.add(m);
                    models.push({ value: m, display_name: `${m} | ${pKey}`, provider: pKey });
                }
            }
        }
        return models;
    }, [ctxProviders, fetchedProviderModels]);

    const effectiveAvailableModels = useMemo(() => {
        if (availableModelsFromTeamCtx.length > 0) return availableModelsFromTeamCtx;
        return npcScopedModels;
    }, [availableModelsFromTeamCtx, npcScopedModels]);

    useEffect(() => {
        setAvailableModels(effectiveAvailableModels);
    }, [effectiveAvailableModels]);

    useEffect(() => {
        if (effectiveAvailableModels.length === 0) {
            // If team providers are configured but their models are still being fetched,
            // keep the pending selection alive and don't wipe the current model yet.
            const stillFetching = ctxProviders.length > 0 && ctxProviders.some((prov: any) => {
                const pKey = providerKey(prov);
                const allowedModels = Array.isArray(prov.models) ? prov.models : [];
                if (allowedModels.length > 0) return false;
                return fetchedProviderModels[pKey] === undefined || providerFetchLoading[pKey];
            });
            if (ctxProviders.length === 0 && pendingAddedModels.length > 0) {
                setPendingAddedModels([]);
            }
            if (ctxProviders.length === 0 && !stillFetching) {
                if (!currentNPC || availableNPCs.length === 0) {
                    setCurrentModel(null);
                    setCurrentProvider(null);
                    setModelWarning(null);
                } else {
                    setCurrentModel(null);
                    setCurrentProvider(null);
                    setModelWarning(
                        currentNpcObject
                            ? `NPC "${currentNpcObject.name}" has no model configured. Set a model on the NPC or a team-wide default in the .ctx file.`
                        : `NPC "${currentNPC}" not found in loaded teams.`
                    );
                }
            } else if (pendingAddedModels.length > 0 && stillFetching) {
                // Don't return early; a subsequent run will match pending against fetched models.
            }
            return;
        }

        const isValid = (m: string | null) => !!m && effectiveAvailableModels.some((model: any) => model.value === m);
        const providerFor = (m: string) => effectiveAvailableModels.find((model: any) => model.value === m)?.provider || null;

        let desiredModel: string | null = null;
        let desiredProvider: string | null = null;
        let desiredSelectedModels: string[] | null = null;

        if (pendingAddedModels.length > 0) {
            const validPending = pendingAddedModels.filter(isValid);
            if (validPending.length > 0) {
                desiredModel = validPending[0];
                desiredProvider = providerFor(desiredModel);
                desiredSelectedModels = [desiredModel];
            } else if (effectiveAvailableModels.length > 0) {
                // Pending models don't match; fall back to first newly available model if
                // the current model isn't valid either, to avoid getting stuck on a stale
                // selection.
                if (!isValid(currentModel)) {
                    const first = effectiveAvailableModels[0];
                    desiredModel = first.value;
                    desiredProvider = first.provider;
                }
            }
            // Defer clearing pending until we are actually matching or have given up.
            if (desiredModel || effectiveAvailableModels.length > 0) {
                setPendingAddedModels([]);
            }
        }

        if (!desiredModel) {
            if (isValid(currentModel)) {
                desiredModel = currentModel;
                desiredProvider = providerFor(currentModel) || currentProvider;
            } else {
                try {
                    const globalLast = JSON.parse(localStorage.getItem('incognideLastModel') || 'null');
                    if (isValid(globalLast)) {
                        desiredModel = globalLast;
                        desiredProvider = providerFor(globalLast);
                    }
                } catch {}
            }
        }

        if (!desiredModel) {
            const first = effectiveAvailableModels[0];
            desiredModel = first.value;
            desiredProvider = first.provider;
        }

        if (desiredModel !== currentModel || desiredProvider !== currentProvider) {
            setCurrentModel(desiredModel);
            setCurrentProvider(desiredProvider);
            setModelWarning(null);
        }
        if (desiredSelectedModels) {
            setSelectedModels(desiredSelectedModels);
        }
    }, [effectiveAvailableModels, currentNPC, availableNPCs, currentNpcObject, currentModel, currentProvider, pendingAddedModels, ctxProviders, fetchedProviderModels, providerFetchLoading, availableModels]);

    useEffect(() => {
        try {
            if (currentModel) localStorage.setItem('incognideLastModel', JSON.stringify(currentModel));
            if (currentProvider) localStorage.setItem('incognideLastProvider', JSON.stringify(currentProvider));
        } catch {}
    }, [currentModel, currentProvider]);

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
    };
}
