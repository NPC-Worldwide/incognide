import React, { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw, Check, AlertTriangle, XCircle, GitBranch, GitMerge,
    ChevronDown, ChevronUp, Loader, X
} from 'lucide-react';

interface SyncStatus {
    status: 'up-to-date' | 'behind' | 'ahead' | 'diverged' | 'conflicts' | 'uninitialized' | 'unavailable';
    modified?: string[];
    ahead?: number;
    behind?: number;
    conflicts?: string[];
    error?: string;
}

interface NPCTeamSyncProps {
    compact?: boolean;
}

const NPCTeamSync: React.FC<NPCTeamSyncProps> = ({ compact = false }) => {
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: 'unavailable' });
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);

    const api = (window as any).api;

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api?.npcTeamSyncStatus?.();
            if (result && !result.error) {
                setSyncStatus(result);
            } else {
                setSyncStatus({ status: 'unavailable', error: result?.error });
            }
        } catch (err: any) {
            setSyncStatus({ status: 'unavailable', error: err.message });
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const result = await api?.npcTeamSyncPull?.();
            if (result?.error) {
                setSyncResult(`Sync failed: ${result.error}`);
            } else if (result?.conflicts?.length > 0) {
                setSyncStatus(prev => ({ ...prev, status: 'conflicts', conflicts: result.conflicts }));
                setSyncResult(`Sync found ${result.conflicts.length} conflict(s) to resolve`);
            } else {
                setSyncResult('Sync complete — team is up to date');
                fetchStatus();
            }
        } catch (err: any) {
            setSyncResult(`Sync error: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleInit = async () => {
        setSyncing(true);
        try {
            const result = await api?.npcTeamSyncInit?.();
            if (result?.error) {
                setSyncResult(`Init failed: ${result.error}`);
            } else {
                setSyncResult('Team sync initialized');
                fetchStatus();
            }
        } catch (err: any) {
            setSyncResult(`Init error: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleResolve = async (filePath: string, resolution: 'ours' | 'theirs') => {
        try {
            const result = await api?.npcTeamSyncResolve?.({ filePath, resolution });
            if (result?.error) {
                setSyncResult(`Resolve failed: ${result.error}`);
            } else {
                setSyncResult(`Resolved ${filePath} with ${resolution === 'ours' ? 'local' : 'upstream'} version`);
                fetchStatus();
            }
        } catch (err: any) {
            setSyncResult(`Resolve error: ${err.message}`);
        }
    };

    const statusIcon = () => {
        if (loading) return <Loader size={14} className="animate-spin theme-text-muted" />;
        switch (syncStatus.status) {
            case 'up-to-date': return <Check size={14} className="text-green-400" />;
            case 'behind': return <GitMerge size={14} className="text-yellow-400" />;
            case 'ahead': return <GitBranch size={14} className="text-blue-400" />;
            case 'diverged': return <AlertTriangle size={14} className="text-orange-400" />;
            case 'conflicts': return <XCircle size={14} className="text-red-400" />;
            case 'uninitialized': return <GitBranch size={14} className="theme-text-muted" />;
            default: return <XCircle size={14} className="theme-text-muted" />;
        }
    };

    const statusLabel = () => {
        switch (syncStatus.status) {
            case 'up-to-date': return 'Up to date';
            case 'behind': return `${syncStatus.behind || 0} update(s) available`;
            case 'ahead': return `${syncStatus.ahead || 0} local change(s)`;
            case 'diverged': return 'Local & upstream changes';
            case 'conflicts': return `${syncStatus.conflicts?.length || 0} conflict(s)`;
            case 'uninitialized': return 'Not initialized';
            case 'unavailable': return 'Sync unavailable';
            default: return 'Unknown';
        }
    };

    // Compact mode: just a status badge + sync button
    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs theme-text-muted">
                    {statusIcon()}
                    <span>{statusLabel()}</span>
                </div>
                <button
                    onClick={handleSync}
                    disabled={syncing || loading || syncStatus.status === 'unavailable'}
                    className="p-1 rounded theme-text-muted hover:theme-text-primary disabled:opacity-50"
                    title="Sync NPC team"
                >
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                </button>
            </div>
        );
    }

    // Full mode: expandable panel
    return (
        <div className="theme-bg-secondary border theme-border rounded-lg">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:theme-bg-hover transition-colors rounded-lg"
            >
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="theme-text-muted" />
                    <span className="text-sm font-medium theme-text-primary">Team Sync</span>
                    <div className="flex items-center gap-1.5 text-xs">
                        {statusIcon()}
                        <span className="theme-text-muted">{statusLabel()}</span>
                    </div>
                </div>
                {expanded ? <ChevronUp size={14} className="theme-text-muted" /> : <ChevronDown size={14} className="theme-text-muted" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t theme-border pt-3">
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {syncStatus.status === 'uninitialized' ? (
                            <button
                                onClick={handleInit}
                                disabled={syncing}
                                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {syncing ? <Loader size={12} className="animate-spin" /> : <GitBranch size={12} />}
                                Initialize Sync
                            </button>
                        ) : (
                            <button
                                onClick={handleSync}
                                disabled={syncing || syncStatus.status === 'unavailable'}
                                className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {syncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                Check for Updates
                            </button>
                        )}
                        <button
                            onClick={fetchStatus}
                            disabled={loading}
                            className="p-1.5 rounded theme-text-muted hover:theme-text-primary disabled:opacity-50"
                            title="Refresh status"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Sync result message */}
                    {syncResult && (
                        <div className={`text-xs px-3 py-2 rounded flex items-center justify-between ${
                            syncResult.includes('failed') || syncResult.includes('error')
                                ? 'bg-red-900/20 text-red-400 border border-red-500/30'
                                : syncResult.includes('conflict')
                                    ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-500/30'
                                    : 'bg-green-900/20 text-green-400 border border-green-500/30'
                        }`}>
                            <span>{syncResult}</span>
                            <button onClick={() => setSyncResult(null)} className="p-0.5 hover:opacity-70"><X size={12} /></button>
                        </div>
                    )}

                    {/* Modified files */}
                    {syncStatus.modified && syncStatus.modified.length > 0 && (
                        <div>
                            <h6 className="text-xs font-medium theme-text-muted mb-1">Modified files:</h6>
                            <div className="space-y-1">
                                {syncStatus.modified.map((file) => (
                                    <div key={file} className="text-xs font-mono theme-text-secondary px-2 py-1 theme-bg-primary rounded">
                                        {file}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Conflicts */}
                    {syncStatus.conflicts && syncStatus.conflicts.length > 0 && (
                        <div>
                            <h6 className="text-xs font-medium text-red-400 mb-1">Conflicts to resolve:</h6>
                            <div className="space-y-2">
                                {syncStatus.conflicts.map((file) => (
                                    <div key={file} className="theme-bg-primary border theme-border rounded p-2">
                                        <div className="text-xs font-mono theme-text-secondary mb-2">{file}</div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleResolve(file, 'ours')}
                                                className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded"
                                            >
                                                Keep Local
                                            </button>
                                            <button
                                                onClick={() => handleResolve(file, 'theirs')}
                                                className="px-2 py-1 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded"
                                            >
                                                Use Upstream
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unavailable message */}
                    {syncStatus.status === 'unavailable' && (
                        <p className="text-xs theme-text-muted">
                            Team sync requires the npcpy backend sync service. Make sure npcpy.serve is running with sync support.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default NPCTeamSync;
