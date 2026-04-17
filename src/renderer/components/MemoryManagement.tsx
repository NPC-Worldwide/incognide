import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader, CheckCircle, XCircle, Edit, Trash2, RefreshCw, Search, Clock, X } from 'lucide-react';
import MemoryIcon from './MemoryIcon';

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
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [activeTab, setActiveTab] = useState<'memories' | 'schedule'>('memories');
    const [extractSchedule, setExtractSchedule] = useState('0 */6 * * *');
    const [extractGuidance, setExtractGuidance] = useState('');
    const [extractLimit, setExtractLimit] = useState('50');
    const [extractJobActive, setExtractJobActive] = useState<boolean | null>(null);
    const [extractJobLog, setExtractJobLog] = useState<string[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

    const SCHEDULE_PRESETS = [
        { label: 'Every 6h', value: '0 */6 * * *' },
        { label: 'Every 12h', value: '0 */12 * * *' },
        { label: 'Daily midnight', value: '0 0 * * *' },
        { label: 'Daily 9am', value: '0 9 * * *' },
        { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
        { label: 'Weekly Sun', value: '0 0 * * 0' },
    ];

    const checkExtractJobStatus = useCallback(async () => {
        try {
            const status = await (window as any).api?.jobStatus?.('memory_extract');
            if (status && !status.error) {
                setExtractJobActive(status.active ?? false);
                setExtractJobLog(status.recent_log || []);
            } else {
                setExtractJobActive(false);
                setExtractJobLog([]);
            }
        } catch { setExtractJobActive(false); }
    }, []);

    const handleScheduleExtract = async () => {
        setScheduleLoading(true); setScheduleError(null); setScheduleSuccess(null);
        try {
            let cmd = `extract_memories limit=${extractLimit}`;
            if (extractGuidance.trim()) cmd += ` context="${extractGuidance.trim().replace(/"/g, '\\"')}"`;
            const result = await (window as any).api?.scheduleJob?.({ schedule: extractSchedule, command: cmd, jobName: 'memory_extract' });
            if (result?.error) setScheduleError(result.error);
            else { setScheduleSuccess('Memory extraction job scheduled.'); checkExtractJobStatus(); }
        } catch (err: any) { setScheduleError(err.message || 'Failed to schedule job'); }
        finally { setScheduleLoading(false); }
    };

    const handleUnscheduleExtract = async () => {
        setScheduleLoading(true); setScheduleError(null); setScheduleSuccess(null);
        try {
            const result = await (window as any).api?.unscheduleJob?.('memory_extract');
            if (result?.error) setScheduleError(result.error);
            else { setScheduleSuccess('Memory extraction job removed.'); setExtractJobActive(false); setExtractJobLog([]); }
        } catch (err: any) { setScheduleError(err.message || 'Failed to unschedule job'); }
        finally { setScheduleLoading(false); }
    };

    useEffect(() => { if (activeTab === 'schedule') checkExtractJobStatus(); }, [activeTab, checkExtractJobStatus]);

    const loadMemories = async () => {
        setMemoryLoading(true);
        setLoadError(null);
        try {
            console.log('[MemoryManagement] Loading memories...');
            const apiResult = await (window as any).api?.executeSQL?.({
                query: `SELECT id, initial_memory, final_memory, status, npc, timestamp FROM memory_lifecycle ORDER BY timestamp DESC LIMIT 500`
            });
            console.log('[MemoryManagement] Raw SQL result:', apiResult);

            if (apiResult?.error) {
                console.error('[MemoryManagement] SQL error:', apiResult.error);
                setLoadError(apiResult.error);
                setMemories([]);
                return;
            }

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

    const handleEditMemory = (memory: Memory) => {
        setEditingId(memory.id);
        setEditText(memory.final_memory || memory.initial_memory);
    };

    const handleSaveEdit = async (memoryId: number) => {
        await (window as any).api?.executeSQL?.({
            query: `UPDATE memory_lifecycle SET final_memory = ?, status = 'human-edited' WHERE id = ?`,
            params: [editText, memoryId]
        });
        setEditingId(null);
        setEditText('');
        loadMemories();
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
        <div className="flex flex-col h-full">
            <div className="flex border-b theme-border flex-shrink-0">
                {(['memories', 'schedule'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {activeTab === 'schedule' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="border theme-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <Clock size={14} className="text-orange-400" /> Memory Extraction
                            </h4>
                            {extractJobActive !== null && (
                                <span className={`text-xs px-2 py-0.5 rounded ${extractJobActive ? 'bg-green-600/30 text-green-300' : 'bg-gray-600/30 text-gray-400'}`}>
                                    {extractJobActive ? 'Active' : 'Not scheduled'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs theme-text-secondary">Automatically extract memories from recent conversations and store them as pending approval.</p>
                        <div>
                            <label className="text-xs theme-text-secondary block mb-1">Frequency</label>
                            <select value={extractSchedule} onChange={e => setExtractSchedule(e.target.value)} className="w-full theme-input text-sm">
                                {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label} ({p.value})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs theme-text-secondary block mb-1">Conversations per run</label>
                            <input type="number" value={extractLimit} onChange={e => setExtractLimit(e.target.value)} min="1" max="500" className="w-full theme-input text-sm" />
                        </div>
                        <div>
                            <label className="text-xs theme-text-secondary block mb-1">Extraction guidance (optional)</label>
                            <textarea value={extractGuidance} onChange={e => setExtractGuidance(e.target.value)} placeholder="e.g. Focus on technical decisions..." rows={3} className="w-full theme-input text-sm resize-none" />
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleScheduleExtract} disabled={scheduleLoading} className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded disabled:opacity-50 flex items-center gap-1">
                                {scheduleLoading ? <Loader size={12} className="animate-spin" /> : <Clock size={12} />}
                                {extractJobActive ? 'Update Schedule' : 'Schedule'}
                            </button>
                            {extractJobActive && (
                                <button onClick={handleUnscheduleExtract} disabled={scheduleLoading} className="px-3 py-1.5 text-sm bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded disabled:opacity-50 flex items-center gap-1">
                                    <X size={12} /> Remove
                                </button>
                            )}
                            <button onClick={checkExtractJobStatus} className="px-3 py-1.5 text-sm theme-text-secondary hover:text-white rounded flex items-center gap-1">
                                <RefreshCw size={12} /> Refresh
                            </button>
                        </div>
                        {scheduleError && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{scheduleError}</div>}
                        {scheduleSuccess && <div className="text-xs text-green-400 bg-green-900/20 p-2 rounded">{scheduleSuccess}</div>}
                        {extractJobLog.length > 0 && (
                            <div>
                                <label className="text-xs theme-text-secondary block mb-1">Recent log</label>
                                <div className="theme-bg-primary rounded p-2 max-h-32 overflow-y-auto">
                                    {extractJobLog.map((line, i) => <div key={i} className="text-xs text-gray-500 font-mono">{line}</div>)}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="border theme-border rounded-lg p-4 space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2">Pipeline</h4>
                        <div className="flex items-center gap-2 text-xs theme-text-secondary">
                            <span className="px-2 py-0.5 bg-amber-600/20 text-amber-300 rounded">Extract</span>
                            <span>→</span>
                            <span className="px-2 py-0.5 bg-gray-600/20 text-gray-300 rounded">Review &amp; Approve</span>
                            <span>→</span>
                            <span className="px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded">KG Backfill</span>
                        </div>
                        <p className="text-xs theme-text-muted">Extracted memories land in "Pending Approval". Review them in the Memories tab, then schedule a KG Sleep with backfill in the Knowledge Graph editor to incorporate approved memories.</p>
                    </div>
                </div>
            ) : (
            <div className="flex-1 overflow-auto p-4">
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
                                            {editingId === memory.id ? (
                                                <div className="flex flex-col gap-1">
                                                    <textarea
                                                        value={editText}
                                                        onChange={e => setEditText(e.target.value)}
                                                        className="w-full text-sm theme-input rounded p-1 resize-none"
                                                        rows={3}
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handleSaveEdit(memory.id)} className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded">Save</button>
                                                        <button onClick={() => setEditingId(null)} className="px-2 py-0.5 text-xs theme-bg-tertiary rounded">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="truncate font-medium">
                                                        {memory.final_memory || memory.initial_memory}
                                                    </div>
                                                    {memory.final_memory && memory.final_memory !== memory.initial_memory && (
                                                        <div className="text-xs theme-text-muted mt-1">
                                                            Original: {memory.initial_memory}
                                                        </div>
                                                    )}
                                                </>
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
                            <MemoryIcon className="text-orange-400" size={20} />
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
