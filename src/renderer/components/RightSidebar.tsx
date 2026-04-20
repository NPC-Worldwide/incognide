import React, { useState, useMemo } from 'react';
import { MessageSquare, Bot, Search, X, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Users, Zap, FileCode } from 'lucide-react';

interface RightSidebarProps {
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    width: number;
    setWidth: (v: number) => void;
    isResizing: boolean;
    setIsResizing: (v: boolean) => void;
    directoryConversations: any[];
    activeConversationId: string | null;
    currentPath: string;
    availableNPCs?: any[];
    currentNPC?: string;
    setCurrentNPC?: (v: string) => void;
    jinxesToDisplay?: any[];
    availableModels?: any[];
    availableProviders?: string[];
    createNewConversation?: (opts?: { contentType?: 'chat' | 'agent'; npc?: string; model?: string }) => void;
    onConversationSelect?: (id: string) => void;
    refreshConversations?: () => void;
    createTeamManagementPane?: (opts?: { npcName?: string; tab?: string }) => void;
    onNpcSave?: (npc: any, changes: { model?: string; provider?: string; jinxes?: any[] }) => Promise<void> | void;
    onOpenFile?: (path: string) => void;
}

const SectionHeader: React.FC<{
    label: string;
    color: 'green' | 'indigo' | 'amber';
    count?: number;
    collapsed: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
}> = ({ label, color, count, collapsed, onToggle, actions }) => {
    const grad = color === 'green'
        ? 'from-green-800/40 to-emerald-700/35'
        : color === 'indigo'
            ? 'from-indigo-800/40 to-violet-700/35'
            : 'from-amber-800/40 to-orange-700/35';
    return (
        <div
            onClick={onToggle}
            className={`flex items-center w-full py-2 bg-gradient-to-r ${grad} cursor-pointer theme-hover`}
        >
            <div className="flex items-center pl-1 gap-1 flex-1 min-w-0">
                <ChevronRight size={12} className={`transform transition-transform theme-text-muted ${collapsed ? '' : 'rotate-90'}`} />
                <span className="text-[11px] font-semibold theme-text-primary truncate">{label}</span>
                {typeof count === 'number' && (
                    <span className="text-[9px] theme-text-muted">{count}</span>
                )}
            </div>
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                {actions}
            </div>
        </div>
    );
};

const RightSidebar: React.FC<RightSidebarProps> = ({
    collapsed,
    setCollapsed,
    width,
    setWidth,
    isResizing,
    setIsResizing,
    directoryConversations,
    activeConversationId,
    currentPath,
    availableNPCs,
    currentNPC,
    setCurrentNPC,
    jinxesToDisplay,
    availableModels,
    availableProviders,
    createNewConversation,
    onConversationSelect,
    refreshConversations,
    createTeamManagementPane,
    onNpcSave,
    onOpenFile,
}) => {
    const [expandedNpcs, setExpandedNpcs] = useState<Set<string>>(new Set());
    const [expandedJinxGroups, setExpandedJinxGroups] = useState<Set<string>>(new Set());
    const toggleNpcExpanded = (key: string) => {
        setExpandedNpcs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };
    const toggleJinxGroup = (key: string) => {
        setExpandedJinxGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };
    const [convosCollapsed, setConvosCollapsed] = useState(() => {
        try { return localStorage.getItem('incognide_rs_convosCollapsed') === 'true'; } catch { return false; }
    });
    const [npcsCollapsed, setNpcsCollapsed] = useState(() => {
        try { return localStorage.getItem('incognide_rs_npcsCollapsed') === 'true'; } catch { return false; }
    });
    const [jinxesCollapsed, setJinxesCollapsed] = useState(() => {
        try { return localStorage.getItem('incognide_rs_jinxesCollapsed') === 'true'; } catch { return true; }
    });
    React.useEffect(() => { try { localStorage.setItem('incognide_rs_convosCollapsed', String(convosCollapsed)); } catch {} }, [convosCollapsed]);
    React.useEffect(() => { try { localStorage.setItem('incognide_rs_npcsCollapsed', String(npcsCollapsed)); } catch {} }, [npcsCollapsed]);
    React.useEffect(() => { try { localStorage.setItem('incognide_rs_jinxesCollapsed', String(jinxesCollapsed)); } catch {} }, [jinxesCollapsed]);

    const [convoSearch, setConvoSearch] = useState('');
    const [npcSearch, setNpcSearch] = useState('');
    const [jinxSearch, setJinxSearch] = useState('');
    const [groupBy, setGroupBy] = useState<'time' | 'npc' | 'model' | 'none'>('time');

    const filteredConvos = useMemo(() => {
        if (!convoSearch.trim()) return directoryConversations || [];
        const q = convoSearch.toLowerCase();
        return (directoryConversations || []).filter((c: any) =>
            c.title?.toLowerCase().includes(q) ||
            c.preview?.toLowerCase().includes(q) ||
            c.id?.toLowerCase().includes(q)
        );
    }, [directoryConversations, convoSearch]);

    const groupedConvos = useMemo(() => {
        if (groupBy === 'none') return { All: filteredConvos };
        if (groupBy === 'npc') {
            return filteredConvos.reduce((acc: any, c: any) => {
                const k = c.npc || 'Unknown';
                (acc[k] = acc[k] || []).push(c);
                return acc;
            }, {});
        }
        if (groupBy === 'model') {
            return filteredConvos.reduce((acc: any, c: any) => {
                const k = c.model || 'Unknown';
                (acc[k] = acc[k] || []).push(c);
                return acc;
            }, {});
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return filteredConvos.reduce((acc: any, c: any) => {
            const t = c.timestamp ? new Date(c.timestamp) : null;
            let k = 'Older';
            if (t) {
                if (t >= today) k = 'Today';
                else if (t >= weekAgo) k = 'This Week';
                else if (t >= monthStart) k = 'This Month';
                else k = t.toLocaleString('default', { month: 'short', year: 'numeric' });
            }
            (acc[k] = acc[k] || []).push(c);
            return acc;
        }, {});
    }, [filteredConvos, groupBy]);

    const filteredNpcs = useMemo(() => {
        if (!npcSearch.trim()) return availableNPCs || [];
        const q = npcSearch.toLowerCase();
        return (availableNPCs || []).filter((n: any) =>
            n.display_name?.toLowerCase().includes(q) ||
            n.value?.toLowerCase().includes(q)
        );
    }, [availableNPCs, npcSearch]);

    const groupedNpcs = useMemo(() => {
        const teamOrder = ['project', 'incognide', 'npcsh'];
        const teamLabels: Record<string, string> = { project: 'Project', incognide: 'Incognide', npcsh: 'npcsh' };
        const buckets: Record<string, any[]> = {};
        (filteredNpcs || []).forEach((n: any) => {
            const team = n.team || (n.source === 'project' ? 'project' : 'npcsh');
            (buckets[team] = buckets[team] || []).push(n);
        });
        const ordered: Array<[string, any[]]> = [];
        teamOrder.forEach(k => { if (buckets[k]?.length) ordered.push([teamLabels[k] || k, buckets[k]]); delete buckets[k]; });
        Object.entries(buckets).forEach(([k, v]) => ordered.push([teamLabels[k] || k, v]));
        return ordered;
    }, [filteredNpcs]);

    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(() => new Set(['Project', 'Incognide', 'npcsh']));
    const toggleTeam = (key: string) => {
        setExpandedTeams(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const filteredJinxes = useMemo(() => {
        if (!jinxSearch.trim()) return jinxesToDisplay || [];
        const q = jinxSearch.toLowerCase();
        return (jinxesToDisplay || []).filter((j: any) =>
            j.name?.toLowerCase().includes(q) ||
            j.group?.toLowerCase().includes(q) ||
            j.description?.toLowerCase().includes(q)
        );
    }, [jinxesToDisplay, jinxSearch]);

    const groupedJinxes = useMemo(() => {
        return (filteredJinxes || []).reduce((acc: any, j: any) => {
            const origin = j.origin || 'unknown';
            const group = j.group || 'root';
            const key = `${origin === 'project' ? '📁' : origin === 'global' ? '🌐' : ''} ${group}`.trim();
            (acc[key] = acc[key] || []).push(j);
            return acc;
        }, {});
    }, [filteredJinxes]);

    if (collapsed) {
        return (
            <div
                className="flex-shrink-0 theme-bg-primary border-l theme-border flex flex-col items-center py-2"
                style={{ width: 28 }}
            >
                <button
                    onClick={() => setCollapsed(false)}
                    className="p-1 hover:bg-white/10 rounded theme-text-muted hover:theme-text-primary"
                    title="Expand right sidebar"
                >
                    <ChevronLeft size={14} />
                </button>
                <button
                    onClick={() => createNewConversation?.()}
                    className="mt-2 p-1 hover:bg-green-500/20 rounded text-green-400"
                    title="New Chat"
                >
                    <MessageSquare size={14} />
                </button>
                <button
                    onClick={() => createNewConversation?.({ contentType: 'agent' })}
                    className="mt-1 p-1 hover:bg-amber-500/20 rounded text-amber-400"
                    title="New Agent"
                >
                    <Bot size={14} />
                </button>
            </div>
        );
    }

    return (
        <div
            className="flex-shrink-0 theme-bg-primary border-l theme-border flex flex-col overflow-hidden relative"
            style={{ width: `${width}px` }}
        >
            <div
                className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
                style={{ backgroundColor: isResizing ? '#3b82f6' : 'transparent' }}
            />

            {/* Top action bar — New Chat / New Agent / Team / Refresh / Collapse */}
            <div className="flex items-center border-b theme-border">
                <button
                    onClick={() => createNewConversation?.()}
                    className="flex-1 flex items-center justify-center py-2 hover:bg-green-500/20 text-green-300 border-r theme-border"
                    title="New Chat"
                >
                    <MessageSquare size={14} />
                </button>
                <button
                    onClick={() => createNewConversation?.({ contentType: 'agent' })}
                    className="flex-1 flex items-center justify-center py-2 hover:bg-amber-500/20 text-amber-300 border-r theme-border"
                    title="New Agent"
                >
                    <Bot size={14} />
                </button>
                <button
                    onClick={() => createTeamManagementPane?.()}
                    className="flex-1 flex items-center justify-center py-2 hover:bg-indigo-500/20 text-indigo-300 border-r theme-border"
                    title="Team Management"
                >
                    <Users size={14} />
                </button>
                <button
                    onClick={() => refreshConversations?.()}
                    className="px-2 py-2 hover:bg-white/10 theme-text-muted hover:theme-text-primary"
                    title="Refresh"
                >
                    <RefreshCw size={12} />
                </button>
                <button
                    onClick={() => setCollapsed(true)}
                    className="px-2 py-2 hover:bg-white/10 theme-text-muted hover:theme-text-primary"
                    title="Collapse right sidebar"
                >
                    <ChevronRight size={12} />
                </button>
            </div>

            {/* Conversations section */}
            <SectionHeader
                label="Conversations"
                color="green"
                count={filteredConvos.length}
                collapsed={convosCollapsed}
                onToggle={() => setConvosCollapsed(!convosCollapsed)}
            />
            {!convosCollapsed && (
                <div className="flex flex-col min-h-0 border-b theme-border" style={{ flex: 2, overflow: 'hidden' }}>
                    <div className="px-2 py-1.5 border-b theme-border flex-shrink-0">
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                            <input
                                type="text"
                                value={convoSearch}
                                onChange={(e) => setConvoSearch(e.target.value)}
                                placeholder="Search conversations..."
                                className="w-full theme-bg-tertiary theme-border border rounded pl-7 pr-6 py-1 text-[11px] theme-text-primary placeholder:opacity-50 focus:outline-none focus:border-green-500/50"
                            />
                            {convoSearch && (
                                <button onClick={() => setConvoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-primary">
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 border-b theme-border text-[9px] flex-shrink-0">
                        <span className="theme-text-muted">Group:</span>
                        {(['time', 'npc', 'model', 'none'] as const).map(g => (
                            <button
                                key={g}
                                onClick={() => setGroupBy(g)}
                                className={`px-1.5 py-0.5 rounded ${groupBy === g ? 'bg-green-500/20 text-green-400' : 'theme-text-muted hover:theme-text-primary'}`}
                            >
                                {g === 'time' ? 'Time' : g === 'npc' ? 'NPC' : g === 'model' ? 'Model' : 'None'}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {Object.entries(groupedConvos).map(([group, convs]: [string, any]) => (
                            <div key={group}>
                                <div className="px-2 py-1 text-[10px] uppercase theme-text-muted bg-black/20 sticky top-0 flex items-center justify-between">
                                    <span>{group}</span>
                                    <span>{convs.length}</span>
                                </div>
                                {convs.map((c: any) => {
                                    const isActive = c.id === activeConversationId;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => onConversationSelect?.(c.id)}
                                            className={`w-full text-left px-2 py-1.5 flex items-start gap-2 border-b theme-border transition-colors ${isActive ? 'bg-green-500/10 border-l-2 border-l-green-500' : 'hover:bg-white/5'}`}
                                        >
                                            <MessageSquare size={12} className={`mt-0.5 flex-shrink-0 ${isActive ? 'text-green-400' : 'theme-text-muted'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] truncate theme-text-primary">{c.title || 'Untitled'}</div>
                                                {c.preview && c.preview !== 'No content' && (
                                                    <div className="text-[9px] truncate theme-text-muted">{c.preview}</div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        {filteredConvos.length === 0 && (
                            <div className="px-2 py-4 text-[11px] theme-text-muted text-center italic">
                                {convoSearch ? `No matches for "${convoSearch}"` : 'No conversations yet'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* NPCs section */}
            <SectionHeader
                label="Personas"
                color="indigo"
                count={filteredNpcs.length}
                collapsed={npcsCollapsed}
                onToggle={() => setNpcsCollapsed(!npcsCollapsed)}
                actions={
                    createTeamManagementPane ? (
                        <button
                            onClick={() => createTeamManagementPane()}
                            className="p-1 mr-1 hover:bg-white/10 rounded text-indigo-400"
                            title="Team Management"
                        >
                            <Users size={11} />
                        </button>
                    ) : null
                }
            />
            {!npcsCollapsed && (
                <div className="flex flex-col min-h-0 border-b theme-border" style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="px-2 py-1.5 border-b theme-border flex-shrink-0">
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                            <input
                                type="text"
                                value={npcSearch}
                                onChange={(e) => setNpcSearch(e.target.value)}
                                placeholder="Search personas..."
                                className="w-full theme-bg-tertiary theme-border border rounded pl-7 pr-6 py-1 text-[11px] theme-text-primary placeholder:opacity-50 focus:outline-none focus:border-indigo-500/50"
                            />
                            {npcSearch && (
                                <button onClick={() => setNpcSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-primary">
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {groupedNpcs.map(([teamLabel, npcs]: [string, any[]]) => {
                            const tExpanded = expandedTeams.has(teamLabel) || !!npcSearch.trim();
                            return (
                                <div key={teamLabel}>
                                    <div
                                        className="px-2 py-1 text-[10px] theme-text-muted bg-black/20 flex items-center gap-1 cursor-pointer hover:bg-white/5"
                                        onClick={() => toggleTeam(teamLabel)}
                                    >
                                        <ChevronRight size={10} className={`transform transition-transform flex-shrink-0 ${tExpanded ? 'rotate-90' : ''}`} />
                                        <span className="truncate flex-1 uppercase">{teamLabel}</span>
                                        <span className="flex-shrink-0">{npcs.length}</span>
                                    </div>
                                    {tExpanded && npcs.map((npc: any) => {
                            const isActive = npc.value === currentNPC;
                            const src = npc.source === 'project' ? '📁' : npc.source === 'global' ? '🌐' : '';
                            const ext = npc.source_ext || '.npc';
                            const key = `${npc.source}-${npc.value}`;
                            const expanded = expandedNpcs.has(key);
                            return (
                                <div key={key} className={`border-b theme-border ${isActive ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''}`}>
                                    <div
                                        className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                                        onClick={() => { toggleNpcExpanded(key); setCurrentNPC?.(npc.value); }}
                                    >
                                        <ChevronRight size={10} className={`transform transition-transform theme-text-muted flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
                                        <Bot size={12} className={`flex-shrink-0 ${isActive ? 'text-indigo-400' : 'theme-text-muted'}`} />
                                        <span className="text-[11px] truncate theme-text-primary flex-1">{npc.name || npc.value}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCurrentNPC?.(npc.value); createNewConversation?.({ contentType: 'chat', npc: npc.value } as any); }}
                                            className="p-0.5 rounded hover:bg-green-500/20 text-green-400 flex-shrink-0"
                                            title={`New chat with ${npc.name || npc.value}`}
                                        >
                                            <MessageSquare size={11} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCurrentNPC?.(npc.value); createNewConversation?.({ contentType: 'agent', npc: npc.value } as any); }}
                                            className="p-0.5 rounded hover:bg-amber-500/20 text-amber-400 flex-shrink-0"
                                            title={`New agent with ${npc.name || npc.value}`}
                                        >
                                            <Bot size={11} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); createTeamManagementPane?.({ npcName: npc.value, tab: 'npcs' }); }}
                                            className="p-0.5 rounded hover:bg-indigo-500/20 text-indigo-400 flex-shrink-0"
                                            title={`Open ${npc.name || npc.value} in editor`}
                                        >
                                            <Users size={11} />
                                        </button>
                                        {npc.source_path && onOpenFile && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onOpenFile(npc.source_path); }}
                                                className="p-0.5 rounded hover:bg-white/10 theme-text-muted hover:theme-text-primary flex-shrink-0"
                                                title={`Open ${npc.source_path}`}
                                            >
                                                <FileCode size={11} />
                                            </button>
                                        )}
                                        <span className={`text-[9px] px-1 rounded flex-shrink-0 ${ext === '.md' ? 'bg-blue-500/20 text-blue-300' : 'bg-indigo-500/20 text-indigo-300'}`} title={npc.source_path || ''}>
                                            {ext}
                                        </span>
                                    </div>
                                    {expanded && (
                                        <div className="px-3 pb-2 pt-1 space-y-1.5 bg-black/10" onClick={(e) => e.stopPropagation()}>
                                            {npc.primary_directive && (
                                                <div className="text-[10px] theme-text-muted whitespace-pre-wrap max-h-24 overflow-y-auto">
                                                    {npc.primary_directive.length > 300 ? npc.primary_directive.slice(0, 300) + '…' : npc.primary_directive}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1">
                                                <label className="text-[9px] theme-text-muted w-14">Model:</label>
                                                <select
                                                    value={npc.model || ''}
                                                    onChange={(e) => onNpcSave?.(npc, { model: e.target.value })}
                                                    className="flex-1 text-[10px] theme-bg-tertiary theme-border border rounded px-1 py-0.5 theme-text-primary"
                                                >
                                                    <option value="">(inherit)</option>
                                                    {(availableModels || []).map((m: any) => (
                                                        <option key={m.value} value={m.value}>{m.display_name || m.value}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <label className="text-[9px] theme-text-muted w-14">Provider:</label>
                                                <select
                                                    value={npc.provider || ''}
                                                    onChange={(e) => onNpcSave?.(npc, { provider: e.target.value })}
                                                    className="flex-1 text-[10px] theme-bg-tertiary theme-border border rounded px-1 py-0.5 theme-text-primary"
                                                >
                                                    <option value="">(inherit)</option>
                                                    {(availableProviders || []).map((p: string) => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="text-[10px]">
                                                <div className="theme-text-muted mb-0.5">Jinxes ({(npc.jinxes || []).length}):</div>
                                                <div className="flex flex-wrap gap-1 mb-1">
                                                    {(npc.jinxes || []).map((j: any, i: number) => {
                                                        const jName = typeof j === 'string' ? j : (j?.name || '?');
                                                        return (
                                                            <span key={i} className="inline-flex items-center gap-0.5 pl-1 pr-0.5 bg-amber-500/10 text-amber-300 rounded text-[9px]">
                                                                {jName}
                                                                <button
                                                                    onClick={() => {
                                                                        const next = (npc.jinxes || []).filter((_: any, idx: number) => idx !== i);
                                                                        onNpcSave?.(npc, { jinxes: next });
                                                                    }}
                                                                    className="text-amber-300 hover:text-red-400"
                                                                    title={`Remove ${jName}`}
                                                                >
                                                                    <X size={8} />
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        if (!v) return;
                                                        const cur = (npc.jinxes || []).map((j: any) => typeof j === 'string' ? j : (j?.name || ''));
                                                        if (cur.includes(v)) return;
                                                        onNpcSave?.(npc, { jinxes: [...cur, v] });
                                                    }}
                                                    className="w-full text-[10px] theme-bg-tertiary theme-border border rounded px-1 py-0.5 theme-text-primary"
                                                >
                                                    <option value="">+ add jinx…</option>
                                                    {(jinxesToDisplay || []).map((j: any) => {
                                                        const cur = (npc.jinxes || []).map((x: any) => typeof x === 'string' ? x : (x?.name || ''));
                                                        if (cur.includes(j.name)) return null;
                                                        return <option key={`${j.origin || ''}-${j.name}`} value={j.name}>{j.name}{j.group ? ` (${j.group})` : ''}</option>;
                                                    })}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                                </div>
                            );
                        })}
                        {filteredNpcs.length === 0 && (
                            <div className="px-2 py-4 text-[11px] theme-text-muted text-center italic">
                                {npcSearch ? `No matches for "${npcSearch}"` : 'No personas'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Jinxes & Skills section */}
            <SectionHeader
                label="Jinxes & Skills"
                color="amber"
                count={filteredJinxes.length}
                collapsed={jinxesCollapsed}
                onToggle={() => setJinxesCollapsed(!jinxesCollapsed)}
            />
            {!jinxesCollapsed && (
                <div className="flex flex-col min-h-0 border-b theme-border" style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="px-2 py-1.5 border-b theme-border flex-shrink-0">
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                            <input
                                type="text"
                                value={jinxSearch}
                                onChange={(e) => setJinxSearch(e.target.value)}
                                placeholder="Search jinxes..."
                                className="w-full theme-bg-tertiary theme-border border rounded pl-7 pr-6 py-1 text-[11px] theme-text-primary placeholder:opacity-50 focus:outline-none focus:border-amber-500/50"
                            />
                            {jinxSearch && (
                                <button onClick={() => setJinxSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-primary">
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {Object.entries(groupedJinxes).map(([group, jinxes]: [string, any]) => {
                            const gExpanded = expandedJinxGroups.has(group) || !!jinxSearch.trim();
                            return (
                                <div key={group}>
                                    <div
                                        className="px-2 py-1 text-[10px] theme-text-muted bg-black/20 flex items-center gap-1 cursor-pointer hover:bg-white/5"
                                        onClick={() => toggleJinxGroup(group)}
                                    >
                                        <ChevronRight size={10} className={`transform transition-transform flex-shrink-0 ${gExpanded ? 'rotate-90' : ''}`} />
                                        <span className="truncate flex-1 uppercase">{group}</span>
                                        <span className="flex-shrink-0">{jinxes.length}</span>
                                    </div>
                                    {gExpanded && jinxes.map((j: any) => (
                                        <details key={`${j.origin || ''}-${j.name}`} className="border-b theme-border last:border-b-0">
                                            <summary className="px-2 py-1 flex items-center gap-2 cursor-pointer hover:bg-white/5 pl-5" title={j.description || ''}>
                                                <Zap size={11} className="text-amber-400 flex-shrink-0" />
                                                <span className="text-[11px] truncate theme-text-primary flex-1">{j.name}</span>
                                            </summary>
                                            {j.description && (
                                                <div className="px-3 pl-8 pb-1.5 text-[10px] theme-text-muted whitespace-pre-wrap max-h-20 overflow-y-auto">
                                                    {j.description}
                                                </div>
                                            )}
                                        </details>
                                    ))}
                                </div>
                            );
                        })}
                        {filteredJinxes.length === 0 && (
                            <div className="px-2 py-4 text-[11px] theme-text-muted text-center italic">
                                {jinxSearch ? `No matches for "${jinxSearch}"` : 'No jinxes'}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default RightSidebar;
