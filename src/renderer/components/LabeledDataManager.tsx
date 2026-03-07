import React, { useState, useMemo, useCallback } from 'react';
import { X, Download, Upload, Trash2, Search, Filter, Tag, Star, FileJson, FileText, ChevronDown, ChevronRight, Check, MessageSquare } from 'lucide-react';
import { MessageLabelStorage, MessageLabel, ConversationLabel, ConversationLabelStorage } from './MessageLabeling';

interface LabeledDataManagerProps {
    isOpen: boolean;
    onClose: () => void;
    isEmbedded?: boolean;
    messageLabels: { [key: string]: MessageLabel };
    setMessageLabels: React.Dispatch<React.SetStateAction<{ [key: string]: MessageLabel }>>;
    conversationLabels?: { [key: string]: ConversationLabel };
    setConversationLabels?: React.Dispatch<React.SetStateAction<{ [key: string]: ConversationLabel }>>;
}

const LabeledDataManager: React.FC<LabeledDataManagerProps> = ({
    isOpen,
    onClose,
    isEmbedded = false,
    messageLabels = {},
    setMessageLabels,
    conversationLabels = {},
    setConversationLabels
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [filterRole, setFilterRole] = useState<'all' | 'user' | 'assistant'>('all');
    const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
    const [exportFormat, setExportFormat] = useState<'json' | 'jsonl' | 'finetune'>('json');
    const [viewMode, setViewMode] = useState<'messages' | 'conversations'>('messages');

    const labels = useMemo(() => Object.values(messageLabels), [messageLabels]);

    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        labels.forEach(label => {
            label.categories?.forEach(cat => cats.add(cat));
        });
        return Array.from(cats).sort();
    }, [labels]);

    const labelsByConversation = useMemo(() => {
        const grouped: { [key: string]: MessageLabel[] } = {};
        labels.forEach(label => {
            const convId = label.conversationId || 'unknown';
            if (!grouped[convId]) {
                grouped[convId] = [];
            }
            grouped[convId].push(label);
        });

        Object.values(grouped).forEach(convLabels => {
            convLabels.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
        return grouped;
    }, [labels]);

    const filteredLabels = useMemo(() => {
        return labels.filter(label => {

            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const matchesContent = label.content?.toLowerCase().includes(search);
                const matchesCategories = label.categories?.some(c => c.toLowerCase().includes(search));
                const matchesTags = label.tags?.some(t => t.toLowerCase().includes(search));
                if (!matchesContent && !matchesCategories && !matchesTags) {
                    return false;
                }
            }

            if (filterCategory && !label.categories?.includes(filterCategory)) {
                return false;
            }

            if (filterRole !== 'all' && label.role !== filterRole) {
                return false;
            }

            return true;
        });
    }, [labels, searchTerm, filterCategory, filterRole]);

    const toggleSelectLabel = (id: string) => {
        const newSelected = new Set(selectedLabels);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedLabels(newSelected);
    };

    const selectAll = () => {
        const allIds = filteredLabels.map(l => l.id);
        setSelectedLabels(new Set(allIds));
    };

    const clearSelection = () => {
        setSelectedLabels(new Set());
    };

    const deleteSelected = () => {
        if (selectedLabels.size === 0) return;
        if (!confirm(`Delete ${selectedLabels.size} labeled message(s)? This cannot be undone.`)) return;

        selectedLabels.forEach(id => {
            MessageLabelStorage.delete(id);
        });

        setMessageLabels(prev => {
            const updated = { ...prev };
            selectedLabels.forEach(id => {
                const label = labels.find(l => l.id === id);
                if (label) {
                    delete updated[label.messageId];
                }
            });
            return updated;
        });

        setSelectedLabels(new Set());
    };

    const handleExport = () => {
        let data: string;
        let filename: string;
        let mimeType: string;

        const labelsToExport = selectedLabels.size > 0
            ? labels.filter(l => selectedLabels.has(l.id))
            : filteredLabels;

        switch (exportFormat) {
            case 'json':
                data = JSON.stringify(labelsToExport, null, 2);
                filename = `labeled_messages_${new Date().toISOString().slice(0, 10)}.json`;
                mimeType = 'application/json';
                break;
            case 'jsonl':
                data = labelsToExport.map(l => JSON.stringify(l)).join('\n');
                filename = `labeled_messages_${new Date().toISOString().slice(0, 10)}.jsonl`;
                mimeType = 'application/json';
                break;
            case 'finetune':

                const conversationGroups: { [key: string]: MessageLabel[] } = {};
                labelsToExport.forEach(label => {
                    const key = label.conversationId;
                    if (!conversationGroups[key]) {
                        conversationGroups[key] = [];
                    }
                    conversationGroups[key].push(label);
                });

                const trainingData = Object.values(conversationGroups)
                    .filter(convLabels => convLabels.length >= 2)
                    .map(convLabels => {
                        const sortedLabels = convLabels.sort((a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );
                        return {
                            messages: sortedLabels.map(label => ({
                                role: label.role,
                                content: label.content
                            }))
                        };
                    });

                data = trainingData.map(d => JSON.stringify(d)).join('\n');
                filename = `finetune_data_${new Date().toISOString().slice(0, 10)}.jsonl`;
                mimeType = 'application/json';
                break;
            default:
                return;
        }

        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.jsonl';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                let imported: MessageLabel[] = [];

                if (file.name.endsWith('.jsonl')) {
                    imported = text.trim().split('\n').map(line => JSON.parse(line));
                } else {
                    const parsed = JSON.parse(text);
                    imported = Array.isArray(parsed) ? parsed : [parsed];
                }

                imported.forEach(label => {
                    MessageLabelStorage.save(label);
                });

                setMessageLabels(prev => {
                    const updated = { ...prev };
                    imported.forEach(label => {
                        updated[label.messageId] = label;
                    });
                    return updated;
                });

                alert(`Imported ${imported.length} labeled message(s)`);
            } catch (err) {
                alert('Failed to import file: Invalid format');
            }
        };
        input.click();
    };

    const toggleConversation = (convId: string) => {
        const newExpanded = new Set(expandedConversations);
        if (newExpanded.has(convId)) {
            newExpanded.delete(convId);
        } else {
            newExpanded.add(convId);
        }
        setExpandedConversations(newExpanded);
    };

    const convLabels = useMemo(() => Object.values(conversationLabels), [conversationLabels]);

    const stats = useMemo(() => {
        const totalLabels = labels.length;
        const userMessages = labels.filter(l => l.role === 'user').length;
        const assistantMessages = labels.filter(l => l.role === 'assistant').length;
        const withScores = labels.filter(l => l.qualityScore || l.relevanceScore || l.accuracyScore || l.helpfulnessScore).length;
        const withSpans = labels.filter(l => l.textSpans?.length > 0).length;
        const conversations = Object.keys(labelsByConversation).length;
        const labeledConversations = convLabels.length;
        const trainingConversations = convLabels.filter(c => c.includeInTraining).length;

        return { totalLabels, userMessages, assistantMessages, withScores, withSpans, conversations, labeledConversations, trainingConversations };
    }, [labels, labelsByConversation, convLabels]);

    if (!isOpen) return null;

    const content = (
        <>
            <div className={`px-4 py-2 border-b border-gray-700 flex items-center gap-2 ${isEmbedded ? '' : ''}`}>
                <button
                    className={`px-3 py-1 rounded text-xs ${viewMode === 'messages' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    onClick={() => setViewMode('messages')}
                >
                    <Tag size={12} className="inline mr-1" /> Messages ({stats.totalLabels})
                </button>
                <button
                    className={`px-3 py-1 rounded text-xs ${viewMode === 'conversations' ? 'bg-green-600 text-white' : 'bg-green-700 text-gray-300'}`}
                    onClick={() => setViewMode('conversations')}
                >
                    <MessageSquare size={12} className="inline mr-1" /> Conversations ({stats.labeledConversations})
                </button>
                {stats.trainingConversations > 0 && (
                    <span className="text-xs text-gray-400 ml-2">
                        {stats.trainingConversations} for training
                    </span>
                )}
            </div>

            <div className="px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4 text-xs">
                <span className="text-gray-400">
                    <span className="text-blue-400 font-medium">{stats.conversations}</span> conversations
                </span>
                <span className="text-gray-400">
                    <span className="text-green-400 font-medium">{stats.userMessages}</span> user
                </span>
                <span className="text-gray-400">
                    <span className="text-purple-400 font-medium">{stats.assistantMessages}</span> assistant
                </span>
                <span className="text-gray-400">
                    <span className="text-yellow-400 font-medium">{stats.withScores}</span> with scores
                </span>
                <span className="text-gray-400">
                    <span className="text-orange-400 font-medium">{stats.withSpans}</span> with spans
                </span>
            </div>

            <div className="p-3 border-b border-gray-700 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search labels..."
                        className="w-full pl-8 pr-3 py-2 theme-input text-sm rounded"
                    />
                </div>

                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="theme-input text-xs px-2 py-2 rounded"
                >
                    <option value="">All categories</option>
                    {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>

                <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value as any)}
                    className="theme-input text-xs px-2 py-2 rounded"
                >
                    <option value="all">All roles</option>
                    <option value="user">User only</option>
                    <option value="assistant">Assistant only</option>
                </select>

                <div className="flex-1" />

                {selectedLabels.size > 0 && (
                    <span className="text-xs text-gray-400">
                        {selectedLabels.size} selected
                    </span>
                )}
                <button
                    onClick={selectedLabels.size > 0 ? clearSelection : selectAll}
                    className="theme-button px-2 py-1 text-xs rounded"
                >
                    {selectedLabels.size > 0 ? 'Clear' : 'Select All'}
                </button>

                {selectedLabels.size > 0 && (
                    <button
                        onClick={deleteSelected}
                        className="theme-button px-2 py-1 text-xs rounded text-red-400 hover:text-red-300"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {filteredLabels.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        {labels.length === 0
                            ? 'No labeled messages yet. Click the tag icon on any message to start labeling.'
                            : 'No labels match your filters.'}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {Object.entries(labelsByConversation).map(([convId, convLabels]) => {
                            const filteredConvLabels = convLabels.filter(l => filteredLabels.includes(l));
                            if (filteredConvLabels.length === 0) return null;

                            const isExpanded = expandedConversations.has(convId);

                            return (
                                <div key={convId} className="border border-gray-700 rounded-lg overflow-hidden">
                                    <button
                                        className="w-full flex items-center gap-2 p-3 bg-gray-800 hover:bg-gray-750 text-left"
                                        onClick={() => toggleConversation(convId)}
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span className="text-sm font-medium truncate flex-1">
                                            Conversation: {convId.slice(0, 8)}...
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {filteredConvLabels.length} labels
                                        </span>
                                    </button>

                                    {isExpanded && (
                                        <div className="divide-y divide-gray-700">
                                            {filteredConvLabels.map(label => (
                                                <div
                                                    key={label.id}
                                                    className={`p-3 hover:bg-gray-800/50 cursor-pointer ${
                                                        selectedLabels.has(label.id) ? 'bg-blue-900/20' : ''
                                                    }`}
                                                    onClick={() => toggleSelectLabel(label.id)}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLabels.has(label.id)}
                                                            onChange={() => toggleSelectLabel(label.id)}
                                                            className="mt-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                                                    label.role === 'user'
                                                                        ? 'bg-blue-600/30 text-blue-300'
                                                                        : 'bg-green-600/30 text-green-300'
                                                                }`}>
                                                                    {label.role}
                                                                </span>
                                                                {label.qualityScore && (
                                                                    <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                                                        <Star size={10} fill="currentColor" />
                                                                        {label.qualityScore}
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] text-gray-500">
                                                                    {new Date(label.timestamp).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-300 line-clamp-2">
                                                                {label.content}
                                                            </p>
                                                            {(label.categories?.length > 0 || label.textSpans?.length > 0) && (
                                                                <div className="flex flex-wrap gap-1 mt-2">
                                                                    {label.categories?.map(cat => (
                                                                        <span key={cat} className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300">
                                                                            {cat}
                                                                        </span>
                                                                    ))}
                                                                    {label.textSpans?.length > 0 && (
                                                                        <span className="px-1.5 py-0.5 bg-yellow-600/30 rounded text-[10px] text-yellow-300">
                                                                            {label.textSpans.length} spans
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="theme-input text-xs px-2 py-1 rounded"
                    >
                        <option value="json">JSON</option>
                        <option value="jsonl">JSONL</option>
                        <option value="finetune">Fine-tuning format</option>
                    </select>
                    <button
                        onClick={handleExport}
                        disabled={filteredLabels.length === 0}
                        className="theme-button-primary px-3 py-1.5 text-xs rounded flex items-center gap-1 disabled:opacity-50"
                    >
                        <Download size={14} />
                        Export {selectedLabels.size > 0 ? `(${selectedLabels.size})` : `(${filteredLabels.length})`}
                    </button>
                    <button
                        onClick={handleImport}
                        className="theme-button px-3 py-1.5 text-xs rounded flex items-center gap-1"
                    >
                        <Upload size={14} />
                        Import
                    </button>
                </div>
                {!isEmbedded && (
                    <button
                        onClick={onClose}
                        className="theme-button px-4 py-1.5 text-sm rounded"
                    >
                        Close
                    </button>
                )}
            </div>
        </>
    );

    if (isEmbedded) {
        return (
            <div className="flex flex-col h-full">
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <Tag size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold">Labeled Data Manager</h2>
                        <span className="px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded text-xs">
                            {stats.totalLabels} messages
                        </span>
                        <span className="px-2 py-0.5 bg-green-600/30 text-green-300 rounded text-xs">
                            {stats.labeledConversations} conversations
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded">
                        <X size={20} />
                    </button>
                </div>
                {content}
            </div>
        </div>
    );
};

export default LabeledDataManager;
