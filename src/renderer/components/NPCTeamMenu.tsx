import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BACKEND_URL } from '../config';
import { writeFileContent } from '../api/fileSystem';
import yaml from 'js-yaml';
import { saveNPCFile } from 'npcts/core';
import {
    Bot, Loader, ChevronDown, ChevronRight, X, Save, MessageSquare,
    Plus, Trash2, History, CheckCircle, XCircle, Tag,
    Brain, GitBranch, Edit, Search, Download, Filter,
    Database, Sparkles, Zap, RefreshCw
} from 'lucide-react';
import ModelSelector from './ModelSelector';
import AutosizeTextarea from './AutosizeTextarea';
import ForceGraph2D from 'react-force-graph-2d';

const NPCTeamMenu = ({
    isOpen,
    onClose,
    currentPath,
    startNewConversation,
    onOpenJinxTab,
    embedded = false,
    teamKey = undefined,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [npcs, setNpcs] = useState([]);
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [editedNpc, setEditedNpc] = useState(null);
    const [npcDropdownOpen, setNpcDropdownOpen] = useState(false);
    const [npcSearch, setNpcSearch] = useState('');
    const [availableJinxes, setAvailableJinxes] = useState([]);
    const [jinxDropdownOpen, setJinxDropdownOpen] = useState(false);
    const [jinxDropdownSearch, setJinxDropdownSearch] = useState('');
    const [expandedJinxFolders, setExpandedJinxFolders] = useState<Set<string>>(new Set());
    const jinxDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const npcDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const [expandedExecution, setExpandedExecution] = useState(null);

    const [executionHistory, setExecutionHistory] = useState([]);
    const [filteredExecutions, setFilteredExecutions] = useState([]);
    const [executionSearch, setExecutionSearch] = useState('');
    const [executionLabelFilter, setExecutionLabelFilter] = useState('all');
    const [executionDateRange, setExecutionDateRange] = useState('all');
    const [selectedExecutions, setSelectedExecutions] = useState(new Set());
    const [showDatasetBuilder, setShowDatasetBuilder] = useState(false);
    const [datasetName, setDatasetName] = useState('');
    const [datasetFormat, setDatasetFormat] = useState('sft');
    const [visibleCount, setVisibleCount] = useState(50);

    const [memories, setMemories] = useState([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memoryFilter, setMemoryFilter] = useState('all');
    const [memorySearch, setMemorySearch] = useState('');

    const [selectedMemories, setSelectedMemories] = useState(new Set());
    const [showFineTuneModal, setShowFineTuneModal] = useState(false);
    const [fineTuneConfig, setFineTuneConfig] = useState({
        outputName: '',
        baseModel: 'google/gemma-3-270m-it',
        strategy: 'sft',
        epochs: 20,
        learningRate: 3e-5,
        systemPrompt: ''
    });
    const [isFineTuning, setIsFineTuning] = useState(false);
    const [fineTuneStatus, setFineTuneStatus] = useState(null);
    const [fineTuneRunMode, setFineTuneRunMode] = useState<'now' | 'schedule'>('now');
    const [fineTuneSchedule, setFineTuneSchedule] = useState('0 0 * * *');
    const [fineTunePythonEnv, setFineTunePythonEnv] = useState<any>(null);
    const [pythonEnvs, setPythonEnvs] = useState<any[]>([]);
    const [pythonEnvsLoading, setPythonEnvsLoading] = useState(false);

    const [kgData, setKgData] = useState({ nodes: [], links: [] });
    const [kgLoading, setKgLoading] = useState(false);
    const graphRef = useRef(null);
    const [showNewAgentModal, setShowNewAgentModal] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);

    const teamPathForCtx = currentPath || teamKey || '';

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        const loadData = async () => {
            if (!isOpen) return;
            setLoading(true);
            setError(null);

            try {
                const npcResponse = teamKey
                    ? await window.api.getNPCTeamFromPath(teamKey)
                    : await window.api.getNPCTeamProject(currentPath);
                setNpcs(npcResponse.npcs || []);

                const jinxResponse = teamKey
                    ? await window.api.getJinxesTeam(teamKey)
                    : await window.api.getJinxesProject(currentPath);
                setAvailableJinxes(jinxResponse.jinxes || []);
            } catch (err: any) {
                if (err?.message !== 'currentPath must be a string') {
                    console.error('NPCTeamMenu load error:', err);
                }
            }
            setLoading(false);
        };
        loadData();
    }, [isOpen, currentPath, teamKey]);

    useEffect(() => {
        let filtered = executionHistory;

        if (executionSearch) {
            const search = executionSearch.toLowerCase();
            filtered = filtered.filter(e =>
                e.input?.toLowerCase().includes(search) ||
                e.output?.toLowerCase().includes(search)
            );
        }

        if (executionLabelFilter !== 'all') {
            filtered = filtered.filter(e => e.label === executionLabelFilter);
        }

        if (executionDateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date();
            if (executionDateRange === '7d') cutoff.setDate(now.getDate() - 7);
            if (executionDateRange === '30d') cutoff.setDate(now.getDate() - 30);
            if (executionDateRange === '90d') cutoff.setDate(now.getDate() - 90);
            filtered = filtered.filter(e =>
                new Date(e.timestamp) >= cutoff
            );
        }

        setFilteredExecutions(filtered);
    }, [executionHistory, executionSearch, executionLabelFilter, executionDateRange]);

    const loadNpcMemories = async (npcName) => {
        setMemoryLoading(true);
        try {
            const data = await (window as any).api?.kgLoadStoreData?.({}) || {};
            const allMemories = data.memories || [];
            const filtered = allMemories.filter((m) =>
                m.npc === npcName ||
                (m.initial_memory || '').includes(npcName) ||
                (m.final_memory || '').includes(npcName)
            );
            setMemories(filtered);
        } catch {
            setMemories([]);
        }
        setMemoryLoading(false);
    };

    const toggleMemorySelection = (memId) => {
        setSelectedMemories(prev => {
            const next = new Set(prev);
            if (next.has(memId)) {
                next.delete(memId);
            } else {
                next.add(memId);
            }
            return next;
        });
    };

    const selectAllFilteredMemories = () => {
        const filteredIds = filteredMemories.map(m => m.id);
        setSelectedMemories(new Set(filteredIds));
    };

    const clearMemorySelection = () => {
        setSelectedMemories(new Set());
    };

    const handleNpcFineTune = async () => {
        if (selectedMemories.size === 0 || !selectedNpc) return;

        setIsFineTuning(true);
        setFineTuneStatus('Preparing training data...');

        try {
            const selectedMems = memories.filter(m => selectedMemories.has(m.id));
            const trainingData = selectedMems.map(m => ({
                input: m.context || `Memory from ${selectedNpc.name}`,
                output: m.final_memory || m.initial_memory,
                status: m.status,
                npc: selectedNpc.name
            }));

            console.log('Starting NPC fine-tune with', trainingData.length, 'examples');

            const params: any = {
                trainingData,
                outputName: fineTuneConfig.outputName || `${selectedNpc.name}_model`,
                baseModel: fineTuneConfig.baseModel,
                strategy: fineTuneConfig.strategy,
                epochs: fineTuneConfig.epochs,
                learningRate: fineTuneConfig.learningRate,
                batchSize: 2,
                loraR: 8,
                loraAlpha: 16,
                systemPrompt: fineTuneConfig.systemPrompt || selectedNpc.primary_directive,
                npc: selectedNpc.name,
                formatStyle: 'gemma',
                workspacePath: currentPath,
            };

            if (fineTuneRunMode === 'schedule') {
                params.schedule = fineTuneSchedule;
                params.name = `${selectedNpc.name}_scheduled_finetune`;
                if (fineTunePythonEnv) {
                    params.pythonEnvConfig = {
                        type: fineTunePythonEnv.type,
                        venvPath: fineTunePythonEnv.venvPath,
                        pyenvVersion: fineTunePythonEnv.pyenvVersion,
                        condaEnv: fineTunePythonEnv.condaEnv,
                        condaRoot: fineTunePythonEnv.condaRoot,
                        customPath: fineTunePythonEnv.customPath,
                    };
                }
            }

            const response = await window.api?.fineTuneInstruction?.(params);

            console.log('Fine-tune response:', response);

            if (response?.error) {
                setFineTuneStatus(`Error: ${response.error}`);
                setIsFineTuning(false);
            } else if (response?.scheduled) {
                setFineTuneStatus(`Scheduled! Job will run on cron: ${fineTuneSchedule}`);
                setIsFineTuning(false);
            } else if (response?.job_id) {
                setFineTuneStatus(`Training started! Job: ${response.job_id}`);
                pollNpcFineTuneStatus(response.job_id);
            }
        } catch (err) {
            console.error('Fine-tune error:', err);
            setFineTuneStatus(`Error: ${err.message}`);
            setIsFineTuning(false);
        }
    };

    const pollNpcFineTuneStatus = async (jobId) => {
        const poll = async () => {
            try {
                const status = await window.api?.getInstructionFineTuneStatus?.(jobId);
                if (status?.status === 'complete') {
                    setFineTuneStatus(`Complete! Model: ${status.outputPath}`);
                    setIsFineTuning(false);
                    setShowFineTuneModal(false);
                } else if (status?.status === 'error') {
                    setFineTuneStatus(`Failed: ${status.error}`);
                    setIsFineTuning(false);
                } else if (status?.status === 'running') {
                    const progress = status.epoch ? `Epoch ${status.epoch}/${status.total_epochs}` : 'Training...';
                    setFineTuneStatus(`${progress}${status.loss ? ` | Loss: ${status.loss.toFixed(4)}` : ''}`);
                    setTimeout(poll, 2000);
                }
            } catch (err) {
                setTimeout(poll, 5000);
            }
        };
        poll();
    };

    const loadNpcKnowledgeGraph = async (npcName) => {
        setKgLoading(true);
        try {
            const data = await (window as any).api?.kgLoadStoreData?.({}) || {};
            const allKnowledge = data.knowledge || [];
            const nodeMap = new Map();
            const nodes = [];
            const links = [];

            nodeMap.set(npcName, { id: npcName, type: 'npc', size: 12 });
            nodes.push(nodeMap.get(npcName));

            for (const k of allKnowledge) {
                const src = k.source || '';
                const tgt = k.target || '';
                if (!src && !tgt) continue;
                if (!nodeMap.has(src)) {
                    nodeMap.set(src, { id: src, type: 'concept', size: 6 });
                    nodes.push(nodeMap.get(src));
                }
                if (!nodeMap.has(tgt)) {
                    nodeMap.set(tgt, { id: tgt, type: 'concept', size: 6 });
                    nodes.push(nodeMap.get(tgt));
                }
                links.push({ source: src, target: tgt, relation: k.relation || '' });
            }

            setKgData({ nodes, links });
        } catch {
            setKgData({ nodes: [], links: [] });
        }
        setKgLoading(false);
    };

    const handleNPCSelect = async (npc) => {
        setSelectedNpc(npc);
        const jinxesArray = npc.jinxes === '*'
            ? ['*']
            : Array.isArray(npc.jinxes)
                ? npc.jinxes
                : npc.jinxes
                    ? [npc.jinxes]
                    : ['*'];
        setEditedNpc({ ...npc, jinxes: jinxesArray });
        setSelectedExecutions(new Set());
        setVisibleCount(50);
        setNpcDropdownOpen(false);
        setNpcSearch('');
        loadAvailableModels();

        const historyResponse = await fetch(
            `${BACKEND_URL}/api/npc/executions?npcName=${encodeURIComponent(npc.name)}`
        );
        const historyData = await historyResponse.json();
        setExecutionHistory(historyData.executions || []);

        loadNpcMemories(npc.name);
        loadNpcKnowledgeGraph(npc.name);
    };

    const handleChatWithNpc = () => {
        if (selectedNpc) {
            startNewConversation(selectedNpc);
            onClose();
        }
    };

    const handleCreateNewAgent = async () => {
        const name = newAgentName.trim();
        if (!name) return;
        const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = teamKey || (currentPath ? `${currentPath}/npc_team` : '');
        if (!dir) {
            setError('No team path available to create agent');
            return;
        }
        const filePath = `${dir}/${safeName}.npc`;
        const yamlContent = yaml.dump({
            name,
            primary_directive: '',
            model: '',
            provider: '',
            jinxes: ['*'],
        }, { lineWidth: -1 });
        const result = await writeFileContent(filePath, yamlContent);
        if (result?.error) {
            setError(`Failed to create agent: ${result.error}`);
            return;
        }
        setShowNewAgentModal(false);
        setNewAgentName('');
        const npcResponse = teamKey
            ? await window.api.getNPCTeamFromPath(teamKey)
            : await window.api.getNPCTeamProject(currentPath);
        const updatedNpcs = npcResponse.npcs || [];
        setNpcs(updatedNpcs);
        const created = updatedNpcs.find((n: any) => n.name === name);
        if (created) {
            handleNPCSelect(created);
        }
    };

    const handleInputChange = (field, value) => {
        setEditedNpc(prev => ({ ...prev, [field]: value }));
    };

    const loadAvailableModels = async () => {
        if (!currentPath && !teamKey) return [];
        setModelsLoading(true);
        setModelsError(null);
        try {
            const response = await window.api.getAvailableModels(teamKey || currentPath);
            const models = Array.isArray(response) ? response : response?.models || [];
            setAvailableModels(models);
            return models;
        } catch (err: any) {
            console.error('[NPCTeamMenu] Failed to load models:', err);
            setModelsError(err.message || 'Failed to load models');
            setAvailableModels([]);
            return [];
        } finally {
            setModelsLoading(false);
        }
    };

    const handleModelChange = (model: any) => {
        if (!model) return;
        setEditedNpc(prev => ({
            ...prev,
            model: model.value,
            provider: model.provider || prev.provider || '',
            api_url: model.base_url || prev.api_url || '',
            api_key: model.api_key_var || prev.api_key || '',
        }));
    };

    const removeJinxPattern = (index) => {
        setEditedNpc(prev => ({
            ...prev,
            jinxes: prev.jinxes.filter((_, i) => i !== index)
        }));
    };

    const addJinxToNpc = (jinxName) => {
        setEditedNpc(prev => {
            const current = prev.jinxes || [];
            if (current.includes(jinxName) || current.includes('*')) return prev;
            return { ...prev, jinxes: [...current, jinxName] };
        });
    };

    const handleSave = async () => {
        setError(null);
        const jinxesToSave = editedNpc.jinxes.length === 1 &&
               editedNpc.jinxes[0] === '*'
            ? '*'
            : editedNpc.jinxes;
        const npcToSave = {
            ...editedNpc,
            jinxes: jinxesToSave
        };

        const { source, source_path, source_ext, team, _original_content, ...cleanNpc } = npcToSave;
        let yamlContent: string;
        if (_original_content) {
            yamlContent = saveNPCFile(_original_content, cleanNpc);
            for (const field of ['model', 'provider', 'api_url', 'api_key']) {
                const value = cleanNpc[field];
                if (value !== undefined && value !== null && value !== '' && !new RegExp(`^\\s*${field}\\s*:`, 'm').test(yamlContent)) {
                    yamlContent = `${field}: ${value}\n${yamlContent}`;
                }
            }
        } else {
            const jinxValues = Array.isArray(cleanNpc.jinxes)
                ? cleanNpc.jinxes.map((j: any) => {
                    if (typeof j === 'string' && /^[a-zA-Z0-9_]+$/.test(j)) {
                      return `{{ Jinx('${j}') }}`;
                    }
                    return j;
                  })
                : cleanNpc.jinxes;
            yamlContent = yaml.dump({ ...cleanNpc, jinxes: jinxValues }, { lineWidth: -1 });
        }
        const result = await writeFileContent(editedNpc.source_path, yamlContent);
        if (result?.error) {
            console.error('[NPCTeamMenu] Failed to save NPC:', result.error);
            setError(`Failed to save NPC: ${result.error}`);
            setSaveSuccess(false);
            return;
        }

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);

        const updatedNpcs = await (teamKey
            ? window.api.getNPCTeamFromPath(teamKey)
            : window.api.getNPCTeamProject(currentPath));
        setNpcs(updatedNpcs.npcs || []);
        const refreshed = (updatedNpcs.npcs || []).find((n: any) => n.name === npcToSave.name);
        if (refreshed) {
            setSelectedNpc(refreshed);
            setEditedNpc({ ...refreshed, jinxes: refreshed.jinxes === '*' ? ['*'] : Array.isArray(refreshed.jinxes) ? refreshed.jinxes : refreshed.jinxes ? [refreshed.jinxes] : ['*'] });
        } else {
            setSelectedNpc(npcToSave);
        }
    };

    const labelExecution = async (messageId, label) => {
        await fetch(`${BACKEND_URL}/api/label/execution`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, label })
        });

        setExecutionHistory(prev =>
            prev.map(e =>
                e.message_id === messageId
                    ? { ...e, label }
                    : e
            )
        );
    };

    const toggleExecutionSelection = (messageId) => {
        setSelectedExecutions(prev => {
            const next = new Set(prev);
            if (next.has(messageId)) next.delete(messageId);
            else next.add(messageId);
            return next;
        });
    };

    const selectAllVisible = () => {
        const visibleIds = filteredExecutions
            .slice(0, visibleCount)
            .map(e => e.message_id);
        setSelectedExecutions(new Set(visibleIds));
    };

    const clearSelection = () => {
        setSelectedExecutions(new Set());
    };

    const exportDataset = () => {
        const selected = executionHistory.filter(e =>
            selectedExecutions.has(e.message_id)
        );

        let dataset;
        if (datasetFormat === 'sft') {
            dataset = selected.map(e => ({
                instruction: e.input,
                output: e.output || '',
                npc: selectedNpc.name,
                model: e.model,
                timestamp: e.timestamp,
                label: e.label
            }));
        } else if (datasetFormat === 'dpo') {
            dataset = selected
                .filter(e => e.label === 'good' || e.label === 'bad')
                .map(e => ({
                    prompt: e.input,
                    chosen: e.label === 'good' ? e.output : '',
                    rejected: e.label === 'bad' ? e.output : '',
                    npc: selectedNpc.name
                }));
        } else if (datasetFormat === 'conversation') {
            dataset = selected.map(e => ({
                messages: [
                    { role: 'user', content: e.input },
                    { role: 'assistant', content: e.output || '' }
                ],
                npc: selectedNpc.name,
                model: e.model
            }));
        }

        const blob = new Blob(
            [JSON.stringify(dataset, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${datasetName || selectedNpc.name}_${datasetFormat}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setShowDatasetBuilder(false);
    };

    const filteredMemories = memories.filter(m => {
        const matchesStatus = memoryFilter === 'all' ||
                              m.status === memoryFilter;
        const matchesSearch = !memorySearch ||
            m.initial_memory?.toLowerCase()
                .includes(memorySearch.toLowerCase()) ||
            m.final_memory?.toLowerCase()
                .includes(memorySearch.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    if (!isOpen && !embedded) return null;

    const content = (
        <>
            <div className="flex flex-1 min-h-0 flex-col">
                <div className="p-2 border-b theme-border flex-shrink-0 flex items-center gap-2">
                    <button
                        ref={npcDropdownButtonRef}
                        onClick={() => setNpcDropdownOpen(!npcDropdownOpen)}
                        disabled={loading || npcs.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm theme-bg-secondary theme-text-primary theme-border border hover:bg-white/5 disabled:opacity-40 min-w-[200px] w-auto max-w-[25vw]"
                    >
                        <Bot size={14} />
                        <span className="flex-1 truncate text-left">
                            {selectedNpc ? selectedNpc.name : 'Select an Agent'}
                        </span>
                        <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${npcDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {npcDropdownOpen && createPortal(
                        <AgentDropdown
                            buttonRef={npcDropdownButtonRef}
                            npcs={npcs}
                            selectedNpc={selectedNpc}
                            npcSearch={npcSearch}
                            setNpcSearch={setNpcSearch}
                            onSelect={handleNPCSelect}
                            onClose={() => setNpcDropdownOpen(false)}
                        />,
                        document.body
                    )}
                    <button
                        onClick={() => setShowNewAgentModal(true)}
                        className="theme-button-primary px-3 py-1.5
                            rounded text-sm flex items-center
                            justify-center gap-2"
                    >
                        <Plus size={16} /> New Agent
                    </button>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    {selectedNpc && editedNpc ? (
                        <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-grow space-y-2">
                                    <div>
                                        <label className="block text-xs theme-text-secondary mb-1">Agent Name</label>
                                        <input
                                            className="w-full theme-input text-xl font-bold p-2"
                                            value={editedNpc.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                        />
                                    </div>
                                    <div className="text-xs theme-text-secondary font-mono truncate" title={editedNpc.source_path || ''}>
                                        {editedNpc.source_path || ''}
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-6">
                                    <button onClick={handleChatWithNpc} className="theme-button px-3 py-2 rounded text-sm flex items-center gap-2" title="Chat">
                                        <MessageSquare size={16} /> Chat
                                    </button>
                                    <button onClick={handleSave} className="theme-button-success px-4 py-2 rounded text-sm flex items-center gap-2" title="Save">
                                        <Save size={16} /> Save
                                    </button>
                                </div>
                            </div>

                            {saveSuccess && <div className="text-xs text-green-400">Saved</div>}
                            {error && <div className="text-xs text-red-400" title={error}>Error: {error}</div>}

                            <div>
                                <label className="block text-sm font-semibold theme-text-secondary mb-1">Model</label>
                                <div className="mb-3">
                                    <ModelSelector
                                        availableModels={availableModels}
                                        selectedModel={editedNpc.model}
                                        onSelect={handleModelChange}
                                        loading={modelsLoading}
                                        error={modelsError}
                                        teamPathForCtx={teamPathForCtx}
                                        onModelsChanged={loadAvailableModels}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold theme-text-secondary mb-1">Primary Directive</label>
                                <AutosizeTextarea
                                    className="w-full theme-input p-2 rounded text-sm resize-none min-h-[60px]"
                                    value={editedNpc.primary_directive || ''}
                                    onChange={(e) => handleInputChange('primary_directive', e.target.value)}
                                    placeholder="Describe this agent's role..."
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-semibold theme-text-secondary">Jinx Patterns</label>
                                    <span className="text-xs theme-text-secondary">{(editedNpc.jinxes || []).length}</span>
                                </div>
                                <div className="mb-3">
                                    <button
                                        ref={jinxDropdownButtonRef}
                                        onClick={() => setJinxDropdownOpen(!jinxDropdownOpen)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm theme-bg-secondary theme-text-primary theme-border border hover:bg-white/5 min-w-[200px] w-auto max-w-[25vw]"
                                    >
                                        <Zap size={14} className="text-blue-400" />
                                        <span className="flex-1 truncate text-left">Add Jinx Pattern</span>
                                        <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${jinxDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {jinxDropdownOpen && createPortal(
                                        <JinxDropdown
                                            buttonRef={jinxDropdownButtonRef}
                                            availableJinxes={availableJinxes}
                                            editedNpc={editedNpc}
                                            jinxDropdownSearch={jinxDropdownSearch}
                                            setJinxDropdownSearch={setJinxDropdownSearch}
                                            expandedJinxFolders={expandedJinxFolders}
                                            setExpandedJinxFolders={setExpandedJinxFolders}
                                            addJinxToNpc={addJinxToNpc}
                                            onClose={() => setJinxDropdownOpen(false)}
                                        />,
                                        document.body
                                    )}
                                </div>
                                <div className="space-y-1">
                                    {editedNpc.jinxes?.length > 0 ? (
                                        editedNpc.jinxes.slice().sort((a, b) => a.localeCompare(b)).map((pattern) => (
                                            <div key={pattern} className="flex items-center justify-between w-full px-2 py-1 rounded text-xs theme-bg-secondary">
                                                <button
                                                    onClick={() => onOpenJinxTab?.(pattern)}
                                                    className="flex items-center gap-1.5 text-left flex-1 truncate theme-hover rounded px-1"
                                                >
                                                    {pattern === '*' ? <Sparkles size={12} className="text-yellow-500" /> : <Zap size={12} className="text-blue-400" />}
                                                    <span className="font-mono">{pattern}</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const idx = (editedNpc.jinxes || []).indexOf(pattern);
                                                        if (idx >= 0) removeJinxPattern(idx);
                                                    }}
                                                    className="p-0.5 rounded theme-hover text-gray-500"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <span className="text-xs theme-text-secondary italic">No jinx patterns set</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    ) : (
                        <div className="flex items-center justify-center
                            h-full theme-text-secondary">
                            Select or create an Agent
                        </div>
                    )}
                </div>
            </div>

            {showDatasetBuilder && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
                    <div className="theme-bg-secondary p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Database className="text-purple-400" />
                            Create Training Dataset
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm theme-text-secondary block mb-1">Dataset Name</label>
                                <input type="text" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} placeholder={`${selectedNpc?.name}_dataset`} className="w-full theme-input p-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-sm theme-text-secondary block mb-1">Format</label>
                                <select value={datasetFormat} onChange={(e) => setDatasetFormat(e.target.value)} className="w-full theme-input p-2 text-sm">
                                    <option value="sft">SFT (Supervised Fine-Tuning)</option>
                                    <option value="dpo">DPO (Direct Preference Optimization)</option>
                                    <option value="conversation">Conversation Format</option>
                                </select>
                            </div>
                            <div className="text-sm theme-text-secondary">{selectedExecutions.size} executions selected</div>
                            {datasetFormat === 'dpo' && (
                                <div className="text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded">DPO format requires labeled data.</div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowDatasetBuilder(false)} className="theme-button px-4 py-2 text-sm rounded">Cancel</button>
                            <button onClick={exportDataset} className="theme-button-primary px-4 py-2 text-sm rounded flex items-center gap-2">
                                <Download size={14} /> Export Dataset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNewAgentModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
                    <div className="theme-bg-secondary p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Bot className="text-green-400" /> New Agent
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm theme-text-secondary block mb-1">Agent Name</label>
                                <input
                                    type="text"
                                    value={newAgentName}
                                    onChange={(e) => setNewAgentName(e.target.value)}
                                    placeholder="agent_name"
                                    className="w-full theme-input p-2 text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateNewAgent();
                                        if (e.key === 'Escape') setShowNewAgentModal(false);
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowNewAgentModal(false)} className="theme-button px-4 py-2 text-sm rounded">Cancel</button>
                            <button onClick={handleCreateNewAgent} className="theme-button-primary px-4 py-2 text-sm rounded flex items-center gap-2">
                                <Plus size={14} /> Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showFineTuneModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
                    <div className="theme-bg-secondary p-6 rounded-lg shadow-xl w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Sparkles className="text-amber-400" /> Fine-tune on {selectedMemories.size} Memories
                            </h3>
                            <button onClick={() => setShowFineTuneModal(false)}><X size={20} className="text-gray-400 hover:text-white" /></button>
                        </div>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm theme-text-secondary block mb-1">Model Name</label>
                                <input type="text" value={fineTuneConfig.outputName} onChange={(e) => setFineTuneConfig(p => ({ ...p, outputName: e.target.value }))} placeholder={`${selectedNpc?.name}_model`} className="w-full theme-input p-2 text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Strategy</label>
                                    <select value={fineTuneConfig.strategy} onChange={(e) => setFineTuneConfig(p => ({ ...p, strategy: e.target.value }))} className="w-full theme-input p-2 text-sm">
                                        <option value="sft">SFT</option>
                                        <option value="dpo">DPO</option>
                                        <option value="usft">USFT</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Base Model</label>
                                    <select value={fineTuneConfig.baseModel} onChange={(e) => setFineTuneConfig(p => ({ ...p, baseModel: e.target.value }))} className="w-full theme-input p-2 text-sm">
                                        <option value="google/gemma-3-270m-it">Gemma 270M</option>
                                        <option value="google/gemma-3-1b-it">Gemma 1B</option>
                                        <option value="Qwen/Qwen3-0.6B">Qwen 0.6B</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Epochs</label>
                                    <input type="number" value={fineTuneConfig.epochs} onChange={(e) => setFineTuneConfig(p => ({ ...p, epochs: parseInt(e.target.value) }))} className="w-full theme-input p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Learning Rate</label>
                                    <input type="number" step="0.00001" value={fineTuneConfig.learningRate} onChange={(e) => setFineTuneConfig(p => ({ ...p, learningRate: parseFloat(e.target.value) }))} className="w-full theme-input p-2 text-sm" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3 mb-4 border-t theme-border pt-3">
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={fineTuneRunMode === 'now'} onChange={() => setFineTuneRunMode('now')} className="accent-amber-500" /> Run now</label>
                                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={fineTuneRunMode === 'schedule'} onChange={() => setFineTuneRunMode('schedule')} className="accent-amber-500" /> Schedule</label>
                            </div>
                            {fineTuneRunMode === 'schedule' && (
                                <>
                                    <div>
                                        <label className="text-xs theme-text-secondary block mb-1">Cron Schedule</label>
                                        <input type="text" value={fineTuneSchedule} onChange={(e) => setFineTuneSchedule(e.target.value)} placeholder="0 0 * * *" className="w-full theme-input p-2 text-sm font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-xs theme-text-secondary block mb-1">Python Environment</label>
                                        <button
                                            onClick={async () => {
                                                setPythonEnvsLoading(true);
                                                try {
                                                    const detected = await (window as any).api?.pythonEnvDetect?.({ workspacePath: currentPath });
                                                    setPythonEnvs(detected || []);
                                                    if (detected?.length > 0 && !fineTunePythonEnv) {
                                                        const firstUsable = detected.find((d: any) => d.path && !d.notInstalled);
                                                        if (firstUsable) setFineTunePythonEnv(firstUsable);
                                                    }
                                                } catch {}
                                                setPythonEnvsLoading(false);
                                            }}
                                            disabled={pythonEnvsLoading}
                                            className="w-full theme-input p-2 text-sm text-left flex items-center justify-between"
                                        >
                                            <span>{fineTunePythonEnv ? `${fineTunePythonEnv.name} (${fineTunePythonEnv.type})` : 'Detect environments...'}</span>
                                            {pythonEnvsLoading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                        </button>
                                        {pythonEnvs.length > 0 && (
                                            <select value={fineTunePythonEnv?.path || ''} onChange={(e) => { const env = pythonEnvs.find((p: any) => p.path === e.target.value); setFineTunePythonEnv(env || null); }} className="w-full theme-input p-2 text-sm mt-1">
                                                <option value="">Select environment...</option>
                                                {pythonEnvs.map((env: any) => (
                                                    <option key={env.path || env.name} value={env.path || ''}>{env.name}{env.notInstalled ? ' (not installed)' : ''}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        {fineTuneStatus && <div className="text-sm text-amber-400 mb-4 p-2 bg-amber-900/20 rounded">{fineTuneStatus}</div>}
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowFineTuneModal(false)} className="theme-button px-4 py-2 text-sm rounded">Cancel</button>
                            <button onClick={handleNpcFineTune} disabled={isFineTuning} className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 px-4 py-2 text-sm rounded flex items-center gap-2">
                                {isFineTuning ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                                {isFineTuning ? 'Training...' : 'Start Training'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center
            justify-center z-50 p-4 overflow-hidden" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl
                w-full max-w-6xl h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="w-full border-b theme-border p-4
                    flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-semibold flex
                        items-center gap-2">
                        <Bot className="text-blue-400" /> NPC Team Editor
                    </h3>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full theme-hover"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </header>
                <main className="flex-1 p-4 overflow-hidden">
                    {content}
                </main>
            </div>
        </div>
    );
};

const AgentDropdown = ({
    buttonRef,
    npcs,
    selectedNpc,
    npcSearch,
    setNpcSearch,
    onSelect,
    onClose,
}: any) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
                setPos({ top: rect.bottom + 4, left: rect.left });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [buttonRef]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!buttonRef.current?.contains(target) && !document.getElementById('npc-dropdown-portal')?.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [buttonRef, onClose]);

    if (!pos) return null;

    const filtered = npcs.filter((npc) =>
        !npcSearch || npc.name.toLowerCase().includes(npcSearch.toLowerCase())
    );

    return (
        <div
            id="npc-dropdown-portal"
            className="fixed z-[100] theme-bg-primary border theme-border rounded-lg shadow-2xl overflow-hidden min-w-[260px] w-auto max-w-[25vw]"
            style={{ top: pos.top, left: pos.left }}
        >
            <div className="px-2 py-1.5 border-b theme-border">
                <input
                    type="text"
                    value={npcSearch}
                    onChange={(e) => setNpcSearch(e.target.value)}
                    placeholder="Search agents..."
                    className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
                {filtered.map((npc) => (
                    <button
                        key={npc.name}
                        onClick={() => onSelect(npc)}
                        className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded text-left ${selectedNpc?.name === npc.name ? 'bg-green-500/20 text-green-200' : 'hover:bg-white/5'}`}
                    >
                        <Bot size={12} />
                        <span className="truncate flex-1">{npc.name}</span>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">No agents found</div>
                )}
            </div>
        </div>
    );
};

const JinxDropdown = ({
    buttonRef,
    availableJinxes,
    editedNpc,
    jinxDropdownSearch,
    setJinxDropdownSearch,
    expandedJinxFolders,
    setExpandedJinxFolders,
    addJinxToNpc,
    onClose,
}: any) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
                setPos({ top: rect.bottom + 4, left: rect.left });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [buttonRef]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!buttonRef.current?.contains(target) && !document.getElementById('jinx-dropdown-portal')?.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [buttonRef, onClose]);

    if (!pos) return null;

    const current = new Set(editedNpc.jinxes || []);
    const filtered = availableJinxes.filter((j: any) => {
        const n = j.name || j.jinx_name;
        if (current.has(n)) return false;
        if (!jinxDropdownSearch) return true;
        return n.toLowerCase().includes(jinxDropdownSearch.toLowerCase());
    });

    return (
        <div
            id="jinx-dropdown-portal"
            className="fixed z-[100] theme-bg-primary border theme-border rounded-lg shadow-2xl overflow-hidden min-w-[260px] w-auto max-w-[25vw]"
            style={{ top: pos.top, left: pos.left }}
        >
            <div className="px-2 py-1.5 border-b theme-border">
                <input
                    type="text"
                    placeholder="Search jinxes..."
                    className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                    value={jinxDropdownSearch}
                    onChange={(e) => setJinxDropdownSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">No jinxes found</div>
                ) : (
                    (() => {
                        const byFolder: Record<string, any[]> = {};
                        for (const j of filtered.sort((a: any, b: any) => (a.name || a.jinx_name).localeCompare(b.name || b.jinx_name))) {
                            const n = j.name || j.jinx_name;
                            const parts = (j.path || n).split('/');
                            const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
                            if (!byFolder[folder]) byFolder[folder] = [];
                            byFolder[folder].push(j);
                        }
                        const items: React.ReactNode[] = [];
                        const folders = Object.keys(byFolder).sort();
                        for (const folder of folders) {
                            const isExpanded = expandedJinxFolders.has(folder);
                            items.push(
                                <button
                                    key={`folder-${folder}`}
                                    onClick={() => setExpandedJinxFolders((prev: Set<string>) => {
                                        const next = new Set(prev);
                                        if (next.has(folder)) next.delete(folder); else next.add(folder);
                                        return next;
                                    })}
                                    className="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-white/5 text-left"
                                >
                                    <ChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    {folder}
                                </button>
                            );
                            if (isExpanded) {
                                for (const j of byFolder[folder]) {
                                    const n = j.name || j.jinx_name;
                                    items.push(
                                        <button
                                            key={j.path || n}
                                            onClick={() => {
                                                addJinxToNpc(n);
                                                setJinxDropdownSearch('');
                                                onClose();
                                            }}
                                            className="flex items-center gap-2 w-full pl-6 pr-2 py-1 text-xs text-left hover:bg-white/5"
                                            title={j.description || n}
                                        >
                                            <Zap size={12} className="text-blue-400" />
                                            <span className="truncate flex-1">{n}</span>
                                        </button>
                                    );
                                }
                            }
                        }
                        return items;
                    })()
                )}
            </div>
        </div>
    );
};

export default NPCTeamMenu;