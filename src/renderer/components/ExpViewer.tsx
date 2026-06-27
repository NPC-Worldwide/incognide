import { getFileName } from './utils';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BACKEND_URL } from '../config';
import {
    FlaskConical, Beaker, Database, BarChart3, MessageSquare, FileText,
    Plus, Play, Trash2, ChevronDown, ChevronRight, Save, FileDown,
    Code, Hash, Image, Zap, Edit3, Check, X, Clock, GitBranch,
    Lightbulb, TestTube, FolderOpen, PenTool, CheckCircle
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface ExpFile {
    exp_version: string;
    created_at: string;
    modified_at: string;
    hypothesis: string;
    sections: ExpSection[];
    status: 'draft' | 'in_progress' | 'concluded' | 'archived';
    conclusion: string | null;
    tags: string[];
    session_ids: string[];
    notes: ExpNote[];
    artifacts: ExpArtifact[];
}

interface ExpSection {
    id: string;
    type: string;
    title: string;
    order: number;
    blocks: ExpBlock[];
}

interface ExpBlock {
    id: string;
    block_type: 'markdown' | 'code' | 'latex' | 'chat' | 'jinx' | 'data' | 'figure' | 'query';
    source: string;
    outputs?: any[];
    in_paper: boolean;
    paper_label?: string;
    created_at: string;
    execution_history: BlockExecution[];
    chat_config?: {
        model: string;
        provider: string;
        npc?: string;
        conversation_id?: string;
    };
    data_refs?: {
        path: string;
        hash: string;
        version: number;
    }[];
    language?: string;
}

interface BlockExecution {
    timestamp: string;
    duration_ms: number;
    config: Record<string, any>;
    input_hashes: string[];
    output_hash: string;
    status: 'success' | 'error';
}

interface ExpNote {
    id: string;
    timestamp: string;
    text: string;
    section_id?: string;
    block_id?: string;
}

interface ExpArtifact {
    path: string;
    description: string;
    block_id?: string;
    in_paper: boolean;
}

interface ExpViewerProps {
    filePath: string;
    currentPath: string;
    modelsToDisplay?: any[];
    availableNPCs?: any[];
    jinxesToDisplay?: any[];
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
    hypothesis: <Lightbulb size={14} />,
    methods: <Beaker size={14} />,
    data: <Database size={14} />,
    results: <BarChart3 size={14} />,
    discussion: <MessageSquare size={14} />,
    conclusion: <CheckCircle size={14} />,
    custom: <FileText size={14} />,
};

const BLOCK_TYPE_ICONS: Record<string, React.ReactNode> = {
    markdown: <FileText size={12} />,
    code: <Code size={12} />,
    latex: <Hash size={12} />,
    chat: <MessageSquare size={12} />,
    jinx: <Zap size={12} />,
    data: <Database size={12} />,
    figure: <Image size={12} />,
    query: <Database size={12} />,
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const CODE_LANGS: Record<string, any> = {
    python: python(),
    javascript: javascript(),
    r: python(),
    julia: python(),
};

const getCodeExtension = (lang?: string) => {
    if (!lang) return python();
    return CODE_LANGS[lang] || python();
};

const ExpViewer: React.FC<ExpViewerProps> = ({
    filePath,
    currentPath,
    modelsToDisplay = [],
    availableNPCs = [],
    jinxesToDisplay = [],
}) => {
    const [expData, setExpData] = useState<ExpFile | null>(null);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingHypothesis, setEditingHypothesis] = useState(false);
    const [hypothesisInput, setHypothesisInput] = useState('');
    const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
    const [editingBlocks, setEditingBlocks] = useState<Set<string>>(new Set());
    const [executingBlocks, setExecutingBlocks] = useState<Set<string>>(new Set());
    const [streamingBlockId, setStreamingBlockId] = useState<string | null>(null);
    const [streamingContent, setStreamingContent] = useState<string>('');
    const [streamingReasoningContent, setStreamingReasoningContent] = useState<string>('');
    const [streamingToolCalls, setStreamingToolCalls] = useState<any[]>([]);
    const [addingSection, setAddingSection] = useState(false);
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
    const [renameInput, setRenameInput] = useState('');
    const [dragSectionId, setDragSectionId] = useState<string | null>(null);
    const [kernelId, setKernelId] = useState<string | null>(null);
    const [kernelStatus, setKernelStatus] = useState<'disconnected' | 'starting' | 'connected' | 'busy'>('disconnected');
    const [availableKernels, setAvailableKernels] = useState<any[]>([]);
    const [selectedKernel, setSelectedKernel] = useState<string>('python3');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const streamingContentRef = useRef<string>('');
    const streamingReasoningRef = useRef<string>('');
    const streamingToolCallsRef = useRef<any[]>([]);

    useEffect(() => {
        const loadExp = async () => {
            setLoading(true);
            try {
                const result = await (window as any).api?.readFileContent?.(filePath);
                const content = result?.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    setExpData(parsed);
                    setHypothesisInput(parsed.hypothesis || '');
                    if (parsed.sections?.length > 0) {
                        setActiveSection(parsed.sections.sort((a: ExpSection, b: ExpSection) => a.order - b.order)[0].id);
                    } else {
                        setActiveSection(null);
                    }
                }
            } catch (err) {
                console.error('[ExpViewer] Error loading exp file:', err);

                const newExp = createEmptyExp();
                setExpData(newExp);
                setHypothesisInput('');
                setActiveSection(null);
            } finally {
                setLoading(false);
            }
        };
        loadExp();
    }, [filePath]);

    const createEmptyExp = (): ExpFile => ({
        exp_version: '1.0',
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        hypothesis: '',
        sections: [],
        status: 'draft',
        conclusion: null,
        tags: [],
        session_ids: [],
        notes: [],
        artifacts: [],
    });

    const addSection = (title: string) => {
        const newSection: ExpSection = {
            id: generateId(),
            type: 'custom',
            title,
            order: expData?.sections.length || 0,
            blocks: [],
        };
        updateExpData(prev => ({
            ...prev,
            sections: [...prev.sections, newSection],
        }));
        setActiveSection(newSection.id);
    };

    const removeSection = (sectionId: string) => {
        updateExpData(prev => {
            const filtered = prev.sections.filter(s => s.id !== sectionId);
            const reordered = filtered.map((s, i) => ({ ...s, order: i }));
            return { ...prev, sections: reordered };
        });
        if (activeSection === sectionId) {
            const remaining = expData?.sections.filter(s => s.id !== sectionId).sort((a, b) => a.order - b.order);
            setActiveSection(remaining && remaining.length > 0 ? remaining[0].id : null);
        }
    };

    const renameSection = (sectionId: string, newTitle: string) => {
        updateExpData(prev => ({
            ...prev,
            sections: prev.sections.map(s =>
                s.id === sectionId ? { ...s, title: newTitle } : s
            ),
        }));
    };

    const moveSection = (sectionId: string, direction: -1 | 1) => {
        updateExpData(prev => {
            const idx = prev.sections.findIndex(s => s.id === sectionId);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.sections.length) return prev;
            const sections = [...prev.sections];
            [sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]];
            return { ...prev, sections: sections.map((s, i) => ({ ...s, order: i })) };
        });
    };

    const saveExp = useCallback(async (data: ExpFile) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                const updated = { ...data, modified_at: new Date().toISOString() };
                await (window as any).api?.writeFileContent?.(filePath, JSON.stringify(updated, null, 2));
                setExpData(updated);
            } catch (err) {
                console.error('[ExpViewer] Error saving:', err);
            } finally {
                setSaving(false);
            }
        }, 500);
    }, [filePath]);

    useEffect(() => {
        const discover = async () => {
            try {
                const result = await (window as any).api?.jupyterListKernels?.({ workspacePath: currentPath });
                if (result?.success && result.kernels) {
                    setAvailableKernels(result.kernels);
                    const ready = result.kernels.find((k: any) => !k.needsIpykernel);
                    if (ready && !selectedKernel) {
                        setSelectedKernel(ready.name);
                    }
                }
            } catch (err) {
                console.error('[ExpViewer] Failed to discover kernels:', err);
            }
        };
        discover();
    }, [currentPath]);

    const ensureKernel = async () => {
        if (kernelId && kernelStatus === 'connected') return kernelId;
        setKernelStatus('starting');
        const newKernelId = `exp_kernel_${Date.now()}`;
        const selectedKernelObj = availableKernels.find((k: any) => k.name === selectedKernel);
        try {
            const result = await (window as any).api?.jupyterStartKernel?.({
                kernelId: newKernelId,
                kernelName: selectedKernel,
                workspacePath: currentPath,
                pythonOverridePath: selectedKernelObj?.pythonPath,
                needsRegistration: selectedKernelObj?.needsRegistration,
            });
            if (result?.success) {
                setKernelId(newKernelId);
                setKernelStatus('connected');
                return newKernelId;
            }
            throw new Error(result?.error || 'Kernel start failed');
        } catch (err: any) {
            setKernelStatus('disconnected');
            throw err;
        }
    };

    const updateExpData = useCallback((updater: (prev: ExpFile) => ExpFile) => {
        setExpData(prev => {
            if (!prev) return prev;
            const updated = updater(prev);
            saveExp(updated);
            return updated;
        });
    }, [saveExp]);

    const handleHypothesisSave = () => {
        updateExpData(prev => ({ ...prev, hypothesis: hypothesisInput }));
        setEditingHypothesis(false);
    };

    const addBlock = (sectionId: string, blockType: ExpBlock['block_type']) => {
        const newBlock: ExpBlock = {
            id: generateId(),
            block_type: blockType,
            source: '',
            outputs: [],
            in_paper: true,
            created_at: new Date().toISOString(),
            execution_history: [],
        };

        if (blockType === 'chat') {
            newBlock.chat_config = {
                model: modelsToDisplay[0]?.value || 'gpt-4',
                provider: 'openai',
            };
        }

        updateExpData(prev => ({
            ...prev,
            sections: prev.sections.map(s =>
                s.id === sectionId
                    ? { ...s, blocks: [...s.blocks, newBlock] }
                    : s
            ),
        }));

        setEditingBlocks(prev => new Set(prev).add(newBlock.id));
    };

    const updateBlock = (sectionId: string, blockId: string, updates: Partial<ExpBlock>) => {
        updateExpData(prev => ({
            ...prev,
            sections: prev.sections.map(s =>
                s.id === sectionId
                    ? {
                        ...s,
                        blocks: s.blocks.map(b =>
                            b.id === blockId ? { ...b, ...updates } : b
                        ),
                    }
                    : s
            ),
        }));
    };

    const deleteBlock = (sectionId: string, blockId: string) => {
        updateExpData(prev => ({
            ...prev,
            sections: prev.sections.map(s =>
                s.id === sectionId
                    ? { ...s, blocks: s.blocks.filter(b => b.id !== blockId) }
                    : s
            ),
        }));
    };

    const toggleBlockExpanded = (blockId: string) => {
        setExpandedBlocks(prev => {
            const next = new Set(prev);
            if (next.has(blockId)) next.delete(blockId);
            else next.add(blockId);
            return next;
        });
    };

    const toggleBlockEditing = (blockId: string) => {
        setEditingBlocks(prev => {
            const next = new Set(prev);
            if (next.has(blockId)) next.delete(blockId);
            else next.add(blockId);
            return next;
        });
    };

    const executeBlock = async (sectionId: string, block: ExpBlock) => {
        const startTime = Date.now();

        if (block.block_type === 'code') {

            try {
                const result = await (window as any).api?.executeCode?.({
                    code: block.source,
                    workingDir: currentPath,
                });
                const execution: BlockExecution = {
                    timestamp: new Date().toISOString(),
                    duration_ms: Date.now() - startTime,
                    config: {},
                    input_hashes: [],
                    output_hash: '',
                    status: result?.error ? 'error' : 'success',
                };
                updateBlock(sectionId, block.id, {
                    outputs: result?.error
                        ? [{ output_type: 'error', text: result.error }]
                        : [{ output_type: 'execute_result', text: result?.output || '' }],
                    execution_history: [...block.execution_history, execution],
                });
            } catch (err: any) {
                updateBlock(sectionId, block.id, {
                    outputs: [{ output_type: 'error', text: err.message }],
                });
            }
        } else if (block.block_type === 'chat') {

            const streamId = generateId();
            const model = block.chat_config?.model || modelsToDisplay[0]?.value || 'gpt-4';
            const selectedModelObj = modelsToDisplay.find((m: any) => m.value === model);
            const provider = selectedModelObj?.provider || block.chat_config?.provider || 'openai';
            const npc = block.chat_config?.npc;

            setExecutingBlocks(prev => new Set(prev).add(block.id));
            setStreamingBlockId(block.id);
            setStreamingContent('');
            setStreamingReasoningContent('');
            setStreamingToolCalls([]);
            streamingContentRef.current = '';
            streamingReasoningRef.current = '';
            streamingToolCallsRef.current = [];

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

            const cleanupData = (window as any).api?.onStreamData?.((_: any, data: any) => {
                if (data.streamId === streamId && data.chunk) {
                    try {
                        const chunk = data.chunk;
                        let content = '', reasoningContent = '', toolCalls: any[] | null = null;

                        if (typeof chunk === 'string') {

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

                        if (content) {
                            streamingContentRef.current += content;
                            setStreamingContent(streamingContentRef.current);
                        }

                        if (reasoningContent) {
                            streamingReasoningRef.current += reasoningContent;
                            setStreamingReasoningContent(streamingReasoningRef.current);
                        }

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

                    }
                }
            });

            const cleanupComplete = (window as any).api?.onStreamComplete?.((_: any, data: any) => {
                if (data.streamId === streamId) {
                    const finalContent = streamingContentRef.current;
                    const finalReasoning = streamingReasoningRef.current;
                    const finalToolCalls = streamingToolCallsRef.current;
                    const execution: BlockExecution = {
                        timestamp: new Date().toISOString(),
                        duration_ms: Date.now() - startTime,
                        config: { model, provider },
                        input_hashes: [],
                        output_hash: '',
                        status: 'success',
                    };
                    updateBlock(sectionId, block.id, {
                        outputs: [{
                            output_type: 'chat_response',
                            text: finalContent || 'No response',
                            reasoningContent: finalReasoning || undefined,
                            toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
                        }],
                        execution_history: [...block.execution_history, execution],
                    });
                    setExecutingBlocks(prev => {
                        const next = new Set(prev);
                        next.delete(block.id);
                        return next;
                    });
                    setStreamingBlockId(null);
                    setStreamingContent('');
                    setStreamingReasoningContent('');
                    setStreamingToolCalls([]);
                    streamingContentRef.current = '';
                    streamingReasoningRef.current = '';
                    streamingToolCallsRef.current = [];
                    cleanupData?.();
                    cleanupComplete?.();
                    cleanupError?.();
                }
            });

            const cleanupError = (window as any).api?.onStreamError?.((_: any, data: any) => {
                if (data.streamId === streamId) {
                    updateBlock(sectionId, block.id, {
                        outputs: [{ output_type: 'error', text: data.error || 'Stream error' }],
                    });
                    setExecutingBlocks(prev => {
                        const next = new Set(prev);
                        next.delete(block.id);
                        return next;
                    });
                    setStreamingBlockId(null);
                    setStreamingContent('');
                    setStreamingReasoningContent('');
                    setStreamingToolCalls([]);
                    streamingContentRef.current = '';
                    streamingReasoningRef.current = '';
                    streamingToolCallsRef.current = [];
                    cleanupData?.();
                    cleanupComplete?.();
                    cleanupError?.();
                }
            });

            (window as any).api?.executeCommandStream?.({
                streamId,
                commandstr: block.source,
                currentPath,
                conversationId: `exp-${block.id}`,
                model,
                provider,
                npc: npc || null,
            });
        } else if (block.block_type === 'jinx') {

            try {
                const response = await fetch(`${BACKEND_URL}/api/jinx/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jinxName: block.source.split('\n')[0].trim(),
                        inputs: {},
                        workingDir: currentPath
                    })
                });

                const result = await response.json();
                const execution: BlockExecution = {
                    timestamp: new Date().toISOString(),
                    duration_ms: Date.now() - startTime,
                    config: {},
                    input_hashes: [],
                    output_hash: '',
                    status: result.success ? 'success' : 'error',
                };
                updateBlock(sectionId, block.id, {
                    outputs: result.success
                        ? [{ output_type: 'execute_result', text: typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2) }]
                        : [{ output_type: 'error', text: result.error || 'Jinx execution failed' }],
                    execution_history: [...block.execution_history, execution],
                });
            } catch (err: any) {
                updateBlock(sectionId, block.id, {
                    outputs: [{ output_type: 'error', text: err.message }],
                });
            }
        } else if (block.block_type === 'query') {
            try {
                const result = await (window as any).api?.executeSQL?.({ query: block.source });
                const execution: BlockExecution = {
                    timestamp: new Date().toISOString(),
                    duration_ms: Date.now() - startTime,
                    config: {},
                    input_hashes: [],
                    output_hash: '',
                    status: result?.error ? 'error' : 'success',
                };
                updateBlock(sectionId, block.id, {
                    outputs: result?.error
                        ? [{ output_type: 'error', text: result.error }]
                        : [{ output_type: 'execute_result', text: typeof result?.result === 'string' ? result.result : JSON.stringify(result?.result, null, 2) }],
                    execution_history: [...block.execution_history, execution],
                });
            } catch (err: any) {
                updateBlock(sectionId, block.id, {
                    outputs: [{ output_type: 'error', text: err.message }],
                });
            }
        }
    };

    const renderBlockContent = (block: ExpBlock, sectionId: string) => {
        const isEditing = editingBlocks.has(block.id);

        switch (block.block_type) {
            case 'markdown':
                return isEditing ? (
                    <CodeMirror
                        value={block.source}
                        extensions={[markdown()]}
                        onChange={(value) => updateBlock(sectionId, block.id, { source: value })}
                        className="text-sm border border-white/10 rounded"
                        theme="dark"
                        basicSetup={{ lineNumbers: false }}
                    />
                ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {block.source || '*Click edit to add content*'}
                        </ReactMarkdown>
                    </div>
                );

            case 'code':
                return (
                    <div className="space-y-1">
                        {isEditing && (
                            <select
                                value={block.language || 'python'}
                                onChange={(e) => updateBlock(sectionId, block.id, { language: e.target.value })}
                                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-gray-300"
                            >
                                {Object.keys(CODE_LANGS).map(lang => (
                                    <option key={lang} value={lang}>{lang}</option>
                                ))}
                            </select>
                        )}
                        <CodeMirror
                            value={block.source}
                            extensions={[getCodeExtension(block.language)]}
                            onChange={(value) => updateBlock(sectionId, block.id, { source: value })}
                            className="text-sm border border-white/10 rounded"
                            theme="dark"
                            readOnly={!isEditing}
                        />
                    </div>
                );

            case 'latex':
                return isEditing ? (
                    <CodeMirror
                        value={block.source}
                        extensions={[markdown()]}
                        onChange={(value) => updateBlock(sectionId, block.id, { source: value })}
                        className="text-sm border border-white/10 rounded"
                        theme="dark"
                    />
                ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {`$$${block.source}$$`}
                        </ReactMarkdown>
                    </div>
                );

            case 'chat':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                            <select
                                value={block.chat_config?.model || ''}
                                onChange={(e) => updateBlock(sectionId, block.id, {
                                    chat_config: { ...block.chat_config!, model: e.target.value }
                                })}
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-300"
                            >
                                {modelsToDisplay.map((m: any) => (
                                    <option key={m.value} value={m.value}>{m.display_name || m.value}</option>
                                ))}
                            </select>
                            <select
                                value={block.chat_config?.npc || ''}
                                onChange={(e) => updateBlock(sectionId, block.id, {
                                    chat_config: { ...block.chat_config!, npc: e.target.value }
                                })}
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-300"
                            >
                                <option value="">No NPC</option>
                                {availableNPCs.map((n: any) => (
                                    <option key={n.value} value={n.value}>{n.display_name || n.value}</option>
                                ))}
                            </select>
                        </div>
                        <textarea
                            value={block.source}
                            onChange={(e) => updateBlock(sectionId, block.id, { source: e.target.value })}
                            placeholder="Enter your prompt..."
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-gray-200 resize-none"
                            rows={3}
                        />
                    </div>
                );

            case 'jinx':
                return (
                    <div className="space-y-2">
                        <select
                            value={block.source.split('\n')[0] || ''}
                            onChange={(e) => updateBlock(sectionId, block.id, { source: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-gray-300"
                        >
                            <option value="">Select Jinx...</option>
                            {jinxesToDisplay.map((j: any) => (
                                <option key={j.name} value={j.name}>{j.name}</option>
                            ))}
                        </select>
                    </div>
                );

            case 'data':
                return (
                    <div className="text-sm text-gray-400">
                        {block.data_refs?.length ? (
                            <ul className="space-y-1">
                                {block.data_refs.map((ref, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <Database size={12} />
                                        <span>{ref.path}</span>
                                        <span className="text-xs text-gray-500">v{ref.version}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <button className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded hover:bg-white/10">
                                <Plus size={14} /> Add data reference
                            </button>
                        )}
                    </div>
                );

            case 'figure':
                const handleFigureDrop = async (e: React.DragEvent) => {
                    e.preventDefault();
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        const file = files[0];
                        if (file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                updateBlock(sectionId, block.id, {
                                    outputs: [{ output_type: 'image', image: ev.target?.result }]
                                });
                            };
                            reader.readAsDataURL(file);
                        }
                    }
                };
                const pickFigureFile = async () => {
                    const result = await (window as any).api?.showOpenDialog?.({
                        properties: ['openFile'],
                        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
                    });
                    if (result?.filePaths?.[0]) {
                        const content = await (window as any).api?.readFileContent?.(result.filePaths[0]);
                        if (content?.content) {
                            const ext = result.filePaths[0].split('.').pop()?.toLowerCase();
                            const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
                            const dataUrl = `data:${mime};base64,${btoa(content.content)}`;
                            updateBlock(sectionId, block.id, {
                                outputs: [{ output_type: 'image', image: dataUrl }]
                            });
                        }
                    }
                };
                return (
                    <div
                        className="text-sm text-gray-400"
                        onDrop={handleFigureDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {block.outputs?.[0]?.image ? (
                            <div className="relative group">
                                <img src={block.outputs[0].image} alt={block.paper_label || 'Figure'} className="max-w-full rounded" />
                                <button
                                    onClick={() => updateBlock(sectionId, block.id, { outputs: [] })}
                                    className="absolute top-2 right-2 p-1 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove image"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-32 bg-white/5 rounded border border-dashed border-white/20 gap-2">
                                <span className="text-gray-500">Drag image here</span>
                                <button
                                    onClick={pickFigureFile}
                                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                                >
                                    <Plus size={12} /> Browse
                                </button>
                            </div>
                        )}
                    </div>
                );

            case 'query':
                return isEditing ? (
                    <CodeMirror
                        value={block.source}
                        extensions={[markdown()]}
                        onChange={(value) => updateBlock(sectionId, block.id, { source: value })}
                        className="text-sm border border-white/10 rounded"
                        theme="dark"
                        basicSetup={{ lineNumbers: false }}
                    />
                ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                        <pre className="bg-black/30 p-2 rounded text-xs text-gray-300">{block.source || '/* Click edit to write SQL */'}</pre>
                    </div>
                );

            default:
                return <div className="text-gray-500 text-sm">Unknown block type</div>;
        }
    };

    const renderToolCall = (tool: any, index: number) => {
        const statusColor = tool.status === 'error' ? 'border-red-500'
            : tool.status === 'complete' ? 'border-green-500'
            : 'border-blue-500';

        return (
            <div key={tool.id || index} className={`my-2 px-3 py-2 bg-white/5 rounded-md border-l-2 ${statusColor}`}>
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

    const renderBlockOutputs = (block: ExpBlock) => {
        const isStreaming = streamingBlockId === block.id;
        const hasStreamContent = isStreaming && (streamingContent || streamingReasoningContent || streamingToolCalls.length > 0);
        const hasOutputs = block.outputs?.length;

        if (!hasOutputs && !hasStreamContent) return null;

        return (
            <div className="mt-2 border-t border-white/10 pt-2 space-y-2">
                {isStreaming ? (
                    <div className="text-sm space-y-2">
                        {streamingReasoningContent && (
                            <div className="px-3 py-2 bg-white/5 rounded-md border-l-2 border-yellow-500">
                                <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                                <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingReasoningContent}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        {streamingToolCalls.map((tool, i) => renderToolCall(tool, i))}

                        {streamingContent && (
                            <div className="prose prose-invert prose-sm max-w-none bg-white/5 p-2 rounded">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                                <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />
                            </div>
                        )}
                    </div>
                ) : (
                    block.outputs?.map((output, i) => (
                        <div key={i} className="text-sm space-y-2">
                            {output.output_type === 'error' ? (
                                <pre className="text-red-400 bg-red-900/20 p-2 rounded overflow-x-auto">{output.text}</pre>
                            ) : output.output_type === 'chat_response' ? (
                                <>
                                    {output.reasoningContent && (
                                        <div className="px-3 py-2 bg-white/5 rounded-md border-l-2 border-yellow-500">
                                            <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                                            <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output.reasoningContent}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}

                                    {output.toolCalls?.map((tool: any, ti: number) => renderToolCall(tool, ti))}

                                    <div className="prose prose-invert prose-sm max-w-none bg-white/5 p-2 rounded">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{output.text}</ReactMarkdown>
                                    </div>
                                </>
                            ) : (
                                <pre className="text-gray-300 bg-white/5 p-2 rounded overflow-x-auto">{
                                    typeof output === 'string' ? output : JSON.stringify(output, null, 2)
                                }</pre>
                            )}
                        </div>
                    ))
                )}
            </div>
        );
    };

    const renderBlock = (block: ExpBlock, sectionId: string, _index: number) => {
        const isExpanded = expandedBlocks.has(block.id);
        const isEditing = editingBlocks.has(block.id);
        const isExecuting = executingBlocks.has(block.id);

        return (
            <div
                key={block.id}
                className={`border rounded-lg overflow-hidden transition-all ${
                    block.in_paper ? 'border-green-500/30 bg-green-900/10' : 'border-white/10 bg-white/5'
                } ${isExecuting ? 'border-purple-500/50' : ''}`}
            >
                <div className="flex items-center justify-between px-3 py-2 bg-white/5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => toggleBlockExpanded(block.id)}
                            className="text-gray-400 hover:text-white"
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <span className="text-gray-400">{BLOCK_TYPE_ICONS[block.block_type]}</span>
                        <span className="text-xs text-gray-300 capitalize">{block.block_type}</span>
                        {block.paper_label && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                                {block.paper_label}
                            </span>
                        )}
                        {isExecuting && (
                            <span className="text-xs text-purple-400 flex items-center gap-1">
                                <span className="animate-spin inline-block w-3 h-3 border border-purple-400 border-t-transparent rounded-full" />
                                Running...
                            </span>
                        )}
                        {!isExecuting && block.execution_history.length > 0 && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock size={10} />
                                {block.execution_history.length} runs
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {(block.block_type === 'code' || block.block_type === 'chat' || block.block_type === 'jinx' || block.block_type === 'query') && (
                            <button
                                onClick={() => !isExecuting && executeBlock(sectionId, block)}
                                className={`p-1.5 rounded ${isExecuting ? 'bg-purple-500/20 text-purple-400 cursor-wait' : 'hover:bg-green-500/20 text-green-400'}`}
                                title={isExecuting ? 'Running...' : 'Run'}
                                disabled={isExecuting}
                            >
                                {isExecuting ? (
                                    <span className="animate-spin inline-block w-3 h-3 border border-purple-400 border-t-transparent rounded-full" />
                                ) : (
                                    <Play size={12} />
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => toggleBlockEditing(block.id)}
                            className={`p-1.5 rounded ${isEditing ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-gray-400'}`}
                            title={isEditing ? 'Done editing' : 'Edit'}
                        >
                            {isEditing ? <Check size={12} /> : <Edit3 size={12} />}
                        </button>
                        <button
                            onClick={() => updateBlock(sectionId, block.id, { in_paper: !block.in_paper })}
                            className={`p-1.5 rounded ${block.in_paper ? 'bg-green-500/20 text-green-400' : 'hover:bg-white/10 text-gray-400'}`}
                            title="Include in export"
                        >
                            <FileDown size={12} />
                        </button>
                        <button
                            onClick={() => deleteBlock(sectionId, block.id)}
                            className="p-1.5 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400"
                            title="Delete"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>

                {isExpanded && (
                    <div className="px-3 py-2">
                        {renderBlockContent(block, sectionId)}
                        {renderBlockOutputs(block)}
                    </div>
                )}
            </div>
        );
    };

    const renderSection = (section: ExpSection) => {
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                    {(['markdown', 'code', 'latex', 'chat', 'jinx', 'data', 'figure', 'query'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => addBlock(section.id, type)}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                        >
                            {BLOCK_TYPE_ICONS[type]}
                            <span className="capitalize">{type}</span>
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    {section.blocks.map((block, i) => renderBlock(block, section.id, i))}
                </div>

                {section.blocks.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        No blocks yet. Add one above.
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
            </div>
        );
    }

    const compileToPDF = async () => {
        if (!expData) return;
        try {
            const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            let page = pdfDoc.addPage([612, 792]);
            const { width, height } = page.getSize();
            let y = height - 50;
            const margin = 50;
            const lineHeight = 14;

            const wrapText = (text: string, maxWidth: number, size: number) => {
                const words = (text || '').split(' ');
                const lines: string[] = [];
                let current = '';
                for (const word of words) {
                    const test = current ? current + ' ' + word : word;
                    if (font.widthOfTextAtSize(test, size) > maxWidth) {
                        if (current) lines.push(current);
                        current = word;
                    } else {
                        current = test;
                    }
                }
                if (current) lines.push(current);
                return lines.length ? lines : [''];
            };

            const drawText = (text: string, size: number, color = rgb(0, 0, 0), isBold = false) => {
                const f = isBold ? boldFont : font;
                const lines = wrapText(text, width - margin * 2, size);
                for (const line of lines) {
                    if (y < margin + lineHeight) {
                        page = pdfDoc.addPage([612, 792]);
                        y = height - 50;
                    }
                    page.drawText(line, { x: margin, y, size, font: f, color });
                    y -= lineHeight * (size / 12);
                }
                y -= 4;
            };

            const drawCodeBlock = (text: string) => {
                const lines = (text || '').split('\n');
                const boxHeight = lines.length * 11 + 16;
                if (y - boxHeight < margin) {
                    page = pdfDoc.addPage([612, 792]);
                    y = height - 50;
                }
                page.drawRectangle({
                    x: margin - 4,
                    y: y - boxHeight + 10,
                    width: width - margin * 2 + 8,
                    height: boxHeight,
                    color: rgb(0.95, 0.95, 0.95),
                    borderColor: rgb(0.85, 0.85, 0.85),
                    borderWidth: 1,
                });
                let ly = y - 14;
                for (const line of lines) {
                    page.drawText(line || ' ', { x: margin, y: ly, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
                    ly -= 11;
                }
                y = ly - 10;
            };

            drawText(getFileName(filePath).replace(/\.[^.]+$/, ''), 20, rgb(0.1, 0.1, 0.1), true);
            if (expData.hypothesis) {
                drawText('Hypothesis: ' + expData.hypothesis, 11, rgb(0.3, 0.3, 0.3));
            }
            y -= 10;

            for (const section of expData.sections.sort((a, b) => a.order - b.order)) {
                drawText(section.title, 16, rgb(0.1, 0.1, 0.1), true);
                for (const block of section.blocks) {
                    if (!block.in_paper) continue;
                    switch (block.block_type) {
                        case 'markdown':
                            drawText(block.source, 11);
                            break;
                        case 'code':
                        case 'query':
                            drawCodeBlock(block.source);
                            break;
                        case 'latex':
                            drawText(block.source, 11);
                            break;
                        case 'chat':
                            if (block.outputs?.[0]?.text) {
                                drawText('Chat Response:', 11, rgb(0.1, 0.1, 0.1), true);
                                drawText(block.outputs[0].text, 10);
                            }
                            break;
                        case 'jinx':
                            if (block.outputs?.[0]?.text) {
                                drawText('Jinx Output:', 11, rgb(0.1, 0.1, 0.1), true);
                                drawText(block.outputs[0].text, 10);
                            }
                            break;
                        case 'figure':
                            if (block.outputs?.[0]?.image) {
                                drawText('[Figure: ' + (block.paper_label || 'Untitled') + ']', 10, rgb(0.4, 0.4, 0.4));
                            }
                            break;
                        case 'data':
                            if (block.data_refs?.length) {
                                drawText('Data refs: ' + block.data_refs.map(r => r.path).join(', '), 10);
                            }
                            break;
                    }
                    if (block.outputs?.[0]?.text && block.block_type !== 'chat' && block.block_type !== 'jinx') {
                        drawText('Output:', 10, rgb(0.3, 0.3, 0.3), true);
                        drawText(block.outputs[0].text, 10);
                    }
                    y -= 6;
                }
                y -= 10;
            }

            const pdfBytes = await pdfDoc.save();
            const defaultName = getFileName(filePath).replace(/\.[^.]+$/, '') + '.pdf';
            const saveResult = await (window as any).api?.showSaveDialog?.({
                defaultPath: defaultName,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (saveResult?.filePath) {
                await (window as any).api?.writeFileContent?.(saveResult.filePath, pdfBytes);
            }
        } catch (err) {
            console.error('[ExpViewer] PDF compilation failed:', err);
            alert('PDF compilation failed: ' + (err as Error).message);
        }
    };

    if (!expData) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Failed to load experiment
            </div>
        );
    }

    const currentSection = expData.sections.find(s => s.id === activeSection);

    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <FlaskConical className="text-purple-400" size={20} />
                    <div>
                        <div className="text-sm font-medium text-white">
                            {getFileName(filePath)}
                        </div>
                        <div className="text-xs text-gray-500">
                            Modified {new Date(expData.modified_at).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saving && <span className="text-xs text-gray-500">Saving...</span>}
                    <button
                        onClick={compileToPDF}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white"
                    >
                        <FileDown size={12} />
                        Compile
                    </button>
                </div>
            </div>

            <div className="px-4 py-3 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-b border-white/10">
                <div className="flex items-start gap-3">
                    <Lightbulb className="text-yellow-400 mt-0.5" size={16} />
                    {editingHypothesis ? (
                        <div className="flex-1 flex items-center gap-2">
                            <input
                                type="text"
                                value={hypothesisInput}
                                onChange={(e) => setHypothesisInput(e.target.value)}
                                placeholder="What are you testing?"
                                className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleHypothesisSave()}
                            />
                            <button onClick={handleHypothesisSave} className="p-1.5 bg-green-600 rounded text-white">
                                <Check size={14} />
                            </button>
                            <button onClick={() => setEditingHypothesis(false)} className="p-1.5 bg-gray-600 rounded text-white">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div
                            className="flex-1 text-sm text-gray-200 cursor-pointer hover:text-white"
                            onClick={() => setEditingHypothesis(true)}
                        >
                            {expData.hypothesis || <span className="text-gray-500 italic">Click to set hypothesis...</span>}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 px-4 py-2 bg-white/5 border-b border-white/10 overflow-x-auto">
                {expData.sections.sort((a, b) => a.order - b.order).map((section, idx) => (
                    <div
                        key={section.id}
                        draggable
                        onDragStart={() => setDragSectionId(section.id)}
                        onDragOver={(e) => {
                            e.preventDefault();
                            if (dragSectionId && dragSectionId !== section.id) {
                                const fromIdx = expData.sections.findIndex(s => s.id === dragSectionId);
                                if (fromIdx < 0) return;
                                const toIdx = idx;
                                if (fromIdx === toIdx) return;
                                updateExpData(prev => {
                                    const secs = [...prev.sections];
                                    const [moved] = secs.splice(fromIdx, 1);
                                    secs.splice(toIdx, 0, moved);
                                    return { ...prev, sections: secs.map((s, i) => ({ ...s, order: i })) };
                                });
                            }
                        }}
                        onDragEnd={() => setDragSectionId(null)}
                        className={`flex items-center cursor-move ${dragSectionId === section.id ? 'opacity-50' : ''}`}
                    >
                        <button
                            onClick={() => setActiveSection(section.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                                activeSection === section.id
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            {SECTION_ICONS[section.type] || <FileText size={14} />}
                            {section.title}
                            {section.blocks.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px]">
                                    {section.blocks.length}
                                </span>
                            )}
                        </button>
                        {activeSection === section.id && (
                            <div className="flex items-center gap-0.5 ml-1">
                                {renamingSectionId === section.id ? (
                                    <>
                                        <input
                                            type="text"
                                            value={renameInput}
                                            onChange={(e) => setRenameInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    renameSection(section.id, renameInput);
                                                    setRenamingSectionId(null);
                                                } else if (e.key === 'Escape') {
                                                    setRenamingSectionId(null);
                                                }
                                            }}
                                            autoFocus
                                            className="w-24 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs text-white"
                                        />
                                        <button
                                            onClick={() => {
                                                renameSection(section.id, renameInput);
                                                setRenamingSectionId(null);
                                            }}
                                            className="p-0.5 text-green-400 hover:bg-green-500/10 rounded"
                                        >
                                            <Check size={10} />
                                        </button>
                                        <button
                                            onClick={() => setRenamingSectionId(null)}
                                            className="p-0.5 text-red-400 hover:bg-red-500/10 rounded"
                                        >
                                            <X size={10} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                setRenamingSectionId(section.id);
                                                setRenameInput(section.title);
                                            }}
                                            className="p-0.5 text-gray-500 hover:text-white hover:bg-white/10 rounded"
                                            title="Rename"
                                        >
                                            <Edit3 size={10} />
                                        </button>
                                        <button
                                            onClick={() => removeSection(section.id)}
                                            className="p-0.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded"
                                            title="Delete section"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {addingSection ? (
                    <div className="flex items-center gap-1 ml-2">
                        <input
                            type="text"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (newSectionTitle.trim()) addSection(newSectionTitle.trim());
                                    setAddingSection(false);
                                    setNewSectionTitle('');
                                } else if (e.key === 'Escape') {
                                    setAddingSection(false);
                                    setNewSectionTitle('');
                                }
                            }}
                            placeholder="Section title..."
                            autoFocus
                            className="w-32 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                        />
                        <button
                            onClick={() => {
                                if (newSectionTitle.trim()) addSection(newSectionTitle.trim());
                                setAddingSection(false);
                                setNewSectionTitle('');
                            }}
                            className="p-1 text-green-400 hover:bg-green-500/10 rounded"
                        >
                            <Check size={12} />
                        </button>
                        <button
                            onClick={() => {
                                setAddingSection(false);
                                setNewSectionTitle('');
                            }}
                            className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingSection(true)}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded ml-2"
                    >
                        <Plus size={12} />
                        Add Section
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {currentSection ? renderSection(currentSection) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                        <FileText size={48} className="opacity-20" />
                        <p>No sections yet.</p>
                        <button
                            onClick={() => setAddingSection(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm text-white"
                        >
                            <Plus size={16} />
                            Add your first section
                        </button>
                    </div>
                )}
            </div>

            <div className="border-t border-white/10 bg-white/5">
                <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {expData.session_ids.length} sessions
                    </span>
                    <span className="flex items-center gap-1">
                        <GitBranch size={12} />
                        {expData.sections.reduce((acc, s) => acc + s.blocks.length, 0)} blocks
                    </span>
                    <span className="flex items-center gap-1">
                        <PenTool size={12} />
                        {expData.notes.length} notes
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ExpViewer;
