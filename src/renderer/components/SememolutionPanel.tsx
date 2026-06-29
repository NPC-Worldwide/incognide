import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RefreshCw, Trash2, Play, X, Loader2, Dna, Save, Cpu, Lock, Power } from 'lucide-react';
import KgIcon from './icons/KgIcon';

const MIN_KG_SIZE_FOR_SEMEMOLUTION = 100;

interface Genome {
    lambda_depth: number;
    lambda_breadth: number;
    similarity_threshold: number;
    sleep_ops: string[];
    dream_seeds: number;
    dream_probability: number;
    get_concepts: boolean;
    link_facts_facts: boolean;
    link_concepts_facts: boolean;
    link_concepts_concepts: boolean;
}

interface Individual {
    individual_id: string;
    fitness: number;
    wins: number;
    total_queries: number;
    facts: number;
    concepts: number;
    generation: number;
    genome: Genome;
}

interface PopulationSummary {
    id: string;
    name: string;
    model?: string | null;
    provider?: string | null;
    sample_size: number;
    individual_count: number;
    avg_fitness: number;
    max_fitness: number;
    created_at?: string;
    updated_at?: string;
}

interface PopulationDetail {
    id: string;
    model?: string;
    provider?: string;
    sample_size: number;
    stats: any;
    individuals: Individual[];
}

const SLEEP_OP_CHOICES = ['prune', 'deepen', 'abstract_link', 'link_facts'];

const fmt = (n: number, d = 3) => (typeof n === 'number' && !isNaN(n) ? n.toFixed(d) : '—');

const GenomeEditor: React.FC<{
    value: Genome;
    onChange: (g: Genome) => void;
    onSave?: () => void;
    dirty?: boolean;
    saving?: boolean;
}> = ({ value, onChange, onSave, dirty, saving }) => {
    const set = <K extends keyof Genome>(k: K, v: Genome[K]) => onChange({ ...value, [k]: v });
    return (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
            <label className="flex flex-col gap-0.5">
                <span className="theme-text-muted">λ depth (poisson)</span>
                <input type="number" step="0.1" min="0.1" max="10" value={value.lambda_depth}
                    onChange={e => set('lambda_depth', parseFloat(e.target.value))}
                    className="px-2 py-1 theme-bg-primary border theme-border rounded font-mono" />
            </label>
            <label className="flex flex-col gap-0.5">
                <span className="theme-text-muted">λ breadth (poisson)</span>
                <input type="number" step="0.5" min="1" max="50" value={value.lambda_breadth}
                    onChange={e => set('lambda_breadth', parseFloat(e.target.value))}
                    className="px-2 py-1 theme-bg-primary border theme-border rounded font-mono" />
            </label>
            <label className="flex flex-col gap-0.5">
                <span className="theme-text-muted">similarity threshold</span>
                <input type="number" step="0.05" min="0" max="1" value={value.similarity_threshold}
                    onChange={e => set('similarity_threshold', parseFloat(e.target.value))}
                    className="px-2 py-1 theme-bg-primary border theme-border rounded font-mono" />
            </label>
            <label className="flex flex-col gap-0.5">
                <span className="theme-text-muted">dream seeds</span>
                <input type="number" min="1" max="20" value={value.dream_seeds}
                    onChange={e => set('dream_seeds', parseInt(e.target.value, 10))}
                    className="px-2 py-1 theme-bg-primary border theme-border rounded font-mono" />
            </label>
            <label className="flex flex-col gap-0.5">
                <span className="theme-text-muted">dream probability</span>
                <input type="number" step="0.05" min="0" max="1" value={value.dream_probability}
                    onChange={e => set('dream_probability', parseFloat(e.target.value))}
                    className="px-2 py-1 theme-bg-primary border theme-border rounded font-mono" />
            </label>
            <div className="flex flex-col gap-0.5">
                <span className="theme-text-muted">sleep ops</span>
                <div className="flex flex-wrap gap-1">
                    {SLEEP_OP_CHOICES.map(op => {
                        const on = value.sleep_ops.includes(op);
                        return (
                            <button key={op}
                                onClick={() => set('sleep_ops', on ? value.sleep_ops.filter(x => x !== op) : [...value.sleep_ops, op])}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${on ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50' : 'theme-bg-tertiary text-gray-400 theme-border hover:opacity-80'}`}>
                                {op}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="col-span-2 flex flex-wrap gap-2 items-center">
                {[
                    ['get_concepts', 'concepts'],
                    ['link_facts_facts', 'f↔f links'],
                    ['link_concepts_facts', 'c↔f links'],
                    ['link_concepts_concepts', 'c↔c links'],
                ].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={value[k as keyof Genome] as boolean}
                            onChange={e => set(k as keyof Genome, e.target.checked as any)} />
                        {label}
                    </label>
                ))}
                {onSave && (
                    <button onClick={onSave} disabled={!dirty || saving}
                        className="ml-auto px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[10px] flex items-center gap-1">
                        {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save genome
                    </button>
                )}
            </div>
        </div>
    );
};

const SememolutionPanel: React.FC = () => {
    const api = (window as any).api;
    const [enabled, setEnabled] = useState<boolean>(() => {
        try { return localStorage.getItem('incognide_sememolution_enabled') === '1'; } catch { return false; }
    });
    const [kgSize, setKgSize] = useState<{ facts: number; concepts: number } | null>(null);
    const [populations, setPopulations] = useState<PopulationSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<PopulationDetail | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const fetchKgSize = useCallback(async () => {
        try {
            const g = await api?.kg_getGraphData?.({ generation: null });
            const nodes = g?.graph?.nodes || [];
            const facts = nodes.filter((n: any) => n.type === 'fact').length;
            const concepts = nodes.filter((n: any) => n.type === 'concept').length;
            setKgSize({ facts, concepts });
        } catch {}
    }, [api]);
    useEffect(() => { fetchKgSize(); }, [fetchKgSize]);

    const totalNodes = (kgSize?.facts ?? 0) + (kgSize?.concepts ?? 0);
    const eligible = totalNodes >= MIN_KG_SIZE_FOR_SEMEMOLUTION;

    const toggleEnabled = () => {
        if (!eligible && !enabled) return;
        const next = !enabled;
        setEnabled(next);
        try { localStorage.setItem('incognide_sememolution_enabled', next ? '1' : '0'); } catch {}
    };
    const [newName, setNewName] = useState('');
    const [newSize, setNewSize] = useState(20);
    const [newSampleSize, setNewSampleSize] = useState(10);
    const [newModel, setNewModel] = useState('');
    const [newProvider, setNewProvider] = useState('ollama');
    const [seedFromKg, setSeedFromKg] = useState(true);
    const [creating, setCreating] = useState(false);

    const [openIndividualId, setOpenIndividualId] = useState<string | null>(null);
    const [genomeDrafts, setGenomeDrafts] = useState<Record<string, Genome>>({});
    const [savingGenome, setSavingGenome] = useState<string | null>(null);
    const [evolving, setEvolving] = useState(false);

    const [queryText, setQueryText] = useState('');
    const [querying, setQuerying] = useState(false);
    const [queryResult, setQueryResult] = useState<any>(null);

    const fetchList = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await api?.kg_population_list?.();
            if (r?.error) setError(r.error);
            else setPopulations(r?.populations || []);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [api]);

    const fetchDetail = useCallback(async (id: string) => {
        try {
            const r = await api?.kg_population_get?.(id);
            if (r?.error) { setError(r.error); return; }
            setDetail(r);
        } catch (e: any) { setError(e.message); }
    }, [api]);

    useEffect(() => { fetchList(); }, [fetchList]);
    useEffect(() => { if (selectedId) fetchDetail(selectedId); else setDetail(null); }, [selectedId, fetchDetail]);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true); setError(null);
        try {
            const payload: any = {
                name: newName.trim(),
                population_size: newSize,
                sample_size: newSampleSize,
                seed_from_kg: seedFromKg,
                provider: newProvider.trim() || 'ollama',
            };
            if (newModel.trim()) payload.model = newModel.trim();
            const r = await api?.kg_population_create?.(payload);
            if (r?.error) { setError(r.error); }
            else {
                setShowCreate(false);
                setNewName('');
                await fetchList();
                setSelectedId(r.id);
            }
        } catch (e: any) { setError(e.message); }
        finally { setCreating(false); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(`Delete population "${id}"? This removes all individuals and their sub-KGs.`)) return;
        try {
            await api?.kg_population_delete?.(id);
            if (selectedId === id) setSelectedId(null);
            await fetchList();
        } catch (e: any) { setError(e.message); }
    };

    const handleEvolve = async () => {
        if (!selectedId) return;
        setEvolving(true); setError(null);
        try {
            const r = await api?.kg_population_evolve?.(selectedId);
            if (r?.error) setError(r.error);
            await fetchDetail(selectedId);
        } catch (e: any) { setError(e.message); }
        finally { setEvolving(false); }
    };

    const handleGenomeSave = async (individualId: string) => {
        if (!selectedId) return;
        const g = genomeDrafts[individualId];
        if (!g) return;
        setSavingGenome(individualId);
        try {
            await api?.kg_individual_updateGenome?.({ populationId: selectedId, individualId, genome: g });
            setGenomeDrafts(prev => { const n = { ...prev }; delete n[individualId]; return n; });
            await fetchDetail(selectedId);
        } catch (e: any) { setError(e.message); }
        finally { setSavingGenome(null); }
    };

    const handleQuery = async () => {
        if (!selectedId || !queryText.trim()) return;
        setQuerying(true); setQueryResult(null); setError(null);
        try {
            const r = await api?.kg_query?.({
                question: queryText.trim(),
                mode: 'sememolution',
                population_id: selectedId,
            });
            if (r?.error) setError(r.error);
            else setQueryResult(r);
            await fetchDetail(selectedId);
        } catch (e: any) { setError(e.message); }
        finally { setQuerying(false); }
    };

    const header = (
        <div className="px-4 py-2 border-b theme-border flex items-center gap-3">
            <Dna size={14} className="text-pink-400" />
            <h3 className="text-sm font-semibold">Sememolution</h3>
            <span className="text-[10px] theme-text-muted">
                KG size: <span className="font-mono theme-text-primary">{totalNodes}</span> / {MIN_KG_SIZE_FOR_SEMEMOLUTION}
                {kgSize && <> <span className="opacity-60">({kgSize.facts}f · {kgSize.concepts}c)</span></>}
            </span>
            <button
                onClick={toggleEnabled}
                disabled={!eligible && !enabled}
                className={`ml-auto px-2 py-1 text-[11px] rounded flex items-center gap-1 border theme-border ${
                    enabled ? 'bg-green-600/30 text-green-300 border-green-500/50'
                    : eligible ? 'theme-bg-tertiary text-gray-300 hover:opacity-80'
                    : 'theme-bg-tertiary text-gray-600 cursor-not-allowed'
                }`}
                title={!eligible && !enabled ? `Need ${MIN_KG_SIZE_FOR_SEMEMOLUTION} nodes; have ${totalNodes}` : ''}
            >
                {enabled ? <Power size={11} /> : <Lock size={11} />}
                {enabled ? 'Sememolution ON' : eligible ? 'Enable Sememolution' : 'Locked'}
            </button>
        </div>
    );

    if (!enabled) {
        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                {header}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-md text-center space-y-3">
                        {!eligible ? (<>
                            <Lock size={32} className="mx-auto theme-text-muted" />
                            <h4 className="text-sm font-semibold">Sememolution is locked</h4>
                            <p className="text-xs theme-text-muted">
                                Build your knowledge graph to at least {MIN_KG_SIZE_FOR_SEMEMOLUTION} facts + concepts before enabling population-based Sememolution.
                            </p>
                            <div className="flex items-center gap-2 justify-center text-xs theme-text-muted">
                                <span className="font-mono">{totalNodes}</span>
                                <div className="w-48 h-2 bg-gray-700 rounded overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500" style={{ width: `${Math.min(100, (totalNodes / MIN_KG_SIZE_FOR_SEMEMOLUTION) * 100)}%` }} />
                                </div>
                                <span className="font-mono">{MIN_KG_SIZE_FOR_SEMEMOLUTION}</span>
                            </div>
                            <button onClick={fetchKgSize} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto">
                                <RefreshCw size={10} /> Re-check
                            </button>
                        </>) : (<>
                            <Dna size={32} className="mx-auto text-pink-400" />
                            <h4 className="text-sm font-semibold">Sememolution is available</h4>
                            <p className="text-xs theme-text-muted">
                                Your KG has {totalNodes} nodes — enough to spawn diverse individuals. Toggle Sememolution ON to start managing populations. You can turn it off any time and go back to the main graph without losing anything.
                            </p>
                        </>)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {header}
            <div className="flex-1 overflow-hidden flex">
            <div className="w-64 border-r theme-border flex flex-col flex-shrink-0">
                <div className="flex items-center justify-between px-3 py-2 border-b theme-border">
                    <div className="flex items-center gap-1.5">
                        <Dna size={14} className="text-pink-400" />
                        <h3 className="text-xs font-semibold">Populations</h3>
                        <span className="text-[10px] theme-text-muted">({populations.length})</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={fetchList} className="p-1 theme-text-muted hover:theme-text-primary rounded" title="Refresh">
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => setShowCreate(v => !v)} className="p-1 text-blue-400 hover:text-blue-300 rounded" title="New population">
                            <Plus size={12} />
                        </button>
                    </div>
                </div>
                {showCreate && (
                    <div className="p-2 border-b theme-border space-y-1 bg-blue-900/10">
                        <input type="text" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
                            className="w-full px-2 py-1 text-[11px] theme-bg-primary border theme-border rounded" />
                        <div className="grid grid-cols-2 gap-1">
                            <label className="text-[10px] theme-text-muted">size
                                <input type="number" min="2" max="200" value={newSize} onChange={e => setNewSize(parseInt(e.target.value, 10))}
                                    className="w-full mt-0.5 px-1.5 py-0.5 text-[11px] theme-bg-primary border theme-border rounded font-mono" />
                            </label>
                            <label className="text-[10px] theme-text-muted">sample
                                <input type="number" min="1" max="50" value={newSampleSize} onChange={e => setNewSampleSize(parseInt(e.target.value, 10))}
                                    className="w-full mt-0.5 px-1.5 py-0.5 text-[11px] theme-bg-primary border theme-border rounded font-mono" />
                            </label>
                        </div>
                        <input type="text" placeholder="model (blank = backend default)" value={newModel} onChange={e => setNewModel(e.target.value)}
                            className="w-full px-2 py-1 text-[11px] theme-bg-primary border theme-border rounded font-mono" />
                        <input type="text" placeholder="provider" value={newProvider} onChange={e => setNewProvider(e.target.value)}
                            className="w-full px-2 py-1 text-[11px] theme-bg-primary border theme-border rounded font-mono" />
                        <label className="flex items-center gap-1 text-[10px] theme-text-muted">
                            <input type="checkbox" checked={seedFromKg} onChange={e => setSeedFromKg(e.target.checked)} />
                            seed each individual with current KG
                        </label>
                        <div className="flex gap-1">
                            <button onClick={handleCreate} disabled={creating || !newName.trim()}
                                className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[11px] flex items-center justify-center gap-1">
                                {creating ? <><Loader2 size={10} className="animate-spin" /> Creating…</> : <><Plus size={10} /> Create</>}
                            </button>
                            <button onClick={() => setShowCreate(false)} className="px-2 py-1 theme-bg-tertiary rounded text-[11px]">Cancel</button>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto">
                    {populations.length === 0 && !loading && (
                        <div className="p-3 text-[11px] theme-text-muted italic">No populations. Create one to start.</div>
                    )}
                    {populations.map(p => (
                        <button key={p.id} onClick={() => setSelectedId(p.id)}
                            className={`w-full text-left px-3 py-2 border-b theme-border hover:theme-bg-hover transition-colors ${selectedId === p.id ? 'bg-blue-900/30' : ''}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium truncate">{p.name}</span>
                                <span className="text-[10px] theme-text-muted">{p.individual_count}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] theme-text-muted mt-0.5">
                                <span>avg fit: {fmt(p.avg_fitness)}</span>
                                <span>max: {fmt(p.max_fitness)}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                {!selectedId && (
                    <div className="flex-1 flex items-center justify-center theme-text-muted text-sm italic">
                        Select or create a population
                    </div>
                )}
                {selectedId && detail && (
                    <>
                        <div className="px-4 py-2 border-b theme-border flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Dna size={14} className="text-pink-400" />
                                <h3 className="text-sm font-semibold font-mono">{detail.id}</h3>
                                <span className="text-[10px] theme-text-muted font-mono">
                                    {detail.model || '?'} · {detail.provider || '?'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button onClick={handleEvolve} disabled={evolving}
                                    className="px-2 py-1 text-[11px] bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded flex items-center gap-1">
                                    {evolving ? <Loader2 size={10} className="animate-spin" /> : <Dna size={10} />}
                                    Evolve 1 gen
                                </button>
                                <button onClick={() => handleDelete(selectedId)} className="px-2 py-1 text-[11px] bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded flex items-center gap-1">
                                    <Trash2 size={10} /> Delete
                                </button>
                            </div>
                        </div>

                        <div className="px-4 py-1.5 border-b theme-border flex items-center gap-4 text-[11px] theme-text-muted">
                            <span>individuals: <span className="theme-text-primary font-mono">{detail.stats?.total}</span></span>
                            <span>avg fit: <span className="theme-text-primary font-mono">{fmt(detail.stats?.avg_fitness)}</span></span>
                            <span>max fit: <span className="theme-text-primary font-mono">{fmt(detail.stats?.max_fitness)}</span></span>
                            <span>total facts: <span className="theme-text-primary font-mono">{detail.stats?.total_facts}</span></span>
                            <span>λdepth μ: <span className="theme-text-primary font-mono">{fmt(detail.stats?.lambda_depth?.mean, 2)}</span></span>
                            <span>λbreadth μ: <span className="theme-text-primary font-mono">{fmt(detail.stats?.lambda_breadth?.mean, 2)}</span></span>
                        </div>

                        <div className="px-4 py-2 border-b theme-border">
                            <div className="flex items-center gap-2">
                                <input type="text" value={queryText} onChange={e => setQueryText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleQuery(); }}
                                    placeholder="Ask the population…"
                                    className="flex-1 px-2 py-1 text-xs theme-bg-primary border theme-border rounded" />
                                <button onClick={handleQuery} disabled={querying || !queryText.trim()}
                                    className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded flex items-center gap-1">
                                    {querying ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                    Query
                                </button>
                            </div>
                            {queryResult?.candidates && (
                                <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                                    {queryResult.candidates.map((c: any) => (
                                        <div key={c.individual_id} className="p-1.5 theme-bg-primary border theme-border rounded text-[11px]">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="font-mono text-pink-400">#{c.rank}</span>
                                                <span className="font-mono text-[10px] theme-text-muted truncate">{c.individual_id}</span>
                                                <span className="text-[10px] theme-text-muted ml-auto">facts: {c.n_facts}</span>
                                            </div>
                                            <div className="theme-text-primary whitespace-pre-wrap">{c.response}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {detail.individuals.map(ind => {
                                const draft = genomeDrafts[ind.individual_id];
                                const g = draft || ind.genome;
                                const isOpen = openIndividualId === ind.individual_id;
                                const fitPct = Math.min(100, (ind.fitness || 0) * 100);
                                return (
                                    <div key={ind.individual_id} className="border-b theme-border">
                                        <button onClick={() => setOpenIndividualId(isOpen ? null : ind.individual_id)}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:theme-bg-hover text-left">
                                            <KgIcon size={14} className="text-emerald-400 flex-shrink-0" />
                                            <span className="font-mono text-xs truncate flex-1">{ind.individual_id}</span>
                                            <span className="text-[10px] theme-text-muted">gen {ind.generation}</span>
                                            <span className="text-[10px] theme-text-muted">{ind.facts}f / {ind.concepts}c</span>
                                            <div className="w-24 flex items-center gap-1">
                                                <div className="flex-1 h-1.5 bg-gray-700 rounded overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500" style={{ width: `${fitPct}%` }} />
                                                </div>
                                                <span className="text-[10px] font-mono theme-text-muted w-10 text-right">{fmt(ind.fitness, 2)}</span>
                                            </div>
                                            <span className="text-[10px] theme-text-muted font-mono">{ind.wins}/{ind.total_queries}</span>
                                        </button>
                                        {isOpen && (
                                            <div className="px-4 py-2 bg-black/10">
                                                <GenomeEditor
                                                    value={g}
                                                    onChange={ng => setGenomeDrafts(prev => ({ ...prev, [ind.individual_id]: ng }))}
                                                    onSave={() => handleGenomeSave(ind.individual_id)}
                                                    dirty={!!draft}
                                                    saving={savingGenome === ind.individual_id}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {error && (
                    <div className="px-4 py-1.5 border-t theme-border text-xs text-red-400 bg-red-900/20 flex items-center gap-2">
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)} className="theme-text-muted hover:theme-text-primary"><X size={12} /></button>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
};

export default SememolutionPanel;
