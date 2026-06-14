import React, { useState, useEffect } from 'react';
import { FileJson, X, Save, Plus, Trash2 } from 'lucide-react';
import yaml from 'js-yaml';
import AutosizeTextarea from './AutosizeTextarea';

const CtxEditor = ({ isOpen, onClose, teamPath, embedded = false }) => {

    const [ctx, setCtx] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ctxFileName, setCtxFileName] = useState<string | null>(null);

    const findCtxFile = async (dirPath: string) => {
        try {
            const items = await (window as any).api.readDirectory(dirPath);
            const ctxFiles = (items || []).filter(item => item.name && item.name.endsWith('.ctx'));
            if (ctxFiles.length > 0) {
                return ctxFiles[0].name;
            }
        } catch {
            // ignore
        }
        return null;
    };

    useEffect(() => {
        if (isOpen && teamPath) {
            loadContext();
        }
    }, [isOpen, teamPath]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const loadContext = async () => {
        if (!teamPath) {
            setCtx({});
            setCtxFileName(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const foundFile = await findCtxFile(teamPath);
            if (foundFile) {
                setCtxFileName(foundFile);
                const result = await (window as any).api.readFileContent(teamPath + '/' + foundFile);
                const text = typeof result === 'string' ? result : result?.content;
                if (text != null) {
                    setCtx(yaml.load(text) || {});
                } else {
                    setCtx({});
                }
            } else {
                setCtxFileName(null);
                setCtx({});
            }
        } catch {
            setCtxFileName(null);
            setCtx({});
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!teamPath) return;
        setIsLoading(true);
        setError(null);
        try {
            let targetFile = ctxFileName;
            if (!targetFile) {
                targetFile = 'team.ctx';
                setCtxFileName(targetFile);
            }
            const result = await (window as any).api.writeFileContent(teamPath + '/' + targetFile, yaml.dump(ctx));
            if (result?.error) {
                setError(result.error);
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to save context');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFieldChange = (field, value) => {
        setCtx(prev => ({ ...prev, [field]: value }));
    };

    const getCustomKvPairs = (ctx) => {
        const reserved = ['forenpc', 'context', 'databases', 'mcp_servers'];
        return Object.entries(ctx || {}).filter(([key]) => !reserved.includes(key));
    };

    const handleAddKvPair = () => {
        const key = prompt('Enter key name:');
        if (!key || key.trim() === '') return;
        setCtx(prev => ({ ...prev, [key.trim()]: '' }));
    };

    const handleKvKeyChange = (oldKey, newKey) => {
        if (!newKey || newKey.trim() === '' || oldKey === newKey) return;
        setCtx(prev => {
            const value = prev[oldKey];
            const { [oldKey]: _, ...rest } = prev;
            return { ...rest, [newKey.trim()]: value };
        });
    };

    const handleKvValueChange = (key, value) => {
        setCtx(prev => ({ ...prev, [key]: value }));
    };

    const handleRemoveKvPair = (key) => {
        setCtx(prev => {
            const { [key]: _, ...rest } = prev;
            return rest;
        });
    };

    const renderForm = () => {
        if (!teamPath) {
            return <div className="p-4 theme-text-muted">No team path selected.</div>;
        }

        const customKvPairs = getCustomKvPairs(ctx);

        return (
            <div className="space-y-6 py-2">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">Fore-NPC</label>
                        <input
                            type="text"
                            value={ctx.forenpc || ''}
                            onChange={(e) => handleFieldChange('forenpc', e.target.value)}
                            className="w-full theme-input"
                            placeholder="e.g., sibiji"
                        />
                    </div>
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">General Context</label>
                        <AutosizeTextarea
                            value={ctx.context || ''}
                            onChange={(e) => handleFieldChange('context', e.target.value)}
                            className="w-full theme-input min-h-[96px] resize-y"
                            placeholder="A brief description of this project or team's purpose."
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <h4 className="text-sm theme-text-primary font-semibold mb-2">Additional Context</h4>
                    <div className="space-y-3">
                        {customKvPairs.map(([key, value]) => (
                            <div key={key} className="flex gap-2 items-start bg-gray-900/50 p-2 rounded-md border theme-border">
                                <input
                                    type="text"
                                    value={key}
                                    onChange={(e) => handleKvKeyChange(key, e.target.value)}
                                    className="w-32 theme-input bg-transparent text-sm font-mono"
                                    placeholder="key"
                                />
                                <AutosizeTextarea
                                    value={typeof value === 'string' ? value : JSON.stringify(value)}
                                    onChange={(e) => handleKvValueChange(key, e.target.value)}
                                    className="flex-1 theme-input bg-transparent border-none focus:ring-0 p-1 text-sm resize-none"
                                    placeholder="value"
                                    rows={1}
                                />
                                <button onClick={() => handleRemoveKvPair(key)} className="p-2 rounded-md hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleAddKvPair} className="mt-2 text-sm theme-button theme-hover px-3 py-1 rounded flex items-center gap-1">
                        <Plus size={14} /> Add Field
                    </button>
                </div>
            </div>
        );
    };

    if (!isOpen && !embedded) return null;

    const content = (
        <>
            <div className="flex-1 overflow-y-auto">
                {isLoading ? <p className="text-center theme-text-muted">Loading...</p> : error ? <p className="text-red-500">{error}</p> : (
                    renderForm()
                )}
            </div>

            <div className="border-t theme-border pt-4 mt-4 flex justify-end">
                <button onClick={handleSave} className="theme-button-primary flex items-center gap-2 px-4 py-2 rounded text-sm" disabled={isLoading}>
                    <Save size={16} />
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </>
    );

    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl w-full max-w-5xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 flex justify-between items-center border-b theme-border flex-shrink-0">
                    <h3 className="text-lg flex items-center gap-2 theme-text-primary">
                        <FileJson className="text-blue-400" />
                        Context Editor (<span className="text-blue-400">.ctx</span>)
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full theme-hover">
                        <X size={20} />
                    </button>
                </header>
                <main className="p-6 flex-grow overflow-hidden">
                    {content}
                </main>
            </div>
        </div>
    );
};

export default CtxEditor;
