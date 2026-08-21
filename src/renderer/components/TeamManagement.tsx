import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
    X, FileJson, Search, Users, Wrench, Clock, Database, Plus, Trash2, Play, Pause, Server, Mail, Save,
    Brain, GitBranch, Cpu, Box, Code, Mic, Globe, Eye, EyeOff, Check, ChevronRight, Zap, RefreshCw, BrainCircuit
} from 'lucide-react';
import { Input } from 'npcts';
import yaml from 'js-yaml';
import SmokestackIcon from './icons/SmokestackIcon';
import MemoryIcon from './icons/MemoryIcon';
import KgIcon from './icons/KgIcon';

import CtxEditor from './CtxEditor';
import NPCTeamMenu from './NPCTeamMenu';
import JinxMenu from './JinxMenu';
import CronDaemonPanel from './CronDaemonPanel';
import MemoryManagement from './MemoryManagement';
import ModelManager from './ModelManager';
import StoreRegistryPanel from './StoreRegistryPanel';
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
    initialJinxName?: string;
    onOpenJinxPane?: (name: string) => void;
    onOpenDatabase?: (path: string) => void;
    currentModel?: string;
    currentProvider?: string;
    availableModels?: any[];
}

type TabId = 'context' | 'npcs' | 'jinxes' | 'knowledge' | 'cron' | 'models' | 'llm-models';

const SqlModelsContent = ({ currentPath, teamKey, npcList = [], jinxList = [] }: { currentPath: string; teamKey?: string; npcList?: any[]; jinxList?: any[] }) => {
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
            const response = await (window as any).api.getSqlModelsProject?.(currentPath);
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
            const npcResponse = teamKey
                ? await (window as any).api.getNPCTeamFromPath?.(teamKey)
                : await (window as any).api.getNPCTeamProject?.(currentPath);
            if (npcResponse?.npcs) setNpcs(npcResponse.npcs);

            const jinxResponse = teamKey
                ? await (window as any).api.getJinxesTeam?.(teamKey)
                : await (window as any).api.getJinxesProject?.(currentPath);
            if (jinxResponse?.jinxes) setJinxes(jinxResponse.jinxes);
        } catch (err) {
            console.error('Failed to fetch NPCs/Jinxes:', err);
        }
    };

    const fetchAvailableDatabases = async () => {
        const databases: { name: string; path: string }[] = [
            { name: 'History (history.db)', path: '~/.incognide/history.db' }
        ];

        try {
            if (currentPath) {
                const ctx = await (window as any).api.getContextProject?.(currentPath);
                if (ctx?.databases) {
                    for (const db of ctx.databases) {
                        if (!databases.find(d => d.path === db.path)) {
                            databases.push({ name: db.name || db.path, path: db.path });
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
    }, [currentPath, teamKey]);

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

            const res = await (window as any).api.saveSqlModelProject?.({ path: currentPath, model: modelData });

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
            const res = await (window as any).api.deleteSqlModelProject?.({ path: currentPath, modelId });
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

    if (!currentPath) {
        return (
            <div className="text-center py-12">
                <Database size={48} className="mx-auto mb-4 text-gray-500" />
                <p className="theme-text-muted">Select a team to manage SQL models.</p>
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

const findCtxFile = async (dirPath: string) => {
    try {
        const items = await (window as any).api.readDirectory(dirPath);
        const ctxFiles = (items || []).filter(item => item.name && item.name.endsWith('.ctx'));
        if (ctxFiles.length > 0) return ctxFiles[0].name;
    } catch { }
    return null;
};


const ResizableSplitPane: React.FC<{
    top: React.ReactNode;
    bottom: React.ReactNode;
    initialRatio?: number;
    minTopPct?: number;
    minBottomPct?: number;
}> = ({ top, bottom, initialRatio = 50, minTopPct = 20, minBottomPct = 20 }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [ratio, setRatio] = React.useState(initialRatio);
    const draggingRef = React.useRef(false);

    React.useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!draggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pct = ((e.clientY - rect.top) / rect.height) * 100;
            const clamped = Math.max(minTopPct, Math.min(100 - minBottomPct, pct));
            setRatio(clamped);
        };
        const handleUp = () => { draggingRef.current = false; };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [minTopPct, minBottomPct]);

    return (
        <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
            <div style={{ height: `${ratio}%`, minHeight: `${minTopPct}%` }} className="overflow-hidden">
                {top}
            </div>
            <div
                className="h-2 bg-gray-700/30 hover:bg-gray-600/50 cursor-row-resize flex-shrink-0 flex items-center justify-center"
                onMouseDown={() => { draggingRef.current = true; }}
                title="Drag to resize"
            >
                <div className="w-8 h-1 rounded-full bg-gray-500/50" />
            </div>
            <div style={{ height: `${100 - ratio}%`, minHeight: `${minBottomPct}%` }} className="overflow-hidden">
                {bottom}
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
    onTabChange,
    initialJinxName,
    onOpenJinxPane,
    onOpenDatabase,
    currentModel,
    currentProvider,
    availableModels = [],
}) => {
    const [activeTab, setActiveTab] = useState<TabId>(initialTab || 'context');
    useEffect(() => { if (forceTab) setActiveTab(forceTab); }, [forceTab]);
    const changeTab = (tab: TabId) => { setActiveTab(tab); onTabChange?.(tab); };

    const [knowledgeSubTab, setKnowledgeSubTab] = useState('indexing');
    type KnowledgeSubTab = 'indexing' | 'stores' | 'memory' | 'graph';

    const [sharedMemories, setSharedMemories] = useState<any[]>([]);
    const [sharedKnowledge, setSharedKnowledge] = useState<any[]>([]);
    const [sharedLoading, setSharedLoading] = useState(false);


    const defaultKnowledgeDefaults = {
        included_exts: [] as string[],
        excluded_dirs: ['node_modules', '.git', '__pycache__', '.incognide', 'dist', 'build'] as string[],
        default_auto_index: false,
    };

    interface KnowledgeLocation {
        directory: string;
        knowledge_enabled: boolean;
        index_files: boolean;
        link_knowledge: boolean;
        extract_memories: boolean;
        auto_index: boolean;
        discovered_from: string;
        staleReasons?: string[];
        fileCount?: number;
    }

    const [knowledgeDefaults, setKnowledgeDefaults] = useState(defaultKnowledgeDefaults);
    const [knowledgeLocations, setKnowledgeLocations] = useState<KnowledgeLocation[]>([]);
    const [knowledgeLoading, setKnowledgeLoading] = useState(false);
    const [knowledgeModel, setKnowledgeModel] = useState<string>('');
    const [knowledgeProvider, setKnowledgeProvider] = useState<string>('');
    const [knowledgeContext, setKnowledgeContext] = useState('');
    const [knowledgeBuildJob, setKnowledgeBuildJob] = useState<{
        directory: string;
        jobId: string | null;
        status: 'running' | 'done' | 'error';
        message: string;
    } | null>(null);
    const [knowledgeLogs, setKnowledgeLogs] = useState<{ kind: string; message: string; timestamp: number }[]>([]);
    const knowledgeLogsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = knowledgeLogsRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [knowledgeLogs]);

    const resolveKnowledgeModel = async () => {
        if (knowledgeModel && knowledgeProvider) {
            return { model: knowledgeModel, provider: knowledgeProvider };
        }
        if (currentModel && currentProvider) {
            return { model: currentModel, provider: currentProvider };
        }
        try {
            const ctx = await (window as any).api?.getProjectCtx?.(currentPath);
            if (ctx?.model && ctx?.provider) {
                return { model: ctx.model, provider: ctx.provider };
            }
        } catch {}
        try {
            const lastModel = JSON.parse(localStorage.getItem('incognideLastModel') || 'null');
            const lastProvider = JSON.parse(localStorage.getItem('incognideLastProvider') || 'null');
            if (lastModel && lastProvider) {
                return { model: lastModel, provider: lastProvider };
            }
        } catch {}
        return { model: null, provider: null };
    };

    const loadKnowledgeDefaults = async () => {
        try {
            const r = await (window as any).api?.indexLocationsDefaults?.();
            if (r?.defaults) setKnowledgeDefaults({ ...defaultKnowledgeDefaults, ...r.defaults });
        } catch (err: any) {
            console.error('[TeamManagement] loadKnowledgeDefaults error:', err);
        }
    };

    const loadKnowledgeLocations = async () => {
        setKnowledgeLoading(true);
        try {
            const r = await (window as any).api?.indexLocationsList?.();
            setKnowledgeLocations(r?.locations || []);
        } catch (err: any) {
            console.error('[TeamManagement] loadKnowledgeLocations error:', err);
        } finally {
            setKnowledgeLoading(false);
        }
    };

    const saveKnowledgeDefaults = async (updates: Partial<typeof defaultKnowledgeDefaults>) => {
        const next = { ...knowledgeDefaults, ...updates };
        setKnowledgeDefaults(next);
        try {
            await (window as any).api?.indexLocationsUpdateDefaults?.(next);
        } catch (err: any) {
            console.error('[TeamManagement] saveKnowledgeDefaults error:', err);
        }
    };

    const toggleLocation = async (dir: string, field: keyof KnowledgeLocation, value: boolean) => {
        try {
            await (window as any).api?.indexLocationsUpdate?.(dir, { [field]: value });
            loadKnowledgeLocations();
        } catch (err: any) {
            console.error('[TeamManagement] toggleLocation error:', err);
        }
    };

    const indexLocation = async (dir: string) => {
        setKnowledgeLogs([]);
        setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'running', message: 'Scanning files...' });
        try {
            await (window as any).api?.indexLocationsEnable?.(dir);
            const res = await (window as any).api?.indexLocationsScan?.({
                dirPath: dir,
                includedExts: knowledgeDefaults.included_exts,
                excludedDirs: knowledgeDefaults.excluded_dirs,
            });
            if (res?.error || !res?.success) {
                setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'error', message: res?.error || 'Scan failed' });
            } else {
                const { added, updated, removed, unchanged } = res.stats || {};
                setKnowledgeBuildJob({
                    directory: dir,
                    jobId: null,
                    status: 'done',
                    message: `Indexed ${dir}: ${added || 0} added, ${updated || 0} updated, ${removed || 0} removed, ${unchanged || 0} unchanged.`,
                });
                if (res.logs?.length) {
                    setKnowledgeLogs(res.logs.map((l: any) => ({ kind: l.kind || 'stdout', message: l.message || '', timestamp: l.timestamp || Date.now() })));
                }
            }
            loadKnowledgeLocations();
        } catch (err: any) {
            console.error('[TeamManagement] indexLocation error:', err);
            setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'error', message: err?.message || String(err) });
        }
    };

    const extractLocation = async (dir: string) => {
        setKnowledgeLogs([]);
        setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'running', message: 'Resolving AI model...' });
        const { model, provider } = await resolveKnowledgeModel();
        if (!model || !provider) {
            setKnowledgeBuildJob({
                directory: dir,
                jobId: null,
                status: 'error',
                message: 'No AI model/provider selected. Choose a model below before extracting knowledge.',
            });
            return;
        }
        setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'running', message: 'Starting knowledge extraction...' });
        try {
            const res = await (window as any).api?.kgPipelineRun?.({
                step: 'assimilate',
                storePaths: [dir],
                model,
                provider,
                context: knowledgeContext,
            });
            if (res?.error) {
                setKnowledgeBuildJob({ directory: dir, jobId: res?.jobId || null, status: 'error', message: res.error });
            } else {
                setKnowledgeBuildJob({
                    directory: dir,
                    jobId: res?.jobId || null,
                    status: 'running',
                    message: `Extracting knowledge with ${model} (${provider}).`,
                });
            }
            loadKnowledgeLocations();
        } catch (err: any) {
            console.error('[TeamManagement] extractLocation error:', err);
            setKnowledgeBuildJob({ directory: dir, jobId: null, status: 'error', message: err?.message || String(err) });
        }
    };

    const resetLocation = async (dir: string) => {
        if (!confirm(`Reset knowledge store for ${dir}? This deletes its .knowledge.yaml and starts fresh.`)) return;
        try {
            await (window as any).api?.indexLocationsReset?.(dir);
            await loadKnowledgeLocations();
            await indexLocation(dir);
            if ((await (window as any).api?.indexLocationsShouldExtract?.(dir))?.shouldExtract) {
                await extractLocation(dir);
            }
        } catch (err: any) {
            console.error('[TeamManagement] resetLocation error:', err);
        }
    };

    const sourceLabel = (source?: string) => {
        if (!source) return 'unknown';
        const labels: Record<string, string> = {
            recent: 'recent',
            workspace: 'workspace',
            conversation: 'chat',
            terminal: 'terminal',
            registry: 'registry',
            bookmark: 'bookmark',
            browser: 'browser',
            manual: 'manual',
        };
        return labels[source] || source;
    };

    const loadSharedKnowledge = async () => {
        setSharedLoading(true);
        try {
            const data = await (window as any).api?.kgLoadStoreData?.({}).catch(() => ({}));
            setSharedMemories(data.memories || []);
            setSharedKnowledge(data.knowledge || []);
        } catch (err: any) {
            console.error('[TeamManagement] loadSharedKnowledge error:', err);
        } finally {
            setSharedLoading(false);
        }
    };

    useEffect(() => {
        const unsub = (window as any).api?.onKgPipelineLog?.((entry: any) => {
            setKnowledgeLogs(prev => [...prev, {
                kind: entry.kind || 'stdout',
                message: entry.message || '',
                timestamp: entry.timestamp || Date.now(),
            }]);
            setKnowledgeBuildJob((prev) => {
                if (!prev || !prev.jobId || entry.jobId !== prev.jobId) return prev;
                if (entry.kind === 'error') {
                    return { ...prev, status: 'error', message: entry.message || 'Knowledge build failed' };
                }
                if (entry.kind === 'finish') {
                    return { ...prev, status: 'done', message: entry.message || 'Knowledge build finished' };
                }
                if (entry.kind === 'done') {
                    return { ...prev, status: 'done', message: entry.message || 'Knowledge build complete' };
                }
                return prev;
            });
            if (entry.kind === 'done' || entry.kind === 'finish') {
                loadSharedKnowledge();
                loadKnowledgeLocations();
            }
        });
        return unsub || (() => {});
    }, []);

    useEffect(() => {
        if (activeTab === 'knowledge') {
            loadSharedKnowledge();
            loadKnowledgeDefaults();
            loadKnowledgeLocations();
        }
    }, [activeTab, currentPath]);

    useEffect(() => {
        if (currentModel && currentProvider && !knowledgeModel) {
            setKnowledgeModel(currentModel);
            setKnowledgeProvider(currentProvider);
        }
    }, [currentModel, currentProvider]);

    const [registeredTeams, setRegisteredTeams] = useState<Record<string, string>>({});
    const [selectedTeam, setSelectedTeam] = useState<string>('');
    const [projectTeamPath, setProjectTeamPath] = useState<string | null>(null);
    const [projectTeamCtxName, setProjectTeamCtxName] = useState<string | null>(null);
    const [discoveredTeams, setDiscoveredTeams] = useState<any[]>([]);
    const [scanning, setScanning] = useState(false);

    const loadRegisteredTeams = async () => {
        try {
            const data = await (window as any).api.teamsRead();
            if (data?.teams) setRegisteredTeams(data.teams);
        } catch {}
    };

    useEffect(() => { loadRegisteredTeams(); }, []);

    useEffect(() => {
        if (!isOpen || !currentPath) {
            setProjectTeamPath(null);
            setProjectTeamCtxName(null);
            return;
        }
        (async () => {
            try {
                const items = await (window as any).api.readDirectory(currentPath);
                const hasNpcTeam = (items || []).some(item => item.name === 'npc_team' && item.isDirectory);
                if (!hasNpcTeam) {
                    setProjectTeamPath(null);
                    setProjectTeamCtxName(null);
                    return;
                }
                const npcTeamPath = `${currentPath}/npc_team`;
                setProjectTeamPath(npcTeamPath);
                try {
                    const npcTeamItems = await (window as any).api.readDirectory(npcTeamPath);
                    const ctxFile = (npcTeamItems || []).find(item => item.name && item.name.endsWith('.ctx'));
                    if (ctxFile) {
                        const base = ctxFile.name.replace(/\.ctx$/, '');
                        setProjectTeamCtxName(base);
                    } else {
                        setProjectTeamCtxName('project');
                    }
                } catch {
                    setProjectTeamCtxName('project');
                }
            } catch {
                setProjectTeamPath(null);
                setProjectTeamCtxName(null);
            }
        })();
    }, [isOpen, currentPath]);

    useEffect(() => {
        if (!isOpen) return;
        if (!selectedTeam) {
            const keys = Object.keys(registeredTeams);
            if (keys.length > 0) {
                setSelectedTeam(keys[0]);
            } else if (projectTeamPath) {
                setSelectedTeam('project');
            }
        }
    }, [isOpen, registeredTeams, projectTeamPath]);

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

    const handleRegisterProjectTeam = async () => {
        if (!projectTeamPath || !projectTeamCtxName) return;
        try {
            const data = await (window as any).api.teamsRead();
            const teams = data?.teams || {};
            const key = projectTeamCtxName.toLowerCase().replace(/[^a-z0-9_]/g, '');
            teams[key] = projectTeamPath;
            await (window as any).api.teamsWrite(teams);
            setRegisteredTeams(teams);
            setSelectedTeam(key);
        } catch {}
    };

    const isProjectTeam = selectedTeam === 'project';
    const effectiveTeamPath = isProjectTeam ? (projectTeamPath || '') : (registeredTeams[selectedTeam] || '');
    const npcMenuPath = isProjectTeam ? currentPath : effectiveTeamPath;
    const npcMenuKey = isProjectTeam ? '' : selectedTeam;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const generalSections: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'llm-models', label: 'Models', icon: <Box size={16} /> },
    ];

    const teamSections: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'context', label: 'Context', icon: <FileJson size={16} /> },
        { id: 'npcs', label: 'Agents', icon: <Users size={16} /> },
        { id: 'jinxes', label: 'Jinxes', icon: <Zap size={16} /> },
        { id: 'knowledge', label: 'Knowledge', icon: <KgIcon size={16} /> },
        { id: 'cron', label: 'Scheduler', icon: <SmokestackIcon size={16} /> },
    ];

    if (!isOpen && !embedded) return null;

    const content = (
        <div className={embedded ? "flex flex-col h-full" : "relative w-[90vw] max-w-6xl h-[85vh] theme-bg-primary rounded-xl shadow-2xl border theme-border flex flex-col overflow-hidden"}>
            
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

            
            <div className="flex flex-1 overflow-hidden">
                
                <div className="w-44 flex-shrink-0 border-r theme-border overflow-y-auto py-2 space-y-2">
                    
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

                    
                    <div>
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider theme-text-muted font-semibold">Team</div>
                        <div className="px-3 py-1.5">
                            <select
                                value={selectedTeam}
                                onChange={e => setSelectedTeam(e.target.value)}
                                className="w-full theme-input text-xs py-1.5 px-2 rounded"
                            >
                                {Object.entries(registeredTeams).map(([key, teamPath]) => {
                                    const parentName = typeof teamPath === 'string' && teamPath.endsWith('/npc_team')
                                        ? teamPath.split('/').slice(-2)[0]
                                        : key;
                                    return (
                                        <option key={key} value={key}>{parentName}</option>
                                    );
                                })}
                                {projectTeamPath && (
                                    <option value="project">{projectTeamCtxName || 'Project'} (unregistered)</option>
                                )}
                            </select>
                            {selectedTeam === 'project' && projectTeamPath && (
                                <button
                                    onClick={handleRegisterProjectTeam}
                                    className="mt-1 w-full px-2 py-1 rounded text-[10px] bg-purple-600 hover:bg-purple-500 text-white transition flex items-center justify-center gap-1"
                                >
                                    <Plus size={10} /> Register Team
                                </button>
                            )}
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

                
                <div className="flex-1 flex flex-col overflow-hidden">
                    {(activeTab === 'cron' || activeTab === 'llm-models' || activeTab === 'knowledge') ? null : (
                        <div className="flex-1 overflow-hidden p-6 flex flex-col">
                            {activeTab === 'context' && (
                                <CtxEditor
                                    isOpen={true}
                                    onClose={() => {}}
                                    teamPath={effectiveTeamPath}
                                    embedded={true}
                                    onOpenDatabase={onOpenDatabase}
                                />
                            )}
                            {activeTab === 'npcs' && (
                                <NPCTeamMenu
                                    isOpen={true}
                                    onClose={() => {}}
                                    currentPath={npcMenuPath}
                                    startNewConversation={startNewConversation}
                                    embedded={true}
                                    teamKey={npcMenuKey}
                                    onOpenJinxTab={onOpenJinxPane}
                                />
                            )}
                            {activeTab === 'jinxes' && (
                                <JinxMenu
                                    isOpen={true}
                                    onClose={() => {}}
                                    currentPath={npcMenuPath}
                                    embedded={true}
                                    teamKey={npcMenuKey}
                                    initialJinxName={initialJinxName}
                                />
                            )}
                            {activeTab === 'models' && (
                                <SqlModelsContent
                                    currentPath={npcMenuPath}
                                    teamKey={npcMenuKey}
                                />
                            )}
                        </div>
                    )}
                    {activeTab === 'cron' && (
                        <CronDaemonPanel
                            isOpen={true}
                            onClose={() => {}}
                            currentPath={currentPath || effectiveTeamPath}
                            npcList={npcList}
                            jinxList={jinxList}
                            isPane={true}
                        />
                    )}
                    {activeTab === 'llm-models' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <ModelManager onStartChat={startNewChat} />
                        </div>
                    )}
                    {activeTab === 'knowledge' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-2 border-b theme-border overflow-x-auto">
                                {[
                                    { id: 'indexing', label: 'Indexing', count: `${knowledgeLocations.filter((l) => l.knowledge_enabled).length}/${knowledgeLocations.length}` },
                                    { id: 'stores', label: 'Knowledge Stores' },
                                    { id: 'memory', label: 'Memory', count: String(sharedMemories.length) },
                                    { id: 'graph', label: 'Knowledge Graph', count: String(sharedKnowledge.length) },
                                ].map((sub) => (
                                    <button
                                        key={sub.id}
                                        onClick={() => setKnowledgeSubTab(sub.id as KnowledgeSubTab)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                                            knowledgeSubTab === sub.id
                                                ? 'bg-blue-600/50 text-white'
                                                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                        }`}
                                    >
                                        {sub.label}
                                        {sub.count && <span className="ml-1.5 text-[10px] opacity-70">{sub.count}</span>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-hidden relative">
                                {knowledgeSubTab === 'indexing' && (
                                    <div className="absolute inset-0 overflow-y-auto p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-white">Knowledge Indexing</h3>
                                            {knowledgeLoading && <span className="text-xs text-gray-400">Loading...</span>}
                                        </div>
                                        <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                                            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Global defaults</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Input
                                                        label="Included file extensions"
                                                        value={(knowledgeDefaults.included_exts || []).join(', ')}
                                                        onChange={(e) => saveKnowledgeDefaults({ included_exts: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                                                        placeholder="e.g., .md, .txt, .py (empty = all)"
                                                    />
                                                    <p className="text-[10px] text-gray-500 mt-1">Comma separated. Leave empty to include all files.</p>
                                                </div>
                                                <div>
                                                    <Input
                                                        label="Excluded directories"
                                                        value={(knowledgeDefaults.excluded_dirs || []).join(', ')}
                                                        onChange={(e) => saveKnowledgeDefaults({ excluded_dirs: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                                                        placeholder="node_modules, .git, ..."
                                                    />
                                                    <p className="text-[10px] text-gray-500 mt-1">Comma separated directory names to skip during indexing.</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-2 theme-bg-tertiary rounded">
                                                <span className="text-sm">Default auto-index for new locations</span>
                                                <button
                                                    onClick={() => saveKnowledgeDefaults({ default_auto_index: !knowledgeDefaults.default_auto_index })}
                                                    className={`w-10 h-5 rounded-full transition-colors ${knowledgeDefaults.default_auto_index ? 'bg-blue-500' : 'bg-gray-400'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${knowledgeDefaults.default_auto_index ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                                                    Discovered locations ({knowledgeLocations.filter((l) => l.knowledge_enabled).length}/{knowledgeLocations.length} active)
                                                </h4>
                                                <button
                                                    onClick={loadKnowledgeLocations}
                                                    disabled={knowledgeLoading}
                                                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <RefreshCw size={12} className={knowledgeLoading ? 'animate-spin' : ''} /> Refresh
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] theme-text-muted block mb-1">Knowledge model</label>
                                                        <select
                                                            value={`${knowledgeModel}|${knowledgeProvider}`}
                                                            onChange={(e) => {
                                                                const [m, p] = e.target.value.split('|');
                                                                setKnowledgeModel(m || '');
                                                                setKnowledgeProvider(p || '');
                                                            }}
                                                            className="w-full theme-input text-xs py-1 px-2 rounded"
                                                        >
                                                            <option value="|">Use chat model</option>
                                                            {availableModels.map((m: any) => (
                                                                <option key={`${m.value}|${m.provider}`} value={`${m.value}|${m.provider}`}>
                                                                    {m.display_name || `${m.value} | ${m.provider}`}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] theme-text-muted block mb-1">Extraction instructions</label>
                                                        <input
                                                            type="text"
                                                            value={knowledgeContext}
                                                            onChange={(e) => setKnowledgeContext(e.target.value)}
                                                            placeholder="Optional context for extraction"
                                                            className="w-full theme-input text-xs py-1 px-2 rounded"
                                                        />
                                                    </div>
                                                </div>
                                                {knowledgeBuildJob && (
                                                    <div className={`text-[11px] px-2 py-1.5 rounded border ${
                                                        knowledgeBuildJob.status === 'error'
                                                            ? 'bg-red-900/30 border-red-700/50 text-red-200'
                                                            : knowledgeBuildJob.status === 'done'
                                                            ? 'bg-green-900/30 border-green-700/50 text-green-200'
                                                            : 'bg-blue-900/30 border-blue-700/50 text-blue-200'
                                                    }`}>
                                                        {knowledgeBuildJob.status === 'running' && <RefreshCw size={10} className="inline mr-1.5 animate-spin" />}
                                                        {knowledgeBuildJob.message}
                                                    </div>
                                                )}
                                                {knowledgeLogs.length > 0 && (
                                                    <div ref={knowledgeLogsRef} className="border border-gray-700/50 rounded bg-black/30 p-2 max-h-48 overflow-y-auto font-mono text-[10px] space-y-0.5">
                                                        {knowledgeLogs.map((log, i) => (
                                                            <div key={i} className={`${
                                                                log.kind === 'error' ? 'text-red-300' :
                                                                log.kind === 'finish' ? 'text-green-300' :
                                                                log.kind === 'start' ? 'text-blue-300' :
                                                                'text-gray-400'
                                                            }`}>
                                                                <span className="text-gray-600 mr-1">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                                {log.message}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="border border-gray-700/50 rounded overflow-hidden max-h-64 overflow-y-auto">
                                                {knowledgeLocations.length === 0 && !knowledgeLoading && (
                                                    <div className="px-3 py-3 text-xs text-gray-500 italic">No locations discovered yet.</div>
                                                )}
                                                {knowledgeLocations.map((loc) => (
                                                    <div key={loc.directory} className="px-3 py-2 border-b border-gray-700/30 last:border-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-xs font-mono text-gray-300 truncate" title={loc.directory}>{loc.directory}</span>
                                                                <span className="text-[10px] text-gray-500">
                                                                    {sourceLabel(loc.discovered_from)} · {loc.knowledge_enabled ? `active · ${loc.fileCount || 0} files indexed` : 'inactive'}
                                                                    {loc.staleReasons?.length ? ` · stale: ${loc.staleReasons.join(', ')}` : ''}
                                                                </span>
                                                            </div>
                                                            {!loc.knowledge_enabled ? (
                                                                <button
                                                                    onClick={() => indexLocation(loc.directory)}
                                                                    disabled={knowledgeBuildJob?.directory === loc.directory && knowledgeBuildJob?.status === 'running'}
                                                                    className="px-2 py-0.5 text-[10px] bg-green-700 hover:bg-green-600 disabled:bg-green-900/50 disabled:text-green-200/50 text-white rounded shrink-0"
                                                                >
                                                                    {knowledgeBuildJob?.directory === loc.directory && knowledgeBuildJob?.status === 'running'
                                                                        ? 'Indexing...'
                                                                        : 'Enable indexing'}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                        {loc.knowledge_enabled && (
                                                            <div className="flex flex-col gap-1.5 mt-1.5 pl-0">
                                                                <div className="flex flex-wrap items-center gap-3">
                                                                    <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={loc.index_files}
                                                                            onChange={(e) => toggleLocation(loc.directory, 'index_files', e.target.checked)}
                                                                            className="accent-green-500"
                                                                        />
                                                                        Index
                                                                    </label>
                                                                    <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={loc.link_knowledge}
                                                                            onChange={(e) => toggleLocation(loc.directory, 'link_knowledge', e.target.checked)}
                                                                            className="accent-green-500"
                                                                        />
                                                                        Link
                                                                    </label>
                                                                    <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={loc.extract_memories}
                                                                            onChange={(e) => toggleLocation(loc.directory, 'extract_memories', e.target.checked)}
                                                                            className="accent-green-500"
                                                                        />
                                                                        Extract
                                                                    </label>
                                                                    <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={loc.auto_index}
                                                                            onChange={(e) => toggleLocation(loc.directory, 'auto_index', e.target.checked)}
                                                                            className="accent-green-500"
                                                                        />
                                                                        Auto
                                                                    </label>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <button
                                                                        onClick={() => indexLocation(loc.directory)}
                                                                        disabled={knowledgeBuildJob?.directory === loc.directory && knowledgeBuildJob?.status === 'running'}
                                                                        className="px-2 py-0.5 text-[10px] bg-blue-700 hover:bg-blue-600 disabled:bg-blue-900/50 disabled:text-blue-200/50 text-white rounded"
                                                                    >
                                                                        Reindex files
                                                                    </button>
                                                                    <button
                                                                        onClick={() => extractLocation(loc.directory)}
                                                                        disabled={knowledgeBuildJob?.directory === loc.directory && knowledgeBuildJob?.status === 'running'}
                                                                        className="px-2 py-0.5 text-[10px] bg-purple-700 hover:bg-purple-600 disabled:bg-purple-900/50 disabled:text-purple-200/50 text-white rounded"
                                                                    >
                                                                        Extract knowledge
                                                                    </button>
                                                                    <button
                                                                        onClick={() => resetLocation(loc.directory)}
                                                                        className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-300 border border-red-700/50 rounded ml-auto"
                                                                    >
                                                                        Reinitialize
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {knowledgeSubTab === 'stores' && (
                                    <div className="absolute inset-0 overflow-y-auto p-4">
                                        <StoreRegistryPanel onSaved={loadSharedKnowledge} />
                                    </div>
                                )}

                                {knowledgeSubTab === 'memory' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                        <MemoryManagement isModal={false} currentPath={currentPath} allMemories={sharedMemories} />
                                    </div>
                                )}

                                {knowledgeSubTab === 'graph' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                        <Suspense fallback={<div className="flex items-center justify-center py-12 theme-text-muted">Loading...</div>}>
                                            <KnowledgeGraphEditor isModal={false} currentPath={currentPath} memories={sharedMemories} knowledge={sharedKnowledge} />
                                        </Suspense>
                                    </div>
                                )}
                            </div>
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
