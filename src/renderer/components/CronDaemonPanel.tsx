import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertCircle, X, Loader, Save, Play, Trash2, ChevronDown,
  ChevronUp, Clock, Plus, FileText, Terminal, Activity
} from 'lucide-react';
import SmokestackIcon from './icons/SmokestackIcon';

interface JobConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  payload: any;
  job_type: string;
  last_run_at?: string;
}

interface CronDaemonPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentPath?: string;
  npcList?: any[];
  jinxList?: any[];
  isPane?: boolean;
}

// ---------------------------------------------------------------------------
// Cron helpers
// ---------------------------------------------------------------------------
function parseCron(cron: string): { freq: string; minute: string; hour: string; dayOfWeek: string; dayOfMonth: string } {
  const parts = (cron || '* * * * *').trim().split(/\s+/);
  const [min = '*', hr = '*', dom = '*', mon = '*', dow = '*'] = parts;

  let freq = 'custom';

  if (min !== '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*') freq = 'hourly';
  else if (min !== '*' && hr !== '*' && dom === '*' && mon === '*' && dow === '*') freq = 'daily';
  else if (min !== '*' && hr !== '*' && dom === '*' && mon === '*' && dow !== '*') freq = 'weekly';
  else if (min !== '*' && hr !== '*' && dom !== '*' && mon === '*' && dow === '*') freq = 'monthly';

  return { freq, minute: min, hour: hr, dayOfWeek: dow, dayOfMonth: dom };
}

function buildCron(cfg: { freq: string; minute: string; hour: string; dayOfWeek: string; dayOfMonth: string }): string {
  const { freq, minute, hour, dayOfWeek, dayOfMonth } = cfg;
  switch (freq) {
    case 'hourly': return `${minute} * * * *`;
    case 'daily': return `${minute} ${hour} * * *`;
    case 'weekly': return `${minute} ${hour} * * ${dayOfWeek}`;
    case 'monthly': return `${minute} ${hour} ${dayOfMonth} * *`;
    default: return `${minute} ${hour} ${dayOfMonth} * ${dayOfWeek}`;
  }
}

function humanizeCron(cron: string): string {
  const { freq, minute, hour, dayOfWeek } = parseCron(cron);
  const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (freq) {
    case 'hourly': return `Every hour at :${String(minute).padStart(2, '0')}`;
    case 'daily': return `Daily at ${hm}`;
    case 'weekly': {
      const d = days[parseInt(dayOfWeek) % 7] || dayOfWeek;
      return `Every ${d} at ${hm}`;
    }
    case 'monthly': return `Monthly at ${hm}`;
    default: return cron;
  }
}

// ---------------------------------------------------------------------------
// Job form builders
// ---------------------------------------------------------------------------
interface JobFormProps {
  job: JobConfig;
  onChange: (patch: Partial<JobConfig>) => void;
}

const FinetuneForm: React.FC<JobFormProps & { npcList?: any[] }> = ({ job, onChange, npcList }) => {
  const p = job.payload || {};
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] theme-text-secondary block">Source</label>
          <select
            value={p.source || 'memories'}
            onChange={e => onChange({ payload: { ...p, source: e.target.value } })}
            className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
          >
            <option value="memories">Memories</option>
            <option value="knowledge">Knowledge</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] theme-text-secondary block">NPC</label>
          <input
            type="text"
            list="npc-suggestions"
            value={p.npc_name || ''}
            onChange={e => onChange({ payload: { ...p, npc_name: e.target.value } })}
            className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
            placeholder="all"
          />
          <datalist id="npc-suggestions">
            {(npcList || []).map((n: any) => (
              <option key={n.name} value={n.name} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] theme-text-secondary block">Base Model</label>
          <input
            type="text"
            value={p.base_model || ''}
            onChange={e => onChange({ payload: { ...p, base_model: e.target.value } })}
            className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
            placeholder="llama3"
          />
        </div>
        <div>
          <label className="text-[10px] theme-text-secondary block">Output Name</label>
          <input
            type="text"
            value={p.output_name || ''}
            onChange={e => onChange({ payload: { ...p, output_name: e.target.value } })}
            className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
            placeholder="my-finetuned-model"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] theme-text-secondary block">Instructions to Generate</label>
        <input
          type="number"
          min={1}
          max={10000}
          value={p.instruction_count ?? 100}
          onChange={e => onChange({ payload: { ...p, instruction_count: parseInt(e.target.value) || 0 } })}
          className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
        />
      </div>
    </div>
  );
};

const KGEvolutionForm: React.FC<JobFormProps & { currentPath?: string; discoveredStores?: any[] }> = ({ job, onChange, currentPath, discoveredStores }) => {
  const p = job.payload || {};
  const selections = p.store_selections || [];

  const toggleStore = (storePath: string) => {
    const next = selections.includes(storePath)
      ? selections.filter((s: string) => s !== storePath)
      : [...selections, storePath];
    onChange({ payload: { ...p, store_selections: next } });
  };

  return (
    <div className="space-y-2">
      {discoveredStores && discoveredStores.length > 0 && (
        <div className="border theme-border rounded p-2 space-y-1.5 max-h-52 overflow-y-auto">
          <div className="text-[10px] theme-text-secondary font-semibold flex items-center gap-1">
            <Activity size={10} className="text-green-400" />
            Discovered Knowledge Stores
          </div>
          {discoveredStores.map((store: any) => (
            <label key={store.path} className="flex flex-col cursor-pointer hover:bg-white/5 rounded px-1 py-0.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selections.includes(store.path)}
                  onChange={() => toggleStore(store.path)}
                  className="w-3 h-3"
                />
                <span className="text-[10px] theme-text-primary truncate flex-1" title={store.path}>{store.directory}</span>
                <span className="text-[10px] theme-text-muted tabular-nums">
                  {store.memoryCount}m / {store.knowledgeCount}k / {store.conceptCount}c
                </span>
              </div>
              {(store.lastExtractedAt || store.lastEvolvedAt) && (
                <div className="text-[9px] theme-text-muted pl-5 tabular-nums">
                  {store.lastExtractedAt && <span>extracted: {new Date(store.lastExtractedAt).toLocaleString()} · </span>}
                  {store.lastEvolvedAt && <span>evolved: {new Date(store.lastEvolvedAt).toLocaleString()}</span>}
                </div>
              )}
            </label>
          ))}
        </div>
      )}
      {!discoveredStores?.length && currentPath && (
        <div className="text-[10px] theme-text-muted italic">No .knowledge.yaml files found under {currentPath}</div>
      )}
      <div className="flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!p.extract_first}
            onChange={e => onChange({ payload: { ...p, extract_first: e.target.checked } })}
            className="w-3 h-3"
          />
          <span className="text-xs theme-text-secondary">Extract memories first</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!p.include_memories}
            onChange={e => onChange({ payload: { ...p, include_memories: e.target.checked } })}
            className="w-3 h-3"
          />
          <span className="text-xs theme-text-secondary">Include Memories</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!p.include_knowledge}
            onChange={e => onChange({ payload: { ...p, include_knowledge: e.target.checked } })}
            className="w-3 h-3"
          />
          <span className="text-xs theme-text-secondary">Include Knowledge</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!p.full_rebuild}
            onChange={e => onChange({ payload: { ...p, full_rebuild: e.target.checked } })}
            className="w-3 h-3"
          />
          <span className="text-xs theme-text-secondary">Full Rebuild</span>
        </label>
      </div>
    </div>
  );
};

const GenericJobForm: React.FC<JobFormProps & { npcList?: any[]; jinxList?: any[] }> = ({ job, onChange, npcList, jinxList }) => {
  const p = job.payload || {};
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] theme-text-secondary block">Command / Prompt</label>
        <textarea
          value={p.command || p.prompt || ''}
          onChange={e => onChange({ payload: { ...p, command: e.target.value } })}
          className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary font-mono min-h-[60px] resize-y"
          placeholder="Command to run or prompt to send..."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] theme-text-secondary block">NPC</label>
          <input
            type="text"
            list="npc-suggestions"
            value={p.npcName || p.npc || ''}
            onChange={e => onChange({ payload: { ...p, npcName: e.target.value } })}
            className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
            placeholder="none"
          />
          <datalist id="npc-suggestions">
            {(npcList || []).map((n: any) => (
              <option key={n.name} value={n.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-[10px] theme-text-secondary block">Jinx</label>
          <input
            type="text"
            list="jinx-suggestions"
            value={p.jinxName || p.jinx || ''}
            onChange={e => onChange({ payload: { ...p, jinxName: e.target.value } })}
            className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary"
            placeholder="none"
          />
          <datalist id="jinx-suggestions">
            {(jinxList || []).map((j: any) => (
              <option key={j.name || j.jinx_name} value={j.name || j.jinx_name} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
};

const ScheduleBuilder: React.FC<{ cron: string; onChange: (cron: string) => void }> = ({ cron, onChange }) => {
  const cfg = parseCron(cron);
  const set = (patch: Partial<typeof cfg>) => onChange(buildCron({ ...cfg, ...patch }));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <div className="w-28">
          <label className="text-[10px] theme-text-secondary block">Frequency</label>
          <select
            value={cfg.freq}
            onChange={e => set({ freq: e.target.value })}
            className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom (cron)</option>
          </select>
        </div>

        {cfg.freq !== 'custom' && (
          <>
            <div className="w-16">
              <label className="text-[10px] theme-text-secondary block">Hour</label>
              <select
                value={cfg.hour}
                onChange={e => set({ hour: e.target.value })}
                className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <div className="w-16">
              <label className="text-[10px] theme-text-secondary block">Min</label>
              <select
                value={cfg.minute}
                onChange={e => set({ minute: e.target.value })}
                className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {cfg.freq === 'weekly' && (
          <div className="w-20">
            <label className="text-[10px] theme-text-secondary block">Day</label>
            <select
              value={cfg.dayOfWeek}
              onChange={e => set({ dayOfWeek: e.target.value })}
              className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {cfg.freq === 'monthly' && (
          <div className="w-20">
            <label className="text-[10px] theme-text-secondary block">Day</label>
            <select
              value={cfg.dayOfMonth}
            onChange={e => set({ dayOfMonth: e.target.value })}
              className="w-full text-xs px-1 py-1 rounded theme-border theme-bg-secondary"
            >
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {cfg.freq === 'custom' && (
        <input
          type="text"
          value={cron}
          onChange={e => onChange(e.target.value)}
          className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary font-mono"
          placeholder="* * * * *"
        />
      )}

      <div className="text-[10px] theme-text-muted font-mono">{cron}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
const CronDaemonPanel: React.FC<CronDaemonPanelProps> = ({
  isOpen,
  onClose,
  currentPath,
  npcList,
  jinxList,
  isPane,
}) => {
  const api = (window as any).api;
  const [jobs, setJobs] = useState<JobConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [logsMap, setLogsMap] = useState<Record<string, any[]>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [discoveredStores, setDiscoveredStores] = useState<any[]>([]);

  const scanStores = useCallback(async () => {
    if (!currentPath || !api?.scanKnowledgeStores) return;
    try {
      const res = await api.scanKnowledgeStores(currentPath);
      setDiscoveredStores(res?.stores || []);
    } catch {}
  }, [currentPath, api]);

  useEffect(() => { scanStores(); }, [scanStores]);

  const defaultPayload = (type: string) => {
    switch (type) {
      case 'finetune_instruction': return { source: 'memories', npc_name: '', base_model: '', output_name: '', instruction_count: 100 };
      case 'knowledge_graph': return { store_selections: [], extract_first: false, include_memories: true, include_knowledge: true, full_rebuild: false };
      default: return { command: '', npcName: '', jinxName: '' };
    }
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api?.scheduledJobList?.();
      const list: any[] = r?.jobs || r || [];
      // Ensure defaults are present if table is empty
      const ensure = (id: string, name: string, type: string, schedule: string) => {
        const existing = list.find((j: any) => j.job_type === type || j.id === id);
        if (existing) {
          let payload = existing.payload;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { payload = {}; }
          }
          return {
            id: existing.id || id,
            name: existing.name || name,
            enabled: existing.enabled === 1 || existing.enabled === true,
            schedule: existing.schedule || schedule,
            payload: { ...defaultPayload(type), ...(payload || {}) },
            job_type: existing.job_type || type,
            last_run_at: existing.last_run_at,
          };
        }
        return {
          id, name, enabled: false, schedule,
          payload: defaultPayload(type),
          job_type: type,
        };
      };

      const merged = [
        ensure('finetune', 'Fine-tune', 'finetune_instruction', '0 2 * * 0'),
        ensure('knowledge_graph', 'Knowledge Graph Evolution', 'knowledge_graph', '0 3 * * *'),
        ...list
          .filter((j: any) => !['finetune_instruction', 'knowledge_graph'].includes(j.job_type))
          .map((j: any) => {
            let payload = j.payload;
            if (typeof payload === 'string') {
              try { payload = JSON.parse(payload); } catch { payload = {}; }
            }
            return {
              id: j.id,
              name: j.name || j.job_type,
              enabled: j.enabled === 1 || j.enabled === true,
              schedule: j.schedule || '0 3 * * *',
              payload: { ...defaultPayload(j.job_type || 'custom'), ...(payload || {}) },
              job_type: j.job_type || 'custom',
              last_run_at: j.last_run_at,
            };
          }),
      ];
      setJobs(merged);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const updateJob = (index: number, patch: Partial<JobConfig>) => {
    setJobs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const saveJob = async (job: JobConfig) => {
    setSavingId(job.id);
    setError(null);
    try {
      const isNew = !job.id || job.id.startsWith('temp_');
      const payload = { ...job.payload };
      const params: any = {
        id: isNew ? undefined : job.id,
        name: job.name,
        jobType: job.job_type,
        schedule: job.schedule,
        payload,
        workspacePath: currentPath,
        enabled: job.enabled ? 1 : 0,
      };
      if (isNew) {
        const res = await api?.scheduledJobCreate?.(params);
        if (res?.error) throw new Error(res.error);
      } else {
        const res = await api?.scheduledJobUpdate?.(params);
        if (res?.error) throw new Error(res.error);
      }
      await loadJobs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteJob = async (job: JobConfig) => {
    if (!window.confirm(`Delete scheduled job "${job.name}"?`)) return;
    try {
      if (!job.id || job.id.startsWith('temp_')) {
        setJobs(prev => prev.filter(j => j.id !== job.id));
        return;
      }
      await api?.scheduledJobDelete?.(job.id);
      await loadJobs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleJob = async (job: JobConfig, index: number) => {
    const nextEnabled = !job.enabled;
    updateJob(index, { enabled: nextEnabled });
    try {
      if (job.id && !job.id.startsWith('temp_')) {
        await api?.scheduledJobToggle?.(job.id, nextEnabled);
      }
    } catch (e: any) {
      setError(e.message);
      updateJob(index, { enabled: !nextEnabled });
    }
  };

  const runNow = async (job: JobConfig) => {
    setRunningId(job.id);
    setError(null);
    try {
      const res = await api?.scheduledJobRunNow?.(job.id);
      if (res?.error) throw new Error(res.error);
      await loadJobs();
      // auto-expand logs
      setExpandedLogs(prev => new Set(prev).add(job.id));
      loadLogs(job.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunningId(null);
    }
  };

  const loadLogs = async (jobId: string) => {
    try {
      const res = await api?.scheduledJobHistory?.(jobId);
      setLogsMap(prev => ({ ...prev, [jobId]: res?.logs || [] }));
    } catch {}
  };

  const toggleLogs = (jobId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
        if (!logsMap[jobId]) loadLogs(jobId);
      }
      return next;
    });
  };

  const addNewJob = () => {
    if (!newJobName.trim()) return;
    const id = `temp_${Date.now()}`;
    setJobs(prev => [
      ...prev,
      {
        id,
        name: newJobName.trim(),
        enabled: false,
        schedule: '0 3 * * *',
        payload: { command: '', npcName: '', jinxName: '' },
        job_type: 'custom',
      },
    ]);
    setNewJobName('');
    setShowAdd(false);
  };

  const renderJobForm = (job: JobConfig, idx: number) => {
    switch (job.job_type) {
      case 'finetune_instruction':
        return <FinetuneForm job={job} onChange={patch => updateJob(idx, patch)} npcList={npcList} />;
      case 'knowledge_graph':
        return <KGEvolutionForm job={job} onChange={patch => updateJob(idx, patch)} currentPath={currentPath} discoveredStores={discoveredStores} />;
      default:
        return <GenericJobForm job={job} onChange={patch => updateJob(idx, patch)} npcList={npcList} jinxList={jinxList} />;
    }
  };

  const content = (
    <div className="flex flex-col h-full theme-bg-primary theme-text-primary">
      <div className="flex items-center justify-between px-4 py-3 border-b theme-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <SmokestackIcon size={18} className="text-blue-400" />
          <h2 className="text-base font-semibold">Scheduler</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadJobs} disabled={loading} className="p-1.5 hover:bg-white/10 rounded" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {!isPane && onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded"><X size={14} /></button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={14} /><span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {jobs.map((job, idx) => {
          const isExpanded = expandedLogs.has(job.id);
          const jobLogs = logsMap[job.id] || [];
          return (
            <div key={job.id} className="border theme-border rounded-lg p-3 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {job.job_type === 'finetune_instruction' && <FileText size={14} className="text-purple-400" />}
                  {job.job_type === 'knowledge_graph' && <Activity size={14} className="text-green-400" />}
                  {job.job_type !== 'finetune_instruction' && job.job_type !== 'knowledge_graph' && <Terminal size={14} className="text-blue-400" />}
                  <span className="font-medium text-sm">{job.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 theme-text-muted font-mono">{humanizeCron(job.schedule)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => runNow(job)}
                    disabled={runningId === job.id}
                    className="p-1.5 text-green-400 hover:bg-green-900/30 rounded text-[10px] flex items-center gap-1"
                    title="Run now"
                  >
                    {runningId === job.id ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                    Run
                  </button>
                  <button
                    onClick={() => toggleLogs(job.id)}
                    className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded"
                    title="Logs"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    onClick={() => deleteJob(job)}
                    className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer ml-1">
                    <span className="text-[10px] theme-text-secondary">{job.enabled ? 'ON' : 'OFF'}</span>
                    <div
                      onClick={() => toggleJob(job, idx)}
                      className={`w-9 h-4 rounded-full relative transition-colors ${job.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${job.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </div>
              </div>

              {/* Schedule Builder */}
              <ScheduleBuilder
                cron={job.schedule}
                onChange={cron => updateJob(idx, { schedule: cron })}
              />

              {/* Params */}
              {renderJobForm(job, idx)}

              {/* Last run */}
              {job.last_run_at && (
                <div className="text-[10px] theme-text-muted flex items-center gap-1">
                  <Clock size={10} /> Last run: {new Date(job.last_run_at).toLocaleString()}
                </div>
              )}

              {/* Save */}
              <button
                onClick={() => saveJob(job)}
                disabled={savingId === job.id}
                className="w-full text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {savingId === job.id ? <Loader className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>

              {/* Logs */}
              {isExpanded && (
                <div className="border-t theme-border pt-2 space-y-1">
                  <div className="text-[10px] font-semibold theme-text-secondary flex items-center gap-1">
                    <Activity size={10} /> Execution History
                  </div>
                  {jobLogs.length === 0 && (
                    <div className="text-[10px] theme-text-muted italic">No runs yet.</div>
                  )}
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {jobLogs.map((log: any, i: number) => (
                      <div key={i} className="text-[10px] font-mono bg-gray-900/40 p-1.5 rounded">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-green-500' : log.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                          <span className="theme-text-muted">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</span>
                        </div>
                        {log.output && (
                          <pre className="mt-1 whitespace-pre-wrap text-gray-400">{String(log.output).slice(0, 400)}</pre>
                        )}
                        {log.error && (
                          <pre className="mt-1 whitespace-pre-wrap text-red-400">{String(log.error).slice(0, 400)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new job */}
        {showAdd ? (
          <div className="border theme-border rounded-lg p-3 space-y-2">
            <label className="text-xs theme-text-secondary block">New Job Name</label>
            <input
              type="text"
              value={newJobName}
              onChange={e => setNewJobName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNewJob()}
              className="w-full theme-input text-sm"
              placeholder="e.g. Nightly Backup"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAdd(false); setNewJobName(''); }} className="theme-button px-3 py-1 rounded text-xs">Cancel</button>
              <button onClick={addNewJob} disabled={!newJobName.trim()} className="theme-button-primary px-3 py-1 rounded text-xs">Add</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full border border-dashed theme-border rounded-lg p-3 flex items-center justify-center gap-2 text-xs theme-text-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <Plus size={14} /> Add Scheduled Job
          </button>
        )}
      </div>
    </div>
  );

  if (isPane) return content;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[520px] max-w-[90vw] max-h-[85vh] theme-bg-primary rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {content}
      </div>
    </div>
  );
};

export default CronDaemonPanel;
