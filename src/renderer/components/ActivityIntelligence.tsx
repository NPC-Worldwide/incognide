import React, { useState, useEffect, useCallback } from 'react';
import { Brain, RefreshCw, Globe, Terminal, Zap, BookOpen, Activity } from 'lucide-react';

interface ActivityIntelligenceProps {
    isModal?: boolean;
    onClose?: () => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    website_visit:     { icon: <Globe size={13} />,    label: 'Web',     color: 'text-blue-400' },
    terminal_command:  { icon: <Terminal size={13} />, label: 'Command', color: 'text-yellow-400' },
    jinx_execution:    { icon: <Zap size={13} />,      label: 'Jinx',    color: 'text-purple-400' },
    memory_created:    { icon: <BookOpen size={13} />, label: 'Memory',  color: 'text-green-400' },
};

const getConfig = (type: string) =>
    TYPE_CONFIG[type] || { icon: <Activity size={13} />, label: type?.replace(/_/g, ' ') || 'Activity', color: 'text-gray-400' };

const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
};

const activityLabel = (activity: any): string => {
    const { type, data } = activity;
    if (type === 'website_visit') return data?.title || data?.url || '';
    if (type === 'terminal_command') return data?.command || '';
    if (type === 'jinx_execution') return data?.command || data?.jinx_name || '';
    if (type === 'memory_created') return data?.memory || data?.initial_memory || '';
    if (type === 'pane_open') return `opened ${data?.paneType || data?.contentType || 'pane'}`;
    if (type === 'pane_close') return `closed ${data?.paneType || data?.contentType || 'pane'}`;
    if (type === 'chat_message') return data?.content || data?.message || 'chat message';
    if (type === 'file_open' || type === 'file_edit') return data?.filePath || data?.fileName || '';
    if (type === 'search_query') return data?.query || '';
    if (type === 'model_change') return `switched to ${data?.model || ''}`;
    if (type === 'click') return data?.label || 'click';
    if (type === 'pane_focus') return `focused ${data?.paneType || 'pane'}`;
    if (type === 'keyboard_shortcut') {
        const mods = [data?.meta && '⌘', data?.ctrl && '⌃', data?.alt && '⌥', data?.shift && '⇧'].filter(Boolean).join('');
        return `${mods}${data?.key || ''}`;
    }
    if (type === 'text_input') return data?.value || '';
    return data?.command || data?.url || data?.title || data?.description || data?.content || type?.replace(/_/g, ' ') || '';
};

const activitySub = (activity: any): string => {
    const { type, data } = activity;
    if (type === 'website_visit') return data?.url || '';
    if (type === 'memory_created') return data?.npc ? `via ${data.npc}` : '';
    if (type === 'file_open' || type === 'file_edit') return data?.filePath || '';
    if (type === 'click') {
        const parts = [data?.section && `section: ${data.section}`, data?.pane && `pane: ${data.pane}`, data?.x != null && `(${data.x}, ${data.y})`].filter(Boolean);
        return parts.join(' · ');
    }
    if (type === 'text_input') return data?.placeholder ? `in "${data.placeholder}"` : '';
    return '';
};


const ActivityIntelligence: React.FC<ActivityIntelligenceProps> = ({ isModal = false, onClose }) => {
    const [activityData, setActivityData] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await (window as any).api?.getActivityPredictions?.();
            if (res && !res.error) {
                setActivityData(res.recentActivities || []);
                setStats(res.stats || null);
            }
        } catch (err) {
            console.error('Failed to load activity data:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!isModal) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isModal, onClose]);

    const [search, setSearch] = useState('');

    const filtered = search.trim()
        ? activityData.filter(a => {
            const label = activityLabel(a).toLowerCase();
            const sub = activitySub(a).toLowerCase();
            return label.includes(search.toLowerCase()) || sub.includes(search.toLowerCase());
          })
        : activityData;

    const content = (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
                <Brain size={16} className="text-purple-400 flex-shrink-0" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter activity..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-purple-500"
                />
                <button onClick={load} disabled={loading} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white flex-shrink-0">
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center flex-1">
                    <RefreshCw className="animate-spin text-gray-400" size={24} />
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-0.5">
                        {filtered.length > 0 ? filtered.map((activity, idx) => {
                            const cfg = getConfig(activity.type);
                            const label = activityLabel(activity);
                            const sub = activitySub(activity);
                            const isOpen = expanded === idx;
                            return (
                                <div key={idx}>
                                    <div
                                        className="flex items-start gap-2.5 py-1.5 px-2 hover:bg-gray-800/60 rounded cursor-pointer"
                                        onClick={() => setExpanded(isOpen ? null : idx)}
                                    >
                                        <span className={`mt-0.5 flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-200 truncate leading-tight">{label || '—'}</p>
                                            {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
                                        </div>
                                        <span className="text-xs text-gray-600 flex-shrink-0 mt-0.5">{formatTime(activity.timestamp)}</span>
                                    </div>
                                    {isOpen && (
                                        <div className="ml-7 mb-1 px-2 py-1.5 bg-gray-800 rounded text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                                            {JSON.stringify(activity.data, null, 2)}
                                        </div>
                                    )}
                                </div>
                            );
                        }) : (
                            <div className="text-center py-12 text-gray-500">
                                <Activity size={32} className="mx-auto mb-3 opacity-40" />
                                <p className="text-sm">No activity recorded yet</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
                <div className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b theme-border">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Brain className="text-purple-400" size={18} />Activity Intelligence
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400">✕</button>
                    </div>
                    <div className="flex-1 overflow-hidden">{content}</div>
                </div>
            </div>
        );
    }

    return <div className="h-full flex flex-col">{content}</div>;
};

export default ActivityIntelligence;
