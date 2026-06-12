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

    // Resolve model/provider from NPC -> team -> null whenever currentNPC or availableNPCs changes
    useEffect(() => {
        if (!currentNPC || availableNPCs.length === 0) {
            setCurrentModel(null);
            setCurrentProvider(null);
            setModelWarning(null);
            return;
        }
        const npc = availableNPCs.find((n: any) => n.name === currentNPC || n.value === currentNPC);
        if (!npc) {
            setModelWarning(`NPC "${currentNPC}" not found in loaded teams.`);
            return;
        }
        // Cascade: NPC config -> team config -> null
        let m = npc.model || null;
        let p = npc.provider || null;
        if (!m || !p) {
            const tConf = npc._teamConfig || teamConfigs[npc.team];
            if (tConf) {
                if (!m) m = tConf.model || null;
                if (!p) p = tConf.provider || null;
            }
        }
        if (m && p) {
            setCurrentModel(m);
            setCurrentProvider(p);
            setModelWarning(null);
        } else {
            setCurrentModel(null);
            setCurrentProvider(null);
            setModelWarning(
                `NPC "${npc.name}" has no model configured. Set a model on the NPC or a team-wide default in the .ctx file.`
            );
        }
    }, [currentNPC, availableNPCs, teamConfigs]);

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
        if (favoriteModels.size === 0) return availableModels;
        if (showAllModels) return availableModels;
        return availableModels.filter((m: any) => favoriteModels.has(m.value));
    }, [availableModels, favoriteModels, showAllModels]);

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
