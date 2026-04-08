import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    MessageSquare, Terminal, Globe, FileText, File as FileIcon,
    BrainCircuit, Bot, Zap, Users, Database, ChevronRight, ChevronDown,
    GitBranch, Image, BarChart3, AlertCircle, RefreshCw, Check, Columns, Layers,
    Power, HardDrive, Download, ScrollText
} from 'lucide-react';
import npcPythonLogo from '../../assets/npc-python.png';
import { useAiEnabled } from './AiFeatureContext';

interface PaneItem {
    id: string;
    type: string;
    title: string;
    isActive: boolean;
}

interface StatusBarProps {
    createDBToolPane?: () => void;
    paneItems: PaneItem[];
    setActiveContentPaneId: (id: string) => void;
    height?: number;
    onStartResize?: () => void;
    sidebarCollapsed?: boolean;
    onExpandSidebar?: () => void;
    topBarCollapsed?: boolean;
    onExpandTopBar?: () => void;
    appVersion?: string;
    updateAvailable?: { latestVersion: string; releaseUrl: string } | null;
    onCheckForUpdates?: () => Promise<void>;
    onCollapse?: () => void;
    openMode?: 'pane' | 'tab';
    onToggleOpenMode?: () => void;
    createDataDashPane?: () => void;
    createDiskUsagePane?: () => void;
    onOpenDownloadManager?: () => void;
    onOpenLogsViewer?: () => void;
    createBackendPane?: () => void;
}

type BackendStatus = 'ok' | 'unhealthy' | 'unreachable' | 'restarting' | 'unknown';

const StatusBar: React.FC<StatusBarProps> = ({
    createDBToolPane,
    paneItems,
    setActiveContentPaneId,
    height = 48,
    onStartResize,
    sidebarCollapsed = false,
    onExpandSidebar,
    appVersion,
    updateAvailable,
    onCheckForUpdates,
    onCollapse,
    openMode = 'pane',
    onToggleOpenMode,
    createDataDashPane,
    createDiskUsagePane,
    onOpenDownloadManager,
    onOpenLogsViewer,
    createBackendPane,
}) => {
    const aiEnabled = useAiEnabled();
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [showQuitPrompt, setShowQuitPrompt] = useState(false);
    const [showBackendMenu, setShowBackendMenu] = useState(false);
    const [clockMode, setClockMode] = useState<'analog' | 'digital' | 'datetime'>(() => (localStorage.getItem('incognide_clockMode') as any) || 'digital');
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);
    useEffect(() => { localStorage.setItem('incognide_clockMode', clockMode); }, [clockMode]);

    const [backendStatus, setBackendStatus] = useState<BackendStatus>('unknown');
    const [backendPid, setBackendPid] = useState<number | null>(null);
    const [failCount, setFailCount] = useState(0);
    const [restarting, setRestarting] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const checkHealth = useCallback(async () => {
        if (restarting) return;
        try {
            const result = await (window as any).api?.backendHealth?.();
            if (!result) { setBackendStatus('unknown'); return; }
            setBackendPid(result.pid || null);
            if (result.status === 'ok') {
                setBackendStatus('ok');
                setFailCount(0);
            } else {
                setBackendStatus(result.status as BackendStatus);
                setFailCount(prev => prev + 1);
            }
        } catch {
            setBackendStatus('unreachable');
            setFailCount(prev => prev + 1);
        }
    }, [restarting]);

    useEffect(() => {
        checkHealth();
        pollRef.current = setInterval(checkHealth, 10000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [checkHealth]);

    const handleRestart = async () => {
        if (restarting) return;
        setRestarting(true);
        setBackendStatus('restarting');
        try {
            const result = await (window as any).api?.backendRestart?.();
            if (result?.success) {
                setBackendStatus('ok');
                setFailCount(0);
            } else {
                setBackendStatus('unreachable');
            }
        } catch {
            setBackendStatus('unreachable');
        } finally {
            setRestarting(false);
        }
    };

    const statusColor = backendStatus === 'ok'
        ? 'bg-green-500'
        : backendStatus === 'restarting'
            ? 'bg-yellow-500 animate-pulse'
            : backendStatus === 'unhealthy'
                ? 'bg-yellow-500'
                : backendStatus === 'unreachable'
                    ? 'bg-red-500'
                    : 'bg-gray-500';

    const statusLabel = backendStatus === 'ok'
        ? `Backend OK${backendPid ? ` (PID ${backendPid})` : ''}`
        : backendStatus === 'restarting'
            ? 'Restarting backend...'
            : backendStatus === 'unhealthy'
                ? 'Backend unhealthy — click to restart'
                : backendStatus === 'unreachable'
                    ? `Backend unreachable${failCount > 1 ? ` (${failCount} failures)` : ''} — click to restart`
                    : 'Checking backend...';

    const handleCheckUpdates = async () => {
        if (downloadProgress !== null && downloadProgress >= 100) {
            setShowQuitPrompt(true);
            return;
        }
        if (checkingUpdates || downloadProgress !== null) return;
        if (updateAvailable) {

            setDownloadProgress(0);
            const cleanup = (window as any).api?.onUpdateDownloadProgress?.((data: any) => {
                setDownloadProgress(data.progress);
            });
            try {
                const result = await (window as any).api?.downloadAndInstallUpdate?.({
                    releaseUrl: updateAvailable.releaseUrl,
                });
                if (result?.success) {
                    setDownloadProgress(100);
                    setShowQuitPrompt(true);
                } else {

                    (window as any).api?.browserOpenExternal?.(updateAvailable.releaseUrl);
                    setDownloadProgress(null);
                }
            } catch {
                (window as any).api?.browserOpenExternal?.(updateAvailable.releaseUrl);
                setDownloadProgress(null);
            } finally {
                cleanup?.();
            }
            return;
        }
        if (!onCheckForUpdates) return;
        setCheckingUpdates(true);
        try { await onCheckForUpdates(); } finally { setCheckingUpdates(false); }
    };

    const btnClass = "p-2 rounded transition-colors hover:opacity-80 bg-transparent";

    return (
        <div className="flex-shrink-0 relative" style={{ height }}>
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors z-10"
                onMouseDown={(e) => { e.preventDefault(); onStartResize?.(); }}
            />
            <div className="h-full theme-bg-tertiary border-t theme-border flex items-center px-3 text-[12px] theme-text-muted gap-2">
            {sidebarCollapsed && (
                <button
                    onClick={() => onExpandSidebar?.()}
                    className="p-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:opacity-80 bg-transparent"
                    title="Expand Sidebar"
                >
                    <ChevronRight size={20} />
                </button>
            )}

            {/* LEFT: Database */}
            <button data-tutorial="db-tool-button" onClick={() => createDBToolPane?.()} className={`${btnClass} text-blue-600 dark:text-blue-400`} title="Database Tool">
                <Database size={20} />
            </button>

            {/* LEFT: Downloads */}
            <button onClick={() => onOpenDownloadManager?.()} className={`${btnClass} text-cyan-600 dark:text-cyan-400`} title="Downloads">
                <Download size={20} />
            </button>

            {/* LEFT: Data Dashboard */}
            <button onClick={() => createDataDashPane?.()} className={`${btnClass} text-green-600 dark:text-green-400`} title="Data Dashboard">
                <BarChart3 size={20} />
            </button>

            {/* LEFT: Disk Usage */}
            <button onClick={() => createDiskUsagePane?.()} className={`${btnClass} text-gray-500 dark:text-gray-400`} title="Disk Usage">
                <HardDrive size={20} />
            </button>

            <div className="flex-1" />

            {/* CENTER: Open pane indicators */}
            {onCollapse && (
                <button onClick={onCollapse} className={`${btnClass} text-gray-400 dark:text-gray-500`} title="Hide status bar"><ChevronDown size={16} /></button>
            )}
            <div className="flex items-center gap-1">
                {paneItems.map((pane) => (
                    <button key={pane.id} onClick={() => setActiveContentPaneId(pane.id)} className={`p-2 rounded transition-colors ${pane.isActive ? 'bg-blue-600 text-white' : 'bg-transparent theme-text-muted hover:opacity-80'}`} title={pane.title}>
                        {pane.type === 'chat' && <MessageSquare size={20} />}
                        {pane.type === 'editor' && <FileIcon size={20} />}
                        {pane.type === 'terminal' && <Terminal size={20} />}
                        {pane.type === 'browser' && <Globe size={20} />}
                        {pane.type === 'pdf' && <FileText size={20} />}
                        {pane.type === 'graph-viewer' && <GitBranch size={20} />}
                        {pane.type === 'datadash' && <BarChart3 size={20} />}
                        {pane.type === 'dbtool' && <Database size={20} />}
                        {pane.type === 'memory-manager' && <BrainCircuit size={20} />}
                        {pane.type === 'photoviewer' && <Image size={20} />}
                        {pane.type === 'npcteam' && <Bot size={20} />}
                        {pane.type === 'jinx' && <Zap size={20} />}
                        {pane.type === 'teammanagement' && <Users size={20} />}
                        {pane.type === 'diff' && <GitBranch size={20} />}
                        {pane.type === 'browsergraph' && <Globe size={20} />}
                        {!['chat', 'editor', 'terminal', 'browser', 'pdf', 'graph-viewer', 'datadash', 'dbtool', 'memory-manager', 'photoviewer', 'npcteam', 'jinx', 'teammanagement', 'diff', 'browsergraph'].includes(pane.type) && <FileIcon size={20} />}
                    </button>
                ))}
            </div>

            <div className="flex-1" />

            {/* RIGHT: npcpy logo | pane/tab | version | clock */}
            <div className="relative group/backend">
                <div
                    onClick={() => createBackendPane?.()}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowBackendMenu(true); }}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors cursor-pointer hover:bg-white/10 ${backendStatus === 'ok' ? '' : 'opacity-60'}`}
                    title={statusLabel + ' — click for backend panel — right-click for quick options'}
                >
                    <img src={npcPythonLogo} alt="npcpy" className={`w-4 h-4 rounded-sm transition-all ${backendStatus === 'ok' ? '' : 'grayscale opacity-50'} ${restarting ? 'animate-pulse' : ''}`} />
                    {restarting && <RefreshCw size={10} className="animate-spin text-yellow-400" />}
                </div>
                {showBackendMenu && (
                    <>
                        <div className="fixed inset-0 z-40 bg-transparent" onMouseDown={() => setShowBackendMenu(false)} />
                        <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 py-1 min-w-[140px]">
                            <div className="px-3 py-1 text-[10px] text-gray-500 border-b border-gray-700">{statusLabel}</div>
                            <button onClick={() => { handleRestart(); setShowBackendMenu(false); }} disabled={restarting} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs text-gray-300 hover:bg-white/10 disabled:opacity-50">
                                <RefreshCw size={12} /> Restart Backend
                            </button>
                            <button onClick={() => { onOpenLogsViewer?.(); setShowBackendMenu(false); }} className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs text-gray-300 hover:bg-white/10">
                                <ScrollText size={12} /> View Logs
                            </button>
                        </div>
                    </>
                )}
            </div>

            {onToggleOpenMode && (
                <button onClick={onToggleOpenMode} className={`${btnClass} ${openMode === 'tab' ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} title={openMode === 'pane' ? 'Pane mode' : 'Tab mode'}>
                    {openMode === 'pane' ? <Columns size={16} /> : <Layers size={16} />}
                </button>
            )}

            <div className="relative group/update">
                <button onClick={handleCheckUpdates} className={`${btnClass} ${updateAvailable ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    {downloadProgress !== null ? (downloadProgress >= 100 ? <Check size={16} className="text-green-400" /> : <span className="text-[10px] font-mono text-amber-400">{downloadProgress}%</span>) : updateAvailable ? <AlertCircle size={16} /> : checkingUpdates ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                {showQuitPrompt && (
                    <>
                        <div className="fixed inset-0 z-40 bg-transparent" onMouseDown={() => setShowQuitPrompt(false)} />
                        <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-3 min-w-[220px]">
                            <p className="text-[11px] text-gray-300 mb-2">Update downloaded. Close to install?</p>
                            <div className="flex items-center gap-2">
                                <button onClick={() => (window as any).api?.closeWindow?.()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded transition-colors"><Power size={12} /> Quit & Install</button>
                                <button onClick={() => setShowQuitPrompt(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded transition-colors">Later</button>
                            </div>
                        </div>
                    </>
                )}
                {!showQuitPrompt && (
                    <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover/update:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                        {downloadProgress !== null && downloadProgress >= 100 ? 'Update ready — click to quit & install' : updateAvailable ? `v${appVersion || '?'} → v${updateAvailable.latestVersion} available` : `v${appVersion || '?'} — up to date`}
                    </div>
                )}
            </div>

            </div>
        </div>
    );
};

export default StatusBar;
