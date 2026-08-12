import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Sparkles, Bot, ChevronDown, Plus, Star } from 'lucide-react';

const KNOWN_AGENTS = ['npcsh', 'opencode', 'nanocoder', 'gemini', 'claude', 'codex', 'qwen', 'hermes', 'pi'];

interface TerminalCreateButtonProps {
    createNewTerminal?: (shellType: string) => void;
}

const TerminalCreateButton: React.FC<TerminalCreateButtonProps> = ({ createNewTerminal }) => {
    const [defaultNewTerminalType, setDefaultNewTerminalType] = useState<string>(() =>
        localStorage.getItem('incognide_defaultNewTerminalType') || 'system'
    );
    const [terminalDropdownOpen, setTerminalDropdownOpen] = useState(false);
    const [installedAgents, setInstalledAgents] = useState<Record<string, boolean>>({});
    const [showAddAgentPrompt, setShowAddAgentPrompt] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [newAgentCommand, setNewAgentCommand] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await (window as any).api.loadGlobalSettings();
                if (data?.global_settings?.default_new_terminal_type) {
                    setDefaultNewTerminalType(data.global_settings.default_new_terminal_type);
                    localStorage.setItem('incognide_defaultNewTerminalType', data.global_settings.default_new_terminal_type);
                }
            } catch (err) {
                console.error('Failed to load default terminal type:', err);
            }
        })();

        const handleTerminalTypeChanged = (e: CustomEvent) => {
            if (e.detail) setDefaultNewTerminalType(e.detail);
        };
        window.addEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
        return () => {
            window.removeEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!terminalDropdownOpen) return;
        (async () => {
            try {
                const customAgents = JSON.parse(localStorage.getItem('incognide_terminalAgents') || '[]');
                const allCmds = [...KNOWN_AGENTS, ...customAgents.map((a: any) => a.command)];
                const r = await (window as any).api?.checkBinaries?.(allCmds);
                setInstalledAgents(r || {});
            } catch {}
        })();
    }, [terminalDropdownOpen]);

    // click-outside to close the dropdown
    useEffect(() => {
        if (!terminalDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setTerminalDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [terminalDropdownOpen]);

    return (
        <div ref={wrapperRef} className="relative flex items-center" data-dropdown="terminal" data-tutorial="terminal-button">
            <button
                onClick={() => createNewTerminal?.(defaultNewTerminalType)}
                className="p-2 rounded transition-colors hover:opacity-80 bg-transparent hover:bg-teal-500/20 relative"
                title={`New ${defaultNewTerminalType === 'system' ? 'Bash' : defaultNewTerminalType} Terminal`}
            >
                {defaultNewTerminalType === 'system' && <Terminal size={18} className="text-green-400" />}
                {defaultNewTerminalType === 'npcsh' && <Sparkles size={18} className="text-purple-400" />}
                {defaultNewTerminalType !== 'system' && defaultNewTerminalType !== 'npcsh' && <Bot size={18} className="text-cyan-400" />}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); setTerminalDropdownOpen(!terminalDropdownOpen); }}
                className="flex items-center justify-center hover:bg-teal-500/20 rounded transition-colors p-0.5"
                title="More terminal options"
            >
                <ChevronDown size={9} className="text-gray-500" />
            </button>
            {terminalDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 theme-bg-secondary border theme-border rounded shadow-xl z-[9999] py-1 min-w-[160px]">
                    <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Right-click to set default</div>
                    {(() => {
                        const bash = { name: 'Bash', command: 'system' };
                        let customAgents: any[] = [];
                        try { customAgents = JSON.parse(localStorage.getItem('incognide_terminalAgents') || '[]'); } catch {}
                        const known = KNOWN_AGENTS.map(cmd => ({ name: cmd, command: cmd }));
                        const allKnown = [bash, ...known.filter(a => installedAgents[a.command])];
                        const customFiltered = customAgents.filter(a => installedAgents[a.command] && !KNOWN_AGENTS.includes(a.command) && a.command !== 'system');
                        return [...allKnown, ...customFiltered].map((item: any, idx: number) => (
                            <button
                                key={idx}
                                onClick={() => { createNewTerminal?.(item.command); setTerminalDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewTerminalType(item.command); localStorage.setItem('incognide_defaultNewTerminalType', item.command); setTerminalDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left theme-hover text-xs ${defaultNewTerminalType === item.command ? 'bg-green-900/30 text-green-300' : 'theme-text-primary'}`}
                            >
                                <Terminal size={11} /><span>{item.name}</span>
                                {defaultNewTerminalType === item.command && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                        ));
                    })()}
                    <div className="border-t theme-border my-0.5" />
                    {!showAddAgentPrompt ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowAddAgentPrompt(true); }}
                            className="flex items-center gap-2 px-2 py-1 w-full text-left theme-hover text-xs text-blue-400"
                        >
                            <Plus size={11} /><span>Add custom agent...</span>
                        </button>
                    ) : (
                        <div className="p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                            <input type="text" placeholder="Name" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full px-1.5 py-0.5 text-xs theme-bg-primary border theme-border rounded" />
                            <input type="text" placeholder="Command (binary name)" value={newAgentCommand} onChange={e => setNewAgentCommand(e.target.value)} className="w-full px-1.5 py-0.5 text-xs theme-bg-primary border theme-border rounded" />
                            <div className="flex gap-1">
                                <button
                                    onClick={async () => {
                                        if (!newAgentName || !newAgentCommand) return;
                                        try {
                                            const existing = JSON.parse(localStorage.getItem('incognide_terminalAgents') || '[]');
                                            const updated = [...existing.filter((a: any) => a.command !== newAgentCommand), { name: newAgentName, command: newAgentCommand }];
                                            localStorage.setItem('incognide_terminalAgents', JSON.stringify(updated));
                                            const r = await (window as any).api?.checkBinaries?.([newAgentCommand]);
                                            setInstalledAgents(prev => ({ ...prev, ...(r || {}) }));
                                        } catch {}
                                        setNewAgentName(''); setNewAgentCommand(''); setShowAddAgentPrompt(false);
                                    }}
                                    className="flex-1 px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded"
                                >Add</button>
                                <button onClick={() => { setNewAgentName(''); setNewAgentCommand(''); setShowAddAgentPrompt(false); }} className="px-2 py-0.5 text-[10px] theme-bg-tertiary rounded">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TerminalCreateButton;