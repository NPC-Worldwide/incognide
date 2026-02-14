import { getFileName } from './utils';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BACKEND_URL } from '../config';
import {
    Send, Paperclip, Maximize2, ChevronDown, Star, ListFilter, FolderTree, Minimize2, Mic, MicOff, Volume2, GitBranch, SlidersHorizontal, Save, Trash2, Zap, X,
    FileCode, Globe, FileText, Terminal as TerminalIcon, Eye, EyeOff, ToggleLeft, ToggleRight
} from 'lucide-react';
import MemoryIcon from './MemoryIcon';
import ContextFilesPanel from './ContextFilesPanel';

// Blue-white-red color interpolation based on relative value position
const getParamColor = (value: number, min: number, max: number): string => {
    // Normalize value to 0-1 range
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

    // Blue (low) -> White (mid) -> Red (high)
    if (t <= 0.5) {
        // Blue to White: interpolate from blue (59, 130, 246) to white (255, 255, 255)
        const factor = t * 2; // 0 to 1 for first half
        const r = Math.round(59 + (255 - 59) * factor);
        const g = Math.round(130 + (255 - 130) * factor);
        const b = Math.round(246 + (255 - 246) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        // White to Red: interpolate from white (255, 255, 255) to red (239, 68, 68)
        const factor = (t - 0.5) * 2; // 0 to 1 for second half
        const r = Math.round(255 + (239 - 255) * factor);
        const g = Math.round(255 + (68 - 255) * factor);
        const b = Math.round(255 + (68 - 255) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    }
};

interface ChatInputProps {
    paneId: string;
    // Input state
    input: string;
    setInput: (val: string) => void;
    inputHeight: number;
    setInputHeight: (val: number) => void;
    isInputMinimized: boolean;
    setIsInputMinimized: (val: boolean) => void;
    isInputExpanded: boolean;
    setIsInputExpanded: (val: boolean) => void;
    isResizingInput: boolean;
    setIsResizingInput: (val: boolean) => void;
    // Streaming
    isStreaming: boolean;
    handleInputSubmit: (e: any, options?: { voiceInput?: boolean; genParams?: { temperature: number; top_p: number; top_k: number; max_tokens: number } }) => void;
    handleInterruptStream: () => void;
    // Files
    uploadedFiles: any[];
    setUploadedFiles: (fn: any) => void;
    contextFiles: any[];
    setContextFiles: (fn: any) => void;
    contextFilesCollapsed: boolean;
    setContextFilesCollapsed: (val: boolean) => void;
    currentPath: string;
    // Pane context auto-include
    autoIncludeContext: boolean;
    setAutoIncludeContext: (val: boolean) => void;
    contextPaneOverrides: Record<string, boolean>;
    setContextPaneOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    contentDataRef: React.MutableRefObject<any>;
    paneVersion?: number;
    // Execution mode
    executionMode: string;
    setExecutionMode: (val: string) => void;
    selectedJinx: any;
    setSelectedJinx: (val: any) => void;
    jinxInputValues: any;
    setJinxInputValues: (fn: any) => void;
    jinxsToDisplay: any[];
    showJinxDropdown: boolean;
    setShowJinxDropdown: (val: boolean) => void;
    // Models
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
    // NPCs
    availableNPCs: any[];
    npcsLoading: boolean;
    npcsError: any;
    currentNPC: string;
    setCurrentNPC: (val: string) => void;
    // Multi-select for broadcast
    selectedModels: string[];
    setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>;
    selectedNPCs: string[];
    setSelectedNPCs: React.Dispatch<React.SetStateAction<string[]>>;
    // Broadcast mode toggle
    broadcastMode: boolean;
    setBroadcastMode: (val: boolean) => void;
    // MCP
    availableMcpServers: any[];
    mcpServerPath: string;
    setMcpServerPath: (val: string) => void;
    selectedMcpTools: string[];
    setSelectedMcpTools: (fn: any) => void;
    availableMcpTools: any[];
    setAvailableMcpTools: (val: any[]) => void;
    mcpToolsLoading: boolean;
    setMcpToolsLoading: (val: boolean) => void;
    mcpToolsError: any;
    setMcpToolsError: (val: any) => void;
    showMcpServersDropdown: boolean;
    setShowMcpServersDropdown: (fn: any) => void;
    // Conversation
    activeConversationId: string | null;
    // Pane activation
    onFocus?: () => void;
    // Open file in pane
    onOpenFile?: (path: string) => void;
    // Multi-model broadcast
    onBroadcast?: (models: string[], npcs: string[]) => void;
}

const ChatInput: React.FC<ChatInputProps> = (props) => {
    const {
        paneId,
        input, setInput, inputHeight, setInputHeight,
        isInputMinimized, setIsInputMinimized, isInputExpanded, setIsInputExpanded,
        isResizingInput, setIsResizingInput,
        isStreaming, handleInputSubmit, handleInterruptStream,
        uploadedFiles, setUploadedFiles, contextFiles, setContextFiles,
        contextFilesCollapsed, setContextFilesCollapsed, currentPath,
        autoIncludeContext, setAutoIncludeContext,
        contextPaneOverrides, setContextPaneOverrides, contentDataRef, paneVersion,
        executionMode, setExecutionMode, selectedJinx, setSelectedJinx,
        jinxInputValues, setJinxInputValues, jinxsToDisplay,
        showJinxDropdown, setShowJinxDropdown,
        availableModels, modelsLoading, modelsError, currentModel, setCurrentModel,
        currentProvider, setCurrentProvider, favoriteModels, toggleFavoriteModel,
        showAllModels, setShowAllModels, modelsToDisplay, ollamaToolModels, setError,
        availableNPCs, npcsLoading, npcsError, currentNPC, setCurrentNPC,
        selectedModels, setSelectedModels, selectedNPCs, setSelectedNPCs,
        broadcastMode, setBroadcastMode,
        availableMcpServers, mcpServerPath, setMcpServerPath,
        selectedMcpTools, setSelectedMcpTools, availableMcpTools, setAvailableMcpTools,
        mcpToolsLoading, setMcpToolsLoading, mcpToolsError, setMcpToolsError,
        showMcpServersDropdown, setShowMcpServersDropdown,
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

    // Multi-select dropdowns for broadcasting to multiple models/NPCs
    // selectedModels and selectedNPCs now come from props (persisted at Enpistu level)
    const [showModelsDropdown, setShowModelsDropdown] = useState(false);
    const [showNpcsDropdown, setShowNpcsDropdown] = useState(false);
    const modelsDropdownRef = useRef<HTMLDivElement>(null);
    // Search filters for dropdowns
    const [modelSearch, setModelSearch] = useState('');
    const [npcSearch, setNpcSearch] = useState('');
    const [jinxSearch, setJinxSearch] = useState('');
    const modelSearchRef = useRef<HTMLInputElement>(null);
    const npcSearchRef = useRef<HTMLInputElement>(null);
    const jinxSearchRef = useRef<HTMLInputElement>(null);

    // KG/Memory search toggles
    const [useKgSearch, setUseKgSearch] = useState(() => {
        try { return localStorage.getItem('incognide-use-kg-search') === 'true'; } catch { return false; }
    });
    const [useMemorySearch, setUseMemorySearch] = useState(() => {
        try { return localStorage.getItem('incognide-use-memory-search') === 'true'; } catch { return false; }
    });

    // Persist KG/Memory toggles
    useEffect(() => {
        try { localStorage.setItem('incognide-use-kg-search', String(useKgSearch)); } catch {}
    }, [useKgSearch]);
    useEffect(() => {
        try { localStorage.setItem('incognide-use-memory-search', String(useMemorySearch)); } catch {}
    }, [useMemorySearch]);

    // Generation parameters
    const [genParams, setGenParams] = useState({
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        max_tokens: 4096
    });
    const [showParamsDropdown, setShowParamsDropdown] = useState(false);
    const paramsDropdownRef = useRef<HTMLDivElement>(null);
    const [showJinxConfigDropdown, setShowJinxConfigDropdown] = useState(false);
    const jinxConfigDropdownRef = useRef<HTMLDivElement>(null);
    const [customPresets, setCustomPresets] = useState<{name: string, params: typeof genParams}[]>(() => {
        try {
            const saved = localStorage.getItem('incognide-gen-presets');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [newPresetName, setNewPresetName] = useState('');
    const npcsDropdownRef = useRef<HTMLDivElement>(null);

    // Jinx auto-detection when typing /jinxname
    const [detectedJinxes, setDetectedJinxes] = useState<any[]>([]);
    const [showJinxSuggestion, setShowJinxSuggestion] = useState(false);
    const firstJinxInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Detect /jinxname pattern in input and suggest loading it
    useEffect(() => {
        const isCurrentlyJinxMode = executionMode !== 'chat' && executionMode !== 'tool_agent' && selectedJinx;
        if (!input || isCurrentlyJinxMode) {
            setDetectedJinxes([]);
            setShowJinxSuggestion(false);
            return;
        }

        // Check if input starts with /something
        const match = input.match(/^\/(\S+)/);
        if (match) {
            const jinxName = match[1].toLowerCase();
            // Find ALL matching jinxs
            const matches = jinxsToDisplay.filter((j: any) =>
                j.name.toLowerCase() === jinxName ||
                j.name.toLowerCase().startsWith(jinxName)
            );
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
    }, [input, jinxsToDisplay, executionMode, selectedJinx]);

    // Focus first jinx input after loading a jinx
    useEffect(() => {
        const isCurrentlyJinxMode = executionMode !== 'chat' && executionMode !== 'tool_agent' && selectedJinx;
        if (isCurrentlyJinxMode) {
            // Wait for DOM to render the inputs, then focus
            const timer = setTimeout(() => {
                if (firstJinxInputRef.current) {
                    firstJinxInputRef.current.focus();
                }
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [executionMode, selectedJinx]);

    // Note: selectedModels/selectedNPCs sync is now handled at Enpistu level

    // Close MCP dropdown on ESC or click outside
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

    // Close model/NPC dropdowns on ESC or click outside
    useEffect(() => {
        if (!showModelsDropdown && !showNpcsDropdown && !showParamsDropdown && !showJinxConfigDropdown) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowModelsDropdown(false);
                setShowNpcsDropdown(false);
                setShowParamsDropdown(false);
                setShowJinxConfigDropdown(false);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (showModelsDropdown && modelsDropdownRef.current && !modelsDropdownRef.current.contains(e.target as Node)) {
                setShowModelsDropdown(false);
            }
            if (showNpcsDropdown && npcsDropdownRef.current && !npcsDropdownRef.current.contains(e.target as Node)) {
                setShowNpcsDropdown(false);
            }
            if (showParamsDropdown && paramsDropdownRef.current && !paramsDropdownRef.current.contains(e.target as Node)) {
                setShowParamsDropdown(false);
            }
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
    }, [showModelsDropdown, showNpcsDropdown, showParamsDropdown, showJinxConfigDropdown]);

    const isJinxMode = executionMode !== 'chat' && executionMode !== 'tool_agent' && selectedJinx;
    const jinxInputsForSelected = isJinxMode ? (jinxInputValues[selectedJinx.name] || {}) : {};
    const hasJinxContent = isJinxMode && Object.values(jinxInputsForSelected).some((val: any) => val !== null && String(val).trim());

    // Filtered lists for searchable dropdowns
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

    const filteredJinxs = useMemo(() => {
        if (!jinxSearch.trim()) return jinxsToDisplay;
        const q = jinxSearch.toLowerCase();
        return jinxsToDisplay.filter((j: any) =>
            j.name?.toLowerCase().includes(q) || j.group?.toLowerCase().includes(q) || j.description?.toLowerCase().includes(q)
        );
    }, [jinxsToDisplay, jinxSearch]);

    // Auto-focus search inputs when dropdowns open
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

    // Parse jinx inputs and separate into config (has defaults) vs required (no defaults)
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
                // Convert to string safely - handles numbers, objects, etc.
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

    // Helper to get placeholder hints for jinx inputs
    const getInputPlaceholder = (name: string): string => {
        const n = name.toLowerCase();
        if (n.includes('path') || n.includes('file') || n.includes('dir')) return `e.g. ~/documents/file.txt`;
        if (n.includes('url') || n.includes('link')) return `e.g. https://example.com`;
        if (n.includes('model')) return `e.g. gpt-4, llama3.2`;
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

    // Calculate minimum height for jinx inputs - use 2 cols max, scrollable for many inputs
    const jinxMinHeight = useMemo(() => {
        if (!isJinxMode) return 140; // Chat mode base
        if (jinxRequiredInputs.length === 0) return 140; // No required inputs
        const hasTextArea = jinxRequiredInputs.some((inp: any) =>
            ['code', 'prompt', 'query', 'content', 'text', 'command', 'description'].includes(inp.name.toLowerCase())
        );
        const inputCount = jinxRequiredInputs.length;
        // Max 2 columns for readability
        const cols = inputCount <= 3 ? 1 : 2;
        const rows = Math.ceil(inputCount / cols);
        // 90px per input row (label + input + gap), 120px for textarea
        const inputsHeight = (rows * 90) + (hasTextArea ? 120 : 0);
        // 100px base for selector rows + padding
        return Math.min(100 + inputsHeight, 550);
    }, [isJinxMode, jinxRequiredInputs]);

    // Auto-adjust height when jinx mode changes or inputs change
    useEffect(() => {
        if (jinxMinHeight > inputHeight) {
            setInputHeight(jinxMinHeight);
        }
    }, [jinxMinHeight]);

    const inputStr = typeof input === 'string' ? input : '';
    const hasContextFiles = contextFiles.length > 0;
    const hasInputContent = inputStr.trim() || uploadedFiles.length > 0 || hasJinxContent || hasContextFiles;
    const canSend = !isStreaming && hasInputContent && (activeConversationId || isJinxMode);

    // Auto-clear recording error after 3 seconds
    useEffect(() => {
        if (recordingError) {
            const timer = setTimeout(() => setRecordingError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recordingError]);

    // Start voice recording
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
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());

                if (audioChunksRef.current.length === 0) return;

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                // Convert to base64
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64Audio = (reader.result as string).split(',')[1];

                    try {
                        // Send to STT API
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
                            // Append transcribed text to input
                            const newText = input ? `${input} ${result.text}` : result.text;
                            setInput(newText);
                            // Mark that voice input was used
                            setUsedVoiceInput(true);
                        }
                    } catch (err: any) {
                        setRecordingError(err.message || 'STT request failed');
                    }
                };
                reader.readAsDataURL(audioBlob);
            };

            mediaRecorder.start(100); // Collect data every 100ms
            setIsRecording(true);
        } catch (err: any) {
            setRecordingError(err.message || 'Microphone access denied');
        }
    };

    // Stop voice recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    // Toggle recording
    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Resizing handler for input height within pane
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

        // Check for sidebar file drag
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
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

        // Regular file drops - include path like paperclip does
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

    // Handle paste - images and large text become file attachments
    const handlePaste = async (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        // Check for images in clipboard
        const items = Array.from(clipboardData.items);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (imageItem) {
            e.preventDefault();
            const blob = imageItem.getAsFile();
            if (blob) {
                const timestamp = Date.now();
                const ext = imageItem.type.split('/')[1] || 'png';
                const fileName = `pasted-image-${timestamp}.${ext}`;

                // Create object URL for preview
                const preview = URL.createObjectURL(blob);

                // Save to temp file via API and get path
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
                        // Still add with blob URL even if temp save fails
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
                setInput(input + text);
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

    // Context pane chips - inline display of open panes with toggle
    // Recompute whenever paneVersion changes (triggered by layout changes)
    const openPanes = useMemo(() => {
        if (!contentDataRef?.current) return [];
        const panes: Array<{ id: string; type: string; label: string }> = [];
        Object.entries(contentDataRef.current).forEach(([paneId, paneData]: [string, any]) => {
            if (!paneData.contentType || paneData.contentType === 'chat') return;
            if (!['editor', 'browser', 'pdf', 'terminal', 'latex', 'csv', 'image', 'notebook'].includes(paneData.contentType)) return;
            let label = '';
            if ((paneData.contentType === 'editor' || paneData.contentType === 'latex' || paneData.contentType === 'csv' || paneData.contentType === 'notebook') && paneData.contentId) label = getFileName(paneData.contentId) || paneData.contentId;
            else if (paneData.contentType === 'browser' && paneData.browserUrl) { try { label = new URL(paneData.browserUrl).hostname; } catch { label = paneData.browserUrl.slice(0, 20); } }
            else if (paneData.contentType === 'pdf' && paneData.contentId) label = getFileName(paneData.contentId) || 'PDF';
            else if (paneData.contentType === 'image' && paneData.contentId) label = getFileName(paneData.contentId) || 'Image';
            else if (paneData.contentType === 'terminal') label = `Term${paneData.shellType ? ` (${paneData.shellType})` : ''}`;
            else label = paneData.contentType;
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
        switch (type) {
            case 'editor': return <FileCode size={10} className="flex-shrink-0" />;
            case 'browser': return <Globe size={10} className="flex-shrink-0" />;
            case 'pdf': return <FileText size={10} className="flex-shrink-0" />;
            case 'terminal': return <TerminalIcon size={10} className="flex-shrink-0" />;
            default: return null;
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
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (!isStreaming && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    // Auto-broadcast if multiple models/NPCs selected
                                    const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                    if (shouldBroadcast) {
                                        onBroadcast(selectedModels, selectedNPCs);
                                    } else {
                                        handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, genParams });
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
                                    onBroadcast(selectedModels, selectedNPCs);
                                } else {
                                    handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, genParams });
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
            {/* Resize handle */}
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); setIsResizingInput(true); }}
                style={{ backgroundColor: isResizingInput ? '#3b82f6' : 'transparent' }}
            />

            <div
                className="relative theme-bg-primary theme-border border rounded-lg group h-full flex flex-col m-2 overflow-visible z-[9999]"
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

                {/* Input area - moved above selectors */}
                <div className="flex-1 overflow-visible flex flex-col">
                    <ContextFilesPanel
                        isCollapsed={contextFilesCollapsed}
                        onToggleCollapse={() => setContextFilesCollapsed(!contextFilesCollapsed)}
                        contextFiles={contextFiles}
                        setContextFiles={setContextFiles}
                        currentPath={currentPath}
                    />
                    {renderAttachmentThumbnails()}
                    {renderContextPaneChips()}

                    <div className="flex-1 flex items-stretch p-2 gap-2">
                        <div className="flex-grow relative h-full">
                            {isJinxMode ? (
                                <div className="flex flex-col h-full">
                                    {/* Required inputs only (no defaults) - config inputs are in the settings dropdown */}
                                    <div className="flex-1 p-2 overflow-y-auto">
                                        {jinxRequiredInputs.length > 0 ? (
                                            <div className={`grid gap-4 ${
                                                jinxRequiredInputs.length <= 3 ? 'grid-cols-1' : 'grid-cols-2'
                                            }`}>
                                                {jinxRequiredInputs.map((inp: any, idx: number) => {
                                                    const isTextArea = ['code', 'prompt', 'query', 'content', 'text', 'command', 'description'].includes(inp.name.toLowerCase());
                                                    const isFirst = idx === 0;
                                                    const placeholder = getInputPlaceholder(inp.name);

                                                    return (
                                                        <div key={`${selectedJinx.name}-${inp.name}`} className={`relative ${isTextArea ? 'col-span-full' : ''}`}>
                                                            <label className="text-[10px] text-purple-400 uppercase mb-1 block font-medium tracking-wide">{inp.name}</label>
                                                            {isTextArea ? (
                                                                <textarea
                                                                    ref={isFirst ? firstJinxInputRef as any : undefined}
                                                                    tabIndex={idx + 1}
                                                                    value={jinxInputValues[selectedJinx.name]?.[inp.name] || ''}
                                                                    onChange={(e) => setJinxInputValues((prev: any) => ({
                                                                        ...prev,
                                                                        [selectedJinx.name]: { ...prev[selectedJinx.name], [inp.name]: e.target.value }
                                                                    }))}
                                                                    placeholder={placeholder}
                                                                    className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all resize-none placeholder-gray-500"
                                                                    rows={3}
                                                                    disabled={isStreaming}
                                                                />
                                                            ) : (
                                                                <input
                                                                    ref={isFirst ? firstJinxInputRef as any : undefined}
                                                                    tabIndex={idx + 1}
                                                                    type="text"
                                                                    value={jinxInputValues[selectedJinx.name]?.[inp.name] || ''}
                                                                    onChange={(e) => setJinxInputValues((prev: any) => ({
                                                                        ...prev,
                                                                        [selectedJinx.name]: { ...prev[selectedJinx.name], [inp.name]: e.target.value }
                                                                    }))}
                                                                    placeholder={placeholder}
                                                                    className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all placeholder-gray-500"
                                                                    disabled={isStreaming}
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                                {jinxConfigInputs.length > 0 ? 'Configure defaults above ↑' : 'No inputs'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="relative h-full">
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            // Handle Enter to load suggested jinx
                                            if (showJinxSuggestion && detectedJinxes.length > 0 && e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                const jinx = detectedJinxes[0];
                                                setExecutionMode(jinx.name);
                                                setSelectedJinx(jinx);
                                                setInput('');
                                                setShowJinxSuggestion(false);
                                                setDetectedJinxes([]);
                                                return;
                                            }
                                            if (!isStreaming && e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                // Auto-broadcast if multiple models/NPCs selected
                                                const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                                if (shouldBroadcast) {
                                                    onBroadcast(selectedModels, selectedNPCs);
                                                } else {
                                                    handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, genParams });
                                                    setUsedVoiceInput(false);
                                                }
                                            }
                                            // Escape to dismiss suggestion
                                            if (e.key === 'Escape' && showJinxSuggestion) {
                                                setShowJinxSuggestion(false);
                                                setDetectedJinxes([]);
                                            }
                                        }}
                                        onPaste={handlePaste}
                                        placeholder="Type a message... (use /jinx to run a jinx)"
                                        className="w-full h-full theme-input text-sm rounded-lg pl-3 pr-16 py-2 focus:outline-none border-0 resize-none"
                                    />
                                    {/* Jinx suggestion popup */}
                                    {showJinxSuggestion && detectedJinxes.length > 0 && (
                                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gradient-to-r from-purple-900/95 to-pink-900/95 backdrop-blur-xl border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden z-[100] max-h-48 overflow-y-auto">
                                            {detectedJinxes.map((jinx: any) => (
                                                <button
                                                    key={jinx.name}
                                                    onClick={() => {
                                                        setExecutionMode(jinx.name);
                                                        setSelectedJinx(jinx);
                                                        setInput('');
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
                                {/* Auto-include toggle */}
                                {openPanes.length > 0 && (
                                    <button
                                        onClick={() => setAutoIncludeContext?.(!autoIncludeContext)}
                                        className={`flex-shrink-0 p-0.5 rounded transition-colors ${autoIncludeContext ? 'text-green-400 hover:text-green-300' : 'text-gray-600 hover:text-gray-400'}`}
                                        title={autoIncludeContext ? 'Auto-include ON' : 'Auto-include OFF'}
                                    >
                                        {autoIncludeContext ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                    </button>
                                )}
                                {/* Pane context chips */}
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
                                {/* Mic */}
                                <button
                                    onClick={toggleRecording}
                                    disabled={isStreaming}
                                    className={`p-1 rounded theme-hover opacity-50 group-hover:opacity-100 ${isStreaming ? 'opacity-30' : ''} ${isRecording ? 'text-red-500 animate-pulse' : usedVoiceInput ? 'text-green-400' : 'theme-text-muted hover:theme-text-primary'}`}
                                    title={isRecording ? "Stop recording" : usedVoiceInput ? "Voice mode - response will be spoken" : "Start voice input"}
                                >
                                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                                {/* Attach */}
                                <button onClick={handleAttachFileClick} disabled={isStreaming} className={`p-1 theme-text-muted hover:theme-text-primary rounded theme-hover opacity-50 group-hover:opacity-100 ${isStreaming ? 'opacity-30' : ''}`} title="Attach file">
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
                                    // Auto-broadcast if multiple models/NPCs selected
                                    const shouldBroadcast = broadcastMode && onBroadcast && selectedModels.length > 0 && selectedNPCs.length > 0 && (selectedModels.length > 1 || selectedNPCs.length > 1);
                                    if (shouldBroadcast && canSend) {
                                        onBroadcast(selectedModels, selectedNPCs);
                                    } else {
                                        handleInputSubmit(e, { voiceInput: usedVoiceInput, useKgSearch, useMemorySearch, genParams });
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

                {/* Compact selector strip - now below input */}
                <div className={`px-1.5 py-1 relative z-50 ${isStreaming ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-1">
                    {/* Mode tile */}
                    <div className="relative flex-1">
                        <button
                            className={`w-full h-9 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                executionMode === 'chat'
                                    ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-300 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-blue-600/30'
                                    : executionMode === 'tool_agent'
                                    ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 text-amber-300 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-600/30'
                                    : 'bg-gradient-to-br from-purple-500/20 to-pink-600/20 text-pink-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-600/30'
                            }`}
                            onClick={() => { setShowJinxDropdown(!showJinxDropdown); setShowModelsDropdown(false); setShowNpcsDropdown(false); }}
                        >
                            <span className="truncate">
                                {executionMode === 'chat' ? '💬 Chat' : executionMode === 'tool_agent' ? '🛠 Agent' : (selectedJinx?.name || executionMode)}
                            </span>
                            <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showJinxDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showJinxDropdown && (
                            <div className="absolute z-[100] left-0 right-0 bottom-full mb-1 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden w-64">
                                <div className="px-2 py-1.5 border-b border-white/5">
                                    <input
                                        ref={jinxSearchRef}
                                        type="text"
                                        value={jinxSearch}
                                        onChange={(e) => setJinxSearch(e.target.value)}
                                        placeholder="Search modes & jinxs..."
                                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                                        onKeyDown={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {!jinxSearch.trim() && (
                                        <div className="p-1 border-b border-white/5">
                                            <div className="px-2 py-1.5 text-xs rounded cursor-pointer flex items-center gap-2 hover:bg-cyan-500/20 transition-colors" onClick={() => { setExecutionMode('chat'); setSelectedJinx(null); setShowJinxDropdown(false); }}>
                                                <span>💬</span><span>Chat</span>
                                            </div>
                                            <div className="px-2 py-1.5 text-xs rounded cursor-pointer flex items-center gap-2 hover:bg-amber-500/20 transition-colors" onClick={() => { setExecutionMode('tool_agent'); setSelectedJinx(null); setShowJinxDropdown(false); }}>
                                                <span>🛠</span><span>Agent</span>
                                            </div>
                                        </div>
                                    )}
                                    {jinxSearch.trim() ? (
                                        <div className="p-1">
                                            {filteredJinxs.length > 0 ? filteredJinxs.map((jinx: any) => (
                                                <div key={jinx.name} className="px-2 py-1.5 text-xs hover:bg-purple-500/20 rounded cursor-pointer transition-colors flex items-center justify-between" onClick={() => { setExecutionMode(jinx.name); setSelectedJinx(jinx); setShowJinxDropdown(false); }}>
                                                    <span>{jinx.name}</span>
                                                    <span className="text-[9px] text-gray-600">{jinx.group}</span>
                                                </div>
                                            )) : (
                                                <div className="px-2 py-3 text-xs text-gray-500 text-center">No matches for "{jinxSearch}"</div>
                                            )}
                                        </div>
                                    ) : (
                                        ['project', 'global'].map(origin => {
                                            const originJinxs = jinxsToDisplay.filter((j: any) => (j.origin || 'unknown') === origin);
                                            if (!originJinxs.length) return null;
                                            const grouped = originJinxs.reduce((acc: any, j: any) => { const g = j.group || 'root'; if (!acc[g]) acc[g] = []; acc[g].push(j); return acc; }, {});
                                            return (
                                                <div key={origin} className="border-t border-white/5">
                                                    <div className="px-2 py-1 text-[9px] uppercase text-gray-500">{origin === 'project' ? '📁 Project' : '🌐 Global'}</div>
                                                    {Object.entries(grouped).filter(([g]) => g.toLowerCase() !== 'modes').sort(([a], [b]) => a.localeCompare(b)).map(([gName, jinxs]: [string, any]) => (
                                                        <details key={`${origin}-${gName}`} className="px-1">
                                                            <summary className="px-2 py-1 text-xs cursor-pointer flex items-center gap-1 hover:bg-white/5 rounded"><FolderTree size={10} className="text-purple-400" /> {gName}</summary>
                                                            <div className="pl-4 pb-1">
                                                                {jinxs.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((jinx: any) => (
                                                                    <div key={jinx.name} className="px-2 py-1 text-xs hover:bg-purple-500/20 rounded cursor-pointer transition-colors" onClick={() => { setExecutionMode(jinx.name); setSelectedJinx(jinx); setShowJinxDropdown(false); }}>{jinx.name}</div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    ))}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Model tile - multi-select */}
                    <div className="relative flex-1" ref={modelsDropdownRef}>
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
                                                        // Multi-select: toggle
                                                        setSelectedModels(prev => prev.includes(m.value) ? (prev.length === 1 ? prev : prev.filter(x => x !== m.value)) : [...prev, m.value]);
                                                    } else {
                                                        // Single-select: replace
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

                    {/* NPC tile - multi-select */}
                    <div className="relative flex-1" ref={npcsDropdownRef}>
                        <button
                            className={`w-full h-9 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 ${
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
                            <div className="absolute z-[100] left-0 right-0 bottom-full mb-1 theme-bg-primary backdrop-blur-xl theme-border border rounded-lg shadow-2xl overflow-hidden w-64">
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
                                                        // Multi-select: toggle
                                                        setSelectedNPCs(prev => prev.includes(npcKey) ? (prev.length === 1 ? prev : prev.filter(x => x !== npcKey)) : [...prev, npcKey]);
                                                    } else {
                                                        // Single-select: replace
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

                    {/* Params tile OR Jinx Config tile when in jinx mode */}
                    {isJinxMode ? (
                        <div className="relative flex-1" ref={jinxConfigDropdownRef}>
                            <button
                                className="w-full h-8 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 px-2"
                                onClick={() => { setShowJinxConfigDropdown(!showJinxConfigDropdown); setShowModelsDropdown(false); setShowNpcsDropdown(false); setShowJinxDropdown(false); }}
                            >
                                <Zap size={10} className="flex-shrink-0 text-purple-400" />
                                <span className="text-[10px] text-purple-200 truncate">{selectedJinx.name} settings</span>
                                <ChevronDown size={10} className={`transition-transform flex-shrink-0 text-purple-400 ${showJinxConfigDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showJinxConfigDropdown && jinxConfigInputs.length > 0 && (
                                <div className="absolute z-[100] right-0 bottom-full mb-1 bg-black/95 backdrop-blur-xl border border-purple-500/30 rounded-lg shadow-2xl overflow-hidden w-80">
                                    <div className="px-3 py-2 border-b border-purple-500/20 flex items-center justify-between bg-gradient-to-r from-purple-900/30 to-pink-900/30">
                                        <span className="text-[10px] uppercase text-purple-300 font-medium flex items-center gap-1.5">
                                            <Zap size={10} /> {selectedJinx.name} Defaults
                                        </span>
                                        <span className="text-[9px] text-purple-500">{jinxConfigInputs.length} configurable</span>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                                        {jinxConfigInputs.map((inp: any) => {
                                            const currentVal = jinxInputValues[selectedJinx.name]?.[inp.name] ?? inp.defaultVal;
                                            return (
                                                <div key={inp.name}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-[11px] text-purple-300 font-medium">{inp.name}</label>
                                                        <span className="text-[9px] text-gray-600">default: {inp.defaultVal.length > 20 ? inp.defaultVal.slice(0, 18) + '…' : inp.defaultVal}</span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={currentVal}
                                                        onChange={(e) => setJinxInputValues((prev: any) => ({
                                                            ...prev,
                                                            [selectedJinx.name]: { ...prev[selectedJinx.name], [inp.name]: e.target.value }
                                                        }))}
                                                        className="w-full text-xs bg-white/5 border border-purple-500/20 rounded px-2 py-1.5 text-gray-200 focus:border-purple-500/50 focus:outline-none"
                                                        disabled={isStreaming}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="relative flex-1" ref={paramsDropdownRef}>
                            <button
                                className="w-full h-8 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-all duration-200 bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 px-2"
                                onClick={() => { setShowParamsDropdown(!showParamsDropdown); setShowModelsDropdown(false); setShowNpcsDropdown(false); setShowJinxDropdown(false); }}
                            >
                                <SlidersHorizontal size={10} className="flex-shrink-0 text-gray-500" />
                                <div className="flex items-center gap-1 text-[9px]">
                                    <span style={{ color: getParamColor(genParams.temperature, 0, 2) }}>T{genParams.temperature}</span>
                                    <span className="text-gray-600">·</span>
                                    <span style={{ color: getParamColor(genParams.top_p, 0, 1) }}>P{genParams.top_p}</span>
                                    <span className="text-gray-600">·</span>
                                    <span style={{ color: getParamColor(genParams.top_k, 1, 100) }}>K{genParams.top_k}</span>
                                </div>
                                <ChevronDown size={10} className={`transition-transform flex-shrink-0 text-gray-500 ${showParamsDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showParamsDropdown && (
                                <div className="absolute z-[100] right-0 bottom-full mb-1 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden w-72">
                                    <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] uppercase text-gray-500 font-medium flex items-center gap-1.5">
                                            <SlidersHorizontal size={10} /> Generation Parameters
                                        </span>
                                        <span className="text-[9px] text-gray-600">T:{genParams.temperature} P:{genParams.top_p} K:{genParams.top_k}</span>
                                    </div>
                                    <div className="p-3 space-y-3">
                                        {/* Temperature */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] text-gray-400">Temperature</label>
                                                <input
                                                    type="number"
                                                    value={genParams.temperature}
                                                    onChange={(e) => setGenParams(p => ({ ...p, temperature: Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)) }))}
                                                    className="w-14 text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-right text-gray-200"
                                                    step="0.1" min="0" max="2"
                                                />
                                            </div>
                                            <input type="range" value={genParams.temperature} onChange={(e) => setGenParams(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
                                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" min="0" max="2" step="0.1" />
                                            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5"><span>Precise</span><span>Creative</span></div>
                                        </div>

                                        {/* Top P */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] text-gray-400">Top P (nucleus)</label>
                                                <input type="number" value={genParams.top_p} onChange={(e) => setGenParams(p => ({ ...p, top_p: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) }))}
                                                    className="w-14 text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-right text-gray-200" step="0.05" min="0" max="1" />
                                            </div>
                                            <input type="range" value={genParams.top_p} onChange={(e) => setGenParams(p => ({ ...p, top_p: parseFloat(e.target.value) }))}
                                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" min="0" max="1" step="0.05" />
                                        </div>

                                        {/* Top K */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] text-gray-400">Top K</label>
                                                <input type="number" value={genParams.top_k} onChange={(e) => setGenParams(p => ({ ...p, top_k: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))}
                                                    className="w-14 text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-right text-gray-200" step="1" min="1" max="100" />
                                            </div>
                                            <input type="range" value={genParams.top_k} onChange={(e) => setGenParams(p => ({ ...p, top_k: parseInt(e.target.value) }))}
                                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500" min="1" max="100" step="1" />
                                        </div>

                                        {/* Max Tokens */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] text-gray-400">Max Tokens</label>
                                                <input type="number" value={genParams.max_tokens} onChange={(e) => setGenParams(p => ({ ...p, max_tokens: Math.max(1, Math.min(32000, parseInt(e.target.value) || 1)) }))}
                                                    className="w-16 text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-right text-gray-200" step="256" min="1" max="32000" />
                                            </div>
                                            <input type="range" value={genParams.max_tokens} onChange={(e) => setGenParams(p => ({ ...p, max_tokens: parseInt(e.target.value) }))}
                                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" min="256" max="32000" step="256" />
                                        </div>

                                        {/* Built-in Presets */}
                                        <div className="pt-2 border-t border-white/5">
                                            <div className="text-[10px] text-gray-500 uppercase mb-2">Presets</div>
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                <button onClick={() => setGenParams({ temperature: 0.3, top_p: 0.9, top_k: 40, max_tokens: 4096 })} className="px-2 py-1 text-[10px] bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30">Precise</button>
                                                <button onClick={() => setGenParams({ temperature: 0.7, top_p: 0.9, top_k: 40, max_tokens: 4096 })} className="px-2 py-1 text-[10px] bg-gray-500/20 text-gray-300 rounded hover:bg-gray-500/30">Balanced</button>
                                                <button onClick={() => setGenParams({ temperature: 1.0, top_p: 0.95, top_k: 60, max_tokens: 4096 })} className="px-2 py-1 text-[10px] bg-orange-500/20 text-orange-300 rounded hover:bg-orange-500/30">Creative</button>
                                                <button onClick={() => setGenParams({ temperature: 1.5, top_p: 1.0, top_k: 80, max_tokens: 8192 })} className="px-2 py-1 text-[10px] bg-pink-500/20 text-pink-300 rounded hover:bg-pink-500/30">Wild</button>
                                            </div>

                                            {/* Custom Presets */}
                                            {customPresets.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {customPresets.map((preset, i) => (
                                                        <div key={i} className="flex items-center gap-0.5 bg-cyan-500/20 rounded overflow-hidden">
                                                            <button onClick={() => setGenParams(preset.params)} className="px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/30">{preset.name}</button>
                                                            <button onClick={() => {
                                                                const updated = customPresets.filter((_, idx) => idx !== i);
                                                                setCustomPresets(updated);
                                                                localStorage.setItem('incognide-gen-presets', JSON.stringify(updated));
                                                            }} className="px-1 py-1 text-cyan-400 hover:bg-red-500/30 hover:text-red-300">
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Save new preset */}
                                            <div className="flex gap-1 mt-2">
                                                <input
                                                    type="text"
                                                    value={newPresetName}
                                                    onChange={(e) => setNewPresetName(e.target.value)}
                                                    placeholder="Preset name..."
                                                    className="flex-1 text-[10px] bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && newPresetName.trim()) {
                                                            const updated = [...customPresets, { name: newPresetName.trim(), params: { ...genParams } }];
                                                            setCustomPresets(updated);
                                                            localStorage.setItem('incognide-gen-presets', JSON.stringify(updated));
                                                            setNewPresetName('');
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (newPresetName.trim()) {
                                                            const updated = [...customPresets, { name: newPresetName.trim(), params: { ...genParams } }];
                                                            setCustomPresets(updated);
                                                            localStorage.setItem('incognide-gen-presets', JSON.stringify(updated));
                                                            setNewPresetName('');
                                                        }
                                                    }}
                                                    disabled={!newPresetName.trim()}
                                                    className="px-2 py-1 text-[10px] bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                                                >
                                                    <Save size={10} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* KG/Memory toggles */}
                    <div className="flex items-center gap-0.5 pl-1 border-l border-white/10 ml-1">
                        <button
                            onClick={() => setUseKgSearch(!useKgSearch)}
                            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                                useKgSearch
                                    ? 'bg-gradient-to-br from-green-500/30 to-emerald-600/30 text-emerald-300 border border-green-500/40'
                                    : 'bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300 hover:bg-white/10'
                            }`}
                            title={useKgSearch ? "KG Search enabled" : "Enable Knowledge Graph search"}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="6" cy="8" r="2.5" />
                                <circle cx="18" cy="6" r="2" />
                                <circle cx="12" cy="14" r="3" />
                                <circle cx="5" cy="18" r="2" />
                                <circle cx="19" cy="17" r="2.5" />
                                <line x1="8" y1="9" x2="10" y2="12" />
                                <line x1="16" y1="7" x2="14" y2="12" />
                                <line x1="7" y1="17" x2="9.5" y2="15.5" />
                                <line x1="14.5" y1="15.5" x2="17" y2="16" />
                                <line x1="7" y1="10" x2="5" y2="16" />
                            </svg>
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

{/* MCP tools for tool_agent mode */}
                {executionMode === 'tool_agent' && (
                    <div className="px-2 pb-1 border-t theme-border overflow-visible">
                        <div className="relative w-1/2" ref={mcpDropdownRef}>
                            <button
                                type="button"
                                className="theme-input text-xs w-full text-left px-2 py-1 flex items-center justify-between rounded border"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => setShowMcpServersDropdown((p: boolean) => !p)}
                            >
                                <span className="truncate">
                                    {`MCP Servers (${availableMcpServers.length})`}
                                </span>
                                <ChevronDown size={12} />
                            </button>
                            {showMcpServersDropdown && (
                                <div
                                    className="absolute z-[100] w-full bottom-full mb-1 bg-black/90 border theme-border rounded shadow-lg max-h-56 overflow-y-auto"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setShowMcpServersDropdown(false);
                                        }
                                    }}
                                    tabIndex={-1}
                                >
                                    {availableMcpServers.length === 0 && (
                                        <div className="px-2 py-1 text-xs theme-text-muted">No MCP servers in ctx</div>
                                    )}
                                    {/* Group by origin */}
                                    {[...new Set(availableMcpServers.map((s: any) => s.origin))].map(origin => {
                                        const serversForOrigin = availableMcpServers.filter((s: any) => s.origin === origin);
                                        if (serversForOrigin.length === 0) return null;
                                        const originLabel = origin?.startsWith('auto:') ? `🔄 ${origin.slice(5)}` : origin === 'global' ? '🌐 Global' : origin === 'project' ? '📁 Project' : origin;
                                        return (
                                            <div key={origin}>
                                                <div className="px-2 py-1 text-[10px] uppercase theme-text-muted border-b theme-border">
                                                    {originLabel}
                                                </div>
                                                {serversForOrigin.map((srv: any) => (
                                                    <div key={srv.serverPath} className="border-b theme-border last:border-b-0">
                                                        <div
                                                            className={`px-2 py-1 text-xs theme-hover cursor-pointer flex items-center justify-between ${srv.serverPath === mcpServerPath ? 'bg-blue-500/20' : ''}`}
                                                            onClick={() => {
                                                                setMcpServerPath(srv.serverPath);
                                                                setMcpToolsLoading(true);
                                                                (window as any).api.listMcpTools({ serverPath: srv.serverPath, currentPath }).then((res: any) => {
                                                                    setMcpToolsLoading(false);
                                                                    if (res.error) {
                                                                        setMcpToolsError(res.error);
                                                                        setAvailableMcpTools([]);
                                                                        setSelectedMcpTools([]);
                                                                    } else {
                                                                        setMcpToolsError(null);
                                                                        const tools = res.tools || [];
                                                                        setAvailableMcpTools(tools);
                                                                        // Default: ALL tools selected
                                                                        const allNames = tools.map((t: any) => t.function?.name).filter(Boolean);
                                                                        setSelectedMcpTools(allNames);
                                                                    }
                                                                });
                                                            }}
                                                        >
                                                            <span className="truncate">{getFileName(srv.serverPath)?.replace(/\.py$/, '') || srv.serverPath}</span>
                                                        </div>
                                                        {srv.serverPath === mcpServerPath && (
                                                            <div className="px-3 py-1 space-y-1">
                                                                {mcpToolsLoading && <div className="text-xs theme-text-muted">Loading MCP tools…</div>}
                                                                {mcpToolsError && <div className="text-xs text-red-400">Error: {mcpToolsError}</div>}
                                                                {!mcpToolsLoading && !mcpToolsError && (
                                                                    <div className="flex flex-col gap-1">
                                                                        {availableMcpTools.length === 0 && (
                                                                            <div className="text-xs theme-text-muted">No tools available.</div>
                                                                        )}
                                                                        {availableMcpTools.map((tool: any) => {
                                                                            const name = tool.function?.name || '';
                                                                            const desc = tool.function?.description || '';
                                                                            if (!name) return null;
                                                                            const checked = selectedMcpTools.includes(name);
                                                                            return (
                                                                                <details key={name} className="bg-black/30 border theme-border rounded px-2 py-1">
                                                                                    <summary className="flex items-center gap-2 text-xs theme-text-primary cursor-pointer">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={checked}
                                                                                            disabled={isStreaming}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            onChange={() => {
                                                                                                setSelectedMcpTools((prev: string[]) => {
                                                                                                    if (prev.includes(name)) {
                                                                                                        return prev.filter((n: string) => n !== name);
                                                                                                    }
                                                                                                    return [...prev, name];
                                                                                                });
                                                                                            }}
                                                                                        />
                                                                                        <span>{name}</span>
                                                                                    </summary>
                                                                                    <div className="ml-6 text-[11px] theme-text-muted whitespace-pre-wrap">
                                                                                        {desc || 'No description.'}
                                                                                    </div>
                                                                                </details>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ChatInput;
