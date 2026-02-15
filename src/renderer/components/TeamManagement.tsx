import React, { useState, useEffect } from 'react';
import {
    X, FileJson, Users, Wrench, Clock, Database, Plus, Trash2, Play, Pause, Server, Mail, Save
} from 'lucide-react';

// Import existing components
import CtxEditor from './CtxEditor';
import NPCTeamMenu from './NPCTeamMenu';
import JinxMenu from './JinxMenu';
import McpServerMenu from './McpServerMenu';
import NPCTeamSync from './NPCTeamSync';

interface TeamManagementProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string;
    startNewConversation?: (npc: any) => Promise<any>;
    npcList?: any[];
    jinxList?: any[];
    embedded?: boolean;
}

type TabId = 'context' | 'npcs' | 'jinxs' | 'cron' | 'models' | 'databases' | 'mcp';

// Full Cron/Daemon management component
const CronDaemonContent = ({ currentPath, npcList: initialNpcList = [], jinxList: initialJinxList = [], isGlobal }: { currentPath: string; npcList?: any[]; jinxList?: any[]; isGlobal: boolean }) => {
    const [cronJobs, setCronJobs] = useState<any[]>([]);
    const [daemons, setDaemons] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Local NPC and Jinx lists (fetched fresh)
    const [npcs, setNpcs] = useState<any[]>(initialNpcList);
    const [jinxs, setJinxs] = useState<any[]>(initialJinxList);

    // New cron job form
    const [newJobSchedule, setNewJobSchedule] = useState('*/5 * * * *');
    const [newJobCommand, setNewJobCommand] = useState('');
    const [newJobNPC, setNewJobNPC] = useState('');
    const [newJobJinx, setNewJobJinx] = useState('');
    const [jobUseJinx, setJobUseJinx] = useState(false);

    // New daemon form
    const [newDaemonName, setNewDaemonName] = useState('');
    const [newDaemonCommand, setNewDaemonCommand] = useState('');
    const [newDaemonNPC, setNewDaemonNPC] = useState('');
    const [newDaemonJinx, setNewDaemonJinx] = useState('');
    const [daemonUseJinx, setDaemonUseJinx] = useState(false);

    const fetchCronAndDaemons = async () => {
        if (!currentPath) return;
        setLoading(true);
        setError(null);
        try {
            const response = await (window as any).api.getCronDaemons?.(currentPath);
            if (response?.error) throw new Error(response.error);
            setCronJobs(response?.cronJobs || []);
            setDaemons(response?.daemons || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch cron jobs and daemons');
        } finally {
            setLoading(false);
        }
    };

    const fetchNpcsAndJinxs = async () => {
        try {
            // Fetch NPCs
            const npcResponse = isGlobal
                ? await (window as any).api.getNPCTeamGlobal?.()
                : await (window as any).api.getNPCTeamProject?.(currentPath);
            if (npcResponse?.npcs) setNpcs(npcResponse.npcs);

            // Fetch Jinxs
            const jinxResponse = isGlobal
                ? await (window as any).api.getJinxsGlobal?.()
                : await (window as any).api.getJinxsProject?.(currentPath);
            if (jinxResponse?.jinxs) setJinxs(jinxResponse.jinxs);
        } catch (err) {
            console.error('Failed to fetch NPCs/Jinxs:', err);
        }
    };

    useEffect(() => {
        fetchCronAndDaemons();
        fetchNpcsAndJinxs();
    }, [currentPath, isGlobal]);

    const handleAddCronJob = async () => {
        if (jobUseJinx && !newJobJinx) return alert('Please select a Jinx');
        if (!jobUseJinx && !newJobCommand.trim()) return alert('Please enter a command');
        setLoading(true);
        setError(null);
        try {
            const command = jobUseJinx ? `/${newJobJinx}` : newJobCommand;
            const res = await (window as any).api.addCronJob?.({
                path: currentPath,
                schedule: newJobSchedule,
                command: command,
                npc: newJobNPC,
                jinx: jobUseJinx ? newJobJinx : '',
            });
            if (res?.error) throw new Error(res.error);
            await fetchCronAndDaemons();
            setNewJobCommand('');
            setNewJobSchedule('*/5 * * * *');
            setNewJobNPC('');
            setNewJobJinx('');
            setJobUseJinx(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveCronJob = async (jobId: string) => {
        if (!window.confirm('Remove this cron job?')) return;
        setLoading(true);
        try {
            const res = await (window as any).api.removeCronJob?.(jobId);
            if (res?.error) throw new Error(res.error);
            await fetchCronAndDaemons();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDaemon = async () => {
        if (!newDaemonName.trim()) return alert('Please enter a daemon name');
        if (daemonUseJinx && !newDaemonJinx) return alert('Please select a Jinx');
        if (!daemonUseJinx && !newDaemonCommand.trim()) return alert('Please enter a command');
        setLoading(true);
        setError(null);
        try {
            const command = daemonUseJinx ? `/${newDaemonJinx}` : newDaemonCommand;
            const res = await (window as any).api.addDaemon?.({
                path: currentPath,
                name: newDaemonName,
                command: command,
                npc: newDaemonNPC,
                jinx: daemonUseJinx ? newDaemonJinx : '',
            });
            if (res?.error) throw new Error(res.error);
            await fetchCronAndDaemons();
            setNewDaemonName('');
            setNewDaemonCommand('');
            setNewDaemonNPC('');
            setNewDaemonJinx('');
            setDaemonUseJinx(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveDaemon = async (daemonId: string) => {
        if (!window.confirm('Remove this daemon?')) return;
        setLoading(true);
        try {
            const res = await (window as any).api.removeDaemon?.(daemonId);
            if (res?.error) throw new Error(res.error);
            await fetchCronAndDaemons();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentPath) {
        return (
            <div className="text-center py-12">
                <Clock size={48} className="mx-auto mb-4 text-gray-500" />
                <p className="theme-text-muted">Select a project folder to manage scheduled tasks.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

            {/* Cron Jobs Section */}
            <section>
                <h3 className="font-semibold text-blue-400 mb-4 flex items-center gap-2">
                    <Clock size={18} /> Scheduled Cron Jobs
                </h3>

                {/* Existing cron jobs */}
                {cronJobs.length === 0 ? (
                    <p className="theme-text-muted text-sm mb-4">No cron jobs scheduled.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {cronJobs.map((job: any, idx) => (
                            <div key={job.id || idx} className="flex justify-between items-center theme-bg-tertiary p-3 rounded-lg">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">{job.schedule}</code>
                                        <span className="text-sm">{job.command}</span>
                                    </div>
                                    {(job.npc || job.jinx) && (
                                        <div className="text-xs theme-text-muted mt-1 flex items-center gap-2">
                                            {job.npc && <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">NPC: {job.npc}</span>}
                                            {job.jinx && <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded">Jinx: {job.jinx}</span>}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRemoveCronJob(job.id)}
                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                                    title="Remove cron job"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add new cron job form */}
                <div className="theme-bg-tertiary p-4 rounded-lg">
                    <h4 className="font-medium text-green-400 mb-3 flex items-center gap-2">
                        <Plus size={16} /> Add New Cron Job
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="col-span-full">
                            <label className="text-xs theme-text-muted block mb-1">Schedule (cron syntax)</label>
                            <input
                                type="text"
                                placeholder="*/5 * * * * (every 5 minutes)"
                                value={newJobSchedule}
                                onChange={e => setNewJobSchedule(e.target.value)}
                                className="w-full theme-input text-sm font-mono"
                            />
                        </div>

                        {/* Toggle between Jinx and Command */}
                        <div className="col-span-full flex items-center gap-4 py-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={!jobUseJinx}
                                    onChange={() => setJobUseJinx(false)}
                                    className="accent-purple-500"
                                />
                                <span className="text-sm">Use Command</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={jobUseJinx}
                                    onChange={() => setJobUseJinx(true)}
                                    className="accent-purple-500"
                                />
                                <span className="text-sm">Use Jinx</span>
                            </label>
                        </div>

                        {jobUseJinx ? (
                            <div className="col-span-full">
                                <label className="text-xs theme-text-muted block mb-1">Select Jinx to Run</label>
                                <select
                                    value={newJobJinx}
                                    onChange={e => setNewJobJinx(e.target.value)}
                                    className="w-full theme-input text-sm"
                                >
                                    <option value="">-- Select a Jinx --</option>
                                    {jinxs.map((jinx: any) => (
                                        <option key={jinx.jinx_name || jinx.name} value={jinx.jinx_name || jinx.name}>
                                            {jinx.jinx_name || jinx.name} {jinx.description ? `- ${jinx.description.substring(0, 40)}...` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="col-span-full">
                                <label className="text-xs theme-text-muted block mb-1">Command</label>
                                <input
                                    type="text"
                                    placeholder="/sample 'hello world' or any npcsh command"
                                    value={newJobCommand}
                                    onChange={e => setNewJobCommand(e.target.value)}
                                    className="w-full theme-input text-sm"
                                />
                            </div>
                        )}

                        <div className="col-span-full">
                            <label className="text-xs theme-text-muted block mb-1">Run as NPC (required for agent context)</label>
                            <select value={newJobNPC} onChange={e => setNewJobNPC(e.target.value)} className="w-full theme-input text-sm">
                                <option value="">-- Select an NPC --</option>
                                {npcs.map((npc: any) => (
                                    <option key={npc.name} value={npc.name}>{npc.display_name || npc.name}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleAddCronJob}
                            disabled={loading || (jobUseJinx ? !newJobJinx : !newJobCommand.trim())}
                            className="col-span-full theme-button-primary rounded px-4 py-2 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Add Cron Job
                        </button>
                    </div>
                </div>
            </section>

            {/* System Daemons Section */}
            <section>
                <h3 className="font-semibold text-green-400 mb-4 flex items-center gap-2">
                    <Play size={18} /> Background Daemons
                </h3>

                {/* Existing daemons */}
                {daemons.length === 0 ? (
                    <p className="theme-text-muted text-sm mb-4">No background daemons running.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {daemons.map((daemon: any, idx) => (
                            <div key={daemon.id || idx} className="flex justify-between items-center theme-bg-tertiary p-3 rounded-lg">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{daemon.name}</span>
                                        <span className="text-gray-500">:</span>
                                        <span className="text-sm">{daemon.command}</span>
                                    </div>
                                    {(daemon.npc || daemon.jinx) && (
                                        <div className="text-xs theme-text-muted mt-1 flex items-center gap-2">
                                            {daemon.npc && <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">NPC: {daemon.npc}</span>}
                                            {daemon.jinx && <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded">Jinx: {daemon.jinx}</span>}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRemoveDaemon(daemon.id)}
                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                                    title="Remove daemon"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add new daemon form */}
                <div className="theme-bg-tertiary p-4 rounded-lg">
                    <h4 className="font-medium text-green-400 mb-3 flex items-center gap-2">
                        <Plus size={16} /> Add New Daemon
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="col-span-full">
                            <label className="text-xs theme-text-muted block mb-1">Daemon Name</label>
                            <input
                                type="text"
                                placeholder="my-background-task"
                                value={newDaemonName}
                                onChange={e => setNewDaemonName(e.target.value)}
                                className="w-full theme-input text-sm"
                            />
                        </div>

                        {/* Toggle between Jinx and Command */}
                        <div className="col-span-full flex items-center gap-4 py-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={!daemonUseJinx}
                                    onChange={() => setDaemonUseJinx(false)}
                                    className="accent-purple-500"
                                />
                                <span className="text-sm">Use Command</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={daemonUseJinx}
                                    onChange={() => setDaemonUseJinx(true)}
                                    className="accent-purple-500"
                                />
                                <span className="text-sm">Use Jinx</span>
                            </label>
                        </div>

                        {daemonUseJinx ? (
                            <div className="col-span-full">
                                <label className="text-xs theme-text-muted block mb-1">Select Jinx to Run</label>
                                <select
                                    value={newDaemonJinx}
                                    onChange={e => setNewDaemonJinx(e.target.value)}
                                    className="w-full theme-input text-sm"
                                >
                                    <option value="">-- Select a Jinx --</option>
                                    {jinxs.map((jinx: any) => (
                                        <option key={jinx.jinx_name || jinx.name} value={jinx.jinx_name || jinx.name}>
                                            {jinx.jinx_name || jinx.name} {jinx.description ? `- ${jinx.description.substring(0, 40)}...` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="col-span-full">
                                <label className="text-xs theme-text-muted block mb-1">Command</label>
                                <input
                                    type="text"
                                    placeholder="/breathe or long-running command"
                                    value={newDaemonCommand}
                                    onChange={e => setNewDaemonCommand(e.target.value)}
                                    className="w-full theme-input text-sm"
                                />
                            </div>
                        )}

                        <div className="col-span-full">
                            <label className="text-xs theme-text-muted block mb-1">Run as NPC (required for agent context)</label>
                            <select value={newDaemonNPC} onChange={e => setNewDaemonNPC(e.target.value)} className="w-full theme-input text-sm">
                                <option value="">-- Select an NPC --</option>
                                {npcs.map((npc: any) => (
                                    <option key={npc.name} value={npc.name}>{npc.display_name || npc.name}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleAddDaemon}
                            disabled={loading || !newDaemonName.trim() || (daemonUseJinx ? !newDaemonJinx : !newDaemonCommand.trim())}
                            className="col-span-full theme-button-primary rounded px-4 py-2 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Add Daemon
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};

// SQL Models content - dbt-style with npcsql/jinx integration
const SqlModelsContent = ({ currentPath, npcList = [], jinxList = [], isGlobal }: { currentPath: string; npcList?: any[]; jinxList?: any[]; isGlobal: boolean }) => {
    const [models, setModels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<any | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Available NPCs and Jinxs for reference
    const [npcs, setNpcs] = useState<any[]>([]);
    const [jinxs, setJinxs] = useState<any[]>([]);

    // Database selection
    const [availableDatabases, setAvailableDatabases] = useState<{ name: string; path: string }[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string>('~/npcsh_history.db');

    // New/Edit model form
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
            // Models API might not exist yet, that's ok
            setModels([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchNpcsAndJinxs = async () => {
        try {
            const npcResponse = isGlobal
                ? await (window as any).api.getNPCTeamGlobal?.()
                : await (window as any).api.getNPCTeamProject?.(currentPath);
            if (npcResponse?.npcs) setNpcs(npcResponse.npcs);

            const jinxResponse = isGlobal
                ? await (window as any).api.getJinxsGlobal?.()
                : await (window as any).api.getJinxsProject?.(currentPath);
            if (jinxResponse?.jinxs) setJinxs(jinxResponse.jinxs);
        } catch (err) {
            console.error('Failed to fetch NPCs/Jinxs:', err);
        }
    };

    const fetchAvailableDatabases = async () => {
        const databases: { name: string; path: string }[] = [
            { name: 'Global History (npcsh_history.db)', path: '~/npcsh_history.db' }
        ];

        // Try to get databases from context
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
        fetchNpcsAndJinxs();
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
            await fetchModels(); // Refresh to show updated lastRunAt
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
        // Jinxs are executed via check_llm_command with tool calling
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

    // Editing/Creating view
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

                {/* Quick insert buttons */}
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

                {/* Syntax reference */}
                <div className="theme-bg-tertiary p-3 rounded-lg text-xs">
                    <div className="font-semibold mb-2 text-purple-400">NQL Functions (llm_funcs.py):</div>
                    <div className="grid grid-cols-4 gap-1 font-mono text-gray-400 mb-2">
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
                    <div className="border-t border-gray-700 pt-2 space-y-1 font-mono text-gray-500">
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

    // List view
    return (
        <div className="space-y-6">
            {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

            {/* Header */}
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

            {/* Models list */}
            {loading ? (
                <div className="text-center py-8 theme-text-muted">Loading models...</div>
            ) : models.length === 0 ? (
                <div className="text-center py-12 theme-bg-tertiary rounded-lg">
                    <Database size={48} className="mx-auto mb-4 text-gray-500" />
                    <h3 className="text-lg font-semibold mb-2">No SQL Models Yet</h3>
                    <p className="theme-text-muted text-sm max-w-md mx-auto mb-4">
                        Create SQL models with npcsql syntax to build knowledge analytics databases.
                        Use jinja-style references to NPCs and Jinxs for AI-powered transformations.
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
                            {/* Show SQL preview */}
                            <div className="mt-2 bg-black/30 rounded p-2 font-mono text-xs text-gray-400 max-h-20 overflow-hidden">
                                {model.sql?.substring(0, 200)}...
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Databases Content - manage database connections
const DatabasesContent = ({ currentPath, isGlobal }: { currentPath: string; isGlobal: boolean }) => {
    const [databases, setDatabases] = useState<{ value: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newDbPath, setNewDbPath] = useState('');

    const loadDatabases = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = isGlobal
                ? await (window as any).api.getGlobalContext()
                : await (window as any).api.getProjectContext(currentPath);
            if (res?.error) throw new Error(res.error);
            setDatabases(res?.context?.databases || []);
        } catch (err: any) {
            setError(err.message);
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
            if (isGlobal) {
                const current = await (window as any).api.getGlobalContext();
                await (window as any).api.saveGlobalContext({ ...current.context, databases });
            } else {
                const current = await (window as any).api.getProjectContext(currentPath);
                await (window as any).api.saveProjectContext({ path: currentPath, contextData: { ...current.context, databases } });
            }
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
                    placeholder="~/npcsh_history.db"
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

// MCP Servers Content - manage MCP server connections with email integration
const McpServersContent = ({ currentPath, isGlobal }: { currentPath: string; isGlobal: boolean }) => {
    const [mcpServers, setMcpServers] = useState<{ value: string; id?: string; name?: string; env?: any }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newServerPath, setNewServerPath] = useState('');
    const [showEmailSetup, setShowEmailSetup] = useState(false);
    const [emailConfig, setEmailConfig] = useState({
        client_type: 'thunderbird',
        thunderbird_profile: '',
        imap_server: '',
        imap_port: '993',
        smtp_server: '',
        smtp_port: '587',
        email_address: '',
        email_password: '',
    });

    const loadServers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = isGlobal
                ? await (window as any).api.getGlobalContext()
                : await (window as any).api.getProjectContext(currentPath);
            if (res?.error) throw new Error(res.error);
            setMcpServers(res?.context?.mcp_servers || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadServers();
    }, [currentPath, isGlobal]);

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            if (isGlobal) {
                const current = await (window as any).api.getGlobalContext();
                await (window as any).api.saveGlobalContext({ ...current.context, mcp_servers: mcpServers });
            } else {
                const current = await (window as any).api.getProjectContext(currentPath);
                await (window as any).api.saveProjectContext({ path: currentPath, contextData: { ...current.context, mcp_servers: mcpServers } });
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        if (!newServerPath.trim()) return;
        setMcpServers(prev => [...prev, { value: newServerPath.trim() }]);
        setNewServerPath('');
    };

    const handleRemove = (index: number) => {
        setMcpServers(prev => prev.filter((_, i) => i !== index));
    };

    const handleChange = (index: number, value: string) => {
        setMcpServers(prev => prev.map((s, i) => i === index ? { ...s, value } : s));
    };

    const handleAddEmailIntegration = async () => {
        setLoading(true);
        setError(null);
        try {
            const envVars: any = { CLIENT_TYPE: emailConfig.client_type };
            if (emailConfig.client_type === 'thunderbird' && emailConfig.thunderbird_profile) {
                envVars.THUNDERBIRD_PROFILE = emailConfig.thunderbird_profile;
            } else if (emailConfig.client_type === 'imap') {
                envVars.IMAP_SERVER = emailConfig.imap_server;
                envVars.IMAP_PORT = emailConfig.imap_port;
                envVars.SMTP_SERVER = emailConfig.smtp_server;
                envVars.SMTP_PORT = emailConfig.smtp_port;
                envVars.EMAIL_ADDRESS = emailConfig.email_address;
                envVars.EMAIL_PASSWORD = emailConfig.email_password;
            }

            const result = await (window as any).api.addMcpIntegration({
                integrationId: 'email',
                serverScript: 'email_mcp_server.py',
                envVars,
                name: 'Email',
            });

            if (result?.error) throw new Error(result.error);
            setShowEmailSetup(false);
            await loadServers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isGlobal && !currentPath) {
        return <div className="text-center py-12 theme-text-muted">Select a project folder or switch to Global.</div>;
    }

    return (
        <div className="space-y-6">
            {error && <div className="text-red-400 bg-red-900/20 p-3 rounded-lg">{error}</div>}

            {/* Email Integration Setup */}
            {showEmailSetup ? (
                <div className="theme-bg-tertiary p-4 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold flex items-center gap-2"><Mail size={18} className="text-blue-400" /> Email Integration</h4>
                        <button onClick={() => setShowEmailSetup(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                    </div>

                    <div>
                        <label className="block text-xs theme-text-muted mb-1">Email Client</label>
                        <select value={emailConfig.client_type} onChange={(e) => setEmailConfig(prev => ({ ...prev, client_type: e.target.value }))} className="w-full theme-input text-sm">
                            <option value="thunderbird">Thunderbird</option>
                            <option value="apple_mail">Apple Mail</option>
                            <option value="imap">IMAP/SMTP</option>
                        </select>
                    </div>

                    {emailConfig.client_type === 'thunderbird' && (
                        <div>
                            <label className="block text-xs theme-text-muted mb-1">Profile Path (leave empty for auto-detect)</label>
                            <input type="text" value={emailConfig.thunderbird_profile} onChange={(e) => setEmailConfig(prev => ({ ...prev, thunderbird_profile: e.target.value }))} placeholder="~/.thunderbird/*.default-release" className="w-full theme-input text-sm" />
                        </div>
                    )}

                    {emailConfig.client_type === 'imap' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs theme-text-muted mb-1">IMAP Server</label>
                                    <input type="text" value={emailConfig.imap_server} onChange={(e) => setEmailConfig(prev => ({ ...prev, imap_server: e.target.value }))} placeholder="imap.gmail.com" className="w-full theme-input text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs theme-text-muted mb-1">IMAP Port</label>
                                    <input type="text" value={emailConfig.imap_port} onChange={(e) => setEmailConfig(prev => ({ ...prev, imap_port: e.target.value }))} className="w-full theme-input text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs theme-text-muted mb-1">SMTP Server</label>
                                    <input type="text" value={emailConfig.smtp_server} onChange={(e) => setEmailConfig(prev => ({ ...prev, smtp_server: e.target.value }))} placeholder="smtp.gmail.com" className="w-full theme-input text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs theme-text-muted mb-1">SMTP Port</label>
                                    <input type="text" value={emailConfig.smtp_port} onChange={(e) => setEmailConfig(prev => ({ ...prev, smtp_port: e.target.value }))} className="w-full theme-input text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs theme-text-muted mb-1">Email Address</label>
                                <input type="email" value={emailConfig.email_address} onChange={(e) => setEmailConfig(prev => ({ ...prev, email_address: e.target.value }))} placeholder="you@example.com" className="w-full theme-input text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs theme-text-muted mb-1">App Password</label>
                                <input type="password" value={emailConfig.email_password} onChange={(e) => setEmailConfig(prev => ({ ...prev, email_password: e.target.value }))} placeholder="App-specific password" className="w-full theme-input text-sm" />
                                <p className="text-xs theme-text-muted mt-1">For Gmail, use an App Password from Google Account security settings.</p>
                            </div>
                        </>
                    )}

                    <button onClick={handleAddEmailIntegration} disabled={loading} className="w-full theme-button-primary py-2 rounded text-sm">
                        {loading ? 'Adding...' : 'Add Email Integration'}
                    </button>
                </div>
            ) : (
                <button onClick={() => setShowEmailSetup(true)} className="w-full theme-bg-tertiary p-4 rounded-lg text-left hover:border-blue-500 border border-transparent transition flex items-center gap-3">
                    <Mail size={24} className="text-blue-400" />
                    <div>
                        <div className="font-medium">Add Email Integration</div>
                        <div className="text-xs theme-text-muted">Connect Thunderbird, Apple Mail, or IMAP/SMTP</div>
                    </div>
                </button>
            )}

            {/* MCP Servers List */}
            <div className="space-y-3">
                {mcpServers.map((server, idx) => (
                    <div key={idx} className="flex gap-2 items-center theme-bg-tertiary p-3 rounded-lg">
                        <Server size={18} className="text-green-400 flex-shrink-0" />
                        <div className="flex-1">
                            <input
                                type="text"
                                value={server.value || ''}
                                onChange={(e) => handleChange(idx, e.target.value)}
                                className="w-full theme-input text-sm font-mono bg-transparent"
                                placeholder="~/.npcsh/mcp_server.py"
                            />
                            {server.name && <span className="text-xs text-blue-400">{server.name}</span>}
                        </div>
                        <button onClick={() => handleRemove(idx)} className="p-2 text-red-400 hover:bg-red-900/30 rounded">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={newServerPath}
                    onChange={(e) => setNewServerPath(e.target.value)}
                    placeholder="~/.npcsh/my_mcp_server.py"
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

const TeamManagement: React.FC<TeamManagementProps> = ({
    isOpen,
    onClose,
    currentPath,
    startNewConversation,
    npcList = [],
    jinxList = [],
    embedded = false
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('context');
    const [isGlobal, setIsGlobal] = useState(false);
    const [globalSource, setGlobalSource] = useState<'incognide' | 'npcsh'>('incognide');
    const [hasProjectTeam, setHasProjectTeam] = useState<boolean | null>(null);
    const [initializingTeam, setInitializingTeam] = useState(false);
    const [resyncModal, setResyncModal] = useState(false);
    const [resyncing, setResyncing] = useState(false);

    // The globalPath to pass to API calls — undefined for incognide (default), 'npcsh' for npcsh
    const globalPath = isGlobal ? (globalSource === 'npcsh' ? 'npcsh' : undefined) : undefined;

    // Check if project has npc_team folder
    useEffect(() => {
        const checkProjectTeam = async () => {
            if (!currentPath) {
                setHasProjectTeam(false);
                setIsGlobal(true);
                return;
            }
            try {
                const res = await (window as any).api.getProjectContext(currentPath);
                // If we get a valid response with a path, project team exists
                setHasProjectTeam(!!res?.path);
                if (!res?.path) {
                    setIsGlobal(true); // Default to global if no project team
                }
            } catch {
                setHasProjectTeam(false);
                setIsGlobal(true);
            }
        };
        if (isOpen) {
            checkProjectTeam();
        }
    }, [isOpen, currentPath]);

    const handleInitializeProjectTeam = async () => {
        if (!currentPath) return;
        setInitializingTeam(true);
        try {
            // Initialize project team by saving empty context
            await (window as any).api.initProjectTeam(currentPath);
            setHasProjectTeam(true);
            setIsGlobal(false);
        } catch (err) {
            console.error('Failed to initialize project team:', err);
        } finally {
            setInitializingTeam(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'context', label: 'Context', icon: <FileJson size={16} /> },
        { id: 'npcs', label: 'NPCs', icon: <Users size={16} /> },
        { id: 'jinxs', label: 'Jinxs', icon: <Wrench size={16} /> },
        { id: 'databases', label: 'Databases', icon: <Database size={16} /> },
        { id: 'mcp', label: 'MCP Servers', icon: <Server size={16} /> },
        { id: 'cron', label: 'Cron/Daemons', icon: <Clock size={16} /> },
        { id: 'models', label: 'SQL Models', icon: <Database size={16} /> },
    ];

    if (!isOpen && !embedded) return null;

    const content = (
        <div className={embedded ? "flex flex-col h-full" : "relative w-[90vw] max-w-6xl h-[85vh] theme-bg-primary rounded-xl shadow-2xl border theme-border flex flex-col overflow-hidden"}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Users className="text-purple-400" size={24} />
                    <h2 className="text-xl font-semibold">Team Management</h2>
                </div>
                <div className="flex items-center gap-3">
                    {/* Project/Global Toggle */}
                    <div className="flex items-center bg-gray-800 rounded-lg p-1">
                        {hasProjectTeam ? (
                            <button
                                onClick={() => setIsGlobal(false)}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition ${!isGlobal ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Project
                            </button>
                        ) : (
                            <button
                                onClick={handleInitializeProjectTeam}
                                disabled={initializingTeam || !currentPath}
                                className="px-3 py-1.5 rounded text-sm font-medium transition text-gray-400 hover:text-white flex items-center gap-1 disabled:opacity-50"
                                title={currentPath ? "Initialize project team" : "No project folder selected"}
                            >
                                <Plus size={14} /> Project
                            </button>
                        )}
                        {/* When global: show Incognide/npcsh sub-toggle inline */}
                        {isGlobal ? (
                            <>
                                <button
                                    onClick={() => { setIsGlobal(true); setGlobalSource('incognide'); }}
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition ${globalSource === 'incognide' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Incognide
                                </button>
                                <button
                                    onClick={() => { setIsGlobal(true); setGlobalSource('npcsh'); }}
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition ${globalSource === 'npcsh' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    npcsh
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsGlobal(true)}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition ${isGlobal ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Global
                            </button>
                        )}
                    </div>
                    {isGlobal && (
                        <>
                            <NPCTeamSync compact />
                            <button
                                onClick={() => setResyncModal(true)}
                                className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition flex items-center gap-1"
                                title="Re-sync global team from package defaults"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                                Re-sync
                            </button>
                        </>
                    )}
                    {!embedded && (
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg theme-hover transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b theme-border px-4 flex-shrink-0">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? 'border-purple-500 text-purple-400'
                                : 'border-transparent theme-text-secondary hover:theme-text-primary'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'context' && (
                    <CtxEditor
                        isOpen={true}
                        onClose={() => {}}
                        currentPath={currentPath}
                        embedded={true}
                        isGlobal={isGlobal}
                        globalPath={globalPath}
                    />
                )}
                {activeTab === 'npcs' && (
                    <div className="space-y-4">
                        {isGlobal && <NPCTeamSync />}
                        <NPCTeamMenu
                            isOpen={true}
                            onClose={() => {}}
                            currentPath={currentPath}
                            startNewConversation={startNewConversation}
                            embedded={true}
                            isGlobal={isGlobal}
                            globalPath={globalPath}
                        />
                    </div>
                )}
                {activeTab === 'jinxs' && (
                    <JinxMenu
                        isOpen={true}
                        onClose={() => {}}
                        currentPath={currentPath}
                        embedded={true}
                        isGlobal={isGlobal}
                        globalPath={globalPath}
                    />
                )}
                {activeTab === 'databases' && (
                    <DatabasesContent
                        currentPath={currentPath}
                        isGlobal={isGlobal}
                    />
                )}
                {activeTab === 'mcp' && (
                    <McpServersContent
                        currentPath={currentPath}
                        isGlobal={isGlobal}
                    />
                )}
                {activeTab === 'cron' && (
                    <CronDaemonContent
                        currentPath={currentPath}
                        npcList={npcList}
                        jinxList={jinxList}
                        isGlobal={isGlobal}
                    />
                )}
                {activeTab === 'models' && (
                    <SqlModelsContent
                        currentPath={currentPath}
                        isGlobal={isGlobal}
                    />
                )}
            </div>
        </div>
    );

    // Re-sync/Setup modal (shared between embedded and modal modes)
    const [setupNpcs, setSetupNpcs] = useState<any[]>([]);
    const [setupJinxs, setSetupJinxs] = useState<any[]>([]);
    const [loadingSetup, setLoadingSetup] = useState(false);
    const [setupTab, setSetupTab] = useState<'npcs' | 'jinxs' | 'settings'>('npcs');
    const [editingNpc, setEditingNpc] = useState<number | null>(null);
    const [newNpcName, setNewNpcName] = useState('');
    const [newNpcDirective, setNewNpcDirective] = useState('');
    const [newJinxName, setNewJinxName] = useState('');

    // Load available NPCs and jinxs when modal opens
    useEffect(() => {
        if (resyncModal) {
            setLoadingSetup(true);
            setSetupTab('npcs');
            setEditingNpc(null);
            Promise.all([
                (window as any).api.getNPCTeamGlobal?.(),
                (window as any).api.getJinxsGlobal?.()
            ]).then(([npcRes, jinxRes]) => {
                // Add enabled flag to each for toggling
                setSetupNpcs((npcRes?.npcs || []).map((npc: any) => ({ ...npc, enabled: true })));
                setSetupJinxs((jinxRes?.jinxs || []).map((jinx: any) => ({ ...jinx, enabled: true })));
                setLoadingSetup(false);
            }).catch(() => setLoadingSetup(false));
        }
    }, [resyncModal]);

    const handleToggleNpc = (index: number) => {
        setSetupNpcs(prev => prev.map((npc, i) => i === index ? { ...npc, enabled: !npc.enabled } : npc));
    };

    const handleToggleJinx = (index: number) => {
        setSetupJinxs(prev => prev.map((jinx, i) => i === index ? { ...jinx, enabled: !jinx.enabled } : jinx));
    };

    const handleUpdateNpc = (index: number, field: string, value: string) => {
        setSetupNpcs(prev => prev.map((npc, i) => i === index ? { ...npc, [field]: value } : npc));
    };

    const handleAddNpc = () => {
        if (!newNpcName.trim()) return;
        setSetupNpcs(prev => [...prev, {
            name: newNpcName.trim().toLowerCase().replace(/\s+/g, '_'),
            primary_directive: newNpcDirective || 'A helpful assistant',
            enabled: true,
            isNew: true
        }]);
        setNewNpcName('');
        setNewNpcDirective('');
    };

    const handleRemoveNpc = (index: number) => {
        setSetupNpcs(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddJinx = () => {
        if (!newJinxName.trim()) return;
        setSetupJinxs(prev => [...prev, {
            name: newJinxName.trim().toLowerCase().replace(/\s+/g, '_'),
            enabled: true,
            isNew: true
        }]);
        setNewJinxName('');
    };

    const handleRemoveJinx = (index: number) => {
        setSetupJinxs(prev => prev.filter((_, i) => i !== index));
    };

    const resyncModalElement = resyncModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="theme-bg-primary border theme-border rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b theme-border flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Users size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold theme-text-primary">Global Team Setup</h2>
                        <p className="text-xs theme-text-muted">Configure your NPCs, jinxs, and settings</p>
                    </div>
                    <button onClick={() => setResyncModal(false)} className="ml-auto p-2 theme-hover rounded-lg">
                        <X size={18} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b theme-border px-4">
                    <button
                        onClick={() => setSetupTab('npcs')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            setupTab === 'npcs' ? 'border-purple-500 text-purple-400' : 'border-transparent theme-text-muted hover:theme-text-primary'
                        }`}
                    >
                        <Users size={16} /> NPCs ({setupNpcs.filter(n => n.enabled).length})
                    </button>
                    <button
                        onClick={() => setSetupTab('jinxs')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            setupTab === 'jinxs' ? 'border-yellow-500 text-yellow-400' : 'border-transparent theme-text-muted hover:theme-text-primary'
                        }`}
                    >
                        <Wrench size={16} /> Jinxs ({setupJinxs.filter(j => j.enabled).length})
                    </button>
                    <button
                        onClick={() => setSetupTab('settings')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            setupTab === 'settings' ? 'border-blue-500 text-blue-400' : 'border-transparent theme-text-muted hover:theme-text-primary'
                        }`}
                    >
                        <FileJson size={16} /> Info
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loadingSetup ? (
                        <div className="flex items-center justify-center py-12">
                            <svg className="animate-spin h-8 w-8 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    ) : (
                        <>
                            {/* NPCs Tab */}
                            {setupTab === 'npcs' && (
                                <div className="space-y-4">
                                    <p className="text-sm theme-text-muted">
                                        Toggle NPCs on/off, edit their directives, or add new ones. Changes apply when you sync.
                                    </p>

                                    {/* NPC List */}
                                    <div className="space-y-2">
                                        {setupNpcs.map((npc, i) => (
                                            <div
                                                key={i}
                                                className={`rounded-lg border transition-all ${
                                                    npc.enabled
                                                        ? 'theme-bg-secondary theme-border'
                                                        : 'bg-gray-800/30 border-gray-700/50 opacity-60'
                                                }`}
                                            >
                                                <div className="p-3 flex items-start gap-3">
                                                    {/* Toggle */}
                                                    <button
                                                        onClick={() => handleToggleNpc(i)}
                                                        className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                            npc.enabled
                                                                ? 'bg-purple-600 border-purple-600'
                                                                : 'border-gray-500 hover:border-gray-400'
                                                        }`}
                                                    >
                                                        {npc.enabled && (
                                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>

                                                    {/* NPC Info */}
                                                    <div className="flex-1 min-w-0">
                                                        {editingNpc === i ? (
                                                            <div className="space-y-2">
                                                                <input
                                                                    type="text"
                                                                    value={npc.name}
                                                                    onChange={(e) => handleUpdateNpc(i, 'name', e.target.value)}
                                                                    className="w-full theme-input text-sm font-mono"
                                                                    placeholder="npc_name"
                                                                />
                                                                <textarea
                                                                    value={npc.primary_directive || ''}
                                                                    onChange={(e) => handleUpdateNpc(i, 'primary_directive', e.target.value)}
                                                                    className="w-full theme-input text-sm resize-none"
                                                                    rows={3}
                                                                    placeholder="Primary directive..."
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => setEditingNpc(null)}
                                                                        className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded"
                                                                    >
                                                                        Done
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-sm">{npc.name}</span>
                                                                    {npc.isNew && (
                                                                        <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">new</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs theme-text-muted mt-1 line-clamp-2">
                                                                    {npc.primary_directive || 'No directive set'}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Actions */}
                                                    {editingNpc !== i && (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setEditingNpc(i)}
                                                                className="p-1.5 theme-hover rounded text-gray-400 hover:text-white"
                                                                title="Edit"
                                                            >
                                                                <Wrench size={14} />
                                                            </button>
                                                            {npc.isNew && (
                                                                <button
                                                                    onClick={() => handleRemoveNpc(i)}
                                                                    className="p-1.5 hover:bg-red-900/30 rounded text-red-400"
                                                                    title="Remove"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add New NPC */}
                                    <div className="theme-bg-tertiary rounded-lg p-4 space-y-3">
                                        <h4 className="text-sm font-medium flex items-center gap-2">
                                            <Plus size={16} className="text-green-400" /> Add Custom NPC
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                type="text"
                                                value={newNpcName}
                                                onChange={(e) => setNewNpcName(e.target.value)}
                                                placeholder="npc_name"
                                                className="theme-input text-sm font-mono"
                                            />
                                            <button
                                                onClick={handleAddNpc}
                                                disabled={!newNpcName.trim()}
                                                className="theme-button-primary rounded text-sm disabled:opacity-50"
                                            >
                                                Add NPC
                                            </button>
                                        </div>
                                        <textarea
                                            value={newNpcDirective}
                                            onChange={(e) => setNewNpcDirective(e.target.value)}
                                            placeholder="Primary directive (optional)..."
                                            className="w-full theme-input text-sm resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Jinxs Tab */}
                            {setupTab === 'jinxs' && (
                                <div className="space-y-4">
                                    <p className="text-sm theme-text-muted">
                                        Toggle jinxs on/off or add custom ones. Jinxs are command shortcuts you can invoke with /.
                                    </p>

                                    {/* Jinx Grid */}
                                    <div className="grid grid-cols-3 gap-2">
                                        {setupJinxs.map((jinx, i) => (
                                            <div
                                                key={i}
                                                className={`rounded-lg border p-2 flex items-center gap-2 transition-all ${
                                                    jinx.enabled
                                                        ? 'theme-bg-secondary theme-border'
                                                        : 'bg-gray-800/30 border-gray-700/50 opacity-60'
                                                }`}
                                            >
                                                <button
                                                    onClick={() => handleToggleJinx(i)}
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                                                        jinx.enabled
                                                            ? 'bg-yellow-600 border-yellow-600'
                                                            : 'border-gray-500 hover:border-gray-400'
                                                    }`}
                                                >
                                                    {jinx.enabled && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <span className="text-sm truncate flex-1">/{jinx.name || jinx.jinx_name}</span>
                                                {jinx.isNew && (
                                                    <button
                                                        onClick={() => handleRemoveJinx(i)}
                                                        className="p-0.5 hover:bg-red-900/30 rounded text-red-400"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {setupJinxs.length === 0 && (
                                        <div className="text-center py-8 theme-text-muted">
                                            No jinxs configured. Sync will add package defaults.
                                        </div>
                                    )}

                                    {/* Add New Jinx */}
                                    <div className="theme-bg-tertiary rounded-lg p-4">
                                        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                                            <Plus size={16} className="text-green-400" /> Add Custom Jinx
                                        </h4>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">/</span>
                                                <input
                                                    type="text"
                                                    value={newJinxName}
                                                    onChange={(e) => setNewJinxName(e.target.value)}
                                                    placeholder="jinx_name"
                                                    className="w-full theme-input text-sm pl-6 font-mono"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddJinx()}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddJinx}
                                                disabled={!newJinxName.trim()}
                                                className="theme-button-primary px-4 rounded text-sm disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        <p className="text-xs theme-text-muted mt-2">
                                            Custom jinxs will be created as stubs. Edit them later in the Jinxs tab.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Settings/Info Tab */}
                            {setupTab === 'settings' && (
                                <div className="space-y-6">
                                    {/* What sync does */}
                                    <div className="theme-bg-secondary rounded-lg p-4 border theme-border">
                                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                            What happens when you sync?
                                        </h4>
                                        <ul className="text-sm theme-text-muted space-y-2">
                                            <li className="flex items-start gap-2">
                                                <span className="text-purple-400 mt-1">•</span>
                                                <span>Core NPCs (sibiji, corca, guac, alicanto) are synced from the npcpy package</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-yellow-400 mt-1">•</span>
                                                <span>Default jinxs are added while preserving your custom ones</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 mt-1">•</span>
                                                <span>Folder structure is created: images/, models/, attachments/, mcp_servers/</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-blue-400 mt-1">•</span>
                                                <span>~/.npcshrc config is created if missing</span>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* Location */}
                                    <div className="theme-bg-tertiary rounded-lg p-4">
                                        <h4 className="text-sm font-medium mb-2">Configuration Location</h4>
                                        <code className="text-xs theme-text-muted font-mono">~/.npcsh/</code>
                                        <div className="mt-2 text-xs theme-text-muted grid grid-cols-2 gap-1">
                                            <span>├── npc_team/</span>
                                            <span className="text-purple-400">NPCs</span>
                                            <span>├── jinxs/</span>
                                            <span className="text-yellow-400">Jinxs</span>
                                            <span>├── images/</span>
                                            <span className="text-gray-500">Generated images</span>
                                            <span>├── models/</span>
                                            <span className="text-gray-500">Local models</span>
                                            <span>├── attachments/</span>
                                            <span className="text-gray-500">File attachments</span>
                                            <span>└── mcp_servers/</span>
                                            <span className="text-gray-500">MCP integrations</span>
                                        </div>
                                    </div>

                                    {/* Summary */}
                                    <div className="theme-bg-secondary rounded-lg p-4 border theme-border">
                                        <h4 className="text-sm font-medium mb-3">Current Selection Summary</h4>
                                        <div className="flex gap-6 text-sm">
                                            <div>
                                                <span className="text-2xl font-bold text-purple-400">{setupNpcs.filter(n => n.enabled).length}</span>
                                                <span className="theme-text-muted ml-2">NPCs enabled</span>
                                            </div>
                                            <div>
                                                <span className="text-2xl font-bold text-yellow-400">{setupJinxs.filter(j => j.enabled).length}</span>
                                                <span className="theme-text-muted ml-2">Jinxs enabled</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t theme-border flex justify-between items-center">
                    <div className="text-xs theme-text-muted">
                        {setupNpcs.filter(n => n.enabled).length} NPCs, {setupJinxs.filter(j => j.enabled).length} jinxs selected
                    </div>
                    <div className="flex gap-3">
                        <button
                            className="px-4 py-2 theme-button theme-hover rounded-lg text-sm"
                            onClick={() => setResyncModal(false)}
                            disabled={resyncing}
                        >
                            Cancel
                        </button>
                        <button
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                            disabled={resyncing}
                            onClick={async () => {
                                setResyncing(true);
                                // First sync from package to get base npcsh setup
                                const result = await (window as any).api.npcshInit();
                                if (result?.error) {
                                    console.error('Re-sync failed:', result.error);
                                    setResyncing(false);
                                    return;
                                }
                                // Re-deploy incognide team on top so it stays prioritized
                                await (window as any).api.deployIncognideTeam?.();

                                // Then save any custom NPCs that were added
                                for (const npc of setupNpcs.filter(n => n.isNew && n.enabled)) {
                                    await (window as any).api.saveNPCGlobal?.({
                                        name: npc.name,
                                        primary_directive: npc.primary_directive,
                                    });
                                }

                                // Save any custom jinxs that were added
                                for (const jinx of setupJinxs.filter(j => j.isNew && j.enabled)) {
                                    await (window as any).api.saveJinxGlobal?.({
                                        jinx_name: jinx.name,
                                        steps: [{ prompt: 'TODO: Configure this jinx' }],
                                    });
                                }

                                setResyncing(false);
                                setResyncModal(false);
                                window.location.reload();
                            }}
                        >
                            {resyncing ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Apply & Sync
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // Embedded mode - return just the content
    if (embedded) {
        return <>{content}{resyncModalElement}</>;
    }

    // Modal mode - wrap in modal container
    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                {content}
            </div>
            {resyncModalElement}
        </>
    );
};

export default TeamManagement;
