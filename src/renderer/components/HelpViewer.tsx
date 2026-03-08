import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Terminal, Globe, FileText, Zap, Users, Brain, Keyboard, Settings, FolderOpen, GitBranch, Image, Database, BookOpen, Layout, MousePointer, Command, Search, Bug, HardDrive, Beaker, Tag, Network, Palette, FileCode, BarChart3, Wrench, HelpCircle } from 'lucide-react';

interface SectionProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<SectionProps> = ({ title, icon, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border theme-border rounded-lg overflow-hidden mb-3">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 theme-bg-tertiary hover:bg-opacity-80 transition-colors text-left"
            >
                {isOpen ? <ChevronDown size={18} className="text-blue-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                <span className="text-blue-400">{icon}</span>
                <span className="font-medium theme-text-primary">{title}</span>
            </button>
            {isOpen && (
                <div className="px-4 py-3 theme-bg-secondary border-t theme-border">
                    {children}
                </div>
            )}
        </div>
    );
};

const KeyboardShortcut: React.FC<{ keys: string; description: string }> = ({ keys, description }) => (
    <div className="flex items-center justify-between py-0.5">
        <span className="text-[11px] theme-text-muted">{description}</span>
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-700 rounded border border-gray-600 theme-text-primary">{keys}</kbd>
    </div>
);

const FeatureItem: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
    <div className="flex gap-3 py-2">
        <span className="text-blue-400 flex-shrink-0 mt-0.5">{icon}</span>
        <div>
            <div className="font-medium theme-text-primary text-sm">{title}</div>
            <div className="text-xs theme-text-muted mt-0.5">{description}</div>
        </div>
    </div>
);

const PaneTypeItem: React.FC<{ icon: React.ReactNode; name: string; desc: string; color: string }> = ({ icon, name, desc, color }) => (
    <div className="flex items-center gap-2 p-1.5 rounded theme-bg-tertiary">
        <span className={color}>{icon}</span>
        <div className="min-w-0">
            <span className="text-[11px] theme-text-primary font-medium">{name}</span>
            <span className="text-[10px] theme-text-muted ml-1">- {desc}</span>
        </div>
    </div>
);

interface HelpViewerProps {
    appVersion?: string;
}

export const HelpViewer: React.FC<HelpViewerProps> = ({ appVersion }) => {
    const [searchQuery, setSearchQuery] = useState('');

    const matchesSearch = (text: string) => {
        if (!searchQuery) return true;
        return text.toLowerCase().includes(searchQuery.toLowerCase());
    };

    return (
        <div className="flex flex-col h-full theme-bg-primary overflow-hidden">
            <div className="flex-shrink-0 px-6 py-4 border-b theme-border">
                <h1 className="text-xl font-bold theme-text-primary">Incognide</h1>
                <p className="text-sm theme-text-muted mt-1">AI-native desktop environment</p>
            </div>

            <div className="flex-shrink-0 px-6 py-3 border-b theme-border">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search help..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg theme-bg-secondary border theme-border focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {matchesSearch('welcome introduction overview') && (
                    <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                        <h2 className="text-lg font-semibold theme-text-primary mb-2">Welcome to Incognide</h2>
                        <p className="text-sm theme-text-muted leading-relaxed">
                            Incognide is an AI-native desktop environment that combines an integrated development environment,
                            web browser, document editing, terminal, and knowledge management into a flexible tiled workspace.
                            Create custom AI personas (NPCs), automate workflows with Jinxes, and organize your work however you like.
                        </p>
                    </div>
                )}

                {matchesSearch('features chat terminal browser editor layout document') && (
                    <CollapsibleSection title="Core Features" icon={<Layout size={18} />} defaultOpen={false}>
                        <div className="space-y-1">
                            <FeatureItem
                                icon={<MessageSquare size={16} />}
                                title="AI Chat"
                                description="Multi-model conversations with file attachments, image support, conversation branching, and broadcast to multiple models."
                            />
                            <FeatureItem
                                icon={<Terminal size={16} />}
                                title="Terminal"
                                description="Integrated shell with system bash, npcsh (AI-enhanced), Python REPL, and Guacamole remote access."
                            />
                            <FeatureItem
                                icon={<Globe size={16} />}
                                title="Web Browser"
                                description="Built-in Chromium browser with ad blocking, password management, bookmarks, and page content extraction for AI context."
                            />
                            <FeatureItem
                                icon={<FileCode size={16} />}
                                title="Code Editor"
                                description="Edit code with syntax highlighting for 100+ languages. Auto-save, git integration, and send-to-terminal."
                            />
                            <FeatureItem
                                icon={<FileText size={16} />}
                                title="Documents"
                                description="View and create PDFs, Word docs (.docx), Excel spreadsheets (.xlsx), PowerPoint (.pptx), and LaTeX with live preview."
                            />
                            <FeatureItem
                                icon={<BookOpen size={16} />}
                                title="Notebooks"
                                description="Jupyter notebook support with code execution, markdown cells, and inline visualizations."
                            />
                            <FeatureItem
                                icon={<Database size={16} />}
                                title="Data Tools"
                                description="SQLite browser, CSV viewer, data visualization dashboard, and data labeling for ML datasets."
                            />
                            <FeatureItem
                                icon={<Network size={16} />}
                                title="Knowledge Graph"
                                description="Visualize entities and relationships extracted from your conversations and documents."
                            />
                            <FeatureItem
                                icon={<Layout size={16} />}
                                title="Tiled Layout"
                                description="Split panes any direction, drag to rearrange, resize with dividers. Workspaces auto-save per directory."
                            />
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('npc persona jinx workflow automation agent') && (
                    <CollapsibleSection title="NPCs & Jinxes" icon={<Users size={18} />}>
                        <div className="space-y-3">
                            <div>
                                <h4 className="font-medium theme-text-primary text-sm mb-1">NPCs (Personas)</h4>
                                <p className="text-xs theme-text-muted">
                                    NPCs are customizable personas with specific system prompts and behaviors.
                                    Use them for chat, as agents with tools, or in any execution mode.
                                    Create project-specific ones in <code className="px-1 py-0.5 bg-gray-700 rounded text-[10px]">./npc_team/npcs/</code>
                                    or global ones in <code className="px-1 py-0.5 bg-gray-700 rounded text-[10px]">~/.npcsh/npc_team/npcs/</code>.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-medium theme-text-primary text-sm mb-1">Jinxes (Workflows)</h4>
                                <p className="text-xs theme-text-muted">
                                    Jinxes are reusable YAML workflows with Jinja2 templating. Type <code className="px-1 py-0.5 bg-gray-700 rounded text-[10px]">/jinx_name</code> in chat
                                    to run them. Define inputs, chain multiple AI steps, and automate repetitive tasks.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-medium theme-text-primary text-sm mb-1">Context Files (.ctx)</h4>
                                <p className="text-xs theme-text-muted">
                                    Add persistent context files that get included with every message. Great for coding standards,
                                    project docs, or reference material the AI should always see.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-medium theme-text-primary text-sm mb-1">Execution Modes</h4>
                                <p className="text-xs theme-text-muted">
                                    <span className="text-cyan-400">Chat</span> - Standard conversation.{' '}
                                    <span className="text-amber-400">Agent</span> - AI with MCP tools (file ops, code exec, browsing).{' '}
                                    <span className="text-purple-400">Jinx</span> - Run workflow templates.
                                </p>
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('pane type panel view notebook pdf image database') && (
                    <CollapsibleSection title="All Pane Types" icon={<FolderOpen size={18} />}>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                            <PaneTypeItem icon={<MessageSquare size={12} />} name="Chat" desc="AI conversations" color="text-blue-400" />
                            <PaneTypeItem icon={<Terminal size={12} />} name="Terminal" desc="Shell access" color="text-green-400" />
                            <PaneTypeItem icon={<Globe size={12} />} name="Browser" desc="Web browsing" color="text-cyan-400" />
                            <PaneTypeItem icon={<FileCode size={12} />} name="Editor" desc="Code & text files" color="text-yellow-400" />
                            <PaneTypeItem icon={<BookOpen size={12} />} name="Notebook" desc="Jupyter notebooks" color="text-orange-400" />
                            <PaneTypeItem icon={<FileText size={12} />} name="PDF" desc="PDF viewer" color="text-red-400" />
                            <PaneTypeItem icon={<Image size={12} />} name="Photo" desc="Image viewer" color="text-purple-400" />
                            <PaneTypeItem icon={<Beaker size={12} />} name="Experiment" desc="Scientific notes" color="text-pink-400" />
                            <PaneTypeItem icon={<Database size={12} />} name="DB Tool" desc="SQLite browser" color="text-amber-400" />
                            <PaneTypeItem icon={<BarChart3 size={12} />} name="DataDash" desc="Data visualization" color="text-teal-400" />
                            <PaneTypeItem icon={<Network size={12} />} name="Graph" desc="Knowledge graph" color="text-indigo-400" />
                            <PaneTypeItem icon={<Tag size={12} />} name="Labeler" desc="Data labeling" color="text-lime-400" />
                            <PaneTypeItem icon={<FolderOpen size={12} />} name="Library" desc="File browser" color="text-sky-400" />
                            <PaneTypeItem icon={<HardDrive size={12} />} name="Disk" desc="Storage usage" color="text-slate-400" />
                            <PaneTypeItem icon={<Users size={12} />} name="Team" desc="NPC management" color="text-emerald-400" />
                            <PaneTypeItem icon={<Zap size={12} />} name="Jinx" desc="Workflow editor" color="text-violet-400" />
                            <PaneTypeItem icon={<Wrench size={12} />} name="Settings" desc="Configuration" color="text-gray-400" />
                            <PaneTypeItem icon={<Palette size={12} />} name="Env" desc="Python envs" color="text-rose-400" />
                            <PaneTypeItem icon={<HelpCircle size={12} />} name="Help" desc="This pane" color="text-blue-300" />
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('keyboard shortcut hotkey keybind') && (
                    <CollapsibleSection title="Keyboard Shortcuts" icon={<Keyboard size={18} />}>
                        <div className="space-y-0.5">
                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1">General</div>
                            <KeyboardShortcut keys="Ctrl+N" description="New chat" />
                            <KeyboardShortcut keys="Ctrl+`" description="New terminal" />
                            <KeyboardShortcut keys="Ctrl+W" description="Close pane" />
                            <KeyboardShortcut keys="Ctrl+B" description="Toggle sidebar" />
                            <KeyboardShortcut keys="Ctrl+Shift+P" description="Command palette" />

                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1 mt-3">Chat</div>
                            <KeyboardShortcut keys="Enter" description="Send message" />
                            <KeyboardShortcut keys="Shift+Enter" description="New line" />
                            <KeyboardShortcut keys="Escape" description="Stop generation" />

                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1 mt-3">Layout</div>
                            <KeyboardShortcut keys="Ctrl+\\" description="Split vertical" />
                            <KeyboardShortcut keys="Ctrl+Shift+\\" description="Split horizontal" />
                        </div>
                        <div className="mt-3 p-2 rounded theme-bg-tertiary text-[10px] theme-text-muted">
                            <span className="text-blue-400">Tip:</span> Customize shortcuts in Settings → Keyboard. More shortcuts available in the command palette (Ctrl+Shift+P).
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('mouse drag click right context menu') && (
                    <CollapsibleSection title="Mouse Actions" icon={<MousePointer size={18} />}>
                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-start gap-2">
                                <span className="font-medium theme-text-primary min-w-[100px]">Drag header</span>
                                <span className="theme-text-muted">Move pane to new location</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="font-medium theme-text-primary min-w-[100px]">Drag divider</span>
                                <span className="theme-text-muted">Resize panes</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="font-medium theme-text-primary min-w-[100px]">Right-click</span>
                                <span className="theme-text-muted">Context menu (split, close, etc.)</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="font-medium theme-text-primary min-w-[100px]">Middle-click</span>
                                <span className="theme-text-muted">Close tab</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="font-medium theme-text-primary min-w-[100px]">Drag file</span>
                                <span className="theme-text-muted">Open in new pane or add to chat</span>
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('chat command slash mention file') && (
                    <CollapsibleSection title="Chat Commands" icon={<Command size={18} />}>
                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-start gap-2">
                                <code className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] min-w-[80px]">/name</code>
                                <span className="theme-text-muted">Run a jinx workflow</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <code className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] min-w-[80px]">@npc</code>
                                <span className="theme-text-muted">Message specific NPC</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <code className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] min-w-[80px]">@file</code>
                                <span className="theme-text-muted">Attach file to message</span>
                            </div>
                        </div>
                        <div className="mt-2 p-2 rounded theme-bg-tertiary text-[10px] theme-text-muted">
                            Drag files into chat, paste images, or use the attachment button to add context.
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('file location path directory config') && (
                    <CollapsibleSection title="File Locations" icon={<FolderOpen size={18} />}>
                        <div className="space-y-2 text-xs font-mono">
                            <div>
                                <div className="theme-text-primary">~/.npcsh/</div>
                                <div className="text-[10px] theme-text-muted pl-3">Global config, passwords, memories</div>
                            </div>
                            <div>
                                <div className="theme-text-primary">~/.npcsh/npc_team/</div>
                                <div className="text-[10px] theme-text-muted pl-3">Global NPCs, jinxes, contexts</div>
                            </div>
                            <div>
                                <div className="theme-text-primary">~/.npcshrc</div>
                                <div className="text-[10px] theme-text-muted pl-3">API keys, shell settings</div>
                            </div>
                            <div>
                                <div className="theme-text-primary">./npc_team/</div>
                                <div className="text-[10px] theme-text-muted pl-3">Project-local NPCs and jinxes</div>
                            </div>
                            <div>
                                <div className="theme-text-primary">./.npcsh/</div>
                                <div className="text-[10px] theme-text-muted pl-3">Project workspace, conversations</div>
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('model provider api ollama openai anthropic gemini') && (
                    <CollapsibleSection title="Models & Providers" icon={<Brain size={18} />}>
                        <div className="text-xs theme-text-muted space-y-2">
                            <p>Supports multiple AI providers:</p>
                            <div className="flex flex-wrap gap-1.5">
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-blue-300">Ollama (local)</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-green-300">OpenAI</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-orange-300">Anthropic</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-purple-300">Google Gemini</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-cyan-300">Deepseek</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-pink-300">OpenRouter</span>
                            </div>
                            <p className="mt-2">Configure API keys in Settings. Star ⭐ models to pin them to your favorites for quick access.</p>
                        </div>
                    </CollapsibleSection>
                )}

                {matchesSearch('tip trick hint') && (
                    <CollapsibleSection title="Tips & Tricks" icon={<Zap size={18} />}>
                        <ul className="space-y-1.5 text-xs theme-text-muted">
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Branch conversations to explore different approaches</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Broadcast to multiple models/NPCs for comparison</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Layouts auto-save per directory</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Use "Add to Context" on browser pages for AI reference</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Create project NPCs for consistent coding style</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-yellow-400">•</span>
                                <span>Pin the sidebar sections in any order you prefer</span>
                            </li>
                        </ul>
                    </CollapsibleSection>
                )}

                <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Bug size={16} className="text-amber-400" />
                        <span className="font-medium theme-text-primary text-sm">Found a bug?</span>
                    </div>
                    <p className="text-xs theme-text-muted mb-2">
                        Help improve Incognide by reporting issues or suggesting features.
                    </p>
                    <a
                        href="https://github.com/cagostino/incognide/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 hover:underline"
                    >
                        Report on GitHub →
                    </a>
                </div>

                <div className="mt-6 pt-4 border-t theme-border text-center">
                    <p className="text-xs theme-text-muted">
                        Incognide {appVersion ? `v${appVersion}` : ''} | Built with Electron + React
                    </p>
                    <p className="text-xs theme-text-muted mt-1">
                        <a href="https://github.com/cagostino/incognide" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>
                        {' | '}
                        <a href="https://incognide.io" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                            Documentation
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default HelpViewer;
