import React from 'react';
import {
    MessageSquare, Terminal, Globe, FileText, File as FileIcon,
    BrainCircuit, Clock, Bot, Zap, Users, Database, ChevronRight, ChevronDown
} from 'lucide-react';
import MemoryIcon from './MemoryIcon';
import { useAiEnabled } from './AiFeatureContext';

interface PaneItem {
    id: string;
    type: string;
    title: string;
    isActive: boolean;
}

interface StatusBarProps {
    // DB Tool (left side)
    createDBToolPane?: () => void;
    // Team Management (right side now)
    createTeamManagementPane?: () => void;
    // Panes
    paneItems: PaneItem[];
    setActiveContentPaneId: (id: string) => void;
    // Memory
    pendingMemoryCount?: number;
    createMemoryManagerPane?: () => void;
    // Knowledge Graph
    kgGeneration?: number | null;
    kgScheduleEnabled?: boolean;
    createGraphViewerPane?: () => void;
    // NPCs and Jinxs
    createNPCTeamPane?: () => void;
    createJinxPane?: () => void;
    // Resizable height
    height?: number;
    onStartResize?: () => void;
    // Sidebar collapse
    sidebarCollapsed?: boolean;
    onExpandSidebar?: () => void;
    // Top bar collapse (kept for interface but not used in StatusBar anymore)
    topBarCollapsed?: boolean;
    onExpandTopBar?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
    createDBToolPane,
    createTeamManagementPane,
    paneItems,
    setActiveContentPaneId,
    pendingMemoryCount = 0,
    createMemoryManagerPane,
    kgGeneration,
    kgScheduleEnabled = false,
    createGraphViewerPane,
    createNPCTeamPane,
    createJinxPane,
    height = 48,
    onStartResize,
    sidebarCollapsed = false,
    onExpandSidebar,
}) => {
    const aiEnabled = useAiEnabled();
    // Common button style - explicit transparent background, only icon colored
    const btnClass = "p-2 rounded transition-colors hover:opacity-80 bg-transparent";

    return (
        <div className="flex-shrink-0 relative" style={{ height }}>
            {/* Resize handle for bottom bar */}
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); onStartResize?.(); }}
            />
            <div className="h-full theme-bg-tertiary border-t theme-border flex items-center px-3 text-[12px] theme-text-muted gap-2">
            {/* Expand sidebar button - only when collapsed */}
            {sidebarCollapsed && (
                <button
                    onClick={() => onExpandSidebar?.()}
                    className="p-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:opacity-80 bg-transparent"
                    title="Expand Sidebar"
                >
                    <ChevronRight size={20} />
                </button>
            )}
            {/* Left side - DB, Memory (AI only), KG */}
            {/* DB Tool button */}
            <button
                onClick={() => createDBToolPane?.()}
                className={`${btnClass} text-blue-600 dark:text-blue-400`}
                title="Database Tool"
            >
                <Database size={20} />
            </button>

            {/* Memory button - AI only */}
            {aiEnabled && (
                <button
                    onClick={() => createMemoryManagerPane?.()}
                    className={`${btnClass} text-amber-600 dark:text-amber-400 flex items-center gap-1`}
                    title={pendingMemoryCount > 0 ? `Memory: ${pendingMemoryCount} pending` : "Memory Manager"}
                >
                    <MemoryIcon size={20} />
                    {pendingMemoryCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                </button>
            )}

            {/* KG button */}
            <button
                data-tutorial="kg-button"
                onClick={() => createGraphViewerPane?.()}
                className={`${btnClass} text-emerald-600 dark:text-emerald-400 flex items-center gap-1`}
                title={kgGeneration !== null && kgGeneration !== undefined ? `Knowledge Graph (Gen ${kgGeneration})` : "Knowledge Graph"}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                {kgScheduleEnabled && <Clock size={14} />}
            </button>

            <div className="flex-1" />

            {/* Pane Dock - centered */}
            <div className="flex items-center gap-1">
                {paneItems.map((pane) => (
                    <button
                        key={pane.id}
                        onClick={() => setActiveContentPaneId(pane.id)}
                        className={`p-2 rounded transition-colors ${
                            pane.isActive
                                ? 'bg-blue-600 text-white'
                                : 'bg-transparent theme-text-muted hover:opacity-80'
                        }`}
                        title={pane.title}
                    >
                        {pane.type === 'chat' && <MessageSquare size={20} />}
                        {pane.type === 'editor' && <FileIcon size={20} />}
                        {pane.type === 'terminal' && <Terminal size={20} />}
                        {pane.type === 'browser' && <Globe size={20} />}
                        {pane.type === 'pdf' && <FileText size={20} />}
                        {!['chat', 'editor', 'terminal', 'browser', 'pdf'].includes(pane.type) && <FileIcon size={20} />}
                    </button>
                ))}
            </div>

            <div className="flex-1" />

            {/* Right side - NPCs, Jinxs, Team Management (AI only) */}
            {aiEnabled && (
                <div className="flex items-center gap-1">
                    {/* NPCs button */}
                    <button
                        data-tutorial="npc-team-button"
                        onClick={() => createNPCTeamPane?.()}
                        className={`${btnClass} text-cyan-600 dark:text-cyan-400`}
                        title="NPCs"
                    >
                        <Bot size={20} />
                    </button>

                    {/* Jinxs button */}
                    <button
                        onClick={() => createJinxPane?.()}
                        className={`${btnClass} text-yellow-600 dark:text-yellow-400`}
                        title="Jinxs"
                    >
                        <Zap size={20} />
                    </button>

                    {/* Team Management button */}
                    <button
                        data-tutorial="team-management-button"
                        onClick={() => createTeamManagementPane?.()}
                        className={`${btnClass} text-indigo-600 dark:text-indigo-400`}
                        title="Team Management (NPCs, Jinxs, Databases, MCP, Cron, SQL Models)"
                    >
                        <Users size={20} />
                    </button>
                </div>
            )}
            </div>
        </div>
    );
};

export default StatusBar;
