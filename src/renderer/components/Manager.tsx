import React, { useEffect, useState, useRef } from 'react';
import AccountPane from './AccountPane';
import ModelManager from './ModelManager';
import {
  Box, Server, Monitor, Info, RefreshCw, Play, Square, RotateCcw,
  Terminal, Maximize2, Minus, X, XIcon, Eye, Trash2, AlertCircle, CheckCircle,
  Download, ExternalLink, Cpu, HardDrive, User, Settings, Activity,
  ChevronRight, ChevronDown, Copy, Check, Users, Plus, Search
} from 'lucide-react';

type TabKey = 'overview' | 'workspaces' | 'backend' | 'device' | 'teams' | 'account' | 'updates' | 'models';

type BackendStatus = 'ok' | 'unhealthy' | 'unreachable' | 'unknown';

interface BackendHealth {
  status: BackendStatus;
  pid?: number | null;
  backendProcess?: { running: boolean; pid?: number; exitCode?: number | null };
  pythonPath?: string;
  backendUrl?: string;
  error?: string;
  timestamp?: string;
}

interface WorkspaceInfo {
  folderPath: string;
  lastAccessed?: number | null;
  firstSeen?: number | null;
  isOpen?: boolean;
}

interface WindowInfo {
  windowId: number;
  title: string;
  folderPath: string | null;
  bounds: { x: number; y: number; width: number; height: number };
  display: number;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
}

interface ManagerState {
  version: string;
  backend: BackendHealth | null;
  windows: WindowInfo[];
  workspaces: WorkspaceInfo[];
  device: DeviceInfo | null;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const api = (window as any).api || {};

function useInterval(callback: () => void, delay: number | null) {
  const savedRef = useRef(callback);
  useEffect(() => { savedRef.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function classNames(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ');
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-sm text-rose-400">
          Account pane failed to load: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const StatusBadge: React.FC<{ status: BackendStatus }> = ({ status }) => {
  const styles = {
    ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    unhealthy: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    unreachable: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }[status];
  const Icon = status === 'ok' ? CheckCircle : status === 'unreachable' ? AlertCircle : Activity;
  return (
    <span className={classNames('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border', styles)}>
      <Icon size={12} /> {status.toUpperCase()}
    </span>
  );
};

const OverviewTab: React.FC<{ state: ManagerState; onRefresh: () => void; loading: boolean }> = ({ state, onRefresh, loading }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="theme-bg-secondary border theme-border rounded p-4">
          <div className="flex items-center gap-2 theme-text-muted mb-2 text-xs">
            <Info size={14} /> Application
          </div>
          <div className="text-lg font-medium theme-text-primary">Incognide</div>
          <div className="text-sm theme-text-muted">Version {state.version || '—'}</div>
          <button
            onClick={() => api.openExternal?.('https://github.com/NPC-Worldwide/incognide/releases')}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink size={12} /> View releases
          </button>
        </div>
        <div className="theme-bg-secondary border theme-border rounded p-4">
          <div className="flex items-center gap-2 theme-text-muted mb-2 text-xs">
            <Server size={14} /> Backend
          </div>
          <div className="text-lg font-medium theme-text-primary">{state.backend?.status ? <StatusBadge status={state.backend.status} /> : '—'}</div>
          <div className="text-sm theme-text-muted mt-1">
            PID {state.backend?.pid ?? '—'} · {state.backend?.backendUrl ?? '—'}
          </div>
          <div className="text-xs theme-text-muted mt-1">
            {state.backend?.pythonPath || 'No python path configured'}
          </div>
        </div>
      </div>
      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 theme-text-muted text-xs">
            <Monitor size={14} /> Workspaces
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded hover:theme-bg-tertiary theme-text-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={classNames(loading && 'animate-spin')} />
          </button>
        </div>
        <div className="text-2xl font-medium theme-text-primary mt-2">{state.workspaces?.length ?? 0}</div>
        <div className="text-xs theme-text-muted">Saved workspace folders</div>
      </div>
    </div>
  );
};

const WorkspacesTab: React.FC<{ state: ManagerState; onRefresh: () => void; loading: boolean }> = ({ state, onRefresh, loading }) => {
  const [confirmForget, setConfirmForget] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(true);

  const openWorkspace = async (folderPath: string) => {
    await api.openNewWindow?.(folderPath);
    // Reflect the newly opened window without waiting for the next poll.
    setTimeout(() => onRefresh(), 600);
  };

  const forgetWorkspace = (folderPath: string) => {
    api.forgetWorkspace?.(folderPath);
    setConfirmForget(null);
    onRefresh();
  };

  const workspaceIsOpen = (ws: WorkspaceInfo) => (
    typeof ws.isOpen === 'boolean'
      ? ws.isOpen
      : (state.windows || []).some((w) => w.folderPath && w.folderPath.replace(/\/+$/, '') === ws.folderPath.replace(/\/+$/, ''))
  );

  const allWorkspaces = state.workspaces || [];
  const openCount = allWorkspaces.filter(workspaceIsOpen).length;
  const closedCount = allWorkspaces.length - openCount;
  const visibleWorkspaces = showClosed ? allWorkspaces : allWorkspaces.filter(workspaceIsOpen);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs theme-text-muted">
          {allWorkspaces.length} known workspace{allWorkspaces.length === 1 ? '' : 's'} · {openCount} open · {closedCount} closed
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => api.reopenClosedWindows?.()}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
          >
            <ExternalLink size={12} /> Reopen all
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs theme-text-muted hover:theme-bg-tertiary disabled:opacity-50"
          >
            <RefreshCw size={12} className={classNames(loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>
      {allWorkspaces.length === 0 && (
        <div className="theme-bg-secondary border theme-border rounded p-6 text-center text-sm theme-text-muted">
          No saved workspaces.
        </div>
      )}
      {allWorkspaces.length > 0 && (
        <button
          onClick={() => setShowClosed((v) => !v)}
          className="text-[10px] px-2 py-1 rounded border theme-border theme-text-muted hover:theme-bg-tertiary"
        >
          {showClosed ? 'Hide closed workspaces' : `Show ${closedCount} closed workspace${closedCount === 1 ? '' : 's'}`}
        </button>
      )}
      {visibleWorkspaces.map((ws) => {
        const isOpen = workspaceIsOpen(ws);
        return (
          <div
            key={ws.folderPath}
            className={classNames(
              'theme-bg-secondary border theme-border rounded p-3 flex items-center justify-between gap-3',
              !isOpen && 'opacity-60'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium theme-text-primary truncate flex items-center gap-1.5">
                {ws.folderPath.split('/').pop() || 'Untitled'}
                <span className={classNames(
                  'text-[9px] px-1.5 py-0.5 rounded font-normal',
                  isOpen ? 'bg-emerald-600/20 text-emerald-300' : 'bg-gray-600/30 theme-text-muted'
                )}>
                  {isOpen ? 'open' : 'closed'}
                </span>
              </div>
              <div className="text-xs theme-text-muted truncate">{ws.folderPath}</div>
              {ws.lastAccessed ? (
                <div className="text-[10px] theme-text-muted mt-0.5">Last opened {formatDate(new Date(ws.lastAccessed).toISOString())}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {!isOpen && (
                <button onClick={() => openWorkspace(ws.folderPath)} title="Open workspace" className="p-1.5 rounded hover:theme-bg-tertiary text-emerald-400">
                  <ExternalLink size={14} />
                </button>
              )}
              {isOpen && (
                <button
                  onClick={() => {
                    const win = (state.windows || []).find((w) => w.folderPath && w.folderPath.replace(/\/+$/, '') === ws.folderPath.replace(/\/+$/, ''));
                    if (win) api.focusWindowById?.(win.windowId);
                  }}
                  title="Focus open window"
                  className="p-1.5 rounded hover:theme-bg-tertiary theme-text-muted"
                >
                  <Eye size={14} />
                </button>
              )}
              {confirmForget === ws.folderPath ? (
                <>
                  <button onClick={() => forgetWorkspace(ws.folderPath)} title="Confirm forget" className="p-1.5 rounded hover:theme-bg-tertiary text-rose-400"><Trash2 size={14} /></button>
                  <button onClick={() => setConfirmForget(null)} title="Cancel" className="p-1.5 rounded hover:theme-bg-tertiary theme-text-muted"><XIcon size={14} /></button>
                </>
              ) : (
                <button onClick={() => setConfirmForget(ws.folderPath)} title="Forget saved workspace" className="p-1.5 rounded hover:theme-bg-tertiary theme-text-muted"><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BackendTab: React.FC<{ health: BackendHealth | null; onRefresh: () => void }> = ({ health, onRefresh }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [logsOpen, setLogsOpen] = useState(false);
  const [logType, setLogType] = useState<'backend' | 'electron'>('backend');
  const [installOpen, setInstallOpen] = useState(false);
  const [pythonPath, setPythonPath] = useState('');
  const [installProgress, setInstallProgress] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!api.onBackendInstallProgress) return;
    return api.onBackendInstallProgress((data: { text: string }) => {
      setInstallProgress((prev) => [...prev.slice(-200), data.text]);
    });
  }, []);

  const doAction = async (name: string, fn: () => Promise<any>) => {
    setActionLoading(name);
    try { await fn(); } finally { setActionLoading(null); onRefresh(); }
  };

  const loadLogs = async (type: 'backend' | 'electron' = logType) => {
    try {
      const text = await api.readLogFile?.(type);
      const parsed = !text ? [] : text
        .split('\n')
        .filter((l: string) => l.trim())
        .slice(-400)
        .map((line: string) => ({
          timestamp: '',
          level: line.toLowerCase().includes('error') ? 'error' as const : line.toLowerCase().includes('warn') ? 'warn' as const : 'info' as const,
          message: line,
        }));
      setLogs((prev) => ({ ...prev, [type]: parsed }));
      setLogsOpen(true);
    } catch (err) {
      console.error(`Failed to load ${type} logs:`, err);
      setLogs((prev) => ({ ...prev, [type]: [] }));
    }
  };

  // Refresh the visible log every few seconds while the panel is open.
  useEffect(() => {
    if (!logsOpen) return;
    loadLogs(logType);
    const id = setInterval(() => { loadLogs(logType); }, 3000);
    return () => clearInterval(id);
  }, [logsOpen, logType]);

  const openLogsDir = async () => {
    try {
      const dirs = await api.getLogsDir?.();
      if (dirs?.logsDir) api.openFile?.(dirs.logsDir);
    } catch {}
  };

  const handleInstall = async () => {
    if (!pythonPath.trim()) return;
    setInstalling(true);
    setInstallProgress([]);
    try {
      const result = await api.installAndStartBackend?.({ pythonPath: pythonPath.trim(), npcpyExtras: 'lite' });
      if (!result?.success) {
        setInstallProgress((prev) => [...prev, `Failed: ${result?.error || 'unknown error'}`]);
      }
    } catch (err) {
      setInstallProgress((prev) => [...prev, `Error: ${String(err)}`]);
    } finally {
      setInstalling(false);
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium theme-text-primary">
            <Server size={14} /> Backend Status
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => doAction('start', () => api.startBackend?.())}
              disabled={!!actionLoading || health?.backendProcess?.running}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40"
            >
              <Play size={12} /> {actionLoading === 'start' ? 'Starting…' : 'Start'}
            </button>
            <button
              onClick={() => doAction('stop', () => api.stopBackend?.())}
              disabled={!!actionLoading || !health?.backendProcess?.running}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 disabled:opacity-40"
            >
              <Square size={12} /> {actionLoading === 'stop' ? 'Stopping…' : 'Stop'}
            </button>
            <button
              onClick={() => doAction('restart', () => api.restartBackend?.())}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40"
            >
              <RotateCcw size={12} /> {actionLoading === 'restart' ? 'Restarting…' : 'Restart'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="theme-bg-primary border theme-border rounded p-2">
            <div className="theme-text-muted">Status</div>
            <div className="mt-1">{health?.status ? <StatusBadge status={health.status} /> : '—'}</div>
          </div>
          <div className="theme-bg-primary border theme-border rounded p-2">
            <div className="theme-text-muted">Process</div>
            <div className="mt-1 theme-text-primary">{health?.backendProcess?.running ? `Running (PID ${health.pid ?? health.backendProcess.pid ?? '—'})` : 'Not running'}</div>
          </div>
          <div className="theme-bg-primary border theme-border rounded p-2 col-span-2">
            <div className="theme-text-muted">Path</div>
            <div className="mt-1 theme-text-primary font-mono break-all">{health?.pythonPath || '—'}</div>
          </div>
          <div className="theme-bg-primary border theme-border rounded p-2 col-span-2">
            <div className="theme-text-muted">URL</div>
            <div className="mt-1 theme-text-primary font-mono">{health?.backendUrl || '—'}</div>
          </div>
          {health?.error && (
            <div className="theme-bg-primary border theme-border rounded p-2 col-span-2">
              <div className="theme-text-muted">Error</div>
              <div className="mt-1 text-rose-400 text-[11px]">{health.error}</div>
            </div>
          )}
        </div>
      </div>

      <div className="theme-bg-secondary border theme-border rounded p-3">
        <button
          onClick={() => setInstallOpen((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-medium theme-text-primary"
        >
          <span className="flex items-center gap-2"><Download size={14} /> Install / Repair Backend</span>
          {installOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {installOpen && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={pythonPath}
                onChange={(e) => setPythonPath(e.target.value)}
                placeholder="/usr/bin/python3"
                className="flex-1 px-2 py-1.5 rounded text-xs theme-bg-primary theme-text-primary border theme-border outline-none focus:border-blue-500"
              />
              <button
                onClick={async () => {
                  const result = await api.findLocalPython?.();
                  if (result?.found) setPythonPath(result.pythonPath);
                }}
                disabled={installing}
                className="px-2 py-1.5 rounded text-xs theme-bg-tertiary theme-text-primary hover:theme-text-muted disabled:opacity-50"
              >
                Auto-find
              </button>
            </div>
            <button
              onClick={handleInstall}
              disabled={installing || !pythonPath.trim()}
              className="px-3 py-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40"
            >
              {installing ? 'Installing…' : 'Install npcpy & start'}
            </button>
            {installProgress.length > 0 && (
              <div className="theme-bg-primary border theme-border rounded p-2 h-40 overflow-auto text-[10px] font-mono theme-text-muted">
                {installProgress.map((line, i) => (
                  <div key={i} className="py-0.5 border-b theme-border last:border-0">{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="theme-bg-secondary border theme-border rounded p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => { setLogsOpen((v) => !v); }}
            className="flex items-center gap-2 text-xs font-medium theme-text-primary"
          >
            <Terminal size={14} /> Logs
            {logsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="flex items-center gap-1">
            <div className="flex rounded border theme-border overflow-hidden">
              {(['backend', 'electron'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setLogType(t); setLogsOpen(true); }}
                  className={classNames(
                    'px-2 py-0.5 text-[10px] capitalize transition-colors',
                    logType === t ? 'bg-blue-600/25 text-blue-300' : 'theme-text-muted hover:theme-bg-tertiary'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadLogs(logType)}
              className="p-1 rounded hover:theme-bg-tertiary theme-text-muted"
              title="Refresh log"
            >
              <RefreshCw size={12} />
            </button>
            <button
              onClick={openLogsDir}
              className="p-1 rounded hover:theme-bg-tertiary theme-text-muted"
              title="Open logs folder"
            >
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
        {logsOpen && (
          <div className="mt-3 theme-bg-primary border theme-border rounded p-2 h-64 overflow-auto text-[10px] font-mono theme-text-muted">
            {(logs[logType] || []).length === 0 ? (
              <div className="theme-text-muted italic">No {logType} log entries.</div>
            ) : (
              [...(logs[logType] || [])].reverse().map((entry, i) => (
                <div key={i} className={classNames('py-0.5 border-b theme-border last:border-0 whitespace-pre-wrap break-all', entry.level === 'error' && 'text-rose-400', entry.level === 'warn' && 'text-amber-400')}>
                  {entry.message}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const DeviceTab: React.FC<{ device: DeviceInfo | null }> = ({ device }) => {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(device?.deviceName || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(device?.deviceName || '');
  }, [device?.deviceName]);

  const copyId = () => {
    if (!device?.deviceId) return;
    navigator.clipboard.writeText(device.deviceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await api.setDeviceName?.(name.trim());
    setSaving(false);
  };

  if (!device) {
    return (
      <div className="theme-bg-secondary border theme-border rounded p-6 text-center text-sm theme-text-muted">
        Device information unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center gap-2 theme-text-muted text-xs mb-3">
          <Cpu size={14} /> Device
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">Name</span>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-2 py-1 rounded text-xs theme-bg-primary theme-text-primary border theme-border outline-none focus:border-blue-500 w-48"
              />
              <button
                onClick={saveName}
                disabled={saving || name.trim() === device.deviceName}
                className="px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">Platform</span>
            <span className="theme-text-primary">{device.platform}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">Type</span>
            <span className="theme-text-primary">{device.deviceType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">Device ID</span>
            <button
              onClick={copyId}
              className="inline-flex items-center gap-1.5 text-xs theme-text-primary hover:text-blue-400"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {device.deviceId}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const UpdatesTab: React.FC<{ version: string }> = ({ version }) => {
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = api.onUpdateDownloadProgress?.((data: { progress: number }) => setDownloadProgress(data.progress));
    return () => unsub?.();
  }, []);

  const check = async () => {
    setChecking(true);
    setLatest(null);
    setHasUpdate(false);
    setReleaseUrl(null);
    setDownloaded(false);
    setDownloadProgress(null);
    setError(null);
    try {
      const result = await api.checkForUpdates?.();
      if (result?.latestVersion) {
        setLatest(result.latestVersion);
        setHasUpdate(!!result.hasUpdate);
        setReleaseUrl(result.releaseUrl || null);
      }
      else if (result?.error) setError(result.error);
      else setError('Update check unavailable.');
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  };

  const download = async () => {
    if (!releaseUrl) return;
    setDownloading(true);
    setDownloadProgress(0);
    setError(null);
    try {
      const result = await api.downloadAndInstallUpdate?.({ releaseUrl });
      if (result?.success) setDownloaded(true);
      else setError(result?.error || 'Download failed.');
    } catch (err) {
      setError(String(err));
    } finally {
      setDownloading(false);
    }
  };

  const upToDate = latest === version;

  return (
    <div className="space-y-4">
      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center gap-2 theme-text-muted text-xs mb-3">
          <Download size={14} /> Updates
        </div>
        <div className="text-sm theme-text-primary">Current version: <span className="font-medium">{version || '—'}</span></div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={check}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40"
          >
            <RefreshCw size={12} className={classNames(checking && 'animate-spin')} />
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          <button
            onClick={() => api.openExternal?.('https://github.com/NPC-Worldwide/incognide/releases/latest')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs theme-bg-tertiary theme-text-primary hover:theme-text-muted"
          >
            <ExternalLink size={12} /> Latest release
          </button>
        </div>
        {latest && (
          <div className={classNames('mt-3 text-sm', upToDate ? 'text-emerald-400' : 'text-amber-400')}>
            {upToDate ? `You are on the latest release (${latest}).` : `Latest release: ${latest}. An update is available.`}
          </div>
        )}
        {hasUpdate && releaseUrl && (
          <div className="mt-3">
            <button
              onClick={download}
              disabled={downloading || downloaded}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40"
            >
              <Download size={12} className={classNames(downloading && 'animate-spin')} />
              {downloaded ? 'Downloaded — installer launched' : downloading ? `Downloading… ${downloadProgress ?? 0}%` : `Download & install ${latest}`}
            </button>
            {downloading && downloadProgress !== null && (
              <div className="mt-2 h-1.5 theme-bg-tertiary rounded overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${downloadProgress}%` }} />
              </div>
            )}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-rose-400">{error}</div>}
      </div>
    </div>
  );
};

const TeamsTab: React.FC<{ workspacePaths?: string[]; windowPaths?: string[] }> = ({ workspacePaths = [], windowPaths = [] }) => {
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [discovered, setDiscovered] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.teamsRead?.();
      if (result?.error) setError(result.error);
      else setTeams(result?.teams || {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load teams');
    }
    setLoading(false);
  };

  const save = async (updated: Record<string, string>) => {
    setError(null);
    try {
      const result = await api.teamsWrite?.(updated);
      if (result?.error) {
        setError(result.error);
      } else {
        setTeams(updated);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save teams');
    }
  };

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const scanPaths = Array.from(new Set([...workspacePaths, ...windowPaths]));
      const scanArg = scanPaths[0] || '';
      const result = await api.teamsScan?.(scanArg);
      if (result?.error) setError(result.error);
      else setDiscovered(result?.discovered || []);
    } catch (err: any) {
      setError(err?.message || 'Team scan failed');
    }
    setScanning(false);
  };

  const addTeam = () => {
    const key = newName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!key || !newPath.trim()) return;
    const updated = { ...teams, [key]: newPath.trim() };
    save(updated);
    setNewName('');
    setNewPath('');
  };

  const removeTeam = (key: string) => {
    const updated = { ...teams };
    delete updated[key];
    save(updated);
  };

  const registerDiscovered = (team: any) => {
    const key = (team.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!key || teams[key]) return;
    const updated = { ...teams, [key]: team.path };
    save(updated);
    setDiscovered(prev => prev.filter(t => t.path !== team.path));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 theme-text-muted text-xs">
            <Users size={14} /> Registered Teams
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1 rounded hover:theme-bg-tertiary theme-text-muted disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={classNames(loading && 'animate-spin')} />
          </button>
        </div>

        {error && <div className="mb-3 text-sm text-rose-400">{error}</div>}

        {Object.keys(teams).length === 0 && (
          <div className="text-sm theme-text-muted mb-3">No teams registered.</div>
        )}

        <div className="space-y-2">
          {Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)).map(([key, teamPath]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2 rounded theme-bg-tertiary border theme-border text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium theme-text-primary truncate">{key}</div>
                <div className="theme-text-muted truncate">{teamPath}</div>
              </div>
              <button
                onClick={() => removeTeam(key)}
                className="ml-2 p-1 rounded hover:bg-rose-600/20 text-rose-400"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t theme-border space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="team name"
              className="flex-1 px-2 py-1.5 rounded text-xs theme-bg-primary theme-text-primary border theme-border outline-none focus:border-blue-500"
            />
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/npc_team or /path/to/project"
              className="flex-[2] px-2 py-1.5 rounded text-xs theme-bg-primary theme-text-primary border theme-border outline-none focus:border-blue-500"
            />
            <button
              onClick={addTeam}
              disabled={!newName.trim() || !newPath.trim()}
              className="px-3 py-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40 flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="theme-bg-secondary border theme-border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 theme-text-muted text-xs">
            <Search size={14} /> Discover Teams
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40"
          >
            <RefreshCw size={12} className={classNames(scanning && 'animate-spin')} />
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {discovered.length === 0 && !scanning && (
          <div className="text-sm theme-text-muted">No unregistered teams discovered.</div>
        )}

        <div className="space-y-2">
          {discovered.map((team, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded theme-bg-tertiary border theme-border text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium theme-text-primary truncate">{team.name || 'Unknown'}</div>
                <div className="theme-text-muted truncate">{team.path}</div>
                <div className="theme-text-muted">{team.npcCount || 0} NPC{team.npcCount !== 1 ? 's' : ''}</div>
              </div>
              <button
                onClick={() => registerDiscovered(team)}
                className="ml-2 px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[10px] flex items-center gap-1"
              >
                <Plus size={10} /> Register
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Manager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [state, setState] = useState<ManagerState>({ version: '', backend: null, windows: [], workspaces: [], device: null });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [version, backend, windows, workspaces, device] = await Promise.all([
        api.getAppVersion?.().catch(() => null),
        api.backendHealth?.().catch(() => null),
        api.getAllWindowsInfo?.().catch(() => []),
        api.getSavedWorkspaces?.().catch(() => []),
        api.getDeviceInfo?.().catch(() => null),
      ]);
      setState({ version: version || '', backend, windows: windows || [], workspaces: workspaces || [], device });
    } catch (err) {
      console.error('Manager refresh failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  useInterval(refresh, 5000);

  // Sorted alphabetically by label; the landing tab stays Overview.
  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'account', label: 'Account', icon: User },
    { key: 'backend', label: 'Backend', icon: Server },
    { key: 'device', label: 'Device', icon: HardDrive },
    { key: 'models', label: 'Models', icon: Box },
    { key: 'overview', label: 'Overview', icon: Box },
    { key: 'teams', label: 'Teams', icon: Users },
    { key: 'updates', label: 'Updates', icon: Download },
    { key: 'workspaces', label: 'Workspaces', icon: Monitor },
  ];

  return (
    <div className="h-screen flex flex-col theme-bg-primary theme-text-primary select-text">
      <div className="h-10 flex-shrink-0 flex items-center px-3 border-b theme-bg-secondary theme-border" style={{ WebkitAppRegion: 'drag' }}>
        <div className="flex items-center gap-2">
          <Settings size={14} className="theme-text-muted" />
          <span className="text-sm font-medium">Incognide Manager</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={refresh}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded hover:theme-bg-tertiary theme-text-muted disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={classNames(loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => api.closeManagerWindow?.()}
            className="w-9 h-9 flex items-center justify-center rounded hover:bg-rose-600 hover:text-white theme-text-muted transition-colors"
            title="Close Manager"
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 flex-shrink-0 border-r theme-border theme-bg-secondary p-2 space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={classNames(
                  'w-full flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors',
                  activeTab === t.key ? 'bg-blue-600/20 text-blue-400' : 'theme-text-muted hover:theme-text-primary hover:theme-bg-tertiary'
                )}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className={classNames('flex-1', activeTab === 'account' || activeTab === 'models' ? 'overflow-hidden' : 'overflow-auto p-4')}>
          {activeTab === 'overview' && <OverviewTab state={state} onRefresh={refresh} loading={loading} />}
          {activeTab === 'workspaces' && <WorkspacesTab state={state} onRefresh={refresh} loading={loading} />}
          {activeTab === 'backend' && <BackendTab health={state.backend} onRefresh={refresh} />}
          {activeTab === 'device' && <DeviceTab device={state.device} />}
          {activeTab === 'teams' && <TeamsTab workspacePaths={state.workspaces.map(w => w.folderPath)} windowPaths={state.windows.map(w => w.folderPath).filter(Boolean) as string[]} />}
          {activeTab === 'models' && <ModelManager onOpenModelsYaml={async () => { const homeDir = await api.getHomeDir?.(); if (homeDir) api.openFile?.(`${homeDir}/.incognide/models.yaml`); }} />}
          {activeTab === 'account' && (
            <ErrorBoundary>
              <AccountPane nodeId="" />
            </ErrorBoundary>
          )}
          {activeTab === 'updates' && <UpdatesTab version={state.version} />}
        </div>
      </div>
    </div>
  );
};

export default Manager;
