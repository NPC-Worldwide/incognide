import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Database, Table, Loader, Play, Copy, Download, Plus, Star, Trash2,
    ChevronDown, ChevronRight, Search, Activity, Link,
    CheckCircle, XCircle, BarChart as BarChartIcon, BrainCircuit, Brain, Tag
} from 'lucide-react';
import {
    createWindowApiDatabaseClient,
    QueryChart
} from 'npcts';
import type { DatabaseClient } from 'npcts';
import MemoryManagement from './MemoryManagement';
import ActivityIntelligence from './ActivityIntelligence';
import LabeledDataManager from './LabeledDataManager';

const generateId = () => `widget_${Math.random().toString(36).substr(2, 9)}`;

interface DBToolProps {
    currentPath?: string;
    currentModel?: string;
    currentProvider?: string;
    currentNPC?: string;
    onAddToDash?: (widgetConfig: any) => void;
}

const DBTool: React.FC<DBToolProps> = ({
    currentPath,
    currentModel,
    currentProvider,
    currentNPC,
    onAddToDash
}) => {

    const dbClient = useMemo<DatabaseClient>(() =>
        createWindowApiDatabaseClient((window as any).api),
    []);

    const [sqlQuery, setSqlQuery] = useState('SELECT * FROM conversation_history LIMIT 10;');
    const [queryResult, setQueryResult] = useState<any[] | null>(null);
    const [loadingQuery, setLoadingQuery] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [dbTables, setDbTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableSchema, setTableSchema] = useState<any[] | null>(null);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [tableSchemaCache, setTableSchemaCache] = useState<Record<string, any[]>>({});
    const [queryHistory, setQueryHistory] = useState<{query: string, favorited: boolean, date: string}[]>([]);

    const [sqlInputMode, setSqlInputMode] = useState<'sql' | 'nl'>('sql');
    const [nlQuery, setNlQuery] = useState('');
    const [generatedSql, setGeneratedSql] = useState('');
    const [generatingSql, setGeneratingSql] = useState(false);
    const [nlToSqlStreamId, setNlToSqlStreamId] = useState<string | null>(null);

    const [selectedDatabase, setSelectedDatabase] = useState<string>('~/npcsh_history.db');
    const [dbConnectionStatus, setDbConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [dbConnectionInfo, setDbConnectionInfo] = useState<{
        resolvedPath?: string;
        tableCount?: number;
        fileSize?: number;
        lastModified?: string;
        error?: string;
        dbType?: string;
    } | null>(null);

    const [chartExplorer, setChartExplorer] = useState({
        xCol: '',
        yCol: '',
        chartType: 'bar',
        showChart: false
    });

    const [csvExportSettings, setCsvExportSettings] = useState({ alwaysPrompt: true });

    const [activeTab, setActiveTab] = useState<'query' | 'memory' | 'labels' | 'activity'>('query');

    useEffect(() => {
        const savedHistory = localStorage.getItem('dataDashQueryHistory');
        if (savedHistory) {
            try {
                setQueryHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Failed to load query history:', e);
            }
        }
    }, []);

    const testDbConnection = useCallback(async (connectionString: string) => {
        setDbConnectionStatus('connecting');
        setDbConnectionInfo(null);
        try {
            const res = await (window as any).api.testDbConnection({ connectionString });
            if (res.success) {
                setDbConnectionStatus('connected');
                setDbConnectionInfo({
                    resolvedPath: res.resolvedPath,
                    tableCount: res.tableCount,
                    fileSize: res.fileSize,
                    lastModified: res.lastModified,
                    dbType: res.dbType
                });
                return res;
            } else {
                setDbConnectionStatus('error');
                setDbConnectionInfo({ error: res.error, resolvedPath: res.resolvedPath, dbType: res.dbType });
                return res;
            }
        } catch (err: any) {
            setDbConnectionStatus('error');
            setDbConnectionInfo({ error: err.message });
            return { success: false, error: err.message };
        }
    }, []);

    const connectToDatabase = useCallback(async (connectionString: string) => {
        const testResult = await testDbConnection(connectionString);
        if (testResult.success) {
            setDbTables([]);
            setTableSchema(null);
            setSelectedTable(null);
            setTableSchemaCache({});

            try {
                const res = await (window as any).api.listTablesForPath({ connectionString });
                if (res.error) throw new Error(res.error);
                setDbTables(res.tables || []);
            } catch (err) {
                setQueryError("Could not fetch database tables.");
            }
        }
    }, [testDbConnection]);

    const handleViewSchema = useCallback(async (tableName: string) => {
        setSelectedTable(tableName);
        setLoadingSchema(true);
        try {
            const res = await (window as any).api.getTableSchemaForPath({
                connectionString: selectedDatabase,
                tableName
            });
            if (res.error) throw new Error(res.error);
            setTableSchema(res.schema);
        } catch (err) {
            console.error(`Failed to get schema for ${tableName}:`, err);
            setTableSchema(null);
        } finally {
            setLoadingSchema(false);
        }
    }, [selectedDatabase]);

    const browseForDatabase = useCallback(async () => {
        try {
            const res = await (window as any).api.browseForDatabase();
            if (res.path) {
                setSelectedDatabase(res.path);
                await connectToDatabase(res.path);
            }
        } catch (err) {
            console.error('Failed to browse for database:', err);
        }
    }, [connectToDatabase]);

    useEffect(() => {
        const fetchTables = async () => {
            if (dbTables.length === 0) {
                try {
                    const res = await (window as any).api.listTablesForPath({ connectionString: selectedDatabase });
                    if (res.error) throw new Error(res.error);
                    setDbTables(res.tables || []);
                    await testDbConnection(selectedDatabase);
                } catch (err) {
                    setQueryError("Could not fetch database tables.");
                }
            }
        };
        fetchTables();
    }, [selectedDatabase, testDbConnection]);

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getDbTypeLabel = (dbType: string) => {
        const labels: Record<string, string> = {
            sqlite: 'SQLite',
            postgresql: 'PostgreSQL',
            mysql: 'MySQL',
            mssql: 'SQL Server',
            snowflake: 'Snowflake'
        };
        return labels[dbType] || dbType;
    };

    const handleExecuteQuery = async () => {
        setLoadingQuery(true);
        setQueryError(null);
        setQueryResult(null);
        try {
            const response = await (window as any).api.executeSQL({ query: sqlQuery });
            if (response.error) throw new Error(response.error);
            setQueryResult(response.result);
            const newHistory = [
                { query: sqlQuery, favorited: false, date: new Date().toISOString() },
                ...queryHistory.filter(h => h.query !== sqlQuery)
            ].slice(0, 20);
            setQueryHistory(newHistory);
            localStorage.setItem('dataDashQueryHistory', JSON.stringify(newHistory));
        } catch (err: any) {
            setQueryError(err.message);
        } finally {
            setLoadingQuery(false);
        }
    };

    const handleHistoryAction = (index: number, action: 'run' | 'copy' | 'favorite' | 'delete') => {
        const item = queryHistory[index];
        if (!item) return;

        switch (action) {
            case 'run':
                setSqlQuery(item.query);
                break;
            case 'copy':
                navigator.clipboard.writeText(item.query);
                break;
            case 'favorite':
                const newHistory = [...queryHistory];
                newHistory[index] = { ...item, favorited: !item.favorited };
                setQueryHistory(newHistory);
                localStorage.setItem('dataDashQueryHistory', JSON.stringify(newHistory));
                break;
            case 'delete':
                const filtered = queryHistory.filter((_, i) => i !== index);
                setQueryHistory(filtered);
                localStorage.setItem('dataDashQueryHistory', JSON.stringify(filtered));
                break;
        }
    };

    const handleGenerateSql = async () => {
        if (!nlQuery.trim()) return;
        setGeneratingSql(true);
        setGeneratedSql('');
        setQueryError(null);
        try {
            const schemaInfo = await Promise.all(
                dbTables.map(async (table) => {
                    const schemaRes = await (window as any).api.getTableSchema({ tableName: table });
                    if (schemaRes.error) return ``;
                    const columns = schemaRes.schema
                        .map((col: any) => `  ${col.name} ${col.type}`)
                        .join(',\n');
                    return `TABLE ${table}(\n${columns}\n);`;
                })
            );
            const prompt = `Given this database schema:

${schemaInfo.join('\n\n')}

Generate a SQL query for: ${nlQuery}

Please provide only the SQL query without any markdown formatting or explanations.`;

            const newStreamId = generateId();
            setNlToSqlStreamId(newStreamId);
            const result = await (window as any).api.executeCommandStream({
                commandstr: prompt,
                currentPath: currentPath || '/',
                conversationId: null,
                model: currentModel,
                provider: currentProvider,
                npc: currentNPC,
                streamId: newStreamId,
                attachments: []
            });
            if (result && result.error) throw new Error(result.error);
        } catch (err: any) {
            setQueryError(err.message);
            setGeneratingSql(false);
            setNlToSqlStreamId(null);
        }
    };

    useEffect(() => {
        if (!nlToSqlStreamId) return;
        const handleStreamData = (_: any, { streamId, chunk }: { streamId: string, chunk: any }) => {
            if (streamId !== nlToSqlStreamId) return;
            try {
                let content = '';
                if (typeof chunk === 'string') {
                    if (chunk.startsWith('data:')) {
                        const dataContent = chunk.slice(5).trim();
                        if (dataContent === '[DONE]') {
                            setGeneratingSql(false);
                            setNlToSqlStreamId(null);
                            return;
                        }
                        try {
                            const parsed = JSON.parse(dataContent);
                            content = parsed.choices?.[0]?.delta?.content || '';
                        } catch {
                            content = dataContent;
                        }
                    } else {
                        content = chunk;
                    }
                } else if (chunk?.choices?.[0]?.delta?.content) {
                    content = chunk.choices[0].delta.content;
                }
                if (content) {
                    setGeneratedSql(prev => prev + content);
                }
            } catch (e) {
                console.error('Error parsing stream chunk:', e);
            }
        };

        const handleStreamEnd = (_: any, { streamId }: { streamId: string }) => {
            if (streamId === nlToSqlStreamId) {
                setGeneratingSql(false);
                setNlToSqlStreamId(null);
            }
        };

        (window as any).api?.onStreamData?.(handleStreamData);
        (window as any).api?.onStreamEnd?.(handleStreamEnd);

        return () => {

        };
    }, [nlToSqlStreamId]);

    const handleAcceptGeneratedSql = () => {
        setSqlQuery(generatedSql);
        setSqlInputMode('sql');
    };

    const generateCSVFilename = (query: string) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        let description = 'query_result';
        const tableMatch = query.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
            description = tableMatch[1].toLowerCase();
            if (query.toLowerCase().includes('group by')) description += '_grouped';
            if (query.toLowerCase().includes('where')) description += '_filtered';
        }
        return `${description}_${timestamp}.csv`;
    };

    const downloadCSV = (data: any[], filename: string) => {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => {
                    const value = row[header];
                    const stringValue = String(value || '');
                    return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
                        ? `"${stringValue.replace(/"/g, '""')}"`
                        : stringValue;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const exportToCSV = (data: any[], query: string) => {
        if (!data || data.length === 0) return;
        const suggestedFilename = generateCSVFilename(query);
        downloadCSV(data, suggestedFilename);
    };

    const handleAddToDash = () => {
        if (!queryResult || !onAddToDash) return;

        const widget = {
            id: generateId(),
            title: 'Query Result',
            type: chartExplorer.showChart ? `${chartExplorer.chartType}_chart` : 'table',
            query: sqlQuery,
            chartConfig: chartExplorer.showChart ? {
                x: chartExplorer.xCol,
                y: chartExplorer.yCol,
                type: chartExplorer.chartType
            } : null,
            span: chartExplorer.showChart ? 2 : 1
        };

        onAddToDash(widget);
    };

    return (
        <div className="flex flex-col h-full theme-bg-secondary overflow-hidden">
            <div className="flex items-center border-b theme-border flex-shrink-0">
                <button
                    onClick={() => setActiveTab('query')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'query'
                            ? 'border-purple-500 text-purple-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    <Database size={16} />
                    Query
                </button>
                <button
                    onClick={() => setActiveTab('memory')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'memory'
                            ? 'border-orange-500 text-orange-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    <Brain size={16} />
                    Memory
                </button>
                <button
                    onClick={() => setActiveTab('labels')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'labels'
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    <Tag size={16} />
                    Labels
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'activity'
                            ? 'border-green-500 text-green-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    <Activity size={16} />
                    Activity
                </button>
            </div>

            {activeTab === 'query' ? (
            <div className="flex-1 overflow-auto p-3">
                <div className={`mb-4 p-3 rounded-lg border ${
                    dbConnectionStatus === 'connected' ? 'bg-green-500/10 border-green-600/50' :
                    dbConnectionStatus === 'error' ? 'bg-red-500/10 border-red-600/50' :
                    'theme-bg-tertiary theme-border'
                }`}>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-gray-400">Database Connection</label>
                        {dbConnectionStatus === 'connected' && (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle size={12} /> Connected
                            </span>
                        )}
                        {dbConnectionStatus === 'error' && (
                            <span className="flex items-center gap-1 text-xs text-red-400">
                                <XCircle size={12} /> Error
                            </span>
                        )}
                        {dbConnectionStatus === 'connecting' && (
                            <span className="flex items-center gap-1 text-xs text-yellow-400">
                                <Loader size={12} className="animate-spin" /> Connecting...
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={selectedDatabase}
                            onChange={(e) => setSelectedDatabase(e.target.value)}
                            placeholder="~/database.db or postgresql://user:pass@host:5432/db"
                            className="flex-1 px-3 py-2 text-sm theme-bg-primary theme-text-primary border theme-border rounded focus:border-purple-500 focus:outline-none font-mono"
                        />
                        <button
                            onClick={browseForDatabase}
                            className="px-3 py-2 theme-bg-tertiary hover:bg-black/10 dark:hover:bg-white/10 theme-text-primary rounded text-sm transition-colors"
                            title="Browse for database file"
                        >
                            <Search size={16} />
                        </button>
                        <button
                            onClick={() => testDbConnection(selectedDatabase)}
                            disabled={dbConnectionStatus === 'connecting'}
                            className="px-3 py-2 theme-bg-tertiary hover:bg-black/10 dark:hover:bg-white/10 theme-text-primary rounded text-sm transition-colors disabled:opacity-50"
                            title="Test connection"
                        >
                            <Activity size={16} />
                        </button>
                        <button
                            onClick={() => connectToDatabase(selectedDatabase)}
                            disabled={dbConnectionStatus === 'connecting'}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                            {dbConnectionStatus === 'connecting' ? (
                                <Loader size={14} className="animate-spin" />
                            ) : (
                                <Link size={14} />
                            )}
                            Connect
                        </button>
                    </div>

                    {dbConnectionInfo && (
                        <div className="mt-2 text-xs">
                            {dbConnectionInfo.error ? (
                                <div className="text-red-400 bg-red-900/30 p-2 rounded">
                                    {dbConnectionInfo.error}
                                    {dbConnectionInfo.resolvedPath && (
                                        <div className="text-red-300/70 mt-1">Path: {dbConnectionInfo.resolvedPath}</div>
                                    )}
                                </div>
                            ) : (
                                <div className="theme-text-secondary theme-bg-primary p-2 rounded grid grid-cols-2 gap-x-4 gap-y-1">
                                    <span>Type:</span>
                                    <span className="text-purple-400 font-semibold">{getDbTypeLabel(dbConnectionInfo.dbType || 'sqlite')}</span>
                                    {dbConnectionInfo.resolvedPath && (
                                        <>
                                            <span>Path:</span>
                                            <span className="theme-text-primary font-mono truncate" title={dbConnectionInfo.resolvedPath}>
                                                {dbConnectionInfo.resolvedPath}
                                            </span>
                                        </>
                                    )}
                                    <span>Tables:</span>
                                    <span className="text-green-600 dark:text-green-400">{dbConnectionInfo.tableCount}</span>
                                    {dbConnectionInfo.fileSize && (
                                        <>
                                            <span>Size:</span>
                                            <span className="theme-text-primary">{formatFileSize(dbConnectionInfo.fileSize)}</span>
                                        </>
                                    )}
                                    {dbConnectionInfo.lastModified && (
                                        <>
                                            <span>Modified:</span>
                                            <span className="theme-text-primary">
                                                {new Date(dbConnectionInfo.lastModified).toLocaleString()}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mt-2 text-xs theme-text-muted">
                        <p className="mb-1">Connection string formats:</p>
                        <div className="grid grid-cols-1 gap-0.5 font-mono opacity-70">
                            <span>SQLite: ~/database.db</span>
                            <span>PostgreSQL: postgresql://user:pass@host:5432/db</span>
                            <span>MySQL: mysql://user:pass@host:3306/db</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <div className="border theme-border rounded-lg p-3 flex flex-col theme-bg-tertiary">
                        <h5 className="font-semibold mb-2 flex items-center gap-2 theme-text-primary">
                            <Table size={16} className="theme-text-secondary"/>
                            Database Schema
                        </h5>
                        <div className="grid grid-cols-2 gap-3 flex-1">
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                                {dbTables.length > 0 ? dbTables.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => handleViewSchema(name)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                                            selectedTable === name ? 'bg-purple-600 text-white' : 'theme-text-secondary hover:theme-bg-secondary'
                                        }`}
                                    >
                                        {name}
                                    </button>
                                )) : <p className="text-sm theme-text-muted">No tables found.</p>}
                            </div>
                            <div className="max-h-48 overflow-y-auto theme-bg-primary rounded p-2">
                                {loadingSchema ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader className="animate-spin text-purple-400" />
                                    </div>
                                ) : tableSchema ? (
                                    <ul className="text-sm font-mono space-y-1">
                                        {tableSchema.map((col: any) => (
                                            <li key={col.name} className="theme-text-secondary">
                                                - <span className="theme-text-primary">{col.name}</span>:
                                                <span className="text-yellow-600 dark:text-yellow-400">{col.type}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm theme-text-muted">Select a table.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border theme-border rounded-lg p-3 flex flex-col">
                        <h5 className="font-semibold flex items-center gap-2 mb-2">Query History</h5>
                        <ul className="space-y-1 max-h-48 overflow-y-auto text-sm font-mono flex-1">
                            {queryHistory.map((h, i) => (
                                <li key={i} className="flex items-center justify-between group p-1 rounded hover:theme-bg-tertiary">
                                    <span
                                        onClick={() => handleHistoryAction(i, 'run')}
                                        className="truncate cursor-pointer flex-1 pr-2"
                                        title={h.query}
                                    >
                                        {h.query}
                                    </span>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleHistoryAction(i, 'run')} title="Run"><Play size={14}/></button>
                                        <button onClick={() => handleHistoryAction(i, 'copy')} title="Copy"><Copy size={14}/></button>
                                        <button onClick={() => handleHistoryAction(i, 'favorite')} title="Favorite">
                                            <Star size={14} className={h.favorited ? 'fill-yellow-400 text-yellow-400' : ''} />
                                        </button>
                                        <button onClick={() => handleHistoryAction(i, 'delete')} title="Delete">
                                            <Trash2 size={14} className="text-red-400"/>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">Query Mode:</span>
                    <button
                        onClick={() => setSqlInputMode('sql')}
                        className={`px-3 py-1 text-xs rounded ${sqlInputMode === 'sql' ? 'theme-button-primary' : 'theme-button'}`}
                    >
                        SQL
                    </button>
                    <button
                        onClick={() => setSqlInputMode('nl')}
                        className={`px-3 py-1 text-xs rounded ${sqlInputMode === 'nl' ? 'theme-button-primary' : 'theme-button'}`}
                    >
                        Natural Language
                    </button>
                </div>

                {sqlInputMode === 'nl' ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <textarea
                                    value={nlQuery}
                                    onChange={(e) => setNlQuery(e.target.value)}
                                    rows={4}
                                    className="w-full p-2 theme-input font-mono text-sm"
                                    placeholder="e.g., show me the last 10 conversations..."
                                />
                                <button
                                    onClick={handleGenerateSql}
                                    disabled={generatingSql}
                                    className="w-full mt-2 px-4 py-2 theme-button-primary rounded text-sm disabled:opacity-50"
                                >
                                    {generatingSql ? 'Generating SQL...' : 'Generate SQL'}
                                </button>
                            </div>
                            <div className="theme-bg-tertiary p-2 rounded-lg flex flex-col">
                                <pre className="flex-1 text-xs font-mono p-2 overflow-auto">
                                    {generatedSql || 'Generated SQL will appear here...'}
                                </pre>
                                {generatedSql && (
                                    <button
                                        onClick={handleAcceptGeneratedSql}
                                        className="mt-2 w-full theme-button-success text-sm py-1 rounded"
                                    >
                                        Use this SQL
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            rows={5}
                            className="w-full p-2 theme-input font-mono text-sm"
                            placeholder="Enter your SQL query here..."
                        />
                        <div className="flex justify-end mt-2">
                            <button
                                onClick={handleExecuteQuery}
                                disabled={loadingQuery}
                                className="px-4 py-2 theme-button-primary rounded text-sm disabled:opacity-50"
                            >
                                {loadingQuery ? 'Executing...' : 'Execute Query'}
                            </button>
                        </div>
                    </>
                )}

                {loadingQuery && (
                    <div className="flex justify-center p-4">
                        <Loader className="animate-spin"/>
                    </div>
                )}
                {queryError && (
                    <div className="text-red-400 p-3 mt-2 rounded theme-bg-tertiary">{queryError}</div>
                )}

                {queryResult && queryResult.length > 0 && (
                    <div className="mt-4">
                        <div className="flex justify-between items-center mb-4">
                            <h5 className="font-semibold">Query Results ({queryResult.length} rows)</h5>
                            <div className="flex items-center gap-2">
                                {onAddToDash && (
                                    <button
                                        onClick={handleAddToDash}
                                        className="px-3 py-1 text-xs theme-button-primary rounded flex items-center gap-2"
                                    >
                                        <Plus size={14} /> Add to Dashboard
                                    </button>
                                )}
                                <button
                                    onClick={() => exportToCSV(queryResult, sqlQuery)}
                                    className="px-3 py-1 text-xs theme-button rounded flex items-center gap-2"
                                >
                                    <Download size={14} /> Export to CSV
                                </button>
                            </div>
                        </div>

                        <div className="border theme-border rounded-lg p-3 mb-4 theme-bg-tertiary">
                            <h6 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                <BarChartIcon size={16} /> Chart Explorer
                            </h6>
                            <div className="grid grid-cols-4 gap-3 items-end">
                                <div>
                                    <label className="text-xs theme-text-secondary">X-Axis</label>
                                    <select
                                        value={chartExplorer.xCol}
                                        onChange={e => setChartExplorer({...chartExplorer, xCol: e.target.value})}
                                        className="w-full theme-input mt-1 text-sm"
                                    >
                                        <option value="">Select column...</option>
                                        {Object.keys(queryResult[0]).map(col =>
                                            <option key={col} value={col}>{col}</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary">Y-Axis</label>
                                    <select
                                        value={chartExplorer.yCol}
                                        onChange={e => setChartExplorer({...chartExplorer, yCol: e.target.value})}
                                        className="w-full theme-input mt-1 text-sm"
                                    >
                                        <option value="">Select column...</option>
                                        {Object.keys(queryResult[0]).map(col =>
                                            <option key={col} value={col}>{col}</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs theme-text-secondary">Chart Type</label>
                                    <select
                                        value={chartExplorer.chartType}
                                        onChange={e => setChartExplorer({...chartExplorer, chartType: e.target.value})}
                                        className="w-full theme-input mt-1 text-sm"
                                    >
                                        <option value="bar">Bar Chart</option>
                                        <option value="line">Line Chart</option>
                                        <option value="scatter">Scatter Plot</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => setChartExplorer({...chartExplorer, showChart: !chartExplorer.showChart})}
                                    disabled={!chartExplorer.xCol || !chartExplorer.yCol}
                                    className="px-3 py-2 theme-button-primary rounded text-sm disabled:opacity-50"
                                >
                                    {chartExplorer.showChart ? 'Hide Chart' : 'Plot Chart'}
                                </button>
                            </div>
                        </div>

                        {chartExplorer.showChart && chartExplorer.xCol && chartExplorer.yCol && (
                            <div className="border theme-border rounded-lg p-3 mb-4 h-80">
                                <QueryChart
                                    data={queryResult}
                                    config={{
                                        x: chartExplorer.xCol,
                                        y: chartExplorer.yCol,
                                        type: chartExplorer.chartType === 'scatter' ? 'line' : chartExplorer.chartType as 'line' | 'bar'
                                    }}
                                    height={300}
                                />
                            </div>
                        )}

                        <div className="mt-2 overflow-x-auto theme-border border rounded-lg max-h-96">
                            <table className="w-full text-sm text-left">
                                <thead className="theme-bg-tertiary sticky top-0">
                                    <tr>
                                        {Object.keys(queryResult[0]).map(h => (
                                            <th key={h} className="p-2 font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="theme-bg-primary divide-y theme-divide">
                                    {queryResult.map((row, rIndex) => (
                                        <tr key={rIndex}>
                                            {Object.keys(row).map(key => (
                                                <td key={key} className="p-2 font-mono truncate max-w-xs">
                                                    {String(row[key])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            ) : activeTab === 'memory' ? (
                <div className="flex-1 overflow-auto">
                    <MemoryManagement isModal={false} />
                </div>
            ) : activeTab === 'labels' ? (
                <div className="flex-1 overflow-auto p-4">
                    <LabeledDataManager />
                </div>
            ) : activeTab === 'activity' ? (
                <div className="flex-1 overflow-auto">
                    <ActivityIntelligence />
                </div>
            ) : null}
        </div>
    );
};

export default DBTool;
