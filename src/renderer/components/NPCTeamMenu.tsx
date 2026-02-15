import React, { useState, useEffect, useRef } from 'react';
import { BACKEND_URL } from '../config';
import {
    Bot, Loader, ChevronRight, X, Save, MessageSquare,
    Plus, Trash2, History, CheckCircle, XCircle, Tag,
    Brain, GitBranch, Edit, Search, Download, Filter,
    Database, ChevronDown, Sparkles, Zap
} from 'lucide-react';
import AutosizeTextarea from './AutosizeTextarea';
import ForceGraph2D from 'react-force-graph-2d';
    const startNewConversationWithNpc = async (npc) => {
        try {
            const newConversation = await createNewConversation();
            if (newConversation) {
               
                setCurrentNPC(npc.name);
                
               
                setMessages([{ 
                    role: 'assistant', 
                    content: `Hello, I'm ${npc.name}. ${npc.primary_directive}`, 
                    timestamp: new Date().toISOString(), 
                    npc: npc.name,
                    model: npc.model || currentModel
                }]);
            }
        } catch (error) {
            console.error('Error starting conversation with NPC:', error);
            setError(error.message);
        }
    };

const NPCTeamMenu = ({
    isOpen,
    onClose,
    currentPath,
    startNewConversation,
    embedded = false,
    isGlobal = true,
    globalPath = undefined,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [npcs, setNpcs] = useState([]);
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [editedNpc, setEditedNpc] = useState(null);
    const [availableJinxs, setAvailableJinxs] = useState([]);
    const [activeTab, setActiveTab] = useState('config');
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

    // Memory fine-tuning state
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
    
    const [kgData, setKgData] = useState({ nodes: [], links: [] });
    const [kgLoading, setKgLoading] = useState(false);
    const graphRef = useRef();

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
            
            const npcResponse = isGlobal
                ? await window.api.getNPCTeamGlobal(globalPath)
                : await window.api.getNPCTeamProject(currentPath);
            setNpcs(npcResponse.npcs || []);

            const jinxResponse = isGlobal
                ? await window.api.getJinxsGlobal(globalPath)
                : await window.api.getJinxsProject(currentPath);
            setAvailableJinxs(jinxResponse.jinxs || []);
            
            setLoading(false);
        };
        loadData();
    }, [isOpen, isGlobal, currentPath, globalPath]);

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
        const response = await window.api.executeSQL({
            query: `
                SELECT id, message_id, conversation_id,
                       initial_memory, final_memory, status,
                       timestamp, model, provider
                FROM memory_lifecycle
                WHERE npc = '${npcName.replace(/'/g, "''")}'
                ORDER BY timestamp DESC
            `
        });
        if (!response.error) {
            setMemories(response.result || []);
        }
        setMemoryLoading(false);
    };

    // Memory selection toggle
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

    // Start fine-tuning on selected memories for this NPC
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

            const response = await window.api?.fineTuneInstruction?.({
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
                formatStyle: 'gemma'
            });

            console.log('Fine-tune response:', response);

            if (response?.error) {
                setFineTuneStatus(`Error: ${response.error}`);
                setIsFineTuning(false);
            } else if (response?.jobId) {
                setFineTuneStatus(`Training started! Job: ${response.jobId}`);
                pollNpcFineTuneStatus(response.jobId);
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
        const response = await window.api.executeSQL({
            query: `
                SELECT DISTINCT 
                    ch.content,
                    ch.timestamp
                FROM conversation_history ch
                WHERE ch.npc = '${npcName.replace(/'/g, "''")}'
                AND ch.role = 'assistant'
                ORDER BY ch.timestamp DESC
                LIMIT 50
            `
        });
        
        if (!response.error && response.result) {
            const nodes = [];
            const links = [];
            const nodeMap = new Map();
            
            nodeMap.set(npcName, { 
                id: npcName, 
                type: 'npc', 
                size: 12 
            });
            nodes.push(nodeMap.get(npcName));
            
            response.result.forEach((msg) => {
                const words = msg.content
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(w => w.length > 5)
                    .slice(0, 10);
                
                words.forEach(word => {
                    if (!nodeMap.has(word)) {
                        nodeMap.set(word, { 
                            id: word, 
                            type: 'concept', 
                            size: 4 
                        });
                        nodes.push(nodeMap.get(word));
                    }
                    links.push({ 
                        source: npcName, 
                        target: word 
                    });
                });
            });
            
            setKgData({ nodes, links });
        }
        setKgLoading(false);
    };

    const handleNPCSelect = async (npc) => {
        setSelectedNpc(npc);
        const jinxsArray = npc.jinxs === '*' 
            ? ['*'] 
            : Array.isArray(npc.jinxs) 
                ? npc.jinxs 
                : npc.jinxs 
                    ? [npc.jinxs] 
                    : ['*'];
        setEditedNpc({ ...npc, jinxs: jinxsArray });
        setActiveTab('config');
        setSelectedExecutions(new Set());
        setVisibleCount(50);
        
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

    const handleInputChange = (field, value) => {
        setEditedNpc(prev => ({ ...prev, [field]: value }));
    };

    const handleJinxPatternChange = (index, value) => {
        setEditedNpc(prev => {
            const newPatterns = [...(prev.jinxs || [])];
            newPatterns[index] = value;
            return { ...prev, jinxs: newPatterns };
        });
    };

    const addJinxPattern = () => {
        setEditedNpc(prev => ({
            ...prev,
            jinxs: [...(prev.jinxs || []), '']
        }));
    };

    const removeJinxPattern = (index) => {
        setEditedNpc(prev => ({
            ...prev,
            jinxs: prev.jinxs.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        const npcToSave = {
            ...editedNpc,
            jinxs: editedNpc.jinxs.length === 1 && 
                   editedNpc.jinxs[0] === '*'
                ? '*'
                : editedNpc.jinxs
        };
        
        const response = await window.api.saveNPC({
            npc: npcToSave,
            isGlobal,
            currentPath,
            globalPath,
        });

        if (response.error) {
            setError(response.error);
            return;
        }

        const updatedNpcs = await (isGlobal
            ? window.api.getNPCTeamGlobal(globalPath)
            : window.api.getNPCTeamProject(currentPath));
        setNpcs(updatedNpcs.npcs || []);
        setSelectedNpc(npcToSave);
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
            <div className="flex flex-1 min-h-0 overflow-hidden border theme-border rounded-lg">
                    <div className="w-1/5 border-r theme-border 
                        flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-2">
                            {loading ? (
                                <div className="flex items-center 
                                    justify-center p-8">
                                    <Loader className="animate-spin 
                                        text-blue-400" />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {npcs.map((npc) => (
                                        <button 
                                            key={npc.name} 
                                            onClick={() => handleNPCSelect(npc)}
                                            className={`flex items-center gap-2 
                                                w-full p-2 rounded text-sm 
                                                text-left 
                                                ${selectedNpc?.name === npc.name 
                                                    ? 'bg-blue-600/50' 
                                                    : 'theme-hover'}`}
                                        >
                                            <Bot size={14} />
                                            <span className="flex-1 truncate">
                                                {npc.name}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedNpc && editedNpc ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex border-b theme-border 
                                flex-shrink-0">
                                <button
                                    onClick={() => setActiveTab('config')}
                                    className={`px-4 py-2 text-sm 
                                        ${activeTab === 'config' 
                                            ? 'border-b-2 border-blue-500' 
                                            : 'theme-text-secondary'}`}
                                >
                                    Config
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`px-4 py-2 text-sm 
                                        ${activeTab === 'history' 
                                            ? 'border-b-2 border-blue-500' 
                                            : 'theme-text-secondary'}`}
                                >
                                    History ({executionHistory.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('memory')}
                                    className={`px-4 py-2 text-sm 
                                        ${activeTab === 'memory' 
                                            ? 'border-b-2 border-blue-500' 
                                            : 'theme-text-secondary'}`}
                                >
                                    Memory ({memories.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('kg')}
                                    className={`px-4 py-2 text-sm 
                                        ${activeTab === 'kg' 
                                            ? 'border-b-2 border-blue-500' 
                                            : 'theme-text-secondary'}`}
                                >
                                    Knowledge
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                {activeTab === 'config' && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between 
                                            items-start gap-2">
                                            <input
                                                className="flex-1 theme-input 
                                                    text-lg font-bold p-2"
                                                value={editedNpc.name}
                                                onChange={(e) => handleInputChange(
                                                    'name', 
                                                    e.target.value
                                                )}
                                            />
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={handleChatWithNpc} 
                                                    className="theme-button-primary 
                                                        p-2 rounded"
                                                    title="Chat"
                                                >
                                                    <MessageSquare size={16} />
                                                </button>
                                                <button 
                                                    onClick={handleSave} 
                                                    className="theme-button-success 
                                                        p-2 rounded"
                                                    title="Save"
                                                >
                                                    <Save size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs 
                                                theme-text-secondary mb-1">
                                                Primary Directive
                                            </label>
                                            <AutosizeTextarea
                                                className="w-full theme-input p-2 
                                                    rounded text-sm min-h-[80px]"
                                                value={editedNpc.primary_directive || ''}
                                                onChange={(e) => handleInputChange(
                                                    'primary_directive', 
                                                    e.target.value
                                                )}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs 
                                                    theme-text-secondary mb-1">
                                                    Model
                                                </label>
                                                <input
                                                    className="w-full theme-input 
                                                        p-2 rounded text-sm"
                                                    value={editedNpc.model || ''}
                                                    onChange={(e) => handleInputChange(
                                                        'model', 
                                                        e.target.value
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs 
                                                    theme-text-secondary mb-1">
                                                    Provider
                                                </label>
                                                <input
                                                    className="w-full theme-input 
                                                        p-2 rounded text-sm"
                                                    value={editedNpc.provider || ''}
                                                    onChange={(e) => handleInputChange(
                                                        'provider', 
                                                        e.target.value
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between 
                                                items-center mb-2">
                                                <label className="text-sm 
                                                    font-semibold">
                                                    Jinx Patterns
                                                </label>
                                                <button 
                                                    onClick={addJinxPattern} 
                                                    className="text-xs 
                                                        theme-button-subtle 
                                                        flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Add
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-1">
                                                {(editedNpc.jinxs || []).map((pattern, i) => (
                                                    <div key={i} className="flex 
                                                        items-center gap-1">
                                                        <input
                                                            className="flex-1 
                                                                theme-input p-1.5 
                                                                rounded text-xs 
                                                                font-mono"
                                                            value={pattern}
                                                            onChange={(e) => 
                                                                handleJinxPatternChange(
                                                                    i, 
                                                                    e.target.value
                                                                )
                                                            }
                                                            placeholder="code/* or *"
                                                        />
                                                        <button 
                                                            onClick={() => 
                                                                removeJinxPattern(i)
                                                            } 
                                                            className="p-1.5 
                                                                theme-button-danger-subtle 
                                                                rounded"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'history' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center 
                                            justify-between">
                                            <h3 className="text-sm font-semibold 
                                                flex items-center gap-2">
                                                <History size={16} /> 
                                                Execution History
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs 
                                                    theme-text-secondary">
                                                    {selectedExecutions.size} selected
                                                </span>
                                                {selectedExecutions.size > 0 && (
                                                    <button
                                                        onClick={() => 
                                                            setShowDatasetBuilder(true)
                                                        }
                                                        className="theme-button-primary 
                                                            px-3 py-1 rounded text-xs 
                                                            flex items-center gap-1"
                                                    >
                                                        <Database size={12} />
                                                        Create Dataset
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="relative col-span-2">
                                                <Search size={14} 
                                                    className="absolute left-2 
                                                        top-1/2 -translate-y-1/2 
                                                        text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={executionSearch}
                                                    onChange={(e) => 
                                                        setExecutionSearch(e.target.value)
                                                    }
                                                    placeholder="Search executions..."
                                                    className="w-full theme-input 
                                                        pl-8 p-1.5 text-xs"
                                                />
                                            </div>
                                            <select
                                                value={executionLabelFilter}
                                                onChange={(e) => 
                                                    setExecutionLabelFilter(e.target.value)
                                                }
                                                className="theme-input p-1.5 text-xs"
                                            >
                                                <option value="all">All Labels</option>
                                                <option value="good">Good</option>
                                                <option value="bad">Bad</option>
                                                <option value="training">Training</option>
                                                <option value="">Unlabeled</option>
                                            </select>
                                            <select
                                                value={executionDateRange}
                                                onChange={(e) => 
                                                    setExecutionDateRange(e.target.value)
                                                }
                                                className="theme-input p-1.5 text-xs"
                                            >
                                                <option value="all">All Time</option>
                                                <option value="7d">Last 7 days</option>
                                                <option value="30d">Last 30 days</option>
                                                <option value="90d">Last 90 days</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center gap-2 
                                            text-xs">
                                            <button
                                                onClick={selectAllVisible}
                                                className="theme-button-subtle 
                                                    px-2 py-1 rounded"
                                            >
                                                Select Visible
                                            </button>
                                            <button
                                                onClick={clearSelection}
                                                className="theme-button-subtle 
                                                    px-2 py-1 rounded"
                                            >
                                                Clear
                                            </button>
                                            <span className="theme-text-secondary">
                                                Showing {Math.min(visibleCount, filteredExecutions.length)} of {filteredExecutions.length}
                                            </span>
                                        </div>

                                        {filteredExecutions.length > 0 ? (
                                            <div className="space-y-2">
                                                {filteredExecutions
                                                    .slice(0, visibleCount)
                                                    .map((exec) => (
                                                    <div 
                                                        key={exec.message_id} 
                                                        className={`p-3 
                                                            bg-gray-900/50 
                                                            rounded border 
                                                            text-xs
                                                            ${selectedExecutions.has(exec.message_id)
                                                                ? 'border-blue-500'
                                                                : 'theme-border'}`}
                                                    >
                                                        <div className="flex 
                                                            items-start gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedExecutions.has(exec.message_id)}
                                                                onChange={() => 
                                                                    toggleExecutionSelection(exec.message_id)
                                                                }
                                                                className="mt-1"
                                                            />
                                                            <div className="flex-1">
                                                                <div 
                                                                    className={`font-mono 
                                                                        mb-1 cursor-pointer 
                                                                        hover:text-blue-400
                                                                        ${expandedExecution === exec.message_id 
                                                                            ? 'whitespace-pre-wrap' 
                                                                            : 'truncate'}`}
                                                                    onClick={() => 
                                                                        setExpandedExecution(
                                                                            expandedExecution === exec.message_id 
                                                                                ? null 
                                                                                : exec.message_id
                                                                        )
                                                                    }
                                                                >
                                                                    {expandedExecution === exec.message_id 
                                                                        ? exec.input 
                                                                        : exec.input?.length > 80 
                                                                            ? exec.input.substring(0, 80) + '...' 
                                                                            : exec.input}
                                                                </div>
                                                                {expandedExecution === exec.message_id && exec.output && (
                                                                    <div className="mt-2 p-2 
                                                                        bg-green-900/20 rounded 
                                                                        font-mono text-green-300">
                                                                        <div className="text-[10px] 
                                                                            text-green-500 mb-1">
                                                                            Response:
                                                                        </div>
                                                                        {exec.output.length > 500
                                                                            ? exec.output.substring(0, 500) + '...'
                                                                            : exec.output}
                                                                    </div>
                                                                )}
                                                                <div className="text-gray-400 
                                                                    text-xs mt-1">
                                                                    {exec.timestamp} | {exec.model}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1 mt-2 
                                                            ml-6">
                                                            <button
                                                                onClick={() => 
                                                                    labelExecution(
                                                                        exec.message_id, 
                                                                        'good'
                                                                    )
                                                                }
                                                                className={`p-1 rounded 
                                                                    ${exec.label === 'good' 
                                                                        ? 'bg-green-600' 
                                                                        : 'theme-button-subtle'}`}
                                                                title="Good"
                                                            >
                                                                <CheckCircle size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => 
                                                                    labelExecution(
                                                                        exec.message_id, 
                                                                        'bad'
                                                                    )
                                                                }
                                                                className={`p-1 rounded 
                                                                    ${exec.label === 'bad' 
                                                                        ? 'bg-red-600' 
                                                                        : 'theme-button-subtle'}`}
                                                                title="Bad"
                                                            >
                                                                <XCircle size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => 
                                                                    labelExecution(
                                                                        exec.message_id, 
                                                                        'training'
                                                                    )
                                                                }
                                                                className={`p-1 rounded 
                                                                    ${exec.label === 'training' 
                                                                        ? 'bg-yellow-600' 
                                                                        : 'theme-button-subtle'}`}
                                                                title="Training"
                                                            >
                                                                <Tag size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {visibleCount < filteredExecutions.length && (
                                                    <button
                                                        onClick={() => 
                                                            setVisibleCount(v => v + 50)
                                                        }
                                                        className="w-full theme-button 
                                                            py-2 rounded text-xs 
                                                            flex items-center 
                                                            justify-center gap-2"
                                                    >
                                                        <ChevronDown size={14} />
                                                        Load More ({filteredExecutions.length - visibleCount} remaining)
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-xs 
                                                theme-text-secondary italic 
                                                text-center p-4">
                                                No executions match filters
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'memory' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Brain size={16} className="text-orange-400" />
                                            <h3 className="text-sm font-semibold">NPC Memories</h3>
                                            <button
                                                onClick={() => loadNpcMemories(selectedNpc.name)}
                                                disabled={memoryLoading}
                                                className="ml-auto text-xs theme-button-subtle"
                                            >
                                                {memoryLoading ? 'Loading...' : 'Refresh'}
                                            </button>
                                        </div>

                                        {/* Selection Action Bar */}
                                        <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
                                            <span className="text-xs text-gray-400">
                                                {selectedMemories.size} selected
                                            </span>
                                            <button
                                                onClick={selectAllFilteredMemories}
                                                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                                            >
                                                Select All
                                            </button>
                                            {selectedMemories.size > 0 && (
                                                <>
                                                    <button
                                                        onClick={clearMemorySelection}
                                                        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                                                    >
                                                        Clear
                                                    </button>
                                                    <button
                                                        onClick={() => setShowFineTuneModal(true)}
                                                        className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded flex items-center gap-1"
                                                    >
                                                        <Sparkles size={12} /> Fine-tune
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative">
                                                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={memorySearch}
                                                    onChange={(e) => setMemorySearch(e.target.value)}
                                                    placeholder="Search memories..."
                                                    className="w-full theme-input pl-8 p-1.5 text-xs"
                                                />
                                            </div>
                                            <select
                                                value={memoryFilter}
                                                onChange={(e) => setMemoryFilter(e.target.value)}
                                                className="theme-input p-1.5 text-xs"
                                            >
                                                <option value="all">All</option>
                                                <option value="pending_approval">Pending</option>
                                                <option value="human-approved">Approved</option>
                                                <option value="human-edited">Edited</option>
                                                <option value="human-rejected">Rejected</option>
                                            </select>
                                        </div>

                                        {memoryLoading ? (
                                            <div className="flex justify-center p-4">
                                                <Loader className="animate-spin text-orange-400" />
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {filteredMemories.map((mem) => (
                                                    <div
                                                        key={mem.id}
                                                        onClick={() => toggleMemorySelection(mem.id)}
                                                        className={`p-3 bg-gray-900/50 rounded border text-xs cursor-pointer transition-colors ${
                                                            selectedMemories.has(mem.id)
                                                                ? 'border-amber-500 bg-amber-900/20'
                                                                : 'theme-border hover:border-gray-500'
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMemories.has(mem.id)}
                                                                onChange={() => toggleMemorySelection(mem.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="mt-0.5 rounded border-gray-600"
                                                            />
                                                            <div className="flex-1 font-mono text-xs">
                                                                {mem.final_memory || mem.initial_memory}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center mt-2">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                                                mem.status === 'human-approved'
                                                                    ? 'bg-green-900 text-green-300'
                                                                    : mem.status === 'human-edited'
                                                                        ? 'bg-blue-900 text-blue-300'
                                                                        : mem.status === 'human-rejected'
                                                                            ? 'bg-red-900 text-red-300'
                                                                            : 'bg-yellow-900 text-yellow-300'
                                                            }`}>
                                                                {mem.status}
                                                            </span>
                                                            <span className="text-gray-400 text-[10px]">
                                                                {mem.timestamp}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {filteredMemories.length === 0 && (
                                                    <div className="text-center theme-text-secondary p-4">
                                                        No memories found
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'kg' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <GitBranch size={16} 
                                                className="text-green-400" />
                                            <h3 className="text-sm font-semibold">
                                                Concept Network
                                            </h3>
                                            <button
                                                onClick={() => 
                                                    loadNpcKnowledgeGraph(
                                                        selectedNpc.name
                                                    )
                                                }
                                                disabled={kgLoading}
                                                className="ml-auto text-xs 
                                                    theme-button-subtle"
                                            >
                                                {kgLoading 
                                                    ? 'Loading...' 
                                                    : 'Refresh'}
                                            </button>
                                        </div>

                                        <div className="text-xs 
                                            theme-text-secondary">
                                            Nodes: {kgData.nodes.length} | 
                                            Links: {kgData.links.length}
                                        </div>

                                        {kgLoading ? (
                                            <div className="flex justify-center p-8">
                                                <Loader className="animate-spin 
                                                    text-green-400" />
                                            </div>
                                        ) : (
                                            <div className="h-80 
                                                theme-bg-tertiary rounded 
                                                overflow-hidden">
                                                <ForceGraph2D
                                                    ref={graphRef}
                                                    graphData={kgData}
                                                    nodeLabel="id"
                                                    nodeVal={n => n.size || 4}
                                                    nodeColor={n => 
                                                        n.type === 'npc' 
                                                            ? '#3b82f6' 
                                                            : '#a855f7'}
                                                    linkColor={() => 
                                                        'rgba(255,255,255,0.2)'}
                                                    width={600}
                                                    height={320}
                                                    backgroundColor="transparent"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center
                            theme-text-secondary">
                            Select an NPC
                        </div>
                    )}
            </div>

            {showDatasetBuilder && (
                <div className="fixed inset-0 bg-black/70 flex items-center 
                    justify-center z-[60]">
                    <div className="theme-bg-secondary p-6 rounded-lg 
                        shadow-xl w-full max-w-md">
                        <h3 className="text-lg font-semibold mb-4 
                            flex items-center gap-2">
                            <Database className="text-purple-400" />
                            Create Training Dataset
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm 
                                    theme-text-secondary block mb-1">
                                    Dataset Name
                                </label>
                                <input
                                    type="text"
                                    value={datasetName}
                                    onChange={(e) => 
                                        setDatasetName(e.target.value)
                                    }
                                    placeholder={`${selectedNpc?.name}_dataset`}
                                    className="w-full theme-input p-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-sm 
                                    theme-text-secondary block mb-1">
                                    Format
                                </label>
                                <select
                                    value={datasetFormat}
                                    onChange={(e) => 
                                        setDatasetFormat(e.target.value)
                                    }
                                    className="w-full theme-input p-2 text-sm"
                                >
                                    <option value="sft">
                                        SFT (Supervised Fine-Tuning)
                                    </option>
                                    <option value="dpo">
                                        DPO (Direct Preference Optimization)
                                    </option>
                                    <option value="conversation">
                                        Conversation Format
                                    </option>
                                </select>
                            </div>

                            <div className="text-sm theme-text-secondary">
                                {selectedExecutions.size} executions selected
                            </div>

                            {datasetFormat === 'dpo' && (
                                <div className="text-xs text-yellow-400 
                                    bg-yellow-900/20 p-2 rounded">
                                    DPO format requires labeled data. Only 
                                    executions marked as "good" or "bad" 
                                    will be included.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowDatasetBuilder(false)}
                                className="theme-button px-4 py-2
                                    text-sm rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={exportDataset}
                                className="theme-button-primary px-4 py-2
                                    text-sm rounded flex items-center gap-2"
                            >
                                <Download size={14} />
                                Export Dataset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fine-tune Modal for NPC Memories */}
            {showFineTuneModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
                    <div className="theme-bg-secondary p-6 rounded-lg shadow-xl w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Sparkles className="text-amber-400" />
                                Fine-tune on {selectedMemories.size} Memories
                            </h3>
                            <button onClick={() => setShowFineTuneModal(false)}>
                                <X size={20} className="text-gray-400 hover:text-white" />
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm theme-text-secondary block mb-1">Model Name</label>
                                <input
                                    type="text"
                                    value={fineTuneConfig.outputName}
                                    onChange={(e) => setFineTuneConfig(p => ({ ...p, outputName: e.target.value }))}
                                    placeholder={`${selectedNpc?.name}_model`}
                                    className="w-full theme-input p-2 text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Strategy</label>
                                    <select
                                        value={fineTuneConfig.strategy}
                                        onChange={(e) => setFineTuneConfig(p => ({ ...p, strategy: e.target.value }))}
                                        className="w-full theme-input p-2 text-sm"
                                    >
                                        <option value="sft">SFT</option>
                                        <option value="dpo">DPO</option>
                                        <option value="usft">USFT</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Base Model</label>
                                    <select
                                        value={fineTuneConfig.baseModel}
                                        onChange={(e) => setFineTuneConfig(p => ({ ...p, baseModel: e.target.value }))}
                                        className="w-full theme-input p-2 text-sm"
                                    >
                                        <option value="google/gemma-3-270m-it">Gemma 270M</option>
                                        <option value="google/gemma-3-1b-it">Gemma 1B</option>
                                        <option value="Qwen/Qwen3-0.6B">Qwen 0.6B</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Epochs</label>
                                    <input
                                        type="number"
                                        value={fineTuneConfig.epochs}
                                        onChange={(e) => setFineTuneConfig(p => ({ ...p, epochs: parseInt(e.target.value) }))}
                                        className="w-full theme-input p-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary block mb-1">Learning Rate</label>
                                    <input
                                        type="number"
                                        step="0.00001"
                                        value={fineTuneConfig.learningRate}
                                        onChange={(e) => setFineTuneConfig(p => ({ ...p, learningRate: parseFloat(e.target.value) }))}
                                        className="w-full theme-input p-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {fineTuneStatus && (
                            <div className="text-sm text-amber-400 mb-4 p-2 bg-amber-900/20 rounded">
                                {fineTuneStatus}
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowFineTuneModal(false)}
                                className="theme-button px-4 py-2 text-sm rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleNpcFineTune}
                                disabled={isFineTuning}
                                className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 px-4 py-2 text-sm rounded flex items-center gap-2"
                            >
                                {isFineTuning ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                                {isFineTuning ? 'Training...' : 'Start Training'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    // Embedded mode - return just the content
    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    // Modal mode - wrap in modal container
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center
            justify-center z-50 p-4 overflow-hidden" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl
                w-full max-w-7xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
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

export default NPCTeamMenu;