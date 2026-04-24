import React, { useState, useEffect, useRef } from "react";
import { DownloadCloud, Trash2, MessageSquare, Send, X } from "lucide-react";
import { Card, Button, Input } from "npcts";

const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.toLowerCase().includes('mac');

const LOCAL_PROVIDERS: Record<string, any> = {
    gguf: {
        name: 'GGUF/GGML',
        description: 'Direct GGUF/GGML model files (offline, no server)',
        defaultPort: null,
        docsUrl: 'https://huggingface.co/docs/hub/gguf',
        color: 'text-orange-400',
        bgColor: 'bg-orange-600'
    },
    llamacpp: {
        name: 'llama.cpp Server',
        description: 'High-performance C++ inference server',
        defaultPort: 8080,
        docsUrl: 'https://github.com/ggerganov/llama.cpp',
        color: 'text-green-400',
        bgColor: 'bg-green-600'
    },
    lmstudio: {
        name: 'LM Studio',
        description: 'Desktop app for running local LLMs',
        defaultPort: 1234,
        docsUrl: 'https://lmstudio.ai',
        color: 'text-purple-400',
        bgColor: 'bg-purple-600'
    },
    ollama: {
        name: 'Ollama',
        description: 'Local LLM server with model management',
        defaultPort: 11434,
        docsUrl: 'https://ollama.ai',
        color: 'text-blue-400',
        bgColor: 'bg-blue-600'
    },
    ...(isMac ? {
        omlx: {
            name: 'OMLX',
            description: 'Apple Silicon optimized LLM server',
            defaultPort: 8000,
            docsUrl: 'https://github.com/jundot/omlx',
            color: 'text-pink-400',
            bgColor: 'bg-pink-600'
        }
    } : {}),
};

const ModelList = ({ models, activeProvider, isDeleting, onDelete }: any) => {
    const [openChat, setOpenChat] = useState<string | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<Record<string, { role: string; content: string }[]>>({});
    const [chatLoading, setChatLoading] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sendMessage = async (modelName: string) => {
        if (!chatInput.trim() || chatLoading) return;
        const msg = chatInput.trim();
        setChatInput('');
        const prev = chatMessages[modelName] || [];
        const next = [...prev, { role: 'user', content: msg }];
        setChatMessages(m => ({ ...m, [modelName]: next }));
        setChatLoading(modelName);
        try {
            const port = activeProvider === 'omlx' ? 8000 : activeProvider === 'lmstudio' ? 1234 : activeProvider === 'llamacpp' ? 8080 : 11434;
            const isOllama = activeProvider === 'ollama';
            const url = isOllama
                ? `http://127.0.0.1:11434/api/chat`
                : `http://127.0.0.1:${port}/v1/chat/completions`;
            const body = isOllama
                ? { model: modelName, messages: next, stream: false }
                : { model: modelName, messages: next };
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
            }
            const data = await res.json();
            const reply = isOllama
                ? (data?.message?.content || data?.error || '(no response)')
                : (data?.choices?.[0]?.message?.content || data?.error?.message || '(no response)');
            setChatMessages(m => ({ ...m, [modelName]: [...next, { role: 'assistant', content: reply }] }));
        } catch (err: any) {
            console.error('Quick chat error:', err);
            const errMsg = err?.message || String(err) || 'unknown error';
            setChatMessages(m => ({ ...m, [modelName]: [...next, { role: 'assistant', content: `(error) ${errMsg}` }] }));
        }
        setChatLoading(null);
    };

    if (!models.length) {
        return (
            <p className="text-gray-500 text-center py-4 text-sm">
                {activeProvider === 'ollama' ? 'No models found. Pull a model above.' :
                 activeProvider === 'gguf' ? 'No GGUF/GGML files found. Scan to search.' :
                 'No models found. Load models in the app.'}
            </p>
        );
    }

    return (
        <div className="overflow-y-auto max-h-72 border border-gray-700 rounded divide-y divide-gray-700/50">
            {models.map((model: any, idx: number) => {
                const name = model.name || model.id || model.filename || model;
                const isOpen = openChat === name;
                return (
                    <div key={name || idx}>
                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 group">
                            <span className="text-sm text-white truncate flex-1 font-mono">{name}</span>
                            {model.size > 0 && <span className="text-xs text-gray-500 flex-shrink-0">{(model.size / 1e9).toFixed(1)}GB</span>}
                            <button
                                onClick={() => { setOpenChat(isOpen ? null : name); setTimeout(() => inputRef.current?.focus(), 50); }}
                                className="p-1 text-gray-500 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Quick chat"
                            >
                                <MessageSquare size={13} />
                            </button>
                            {activeProvider === 'ollama' && (
                                <button
                                    onClick={() => onDelete(name)}
                                    disabled={isDeleting === name}
                                    className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                                >
                                    {isDeleting === name ? '…' : <Trash2 size={13} />}
                                </button>
                            )}
                        </div>
                        {isOpen && (
                            <div className="border-t border-gray-700 bg-gray-900/50 px-3 py-2">
                                <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                                    {(chatMessages[name] || []).map((m, i) => (
                                        <div key={i} className={`text-xs px-2 py-1 rounded ${m.role === 'user' ? 'bg-blue-900/40 text-blue-200 ml-4' : 'bg-gray-800 text-gray-300 mr-4'}`}>
                                            {m.content}
                                        </div>
                                    ))}
                                    {chatLoading === name && <div className="text-xs text-gray-500 italic">thinking...</div>}
                                </div>
                                <div className="flex gap-1">
                                    <input
                                        ref={inputRef}
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && sendMessage(name)}
                                        placeholder="Say something..."
                                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-500"
                                    />
                                    <button onClick={() => sendMessage(name)} disabled={!chatInput.trim() || !!chatLoading}
                                        className="p-1.5 bg-purple-600 hover:bg-purple-500 rounded disabled:opacity-40 text-white">
                                        <Send size={11} />
                                    </button>
                                    <button onClick={() => setOpenChat(null)} className="p-1.5 hover:bg-gray-700 rounded text-gray-400">
                                        <X size={11} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const ModelManager = () => {
    const [activeProvider, setActiveProvider] = useState('ollama');
    const [providerStatuses, setProviderStatuses] = useState<Record<string, string>>({
        ollama: 'checking',
        lmstudio: 'checking',
        llamacpp: 'checking',
        ...(isMac ? { omlx: 'checking' } : {}),
        gguf: 'ready'
    });
    const [providerModels, setProviderModels] = useState<Record<string, any[]>>({
        ollama: [],
        lmstudio: [],
        llamacpp: [],
        ...(isMac ? { omlx: [] } : {}),
        gguf: []
    });
    const [ggufDirectory, setGgufDirectory] = useState('');
    const [scannedDirectories, setScannedDirectories] = useState<string[]>([]);
    const [pullModelName, setPullModelName] = useState('llama3.1');
    const [pullProgress, setPullProgress] = useState(null);
    const [isPulling, setIsPulling] = useState(false);
    const [isDeleting, setIsDeleting] = useState(null);
    const [isScanning, setIsScanning] = useState(false);

    const [hfModelUrl, setHfModelUrl] = useState('');
    const [hfDownloadProgress, setHfDownloadProgress] = useState(null);
    const [isDownloadingHf, setIsDownloadingHf] = useState(false);

    const [hfSearchQuery, setHfSearchQuery] = useState('');
    const [hfSearchResults, setHfSearchResults] = useState([]);
    const [isSearchingHf, setIsSearchingHf] = useState(false);
    const [selectedHfRepo, setSelectedHfRepo] = useState(null);
    const [hfRepoFiles, setHfRepoFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

    const fetchModelsForProvider = async (provider) => {
        if (provider === 'ollama') {
            const result = await window.api.getLocalOllamaModels();
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, ollama: result.models || [] }));
            }
        } else if (provider === 'gguf') {

            const result = await window.api.scanGgufModels?.(ggufDirectory || null);
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, gguf: result.models || [] }));
                if (result.scannedDirectories) {
                    setScannedDirectories(result.scannedDirectories);
                }
            }
        } else {

            const result = await window.api.scanLocalModels?.(provider);
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, [provider]: result.models || [] }));
            }
        }
    };

    const checkAllStatuses = async () => {

        const ollamaStatus = await window.api.checkOllamaStatus();
        const ollamaStatusStr = ollamaStatus?.running ? 'running' : (ollamaStatus?.installed === false ? 'not_found' : 'not_running');
        setProviderStatuses(prev => ({ ...prev, ollama: ollamaStatusStr }));
        if (ollamaStatusStr === 'running') fetchModelsForProvider('ollama');

        let llamacppStatus: string = 'not_found';
        for (const provider of ['lmstudio', 'llamacpp', ...(isMac ? ['omlx'] : [])]) {
            try {
                const status = await window.api.getLocalModelStatus?.(provider);
                const s = status?.running ? 'running' : (status?.installed ? 'not_running' : 'not_found');
                if (provider === 'llamacpp') llamacppStatus = s;
                setProviderStatuses(prev => ({ ...prev, [provider]: s }));
                if (status?.running) fetchModelsForProvider(provider);
            } catch {
                const s = 'not_found';
                if (provider === 'llamacpp') llamacppStatus = s;
                setProviderStatuses(prev => ({ ...prev, [provider]: s }));
            }
        }

        setProviderStatuses(prev => ({
            ...prev,
            gguf: llamacppStatus === 'not_found' ? 'not_found' : 'ready',
        }));
    };

    const handleScanModels = async () => {
        setIsScanning(true);
        await fetchModelsForProvider(activeProvider);
        setIsScanning(false);
    };

    useEffect(() => {
        checkAllStatuses();
        const cleanupProgress = window.api.onOllamaPullProgress((progress) => setPullProgress(progress));
        const cleanupComplete = window.api.onOllamaPullComplete(() => {
            setIsPulling(false);
            setPullProgress({ status: 'Success!', details: 'Model installed.' });
            setTimeout(() => {
                setPullProgress(null);
                setPullModelName('');
                fetchModelsForProvider('ollama');
            }, 2000);
        });
        const cleanupError = window.api.onOllamaPullError((error) => {
            setIsPulling(false);
            setPullProgress({ status: 'Error', details: error });
        });
        return () => {
            cleanupProgress();
            cleanupComplete();
            cleanupError();
        };
    }, []);

    const handlePullModel = async () => {
        if (!pullModelName.trim() || isPulling) return;
        setIsPulling(true);
        setPullProgress({ status: 'Starting download...' });
        await window.api.pullOllamaModel({ model: pullModelName });
    };

    const handleDeleteModel = async (modelName) => {
        if (isDeleting) return;
        setIsDeleting(modelName);
        await window.api.deleteOllamaModel({ model: modelName });
        fetchModelsForProvider('ollama');
        setIsDeleting(null);
    };

    const handleDownloadHfModel = async () => {
        if (!hfModelUrl.trim() || isDownloadingHf) return;
        setIsDownloadingHf(true);
        setHfDownloadProgress({ status: 'Starting download...', percent: 0 });
        try {
            const targetDir = ggufDirectory || '~/.npcsh/models/gguf';
            const result = await (window as any).api.downloadHfModel?.({
                url: hfModelUrl,
                targetDir
            });
            if (result?.error) {
                setHfDownloadProgress({ status: 'Error', details: result.error });
            } else {
                setHfDownloadProgress({ status: 'Success!', details: `Downloaded to ${result.path}` });
                setTimeout(() => {
                    setHfDownloadProgress(null);
                    setHfModelUrl('');
                    fetchModelsForProvider('gguf');
                }, 2000);
            }
        } catch (err: any) {
            setHfDownloadProgress({ status: 'Error', details: err.message });
        } finally {
            setIsDownloadingHf(false);
        }
    };

    const handleSearchHf = async () => {
        if (!hfSearchQuery.trim() || isSearchingHf) return;
        setIsSearchingHf(true);
        setSelectedHfRepo(null);
        setHfRepoFiles([]);
        try {
            const result = await (window as any).api.searchHfModels?.({ query: hfSearchQuery, limit: 20 });
            if (result?.error) {
                console.error('HF search error:', result.error);
                setHfSearchResults([]);
            } else {
                setHfSearchResults(result.models || []);
            }
        } catch (err) {
            console.error('HF search error:', err);
            setHfSearchResults([]);
        } finally {
            setIsSearchingHf(false);
        }
    };

    const handleSelectHfRepo = async (repoId) => {
        setSelectedHfRepo(repoId);
        setIsLoadingFiles(true);
        try {
            const result = await (window as any).api.listHfFiles?.({ repoId });
            if (result?.error) {
                console.error('HF files error:', result.error);
                setHfRepoFiles([]);
            } else {
                setHfRepoFiles(result.files || []);
            }
        } catch (err) {
            console.error('HF files error:', err);
            setHfRepoFiles([]);
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const handleDownloadHfFile = async (filename) => {
        if (!selectedHfRepo || isDownloadingHf) return;
        setIsDownloadingHf(true);
        setHfDownloadProgress({ status: `Downloading ${filename}...`, percent: 0 });
        try {
            const targetDir = ggufDirectory || '~/.npcsh/models/gguf';
            const result = await (window as any).api.downloadHfFile?.({
                repoId: selectedHfRepo,
                filename,
                targetDir
            });
            if (result?.error) {
                setHfDownloadProgress({ status: 'Error', details: result.error });
            } else {
                setHfDownloadProgress({ status: 'Success!', details: `Downloaded to ${result.path}` });
                setTimeout(() => {
                    setHfDownloadProgress(null);
                    fetchModelsForProvider('gguf');
                }, 2000);
            }
        } catch (err: any) {
            setHfDownloadProgress({ status: 'Error', details: err.message });
        } finally {
            setIsDownloadingHf(false);
        }
    };

    const currentStatus = providerStatuses[activeProvider];
    const currentModels = providerModels[activeProvider] || [];
    const providerInfo = LOCAL_PROVIDERS[activeProvider];

    return (
        <div className="space-y-4">
            <div className="flex gap-2 border-b border-gray-700 pb-2">
                {Object.entries(LOCAL_PROVIDERS).map(([key, info]) => (
                    <button
                        key={key}
                        onClick={() => setActiveProvider(key)}
                        className={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${
                            activeProvider === key
                                ? `${info.bgColor} text-white`
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            {info.name}
                            <span className={`w-2 h-2 rounded-full ${
                                providerStatuses[key] === 'running' || providerStatuses[key] === 'ready' ? 'bg-green-400' :
                                providerStatuses[key] === 'checking' ? 'bg-yellow-400 animate-pulse' :
                                'bg-red-400'
                            }`} />
                        </span>
                    </button>
                ))}
            </div>

            <Card className="!h-auto">
                <div className="p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className={`font-semibold text-lg ${providerInfo.color}`}>{providerInfo.name}</h4>
                            <p className="text-xs text-gray-400">{providerInfo.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                                currentStatus === 'running' || currentStatus === 'ready' ? 'bg-green-900 text-green-300' :
                                currentStatus === 'checking' ? 'bg-yellow-900 text-yellow-300' :
                                currentStatus === 'not_running' ? 'bg-yellow-900/70 text-yellow-300' :
                                'bg-red-900 text-red-300'
                            }`}>
                                {currentStatus === 'running' ? 'Running' :
                                 currentStatus === 'ready' ? 'Ready' :
                                 currentStatus === 'checking' ? 'Checking...' :
                                 currentStatus === 'not_running' ? 'Not Running' : 'Not Found'}
                            </span>
                            {activeProvider !== 'gguf' && currentStatus === 'not_running' && (
                                <button
                                    onClick={async () => {
                                        setProviderStatuses(prev => ({ ...prev, [activeProvider]: 'checking' }));
                                        const res = await (window as any).api.startLocalProvider?.(activeProvider);
                                        if (res && !res.success) alert(res.error || 'Failed to start');
                                        setTimeout(() => checkAllStatuses(), 1500);
                                    }}
                                    className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded"
                                >
                                    Start
                                </button>
                            )}
                            {activeProvider !== 'gguf' && currentStatus === 'running' && (
                                <button
                                    onClick={async () => {
                                        const res = await (window as any).api.stopLocalProvider?.(activeProvider);
                                        if (res && !res.success) alert(res.error || 'Failed to stop');
                                        setTimeout(() => checkAllStatuses(), 1000);
                                    }}
                                    className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded"
                                >
                                    Stop
                                </button>
                            )}
                            <a
                                href={providerInfo.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-cyan-400 hover:text-cyan-300"
                            >
                                Docs
                            </a>
                        </div>
                    </div>
                    {providerInfo.defaultPort && (
                        <p className="text-xs text-gray-500 mt-2">Default Port: {providerInfo.defaultPort}</p>
                    )}
                    {activeProvider === 'gguf' && (
                        <p className="text-xs text-gray-500 mt-2">No server required - runs locally via llama-cpp-python</p>
                    )}
                </div>
            </Card>

            {activeProvider === 'ollama' && currentStatus === 'running' && (
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Pull Model from Ollama Hub</label>
                    <div className="flex gap-2">
                        <Input
                            value={pullModelName}
                            onChange={(e) => setPullModelName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
                            placeholder="e.g., llama3.1, mistral, codellama"
                            disabled={isPulling}
                            className="flex-1"
                        />
                        <Button variant="primary" onClick={handlePullModel} disabled={isPulling || !pullModelName.trim()}>
                            {isPulling ? 'Pulling...' : 'Pull'}
                        </Button>
                    </div>
                </div>
            )}

            {isPulling && pullProgress && (
                <Card>
                    <div className="p-3">
                        <p className="text-sm font-semibold text-white">{pullProgress.status}</p>
                        {pullProgress.details && <p className="text-xs text-gray-400 mt-1 font-mono">{pullProgress.details}</p>}
                        {pullProgress.percent && (
                            <div className="w-full bg-gray-600 rounded-full h-2.5 mt-2">
                                <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${pullProgress.percent}%` }} />
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {currentStatus === 'not_found' && activeProvider === 'ollama' && (
                <Card>
                    <div className="text-center p-4">
                        <h4 className="font-semibold text-lg text-white">Ollama Not Found</h4>
                        <p className="text-gray-400 my-2">Ollama is required to run local models.</p>
                        <Button variant="primary" onClick={async () => {
                            setProviderStatuses(prev => ({ ...prev, ollama: 'installing' }));
                            await window.api.installOllama();
                            checkAllStatuses();
                        }}>
                            <DownloadCloud size={18}/> Install Ollama
                        </Button>
                    </div>
                </Card>
            )}

            {(currentStatus === 'not_found' || currentStatus === 'not_running') && activeProvider !== 'ollama' && activeProvider !== 'gguf' && (
                <Card>
                    <div className="text-center p-4">
                        <h4 className="font-semibold text-lg text-white">{providerInfo.name} Not Detected</h4>
                        <p className="text-gray-400 my-2">
                            {activeProvider === 'lmstudio'
                                ? 'Start LM Studio and enable the local server (usually on port 1234).'
                                : 'Start llama.cpp server (usually on port 8080).'}
                        </p>
                        <div className="flex gap-2 justify-center mt-3">
                            <Button variant="secondary" onClick={checkAllStatuses}>
                                Refresh Status
                            </Button>
                            <a
                                href={providerInfo.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm"
                            >
                                Get {providerInfo.name}
                            </a>
                        </div>
                    </div>
                </Card>
            )}

            {activeProvider === 'gguf' && (
                <div className="space-y-3">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Add Model File</label>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                const result = await window.api.browseGgufFile?.();
                                if (result?.success && result.model) {
                                    setProviderModels(prev => ({
                                        ...prev,
                                        gguf: [...(prev.gguf || []).filter(m => m.path !== result.model.path), result.model]
                                    }));
                                }
                            }}
                            className="w-full"
                        >
                            Browse for GGUF/GGML File...
                        </Button>
                        <p className="text-xs text-gray-500 mt-1">
                            Select a specific .gguf, .ggml, or .bin model file from your filesystem.
                        </p>
                    </div>

                    <div className="border-t border-gray-700 pt-3">
                        <label className="block text-sm text-gray-400 mb-2">Scan Directory (optional)</label>
                        <div className="flex gap-2">
                            <Input
                                value={ggufDirectory}
                                onChange={(e) => setGgufDirectory(e.target.value)}
                                placeholder="Leave empty to scan all default locations"
                                className="flex-1"
                            />
                            <Button variant="secondary" onClick={() => fetchModelsForProvider('gguf')} disabled={isScanning}>
                                {isScanning ? 'Scanning...' : 'Scan'}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Leave empty to auto-scan HuggingFace cache, LM Studio, llama.cpp, KoboldCPP, GPT4All, and more.
                        </p>
                    </div>

                    {scannedDirectories.length > 0 && (
                        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                            <p className="text-xs text-gray-400 mb-2">Scanned locations ({scannedDirectories.length} found):</p>
                            <div className="max-h-24 overflow-y-auto">
                                {scannedDirectories.map((dir, idx) => (
                                    <p key={idx} className="text-xs text-gray-500 font-mono truncate" title={dir}>
                                        {dir.replace(/^\/home\/[^/]+/, '~')}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="block text-sm text-gray-400">Search HuggingFace for GGUF Models</label>
                        <div className="flex gap-2">
                            <Input
                                value={hfSearchQuery}
                                onChange={(e) => setHfSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchHf()}
                                placeholder="Search: llama, qwen, mistral, phi..."
                                className="flex-1"
                            />
                            <Button variant="primary" onClick={handleSearchHf} disabled={isSearchingHf || !hfSearchQuery.trim()}>
                                {isSearchingHf ? 'Searching...' : 'Search'}
                            </Button>
                        </div>

                        {hfSearchResults.length > 0 && (
                            <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-700 rounded p-2">
                                {hfSearchResults.map((repo: any) => (
                                    <button
                                        key={repo.id}
                                        onClick={() => handleSelectHfRepo(repo.id)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                                            selectedHfRepo === repo.id
                                                ? 'bg-orange-600 text-white'
                                                : 'hover:bg-gray-700 text-gray-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium truncate">{repo.id}</span>
                                            <span className="text-gray-500 ml-2">↓{repo.downloads?.toLocaleString()}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedHfRepo && (
                            <div className="border border-gray-700 rounded p-2">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs text-orange-400 font-medium">{selectedHfRepo}</span>
                                    <button onClick={() => { setSelectedHfRepo(null); setHfRepoFiles([]); }} className="text-xs text-gray-500 hover:text-white">✕</button>
                                </div>
                                {isLoadingFiles ? (
                                    <p className="text-xs text-gray-500">Loading files...</p>
                                ) : hfRepoFiles.length > 0 ? (
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {hfRepoFiles.map((file: any) => (
                                            <div key={file.filename} className="flex justify-between items-center px-2 py-1 hover:bg-gray-700 rounded text-xs">
                                                <div className="flex-1 truncate">
                                                    <span className="text-gray-300">{file.filename}</span>
                                                    {file.size_gb && <span className="text-gray-500 ml-2">({file.size_gb} GB)</span>}
                                                    {file.quantization !== 'unknown' && (
                                                        <span className="ml-2 px-1 py-0.5 bg-gray-700 rounded text-green-400">{file.quantization}</span>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => handleDownloadHfFile(file.filename)}
                                                    disabled={isDownloadingHf}
                                                    className="ml-2 text-xs px-2 py-1"
                                                >
                                                    Download
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500">No GGUF files found in this repository.</p>
                                )}
                            </div>
                        )}

                        <details className="text-xs">
                            <summary className="text-gray-500 cursor-pointer hover:text-gray-300">Or enter direct URL/model ID</summary>
                            <div className="flex gap-2 mt-2">
                                <Input
                                    value={hfModelUrl}
                                    onChange={(e) => setHfModelUrl(e.target.value)}
                                    placeholder="unsloth/Qwen3-4B-GGUF"
                                    className="flex-1 text-xs"
                                />
                                <Button variant="secondary" onClick={handleDownloadHfModel} disabled={isDownloadingHf || !hfModelUrl.trim()}>
                                    {isDownloadingHf ? '...' : 'Go'}
                                </Button>
                            </div>
                        </details>
                    </div>

                    {hfDownloadProgress && (
                        <div className="bg-gray-800 border border-gray-700 rounded p-3">
                            <p className="text-sm font-semibold text-white">{hfDownloadProgress.status}</p>
                            {hfDownloadProgress.details && <p className="text-xs text-gray-400 mt-1 font-mono break-all">{hfDownloadProgress.details}</p>}
                            {hfDownloadProgress.percent > 0 && (
                                <div className="w-full bg-gray-600 rounded-full h-2.5 mt-2">
                                    <div className="bg-orange-500 h-2.5 rounded-full transition-all" style={{ width: `${hfDownloadProgress.percent}%` }} />
                                </div>
                            )}
                        </div>
                    )}

                    <Card>
                        <div className="p-3">
                            <p className="text-sm text-gray-300">
                                <strong>Auto-scanned locations:</strong>
                            </p>
                            <ul className="text-xs text-gray-500 mt-1 space-y-0.5 list-disc list-inside">
                                <li>~/.cache/huggingface/hub (HuggingFace transformers)</li>
                                <li>~/.cache/lm-studio/models, ~/.lmstudio/models (LM Studio)</li>
                                <li>~/llama.cpp/models, ~/.llama.cpp/models (llama.cpp)</li>
                                <li>~/koboldcpp/models (KoboldCPP)</li>
                                <li>~/.cache/gpt4all (GPT4All)</li>
                                <li>~/text-generation-webui/models (oobabooga)</li>
                                <li>~/.npcsh/models/gguf, ~/models (general)</li>
                            </ul>
                        </div>
                    </Card>
                </div>
            )}

            {(currentStatus === 'running' || activeProvider === 'gguf') && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm text-gray-400">Available Models ({currentModels.length})</h4>
                        <Button variant="secondary" onClick={handleScanModels} disabled={isScanning}>
                            {isScanning ? 'Scanning...' : 'Scan Models'}
                        </Button>
                    </div>
                    <ModelList
                        models={currentModels}
                        activeProvider={activeProvider}
                        isDeleting={isDeleting}
                        onDelete={handleDeleteModel}
                    />
                </div>
            )}
        </div>
    );
};

export default ModelManager;
