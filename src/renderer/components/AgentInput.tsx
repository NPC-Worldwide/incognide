import { getFileName } from './utils';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BACKEND_URL } from '../config';
import {
    Send, Paperclip, Maximize2, FolderTree, Minimize2, Mic, MicOff, Volume2, GitBranch, Save, Trash2, Zap, X, RefreshCw,
    FileCode, Globe, FileText, Terminal as TerminalIcon, Eye, EyeOff, ToggleLeft, ToggleRight,
    Database, BrainCircuit, Image, Bot, Users, Music, Search, BookOpen, Folder, HardDrive, HelpCircle, Clock, Settings, MessageSquare, Tag,
    ChevronDown
} from 'lucide-react';
import ContextFilesPanel from './ContextFilesPanel';
import ContextUsageMeter from './ContextUsageMeter';
import { computeContextUsage, findContextWindow } from '../utils/contextUsage';
import ModelSelector from './ModelSelector';

const getMcpServerDisplayName = (serverPath: string): string => {
    const teamMatch = serverPath.match(/--team\s+(.+)$/);
    if (teamMatch) {
        const teamPath = teamMatch[1].trim().replace(/\/$/, '');
        const parts = teamPath.split('/');
        const last = parts[parts.length - 1];
        if (last === 'npc_team' || last.endsWith('_team')) {
            const parent = parts[parts.length - 2] || last;
            return `${parent} ${last}`.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    if (serverPath.startsWith('npx ') || serverPath.startsWith('uvx ')) {
        const parts = serverPath.split(/\s+/);
        const pkg = parts[parts.length - 1];
        return pkg.replace(/@.*\//, '').replace(/^server-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return getFileName(serverPath)?.replace(/\.py$/, '') || serverPath;
};

const getParamColor = (value: number, min: number, max: number): string => {

    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

    if (t <= 0.5) {

        const factor = t * 2;
        const r = Math.round(59 + (255 - 59) * factor);
        const g = Math.round(130 + (255 - 130) * factor);
        const b = Math.round(246 + (255 - 246) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    } else {

        const factor = (t - 0.5) * 2;
        const r = Math.round(255 + (239 - 255) * factor);
        const g = Math.round(255 + (68 - 255) * factor);
        const b = Math.round(255 + (68 - 255) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    }
};

interface AgentInputProps {
    paneId: string;

    inputHeight: number;
    setInputHeight: (val: number) => void;
    isResizingInput: boolean;
    setIsResizingInput: (val: boolean) => void;

    isStreaming: boolean;
    handleInputSubmit: (e: any, options?: { voiceInput?: boolean; disableThinking?: boolean; genParams?: { temperature: number; top_p?: number; top_k: number; max_tokens: number }; inputText?: string; uploadedFiles?: any[]; mcpServerPaths?: string[]; selectedMcpTools?: string[]; contextFiles?: any[]; paneId?: string }) => void;
    handleInterruptStream: () => void;
    currentPath: string;

    autoIncludeContext: boolean;
    setAutoIncludeContext: (val: boolean) => void;
    contextPaneOverrides: Record<string, boolean>;
    setContextPaneOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    contentDataRef: React.MutableRefObject<any>;
    paneVersion?: number;
    paneUpdateEmitter?: EventTarget;

    executionMode: string;
    setExecutionMode: (val: string) => void;
    selectedJinx: any;
    setSelectedJinx: (val: any) => void;
    jinxInputValues: any;
    setJinxInputValues: (fn: any) => void;
    jinxesToDisplay: any[];
    showJinxDropdown: boolean;
    setShowJinxDropdown: (val: boolean) => void;

    availableModels: any[];
    modelsLoading: boolean;
    modelsError: any;
    currentModel: string;
    setCurrentModel: (val: string) => void;
    currentProvider: string;
    setCurrentProvider: (val: string) => void;
    favoriteModels: Set<string>;
    toggleFavoriteModel: (val: string) => void;
    showAllModels: boolean;
    setShowAllModels: (val: boolean) => void;
    modelsToDisplay: any[];
    ollamaToolModels: Set<string>;
    setError: (val: string) => void;

    availableNPCs: any[];
    setAvailableNPCs?: (npcs: any[]) => void;
    npcsLoading: boolean;
    setNpcsLoading?: (loading: boolean) => void;
    npcsError: any;
    setNpcsError?: (error: string | null) => void;
    setTeamConfigs?: (configs: Record<string, any>) => void;
    setPendingAddedModels?: (models: string[]) => void;
    userModelsConfig?: { providers: any[] };
    reloadUserModelsConfig?: () => void;
    currentNPC: string;
    setCurrentNPC: (val: string) => void;

    selectedModels: string[];
    setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>;
    selectedNPCs: string[];
    setSelectedNPCs: React.Dispatch<React.SetStateAction<string[]>>;

    broadcastMode: boolean;
    setBroadcastMode: (val: boolean) => void;

    availableMcpServers: any[];
    enabledMcpServers: string[];

    activeConversationId: string | null;

    onFocus?: () => void;

    onOpenFile?: (path: string) => void;

    onBroadcast?: (models: string[], npcs: string[], inputText?: string, files?: any[]) => void;
}

interface NPCDropdownProps {
    availableNPCs: any[];
    selectedNPCs: string[];
    onChangeSelected: (next: string[]) => void;
    currentNPC: string;
    onSelectCurrent: (npc: string) => void;
    loading?: boolean;
    error?: any;
    broadcastMode?: boolean;
    onToggleBroadcast?: () => void;
    onOpen?: () => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const NPCDropdown: React.FC<NPCDropdownProps> = ({
    availableNPCs,
    selectedNPCs,
    onChangeSelected,
    currentNPC,
    onSelectCurrent,
    loading = false,
    error = null,
    broadcastMode = false,
    onToggleBroadcast,
    onOpen,
    placeholder = 'Agent',
    className = '',
    disabled = false,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filteredNPCs = useMemo(() => {
        if (!search.trim()) return availableNPCs;
        const q = search.toLowerCase();
        return availableNPCs.filter((n: any) =>
            (n.display_name || n.value || '').toLowerCase().includes(q)
        );
    }, [availableNPCs, search]);

    const label = loading ? '...' : error ? 'Error' :
        selectedNPCs.length === 1
            ? ((availableNPCs.find((n: any) => n.value === selectedNPCs[0])?.display_name || selectedNPCs[0]).split(' | ')[0])
            : selectedNPCs.length === 0
                ? placeholder
                : `${selectedNPCs.length} agents`;

    useEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        setSearch('');
        setTimeout(() => searchRef.current?.focus(), 50);
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) {
            setPos({
                bottom: window.innerHeight - rect.top + 4,
                left: rect.left,
                width: rect.width,
            });
        }
        const onResize = () => {
            const r = wrapperRef.current?.getBoundingClientRect();
            if (r) setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggleNpc = (value: string) => {
        if (broadcastMode) {
            const next = selectedNPCs.includes(value)
                ? selectedNPCs.filter((v) => v !== value)
                : [...selectedNPCs, value];
            onChangeSelected(next.length ? next : [currentNPC || value]);
            if (!selectedNPCs.includes(value)) onSelectCurrent(value);
        } else {
            onChangeSelected([value]);
            onSelectCurrent(value);
            setOpen(false);
        }
    };

    const selectAll = () => {
        onChangeSelected(filteredNPCs.map((n: any) => n.value));
    };

    const reset = () => {
        onChangeSelected([]);
    };

    const sourceIcon = (source?: string) => {
        if (source === 'project') return '📁';
        if (source === 'global') return '🌐';
        return '';
    };

    const dropdown = open && !loading && !error && pos && (
        <div
            className="npc-agent-selector-dropdown fixed z-[100] theme-bg-primary backdrop-blur-xl theme-border border rounded-lg shadow-2xl overflow-hidden"
            style={{ bottom: pos.bottom, left: pos.left, width: Math.max(pos.width, 256) }}
        >
            <div className="px-2 py-1.5 border-b theme-border">
                <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search agents..."
                    className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
            <div className="px-2 py-1 border-b theme-border flex items-center justify-between">
                {onToggleBroadcast && (
                    <button
                        onClick={onToggleBroadcast}
                        className={`text-[9px] px-1.5 py-0.5 rounded ${broadcastMode ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                    >
                        {broadcastMode ? '● Multi' : '○ Single'}
                    </button>
                )}
                <div className="flex gap-2 ml-auto">
                    {broadcastMode && <button onClick={selectAll} className="text-[9px] text-green-400 hover:text-green-300">All</button>}
                    <button onClick={reset} className="text-[9px] text-gray-400 hover:text-gray-300">Reset</button>
                </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
                {filteredNPCs.map((npc: any) => {
                    const value = npc.value;
                    const checked = selectedNPCs.includes(value);
                    return (
                        <div
                            key={`${npc.source || 'npc'}-${value}`}
                            className={`px-2 py-1.5 text-xs rounded cursor-pointer flex items-center gap-2 transition-all ${checked ? 'bg-green-500/20 text-green-200' : 'hover:bg-white/5'}`}
                            onClick={() => toggleNpc(value)}
                        >
                            <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
                                {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="truncate flex-1">{npc.display_name || value}</span>
                            <span className="text-[9px] text-gray-600 flex-shrink-0">{sourceIcon(npc.source)}</span>
                        </div>
                    );
                })}
                {filteredNPCs.length === 0 && (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">No agents found</div>
                )}
            </div>
        </div>
    );

    return (
        <div ref={wrapperRef} className={`relative flex-1 min-w-0 ${className}`}>
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled || loading || !!error}
                onClick={() => {
                    if (!open) onOpen?.();
                    setOpen((v) => !v);
                }}
                className={`w-full h-7 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-200 border px-2 ${
                    selectedNPCs.length > 1
                        ? 'bg-gradient-to-br from-green-500/30 to-emerald-600/30 text-green-200 border-green-400/40'
                        : 'theme-bg-secondary theme-text-secondary theme-border theme-hover'
                }`}
            >
                {selectedNPCs.length > 1 && (
                    <span className="w-4 h-4 rounded bg-green-500 text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">{selectedNPCs.length}</span>
                )}
                {selectedNPCs.length <= 1 && <Bot size={12} className="flex-shrink-0 opacity-70" />}
                <span className="truncate">{label}</span>
                <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>
            {dropdown && createPortal(dropdown, document.body)}
        </div>
    );
};

const AgentInput: React.FC<AgentInputProps> = (props) => {
    const {
        paneId,
        inputHeight, setInputHeight,
        isResizingInput, setIsResizingInput,
        isStreaming, handleInputSubmit, handleInterruptStream,
        currentPath,
        autoIncludeContext, setAutoIncludeContext,
        contextPaneOverrides, setContextPaneOverrides, contentDataRef, paneVersion,
        executionMode, setExecutionMode, selectedJinx, setSelectedJinx,
        jinxInputValues, setJinxInputValues, jinxesToDisplay,
        showJinxDropdown, setShowJinxDropdown,
        availableModels, modelsLoading, modelsError, currentModel, setCurrentModel,
        currentProvider, setCurrentProvider, favoriteModels, toggleFavoriteModel,
        showAllModels, setShowAllModels, modelsToDisplay, ollamaToolModels, setError,
        currentNPC, setCurrentNPC,
        availableNPCs, setAvailableNPCs, npcsLoading, setNpcsLoading, npcsError, setNpcsError, setTeamConfigs, setPendingAddedModels,
        userModelsConfig, reloadUserModelsConfig,
        selectedModels, setSelectedModels, selectedNPCs, setSelectedNPCs,
        broadcastMode, setBroadcastMode,
        availableMcpServers, enabledMcpServers,
        activeConversationId, onFocus, onOpenFile, onBroadcast,
        paneUpdateEmitter
    } = props;

    const [isHovering, setIsHovering] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingError, setRecordingError] = useState<string | null>(null);
    const [usedVoiceInput, setUsedVoiceInput] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const mcpDropdownRef = useRef<HTMLDivElement>(null);

    const [localInput, setLocalInput] = useState(() => {
        try { return contentDataRef?.current?.[paneId]?.localInput || ''; } catch { return ''; }
    });
    useEffect(() => {
        try { setLocalInput(contentDataRef?.current?.[paneId]?.localInput || ''); } catch {}
    }, [paneId]);
    useEffect(() => {
        try {
            if (contentDataRef?.current?.[paneId]) {
                contentDataRef.current[paneId].localInput = localInput;
            }
        } catch {}
    }, [localInput, paneId]);
    useEffect(() => {
        if (!paneUpdateEmitter) return;
        const handlePaneUpdate = (e: any) => {
            if (e.detail?.paneId === paneId || e.detail?.paneId === 'all') {
                const refInput = contentDataRef?.current?.[paneId]?.localInput;
                if (refInput !== undefined && refInput !== localInput) {
                    setLocalInput(refInput);
                }
            }
        };
        paneUpdateEmitter.addEventListener('pane-update', handlePaneUpdate);
        return () => paneUpdateEmitter.removeEventListener('pane-update', handlePaneUpdate);
    }, [paneUpdateEmitter, paneId, localInput]);

    // ---- Context usage meter -------------------------------------------------
    // Numerator: the provider-reported `input_tokens` of the most recent prompt
    // (system prompt + context files + history). Falls back to a chars/4 estimate
    // only when no provider reported usage. Denominator comes from the model
    // catalog; when unknown the meter reports tokens-used without a ratio.
    const [ctxUsage, setCtxUsage] = useState<{ used: number | null; source: 'reported' | 'estimated' | 'none' }>({ used: null, source: 'none' });
    const [msgCount, setMsgCount] = useState(0);
    const ctxLimit = useMemo(
        () => findContextWindow(currentModel, availableModels, modelsToDisplay),
        [currentModel, availableModels, modelsToDisplay]
    );
    // ---- Context compression -------------------------------------------------
    // Non-destructive: the main process records a cutoff plus an LLM-written
    // summary, and the original rows stay in the database. Both the message
    // list and the payload sent to the model are rebuilt through that summary.
    const [isCompressing, setIsCompressing] = useState(false);

    useEffect(() => {
        const recompute = () => {
            let messages: any[] = [];
            try { messages = contentDataRef?.current?.[paneId]?.chatMessages?.messages || []; } catch {}
            setCtxUsage(computeContextUsage(messages));
            setMsgCount(messages.length);
        };
        recompute();
        if (!paneUpdateEmitter) return;
        const handler = (e: any) => {
            if (e.detail?.paneId === paneId || e.detail?.paneId === 'all') recompute();
        };
        paneUpdateEmitter.addEventListener('pane-update', handler);
        return () => paneUpdateEmitter.removeEventListener('pane-update', handler);
    }, [paneUpdateEmitter, paneId, contentDataRef, paneVersion, isStreaming, isCompressing]);
    const [compressError, setCompressError] = useState<string | null>(null);
    const [compressInstructions, setCompressInstructions] = useState<string>(() => {
        try { return localStorage.getItem(`incognide-compress-instructions-${activeConversationId}`) || ''; } catch { return ''; }
    });

    useEffect(() => {
        if (!activeConversationId) { setCompressInstructions(''); return; }
        try {
            const stored = localStorage.getItem(`incognide-compress-instructions-${activeConversationId}`) || '';
            setCompressInstructions(stored);
        } catch {}
    }, [activeConversationId, paneId, paneVersion]);

    const handleSetCompressInstructions = (value: string) => {
        setCompressInstructions(value);
        try {
            if (activeConversationId) {
                localStorage.setItem(`incognide-compress-instructions-${activeConversationId}`, value);
            }
        } catch {}
    };

    const visibleMessageSlice = (allMessages: any[], count: number) => {
        if (!Array.isArray(allMessages) || allMessages.length === 0) return [];
        const markerIdxs: number[] = [];
        for (let i = 0; i < allMessages.length; i++) {
            if (allMessages[i]?.isCompression || allMessages[i]?.isCompressionIndicator || allMessages[i]?.parent_message_id) {
                markerIdxs.push(i);
            }
        }
        console.log(`[visibleMessageSlice] paneId=${paneId} total=${allMessages.length} count=${count} markerIdxs=${JSON.stringify(markerIdxs)} markerIds=${JSON.stringify(markerIdxs.map((i) => allMessages[i]?.message_id || allMessages[i]?.id))}`);
        if (markerIdxs.length === 0) {
            const result = allMessages.slice(-count);
            console.log(`[visibleMessageSlice] no markers -> tail ${result.length}`);
            return result;
        }
        const latestMarkerIdx = markerIdxs[markerIdxs.length - 1];
        const naturalStart = Math.max(0, allMessages.length - count);
        if (latestMarkerIdx >= naturalStart) {
            const result = allMessages.slice(-count);
            console.log(`[visibleMessageSlice] latestMarker in window -> tail ${result.length} ids=${JSON.stringify(result.map((m) => m?.message_id || m?.id))}`);
            return result;
        }
        const kept = new Set<number>();
        for (const idx of markerIdxs) {
            if (idx < naturalStart) kept.add(idx);
        }
        const tailStart = Math.max(latestMarkerIdx + 1, allMessages.length - Math.max(1, count - kept.size));
        for (let i = tailStart; i < allMessages.length; i++) kept.add(i);
        const result = Array.from(kept).sort((a, b) => a - b).map((i) => allMessages[i]);
        console.log(`[visibleMessageSlice] kept markers + tail -> ${result.length} ids=${JSON.stringify(result.map((m) => m?.message_id || m?.id))}`);
        return result;
    };

    const reloadPaneMessages = async () => {
        const conversationId = resolveConversationId();
        console.log(`[reloadPaneMessages] paneId=${paneId} conversationId=${conversationId}`);
        if (!conversationId) return;
        try {
            const msgs = await (window as any).api?.getConversationMessages?.(conversationId);
            console.log(`[reloadPaneMessages] fetched ${msgs?.length} messages raw=${JSON.stringify(msgs?.slice(-3).map((m: any) => ({ id: m.message_id || m.id, role: m.role, parent: m.parent_message_id })))}`);
            const pd = contentDataRef?.current?.[paneId];
            if (pd && Array.isArray(msgs)) {
                const formatted = msgs.map((m: any) => ({ ...m, id: m.message_id || m.id }));
                if (!pd.chatMessages) pd.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
                pd.chatMessages.allMessages = formatted;
                pd.chatMessages.messages = visibleMessageSlice(formatted, pd.chatMessages.displayedMessageCount || 20);
                console.log(`[reloadPaneMessages] ${conversationId}: total=${formatted.length}, visible=${pd.chatMessages.messages.length}, visibleIds=${JSON.stringify(pd.chatMessages.messages.map((m: any) => m?.message_id || m?.id))}`);
                paneUpdateEmitter?.dispatchEvent(new CustomEvent('pane-update', { detail: { paneId } }));
                console.log(`[reloadPaneMessages] dispatched pane-update for ${paneId}`);
            } else {
                console.log(`[reloadPaneMessages] skipped pd=${!!pd} Array.isArray(msgs)=${Array.isArray(msgs)}`);
            }
        } catch (e) {
            console.error('[Compression] Failed to reload messages:', e);
        }
    };

    const updateCompressionIndicator = (show: boolean) => {
        const conversationId = resolveConversationId();
        if (!conversationId) return;
        const pd = contentDataRef?.current?.[paneId];
        if (!pd) return;
        try {
            if (!pd.chatMessages) pd.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
            const all = pd.chatMessages.allMessages || [];
            const withoutIndicator = all.filter((m: any) => m?.message_id !== 'compressing-indicator');
            if (show) {
                const indicator = {
                    id: 'compressing-indicator',
                    message_id: 'compressing-indicator',
                    role: 'system',
                    content: 'Compressing conversation...',
                    isCompressionIndicator: true,
                    timestamp: new Date().toISOString(),
                    input_tokens: 0,
                    output_tokens: 0,
                    cost: null,
                    attachments: [],
                    contentParts: null,
                };
                withoutIndicator.push(indicator);
                pd.chatMessages.allMessages = withoutIndicator;
                pd.chatMessages.messages = visibleMessageSlice(withoutIndicator, pd.chatMessages.displayedMessageCount || 20);
            } else {
                pd.chatMessages.allMessages = withoutIndicator;
                pd.chatMessages.messages = visibleMessageSlice(withoutIndicator, pd.chatMessages.displayedMessageCount || 20);
            }
            paneUpdateEmitter?.dispatchEvent(new CustomEvent('pane-update', { detail: { paneId } }));
        } catch (e) {
            console.error('[Compression] Failed to update indicator:', e);
        }
    };

    const resolveConversationId = () => {
        if (activeConversationId) return activeConversationId;
        const pd = contentDataRef?.current?.[paneId];
        if ((pd?.contentType === 'chat' || pd?.contentType === 'agent') && pd?.contentId) return pd.contentId;
        return null;
    };

    const handleCompressConversation = async () => {
        if (isCompressing) return;
        const conversationId = resolveConversationId();
        console.log(`[handleCompressConversation] start paneId=${paneId} conversationId=${conversationId}`);
        if (!conversationId) { setCompressError('No active conversation to compress'); return; }
        setIsCompressing(true);
        setCompressError(null);
        updateCompressionIndicator(true);
        try {
            const res = await Promise.race([
                (window as any).api?.compressConversation?.({
                    conversationId,
                    currentPath,
                    model: currentModel,
                    provider: currentProvider,
                    npc: currentNPC,
                    instructions: compressInstructions,
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Compression timed out after 15s')), 15000)),
            ]);
            console.log(`[handleCompressConversation] compressConversation res=${JSON.stringify({ error: res?.error, summaryMessageId: res?.summaryMessageId, parentMessageId: res?.parentMessageId, summaryLen: res?.summary?.length })}`);
            if (res?.error) { setCompressError(res.error); return; }
            if (res?.summaryMessageId && res?.summary) {
                const pd = contentDataRef?.current?.[paneId];
                console.log(`[handleCompressConversation] before insert pd exists=${!!pd} allMessages len=${pd?.chatMessages?.allMessages?.length}`);
                if (pd) {
                    pd.compressionSummaryMessageId = res.summaryMessageId;
                    if (!pd.chatMessages) pd.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
                    const all = [...(pd.chatMessages.allMessages || [])];
                    const summaryMsg = {
                        id: res.summaryMessageId,
                        message_id: res.summaryMessageId,
                        role: 'user',
                        content: res.summary,
                        parent_message_id: res.parentMessageId || null,
                        timestamp: new Date().toISOString(),
                        input_tokens: 0,
                        output_tokens: 0,
                        cost: null,
                        attachments: [],
                        contentParts: null,
                    };
                    const parentIdx = all.findIndex((m: any) => m?.message_id === res.parentMessageId || m?.id === res.parentMessageId);
                    console.log(`[handleCompressConversation] parentIdx=${parentIdx} parentMessageId=${res.parentMessageId}`);
                    if (parentIdx >= 0) {
                        all.splice(parentIdx + 1, 0, summaryMsg);
                    } else {
                        all.push(summaryMsg);
                    }
                    pd.chatMessages.allMessages = all;
                    pd.chatMessages.messages = visibleMessageSlice(all, pd.chatMessages.displayedMessageCount || 20);
                    console.log(`[handleCompressConversation] after insert visible=${pd.chatMessages.messages.length} visibleIds=${JSON.stringify(pd.chatMessages.messages.map((m: any) => m?.message_id || m?.id))}`);
                    paneUpdateEmitter?.dispatchEvent(new CustomEvent('pane-update', { detail: { paneId } }));
                    paneUpdateEmitter?.dispatchEvent(new CustomEvent('pane-update', { detail: { paneId: 'all' } }));
                    console.log(`[handleCompressConversation] dispatched pane-update ${paneId} and all`);
                }
            }
            console.log(`[handleCompressConversation] calling reloadPaneMessages`);
            await reloadPaneMessages();
            if (res?.summaryMessageId) {
                setTimeout(() => {
                    const marker = document.getElementById(`message-${res.summaryMessageId}`);
                    console.log(`[handleCompressConversation] scroll marker ${res.summaryMessageId} found=${!!marker}`);
                    if (marker) marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        } catch (e: any) {
            console.error('[handleCompressConversation] error:', e);
            setCompressError(e?.message || 'Compression failed');
        } finally {
            updateCompressionIndicator(false);
            setIsCompressing(false);
            console.log(`[handleCompressConversation] finished`);
        }
    };

    const [isInputMinimized, setIsInputMinimized] = useState(false);
    const [isInputExpanded, setIsInputExpanded] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<any[]>(() => {
        try { return contentDataRef?.current?.[paneId]?.uploadedFiles || []; } catch { return []; }
    });
    useEffect(() => {
        try { setUploadedFiles(contentDataRef?.current?.[paneId]?.uploadedFiles || []); } catch {}
    }, [paneId]);
    useEffect(() => {
        try {
            if (contentDataRef?.current?.[paneId]) {
                contentDataRef.current[paneId].uploadedFiles = uploadedFiles;
            }
        } catch {}
    }, [uploadedFiles, paneId]);
    const [contextFiles, setContextFiles] = useState<any[]>([]);
    const [contextFilesCollapsed, setContextFilesCollapsed] = useState(true);
    const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([]);
    const [availableMcpTools, setAvailableMcpTools] = useState<any[]>([]);
    const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
    const [mcpToolsError, setMcpToolsError] = useState<any>(null);
    const [showMcpServersDropdown, setShowMcpServersDropdown] = useState(false);
    const [localMcpServers, setLocalMcpServers] = useState<any[]>([]);

    const [npcResolvedTools, setNpcResolvedTools] = useState<any[]>([]);
    const [teamServers, setTeamServers] = useState<any[]>([]);
    const [npcToolsLoading, setNpcToolsLoading] = useState(false);
    const [enabledServers, setEnabledServers] = useState<Set<string>>(() => new Set(enabledMcpServers || []));

    const toggleServer = async (serverPath: string) => {
        const isEnabled = enabledServers.has(serverPath);
        if (isEnabled) {
            const serverLabel = getFileName(serverPath)?.replace(/\.py$/, '') || serverPath;
            setEnabledServers(prev => { const next = new Set(prev); next.delete(serverPath); return next; });
            setAvailableMcpTools(prev => prev.filter((t: any) => t._serverPath !== serverPath));
            setSelectedMcpTools(prev => {
                const removedNames = new Set(
                    availableMcpTools.filter((t: any) => t._serverPath === serverPath).map((t: any) => t.function?.name)
                );
                return prev.filter(n => !removedNames.has(n));
            });
        } else {
            setEnabledServers(prev => new Set(prev).add(serverPath));
            setMcpToolsLoading(true);
            try {
                const res = await ensureServerAndListTools(serverPath);
                if (!res.error) {
                    const serverLabel = getFileName(serverPath)?.replace(/\.py$/, '') || serverPath;
                    const newTools = (res.tools || []).map((t: any) => ({
                        ...t,
                        _source: t._source || `mcp:${serverLabel}`,
                        _serverPath: serverPath,
                    }));
                    setAvailableMcpTools(prev => {
                        const existingNames = new Set(prev.map((t: any) => t.function?.name));
                        const unique = newTools.filter((t: any) => !existingNames.has(t.function?.name));
                        return [...prev, ...unique];
                    });
                    setSelectedMcpTools(prev => {
                        const newNames = newTools.map((t: any) => t.function?.name).filter(Boolean);
                        return [...new Set([...prev, ...newNames])];
                    });
                }
            } catch (err: any) {
                console.error('[MCP] Failed to load tools from server:', err);
            } finally {
                setMcpToolsLoading(false);
            }
        }
    };

    const ensureServerAndListTools = async (serverPath: string): Promise<any> => {
        const api = (window as any).api;
        let res = await api.listMcpTools({ serverPath, currentPath });
        if (res.error || !(res.tools?.length)) {
            try {
                await api.startMcpServer?.({ serverPath, currentPath });
                await new Promise(r => setTimeout(r, 1500));
                res = await api.listMcpTools({ serverPath, currentPath });
            } catch (startErr: any) {
                console.error('[MCP] Failed to auto-start server:', startErr);
            }
        }
        return res;
    };

    const loadToolsForServer = async (serverPath: string) => {
        setEnabledServers(new Set([serverPath]));
        setMcpToolsLoading(true);
        setMcpToolsError(null);
        try {
            const res = await ensureServerAndListTools(serverPath);
            if (res.error) {
                setMcpToolsError(res.error);
                setAvailableMcpTools([]);
                setSelectedMcpTools([]);
            } else {
                const serverLabel = getFileName(serverPath)?.replace(/\.py$/, '') || serverPath;
                const tools = (res.tools || []).map((t: any) => ({
                    ...t,
                    _source: t._source || `mcp:${serverLabel}`,
                    _serverPath: serverPath,
                }));
                setAvailableMcpTools(tools);
                setSelectedMcpTools(tools.map((t: any) => t.function?.name).filter(Boolean));
                if (!tools.length) {
                    setMcpToolsError('No tools found. Check that the MCP server is configured correctly.');
                }
            }
        } catch (err: any) {
            setMcpToolsError(err.message);
            setAvailableMcpTools([]);
        } finally {
            setMcpToolsLoading(false);
        }
    };

    const loadNpcTools = async (npcName: string) => {
        if (!npcName) return;
        setNpcToolsLoading(true);
        try {
            const teamsData = await (window as any).api.teamsRead?.() || {};
            const registeredTeams = Object.values(teamsData.teams || {});
            const teamPaths = registeredTeams;
            const url = `${BACKEND_URL}/api/npc_tools?npc=${encodeURIComponent(npcName)}&registered_teams=${encodeURIComponent(teamPaths.join(','))}&currentPath=${encodeURIComponent(currentPath || '')}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.error) {
                console.error('[NPC Tools] Error:', data.error);
            } else {
                const npcTools = data.npc_tools || [];
                setNpcResolvedTools(npcTools);
                setTeamServers(data.team_servers || []);
                const npcToolDefs = npcTools.map((t: any) => ({
                    function: { name: t.name, description: t.description || '' },
                    _source: t.source,
                    _serverPath: '__npc__',
                }));
                setAvailableMcpTools(npcToolDefs);
                const npcToolNames = npcTools.filter((t: any) => t.enabled).map((t: any) => t.name);
                setSelectedMcpTools(npcToolNames);
                setEnabledServers(new Set(['__npc__']));
            }
        } catch (err) {
            console.error('[NPC Tools] Failed to load:', err);
        } finally {
            setNpcToolsLoading(false);
        }
    };

    useEffect(() => {
        if (availableMcpServers.length > 0) {
            setLocalMcpServers(availableMcpServers);
        }
    }, [availableMcpServers]);

    useEffect(() => {
        if (executionMode !== 'tool_agent' || !currentNPC) return;
        loadNpcTools(currentNPC);
    }, [currentNPC, executionMode]);

    useEffect(() => {
        if (executionMode !== 'tool_agent') setExecutionMode('tool_agent');
    }, [executionMode]);

    useEffect(() => {
        if (availableMcpServers.length > 0) {
            setLocalMcpServers(availableMcpServers);
            const allPaths = availableMcpServers.map((s: any) => s.serverPath).filter(Boolean);
            setEnabledServers(new Set(allPaths));
            (async () => {
                setMcpToolsLoading(true);
                const allTools: any[] = [];
                for (const serverPath of allPaths) {
                    try {
                        const res = await ensureServerAndListTools(serverPath);
                        if (!res.error) {
                            const serverLabel = getFileName(serverPath)?.replace(/\.py$/, '') || serverPath;
                            const newTools = (res.tools || []).map((t: any) => ({
                                ...t,
                                _source: t._source || `mcp:${serverLabel}`,
                                _serverPath: serverPath,
                            }));
                            const existingNames = new Set(allTools.map((t: any) => t.function?.name));
                            const unique = newTools.filter((t: any) => !existingNames.has(t.function?.name));
                            allTools.push(...unique);
                        }
                    } catch (err: any) {
                        console.error('[MCP] Failed to load tools from server:', err);
                    }
                }
                setAvailableMcpTools(allTools);
                setSelectedMcpTools(allTools.map((t: any) => t.function?.name).filter(Boolean));
                setMcpToolsLoading(false);
            })();
        }
    }, [availableMcpServers]);


    const [jinxSearch, setJinxSearch] = useState('');
    const jinxSearchRef = useRef<HTMLInputElement>(null);

    const [disableThinking, setDisableThinking] = useState(() => {
        try { return localStorage.getItem('incognide-disable-thinking') === 'true'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('incognide-disable-thinking', String(disableThinking)); } catch {}
    }, [disableThinking]);

    const [genParams] = useState({
        temperature: 0.7,
        top_k: 40,
        max_tokens: 4096
    });
    const [showJinxConfigDropdown, setShowJinxConfigDropdown] = useState(false);
    const jinxConfigDropdownRef = useRef<HTMLDivElement>(null);

    const [detectedJinxes, setDetectedJinxes] = useState<any[]>([]);
    const [showJinxSuggestion, setShowJinxSuggestion] = useState(false);
    const firstJinxInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const currentNpcTeamPath = useMemo(() => {
        if (!currentNPC || availableNPCs.length === 0) return null;
        const npc = availableNPCs.find((n: any) => n.value === currentNPC || n.name === currentNPC);
        return npc?.teamPath || null;
    }, [currentNPC, availableNPCs]);

    const currentNpcTeamKey = useMemo(() => {
        if (!currentNPC || availableNPCs.length === 0) return null;
        const npc = availableNPCs.find((n: any) => n.value === currentNPC || n.name === currentNPC);
        return npc?.team || null;
    }, [currentNPC, availableNPCs]);

    useEffect(() => {
        if (!localInput) {
            setDetectedJinxes([]);
            setShowJinxSuggestion(false);
            return;
        }

        const match = localInput.match(/^\/(\S+)/);
        if (match) {
            const jinxName = match[1].toLowerCase();
            const npcJinxNames = new Set((npcResolvedTools || []).map((t: any) => (t.name || '').toLowerCase()));
            const matches = jinxesToDisplay.filter((j: any) => {
                if (!npcJinxNames.has(j.name.toLowerCase())) return false;
                return j.name.toLowerCase() === jinxName || j.name.toLowerCase().startsWith(jinxName);
            });
            if (matches.length > 0) {
                setDetectedJinxes(matches);
                setShowJinxSuggestion(true);
            } else {
                setDetectedJinxes([]);
                setShowJinxSuggestion(false);
            }
        } else {
            setDetectedJinxes([]);
            setShowJinxSuggestion(false);
        }
    }, [localInput, jinxesToDisplay, npcResolvedTools]);


    useEffect(() => {
        if (!showMcpServersDropdown) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowMcpServersDropdown(false);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(e.target as Node)) {
                setShowMcpServersDropdown(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMcpServersDropdown, setShowMcpServersDropdown]);

    useEffect(() => {
        if (!showJinxConfigDropdown) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowJinxConfigDropdown(false);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (showJinxConfigDropdown && jinxConfigDropdownRef.current && !jinxConfigDropdownRef.current.contains(e.target as Node)) {
                setShowJinxConfigDropdown(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showJinxConfigDropdown]);

    const isJinxMode = false;
    const hasJinxContent = false;


    const filteredJinxes = useMemo(() => {
        if (!jinxSearch.trim()) return jinxesToDisplay;
        const q = jinxSearch.toLowerCase();
        return jinxesToDisplay.filter((j: any) =>
            j.name?.toLowerCase().includes(q) || j.group?.toLowerCase().includes(q) || j.description?.toLowerCase().includes(q)
        );
    }, [jinxesToDisplay, jinxSearch]);


    useEffect(() => {
        if (showJinxDropdown) {
            setJinxSearch('');
            setTimeout(() => jinxSearchRef.current?.focus(), 50);
        }
    }, [showJinxDropdown]);

    const { jinxConfigInputs, jinxRequiredInputs } = useMemo(() => {
        if (!isJinxMode || !selectedJinx?.inputs) return { jinxConfigInputs: [], jinxRequiredInputs: [] };

        const config: any[] = [];
        const required: any[] = [];

        selectedJinx.inputs.forEach((rawDef: any, idx: number) => {
            let name: string;
            let defaultVal: string;

            if (typeof rawDef === 'string') {
                name = rawDef;
                defaultVal = '';
            } else {
                name = Object.keys(rawDef)[0] || `input_${idx}`;
                const rawVal = rawDef[name];

                defaultVal = rawVal != null ? String(rawVal) : '';
            }

            const inp = { name, defaultVal };
            if (defaultVal && defaultVal.trim() !== '') {
                config.push(inp);
            } else {
                required.push(inp);
            }
        });

        return { jinxConfigInputs: config, jinxRequiredInputs: required };
    }, [isJinxMode, selectedJinx]);

    const getInputPlaceholder = (name: string): string => {
        const n = name.toLowerCase();
        if (n.includes('path') || n.includes('file') || n.includes('dir')) return `e.g. ~/documents/file.txt`;
        if (n.includes('url') || n.includes('link')) return `e.g. https://example.com`;
        if (n.includes('model')) return `e.g. gpt-4, llama3`;
        if (n.includes('query') || n.includes('sql')) return `e.g. SELECT * FROM table`;
        if (n.includes('prompt') || n.includes('text') || n.includes('content')) return `Enter ${name}...`;
        if (n.includes('code')) return `# Enter code here...`;
        if (n.includes('json')) return `{ "key": "value" }`;
        if (n.includes('regex') || n.includes('pattern')) return `e.g. ^[a-z]+$`;
        if (n.includes('email')) return `e.g. user@example.com`;
        if (n.includes('name')) return `e.g. my_${n}`;
        if (n.includes('id')) return `e.g. abc123`;
        if (n.includes('num') || n.includes('count') || n.includes('limit')) return `e.g. 10`;
        if (n.includes('date')) return `e.g. 2024-01-15`;
        if (n.includes('time')) return `e.g. 14:30`;
        if (n.includes('tag') || n.includes('label')) return `e.g. tag1, tag2`;
        if (n.includes('schema')) return `e.g. public, main`;
        if (n.includes('table')) return `e.g. users, orders`;
        if (n.includes('column') || n.includes('field')) return `e.g. id, name, email`;
        if (n.includes('db') || n.includes('database')) return `e.g. mydb.sqlite`;
        return `Enter ${name}`;
    };

    const jinxMinHeight = useMemo(() => {
        if (!isJinxMode) return 140;
        if (jinxRequiredInputs.length === 0) return 140;
        const hasTextArea = jinxRequiredInputs.some((inp: any) =>
            ['code', 'prompt', 'query', 'content', 'text', 'command', 'description'].includes(inp.name.toLowerCase())
        );
        const inputCount = jinxRequiredInputs.length;

        const cols = inputCount <= 3 ? 1 : 2;
        const rows = Math.ceil(inputCount / cols);

        const inputsHeight = (rows * 90) + (hasTextArea ? 120 : 0);

        return Math.min(100 + inputsHeight, 550);
    }, [isJinxMode, jinxRequiredInputs]);

    useEffect(() => {
        if (jinxMinHeight > inputHeight) {
            setInputHeight(jinxMinHeight);
        }
    }, [jinxMinHeight]);

    const inputStr = typeof localInput === 'string' ? localInput : '';
    const hasContextFiles = contextFiles.length > 0;
    const hasInputContent = inputStr.trim() || uploadedFiles.length > 0 || hasJinxContent || hasContextFiles;
    const canSend = hasInputContent && (activeConversationId || isJinxMode);

    useEffect(() => {
        if (recordingError) {
            const timer = setTimeout(() => setRecordingError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recordingError]);

    const startRecording = async () => {
        try {
            setRecordingError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {

                stream.getTracks().forEach(track => track.stop());

                if (audioChunksRef.current.length === 0) return;

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64Audio = (reader.result as string).split(',')[1];

                    try {

                        const response = await fetch(`${BACKEND_URL}/api/audio/stt`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audio: base64Audio, format: 'webm' })
                        });

                        if (!response.ok) {
                            const err = await response.json();
                            setRecordingError(err.error || 'STT failed');
                            return;
                        }

                        const result = await response.json();
                        if (result.text) {

                            const newText = localInput ? `${localInput} ${result.text}` : result.text;
                            setLocalInput(newText);

                            setUsedVoiceInput(true);
                        }
                    } catch (err: any) {
                        setRecordingError(err.message || 'STT request failed');
                    }
                };
                reader.readAsDataURL(audioBlob);
            };

            mediaRecorder.start(100);
            setIsRecording(true);
        } catch (err: any) {
            setRecordingError(err.message || 'Microphone access denied');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    useEffect(() => {
        if (!isResizingInput) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.parentElement?.getBoundingClientRect();
            if (!containerRect) return;
            const newHeight = containerRect.bottom - e.clientY;
            if (newHeight >= 80 && newHeight <= 400) {
                setInputHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            setIsResizingInput(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingInput, setInputHeight, setIsResizingInput]);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovering(false);

        const sidebarData = e.dataTransfer.getData('application/x-sidebar-file') || e.dataTransfer.getData('application/json');
        if (sidebarData) {
            try {
                const data = JSON.parse(sidebarData);
                if (data.type === 'sidebar-file' && data.path) {
                    const fileName = getFileName(data.path) || data.path;
                    const existingNames = new Set(uploadedFiles.map((f: any) => f.name));
                    if (!existingNames.has(fileName)) {
                        setUploadedFiles((prev: any[]) => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            name: fileName,
                            path: data.path,
                            type: 'file',
                            size: 0,
                            preview: null
                        }]);
                    }
                    return;
                }
            } catch (err) {}
        }

        const files = Array.from(e.dataTransfer.files);
        const existingNames = new Set(uploadedFiles.map((f: any) => f.name));
        const newFiles = files.filter(f => !existingNames.has(f.name));

        const attachments = newFiles.map((file: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: file.type,
            path: file.path,
            size: file.size,
            preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null
        }));

        if (attachments.length > 0) {
            setUploadedFiles((prev: any[]) => [...prev, ...attachments]);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const items = Array.from(clipboardData.items);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (imageItem) {
            e.preventDefault();
            const blob = imageItem.getAsFile();
            if (blob) {
                const timestamp = Date.now();
                const ext = imageItem.type.split('/')[1] || 'png';
                const fileName = `pasted-image-${timestamp}.${ext}`;

                const preview = URL.createObjectURL(blob);

                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    try {
                        const result = await (window as any).api?.saveTempFile?.({
                            name: fileName,
                            data: base64,
                            encoding: 'base64'
                        });

                        setUploadedFiles((prev: any[]) => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            name: fileName,
                            type: imageItem.type,
                            path: result?.path || null,
                            size: blob.size,
                            preview: preview
                        }]);
                    } catch (err) {
                        console.error('Failed to save pasted image:', err);

                        setUploadedFiles((prev: any[]) => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            name: fileName,
                            type: imageItem.type,
                            path: null,
                            size: blob.size,
                            preview: preview,
                            blob: blob
                        }]);
                    }
                };
                reader.readAsDataURL(blob);
            }
            return;
        }

        const text = clipboardData.getData('text/plain');
        const lineCount = text ? text.split('\n').length : 0;
        if (text && lineCount >= 500) {
            e.preventDefault();
            const timestamp = Date.now();
            const fileName = `pasted-text-${timestamp}.txt`;

            try {
                const result = await (window as any).api?.saveTempFile?.({
                    name: fileName,
                    data: text,
                    encoding: 'utf8'
                });

                const base64Data = btoa(unescape(encodeURIComponent(text)));

                setUploadedFiles((prev: any[]) => [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
                    name: fileName,
                    type: 'text/plain',
                    path: result?.path || null,
                    data: base64Data,
                    size: text.length,
                    preview: null
                }]);
            } catch (err) {
                console.error('Failed to save pasted text:', err);
                setLocalInput(localInput + text);
            }
            return;
        }
    };

    const handleAttachFileClick = async () => {
        try {
            const fileData = await (window as any).api.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
            });
            if (fileData && fileData.length > 0) {
                const existingNames = new Set(uploadedFiles.map((f: any) => f.name));
                const newFiles = fileData.filter((file: any) => !existingNames.has(file.name));
                const attachments = newFiles.map((file: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: file.type,
                    path: file.path,
                    size: file.size,
                    preview: file.type?.startsWith('image/') ? `file://${file.path}` : null
                }));
                if (attachments.length > 0) {
                    setUploadedFiles((prev: any[]) => [...prev, ...attachments]);
                }
            }
        } catch (err) {
            console.error('Error selecting files:', err);
        }
    };

    const openPanes = useMemo(() => {
        if (!contentDataRef?.current) return [];
        const panes: Array<{ id: string; type: string; label: string }> = [];
        const PANE_LABELS: Record<string, string> = {
            'graph-viewer': 'Knowledge Graph', 'dbtool': 'Database',
            'memory-manager': 'Memory', 'photoviewer': 'Photos', 'npcteam': 'Agents',
            'jinx': 'Jinxes', 'teammanagement': 'Team', 'diff': 'Diff',
            'browsergraph': 'Web Graph', 'library': 'Library',
            'diskusage': 'Disk Usage', 'help': 'Help', 'cron-daemon': 'Cron',
            'projectenv': 'Environment', 'search': 'Search', 'settings': 'Settings',
            'data-labeler': 'Data Labeler', 'tilejinx': 'Tile Jinx', 'git': 'Git',
            'docx': 'Document', 'pptx': 'Presentation', 'zip': 'Archive',
            'exp': 'Experiment', 'folder': 'Folder',
        };
        Object.entries(contentDataRef.current).forEach(([openPaneId, paneData]: [string, any]) => {
            if (!paneData.contentType || paneData.contentType === 'chat' || openPaneId === paneId) return;
            let label = '';
            if ((paneData.contentType === 'editor' || paneData.contentType === 'latex' || paneData.contentType === 'csv' || paneData.contentType === 'notebook') && paneData.contentId) label = getFileName(paneData.contentId) || paneData.contentId;
            else if (paneData.contentType === 'browser' && paneData.browserUrl) { try { label = new URL(paneData.browserUrl).hostname; } catch { label = paneData.browserUrl.slice(0, 20); } }
            else if (paneData.contentType === 'pdf' && paneData.contentId) label = getFileName(paneData.contentId) || 'PDF';
            else if (paneData.contentType === 'image' && paneData.contentId) label = getFileName(paneData.contentId) || 'Image';
            else if (paneData.contentType === 'terminal') label = `Term${paneData.shellType ? ` (${paneData.shellType})` : ''}`;
            else label = PANE_LABELS[paneData.contentType] || paneData.contentType;
            if (label) panes.push({ id: openPaneId, type: paneData.contentType, label });
        });
        return panes;
    }, [paneVersion, paneId]);

    const isPaneIncluded = (paneId: string) => {
        if (contextPaneOverrides && contextPaneOverrides[paneId] !== undefined) return contextPaneOverrides[paneId];
        return autoIncludeContext !== undefined ? autoIncludeContext : true;
    };

    const togglePaneCtx = (paneId: string) => {
        if (!setContextPaneOverrides) return;
        setContextPaneOverrides(prev => ({ ...prev, [paneId]: !isPaneIncluded(paneId) }));
    };

    const paneIcon = (type: string) => {
        const s = 10;
        const cls = "flex-shrink-0";
        switch (type) {
            case 'editor': case 'latex': case 'notebook': return <FileCode size={s} className={cls} />;
            case 'browser': case 'browsergraph': return <Globe size={s} className={cls} />;
            case 'pdf': case 'docx': case 'pptx': return <FileText size={s} className={cls} />;
            case 'terminal': return <TerminalIcon size={s} className={cls} />;

            case 'csv': return <FileText size={s} className={cls} />;
            case 'graph-viewer': case 'diff': case 'git': return <GitBranch size={s} className={cls} />;
            case 'dbtool': return <Database size={s} className={cls} />;
            case 'memory-manager': return <BrainCircuit size={s} className={cls} />;
            case 'npcteam': return <Bot size={s} className={cls} />;
            case 'jinx': case 'tilejinx': return <Zap size={s} className={cls} />;
            case 'teammanagement': return <Users size={s} className={cls} />;
            case 'image': return <Image size={s} className={cls} />;
            case 'search': return <Search size={s} className={cls} />;
            case 'library': return <BookOpen size={s} className={cls} />;
            case 'folder': return <Folder size={s} className={cls} />;
            case 'diskusage': return <HardDrive size={s} className={cls} />;
            case 'help': return <HelpCircle size={s} className={cls} />;
            case 'cron-daemon': return <Clock size={s} className={cls} />;
            case 'settings': case 'projectenv': return <Settings size={s} className={cls} />;
            case 'data-labeler': return <Tag size={s} className={cls} />;
            case 'exp': return <FileText size={s} className={cls} />;
            default: return <FileText size={s} className={cls} />;
        }
    };

    const renderContextPaneChips = () => {
        if (openPanes.length === 0) return null;
        return (
            <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto">
                <button
                    onClick={() => setAutoIncludeContext?.(!autoIncludeContext)}
                    className={`flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] transition-colors ${
                        autoIncludeContext ? 'text-green-400 hover:text-green-300' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title={autoIncludeContext ? 'Auto-include ON' : 'Auto-include OFF'}
                >
                    {autoIncludeContext ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                </button>
                {openPanes.map(pane => {
                    const included = isPaneIncluded(pane.id);
                    return (
                        <button
                            key={pane.id}
                            onClick={() => togglePaneCtx(pane.id)}
                            className={`flex-shrink-0 flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full text-[10px] transition-all border ${
                                included
                                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
                                    : 'bg-white/3 text-gray-500 border-white/5 hover:bg-white/5 line-through'
                            }`}
                            title={`${pane.label} (${pane.id}) - ${included ? 'included in context' : 'excluded from context'}`}
                        >
                            {paneIcon(pane.type)}
                            <span className="max-w-[80px] truncate" title={pane.id}>{pane.label}</span>
                            {included ? <Eye size={9} className="flex-shrink-0 opacity-60" /> : <EyeOff size={9} className="flex-shrink-0 opacity-40" />}
                        </button>
                    );
                })}
            </div>
        );
    };

    const renderAttachmentThumbnails = () => {
        if (uploadedFiles.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-2 p-2 border-b theme-border">
                {uploadedFiles.map((file: any) => {
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    const isClickable = !!file.path;
                    return (
                        <div
                            key={file.id}
                            className={`relative group ${isClickable ? 'cursor-pointer' : ''}`}
                            onDoubleClick={() => isClickable && onOpenFile?.(file.path)}
                            title={isClickable ? `Double-click to open: ${file.path}` : file.name}
                        >
                            {file.preview ? (
                                <img src={file.preview} alt={file.name} className="w-16 h-16 object-cover rounded border theme-border" />
                            ) : (
                                <div className="w-16 h-16 rounded border theme-border bg-gray-700 flex items-center justify-center text-xs text-gray-400 text-center p-1">
                                    {ext?.toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setUploadedFiles((prev: any[]) => prev.filter((f: any) => f.id !== file.id)); }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >×</button>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 truncate rounded-b">
                                {file.name.length > 10 ? file.name.slice(0, 8) + '...' : file.name}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (isInputMinimized) {
        return (
            <div className="px-2 py-1 border-t theme-border theme-bg-secondary flex-shrink-0">
                <button
                    onClick={() => setIsInputMinimized(false)}
                    className="p-1 w-full theme-button theme-hover rounded transition-all group"
                    title="Expand input"
                >
                    <div className="flex items-center gap-1 justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 15l-6-6-6 6"/>
                        </svg>
                    </div>
                </button>
            </div>
        );
    }

    if (isInputExpanded) {
        return (
            <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-4">
                <div className="flex-1 flex flex-col theme-bg-primary theme-border border rounded-lg">
                    <div className="p-2 border-b theme-border flex justify-end">
                        <button onClick={() => setIsInputExpanded(false)} className="p-2 theme-text-muted hover:theme-text-primary rounded-lg theme-hover">
                            <Minimize2 size={20} />
                        </button>
                    </div>
                    <div className="flex-1 p-2 flex">
                        <textarea
                            value={localInput}
                            onChange={(e) => setLocalInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();

                                    const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                    if (shouldBroadcast) {
                                        onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                    } else {
                                        handleInputSubmit(e, { voiceInput: usedVoiceInput, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPaths: Array.from(enabledServers), selectedMcpTools, contextFiles, paneId });
                                        setLocalInput('');
                                        setUploadedFiles([]);
                                        setUsedVoiceInput(false);
                                    }
                                    setIsInputExpanded(false);
                                }
                            }}
                            onPaste={handlePaste}
                            placeholder="Type a message... (Ctrl+Enter to send)"
                            className="w-full h-full theme-input text-base rounded-lg p-4 focus:outline-none border-0 resize-none bg-transparent"
                            autoFocus
                        />
                    </div>
                    <div className="p-2 border-t theme-border flex items-center justify-end gap-2">
                        {(isStreaming || isCompressing) && (
                            <button
                                onClick={isStreaming ? handleInterruptStream : handleInterruptStream}
                                disabled={!isStreaming}
                                className={`rounded-lg px-4 py-2 text-sm flex items-center gap-1 text-white ${isStreaming ? 'theme-button-danger' : 'bg-amber-600 hover:bg-amber-500 disabled:opacity-50'}`}
                                title={isStreaming ? 'Stop generation' : 'Stop compression'}
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
                                Stop
                            </button>
                        )}
                        <button onClick={(e) => {
                            const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                            if (shouldBroadcast) {
                                onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                            } else {
                                handleInputSubmit(e, { voiceInput: usedVoiceInput, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPaths: Array.from(enabledServers), selectedMcpTools, contextFiles, paneId });
                                setLocalInput('');
                                setUploadedFiles([]);
                                setUsedVoiceInput(false);
                            }
                            setIsInputExpanded(false);
                        }} disabled={!canSend} className="theme-button-success text-white rounded-lg px-4 py-2 text-sm flex items-center gap-1 disabled:opacity-50">
                            <Send size={16}/> {isStreaming ? 'Queue' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="border-t theme-border theme-bg-secondary flex-shrink-0 relative flex flex-col"
            style={{ height: `${inputHeight}px`, minHeight: isJinxMode ? `${jinxMinHeight}px` : '200px', maxHeight: '600px' }}
            onFocus={onFocus}
        >
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); setIsResizingInput(true); }}
                style={{ backgroundColor: isResizingInput ? '#3b82f6' : 'transparent' }}
            />

            <ContextUsageMeter
                used={ctxUsage.used}
                limit={ctxLimit}
                source={ctxUsage.source}
                modelLabel={currentModel}
                onCompress={handleCompressConversation}
                compressing={isCompressing}
                compressError={compressError}
                compressInstructions={compressInstructions}
                onChangeCompressInstructions={handleSetCompressInstructions}
            />

            <div
                className="relative theme-bg-primary theme-border border rounded-lg group flex-1 min-h-0 flex flex-col m-2 overflow-visible z-[10]"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsHovering(true); }}
                onDragEnter={(e) => { e.stopPropagation(); setIsHovering(true); }}
                onDragLeave={(e) => { e.stopPropagation(); setIsHovering(false); }}
                onDrop={handleDrop}
            >
                {isHovering && (
                    <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center z-10 pointer-events-none">
                        <span className="text-blue-300 font-semibold">Drop files here</span>
                    </div>
                )}

                <div className="flex-1 overflow-visible flex flex-col">
                    <div className="relative">
                        <ContextFilesPanel
                            isCollapsed={contextFilesCollapsed}
                            onToggleCollapse={() => setContextFilesCollapsed(!contextFilesCollapsed)}
                            contextFiles={contextFiles}
                            setContextFiles={setContextFiles}
                            currentPath={currentPath}
                        />
                    </div>
                    {renderAttachmentThumbnails()}

                    <div className="flex-1 flex items-stretch p-2 gap-2">
                        <div className="flex-grow relative h-full">
                            <textarea
                                value={localInput}
                                        onChange={(e) => setLocalInput(e.target.value)}
                                        onKeyDown={(e) => {

                                            if (showJinxSuggestion && detectedJinxes.length > 0 && e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                const jinx = detectedJinxes[0];
                                                setExecutionMode(jinx.name);
                                                setSelectedJinx(jinx);
                                                setLocalInput('');
                                                setShowJinxSuggestion(false);
                                                setDetectedJinxes([]);
                                                return;
                                            }
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();

                                                const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                                if (shouldBroadcast) {
                                                    onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                                } else {
                                                    handleInputSubmit(e, { voiceInput: usedVoiceInput, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPaths: Array.from(enabledServers), selectedMcpTools, contextFiles, paneId });
                                                    setLocalInput('');
                                                    setUploadedFiles([]);
                                                    setUsedVoiceInput(false);
                                                }
                                            }

                                            if (e.key === 'Escape' && showJinxSuggestion) {
                                                setShowJinxSuggestion(false);
                                                setDetectedJinxes([]);
                                            }
                                        }}
                                        onPaste={handlePaste}
                                        placeholder="Type a message... (use /jinx to run a jinx)"
                                        className="w-full h-full theme-input text-sm rounded-lg pl-3 pr-16 py-2 focus:outline-none border-0 resize-none"
                                    />
                                    {showJinxSuggestion && detectedJinxes.length > 0 && (
                                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gradient-to-r from-purple-900/95 to-pink-900/95 backdrop-blur-xl border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden z-[100] max-h-48 overflow-y-auto">
                                            {detectedJinxes.map((jinx: any) => (
                                                <button
                                                    key={jinx.name}
                                                    onClick={() => {
                                                        setExecutionMode(jinx.name);
                                                        setSelectedJinx(jinx);
                                                        setLocalInput('');
                                                        setShowJinxSuggestion(false);
                                                        setDetectedJinxes([]);
                                                    }}
                                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 transition-colors border-b border-purple-500/10 last:border-b-0"
                                                >
                                                    <div className="w-6 h-6 rounded bg-purple-500/30 flex items-center justify-center flex-shrink-0">
                                                        <Zap size={12} className="text-purple-300" />
                                                    </div>
                                                    <div className="flex-1 text-left min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-medium text-purple-100 truncate">{jinx.name}</span>
                                                            {jinx.group && (
                                                                <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/30 text-purple-300 flex-shrink-0">{jinx.group}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[9px] text-purple-300/60 truncate">
                                                            {jinx.inputs?.length || 0} input{(jinx.inputs?.length || 0) !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                            <div className="absolute top-1 right-1 flex gap-1">
                                <button onClick={() => setIsInputMinimized(true)} className="p-1 theme-text-muted hover:theme-text-primary rounded theme-hover opacity-50 group-hover:opacity-100" title="Minimize">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                                </button>
                                <button onClick={() => setIsInputExpanded(true)} className="p-1 theme-text-muted hover:theme-text-primary rounded theme-hover opacity-50 group-hover:opacity-100" title="Expand">
                                    <Maximize2 size={12} />
                                </button>
                            </div>
                            <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                {openPanes.length > 0 && (
                                    <button
                                        onClick={() => setAutoIncludeContext?.(!autoIncludeContext)}
                                        className={`flex-shrink-0 p-0.5 rounded transition-colors ${autoIncludeContext ? 'text-green-400 hover:text-green-300' : 'text-gray-600 hover:text-gray-400'}`}
                                        title={autoIncludeContext ? 'Auto-include ON' : 'Auto-include OFF'}
                                    >
                                        {autoIncludeContext ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                    </button>
                                )}
                                {openPanes.map(pane => {
                                    const included = isPaneIncluded(pane.id);
                                    return (
                                        <button
                                            key={pane.id}
                                            onClick={() => togglePaneCtx(pane.id)}
                                            className={`flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] transition-all border ${
                                                included
                                                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
                                                    : 'bg-white/3 text-gray-600 border-white/5 hover:bg-white/5 line-through'
                                            }`}
                                            title={`${pane.label} - click to ${included ? 'exclude' : 'include'}`}
                                        >
                                            {paneIcon(pane.type)}
                                            <span className="max-w-[60px] truncate">{pane.label}</span>
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={toggleRecording}
                                    disabled={false}
                                    className={`p-1 rounded theme-hover opacity-50 group-hover:opacity-100 ${isStreaming ? 'opacity-30' : ''} ${isRecording ? 'text-red-500 animate-pulse' : usedVoiceInput ? 'text-green-400' : 'theme-text-muted hover:theme-text-primary'}`}
                                    title={isRecording ? "Stop recording" : usedVoiceInput ? "Voice mode - response will be spoken" : "Start voice input"}
                                >
                                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                                <button onClick={handleAttachFileClick} disabled={false} className={`p-1 theme-text-muted hover:theme-text-primary rounded theme-hover opacity-50 group-hover:opacity-100 `} title="Attach file">
                                    <Paperclip size={16} />
                                </button>
                            </div>
                            {recordingError && (
                                <div className="absolute bottom-8 right-1 bg-red-500/90 text-white text-xs px-2 py-1 rounded">
                                    {recordingError}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center gap-1 flex-shrink-0 self-end">
                            <button
                                onClick={() => setDisableThinking(!disableThinking)}
                                className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                                    !disableThinking
                                        ? 'bg-gradient-to-br from-violet-500/30 to-purple-600/30 text-violet-300 border border-violet-500/40'
                                        : 'bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300 hover:bg-white/10'
                                }`}
                                title={disableThinking ? "Thinking disabled — click to enable" : "Thinking enabled — click to disable"}
                            >
                                <BrainCircuit size={12} />
                            </button>
                            {(isStreaming || isCompressing) && (
                                <button
                                    onClick={isStreaming ? handleInterruptStream : handleInterruptStream}
                                    disabled={!isStreaming}
                                    className={`rounded-lg px-3 py-2 text-sm flex items-center gap-1 flex-shrink-0 text-white ${isStreaming ? 'theme-button-danger' : 'bg-amber-600 hover:bg-amber-500 disabled:opacity-50'}`}
                                    title={isStreaming ? 'Stop generation' : 'Stop compression'}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
                                </button>
                            )}
                            <button
                                    onClick={(e) => {

                                        const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                        if (shouldBroadcast && canSend) {
                                            onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                        } else {
                                            handleInputSubmit(e, { voiceInput: usedVoiceInput, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPaths: Array.from(enabledServers), selectedMcpTools, contextFiles, paneId });
                                            setLocalInput('');
                                            setUploadedFiles([]);
                                            setUsedVoiceInput(false);
                                        }
                                    }}
                                    disabled={!canSend}
                                    className={`text-white rounded-lg px-3 py-2 text-sm flex items-center gap-1 flex-shrink-0 disabled:opacity-50 ${
                                        selectedModels.length > 1 || selectedNPCs.length > 1
                                            ? 'bg-purple-600 hover:bg-purple-500'
                                            : 'theme-button-success'
                                    }`}
                                    title={selectedModels.length > 1 || selectedNPCs.length > 1
                                        ? `Send to ${selectedModels.length * selectedNPCs.length} combinations`
                                        : isStreaming ? 'Queue message' : 'Send message'}
                                >
                                    {selectedModels.length > 1 || selectedNPCs.length > 1 ? (
                                        <>
                                            <GitBranch size={14} />
                                            <span className="text-xs">{selectedModels.length * selectedNPCs.length}</span>
                                        </>
                                    ) : (
                                        <Send size={16}/>
                                    )}
                                </button>
                        </div>
                    </div>
                </div>


                <div className={`px-1.5 py-1 pb-1.5 relative z-50 flex-shrink-0 ${isStreaming ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-1">
                    <NPCDropdown
                        availableNPCs={availableNPCs}
                        selectedNPCs={selectedNPCs}
                        onChangeSelected={setSelectedNPCs}
                        currentNPC={currentNPC}
                        onSelectCurrent={setCurrentNPC}
                        loading={npcsLoading}
                        error={npcsError}
                        broadcastMode={broadcastMode}
                        onToggleBroadcast={() => setBroadcastMode(!broadcastMode)}
                        onOpen={() => setShowJinxDropdown(false)}
                        placeholder="Agent"
                        className="w-1/2"
                    />

                    <div className="relative flex-1 min-w-0 w-1/2">
                        <ModelSelector
                            availableModels={modelsToDisplay}
                            selectedModel={currentModel}
                            onSelect={(m) => {
                                setCurrentModel(m.value);
                                setSelectedModels([m.value]);
                                if (m.provider) setCurrentProvider(m.provider);
                            }}
                            loading={modelsLoading}
                            error={modelsError}
                            userModelsProviders={userModelsConfig.providers}
                            onModelsChanged={(addedModel) => {
                                if (addedModel) setPendingAddedModels?.([addedModel]);
                                reloadUserModelsConfig?.();
                            }}
                            favoriteModels={favoriteModels}
                            onToggleFavorite={toggleFavoriteModel}
                            showAllModels={showAllModels}
                            onToggleShowAll={() => setShowAllModels(!showAllModels)}
                            placement="top"
                            className="w-full h-7 justify-center text-xs px-2 max-w-none"
                        />
                    </div>

                </div>
                </div>

            </div>
        </div>
    );
};

export default AgentInput;
