import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, Sparkles, Bot, ChevronDown, Plus, Star, MessageSquare, Globe, GripVertical } from 'lucide-react';
import { useAiEnabled } from './AiFeatureContext';

const KNOWN_AGENTS = ['npcsh', 'opencode', 'nanocoder', 'gemini', 'claude', 'codex', 'qwen', 'hermes', 'pi'];

interface TerminalCreateButtonProps {
    createNewTerminal?: (shellType: string) => void;
    createNewConversation?: (opts?: { contentType?: 'chat' | 'agent'; npc?: string; model?: string }) => void;
    createNewBrowser?: (url?: string) => void;
}

type ActionKind = 'conversation' | 'terminal' | 'browser';

interface Action {
    id: string;
    label: string;
    kind: ActionKind;
    installed?: boolean;
}

const QUICK_ACTIONS_KEY = 'incognide_quickActions';
const DEFAULT_TERMINAL_TYPE_KEY = 'incognide_defaultNewTerminalType';
const CUSTOM_AGENTS_KEY = 'incognide_terminalAgents';

const loadCustomAgents = (): Array<{ name: string; command: string }> => {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_AGENTS_KEY) || '[]');
    } catch {
        return [];
    }
};

const loadQuickActions = (): string[] => {
    try {
        const saved = localStorage.getItem(QUICK_ACTIONS_KEY);
        if (saved) return JSON.parse(saved);
    } catch {}
    const legacy = localStorage.getItem(DEFAULT_TERMINAL_TYPE_KEY);
    return legacy ? [legacy] : ['system'];
};

const AI_ONLY_ACTIONS = new Set(['chat', 'agent', 'npcsh', 'guac']);

const TerminalCreateButton: React.FC<TerminalCreateButtonProps> = ({ createNewTerminal, createNewConversation, createNewBrowser }) => {
    const aiEnabled = useAiEnabled();
    const [quickActions, setQuickActions] = useState<string[]>(() => {
        const saved = loadQuickActions();
        return aiEnabled ? saved : saved.filter(id => !AI_ONLY_ACTIONS.has(id));
    });
    const [terminalDropdownOpen, setTerminalDropdownOpen] = useState(false);
    const [installedAgents, setInstalledAgents] = useState<Record<string, boolean>>({});
    const [customAgents, setCustomAgents] = useState<Array<{ name: string; command: string }>>(loadCustomAgents);
    const [showAddAgentPrompt, setShowAddAgentPrompt] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [newAgentCommand, setNewAgentCommand] = useState('');
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const quickActionsInitialized = useRef(!!localStorage.getItem(QUICK_ACTIONS_KEY));

    useEffect(() => {
        localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(quickActions));
        const first = quickActions[0];
        if (first) {
            localStorage.setItem(DEFAULT_TERMINAL_TYPE_KEY, first);
            window.dispatchEvent(new CustomEvent('defaultTerminalTypeChanged', { detail: first }));
        }
    }, [quickActions]);

    useEffect(() => {
        if (aiEnabled) return;
        setQuickActions(prev => {
            const filtered = prev.filter(id => !AI_ONLY_ACTIONS.has(id));
            return filtered.length ? filtered : ['system'];
        });
    }, [aiEnabled]);

    useEffect(() => {
        (async () => {
            try {
                const data = await (window as any).api.loadGlobalSettings();
                const globalDefault = data?.global_settings?.default_new_terminal_type;
                if (globalDefault && !quickActionsInitialized.current) {
                    setQuickActions([globalDefault]);
                    localStorage.setItem(DEFAULT_TERMINAL_TYPE_KEY, globalDefault);
                }
            } catch (err) {
                console.error('Failed to load default terminal type:', err);
            }
        })();

        const handleTerminalTypeChanged = (e: CustomEvent) => {
            if (e.detail && !quickActionsInitialized.current) {
                setQuickActions([e.detail]);
            }
        };
        window.addEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
        return () => {
            window.removeEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!terminalDropdownOpen) return;
        (async () => {
            try {
                const agents = loadCustomAgents();
                setCustomAgents(agents);
                const allCmds = [...KNOWN_AGENTS, ...agents.map((a: any) => a.command)];
                const r = await (window as any).api?.checkBinaries?.(allCmds);
                setInstalledAgents(r || {});
            } catch {}
        })();
    }, [terminalDropdownOpen]);

    useEffect(() => {
        if (!terminalDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setTerminalDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [terminalDropdownOpen]);

    const fixedActions: Action[] = useMemo(() => {
        const actions: Action[] = [];
        if (aiEnabled) {
            actions.push({ id: 'chat', label: 'Chat', kind: 'conversation' });
            actions.push({ id: 'agent', label: 'Agent', kind: 'conversation' });
        }
        actions.push({ id: 'browser', label: 'Browser', kind: 'browser' });
        actions.push({ id: 'system', label: 'Bash', kind: 'terminal' });
        if (aiEnabled) {
            actions.push({ id: 'npcsh', label: 'npcsh', kind: 'terminal' });
            actions.push({ id: 'guac', label: 'guac', kind: 'terminal' });
        }
        return actions;
    }, [aiEnabled]);

    const allActions = useMemo(() => {
        const actions = [...fixedActions];
        if (aiEnabled) {
            for (const cmd of KNOWN_AGENTS) {
                if (installedAgents[cmd]) {
                    actions.push({ id: cmd, label: cmd, kind: 'terminal', installed: true });
                }
            }
            for (const agent of customAgents) {
                if (installedAgents[agent.command]) {
                    actions.push({ id: agent.command, label: agent.name, kind: 'terminal', installed: true });
                }
            }
        }
        return actions;
    }, [fixedActions, installedAgents, customAgents, aiEnabled]);

    const actionById = useMemo(() => {
        const map = new Map<string, Action>();
        for (const a of allActions) map.set(a.id, a);
        return map;
    }, [allActions]);

    const openAction = (id: string) => {
        const action = actionById.get(id);
        if (!action) return;
        if (action.kind === 'conversation') {
            createNewConversation?.({ contentType: action.id as 'chat' | 'agent' });
        } else if (action.kind === 'browser') {
            createNewBrowser?.();
        } else {
            createNewTerminal?.(action.id);
        }
    };

    const toggleQuickAction = (id: string) => {
        quickActionsInitialized.current = true;
        setQuickActions(prev => {
            const next = prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id];
            return next;
        });
    };

    const getActionIcon = (id: string, size: number = 18, className?: string) => {
        const action = actionById.get(id);
        const colorClass = className || '';
        switch (id) {
            case 'chat': return <MessageSquare size={size} className={`text-blue-400 ${colorClass}`} />;
            case 'agent': return <Bot size={size} className={`text-orange-400 ${colorClass}`} />;
            case 'browser': return <Globe size={size} className={`text-cyan-400 ${colorClass}`} />;
            case 'system': return <Terminal size={size} className={`text-green-400 ${colorClass}`} />;
            case 'npcsh': return <Sparkles size={size} className={`text-purple-400 ${colorClass}`} />;
            default: return <Terminal size={size} className={`text-cyan-400 ${colorClass}`} />;
        }
    };

    const primaryActionId = quickActions[0] || 'system';
    const primaryAction = actionById.get(primaryActionId);
    const extraQuickActions = quickActions.slice(1).filter(id => actionById.has(id));

    const itemClass = (isPinned: boolean, isDragOver?: boolean) =>
        `flex items-center gap-2 px-2 py-1 w-full text-left theme-hover text-xs ${isPinned ? 'bg-green-900/30 text-green-300' : 'theme-text-primary'} ${isDragOver ? 'ring-1 ring-inset ring-blue-400/50' : ''}`;

    return (
        <div ref={wrapperRef} className="relative flex items-center" data-dropdown="terminal" data-tutorial="terminal-button">
            <button
                onClick={() => openAction(primaryActionId)}
                className="p-2 rounded transition-colors hover:opacity-80 bg-transparent hover:bg-teal-500/20 relative"
                title={`New ${primaryAction?.label || primaryActionId}`}
            >
                {getActionIcon(primaryActionId, 18)}
            </button>
            {extraQuickActions.map(id => {
                const action = actionById.get(id);
                return (
                    <button
                        key={id}
                        onClick={() => openAction(id)}
                        className="p-1.5 rounded transition-colors hover:opacity-80 bg-transparent hover:bg-teal-500/20"
                        title={`New ${action?.label || id}`}
                    >
                        {getActionIcon(id, 14)}
                    </button>
                );
            })}
            <button
                onClick={(e) => { e.stopPropagation(); setTerminalDropdownOpen(!terminalDropdownOpen); }}
                className="flex items-center justify-center hover:bg-teal-500/20 rounded transition-colors p-0.5"
                title="More quick actions"
            >
                <ChevronDown size={9} className="text-gray-500" />
            </button>
            {terminalDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 theme-bg-secondary border theme-border rounded shadow-xl z-[9999] py-1 min-w-[180px]">
                    <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase flex justify-between">
                        <span>Right-click to pin, drag to reorder</span>
                        <span>⭐ pinned</span>
                    </div>
                    {allActions.map((action) => {
                        const pinned = quickActions.includes(action.id);
                        const canDrag = pinned && quickActions.length > 1;
                        return (
                            <button
                                key={action.id}
                                draggable={canDrag}
                                onDragStart={(e) => {
                                    if (!canDrag) {
                                        e.preventDefault();
                                        return;
                                    }
                                    setDraggingId(action.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', action.id);
                                }}
                                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                                onDragOver={(e) => {
                                    if (!canDrag || draggingId === action.id) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    setDragOverId(action.id);
                                }}
                                onDragLeave={() => setDragOverId(null)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const fromId = draggingId || e.dataTransfer.getData('text/plain');
                                    const toId = action.id;
                                    if (!fromId || fromId === toId || !quickActions.includes(fromId) || !quickActions.includes(toId)) {
                                        setDragOverId(null);
                                        return;
                                    }
                                    setQuickActions(prev => {
                                        const fromIndex = prev.indexOf(fromId);
                                        const toIndex = prev.indexOf(toId);
                                        if (fromIndex === -1 || toIndex === -1) return prev;
                                        const next = prev.filter(id => id !== fromId);
                                        next.splice(toIndex, 0, fromId);
                                        return next;
                                    });
                                    setDragOverId(null);
                                    setDraggingId(null);
                                }}
                                onClick={() => { openAction(action.id); setTerminalDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); toggleQuickAction(action.id); }}
                                className={itemClass(pinned, dragOverId === action.id)}
                            >
                                {canDrag && <GripVertical size={11} className="text-gray-500 cursor-grab active:cursor-grabbing" />}
                                {getActionIcon(action.id, 11)}
                                <span>{action.label}</span>
                                {pinned && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                        );
                    })}
                    <div className="border-t theme-border my-0.5" />
                    {!showAddAgentPrompt ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowAddAgentPrompt(true); }}
                            className="flex items-center gap-2 px-2 py-1 w-full text-left theme-hover text-xs text-blue-400"
                        >
                            <Plus size={11} /><span>Add custom agent...</span>
                        </button>
                    ) : (
                        <div className="p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                            <input type="text" placeholder="Name" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full px-1.5 py-0.5 text-xs theme-bg-primary border theme-border rounded" />
                            <input type="text" placeholder="Command (binary name)" value={newAgentCommand} onChange={e => setNewAgentCommand(e.target.value)} className="w-full px-1.5 py-0.5 text-xs theme-bg-primary border theme-border rounded" />
                            <div className="flex gap-1">
                                <button
                                    onClick={async () => {
                                        if (!newAgentName || !newAgentCommand) return;
                                        try {
                                            const existing = JSON.parse(localStorage.getItem(CUSTOM_AGENTS_KEY) || '[]');
                                            const updated = [...existing.filter((a: any) => a.command !== newAgentCommand), { name: newAgentName, command: newAgentCommand }];
                                            localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(updated));
                                            setCustomAgents(updated);
                                            const r = await (window as any).api?.checkBinaries?.([newAgentCommand]);
                                            setInstalledAgents(prev => ({ ...prev, ...(r || {}) }));
                                        } catch {}
                                        setNewAgentName(''); setNewAgentCommand(''); setShowAddAgentPrompt(false);
                                    }}
                                    className="flex-1 px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded"
                                >Add</button>
                                <button onClick={() => { setNewAgentName(''); setNewAgentCommand(''); setShowAddAgentPrompt(false); }} className="px-2 py-0.5 text-[10px] theme-bg-tertiary rounded">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TerminalCreateButton;
