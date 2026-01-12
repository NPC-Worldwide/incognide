import React, { useState, useEffect, useCallback } from 'react';
import { Database, Search, Check, X, Edit2, Clock, Filter, RefreshCw } from 'lucide-react';

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
}

const MemoryManager: React.FC<MemoryManagerProps> = ({
    isOpen = true,
    onClose,
    currentPath = '',
    currentNpc = '',
    currentTeam = '',
    isPane = false
}) => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('pending_approval');
    const [editingMemory, setEditingMemory] = useState<number | null>(null);
    const [editedText, setEditedText] = useState('');

    // Fetch memories
    const fetchMemories = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let result;
            if (searchQuery.trim()) {
                result = await (window as any).api?.memory_search?.({
                    q: searchQuery,
                    npc: currentNpc || undefined,
                    team: currentTeam || undefined,
                    directory_path: currentPath || undefined,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    limit: 100
                });
            } else if (statusFilter === 'pending_approval') {
                result = await (window as any).api?.memory_pending?.({
                    npc: currentNpc || undefined,
                    team: currentTeam || undefined,
                    directory_path: currentPath || undefined,
                    limit: 100
                });
            } else {
                result = await (window as any).api?.memory_scope?.({
                    npc: currentNpc || undefined,
                    team: currentTeam || undefined,
                    directory_path: currentPath || undefined,
                    status: statusFilter !== 'all' ? statusFilter : undefined
                });
            }

            if (result?.memories) {
                setMemories(result.memories);
            } else if (result?.error) {
                setError(result.error);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, statusFilter, currentPath, currentNpc, currentTeam]);

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

    // Content component (shared between modal and pane modes)
    const content = (
        <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b theme-border flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Database className="text-amber-400" size={20} />
                    Memory Manager
                </h3>
                {!isPane && onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                        <X size={18} />
                    </button>
                )}
            </div>

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

                    {/* Bulk actions for pending */}
                    {statusFilter === 'pending_approval' && memories.length > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400">{memories.length} pending</span>
                            <button
                                onClick={handleApproveAll}
                                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs flex items-center gap-1"
                            >
                                <Check size={12} /> Approve All
                            </button>
                        </div>
                    )}
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
                                    className="p-4 bg-gray-800 rounded-lg border border-gray-700"
                                >
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                        <div className="flex-1">
                                            <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(memory.status)}`}>
                                                {memory.status.replace('_', ' ')}
                                            </span>
                                            <span className="text-xs text-gray-500 ml-2">
                                                {memory.npc && `@${memory.npc}`}
                                                {memory.team && ` / ${memory.team}`}
                                            </span>
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
