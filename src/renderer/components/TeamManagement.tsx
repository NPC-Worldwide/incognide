import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
    X, FileJson, Search, Users, Wrench, Clock, Database, Plus, Trash2, Play, Pause, Server, Mail, Save,
    Brain, GitBranch, Cpu, Box, Code, Mic, Globe, Eye, EyeOff, Check, Zap
} from 'lucide-react';
import yaml from 'js-yaml';
import SmokestackIcon from './icons/SmokestackIcon';
import MemoryIcon from './icons/MemoryIcon';
import KgIcon from './icons/KgIcon';

import CtxEditor from './CtxEditor';
import NPCTeamMenu from './NPCTeamMenu';
import JinxMenu from './JinxMenu';
import McpServerMenu from './McpServerMenu';
import McpManager from './McpManager';
import CronDaemonPanel from './CronDaemonPanel';
import MemoryManagement from './MemoryManagement';
import ModelManager from './ModelManager';
import VoiceManager from './VoiceManager';
const KnowledgeGraphEditor = lazy(() => import('./KnowledgeGraphEditor'));

interface TeamManagementProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string;
    startNewConversation?: (npc: any) => Promise<any>;
    startNewChat?: (model: string, provider: string) => void;
    npcList?: any[];
    jinxList?: any[];
    embedded?: boolean;
    currentNpc?: string;
    initialTab?: TabId;
    forceTab?: TabId;
    onTabChange?: (tab: TabId) => void;
}

type TabId = 'context' | 'npcs' | 'jinxes' | 'memory' | 'knowledge' | 'cron' | 'mcp' | 'models' | 'databases' | 'ai-settings' | 'llm-models' | 'voice';

const SqlModelsContent = ({ currentPath, npcList = [], jinxList = [], isGlobal }: { currentPath: string; npcList?: any[]; jinxList?: any[]; isGlobal: boolean }) => {
    const [models, setModels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<any | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const [npcs, setNpcs] = useState<any[]>([]);
    const [jinxes, setJinxes] = useState<any[]>([]);

    const [availableDatabases, setAvailableDatabases] = useState<{ name: string; path: string }[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string>('~/.incognide/history.db');

    const [modelName, setModelName] = useState('');
    const [modelDescription, setModelDescription] = useState('');
    const [modelSql, setModelSql] = useState('');
    const [modelSchedule, setModelSchedule] = useState('');
    const [modelMaterialization, setModelMaterialization] = useState<'view' | 'table' | 'incremental'>('table');
    const [modelNpc, setModelNpc] = useState('');

    const fetchModels = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = isGlobal
                ? await (window as any).api.getSqlModelsGlobal?.()
                : await (window as any).api.getSqlModelsProject?.(currentPath);
            if (response?.error) throw new Error(response.error);
            setModels(response?.models || []);
        } catch (err: any) {

            setModels([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchNpcsAndJinxes = async () => {
        try {
            const npcResponse = isGlobal
                ? await (window as any).api.getNPCTeamFromPath?.(selectedTeam)
                : await (window as any).api.getNPCTeamProject?.(currentPath);
            if (npcResponse?.npcs) setNpcs(npcResponse.npcs);

            const jinxResponse = isGlobal
                ? await (window as any).api.getJinxesTeam?.(selectedTeam)
                : await (window as any).api.getJinxesProject?.(currentPath);
            if (jinxResponse?.jinxes) setJinxes(jinxResponse.jinxes);
        } catch (err) {
            console.error('Failed to fetch NPCs/Jinxes:', err);
        }
    };

    const fetchAvailableDatabases = async () => {
        const databases: { name: string; path: string }[] = [
            { name: 'Global History (history.db)', path: '~/.incognide/history.db' }
        ];

        try {
            const globalCtx = await (window as any).api.getContextGlobal?.();
            if (globalCtx?.databases) {
                for (const db of globalCtx.databases) {
                    if (!databases.find(d => d.path === db.path)) {
                        databases.push({ name: db.name || db.path, path: db.path });
                    }
                }
            }

            if (currentPath) {
                const projectCtx = await (window as any).api.getContextProject?.(currentPath);
                if (projectCtx?.databases) {
                    for (const db of projectCtx.databases) {
                        if (!databases.find(d => d.path === db.path)) {
                            databases.push({ name: `Project: ${db.name || db.path}`, path: db.path });
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch databases from context:', err);
        }

        setAvailableDatabases(databases);
    };

    useEffect(() => {
        fetchModels();
        fetchNpcsAndJinxes();
        fetchAvailableDatabases();
    }, [currentPath, isGlobal]);

    const handleCreateModel = () => {
        setSelectedModel(null);
        setModelName('');
        setModelDescription('');
        const defaultNpc = npcs[0]?.name || 'sibiji';
        setModelSql(`-- npcsql model
{{ config(materialized='table') }}

SELECT
    id,
    user_input,
    nql.get_llm_response(
        CONCAT('Summarize this conversation: ', user_input),
        '${defaultNpc}'
    ) as summary,
    nql.extract_facts(user_input, '${defaultNpc}') as facts
FROM {{ ref('conversation_history') }}
LIMIT 10
`);
        setModelSchedule('');
        setModelMaterialization('table');
        setModelNpc('');
        setIsEditing(true);
    };

    const handleEditModel = (model: any) => {
        setSelectedModel(model);
        setModelName(model.name || '');
        setModelDescription(model.description || '');
        setModelSql(model.sql || '');
        setModelSchedule(model.schedule || '');
        setModelMaterialization(model.materialization || 'table');
        setModelNpc(model.npc || '');
        setIsEditing(true);
    };

    const handleSaveModel = async () => {
        if (!modelName.trim()) return alert('Please enter a model name');
        if (!modelSql.trim()) return alert('Please enter SQL for the model');

        setLoading(true);
        setError(null);
        try {
            const modelData = {
                name: modelName,
                description: modelDescription,
                sql: modelSql,
                schedule: modelSchedule,
                materialization: modelMaterialization,
                npc: modelNpc,
                id: selectedModel?.id,
            };

            const res = isGlobal
                ? await (window as any).api.saveSqlModelGlobal?.(modelData)
                : await (window as any).api.saveSqlModelProject?.({ path: currentPath, model: modelData });

            if (res?.error) throw new Error(res.error);
            await fetchModels();
            setIsEditing(false);
            setSelectedModel(null);
        } catch (err: any) {
            setError(err.message || 'Failed to save model');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteModel = async (modelId: string) => {
        if (!window.confirm('Delete this SQL model?')) return;
        setLoading(true);
        try {
            const res = isGlobal
                ? await (window as any).api.deleteSqlModelGlobal?.(modelId)
                : await (window as any).api.deleteSqlModelProject?.({ path: currentPath, modelId });
            if (res?.error) throw new Error(res.error);
            await fetchModels();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRunModel = async (model: any) => {
        setLoading(true);
        setError(null);
        try {
            const res = await (window as any).api.runSqlModel?.({
                path: currentPath,
                modelId: model.id,
                isGlobal,
                targetDb: selectedDatabase
            });
            if (res?.error) throw new Error(res.error);
            alert(`Model "${model.name}" executed successfully! ${res.rows || 0} rows materialized.`);
            await fetchModels();
        } catch (err: any) {
            setError(err.message || 'Failed to run model');
        } finally {
            setLoading(false);
        }
    };

    const insertNpcReference = (npcName: string, funcName: string = 'get_llm_response') => {
        const ref = `nql.${funcName}(column_name, '${npcName}')`;
        setModelSql(prev => prev + '\n    ' + ref + ' as ' + funcName + '_result,');
    };

    const insertJinxReference = (jinxName: string) => {

        const ref = `-- To use jinx '${jinxName}', reference it via NPC context or use check_llm_command`;
        setModelSql(prev => prev + '\n' + ref);
    };

    if (!currentPath && !isGlobal) {
        return (
            <div className="text-center py-12">
                <Database size={48} className="mx-auto mb-4 text-gray-500" />
                <p className="theme-text-muted">Select a project folder or switch to Global to manage SQL models.</p>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">
                        {selectedModel ? 'Edit Model' : 'Create New Model'}
                    </h3>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="theme-button px-3 py-1 rounded text-sm"
                    >
                        Cancel
                    </button>
                </div>

                {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Model Name</label>
                        <input
                            type="text"
                            value={modelName}
                            onChange={e => setModelName(e.target.value)}
                            placeholder="daily_user_analytics"
                            className="w-full theme-input text-sm font-mono"
                        />
                    </div>
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Materialization</label>
                        <select
                            value={modelMaterialization}
                            onChange={e => setModelMaterialization(e.target.value as any)}
                            className="w-full theme-input text-sm"
                        >
                            <option value="view">View (virtual)</option>
                            <option value="table">Table (persisted)</option>
                            <option value="incremental">Incremental (append)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs theme-text-muted block mb-1">Description</label>
                    <input
                        type="text"
                        value={modelDescription}
                        onChange={e => setModelDescription(e.target.value)}
                        placeholder="Aggregates daily user activity metrics"
                        className="w-full theme-input text-sm"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Schedule (cron, optional)</label>
                        <input
                            type="text"
                            value={modelSchedule}
                            onChange={e => setModelSchedule(e.target.value)}
                            placeholder="0 0 * * * (daily at midnight)"
                            className="w-full theme-input text-sm font-mono"
                        />
                    </div>
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Default NPC Context</label>
                        <select
                            value={modelNpc}
                            onChange={e => setModelNpc(e.target.value)}
                            className="w-full theme-input text-sm"
                        >
                            <option value="">None</option>
                            {npcs.map((npc: any) => (
                                <option key={npc.name} value={npc.name}>{npc.display_name || npc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs theme-text-muted py-1">Insert NQL function with NPC:</span>
                    {npcs.slice(0, 3).map((npc: any) => (
                        <div key={npc.name} className="flex gap-1">
                            <button
                                onClick={() => insertNpcReference(npc.name, 'get_llm_response')}
                                className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1 rounded hover:bg-blue-900/50"
                                title="Insert get_llm_response"
                            >
                                nql.get_llm_response(col, '{npc.name}')
                            </button>
                            <button
                                onClick={() => insertNpcReference(npc.name, 'extract_facts')}
                                className="text-xs bg-purple-900/30 text-purple-400 px-2 py-1 rounded hover:bg-purple-900/50"
                                title="Insert extract_facts"
                            >
                                extract_facts
                            </button>
                            <button
                                onClick={() => insertNpcReference(npc.name, 'synthesize')}
                                className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded hover:bg-green-900/50"
                                title="Insert synthesize"
                            >
                                synthesize
                            </button>
                        </div>
                    ))}
                </div>

                <div>
                    <label className="text-xs theme-text-muted block mb-1">SQL (npcsql with jinja syntax)</label>
                    <textarea
                        value={modelSql}
                        onChange={e => setModelSql(e.target.value)}
                        className="w-full theme-input text-sm font-mono h-64 resize-y"
                        placeholder="SELECT * FROM ..."
                        spellCheck={false}
                    />
                </div>

                <div className="theme-bg-tertiary p-3 rounded-lg text-xs">
                    <div className="font-semibold mb-2 text-purple-400">NQL Functions (llm_funcs.py):</div>
                    <div className="grid grid-cols-4 gap-1 font-mono theme-text-muted mb-2">
                        <div><span className="text-blue-400">get_llm_response</span></div>
                        <div><span className="text-blue-400">extract_facts</span></div>
                        <div><span className="text-blue-400">get_facts</span></div>
                        <div><span className="text-green-400">synthesize</span></div>
                        <div><span className="text-green-400">criticize</span></div>
                        <div><span className="text-green-400">harmonize</span></div>
                        <div><span className="text-purple-400">breathe</span></div>
                        <div><span className="text-purple-400">orchestrate</span></div>
                        <div><span className="text-orange-400">identify_groups</span></div>
                        <div><span className="text-orange-400">generate_groups</span></div>
                        <div><span className="text-cyan-400">bootstrap</span></div>
                        <div><span className="text-cyan-400">zoom_in</span></div>
                    </div>
                    <div className="border-t theme-border pt-2 space-y-1 font-mono text-gray-500">
                        <div><code className="text-blue-300">nql.get_llm_response(CONCAT('Prompt: ', col), 'npc')</code></div>
                        <div><code className="text-blue-300">nql.extract_facts(text_col, 'npc')</code></div>
                        <div><code className="text-yellow-400">{"{{ ref('table_name') }}"}</code> <code className="text-pink-400">{"{{ config(materialized='table') }}"}</code></div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsEditing(false)}
                        className="theme-button px-4 py-2 rounded text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveModel}
                        disabled={loading || !modelName.trim() || !modelSql.trim()}
                        className="theme-button-primary px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <Database size={16} />
                        {loading ? 'Saving...' : 'Save Model'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-xs theme-text-muted">Target DB:</label>
                    <select
                        value={selectedDatabase}
                        onChange={e => setSelectedDatabase(e.target.value)}
                        className="theme-input text-sm py-1 px-2 rounded min-w-[200px]"
                    >
                        {availableDatabases.map(db => (
                            <option key={db.path} value={db.path}>{db.name}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={handleCreateModel}
                    className="theme-button-primary px-4 py-2 rounded text-sm flex items-center gap-2"
                >
                    <Plus size={16} /> New Model
                </button>
            </div>

            {loading ? (
                <div className="text-center py-8 theme-text-muted">Loading models...</div>
            ) : models.length === 0 ? (
                <div className="text-center py-12 theme-bg-tertiary rounded-lg">
                    <Database size={48} className="mx-auto mb-4 text-gray-500" />
                    <h3 className="text-lg font-semibold mb-2">No SQL Models Yet</h3>
                    <p className="theme-text-muted text-sm max-w-md mx-auto mb-4">
                        Create SQL models with npcsql syntax to build knowledge analytics databases.
                        Use jinja-style references to NPCs and Jinxes for AI-powered transformations.
                    </p>
                    <button
                        onClick={handleCreateModel}
                        className="theme-button-primary px-4 py-2 rounded text-sm"
                    >
                        Create First Model
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {models.map((model: any) => (
                        <div key={model.id || model.name} className="theme-bg-tertiary p-4 rounded-lg">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{model.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            model.materialization === 'view' ? 'bg-blue-900/30 text-blue-400' :
                                            model.materialization === 'incremental' ? 'bg-yellow-900/30 text-yellow-400' :
                                            'bg-purple-900/30 text-purple-400'
                                        }`}>
                                            {model.materialization || 'table'}
                                        </span>
                                        {model.schedule && (
                                            <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded flex items-center gap-1">
                                                <Clock size={10} /> {model.schedule}
                                            </span>
                                        )}
                                        {model.npc && (
                                            <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">
                                                NPC: {model.npc}
                                            </span>
                                        )}
                                    </div>
                                    {model.description && (
                                        <p className="text-sm theme-text-muted">{model.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleRunModel(model)}
                                        className="p-2 text-green-400 hover:bg-green-900/30 rounded"
                                        title="Run model"
                                    >
                                        <Play size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleEditModel(model)}
                                        className="p-2 theme-text-muted hover:theme-bg-secondary rounded"
                                        title="Edit model"
                                    >
                                        <Wrench size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteModel(model.id)}
                                        className="p-2 text-red-400 hover:bg-red-900/30 rounded"
                                        title="Delete model"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 theme-bg-tertiary rounded p-2 font-mono text-xs theme-text-muted max-h-20 overflow-hidden">
                                {model.sql?.substring(0, 200)}...
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const DatabasesContent = ({ currentPath, isGlobal }: { currentPath: string; isGlobal: boolean }) => {
    const [databases, setDatabases] = useState<{ value: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newDbPath, setNewDbPath] = useState('');

    const loadDatabases = async () => {
        setLoading(true);
        setError(null);
        try {
            const ctxPath = effectivePath ? `${effectivePath}/team.ctx` : null;
            if (!ctxPath) {
                setDatabases([]);
                return;
            }
            const content = await (window as any).api.readFileContent(ctxPath);
            const parsed = yaml.load(content) || {};
            setDatabases(parsed.databases || []);
        } catch {
            setDatabases([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDatabases();
    }, [currentPath, isGlobal]);

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            const ctxPath = effectivePath ? `${effectivePath}/team.ctx` : null;
            if (!ctxPath) return;
            let parsed = {};
            try {
                const content = await (window as any).api.readFileContent(ctxPath);
                parsed = yaml.load(content) || {};
            } catch { }
            parsed.databases = databases;
            await (window as any).api.writeFileContent(ctxPath, yaml.dump(parsed));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        if (!newDbPath.trim()) return;
        setDatabases(prev => [...prev, { value: newDbPath.trim() }]);
        setNewDbPath('');
    };

    const handleRemove = (index: number) => {
        setDatabases(prev => prev.filter((_, i) => i !== index));
    };

    const handleChange = (index: number, value: string) => {
        setDatabases(prev => prev.map((db, i) => i === index ? { value } : db));
    };

    if (!isGlobal && !currentPath) {
        return <div className="text-center py-12 theme-text-muted">Select a project folder or switch to Global.</div>;
    }

    return (
        <div className="space-y-6">
            {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

            <div className="space-y-3">
                {databases.map((db, idx) => (
                    <div key={idx} className="flex gap-2 items-center theme-bg-tertiary p-3 rounded-lg">
                        <Database size={18} className="text-blue-400 flex-shrink-0" />
                        <input
                            type="text"
                            value={db.value || ''}
                            onChange={(e) => handleChange(idx, e.target.value)}
                            className="flex-1 theme-input text-sm font-mono"
                            placeholder="~/path/to/database.db"
                        />
                        <button onClick={() => handleRemove(idx)} className="p-2 text-red-400 hover:bg-red-900/30 rounded">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                {databases.length === 0 && (
                    <div className="text-center py-8 theme-text-muted">No databases configured.</div>
                )}
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={newDbPath}
                    onChange={(e) => setNewDbPath(e.target.value)}
                    placeholder="~/.incognide/history.db"
                    className="flex-1 theme-input text-sm font-mono"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <button onClick={handleAdd} className="theme-button px-4 py-2 rounded text-sm flex items-center gap-2">
                    <Plus size={16} /> Add
                </button>
            </div>

            <div className="border-t theme-border pt-4 flex justify-end">
                <button onClick={handleSave} disabled={loading} className="theme-button-primary px-4 py-2 rounded text-sm flex items-center gap-2">
                    <Save size={16} /> {loading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    );
};

const AI_DEFAULT_SETTINGS = {
    model: 'llama3',
    provider: 'ollama',
    embedding_model: 'nomic-text-embed',
    embedding_provider: 'ollama',
    search_provider: 'duckduckgo',
    default_to_agent: false,
    is_predictive_text_enabled: false,
    predictive_text_model: 'llama3',
    predictive_text_provider: 'ollama',
};

const AiSettingsContent = () => {
    const [settings, setSettings] = useState<any>(AI_DEFAULT_SETTINGS);
    const [globalVars, setGlobalVars] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
    const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [customProviders, setCustomProviders] = useState<Record<string, any>>({});

    const isSensitiveField = (key: string) => {
        const sensitiveWords = ['key', 'token', 'secret', 'password', 'api'];
        return sensitiveWords.some(w => key.toLowerCase().includes(w));
    };

    useEffect(() => {
        (async () => {
            const data = await (window as any).api.loadGlobalSettings();
            if (data.error) return;
            setSettings({ ...AI_DEFAULT_SETTINGS, ...(data.global_settings || {}) });
            if (data.global_vars && Object.keys(data.global_vars).length > 0) {
                const parsed = Object.entries(data.global_vars)
                    .map(([key, value]) => ({ key, value: value as string }));
                setGlobalVars(parsed.length > 0 ? parsed : [{ key: '', value: '' }]);
            }
            try {
                const cpData = await (window as any).api.customProvidersRead();
                if (cpData?.providers) setCustomProviders(cpData.providers);
            } catch {}
        })();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const existingData = await (window as any).api.loadGlobalSettings();
            const existingSettings = existingData.global_settings || {};

            const newVars: Record<string, string> = {};
            globalVars.forEach(({ key, value }) => {
                if (key && value) newVars[key] = value;
            });

            await (window as any).api.saveGlobalSettings({
                global_settings: { ...existingSettings, ...settings },
                global_vars: newVars,
            });
        } finally {
            setSaving(false);
        }
    };

    const baseProviderOptions = [
        { value: 'ollama', label: 'Ollama' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'gemini', label: 'Gemini' },
        { value: 'lmstudio', label: 'LM Studio' },
        { value: 'llamacpp', label: 'llama.cpp' },
    ];
    const customProviderOptions = Object.entries(customProviders).map(([name]) => ({
        value: name, label: name.charAt(0).toUpperCase() + name.slice(1),
    }));
    const providerOptions = [...baseProviderOptions, ...customProviderOptions.filter(
        cp => !baseProviderOptions.some(bp => bp.value === cp.value)
    )];

    const searchProviderOptions = [
        { value: 'duckduckgo', label: 'DuckDuckGo' },
        { value: 'google', label: 'Google' },
        { value: 'brave', label: 'Brave Search' },
        { value: 'perplexity', label: 'Perplexity' },
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-sm font-semibold theme-text-secondary">Language Model</h3>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Model</label>
                        <input
                            type="text"
                            value={settings.model || ''}
                            onChange={e => setSettings({ ...settings, model: e.target.value })}
                            className="w-full theme-input text-sm"
                            placeholder="llama3"
                        />
                    </div>
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Provider</label>
                        <select
                            value={settings.provider || 'ollama'}
                            onChange={e => setSettings({ ...settings, provider: e.target.value })}
                            className="w-full theme-input text-sm"
                        >
                            {providerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <h3 className="text-sm font-semibold theme-text-secondary pt-2">Embeddings</h3>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Embedding Model</label>
                        <input
                            type="text"
                            value={settings.embedding_model || ''}
                            onChange={e => setSettings({ ...settings, embedding_model: e.target.value })}
                            className="w-full theme-input text-sm"
                            placeholder="nomic-text-embed"
                        />
                    </div>
                    <div>
                        <label className="text-xs theme-text-muted block mb-1">Embedding Provider</label>
                        <select
                            value={settings.embedding_provider || 'ollama'}
                            onChange={e => setSettings({ ...settings, embedding_provider: e.target.value })}
                            className="w-full theme-input text-sm"
                        >
                            {providerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <h3 className="text-sm font-semibold theme-text-secondary pt-2">Search</h3>
                <div>
                    <label className="text-xs theme-text-muted block mb-1">Search Provider</label>
                    <select
                        value={settings.search_provider || 'duckduckgo'}
                        onChange={e => setSettings({ ...settings, search_provider: e.target.value })}
                        className="w-full theme-input text-sm"
                    >
                        {searchProviderOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>

                <h3 className="text-sm font-semibold theme-text-secondary pt-2">Behavior</h3>
                <div className="theme-bg-tertiary p-3 rounded-lg space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!settings.is_predictive_text_enabled}
                            onChange={e => setSettings({ ...settings, is_predictive_text_enabled: e.target.checked })}
                            className="w-4 h-4"
                        />
                        <span className="text-sm">Predictive Text (Copilot)</span>
                    </label>
                </div>

                <h3 className="text-sm font-semibold theme-text-secondary pt-2">API Keys &amp; Global Variables</h3>
                <div className="space-y-2">
                    {globalVars.map((variable, index) => (
                        <div key={index} className="flex gap-2">
                            <input
                                type="text"
                                value={variable.key}
                                onChange={e => {
                                    const next = [...globalVars];
                                    next[index] = { ...next[index], key: e.target.value };
                                    setGlobalVars(next);
                                }}
                                placeholder="Variable name (e.g. OPENAI_API_KEY)"
                                className="flex-1 theme-input text-sm"
                            />
                            <div className="flex-1 relative">
                                <input
                                    type={visibleFields[`gv_${index}`] || !isSensitiveField(variable.key) ? 'text' : 'password'}
                                    value={variable.value}
                                    onChange={e => {
                                        const next = [...globalVars];
                                        next[index] = { ...next[index], value: e.target.value };
                                        setGlobalVars(next);
                                    }}
                                    placeholder="Value"
                                    className="w-full theme-input text-sm"
                                />
                                {isSensitiveField(variable.key) && (
                                    <button
                                        type="button"
                                        onClick={() => setVisibleFields(prev => ({ ...prev, [`gv_${index}`]: !prev[`gv_${index}`] }))}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted"
                                    >
                                        {visibleFields[`gv_${index}`] ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    const next = globalVars.filter((_, i) => i !== index);
                                    setGlobalVars(next.length > 0 ? next : [{ key: '', value: '' }]);
                                }}
                                className="p-2 text-red-400 hover:bg-red-900/20 rounded"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => setGlobalVars([...globalVars, { key: '', value: '' }])}
                        className="theme-button px-3 py-1.5 rounded text-sm flex items-center gap-2"
                    >
                        <Plus size={14} /> Add Variable
                    </button>
                </div>
            </div>

            <div className="border-t theme-border pt-4 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="theme-button-primary px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    <Save size={16} /> {saving ? 'Saving...' : 'Save AI Settings'}
                </button>
            </div>
        </div>
    );
};

const TeamManagement: React.FC<TeamManagementProps> = ({
    isOpen,
    onClose,
    currentPath,
    startNewConversation,
    startNewChat,
    npcList = [],
    jinxList = [],
    embedded = false,
    currentNpc = '',
    initialTab,
    forceTab,
    onTabChange
}) => {
    const [activeTab, setActiveTab] = useState<TabId>(initialTab || 'context');
    useEffect(() => { if (forceTab) setActiveTab(forceTab); }, [forceTab]);
    const changeTab = (tab: TabId) => { setActiveTab(tab); onTabChange?.(tab); };

    const [registeredTeams, setRegisteredTeams] = useState<Record<string, string>>({});
    const [selectedTeam, setSelectedTeam] = useState<string>('');
    const [projectTeamExists, setProjectTeamExists] = useState(false);
    const [discoveredTeams, setDiscoveredTeams] = useState<any[]>([]);
    const [scanning, setScanning] = useState(false);
    const [jinxMenuInitialJinxName, setJinxMenuInitialJinxName] = useState<string | undefined>(undefined);

    const loadRegisteredTeams = async () => {
        try {
            const data = await (window as any).api.teamsRead();
            if (data?.teams) setRegisteredTeams(data.teams);
        } catch {}
    };

    useEffect(() => { loadRegisteredTeams(); }, []);

    // Detect project team and set default selected team
    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            let hasProject = false;
            if (currentPath) {
                try {
                    const res = await (window as any).api.getProjectContext(currentPath);
                    hasProject = !!res?.path;
                } catch { /* ignore */ }
            }
            setProjectTeamExists(hasProject);
            // Default team selection: first registered team, or project if none registered
            if (!selectedTeam) {
                const keys = Object.keys(registeredTeams);
                if (keys.length > 0) {
                    setSelectedTeam(keys[0]);
                } else if (hasProject) {
                    setSelectedTeam('project');
                }
            }
        })();
    }, [isOpen, currentPath, registeredTeams]);

    const handleScanTeams = async () => {
        setScanning(true);
        try {
            const result = await (window as any).api.teamsScan(currentPath);
            if (result?.discovered) setDiscoveredTeams(result.discovered);
        } catch {}
        setScanning(false);
    };

    const handleRegisterTeam = async (team: any) => {
        try {
            const data = await (window as any).api.teamsRead();
            const teams = data?.teams || {};
            const key = team.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
            teams[key] = team.path;
            await (window as any).api.teamsWrite(teams);
            setRegisteredTeams(teams);
            setDiscoveredTeams(prev => prev.filter(t => t.path !== team.path));
            if (!selectedTeam) setSelectedTeam(key);
        } catch {}
    };

    const isGlobal = selectedTeam !== 'project';
    const globalPath = isGlobal ? (registeredTeams[selectedTeam] || undefined) : undefined;
    const effectivePath = isGlobal ? (globalPath || '') : (currentPath || '');

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const generalSections: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'ai-settings', label: 'AI Settings', icon: <Cpu size={16} /> },
        { id: 'llm-models', label: 'Models', icon: <Box size={16} /> },
        { id: 'voice', label: 'Voice / TTS', icon: <Mic size={16} /> },
    ];

    const teamSections: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'context', label: 'Context', icon: <FileJson size={16} /> },
        { id: 'npcs', label: 'NPCs', icon: <Users size={16} /> },
        { id: 'jinxes', label: 'Jinxes', icon: <Zap size={16} /> },
        { id: 'mcp', label: 'MCP', icon: <Server size={16} /> },
        { id: 'memory', label: 'Memory', icon: <MemoryIcon size={16} /> },
        { id: 'knowledge', label: 'Knowledge', icon: <KgIcon size={16} /> },
        { id: 'cron', label: 'Scheduler', icon: <SmokestackIcon size={16} /> },
        { id: 'databases', label: 'Databases', icon: <Database size={16} /> },
    ];

    if (!isOpen && !embedded) return null;

    const content = (
        <div className={embedded ? "flex flex-col h-full" : "relative w-[90vw] max-w-6xl h-[85vh] theme-bg-primary rounded-xl shadow-2xl border theme-border flex flex-col overflow-hidden"}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Users className="text-purple-400" size={20} />
                    <h2 className="text-lg font-semibold">Team</h2>
                </div>
                <div className="flex items-center gap-2">
                    {!embedded && (
                        <button onClick={onClose} className="p-1.5 rounded-lg theme-hover transition-colors">
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sidebar + Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left sidebar */}
                <div className="w-44 flex-shrink-0 border-r theme-border overflow-y-auto py-2 space-y-2">
                    {/* General Settings */}
                    <div>
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider theme-text-muted font-semibold">General</div>
                        {generalSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => changeTab(section.id)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                                    activeTab === section.id
                                        ? 'bg-purple-600/15 text-purple-400 border-l-2 border-purple-500'
                                        : 'theme-text-secondary hover:theme-text-primary hover:bg-white/5 border-l-2 border-transparent'
                                }`}
                            >
                                {section.icon}
                                {section.label}
                            </button>
                        ))}
                    </div>

                    {/* Team Settings */}
                    <div>
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider theme-text-muted font-semibold">Team</div>
                        <div className="px-3 py-1.5">
                            <select
                                value={selectedTeam}
                                onChange={e => setSelectedTeam(e.target.value)}
                                className="w-full theme-input text-xs py-1.5 px-2 rounded"
                            >
                                {Object.entries(registeredTeams).map(([key, path]) => (
                                    <option key={key} value={key}>{key}</option>
                                ))}
                                {projectTeamExists && (
                                    <option value="project">Current Project</option>
                                )}
                            </select>
                            <button
                                onClick={handleScanTeams}
                                disabled={scanning}
                                className="mt-1 w-full px-2 py-1 rounded text-[10px] theme-text-muted hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-1"
                                title="Discover team directories"
                            >
                                <Search size={10} /> {scanning ? 'Scanning...' : 'Discover'}
                            </button>
                            {discoveredTeams.length > 0 && (
                                <div className="mt-1 theme-bg-tertiary rounded border theme-border max-h-32 overflow-y-auto">
                                    {discoveredTeams.map((team, i) => (
                                        <div key={i} className="flex items-center justify-between px-2 py-1 border-b theme-border last:border-b-0 hover:bg-white/5 text-[10px]">
                                            <div className="flex-1 min-w-0">
                                                <span className="font-medium theme-text-primary">{team.name}</span>
                                                <span className="theme-text-muted ml-1">{team.npcCount} NPC{team.npcCount !== 1 ? 's' : ''}</span>
                                            </div>
                                            <button
                                                onClick={() => handleRegisterTeam(team)}
                                                className="ml-1 px-1 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white flex-shrink-0 text-[9px]"
                                            >
                                                Register
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {teamSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => changeTab(section.id)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                                    activeTab === section.id
                                        ? 'bg-purple-600/15 text-purple-400 border-l-2 border-purple-500'
                                        : 'theme-text-secondary hover:theme-text-primary hover:bg-white/5 border-l-2 border-transparent'
                                }`}
                            >
                                {section.icon}
                                {section.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {(activeTab === 'memory' || activeTab === 'cron' || activeTab === 'llm-models' || activeTab === 'voice' || activeTab === 'knowledge') ? null : (
                        <div className="flex-1 overflow-auto p-6">
                            {activeTab === 'context' && (
                                <CtxEditor
                                    isOpen={true}
                                    onClose={() => {}}
                                    currentPath={effectivePath}
                                    embedded={true}
                                    isGlobal={isGlobal}
                                    globalPath={globalPath}
                                />
                            )}
                            {activeTab === 'npcs' && (
                                <div className="space-y-4">
                                    <NPCTeamMenu
                                        isOpen={true}
                                        onClose={() => {}}
                                        currentPath={effectivePath}
                                        startNewConversation={startNewConversation}
                                        embedded={true}
                                        isGlobal={isGlobal}
                                        globalPath={globalPath}
                                        onOpenJinxTab={(name) => {
                                            setJinxMenuInitialJinxName(name);
                                            changeTab('jinxes');
                                        }}
                                    />
                                </div>
                            )}
                            {activeTab === 'jinxes' && (
                                <JinxMenu
                                    isOpen={true}
                                    onClose={() => {}}
                                    currentPath={effectivePath}
                                    embedded={true}
                                    isGlobal={isGlobal}
                                    globalPath={globalPath}
                                    initialJinxName={jinxMenuInitialJinxName}
                                />
                            )}
                            {activeTab === 'mcp' && (
                                <McpManager currentPath={effectivePath} embedded={true} />
                            )}
                            {activeTab === 'models' && (
                                <SqlModelsContent
                                    currentPath={effectivePath}
                                    isGlobal={isGlobal}
                                />
                            )}
                            {activeTab === 'databases' && (
                                <DatabasesContent
                                    currentPath={effectivePath}
                                    isGlobal={isGlobal}
                                />
                            )}
                            {activeTab === 'ai-settings' && (
                                <AiSettingsContent />
                            )}
                        </div>
                    )}
                    {activeTab === 'memory' && (
                        <MemoryManagement isModal={false} currentPath={currentPath} />
                    )}
                    {activeTab === 'cron' && (
                        <CronDaemonPanel
                            isOpen={true}
                            onClose={() => {}}
                            currentPath={effectivePath}
                            npcList={npcList}
                            jinxList={jinxList}
                            isPane={true}
                            isGlobal={isGlobal}
                        />
                    )}
                    {activeTab === 'llm-models' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <ModelManager onStartChat={startNewChat} />
                        </div>
                    )}
                    {activeTab === 'voice' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <VoiceManager />
                        </div>
                    )}
                    {activeTab === 'knowledge' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <Suspense fallback={<div className="flex items-center justify-center py-12 theme-text-muted">Loading...</div>}>
                                <KnowledgeGraphEditor isModal={false} />
                            </Suspense>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );


    if (embedded) {
        return <>{content}</>;
    }

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                {content}
            </div>
        </>
    );
};

export default TeamManagement;
