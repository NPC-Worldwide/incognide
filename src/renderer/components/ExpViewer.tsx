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
import { markdown } from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Types
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
    type: 'hypothesis' | 'methods' | 'data' | 'results' | 'discussion' | 'conclusion' | 'custom';
    title: string;
    order: number;
    blocks: ExpBlock[];
}

interface ExpBlock {
    id: string;
    block_type: 'markdown' | 'code' | 'latex' | 'chat' | 'jinx' | 'data' | 'figure';
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
    jinxsToDisplay?: any[];
}

const DEFAULT_SECTIONS: ExpSection[] = [
    { id: 'hypothesis', type: 'hypothesis', title: 'Hypothesis', order: 0, blocks: [] },
    { id: 'methods', type: 'methods', title: 'Methods', order: 1, blocks: [] },
    { id: 'data', type: 'data', title: 'Data', order: 2, blocks: [] },
    { id: 'results', type: 'results', title: 'Results', order: 3, blocks: [] },
    { id: 'discussion', type: 'discussion', title: 'Discussion', order: 4, blocks: [] },
    { id: 'conclusion', type: 'conclusion', title: 'Conclusion', order: 5, blocks: [] },
];

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
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const ExpViewer: React.FC<ExpViewerProps> = ({
    filePath,
    currentPath,
    modelsToDisplay = [],
    availableNPCs = [],
    jinxsToDisplay = [],
}) => {
    const [expData, setExpData] = useState<ExpFile | null>(null);
    const [activeSection, setActiveSection] = useState<string>('hypothesis');
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
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const streamingContentRef = useRef<string>('');
    const streamingReasoningRef = useRef<string>('');
    const streamingToolCallsRef = useRef<any[]>([]);

    // Load experiment file
    useEffect(() => {
        const loadExp = async () => {
            setLoading(true);
            try {
                const content = await (window as any).api?.readFileContent?.(filePath);
                if (content) {
                    const parsed = JSON.parse(content);
                    setExpData(parsed);
                    setHypothesisInput(parsed.hypothesis || '');
                }
            } catch (err) {
                console.error('[ExpViewer] Error loading exp file:', err);
                // Create new exp structure if file is empty or invalid
                const newExp = createEmptyExp();
                setExpData(newExp);
                setHypothesisInput('');
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
        sections: DEFAULT_SECTIONS.map(s => ({ ...s, blocks: [] })),
        status: 'draft',
        conclusion: null,
        tags: [],
        session_ids: [],
        notes: [],
        artifacts: [],
    });

    // Auto-save with debounce
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
            // Execute Python code via IPC
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
            // Execute chat via streaming API - set up listeners at call time like chat view
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

            // Set up stream listeners
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
                                            // Plain text fallback
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

                            // Merge with existing
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

            // Execute the stream
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
            // Execute jinx via backend API
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
                    <CodeMirror
                        value={block.source}
                        extensions={[python()]}
                        onChange={(value) => updateBlock(sectionId, block.id, { source: value })}
                        className="text-sm border border-white/10 rounded"
                        theme="dark"
                        readOnly={!isEditing}
                    />
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
                            {jinxsToDisplay.map((j: any) => (
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
                return (
                    <div className="text-sm text-gray-400">
                        {block.outputs?.[0]?.image ? (
                            <img src={block.outputs[0].image} alt={block.paper_label || 'Figure'} className="max-w-full rounded" />
                        ) : (
                            <div className="flex items-center justify-center h-32 bg-white/5 rounded border border-dashed border-white/20">
                                <span>No figure generated yet</span>
                            </div>
                        )}
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
                        {/* Streaming reasoning content */}
                        {streamingReasoningContent && (
                            <div className="px-3 py-2 bg-white/5 rounded-md border-l-2 border-yellow-500">
                                <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                                <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingReasoningContent}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        {/* Streaming tool calls */}
                        {streamingToolCalls.map((tool, i) => renderToolCall(tool, i))}

                        {/* Streaming content */}
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
                                    {/* Saved reasoning content */}
                                    {output.reasoningContent && (
                                        <div className="px-3 py-2 bg-white/5 rounded-md border-l-2 border-yellow-500">
                                            <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                                            <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output.reasoningContent}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}

                                    {/* Saved tool calls */}
                                    {output.toolCalls?.map((tool: any, ti: number) => renderToolCall(tool, ti))}

                                    {/* Main content */}
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
                {/* Block header */}
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
                        {(block.block_type === 'code' || block.block_type === 'chat' || block.block_type === 'jinx') && (
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

                {/* Block content */}
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
                {/* Add block buttons */}
                <div className="flex flex-wrap gap-1">
                    {(['markdown', 'code', 'latex', 'chat', 'jinx', 'data', 'figure'] as const).map(type => (
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

                {/* Blocks */}
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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <FlaskConical className="text-purple-400" size={20} />
                    <div>
                        <div className="text-sm font-medium text-white">
                            {getFileName(filePath)}
                        </div>
                        <div className="text-xs text-gray-500">
                            {expData.status} • Modified {new Date(expData.modified_at).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saving && <span className="text-xs text-gray-500">Saving...</span>}
                    <select
                        value={expData.status}
                        onChange={(e) => updateExpData(prev => ({ ...prev, status: e.target.value as any }))}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300"
                    >
                        <option value="draft">Draft</option>
                        <option value="in_progress">In Progress</option>
                        <option value="concluded">Concluded</option>
                        <option value="archived">Archived</option>
                    </select>
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white">
                        <FileDown size={12} />
                        Compile
                    </button>
                </div>
            </div>

            {/* Hypothesis bar */}
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

            {/* Section tabs */}
            <div className="flex items-center gap-1 px-4 py-2 bg-white/5 border-b border-white/10 overflow-x-auto">
                {expData.sections.sort((a, b) => a.order - b.order).map(section => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                            activeSection === section.id
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {SECTION_ICONS[section.type]}
                        {section.title}
                        {section.blocks.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px]">
                                {section.blocks.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto p-4">
                {currentSection && renderSection(currentSection)}
            </div>

            {/* Footer with activity/notes tabs */}
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
