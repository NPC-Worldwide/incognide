import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, Square, FileText, Send, ChevronDown, ChevronRight, Check, X, AlertCircle } from 'lucide-react';

interface BackendPaneProps {
    onClose?: () => void;
}

type BackendStatus = 'ok' | 'unhealthy' | 'unreachable' | 'unknown';

interface HealthDetails {
    status: BackendStatus;
    backendProcess?: { running: boolean; pid?: number; exitCode?: number | null };
    pythonPath?: string;
    backendUrl?: string;
    error?: string;
    timestamp?: string;
}

interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

const BackendPane: React.FC<BackendPaneProps> = ({ onClose }) => {
    const [health, setHealth] = useState<HealthDetails | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'api'>('status');
    const [restarting, setRestarting] = useState(false);

    // API tester state
    const [apiEndpoint, setApiEndpoint] = useState('/api/health');
    const [apiMethod, setApiMethod] = useState<'GET' | 'POST'>('GET');
    const [apiBody, setApiBody] = useState('');
    const [apiResponse, setApiResponse] = useState<string | null>(null);
    const [apiLoading, setApiLoading] = useState(false);

    const logsEndRef = useRef<HTMLDivElement>(null);

    // Fetch health on mount and periodically
    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const result = await (window as any).api?.backendHealth?.();
                setHealth(result);
            } catch (err) {
                setHealth({ status: 'unknown', error: String(err) });
            }
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 600000);
        return () => clearInterval(interval);
    }, []);

    // Load logs
    const loadLogs = async (logType: 'backend' | 'electron' = 'backend') => {
        setLogsLoading(true);
        try {
            const content = await (window as any).api?.readLogFile?.(logType);
            if (content) {
                const lines = content.split('\n').filter((l: string) => l.trim());
                const parsed: LogEntry[] = lines.slice(-200).map((line: string) => {
                    const level: 'info' | 'warn' | 'error' =
                        line.toLowerCase().includes('error') ? 'error' :
                        line.toLowerCase().includes('warn') ? 'warn' : 'info';
                    return { timestamp: '', level, message: line };
                });
                setLogs(parsed);
                setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        } catch (err) {
            console.error('Failed to load logs:', err);
        } finally {
            setLogsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'logs') loadLogs();
    }, [activeTab]);

    const handleRestart = async () => {
        setRestarting(true);
        try {
            await (window as any).api?.setupRestartBackend?.();
            setTimeout(async () => {
                const result = await (window as any).api?.backendHealth?.();
                setHealth(result);
                setRestarting(false);
            }, 3000);
        } catch (err) {
            console.error('Restart failed:', err);
            setRestarting(false);
        }
    };

    const handleApiTest = async () => {
        setApiLoading(true);
        setApiResponse(null);
        try {
            const baseUrl = health?.backendUrl || 'http://127.0.0.1:5437';
            const url = `${baseUrl}${apiEndpoint}`;
            const options: RequestInit = {
                method: apiMethod,
                headers: { 'Content-Type': 'application/json' },
            };
            if (apiMethod === 'POST' && apiBody) {
                options.body = apiBody;
            }
            const response = await fetch(url, options);
            const status = response.status;
            const statusText = response.statusText;
            const text = await response.text();
            let formattedResponse = `HTTP ${status} ${statusText}\n\n`;
            try {
                const json = JSON.parse(text);
                formattedResponse += JSON.stringify(json, null, 2);
            } catch {
                formattedResponse += text;
            }
            setApiResponse(formattedResponse);
        } catch (err) {
            setApiResponse(`Error: ${err}`);
        } finally {
            setApiLoading(false);
        }
    };

    const statusColor = health?.status === 'ok' ? 'text-green-400' :
                        health?.status === 'unhealthy' ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className="h-full flex flex-col theme-bg-primary text-sm">
            {/* Tabs */}
            <div className="flex border-b theme-border">
                {(['status', 'logs', 'api'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${
                            activeTab === tab
                                ? 'theme-text-primary border-b-2 border-blue-500'
                                : 'theme-text-muted hover:theme-text-primary'
                        }`}
                    >
                        {tab === 'status' ? 'Status' : tab === 'logs' ? 'Logs' : 'API Tester'}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {activeTab === 'status' && (
                    <div className="space-y-4">
                        {/* Status card */}
                        <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-medium theme-text-primary">Backend Status</h3>
                                <span className={`flex items-center gap-2 ${statusColor}`}>
                                    {health?.status === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}
                                    {health?.status || 'unknown'}
                                </span>
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="theme-text-muted">URL:</span>
                                    <span className="theme-text-primary font-mono">{health?.backendUrl || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="theme-text-muted">Process:</span>
                                    <span className="theme-text-primary">
                                        {health?.backendProcess?.running ? `Running (PID: ${health.backendProcess.pid})` : 'Not running'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="theme-text-muted">Python:</span>
                                    <span className="theme-text-primary font-mono truncate max-w-[300px]" title={health?.pythonPath}>
                                        {health?.pythonPath || 'N/A'}
                                    </span>
                                </div>
                                {health?.error && (
                                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
                                        {health.error}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleRestart}
                                disabled={restarting}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                            >
                                <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} />
                                {restarting ? 'Restarting...' : 'Restart Backend'}
                            </button>
                            <button
                                onClick={() => window.dispatchEvent(new Event('sse-reconnect'))}
                                className="flex items-center gap-2 px-4 py-2 theme-bg-secondary hover:bg-white/10 theme-text-primary rounded transition-colors border theme-border"
                            >
                                <Play size={14} />
                                Reconnect SSE
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                            <button
                                onClick={() => loadLogs('backend')}
                                className="px-3 py-1 text-xs theme-bg-secondary hover:bg-white/10 rounded border theme-border"
                            >
                                Backend Logs
                            </button>
                            <button
                                onClick={() => loadLogs('electron')}
                                className="px-3 py-1 text-xs theme-bg-secondary hover:bg-white/10 rounded border theme-border"
                            >
                                Electron Logs
                            </button>
                            {logsLoading && <RefreshCw size={12} className="animate-spin theme-text-muted" />}
                        </div>
                        <div className="flex-1 overflow-auto font-mono text-xs theme-bg-secondary rounded border theme-border p-2">
                            {logs.map((log, i) => (
                                <div
                                    key={i}
                                    className={`py-0.5 ${
                                        log.level === 'error' ? 'text-red-400' :
                                        log.level === 'warn' ? 'text-yellow-400' : 'theme-text-muted'
                                    }`}
                                >
                                    {log.message}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}

                {activeTab === 'api' && (
                    <div className="space-y-4">
                        {/* Available Routes */}
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { method: 'GET', path: '/api/health', desc: 'Health check' },
                                { method: 'GET', path: '/api/status', desc: 'Backend status' },
                                { method: 'GET', path: '/api/models', desc: 'List models' },
                                { method: 'GET', path: '/api/jinxes/global', desc: 'Global jinxes' },
                                { method: 'GET', path: '/api/maps/global', desc: 'Global maps' },
                                { method: 'GET', path: '/api/npc_team_global', desc: 'Global NPCs' },
                                { method: 'POST', path: '/api/interrupt', desc: 'Interrupt request' },
                            ].map((route) => (
                                <button
                                    key={route.path}
                                    onClick={() => {
                                        setApiMethod(route.method as 'GET' | 'POST');
                                        setApiEndpoint(route.path);
                                        if (route.method === 'POST') {
                                            setApiBody('{}');
                                        }
                                    }}
                                    className="flex items-center gap-2 p-2 text-left theme-bg-secondary hover:bg-white/10 rounded border theme-border text-xs"
                                >
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${route.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {route.method}
                                    </span>
                                    <span className="font-mono theme-text-primary">{route.path}</span>
                                    <span className="theme-text-muted ml-auto">{route.desc}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <select
                                value={apiMethod}
                                onChange={(e) => setApiMethod(e.target.value as 'GET' | 'POST')}
                                className="px-3 py-2 theme-bg-secondary border theme-border rounded text-xs"
                            >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                            </select>
                            <input
                                type="text"
                                value={apiEndpoint}
                                onChange={(e) => setApiEndpoint(e.target.value)}
                                placeholder="/api/endpoint"
                                className="flex-1 px-3 py-2 theme-bg-secondary border theme-border rounded text-xs font-mono"
                            />
                            <button
                                onClick={handleApiTest}
                                disabled={apiLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                            >
                                <Send size={14} />
                                {apiLoading ? 'Sending...' : 'Send'}
                            </button>
                        </div>

                        {apiMethod === 'POST' && (
                            <textarea
                                value={apiBody}
                                onChange={(e) => setApiBody(e.target.value)}
                                placeholder='{"key": "value"}'
                                className="w-full h-24 px-3 py-2 theme-bg-secondary border theme-border rounded text-xs font-mono resize-none"
                            />
                        )}

                        <div className="text-xs theme-text-muted hidden">
                            Common endpoints: /api/health, /api/models, /api/providers, /api/chat
                        </div>

                        {apiResponse && (
                            <div className="p-3 theme-bg-secondary border theme-border rounded">
                                <div className="text-xs theme-text-muted mb-2">Response:</div>
                                <pre className="text-xs font-mono theme-text-primary whitespace-pre-wrap overflow-auto max-h-[300px]">
                                    {apiResponse}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BackendPane;
