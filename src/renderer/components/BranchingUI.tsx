import React, { useCallback } from 'react';
import { X, Network } from 'lucide-react';
import { generateId } from './utils';

interface BranchingUIProps {
    showBranchingUI: boolean;
    setShowBranchingUI: (show: boolean) => void;
    conversationBranches: Map<string, any>;
    currentBranchId: string;
    setCurrentBranchId: (id: string) => void;
    setConversationBranches: (fn: (prev: Map<string, any>) => Map<string, any>) => void;
    activeContentPaneId: string | null;
    contentDataRef: React.MutableRefObject<any>;
    setRootLayoutNode: (fn: (prev: any) => any) => void;
    onOpenVisualizer?: () => void;

    expandedBranchPath?: { [paneId: string]: string[] };
    onCollapseBranch?: (paneId: string) => void;
    onExpandBranch?: (paneId: string, path: string[]) => void;
}

export const BranchingUI: React.FC<BranchingUIProps> = ({
    showBranchingUI,
    setShowBranchingUI,
    conversationBranches,
    currentBranchId,
    setCurrentBranchId,
    setConversationBranches,
    activeContentPaneId,
    contentDataRef,
    setRootLayoutNode,
    onOpenVisualizer,
    expandedBranchPath,
    onCollapseBranch,
    onExpandBranch
}) => {

    const isInExpandedBranch = activeContentPaneId && expandedBranchPath?.[activeContentPaneId]?.length > 0;
    const currentPath = (activeContentPaneId && expandedBranchPath?.[activeContentPaneId]) || [];

    const activePaneData = activeContentPaneId ? contentDataRef.current[activeContentPaneId] : null;
    const allMessages = activePaneData?.chatMessages?.allMessages || [];

    const broadcastGroups: { userMsgId: string; userContent: string; responses: any[] }[] = [];
    const siblingRunsMap: { [key: string]: any[] } = {};

    allMessages.forEach((m: any) => {
        if (m.role === 'assistant') {
            const groupKey = m.parentMessageId || m.cellId;
            if (groupKey) {
                if (!siblingRunsMap[groupKey]) {
                    siblingRunsMap[groupKey] = [];
                }
                siblingRunsMap[groupKey].push(m);
            }
        }
    });

    Object.entries(siblingRunsMap).forEach(([groupKey, responses]) => {
        if (responses.length > 1) {
            const userMsg = allMessages.find((m: any) => m.id === groupKey || m.cellId === groupKey);
            broadcastGroups.push({
                userMsgId: groupKey,
                userContent: userMsg?.content?.slice(0, 50) || 'User message',
                responses
            });
        }
    });

    const switchToBranch = useCallback((branchId: string) => {
        const activePaneData = contentDataRef.current[activeContentPaneId!];
        if (!activePaneData || !activePaneData.chatMessages) return;

        const branch = conversationBranches.get(branchId);
        if (!branch && branchId !== 'main') return;

        if (branchId === 'main') {
            const mainBranch = conversationBranches.get('main');
            if (mainBranch) {
                setCurrentBranchId('main');
                activePaneData.chatMessages.allMessages = [...mainBranch.messages];
                activePaneData.chatMessages.messages = mainBranch.messages.slice(-(activePaneData.chatMessages.displayedMessageCount || 50));
                setRootLayoutNode(prev => ({ ...prev }));
            } else {

                setCurrentBranchId('main');
                setRootLayoutNode(prev => ({ ...prev }));
            }
            return;
        }

        setCurrentBranchId(branchId);
        activePaneData.chatMessages.allMessages = [...branch.messages];
        activePaneData.chatMessages.messages = branch.messages.slice(-(activePaneData.chatMessages.displayedMessageCount || 50));
        setRootLayoutNode(prev => ({ ...prev }));
    }, [activeContentPaneId, conversationBranches, contentDataRef, setCurrentBranchId, setRootLayoutNode]);

    if (!showBranchingUI) return null;

    console.log('[BRANCHING_UI] Rendering:', {
        activeContentPaneId,
        allMessagesCount: allMessages.length,
        assistantCount: allMessages.filter((m:any) => m.role === 'assistant').length,
        broadcastGroupsCount: broadcastGroups.length,
        groups: broadcastGroups.map(g => ({ userMsgId: g.userMsgId?.slice(0,8), responses: g.responses.length }))
    });

    const branches = Array.from(conversationBranches.values());

    return (
        <div className="fixed top-4 right-4 theme-bg-secondary border theme-border rounded-lg shadow-xl p-4 z-50 max-w-md">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Conversation Branches</h3>
                <button
                    onClick={() => setShowBranchingUI(false)}
                    className="p-1 theme-hover rounded-full"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
                {broadcastGroups.length > 0 && (
                    <button
                        onClick={() => {
                            if (onCollapseBranch && activeContentPaneId) {
                                onCollapseBranch(activeContentPaneId);
                            }
                        }}
                        className={`w-full p-2 rounded text-left transition-all ${
                            !isInExpandedBranch
                                ? 'bg-purple-500 text-white'
                                : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/40'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Network size={14} />
                            <span className="font-medium">Tree View (show all branches)</span>
                        </div>
                    </button>
                )}

                <div className="text-[9px] text-gray-500 mb-2">
                    msgs: {allMessages.length} | asst: {allMessages.filter((m:any) => m.role === 'assistant').length} | groups: {broadcastGroups.length} | pane: {activeContentPaneId?.slice(0,8) || 'none'}
                    {allMessages.filter((m:any) => m.role === 'assistant').slice(0,3).map((m:any,i:number) => (
                        <div key={i}>a{i}: parent={String(m.parentMessageId||m.cellId||'NONE').slice(0,8)}</div>
                    ))}
                </div>

                {broadcastGroups.length > 0 ? (
                    broadcastGroups.map((group, groupIdx) => (
                        <div key={group.userMsgId} className="border border-purple-500/30 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400 mb-2 truncate">
                                "{group.userContent}..."
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {group.responses.map((resp: any) => {
                                    const label = (resp.npc || resp.model || 'Response').replace(/^(project:|global:)/, '');
                                    const isInPath = currentPath.includes(resp.id);
                                    return (
                                        <button
                                            key={resp.id}
                                            onClick={() => {
                                                if (onExpandBranch && activeContentPaneId) {

                                                    const msgById = new Map(allMessages.map((m: any) => [m.id, m]));
                                                    const path: string[] = [];
                                                    let cur = resp;
                                                    while (cur) {
                                                        path.unshift(cur.id);
                                                        cur = cur.parentMessageId ? msgById.get(cur.parentMessageId) : null;
                                                    }
                                                    onExpandBranch(activeContentPaneId, path);
                                                }
                                            }}
                                            className={`px-2 py-1 text-xs rounded transition-all ${
                                                isInPath
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/40'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-sm text-gray-400 text-center py-4">
                        No branches in this conversation
                    </div>
                )}

                {branches.length > 0 && (
                    <div className="border-t border-gray-700 pt-2 mt-2">
                        <div className="text-[10px] text-gray-500 mb-1">Saved Branches</div>
                        {branches.filter(b => b.id !== 'main').map(branch => (
                            <button
                                key={branch.id}
                                onClick={() => switchToBranch(branch.id)}
                                className={`w-full p-2 rounded text-left transition-all ${
                                    currentBranchId === branch.id
                                        ? 'theme-button-primary'
                                        : 'theme-hover'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <div className="flex-1">
                                        <div className="font-medium">{branch.name}</div>
                                        <div className="text-xs theme-text-muted">
                                            {branch.messages.length} messages • {new Date(branch.createdAt).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-3 pt-3 border-t theme-border flex items-center justify-between">
                <div className="text-xs theme-text-muted">
                    Current: {currentBranchId === 'main' ? 'Main Branch' : conversationBranches.get(currentBranchId)?.name}
                </div>
                {onOpenVisualizer && (
                    <button
                        onClick={() => {
                            onOpenVisualizer();
                            setShowBranchingUI(false);
                        }}
                        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                    >
                        <Network size={12} />
                        View Map
                    </button>
                )}
            </div>
        </div>
    );
};

export const createBranchPoint = (
    fromMessageIndex: number,
    activeContentPaneId: string | null,
    currentBranchId: string,
    conversationBranches: Map<string, any>,
    contentDataRef: React.MutableRefObject<any>,
    setConversationBranches: (fn: (prev: Map<string, any>) => Map<string, any>) => void,
    setCurrentBranchId: (id: string) => void,
    setRootLayoutNode: (fn: (prev: any) => any) => void
) => {
    const activePaneData = contentDataRef.current[activeContentPaneId!];
    if (!activePaneData || !activePaneData.chatMessages) return;

    const branchId = generateId();

    const currentMessages = [...activePaneData.chatMessages.allMessages];

    const branchPoint = {
        id: branchId,
        parentBranch: currentBranchId,
        branchFromIndex: fromMessageIndex,
        messages: [...currentMessages.slice(0, fromMessageIndex + 1)],
        createdAt: Date.now(),
        name: `Branch ${conversationBranches.size + 1}`
    };

    setConversationBranches(prev => {
        const newMap = new Map(prev);

        if (currentBranchId === 'main' && !newMap.has('main')) {
            newMap.set('main', {
                id: 'main',
                messages: currentMessages,
                createdAt: Date.now(),
                name: 'Main Branch'
            });
        } else if (currentBranchId !== 'main' && newMap.has(currentBranchId)) {

            const existing = newMap.get(currentBranchId);
            newMap.set(currentBranchId, { ...existing, messages: currentMessages });
        }
        newMap.set(branchId, branchPoint);
        return newMap;
    });
    setCurrentBranchId(branchId);

    activePaneData.chatMessages.allMessages = branchPoint.messages;
    activePaneData.chatMessages.messages = branchPoint.messages.slice(-activePaneData.chatMessages.displayedMessageCount);
    setRootLayoutNode(prev => ({ ...prev }));
};

export default BranchingUI;
