import React, { useMemo } from 'react';
import { X, GitBranch, MessageSquare, Clock, ChevronRight } from 'lucide-react';

interface Branch {
    id: string;
    name: string;
    parentBranch?: string;
    branchFromIndex?: number;
    messages: any[];
    createdAt: number;
}

interface BranchVisualizerProps {
    isOpen: boolean;
    onClose: () => void;
    conversationBranches: Map<string, Branch>;
    currentBranchId: string;
    onSwitchBranch: (branchId: string) => void;
    allMessages?: any[];
    onExpandBranch?: (path: string[]) => void;
    expandedBranchPath?: string[];
}

interface TreeNode {
    branch: Branch;
    children: TreeNode[];
    depth: number;
    x: number;
    y: number;
}

interface MsgNode {
    id: string;
    msg: any;
    label: string;
    x: number;
    y: number;
    isUser: boolean;
    isBranchPoint: boolean;
    siblings?: any[];
    isInPath: boolean;
}

export const BranchVisualizer: React.FC<BranchVisualizerProps> = ({
    isOpen,
    onClose,
    conversationBranches,
    currentBranchId,
    onSwitchBranch,
    allMessages = [],
    onExpandBranch,
    expandedBranchPath = []
}) => {

    const messageTreeData = useMemo(() => {
        if (!allMessages.length) return { nodes: [] as MsgNode[], edges: [] as { from: string; to: string }[], totalHeight: 0, maxX: 0 };

        const msgById = new Map(allMessages.map((m: any) => [m.id, m]));

        const siblingRunsMap: { [key: string]: any[] } = {};
        allMessages.forEach((m: any) => {
            if (m.role === 'assistant') {
                const groupKey = m.parentMessageId || m.cellId;
                if (groupKey) {
                    if (!siblingRunsMap[groupKey]) siblingRunsMap[groupKey] = [];
                    siblingRunsMap[groupKey].push(m);
                }
            }
        });

        const nodes: MsgNode[] = [];
        const edges: { from: string; to: string }[] = [];
        const processed = new Set<string>();

        const rootUsers = allMessages.filter((m: any) =>
            m.role === 'user' && (!m.parentMessageId || !msgById.has(m.parentMessageId))
        );

        let yPos = 0;
        const NODE_HEIGHT = 60;
        const NODE_WIDTH = 160;
        const BRANCH_OFFSET = 180;

        const processMessage = (msg: any, xPos: number, depth: number) => {
            if (processed.has(msg.id)) return;
            processed.add(msg.id);

            const isInPath = expandedBranchPath.includes(msg.id);
            const label = msg.role === 'user'
                ? (msg.content?.slice(0, 30) || 'User') + '...'
                : (msg.npc || msg.model || 'Response').replace(/^(project:|global:)/, '');

            nodes.push({
                id: msg.id,
                msg,
                label,
                x: xPos,
                y: yPos,
                isUser: msg.role === 'user',
                isBranchPoint: false,
                isInPath
            });
            yPos += NODE_HEIGHT;

            if (msg.role === 'user') {

                const responses = siblingRunsMap[msg.id] || [];
                if (responses.length > 1) {

                    nodes[nodes.length - 1].isBranchPoint = true;
                    nodes[nodes.length - 1].siblings = responses;

                    const startY = yPos;
                    responses.forEach((resp: any, idx: number) => {
                        edges.push({ from: msg.id, to: resp.id });
                        yPos = startY + idx * NODE_HEIGHT;
                        processMessage(resp, xPos + BRANCH_OFFSET, depth + 1);
                    });
                    yPos = startY + responses.length * NODE_HEIGHT;
                } else if (responses.length === 1) {
                    edges.push({ from: msg.id, to: responses[0].id });
                    processMessage(responses[0], xPos, depth);
                }
            } else {

                const followUps = allMessages.filter((m: any) =>
                    m.role === 'user' && m.parentMessageId === msg.id
                );
                followUps.forEach((fu: any) => {
                    edges.push({ from: msg.id, to: fu.id });
                    processMessage(fu, xPos, depth);
                });
            }
        };

        rootUsers.forEach(root => processMessage(root, 0, 0));

        return { nodes, edges, totalHeight: yPos + 40, maxX: Math.max(...nodes.map(n => n.x)) + NODE_WIDTH + 40 };
    }, [allMessages, expandedBranchPath]);

    if (!isOpen) return null;

    const { nodes, edges, totalHeight, maxX } = messageTreeData;
    const nodeMap = new Map<string, MsgNode>(nodes.map(n => [n.id, n]));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
            <div
                className="theme-bg-primary border theme-border rounded-xl shadow-2xl w-[900px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b theme-border flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <GitBranch size={20} className="text-purple-400" />
                        <h2 className="text-lg font-semibold">Conversation Tree</h2>
                        <span className="text-sm text-gray-400">({nodes.length} messages)</span>
                    </div>
                    <button onClick={onClose} className="p-1 theme-hover rounded">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {nodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <GitBranch size={48} className="mb-3 opacity-50" />
                            <p>No messages yet</p>
                        </div>
                    ) : (
                        <svg width={maxX || 400} height={totalHeight || 200} className="min-w-full">
                            <g transform="translate(20, 10)">
                                {edges.map((edge, i) => {
                                    const fromNode = nodeMap.get(edge.from);
                                    const toNode = nodeMap.get(edge.to);
                                    if (!fromNode || !toNode) return null;
                                    return (
                                        <line
                                            key={i}
                                            x1={fromNode.x + 70}
                                            y1={fromNode.y + 50}
                                            x2={toNode.x + 70}
                                            y2={toNode.y}
                                            stroke={toNode.isInPath ? '#a855f7' : '#4b5563'}
                                            strokeWidth={toNode.isInPath ? 2 : 1}
                                        />
                                    );
                                })}

                                {nodes.map(node => (
                                    <foreignObject key={node.id} x={node.x} y={node.y} width="140" height="50">
                                        <div
                                            onClick={() => {
                                                if (onExpandBranch && node.msg.role === 'assistant') {

                                                    const path: string[] = [];
                                                    let cur = node.msg;
                                                    const msgById = new Map(allMessages.map((m: any) => [m.id, m]));
                                                    while (cur) {
                                                        path.unshift(cur.id);
                                                        cur = cur.parentMessageId ? msgById.get(cur.parentMessageId) : null;
                                                    }
                                                    onExpandBranch(path);
                                                    onClose();
                                                }
                                            }}
                                            className={`h-full p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                                                node.isInPath
                                                    ? 'border-purple-500 bg-purple-500/30'
                                                    : node.isUser
                                                        ? 'border-blue-600 bg-blue-900/30 hover:bg-blue-800/40'
                                                        : 'border-gray-600 bg-gray-800/80 hover:bg-gray-700/80'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1 mb-0.5">
                                                {node.isUser ? (
                                                    <MessageSquare size={10} className="text-blue-400" />
                                                ) : (
                                                    <GitBranch size={10} className={node.isInPath ? 'text-purple-400' : 'text-gray-400'} />
                                                )}
                                                <span className={`font-medium truncate ${node.isUser ? 'text-blue-300' : ''}`}>
                                                    {node.label}
                                                </span>
                                            </div>
                                            {node.isBranchPoint && (
                                                <div className="text-[9px] text-purple-400">
                                                    ↳ {node.siblings?.length} branches
                                                </div>
                                            )}
                                        </div>
                                    </foreignObject>
                                ))}
                            </g>
                        </svg>
                    )}
                </div>

                <div className="flex items-center gap-4 px-4 py-3 border-t theme-border text-xs text-gray-400 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded border border-blue-600 bg-blue-900/30" />
                        <span>User</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded border border-gray-600 bg-gray-800" />
                        <span>Assistant</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded border-2 border-purple-500 bg-purple-500/30" />
                        <span>Current Path</span>
                    </div>
                    <div className="flex-1" />
                    <span>Click assistant node to expand that branch</span>
                </div>
            </div>
        </div>
    );
};

export default BranchVisualizer;
