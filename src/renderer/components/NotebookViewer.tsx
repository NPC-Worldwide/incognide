import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { BACKEND_URL } from '../config';
import { Save, Play, Plus, Trash2, ChevronDown, ChevronRight, X, Loader, Code2, FileText, Edit3, Circle, Zap, Square, Power, MessageSquare, Bot, BookOpen, Paperclip, Eye, EyeOff, Archive, Sparkles, RefreshCw, Table, Variable, ChevronLeft, SortAsc, SortDesc, Filter, Hash, Type, Database, ArrowUp, ArrowDown, PanelRightClose, PanelRight, Palette, Settings, Download, FileCode, FileType, PlayCircle, SkipBack, SkipForward } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import MarkdownRenderer from './MarkdownRenderer';

// Syntax highlighting style
const highlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: '#c678dd' },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e06c75' },
    { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
    { tag: [t.definition(t.name)], color: '#e5c07b' },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#d19a66' },
    { tag: [t.operator, t.operatorKeyword], color: '#56b6c2' },
    { tag: [t.meta, t.comment], color: '#7f848e', fontStyle: 'italic' },
    { tag: [t.string, t.inserted], color: '#98c379' },
    { tag: t.invalid, color: '#ff5555' },
]);

const editorTheme = EditorView.theme({
    '&': { fontSize: '13px', backgroundColor: '#1e1e2e' },
    '.cm-content': { fontFamily: '"Fira Code", monospace', padding: '8px 0' },
    '.cm-gutters': { backgroundColor: '#181825', color: '#6c7086', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(137, 180, 250, 0.08)' },
});

// Cell types: standard ipynb + incognb extensions
type CellType = 'code' | 'markdown' | 'raw' | 'chat' | 'jinx' | 'latex' | 'data';

// Paper state for incognb format
type PaperState = 'in_paper' | 'exploration' | 'discarded';

interface NotebookCell {
    cell_type: CellType;
    source: string[];
    outputs?: any[];
    execution_count?: number | null;
    metadata?: {
        // Standard metadata
        collapsed?: boolean;
        scrolled?: boolean;
        // Incognb extensions
        paper_state?: PaperState;
        paper_order?: number;
        paper_section?: string;
        decision_note?: string;
        // Chat cell metadata
        chat?: {
            model?: string;
            provider?: string;
            npc?: string;
            temperature?: number;
            maxTokens?: number;
        };
        // Jinx cell metadata
        jinx?: {
            name?: string;
            inputs?: Record<string, any>;
        };
        // Data cell metadata
        data?: {
            files?: Array<{
                name: string;
                hash: string;
                version: number;
                path: string;
                size: number;
                mime_type: string;
            }>;
        };
        // Timestamps
        created_at?: string;
        modified_at?: string;
        // Any other metadata
        [key: string]: any;
    };
}

interface Notebook {
    cells: NotebookCell[];
    metadata: any;
    nbformat: number;
    nbformat_minor: number;
}

const NotebookViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane,
    performSplit
}: any) => {
    const [notebook, setNotebook] = useState<Notebook | null>(null);
    const notebookRef = useRef<Notebook | null>(null);
    const kernelIdRef = useRef<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isExecuting, setIsExecuting] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [collapsedCells, setCollapsedCells] = useState<Set<number>>(new Set());
    const [editingMarkdownCell, setEditingMarkdownCell] = useState<number | null>(null);

    // Kernel state
    const [availableKernels, setAvailableKernels] = useState<Array<{name: string, displayName: string, language: string}>>([]);
    const [selectedKernel, setSelectedKernel] = useState<string>('python3');
    const [kernelId, setKernelId] = useState<string | null>(null);
    const [kernelStatus, setKernelStatus] = useState<'disconnected' | 'starting' | 'connected' | 'busy'>('disconnected');
    const [showKernelMenu, setShowKernelMenu] = useState(false);
    const [jupyterInstalled, setJupyterInstalled] = useState<boolean | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);
    const [pythonPath, setPythonPath] = useState<string>('python3');

    // Incognb state - models, NPCs, jinxs for chat/jinx cells
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [availableNPCs, setAvailableNPCs] = useState<any[]>([]);
    const [availableJinxs, setAvailableJinxs] = useState<any[]>([]);
    const [showAddCellMenu, setShowAddCellMenu] = useState<number | null>(null);

    // Variables panel state
    const [showVariablesPanel, setShowVariablesPanel] = useState(true);
    const [variables, setVariables] = useState<any[]>([]);
    const variablesRef = useRef<any[]>([]);
    const [variablesLoading, setVariablesLoading] = useState(false);
    const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());

    // Collapsed outputs state - track which cell outputs are collapsed
    const [collapsedOutputs, setCollapsedOutputs] = useState<Set<number>>(new Set());

    // Data Explorer state
    const [explorerVar, setExplorerVar] = useState<string | null>(null);
    const [explorerData, setExplorerData] = useState<any>(null);
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [explorerOffset, setExplorerOffset] = useState(0);
    const [explorerSort, setExplorerSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
    const [explorerFilter, setExplorerFilter] = useState('');
    const [showColumnStats, setShowColumnStats] = useState<string | null>(null);

    // Matplotlib configuration state
    const [showMplConfig, setShowMplConfig] = useState(false);
    const [mplConfig, setMplConfig] = useState({
        style: 'default',
        fontFamily: 'serif',
        fontSize: 10,
        labelSize: 20,
        tickSize: 20,
        usetex: false,  // Requires full LaTeX install (texlive-full + cm-super)
        cmap: 'plasma',
        figWidth: 6.4,
        figHeight: 4.8,
        dpi: 100,
        tickDirection: 'in',
        minorTicks: true,
        legendFrame: false,
        gridAxis: 'both'
    });
    const [mplConfigApplied, setMplConfigApplied] = useState(false);

    // Export state
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Streaming state for chat cells
    const [streamingCellIndex, setStreamingCellIndex] = useState<number | null>(null);
    const [streamingContent, setStreamingContent] = useState<string>('');
    const [streamingReasoningContent, setStreamingReasoningContent] = useState<string>('');
    const [streamingToolCalls, setStreamingToolCalls] = useState<any[]>([]);
    const streamingContentRef = useRef<string>('');
    const streamingReasoningRef = useRef<string>('');
    const streamingToolCallsRef = useRef<any[]>([]);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;
    const isIncognb = filePath?.endsWith('.incognb');

    // Get workspace path from file path
    const workspacePath = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) : null;

    // CodeMirror extensions for Python
    const pythonExtensions = useMemo(() => [
        python(),
        syntaxHighlighting(highlightStyle),
        editorTheme,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        closeBrackets(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
    ], []);

    // CodeMirror extensions for Markdown
    const markdownExtensions = useMemo(() => [
        markdown(),
        syntaxHighlighting(highlightStyle),
        editorTheme,
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
    ], []);

    // Keep refs in sync with state
    useEffect(() => { notebookRef.current = notebook; }, [notebook]);
    useEffect(() => { kernelIdRef.current = kernelId; }, [kernelId]);

    // Track focused cell for Ctrl+Enter
    const [focusedCellIndex, setFocusedCellIndex] = useState<number | null>(null);

    // Check if Jupyter is installed and load kernels on mount
    useEffect(() => {
        const checkAndLoadKernels = async () => {
            if (!workspacePath) return;

            try {
                // First check if Jupyter is installed
                const checkResult = await (window as any).api.jupyterCheckInstalled({ workspacePath });
                setJupyterInstalled(checkResult?.installed ?? false);
                if (checkResult?.pythonPath) {
                    setPythonPath(checkResult.pythonPath);
                }

                if (checkResult?.installed) {
                    // Load available kernels
                    const result = await (window as any).api.jupyterListKernels({ workspacePath });
                    if (result?.success && result.kernels) {
                        setAvailableKernels(result.kernels);
                        if (result.kernels.length > 0 && !selectedKernel) {
                            setSelectedKernel(result.kernels[0].name);
                        }
                    }
                    if (result?.pythonPath) {
                        setPythonPath(result.pythonPath);
                    }
                }
            } catch (e) {
                console.error('Failed to check/load kernels:', e);
                setJupyterInstalled(false);
            }
        };
        checkAndLoadKernels();
    }, [workspacePath]);

    // Load models, NPCs, and jinxs for chat/jinx cells (all notebooks)
    useEffect(() => {
        const loadNotebookResources = async () => {
            if (!workspacePath) return;
            try {
                // Load models
                const modelsResult = await (window as any).api.getAvailableModels?.(workspacePath);
                if (modelsResult && !modelsResult.error) {
                    setAvailableModels(modelsResult);
                }

                // Load NPCs
                const npcsResult = await (window as any).api.loadNPCs?.({ currentPath: workspacePath });
                if (npcsResult?.npcs) {
                    setAvailableNPCs(npcsResult.npcs);
                }

                // Load jinxs
                const jinxsResult = await (window as any).api.loadJinxs?.({ currentPath: workspacePath });
                if (jinxsResult?.jinxs) {
                    setAvailableJinxs(jinxsResult.jinxs);
                }
            } catch (e) {
                console.error('Failed to load notebook resources:', e);
            }
        };
        loadNotebookResources();
    }, [workspacePath]);

    // Install Jupyter
    const installJupyter = useCallback(async () => {
        if (!workspacePath) return;
        setIsInstalling(true);
        setError(null);

        try {
            const result = await (window as any).api.jupyterInstall({ workspacePath });
            if (result?.success) {
                // Register the kernel
                await (window as any).api.jupyterRegisterKernel({ workspacePath });
                setJupyterInstalled(true);

                // Load kernels
                const kernelResult = await (window as any).api.jupyterListKernels({ workspacePath });
                if (kernelResult?.success && kernelResult.kernels) {
                    setAvailableKernels(kernelResult.kernels);
                }
            } else {
                setError(result?.error || 'Failed to install Jupyter');
            }
        } catch (e: any) {
            setError(e.message || 'Installation failed');
        } finally {
            setIsInstalling(false);
        }
    }, [workspacePath]);

    // Start kernel
    const startKernel = useCallback(async () => {
        if (kernelStatus === 'connected' || kernelStatus === 'starting') return;
        if (!jupyterInstalled) {
            setError('Jupyter is not installed. Click "Install Jupyter" first.');
            return;
        }

        setKernelStatus('starting');
        setError(null);
        const newKernelId = `kernel_${nodeId}_${Date.now()}`;

        try {
            const result = await (window as any).api.jupyterStartKernel({
                kernelId: newKernelId,
                kernelName: selectedKernel,
                workspacePath
            });

            if (result?.success) {
                setKernelId(newKernelId);
                setKernelStatus('connected');
                if (result?.pythonPath) {
                    setPythonPath(result.pythonPath);
                }
            } else {
                setError(result?.error || 'Failed to start kernel');
                setKernelStatus('disconnected');
            }
        } catch (e: any) {
            setError(e.message || 'Failed to start kernel');
            setKernelStatus('disconnected');
        }
    }, [selectedKernel, kernelStatus, nodeId, workspacePath, jupyterInstalled]);

    // Stop kernel
    const stopKernel = useCallback(async () => {
        if (!kernelId) return;

        try {
            await (window as any).api.jupyterStopKernel({ kernelId });
        } catch (e) {
            console.error('Error stopping kernel:', e);
        } finally {
            setKernelId(null);
            setKernelStatus('disconnected');
        }
    }, [kernelId]);

    // Clean up kernel on unmount
    useEffect(() => {
        return () => {
            if (kernelId) {
                (window as any).api.jupyterStopKernel({ kernelId }).catch(() => {});
            }
        };
    }, [kernelId]);

    // Listen for kernel stopped events
    useEffect(() => {
        const unsubscribe = (window as any).api.onJupyterKernelStopped?.((data: any) => {
            if (data.kernelId === kernelId) {
                setKernelId(null);
                setKernelStatus('disconnected');
            }
        });
        return () => unsubscribe?.();
    }, [kernelId]);

    // Load notebook
    useEffect(() => {
        const load = async () => {
            if (!filePath) return;
            try {
                const text = await (window as any).api.readFileContent(filePath);
                if (text?.error) throw new Error(text.error);
                const content = typeof text === 'string' ? text : text?.content ?? '';
                const parsed = JSON.parse(content);
                setNotebook(parsed);
                setHasChanges(false);
            } catch (e: any) {
                setError(e.message || String(e));
            }
        };
        load();
    }, [filePath]);

    // Save notebook
    const save = useCallback(async () => {
        if (!hasChanges || !notebook) return;
        setIsSaving(true);
        setError(null);
        try {
            await (window as any).api.writeFileContent(filePath, JSON.stringify(notebook, null, 2));
            setHasChanges(false);
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setIsSaving(false);
        }
    }, [hasChanges, notebook, filePath]);

    // Update cell source
    const updateCellSource = useCallback((index: number, newSource: string) => {
        if (!notebook) return;
        const newCells = [...notebook.cells];
        newCells[index] = { ...newCells[index], source: newSource.split('\n').map((line, i, arr) =>
            i < arr.length - 1 ? line + '\n' : line
        )};
        setNotebook({ ...notebook, cells: newCells });
        setHasChanges(true);
    }, [notebook]);

    // Add new cell
    const addCell = useCallback((afterIndex: number, type: CellType) => {
        if (!notebook) return;

        const defaultModel = availableModels.length > 0 ? availableModels[0].value : '';
        const defaultNPC = availableNPCs.length > 0 ? availableNPCs[0].value : 'agent';

        const newCell: NotebookCell = {
            cell_type: type,
            source: [''],
            outputs: ['code', 'chat', 'jinx'].includes(type) ? [] : undefined,
            execution_count: type === 'code' ? null : undefined,
            metadata: {
                created_at: new Date().toISOString(),
                paper_state: 'exploration',
                // Type-specific metadata
                ...(type === 'chat' && {
                    chat: {
                        model: defaultModel,
                        npc: defaultNPC,
                        temperature: 0.7
                    }
                }),
                ...(type === 'jinx' && {
                    jinx: {
                        name: '',
                        inputs: {}
                    }
                }),
                ...(type === 'data' && {
                    data: {
                        files: []
                    }
                })
            }
        };
        const newCells = [...notebook.cells];
        newCells.splice(afterIndex + 1, 0, newCell);
        setNotebook({ ...notebook, cells: newCells });
        setHasChanges(true);
        setShowAddCellMenu(null);
    }, [notebook, availableModels, availableNPCs]);

    // Delete cell
    const deleteCell = useCallback((index: number) => {
        if (!notebook || notebook.cells.length <= 1) return;
        const newCells = notebook.cells.filter((_, i) => i !== index);
        setNotebook({ ...notebook, cells: newCells });
        setHasChanges(true);
    }, [notebook]);

    // Change cell type
    const changeCellType = useCallback((index: number, newType: CellType) => {
        if (!notebook) return;
        const defaultModel = availableModels.length > 0 ? availableModels[0].value : '';
        const defaultNPC = availableNPCs.length > 0 ? availableNPCs[0].value : 'agent';

        const newCells = [...notebook.cells];
        newCells[index] = {
            ...newCells[index],
            cell_type: newType,
            outputs: ['code', 'chat', 'jinx'].includes(newType) ? (newCells[index].outputs || []) : undefined,
            execution_count: newType === 'code' ? (newCells[index].execution_count || null) : undefined,
            metadata: {
                ...newCells[index].metadata,
                modified_at: new Date().toISOString(),
                ...(newType === 'chat' && !newCells[index].metadata?.chat && {
                    chat: { model: defaultModel, npc: defaultNPC, temperature: 0.7 }
                }),
                ...(newType === 'jinx' && !newCells[index].metadata?.jinx && {
                    jinx: { name: '', inputs: {} }
                }),
                ...(newType === 'data' && !newCells[index].metadata?.data && {
                    data: { files: [] }
                })
            }
        };
        setNotebook({ ...notebook, cells: newCells });
        setHasChanges(true);
    }, [notebook, availableModels, availableNPCs]);

    // Update cell metadata (for chat/jinx config changes)
    const updateCellMetadata = useCallback((index: number, metadataUpdate: Partial<NotebookCell['metadata']>) => {
        if (!notebook) return;
        const newCells = [...notebook.cells];
        newCells[index] = {
            ...newCells[index],
            metadata: { ...newCells[index].metadata, ...metadataUpdate, modified_at: new Date().toISOString() }
        };
        setNotebook({ ...notebook, cells: newCells });
        setHasChanges(true);
    }, [notebook]);

    // Toggle paper state for incognb
    const togglePaperState = useCallback((index: number) => {
        if (!notebook) return;
        const states: PaperState[] = ['exploration', 'in_paper', 'discarded'];
        const currentState = notebook.cells[index].metadata?.paper_state || 'exploration';
        const nextIndex = (states.indexOf(currentState) + 1) % states.length;
        updateCellMetadata(index, { paper_state: states[nextIndex] });
    }, [notebook, updateCellMetadata]);

    // Toggle cell collapse
    const toggleCollapse = useCallback((index: number) => {
        setCollapsedCells(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
        });
    }, []);

    // Execute a single cell
    const executeCellDirect = async (index: number, kid: string): Promise<void> => {
        const nb = notebookRef.current;
        if (!nb) return;
        const cell = nb.cells[index];
        if (cell.cell_type !== 'code') return;

        console.log(`[EXEC] Starting cell ${index}`);
        setIsExecuting(index);
        setKernelStatus('busy');

        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;

        try {
            const result = await (window as any).api.jupyterExecuteCode({
                kernelId: kid,
                code: source,
                cellIndex: index
            });
            console.log(`[EXEC] Finished cell ${index}`);

            setNotebook(prev => {
                if (!prev) return prev;
                const newCells = [...prev.cells];
                newCells[index] = {
                    ...newCells[index],
                    execution_count: result.executionCount || (newCells[index].execution_count || 0) + 1,
                    outputs: result.outputs || []
                };
                if (!result.success && result.error && !result.outputs?.length) {
                    newCells[index].outputs = [{ output_type: 'error', ename: 'Error', evalue: result.error, traceback: [result.error] }];
                }
                return { ...prev, cells: newCells };
            });
            setHasChanges(true);
        } catch (e: any) {
            setNotebook(prev => {
                if (!prev) return prev;
                const newCells = [...prev.cells];
                newCells[index] = { ...newCells[index], outputs: [{ output_type: 'error', ename: 'Error', evalue: e.message, traceback: [e.message] }] };
                return { ...prev, cells: newCells };
            });
        } finally {
            setIsExecuting(null);
            setKernelStatus('connected');
        }
    };

    // Ensure kernel is ready and return its ID
    const ensureKernel = async (): Promise<string | null> => {
        let kid = kernelIdRef.current;
        if (kid && kernelStatus === 'connected') return kid;

        setError(null);
        await startKernel();
        const startTime = Date.now();
        while (Date.now() - startTime < 60000) {
            await new Promise(r => setTimeout(r, 500));
            const running = await (window as any).api.jupyterGetRunningKernels?.();
            if (running?.kernels?.length > 0) {
                kid = running.kernels[running.kernels.length - 1].kernelId;
                kernelIdRef.current = kid;
                setKernelId(kid);  // Also update state so refreshVariables works
                setKernelStatus('connected');
                return kid;
            }
        }
        setError('Kernel failed to start.');
        return null;
    };

    // Execute single cell (public API)
    const executeCell = useCallback(async (index: number) => {
        const kid = await ensureKernel();
        if (!kid) return;
        await executeCellDirect(index, kid);
    }, [kernelStatus, startKernel]);

    // Run all cells in strict sequential order
    const runAllCells = useCallback(async () => {
        const nb = notebookRef.current;
        if (!nb) return;

        const kid = await ensureKernel();
        if (!kid) return;

        const indices = nb.cells.map((c, i) => c.cell_type === 'code' ? i : -1).filter(i => i >= 0);
        console.log(`[EXEC] Running all cells in order: ${indices.join(', ')}`);

        for (let i = 0; i < indices.length; i++) {
            const cellIndex = indices[i];
            console.log(`[EXEC] Running cell ${cellIndex} (${i + 1}/${indices.length})`);
            await executeCellDirect(cellIndex, kid);
        }
        console.log(`[EXEC] All cells complete`);
    }, [kernelStatus, startKernel]);

    // Run all cells before (and including) the given index
    const runAllBefore = useCallback(async (index: number) => {
        const nb = notebookRef.current;
        if (!nb) return;
        const kid = await ensureKernel();
        if (!kid) return;
        const indices = nb.cells.map((c, i) => c.cell_type === 'code' && i <= index ? i : -1).filter(i => i >= 0);
        for (const idx of indices) {
            await executeCellDirect(idx, kid);
        }
    }, [kernelStatus, startKernel]);

    // Run all cells after (and including) the given index
    const runAllAfter = useCallback(async (index: number) => {
        const nb = notebookRef.current;
        if (!nb) return;
        const kid = await ensureKernel();
        if (!kid) return;
        const indices = nb.cells.map((c, i) => c.cell_type === 'code' && i >= index ? i : -1).filter(i => i >= 0);
        for (const idx of indices) {
            await executeCellDirect(idx, kid);
        }
    }, [kernelStatus, startKernel]);

    // Keep variablesRef in sync
    useEffect(() => {
        variablesRef.current = variables;
    }, [variables]);

    // Refresh variables from kernel
    const refreshVariables = useCallback(async () => {
        console.log('[VAR] refreshVariables called, kernelId:', kernelId, 'status:', kernelStatus);
        if (!kernelId || kernelStatus !== 'connected') {
            console.log('[VAR] Skipping - no kernel or not connected');
            return;
        }
        setVariablesLoading(true);
        try {
            const result = await (window as any).api.jupyterGetVariables({ kernelId });
            console.log('[VAR] Got result:', result);
            if (result?.debug_msgs) {
                console.log('[VAR] Debug messages from kernel:', result.debug_msgs);
            }
            if (result?.success && Array.isArray(result.variables)) {
                console.log('[VAR] Setting', result.variables.length, 'variables:', result.variables.map((v: any) => v.name));
                setVariables(result.variables);
            } else {
                console.log('[VAR] Result failed or no variables array:', result?.error);
            }
        } catch (e) {
            console.error('[VAR] Failed to get variables:', e);
        } finally {
            setVariablesLoading(false);
        }
    }, [kernelId, kernelStatus]);

    // Auto-refresh variables after cell execution
    useEffect(() => {
        if (kernelStatus === 'connected' && isExecuting === null) {
            refreshVariables();
        }
    }, [kernelStatus, isExecuting, refreshVariables]);

    // Load dataframe data for explorer
    const loadDataFrameData = useCallback(async (varName: string, offset = 0) => {
        if (!kernelId) return;
        setExplorerLoading(true);
        try {
            const result = await (window as any).api.jupyterGetDataFrame({
                kernelId,
                varName,
                offset,
                limit: 100
            });
            if (result?.success) {
                setExplorerData(result);
                setExplorerOffset(offset);
            } else {
                console.error('Failed to load dataframe:', result?.error);
            }
        } catch (e) {
            console.error('Failed to load dataframe:', e);
        } finally {
            setExplorerLoading(false);
        }
    }, [kernelId]);

    // Open dataframe in explorer
    const openInExplorer = useCallback((varName: string) => {
        setExplorerVar(varName);
        setExplorerSort(null);
        setExplorerFilter('');
        setShowColumnStats(null);
        loadDataFrameData(varName, 0);
    }, [loadDataFrameData]);

    // Apply matplotlib configuration to kernel
    const applyMplConfig = useCallback(async () => {
        if (!kernelId || kernelStatus !== 'connected') return;

        const configCode = `
import matplotlib as mpl
import matplotlib.pyplot as plt

# Apply Incognide matplotlib configuration
mpl.rcParams.update({
    'font.family': '${mplConfig.fontFamily}',
    'font.size': ${mplConfig.fontSize},
    'axes.labelsize': ${mplConfig.labelSize},
    'xtick.labelsize': ${mplConfig.tickSize},
    'ytick.labelsize': ${mplConfig.tickSize},
    'text.usetex': ${mplConfig.usetex ? 'True' : 'False'},
    'image.cmap': '${mplConfig.cmap}',
    'figure.figsize': (${mplConfig.figWidth}, ${mplConfig.figHeight}),
    'figure.dpi': ${mplConfig.dpi},
    'xtick.direction': '${mplConfig.tickDirection}',
    'ytick.direction': '${mplConfig.tickDirection}',
    'xtick.minor.visible': ${mplConfig.minorTicks ? 'True' : 'False'},
    'ytick.minor.visible': ${mplConfig.minorTicks ? 'True' : 'False'},
    'xtick.top': True,
    'ytick.right': True,
    'legend.frameon': ${mplConfig.legendFrame ? 'True' : 'False'},
    'axes.grid.axis': '${mplConfig.gridAxis}',
    'xtick.major.size': 10,
    'xtick.minor.size': 5,
    'ytick.major.size': 10,
    'ytick.minor.size': 5,
})
${mplConfig.style !== 'default' ? `plt.style.use('${mplConfig.style}')` : ''}
print("Matplotlib configured for scientific publishing")
`;

        try {
            await (window as any).api.jupyterExecuteCode({
                kernelId,
                code: configCode
            });
            setMplConfigApplied(true);
        } catch (e) {
            console.error('Failed to apply matplotlib config:', e);
        }
    }, [kernelId, kernelStatus, mplConfig]);

    // Auto-apply matplotlib config when kernel connects, reset when disconnected
    useEffect(() => {
        if (kernelStatus === 'connected' && !mplConfigApplied) {
            applyMplConfig();
        } else if (kernelStatus === 'disconnected') {
            setMplConfigApplied(false);
        }
    }, [kernelStatus, mplConfigApplied, applyMplConfig]);

    // Export to Python (.py)
    const exportToPython = useCallback(async () => {
        if (!notebook || !filePath) return;
        setIsExporting(true);
        try {
            const pyCode = notebook.cells
                .filter(cell => cell.cell_type === 'code')
                .map(cell => {
                    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                    return `# Cell [${cell.execution_count || ''}]\n${source}`;
                })
                .join('\n\n');

            const pyPath = filePath.replace(/\.(ipynb|incognb)$/, '.py');
            await (window as any).api.writeFile(pyPath, `#!/usr/bin/env python3\n# Exported from ${filePath.split('/').pop()}\n\n${pyCode}`);
            alert(`Exported to ${pyPath}`);
        } catch (e: any) {
            alert('Export failed: ' + e.message);
        } finally {
            setIsExporting(false);
            setShowExportMenu(false);
        }
    }, [notebook, filePath]);

    // Export to HTML
    const exportToHTML = useCallback(async () => {
        if (!notebook || !filePath) return;
        setIsExporting(true);
        try {
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${filePath.split('/').pop()}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
        .cell { margin: 20px 0; border: 1px solid #45475a; border-radius: 8px; overflow: hidden; }
        .cell-code { background: #181825; }
        .cell-markdown { background: #1e1e2e; }
        .cell-header { padding: 8px 12px; background: #313244; font-size: 12px; color: #a6adc8; }
        .cell-content { padding: 12px; }
        pre { margin: 0; white-space: pre-wrap; font-family: 'Fira Code', monospace; font-size: 13px; }
        .output { background: #11111b; padding: 12px; border-top: 1px solid #45475a; }
        .output img { max-width: 100%; }
        .error { color: #f38ba8; }
        h1, h2, h3, h4 { color: #cba6f7; }
        code { background: #313244; padding: 2px 6px; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>${filePath.split('/').pop()}</h1>
${notebook.cells.map((cell, i) => {
    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    const outputs = cell.outputs || [];
    return `
    <div class="cell cell-${cell.cell_type}">
        <div class="cell-header">${cell.cell_type}${cell.execution_count ? ` [${cell.execution_count}]` : ''}</div>
        <div class="cell-content">
            <pre>${source.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </div>
        ${outputs.length > 0 ? `<div class="output">${outputs.map(out => {
            if (out.output_type === 'stream') return `<pre>${(out.text || []).join('').replace(/</g, '&lt;')}</pre>`;
            if (out.output_type === 'error') return `<pre class="error">${out.ename}: ${out.evalue}</pre>`;
            if (out.data?.['image/png']) return `<img src="data:image/png;base64,${out.data['image/png']}" />`;
            if (out.data?.['text/html']) return out.data['text/html'].join?.('') || out.data['text/html'];
            if (out.data?.['text/plain']) return `<pre>${(out.data['text/plain'].join?.('') || out.data['text/plain']).replace(/</g, '&lt;')}</pre>`;
            return '';
        }).join('')}</div>` : ''}
    </div>`;
}).join('\n')}
</body>
</html>`;

            const htmlPath = filePath.replace(/\.(ipynb|incognb)$/, '.html');
            await (window as any).api.writeFile(htmlPath, htmlContent);
            alert(`Exported to ${htmlPath}`);
        } catch (e: any) {
            alert('Export failed: ' + e.message);
        } finally {
            setIsExporting(false);
            setShowExportMenu(false);
        }
    }, [notebook, filePath]);

    // Export to PDF (via nbconvert if available)
    const exportToPDF = useCallback(async () => {
        if (!notebook || !filePath || !kernelId) return;
        setIsExporting(true);
        try {
            // First save the notebook
            await save();

            // Try to use nbconvert via kernel
            const result = await (window as any).api.jupyterExecuteCode({
                kernelId,
                code: `
import subprocess
import sys
try:
    result = subprocess.run([sys.executable, '-m', 'jupyter', 'nbconvert', '--to', 'pdf', '${filePath}'],
                          capture_output=True, text=True, timeout=120)
    if result.returncode == 0:
        print("PDF_EXPORT_SUCCESS")
    else:
        print("PDF_EXPORT_FAILED:", result.stderr)
except Exception as e:
    print("PDF_EXPORT_FAILED:", str(e))
`
            });

            const output = result.outputs?.find((o: any) => o.output_type === 'stream')?.text?.join('') || '';
            if (output.includes('PDF_EXPORT_SUCCESS')) {
                alert(`Exported to ${filePath.replace(/\.(ipynb|incognb)$/, '.pdf')}`);
            } else {
                // Fallback: suggest installing nbconvert
                alert('PDF export requires jupyter nbconvert with LaTeX support.\nInstall with: pip install nbconvert[webpdf]\n\nError: ' + output);
            }
        } catch (e: any) {
            alert('PDF export failed: ' + e.message);
        } finally {
            setIsExporting(false);
            setShowExportMenu(false);
        }
    }, [notebook, filePath, kernelId, save]);

    // Execute chat cell - send prompt to LLM via streaming API
    const executeChatCell = useCallback(async (index: number, targetModels?: string[]) => {
        if (!notebook) return;

        const cell = notebook.cells[index];
        if (cell.cell_type !== 'chat') return;

        setIsExecuting(index);
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        const chatMeta = cell.metadata?.chat || {};

        // If targetModels provided, run on multiple models (matrix run)
        const modelsToRun = targetModels || [chatMeta.model || availableModels[0]?.value || 'gpt-4'];

        // Clear existing outputs
        const clearedCells = [...notebook.cells];
        clearedCells[index] = {
            ...clearedCells[index],
            outputs: [],
            metadata: {
                ...clearedCells[index].metadata,
                modified_at: new Date().toISOString()
            }
        };
        setNotebook({ ...notebook, cells: clearedCells });

        // Process models sequentially
        for (const modelValue of modelsToRun) {
            const selectedModel = availableModels.find((m: any) => m.value === modelValue);
            const provider = selectedModel?.provider || 'openai';
            const npc = chatMeta.npc || null;
            const streamId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            setStreamingCellIndex(index);
            setStreamingContent('');
            setStreamingReasoningContent('');
            setStreamingToolCalls([]);
            streamingContentRef.current = '';
            streamingReasoningRef.current = '';
            streamingToolCallsRef.current = [];

            // Helper to process a parsed event (matches utils.tsx pattern)
            const processEvent = (parsed: any) => {
                let content = '', reasoningContent = '', toolCalls: any[] | null = null;

                if (parsed.choices?.[0]?.delta) {
                    content = parsed.choices[0].delta.content || '';
                    reasoningContent = parsed.choices[0].delta.reasoning_content || '';
                }

                if (parsed.type) {
                    const type = parsed.type;
                    if (type === 'tool_execution_start' && Array.isArray(parsed.tool_calls)) {
                        toolCalls = parsed.tool_calls;
                    } else if ((type === 'tool_start' || type === 'tool_complete' || type === 'tool_result' || type === 'tool_error') && parsed.name) {
                        toolCalls = [{
                            id: parsed.id || '',
                            type: 'function',
                            function: {
                                name: parsed.name,
                                arguments: parsed.args ? (typeof parsed.args === 'object' ? JSON.stringify(parsed.args, null, 2) : String(parsed.args)) : ''
                            },
                            status: type === 'tool_error' ? 'error' : ((type === 'tool_complete' || type === 'tool_result') ? 'complete' : 'running'),
                            result_preview: parsed.result_preview || parsed.result || parsed.error || ''
                        }];
                    }
                } else if (!content && parsed.tool_calls) {
                    toolCalls = parsed.tool_calls;
                }

                return { content, reasoningContent, toolCalls };
            };

            // Set up stream listeners at call time
            let streamComplete = false;
            const cleanupData = (window as any).api?.onStreamData?.((_: any, data: any) => {
                if (data.streamId === streamId && data.chunk) {
                    try {
                        const chunk = data.chunk;
                        let content = '', reasoningContent = '', toolCalls: any[] | null = null;

                        if (typeof chunk === 'string') {
                            // Handle SSE format - may contain multiple events
                            const events = chunk.split(/\n\n/).filter((e: string) => e.trim());
                            for (const event of events) {
                                const trimmedEvent = event.trim();
                                if (!trimmedEvent) continue;

                                if (trimmedEvent.startsWith('data:')) {
                                    const dataContent = trimmedEvent.replace(/^data:\s*/, '').trim();
                                    if (dataContent === '[DONE]') continue;
                                    if (dataContent) {
                                        try {
                                            const parsed = JSON.parse(dataContent);
                                            const result = processEvent(parsed);
                                            content += result.content;
                                            reasoningContent += result.reasoningContent;
                                            if (result.toolCalls) toolCalls = result.toolCalls;
                                        } catch {
                                            content += dataContent;
                                        }
                                    }
                                } else {
                                    content += trimmedEvent;
                                }
                            }
                        } else if (chunk?.choices) {
                            content = chunk.choices[0]?.delta?.content || '';
                            reasoningContent = chunk.choices[0]?.delta?.reasoning_content || '';
                            toolCalls = chunk.tool_calls || null;
                        } else if (chunk?.type) {
                            const result = processEvent(chunk);
                            content = result.content;
                            reasoningContent = result.reasoningContent;
                            toolCalls = result.toolCalls;
                        }

                        // Update content
                        if (content) {
                            streamingContentRef.current += content;
                            setStreamingContent(streamingContentRef.current);
                        }

                        // Update reasoning
                        if (reasoningContent) {
                            streamingReasoningRef.current += reasoningContent;
                            setStreamingReasoningContent(streamingReasoningRef.current);
                        }

                        // Update tool calls
                        if (toolCalls) {
                            const normalizedCalls = toolCalls.map((tc: any) => ({
                                id: tc.id || '',
                                type: tc.type || 'function',
                                function: {
                                    name: tc.function?.name || tc.name || '',
                                    arguments: tc.args
                                        ? (typeof tc.args === 'object' ? JSON.stringify(tc.args, null, 2) : String(tc.args))
                                        : (tc.function?.arguments || '')
                                },
                                status: tc.status || 'running',
                                result_preview: tc.result_preview || ''
                            }));

                            const existing = [...streamingToolCallsRef.current];
                            normalizedCalls.forEach((tc: any) => {
                                const idx = existing.findIndex((mtc: any) => mtc.id === tc.id || mtc.function.name === tc.function.name);
                                if (idx >= 0) {
                                    existing[idx] = { ...existing[idx], ...tc };
                                } else {
                                    existing.push(tc);
                                }
                            });
                            streamingToolCallsRef.current = existing;
                            setStreamingToolCalls([...existing]);
                        }
                    } catch {
                        // Partial chunk, ignore
                    }
                }
            });

            const cleanupComplete = (window as any).api?.onStreamComplete?.((_: any, data: any) => {
                if (data.streamId === streamId) {
                    const finalContent = streamingContentRef.current;
                    const finalReasoning = streamingReasoningRef.current;
                    const finalToolCalls = streamingToolCallsRef.current;
                    if (notebookRef.current) {
                        const updatedCells = [...notebookRef.current.cells];
                        const existingOutputs = updatedCells[index].outputs || [];
                        updatedCells[index] = {
                            ...updatedCells[index],
                            outputs: [
                                ...existingOutputs,
                                {
                                    output_type: 'execute_result',
                                    data: {
                                        'text/markdown': [finalContent || 'No response'],
                                        'text/plain': [finalContent || 'No response']
                                    },
                                    metadata: {
                                        model: modelValue,
                                        execution_time: new Date().toISOString(),
                                        reasoningContent: finalReasoning || undefined,
                                        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
                                    }
                                }
                            ],
                            metadata: {
                                ...updatedCells[index].metadata,
                                modified_at: new Date().toISOString()
                            }
                        };
                        setNotebook({ ...notebookRef.current, cells: updatedCells });
                        setHasChanges(true);
                    }
                    streamComplete = true;
                    cleanupData?.();
                    cleanupComplete?.();
                    cleanupError?.();
                }
            });

            const cleanupError = (window as any).api?.onStreamError?.((_: any, data: any) => {
                if (data.streamId === streamId) {
                    if (notebookRef.current) {
                        const updatedCells = [...notebookRef.current.cells];
                        const existingOutputs = updatedCells[index].outputs || [];
                        updatedCells[index] = {
                            ...updatedCells[index],
                            outputs: [
                                ...existingOutputs,
                                {
                                    output_type: 'error',
                                    ename: 'ChatError',
                                    evalue: data.error || 'Stream error',
                                    traceback: [data.error || 'Stream error'],
                                    metadata: { model: modelValue }
                                }
                            ]
                        };
                        setNotebook({ ...notebookRef.current, cells: updatedCells });
                    }
                    streamComplete = true;
                    cleanupData?.();
                    cleanupComplete?.();
                    cleanupError?.();
                }
            });

            // Execute the stream
            (window as any).api?.executeCommandStream?.({
                streamId,
                commandstr: source,
                currentPath: workspacePath,
                conversationId: `notebook-${index}-${modelValue}`,
                model: modelValue,
                provider,
                npc,
            });

            // Wait for this stream to complete before starting next model
            await new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                    if (streamComplete) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }

        setIsExecuting(null);
        setStreamingCellIndex(null);
        setStreamingContent('');
        setStreamingReasoningContent('');
        setStreamingToolCalls([]);
        streamingContentRef.current = '';
        streamingReasoningRef.current = '';
        streamingToolCallsRef.current = [];
    }, [notebook, availableModels, workspacePath]);

    // Execute jinx cell - run jinx workflow
    const executeJinxCell = useCallback(async (index: number) => {
        if (!notebook) return;

        const cell = notebook.cells[index];
        if (cell.cell_type !== 'jinx') return;

        setIsExecuting(index);
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        const jinxMeta = cell.metadata?.jinx || {};

        try {
            // Execute via jinx API
            const response = await fetch(`${BACKEND_URL}/api/jinx/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jinxContent: source,
                    jinxName: jinxMeta.name,
                    inputs: jinxMeta.inputs || {},
                    workingDir: workspacePath
                })
            });

            const result = await response.json();

            const newCells = [...notebook.cells];
            if (result.success) {
                newCells[index] = {
                    ...newCells[index],
                    outputs: [{
                        output_type: 'execute_result',
                        data: {
                            'text/plain': [typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)],
                            ...(result.html && { 'text/html': [result.html] })
                        },
                        metadata: { execution_time: new Date().toISOString() }
                    }],
                    metadata: { ...newCells[index].metadata, modified_at: new Date().toISOString() }
                };
            } else {
                newCells[index] = {
                    ...newCells[index],
                    outputs: [{
                        output_type: 'error',
                        ename: 'JinxError',
                        evalue: result.error || 'Jinx execution failed',
                        traceback: [result.error || 'Jinx execution failed']
                    }]
                };
            }
            setNotebook({ ...notebook, cells: newCells });
            setHasChanges(true);
        } catch (e: any) {
            const newCells = [...notebook.cells];
            newCells[index] = {
                ...newCells[index],
                outputs: [{
                    output_type: 'error',
                    ename: 'Error',
                    evalue: e.message || 'Jinx execution failed',
                    traceback: [e.message || 'Jinx execution failed']
                }]
            };
            setNotebook({ ...notebook, cells: newCells });
        } finally {
            setIsExecuting(null);
        }
    }, [notebook, workspacePath]);

    // Keyboard shortcuts
    const onKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (hasChanges) save();
        }
    }, [hasChanges, save]);

    useEffect(() => {
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);

    // Render a tool call with status indicator
    const renderToolCall = (tool: any, index: number) => {
        const statusColor = tool.status === 'error' ? 'border-red-500'
            : tool.status === 'complete' ? 'border-green-500'
            : 'border-blue-500';

        return (
            <div key={tool.id || index} className={`my-2 px-3 py-2 bg-gray-800 rounded-md border-l-2 ${statusColor}`}>
                <div className="text-xs text-blue-400 mb-1 font-semibold flex items-center gap-2">
                    <span>Tool: {tool.function?.name || 'unknown'}</span>
                    {tool.status === 'running' && (
                        <span className="text-yellow-400 animate-pulse">running...</span>
                    )}
                    {tool.status === 'complete' && (
                        <span className="text-green-400">complete</span>
                    )}
                    {tool.status === 'error' && (
                        <span className="text-red-400">error</span>
                    )}
                </div>
                {tool.function?.arguments && (
                    <pre className="text-xs text-gray-400 bg-black/20 p-1 rounded mt-1 overflow-x-auto max-h-24">
                        {tool.function.arguments}
                    </pre>
                )}
                {tool.result_preview && (
                    <pre className={`text-xs ${tool.status === 'error' ? 'text-red-400' : 'text-gray-300'} bg-black/20 p-1 rounded mt-1 overflow-x-auto max-h-32`}>
                        {tool.result_preview}
                    </pre>
                )}
            </div>
        );
    };

    // Render cell output
    const renderOutput = (output: any, outputIndex: number) => {
        if (!output) return null;

        if (output.output_type === 'stream') {
            return (
                <pre key={outputIndex} className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 p-2 rounded">
                    {Array.isArray(output.text) ? output.text.join('') : output.text}
                </pre>
            );
        }

        if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
            const data = output.data;
            const metadata = output.metadata || {};
            const reasoningContent = metadata.reasoningContent;
            const toolCalls = metadata.toolCalls;

            return (
                <div key={outputIndex} className="space-y-2">
                    {/* Reasoning content */}
                    {reasoningContent && (
                        <div className="px-3 py-2 bg-gray-800 rounded-md border-l-2 border-yellow-500">
                            <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                            <div className="text-xs text-gray-300 whitespace-pre-wrap">
                                {reasoningContent}
                            </div>
                        </div>
                    )}

                    {/* Tool calls */}
                    {toolCalls?.map((tool: any, ti: number) => renderToolCall(tool, ti))}

                    {/* Main content */}
                    {data?.['text/html'] ? (
                        <div className="text-xs bg-gray-900 p-2 rounded"
                             dangerouslySetInnerHTML={{ __html: Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'] }} />
                    ) : data?.['image/png'] ? (
                        <img src={`data:image/png;base64,${data['image/png']}`}
                             alt="Output" className="max-w-full rounded" />
                    ) : data?.['text/plain'] ? (
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 p-2 rounded">
                            {Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain']}
                        </pre>
                    ) : null}
                </div>
            );
        }

        if (output.output_type === 'error') {
            return (
                <pre key={outputIndex} className="text-xs text-red-400 whitespace-pre-wrap font-mono bg-gray-900 p-2 rounded">
                    {output.ename}: {output.evalue}
                    {output.traceback && '\n' + output.traceback.join('\n')}
                </pre>
            );
        }

        return null;
    };

    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
    if (!notebook) return <div className="p-4">Loading notebook...</div>;

    return (
        <div className="h-full flex flex-col theme-bg-secondary overflow-hidden">
            {/* Main content area - horizontal layout */}
            <div className="flex-1 flex flex-row overflow-hidden">
                {/* Left column - Header + Cells */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    {/* Header */}
                    <div
                        draggable="true"
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        const nodePath = findNodePath(rootLayoutNode, nodeId);
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                        setTimeout(() => setDraggedItem({ type: 'pane', id: nodeId, nodePath }), 0);
                    }}
                    onDragEnd={() => setDraggedItem(null)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPaneContextMenu({
                            isOpen: true,
                            x: e.clientX,
                            y: e.clientY,
                            nodeId,
                            nodePath: findNodePath(rootLayoutNode, nodeId)
                        });
                    }}
                    className="p-2 border-b theme-border text-xs theme-text-muted flex-shrink-0 theme-bg-secondary cursor-move"
                >
                    <div className="flex justify-between items-center">
                    <span className="truncate font-semibold text-orange-400">
                        {filePath ? filePath.split('/').pop() : 'Untitled.ipynb'}{hasChanges ? ' *' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                        {/* Kernel controls */}
                        <div className="relative flex items-center gap-1">
                            <button
                                onClick={() => setShowKernelMenu(!showKernelMenu)}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${
                                    kernelStatus === 'connected' ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                                    kernelStatus === 'starting' ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400' :
                                    kernelStatus === 'busy' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' :
                                    'border-gray-600 bg-gray-700/50 text-gray-400'
                                }`}
                                title="Kernel status"
                            >
                                {kernelStatus === 'connected' && <Circle size={8} className="fill-green-400" />}
                                {kernelStatus === 'starting' && <Loader size={10} className="animate-spin" />}
                                {kernelStatus === 'busy' && <Loader size={10} className="animate-spin" />}
                                {kernelStatus === 'disconnected' && <Circle size={8} className="text-gray-500" />}
                                <span>{selectedKernel}</span>
                                <ChevronDown size={10} />
                            </button>

                            {showKernelMenu && (
                                <div className="absolute top-full right-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                                    {/* Python path info */}
                                    <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-700">
                                        <span className="uppercase">Python:</span>
                                        <div className="text-gray-400 truncate" title={pythonPath}>{pythonPath.split('/').slice(-3).join('/')}</div>
                                    </div>

                                    {jupyterInstalled === false ? (
                                        <>
                                            <div className="px-3 py-2 text-xs text-yellow-400">
                                                Jupyter not installed in this environment
                                            </div>
                                            <button
                                                onClick={() => { installJupyter(); setShowKernelMenu(false); }}
                                                disabled={isInstalling}
                                                className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isInstalling ? <Loader size={12} className="animate-spin" /> : <Zap size={12} />}
                                                {isInstalling ? 'Installing...' : 'Install Jupyter'}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="px-3 py-1 text-[10px] text-gray-500 uppercase">Select Kernel</div>
                                            {availableKernels.map(k => (
                                                <button
                                                    key={k.name}
                                                    onClick={() => { setSelectedKernel(k.name); setShowKernelMenu(false); }}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center gap-2 ${selectedKernel === k.name ? 'text-green-400' : 'text-gray-300'}`}
                                                >
                                                    <Zap size={12} />
                                                    {k.displayName}
                                                </button>
                                            ))}
                                            <div className="border-t border-gray-700 my-1" />
                                            {kernelStatus === 'disconnected' ? (
                                                <button
                                                    onClick={() => { startKernel(); setShowKernelMenu(false); }}
                                                    className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-gray-700 flex items-center gap-2"
                                                >
                                                    <Power size={12} />
                                                    Start Kernel
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => { stopKernel(); setShowKernelMenu(false); }}
                                                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                                                    >
                                                        <Square size={12} />
                                                        Stop Kernel
                                                    </button>
                                                    <button
                                                        onClick={async () => { await stopKernel(); await startKernel(); setShowKernelMenu(false); }}
                                                        className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700 flex items-center gap-2"
                                                    >
                                                        <Power size={12} />
                                                        Restart Kernel
                                                    </button>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={runAllCells}
                            disabled={isExecuting !== null}
                            className="p-1 theme-hover rounded text-green-400 disabled:opacity-50"
                            title="Run All Cells"
                        >
                            <PlayCircle size={14} />
                        </button>
                        <button
                            onClick={() => setShowMplConfig(true)}
                            className={`p-1 theme-hover rounded ${mplConfigApplied ? 'text-green-400' : 'text-gray-400'}`}
                            title="Matplotlib Configuration"
                        >
                            <Palette size={14} />
                        </button>
                        <button
                            onClick={save}
                            disabled={!hasChanges || isSaving}
                            className="p-1 theme-hover rounded disabled:opacity-50"
                            title="Save (Ctrl+S)"
                        >
                            <Save size={14} />
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                disabled={isExporting}
                                className="p-1 theme-hover rounded disabled:opacity-50"
                                title="Export"
                            >
                                {isExporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            {showExportMenu && (
                                <div className="absolute top-full right-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                                    <button
                                        onClick={exportToPython}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2 text-blue-400"
                                    >
                                        <FileCode size={12} />
                                        Export to .py
                                    </button>
                                    <button
                                        onClick={exportToHTML}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2 text-green-400"
                                    >
                                        <FileType size={12} />
                                        Export to .html
                                    </button>
                                    <button
                                        onClick={exportToPDF}
                                        disabled={kernelStatus !== 'connected'}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2 text-red-400 disabled:opacity-50"
                                    >
                                        <FileText size={12} />
                                        Export to .pdf
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative flex items-center">
                            <button
                                onClick={() => addCell(notebook.cells.length - 1, 'code')}
                                className="p-1 theme-hover rounded"
                                title="Add Code Cell"
                            >
                                <Plus size={14} />
                            </button>
                            <button
                                onClick={() => setShowAddCellMenu(showAddCellMenu === -1 ? null : -1)}
                                className="p-0.5 theme-hover rounded"
                                title="Add Cell (more options)"
                            >
                                <ChevronDown size={10} />
                            </button>
                            {showAddCellMenu === -1 && (
                                <div className="absolute top-full right-0 mt-1 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                                    {/* Standard cell types for regular .ipynb, extended types for .incognb */}
                                    {(isIncognb ? ['code', 'markdown', 'chat', 'jinx', 'latex', 'data'] : ['code', 'markdown']).map(type => {
                                        const cellTypeStyles: Record<string, { text: string; icon: any; label: string }> = {
                                            code: { text: 'text-blue-400', icon: Code2, label: 'Code' },
                                            markdown: { text: 'text-green-400', icon: FileText, label: 'Markdown' },
                                            chat: { text: 'text-purple-400', icon: MessageSquare, label: 'Chat' },
                                            jinx: { text: 'text-orange-400', icon: Zap, label: 'Jinx' },
                                            latex: { text: 'text-red-400', icon: BookOpen, label: 'LaTeX' },
                                            data: { text: 'text-cyan-400', icon: Paperclip, label: 'Data' }
                                        };
                                        const s = cellTypeStyles[type];
                                        const Icon = s.icon;
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => addCell(notebook.cells.length - 1, type as CellType)}
                                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2 ${s.text}`}
                                            >
                                                <Icon size={12} />
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeContentPane(nodeId, findNodePath(rootLayoutNode, nodeId));
                            }}
                            className="p-1 theme-hover rounded-full"
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                        </div>
                        </div>
                    </div>

                    {/* Cells */}
                    <div className="flex-1 overflow-auto p-4 space-y-4">
                {(notebook.cells || []).map((cell, index) => {
                    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                    const isCollapsed = collapsedCells.has(index);
                    const cellType = cell.cell_type;
                    const paperState = cell.metadata?.paper_state || 'exploration';

                    // Cell type styling
                    const cellTypeStyles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
                        code: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Code2, label: 'Code' },
                        markdown: { bg: 'bg-green-500/20', text: 'text-green-400', icon: FileText, label: 'Markdown' },
                        chat: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: MessageSquare, label: 'Chat' },
                        jinx: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: Zap, label: 'Jinx' },
                        latex: { bg: 'bg-red-500/20', text: 'text-red-400', icon: BookOpen, label: 'LaTeX' },
                        data: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: Paperclip, label: 'Data' },
                        raw: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: FileText, label: 'Raw' }
                    };
                    const style = cellTypeStyles[cellType] || cellTypeStyles.raw;
                    const CellIcon = style.icon;

                    // Paper state styling for incognb
                    const paperStateStyles: Record<PaperState, { border: string; opacity: string; icon: any }> = {
                        in_paper: { border: 'border-l-4 border-l-green-500', opacity: '', icon: Eye },
                        exploration: { border: '', opacity: '', icon: Sparkles },
                        discarded: { border: 'border-l-4 border-l-red-500', opacity: 'opacity-50', icon: Archive }
                    };
                    const paperStyle = isIncognb ? paperStateStyles[paperState] : { border: '', opacity: '', icon: null };

                    return (
                        <div key={index} className={`border border-gray-700 rounded-lg overflow-hidden ${paperStyle.border} ${paperStyle.opacity}`}>
                            {/* Cell header */}
                            <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 border-b border-gray-700">
                                <button onClick={() => toggleCollapse(index)} className="text-gray-400 hover:text-gray-200">
                                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {/* Cell type badge */}
                                <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${style.bg} ${style.text}`}>
                                    <CellIcon size={10} />
                                    {style.label}
                                </span>

                                {/* Execution count for code cells */}
                                {cellType === 'code' && cell.execution_count != null && (
                                    <span className="text-xs text-gray-500">[{cell.execution_count}]</span>
                                )}

                                {/* Chat cell config display */}
                                {cellType === 'chat' && cell.metadata?.chat && (
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={cell.metadata.chat.model || ''}
                                            onChange={(e) => updateCellMetadata(index, { chat: { ...cell.metadata?.chat, model: e.target.value } })}
                                            className="text-[10px] bg-gray-700 border-none rounded px-1 py-0.5 text-purple-300"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m.value} value={m.value}>{m.display_name?.slice(0, 20) || m.value}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={cell.metadata.chat.npc || 'agent'}
                                            onChange={(e) => updateCellMetadata(index, { chat: { ...cell.metadata?.chat, npc: e.target.value } })}
                                            className="text-[10px] bg-gray-700 border-none rounded px-1 py-0.5 text-green-300"
                                        >
                                            {availableNPCs.map(n => (
                                                <option key={n.value} value={n.value}>{n.display_name || n.value}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Jinx cell config display */}
                                {cellType === 'jinx' && (
                                    <select
                                        value={cell.metadata?.jinx?.name || ''}
                                        onChange={(e) => updateCellMetadata(index, { jinx: { ...cell.metadata?.jinx, name: e.target.value } })}
                                        className="text-[10px] bg-gray-700 border-none rounded px-1 py-0.5 text-orange-300"
                                    >
                                        <option value="">Select jinx...</option>
                                        {availableJinxs.map(j => (
                                            <option key={j.name} value={j.name}>{j.name}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Paper state toggle for incognb */}
                                {isIncognb && (
                                    <button
                                        onClick={() => togglePaperState(index)}
                                        className={`p-1 rounded text-[10px] flex items-center gap-1 ${
                                            paperState === 'in_paper' ? 'bg-green-600/20 text-green-400' :
                                            paperState === 'discarded' ? 'bg-red-600/20 text-red-400' :
                                            'bg-gray-600/20 text-gray-400'
                                        }`}
                                        title={`State: ${paperState}`}
                                    >
                                        {paperStyle.icon && <paperStyle.icon size={10} />}
                                        <span className="hidden sm:inline">{paperState}</span>
                                    </button>
                                )}

                                <div className="flex-1" />

                                {/* Execute buttons - varies by cell type */}
                                {cellType === 'code' && (
                                    <>
                                        <button
                                            onClick={() => runAllBefore(index)}
                                            disabled={isExecuting !== null}
                                            className="p-1 text-blue-400 hover:bg-blue-500/20 rounded disabled:opacity-50"
                                            title="Run All Above (inclusive)"
                                        >
                                            <SkipBack size={12} />
                                        </button>
                                        <button
                                            onClick={() => executeCell(index)}
                                            disabled={isExecuting === index}
                                            className="p-1 text-green-400 hover:bg-green-500/20 rounded disabled:opacity-50"
                                            title="Run Cell"
                                        >
                                            {isExecuting === index ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                                        </button>
                                        <button
                                            onClick={() => runAllAfter(index)}
                                            disabled={isExecuting !== null}
                                            className="p-1 text-blue-400 hover:bg-blue-500/20 rounded disabled:opacity-50"
                                            title="Run All Below (inclusive)"
                                        >
                                            <SkipForward size={12} />
                                        </button>
                                    </>
                                )}
                                {(cellType === 'chat' || cellType === 'jinx') && (
                                    <button
                                        onClick={() => {
                                            if (cellType === 'chat') executeChatCell(index);
                                            else if (cellType === 'jinx') executeJinxCell(index);
                                        }}
                                        disabled={isExecuting === index}
                                        className="p-1 text-green-400 hover:bg-green-500/20 rounded disabled:opacity-50"
                                        title="Run Cell"
                                    >
                                        {isExecuting === index ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                                    </button>
                                )}

                                {/* Markdown/LaTeX edit button */}
                                {(cellType === 'markdown' || cellType === 'latex') && (
                                    <button
                                        onClick={() => setEditingMarkdownCell(editingMarkdownCell === index ? null : index)}
                                        className={`p-1 hover:bg-gray-700 rounded ${editingMarkdownCell === index ? 'text-blue-400' : 'text-gray-400'}`}
                                        title={editingMarkdownCell === index ? "Done Editing" : "Edit"}
                                    >
                                        <Edit3 size={12} />
                                    </button>
                                )}

                                {/* Add cell menu */}
                                <div className="relative flex items-center">
                                    <button
                                        onClick={() => addCell(index, 'code')}
                                        className="p-1 text-gray-400 hover:bg-gray-700 rounded"
                                        title="Add Code Cell Below"
                                    >
                                        <Plus size={12} />
                                    </button>
                                    <button
                                        onClick={() => setShowAddCellMenu(showAddCellMenu === index ? null : index)}
                                        className="p-0.5 text-gray-400 hover:bg-gray-700 rounded"
                                        title="Add Cell (more options)"
                                    >
                                        <ChevronDown size={10} />
                                    </button>
                                    {showAddCellMenu === index && (
                                        <div className="absolute top-full right-0 mt-1 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                                            {/* Standard cell types for regular .ipynb, extended types for .incognb */}
                                            {(isIncognb ? ['code', 'markdown', 'chat', 'jinx', 'latex', 'data'] : ['code', 'markdown']).map(type => {
                                                const s = cellTypeStyles[type];
                                                const Icon = s.icon;
                                                return (
                                                    <button
                                                        key={type}
                                                        onClick={() => addCell(index, type as CellType)}
                                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2 ${s.text}`}
                                                    >
                                                        <Icon size={12} />
                                                        {s.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => deleteCell(index)}
                                    disabled={notebook.cells.length <= 1}
                                    className="p-1 text-red-400 hover:bg-red-500/20 rounded disabled:opacity-50"
                                    title="Delete Cell"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            {/* Cell content */}
                            {!isCollapsed && (
                                <div className="bg-gray-900">
                                    {/* Code cell */}
                                    {cellType === 'code' && (
                                        <div
                                            onKeyDown={(e) => {
                                                if (e.ctrlKey && e.key === 'Enter') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    executeCell(index);
                                                }
                                            }}
                                            onKeyDownCapture={(e) => {
                                                if (e.ctrlKey && e.key === 'Enter') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }
                                            }}
                                            onFocus={() => setFocusedCellIndex(index)}
                                        >
                                            <CodeMirror
                                                value={source}
                                                onChange={(value) => updateCellSource(index, value)}
                                                extensions={pythonExtensions}
                                                basicSetup={false}
                                                className="text-sm"
                                            />
                                        </div>
                                    )}

                                    {/* Markdown cell */}
                                    {cellType === 'markdown' && (
                                        editingMarkdownCell === index ? (
                                            <div onBlur={() => setEditingMarkdownCell(null)}>
                                                <CodeMirror
                                                    value={source}
                                                    onChange={(value) => updateCellSource(index, value)}
                                                    extensions={markdownExtensions}
                                                    basicSetup={false}
                                                    className="text-sm"
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="p-4 cursor-pointer hover:bg-gray-800/50 min-h-[40px] prose prose-invert prose-sm max-w-none"
                                                onClick={() => setEditingMarkdownCell(index)}
                                                title="Click to edit"
                                            >
                                                {source.trim() ? (
                                                    <MarkdownRenderer content={source} />
                                                ) : (
                                                    <span className="text-gray-500 italic">Click to add markdown...</span>
                                                )}
                                            </div>
                                        )
                                    )}

                                    {/* Chat cell */}
                                    {cellType === 'chat' && (
                                        <div className="p-3">
                                            <textarea
                                                value={source}
                                                onChange={(e) => updateCellSource(index, e.target.value)}
                                                placeholder="Enter your prompt here..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-sm text-gray-200 min-h-[80px] resize-y"
                                            />
                                            {/* Matrix run button */}
                                            <div className="mt-2 flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        // Run on all available models (matrix run)
                                                        const allModelValues = availableModels.slice(0, 4).map(m => m.value);
                                                        executeChatCell(index, allModelValues);
                                                    }}
                                                    className="text-[10px] px-2 py-1 bg-purple-600/20 text-purple-300 rounded hover:bg-purple-600/30 flex items-center gap-1"
                                                    title="Run on multiple models"
                                                >
                                                    <Bot size={10} />
                                                    Matrix Run
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Jinx cell */}
                                    {cellType === 'jinx' && (
                                        <CodeMirror
                                            value={source}
                                            onChange={(value) => updateCellSource(index, value)}
                                            extensions={markdownExtensions}
                                            basicSetup={false}
                                            className="text-sm"
                                            placeholder="Enter jinx YAML or command..."
                                        />
                                    )}

                                    {/* LaTeX cell */}
                                    {cellType === 'latex' && (
                                        editingMarkdownCell === index ? (
                                            <div onBlur={() => setEditingMarkdownCell(null)}>
                                                <CodeMirror
                                                    value={source}
                                                    onChange={(value) => updateCellSource(index, value)}
                                                    extensions={markdownExtensions}
                                                    basicSetup={false}
                                                    className="text-sm"
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="p-4 cursor-pointer hover:bg-gray-800/50 min-h-[40px] prose prose-invert prose-sm max-w-none"
                                                onClick={() => setEditingMarkdownCell(index)}
                                                title="Click to edit"
                                            >
                                                {source.trim() ? (
                                                    <MarkdownRenderer content={`$$${source}$$`} />
                                                ) : (
                                                    <span className="text-gray-500 italic">Click to add LaTeX...</span>
                                                )}
                                            </div>
                                        )
                                    )}

                                    {/* Data cell */}
                                    {cellType === 'data' && (
                                        <div className="p-3">
                                            <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center">
                                                <Paperclip size={24} className="mx-auto mb-2 text-gray-500" />
                                                <p className="text-sm text-gray-400">Drag files here or click to upload</p>
                                                {cell.metadata?.data?.files?.length > 0 && (
                                                    <div className="mt-3 space-y-1">
                                                        {cell.metadata.data.files.map((file, i) => (
                                                            <div key={i} className="text-xs bg-gray-800 rounded px-2 py-1 flex items-center gap-2">
                                                                <Paperclip size={10} />
                                                                <span>{file.name}</span>
                                                                <span className="text-gray-500">v{file.version}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Raw cell */}
                                    {cellType === 'raw' && (
                                        <CodeMirror
                                            value={source}
                                            onChange={(value) => updateCellSource(index, value)}
                                            basicSetup={false}
                                            className="text-sm"
                                        />
                                    )}
                                </div>
                            )}

                            {/* Live streaming output for chat cells */}
                            {!isCollapsed && streamingCellIndex === index && (streamingContent || streamingReasoningContent || streamingToolCalls.length > 0) && (
                                <div className="border-t border-gray-700 bg-gray-850 p-2 space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-purple-400 mb-2">
                                        <Loader size={12} className="animate-spin" />
                                        <span>Generating...</span>
                                    </div>

                                    {/* Streaming reasoning content */}
                                    {streamingReasoningContent && (
                                        <div className="px-3 py-2 bg-gray-800 rounded-md border-l-2 border-yellow-500">
                                            <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                                            <div className="text-xs text-gray-300 whitespace-pre-wrap">
                                                {streamingReasoningContent}
                                            </div>
                                        </div>
                                    )}

                                    {/* Streaming tool calls */}
                                    {streamingToolCalls.map((tool, ti) => renderToolCall(tool, ti))}

                                    {/* Streaming content */}
                                    {streamingContent && (
                                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 p-2 rounded">
                                            {streamingContent}
                                            <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />
                                        </pre>
                                    )}
                                </div>
                            )}

                            {/* Cell outputs - for code, chat, jinx cells */}
                            {!isCollapsed && ['code', 'chat', 'jinx'].includes(cellType) && cell.outputs && cell.outputs.length > 0 && (
                                <div className="border-t border-gray-700 bg-gray-850">
                                    {/* Output header with collapse toggle */}
                                    <div
                                        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-800/50 text-xs text-gray-400"
                                        onClick={() => {
                                            setCollapsedOutputs(prev => {
                                                const next = new Set(prev);
                                                if (next.has(index)) next.delete(index);
                                                else next.add(index);
                                                return next;
                                            });
                                        }}
                                    >
                                        {collapsedOutputs.has(index) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                        <span>Output ({cell.outputs.length} {cell.outputs.length === 1 ? 'item' : 'items'})</span>
                                    </div>
                                    {/* Collapsible output content */}
                                    {!collapsedOutputs.has(index) && (
                                        <div className="p-2 space-y-2 max-h-[500px] overflow-auto">
                                            {cell.outputs.map((output, outputIndex) => (
                                                <div key={outputIndex}>
                                                    {/* Output metadata (model/npc for chat cells) */}
                                                    {output.metadata && (output.metadata.model || output.metadata.npc) && (
                                                        <div className="flex items-center gap-1 mb-1">
                                                            {output.metadata.model && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300">
                                                                    {output.metadata.model}
                                                                </span>
                                                            )}
                                                            {output.metadata.npc && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-300">
                                                                    {output.metadata.npc}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {renderOutput(output, outputIndex)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                    })}
                    </div>
                </div>

                {/* Right Sidebar - Variables Panel & Data Explorer */}
                <div className={`border-l theme-border flex flex-col bg-gray-900/50 transition-all flex-shrink-0 ${showVariablesPanel || explorerVar ? 'w-80 max-w-[33%]' : 'w-10'}`}>
                    {/* Sidebar toggle */}
                    <div className="flex items-center justify-between p-2 border-b theme-border">
                        {(showVariablesPanel || explorerVar) && (
                            <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                <Variable size={12} />
                                Variables
                            </span>
                        )}
                        <button
                            onClick={() => {
                                if (explorerVar) {
                                    setExplorerVar(null);
                                    setExplorerData(null);
                                }
                                setShowVariablesPanel(!showVariablesPanel);
                            }}
                            className="p-1 hover:bg-gray-700 rounded text-gray-400"
                            title={showVariablesPanel ? 'Hide Variables' : 'Show Variables'}
                        >
                            {showVariablesPanel || explorerVar ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
                        </button>
                    </div>

                    {showVariablesPanel && !explorerVar && (
                        <div className="flex-1 overflow-auto">
                            {/* Refresh button */}
                            <div className="p-2 border-b theme-border flex items-center justify-between">
                                <span className="text-[10px] text-gray-500 uppercase">
                                    {variables.length} variable{variables.length !== 1 ? 's' : ''}
                                </span>
                                <button
                                    onClick={refreshVariables}
                                    disabled={variablesLoading || kernelStatus !== 'connected'}
                                    className="p-1 hover:bg-gray-700 rounded text-gray-400 disabled:opacity-50"
                                    title="Refresh Variables"
                                >
                                    <RefreshCw size={12} className={variablesLoading ? 'animate-spin' : ''} />
                                </button>
                            </div>

                            {kernelStatus !== 'connected' ? (
                                <div className="p-4 text-center text-gray-500 text-xs">
                                    <Database size={24} className="mx-auto mb-2 opacity-50" />
                                    Start kernel to view variables
                                </div>
                            ) : variables.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-xs">
                                    No variables yet
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-800">
                                    {variables.map((v) => (
                                        <div
                                            key={v.name}
                                            className="p-2 hover:bg-gray-800/50 cursor-pointer"
                                            onClick={() => {
                                                if (v.is_dataframe || v.is_series) {
                                                    openInExplorer(v.name);
                                                } else {
                                                    setExpandedVars(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(v.name)) next.delete(v.name);
                                                        else next.add(v.name);
                                                        return next;
                                                    });
                                                }
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {v.is_dataframe ? (
                                                        <Table size={12} className="text-blue-400" />
                                                    ) : v.type === 'list' || v.type === 'dict' ? (
                                                        <Code2 size={12} className="text-purple-400" />
                                                    ) : v.type === 'ndarray' ? (
                                                        <Hash size={12} className="text-green-400" />
                                                    ) : (
                                                        <Type size={12} className="text-gray-500" />
                                                    )}
                                                    <span className="text-sm text-gray-200 font-mono">{v.name}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-500">{v.type}</span>
                                            </div>

                                            {/* Shape/size info */}
                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                                                {v.shape && <span className="bg-gray-800 px-1 rounded">{v.shape}</span>}
                                                {v.length !== undefined && <span className="bg-gray-800 px-1 rounded">len: {v.length}</span>}
                                                {v.dtype && <span className="bg-gray-800 px-1 rounded">{v.dtype}</span>}
                                                {v.memory && <span className="bg-gray-800 px-1 rounded">{(v.memory / 1024).toFixed(1)} KB</span>}
                                            </div>

                                            {/* DataFrame columns preview */}
                                            {v.is_dataframe && v.columns && (
                                                <div className="mt-1 text-[10px] text-gray-500 truncate">
                                                    cols: {v.columns.slice(0, 5).join(', ')}{v.columns.length > 5 ? ` +${v.columns.length - 5}` : ''}
                                                </div>
                                            )}

                                            {/* Expanded repr */}
                                            {expandedVars.has(v.name) && !v.is_dataframe && (
                                                <pre className="mt-2 text-[10px] text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                                                    {v.repr}
                                                </pre>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data Explorer */}
                    {explorerVar && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Explorer header */}
                            <div className="p-2 border-b theme-border flex items-center justify-between bg-gray-800">
                                <div className="flex items-center gap-2">
                                    <Table size={14} className="text-blue-400" />
                                    <span className="text-sm font-mono text-blue-300">{explorerVar}</span>
                                    {explorerData && (
                                        <span className="text-[10px] text-gray-500">
                                            {explorerData.total_rows?.toLocaleString()} × {explorerData.total_cols}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setExplorerVar(null); setExplorerData(null); }}
                                    className="p-1 hover:bg-gray-700 rounded text-gray-400"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Column filter */}
                            <div className="p-2 border-b theme-border">
                                <input
                                    type="text"
                                    value={explorerFilter}
                                    onChange={(e) => setExplorerFilter(e.target.value)}
                                    placeholder="Filter columns..."
                                    className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300"
                                />
                            </div>

                            {explorerLoading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <Loader size={24} className="animate-spin text-gray-500" />
                                </div>
                            ) : explorerData ? (
                                <>
                                    {/* Data grid */}
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead className="sticky top-0 bg-gray-800">
                                                <tr>
                                                    <th className="px-2 py-1 text-left text-gray-500 border-b border-gray-700 w-16">#</th>
                                                    {explorerData.columns
                                                        ?.filter((col: any) => !explorerFilter || col.name.toLowerCase().includes(explorerFilter.toLowerCase()))
                                                        .map((col: any) => (
                                                            <th
                                                                key={col.name}
                                                                className="px-2 py-1 text-left border-b border-gray-700 cursor-pointer hover:bg-gray-700 group"
                                                                onClick={() => setShowColumnStats(showColumnStats === col.name ? null : col.name)}
                                                            >
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-300 font-medium">{col.name}</span>
                                                                    <span className="text-[9px] text-gray-500">{col.dtype}</span>
                                                                </div>
                                                                {/* Column stats popup */}
                                                                {showColumnStats === col.name && (
                                                                    <div className="absolute mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-2 text-[10px]">
                                                                        <div className="font-semibold text-gray-300 mb-2">{col.name}</div>
                                                                        <div className="space-y-1 text-gray-400">
                                                                            <div className="flex justify-between"><span>Type:</span><span className="text-gray-300">{col.dtype}</span></div>
                                                                            <div className="flex justify-between"><span>Nulls:</span><span className="text-gray-300">{col.null_count ?? 'N/A'}</span></div>
                                                                            <div className="flex justify-between"><span>Unique:</span><span className="text-gray-300">{col.unique_count ?? 'N/A'}</span></div>
                                                                            {col.min !== undefined && <div className="flex justify-between"><span>Min:</span><span className="text-gray-300">{col.min?.toFixed?.(2) ?? col.min}</span></div>}
                                                                            {col.max !== undefined && <div className="flex justify-between"><span>Max:</span><span className="text-gray-300">{col.max?.toFixed?.(2) ?? col.max}</span></div>}
                                                                            {col.mean !== undefined && <div className="flex justify-between"><span>Mean:</span><span className="text-gray-300">{col.mean?.toFixed?.(2) ?? col.mean}</span></div>}
                                                                            {col.std !== undefined && <div className="flex justify-between"><span>Std:</span><span className="text-gray-300">{col.std?.toFixed?.(2) ?? col.std}</span></div>}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </th>
                                                        ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {explorerData.rows?.map((row: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-800/50">
                                                        <td className="px-2 py-1 text-gray-500 border-b border-gray-800 font-mono">
                                                            {row.__index__ ?? explorerOffset + i}
                                                        </td>
                                                        {explorerData.columns
                                                            ?.filter((col: any) => !explorerFilter || col.name.toLowerCase().includes(explorerFilter.toLowerCase()))
                                                            .map((col: any) => (
                                                                <td key={col.name} className="px-2 py-1 text-gray-300 border-b border-gray-800 font-mono max-w-[150px] truncate" title={String(row[col.name] ?? '')}>
                                                                    {row[col.name] === null ? <span className="text-gray-600 italic">null</span> :
                                                                     typeof row[col.name] === 'number' ? row[col.name].toLocaleString() :
                                                                     String(row[col.name]).slice(0, 50)}
                                                                </td>
                                                            ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    <div className="p-2 border-t theme-border flex items-center justify-between text-xs text-gray-400">
                                        <span>
                                            {explorerOffset + 1}-{Math.min(explorerOffset + 100, explorerData.total_rows)} of {explorerData.total_rows?.toLocaleString()}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => loadDataFrameData(explorerVar, Math.max(0, explorerOffset - 100))}
                                                disabled={explorerOffset === 0}
                                                className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <button
                                                onClick={() => loadDataFrameData(explorerVar, explorerOffset + 100)}
                                                disabled={explorerOffset + 100 >= explorerData.total_rows}
                                                className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {/* Matplotlib Configuration Modal */}
            {showMplConfig && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMplConfig(false)}>
                    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Palette size={16} className="text-purple-400" />
                                <span className="font-semibold text-gray-200">Matplotlib Configuration</span>
                            </div>
                            <button onClick={() => setShowMplConfig(false)} className="p-1 hover:bg-gray-700 rounded">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* Style preset */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Style Preset</label>
                                <select
                                    value={mplConfig.style}
                                    onChange={e => setMplConfig({...mplConfig, style: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                >
                                    <option value="default">Scientific</option>
                                    <option value="classic">Classic</option>
                                    <option value="grayscale">Grayscale</option>
                                    <option value="dark_background">Dark Background</option>
                                </select>
                            </div>

                            {/* Font settings */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Font Family</label>
                                    <select
                                        value={mplConfig.fontFamily}
                                        onChange={e => setMplConfig({...mplConfig, fontFamily: e.target.value})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    >
                                        <option value="serif">Serif (Paper)</option>
                                        <option value="sans-serif">Sans-Serif</option>
                                        <option value="monospace">Monospace</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Base Font Size</label>
                                    <input
                                        type="number"
                                        value={mplConfig.fontSize}
                                        onChange={e => setMplConfig({...mplConfig, fontSize: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Label/Tick sizes */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Axis Label Size</label>
                                    <input
                                        type="number"
                                        value={mplConfig.labelSize}
                                        onChange={e => setMplConfig({...mplConfig, labelSize: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Tick Label Size</label>
                                    <input
                                        type="number"
                                        value={mplConfig.tickSize}
                                        onChange={e => setMplConfig({...mplConfig, tickSize: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Figure size */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Figure Width</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={mplConfig.figWidth}
                                        onChange={e => setMplConfig({...mplConfig, figWidth: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Figure Height</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={mplConfig.figHeight}
                                        onChange={e => setMplConfig({...mplConfig, figHeight: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">DPI</label>
                                    <input
                                        type="number"
                                        value={mplConfig.dpi}
                                        onChange={e => setMplConfig({...mplConfig, dpi: Number(e.target.value)})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Colormap */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Default Colormap</label>
                                <select
                                    value={mplConfig.cmap}
                                    onChange={e => setMplConfig({...mplConfig, cmap: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                >
                                    <option value="plasma">Plasma</option>
                                    <option value="viridis">Viridis</option>
                                    <option value="magma">Magma</option>
                                    <option value="inferno">Inferno</option>
                                    <option value="cividis">Cividis</option>
                                    <option value="coolwarm">Coolwarm</option>
                                    <option value="RdBu">RdBu</option>
                                    <option value="Spectral">Spectral</option>
                                </select>
                            </div>

                            {/* Tick settings */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Tick Direction</label>
                                    <select
                                        value={mplConfig.tickDirection}
                                        onChange={e => setMplConfig({...mplConfig, tickDirection: e.target.value})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    >
                                        <option value="in">Inward (Paper)</option>
                                        <option value="out">Outward</option>
                                        <option value="inout">Both</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Grid Axis</label>
                                    <select
                                        value={mplConfig.gridAxis}
                                        onChange={e => setMplConfig({...mplConfig, gridAxis: e.target.value})}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                                    >
                                        <option value="both">Both</option>
                                        <option value="x">X only</option>
                                        <option value="y">Y only</option>
                                    </select>
                                </div>
                            </div>

                            {/* Toggles */}
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={mplConfig.usetex}
                                        onChange={e => setMplConfig({...mplConfig, usetex: e.target.checked})}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <span className="text-gray-300">Use LaTeX</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={mplConfig.minorTicks}
                                        onChange={e => setMplConfig({...mplConfig, minorTicks: e.target.checked})}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <span className="text-gray-300">Minor Ticks</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={mplConfig.legendFrame}
                                        onChange={e => setMplConfig({...mplConfig, legendFrame: e.target.checked})}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <span className="text-gray-300">Legend Frame</span>
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="p-3 border-t border-gray-700 flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                                {mplConfigApplied ? '✓ Applied to kernel' : 'Not yet applied'}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowMplConfig(false)}
                                    className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { applyMplConfig(); setShowMplConfig(false); }}
                                    disabled={kernelStatus !== 'connected'}
                                    className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50"
                                >
                                    Apply to Kernel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status bar */}
            <div className="p-2 border-t theme-border text-xs theme-text-muted flex items-center justify-between theme-bg-secondary">
                <div className="flex items-center gap-3">
                    <span>{(notebook.cells || []).length} cells</span>
                    <span className="text-gray-600">|</span>
                    <span className="flex items-center gap-1">
                        {kernelStatus === 'connected' && <Circle size={6} className="fill-green-400 text-green-400" />}
                        {kernelStatus === 'starting' && <Loader size={10} className="animate-spin text-yellow-400" />}
                        {kernelStatus === 'busy' && <Loader size={10} className="animate-spin text-blue-400" />}
                        {kernelStatus === 'disconnected' && <Circle size={6} className="text-gray-500" />}
                        <span className={
                            kernelStatus === 'connected' ? 'text-green-400' :
                            kernelStatus === 'starting' ? 'text-yellow-400' :
                            kernelStatus === 'busy' ? 'text-blue-400' :
                            'text-gray-500'
                        }>
                            {kernelStatus === 'connected' ? 'Kernel ready' :
                             kernelStatus === 'starting' ? 'Starting kernel...' :
                             kernelStatus === 'busy' ? 'Running...' :
                             'No kernel'}
                        </span>
                    </span>
                </div>
                <div className="text-gray-500">
                    {hasChanges ? 'Unsaved changes' : 'Saved'}
                </div>
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(NotebookViewer, arePropsEqual);
