import { useState, useEffect, useMemo } from 'react';

export function useModelSelection() {
    const [currentModel, setCurrentModel] = useState(null);
    const [currentProvider, setCurrentProvider] = useState(null);
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

    const ctxProviders = useMemo(() => {
        const tConf = currentNpcObject?._teamConfig || (currentNpcObject?.team ? teamConfigs[currentNpcObject.team] : null);
        return Array.isArray(tConf?.providers) ? tConf.providers : [];
    }, [currentNpcObject, teamConfigs]);

    useEffect(() => {
        let cancelled = false;
        const fetchMissing = async () => {
            const nextLoading: Record<string, boolean> = {};
            const fetches: Promise<void>[] = [];
            for (const prov of ctxProviders) {
                const providerName = prov.name;
                const allowedModels = Array.isArray(prov.models) ? prov.models : [];
                if (allowedModels.length > 0) continue;
                if (fetchedProviderModels[providerName] !== undefined) continue;
                nextLoading[providerName] = true;
                fetches.push((async () => {
                    try {
                        const res = await (window as any).api?.getProviderModels?.({ provider: providerName });
                        const list = (res?.models || []).map((m: any) => m.id || m.name || m.value).filter(Boolean);
                        if (!cancelled) {
                            setFetchedProviderModels(prev => ({ ...prev, [providerName]: list }));
                        }
                    } catch {
                        if (!cancelled) {
                            setFetchedProviderModels(prev => ({ ...prev, [providerName]: [] }));
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
            }
        };
        fetchMissing();
        return () => { cancelled = true; };
    }, [ctxProviders]);

    const availableModelsFromTeamCtx = useMemo(() => {
        const models: any[] = [];
        for (const prov of ctxProviders) {
            const providerName = prov.name;
            const baseModel = prov.model;
            const allowedModels = Array.isArray(prov.models) ? prov.models : [];
            const seen = new Set<string>();
            if (baseModel && !seen.has(baseModel)) {
                seen.add(baseModel);
                models.push({ value: baseModel, display_name: `${baseModel} | ${providerName}`, provider: providerName });
            }
            const effectiveModels = allowedModels.length > 0 ? allowedModels : (fetchedProviderModels[providerName] || []);
            for (const m of effectiveModels) {
                if (!seen.has(m)) {
                    seen.add(m);
                    models.push({ value: m, display_name: `${m} | ${providerName}`, provider: providerName });
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
        if (effectiveAvailableModels.length > 0) {
            const first = effectiveAvailableModels[0];
            setCurrentModel(first.value);
            setCurrentProvider(first.provider);
            setModelWarning(null);
        } else if (!currentNPC || availableNPCs.length === 0) {
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
    }, [effectiveAvailableModels, currentNPC, availableNPCs, currentNpcObject]);

    useEffect(() => {
        if (effectiveAvailableModels.length === 0) {
            setSelectedModels([]);
            return;
        }
        setSelectedModels(prev => {
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
                const next = currentModel ? [currentModel] : [];
                if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
                    return prev;
                }
                return next;
            });
        }
    }, [currentModel, broadcastMode]);

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
    };
}
