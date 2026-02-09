import { useState, useEffect, useMemo } from 'react';

export function useModelSelection() {
    const [currentModel, setCurrentModel] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentModel');
        return saved ? JSON.parse(saved) : null;
    });
    const [currentProvider, setCurrentProvider] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentProvider');
        return saved ? JSON.parse(saved) : null;
    });
    const [currentNPC, setCurrentNPC] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentNPC');
        return saved ? JSON.parse(saved) : null;
    });
    const [selectedModels, setSelectedModels] = useState<string[]>(() => {
        const saved = localStorage.getItem('npcStudioCurrentModel');
        const model = saved ? JSON.parse(saved) : null;
        return model ? [model] : [];
    });
    const [selectedNPCs, setSelectedNPCs] = useState<string[]>(() => {
        const saved = localStorage.getItem('npcStudioCurrentNPC');
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
        const saved = localStorage.getItem('npcStudioExecutionMode');
        return saved ? JSON.parse(saved) : 'chat';
    });
    const [favoriteModels, setFavoriteModels] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('npcStudioFavoriteModels');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [showAllModels, setShowAllModels] = useState(true);

    // Save currentModel to localStorage when it changes
    useEffect(() => {
        if (currentModel !== null) {
            localStorage.setItem('npcStudioCurrentModel', JSON.stringify(currentModel));
        }
    }, [currentModel]);

    // Save currentProvider to localStorage when it changes
    useEffect(() => {
        if (currentProvider !== null) {
            localStorage.setItem('npcStudioCurrentProvider', JSON.stringify(currentProvider));
        }
    }, [currentProvider]);

    // Save currentNPC to localStorage when it changes
    useEffect(() => {
        if (currentNPC !== null) {
            localStorage.setItem('npcStudioCurrentNPC', JSON.stringify(currentNPC));
        }
    }, [currentNPC]);

    // Sync selectedModels with currentModel when currentModel changes (only if !broadcastMode)
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

    // Sync selectedNPCs with currentNPC when currentNPC changes (only if !broadcastMode)
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

    // Save executionMode to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('npcStudioExecutionMode', JSON.stringify(executionMode));
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
            localStorage.setItem('npcStudioFavoriteModels', JSON.stringify(Array.from(newFavorites)));
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
    };
}
