import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Check, AlertCircle, Loader2 } from 'lucide-react';

interface NqlInstallPromptProps {
    onInstalled?: () => void;
    compact?: boolean;
}

type Manager = 'brew' | 'cargo' | 'pip';

const INSTALL_CMDS: Record<Manager, string> = {
    brew: 'brew install npc-worldwide/tap/nql',
    cargo: 'cargo install nql',
    pip: 'pip install nql',
};

const NqlInstallPrompt: React.FC<NqlInstallPromptProps> = ({ onInstalled, compact = false }) => {
    const [nqlPresent, setNqlPresent] = useState<boolean | null>(null);
    const [availableManagers, setAvailableManagers] = useState<Manager[]>([]);
    const [selected, setSelected] = useState<Manager | null>(null);
    const [installing, setInstalling] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const check = useCallback(async () => {
        const api = (window as any).api;
        if (!api?.checkBinaries) return;
        const res = await api.checkBinaries(['nql', 'brew', 'cargo', 'pip', 'pip3']);
        setNqlPresent(!!res?.nql);
        const managers: Manager[] = [];
        if (res?.brew) managers.push('brew');
        if (res?.cargo) managers.push('cargo');
        if (res?.pip || res?.pip3) managers.push('pip');
        setAvailableManagers(managers);
        setSelected(prev => prev && managers.includes(prev) ? prev : (managers[0] || null));
    }, []);

    useEffect(() => { check(); }, [check]);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

    const install = useCallback(async () => {
        if (!selected) return;
        setInstalling(true);
        setLog([]);
        setResult(null);
        const api = (window as any).api;
        const unsub = api?.onInstallProgress?.((d: any) => {
            setLog(prev => [...prev, d.text]);
        });
        try {
            let cmd = INSTALL_CMDS[selected];
            if (selected === 'pip') {
                const res = await api.checkBinaries(['pip3']);
                if (res?.pip3) cmd = 'pip3 install nql';
            }
            const r = await api?.runInstallCommand?.(cmd);
            if (r?.error) {
                setResult({ ok: false, msg: r.error });
            } else if (r?.exitCode === 0) {
                setResult({ ok: true, msg: 'Installed successfully.' });
                await check();
                onInstalled?.();
            } else {
                setResult({ ok: false, msg: `Exit ${r?.exitCode}${r?.stderr ? ': ' + r.stderr.slice(0, 300) : ''}` });
            }
        } catch (e: any) {
            setResult({ ok: false, msg: e?.message || 'failed' });
        } finally {
            unsub?.();
            setInstalling(false);
        }
    }, [selected, check, onInstalled]);

    if (nqlPresent === null) return null;
    if (nqlPresent) {
        if (compact) return null;
        return (
            <div className="flex items-center gap-2 text-xs text-green-400">
                <Check size={12} /> nql is installed
            </div>
        );
    }

    if (availableManagers.length === 0) {
        return (
            <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-xs text-yellow-200 flex items-start gap-2">
                <AlertCircle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                    <div className="font-medium">nql not found, and no supported installer on PATH.</div>
                    <div className="text-yellow-300/80 mt-1">Install one of: <code className="bg-black/30 px-1 rounded">brew</code>, <code className="bg-black/30 px-1 rounded">cargo</code>, or <code className="bg-black/30 px-1 rounded">pip</code> — then reload this pane.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 bg-blue-900/15 border border-blue-500/30 rounded space-y-2">
            <div className="flex items-start gap-2">
                <Download size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-gray-200">
                    <div className="font-medium">nql (Rust NQL runner) is not installed.</div>
                    <div className="text-gray-400 mt-0.5">Pick a package manager to install it:</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {availableManagers.map(m => (
                    <button
                        key={m}
                        onClick={() => setSelected(m)}
                        disabled={installing}
                        className={`px-2 py-1 rounded text-[10px] font-mono ${selected === m ? 'bg-blue-600 text-white' : 'theme-bg-tertiary text-gray-300 hover:bg-gray-600'} disabled:opacity-50`}
                    >
                        {m}
                    </button>
                ))}
                <code className="text-[10px] text-gray-400 font-mono ml-2 truncate">{selected ? INSTALL_CMDS[selected] : ''}</code>
                <button
                    onClick={install}
                    disabled={!selected || installing}
                    className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] flex items-center gap-1 disabled:opacity-50"
                >
                    {installing ? <><Loader2 size={10} className="animate-spin" /> Installing…</> : <><Download size={10} /> Install</>}
                </button>
            </div>
            {log.length > 0 && (
                <pre className="text-[10px] font-mono text-gray-300 whitespace-pre-wrap bg-black/40 rounded p-2 max-h-40 overflow-y-auto">
                    {log.join('')}
                    <div ref={logEndRef} />
                </pre>
            )}
            {result && (
                <div className={`text-[10px] ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.msg}</div>
            )}
        </div>
    );
};

export default NqlInstallPrompt;
