import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, X, Save, RefreshCw, Plus, Trash2, AlertCircle, Globe } from 'lucide-react';

interface ProjectEnvEditorProps {
    currentPath: string;
}

interface EnvVariable {
    key: string;
    value: string;
    isSecret: boolean;
}

const ProjectEnvEditor: React.FC<ProjectEnvEditorProps> = ({ currentPath }) => {
    const [envContent, setEnvContent] = useState('');
    const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

    const envPath = currentPath
        ? `${currentPath.replace(/[\\/]$/, '')}/.env`
        : null;

    const parseEnvContent = (content: string): EnvVariable[] => {
        const lines = content.split('\n');
        const variables: EnvVariable[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();

                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                const isSecret = key.toLowerCase().includes('key') ||
                                 key.toLowerCase().includes('secret') ||
                                 key.toLowerCase().includes('token') ||
                                 key.toLowerCase().includes('password');
                variables.push({ key, value, isSecret });
            }
        }
        return variables;
    };

    const variablesToEnvContent = (variables: EnvVariable[]): string => {
        return variables
            .filter(v => v.key.trim())
            .map(v => {
                const value = v.value.includes(' ') || v.value.includes('#')
                    ? `"${v.value}"`
                    : v.value;
                return `${v.key}=${value}`;
            })
            .join('\n');
    };

    const loadEnvFile = useCallback(async () => {
        if (!envPath) return;

        setLoading(true);
        setError(null);

        try {
            const result = await (window as any).api?.readFileContent?.(envPath);
            if (result?.error) {

                setEnvContent('');
                setEnvVariables([]);
            } else {
                const content = result?.content || '';
                setEnvContent(content);
                setEnvVariables(parseEnvContent(content));
            }
            setHasChanges(false);
        } catch (err) {
            console.error('Error loading .env file:', err);
            setError('Failed to load .env file');
        } finally {
            setLoading(false);
        }
    }, [envPath]);

    const saveEnvFile = async () => {
        if (!envPath) return;

        setSaving(true);
        setError(null);

        try {
            const content = viewMode === 'table'
                ? variablesToEnvContent(envVariables)
                : envContent;

            await (window as any).api?.writeFileContent?.(envPath, content);
            setHasChanges(false);

            if (viewMode === 'table') {
                setEnvContent(content);
            } else {
                setEnvVariables(parseEnvContent(content));
            }
        } catch (err) {
            console.error('Error saving .env file:', err);
            setError('Failed to save .env file');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (envPath) {
            loadEnvFile();
        }
    }, [envPath, loadEnvFile]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveEnvFile();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const addVariable = () => {
        setEnvVariables([...envVariables, { key: '', value: '', isSecret: false }]);
        setHasChanges(true);
    };

    const updateVariable = (index: number, field: 'key' | 'value', newValue: string) => {
        const updated = [...envVariables];
        updated[index] = { ...updated[index], [field]: newValue };
        if (field === 'key') {
            updated[index].isSecret = newValue.toLowerCase().includes('key') ||
                                      newValue.toLowerCase().includes('secret') ||
                                      newValue.toLowerCase().includes('token') ||
                                      newValue.toLowerCase().includes('password');
        }
        setEnvVariables(updated);
        setHasChanges(true);
    };

    const deleteVariable = (index: number) => {
        setEnvVariables(envVariables.filter((_, i) => i !== index));
        setHasChanges(true);
    };

    const handleRawContentChange = (content: string) => {
        setEnvContent(content);
        setHasChanges(true);
    };

    const switchViewMode = (mode: 'table' | 'raw') => {
        if (mode === viewMode) return;

        if (viewMode === 'table') {

            setEnvContent(variablesToEnvContent(envVariables));
        } else {

            setEnvVariables(parseEnvContent(envContent));
        }
        setViewMode(mode);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-2">
                    <KeyRound className="text-orange-400" size={16} />
                    <div>
                        <h3 className="text-sm font-semibold">Environment Variables</h3>
                        <p className="text-xs theme-text-muted">{envPath || 'No project selected'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasChanges && (
                        <span className="text-xs text-orange-400">Unsaved</span>
                    )}
                    <button
                        onClick={loadEnvFile}
                        disabled={loading}
                        className="p-1.5 theme-hover rounded transition-colors"
                        title="Reload"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={saveEnvFile}
                        disabled={saving || !hasChanges}
                        className="px-2 py-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded text-xs flex items-center gap-1"
                    >
                        <Save size={12} />
                        Save
                    </button>
                </div>
            </div>

                <div className="flex border-b theme-border">
                    <button
                        onClick={() => switchViewMode('table')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            viewMode === 'table'
                                ? 'border-orange-500 text-orange-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        Variables
                    </button>
                    <button
                        onClick={() => switchViewMode('raw')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            viewMode === 'raw'
                                ? 'border-orange-500 text-orange-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        Raw Editor
                    </button>
                </div>

                {error && (
                    <div className="p-3 bg-red-900/30 border-b border-red-800 flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="animate-spin text-orange-400" size={24} />
                        </div>
                    ) : viewMode === 'table' ? (
                        <div className="space-y-4">
                            <div className="p-3 border border-gray-700 rounded-lg space-y-2">
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Globe size={14} className="text-cyan-400" />
                                    Browser Homepage
                                </label>
                                <input
                                    type="text"
                                    value={envVariables.find(v => v.key === 'BROWSER_HOMEPAGE')?.value || ''}
                                    onChange={(e) => {
                                        const idx = envVariables.findIndex(v => v.key === 'BROWSER_HOMEPAGE');
                                        if (idx >= 0) {
                                            updateVariable(idx, 'value', e.target.value);
                                        } else if (e.target.value) {
                                            setEnvVariables([...envVariables, { key: 'BROWSER_HOMEPAGE', value: e.target.value, isSecret: false }]);
                                            setHasChanges(true);
                                        }
                                    }}
                                    placeholder="https://google.com (default: wikipedia.org)"
                                    className="w-full theme-input text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs theme-text-muted">Other Variables</p>
                                {envVariables.filter(v => v.key !== 'BROWSER_HOMEPAGE').length === 0 ? (
                                    <div className="text-center py-4 theme-text-muted text-sm">
                                        <p>No other variables defined.</p>
                                    </div>
                                ) : (
                                    envVariables.filter(v => v.key !== 'BROWSER_HOMEPAGE').map((variable) => {
                                        const realIndex = envVariables.findIndex(v => v.key === variable.key);
                                        return (
                                            <div key={realIndex} className="flex gap-2 items-center">
                                                <input
                                                    type="text"
                                                    value={variable.key}
                                                    onChange={(e) => updateVariable(realIndex, 'key', e.target.value)}
                                                    placeholder="VARIABLE_NAME"
                                                    className="w-1/3 theme-input text-sm font-mono"
                                                />
                                                <span className="text-gray-500">=</span>
                                                <input
                                                    type={variable.isSecret ? 'password' : 'text'}
                                                    value={variable.value}
                                                    onChange={(e) => updateVariable(realIndex, 'value', e.target.value)}
                                                    placeholder="value"
                                                    className="flex-1 theme-input text-sm font-mono"
                                                />
                                                <button
                                                    onClick={() => deleteVariable(realIndex)}
                                                    className="p-2 hover:bg-red-900/50 rounded text-red-400 transition-colors"
                                                    title="Delete variable"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                                <button
                                    onClick={addVariable}
                                    className="mt-2 px-3 py-2 border border-dashed theme-border rounded hover:border-orange-500 hover:text-orange-400 transition-colors flex items-center gap-2 text-sm w-full justify-center"
                                >
                                    <Plus size={14} />
                                    Add Variable
                                </button>
                            </div>
                        </div>
                    ) : (
                        <textarea
                            value={envContent}
                            onChange={(e) => handleRawContentChange(e.target.value)}
                            className="w-full h-[50vh] theme-input font-mono text-sm resize-none"
                            placeholder="# Project environment variables&#10;KEY=value&#10;ANOTHER_KEY=another_value"
                            spellCheck={false}
                        />
                    )}
                </div>

            <div className="p-2 border-t theme-border text-xs theme-text-muted flex-shrink-0">
                <p>Environment variables for this workspace folder.</p>
            </div>
        </div>
    );
};

export default ProjectEnvEditor;
