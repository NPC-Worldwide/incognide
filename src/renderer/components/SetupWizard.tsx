import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Package, Check, AlertCircle, RefreshCw, ChevronRight, Sparkles, Cpu, Mic, Zap, Box, Wand2, Bot, ChevronLeft, Info, Server, HardDrive, X, Folder, Cloud, KeyRound } from 'lucide-react';

interface PythonInfo {
    name: string;
    cmd: string;
    version: string;
    path: string;
}

interface SetupWizardProps {
    onComplete: () => void;
}

interface InstallOption {
    id: string;
    name: string;
    description: string;
    extras: string;
    icon: React.ReactNode;
    recommended?: boolean;
}

type UserPath = 'no-ai' | 'cloud-ai' | 'local-ai';

interface ModelInfo {
    provider: string;
    models: string[];
    available: boolean;
}

const INSTALL_OPTIONS: InstallOption[] = [
    {
        id: 'lite',
        name: 'Lite',
        description: 'Minimal install - basic features only',
        extras: 'lite',
        icon: <Zap size={20} className="text-yellow-400" />,
    },
    {
        id: 'local',
        name: 'Local AI',
        description: 'Local models with Ollama, image generation with diffusers/torch',
        extras: 'local',
        icon: <Cpu size={20} className="text-blue-400" />,
        recommended: true,
    },
    {
        id: 'yap',
        name: 'Voice (TTS/STT)',
        description: 'Text-to-speech and speech-to-text capabilities',
        extras: 'yap',
        icon: <Mic size={20} className="text-green-400" />,
    },
    {
        id: 'all',
        name: 'Everything',
        description: 'All features including local AI, voice, and extras',
        extras: 'all',
        icon: <Box size={20} className="text-purple-400" />,
    },
];

type SetupStep = 'welcome' | 'path' | 'cloud-keys' | 'extras' | 'models' | 'creating' | 'installing' | 'concepts' | 'complete' | 'error';

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    // Path selection
    const [userPath, setUserPath] = useState<UserPath>('local-ai');

    // Python/install state
    const [detectedPythons, setDetectedPythons] = useState<PythonInfo[]>([]);
    const [selectedPython, setSelectedPython] = useState<PythonInfo | null>(null);
    const [selectedExtras, setSelectedExtras] = useState<string>('local');
    const [pythonPath, setPythonPath] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [installOutput, setInstallOutput] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Model detection state
    const [detectedModels, setDetectedModels] = useState<ModelInfo[]>([]);
    const [checkingModels, setCheckingModels] = useState(false);
    const [platform, setPlatform] = useState<string>('');
    const [homebrewAvailable, setHomebrewAvailable] = useState(false);
    const [xcodeAvailable, setXcodeAvailable] = useState(false);
    const [installingOllama, setInstallingOllama] = useState(false);
    const [installingHomebrew, setInstallingHomebrew] = useState(false);
    const [installingXcode, setInstallingXcode] = useState(false);
    const [installError, setInstallError] = useState<string | null>(null);
    const [installMessage, setInstallMessage] = useState<string | null>(null);

    // Cloud API key state
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

    // Step state
    const [step, setStep] = useState<SetupStep>('welcome');

    // NPC images path
    const [npcImagesPath, setNpcImagesPath] = useState<string>('');

    // Auto-scroll log container
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [installOutput]);

    // Detect Python on mount
    useEffect(() => {
        const detect = async () => {
            try {
                const result = await (window as any).api?.setupDetectPython?.();
                if (result?.pythons) {
                    setDetectedPythons(result.pythons);
                    if (result.pythons.length > 0) {
                        setSelectedPython(result.pythons[0]);
                    }
                }
            } catch (err) {
                console.error('Error detecting Python:', err);
            }
        };
        detect();
    }, []);

    // Get NPC images path
    useEffect(() => {
        const getPath = async () => {
            try {
                const path = await (window as any).api?.getNpcImagesPath?.();
                if (path) setNpcImagesPath(path);
            } catch (err) {
                console.error('Error getting NPC images path:', err);
            }
        };
        getPath();
    }, []);

    // Check platform and tools
    useEffect(() => {
        const check = async () => {
            try {
                const platformResult = await (window as any).api?.getPlatform?.();
                if (platformResult?.platform) setPlatform(platformResult.platform);
                const brewResult = await (window as any).api?.checkHomebrew?.();
                if (brewResult?.available) setHomebrewAvailable(true);
                const xcodeResult = await (window as any).api?.checkXcode?.();
                if (xcodeResult?.available) setXcodeAvailable(true);
            } catch (err) {
                console.error('Error checking platform/tools:', err);
            }
        };
        check();
    }, []);

    // Listen for install progress
    useEffect(() => {
        const unsubscribe = (window as any).api?.onSetupInstallProgress?.((data: { type: string; text: string }) => {
            if (data.text) {
                const lines = data.text.split('\n').filter((line: string) => line.trim());
                if (lines.length > 0) {
                    setInstallOutput(prev => [...prev, ...lines].slice(-100));
                }
            }
        });
        return () => unsubscribe?.();
    }, []);

    // Check local models
    const checkLocalModels = async () => {
        setCheckingModels(true);
        setInstallError(null);
        try {
            const result = await (window as any).api?.detectLocalModels?.();
            if (result?.models) setDetectedModels(result.models);
        } catch (err) {
            console.error('Error detecting models:', err);
        }
        setCheckingModels(false);
    };

    // Install Ollama
    const handleInstallOllama = async (method?: string) => {
        setInstallingOllama(true);
        setInstallError(null);
        setInstallMessage(null);
        try {
            const result = await (window as any).api?.installOllama?.(method);
            if (result?.success) {
                await checkLocalModels();
                setInstallMessage(result.message);
            } else if (result?.openDownload) {
                (window as any).api?.openExternal?.(result.downloadUrl);
                setInstallMessage(result.message || 'Download page opened. Install Ollama, then click Refresh.');
            } else {
                setInstallError(result?.error || 'Failed to install Ollama');
            }
        } catch (err: any) {
            setInstallError(err.message || 'Failed to install Ollama');
        }
        setInstallingOllama(false);
    };

    // Install Xcode CLT
    const handleInstallXcode = async () => {
        setInstallingXcode(true);
        setInstallError(null);
        try {
            const result = await (window as any).api?.installXcode?.();
            if (result?.success) setInstallMessage(result.message);
            else setInstallError(result?.error || 'Failed to open Xcode installer');
        } catch (err: any) {
            setInstallError(err.message || 'Failed to install Xcode');
        }
        setInstallingXcode(false);
    };

    // Install Homebrew
    const handleInstallHomebrew = async () => {
        setInstallingHomebrew(true);
        setInstallError(null);
        try {
            const result = await (window as any).api?.installHomebrew?.();
            if (result?.success) setHomebrewAvailable(true);
            else setInstallError(result?.error || 'Failed to install Homebrew');
        } catch (err: any) {
            setInstallError(err.message || 'Failed to install Homebrew');
        }
        setInstallingHomebrew(false);
    };

    // Determine extras based on path
    const getExtrasForPath = (): string => {
        if (userPath === 'no-ai') return 'lite';
        if (userPath === 'cloud-ai') return selectedExtras === 'local' ? 'lite' : selectedExtras;
        return selectedExtras;
    };

    // Start installation
    const handleStartInstall = async () => {
        setError(null);
        setInstallOutput([]);
        setStep('creating');
        setInstallOutput(['Creating virtual environment at ~/.npcsh/incognide/venv...']);

        try {
            const result = await (window as any).api?.setupCreateVenv?.();
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to create virtual environment');
            }
            setInstallOutput(prev => [...prev, result.message || 'Virtual environment created']);
            setPythonPath(result.pythonPath);
            await installNpcpy(result.pythonPath);
        } catch (err: any) {
            setError(err.message);
            setStep('error');
        }
    };

    const installNpcpy = async (path: string) => {
        setStep('installing');
        const extras = getExtrasForPath();
        const packageSpec = `npcpy[${extras}]`;
        setInstallOutput(prev => [...prev, `Installing ${packageSpec}...`]);
        setInstallOutput(prev => [...prev, 'This may take several minutes...']);

        try {
            const result = await (window as any).api?.setupInstallNpcpy?.(path, extras);
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to install npcpy');
            }
            setInstallOutput(prev => [...prev, `${packageSpec} installed successfully!`]);
            await completeSetup(path);
        } catch (err: any) {
            setError(err.message);
            setStep('error');
        }
    };

    const completeSetup = async (path: string) => {
        setInstallOutput(prev => [...prev, 'Saving configuration...']);

        try {
            // Save user profile with chosen path
            const aiEnabled = userPath !== 'no-ai';
            await (window as any).api?.profileSave?.({
                path: userPath,
                aiEnabled,
                extras: getExtrasForPath(),
                setupComplete: true,
                tutorialComplete: false,
            });

            // Save any API keys entered
            if (userPath === 'cloud-ai' && Object.keys(apiKeys).length > 0) {
                for (const [key, value] of Object.entries(apiKeys)) {
                    if (value.trim()) {
                        await (window as any).api?.saveGlobalSetting?.(key, value.trim());
                    }
                }
            }

            const result = await (window as any).api?.setupComplete?.(path);
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to complete setup');
            }

            setInstallOutput(prev => [...prev, 'Starting backend...']);

            const restartResult = await (window as any).api?.setupRestartBackend?.();
            if (!restartResult?.success) {
                setInstallOutput(prev => [...prev, 'Note: Backend will start on next app launch']);
            } else {
                setInstallOutput(prev => [...prev, 'Backend started successfully!']);
            }

            // Deploy NPC team
            setInstallOutput(prev => [...prev, 'Setting up NPC team...']);
            try {
                await (window as any).api?.deployNpcTeam?.();
                setInstallOutput(prev => [...prev, 'NPC team deployed successfully!']);
            } catch (err) {
                setInstallOutput(prev => [...prev, 'Note: NPC team will be set up on next launch']);
            }

            // For AI paths, show concepts screen; for no-ai, go straight to complete
            if (userPath !== 'no-ai') {
                setStep('concepts');
            } else {
                setStep('complete');
            }
        } catch (err: any) {
            setError(err.message);
            setStep('error');
        }
    };

    const handleSkip = async () => {
        setLoading(true);
        try {
            await (window as any).api?.setupSkip?.();
            onComplete();
        } catch (err) {
            console.error('Error skipping setup:', err);
            onComplete();
        }
    };

    // Navigate from path selection to the next appropriate step
    const handlePathNext = () => {
        if (userPath === 'no-ai') {
            handleStartInstall();
        } else if (userPath === 'cloud-ai') {
            setStep('cloud-keys');
        } else {
            // local-ai — skip extras, default to 'local', go straight to models
            setSelectedExtras('local');
            setStep('models');
            checkLocalModels();
        }
    };

    // Navigate from cloud keys to install
    const handleCloudKeysNext = () => {
        handleStartInstall();
    };

    // Navigate from extras to models
    const handleExtrasNext = async () => {
        setStep('models');
        await checkLocalModels();
    };

    // ─── RENDER FUNCTIONS ───────────────────────────────────────

    const renderWelcome = () => (
        <div className="space-y-6">
            <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <Sparkles size={32} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Welcome to Incognide</h1>
                <p className="text-gray-400">Your personal workspace</p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-300">
                Incognide is a workspace for files, code, documents, browsing, and optionally AI-powered tools.
                Let's get you set up.
            </div>

            <button
                onClick={() => setStep('path')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
                Get Started <ChevronRight size={18} />
            </button>

            <button
                onClick={handleSkip}
                disabled={loading}
                className="w-full text-sm text-gray-500 hover:text-gray-400"
            >
                Skip for now
            </button>
        </div>
    );

    const renderPathSelection = () => (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">How do you want to use Incognide?</h2>
                <p className="text-gray-400 text-sm">You can change this anytime in Settings</p>
            </div>

            <div className="space-y-3">
                {/* Workspace (no AI) */}
                <button
                    onClick={() => setUserPath('no-ai')}
                    className={`w-full p-4 rounded-lg text-left border transition-all ${
                        userPath === 'no-ai'
                            ? 'border-blue-500/50 bg-blue-600/20'
                            : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Folder size={20} className="text-gray-300" />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-white">Workspace</div>
                            <div className="text-sm text-gray-400 mt-0.5">Files, editor, terminal, browser, documents — no AI</div>
                        </div>
                        {userPath === 'no-ai' && <Check size={20} className="text-blue-400 flex-shrink-0 mt-1" />}
                    </div>
                </button>

                {/* Cloud AI */}
                <button
                    onClick={() => setUserPath('cloud-ai')}
                    className={`w-full p-4 rounded-lg text-left border transition-all ${
                        userPath === 'cloud-ai'
                            ? 'border-blue-500/50 bg-blue-600/20'
                            : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Cloud size={20} className="text-blue-300" />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-white">Cloud AI</div>
                            <div className="text-sm text-gray-400 mt-0.5">Use OpenAI, Anthropic, Gemini — no local setup needed</div>
                        </div>
                        {userPath === 'cloud-ai' && <Check size={20} className="text-blue-400 flex-shrink-0 mt-1" />}
                    </div>
                </button>

                {/* Local AI */}
                <button
                    onClick={() => setUserPath('local-ai')}
                    className={`w-full p-4 rounded-lg text-left border transition-all ${
                        userPath === 'local-ai'
                            ? 'border-blue-500/50 bg-blue-600/20'
                            : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-700 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Cpu size={20} className="text-purple-300" />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-white">Local AI</div>
                            <div className="text-sm text-gray-400 mt-0.5">Run models locally with Ollama — private and offline</div>
                        </div>
                        {userPath === 'local-ai' && <Check size={20} className="text-blue-400 flex-shrink-0 mt-1" />}
                    </div>
                </button>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => setStep('welcome')}
                    className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1"
                >
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handlePathNext}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                    Continue <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );

    const renderCloudKeys = () => (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">API Keys (Optional)</h2>
                <p className="text-gray-400 text-sm">Add keys now or later in Settings</p>
            </div>

            <div className="space-y-3">
                {[
                    { key: 'OPENAI_API_KEY', label: 'OpenAI', placeholder: 'sk-...' },
                    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic', placeholder: 'sk-ant-...' },
                    { key: 'GEMINI_API_KEY', label: 'Google Gemini', placeholder: 'AI...' },
                ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                        <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
                        <input
                            type="password"
                            value={apiKeys[key] || ''}
                            onChange={(e) => setApiKeys(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                ))}
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
                <KeyRound size={12} className="inline mr-1" />
                Keys are stored locally and never sent anywhere except the provider's API.
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => setStep('path')}
                    className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1"
                >
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handleCloudKeysNext}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                    {Object.values(apiKeys).some(v => v.trim()) ? 'Install' : "I'll do this later"} <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );

    const renderExtras = () => (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Choose Features</h2>
                <p className="text-gray-400 text-sm">Select which capabilities to install</p>
            </div>

            <div className="space-y-3">
                {INSTALL_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => setSelectedExtras(option.extras)}
                        className={`w-full p-4 rounded-lg text-left border transition-all ${
                            selectedExtras === option.extras
                                ? 'border-blue-500/50 bg-blue-600/20'
                                : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                                {option.icon}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">{option.name}</span>
                                    {option.recommended && (
                                        <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded">Recommended</span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-400 mt-1">{option.description}</div>
                            </div>
                            {selectedExtras === option.extras && (
                                <Check size={20} className="text-blue-400 flex-shrink-0" />
                            )}
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => setStep('path')}
                    className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1"
                >
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handleExtrasNext}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                    Next <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );

    const renderModels = () => (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Local Models</h2>
                <p className="text-gray-400 text-sm">Run AI models on your machine</p>
            </div>

            {checkingModels ? (
                <div className="text-center py-8">
                    <RefreshCw size={24} className="animate-spin mx-auto text-blue-400 mb-3" />
                    <p className="text-sm text-gray-400">Checking for local model providers...</p>
                </div>
            ) : (
                <>
                    <div className="space-y-3">
                        {/* Ollama */}
                        <div className={`p-3 rounded-lg border ${detectedModels.find(m => m.provider === 'ollama')?.available ? 'border-green-500/50 bg-green-900/20' : 'border-gray-700 bg-gray-800/50'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Server size={18} className={detectedModels.find(m => m.provider === 'ollama')?.available ? 'text-green-400' : 'text-gray-500'} />
                                    <span className="font-medium text-white">Ollama</span>
                                </div>
                                {detectedModels.find(m => m.provider === 'ollama')?.available ? (
                                    <span className="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded">Detected</span>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleInstallOllama()}
                                            disabled={installingOllama}
                                            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                                        >
                                            {installingOllama ? <><RefreshCw size={10} className="animate-spin" /> ...</> : 'Download'}
                                        </button>
                                        {platform === 'darwin' && homebrewAvailable && (
                                            <button
                                                onClick={() => handleInstallOllama('brew')}
                                                disabled={installingOllama}
                                                className="text-xs bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white px-2 py-0.5 rounded"
                                                title="Install via Homebrew"
                                            >
                                                brew
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-gray-400">Easy-to-use local model server</p>
                            {detectedModels.find(m => m.provider === 'ollama')?.models?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {detectedModels.find(m => m.provider === 'ollama')?.models.slice(0, 4).map(model => (
                                        <span key={model} className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{model}</span>
                                    ))}
                                    {(detectedModels.find(m => m.provider === 'ollama')?.models.length || 0) > 4 && (
                                        <span className="text-[10px] text-gray-500">+{(detectedModels.find(m => m.provider === 'ollama')?.models.length || 0) - 4} more</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* LM Studio */}
                        <div className={`p-3 rounded-lg border ${detectedModels.find(m => m.provider === 'lmstudio')?.available ? 'border-green-500/50 bg-green-900/20' : 'border-gray-700 bg-gray-800/50'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <HardDrive size={18} className={detectedModels.find(m => m.provider === 'lmstudio')?.available ? 'text-green-400' : 'text-gray-500'} />
                                    <span className="font-medium text-white">LM Studio</span>
                                </div>
                                {detectedModels.find(m => m.provider === 'lmstudio')?.available ? (
                                    <span className="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded">Detected</span>
                                ) : (
                                    <span className="text-xs text-gray-500">Not found</span>
                                )}
                            </div>
                            <p className="text-xs text-gray-400">GUI for running GGUF models</p>
                        </div>
                    </div>

                    {/* Mac-specific helpers */}
                    {platform === 'darwin' && !xcodeAvailable && (
                        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-blue-300 font-medium">Xcode Command Line Tools</p>
                                <button
                                    onClick={handleInstallXcode}
                                    disabled={installingXcode}
                                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-0.5 rounded"
                                >
                                    {installingXcode ? 'Opening...' : 'Install'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400">Recommended for compiling packages.</p>
                        </div>
                    )}

                    {platform === 'darwin' && !homebrewAvailable && (
                        <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-gray-300 font-medium">Homebrew (optional)</p>
                                <button
                                    onClick={handleInstallHomebrew}
                                    disabled={installingHomebrew}
                                    className="text-xs bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white px-2 py-0.5 rounded"
                                >
                                    {installingHomebrew ? <><RefreshCw size={10} className="animate-spin" /> Installing...</> : 'Install'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500">Package manager for macOS.</p>
                        </div>
                    )}

                    {installMessage && (
                        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                            <p className="text-xs text-blue-300">{installMessage}</p>
                        </div>
                    )}

                    {installError && (
                        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                            <p className="text-xs text-red-300">{installError}</p>
                        </div>
                    )}

                    <button
                        onClick={checkLocalModels}
                        className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={14} /> Refresh detection
                    </button>
                </>
            )}

            <div className="flex gap-3">
                <button
                    onClick={() => setStep('path')}
                    className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1"
                >
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handleStartInstall}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                    Install <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );

    const renderInstalling = () => (
        <div className="space-y-4">
            <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-600 rounded-xl flex items-center justify-center">
                    <RefreshCw size={24} className="text-white animate-spin" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">
                    {step === 'creating' ? 'Creating Environment' : 'Installing Packages'}
                </h2>
                <p className="text-gray-400 text-xs">This may take several minutes...</p>
            </div>

            <div
                ref={logContainerRef}
                className="bg-gray-900 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs"
            >
                {installOutput.length === 0 ? (
                    <div className="text-gray-500">Waiting for output...</div>
                ) : (
                    installOutput.map((line, idx) => (
                        <div key={idx} className="text-gray-400 whitespace-pre-wrap break-all">{line}</div>
                    ))
                )}
            </div>

            <button
                onClick={() => {
                    if (userPath !== 'no-ai') {
                        setStep('concepts');
                    } else {
                        setStep('complete');
                    }
                }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
                Skip — continue in background
            </button>
        </div>
    );

    const renderConcepts = () => (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Meet Your AI Team</h2>
                <p className="text-gray-400 text-sm">AI assistants and tools at your fingertips</p>
            </div>

            {/* Ledbi - the Incognide forenpc */}
            <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                    {npcImagesPath ? (
                        <img
                            src={`file://${npcImagesPath}/ledbi.png`}
                            alt="Ledbi"
                            className="w-14 h-14 rounded-xl object-cover"
                            style={{ borderColor: 'rgb(139,69,19)', borderWidth: 2 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : null}
                    <div>
                        <h3 className="font-bold text-white text-lg">Ledbi</h3>
                        <p className="text-xs text-amber-400">Your UI Assistant</p>
                    </div>
                </div>
                <p className="text-sm text-gray-300 mb-2">
                    A loyal helper who manages your workspace — opens panes, navigates browsers, and keeps things organized.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {['open_pane', 'close_pane', 'navigate', 'notify'].map(jinx => (
                        <span key={jinx} className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded">{jinx}</span>
                    ))}
                </div>
            </div>

            {/* Quick concepts */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Bot size={16} className="text-purple-400" />
                        <h4 className="font-semibold text-white text-sm">NPCs</h4>
                    </div>
                    <p className="text-xs text-gray-400">
                        AI personas with specific roles and skills. Chat with them or let them work autonomously.
                    </p>
                </div>
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Wand2 size={16} className="text-green-400" />
                        <h4 className="font-semibold text-white text-sm">Jinxs</h4>
                    </div>
                    <p className="text-xs text-gray-400">
                        Reusable action templates — search, browse, summarize, run code, and more.
                    </p>
                </div>
            </div>

            <button
                onClick={() => setStep('complete')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
                Let's Go <ChevronRight size={18} />
            </button>
        </div>
    );

    const renderComplete = () => (
        <div className="space-y-6">
            <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-600 rounded-2xl flex items-center justify-center">
                    <Check size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">You're All Set!</h2>
                <p className="text-gray-400 text-sm">
                    {userPath === 'no-ai'
                        ? 'Your workspace is ready'
                        : 'Your AI-powered workspace is ready'
                    }
                </p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-green-400">
                    <Check size={14} />
                    <span>Environment created</span>
                </div>
                <div className="flex items-center gap-2 text-green-400">
                    <Check size={14} />
                    <span>npcpy installed</span>
                </div>
                {userPath !== 'no-ai' && (
                    <div className="flex items-center gap-2 text-green-400">
                        <Check size={14} />
                        <span>AI features enabled ({userPath === 'cloud-ai' ? 'Cloud' : 'Local'})</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-green-400">
                    <Check size={14} />
                    <span>NPC team deployed</span>
                </div>
            </div>

            <button
                onClick={onComplete}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
            >
                Start Using Incognide
            </button>
        </div>
    );

    const renderError = () => (
        <div className="space-y-6">
            <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-red-600 rounded-2xl flex items-center justify-center">
                    <AlertCircle size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Setup Failed</h2>
                <p className="text-gray-400 text-sm">Something went wrong</p>
            </div>

            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                <p className="text-sm text-red-400">{error}</p>
            </div>

            {installOutput.length > 0 && (
                <details className="text-xs">
                    <summary className="text-gray-500 cursor-pointer hover:text-gray-400">Show install log</summary>
                    <div className="bg-gray-900 rounded-lg p-3 mt-2 h-32 overflow-y-auto font-mono">
                        {installOutput.map((line, idx) => (
                            <div key={idx} className="text-gray-500 whitespace-pre-wrap break-all">{line}</div>
                        ))}
                    </div>
                </details>
            )}

            <div className="flex gap-3">
                <button
                    onClick={() => {
                        setError(null);
                        setInstallOutput([]);
                        setStep('path');
                    }}
                    className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                    Try Again
                </button>
                <button
                    onClick={handleSkip}
                    className="flex-1 py-2 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
                >
                    Skip Setup
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-gray-900 flex items-center justify-center p-4 z-[9999] overflow-auto">
            <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl my-auto">
                {step === 'welcome' && renderWelcome()}
                {step === 'path' && renderPathSelection()}
                {step === 'cloud-keys' && renderCloudKeys()}
                {step === 'extras' && renderExtras()}
                {step === 'models' && renderModels()}
                {(step === 'creating' || step === 'installing') && renderInstalling()}
                {step === 'concepts' && renderConcepts()}
                {step === 'complete' && renderComplete()}
                {step === 'error' && renderError()}
            </div>
        </div>
    );
};

export default SetupWizard;
