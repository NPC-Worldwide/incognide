import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Square, CheckSquare, User, Maximize2 } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

const stripSourcePrefix = (name: string): string => {
    if (!name) return name;
    return name.replace(/^(project:|global:)/, '');
};

interface BroadcastResponseRowProps {
    siblingRuns: any[];
    userMessage: any;
    allMessages: any[];
    onCopyAll: (messages: any[]) => void;
    onToggleBranchSelection: (message: any, selected: boolean) => void;
    selectedBranchIds: Set<string>;
    onApplyToCode?: (message: any) => void;
    onExpandBranch?: (assistantMsgId: string) => void;
    depth?: number;
}

const BroadcastResponseRow: React.FC<BroadcastResponseRowProps> = ({
    siblingRuns,
    userMessage,
    allMessages,
    onCopyAll,
    onToggleBranchSelection,
    selectedBranchIds,
    onApplyToCode,
    onExpandBranch,
    depth = 0
}) => {

    console.log('[BROADCAST ROW] depth:', depth, 'siblingRuns:', siblingRuns.length,
        'allMessages:', allMessages.length,
        'runs:', siblingRuns.map((r: any) => ({ id: String(r.id || '').slice(0,8), parent: String(r.parentMessageId || '').slice(0,8), npc: r.npc })));

    const [expandedCards, setExpandedCards] = useState<Set<string>>(() =>
        new Set(siblingRuns.map(r => r.id))
    );

    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleBranchSelect = (run: any) => {
        try {
            const isCurrentlySelected = selectedBranchIds.has(run.id);
            console.log('[BROADCAST] Toggle branch:', run.id, run.npc || run.model, 'currently:', isCurrentlySelected, '-> new:', !isCurrentlySelected);
            console.log('[BROADCAST] selectedBranchIds:', Array.from(selectedBranchIds));
            onToggleBranchSelection(run, !isCurrentlySelected);
            console.log('[BROADCAST] Toggle complete');
        } catch (err) {
            console.error('[BROADCAST] Error in toggleBranchSelect:', err);
        }
    };

    const selectAll = () => {
        siblingRuns.forEach(run => {
            if (!selectedBranchIds.has(run.id)) {
                onToggleBranchSelection(run, true);
            }
        });
    };

    const selectNone = () => {
        siblingRuns.forEach(run => {
            if (selectedBranchIds.has(run.id)) {
                onToggleBranchSelection(run, false);
            }
        });
    };

    const copyMessage = (msg: any) => {
        navigator.clipboard.writeText(msg.content || '');
    };

    const copyAll = () => {
        onCopyAll(siblingRuns);
    };

    const getChildUserMessages = (parentId: string) => {
        const children = allMessages.filter((m: any) => m.role === 'user' && m.parentMessageId === parentId);
        if (children.length > 0) {
            console.log('[SUBCHAIN] Found', children.length, 'child user msgs for parent', String(parentId || '').slice(0,8),
                ':', children.map((c: any) => ({ id: String(c.id || '').slice(0,8), parent: String(c.parentMessageId || '').slice(0,8) })));
        }
        return children;
    };

    const getAssistantResponses = (userMsgId: string) => {
        const responses = allMessages.filter((m: any) => m.role === 'assistant' && m.parentMessageId === userMsgId);
        if (responses.length > 0) {
            console.log('[SUBCHAIN] Found', responses.length, 'assistant responses for user', String(userMsgId || '').slice(0,8));
        }
        return responses;
    };

    const selectedInThisGroup = siblingRuns.filter(r => selectedBranchIds.has(r.id));
    const allSelected = selectedInThisGroup.length === siblingRuns.length;
    const someSelected = selectedInThisGroup.length > 0;

    return (
        <div className="flex flex-col items-start w-full">
            {depth === 0 && siblingRuns.length > 1 && (
                <div className="flex items-center gap-2 mb-1 text-[10px]">
                    <button
                        onClick={allSelected ? selectNone : selectAll}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                    >
                        {allSelected ? <CheckSquare size={10} /> : <Square size={10} />}
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                        onClick={copyAll}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                    >
                        <Copy size={10} />
                        Copy All
                    </button>
                    {someSelected && (
                        <span className="text-purple-400 text-[9px]">
                            {selectedInThisGroup.length} branch{selectedInThisGroup.length > 1 ? 'es' : ''} selected
                        </span>
                    )}
                </div>
            )}

            <div className="w-0.5 h-4 bg-purple-500/50 self-center" />

            <div className="relative w-full">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-purple-500/50" />

                <div className="flex gap-2 pt-4 w-full">
                    {siblingRuns.map((run) => {
                        const isExpanded = expandedCards.has(run.id);
                        const isSelected = selectedBranchIds.has(run.id);
                        const label = stripSourcePrefix(run.npc || run.model || 'Response');

                        const childUserMsgs = getChildUserMessages(run.id);

                        return (
                            <div
                                key={run.id}
                                className="flex flex-col items-center min-w-0"
                                style={{ flex: '1 1 0' }}
                            >
                                <div className={`w-0.5 h-3 -mt-4 ${isSelected ? 'bg-purple-400' : 'bg-purple-500/50'}`} />

                                <div className={`w-full bg-[#1a1a2e] border rounded-lg overflow-visible transition-all ${isSelected ? 'border-purple-400 ring-1 ring-purple-400/50' : 'border-purple-500/30'}`}>
                                    <div
                                        className="flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-purple-500/10 transition-colors"
                                        onClick={() => toggleCard(run.id)}
                                    >
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                console.log('[CLICK] Checkbox clicked for:', run.id, 'depth:', depth);
                                                toggleBranchSelect(run);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="p-1 hover:bg-purple-500/30 rounded flex-shrink-0 relative z-50 cursor-pointer"
                                            title={isSelected ? 'Deselect this branch' : 'Select to broadcast to this branch'}
                                            style={{ pointerEvents: 'auto' }}
                                        >
                                            {isSelected ? (
                                                <CheckSquare size={14} className="text-purple-400" />
                                            ) : (
                                                <Square size={14} className="text-gray-500 hover:text-gray-300" />
                                            )}
                                        </button>

                                        {isExpanded ? (
                                            <ChevronDown size={12} className="text-purple-400 flex-shrink-0" />
                                        ) : (
                                            <ChevronRight size={12} className="text-purple-400 flex-shrink-0" />
                                        )}

                                        <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full border truncate ${isSelected ? 'bg-purple-500/40 text-purple-200 border-purple-400' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'}`}>
                                            {label}
                                        </span>

                                        {childUserMsgs.length > 0 && (
                                            <span className="text-[8px] text-purple-400/70 ml-1">
                                                +{childUserMsgs.length}
                                            </span>
                                        )}

                                        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                                            {onExpandBranch && childUserMsgs.length > 0 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onExpandBranch(run.id); }}
                                                    className="p-0.5 hover:bg-purple-500/30 rounded"
                                                    title="Expand this branch as main view"
                                                >
                                                    <Maximize2 size={10} className="text-purple-400" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); copyMessage(run); }}
                                                className="p-0.5 hover:bg-white/10 rounded"
                                                title="Copy"
                                            >
                                                <Copy size={10} className="text-gray-400" />
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div
                                            className="px-2 pb-2 border-t border-purple-500/10 relative"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ pointerEvents: 'auto' }}
                                        >
                                            <div className="prose prose-invert prose-sm max-w-none mt-1 text-xs">
                                                <MarkdownRenderer content={run.content || ''} />
                                            </div>

                                            {childUserMsgs.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-purple-500/20">
                                                    <div className="text-[10px] text-purple-400 flex items-center gap-1">
                                                        <span>↳ {childUserMsgs.length} follow-up{childUserMsgs.length > 1 ? 's' : ''}</span>
                                                        {onExpandBranch && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onExpandBranch(run.id); }}
                                                                className="text-purple-300 hover:text-purple-100 underline ml-1"
                                                            >
                                                                expand →
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BroadcastResponseRow;
