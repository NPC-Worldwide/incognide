import React, { useState, useEffect } from 'react';
import { FileJson, X, Save, Plus, Trash2 } from 'lucide-react';
import AutosizeTextarea from './AutosizeTextarea';

const CtxEditor = ({ isOpen, onClose, currentPath, embedded = false, isGlobal = false, globalPath = undefined }) => {

    const [globalCtx, setGlobalCtx] = useState({});
    const [projectCtx, setProjectCtx] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            loadContexts();
        }
    }, [isOpen, currentPath, globalPath]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const loadContexts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const globalRes = await window.api.getGlobalContext(globalPath);
            if (globalRes.error) throw new Error(`Global: ${globalRes.error}`);
            setGlobalCtx(globalRes.context || {});

            if (currentPath) {
                const projectRes = await window.api.getProjectContext(currentPath);
                if (projectRes.error) throw new Error(`Project: ${projectRes.error}`);
                setProjectCtx(projectRes.context || {});
            } else {
                setProjectCtx({});
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
   
    const handleSave = async () => {
        setIsLoading(true);
        setError(null);
        try {
            if (isGlobal) {
                await window.api.saveGlobalContext(globalCtx, globalPath);
            } else if (currentPath) {
                await window.api.saveProjectContext({ path: currentPath, contextData: projectCtx });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFieldChange = (type, field, value) => {
        const setCtx = type === 'global' ? setGlobalCtx : setProjectCtx;
        setCtx(prev => ({ ...prev, [field]: value }));
    };

    // Get custom KV pairs (excluding reserved keys that have their own tabs)
    const getCustomKvPairs = (ctx) => {
        const reserved = ['forenpc', 'context', 'databases', 'mcp_servers'];
        return Object.entries(ctx || {}).filter(([key]) => !reserved.includes(key));
    };

    const handleAddKvPair = (type) => {
        const setCtx = type === 'global' ? setGlobalCtx : setProjectCtx;
        const key = prompt('Enter key name:');
        if (!key || key.trim() === '') return;
        setCtx(prev => ({ ...prev, [key.trim()]: '' }));
    };

    const handleKvKeyChange = (type, oldKey, newKey) => {
        if (!newKey || newKey.trim() === '' || oldKey === newKey) return;
        const setCtx = type === 'global' ? setGlobalCtx : setProjectCtx;
        setCtx(prev => {
            const value = prev[oldKey];
            const { [oldKey]: _, ...rest } = prev;
            return { ...rest, [newKey.trim()]: value };
        });
    };

    const handleKvValueChange = (type, key, value) => {
        const setCtx = type === 'global' ? setGlobalCtx : setProjectCtx;
        setCtx(prev => ({ ...prev, [key]: value }));
    };

    const handleRemoveKvPair = (type, key) => {
        const setCtx = type === 'global' ? setGlobalCtx : setProjectCtx;
        setCtx(prev => {
            const { [key]: _, ...rest } = prev;
            return rest;
        });
    };

    const renderForm = (type) => {
        const ctx = type === 'global' ? globalCtx : projectCtx;
        if (type === 'project' && !currentPath) {
            return <div className="p-4 theme-text-muted">No project folder selected.</div>;
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
                            onChange={(e) => handleFieldChange(type, 'forenpc', e.target.value)}
                            className="w-full theme-input"
                            placeholder="e.g., sibiji"
                        />
                    </div>
                    <div>
                        <label className="block text-sm theme-text-secondary mb-1">General Context</label>
                        <AutosizeTextarea
                            value={ctx.context || ''}
                            onChange={(e) => handleFieldChange(type, 'context', e.target.value)}
                            className="w-full theme-input min-h-[96px] resize-y"
                            placeholder="A brief description of this project or team's purpose."
                        />
                    </div>
                </div>

                {/* Generic KV Pairs */}
                <div className="space-y-2">
                    <h4 className="text-sm theme-text-primary font-semibold mb-2">Additional Context</h4>
                    <div className="space-y-3">
                        {customKvPairs.map(([key, value]) => (
                            <div key={key} className="flex gap-2 items-start bg-gray-900/50 p-2 rounded-md border theme-border">
                                <input
                                    type="text"
                                    value={key}
                                    onChange={(e) => handleKvKeyChange(type, key, e.target.value)}
                                    className="w-32 theme-input bg-transparent text-sm font-mono"
                                    placeholder="key"
                                />
                                <AutosizeTextarea
                                    value={typeof value === 'string' ? value : JSON.stringify(value)}
                                    onChange={(e) => handleKvValueChange(type, key, e.target.value)}
                                    className="flex-1 theme-input bg-transparent border-none focus:ring-0 p-1 text-sm resize-none"
                                    placeholder="value"
                                    rows={1}
                                />
                                <button onClick={() => handleRemoveKvPair(type, key)} className="p-2 rounded-md hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => handleAddKvPair(type)} className="mt-2 text-sm theme-button theme-hover px-3 py-1 rounded flex items-center gap-1">
                        <Plus size={14} /> Add Field
                    </button>
                </div>
            </div>
        );
    };

    if (!isOpen && !embedded) return null;

    const content = (
        <>
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? <p className="text-center theme-text-muted">Loading...</p> : error ? <p className="text-red-500">{error}</p> : (
                    renderForm(isGlobal ? 'global' : 'project')
                )}
            </div>

            {/* Save Button */}
            <div className="border-t theme-border pt-4 mt-4 flex justify-end">
                <button onClick={handleSave} className="theme-button-primary flex items-center gap-2 px-4 py-2 rounded text-sm" disabled={isLoading}>
                    <Save size={16} />
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </>
    );

    // Embedded mode - return just the content
    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    // Modal mode - wrap in modal container
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
