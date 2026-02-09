import React, { memo, useState, useRef } from 'react';
import { BACKEND_URL } from '../config';
import MarkdownRenderer from './MarkdownRenderer';
import { Paperclip, Tag, Star, ChevronDown, ChevronUp, Volume2, VolumeX, Loader, RotateCcw, History, Cpu, Bot, Zap, Send, GitBranch, Columns, ChevronLeft, ChevronRight, SlidersHorizontal, Square, CheckSquare, Trash2 } from 'lucide-react';

const highlightSearchTerm = (content: string, searchTerm: string): string => {
    if (!searchTerm || !content) return content;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return content.replace(regex, '**$1**');
};

// Strip source prefixes like "project:" or "global:" from NPC names
const stripSourcePrefix = (name: string): string => {
    if (!name) return name;
    return name.replace(/^(project:|global:)/, '');
};

// Count approximate lines in content (rough estimate based on newlines and length)
const countLines = (content: string): number => {
    if (!content) return 0;
    const newlineCount = (content.match(/\n/g) || []).length;
    const estimatedWrappedLines = Math.ceil(content.length / 80); // ~80 chars per line
    return Math.max(newlineCount + 1, estimatedWrappedLines);
};

const MAX_COLLAPSED_LINES = 4;

export const ChatMessage = memo(({
    message,
    isSelected,
    messageSelectionMode,
    toggleMessageSelection,
    handleMessageContextMenu,
    searchTerm,
    isCurrentSearchResult,
    onResendMessage,
    onCreateBranch,
    onBroadcast,
    onExpandBranches,
    onSwitchRun,
    siblingRuns,
    activeRunIndex,
    messageIndex,
    onLabelMessage,
    messageLabel,
    conversationId,
    onOpenFile,
    availableModels,
    availableNPCs
}: {
    message: any;
    isSelected?: boolean;
    messageSelectionMode?: boolean;
    toggleMessageSelection?: (id: string) => void;
    handleMessageContextMenu?: (e: React.MouseEvent, msg: any, idx: number) => void;
    searchTerm?: string;
    isCurrentSearchResult?: boolean;
    onResendMessage?: (msg: any) => void;
    onCreateBranch?: (msg: any, idx: number) => void;
    onBroadcast?: (msg: any, models: string[], npcs: string[]) => void;
    onExpandBranches?: (cellId: string) => void;
    onSwitchRun?: (cellId: string, runIndex: number) => void;
    siblingRuns?: any[];
    activeRunIndex?: number;
    messageIndex?: number;
    onLabelMessage?: (msg: any) => void;
    messageLabel?: string;
    conversationId?: string;
    onOpenFile?: (path: string) => void;
    availableModels?: any[];
    availableNPCs?: any[];
}) => {
    const showStreamingIndicators = !!message.isStreaming;
    const messageId = message.id || message.timestamp;

    // Collapsible state for long user messages
    const isLongMessage = message.role === 'user' && countLines(message.content) > MAX_COLLAPSED_LINES;
    const [isExpanded, setIsExpanded] = useState(false);

    // TTS state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoadingTTS, setIsLoadingTTS] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Broadcast/branch UI state
    const [showBroadcastPanel, setShowBroadcastPanel] = useState(false);
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [selectedNPCs, setSelectedNPCs] = useState<string[]>([]);

    // Get saved TTS settings
    const getTTSSettings = () => {
        try {
            const stored = localStorage.getItem('npcStudio_ttsSettings');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (err) {}
        return { engine: 'kokoro', voice: 'af_heart' };
    };

    // Play TTS for this message
    const playTTS = async () => {
        if (isSpeaking && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setIsSpeaking(false);
            return;
        }

        // Extract text content from message
        let textContent = message.content || '';
        if (message.contentParts) {
            textContent = message.contentParts
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.content)
                .join('\n');
        }

        if (!textContent.trim()) return;

        setIsLoadingTTS(true);
        try {
            const settings = getTTSSettings();
            const response = await fetch(`${BACKEND_URL}/api/audio/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: textContent,
                    engine: settings.engine,
                    voice: settings.voice
                })
            });

            if (!response.ok) {
                console.error('TTS failed:', await response.text());
                setIsLoadingTTS(false);
                return;
            }

            const result = await response.json();
            if (result.audio) {
                const format = result.format || 'mp3';
                const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
                const audioSrc = `data:${mimeType};base64,${result.audio}`;
                const audio = new Audio(audioSrc);
                audioRef.current = audio;

                audio.onended = () => {
                    setIsSpeaking(false);
                    audioRef.current = null;
                };

                audio.onerror = () => {
                    setIsSpeaking(false);
                    audioRef.current = null;
                };

                await audio.play();
                setIsSpeaking(true);
            }
        } catch (err) {
            console.error('TTS error:', err);
        } finally {
            setIsLoadingTTS(false);
        }
    };

    return (
        <div
            id={`message-${messageId}`}
            className={`max-w-[85%] rounded-lg p-3 relative group ${
                message.role === 'user' ? 'theme-message-user' : 'theme-message-assistant'
            } ${message.type === 'error' ? 'theme-message-error theme-border' : ''} ${
                isSelected ? 'ring-2 ring-blue-500' : ''
            } ${isCurrentSearchResult ? 'ring-2 ring-yellow-500' : ''} ${messageSelectionMode ? 'cursor-pointer' : ''}`}
            onClick={() => messageSelectionMode && toggleMessageSelection(messageId)}
            onContextMenu={(e) => handleMessageContextMenu(e, messageId)}
        >
            
            {/* Branch button */}
            {message.role === 'user' && !messageSelectionMode && onCreateBranch && (
                <div className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onCreateBranch(messageIndex);
                        }}
                        className="p-1.5 bg-purple-600 hover:bg-purple-500 rounded-full transition-all shadow-lg text-white"
                        title="Create conversation branch from here"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                        </svg>
                    </button>
                </div>
            )}
            
            {message.role === 'user' && !messageSelectionMode && onResendMessage && (
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onResendMessage(message);
                        }}
                        className="p-1 theme-hover rounded-full transition-all"
                        title="Resend"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                </div>
            )}

            {/* Label button - shown for all messages */}
            {!messageSelectionMode && onLabelMessage && (
                <div className={`absolute ${message.role === 'user' ? 'bottom-2 right-8' : 'bottom-2 right-2'} opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1`}>
                    {messageLabel && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-400" title={`Labeled: ${messageLabel.categories?.join(', ') || 'No categories'}`}>
                            {messageLabel.qualityScore && (
                                <span className="flex items-center">
                                    <Star size={10} fill="currentColor" />
                                    {messageLabel.qualityScore}
                                </span>
                            )}
                            {messageLabel.categories?.length > 0 && (
                                <span className="px-1 bg-blue-600/30 rounded">{messageLabel.categories.length}</span>
                            )}
                        </span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onLabelMessage({ ...message, conversationId });
                        }}
                        className={`p-1 theme-hover rounded-full transition-all ${messageLabel ? 'text-yellow-400' : ''}`}
                        title={messageLabel ? "Edit labels" : "Add labels"}
                    >
                        <Tag size={14} />
                    </button>
                </div>
            )}

            {/* TTS button - shown for assistant messages */}
            {message.role === 'assistant' && !messageSelectionMode && !showStreamingIndicators && message.content && (
                <div className="absolute bottom-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            playTTS();
                        }}
                        className={`p-1 theme-hover rounded-full transition-all ${isSpeaking ? 'text-blue-400' : ''}`}
                        title={isSpeaking ? "Stop speaking" : "Read aloud"}
                        disabled={isLoadingTTS}
                    >
                        {isLoadingTTS ? (
                            <Loader size={14} className="animate-spin" />
                        ) : isSpeaking ? (
                            <VolumeX size={14} />
                        ) : (
                            <Volume2 size={14} />
                        )}
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center text-xs theme-text-muted mb-1 opacity-80">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{message.role === 'user' ? 'You' : (stripSourcePrefix(message.npc) || 'Agent')}</span>
                    {/* Params icon next to agent name - shows values on hover */}
                    {message.role !== 'user' && (message.temperature !== undefined || message.top_p !== undefined || message.top_k !== undefined || message.max_tokens !== undefined) && (
                        <span className="relative group/params">
                            <SlidersHorizontal size={10} className="text-gray-500 hover:text-gray-300 cursor-help" />
                            <span className="absolute left-0 bottom-full mb-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover/params:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                {message.temperature !== undefined && <span className="mr-2">T:{message.temperature}</span>}
                                {message.top_p !== undefined && <span className="mr-2">P:{message.top_p}</span>}
                                {message.top_k !== undefined && <span className="mr-2">K:{message.top_k}</span>}
                                {message.max_tokens !== undefined && <span>M:{message.max_tokens}</span>}
                            </span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleMessageSelection?.(messageId);
                        }}
                        className={`p-0.5 rounded transition-colors ${isSelected ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}
                        title={isSelected ? "Deselect message" : "Select message"}
                    >
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                </div>
            </div>

            {/* Rest of message content... */}
            <div className="relative message-content-area">
                {showStreamingIndicators && (
                    <div className="absolute top-0 left-0 -translate-y-full flex space-x-1 mb-1">
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                )}
                {message.reasoningContent && (
                    <div className="mb-3 px-3 py-2 theme-bg-tertiary rounded-md border-l-2 border-yellow-500">
                        <div className="text-xs text-yellow-400 mb-1 font-semibold">Thinking Process:</div>
                        <div className="prose prose-sm prose-invert max-w-none theme-text-secondary text-sm">
                            <MarkdownRenderer content={message.reasoningContent || ''} onOpenFile={onOpenFile} />
                        </div>
                    </div>
                )}
                {/* Render content parts interleaved if available, otherwise fall back to legacy rendering */}
                {message.contentParts && message.contentParts.length > 0 ? (
                    <>
                        {message.contentParts.map((part, partIdx) => {
                            if (part.type === 'text') {
                                return (
                                    <div key={partIdx} className={`prose prose-sm prose-invert max-w-none theme-text-primary`}>
                                        {searchTerm ? (
                                            <MarkdownRenderer content={highlightSearchTerm(part.content, searchTerm)} onOpenFile={onOpenFile} />
                                        ) : (
                                            <MarkdownRenderer content={part.content || ''} onOpenFile={onOpenFile} />
                                        )}
                                    </div>
                                );
                            } else if (part.type === 'tool_call') {
                                const tool = part.call;
                                const argVal = tool.arguments !== undefined ? tool.arguments : tool.function?.arguments;
                                const resultVal = tool.result_preview || '';
                                const argDisplay = argVal && String(argVal).trim().length > 0
                                    ? (typeof argVal === 'string' ? argVal : JSON.stringify(argVal, null, 2))
                                    : 'No arguments';
                                const resDisplay = resultVal && String(resultVal).trim().length > 0
                                    ? (typeof resultVal === 'string' ? resultVal : JSON.stringify(resultVal, null, 2))
                                    : null;
                                const statusColor = tool.status === 'error' ? 'border-red-500' : (tool.status === 'complete' ? 'border-green-500' : 'border-blue-500');
                                return (
                                    <div key={partIdx} className={`my-2 px-3 py-2 theme-bg-tertiary rounded-md border-l-2 ${statusColor}`}>
                                        <div className="text-xs text-blue-400 mb-1 font-semibold flex items-center gap-2">
                                            <span>🛠 {tool.function?.name || tool.function_name || "Function"}</span>
                                            {tool.status === 'running' && <span className="animate-pulse text-yellow-400">running...</span>}
                                            {tool.status === 'complete' && <span className="text-green-400">✓</span>}
                                            {tool.status === 'error' && <span className="text-red-400">✗</span>}
                                        </div>
                                        <div className="text-[11px] theme-text-muted mb-1">Args:</div>
                                        <pre className="theme-bg-primary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary max-h-32 overflow-y-auto">
                                            {argDisplay}
                                        </pre>
                                        {resDisplay && (
                                            <>
                                                <div className="text-[11px] theme-text-muted mb-1">Result:</div>
                                                <pre className="theme-bg-primary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary max-h-32 overflow-y-auto">
                                                    {resDisplay}
                                                </pre>
                                            </>
                                        )}
                                    </div>
                                );
                            }
                            return null;
                        })}
                        {showStreamingIndicators && message.type !== 'error' && (
                            <span className="ml-1 inline-block w-0.5 h-4 theme-text-primary animate-pulse stream-cursor"></span>
                        )}
                    </>
                ) : (
                    <>
                        <div className={`prose prose-sm prose-invert max-w-none theme-text-primary ${isLongMessage && !isExpanded ? 'max-h-24 overflow-hidden relative' : ''}`}>
                            {searchTerm && message.content ? (
                                <MarkdownRenderer content={highlightSearchTerm(message.content, searchTerm)} onOpenFile={onOpenFile} />
                            ) : (
                                <MarkdownRenderer content={message.content || ''} onOpenFile={onOpenFile} />
                            )}
                            {showStreamingIndicators && message.type !== 'error' && (
                                <span className="ml-1 inline-block w-0.5 h-4 theme-text-primary animate-pulse stream-cursor"></span>
                            )}
                            {/* Fade overlay for collapsed messages */}
                            {isLongMessage && !isExpanded && (
                                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-inherit to-transparent pointer-events-none" />
                            )}
                        </div>
                        {/* Expand/Collapse button for long user messages */}
                        {isLongMessage && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="mt-2 flex items-center gap-1 text-xs theme-text-muted hover:theme-text-primary transition-colors"
                            >
                                {isExpanded ? (
                                    <>
                                        <ChevronUp size={14} />
                                        <span>Show less</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={14} />
                                        <span>Show more ({countLines(message.content)} lines)</span>
                                    </>
                                )}
                            </button>
                        )}
                        {/* Legacy tool calls rendering for messages without contentParts */}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                            <div className="mt-3 px-3 py-2 theme-bg-tertiary rounded-md border-l-2 border-blue-500">
                                <div className="text-xs text-blue-400 mb-1 font-semibold">Function Calls:</div>
                                {message.toolCalls.map((tool, idx) => (
                                    <div key={idx} className="mb-2 last:mb-0">
                                        <div className="text-blue-300 text-sm">{tool.function_name || tool.function?.name || "Function"}</div>
                                        {(() => {
                                            const argVal = tool.arguments !== undefined ? tool.arguments : tool.function?.arguments;
                                            const resultVal = tool.result_preview || '';
                                            const argDisplay = argVal && String(argVal).trim().length > 0
                                                ? (typeof argVal === 'string' ? argVal : JSON.stringify(argVal, null, 2))
                                                : 'No arguments';
                                            const resDisplay = resultVal && String(resultVal).trim().length > 0
                                                ? (typeof resultVal === 'string' ? resultVal : JSON.stringify(resultVal, null, 2))
                                                : null;
                                            return (
                                                <>
                                                    <div className="text-[11px] theme-text-muted mb-1">Args:</div>
                                                    <pre className="theme-bg-primary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary">
                                                        {argDisplay}
                                                    </pre>
                                                    {resDisplay && (
                                                        <>
                                                            <div className="text-[11px] theme-text-muted mb-1">Result:</div>
                                                            <pre className="theme-bg-primary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary">
                                                                {resDisplay}
                                                            </pre>
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
                {message.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 border-t theme-border pt-2">
                        {message.attachments.map((attachment, idx) => {
                            const isImage = attachment.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                            const isPdf = attachment.name?.match(/\.pdf$/i);
                            const isClickable = !!attachment.path;
                            const imageSrc = attachment.preview || (attachment.path ? `media://${attachment.path}` : attachment.data);
                            return (
                                <div
                                    key={idx}
                                    className={`text-xs theme-bg-tertiary rounded px-2 py-1 flex items-center gap-1 ${isClickable ? 'cursor-pointer hover:bg-blue-500/20' : ''}`}
                                    onDoubleClick={() => isClickable && onOpenFile?.(attachment.path)}
                                    title={isClickable ? `Double-click to open: ${attachment.path}` : attachment.name}
                                >
                                    <Paperclip size={12} className="flex-shrink-0" />
                                    <span className="truncate">{attachment.name}</span>
                                    {isImage && imageSrc && (
                                        <img src={imageSrc} alt={attachment.name} className="mt-1 max-w-[100px] max-h-[100px] rounded-md object-cover"/>
                                    )}
                                    {isPdf && (
                                        <span className="ml-1 text-red-400 text-[10px]">PDF</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Execution Config & Actions - shown for assistant messages */}
                {message.role === 'assistant' && !showStreamingIndicators && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50">
                        {/* Branch Navigator - shown when there are sibling runs */}
                        {siblingRuns && siblingRuns.length > 1 && (
                            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <GitBranch size={12} className="text-purple-400" />
                                        <span className="text-[10px] text-gray-400 uppercase">
                                            {siblingRuns.length} Branches
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {/* Navigation arrows */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onSwitchRun && message.cellId && activeRunIndex !== undefined && activeRunIndex > 0) {
                                                    onSwitchRun(message.cellId, activeRunIndex - 1);
                                                }
                                            }}
                                            disabled={activeRunIndex === 0}
                                            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30 text-gray-400"
                                            title="Previous branch"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>
                                        <span className="text-[10px] text-gray-300 min-w-[40px] text-center">
                                            {(activeRunIndex ?? 0) + 1} / {siblingRuns.length}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onSwitchRun && message.cellId && activeRunIndex !== undefined && activeRunIndex < siblingRuns.length - 1) {
                                                    onSwitchRun(message.cellId, activeRunIndex + 1);
                                                }
                                            }}
                                            disabled={activeRunIndex === siblingRuns.length - 1}
                                            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30 text-gray-400"
                                            title="Next branch"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                        {/* Expand to tiles button */}
                                        {onExpandBranches && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onExpandBranches(message.cellId);
                                                }}
                                                className="p-1 ml-1 hover:bg-purple-600/30 rounded text-purple-400"
                                                title="Open all branches as tiles"
                                            >
                                                <Columns size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {/* Branch tabs */}
                                <div className="flex flex-wrap gap-1">
                                    {siblingRuns.map((run, idx) => (
                                        <button
                                            key={run.id || idx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onSwitchRun && message.cellId) {
                                                    onSwitchRun(message.cellId, idx);
                                                }
                                            }}
                                            className={`px-2 py-1 text-[10px] rounded-md border transition-all ${
                                                idx === activeRunIndex
                                                    ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                                                    : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                            }`}
                                            title={`${run.model || 'unknown'} / ${stripSourcePrefix(run.npc) || 'agent'}`}
                                        >
                                            <span className="font-medium">{run.model?.slice(0, 12) || '?'}</span>
                                            {run.npc && run.npc !== 'agent' && (
                                                <span className="ml-1 opacity-70">· {stripSourcePrefix(run.npc)}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Config chips row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {message.model && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-600/20 text-blue-300 border border-blue-600/30" title={`Model: ${message.model}`}>
                                    <Cpu size={10} />
                                    {message.model.length > 20 ? message.model.slice(0, 20) + '...' : message.model}
                                </span>
                            )}
                            {message.provider && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-600/20 text-purple-300 border border-purple-600/30" title={`Provider: ${message.provider}`}>
                                    {message.provider}
                                </span>
                            )}
                            {message.npc && message.npc !== 'agent' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-600/20 text-green-300 border border-green-600/30" title={`NPC: ${stripSourcePrefix(message.npc)}`}>
                                    <Bot size={10} />
                                    {stripSourcePrefix(message.npc)}
                                </span>
                            )}
                            {message.jinxName && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-600/20 text-orange-300 border border-orange-600/30" title={`Jinx: ${message.jinxName}`}>
                                    <Zap size={10} />
                                    {message.jinxName}
                                </span>
                            )}
                            {message.runCount && message.runCount > 1 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-600/20 text-gray-300 border border-gray-600/30" title={`${message.runCount} runs for this cell`}>
                                    <History size={10} />
                                    {message.runCount} runs
                                </span>
                            )}
                            {/* Model parameters - hover tooltip */}
                            {(message.temperature !== undefined || message.top_k !== undefined || message.top_p !== undefined || message.max_tokens !== undefined) && (
                                <span className="relative group/params">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] bg-gray-700/40 text-gray-500 hover:text-gray-300 hover:bg-gray-600/50 cursor-help transition-colors">
                                        <SlidersHorizontal size={10} />
                                    </span>
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover/params:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                        {message.temperature !== undefined && <span className="mr-2">T:{message.temperature}</span>}
                                        {message.top_p !== undefined && <span className="mr-2">P:{message.top_p}</span>}
                                        {message.top_k !== undefined && <span className="mr-2">K:{message.top_k}</span>}
                                        {message.max_tokens !== undefined && <span>M:{message.max_tokens}</span>}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                            {onResendMessage && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onResendMessage(message);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] bg-gray-700/50 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                                    title="Re-run with same config"
                                >
                                    <RotateCcw size={10} />
                                    Re-run
                                </button>
                            )}
                            {onBroadcast && availableModels && availableModels.length > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowBroadcastPanel(!showBroadcastPanel);
                                        if (!showBroadcastPanel) {
                                            setSelectedModels([message.model || availableModels[0]?.value]);
                                            setSelectedNPCs([message.npc || 'agent']);
                                        }
                                    }}
                                    className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                                        showBroadcastPanel
                                            ? 'bg-purple-600/30 text-purple-300'
                                            : 'bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white'
                                    }`}
                                    title="Broadcast to multiple models/NPCs"
                                >
                                    <GitBranch size={10} />
                                    Branch
                                </button>
                            )}
                        </div>

                        {/* Broadcast Panel - inline multi-select */}
                        {showBroadcastPanel && availableModels && availableNPCs && (
                            <div className="mt-2 p-2 bg-gray-800/80 rounded-lg border border-gray-700">
                                <div className="text-[10px] text-gray-400 mb-2">Select models & NPCs to branch to:</div>

                                {/* Models multi-select */}
                                <div className="mb-2">
                                    <div className="text-[9px] text-gray-500 mb-1 uppercase">Models</div>
                                    <div className="flex flex-wrap gap-1">
                                        {availableModels.slice(0, 8).map((m: any) => (
                                            <button
                                                key={m.value}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedModels(prev =>
                                                        prev.includes(m.value)
                                                            ? prev.filter(x => x !== m.value)
                                                            : [...prev, m.value]
                                                    );
                                                }}
                                                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                                                    selectedModels.includes(m.value)
                                                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                                                        : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:text-gray-200'
                                                }`}
                                            >
                                                {m.display_name?.slice(0, 15) || m.value?.slice(0, 15)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* NPCs multi-select */}
                                <div className="mb-2">
                                    <div className="text-[9px] text-gray-500 mb-1 uppercase">NPCs</div>
                                    <div className="flex flex-wrap gap-1">
                                        {availableNPCs.slice(0, 8).map((n: any) => (
                                            <button
                                                key={n.value}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedNPCs(prev =>
                                                        prev.includes(n.value)
                                                            ? prev.filter(x => x !== n.value)
                                                            : [...prev, n.value]
                                                    );
                                                }}
                                                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                                                    selectedNPCs.includes(n.value)
                                                        ? 'bg-green-600/30 border-green-500 text-green-300'
                                                        : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:text-gray-200'
                                                }`}
                                            >
                                                {n.display_name || n.value}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Broadcast button */}
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-gray-500">
                                        {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} × {selectedNPCs.length} NPC{selectedNPCs.length !== 1 ? 's' : ''} = {selectedModels.length * selectedNPCs.length} branch{selectedModels.length * selectedNPCs.length !== 1 ? 'es' : ''}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedModels.length > 0 && selectedNPCs.length > 0) {
                                                onBroadcast(message, selectedModels, selectedNPCs);
                                                setShowBroadcastPanel(false);
                                            }
                                        }}
                                        disabled={selectedModels.length === 0 || selectedNPCs.length === 0}
                                        className="flex items-center gap-1 px-3 py-1 text-[10px] bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded text-white transition-colors"
                                    >
                                        <Send size={10} />
                                        Broadcast
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});
