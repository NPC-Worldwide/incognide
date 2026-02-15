import React, { useState, useEffect, useCallback } from 'react';
import { useAiEnabled } from './AiFeatureContext';
import {
    Database, Search, Check, X, Edit2, Clock, Filter, RefreshCw,
    Download, Upload, Plus, Trash2, Star, FileJson, Sparkles,
    ChevronRight, Package, BookOpen, Layers, Tag, Settings, Loader
} from 'lucide-react';

interface MemoryManagerProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentPath?: string;
    currentNpc?: string;
    currentTeam?: string;
    isPane?: boolean;
}

interface Memory {
    id: number;
    initial_memory: string;
    final_memory: string | null;
    status: string;
    npc: string;
    team: string;
    directory_path: string;
    created_at: string;
    timestamp?: string;
    // For instruction dataset
    context?: string;
    qualityScore?: number;
    includeInTraining?: boolean;
}

interface InstructionExample {
    id: string;
    memoryId: number;
    systemPrompt?: string;
    userMessage: string;
    assistantResponse: string;
    qualityScore: number;
    tags: string[];
    npc: string;
    addedAt: string;
}

interface InstructionDataset {
    id: string;
    name: string;
    description?: string;
    examples: InstructionExample[];
    createdAt: string;
    updatedAt: string;
    baseModel?: string;
    tags: string[];
}

const MemoryManager: React.FC<MemoryManagerProps> = ({
    isOpen = true,
    onClose,
    currentPath = '',
    currentNpc = '',
    currentTeam = '',
    isPane = false
}) => {
    const aiEnabled = useAiEnabled();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('pending_approval');
    const [pathFilter, setPathFilter] = useState('');
    const [npcFilter, setNpcFilter] = useState('');
    const [editingMemory, setEditingMemory] = useState<number | null>(null);
    const [editedText, setEditedText] = useState('');

    // Selection State
    const [selectedMemories, setSelectedMemories] = useState<Set<number>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);

    // Fine-tune State
    const [showFineTuneModal, setShowFineTuneModal] = useState(false);
    const [fineTuneConfig, setFineTuneConfig] = useState({
        outputName: 'my_instruction_model',
        baseModel: 'google/gemma-3-270m-it',
        strategy: 'sft',
        epochs: 3,
        learningRate: 1e-5
    });
    const [exportFormat, setExportFormat] = useState<'jsonl' | 'json' | 'alpaca'>('jsonl');
    const [isFineTuning, setIsFineTuning] = useState(false);
    const [fineTuneStatus, setFineTuneStatus] = useState<string | null>(null);

    // Dataset Curation State
    const [activeTab, setActiveTab] = useState<'memories' | 'datasets'>('memories');
    const [instructionDatasets, setInstructionDatasets] = useState<InstructionDataset[]>(() => {
        try {
            const stored = localStorage.getItem('npcStudio_instructionDatasets');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });
    const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
    const [newDatasetName, setNewDatasetName] = useState('');
    const [showCreateDataset, setShowCreateDataset] = useState(false);
    const [showAddToDataset, setShowAddToDataset] = useState(false);
    const [contextPrompt, setContextPrompt] = useState('');

    // Save datasets to localStorage
    useEffect(() => {
        localStorage.setItem('npcStudio_instructionDatasets', JSON.stringify(instructionDatasets));
    }, [instructionDatasets]);

    const selectedDataset = instructionDatasets.find(d => d.id === selectedDatasetId);

    // Build training data from selected memories (input/output format for backend)
    const buildTrainingData = () => {
        const selectedMems = memories.filter(m => selectedMemories.has(m.id));
        return selectedMems.map(m => ({
            input: m.context || `Remember: ${m.npc || 'assistant'}`,
            output: m.final_memory || m.initial_memory,
            status: m.status,
            context: m.context || '',
            npc: m.npc || ''
        }));
    };

    // Start fine-tuning
    const handleStartFineTune = async () => {
        if (selectedMemories.size === 0) return;

        setIsFineTuning(true);
        setFineTuneStatus('Preparing training data...');

        try {
            const trainingData = buildTrainingData();
            console.log('Starting fine-tune with', trainingData.length, 'examples');

            const response = await (window as any).api?.fineTuneInstruction?.({
                trainingData,
                outputName: fineTuneConfig.outputName,
                baseModel: fineTuneConfig.baseModel,
                strategy: fineTuneConfig.strategy,
                epochs: fineTuneConfig.epochs,
                learningRate: fineTuneConfig.learningRate,
                batchSize: 2,
                loraR: 8,
                loraAlpha: 16,
                formatStyle: 'gemma'
            });

            console.log('Fine-tune response:', response);

            if (response?.error) {
                setFineTuneStatus(`Error: ${response.error}`);
                setIsFineTuning(false);
            } else if (response?.jobId) {
                setFineTuneStatus(`Training started! Job ID: ${response.jobId}`);
                // Start polling for status
                pollFineTuneStatus(response.jobId);
            } else {
                setFineTuneStatus('Training started...');
            }
        } catch (err: any) {
            console.error('Fine-tune error:', err);
            setFineTuneStatus(`Error: ${err.message}`);
            setIsFineTuning(false);
        }
    };

    // Poll for fine-tune job status
    const pollFineTuneStatus = async (jobId: string) => {
        const poll = async () => {
            try {
                const status = await (window as any).api?.getInstructionFineTuneStatus?.(jobId);
                if (status?.status === 'complete') {
                    setFineTuneStatus(`Training complete! Model saved to: ${status.outputPath}`);
                    setIsFineTuning(false);
                } else if (status?.status === 'error') {
                    setFineTuneStatus(`Training failed: ${status.error}`);
                    setIsFineTuning(false);
                } else if (status?.status === 'running') {
                    const progress = status.epoch ? `Epoch ${status.epoch}/${status.total_epochs}` : 'Training...';
                    setFineTuneStatus(`${progress}${status.loss ? ` | Loss: ${status.loss.toFixed(4)}` : ''}`);
                    setTimeout(poll, 2000); // Poll every 2 seconds
                }
            } catch (err) {
                console.error('Status poll error:', err);
                setTimeout(poll, 5000); // Retry after 5 seconds on error
            }
        };
        poll();
    };

    // Export selected memories
    const handleExport = () => {
        const selectedMems = memories.filter(m => selectedMemories.has(m.id));
        let content = '';
        let filename = `memories_${Date.now()}`;

        if (exportFormat === 'jsonl') {
            content = selectedMems.map(m => JSON.stringify({
                messages: [
                    ...(fineTuneConfig.systemPrompt ? [{ role: 'system', content: fineTuneConfig.systemPrompt }] : []),
                    { role: 'user', content: m.context || `Remember: ${m.npc || 'assistant'}` },
                    { role: 'assistant', content: m.final_memory || m.initial_memory }
                ]
            })).join('\n');
            filename += '.jsonl';
        } else if (exportFormat === 'alpaca') {
            const alpacaData = selectedMems.map(m => ({
                instruction: m.context || `Remember: ${m.npc || 'assistant'}`,
                input: '',
                output: m.final_memory || m.initial_memory,
                ...(fineTuneConfig.systemPrompt && { system: fineTuneConfig.systemPrompt })
            }));
            content = JSON.stringify(alpacaData, null, 2);
            filename += '_alpaca.json';
        } else {
            content = JSON.stringify(selectedMems, null, 2);
            filename += '.json';
        }

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        setShowFineTuneModal(false);
        setSelectedMemories(new Set());
        setSelectionMode(false);
    };

    // Create new dataset
    const createDataset = () => {
        if (!newDatasetName.trim()) return;
        const newDataset: InstructionDataset = {
            id: `dataset_${Date.now()}`,
            name: newDatasetName.trim(),
            examples: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: []
        };
        setInstructionDatasets(prev => [...prev, newDataset]);
        setSelectedDatasetId(newDataset.id);
        setNewDatasetName('');
        setShowCreateDataset(false);
    };

    // Delete dataset
    const deleteDataset = (id: string) => {
        setInstructionDatasets(prev => prev.filter(d => d.id !== id));
        if (selectedDatasetId === id) setSelectedDatasetId(null);
    };

    // Add selected memories to dataset
    const addMemoriesToDataset = (datasetId: string) => {
        const dataset = instructionDatasets.find(d => d.id === datasetId);
        if (!dataset) return;

        const selectedMems = memories.filter(m => selectedMemories.has(m.id));
        const newExamples: InstructionExample[] = selectedMems.map(m => ({
            id: `ex_${Date.now()}_${m.id}`,
            memoryId: m.id,
            systemPrompt: fineTuneConfig.systemPrompt || undefined,
            userMessage: m.context || `Remember: ${m.npc || 'assistant'}`,
            assistantResponse: m.final_memory || m.initial_memory,
            qualityScore: 4,
            tags: [m.status, m.npc].filter(Boolean),
            npc: m.npc || '',
            addedAt: new Date().toISOString()
        }));

        setInstructionDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? { ...d, examples: [...d.examples, ...newExamples], updatedAt: new Date().toISOString() }
                : d
        ));

        setSelectedMemories(new Set());
        setSelectionMode(false);
        setShowFineTuneModal(false);
    };

    // Update example quality
    const updateExampleQuality = (datasetId: string, exampleId: string, score: number) => {
        setInstructionDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? { ...d, examples: d.examples.map(ex => ex.id === exampleId ? { ...ex, qualityScore: score } : ex), updatedAt: new Date().toISOString() }
                : d
        ));
    };

    // Remove example
    const removeExample = (datasetId: string, exampleId: string) => {
        setInstructionDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? { ...d, examples: d.examples.filter(ex => ex.id !== exampleId), updatedAt: new Date().toISOString() }
                : d
        ));
    };

    // Export dataset
    const exportDataset = (dataset: InstructionDataset) => {
        let content = '';
        let filename = `${dataset.name.replace(/\s+/g, '_')}`;

        if (exportFormat === 'jsonl') {
            content = dataset.examples.map(ex => JSON.stringify({
                messages: [
                    ...(ex.systemPrompt ? [{ role: 'system', content: ex.systemPrompt }] : []),
                    { role: 'user', content: ex.userMessage },
                    { role: 'assistant', content: ex.assistantResponse }
                ]
            })).join('\n');
            filename += '.jsonl';
        } else if (exportFormat === 'alpaca') {
            const alpacaData = dataset.examples.map(ex => ({
                instruction: ex.userMessage,
                input: '',
                output: ex.assistantResponse,
                ...(ex.systemPrompt && { system: ex.systemPrompt })
            }));
            content = JSON.stringify(alpacaData, null, 2);
            filename += '_alpaca.json';
        } else {
            content = JSON.stringify(dataset, null, 2);
            filename += '_full.json';
        }

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Toggle memory selection
    const toggleMemorySelection = (id: number) => {
        setSelectedMemories(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Select all visible memories
    const selectAllMemories = () => {
        setSelectedMemories(new Set(memories.map(m => m.id)));
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedMemories(new Set());
    };

    // Fetch memories using Python backend API
    const fetchMemories = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            console.log('[MemoryManager] Fetching memories with filter:', statusFilter);

            let result: any;

            if (searchQuery.trim()) {
                // Use search endpoint for text search
                result = await (window as any).api?.memory_search?.({
                    q: searchQuery,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    directory_path: pathFilter || undefined,
                    npc: npcFilter || undefined,
                    limit: 100
                });
            } else if (statusFilter === 'pending_approval') {
                // Use pending endpoint for pending memories
                result = await (window as any).api?.memory_pending?.({
                    directory_path: pathFilter || undefined,
                    npc: npcFilter || undefined,
                    limit: 100
                });
            } else {
                // Use scope endpoint for filtered memories
                result = await (window as any).api?.memory_scope?.({
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    directory_path: pathFilter || undefined,
                    npc: npcFilter || undefined,
                    limit: 100
                });
            }

            console.log('[MemoryManager] API result:', result);

            if (result?.error) {
                setError(result.error);
                setMemories([]);
            } else if (Array.isArray(result?.memories)) {
                setMemories(result.memories);
            } else if (Array.isArray(result)) {
                setMemories(result);
            } else {
                setMemories([]);
            }
        } catch (err: any) {
            console.error('[MemoryManager] Error:', err);
            setError(err.message || 'Failed to load memories. Is the Python backend running?');
        } finally {
            setLoading(false);
        }
    }, [searchQuery, statusFilter, pathFilter, npcFilter]);

    useEffect(() => {
        if (isOpen) {
            fetchMemories();
        }
    }, [isOpen, fetchMemories]);

    // Handle memory approval
    const handleApprove = async (memory: Memory) => {
        try {
            await (window as any).api?.memory_approve?.({
                approvals: [{
                    memory_id: memory.id,
                    decision: 'human-approved',
                    final_memory: memory.final_memory || memory.initial_memory
                }]
            });
            fetchMemories();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Handle memory rejection
    const handleReject = async (memory: Memory) => {
        try {
            await (window as any).api?.memory_approve?.({
                approvals: [{
                    memory_id: memory.id,
                    decision: 'human-rejected'
                }]
            });
            fetchMemories();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Handle memory edit
    const handleEdit = async (memory: Memory) => {
        if (editingMemory === memory.id) {
            // Save edit
            try {
                await (window as any).api?.memory_approve?.({
                    approvals: [{
                        memory_id: memory.id,
                        decision: 'human-edited',
                        final_memory: editedText
                    }]
                });
                setEditingMemory(null);
                setEditedText('');
                fetchMemories();
            } catch (err: any) {
                setError(err.message);
            }
        } else {
            // Start editing
            setEditingMemory(memory.id);
            setEditedText(memory.final_memory || memory.initial_memory);
        }
    };

    // Bulk approve all pending
    const handleApproveAll = async () => {
        const pending = memories.filter(m => m.status === 'pending_approval');
        if (pending.length === 0) return;

        try {
            await (window as any).api?.memory_approve?.({
                approvals: pending.map(m => ({
                    memory_id: m.id,
                    decision: 'human-approved',
                    final_memory: m.final_memory || m.initial_memory
                }))
            });
            fetchMemories();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending_approval': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
            case 'human-approved': return 'bg-green-500/20 text-green-300 border-green-500/30';
            case 'human-rejected': return 'bg-red-500/20 text-red-300 border-red-500/30';
            case 'human-edited': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
        }
    };

    if (!isOpen && !isPane) return null;

    // Render datasets tab content
    const renderDatasetsTab = () => (
        <div className="flex h-full">
            {/* Dataset List Sidebar */}
            <div className="w-64 border-r theme-border flex flex-col">
                <div className="p-3 border-b theme-border">
                    <button
                        onClick={() => setShowCreateDataset(true)}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm flex items-center justify-center gap-2"
                    >
                        <Plus size={14} /> New Dataset
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {instructionDatasets.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No datasets yet
                        </div>
                    ) : (
                        instructionDatasets.map(dataset => (
                            <div
                                key={dataset.id}
                                onClick={() => setSelectedDatasetId(dataset.id)}
                                className={`p-3 rounded cursor-pointer ${
                                    selectedDatasetId === dataset.id
                                        ? 'bg-amber-600/20 border border-amber-500/50'
                                        : 'hover:bg-gray-700/50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{dataset.name}</span>
                                    <span className="text-xs text-gray-500">{dataset.examples.length}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {new Date(dataset.updatedAt).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Dataset Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedDataset ? (
                    <>
                        {/* Dataset Header */}
                        <div className="p-4 border-b theme-border flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold">{selectedDataset.name}</h4>
                                <p className="text-xs text-gray-500">
                                    {selectedDataset.examples.length} examples
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={exportFormat}
                                    onChange={(e) => setExportFormat(e.target.value as any)}
                                    className="px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded"
                                >
                                    <option value="jsonl">JSONL (OpenAI)</option>
                                    <option value="alpaca">Alpaca Format</option>
                                    <option value="json">Full JSON</option>
                                </select>
                                <button
                                    onClick={() => exportDataset(selectedDataset)}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs flex items-center gap-1"
                                >
                                    <Download size={12} /> Export
                                </button>
                                <button
                                    onClick={() => deleteDataset(selectedDataset.id)}
                                    className="px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>

                        {/* Examples List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {selectedDataset.examples.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Layers size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No examples in this dataset</p>
                                    <p className="text-xs mt-1">Select memories and add them here</p>
                                </div>
                            ) : (
                                selectedDataset.examples.map(ex => (
                                    <div key={ex.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                                        {ex.systemPrompt && (
                                            <div className="mb-2 p-2 bg-purple-900/20 rounded text-xs">
                                                <span className="text-purple-400 font-medium">System:</span>
                                                <span className="text-gray-300 ml-2">{ex.systemPrompt}</span>
                                            </div>
                                        )}
                                        <div className="mb-2 p-2 bg-blue-900/20 rounded text-sm">
                                            <span className="text-blue-400 font-medium">User:</span>
                                            <p className="text-gray-300 mt-1">{ex.userMessage}</p>
                                        </div>
                                        <div className="p-2 bg-green-900/20 rounded text-sm">
                                            <span className="text-green-400 font-medium">Assistant:</span>
                                            <p className="text-gray-300 mt-1">{ex.assistantResponse}</p>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-700">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Quality:</span>
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button
                                                        key={score}
                                                        onClick={() => updateExampleQuality(selectedDataset.id, ex.id, score)}
                                                        className={`p-0.5 ${ex.qualityScore >= score ? 'text-amber-400' : 'text-gray-600'}`}
                                                    >
                                                        <Star size={14} fill={ex.qualityScore >= score ? 'currentColor' : 'none'} />
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {ex.npc && (
                                                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">@{ex.npc}</span>
                                                )}
                                                <button
                                                    onClick={() => removeExample(selectedDataset.id, ex.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Select a dataset or create a new one</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Content component (shared between modal and pane modes)
    const content = (
        <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Database className="text-amber-400" size={20} />
                        Memory Manager
                    </h3>
                    {/* Tabs */}
                    <div className="flex gap-1 bg-gray-800 rounded p-0.5">
                        <button
                            onClick={() => setActiveTab('memories')}
                            className={`px-3 py-1 text-sm rounded ${
                                activeTab === 'memories' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Memories
                        </button>
                        {aiEnabled && (
                            <button
                                onClick={() => setActiveTab('datasets')}
                                className={`px-3 py-1 text-sm rounded flex items-center gap-1 ${
                                    activeTab === 'datasets' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <Sparkles size={12} /> Training Datasets
                            </button>
                        )}
                    </div>
                </div>
                {!isPane && onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                        <X size={18} />
                    </button>
                )}
            </div>

            {activeTab === 'datasets' ? (
                <div className="flex-1 overflow-hidden">
                    {renderDatasetsTab()}
                </div>
            ) : (
                <>
                {/* Controls */}
                <div className="p-4 border-b theme-border space-y-3">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchMemories()}
                                placeholder="Search memories..."
                                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 text-sm bg-gray-800 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                        >
                            <option value="pending_approval">Pending</option>
                            <option value="human-approved">Approved</option>
                            <option value="human-rejected">Rejected</option>
                            <option value="human-edited">Edited</option>
                            <option value="all">All</option>
                        </select>
                        <button
                            onClick={fetchMemories}
                            disabled={loading}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    {/* Path and NPC filters */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={pathFilter}
                            onChange={(e) => setPathFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchMemories()}
                            placeholder="Filter by path..."
                            className="flex-1 px-3 py-1.5 text-xs bg-gray-800 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                        />
                        <input
                            type="text"
                            value={npcFilter}
                            onChange={(e) => setNpcFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchMemories()}
                            placeholder="Filter by NPC..."
                            className="w-32 px-3 py-1.5 text-xs bg-gray-800 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                        />
                    </div>

                    {/* Selection actions - always visible */}
                    <div className="flex items-center gap-2 text-sm">
                        <span className={selectedMemories.size > 0 ? 'text-amber-300' : 'text-gray-500'}>{selectedMemories.size} selected</span>
                        <button
                            onClick={selectAllMemories}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                        >
                            All
                        </button>
                        {selectedMemories.size > 0 && (
                            <>
                                <button
                                    onClick={clearSelection}
                                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowAddToDataset(true)}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs flex items-center gap-1"
                                >
                                    <Sparkles size={12} /> Fine-tune
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs flex items-center gap-1"
                                >
                                    <Download size={12} />
                                </button>
                            </>
                        )}
                        {statusFilter === 'pending_approval' && memories.length > 0 && (
                            <button
                                onClick={handleApproveAll}
                                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs flex items-center gap-1 ml-auto"
                            >
                                <Check size={12} /> Approve All
                            </button>
                        )}
                    </div>
                </div>

                {/* Memory List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw size={24} className="animate-spin text-amber-400" />
                        </div>
                    ) : memories.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            No memories found
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {memories.map((memory) => (
                                <div
                                    key={memory.id}
                                    onClick={() => toggleMemorySelection(memory.id)}
                                    className={`p-4 bg-gray-800 rounded-lg border transition-all cursor-pointer ${
                                        selectedMemories.has(memory.id)
                                            ? 'border-amber-500 bg-amber-900/20'
                                            : 'border-gray-700 hover:border-gray-600'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                        <div className="flex items-center gap-3 flex-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedMemories.has(memory.id)}
                                                onChange={() => toggleMemorySelection(memory.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                                            />
                                            <div>
                                                <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(memory.status)}`}>
                                                    {memory.status.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs text-gray-500 ml-2">
                                                    {memory.npc && `@${memory.npc}`}
                                                    {memory.team && ` / ${memory.team}`}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                            <Clock size={10} />
                                            {new Date(memory.created_at || memory.timestamp || '').toLocaleString()}
                                        </div>
                                    </div>

                                    {editingMemory === memory.id ? (
                                        <textarea
                                            value={editedText}
                                            onChange={(e) => setEditedText(e.target.value)}
                                            className="w-full p-2 text-sm bg-gray-700 text-white border border-gray-600 rounded focus:border-blue-500 focus:outline-none resize-none"
                                            rows={4}
                                            autoFocus
                                        />
                                    ) : (
                                        <p className="text-sm text-gray-200">
                                            {memory.final_memory || memory.initial_memory}
                                        </p>
                                    )}

                                    {memory.final_memory && memory.final_memory !== memory.initial_memory && !editingMemory && (
                                        <details className="mt-2">
                                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                                Original memory
                                            </summary>
                                            <p className="text-xs text-gray-400 mt-1 italic">
                                                {memory.initial_memory}
                                            </p>
                                        </details>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
                                        {memory.status === 'pending_approval' && (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(memory)}
                                                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs flex items-center gap-1"
                                                >
                                                    <Check size={12} /> Approve
                                                </button>
                                                <button
                                                    onClick={() => handleReject(memory)}
                                                    className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs flex items-center gap-1"
                                                >
                                                    <X size={12} /> Reject
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleEdit(memory)}
                                            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                                                editingMemory === memory.id
                                                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                            }`}
                                        >
                                            <Edit2 size={12} />
                                            {editingMemory === memory.id ? 'Save' : 'Edit'}
                                        </button>
                                        {editingMemory === memory.id && (
                                            <button
                                                onClick={() => { setEditingMemory(null); setEditedText(''); }}
                                                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            {/* Footer */}
            <div className="p-3 border-t theme-border text-xs text-gray-500 flex-shrink-0">
                Showing {memories.length} memories
                {currentPath && <span> in {currentPath}</span>}
            </div>
                </>
            )}

            {/* Create Dataset Modal */}
            {showCreateDataset && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowCreateDataset(false)}>
                    <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                        <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Sparkles className="text-amber-400" size={18} />
                            Create Training Dataset
                        </h4>
                        <input
                            type="text"
                            value={newDatasetName}
                            onChange={(e) => setNewDatasetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createDataset()}
                            placeholder="Dataset name..."
                            className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateDataset(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createDataset}
                                disabled={!newDatasetName.trim()}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fine-tune / Add to Dataset Modal */}
            {showAddToDataset && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowAddToDataset(false)}>
                    <div className="bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                                <Sparkles className="text-amber-400" size={18} />
                                Fine-tune on {selectedMemories.size} Memories
                            </h4>
                            <button onClick={() => setShowAddToDataset(false)}>
                                <X size={20} className="text-gray-400 hover:text-white" />
                            </button>
                        </div>

                        {/* Config */}
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm font-medium">Output Model Name</label>
                                <input
                                    type="text"
                                    value={fineTuneConfig.outputName}
                                    onChange={e => setFineTuneConfig(p => ({ ...p, outputName: e.target.value }))}
                                    className="w-full px-3 py-2 mt-1 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                                    placeholder="my_instruction_model"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium">Epochs</label>
                                    <input
                                        type="number"
                                        value={fineTuneConfig.epochs}
                                        onChange={e => setFineTuneConfig(p => ({ ...p, epochs: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2 mt-1 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium">Learning Rate</label>
                                    <input
                                        type="number"
                                        step="0.00001"
                                        value={fineTuneConfig.learningRate}
                                        onChange={e => setFineTuneConfig(p => ({ ...p, learningRate: parseFloat(e.target.value) }))}
                                        className="w-full px-3 py-2 mt-1 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium">Strategy</label>
                                    <select
                                        value={fineTuneConfig.strategy || 'sft'}
                                        onChange={e => setFineTuneConfig(p => ({ ...p, strategy: e.target.value }))}
                                        className="w-full px-3 py-2 mt-1 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                                    >
                                        <option value="sft">SFT (Supervised)</option>
                                        <option value="dpo">DPO (Preference)</option>
                                        <option value="usft">USFT (Unsupervised)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium">Base Model</label>
                                    <select
                                        value={fineTuneConfig.baseModel}
                                        onChange={e => setFineTuneConfig(p => ({ ...p, baseModel: e.target.value }))}
                                        className="w-full px-3 py-2 mt-1 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none"
                                    >
                                        <option value="google/gemma-3-270m-it">Gemma 270M</option>
                                        <option value="google/gemma-3-1b-it">Gemma 1B</option>
                                        <option value="Qwen/Qwen3-0.6B">Qwen 0.6B</option>
                                        <option value="Qwen/Qwen3-1.7B">Qwen 1.7B</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="border-t border-gray-700 pt-4 space-y-3">
                            {/* Fine-tune directly */}
                            <button
                                onClick={handleStartFineTune}
                                disabled={isFineTuning}
                                className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                            >
                                {isFineTuning ? <Loader size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                {isFineTuning ? 'Training...' : 'Start Fine-tuning'}
                            </button>

                            {fineTuneStatus && (
                                <div className="text-sm text-center text-amber-400">{fineTuneStatus}</div>
                            )}

                            {/* Export */}
                            <div className="flex gap-2">
                                <select
                                    value={exportFormat}
                                    onChange={e => setExportFormat(e.target.value as any)}
                                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                                >
                                    <option value="jsonl">JSONL</option>
                                    <option value="alpaca">Alpaca</option>
                                    <option value="json">JSON</option>
                                </select>
                                <button
                                    onClick={handleExport}
                                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center gap-2"
                                >
                                    <Download size={16} /> Export Dataset
                                </button>
                            </div>

                            {/* Add to existing dataset */}
                            <div className="border-t border-gray-700 pt-3">
                                <label className="text-xs text-gray-400 mb-2 block">Or add to dataset:</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newDatasetName}
                                        onChange={e => setNewDatasetName(e.target.value)}
                                        placeholder="New dataset name..."
                                        className="flex-1 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-amber-500 focus:outline-none text-sm"
                                    />
                                    <button
                                        onClick={() => {
                                            if (newDatasetName.trim()) {
                                                createDataset();
                                                // Dataset created, now add memories to it
                                                setTimeout(() => {
                                                    const newId = instructionDatasets[instructionDatasets.length - 1]?.id;
                                                    if (newId) addMemoriesToDataset(newId);
                                                }, 100);
                                            }
                                        }}
                                        disabled={!newDatasetName.trim()}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded text-sm"
                                    >
                                        Create & Add
                                    </button>
                                </div>
                                {instructionDatasets.length > 0 && (
                                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                        {instructionDatasets.map(dataset => (
                                            <button
                                                key={dataset.id}
                                                onClick={() => addMemoriesToDataset(dataset.id)}
                                                className="w-full p-2 bg-gray-700/50 hover:bg-gray-600 rounded text-left text-sm flex items-center justify-between"
                                            >
                                                <span>{dataset.name}</span>
                                                <span className="text-xs text-gray-500">{dataset.examples.length} ex</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    // Pane mode - render directly
    if (isPane) {
        return (
            <div className="flex-1 flex flex-col overflow-hidden theme-bg-secondary">
                {content}
            </div>
        );
    }

    // Modal mode - render with overlay
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
            <div
                className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
};

export default MemoryManager;
