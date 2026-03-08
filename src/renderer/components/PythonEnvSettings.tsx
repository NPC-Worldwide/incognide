import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, AlertCircle, Terminal, Folder, ChevronDown, Package, Plus, Trash2, Download } from 'lucide-react';

interface PythonEnv {
    type: 'system' | 'venv' | 'pyenv' | 'conda' | 'uv' | 'custom';
    name: string;
    path: string | null;
    venvPath?: string;
    pyenvVersion?: string;
    condaEnv?: string;
    condaRoot?: string;
    notInstalled?: boolean;
    hint?: string;
}

interface PythonEnvConfig {
    type: 'system' | 'venv' | 'pyenv' | 'conda' | 'uv' | 'custom';
    venvPath?: string;
    pyenvVersion?: string;
    condaEnv?: string;
    condaRoot?: string;
    customPath?: string;
}

interface InstalledPackage {
    name: string;
    version: string;
}

interface PythonEnvSettingsProps {
    currentPath: string;
    onClose?: () => void;
    compact?: boolean;
}

const PACKAGE_BUNDLES = {
    'torch-cpu': { name: 'PyTorch (CPU)', packages: ['torch', 'torchvision', 'torchaudio'] },
    'torch-cuda': { name: 'PyTorch (CUDA)', packages: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121'] },
    'diffusers': { name: 'Diffusers (Image Gen)', packages: ['diffusers', 'transformers', 'accelerate', 'safetensors'] },
    'transformers': { name: 'Transformers (LLM)', packages: ['transformers', 'accelerate', 'safetensors', 'sentencepiece'] },
    'whisper': { name: 'Whisper (Speech)', packages: ['openai-whisper'] },
};

const PythonEnvSettings: React.FC<PythonEnvSettingsProps> = ({ currentPath, onClose, compact = false }) => {
    const [detectedEnvs, setDetectedEnvs] = useState<PythonEnv[]>([]);
    const [currentConfig, setCurrentConfig] = useState<PythonEnvConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [showCreateVenv, setShowCreateVenv] = useState(false);
    const [customPath, setCustomPath] = useState('');
    const [newVenvName, setNewVenvName] = useState('.venv');

    const [showPackages, setShowPackages] = useState(false);
    const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
    const [loadingPackages, setLoadingPackages] = useState(false);
    const [installingPackage, setInstallingPackage] = useState(false);
    const [newPackageName, setNewPackageName] = useState('');
    const [packageFilter, setPackageFilter] = useState('');

    const loadConfig = useCallback(async () => {
        if (!currentPath) return;
        try {
            const config = await (window as any).api?.pythonEnvGet?.(currentPath);
            setCurrentConfig(config);
            if (config?.type === 'custom') {
                setShowCustomInput(true);
                setCustomPath(config.customPath || '');
            }
        } catch (err) {
            console.error('Error loading python env config:', err);
        }
    }, [currentPath]);

    const loadPackages = useCallback(async () => {
        if (!currentPath) return;
        setLoadingPackages(true);
        try {
            const packages = await (window as any).api?.pythonEnvListPackages?.(currentPath);
            setInstalledPackages(packages || []);
        } catch (err) {
            console.error('Error loading packages:', err);
        } finally {
            setLoadingPackages(false);
        }
    }, [currentPath]);

    const installPackage = async (packageName: string, extraArgs: string[] = []) => {
        if (!currentPath || !packageName.trim()) return;
        setInstallingPackage(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await (window as any).api?.pythonEnvInstallPackage?.(currentPath, packageName.trim(), extraArgs);
            if (result?.success) {
                setSuccess(`Installed ${packageName} successfully`);
                setNewPackageName('');
                await loadPackages();
            } else {
                setError(result?.error || `Failed to install ${packageName}`);
            }
        } catch (err) {
            console.error('Error installing package:', err);
            setError(`Failed to install ${packageName}`);
        } finally {
            setInstallingPackage(false);
        }
    };

    const installBundle = async (bundleKey: string) => {
        const bundle = PACKAGE_BUNDLES[bundleKey as keyof typeof PACKAGE_BUNDLES];
        if (!bundle) return;

        setInstallingPackage(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await (window as any).api?.pythonEnvInstallPackage?.(currentPath, bundle.packages.join(' '), []);
            if (result?.success) {
                setSuccess(`Installed ${bundle.name} successfully`);
                await loadPackages();
            } else {
                setError(result?.error || `Failed to install ${bundle.name}`);
            }
        } catch (err) {
            console.error('Error installing bundle:', err);
            setError(`Failed to install ${bundle.name}`);
        } finally {
            setInstallingPackage(false);
        }
    };

    const uninstallPackage = async (packageName: string) => {
        if (!currentPath || !packageName) return;
        setInstallingPackage(true);
        setError(null);
        try {
            const result = await (window as any).api?.pythonEnvUninstallPackage?.(currentPath, packageName);
            if (result?.success) {
                setSuccess(`Uninstalled ${packageName}`);
                await loadPackages();
            } else {
                setError(result?.error || `Failed to uninstall ${packageName}`);
            }
        } catch (err) {
            console.error('Error uninstalling package:', err);
            setError(`Failed to uninstall ${packageName}`);
        } finally {
            setInstallingPackage(false);
        }
    };

    const detectEnvs = useCallback(async () => {
        if (!currentPath) return;
        setLoading(true);
        setError(null);
        try {
            const envs = await (window as any).api?.pythonEnvDetect?.(currentPath);
            setDetectedEnvs(envs || []);
        } catch (err) {
            console.error('Error detecting python envs:', err);
            setError('Failed to detect Python environments');
        } finally {
            setLoading(false);
        }
    }, [currentPath]);

    useEffect(() => {
        loadConfig();
        detectEnvs();
        loadPackages();
    }, [loadConfig, detectEnvs, loadPackages]);

    const selectEnv = async (env: PythonEnv) => {
        if (!currentPath || env.notInstalled) return;
        setSaving(true);
        setError(null);
        try {
            const config: PythonEnvConfig = {
                type: env.type,
                venvPath: env.venvPath,
                pyenvVersion: env.pyenvVersion,
                condaEnv: env.condaEnv,
                condaRoot: env.condaRoot
            };
            await (window as any).api?.pythonEnvSave?.(currentPath, config);
            setCurrentConfig(config);
            setShowCustomInput(false);

            await loadPackages();
        } catch (err) {
            console.error('Error saving python env config:', err);
            setError('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const saveCustomPath = async () => {
        if (!currentPath || !customPath.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const config: PythonEnvConfig = {
                type: 'custom',
                customPath: customPath.trim()
            };
            await (window as any).api?.pythonEnvSave?.(currentPath, config);
            setCurrentConfig(config);

            await loadPackages();
        } catch (err) {
            console.error('Error saving custom python path:', err);
            setError('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const clearConfig = async () => {
        if (!currentPath) return;
        setSaving(true);
        try {
            await (window as any).api?.pythonEnvDelete?.(currentPath);
            setCurrentConfig(null);
            setShowCustomInput(false);
            setCustomPath('');

            await loadPackages();
        } catch (err) {
            console.error('Error clearing python env config:', err);
        } finally {
            setSaving(false);
        }
    };

    const createVenv = async () => {
        if (!currentPath || !newVenvName.trim()) return;
        setCreating(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await (window as any).api?.pythonEnvCreate?.(currentPath, newVenvName.trim());
            if (result?.success) {
                setSuccess(result.message || 'Virtual environment created successfully!');
                setShowCreateVenv(false);

                await detectEnvs();
                await loadConfig();
                await loadPackages();
            } else {
                setError(result?.error || 'Failed to create virtual environment');
            }
        } catch (err) {
            console.error('Error creating venv:', err);
            setError('Failed to create virtual environment');
        } finally {
            setCreating(false);
        }
    };

    const getEnvIcon = (type: string) => {
        switch (type) {
            case 'venv': return <span className="text-green-400">venv</span>;
            case 'pyenv': return <span className="text-yellow-400">pyenv</span>;
            case 'conda': return <span className="text-blue-400">conda</span>;
            case 'uv': return <span className="text-purple-400">uv</span>;
            case 'custom': return <span className="text-orange-400">custom</span>;
            default: return <span className="text-gray-400">sys</span>;
        }
    };

    const isSelected = (env: PythonEnv) => {
        if (!currentConfig) return env.type === 'system';
        if (currentConfig.type !== env.type) return false;
        if (env.type === 'venv' || env.type === 'uv') {
            return currentConfig.venvPath === env.venvPath;
        }
        if (env.type === 'pyenv') {
            return currentConfig.pyenvVersion === env.pyenvVersion;
        }
        if (env.type === 'conda') {
            return currentConfig.condaEnv === env.condaEnv;
        }
        return true;
    };

    if (compact) {

        return (
            <div className="relative">
                <select
                    className="px-2 py-1 text-xs theme-bg-tertiary theme-border border rounded outline-none focus:ring-1 focus:ring-blue-500"
                    value={currentConfig ? `${currentConfig.type}:${currentConfig.venvPath || currentConfig.pyenvVersion || currentConfig.condaEnv || ''}` : 'system:'}
                    onChange={async (e) => {
                        const [type, value] = e.target.value.split(':');
                        const env = detectedEnvs.find(d => d.type === type && (d.venvPath === value || d.pyenvVersion === value || d.condaEnv === value || (type === 'system' && !value)));
                        if (env) {
                            await selectEnv(env);
                        }
                    }}
                    disabled={loading || saving}
                >
                    {detectedEnvs.map((env, idx) => (
                        <option
                            key={idx}
                            value={`${env.type}:${env.venvPath || env.pyenvVersion || env.condaEnv || ''}`}
                            disabled={env.notInstalled}
                        >
                            {env.name}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold theme-text-primary flex items-center gap-2">
                    <Terminal size={16} />
                    Python Environment
                </h3>
                <button
                    onClick={detectEnvs}
                    disabled={loading}
                    className="p-1 theme-hover rounded text-blue-400 disabled:opacity-50"
                    title="Refresh detected environments"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle size={12} />
                    {error}
                </div>
            )}

            {success && (
                <div className="flex items-center gap-2 text-green-400 text-xs">
                    <Check size={12} />
                    {success}
                </div>
            )}

            <div className="text-xs text-gray-500 mb-2">
                Workspace: {currentPath || 'None'}
            </div>

            <div className="space-y-1">
                <div className="text-xs text-gray-400 mb-2">Detected Environments:</div>
                {loading ? (
                    <div className="text-xs text-gray-500">Scanning...</div>
                ) : detectedEnvs.length === 0 ? (
                    <div className="text-xs text-gray-500">No environments detected</div>
                ) : (
                    detectedEnvs.map((env, idx) => (
                        <button
                            key={idx}
                            onClick={() => selectEnv(env)}
                            disabled={env.notInstalled || saving}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors ${
                                isSelected(env)
                                    ? 'bg-blue-500/20 border border-blue-500/50'
                                    : env.notInstalled
                                    ? 'opacity-50 cursor-not-allowed theme-bg-tertiary'
                                    : 'theme-bg-tertiary hover:bg-white/10'
                            }`}
                        >
                            <div className="w-12 font-mono">{getEnvIcon(env.type)}</div>
                            <div className="flex-1 truncate">
                                <div className="font-medium theme-text-primary">{env.name}</div>
                                {env.path && (
                                    <div className="text-gray-500 truncate">{env.path}</div>
                                )}
                                {env.hint && (
                                    <div className="text-yellow-500">{env.hint}</div>
                                )}
                            </div>
                            {isSelected(env) && <Check size={14} className="text-blue-400" />}
                        </button>
                    ))
                )}
            </div>

            <div className="pt-2 border-t theme-border">
                <button
                    onClick={() => setShowCustomInput(!showCustomInput)}
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300"
                >
                    <ChevronDown size={12} className={showCustomInput ? 'rotate-180' : ''} />
                    Custom Python Path
                </button>
                {showCustomInput && (
                    <div className="mt-2 flex gap-2">
                        <input
                            type="text"
                            value={customPath}
                            onChange={(e) => setCustomPath(e.target.value)}
                            placeholder="/path/to/python"
                            className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-border border rounded outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                            onClick={saveCustomPath}
                            disabled={!customPath.trim() || saving}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                            Save
                        </button>
                    </div>
                )}
            </div>

            <div className="pt-2 border-t theme-border">
                <button
                    onClick={() => setShowCreateVenv(!showCreateVenv)}
                    className="flex items-center gap-2 text-xs text-green-400 hover:text-green-300"
                >
                    <ChevronDown size={12} className={showCreateVenv ? 'rotate-180' : ''} />
                    Create New Virtual Environment
                </button>
                {showCreateVenv && (
                    <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newVenvName}
                                onChange={(e) => setNewVenvName(e.target.value)}
                                placeholder=".venv"
                                className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-border border rounded outline-none focus:ring-1 focus:ring-green-500"
                            />
                            <button
                                onClick={createVenv}
                                disabled={!newVenvName.trim() || creating}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                                {creating ? (
                                    <>
                                        <RefreshCw size={12} className="animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create'
                                )}
                            </button>
                        </div>
                        <div className="text-xs text-gray-500">
                            Creates a new Python virtual environment in the workspace using <code className="bg-black/30 px-1 rounded">python -m venv</code>
                        </div>
                    </div>
                )}
            </div>

            {currentPath && (
                <div className="pt-2 border-t theme-border">
                    <button
                        onClick={() => {
                            setShowPackages(!showPackages);
                            if (!showPackages) loadPackages();
                        }}
                        className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300"
                    >
                        <Package size={12} />
                        <ChevronDown size={12} className={showPackages ? 'rotate-180' : ''} />
                        Installed Packages ({loadingPackages ? '...' : installedPackages.length})
                    </button>
                    {showPackages && (
                        <div className="mt-2 space-y-3">
                            <div className="space-y-1">
                                <div className="text-xs text-gray-500">Quick Install:</div>
                                <div className="flex flex-wrap gap-1">
                                    {Object.entries(PACKAGE_BUNDLES).map(([key, bundle]) => (
                                        <button
                                            key={key}
                                            onClick={() => installBundle(key)}
                                            disabled={installingPackage}
                                            className="px-2 py-1 text-xs bg-purple-600/30 text-purple-300 rounded hover:bg-purple-600/50 disabled:opacity-50 flex items-center gap-1"
                                            title={bundle.packages.filter(p => !p.startsWith('--')).join(', ')}
                                        >
                                            <Download size={10} />
                                            {bundle.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newPackageName}
                                    onChange={(e) => setNewPackageName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && installPackage(newPackageName)}
                                    placeholder="package-name"
                                    className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-border border rounded outline-none focus:ring-1 focus:ring-purple-500"
                                />
                                <button
                                    onClick={() => installPackage(newPackageName)}
                                    disabled={!newPackageName.trim() || installingPackage}
                                    className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    {installingPackage ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                                    Install
                                </button>
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={packageFilter}
                                        onChange={(e) => setPackageFilter(e.target.value)}
                                        placeholder="Filter packages..."
                                        className="flex-1 px-2 py-1 text-xs theme-bg-tertiary theme-border border rounded outline-none"
                                    />
                                    <button
                                        onClick={loadPackages}
                                        disabled={loadingPackages}
                                        className="p-1 theme-hover rounded"
                                    >
                                        <RefreshCw size={12} className={loadingPackages ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {loadingPackages ? (
                                        <div className="text-xs text-gray-500 py-2">Loading packages...</div>
                                    ) : installedPackages.length === 0 ? (
                                        <div className="text-xs text-gray-500 py-2">No packages installed</div>
                                    ) : (
                                        installedPackages
                                            .filter(pkg => !packageFilter || pkg.name.toLowerCase().includes(packageFilter.toLowerCase()))
                                            .map((pkg, idx) => (
                                                <div key={idx} className="flex items-center justify-between px-2 py-1 text-xs theme-bg-tertiary rounded group">
                                                    <span>
                                                        <span className="theme-text-primary">{pkg.name}</span>
                                                        <span className="text-gray-500 ml-2">{pkg.version}</span>
                                                    </span>
                                                    <button
                                                        onClick={() => uninstallPackage(pkg.name)}
                                                        disabled={installingPackage}
                                                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity"
                                                        title="Uninstall"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {currentConfig && (
                <div className="pt-2 border-t theme-border">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                            Current: <span className="text-green-400">
                                {currentConfig.type === 'custom'
                                    ? currentConfig.customPath
                                    : currentConfig.type === 'venv' || currentConfig.type === 'uv'
                                    ? `${currentConfig.type} (${currentConfig.venvPath})`
                                    : currentConfig.type === 'pyenv'
                                    ? `pyenv (${currentConfig.pyenvVersion})`
                                    : currentConfig.type === 'conda'
                                    ? `conda (${currentConfig.condaEnv})`
                                    : 'System Python'}
                            </span>
                        </div>
                        <button
                            onClick={clearConfig}
                            disabled={saving}
                            className="text-xs text-red-400 hover:text-red-300"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            )}

            <div className="pt-2 border-t theme-border">
                <button
                    onClick={async () => {
                        try {
                            await (window as any).api?.setupReset?.();
                            window.location.reload();
                        } catch (err) {
                            console.error('Error resetting setup:', err);
                        }
                    }}
                    className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300"
                >
                    <RefreshCw size={12} />
                    Re-run Setup Wizard
                </button>
                <div className="text-xs text-gray-500 mt-1">
                    Reconfigure Python environment and reinstall npcpy packages
                </div>
            </div>
        </div>
    );
};

export default PythonEnvSettings;
