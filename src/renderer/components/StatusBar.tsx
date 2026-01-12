import React from 'react';
import {
    Folder, MessageSquare, Terminal, Globe, FileText, File as FileIcon,
    BrainCircuit, ArrowDown, HelpCircle, Database, GitBranch, Clock, Bot, Zap
} from 'lucide-react';

interface PaneItem {
    id: string;
    type: string;
    title: string;
    isActive: boolean;
}

interface StatusBarProps {
    // Git
    gitBranch: string | null;
    gitStatus: any;
    setGitModalOpen: (open: boolean) => void;
    createGitPane?: () => void;
    // Workspace
    directoryConversations: any[];
    setWorkspaceModalOpen: (open: boolean) => void;
    // Panes
    paneItems: PaneItem[];
    setActiveContentPaneId: (id: string) => void;
    // Toggles
    autoScrollEnabled: boolean;
    setAutoScrollEnabled: (enabled: boolean) => void;
    isPredictiveTextEnabled: boolean;
    setIsPredictiveTextEnabled: (enabled: boolean) => void;
    // Help pane
    createHelpPane?: () => void;
    // Memory
    pendingMemoryCount?: number;
    createMemoryManagerPane?: () => void;
    // Knowledge Graph
    kgGeneration?: number | null;
    kgScheduleEnabled?: boolean;
    createGraphViewerPane?: () => void;
    // NPCs and Jinxs - bottom right
    createNPCTeamPane?: () => void;
    createJinxPane?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
    gitBranch,
    gitStatus,
    setGitModalOpen,
    createGitPane,
    directoryConversations,
    setWorkspaceModalOpen,
    paneItems,
    setActiveContentPaneId,
    autoScrollEnabled,
    setAutoScrollEnabled,
    isPredictiveTextEnabled,
    setIsPredictiveTextEnabled,
    createHelpPane,
    pendingMemoryCount = 0,
    createMemoryManagerPane,
    kgGeneration,
    kgScheduleEnabled = false,
    createGraphViewerPane,
    createNPCTeamPane,
    createJinxPane,
}) => {
    return (
        <div className="h-6 flex-shrink-0 theme-bg-tertiary border-t theme-border flex items-center px-2 text-[10px] theme-text-muted gap-2">
            {/* Git button */}
            <button
                onClick={() => createGitPane ? createGitPane() : setGitModalOpen(true)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${gitBranch ? 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50' : 'theme-hover'}`}
                title="Git"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="6" y1="3" x2="6" y2="15"></line>
                    <circle cx="18" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                {gitBranch && <span className="truncate max-w-[80px]">{gitBranch}</span>}
                {gitStatus?.hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>}
            </button>

            {/* Workspace button */}
            <button
                onClick={() => setWorkspaceModalOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded theme-hover"
                title="Workspace Info"
            >
                <Folder size={12} />
                <span className="opacity-60">{directoryConversations.length} convos</span>
            </button>

            {/* Memory button - fancier style */}
            <button
                onClick={() => createMemoryManagerPane?.()}
                className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 border border-amber-700/30 transition-all"
                title={pendingMemoryCount > 0 ? `${pendingMemoryCount} memories pending review` : "Memory Manager"}
            >
                <Database size={12} />
                <span>Memory</span>
                {pendingMemoryCount > 0 && (
                    <span className="flex items-center gap-1 ml-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        <span className="text-amber-200">{pendingMemoryCount}</span>
                    </span>
                )}
            </button>

            {/* KG button - fancier style */}
            <button
                onClick={() => createGraphViewerPane?.()}
                className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-700/30 transition-all"
                title={kgScheduleEnabled ? "KG Schedule Active" : "Knowledge Graph"}
            >
                {/* Custom KG graph icon - asymmetric network */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {/* Nodes in organic cloud layout */}
                    <circle cx="6" cy="8" r="2.5" />
                    <circle cx="18" cy="6" r="2" />
                    <circle cx="12" cy="14" r="3" />
                    <circle cx="5" cy="18" r="2" />
                    <circle cx="19" cy="17" r="2.5" />
                    {/* Connecting edges - irregular network */}
                    <line x1="8" y1="9" x2="10" y2="12" />
                    <line x1="16" y1="7" x2="14" y2="12" />
                    <line x1="7" y1="17" x2="9.5" y2="15.5" />
                    <line x1="14.5" y1="15.5" x2="17" y2="16" />
                    <line x1="7" y1="10" x2="5" y2="16" />
                </svg>
                <span>KG</span>
                {kgGeneration !== null && kgGeneration !== undefined && (
                    <span className="opacity-60 ml-1">Gen {kgGeneration}</span>
                )}
                {kgScheduleEnabled && <Clock size={10} className="text-emerald-400 ml-1" />}
            </button>

            <div className="flex-1" />

            {/* Pane Dock - centered */}
            <div className="flex items-center gap-1">
                {paneItems.map((pane) => (
                    <button
                        key={pane.id}
                        onClick={() => setActiveContentPaneId(pane.id)}
                        className={`px-2 py-0.5 rounded text-[10px] transition-all flex items-center gap-1 ${
                            pane.isActive
                                ? 'bg-blue-600 text-white'
                                : 'theme-hover theme-text-muted hover:text-white'
                        }`}
                        title={pane.title}
                    >
                        {pane.type === 'chat' && <MessageSquare size={10} />}
                        {pane.type === 'editor' && <FileIcon size={10} />}
                        {pane.type === 'terminal' && <Terminal size={10} />}
                        {pane.type === 'browser' && <Globe size={10} />}
                        {pane.type === 'pdf' && <FileText size={10} />}
                        {!['chat', 'editor', 'terminal', 'browser', 'pdf'].includes(pane.type) && <FileIcon size={10} />}
                        <span className="truncate max-w-[60px]">{pane.title}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1" />

            {/* Right side - Auto-scroll, Predictive text, and Help */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
                    className={`p-1 rounded flex items-center gap-1 text-[10px] ${
                        autoScrollEnabled
                            ? 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/50'
                            : 'theme-hover theme-text-muted'
                    }`}
                    title={autoScrollEnabled ? "Disable Auto-scroll" : "Enable Auto-scroll"}
                >
                    <ArrowDown size={12} />
                    <span className="hidden sm:inline">Scroll</span>
                </button>
                <button
                    onClick={() => setIsPredictiveTextEnabled(!isPredictiveTextEnabled)}
                    className={`p-1 rounded flex items-center gap-1 text-[10px] ${
                        isPredictiveTextEnabled
                            ? 'bg-purple-600/30 text-purple-400 hover:bg-purple-600/50'
                            : 'theme-hover theme-text-muted'
                    }`}
                    title={isPredictiveTextEnabled ? "Disable Predictive Text" : "Enable Predictive Text"}
                >
                    <BrainCircuit size={12} />
                    <span className="hidden sm:inline">AI</span>
                </button>

                {/* NPCs button - bottom right */}
                <button
                    onClick={() => createNPCTeamPane?.()}
                    className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] bg-cyan-900/30 text-cyan-300 hover:bg-cyan-900/50 border border-cyan-700/30"
                    title="NPCs"
                >
                    <Bot size={12} />
                    <span>NPCs</span>
                </button>

                {/* Jinxs button - bottom right */}
                <button
                    onClick={() => createJinxPane?.()}
                    className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50 border border-yellow-700/30"
                    title="Jinxs"
                >
                    <Zap size={12} />
                    <span>Jinxs</span>
                </button>

                <button
                    onClick={() => createHelpPane?.()}
                    className="p-1 rounded flex items-center gap-1 text-[10px] theme-hover theme-text-muted"
                    title="Open Help Pane"
                >
                    <HelpCircle size={12} />
                </button>
            </div>
        </div>
    );
};

export default StatusBar;
