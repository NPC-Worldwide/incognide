import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Loader, CheckCircle, XCircle, Edit, Trash2, RefreshCw, Search } from 'lucide-react';

interface Memory {
    id: number;
    initial_memory: string;
    final_memory: string;
    status: string;
    npc: string;
    timestamp: string;
}

interface MemoryManagementProps {
    isModal?: boolean;
    onClose?: () => void;
}

const MemoryManagement: React.FC<MemoryManagementProps> = ({ isModal = false, onClose }) => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memoryFilter, setMemoryFilter] = useState('all');
    const [memorySearchTerm, setMemorySearchTerm] = useState('');
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadMemories = async () => {
        setMemoryLoading(true);
        setLoadError(null);
        try {
            console.log('[MemoryManagement] Loading memories...');
            const apiResult = await (window as any).api?.executeSQL?.({
                query: `SELECT id, initial_memory, final_memory, status, npc, timestamp FROM memory_lifecycle ORDER BY timestamp DESC LIMIT 500`
            });
            console.log('[MemoryManagement] Raw SQL result:', apiResult);

            // Handle error from API
            if (apiResult?.error) {
                console.error('[MemoryManagement] SQL error:', apiResult.error);
                setLoadError(apiResult.error);
                setMemories([]);
                return;
            }

            // executeSQL returns { result: rows, error: null }
            let memoriesArray: Memory[] = [];
            if (Array.isArray(apiResult?.result)) {
                memoriesArray = apiResult.result;
            } else if (Array.isArray(apiResult)) {
                memoriesArray = apiResult;
            } else if (apiResult?.rows) {
                memoriesArray = apiResult.rows;
            } else if (apiResult?.data) {
                memoriesArray = apiResult.data;
            } else if (apiResult && typeof apiResult === 'object') {
                console.log('[MemoryManagement] Result keys:', Object.keys(apiResult));
            }
            console.log('[MemoryManagement] Parsed memories:', memoriesArray.length);
            setMemories(Array.isArray(memoriesArray) ? memoriesArray : []);
        } catch (err: any) {
            console.error('[MemoryManagement] Error loading memories:', err);
            setLoadError(err.message || 'Unknown error');
            setMemories([]);
        } finally {
            setMemoryLoading(false);
        }
    };

    useEffect(() => {
        loadMemories();
    }, []);

    // Escape key handler
    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

    const filteredMemories = useMemo(() => {
        return memories.filter(memory => {
            const matchesSearch = !memorySearchTerm ||
                (memory.final_memory || memory.initial_memory || '').toLowerCase().includes(memorySearchTerm.toLowerCase());
            const matchesFilter = memoryFilter === 'all' || memory.status === memoryFilter;
            return matchesSearch && matchesFilter;
        });
    }, [memories, memorySearchTerm, memoryFilter]);

    const handleApproveMemory = async (memoryId: number) => {
        try {
            await (window as any).api?.executeSQL?.({
                query: `UPDATE memory_lifecycle SET status = 'human-approved' WHERE id = ?`,
                params: [memoryId]
            });
            loadMemories();
        } catch (err) {
            console.error('Error approving memory:', err);
        }
    };

    const handleRejectMemory = async (memoryId: number) => {
        try {
            await (window as any).api?.executeSQL?.({
                query: `UPDATE memory_lifecycle SET status = 'human-rejected' WHERE id = ?`,
                params: [memoryId]
            });
            loadMemories();
        } catch (err) {
            console.error('Error rejecting memory:', err);
        }
    };

    const handleEditMemory = async (memory: Memory) => {
        const edited = prompt('Edit memory:', memory.final_memory || memory.initial_memory);
        if (edited && edited !== (memory.final_memory || memory.initial_memory)) {
            await (window as any).api?.executeSQL?.({
                query: `UPDATE memory_lifecycle SET final_memory = ?, status = 'human-edited' WHERE id = ?`,
                params: [edited, memory.id]
            });
            loadMemories();
        }
    };

    const handleDeleteMemory = async (memoryId: number) => {
        if (confirm('Delete this memory?')) {
            await (window as any).api?.executeSQL?.({
                query: `DELETE FROM memory_lifecycle WHERE id = ?`,
                params: [memoryId]
            });
            loadMemories();
        }
    };

    const content = (
        <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="text-sm font-medium mb-2 block">Search Memories</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={memorySearchTerm}
                            onChange={(e) => setMemorySearchTerm(e.target.value)}
                            placeholder="Search memory content..."
                            className="w-full theme-input text-sm pl-9"
                        />
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium mb-2 block">Filter by Status</label>
                    <select
                        value={memoryFilter}
                        onChange={(e) => setMemoryFilter(e.target.value)}
                        className="w-full theme-input text-sm"
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending_approval">Pending Approval</option>
                        <option value="human-approved">Approved</option>
                        <option value="human-edited">Edited</option>
                        <option value="human-rejected">Rejected</option>
                    </select>
                </div>
                <div className="flex items-end">
                    <button
                        onClick={loadMemories}
                        disabled={memoryLoading}
                        className="px-4 py-2 theme-button rounded text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw size={14} className={memoryLoading ? 'animate-spin' : ''} />
                        {memoryLoading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                    <div className="font-semibold mb-1">Error loading memories:</div>
                    <div className="text-xs text-red-400">{loadError}</div>
                    {loadError.includes('no such table') && (
                        <div className="mt-2 text-xs text-gray-400">
                            The memory_lifecycle table doesn't exist yet. This table is created when you use NPC memory features via npcsh/npcpy.
                        </div>
                    )}
                </div>
            )}

            {memoryLoading ? (
                <div className="flex items-center justify-center p-8">
                    <Loader className="animate-spin text-orange-400" />
                </div>
            ) : (
                <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-sm">
                        <thead className="theme-bg-tertiary sticky top-0">
                            <tr>
                                <th className="p-2 text-left font-semibold">Memory Content</th>
                                <th className="p-2 text-left font-semibold">Status</th>
                                <th className="p-2 text-left font-semibold">NPC</th>
                                <th className="p-2 text-left font-semibold">Date</th>
                                <th className="p-2 text-left font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y theme-divide">
                            {filteredMemories.map(memory => (
                                <tr key={memory.id} className="theme-hover">
                                    <td className="p-2">
                                        <div className="max-w-md">
                                            <div className="truncate font-medium">
                                                {memory.final_memory || memory.initial_memory}
                                            </div>
                                            {memory.final_memory && memory.final_memory !== memory.initial_memory && (
                                                <div className="text-xs theme-text-muted mt-1">
                                                    Original: {memory.initial_memory}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            memory.status === 'human-approved' ? 'bg-green-900 text-green-300' :
                                            memory.status === 'human-edited' ? 'bg-blue-900 text-blue-300' :
                                            memory.status === 'human-rejected' ? 'bg-red-900 text-red-300' :
                                            'bg-yellow-900 text-yellow-300'
                                        }`}>
                                            {memory.status}
                                        </span>
                                    </td>
                                    <td className="p-2 text-xs">{memory.npc || 'N/A'}</td>
                                    <td className="p-2 text-xs">
                                        {memory.timestamp ? new Date(memory.timestamp.replace(' ', 'T')).toLocaleString() : 'N/A'}
                                    </td>
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleApproveMemory(memory.id)}
                                                className={`p-1.5 rounded transition-colors ${
                                                    memory.status === 'human-approved'
                                                        ? 'bg-green-600 text-white'
                                                        : 'hover:bg-green-900 text-green-400 hover:text-green-300'
                                                }`}
                                                title="Approve"
                                                disabled={memory.status === 'human-approved'}
                                            >
                                                <CheckCircle size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleRejectMemory(memory.id)}
                                                className={`p-1.5 rounded transition-colors ${
                                                    memory.status === 'human-rejected'
                                                        ? 'bg-red-600 text-white'
                                                        : 'hover:bg-red-900 text-red-400 hover:text-red-300'
                                                }`}
                                                title="Reject"
                                                disabled={memory.status === 'human-rejected'}
                                            >
                                                <XCircle size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleEditMemory(memory)}
                                                className="p-1.5 hover:bg-gray-700 rounded text-blue-400 hover:text-blue-300 transition-colors"
                                                title="Edit"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMemory(memory.id)}
                                                className="p-1.5 hover:bg-gray-700 rounded text-red-400 hover:text-red-300 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredMemories.length === 0 && (
                        <div className="text-center p-8 theme-text-muted">
                            <div className="mb-2">No memories found matching the current filters.</div>
                            <div className="text-xs text-gray-500">
                                {memories.length === 0
                                    ? 'The memory_lifecycle table may be empty or not created yet. Memories are generated when using NPCs with memory features enabled.'
                                    : `${memories.length} total memories exist, but none match current filter.`
                                }
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
                <div
                    className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b theme-border">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Brain className="text-orange-400" size={20} />
                            Memory Management ({memories.length} memories)
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                            <span className="text-xl">&times;</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    return content;
};

export default MemoryManagement;
