import { getFileName } from './utils';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BACKEND_URL } from '../config';
import {
    Send, Paperclip, Maximize2, ChevronDown, Star, ListFilter, FolderTree, Minimize2, Mic, MicOff, Volume2, GitBranch, Save, Trash2, Zap, X, RefreshCw,
    FileCode, Globe, FileText, Terminal as TerminalIcon, Eye, EyeOff, ToggleLeft, ToggleRight,
    Database, BarChart3, BrainCircuit, Image, Bot, Users, Music, Search, BookOpen, Folder, HardDrive, HelpCircle, Clock, Settings, MessageSquare, Tag
} from 'lucide-react';
import MemoryIcon from './icons/MemoryIcon';
import KgIcon from './icons/KgIcon';
import ContextFilesPanel from './ContextFilesPanel';

const getMcpServerDisplayName = (serverPath: string): string => {
    // Handle team-based: "python -m npcpy.mcp_server --team /path/to/npc_team"
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
    // Handle npx/uvx commands
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

interface ChatInputProps {
    paneId: string;

    inputHeight: number;
    setInputHeight: (val: number) => void;
    isResizingInput: boolean;
    setIsResizingInput: (val: boolean) => void;

    isStreaming: boolean;
    handleInputSubmit: (e: any, options?: { voiceInput?: boolean; disableThinking?: boolean; genParams?: { temperature: number; top_p: number; top_k: number; max_tokens: number }; inputText?: string; uploadedFiles?: any[]; mcpServerPath?: string; selectedMcpTools?: string[]; contextFiles?: any[]; paneId?: string }) => void;
    handleInterruptStream: () => void;
    currentPath: string;

    autoIncludeContext: boolean;
    setAutoIncludeContext: (val: boolean) => void;
    contextPaneOverrides: Record<string, boolean>;
    setContextPaneOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    contentDataRef: React.MutableRefObject<any>;
    paneVersion?: number;

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
    npcsLoading: boolean;
    npcsError: any;
    currentNPC: string;
    setCurrentNPC: (val: string) => void;

    selectedModels: string[];
    setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>;
    selectedNPCs: string[];
    setSelectedNPCs: React.Dispatch<React.SetStateAction<string[]>>;

    broadcastMode: boolean;
    setBroadcastMode: (val: boolean) => void;

    availableMcpServers: any[];

    activeConversationId: string | null;

    onFocus?: () => void;

    onOpenFile?: (path: string) => void;

    onBroadcast?: (models: string[], npcs: string[], inputText?: string, files?: any[]) => void;
}

const ChatInput: React.FC<ChatInputProps> = (props) => {
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
        availableNPCs, npcsLoading, npcsError, currentNPC, setCurrentNPC,
        selectedModels, setSelectedModels, selectedNPCs, setSelectedNPCs,
        broadcastMode, setBroadcastMode,
        availableMcpServers,
        activeConversationId, onFocus, onOpenFile, onBroadcast
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
    const [mcpServerPath, setMcpServerPath] = useState('');
    const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([]);
    const [availableMcpTools, setAvailableMcpTools] = useState<any[]>([]);
    const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
    const [mcpToolsError, setMcpToolsError] = useState<any>(null);
    const [showMcpServersDropdown, setShowMcpServersDropdown] = useState(false);
    const [localMcpServers, setLocalMcpServers] = useState<any[]>([]);

    // NPC-resolved tools (from NPC config: jinxes + mcp_servers + python tools)
    const [npcResolvedTools, setNpcResolvedTools] = useState<any[]>([]);
    const [teamServers, setTeamServers] = useState<any[]>([]);
    const [npcToolsLoading, setNpcToolsLoading] = useState(false);
    // Track which MCP servers are enabled (multi-select)
    const [enabledServers, setEnabledServers] = useState<Set<string>>(new Set());

    const toggleServer = async (serverPath: string) => {
        const isEnabled = enabledServers.has(serverPath);
        if (isEnabled) {
            // Remove this server's tools
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
            // Add this server's tools
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

    // Try to list tools, auto-starting the server if needed
    const ensureServerAndListTools = async (serverPath: string): Promise<any> => {
        const api = (window as any).api;
        let res = await api.listMcpTools({ serverPath, currentPath });
        if (res.error || !(res.tools?.length)) {
            // Server may not be running — attempt to start it
            try {
                await api.startMcpServer?.({ serverPath, currentPath });
                // Brief wait for server startup
                await new Promise(r => setTimeout(r, 1500));
                res = await api.listMcpTools({ serverPath, currentPath });
            } catch (startErr: any) {
                console.error('[MCP] Failed to auto-start server:', startErr);
            }
        }
        return res;
    };

    // Legacy single-server loader (kept for backward compat / auto-load)
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

    // Load NPC-resolved tools when NPC changes or tool_agent mode activates
    const loadNpcTools = async (npcName: string) => {
        if (!npcName) return;
        setNpcToolsLoading(true);
        try {
            // Try local npc_team first, fall back to incognide team path
            const localTeam = currentPath ? `${currentPath}/npc_team` : '';
            const teamPath = localTeam || '';
            const url = `${BACKEND_URL}/api/npc_tools?npc=${encodeURIComponent(npcName)}&team_path=${encodeURIComponent(teamPath)}&currentPath=${encodeURIComponent(currentPath || '')}`;
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
                // Replace all tools with just the NPC's tools — don't merge
                setAvailableMcpTools(npcToolDefs);
                const npcToolNames = npcTools.filter((t: any) => t.enabled).map((t: any) => t.name);
                setSelectedMcpTools(npcToolNames);
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

    const [showModelsDropdown, setShowModelsDropdown] = useState(false);
    const [showNpcsDropdown, setShowNpcsDropdown] = useState(false);
    const modelsDropdownRef = useRef<HTMLDivElement>(null);

    const [modelSearch, setModelSearch] = useState('');
    const [npcSearch, setNpcSearch] = useState('');
    const [jinxSearch, setJinxSearch] = useState('');
    const modelSearchRef = useRef<HTMLInputElement>(null);
    const npcSearchRef = useRef<HTMLInputElement>(null);
    const jinxSearchRef = useRef<HTMLInputElement>(null);

    const [disableThinking, setDisableThinking] = useState(() => {
        try { return localStorage.getItem('incognide-disable-thinking') === 'true'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('incognide-disable-thinking', String(disableThinking)); } catch {}
    }, [disableThinking]);

    const [useKgSearch, setUseKgSearch] = useState(() => {
        try { const v = localStorage.getItem('incognide-use-kg-search'); return v === null ? true : v === 'true'; } catch { return true; }
    });
    const [useMemorySearch, setUseMemorySearch] = useState(() => {
        try { const v = localStorage.getItem('incognide-use-memory-search'); return v === null ? true : v === 'true'; } catch { return true; }
    });

    useEffect(() => {
        try { localStorage.setItem('incognide-use-kg-search', String(useKgSearch)); } catch {}
    }, [useKgSearch]);
    useEffect(() => {
        try { localStorage.setItem('incognide-use-memory-search', String(useMemorySearch)); } catch {}
    }, [useMemorySearch]);

    const [genParams, setGenParams] = useState({
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        max_tokens: 4096
    });
    const [showTempDropdown, setShowTempDropdown] = useState(false);
    const tempDropdownRef = useRef<HTMLDivElement>(null);
    const [showTopPDropdown, setShowTopPDropdown] = useState(false);
    const topPDropdownRef = useRef<HTMLDivElement>(null);
    const [showTopKDropdown, setShowTopKDropdown] = useState(false);
    const topKDropdownRef = useRef<HTMLDivElement>(null);
    const [showMaxTokensDropdown, setShowMaxTokensDropdown] = useState(false);
    const maxTokensDropdownRef = useRef<HTMLDivElement>(null);
    const [showJinxConfigDropdown, setShowJinxConfigDropdown] = useState(false);
    const jinxConfigDropdownRef = useRef<HTMLDivElement>(null);
    const npcsDropdownRef = useRef<HTMLDivElement>(null);

    const firstJinxInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

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
        if (!showModelsDropdown && !showNpcsDropdown && !showJinxConfigDropdown && !showTempDropdown && !showTopPDropdown && !showTopKDropdown && !showMaxTokensDropdown) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowModelsDropdown(false);
                setShowNpcsDropdown(false);
                setShowJinxConfigDropdown(false);
                setShowTempDropdown(false);
                setShowTopPDropdown(false);
                setShowTopKDropdown(false);
                setShowMaxTokensDropdown(false);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (showModelsDropdown && modelsDropdownRef.current && !modelsDropdownRef.current.contains(e.target as Node)) {
                setShowModelsDropdown(false);
            }
            if (showNpcsDropdown && npcsDropdownRef.current && !npcsDropdownRef.current.contains(e.target as Node)) {
                setShowNpcsDropdown(false);
            }
            if (showJinxConfigDropdown && jinxConfigDropdownRef.current && !jinxConfigDropdownRef.current.contains(e.target as Node)) {
                setShowJinxConfigDropdown(false);
            }
            if (showTempDropdown && tempDropdownRef.current && !tempDropdownRef.current.contains(e.target as Node)) {
                setShowTempDropdown(false);
            }
            if (showTopPDropdown && topPDropdownRef.current && !topPDropdownRef.current.contains(e.target as Node)) {
                setShowTopPDropdown(false);
            }
            if (showTopKDropdown && topKDropdownRef.current && !topKDropdownRef.current.contains(e.target as Node)) {
                setShowTopKDropdown(false);
            }
            if (showMaxTokensDropdown && maxTokensDropdownRef.current && !maxTokensDropdownRef.current.contains(e.target as Node)) {
                setShowMaxTokensDropdown(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showModelsDropdown, showNpcsDropdown, showJinxConfigDropdown, showTempDropdown, showTopPDropdown, showTopKDropdown, showMaxTokensDropdown]);

    const isJinxMode = false;
    const hasJinxContent = false;

    const filteredModels = useMemo(() => {
        if (!modelSearch.trim()) return modelsToDisplay;
        const q = modelSearch.toLowerCase();
        return modelsToDisplay.filter((m: any) =>
            m.display_name?.toLowerCase().includes(q) || m.value?.toLowerCase().includes(q) || m.provider?.toLowerCase().includes(q)
        );
    }, [modelsToDisplay, modelSearch]);

    const filteredNPCs = useMemo(() => {
        if (!npcSearch.trim()) return availableNPCs;
        const q = npcSearch.toLowerCase();
        return availableNPCs.filter((n: any) =>
            n.display_name?.toLowerCase().includes(q) || n.value?.toLowerCase().includes(q)
        );
    }, [availableNPCs, npcSearch]);

    const filteredJinxes = useMemo(() => {
        if (!jinxSearch.trim()) return jinxesToDisplay;
        const q = jinxSearch.toLowerCase();
        return jinxesToDisplay.filter((j: any) =>
            j.name?.toLowerCase().includes(q) || j.group?.toLowerCase().includes(q) || j.description?.toLowerCase().includes(q)
        );
    }, [jinxesToDisplay, jinxSearch]);

    useEffect(() => {
        if (showModelsDropdown) {
            setModelSearch('');
            setTimeout(() => modelSearchRef.current?.focus(), 50);
        }
    }, [showModelsDropdown]);

    useEffect(() => {
        if (showNpcsDropdown) {
            setNpcSearch('');
            setTimeout(() => npcSearchRef.current?.focus(), 50);
        }
    }, [showNpcsDropdown]);

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
    const canSend = !isStreaming && hasInputContent && (activeConversationId || isJinxMode);

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
            'graph-viewer': 'Knowledge Graph', 'datadash': 'Dashboard', 'dbtool': 'Database',
            'memory-manager': 'Memory', 'photoviewer': 'Photos', 'npcteam': 'NPCs',
            'jinx': 'Jinxes', 'teammanagement': 'Team', 'diff': 'Diff',
            'browsergraph': 'Web Graph', 'library': 'Library',
            'diskusage': 'Disk Usage', 'help': 'Help', 'cron-daemon': 'Cron',
            'projectenv': 'Environment', 'search': 'Search', 'settings': 'Settings',
            'data-labeler': 'Data Labeler', 'tilejinx': 'Tile Jinx', 'git': 'Git',
            'docx': 'Document', 'pptx': 'Presentation', 'zip': 'Archive',
            'exp': 'Experiment', 'folder': 'Folder',
        };
        Object.entries(contentDataRef.current).forEach(([paneId, paneData]: [string, any]) => {
            if (!paneData.contentType || paneData.contentType === 'chat') return;
            let label = '';
            if ((paneData.contentType === 'editor' || paneData.contentType === 'latex' || paneData.contentType === 'csv' || paneData.contentType === 'notebook') && paneData.contentId) label = getFileName(paneData.contentId) || paneData.contentId;
            else if (paneData.contentType === 'browser' && paneData.browserUrl) { try { label = new URL(paneData.browserUrl).hostname; } catch { label = paneData.browserUrl.slice(0, 20); } }
            else if (paneData.contentType === 'pdf' && paneData.contentId) label = getFileName(paneData.contentId) || 'PDF';
            else if (paneData.contentType === 'image' && paneData.contentId) label = getFileName(paneData.contentId) || 'Image';
            else if (paneData.contentType === 'terminal') label = `Term${paneData.shellType ? ` (${paneData.shellType})` : ''}`;
            else label = PANE_LABELS[paneData.contentType] || paneData.contentType;
            if (label) panes.push({ id: paneId, type: paneData.contentType, label });
        });
        return panes;
    }, [paneVersion]);

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
            case 'datadash': return <BarChart3 size={s} className={cls} />;
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
                            title={`${pane.label} - ${included ? 'included in context' : 'excluded from context'}`}
                        >
                            {paneIcon(pane.type)}
                            <span className="max-w-[80px] truncate">{pane.label}</span>
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
                                        handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPath, selectedMcpTools, contextFiles, paneId });
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
                        {isStreaming ? (
                            <button onClick={handleInterruptStream} className="theme-button-danger text-white rounded-lg px-4 py-2 text-sm flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
                                Stop
                            </button>
                        ) : (
                            <button onClick={(e) => {
                                const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                if (shouldBroadcast) {
                                    onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                } else {
                                    handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPath, selectedMcpTools, contextFiles, paneId });
                                    setLocalInput('');
                                    setUploadedFiles([]);
                                    setUsedVoiceInput(false);
                                }
                                setIsInputExpanded(false);
                            }} disabled={!canSend} className="theme-button-success text-white rounded-lg px-4 py-2 text-sm flex items-center gap-1 disabled:opacity-50">
                                <Send size={16}/> Send
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="border-t theme-border theme-bg-secondary flex-shrink-0 relative"
            style={{ height: `${inputHeight}px`, minHeight: isJinxMode ? `${jinxMinHeight}px` : '200px', maxHeight: '600px' }}
            onFocus={onFocus}
        >
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); setIsResizingInput(true); }}
                style={{ backgroundColor: isResizingInput ? '#3b82f6' : 'transparent' }}
            />

            <div
                className="relative theme-bg-primary theme-border border rounded-lg group h-full flex flex-col m-2 overflow-visible z-[10]"
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
                            <div className="absolute left-0 bottom-0 w-[15%] min-w-[70px] max-w-[130px] z-10 px-1 pointer-events-none" ref={npcsDropdownRef}>
                                <button
                                    className={`pointer-events-auto w-full h-9 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                        selectedNPCs.length > 1
                                            ? 'bg-gradient-to-br from-green-500/30 to-emerald-600/30 text-green-200 border border-green-400/40'
                                            : 'theme-bg-secondary theme-text-secondary theme-border border theme-hover'
                                    }`}
                                    disabled={npcsLoading || !!npcsError}
                                    onClick={() => { setShowNpcsDropdown(!showNpcsDropdown); setShowModelsDropdown(false); setShowJinxDropdown(false); }}
                                >
                                    {selectedNPCs.length > 1 && (
                                        <span className="w-5 h-5 rounded bg-green-500 text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">{selectedNPCs.length}</span>
                                    )}
                                    <span className="truncate">
                                        {npcsLoading ? '...' : npcsError ? 'Error' :
                                            selectedNPCs.length === 1 ? ((availableNPCs.find((n: any) => n.value === selectedNPCs[0])?.display_name || selectedNPCs[0]).split(' | ')[0]) : selectedNPCs.length === 0 ? 'NPC' : 'NPCs'
                                        }
                                    </span>
                                    <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showNpcsDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showNpcsDropdown && !npcsLoading && !npcsError && (
                                    <div className="pointer-events-auto absolute left-0 bottom-full mb-1 theme-bg-primary backdrop-blur-xl theme-border border rounded-lg shadow-2xl overflow-hidden w-64">
                                        <div className="px-2 py-1.5 border-b theme-border">
                                            <input
                                                ref={npcSearchRef}
                                                type="text"
                                                value={npcSearch}
                                                onChange={(e) => setNpcSearch(e.target.value)}
                                                placeholder="Search NPCs..."
                                                className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="px-2 py-1 border-b theme-border flex items-center justify-between">
                                            <button
                                                onClick={() => setBroadcastMode(!broadcastMode)}
                                                className={`text-[9px] px-1.5 py-0.5 rounded ${broadcastMode ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                                            >
                                                {broadcastMode ? '● Multi' : '○ Single'}
                                            </button>
                                            <div className="flex gap-2">
                                                {broadcastMode && <button onClick={() => setSelectedNPCs(filteredNPCs.map((n: any) => n.value))} className="text-[9px] text-green-400 hover:text-green-300">All</button>}
                                                <button onClick={() => setSelectedNPCs([])} className="text-[9px] text-gray-400 hover:text-gray-300">Reset</button>
                                            </div>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto p-1">
                                            {filteredNPCs.map((npc: any) => {
                                                const npcKey = npc.value;
                                                const checked = selectedNPCs.includes(npcKey);
                                                const teamPath = npc.source === 'project' ? '📁' : npc.source === 'global' ? '🌐' : '';
                                                return (
                                                    <div key={`${npc.source}-${npc.value}`} className={`px-2 py-1.5 text-xs rounded cursor-pointer flex items-center gap-2 transition-all ${checked ? 'bg-green-500/20 text-green-200' : 'hover:bg-white/5'}`}
                                                        onClick={() => {
                                                            if (broadcastMode) {
                                                                setSelectedNPCs(prev => prev.includes(npcKey) ? (prev.length === 1 ? prev : prev.filter(x => x !== npcKey)) : [...prev, npcKey]);
                                                            } else {
                                                                setSelectedNPCs([npcKey]);
                                                            }
                                                            if (!checked) setCurrentNPC(npc.value);
                                                        }}>
                                                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
                                                            {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                        </div>
                                                        <span className="truncate flex-1">{npc.display_name}</span>
                                                        <span className="text-[9px] text-gray-600 flex-shrink-0">{teamPath}</span>
                                                    </div>
                                                );
                                            })}
                                            {filteredNPCs.length === 0 && (
                                                <div className="px-2 py-3 text-xs text-gray-500 text-center">No NPCs found</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative h-full">
                                <textarea
                                    value={localInput}
                                    onChange={(e) => setLocalInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (!isStreaming && e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();

                                            const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                            if (shouldBroadcast) {
                                                onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                            } else {
                                                handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, disableThinking, genParams, inputText: localInput, uploadedFiles, contextFiles, paneId });
                                                setLocalInput('');
                                                setUploadedFiles([]);
                                                setUsedVoiceInput(false);
                                            }
                                        }
                                    }}
                                    onPaste={handlePaste}
                                    placeholder="Type a message..."
                                    className="w-full h-full theme-input text-sm rounded-lg pl-3 pr-16 py-2 focus:outline-none border-0 resize-none"
                                />
                            </div>

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

                        {isStreaming ? (
                            <button onClick={handleInterruptStream} className="theme-button-danger text-white rounded-lg px-3 py-2 text-sm flex items-center gap-1 flex-shrink-0 self-end">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {

                                    const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                    if (shouldBroadcast && canSend) {
                                        onBroadcast(selectedModels, selectedNPCs, localInput, uploadedFiles); setLocalInput(''); setUploadedFiles([]);
                                    } else {
                                        handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, disableThinking, genParams, inputText: localInput, uploadedFiles, mcpServerPath, selectedMcpTools, contextFiles, paneId });
                                        setLocalInput('');
                                        setUploadedFiles([]);
                                        setUsedVoiceInput(false);
                                    }
                                }}
                                disabled={!canSend}
                                className={`text-white rounded-lg px-3 py-2 text-sm flex items-center gap-1 flex-shrink-0 self-end disabled:opacity-50 ${
                                    selectedModels.length > 1 || selectedNPCs.length > 1
                                        ? 'bg-purple-600 hover:bg-purple-500'
                                        : 'theme-button-success'
                                }`}
                                title={selectedModels.length > 1 || selectedNPCs.length > 1
                                    ? `Send to ${selectedModels.length * selectedNPCs.length} combinations`
                                    : 'Send message'}
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
                        )}
                    </div>
                </div>


                <div className={`px-1.5 py-1 relative z-50 ${isStreaming ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-1">
                    <div className="relative flex-1 min-w-0" ref={modelsDropdownRef}>
                        <button
                            className={`w-full h-9 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                selectedModels.length > 1
                                    ? 'bg-gradient-to-br from-blue-500/30 to-indigo-600/30 text-blue-200 border border-blue-400/40'
                                    : 'theme-bg-secondary theme-text-secondary theme-border border theme-hover'
                            }`}
                            disabled={modelsLoading || !!modelsError}
                            onClick={() => { setShowModelsDropdown(!showModelsDropdown); setShowNpcsDropdown(false); setShowJinxDropdown(false); }}
                        >
                            {selectedModels.length > 1 && (
                                <span className="w-5 h-5 rounded bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">{selectedModels.length}</span>
                            )}
                            <span className="truncate">
                                {modelsLoading ? '...' : modelsError ? 'Error' :
                                    selectedModels.length === 1 ? ((modelsToDisplay.find((m: any) => m.value === selectedModels[0])?.display_name || selectedModels[0]).split(' | ')[0]) : selectedModels.length === 0 ? 'Model' : 'Models'
                                }
                            </span>
                            <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showModelsDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showModelsDropdown && !modelsLoading && !modelsError && (
                            <div className="absolute z-[100] left-0 right-0 bottom-full mb-1 theme-bg-primary backdrop-blur-xl theme-border border rounded-lg shadow-2xl overflow-hidden w-72">
                                <div className="px-2 py-1.5 border-b theme-border">
                                    <input
                                        ref={modelSearchRef}
                                        type="text"
                                        value={modelSearch}
                                        onChange={(e) => setModelSearch(e.target.value)}
                                        placeholder="Search models..."
                                        className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                                        onKeyDown={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div className="px-2 py-1 border-b theme-border flex items-center justify-between">
                                    <button
                                        onClick={() => setBroadcastMode(!broadcastMode)}
                                        className={`text-[9px] px-1.5 py-0.5 rounded ${broadcastMode ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {broadcastMode ? '● Multi' : '○ Single'}
                                    </button>
                                    <div className="flex gap-2">
                                        {broadcastMode && <button onClick={() => setSelectedModels(filteredModels.map((m: any) => m.value))} className="text-[9px] text-blue-400 hover:text-blue-300">All</button>}
                                        <button onClick={() => setSelectedModels(currentModel ? [currentModel] : [])} className="text-[9px] text-gray-400 hover:text-gray-300">Reset</button>
                                        <button onClick={() => toggleFavoriteModel(currentModel)} className={`${favoriteModels.has(currentModel) ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}><Star size={10} /></button>
                                        <button onClick={() => setShowAllModels(!showAllModels)} className={`${!showAllModels && favoriteModels.size > 0 ? 'text-blue-400' : 'text-gray-500'}`}><ListFilter size={10} /></button>
                                    </div>
                                </div>
                                <div className="max-h-64 overflow-y-auto p-1">
                                    {filteredModels.map((m: any, idx: number) => {
                                        const checked = selectedModels.includes(m.value);
                                        return (
                                            <div key={`${m.value}-${idx}`} className={`px-2 py-1.5 text-xs rounded cursor-pointer flex items-center gap-2 transition-all ${checked ? 'bg-blue-500/20 text-blue-200' : 'hover:bg-white/5'}`}
                                                onClick={() => {
                                                    if (broadcastMode) {

                                                        setSelectedModels(prev => prev.includes(m.value) ? (prev.length === 1 ? prev : prev.filter(x => x !== m.value)) : [...prev, m.value]);
                                                    } else {

                                                        setSelectedModels([m.value]);
                                                    }
                                                    if (!checked) { setCurrentModel(m.value); if (m.provider) setCurrentProvider(m.provider); }
                                                }}>
                                                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                                                    {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <span className="truncate flex-1">{m.display_name}</span>
                                                {m.provider && <span className="text-[9px] text-gray-600 flex-shrink-0">{m.provider}</span>}
                                                {favoriteModels.has(m.value) && <Star size={9} className="text-yellow-400 flex-shrink-0" />}
                                            </div>
                                        );
                                    })}
                                    {filteredModels.length === 0 && (
                                        <div className="px-2 py-3 text-xs text-gray-500 text-center">No models found</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative flex-1 min-w-0" ref={tempDropdownRef}>
                        <button
                            className="w-full h-8 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-200 theme-bg-tertiary theme-text-secondary border theme-border hover:opacity-80 px-2"
                            onClick={() => { setShowTempDropdown(!showTempDropdown); setShowModelsDropdown(false); setShowTopPDropdown(false); setShowTopKDropdown(false); setShowMaxTokensDropdown(false); }}
                        >
                            <span style={{ color: getParamColor(genParams.temperature, 0, 2) }}>T{genParams.temperature}</span>
                            <ChevronDown size={8} className="theme-text-muted" />
                        </button>
                        {showTempDropdown && (
                            <div className="absolute z-[100] right-0 bottom-full mb-1 theme-bg-secondary backdrop-blur-xl border theme-border rounded-lg shadow-2xl overflow-hidden w-48 p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] theme-text-muted">Temperature</label>
                                    <input type="number" value={genParams.temperature} onChange={(e) => setGenParams(p => ({ ...p, temperature: Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)) }))} className="w-14 text-xs theme-bg-tertiary border theme-border rounded px-1.5 py-0.5 text-right theme-text-primary" step="0.1" min="0" max="2" />
                                </div>
                                <input type="range" value={genParams.temperature} onChange={(e) => setGenParams(p => ({ ...p, temperature: parseFloat(e.target.value) }))} className="w-full h-1.5 theme-bg-tertiary rounded-lg appearance-none cursor-pointer accent-orange-500" min="0" max="2" step="0.1" />
                                <div className="flex justify-between text-[9px] theme-text-muted mt-0.5"><span>Precise</span><span>Creative</span></div>
                            </div>
                        )}
                    </div>
                    <div className="relative flex-1 min-w-0" ref={topPDropdownRef}>
                        <button
                            className="w-full h-8 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-200 theme-bg-tertiary theme-text-secondary border theme-border hover:opacity-80 px-2"
                            onClick={() => { setShowTopPDropdown(!showTopPDropdown); setShowModelsDropdown(false); setShowTempDropdown(false); setShowTopKDropdown(false); setShowMaxTokensDropdown(false); }}
                        >
                            <span style={{ color: getParamColor(genParams.top_p, 0, 1) }}>P{genParams.top_p}</span>
                            <ChevronDown size={8} className="theme-text-muted" />
                        </button>
                        {showTopPDropdown && (
                            <div className="absolute z-[100] right-0 bottom-full mb-1 theme-bg-secondary backdrop-blur-xl border theme-border rounded-lg shadow-2xl overflow-hidden w-48 p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] theme-text-muted">Top P</label>
                                    <input type="number" value={genParams.top_p} onChange={(e) => setGenParams(p => ({ ...p, top_p: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) }))} className="w-14 text-xs theme-bg-tertiary border theme-border rounded px-1.5 py-0.5 text-right theme-text-primary" step="0.05" min="0" max="1" />
                                </div>
                                <input type="range" value={genParams.top_p} onChange={(e) => setGenParams(p => ({ ...p, top_p: parseFloat(e.target.value) }))} className="w-full h-1.5 theme-bg-tertiary rounded-lg appearance-none cursor-pointer accent-blue-500" min="0" max="1" step="0.05" />
                            </div>
                        )}
                    </div>
                    <div className="relative flex-1 min-w-0" ref={topKDropdownRef}>
                        <button
                            className="w-full h-8 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-200 theme-bg-tertiary theme-text-secondary border theme-border hover:opacity-80 px-2"
                            onClick={() => { setShowTopKDropdown(!showTopKDropdown); setShowModelsDropdown(false); setShowTempDropdown(false); setShowTopPDropdown(false); setShowMaxTokensDropdown(false); }}
                        >
                            <span style={{ color: getParamColor(genParams.top_k, 1, 100) }}>K{genParams.top_k}</span>
                            <ChevronDown size={8} className="theme-text-muted" />
                        </button>
                        {showTopKDropdown && (
                            <div className="absolute z-[100] right-0 bottom-full mb-1 theme-bg-secondary backdrop-blur-xl border theme-border rounded-lg shadow-2xl overflow-hidden w-48 p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] theme-text-muted">Top K</label>
                                    <input type="number" value={genParams.top_k} onChange={(e) => setGenParams(p => ({ ...p, top_k: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))} className="w-14 text-xs theme-bg-tertiary border theme-border rounded px-1.5 py-0.5 text-right theme-text-primary" step="1" min="1" max="100" />
                                </div>
                                <input type="range" value={genParams.top_k} onChange={(e) => setGenParams(p => ({ ...p, top_k: parseInt(e.target.value) }))} className="w-full h-1.5 theme-bg-tertiary rounded-lg appearance-none cursor-pointer accent-green-500" min="1" max="100" step="1" />
                            </div>
                        )}
                    </div>
                    <div className="relative flex-1 min-w-0" ref={maxTokensDropdownRef}>
                        <button
                            className="w-full h-8 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-200 theme-bg-tertiary theme-text-secondary border theme-border hover:opacity-80 px-2"
                            onClick={() => { setShowMaxTokensDropdown(!showMaxTokensDropdown); setShowModelsDropdown(false); setShowTempDropdown(false); setShowTopPDropdown(false); setShowTopKDropdown(false); }}
                        >
                            <span style={{ color: getParamColor(genParams.max_tokens, 256, 32000) }}>M{genParams.max_tokens}</span>
                            <ChevronDown size={8} className="theme-text-muted" />
                        </button>
                        {showMaxTokensDropdown && (
                            <div className="absolute z-[100] right-0 bottom-full mb-1 theme-bg-secondary backdrop-blur-xl border theme-border rounded-lg shadow-2xl overflow-hidden w-48 p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] theme-text-muted">Max Tokens</label>
                                    <input type="number" value={genParams.max_tokens} onChange={(e) => setGenParams(p => ({ ...p, max_tokens: Math.max(1, Math.min(32000, parseInt(e.target.value) || 1)) }))} className="w-16 text-xs theme-bg-tertiary border theme-border rounded px-1.5 py-0.5 text-right theme-text-primary" step="256" min="1" max="32000" />
                                </div>
                                <input type="range" value={genParams.max_tokens} onChange={(e) => setGenParams(p => ({ ...p, max_tokens: parseInt(e.target.value) }))} className="w-full h-1.5 theme-bg-tertiary rounded-lg appearance-none cursor-pointer accent-purple-500" min="256" max="32000" step="256" />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-0.5 pl-1 border-l theme-border ml-1">
                        {(() => {
                            const m = currentModel?.toLowerCase() || '';
                            const supportsThinking = m.includes('claude') || m.includes('deepseek-r1') || m.includes('o1') || m.includes('o3') || m.includes('qwq') || m.includes('gemini');
                            if (!supportsThinking) return null;
                            return (
                                <button
                                    onClick={() => setDisableThinking(!disableThinking)}
                                    className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                                        !disableThinking
                                            ? 'bg-gradient-to-br from-violet-500/30 to-purple-600/30 text-violet-300 border border-violet-500/40'
                                            : 'bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={disableThinking ? "Thinking disabled — click to enable" : "Thinking enabled — click to disable"}
                                >
                                    <BrainCircuit size={14} />
                                </button>
                            );
                        })()}
                        <button
                            onClick={() => setUseKgSearch(!useKgSearch)}
                            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                                useKgSearch
                                    ? 'bg-gradient-to-br from-green-500/30 to-emerald-600/30 text-emerald-300 border border-green-500/40'
                                    : 'bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300 hover:bg-white/10'
                            }`}
                            title={useKgSearch ? "KG Search enabled" : "Enable Knowledge Graph search"}
                        >
                            <KgIcon size={14} />
                        </button>
                        <button
                            onClick={() => setUseMemorySearch(!useMemorySearch)}
                            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                                useMemorySearch
                                    ? 'bg-gradient-to-br from-amber-500/30 to-orange-600/30 text-amber-300 border border-amber-500/40'
                                    : 'bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300 hover:bg-white/10'
                            }`}
                            title={useMemorySearch ? "Memory Search enabled" : "Enable Memory search"}
                        >
                            <MemoryIcon size={14} />
                        </button>
                    </div>
                </div>
                </div>

            </div>
        </div>
    );
};

export default ChatInput;
