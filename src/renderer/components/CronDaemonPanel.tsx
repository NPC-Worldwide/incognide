import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, X, Loader, Save } from 'lucide-react';
import SmokestackIcon from './icons/SmokestackIcon';

interface JobConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  payload: string;
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

const DEFAULT_JOBS: JobConfig[] = [
  {
    id: 'finetune',
    name: 'Fine-tune',
    enabled: false,
    schedule: '0 2 * * 0',
    payload: JSON.stringify({ dataset_path: '', model: '', epochs: 3 }, null, 2),
  },
  {
    id: 'knowledge_graph',
    name: 'Knowledge Graph Evolution',
    enabled: false,
    schedule: '0 3 * * *',
    payload: JSON.stringify({ dbPath: '~/.incognide/history.db', full: false }, null, 2),
  },
];

const CronDaemonPanel: React.FC<CronDaemonPanelProps> = ({ isOpen, onClose, currentPath, isPane }) => {
  const api = (window as any).api;
  const [jobs, setJobs] = useState<JobConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api?.scheduledJobList?.();
      const list = r?.jobs || r || [];
      const ft = list.find((j: any) => j.job_type === 'finetune_instruction') || DEFAULT_JOBS[0];
      const kg = list.find((j: any) => j.job_type === 'knowledge_graph') || DEFAULT_JOBS[1];

      setJobs([
        {
          id: ft.id || 'finetune',
          name: 'Fine-tune',
          enabled: ft.enabled === 1,
          schedule: ft.schedule || DEFAULT_JOBS[0].schedule,
          payload: ft.payload ? tryFormatJson(ft.payload) : DEFAULT_JOBS[0].payload,
          last_run_at: ft.last_run_at,
        },
        {
          id: kg.id || 'knowledge_graph',
          name: 'Knowledge Graph Evolution',
          enabled: kg.enabled === 1,
          schedule: kg.schedule || DEFAULT_JOBS[1].schedule,
          payload: kg.payload ? tryFormatJson(kg.payload) : DEFAULT_JOBS[1].payload,
          last_run_at: kg.last_run_at,
        },
      ]);
    } catch {}
    setLoading(false);
  }, [api]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const tryFormatJson = (s: string) => {
    try { return JSON.stringify(JSON.parse(s), null, 2); }
    catch { return s; }
  };

  const saveJob = async (job: JobConfig) => {
    setSaving(true);
    setError(null);
    try {
      // Validate JSON payload
      try { JSON.parse(job.payload); } catch { throw new Error('Payload is not valid JSON'); }

      // Delete existing then recreate
      try { await api?.scheduledJobDelete?.(job.id); } catch {}

      const jobType = job.name === 'Fine-tune' ? 'finetune_instruction' : 'knowledge_graph';

      await api?.scheduledJobCreate?.({
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        command: '',
        jobType,
        payload: JSON.parse(job.payload),
        workspacePath: currentPath,
        enabled: job.enabled ? 1 : 0,
      });

      await loadJobs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateJob = (index: number, patch: Partial<JobConfig>) => {
    setJobs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
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
        {jobs.map((job, idx) => (
          <div key={job.id} className="border theme-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{job.name}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs theme-text-secondary">{job.enabled ? 'ON' : 'OFF'}</span>
                <div
                  onClick={() => updateJob(idx, { enabled: !job.enabled })}
                  className={`w-10 h-5 rounded-full relative transition-colors ${job.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${job.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>

            <div>
              <label className="text-[10px] theme-text-secondary mb-0.5 block">Schedule (cron)</label>
              <input
                type="text"
                value={job.schedule}
                onChange={e => updateJob(idx, { schedule: e.target.value })}
                className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary font-mono"
                placeholder="* * * * *"
              />
            </div>

            <div>
              <label className="text-[10px] theme-text-secondary mb-0.5 block">Config (JSON)</label>
              <textarea
                value={job.payload}
                onChange={e => updateJob(idx, { payload: e.target.value })}
                className="w-full text-xs px-2 py-1 rounded theme-border theme-bg-secondary font-mono min-h-[80px] resize-y"
                rows={4}
              />
            </div>

            {job.last_run_at && (
              <div className="text-[10px] theme-text-secondary">
                Last run: {new Date(job.last_run_at).toLocaleString()}
              </div>
            )}

            <button
              onClick={() => saveJob(job)}
              disabled={saving}
              className="w-full text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {saving ? <Loader className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  if (isPane) return content;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[480px] max-w-[90vw] max-h-[80vh] theme-bg-primary rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {content}
      </div>
    </div>
  );
};

export default CronDaemonPanel;
