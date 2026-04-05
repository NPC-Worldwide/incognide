import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, FileText, Terminal, Filter, FolderOpen, Download, Pause, Play } from 'lucide-react';

interface LogsViewerProps {
    onClose: () => void;
}

type LogType = 'backend' | 'electron';
type LogLevel = 'all' | 'error' | 'warning' | 'info';

interface LogLine {
    text: string;
    level: 'error' | 'warning' | 'info' | 'debug';
    timestamp?: string;
}

const LogsViewer: React.FC<LogsViewerProps> = ({ onClose }) => {
    const [logType, setLogType] = useState<LogType>('backend');
    const [logContent, setLogContent] = useState<string>('');
    const [parsedLines, setParsedLines] = useState<LogLine[]>([]);
    const [filter, setFilter] = useState<LogLevel>('all');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logsDir, setLogsDir] = useState<string>('');
    const logContainerRef = useRef<HTMLDivElement>(null);
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const parseLogLine = (line: string): LogLine => {
        const trimmed = line.trim();
        if (!trimmed) {
            return { text: '', level: 'debug' };
        }

        // Extract timestamp if present [2024-01-01T12:00:00.000Z]
        const timestampMatch = trimmed.match(/^\[([^\]]+)\]/);
        const timestamp = timestampMatch ? timestampMatch[1] : undefined;

        // Determine log level
        let level: LogLine['level'] = 'info';
        const lowerLine = trimmed.toLowerCase();

        if (lowerLine.includes('error') || lowerLine.includes('exception') || lowerLine.includes('failed') || lowerLine.includes('critical')) {
            level = 'error';
        } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
            level = 'warning';
        } else if (lowerLine.includes('debug') || lowerLine.includes('trace')) {
            level = 'debug';
        }

        return { text: trimmed, level, timestamp };
    };

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const content = await (window as any).api?.readLogFile?.(logType);
            // API returns string directly or empty string
            const text = typeof content === 'string' ? content : '';
            setLogContent(text);
            const lines = text.split('\n').map(parseLogLine);
            setParsedLines(lines);
        } catch (err: any) {
            setError(err.message || 'Failed to load logs');
            setLogContent('');
            setParsedLines([]);
        } finally {
            setLoading(false);
        }
    }, [logType]);

    const getLogsDirectory = useCallback(async () => {
        try {
            const result = await (window as any).api?.getLogsDir?.();
            // API returns { logsDir, electronLog, backendLog }
            if (result?.logsDir) setLogsDir(result.logsDir);
        } catch (err) {
            console.error('Failed to get logs directory:', err);
        }
    }, []);

    useEffect(() => {
        loadLogs();
        getLogsDirectory();
    }, [loadLogs, getLogsDirectory]);

    useEffect(() => {
        if (autoRefresh) {
            refreshIntervalRef.current = setInterval(loadLogs, 3000);
        } else if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
        }
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [autoRefresh, loadLogs]);

    useEffect(() => {
        if (logContainerRef.current && autoRefresh) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [parsedLines, autoRefresh]);

    const filteredLines = parsedLines.filter(line => {
        if (!line.text) return false;
        if (filter === 'all') return true;
        if (filter === 'error') return line.level === 'error';
        if (filter === 'warning') return line.level === 'warning' || line.level === 'error';
        return true;
    });

    const handleOpenInExplorer = async () => {
        if (logsDir) {
            await (window as any).api?.openInNativeExplorer?.(logsDir);
        }
    };

    const handleDownload = () => {
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${logType}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getLevelColor = (level: LogLine['level']) => {
        switch (level) {
            case 'error': return 'text-red-400';
            case 'warning': return 'text-yellow-400';
            case 'info': return 'text-gray-300';
            case 'debug': return 'text-gray-500';
            default: return 'text-gray-400';
        }
    };

    const errorCount = parsedLines.filter(l => l.level === 'error').length;
    const warningCount = parsedLines.filter(l => l.level === 'warning').length;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <FileText size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">Application Logs</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3 p-3 border-b border-gray-800 flex-wrap">
                    {/* Log type tabs */}
                    <div className="flex rounded-lg bg-gray-800 p-0.5">
                        <button
                            onClick={() => setLogType('backend')}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                                logType === 'backend'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <Terminal size={14} />
                            Backend
                        </button>
                        <button
                            onClick={() => setLogType('electron')}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                                logType === 'electron'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <FileText size={14} />
                            Electron
                        </button>
                    </div>

                    {/* Filter */}
                    <div className="flex items-center gap-1.5">
                        <Filter size={14} className="text-gray-500" />
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as LogLevel)}
                            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                        >
                            <option value="all">All levels</option>
                            <option value="error">Errors only</option>
                            <option value="warning">Warnings & Errors</option>
                        </select>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 text-xs">
                        {errorCount > 0 && (
                            <span className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded">
                                {errorCount} errors
                            </span>
                        )}
                        {warningCount > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">
                                {warningCount} warnings
                            </span>
                        )}
                    </div>

                    <div className="flex-1" />

                    {/* Actions */}
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`p-1.5 rounded-lg transition-colors ${
                            autoRefresh
                                ? 'bg-green-600/20 text-green-400'
                                : 'hover:bg-gray-700 text-gray-400'
                        }`}
                        title={autoRefresh ? 'Pause auto-refresh' : 'Enable auto-refresh (3s)'}
                    >
                        {autoRefresh ? <Pause size={16} /> : <Play size={16} />}
                    </button>

                    <button
                        onClick={loadLogs}
                        disabled={loading}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={handleDownload}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                        title="Download log"
                    >
                        <Download size={16} />
                    </button>

                    <button
                        onClick={handleOpenInExplorer}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                        title="Open logs folder"
                    >
                        <FolderOpen size={16} />
                    </button>
                </div>

                {/* Log content */}
                <div
                    ref={logContainerRef}
                    className="flex-1 overflow-auto p-4 font-mono text-xs bg-gray-950"
                >
                    {error ? (
                        <div className="text-red-400 text-center py-8">
                            <p className="mb-2">Failed to load logs</p>
                            <p className="text-gray-500 text-xs">{error}</p>
                        </div>
                    ) : filteredLines.length === 0 ? (
                        <div className="text-gray-500 text-center py-8">
                            {loading ? 'Loading...' : 'No log entries found'}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {filteredLines.map((line, idx) => (
                                <div
                                    key={idx}
                                    className={`${getLevelColor(line.level)} whitespace-pre-wrap break-all leading-relaxed hover:bg-gray-800/50 px-1 -mx-1 rounded`}
                                >
                                    {line.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
                    <span>
                        {filteredLines.length} lines
                        {filter !== 'all' && ` (filtered from ${parsedLines.length})`}
                    </span>
                    {logsDir && (
                        <span className="truncate max-w-md" title={logsDir}>
                            {logsDir}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LogsViewer;
