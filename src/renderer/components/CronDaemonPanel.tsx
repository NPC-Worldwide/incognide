import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Trash2, Edit2, X, Clock, Play, Pause,
    RefreshCw, Terminal, Check, AlertCircle, ChevronDown,
    ChevronRight, Save, Copy, Eye, Zap, FileText,
    Code, Bot, Sparkles, FileCode, Database,
    Table, Activity, Cpu, Search, Square,
} from 'lucide-react';

interface SqlModel {
    id: string;
    name: string;
    description?: string;
    sql: string;
    schedule?: string;
    materialization: 'view' | 'table' | 'incremental';
    npc?: string;
    jinx?: string;
    lastRunAt?: string;
    filePath?: string;
    isGlobal?: boolean;
}

const NQL_FUNCTIONS = [
    { name: 'get_llm_response', category: 'llm', description: 'Get LLM response for text', color: 'text-blue-400' },
    { name: 'extract_facts', category: 'llm', description: 'Extract facts from text', color: 'text-blue-400' },
    { name: 'get_facts', category: 'llm', description: 'Get stored facts', color: 'text-blue-400' },
    { name: 'synthesize', category: 'analysis', description: 'Synthesize information', color: 'text-green-400' },
    { name: 'criticize', category: 'analysis', description: 'Critical analysis', color: 'text-green-400' },
    { name: 'harmonize', category: 'analysis', description: 'Harmonize perspectives', color: 'text-green-400' },
    { name: 'breathe', category: 'workflow', description: 'Async NPC breathing', color: 'text-purple-400' },
    { name: 'orchestrate', category: 'workflow', description: 'Multi-NPC orchestration', color: 'text-purple-400' },
    { name: 'identify_groups', category: 'clustering', description: 'Identify groups in data', color: 'text-orange-400' },
    { name: 'generate_groups', category: 'clustering', description: 'Generate group labels', color: 'text-orange-400' },
    { name: 'bootstrap', category: 'sampling', description: 'Bootstrap sampling', color: 'text-cyan-400' },
    { name: 'zoom_in', category: 'sampling', description: 'Zoom into detail', color: 'text-cyan-400' },
];

const NQL_CATEGORIES = [...new Set(NQL_FUNCTIONS.map(f => f.category))];

type OSPlatform = 'linux' | 'darwin' | 'win32';
const detectPlatform = (): OSPlatform => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'win32';
    if (ua.includes('mac')) return 'darwin';
    return 'linux';
};
const HOST_PLATFORM: OSPlatform = detectPlatform();
const IS_LINUX = HOST_PLATFORM === 'linux';
const IS_MAC = HOST_PLATFORM === 'darwin';
const IS_WIN = HOST_PLATFORM === 'win32';

const SCHEDULE_PRESETS = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 min', value: '*/5 * * * *' },
    { label: 'Every 15 min', value: '*/15 * * * *' },
    { label: 'Every 30 min', value: '*/30 * * * *' },
    { label: 'Hourly', value: '0 * * * *' },
    { label: 'Every 6h', value: '0 */6 * * *' },
    { label: 'Every 12h', value: '0 */12 * * *' },
    { label: 'Daily midnight', value: '0 0 * * *' },
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
    { label: 'Weekly Sun', value: '0 0 * * 0' },
    { label: 'Monthly 1st', value: '0 0 1 * *' },
];
const humanSchedule = (s: string) => SCHEDULE_PRESETS.find(p => p.value === s)?.label || s;

const EXAMPLE_JOBS: { name: string; schedule: string; command: string; desc: string; npc?: string }[] = [
    { name: 'memory_extract', schedule: '0 */6 * * *', command: 'extract_memories limit=50', desc: 'Extract memories from recent conversations every 6h' },
    { name: 'kg_sleep', schedule: '0 3 * * *', command: 'sleep backfill=true', desc: 'Nightly KG evolution with memory backfill' },
    { name: 'kg_dream', schedule: '0 4 * * 0', command: 'sleep dream=true', desc: 'Weekly KG creative synthesis' },
    { name: 'context_compress', schedule: '0 */12 * * *', command: 'compress', desc: 'Compress conversation context every 12h' },
];

const EXAMPLE_DAEMONS_LINUX: { name: string; command: string; desc: string; npc?: string }[] = [
    { name: 'downloads-watcher', command: 'inotifywait -m -e create ~/Downloads --format "%f" | while read f; do echo "New: $f"; done', desc: 'Watch ~/Downloads for new files (requires inotify-tools)' },
    { name: 'log-monitor', command: 'tail -F /var/log/syslog | grep --line-buffered -iE "error|warn|critical"', desc: 'Stream syslog errors in real time' },
    { name: 'repo-watcher', command: 'inotifywait -mr -e modify,create,delete --exclude "\\.git" . --format "%w%f %e"', desc: 'Watch current directory for file changes (requires inotify-tools)' },
];

const EXAMPLE_DAEMONS_MAC: { name: string; command: string; desc: string; npc?: string }[] = [
    { name: 'downloads-watcher', command: 'fswatch -0 ~/Downloads | while read -d "" f; do echo "New: $f"; done', desc: 'Watch ~/Downloads for new files (requires fswatch)' },
    { name: 'log-monitor', command: 'log stream --predicate \'eventMessage contains "error" || eventMessage contains "fault"\' --level error', desc: 'Stream system log errors in real time' },
    { name: 'repo-watcher', command: 'fswatch -r --exclude "\\.git" . | while read -d "" f; do echo "Changed: $f"; done', desc: 'Watch current directory for file changes (requires fswatch)' },
];

const EXAMPLE_DAEMONS_WIN: { name: string; command: string; desc: string; npc?: string }[] = [
    { name: 'downloads-watcher', command: 'powershell -Command "$w = New-Object IO.FileSystemWatcher; $w.Path = [Environment]::GetFolderPath(\'UserProfile\') + \'\\Downloads\'; $w.EnableRaisingEvents = $true; Register-ObjectEvent $w Created -Action { Write-Host \\"New: $($Event.SourceEventArgs.Name)\\" }; while($true){Start-Sleep 1}"', desc: 'Watch Downloads folder for new files' },
    { name: 'log-monitor', command: 'powershell -Command "Get-WinEvent -LogName System -MaxEvents 50 | Where-Object {$_.LevelDisplayName -match \'Error|Warning|Critical\'} | Format-List TimeCreated,Message"', desc: 'Show recent system log errors' },
    { name: 'repo-watcher', command: 'powershell -Command "$w = New-Object IO.FileSystemWatcher; $w.Path = (Get-Location).Path; $w.IncludeSubdirectories = $true; $w.EnableRaisingEvents = $true; Register-ObjectEvent $w Changed -Action { Write-Host \\"Changed: $($Event.SourceEventArgs.FullPath)\\" }; while($true){Start-Sleep 1}"', desc: 'Watch current directory for file changes' },
];

const EXAMPLE_DAEMONS = IS_MAC ? EXAMPLE_DAEMONS_MAC : IS_WIN ? EXAMPLE_DAEMONS_WIN : EXAMPLE_DAEMONS_LINUX;

const EXAMPLE_SQL_MODELS: SqlModel[] = [
    {
        id: 'extract_facts', name: 'extract_facts',
        description: 'Extract facts from recent conversations into the knowledge graph',
        materialization: 'incremental', schedule: '0 */6 * * *',
        sql: `{{ config(materialized='incremental') }}

SELECT
    conversation_id, npc, team,
    nql.extract_facts(content) as facts,
    nql.identify_groups(content) as groups,
    directory_path, timestamp
FROM conversation_history
WHERE role = 'assistant'
{% if is_incremental() %}
  AND timestamp > (SELECT MAX(timestamp) FROM {{ this }})
{% endif %}
ORDER BY timestamp DESC`,
    },
    {
        id: 'kg_sleep', name: 'kg_sleep',
        description: 'Evolve the knowledge graph — structure unlinked facts, merge concepts, infer new facts',
        materialization: 'table', schedule: '0 3 * * *',
        sql: `{{ config(materialized='table') }}

WITH unlinked AS (
    SELECT f.statement, f.source_text, f.type
    FROM kg_facts f
    LEFT JOIN kg_links l ON l.source = f.statement AND l.type = 'fact_to_concept'
    WHERE l.source IS NULL
),
all_facts AS (
    SELECT statement, source_text FROM kg_facts
)
SELECT
    u.statement,
    nql.generate_groups(u.statement) as new_concepts,
    nql.zoom_in(u.statement || ' context: ' || COALESCE(u.source_text, '')) as implied_facts,
    nql.synthesize(
        (SELECT GROUP_CONCAT(a.statement, '\\n') FROM all_facts a LIMIT 50)
    ) as synthesis
FROM unlinked u`,
    },
    {
        id: 'kg_dream', name: 'kg_dream',
        description: 'Creative KG synthesis — cross-pollinate concepts, generate new connections',
        materialization: 'table', schedule: '0 4 * * 0',
        sql: `{{ config(materialized='table') }}

WITH seed_concepts AS (
    SELECT name, team_name, npc_name
    FROM kg_concepts
    ORDER BY RANDOM() LIMIT 5
),
concept_facts AS (
    SELECT c.name as concept, GROUP_CONCAT(f.statement, '\\n') as related_facts
    FROM seed_concepts c
    JOIN kg_links l ON l.target = c.name AND l.type = 'fact_to_concept'
    JOIN kg_facts f ON f.statement = l.source
    GROUP BY c.name
)
SELECT
    concept,
    nql.synthesize(related_facts) as cross_synthesis,
    nql.zoom_in(related_facts) as new_inferences,
    nql.abstract(related_facts) as higher_abstractions
FROM concept_facts`,
    },
    {
        id: 'jinx_activity', name: 'jinx_activity',
        description: 'Jinx execution stats — which jinxes run most, by which NPCs, error rates',
        materialization: 'table', schedule: '0 0 * * 1',
        sql: `{{ config(materialized='table') }}

SELECT
    jinx_name,
    npc,
    COUNT(*) as runs,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as ok,
    SUM(CASE WHEN status != 'success' AND status IS NOT NULL THEN 1 ELSE 0 END) as errors,
    ROUND(AVG(duration_ms)) as avg_ms,
    MIN(timestamp) as first_run,
    MAX(timestamp) as last_run
FROM jinx_executions
GROUP BY jinx_name, npc
ORDER BY runs DESC`,
    },
];

type ServiceInfo = { unit: string; load: string; active: string; sub: string; description: string };
type TimerInfo = { unit: string; next: string; left: string; passed: string };
type CronEntry = { schedule: string; command: string };
type LaunchdJob = { label: string; pid: string; status: string; lastExitStatus?: string };
type WinTask = { taskName: string; status: string; nextRun?: string; lastRun?: string };

// -- Linux: parse systemctl list-units output --
const parseServices = (raw: string): ServiceInfo[] => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split('\n')
        .filter(l => l.trim() && !l.startsWith('UNIT') && !l.startsWith(' ') && !l.includes('listed.') && !l.includes('loaded units'))
        .map(l => { const p = l.trim().split(/\s+/); return p.length >= 4 ? { unit: p[0].replace('.service',''), load: p[1], active: p[2], sub: p[3], description: p.slice(4).join(' ') } : null; })
        .filter(Boolean) as ServiceInfo[];
};

const parseTimers = (raw: unknown): TimerInfo[] => {
    if (typeof raw !== 'string') return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];
    return trimmed.split('\n')
        .filter(l => l.trim() && !l.startsWith('NEXT') && !l.includes('timers listed') && !l.startsWith('Pass'))
        .map(l => {
            const tm = l.match(/(\S+)\.timer/); if (!tm) return null;
            const left = l.match(/(\d+\S*\s+\S*?\s*left)/i)?.[1]?.trim() || '';
            const passed = l.match(/(\d+\S*\s+\S*?\s*ago)/i)?.[1]?.trim() || '';
            const next = l.match(/(\w{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w+).*?left/)?.[1] || '';
            return { unit: tm[1], next, left, last: '', passed };
        }).filter(Boolean) as TimerInfo[];
};

// -- macOS: parse launchctl list output (PID\tStatus\tLabel) --
const parseLaunchdJobs = (raw: string): LaunchdJob[] => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split('\n')
        .filter(l => l.trim() && !l.startsWith('PID'))
        .map(l => {
            const p = l.trim().split(/\t+/);
            if (p.length < 3) return null;
            return { pid: p[0] === '-' ? '' : p[0], status: p[1], label: p[2], lastExitStatus: p[1] };
        })
        .filter(Boolean) as LaunchdJob[];
};

// -- Windows: parse schtasks /query /fo LIST output --
const parseWindowsTasks = (raw: string): WinTask[] => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
    const tasks: WinTask[] = [];
    let current: Partial<WinTask> = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (current.taskName) { tasks.push(current as WinTask); current = {}; }
            continue;
        }
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (key === 'taskname') current.taskName = val;
        else if (key === 'status') current.status = val;
        else if (key.includes('next run')) current.nextRun = val;
        else if (key.includes('last run')) current.lastRun = val;
    }
    if (current.taskName) tasks.push(current as WinTask);
    return tasks;
};

const parseCrontab = (raw: string): CronEntry[] => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && !/^(SHELL|PATH|MAILTO|HOME)/.test(l))
        .map(l => { const p = l.trim().split(/\s+/); return p.length >= 6 ? { schedule: p.slice(0,5).join(' '), command: p.slice(5).join(' ') } : null; })
        .filter(Boolean) as CronEntry[];
};

const ExpandRow = ({ header, children, defaultOpen = false }: { header: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-lg theme-bg-primary border theme-border hover:border-blue-500/30 transition-colors overflow-hidden">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer">
                {open ? <ChevronDown size={12} className="text-gray-500 flex-shrink-0" /> : <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />}
                <div className="flex-1 min-w-0 flex items-center gap-2">{header}</div>
            </button>
            {open && <div className="px-3 pb-3 pt-1 border-t theme-border">{children}</div>}
        </div>
    );
};

const Section = ({ title, count, icon: Icon, children, defaultOpen = true, actions }: {
    title: string; count?: number; icon?: any; children: React.ReactNode; defaultOpen?: boolean; actions?: React.ReactNode;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
                <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {Icon && <Icon size={12} />}
                    {title}
                    {count != null && <span className="text-[10px] text-gray-600">({count})</span>}
                </button>
                {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
            </div>
            {open && <div className="space-y-1">{children}</div>}
        </div>
    );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-xs">
        <span className="text-gray-500 w-20 flex-shrink-0 pt-0.5">{label}</span>
        <div className="flex-1 min-w-0">{children}</div>
    </div>
);

const inputCls = "w-full px-2 py-1.5 text-xs theme-bg-primary border theme-border rounded font-mono focus:border-blue-500 focus:outline-none";

const CronDaemonPanel = ({
    isOpen = true, onClose, currentPath, npcList = [], jinxList = [],
    isPane = false, isGlobal = false,
}: {
    isOpen?: boolean; onClose?: () => void; currentPath?: string;
    npcList?: any[]; jinxList?: any[]; isPane?: boolean; isGlobal?: boolean;
}) => {
    const api = (window as any).api;
    const [activeTab, setActiveTab] = useState<'jobs' | 'daemons' | 'nql'>('jobs');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    const [jobs, setJobs] = useState<{ name: string; active: boolean }[]>([]);
    const [jobStatuses, setJobStatuses] = useState<Record<string, any>>({});
    const [showAddJob, setShowAddJob] = useState(false);
    const [newJobName, setNewJobName] = useState('');
    const [newJobSchedule, setNewJobSchedule] = useState('0 0 * * *');
    const [newJobCommand, setNewJobCommand] = useState('');
    const [newJobNpc, setNewJobNpc] = useState('');
    const [newJobJinx, setNewJobJinx] = useState('');

    const [appDaemons, setAppDaemons] = useState<any[]>([]);
    const [systemData, setSystemData] = useState<any>(null);
    const [systemDaemons, setSystemDaemons] = useState<any>(null);
    const [showAddDaemon, setShowAddDaemon] = useState(false);
    const [newDaemonName, setNewDaemonName] = useState('');
    const [newDaemonCommand, setNewDaemonCommand] = useState('');
    const [newDaemonNpc, setNewDaemonNpc] = useState('');

    const [sqlModels, setSqlModels] = useState<SqlModel[]>([]);
    const [showNewModel, setShowNewModel] = useState(false);
    const [editModel, setEditModel] = useState<SqlModel | null>(null);
    const [modelForm, setModelForm] = useState({ name: '', sql: '', description: '', materialization: 'table' as string, npc: '' });
    const [modelRunResult, setModelRunResult] = useState<Record<string, string>>({});

    const [serviceInfo, setServiceInfo] = useState<Record<string, { unit_file?: string; journal?: string; loading?: boolean }>>({});

    const fetchJobs = useCallback(async () => {
        try {
            const r = await api?.getCronJobs?.();
            if (Array.isArray(r)) setJobs(r);
        } catch {}
    }, []);

    const fetchJobStatus = useCallback(async (name: string) => {
        try {
            const r = await api?.jobStatus?.(name);
            if (r) setJobStatuses(prev => ({ ...prev, [name]: r }));
        } catch {}
    }, []);

    const fetchDaemons = useCallback(async () => {
        try {
            const [local, system, crontab] = await Promise.all([
                api?.getDaemons?.(),
                api?.getSystemDaemons?.(),
                api?.getCrontab?.(),
            ]);
            if (Array.isArray(local)) setAppDaemons(local);
            if (system && !system.error) setSystemDaemons(system);
            if (crontab && !crontab.error) setSystemData(crontab);
        } catch {}
    }, []);

    const fetchModels = useCallback(async () => {
        try {
            const [g, p] = await Promise.all([
                api?.getSqlModelsGlobal?.(),
                currentPath ? api?.getSqlModelsProject?.(currentPath) : null,
            ]);
            const all: SqlModel[] = [];
            if (g?.models) all.push(...g.models.map((m: any) => ({ ...m, isGlobal: true })));
            if (p?.models) all.push(...p.models.map((m: any) => ({ ...m, isGlobal: false })));
            setSqlModels(all);
        } catch {}
    }, [currentPath]);

    const fetchAll = useCallback(async () => {
        setLoading(true); setError(null);
        await Promise.all([fetchJobs(), fetchDaemons(), fetchModels()]);
        setLoading(false);
    }, [fetchJobs, fetchDaemons, fetchModels]);

    useEffect(() => { if (isOpen) fetchAll(); }, [isOpen, fetchAll]);

    const fetchServiceInfo = useCallback(async (unit: string) => {

        const key = unit.replace(/\.(service|timer)$/, '');
        setServiceInfo(prev => ({ ...prev, [key]: { ...prev[key], loading: true } }));
        try {

            const unitArg = unit.includes('.') ? unit : `${unit}.service`;
            const r = await api?.getServiceInfo?.(unitArg);
            if (r && !r.error) {
                setServiceInfo(prev => ({ ...prev, [key]: {
                    unit_file: r.unit_file || '(no unit file found)',
                    journal: r.journal || '(no journal entries)',
                    loading: false
                } }));
            } else {
                setServiceInfo(prev => ({ ...prev, [key]: {
                    unit_file: `Error: ${r?.error || 'API call failed'}`,
                    journal: '', loading: false
                } }));
            }
        } catch (e: any) {
            setServiceInfo(prev => ({ ...prev, [key]: {
                unit_file: `Error: ${e.message}`,
                journal: '', loading: false
            } }));
        }
    }, []);

    const scheduleJob = async (name: string, schedule: string, command: string) => {
        if (!name || !schedule || !command) return;
        setLoading(true); setError(null);
        try {
            const r = await api?.scheduleJob?.({ schedule, command, jobName: name });
            if (r?.success) { setShowAddJob(false); setNewJobName(''); setNewJobCommand(''); await fetchJobs(); }
            else setError(r?.message || r?.error || 'Failed to schedule');
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const removeJob = async (name: string) => {
        if (!window.confirm(`Remove job "${name}"?`)) return;
        setLoading(true);
        try {
            const r = await api?.unscheduleJob?.(name);
            if (!r?.success) setError(r?.message || 'Failed');
            await fetchJobs();
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const startDaemon = async (name: string, command: string, npc?: string) => {
        if (!name || !command) return;
        setLoading(true);
        try {
            const r = await api?.addDaemon?.({ path: currentPath, name, command, npc: npc || undefined });
            if (r?.success) { setShowAddDaemon(false); setNewDaemonName(''); setNewDaemonCommand(''); await fetchDaemons(); }
            else setError(r?.error || 'Failed');
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const killDaemon = async (id: string) => {
        if (!window.confirm('Kill this daemon?')) return;
        try { await api?.removeDaemon?.(id); await fetchDaemons(); }
        catch (e: any) { setError(e.message); }
    };

    const editDaemon = async (d: any) => {

        try { await api?.removeDaemon?.(d.id); await fetchDaemons(); } catch {}
        setNewDaemonName(d.name || '');
        setNewDaemonCommand(d.command || '');
        setNewDaemonNpc(d.npc || '');
        setShowAddDaemon(true);
    };

    const saveModel = async () => {
        const { name, sql, description, materialization, npc } = modelForm;
        if (!name || !sql) return;
        setLoading(true);
        try {
            const data = { id: name, name, sql, description, materialization, npc };
            const r = isGlobal || !currentPath
                ? await api?.saveSqlModelGlobal?.(data)
                : await api?.saveSqlModelProject?.({ path: currentPath, model: data });
            if (r?.success) { setShowNewModel(false); setEditModel(null); setModelForm({ name: '', sql: '', description: '', materialization: 'table', npc: '' }); await fetchModels(); }
            else setError(r?.error || 'Failed to save');
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const runModel = async (model: SqlModel) => {
        setModelRunResult(prev => ({ ...prev, [model.id]: 'Running...' }));
        try {
            const r = await api?.runSqlModel?.({ path: currentPath, modelId: model.name, isGlobal: model.isGlobal ?? true });
            setModelRunResult(prev => ({ ...prev, [model.id]: r?.success ? (r.message || `Done. ${r.rows} rows.`) : `Error: ${r?.error}` }));
        } catch (e: any) { setModelRunResult(prev => ({ ...prev, [model.id]: `Error: ${e.message}` })); }
    };

    const deleteModel = async (model: SqlModel) => {
        if (!window.confirm(`Delete model "${model.name}"?`)) return;
        try {
            const r = model.isGlobal
                ? await api?.deleteSqlModelGlobal?.(model.id || model.name)
                : await api?.deleteSqlModelProject?.({ path: currentPath, modelId: model.id || model.name });
            if (r?.success) await fetchModels();
            else setError(r?.error || 'Failed');
        } catch (e: any) { setError(e.message); }
    };

    const saveExampleModel = async (ex: SqlModel) => {
        try {
            const r = await api?.saveSqlModelGlobal?.({ id: ex.name, name: ex.name, sql: ex.sql, description: ex.description, materialization: ex.materialization, npc: ex.npc });
            if (r?.success) await fetchModels();
            else setError(r?.error || 'Failed');
        } catch (e: any) { setError(e.message); }
    };

    // Cross-platform: crontab exists on Linux and macOS (but not Windows)
    const parsedUserCron = useMemo(() => IS_WIN ? [] : parseCrontab(systemData?.user_crontab || ''), [systemData]);
    const parsedSysCron = useMemo(() => IS_WIN ? [] : parseCrontab(systemData?.system_crontab || ''), [systemData]);
    // Linux-only: systemd timers and services
    const parsedTimers = useMemo(() => IS_LINUX ? parseTimers(systemData?.timers || '') : [], [systemData]);
    const parsedUserSvcs = useMemo(() => IS_LINUX ? parseServices(systemData?.services || '') : [], [systemData]);
    const parsedRunningSvcs = useMemo(() => IS_LINUX ? parseServices(systemDaemons?.services || '') : [], [systemDaemons]);
    const parsedDaemonUserSvcs = useMemo(() => IS_LINUX ? parseServices(systemDaemons?.user_services || '') : [], [systemDaemons]);
    // macOS: launchd jobs
    const parsedLaunchdJobs = useMemo(() => IS_MAC ? parseLaunchdJobs(systemDaemons?.launchd_jobs || systemDaemons?.services || '') : [], [systemDaemons]);
    const parsedLaunchdUserJobs = useMemo(() => IS_MAC ? parseLaunchdJobs(systemDaemons?.user_services || '') : [], [systemDaemons]);
    // Windows: scheduled tasks
    const parsedWinTasks = useMemo(() => IS_WIN ? parseWindowsTasks(systemDaemons?.scheduled_tasks || systemDaemons?.services || '') : [], [systemDaemons]);

    if (!isOpen && !isPane) return null;

    const content = (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                        <rect x="5" y="10" width="5" height="12" rx="0.5" />
                        <circle cx="7.5" cy="6" r="2" /><circle cx="9" cy="3" r="1.5" />
                        <rect x="12" y="14" width="4" height="8" rx="0.5" />
                        <rect x="18" y="16" width="3" height="6" rx="0.5" />
                        <path d="M2 22h20" />
                    </svg>
                    <h2 className="text-base font-semibold">Scheduler & Processes</h2>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={fetchAll} disabled={loading} className="p-1.5 hover:bg-white/10 rounded" title="Refresh">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {!isPane && onClose && <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded"><X size={14} /></button>}
                </div>
            </div>

            <div className="flex border-b theme-border flex-shrink-0">
                {([
                    { id: 'jobs' as const, label: 'Jobs', icon: Zap },
                    { id: 'daemons' as const, label: 'Daemons & System', icon: Activity },
                    { id: 'nql' as const, label: 'NQL', icon: Database },
                ]).map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            activeTab === t.id ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}>
                        <t.icon size={14} />{t.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mx-4 mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle size={14} /><span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)}><X size={12} /></button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {activeTab === 'jobs' && (<>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
                                placeholder="Filter..." className="w-full pl-6 pr-2 py-1.5 text-xs theme-bg-primary border theme-border rounded focus:border-blue-500 focus:outline-none" />
                        </div>
                        <button onClick={() => setShowAddJob(!showAddJob)}
                            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${showAddJob ? 'bg-blue-600 text-white' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'}`}>
                            <Plus size={12} /> New Job
                        </button>
                    </div>

                    {showAddJob && (
                        <div className="p-3 bg-blue-900/15 border border-blue-500/30 rounded-lg space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Job Name</label>
                                    <input type="text" value={newJobName} onChange={e => setNewJobName(e.target.value.replace(/[^a-zA-Z0-9_-]/g,'_'))} placeholder="my_job" className={inputCls} />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Schedule</label>
                                    <select value={SCHEDULE_PRESETS.some(p => p.value === newJobSchedule) ? newJobSchedule : '__custom'}
                                        onChange={e => { if (e.target.value !== '__custom') setNewJobSchedule(e.target.value); }}
                                        className={inputCls}>
                                        {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        <option value="__custom">Custom</option>
                                    </select>
                                    {!SCHEDULE_PRESETS.some(p => p.value === newJobSchedule) && (
                                        <input type="text" value={newJobSchedule} onChange={e => setNewJobSchedule(e.target.value)} placeholder="* * * * *" className={inputCls + ' mt-1'} />
                                    )}
                                </div>
                            </div>
                            <div className={`grid gap-2 ${npcList.length > 0 && jinxList.length > 0 ? 'grid-cols-3' : npcList.length > 0 || jinxList.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {npcList.length > 0 && (
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">NPC</label>
                                        <select value={newJobNpc} onChange={e => setNewJobNpc(e.target.value)} className={inputCls}>
                                            <option value="">None</option>
                                            {npcList.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                {jinxList.length > 0 && (
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Jinx</label>
                                        <select value={newJobJinx} onChange={e => {
                                            setNewJobJinx(e.target.value);
                                            if (e.target.value && !newJobCommand) setNewJobCommand(e.target.value);
                                            if (e.target.value && !newJobName) setNewJobName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'));
                                        }} className={inputCls}>
                                            <option value="">None</option>
                                            {jinxList.map((j: any) => <option key={j.name || j} value={j.name || j}>{j.name || j}</option>)}
                                        </select>
                                    </div>
                                )}
                                {sqlModels.length > 0 && (
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">SQL Model</label>
                                        <select value="" onChange={e => {
                                            if (e.target.value) {
                                                setNewJobCommand(`run:${e.target.value}`);
                                                if (!newJobName) setNewJobName(`run_${e.target.value}`);
                                            }
                                        }} className={inputCls}>
                                            <option value="">Pick a model...</option>
                                            {sqlModels.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">Command</label>
                                <textarea value={newJobCommand} onChange={e => setNewJobCommand(e.target.value)}
                                    placeholder={'run:model_name, jinx name + args, or a task description'}
                                    className={inputCls + ' min-h-[50px] resize-y'} rows={2} />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    let cmd = newJobCommand;
                                    if (newJobNpc) cmd += ` --npc ${newJobNpc}`;
                                    scheduleJob(newJobName, newJobSchedule, cmd);
                                    setNewJobJinx('');
                                }}
                                    disabled={loading || !newJobName || !newJobCommand}
                                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs disabled:opacity-50 flex items-center justify-center gap-1">
                                    <Check size={12} /> Schedule
                                </button>
                                <button onClick={() => setShowAddJob(false)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Cancel</button>
                            </div>
                        </div>
                    )}

                    {jobs.length > 0 && (
                        <Section title="Scheduled Jobs" count={jobs.length} icon={Clock}>
                            {jobs.filter(j => !filter || j.name.toLowerCase().includes(filter.toLowerCase())).map(job => (
                                <ExpandRow key={job.name} header={<>
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${job.active ? 'bg-green-400' : 'bg-gray-500'}`} />
                                    <span className="font-mono text-xs text-gray-200">{job.name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${job.active ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                        {job.active ? 'active' : 'inactive'}
                                    </span>
                                    <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => fetchJobStatus(job.name)} className="p-1 text-gray-400 hover:text-blue-400 rounded" title="Load status"><Eye size={12} /></button>
                                        <button onClick={() => removeJob(job.name)} className="p-1 text-gray-400 hover:text-red-400 rounded" title="Remove"><Trash2 size={12} /></button>
                                    </div>
                                </>}>
                                    <div className="space-y-1.5">
                                        {jobStatuses[job.name] ? (<>
                                            <Field label="Status"><span className={`text-[10px] ${jobStatuses[job.name].active ? 'text-green-400' : 'text-gray-400'}`}>{jobStatuses[job.name].active ? 'Scheduled' : 'Inactive'}</span></Field>
                                            <Field label="Log file"><span className="font-mono text-[10px] text-gray-400 select-all">{jobStatuses[job.name].log}</span></Field>
                                            {jobStatuses[job.name].recent_log?.length > 0 ? (
                                                <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto bg-black/20 rounded p-2 select-all mt-1">{jobStatuses[job.name].recent_log.join('')}</pre>
                                            ) : <div className="text-[10px] text-gray-600 italic">No log output yet</div>}
                                        </>) : (
                                            <button onClick={() => fetchJobStatus(job.name)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                <Eye size={10} /> Load status & logs
                                            </button>
                                        )}
                                    </div>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {jobs.length === 0 && !loading && !showAddJob && (
                        <div className="text-center py-6 text-gray-500 text-sm">
                            <Zap size={20} className="mx-auto mb-2 text-gray-600" />
                            No scheduled jobs. Create one or enable an example below.
                        </div>
                    )}

                    <Section title="Quick Enable" count={EXAMPLE_JOBS.filter(e => !jobs.some(j => j.name === e.name)).length} icon={Sparkles} defaultOpen={jobs.length === 0}>
                        {EXAMPLE_JOBS.filter(e => !jobs.some(j => j.name === e.name)).map(ex => (
                            <ExpandRow key={ex.name} header={<>
                                <span className="font-mono text-xs text-gray-300">{ex.name}</span>
                                <span className="text-[10px] text-gray-500">{humanSchedule(ex.schedule)}</span>
                                <span className="text-[10px] text-gray-600 truncate flex-1">{ex.desc}</span>
                                <button onClick={e => { e.stopPropagation(); scheduleJob(ex.name, ex.schedule, ex.npc ? `${ex.command} --npc ${ex.npc}` : ex.command); }}
                                    disabled={loading} className="px-2 py-0.5 text-[10px] bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded disabled:opacity-30 flex-shrink-0">
                                    Enable
                                </button>
                            </>}>
                                <div className="space-y-1">
                                    <Field label="Schedule"><span className="font-mono text-[10px] text-gray-300">{ex.schedule}</span> <span className="text-[10px] text-gray-500">({humanSchedule(ex.schedule)})</span></Field>
                                    <Field label="Command"><pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap select-all">{ex.command}</pre></Field>
                                    <Field label="Description"><span className="text-[10px] text-gray-400">{ex.desc}</span></Field>
                                </div>
                            </ExpandRow>
                        ))}
                    </Section>
                </>)}

                {activeTab === 'daemons' && (<>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
                                placeholder="Filter..." className="w-full pl-6 pr-2 py-1.5 text-xs theme-bg-primary border theme-border rounded focus:border-blue-500 focus:outline-none" />
                        </div>
                        <button onClick={() => setShowAddDaemon(!showAddDaemon)}
                            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${showAddDaemon ? 'bg-purple-600 text-white' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}>
                            <Plus size={12} /> New Daemon
                        </button>
                    </div>

                    {showAddDaemon && (
                        <div className="p-3 bg-purple-900/15 border border-purple-500/30 rounded-lg space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Name</label>
                                    <input type="text" value={newDaemonName} onChange={e => setNewDaemonName(e.target.value.replace(/[^a-zA-Z0-9_-]/g,'_'))} placeholder="my_daemon" className={inputCls} />
                                </div>
                                {npcList.length > 0 && (
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">NPC (optional)</label>
                                        <select value={newDaemonNpc} onChange={e => setNewDaemonNpc(e.target.value)} className={inputCls}>
                                            <option value="">None</option>
                                            {npcList.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">Command</label>
                                <textarea value={newDaemonCommand} onChange={e => setNewDaemonCommand(e.target.value)}
                                    placeholder={IS_WIN ? 'powershell -Command "..."' : IS_MAC ? 'fswatch ~/Downloads | while read f; do ...' : 'inotifywait -m -e create ~/Downloads ...'}
                                    rows={3}
                                    className={`${inputCls} resize-y min-h-[60px]`} />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => startDaemon(newDaemonName, newDaemonCommand, newDaemonNpc)}
                                    disabled={loading || !newDaemonName || !newDaemonCommand}
                                    className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs disabled:opacity-50 flex items-center justify-center gap-1">
                                    <Play size={12} /> Start
                                </button>
                                <button onClick={() => setShowAddDaemon(false)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Cancel</button>
                            </div>
                        </div>
                    )}

                    {appDaemons.length > 0 && (
                        <Section title="Running (app-spawned)" count={appDaemons.length} icon={Play}>
                            {appDaemons.map(d => (
                                <ExpandRow key={d.id} header={<>
                                    <Play size={10} className="text-green-400 flex-shrink-0" />
                                    <span className="font-mono text-xs text-gray-200">{d.name}</span>
                                    {d.npc && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded">{d.npc}</span>}
                                    <div className="ml-auto flex gap-1" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => editDaemon(d)} className="p-1 text-gray-400 hover:text-blue-400 rounded text-[10px] flex items-center gap-0.5"><Edit2 size={10} /> Edit</button>
                                        <button onClick={() => killDaemon(d.id)} className="p-1 text-gray-400 hover:text-red-400 rounded text-[10px] flex items-center gap-0.5"><Square size={10} /> Kill</button>
                                    </div>
                                </>}>
                                    <div className="space-y-1">
                                        <Field label="Command"><pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap select-all">{d.command}</pre></Field>
                                        {d.npc && <Field label="NPC"><span className="text-[10px] text-purple-300">{d.npc}</span></Field>}
                                        {d.path && <Field label="Path"><span className="text-[10px] text-gray-400 font-mono">{d.path}</span></Field>}
                                    </div>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {appDaemons.length === 0 && !showAddDaemon && (
                        <Section title="Quick Start" icon={Sparkles} defaultOpen={true}>
                            {EXAMPLE_DAEMONS.filter(e => !appDaemons.some((d: any) => d.name === e.name)).map(ex => (
                                <ExpandRow key={ex.name} header={<>
                                    <span className="font-mono text-xs text-gray-300">{ex.name}</span>
                                    <span className="text-[10px] text-gray-600 truncate flex-1">{ex.desc}</span>
                                    <button onClick={e => { e.stopPropagation(); setNewDaemonName(ex.name); setNewDaemonCommand(ex.command); setNewDaemonNpc(ex.npc || ''); setShowAddDaemon(true); }}
                                        className="px-2 py-0.5 text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded flex-shrink-0">
                                        Use
                                    </button>
                                </>}>
                                    <div className="space-y-1">
                                        <Field label="Command"><pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap select-all">{ex.command}</pre></Field>
                                        {ex.npc && <Field label="NPC"><span className="text-[10px] text-purple-300">{ex.npc}</span></Field>}
                                    </div>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {systemDaemons?.npcsh_services?.length > 0 && (
                        <Section title="NPC Triggers" count={systemDaemons.npcsh_services.length} icon={Zap}>
                            {systemDaemons.npcsh_services.map((s: string, i: number) => (
                                <ExpandRow key={i} header={<span className="text-xs font-mono text-blue-300">{s}</span>}>
                                    <Field label="Location"><span className="text-[10px] text-gray-400 font-mono">~/.npcsh/triggers/{s}</span></Field>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {parsedUserCron.length > 0 && (
                        <Section title="User Crontab" count={parsedUserCron.length} icon={Clock}>
                            {parsedUserCron.filter(c => !filter || c.command.toLowerCase().includes(filter.toLowerCase())).map((c, i) => (
                                <ExpandRow key={i} header={<>
                                    <span className="font-mono text-xs text-gray-300 truncate flex-1">{c.command}</span>
                                    <span className="text-[10px] text-blue-400/70 flex-shrink-0">{humanSchedule(c.schedule)}</span>
                                </>}>
                                    <div className="space-y-1">
                                        <Field label="Schedule"><span className="font-mono text-[10px] text-gray-300">{c.schedule}</span> <span className="text-[10px] text-gray-500">({humanSchedule(c.schedule)})</span></Field>
                                        <Field label="Command"><pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap select-all">{c.command}</pre></Field>
                                    </div>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {/* Linux/macOS: /etc/crontab */}
                    {!IS_WIN && parsedSysCron.length > 0 && (
                        <Section title="/etc/crontab" count={parsedSysCron.length} icon={Cpu} defaultOpen={false}>
                            {parsedSysCron.filter(c => !filter || c.command.toLowerCase().includes(filter.toLowerCase())).map((c, i) => (
                                <ExpandRow key={i} header={<>
                                    <span className="font-mono text-xs text-gray-300 truncate flex-1">{c.command}</span>
                                    <span className="text-[10px] text-blue-400/70 flex-shrink-0">{c.schedule}</span>
                                </>}>
                                    <Field label="Schedule"><span className="font-mono text-[10px] text-gray-300">{c.schedule}</span></Field>
                                    <Field label="Command"><pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap select-all">{c.command}</pre></Field>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {/* Linux: /etc/cron.d/ */}
                    {IS_LINUX && systemData?.cron_d?.length > 0 && (
                        <Section title="/etc/cron.d/" count={systemData.cron_d.length} defaultOpen={false}>
                            {systemData.cron_d.map((f: any, i: number) => (
                                <ExpandRow key={i} header={<span className="text-xs text-gray-300">{f.name}</span>}>
                                    <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-auto select-all">{f.content}</pre>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {/* macOS: LaunchDaemon/LaunchAgent plists */}
                    {IS_MAC && systemData?.cron_d?.length > 0 && (
                        <Section title="Launch Plists" count={systemData.cron_d.length} icon={FileText} defaultOpen={false}>
                            {systemData.cron_d.map((f: any, i: number) => (
                                <ExpandRow key={i} header={<span className="text-xs text-gray-300">{f.name}</span>}>
                                    <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-auto select-all">{f.content}</pre>
                                </ExpandRow>
                            ))}
                        </Section>
                    )}

                    {/* Linux: Systemd Timers */}
                    {IS_LINUX && parsedTimers.length > 0 && (
                        <Section title="Systemd Timers" count={parsedTimers.length} icon={Clock}>
                            {parsedTimers.filter(t => !filter || t.unit.toLowerCase().includes(filter.toLowerCase())).map((t, i) => {
                                const info = serviceInfo[t.unit] || {};
                                return (
                                <ExpandRow key={i} header={<>
                                    <span className="font-mono text-xs text-purple-300">{t.unit}</span>
                                    {t.left && <span className="text-[10px] text-green-400/80 ml-auto">{t.left}</span>}
                                </>}>
                                    <div className="space-y-1.5">
                                        {t.next && <Field label="Next"><span className="text-[10px] text-gray-300">{t.next}</span></Field>}
                                        {t.passed && <Field label="Last"><span className="text-[10px] text-gray-300">{t.passed}</span></Field>}
                                        {t.left && <Field label="In"><span className="text-[10px] text-green-400">{t.left}</span></Field>}
                                        {!info.unit_file && !info.loading && (
                                            <button onClick={() => fetchServiceInfo(t.unit + '.timer')} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                <Eye size={10} /> Load unit file & logs
                                            </button>
                                        )}
                                        {info.loading && <div className="text-[10px] text-gray-500 italic">Loading...</div>}
                                        {info.unit_file && (<>
                                            <div className="text-[10px] text-gray-500 font-medium mt-1">Unit file</div>
                                            <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-all">{info.unit_file}</pre>
                                        </>)}
                                        {info.journal && (<>
                                            <div className="text-[10px] text-gray-500 font-medium mt-1">Journal (last 100 lines)</div>
                                            <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap select-all">{info.journal}</pre>
                                        </>)}
                                    </div>
                                </ExpandRow>
                                );
                            })}
                        </Section>
                    )}

                    {/* Linux: System Services (systemd) */}
                    {IS_LINUX && parsedRunningSvcs.length > 0 && (
                        <Section title="System Services (running)" count={parsedRunningSvcs.length} icon={Cpu}>
                            <div className="max-h-[400px] overflow-y-auto space-y-1">
                                {parsedRunningSvcs.filter(s => !filter || s.unit.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase())).map((s, i) => {
                                    const info = serviceInfo[s.unit] || {};
                                    return (
                                    <ExpandRow key={i} header={<>
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.sub === 'running' ? 'bg-green-400' : s.sub === 'failed' ? 'bg-red-400' : 'bg-gray-500'}`} />
                                        <span className="font-mono text-xs text-gray-300 truncate">{s.unit}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded ml-auto ${s.sub === 'running' ? 'bg-green-900/30 text-green-400' : s.sub === 'failed' ? 'bg-red-900/30 text-red-400' : 'bg-gray-800 text-gray-500'}`}>{s.sub}</span>
                                    </>}>
                                        <div className="space-y-1.5">
                                            <Field label="Unit"><span className="font-mono text-[10px] text-gray-300">{s.unit}.service</span></Field>
                                            <Field label="Load"><span className="text-[10px] text-gray-300">{s.load}</span></Field>
                                            <Field label="Active"><span className="text-[10px] text-gray-300">{s.active} ({s.sub})</span></Field>
                                            {s.description && <Field label="Desc"><span className="text-[10px] text-gray-300">{s.description}</span></Field>}
                                            {!info.unit_file && !info.loading && (
                                                <button onClick={() => fetchServiceInfo(s.unit)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                    <Eye size={10} /> Load unit file & journal
                                                </button>
                                            )}
                                            {info.loading && <div className="text-[10px] text-gray-500 italic">Loading...</div>}
                                            {info.unit_file && (<>
                                                <div className="text-[10px] text-gray-500 font-medium mt-1">Unit file</div>
                                                <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-all">{info.unit_file}</pre>
                                            </>)}
                                            {info.journal && (<>
                                                <div className="text-[10px] text-gray-500 font-medium mt-1">journalctl (last 100 lines)</div>
                                                <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap select-all">{info.journal}</pre>
                                            </>)}
                                        </div>
                                    </ExpandRow>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {/* Linux: User Services (systemd --user) */}
                    {IS_LINUX && (parsedUserSvcs.length > 0 || parsedDaemonUserSvcs.length > 0) && (
                        <Section title="User Services" count={parsedUserSvcs.length + parsedDaemonUserSvcs.length} icon={Activity}>
                            <div className="max-h-[400px] overflow-y-auto space-y-1">
                                {[...parsedUserSvcs, ...parsedDaemonUserSvcs].filter(s => !filter || s.unit.toLowerCase().includes(filter.toLowerCase())).map((s, i) => {
                                    const info = serviceInfo[s.unit] || {};
                                    return (
                                    <ExpandRow key={i} header={<>
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.sub === 'running' ? 'bg-green-400' : s.sub === 'failed' ? 'bg-red-400' : 'bg-gray-500'}`} />
                                        <span className="font-mono text-xs text-gray-300 truncate">{s.unit}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded ml-auto ${s.sub === 'running' ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>{s.sub}</span>
                                    </>}>
                                        <div className="space-y-1.5">
                                            <Field label="Unit"><span className="font-mono text-[10px] text-gray-300">{s.unit}.service</span></Field>
                                            <Field label="Active"><span className="text-[10px] text-gray-300">{s.active} ({s.sub})</span></Field>
                                            {s.description && <Field label="Desc"><span className="text-[10px] text-gray-300">{s.description}</span></Field>}
                                            {!info.unit_file && !info.loading && (
                                                <button onClick={() => fetchServiceInfo(s.unit)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                    <Eye size={10} /> Load unit file & journal
                                                </button>
                                            )}
                                            {info.loading && <div className="text-[10px] text-gray-500 italic">Loading...</div>}
                                            {info.unit_file && (<>
                                                <div className="text-[10px] text-gray-500 font-medium mt-1">Unit file</div>
                                                <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-all">{info.unit_file}</pre>
                                            </>)}
                                            {info.journal && (<>
                                                <div className="text-[10px] text-gray-500 font-medium mt-1">journalctl (last 100 lines)</div>
                                                <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap select-all">{info.journal}</pre>
                                            </>)}
                                        </div>
                                    </ExpandRow>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {/* macOS: Launch Daemons / Agents */}
                    {IS_MAC && parsedLaunchdJobs.length > 0 && (
                        <Section title="Launch Daemons" count={parsedLaunchdJobs.length} icon={Cpu}>
                            <div className="max-h-[400px] overflow-y-auto space-y-1">
                                {parsedLaunchdJobs.filter(j => !filter || j.label.toLowerCase().includes(filter.toLowerCase())).map((j, i) => (
                                    <ExpandRow key={i} header={<>
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${j.pid ? 'bg-green-400' : j.status === '0' ? 'bg-gray-500' : 'bg-red-400'}`} />
                                        <span className="font-mono text-xs text-gray-300 truncate">{j.label}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded ml-auto ${j.pid ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                            {j.pid ? `PID ${j.pid}` : 'stopped'}
                                        </span>
                                    </>}>
                                        <div className="space-y-1">
                                            <Field label="Label"><span className="font-mono text-[10px] text-gray-300">{j.label}</span></Field>
                                            {j.pid && <Field label="PID"><span className="text-[10px] text-green-400">{j.pid}</span></Field>}
                                            <Field label="Exit code"><span className="text-[10px] text-gray-300">{j.lastExitStatus || '0'}</span></Field>
                                        </div>
                                    </ExpandRow>
                                ))}
                            </div>
                        </Section>
                    )}

                    {IS_MAC && parsedLaunchdUserJobs.length > 0 && (
                        <Section title="User Launch Agents" count={parsedLaunchdUserJobs.length} icon={Activity}>
                            <div className="max-h-[400px] overflow-y-auto space-y-1">
                                {parsedLaunchdUserJobs.filter(j => !filter || j.label.toLowerCase().includes(filter.toLowerCase())).map((j, i) => (
                                    <ExpandRow key={i} header={<>
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${j.pid ? 'bg-green-400' : 'bg-gray-500'}`} />
                                        <span className="font-mono text-xs text-gray-300 truncate">{j.label}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded ml-auto ${j.pid ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                            {j.pid ? `PID ${j.pid}` : 'stopped'}
                                        </span>
                                    </>}>
                                        <div className="space-y-1">
                                            <Field label="Label"><span className="font-mono text-[10px] text-gray-300">{j.label}</span></Field>
                                            {j.pid && <Field label="PID"><span className="text-[10px] text-green-400">{j.pid}</span></Field>}
                                            <Field label="Exit code"><span className="text-[10px] text-gray-300">{j.lastExitStatus || '0'}</span></Field>
                                        </div>
                                    </ExpandRow>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Windows: Scheduled Tasks */}
                    {IS_WIN && parsedWinTasks.length > 0 && (
                        <Section title="Scheduled Tasks" count={parsedWinTasks.length} icon={Clock}>
                            <div className="max-h-[400px] overflow-y-auto space-y-1">
                                {parsedWinTasks.filter(t => !filter || t.taskName.toLowerCase().includes(filter.toLowerCase())).map((t, i) => (
                                    <ExpandRow key={i} header={<>
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'Running' ? 'bg-green-400' : t.status === 'Ready' ? 'bg-blue-400' : t.status === 'Disabled' ? 'bg-gray-500' : 'bg-yellow-400'}`} />
                                        <span className="font-mono text-xs text-gray-300 truncate">{t.taskName}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded ml-auto ${
                                            t.status === 'Running' ? 'bg-green-900/30 text-green-400' :
                                            t.status === 'Ready' ? 'bg-blue-900/30 text-blue-400' :
                                            'bg-gray-800 text-gray-500'
                                        }`}>{t.status}</span>
                                    </>}>
                                        <div className="space-y-1">
                                            <Field label="Task"><span className="font-mono text-[10px] text-gray-300">{t.taskName}</span></Field>
                                            <Field label="Status"><span className="text-[10px] text-gray-300">{t.status}</span></Field>
                                            {t.nextRun && <Field label="Next run"><span className="text-[10px] text-gray-300">{t.nextRun}</span></Field>}
                                            {t.lastRun && <Field label="Last run"><span className="text-[10px] text-gray-300">{t.lastRun}</span></Field>}
                                        </div>
                                    </ExpandRow>
                                ))}
                            </div>
                        </Section>
                    )}
                </>)}

                {activeTab === 'nql' && (<>
                    <Section title="Your SQL Models" count={sqlModels.length} icon={Table}
                        actions={
                            <button onClick={() => { setShowNewModel(!showNewModel); setEditModel(null); setModelForm({ name: '', sql: '', description: '', materialization: 'table', npc: '' }); }}
                                className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${showNewModel ? 'bg-emerald-600 text-white' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'}`}>
                                <Plus size={10} /> New Model
                            </button>
                        }>

                        {(showNewModel || editModel) && (
                            <div className="p-3 bg-emerald-900/15 border border-emerald-500/30 rounded-lg space-y-2 mb-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Name</label>
                                        <input type="text" value={modelForm.name} onChange={e => setModelForm({ ...modelForm, name: e.target.value.replace(/[^a-zA-Z0-9_]/g,'_') })} placeholder="model_name" className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Materialization</label>
                                        <select value={modelForm.materialization} onChange={e => setModelForm({ ...modelForm, materialization: e.target.value })} className={inputCls}>
                                            <option value="table">table</option>
                                            <option value="view">view</option>
                                            <option value="incremental">incremental</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">NPC</label>
                                        <select value={modelForm.npc} onChange={e => setModelForm({ ...modelForm, npc: e.target.value })} className={inputCls}>
                                            <option value="">Default</option>
                                            {npcList.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Description</label>
                                    <input type="text" value={modelForm.description} onChange={e => setModelForm({ ...modelForm, description: e.target.value })} placeholder="What does this model do?" className={inputCls} />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">SQL</label>
                                    <textarea value={modelForm.sql} onChange={e => setModelForm({ ...modelForm, sql: e.target.value })}
                                        placeholder="SELECT nql.get_llm_response('...', 'npc') as result FROM ..."
                                        className={inputCls + ' min-h-[100px] resize-y'} rows={5} />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={saveModel} disabled={loading || !modelForm.name || !modelForm.sql}
                                        className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs disabled:opacity-50 flex items-center justify-center gap-1">
                                        <Save size={12} /> Save Model
                                    </button>
                                    <button onClick={() => { setShowNewModel(false); setEditModel(null); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Cancel</button>
                                </div>
                            </div>
                        )}

                        {sqlModels.length === 0 && !showNewModel ? (
                            <div className="text-center py-4 text-gray-500 text-xs">
                                <Table size={20} className="mx-auto mb-1 opacity-50" />
                                No SQL models yet. Create one or save a template below.
                            </div>
                        ) : (
                            sqlModels.map(model => (
                                <ExpandRow key={model.id} header={<>
                                    <Table size={12} className="text-emerald-400 flex-shrink-0" />
                                    <span className="font-mono text-xs text-gray-300">{model.name}</span>
                                    <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
                                        model.materialization === 'table' ? 'bg-blue-900/30 text-blue-400' :
                                        model.materialization === 'view' ? 'bg-green-900/30 text-green-400' :
                                        'bg-orange-900/30 text-orange-400'
                                    }`}>{model.materialization}</span>
                                    {model.isGlobal && <span className="text-[10px] text-gray-600">global</span>}
                                    <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => runModel(model)} className="p-1 text-emerald-400 hover:text-emerald-300 rounded" title="Run"><Play size={12} /></button>
                                        <button onClick={() => { setEditModel(model); setShowNewModel(false); setModelForm({ name: model.name, sql: model.sql, description: model.description || '', materialization: model.materialization, npc: model.npc || '' }); }}
                                            className="p-1 text-gray-400 hover:text-white rounded" title="Edit"><Edit2 size={12} /></button>
                                        <button onClick={() => deleteModel(model)} className="p-1 text-gray-400 hover:text-red-400 rounded" title="Delete"><Trash2 size={12} /></button>
                                    </div>
                                </>}>
                                    <div className="space-y-1.5">
                                        {model.description && <Field label="Description"><span className="text-[10px] text-gray-400">{model.description}</span></Field>}
                                        {model.npc && <Field label="NPC"><span className="text-[10px] text-purple-300">{model.npc}</span></Field>}
                                        {model.schedule && <Field label="Schedule"><span className="text-[10px] text-amber-400">{model.schedule}</span></Field>}
                                        <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-all">{model.sql}</pre>
                                        {modelRunResult[model.id] && (
                                            <div className={`text-[10px] p-2 rounded ${modelRunResult[model.id].startsWith('Error') ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
                                                {modelRunResult[model.id]}
                                            </div>
                                        )}
                                        <button onClick={() => { scheduleJob(`run_${model.name}`, model.schedule || '0 0 * * *', `run:${model.name}`); setActiveTab('jobs'); }}
                                            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                                            <Clock size={10} /> Schedule as cron job
                                        </button>
                                    </div>
                                </ExpandRow>
                            ))
                        )}
                    </Section>

                    <Section title="Model Templates" count={EXAMPLE_SQL_MODELS.filter(e => !sqlModels.some(m => m.name === e.name)).length} icon={Sparkles} defaultOpen={sqlModels.length === 0}>
                        {EXAMPLE_SQL_MODELS.filter(e => !sqlModels.some(m => m.name === e.name)).map(ex => (
                            <ExpandRow key={ex.id} header={<>
                                <Database size={12} className="text-blue-400 flex-shrink-0" />
                                <span className="font-mono text-xs text-gray-300">{ex.name}</span>
                                <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
                                    ex.materialization === 'table' ? 'bg-blue-900/30 text-blue-400' :
                                    ex.materialization === 'view' ? 'bg-green-900/30 text-green-400' :
                                    'bg-orange-900/30 text-orange-400'
                                }`}>{ex.materialization}</span>
                                <span className="text-[10px] text-gray-500 truncate flex-1">{ex.description}</span>
                                <button onClick={e => { e.stopPropagation(); saveExampleModel(ex); }}
                                    disabled={loading} className="px-2 py-0.5 text-[10px] bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded disabled:opacity-30 flex-shrink-0">
                                    Save & Use
                                </button>
                            </>}>
                                <div className="space-y-1">
                                    <Field label="Description"><span className="text-[10px] text-gray-400">{ex.description}</span></Field>
                                    {ex.npc && <Field label="NPC"><span className="text-[10px] text-purple-300">{ex.npc}</span></Field>}
                                    <pre className="text-[10px] font-mono text-gray-400 bg-black/20 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-all">{ex.sql}</pre>
                                </div>
                            </ExpandRow>
                        ))}
                    </Section>

                    <Section title="NQL Functions Reference" icon={Code} defaultOpen={false}>
                        {NQL_CATEGORIES.map(cat => (
                            <div key={cat} className="mb-2">
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{cat}</div>
                                {NQL_FUNCTIONS.filter(f => f.category === cat).map(fn => (
                                    <div key={fn.name} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-white/5 group">
                                        <code className={`font-mono text-xs ${fn.color}`}>nql.{fn.name}()</code>
                                        <span className="text-[10px] text-gray-500 flex-1">{fn.description}</span>
                                        <button onClick={() => navigator.clipboard.writeText(`nql.${fn.name}()`)}
                                            className="p-1 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100" title="Copy">
                                            <Copy size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}

                        <div className="mt-3 p-3 bg-gray-800/50 border theme-border rounded-lg">
                            <div className="text-[10px] font-semibold text-gray-400 mb-2 flex items-center gap-1"><Sparkles size={10} /> Example NQL Query</div>
                            <pre className="text-[10px] font-mono text-gray-400 bg-black/20 p-2 rounded select-all whitespace-pre-wrap">{`SELECT
    conversation_id,
    extract_facts(content) as facts,
    get_llm_response('summarize: ' || content) as summary
FROM messages
WHERE timestamp > datetime('now', '-7 days')
LIMIT 100;`}</pre>
                        </div>
                    </Section>
                </>)}
            </div>

            <div className="px-4 py-2 border-t theme-border text-[10px] text-gray-500 flex items-center justify-between flex-shrink-0">
                <span className="truncate">{currentPath || '~'}</span>
                <span>{jobs.length} jobs, {appDaemons.length} daemons, {sqlModels.length} models</span>
            </div>
        </div>
    );

    if (isPane) return <div className="flex-1 flex flex-col overflow-hidden theme-bg-secondary">{content}</div>;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {content}
            </div>
        </div>
    );
};

export default CronDaemonPanel;
