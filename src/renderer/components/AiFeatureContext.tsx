import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AiFeatureContextType {
    aiEnabled: boolean;
    userPath: 'no-ai' | 'cloud-ai' | 'local-ai';
    setAiEnabled: (enabled: boolean) => void;
    setUserPath: (path: 'no-ai' | 'cloud-ai' | 'local-ai') => void;
}

const AiFeatureContext = createContext<AiFeatureContextType>({
    aiEnabled: true,
    userPath: 'local-ai',
    setAiEnabled: () => {},
    setUserPath: () => {},
});

export const useAiEnabled = () => useContext(AiFeatureContext).aiEnabled;
export const useUserPath = () => useContext(AiFeatureContext).userPath;
export const useAiFeature = () => useContext(AiFeatureContext);

export const AiFeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [aiEnabled, setAiEnabledState] = useState(true);
    const [userPath, setUserPathState] = useState<'no-ai' | 'cloud-ai' | 'local-ai'>('local-ai');

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const profile = await (window as any).api?.profileGet?.();
                if (profile) {
                    setAiEnabledState(profile.aiEnabled ?? true);
                    setUserPathState(profile.path ?? 'local-ai');
                }
            } catch (err) {
                console.error('Error loading user profile:', err);
            }
        };
        loadProfile();
    }, []);

    const setAiEnabled = useCallback((enabled: boolean) => {
        setAiEnabledState(enabled);
        (window as any).api?.profileSave?.({ aiEnabled: enabled });
    }, []);

    const setUserPath = useCallback((path: 'no-ai' | 'cloud-ai' | 'local-ai') => {
        setUserPathState(path);
        const aiEnabled = path !== 'no-ai';
        setAiEnabledState(aiEnabled);
        (window as any).api?.profileSave?.({ path, aiEnabled });
    }, []);

    return (
        <AiFeatureContext.Provider value={{ aiEnabled, userPath, setAiEnabled, setUserPath }}>
            {children}
        </AiFeatureContext.Provider>
    );
};

export default AiFeatureContext;
