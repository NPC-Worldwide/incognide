import React, { memo, useState, useRef } from 'react';
import { BACKEND_URL } from '../config';
import MarkdownRenderer from './MarkdownRenderer';
import { AgentPromptCard } from './AgentPrompt';
import { ToolCallDisplay } from './ToolCallDisplay';
import { MessageLabel } from './MessageLabeling';
import { Paperclip, Tag, Star, ChevronDown, ChevronUp, Volume2, VolumeX, Loader, RotateCcw, SlidersHorizontal, Bot, Zap, Cpu } from 'lucide-react';

const highlightSearchTerm = (content: string, searchTerm: string): string => {
    if (!searchTerm || !content) return content;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return content.replace(regex, '**$1**');
};

const stripSourcePrefix = (name: string): string => {
    if (!name) return name;
    return name.replace(/^(project:|global:)/, '');
};

const parseMessageContent = (content: string): { body: string; contextBlocks: string[] } => {
    if (!content) return { body: content, contextBlocks: [] };
    const contextBlocks: string[] = [];
    const body = content.replace(/<context>([\s\S]*?)<\/context>/g, (match, inner) => {
        contextBlocks.push(inner.trim());
        return '';
    }).replace(/\n{2,}/g, '\n').trim();
    return { body, contextBlocks };
};

const ContextBlocks = ({ blocks }: { blocks: string[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <>
            <div
                className="flex items-center gap-2 px-3 py-1.5 theme-bg-tertiary cursor-pointer hover:brightness-110 transition-all"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-xs text-blue-400 font-semibold">Context</span>
                {isExpanded
                    ? <ChevronDown size={14} className="theme-text-muted flex-shrink-0" />
                    : <ChevronRight size={14} className="theme-text-muted flex-shrink-0" />
                }
            </div>
            {isExpanded && (
                <div className="px-3 py-2 theme-bg-primary border-t border-[var(--border-color,#313244)] max-h-[min(40vh,320px)] min-h-[120px] overflow-y-auto resize-y">
                    <div className="prose prose-sm prose-invert max-w-none theme-text-secondary text-sm whitespace-pre-wrap">
                        {blocks.join('\n\n')}
                    </div>
                </div>
            )}
        </>
    );
};

const countLines = (content: string): number => {
    if (!content) return 0;
    const newlineCount = (content.match(/\n/g) || []).length;
    const estimatedWrappedLines = Math.ceil(content.length / 80);
    return Math.max(newlineCount + 1, estimatedWrappedLines);
};

const MAX_COLLAPSED_LINES = 4;

export const ChatMessage = memo(({
    message,
    handleMessageContextMenu,
    searchTerm,
    isCurrentSearchResult,
    onResendMessage,
    messageIndex,
    onLabelMessage,
    messageLabel,
    conversationId,
    onOpenFile,
    isAgentMode,
}: {
    message: any;
    handleMessageContextMenu?: (e: React.MouseEvent, msg: any, idx: number) => void;
    searchTerm?: string;
    isCurrentSearchResult?: boolean;
    onResendMessage?: (msg: any) => void;
    messageIndex?: number;
    onLabelMessage?: (msg: any) => void;
    messageLabel?: MessageLabel;
    conversationId?: string;
    onOpenFile?: (path: string) => void;
    isAgentMode?: boolean;
}) => {
    const showStreamingIndicators = !!message.isStreaming;
    const messageId = message.id || message.timestamp;

    const { body: displayBody, contextBlocks } = parseMessageContent(message.content || '');
    const hasContextBlocks = contextBlocks.length > 0;
    const isLongMessage = message.role === 'user' && countLines(displayBody) > MAX_COLLAPSED_LINES;
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());

    const toggleReasoning = (partIdx: number) => {
        setExpandedReasoning(prev => {
            const next = new Set(prev);
            if (next.has(partIdx)) next.delete(partIdx);
            else next.add(partIdx);
            return next;
        });
    };

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoadingTTS, setIsLoadingTTS] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const getTTSSettings = () => {
        try {
            const stored = localStorage.getItem('incognide_ttsSettings');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (err) {}
        return { engine: 'kokoro', voice: 'af_heart' };
    };

    const playTTS = async () => {
        if (isSpeaking && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setIsSpeaking(false);
            return;
        }

        let textContent = displayBody || '';
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

    if (message.role === 'prompt' && message.promptData) {
        return (
            <div
                id={`message-${messageId}`}
                className="max-w-[85%]"
            >
                <AgentPromptCard promptData={message.promptData} />
            </div>
        );
    }

    return (
        <div
            id={`message-${messageId}`}
            className={`max-w-[85%] rounded-lg p-3 relative group ${
                message.role === 'user' ? 'theme-message-user' : 'theme-message-assistant'
            } ${message.type === 'error' ? 'theme-message-error theme-border' : ''} ${
                isCurrentSearchResult ? 'ring-2 ring-yellow-500' : ''}`}
            onContextMenu={(e) => handleMessageContextMenu(e, messageId)}
        >
            <div className="flex justify-between items-center text-xs theme-text-muted mb-1 opacity-80">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{message.role === 'user' ? 'You' : (stripSourcePrefix(message.npc) || 'Agent')}</span>
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
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    {message.role === 'assistant' && !showStreamingIndicators && message.content && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                playTTS();
                            }}
                            className={`p-0.5 rounded transition-colors ${isSpeaking ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}
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
                    )}
                    {message.role === 'user' && onResendMessage && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onResendMessage(message);
                            }}
                            className="p-0.5 rounded transition-colors text-gray-500 hover:text-gray-300"
                            title="Resend"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                    {onLabelMessage && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onLabelMessage({ ...message, conversationId });
                            }}
                            className={`p-0.5 rounded transition-colors ${messageLabel ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-500 hover:text-gray-300'}`}
                            title={messageLabel ? "Edit labels" : "Add labels"}
                        >
                            <Tag size={14} />
                        </button>
                    )}
                    {messageLabel && (
                        <span
                            className="flex items-center gap-1 text-[10px] text-yellow-400"
                            title={[
                                `Tags: ${messageLabel.tags?.join(', ') || 'none'}`,
                                `Metrics: ${messageLabel.metrics?.map(m => `${m.name}=${m.value}`).join(', ') || 'none'}`
                            ].join('\n')}
                        >
                            {messageLabel.metrics?.filter(m => typeof m.value === 'number').slice(0, 1).map(m => (
                                <span key={m.id || m.name} className="flex items-center">
                                    <Star size={10} fill="currentColor" />
                                    {m.value}
                                </span>
                            ))}
                            {messageLabel.tags?.slice(0, 2).map(tag => (
                                <span key={tag} className="px-1 bg-blue-600/30 rounded">{tag}</span>
                            ))}
                            {messageLabel.metrics && messageLabel.metrics.length > 1 && (
                                <span className="px-1 bg-gray-700 rounded">+{messageLabel.metrics.length - 1}</span>
                            )}
                        </span>
                    )}
                </div>
            </div>

            <div className="relative message-content-area">
                {showStreamingIndicators && (
                    <div className="absolute top-0 left-0 -translate-y-full flex space-x-1 mb-1">
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                        <div className="w-1.5 h-1.5 theme-text-muted rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                )}
                {message.reasoningContent && !message.contentParts?.some((p: any) => p.type === 'reasoning') && (
                    <div className="mb-3 rounded-md border-l-2 border-yellow-500 overflow-hidden">
                        <div
                            className="flex items-center gap-2 px-3 py-1.5 theme-bg-tertiary cursor-pointer hover:brightness-110 transition-all"
                            onClick={() => toggleReasoning(-1)}
                        >
                            <span className="text-xs text-yellow-400 font-semibold">Thinking Process:</span>
                            {expandedReasoning.has(-1)
                                ? <ChevronDown size={14} className="theme-text-muted flex-shrink-0" />
                                : <ChevronRight size={14} className="theme-text-muted flex-shrink-0" />
                            }
                        </div>
                        {expandedReasoning.has(-1) && (
                            <div className="px-3 py-2 theme-bg-primary border-t border-[var(--border-color,#313244)]">
                                <div className="prose prose-sm prose-invert max-w-none theme-text-secondary text-sm">
                                    <MarkdownRenderer content={message.reasoningContent || ''} onOpenFile={onOpenFile} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {message.contentParts && message.contentParts.length > 0 ? (
                    <>
                        {message.contentParts.map((part, partIdx) => {
                            if (!part) return null;
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
                                return (
                                    <ToolCallDisplay key={partIdx} tool={part.call || part} />
                                );
                            } else if (part.type === 'reasoning') {
                                const isReasoningExpanded = expandedReasoning.has(partIdx);
                                return (
                                    <div key={partIdx} className="mb-3 rounded-md border-l-2 border-yellow-500 overflow-hidden">
                                        <div
                                            className="flex items-center gap-2 px-3 py-1.5 theme-bg-tertiary cursor-pointer hover:brightness-110 transition-all"
                                            onClick={() => toggleReasoning(partIdx)}
                                        >
                                            <span className="text-xs text-yellow-400 font-semibold">Thinking Process:</span>
                                            {isReasoningExpanded
                                                ? <ChevronDown size={14} className="theme-text-muted flex-shrink-0" />
                                                : <ChevronRight size={14} className="theme-text-muted flex-shrink-0" />
                                            }
                                        </div>
                                        {isReasoningExpanded && (
                                            <div className="px-3 py-2 theme-bg-primary border-t border-[var(--border-color,#313244)]">
                                                <div className="prose prose-sm prose-invert max-w-none theme-text-secondary text-sm">
                                                    <MarkdownRenderer content={part.content || ''} onOpenFile={onOpenFile} />
                                                </div>
                                            </div>
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
                            {searchTerm && displayBody ? (
                                <MarkdownRenderer content={highlightSearchTerm(displayBody, searchTerm)} onOpenFile={onOpenFile} />
                            ) : (
                                <MarkdownRenderer content={displayBody || ''} onOpenFile={onOpenFile} />
                            )}
                            {showStreamingIndicators && message.type !== 'error' && (
                                <span className="ml-1 inline-block w-0.5 h-4 theme-text-primary animate-pulse stream-cursor"></span>
                            )}
                            {isLongMessage && !isExpanded && (
                                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-inherit to-transparent pointer-events-none" />
                            )}
                        </div>
                        {hasContextBlocks && (
                            <div className="mt-2 rounded-md border-l-2 border-blue-500 overflow-hidden">
                                <ContextBlocks blocks={contextBlocks} />
                            </div>
                        )}

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
                                        <span>Show more ({countLines(displayBody)} lines)</span>
                                    </>
                                )}
                            </button>
                        )}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                            <div className="mt-2">
                                {message.toolCalls.map((tool, idx) => (
                                    <ToolCallDisplay key={idx} tool={tool} />
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

                {message.role === 'assistant' && !showStreamingIndicators && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50">
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
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
