import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Loader, Brain, Zap, Moon, Sparkles, CheckCircle, AlertTriangle, Terminal, FolderOpen, Search, Plus, X } from 'lucide-react';

interface StoreInfo {
    path: string;
    directory: string;
    memoryCount: number;
    knowledgeCount: number;
    conceptCount: number;
    linkCount: number;
    lastExtractedAt: string | null;
    lastEvolvedAt: string | null;
}

interface LogEntry {
    jobId: string;
    kind: string;
    message: string;
    data?: any;
    timestamp: number;
}

type StepType = 'create' | 'assimilate' | 'sleep' | 'dream';

interface KgPipelinePanelProps {
    currentPath?: string;
}

const STEPS: { id: StepType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
    { id: 'create', label: 'Create', icon: <Sparkles size={16} />, color: 'blue', desc: 'Build a fresh KG from store memories' },
    { id: 'assimilate', label: 'Assimilate', icon: <Zap size={16} />, color: 'green', desc: 'Extract new files and merge into existing KG' },
    { id: 'sleep', label: 'Sleep', icon: <Moon size={16} />, color: 'purple', desc: 'Refine, prune, and deepen the existing KG' },
    { id: 'dream', label: 'Dream', icon: <Brain size={16} />, color: 'amber', desc: 'Creative synthesis from random concept seeds' },
];

const KgPipelinePanel: React.FC<KgPipelinePanelProps> = ({ currentPath }) => {
    const [step, setStep] = useState<StepType>('assimilate');
    const [stores, setStores] = useState<StoreInfo[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [modelProvider, setModelProvider] = useState('ollama|kimi-k2.6:cloud');
    const [customModel, setCustomModel] = useState('');
    const [customProvider, setCustomProvider] = useState('');
    const [context, setContext] = useState('');
    const [numSeeds, setNumSeeds] = useState(3);
    const [sleepOps, setSleepOps] = useState<string[]>(['prune', 'deepen']);
    const [contentText, setContentText] = useState('');
    const [running, setRunning] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [scanPath, setScanPath] = useState(currentPath || '');
    const [addPath, setAddPath] = useState('');
    const logEndRef = useRef<HTMLDivElement>(null);

    const activeStep = STEPS.find((s) => s.id === step)!;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await (window as any).api?.scanKnowledgeStores?.();
                if (cancelled) return;
                const list = (r?.stores || []) as StoreInfo[];
                setStores(list);
                setSelectedPaths(new Set(list.map((s) => s.directory)));
            } catch {}
            try {
                const ctx = await (window as any).api?.getProjectCtx?.(currentPath);
                if (ctx?.model && ctx?.provider) {
                    const key = `${ctx.provider}|${ctx.model}`;
                    setModelProvider(key);
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [currentPath]);

    useEffect(() => {
        const unsub = (window as any).api?.onKgPipelineLog?.((entry: LogEntry) => {
            setLogs((prev) => [...prev, entry]);
        });
        return unsub || (() => {});
    }, []);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [logs]);

    const toggleStore = (dir: string) => {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(dir)) next.delete(dir);
            else next.add(dir);
            return next;
        });
    };

    const handleRun = useCallback(async () => {
        if (selectedPaths.size === 0) {
            setError('Select at least one knowledge store.');
            return;
        }
        setError(null);
        setLogs([]);
        setRunning(true);
        const [mpProvider, mpModel] = modelProvider === 'custom'
            ? [customProvider, customModel]
            : modelProvider.split('|');
        try {
            const res = await (window as any).api?.kgPipelineRun?.({
                step,
                storePaths: Array.from(selectedPaths),
                model: mpModel || undefined,
                provider: mpProvider || undefined,
                context,
                contentText: step === 'create' ? contentText || undefined : undefined,
                operations: step === 'sleep' ? sleepOps : undefined,
                numSeeds: step === 'dream' ? numSeeds : undefined,
            });
            if (res?.error) {
                setError(res.error);
                setRunning(false);
                return;
            }
            setJobId(res?.jobId || null);
        } catch (err: any) {
            setError(err?.message || String(err));
            setRunning(false);
        }
    }, [step, selectedPaths, modelProvider, customModel, customProvider, context, contentText, sleepOps, numSeeds, currentPath]);

    const handleAbort = useCallback(async () => {
        if (!jobId) return;
        try {
            await (window as any).api?.kgPipelineAbort?.(jobId);
        } catch {}
        setRunning(false);
    }, [jobId]);

    const handleScan = useCallback(async () => {
        if (!scanPath.trim()) return;
        try {
            await (window as any).api?.kgScanAndRegister?.(scanPath.trim());
            const r = await (window as any).api?.scanKnowledgeStores?.();
            const list = (r?.stores || []) as StoreInfo[];
            setStores(list);
            setSelectedPaths(new Set(list.map((s) => s.directory)));
        } catch (err: any) {
            setError(err?.message || String(err));
        }
    }, [scanPath]);

    const handleAdd = useCallback(async () => {
        if (!addPath.trim()) return;
        try {
            await (window as any).api?.kgRegisterStore?.(addPath.trim());
            setAddPath('');
            const r = await (window as any).api?.scanKnowledgeStores?.();
            const list = (r?.stores || []) as StoreInfo[];
            setStores(list);
            setSelectedPaths(new Set(list.map((s) => s.directory)));
        } catch (err: any) {
            setError(err?.message || String(err));
        }
    }, [addPath]);

    const handleRemove = useCallback(async (dir: string) => {
        try {
            await (window as any).api?.kgUnregisterStore?.(dir);
            const r = await (window as any).api?.scanKnowledgeStores?.();
            const list = (r?.stores || []) as StoreInfo[];
            setStores(list);
            setSelectedPaths((prev) => {
                const next = new Set(prev);
                next.delete(dir);
                return next;
            });
        } catch (err: any) {
            setError(err?.message || String(err));
        }
    }, []);

    useEffect(() => {
        if (!running) return;
        if (logs.length === 0) return;
        const last = logs[logs.length - 1];
        if (last?.kind === 'done' || last?.kind === 'error') {
            setRunning(false);
        }
    }, [logs, running]);

    const getLogColor = (kind: string) => {
        if (kind === 'error' || kind === 'stderr') return 'text-red-400';
        if (kind === 'warn') return 'text-amber-400';
        if (kind === 'done' || kind === 'finish') return 'text-green-400';
        if (kind === 'start') return 'text-blue-400';
        return 'text-gray-300';
    };

    return (
        <div className="flex flex-col gap-3 p-3 border-b theme-border bg-gray-950/60">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold theme-text-primary flex items-center gap-1.5">
                    <Terminal size={13} className="text-green-400" />
                    KG Pipeline
                </h4>
                <span className="text-[10px] theme-text-muted">
                    {stores.length} store{stores.length !== 1 ? 's' : ''} · {selectedPaths.size} selected
                </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {STEPS.map((s) => {
                    const active = step === s.id;
                    const colorMap: Record<string, string> = {
                        blue: active ? 'bg-blue-600/25 border-blue-500/50 text-blue-300' : 'hover:bg-blue-600/10 border-gray-700/50',
                        green: active ? 'bg-green-600/25 border-green-500/50 text-green-300' : 'hover:bg-green-600/10 border-gray-700/50',
                        purple: active ? 'bg-purple-600/25 border-purple-500/50 text-purple-300' : 'hover:bg-purple-600/10 border-gray-700/50',
                        amber: active ? 'bg-amber-600/25 border-amber-500/50 text-amber-300' : 'hover:bg-amber-600/10 border-gray-700/50',
                    };
                    return (
                        <button
                            key={s.id}
                            onClick={() => setStep(s.id)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-md border transition-all ${colorMap[s.color]}`}
                            title={s.desc}
                        >
                            <span className={active ? '' : 'theme-text-muted'}>{s.icon}</span>
                            <span className={`text-[10px] font-semibold ${active ? '' : 'theme-text-muted'}`}>{s.label}</span>
                        </button>
                    );
                })}
            </div>
            <p className="text-[10px] theme-text-muted -mt-1">{activeStep.desc}</p>

            <div className="space-y-2 border border-gray-700/50 rounded bg-gray-900/30 p-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold theme-text-primary flex items-center gap-1">
                        <FolderOpen size={11} /> Registered Stores
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSelectedPaths(new Set(stores.map((s) => s.directory)))}
                            className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 theme-text-muted border border-gray-700/50"
                        >
                            Select All
                        </button>
                        <button
                            onClick={() => setSelectedPaths(new Set())}
                            className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 theme-text-muted border border-gray-700/50"
                        >
                            Deselect All
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {stores.map((store) => {
                        const checked = selectedPaths.has(store.directory);
                        return (
                            <div
                                key={store.path}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[10px] transition-colors ${
                                    checked
                                        ? 'bg-green-900/15 border-green-700/30 text-green-300'
                                        : 'bg-gray-800/30 border-gray-700/30 theme-text-muted'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleStore(store.directory)}
                                    className="accent-green-500 flex-shrink-0 cursor-pointer"
                                />
                                <span className="flex-1 font-mono break-all text-left leading-tight" title={store.directory}>
                                    {store.directory}
                                </span>
                                <span className="opacity-50 text-[9px] whitespace-nowrap flex-shrink-0">
                                    M{store.memoryCount} C{store.conceptCount} L{store.linkCount}
                                </span>
                                <button
                                    onClick={() => handleRemove(store.directory)}
                                    className="px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-800/50 text-[9px] font-semibold flex-shrink-0"
                                >
                                    Delete
                                </button>
                            </div>
                        );
                    })}
                    {stores.length === 0 && (
                        <span className="text-[10px] theme-text-muted italic py-2">No stores registered. Add or scan below.</span>
                    )}
                </div>

                <div className="flex items-center gap-1 pt-1 border-t border-gray-700/30">
                    <input
                        type="text"
                        value={addPath}
                        onChange={(e) => setAddPath(e.target.value)}
                        placeholder="Absolute directory path to register..."
                        className="flex-1 px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-green-500 font-mono"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={!addPath.trim()}
                        className="px-3 py-1 text-[11px] bg-green-600 hover:bg-green-500 text-white rounded flex items-center gap-1 disabled:opacity-40 font-semibold"
                    >
                        <Plus size={11} /> Add Store
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={scanPath}
                        onChange={(e) => setScanPath(e.target.value)}
                        placeholder="Root path to scan for .knowledge.yaml files..."
                        className="flex-1 px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                        onClick={handleScan}
                        disabled={!scanPath.trim()}
                        className="px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1 disabled:opacity-40"
                    >
                        <Search size={11} /> Scan &amp; Register
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
                <select
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value)}
                    className="px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-green-500"
                >
                    <optgroup label="Ollama">
                        <option value="ollama|kimi-k2.6:cloud">kimi-k2.6:cloud</option>
                        <option value="ollama|qwen2.5:14b">qwen2.5:14b</option>
                        <option value="ollama|deepseek-r1:8b">deepseek-r1:8b</option>
                        <option value="ollama|llama3.2">llama3.2</option>
                    </optgroup>
                    <optgroup label="OpenAI">
                        <option value="openai|gpt-4o">gpt-4o</option>
                        <option value="openai|gpt-4o-mini">gpt-4o-mini</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                        <option value="anthropic|claude-sonnet-4-6">claude-sonnet-4-6</option>
                        <option value="anthropic|claude-opus-4-8">claude-opus-4-8</option>
                    </optgroup>
                    <option value="custom">Custom...</option>
                </select>
                {modelProvider === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            value={customProvider}
                            onChange={(e) => setCustomProvider(e.target.value)}
                            placeholder="Provider"
                            className="px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-green-500"
                        />
                        <input
                            type="text"
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            placeholder="Model"
                            className="px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-green-500"
                        />
                    </div>
                )}
                <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Context / guidance"
                    rows={3}
                    className="px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded resize-y focus:outline-none focus:border-green-500 placeholder-gray-600"
                />
                {step === 'dream' && (
                    <div className="col-span-2 flex items-center gap-2 text-[11px] theme-text-muted">
                        Seeds
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={numSeeds}
                            onChange={(e) => setNumSeeds(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                            className="w-16 px-2 py-1 bg-gray-800 text-white border border-gray-700 rounded font-mono"
                        />
                    </div>
                )}
                {step === 'sleep' && (
                    <div className="col-span-2 flex items-center gap-3 text-[11px] theme-text-muted">
                        {(['prune', 'deepen'] as const).map((op) => (
                            <label key={op} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sleepOps.includes(op)}
                                    onChange={() =>
                                        setSleepOps((prev) =>
                                            prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]
                                        )
                                    }
                                    className="accent-green-500"
                                />
                                <span className="capitalize">{op}</span>
                            </label>
                        ))}
                    </div>
                )}
                {step === 'create' && (
                    <textarea
                        value={contentText}
                        onChange={(e) => setContentText(e.target.value)}
                        placeholder="Optional extra content text..."
                        rows={2}
                        className="col-span-2 px-2 py-1 text-[11px] bg-gray-800 text-white border border-gray-700 rounded resize-none placeholder-gray-600"
                    />
                )}
            </div>

            <div className="flex items-center gap-2">
                {running ? (
                    <button
                        onClick={handleAbort}
                        className="flex-1 px-3 py-1.5 text-[11px] bg-red-600 hover:bg-red-500 text-white rounded flex items-center justify-center gap-1.5"
                    >
                        <Square size={12} /> Abort
                    </button>
                ) : (
                    <button
                        onClick={handleRun}
                        disabled={selectedPaths.size === 0}
                        className="flex-1 px-3 py-1.5 text-[11px] bg-green-600 hover:bg-green-500 text-white rounded flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                        <Play size={12} /> Run {activeStep.label}
                    </button>
                )}
            </div>

            {error && (
                <div className="text-[11px] text-red-400 flex items-center gap-1 bg-red-900/20 p-2 rounded">
                    <AlertTriangle size={11} /> {error}
                </div>
            )}

            {logs.length > 0 && (
                <div className="border border-gray-700 rounded bg-black/50 p-2 space-y-1 max-h-60 overflow-y-auto font-mono text-[10px]">
                    {logs.map((entry, i) => (
                        <div key={i} className={`flex items-start gap-2 ${getLogColor(entry.kind)}`}>
                            <span className="text-gray-500 flex-shrink-0">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
                            <span className="break-words whitespace-pre-wrap">{entry.message}</span>
                            {entry.data && entry.data.exitCode !== undefined && entry.data.exitCode !== 0 ? (
                                <span className="text-red-500">(exit {entry.data.exitCode})</span>
                            ) : null}
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            )}
        </div>
    );
};

export default KgPipelinePanel;
