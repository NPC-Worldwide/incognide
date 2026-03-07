import React, { useState, useRef } from 'react';
import { BarChart3, ChevronDown, ChevronRight, ListFilter, MessageSquare } from 'lucide-react';

interface ChatStats {
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    models: Set<string>;
    agents: Set<string>;
    providers: Set<string>;
}

interface ChatHeaderContentProps {
    icon: React.ReactNode;
    title: string;
    chatStats?: ChatStats;
    autoScrollEnabled: boolean;
    setAutoScrollEnabled: (enabled: boolean) => void;
    messageSelectionMode: boolean;
    toggleMessageSelectionMode: () => void;
    selectedMessages: Set<string>;
    showBranchingUI: boolean;
    setShowBranchingUI: (show: boolean) => void;
    conversationBranches: Map<string, any>;
    topBarCollapsed?: boolean;
    onExpandTopBar?: () => void;
}

const ChatHeaderContent: React.FC<ChatHeaderContentProps> = ({
    icon,
    title,
    chatStats = { messageCount: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() },
    autoScrollEnabled,
    setAutoScrollEnabled,
    messageSelectionMode,
    toggleMessageSelectionMode,
    selectedMessages,
    showBranchingUI,
    setShowBranchingUI,
    conversationBranches,
    topBarCollapsed,
    onExpandTopBar,
}) => {
    const [statsExpanded, setStatsExpanded] = useState(false);
    const statsButtonRef = useRef<HTMLButtonElement>(null);
    const totalTokens = (chatStats.inputTokens || 0) + (chatStats.outputTokens || 0);

    return (
        <div style={{ flex: '1 1 0', width: 0, minWidth: 0, display: 'flex', alignItems: 'center', padding: '4px 8px', gap: '8px' }}>
            <span style={{ flexShrink: 0 }}>{icon}</span>
            <span
                style={{
                    flex: '0 1 auto',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600
                }}
                title={title}
            >
                {title}
            </span>

            {topBarCollapsed && onExpandTopBar && (
                <button
                    onClick={(e) => { e.stopPropagation(); onExpandTopBar(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 theme-hover rounded flex-shrink-0 text-gray-400 hover:text-blue-400"
                    title="Show top bar"
                >
                    <ChevronDown size={14} />
                </button>
            )}

            <div style={{ flex: '1 1 0', width: 0, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', overflow: 'hidden', flexWrap: 'nowrap' }}>
                <div className="flex-shrink-0">
                    <button
                        ref={statsButtonRef}
                        onClick={(e) => { e.stopPropagation(); setStatsExpanded(!statsExpanded); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-200 rounded theme-hover"
                        title={`${chatStats.messageCount} messages${totalTokens > 0 ? `, ${totalTokens.toLocaleString()} tokens` : ''}${chatStats.totalCost > 0 ? `, $${chatStats.totalCost.toFixed(4)}` : ''}`}
                    >
                        <BarChart3 size={12} />
                        <span className="hidden sm:inline">{chatStats.messageCount}m</span>
                        {statsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                    {statsExpanded && (() => {
                        const rect = statsButtonRef.current?.getBoundingClientRect();
                        return (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onMouseDown={() => setStatsExpanded(false)} />
                                <div
                                    className="fixed p-2 rounded theme-bg-secondary theme-border border shadow-lg z-50 min-w-[180px]"
                                    style={{ top: (rect?.bottom ?? 0) + 4, left: rect?.left ?? 0 }}
                                >
                                    <div className="text-[10px] space-y-1">
                                        <div className="flex justify-between"><span className="text-gray-500">Messages:</span><span>{chatStats.messageCount}</span></div>
                                        {chatStats.inputTokens > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Input tokens:</span><span>{chatStats.inputTokens.toLocaleString()}</span></div>
                                        )}
                                        {chatStats.outputTokens > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Output tokens:</span><span>{chatStats.outputTokens.toLocaleString()}</span></div>
                                        )}
                                        {totalTokens > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Total tokens:</span><span>{totalTokens.toLocaleString()}</span></div>
                                        )}
                                        {chatStats.totalCost > 0 && <div className="flex justify-between"><span className="text-gray-500">Cost:</span><span className="text-green-400">${chatStats.totalCost.toFixed(4)}</span></div>}
                                        {chatStats.agents?.size > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Agents:</span><span className="text-purple-400" title={Array.from(chatStats.agents).join(', ')}>{chatStats.agents.size}</span></div>
                                        )}
                                        {chatStats.models?.size > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Models:</span><span className="text-blue-400" title={Array.from(chatStats.models).join(', ')}>{chatStats.models.size}</span></div>
                                        )}
                                        {chatStats.providers?.size > 0 && (
                                            <div className="flex justify-between"><span className="text-gray-500">Providers:</span><span className="text-cyan-400">{chatStats.providers.size}</span></div>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); setAutoScrollEnabled(!autoScrollEnabled); }}
                    className={`p-1 rounded text-xs transition-all flex items-center gap-0.5 flex-shrink-0 ${
                        autoScrollEnabled ? 'theme-button-success' : 'theme-button'
                    } theme-hover`}
                    title={autoScrollEnabled ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M19 12l-7 7-7-7"/>
                    </svg>
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); toggleMessageSelectionMode(); }}
                    className={`p-1 rounded text-xs transition-all flex items-center gap-0.5 flex-shrink-0 ${messageSelectionMode ? 'theme-button-primary' : 'theme-button theme-hover'}`}
                    title={messageSelectionMode ? `Exit selection (${selectedMessages.size} selected)` : 'Select messages'}
                >
                    <ListFilter size={12} />
                    {messageSelectionMode && selectedMessages.size > 0 && <span className="text-[10px]">{selectedMessages.size}</span>}
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); setShowBranchingUI(!showBranchingUI); }}
                    className={`p-1 rounded text-xs transition-all flex items-center gap-0.5 flex-shrink-0 ${
                        showBranchingUI ? 'theme-button-primary' : 'theme-button theme-hover'
                    }`}
                    title="Manage conversation branches"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="6" y1="3" x2="6" y2="15"></line>
                        <circle cx="18" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                    {conversationBranches.size > 0 && <span className="text-[10px]">{conversationBranches.size}</span>}
                </button>
            </div>
        </div>
    );
};

export default ChatHeaderContent;
