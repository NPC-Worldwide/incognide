import React, { useState, useEffect, useCallback } from 'react';
import { useAiEnabled, useAiFeature } from './AiFeatureContext';
import { BACKEND_URL } from '../config';
import { Settings, X, Save, FolderOpen, Eye, EyeOff, DownloadCloud, Trash2, Keyboard, KeyRound, Plus, Copy, ExternalLink, Terminal, Volume2, Mic, Play, Square, Upload } from 'lucide-react';
import { Modal, Card, Button, Input, Select } from 'npcts';
import PythonEnvSettings from './PythonEnvSettings';
import UserMenu from './UserMenu';
import PasswordImport from './PasswordImport';
import { PasswordEntry } from '../utils/passwordImport';

// Password Manager Component
const PasswordManager = () => {
    const [credentials, setCredentials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [encryptionStatus, setEncryptionStatus] = useState<any>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
    const [formData, setFormData] = useState({ site: '', username: '', password: '', notes: '' });
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
    const [showImportModal, setShowImportModal] = useState(false);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

    const loadCredentials = useCallback(async () => {
        setLoading(true);
        try {
            const result = await (window as any).api.passwordList();
            if (result.success) {
                setCredentials(result.credentials);
            }
            const status = await (window as any).api.passwordEncryptionStatus();
            setEncryptionStatus(status);
        } catch (err) {
            console.error('Failed to load credentials:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    const handleSave = async () => {
        if (!formData.site || !formData.username || !formData.password) return;
        try {
            const result = await (window as any).api.passwordSave(formData);
            if (result.success) {
                setFormData({ site: '', username: '', password: '', notes: '' });
                setShowAddForm(false);
                setEditingId(null);
                loadCredentials();
            }
        } catch (err) {
            console.error('Failed to save credential:', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this credential?')) return;
        try {
            const result = await (window as any).api.passwordDelete(id);
            if (result.success) {
                loadCredentials();
            }
        } catch (err) {
            console.error('Failed to delete credential:', err);
        }
    };

    const handleEdit = async (id: string) => {
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) {
                setFormData({
                    site: result.credential.site,
                    username: result.credential.username,
                    password: result.credential.password,
                    notes: result.credential.notes || ''
                });
                setEditingId(id);
                setShowAddForm(true);
            }
        } catch (err) {
            console.error('Failed to get credential:', err);
        }
    };

    const revealPassword = async (id: string) => {
        if (revealedPasswords[id]) {
            setRevealedPasswords(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            return;
        }
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) {
                setRevealedPasswords(prev => ({ ...prev, [id]: result.credential.password }));
            }
        } catch (err) {
            console.error('Failed to reveal password:', err);
        }
    };

    const copyToClipboard = async (id: string, field: 'username' | 'password') => {
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) {
                await navigator.clipboard.writeText(result.credential[field]);
            }
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Handle importing passwords from external password managers
    const handleImport = useCallback(async (importedPasswords: PasswordEntry[]) => {
        setImportProgress({ current: 0, total: importedPasswords.length });

        let imported = 0;
        for (const entry of importedPasswords) {
            try {
                // Convert to the format expected by the existing API
                const result = await (window as any).api.passwordSave({
                    site: entry.url || entry.name,
                    username: entry.username || '',
                    password: entry.password,
                    notes: [
                        entry.notes,
                        entry.folder ? `Folder: ${entry.folder}` : '',
                        entry.totp ? `TOTP: ${entry.totp}` : ''
                    ].filter(Boolean).join('\n')
                });

                if (result.success) {
                    imported++;
                }
            } catch (err) {
                console.error(`Failed to import ${entry.name}:`, err);
            }

            setImportProgress({ current: imported, total: importedPasswords.length });
        }

        // Reload credentials after import
        await loadCredentials();
        setImportProgress(null);
        setShowImportModal(false);
    }, [loadCredentials]);

    if (loading) {
        return <div className="text-center py-8 text-gray-400">Loading credentials...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Encryption status */}
            {encryptionStatus && (
                <div className={`p-3 rounded-lg text-sm ${encryptionStatus.available ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                    <KeyRound size={16} className="inline mr-2" />
                    {encryptionStatus.message}
                </div>
            )}

            {/* Add/Edit form */}
            {showAddForm ? (
                <Card title={editingId ? 'Edit Credential' : 'Add New Credential'}>
                    <div className="space-y-3">
                        <Input
                            label="Site/URL"
                            value={formData.site}
                            onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                            placeholder="example.com or https://example.com"
                        />
                        <Input
                            label="Username/Email"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            placeholder="user@example.com"
                        />
                        <div className="relative">
                            <Input
                                label="Password"
                                type={showPassword['form'] ? 'text' : 'password'}
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-8 p-1 text-gray-400 hover:text-white"
                                onClick={() => setShowPassword(prev => ({ ...prev, form: !prev.form }))}
                            >
                                {showPassword['form'] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <Input
                            label="Notes (optional)"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Additional notes..."
                        />
                        <div className="flex gap-2 pt-2">
                            <Button variant="primary" onClick={handleSave}>
                                <Save size={16} /> {editingId ? 'Update' : 'Save'}
                            </Button>
                            <Button variant="secondary" onClick={() => {
                                setShowAddForm(false);
                                setEditingId(null);
                                setFormData({ site: '', username: '', password: '', notes: '' });
                            }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setShowAddForm(true)}>
                        <Plus size={16} /> Add Credential
                    </Button>
                    <Button variant="secondary" onClick={() => setShowImportModal(true)}>
                        <Upload size={16} /> Import
                    </Button>
                </div>
            )}

            {/* Import progress */}
            {importProgress && (
                <div className="bg-blue-900/30 rounded-lg p-3 text-sm text-blue-400">
                    Importing passwords... {importProgress.current} / {importProgress.total}
                </div>
            )}

            {/* Credentials list */}
            <div className="space-y-2">
                {credentials.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <KeyRound size={32} className="mx-auto mb-2 text-gray-600" />
                        <p>No saved credentials yet.</p>
                        <p className="text-sm mt-1">Add manually or import from another password manager.</p>
                    </div>
                ) : (
                    credentials.map((cred) => (
                        <div key={cred.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <ExternalLink size={14} className="text-gray-500" />
                                        <span className="font-medium text-white truncate">{cred.site}</span>
                                    </div>
                                    <div className="text-sm text-gray-400 mt-1">{cred.username}</div>
                                    {revealedPasswords[cred.id] && (
                                        <div className="text-sm text-green-400 mt-1 font-mono">{revealedPasswords[cred.id]}</div>
                                    )}
                                    {cred.notes && <div className="text-xs text-gray-500 mt-1">{cred.notes}</div>}
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                    <button
                                        onClick={() => copyToClipboard(cred.id, 'username')}
                                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                        title="Copy username"
                                    >
                                        <Copy size={14} />
                                    </button>
                                    <button
                                        onClick={() => revealPassword(cred.id)}
                                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                        title={revealedPasswords[cred.id] ? "Hide password" : "Show password"}
                                    >
                                        {revealedPasswords[cred.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(cred.id, 'password')}
                                        className="p-1.5 hover:bg-gray-700 rounded text-blue-400 hover:text-blue-300"
                                        title="Copy password"
                                    >
                                        <KeyRound size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(cred.id)}
                                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                        title="Edit"
                                    >
                                        <Settings size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(cred.id)}
                                        className="p-1.5 hover:bg-gray-700 rounded text-red-400 hover:text-red-300"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Import Modal */}
            <PasswordImport
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImport={handleImport}
            />
        </div>
    );
};

// Voice/TTS Manager Component
const VoiceManager = () => {
    const [engines, setEngines] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedEngine, setSelectedEngine] = useState('kokoro');
    const [selectedVoice, setSelectedVoice] = useState('af_heart');
    const [testText, setTestText] = useState('Hello! This is a test of the text-to-speech system.');
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
    const [savedSettings, setSavedSettings] = useState<any>({});

    // Load available voices from API
    const loadVoices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/api/audio/voices`);
            if (!response.ok) throw new Error('Failed to fetch voices');
            const data = await response.json();
            if (data.success && data.engines) {
                setEngines(data.engines);
                // Set default engine to first available one
                const availableEngines = Object.entries(data.engines)
                    .filter(([_, e]: [string, any]) => e.available)
                    .sort(([_, a]: [string, any], [__, b]: [string, any]) => (b.default ? 1 : 0) - (a.default ? 1 : 0));
                if (availableEngines.length > 0) {
                    const [engineKey, engineData] = availableEngines[0] as [string, any];
                    setSelectedEngine(engineKey);
                    if (engineData.voices?.length > 0) {
                        setSelectedVoice(engineData.voices[0].id);
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load voices');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load saved TTS settings
    const loadSettings = useCallback(async () => {
        try {
            const stored = localStorage.getItem('npcStudio_ttsSettings');
            if (stored) {
                const settings = JSON.parse(stored);
                setSavedSettings(settings);
                if (settings.engine) setSelectedEngine(settings.engine);
                if (settings.voice) setSelectedVoice(settings.voice);
            }
        } catch (err) {
            console.error('Failed to load TTS settings:', err);
        }
    }, []);

    useEffect(() => {
        loadVoices();
        loadSettings();
    }, [loadVoices, loadSettings]);

    // Save settings
    const saveSettings = () => {
        const settings = {
            engine: selectedEngine,
            voice: selectedVoice
        };
        localStorage.setItem('npcStudio_ttsSettings', JSON.stringify(settings));
        setSavedSettings(settings);
        // Dispatch event for other components to pick up
        window.dispatchEvent(new CustomEvent('ttsSettingsChanged', { detail: settings }));
    };

    // Test the selected voice
    const testVoice = async () => {
        if (isPlaying && audioRef) {
            audioRef.pause();
            setAudioRef(null);
            setIsPlaying(false);
            return;
        }

        setIsPlaying(true);
        try {
            const engine = engines[selectedEngine];
            const voice = engine?.voices?.find((v: any) => v.id === selectedVoice);

            const requestBody: any = {
                text: testText,
                engine: selectedEngine,
                voice: selectedVoice
            };

            // Add lang_code for Kokoro
            if (selectedEngine === 'kokoro' && voice?.lang) {
                requestBody.lang_code = voice.lang;
            }

            // Add voice_id for ElevenLabs
            if (selectedEngine === 'elevenlabs') {
                requestBody.voice_id = selectedVoice;
            }

            const response = await fetch(`${BACKEND_URL}/api/audio/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'TTS failed');
            }

            const result = await response.json();
            if (result.audio) {
                const format = result.format || 'mp3';
                const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
                const audio = new Audio(`data:${mimeType};base64,${result.audio}`);
                setAudioRef(audio);

                audio.onended = () => {
                    setIsPlaying(false);
                    setAudioRef(null);
                };

                audio.onerror = () => {
                    setIsPlaying(false);
                    setAudioRef(null);
                };

                await audio.play();
            }
        } catch (err: any) {
            console.error('TTS test error:', err);
            setError(err.message);
            setIsPlaying(false);
        }
    };

    const currentEngine = engines[selectedEngine];
    const availableVoices = currentEngine?.voices || [];

    if (loading) {
        return <div className="text-center py-8 text-gray-400">Loading voice engines...</div>;
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400">
                    {error}
                    <button onClick={() => setError(null)} className="ml-2 text-red-300">×</button>
                </div>
            )}

            {/* Engine Selection */}
            <Card title="TTS Engine">
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(engines).map(([key, engine]: [string, any]) => (
                            <button
                                key={key}
                                onClick={() => {
                                    setSelectedEngine(key);
                                    if (engine.voices?.length > 0) {
                                        setSelectedVoice(engine.voices[0].id);
                                    }
                                }}
                                disabled={!engine.available}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    selectedEngine === key
                                        ? 'bg-blue-600 text-white'
                                        : engine.available
                                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Volume2 size={16} />
                                    {engine.name}
                                    {engine.default && <span className="text-xs text-green-400">(Default)</span>}
                                </div>
                            </button>
                        ))}
                    </div>

                    {currentEngine && !currentEngine.available && currentEngine.install && (
                        <div className="p-3 bg-yellow-900/30 rounded-lg">
                            <p className="text-sm text-yellow-400 mb-2">Install command:</p>
                            <code className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded block overflow-x-auto">
                                {currentEngine.install}
                            </code>
                        </div>
                    )}
                </div>
            </Card>

            {/* Voice Selection */}
            {currentEngine?.available && availableVoices.length > 0 && (
                <Card title="Voice">
                    <div className="space-y-3">
                        <Select
                            value={selectedVoice}
                            onChange={(e) => setSelectedVoice(e.target.value)}
                            options={availableVoices.map((v: any) => ({
                                value: v.id,
                                label: v.name || v.id
                            }))}
                        />

                        {selectedEngine === 'kokoro' && (
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                {availableVoices.map((voice: any) => (
                                    <button
                                        key={voice.id}
                                        onClick={() => setSelectedVoice(voice.id)}
                                        className={`p-2 rounded text-left text-sm transition-colors ${
                                            selectedVoice === voice.id
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        <div className="font-medium">{voice.name}</div>
                                        <div className="text-xs opacity-70">
                                            {voice.lang === 'a' ? 'American' : voice.lang === 'b' ? 'British' : voice.lang}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Test Voice */}
            <Card title="Test Voice">
                <div className="space-y-3">
                    <textarea
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white resize-none"
                        rows={3}
                        placeholder="Enter text to test..."
                    />
                    <div className="flex gap-2">
                        <Button
                            variant={isPlaying ? 'danger' : 'primary'}
                            onClick={testVoice}
                            disabled={!currentEngine?.available}
                        >
                            {isPlaying ? (
                                <><Square size={16} /> Stop</>
                            ) : (
                                <><Play size={16} /> Test Voice</>
                            )}
                        </Button>
                        <Button variant="secondary" onClick={loadVoices}>
                            Refresh Engines
                        </Button>
                    </div>
                </div>
            </Card>

            {/* STT Settings */}
            <Card title="Speech-to-Text (STT)">
                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                        <Mic size={20} className="text-blue-400" />
                        <div>
                            <p className="text-sm text-white font-medium">Voice Recording</p>
                            <p className="text-xs text-gray-400">
                                Uses Whisper for speech recognition. Click the microphone button in the chat input to record.
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        STT uses faster-whisper or openai-whisper (whichever is installed).
                        For best results, install faster-whisper: <code className="bg-gray-800 px-1 rounded">pip install faster-whisper</code>
                    </p>
                </div>
            </Card>

            {/* Save Settings */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                    {savedSettings.engine && (
                        <span>Current: {engines[savedSettings.engine]?.name} - {
                            engines[savedSettings.engine]?.voices?.find((v: any) => v.id === savedSettings.voice)?.name || savedSettings.voice
                        }</span>
                    )}
                </div>
                <Button variant="primary" onClick={saveSettings}>
                    <Save size={16} /> Save as Default
                </Button>
            </div>
        </div>
    );
};

const HOME_DIR = '~/.npcsh';

const defaultKeyboardShortcuts = {
    newConversation: 'Ctrl+Shift+C',
    newFolder: 'Ctrl+N',
    newBrowser: 'Ctrl+Shift+B',
    newTerminal: 'Ctrl+Shift+T',
    newCodeFile: 'Ctrl+Shift+F',
    newWorkspace: 'Ctrl+Shift+N',
    toggleSidebar: 'Ctrl+B',
    commandPalette: 'Ctrl+Shift+P',
    fileSearch: 'Ctrl+P',
    globalSearch: 'Ctrl+Shift+S',
    save: 'Ctrl+S',
    closePane: 'Ctrl+W',
};

const defaultSettings = {
    model: 'llama3.2',
    provider: 'ollama',
    embedding_model: 'nomic-text-embed',
    embedding_provider: 'ollama',
    search_provider: 'duckduckgo',
    default_folder: HOME_DIR,
    default_to_agent: false, // When true, new chats default to agent mode
    is_predictive_text_enabled: false,
    predictive_text_model: 'llama3.2',
    predictive_text_provider: 'ollama',
    keyboard_shortcuts: defaultKeyboardShortcuts,
    backend_python_path: '', // Empty means use bundled backend
    default_new_pane_type: 'chat',
    default_new_terminal_type: 'system',
    default_new_document_type: 'docx',
    theme_dark_primary: '#3b82f6',
    theme_dark_bg: '#0f172a',
    theme_dark_text: '#f1f5f9',
    theme_light_primary: '#ec4899',
    theme_light_bg: '#ffffff',
    theme_light_text: '#1e293b',
    theme_hue_shift: 0,
    theme_saturation: 100,
    theme_brightness: 100,
};

// Local provider configuration
const LOCAL_PROVIDERS = {
    ollama: {
        name: 'Ollama',
        description: 'Local LLM server with model management',
        defaultPort: 11434,
        docsUrl: 'https://ollama.ai',
        color: 'text-blue-400',
        bgColor: 'bg-blue-600'
    },
    lmstudio: {
        name: 'LM Studio',
        description: 'Desktop app for running local LLMs',
        defaultPort: 1234,
        docsUrl: 'https://lmstudio.ai',
        color: 'text-purple-400',
        bgColor: 'bg-purple-600'
    },
    llamacpp: {
        name: 'llama.cpp',
        description: 'High-performance C++ inference server',
        defaultPort: 8080,
        docsUrl: 'https://github.com/ggerganov/llama.cpp',
        color: 'text-green-400',
        bgColor: 'bg-green-600'
    },
    gguf: {
        name: 'GGUF/GGML',
        description: 'Direct GGUF/GGML model files (offline, no server)',
        defaultPort: null,
        docsUrl: 'https://huggingface.co/docs/hub/gguf',
        color: 'text-orange-400',
        bgColor: 'bg-orange-600'
    }
};

const ModelManager = () => {
    const [activeProvider, setActiveProvider] = useState('ollama');
    const [providerStatuses, setProviderStatuses] = useState({
        ollama: 'checking',
        lmstudio: 'checking',
        llamacpp: 'checking',
        gguf: 'ready'
    });
    const [providerModels, setProviderModels] = useState({
        ollama: [],
        lmstudio: [],
        llamacpp: [],
        gguf: []
    });
    const [ggufDirectory, setGgufDirectory] = useState('');
    const [scannedDirectories, setScannedDirectories] = useState<string[]>([]);
    const [pullModelName, setPullModelName] = useState('llama3.1');
    const [pullProgress, setPullProgress] = useState(null);
    const [isPulling, setIsPulling] = useState(false);
    const [isDeleting, setIsDeleting] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    // HuggingFace model download state
    const [hfModelUrl, setHfModelUrl] = useState('');
    const [hfDownloadProgress, setHfDownloadProgress] = useState(null);
    const [isDownloadingHf, setIsDownloadingHf] = useState(false);
    // HuggingFace browser state
    const [hfSearchQuery, setHfSearchQuery] = useState('');
    const [hfSearchResults, setHfSearchResults] = useState([]);
    const [isSearchingHf, setIsSearchingHf] = useState(false);
    const [selectedHfRepo, setSelectedHfRepo] = useState(null);
    const [hfRepoFiles, setHfRepoFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

    // Fetch models for a specific provider
    const fetchModelsForProvider = async (provider) => {
        if (provider === 'ollama') {
            const models = await window.api.getLocalOllamaModels();
            if (models && !models.error) {
                setProviderModels(prev => ({ ...prev, ollama: models }));
            }
        } else if (provider === 'gguf') {
            // Scan for GGUF/GGML files
            const result = await window.api.scanGgufModels?.(ggufDirectory || null);
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, gguf: result.models || [] }));
                if (result.scannedDirectories) {
                    setScannedDirectories(result.scannedDirectories);
                }
            }
        } else {
            // Use the new scan API for LM Studio and llama.cpp
            const result = await window.api.scanLocalModels?.(provider);
            if (result && !result.error) {
                setProviderModels(prev => ({ ...prev, [provider]: result.models || [] }));
            }
        }
    };

    // Check status for all providers
    const checkAllStatuses = async () => {
        // Check Ollama
        const ollamaStatus = await window.api.checkOllamaStatus();
        setProviderStatuses(prev => ({ ...prev, ollama: ollamaStatus.status }));
        if (ollamaStatus.status === 'running') fetchModelsForProvider('ollama');

        // Check LM Studio and llama.cpp via new API
        for (const provider of ['lmstudio', 'llamacpp']) {
            try {
                const status = await window.api.getLocalModelStatus?.(provider);
                setProviderStatuses(prev => ({
                    ...prev,
                    [provider]: status?.running ? 'running' : 'not_running'
                }));
                if (status?.running) fetchModelsForProvider(provider);
            } catch {
                setProviderStatuses(prev => ({ ...prev, [provider]: 'not_found' }));
            }
        }
    };

    // Scan for models on selected provider
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

    // Search HuggingFace for GGUF models
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

    // List files in a HuggingFace repo
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

    // Download a specific file from HuggingFace
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
            {/* Provider Tabs */}
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

            {/* Provider Info */}
            <Card>
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
                                'bg-red-900 text-red-300'
                            }`}>
                                {currentStatus === 'running' ? 'Running' :
                                 currentStatus === 'ready' ? 'Ready' :
                                 currentStatus === 'checking' ? 'Checking...' :
                                 currentStatus === 'not_running' ? 'Not Running' : 'Not Found'}
                            </span>
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

            {/* Ollama-specific: Pull model */}
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

            {/* Pull Progress */}
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

            {/* Not Found / Not Running States */}
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

            {/* GGUF/GGML Directory Configuration */}
            {activeProvider === 'gguf' && (
                <div className="space-y-3">
                    {/* Browse for individual file */}
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

                    {/* Show scanned directories */}
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

                    {/* HuggingFace Model Browser */}
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

                        {/* Search Results */}
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

                        {/* File Selection */}
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

                        {/* Direct URL fallback */}
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

                    {/* HF Download Progress */}
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

            {/* Model List */}
            {(currentStatus === 'running' || activeProvider === 'gguf') && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm text-gray-400">Available Models ({currentModels.length})</h4>
                        <Button variant="secondary" onClick={handleScanModels} disabled={isScanning}>
                            {isScanning ? 'Scanning...' : 'Scan Models'}
                        </Button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {currentModels.length > 0 ? currentModels.map((model, idx) => (
                            <Card key={model.name || model.id || model.path || idx}>
                                <div className="flex justify-between items-center p-3">
                                    <div className="overflow-hidden flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-white truncate">{model.name || model.id || model.filename}</p>
                                            {model.source && (
                                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                                    model.source === 'HuggingFace' ? 'bg-yellow-900/50 text-yellow-300' :
                                                    model.source === 'LM Studio' ? 'bg-purple-900/50 text-purple-300' :
                                                    model.source === 'llama.cpp' ? 'bg-green-900/50 text-green-300' :
                                                    model.source === 'KoboldCPP' ? 'bg-blue-900/50 text-blue-300' :
                                                    model.source === 'Ollama' ? 'bg-cyan-900/50 text-cyan-300' :
                                                    model.source === 'GPT4All' ? 'bg-pink-900/50 text-pink-300' :
                                                    model.source === 'oobabooga' ? 'bg-indigo-900/50 text-indigo-300' :
                                                    'bg-gray-700 text-gray-300'
                                                }`}>
                                                    {model.source}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {model.size ? `${(model.size / 1e9).toFixed(2)} GB` : ''}
                                            {model.modified_at && ` • ${new Date(model.modified_at).toLocaleDateString()}`}
                                        </p>
                                        {model.path && (
                                            <p className="text-xs text-gray-600 truncate font-mono" title={model.path}>
                                                {model.path.replace(/^\/home\/[^/]+/, '~')}
                                            </p>
                                        )}
                                    </div>
                                    {activeProvider === 'ollama' && (
                                        <button
                                            onClick={() => handleDeleteModel(model.name)}
                                            disabled={isDeleting === model.name}
                                            className="p-2 text-red-500 hover:text-red-400 disabled:text-gray-500"
                                        >
                                            {isDeleting === model.name ? '...' : <Trash2 size={16}/>}
                                        </button>
                                    )}
                                </div>
                            </Card>
                        )) : (
                            <p className="text-gray-500 text-center py-4">
                                {activeProvider === 'ollama' && 'No models found. Pull a model above.'}
                                {activeProvider === 'gguf' && 'No GGUF/GGML files found. Click "Scan" to search common locations or download from HuggingFace.'}
                                {activeProvider !== 'ollama' && activeProvider !== 'gguf' && 'No models found. Load models in the app.'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Permissions Manager Component (macOS)
const PermissionsManager = () => {
    const [permissions, setPermissions] = useState<any>({
        camera: false,
        microphone: false,
        cameraStatus: 'unknown',
        micStatus: 'unknown',
    });
    const [screenCapture, setScreenCapture] = useState<any>({ granted: false, status: 'unknown' });
    const [loading, setLoading] = useState(true);
    const isMac = navigator.platform?.toLowerCase().includes('mac');

    const checkPermissions = useCallback(async () => {
        setLoading(true);
        try {
            const api = (window as any).api;
            if (api?.checkMediaPermissions) {
                const media = await api.checkMediaPermissions();
                setPermissions(media);
            }
            if (api?.getScreenCaptureStatus) {
                const screen = await api.getScreenCaptureStatus();
                setScreenCapture(screen);
            }
        } catch (err) {
            console.error('Failed to check permissions:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { checkPermissions(); }, [checkPermissions]);

    const requestMedia = async () => {
        try {
            const result = await (window as any).api.requestMediaPermissions();
            setPermissions((prev: any) => ({ ...prev, camera: result.camera, microphone: result.microphone }));
            // Re-check after a moment since the dialog may have changed things
            setTimeout(checkPermissions, 1000);
        } catch (err) {
            console.error('Failed to request permissions:', err);
        }
    };

    const openSettings = async (pane: string) => {
        try {
            await (window as any).api.openSystemPreferences(pane);
        } catch (err) {
            console.error('Failed to open system preferences:', err);
        }
    };

    const StatusBadge = ({ granted, status }: { granted: boolean; status: string }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            granted ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
        }`}>
            {granted ? 'Granted' : status === 'denied' ? 'Denied' : status === 'restricted' ? 'Restricted' : 'Not Granted'}
        </span>
    );

    if (!isMac) {
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Permissions</h3>
                <p className="text-sm text-gray-400">Permission management is only available on macOS.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">macOS Permissions</h3>
            <p className="text-sm text-gray-400">
                Manage system permissions required for camera, microphone, and screen capture features.
            </p>

            {loading ? (
                <p className="text-sm text-gray-500">Checking permissions...</p>
            ) : (
                <div className="space-y-3">
                    {/* Camera */}
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">📷</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Camera</p>
                                <p className="text-xs text-gray-400">Required for video calls in browser tabs</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={permissions.camera} status={permissions.cameraStatus} />
                            {!permissions.camera && (
                                <button onClick={() => openSettings('camera')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Microphone */}
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">🎤</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Microphone</p>
                                <p className="text-xs text-gray-400">Required for voice input and audio calls</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={permissions.microphone} status={permissions.micStatus} />
                            {!permissions.microphone && (
                                <button onClick={() => openSettings('microphone')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Screen Recording */}
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">🖥</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Screen Recording</p>
                                <p className="text-xs text-gray-400">Required for screenshot capture (Ctrl+Alt+4)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={screenCapture.granted} status={screenCapture.status} />
                            {!screenCapture.granted && (
                                <button onClick={() => openSettings('screen_recording')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Accessibility */}
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">♿</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Accessibility</p>
                                <p className="text-xs text-gray-400">May be required for global shortcuts</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => openSettings('accessibility')}
                                className="text-xs text-blue-400 hover:text-blue-300 underline">
                                Open Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-2 pt-2">
                <button onClick={requestMedia}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors">
                    Request Camera & Microphone
                </button>
                <button onClick={checkPermissions}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
                    Refresh Status
                </button>
            </div>

            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                <p className="text-xs text-gray-500">
                    If a permission shows as denied, you need to enable it manually in System Settings &gt; Privacy &amp; Security.
                    macOS requires you to toggle the permission off and on again if you previously denied it.
                </p>
            </div>
        </div>
    );
};

const SettingsMenu = ({ isOpen, onClose, currentPath, onPathChange, availableModels = [], embedded = false, initialTab = 'global', onRerunSetup = undefined }) => {
    const aiEnabled = useAiEnabled();
    const { userPath, setUserPath, setAiEnabled } = useAiFeature();
    const [activeTab, setActiveTab] = useState(initialTab);
    const [globalSettings, setGlobalSettings] = useState(defaultSettings);
    const [customGlobalVars, setCustomGlobalVars] = useState([{ key: '', value: '' }]);
    const [customEnvVars, setCustomEnvVars] = useState([{ key: '', value: '' }]);
    const [customProviders, setCustomProviders] = useState([{ name: '', baseUrl: '', apiKeyVar: '', headers: '' }]);
    const [visibleFields, setVisibleFields] = useState({});

    // Update active tab when initialTab prop changes
    useEffect(() => {
        if (initialTab && initialTab !== activeTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const loadGlobalSettings = async () => {
        const data = await window.api.loadGlobalSettings();
        if (data.error) return;
        // Merge with defaults to ensure new settings have default values
        setGlobalSettings({ ...defaultSettings, ...(data.global_settings || {}) });
        
        if (data.global_vars && Object.keys(data.global_vars).length > 0) {
            const parsedCustomVars = Object.entries(data.global_vars)
                .filter(([key]) => !key.startsWith('CUSTOM_PROVIDER_'))
                .map(([key, value]) => ({ key, value }));
            setCustomGlobalVars(parsedCustomVars.length > 0 ? parsedCustomVars : [{ key: '', value: '' }]);
            
            const providers = Object.keys(data.global_vars)
                .filter(key => key.startsWith('CUSTOM_PROVIDER_'))
                .map(key => {
                    const providerName = key.replace('CUSTOM_PROVIDER_', '');
                    try {
                        const config = JSON.parse(data.global_vars[key]);
                        return {
                            name: providerName.toLowerCase(),
                            baseUrl: config.base_url || '',
                            apiKeyVar: config.api_key_var || '',
                            headers: config.headers ? JSON.stringify(config.headers, null, 2) : ''
                        };
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);
            
            if (providers.length > 0) setCustomProviders(providers);
        }
    };

    const loadProjectSettings = async () => {
        if (!currentPath) return;
        const data = await window.api.loadProjectSettings(currentPath);
        if (data.error) return;
        if (data.env_vars && Object.keys(data.env_vars).length > 0) {
            setCustomEnvVars(Object.entries(data.env_vars).map(([key, value]) => ({ key, value })));
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadGlobalSettings();
            if (currentPath) loadProjectSettings();
        }
    }, [isOpen, currentPath]);

    const handleSave = async () => {
        const globalVars = customGlobalVars.reduce((acc, { key, value }) => {
            if (key && value) acc[key] = value;
            return acc;
        }, {});

        customProviders.forEach(provider => {
            if (provider.name && provider.baseUrl) {
                const config = {
                    base_url: provider.baseUrl,
                    api_key_var: provider.apiKeyVar || `${provider.name.toUpperCase()}_API_KEY`,
                };
                if (provider.headers) {
                    try {
                        config.headers = JSON.parse(provider.headers);
                    } catch (e) {}
                }
                globalVars[`CUSTOM_PROVIDER_${provider.name.toUpperCase()}`] = JSON.stringify(config);
            }
        });

        await window.api.saveGlobalSettings({
            global_settings: globalSettings,
            global_vars: globalVars
        });

        // Also save to localStorage for immediate pickup by other components
        if (globalSettings.default_new_pane_type) {
            localStorage.setItem('npcStudio_defaultNewPaneType', globalSettings.default_new_pane_type);
            // Dispatch custom event for same-window updates
            window.dispatchEvent(new CustomEvent('defaultPaneTypeChanged', { detail: globalSettings.default_new_pane_type }));
        }
        if (globalSettings.default_new_terminal_type) {
            localStorage.setItem('npcStudio_defaultNewTerminalType', globalSettings.default_new_terminal_type);
            window.dispatchEvent(new CustomEvent('defaultTerminalTypeChanged', { detail: globalSettings.default_new_terminal_type }));
        }
        if (globalSettings.default_new_document_type) {
            localStorage.setItem('npcStudio_defaultNewDocumentType', globalSettings.default_new_document_type);
            window.dispatchEvent(new CustomEvent('defaultDocumentTypeChanged', { detail: globalSettings.default_new_document_type }));
        }

        // Save theme colors to localStorage and apply them
        // Dark mode colors
        if (globalSettings.theme_dark_primary) {
            localStorage.setItem('npcStudio_themeDarkPrimary', globalSettings.theme_dark_primary);
            document.documentElement.style.setProperty('--theme-primary-dark', globalSettings.theme_dark_primary);
        }
        if (globalSettings.theme_dark_bg) {
            localStorage.setItem('npcStudio_themeDarkBg', globalSettings.theme_dark_bg);
            document.documentElement.style.setProperty('--theme-bg-dark', globalSettings.theme_dark_bg);
        }
        if (globalSettings.theme_dark_text) {
            localStorage.setItem('npcStudio_themeDarkText', globalSettings.theme_dark_text);
            document.documentElement.style.setProperty('--theme-text-dark', globalSettings.theme_dark_text);
        }
        // Light mode colors
        if (globalSettings.theme_light_primary) {
            localStorage.setItem('npcStudio_themeLightPrimary', globalSettings.theme_light_primary);
            document.documentElement.style.setProperty('--theme-primary-light', globalSettings.theme_light_primary);
        }
        if (globalSettings.theme_light_bg) {
            localStorage.setItem('npcStudio_themeLightBg', globalSettings.theme_light_bg);
            document.documentElement.style.setProperty('--theme-bg-light', globalSettings.theme_light_bg);
        }
        if (globalSettings.theme_light_text) {
            localStorage.setItem('npcStudio_themeLightText', globalSettings.theme_light_text);
            document.documentElement.style.setProperty('--theme-text-light', globalSettings.theme_light_text);
        }
        // HSB adjustments
        localStorage.setItem('npcStudio_themeHueShift', String(globalSettings.theme_hue_shift ?? 0));
        localStorage.setItem('npcStudio_themeSaturation', String(globalSettings.theme_saturation ?? 100));
        localStorage.setItem('npcStudio_themeBrightness', String(globalSettings.theme_brightness ?? 100));
        document.documentElement.style.setProperty('--theme-hue-shift', `${globalSettings.theme_hue_shift ?? 0}deg`);
        document.documentElement.style.setProperty('--theme-saturation', `${globalSettings.theme_saturation ?? 100}%`);
        document.documentElement.style.setProperty('--theme-brightness', `${globalSettings.theme_brightness ?? 100}%`);

        const envVars = customEnvVars.reduce((acc, { key, value }) => {
            if (key && value) acc[key] = value;
            return acc;
        }, {});

        if (currentPath) {
            await window.api.saveProjectSettings({
                path: currentPath,
                env_vars: envVars
            });
        }

        onClose();
    };

    const AI_SETTINGS_TABS = ['models', 'voice', 'providers'];
    const allTabs = [
        { id: 'account', name: 'Account' },
        { id: 'global', name: 'Global Settings' },
        { id: 'theme', name: 'Theme' },
        { id: 'shortcuts', name: 'Keyboard Shortcuts' },
        { id: 'models', name: 'Model Management' },
        { id: 'voice', name: 'Voice / TTS' },
        { id: 'providers', name: 'Custom Providers' },
        { id: 'passwords', name: 'Passwords' },
        { id: 'python', name: 'Python Environment' },
        { id: 'permissions', name: 'Permissions' }
    ];
    const tabs = aiEnabled ? allTabs : allTabs.filter(t => !AI_SETTINGS_TABS.includes(t.id));

    const isSensitiveField = (key) => {
        const sensitiveWords = ['key', 'token', 'secret', 'password', 'api'];
        return sensitiveWords.some(word => key.toLowerCase().includes(word));
    };

    const content = (
        <div className={`flex flex-col ${embedded ? 'h-full' : 'max-h-[80vh]'}`}>
            {/* Scrollable tabs with hidden scrollbar */}
            <div className="relative">
                <div className="flex gap-1 px-2 py-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex-shrink-0 ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                            }`}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-800 to-transparent pointer-events-none" />
            </div>

            <div className={`${embedded ? 'flex-1' : ''} overflow-y-auto p-6 space-y-4`}>
                {activeTab === 'account' && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-white">Account & Sync</h3>
                        <p className="text-sm text-gray-400">Sign in to sync your settings, conversations, and files across devices.</p>
                        <div className="max-w-sm">
                            {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
                                <UserMenu />
                            ) : (
                                <p className="text-xs text-gray-500">Account sync is not configured.</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'global' && (
                    <>
                        <div className="border border-gray-700 rounded-lg p-3">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div>
                                    <span className="text-sm font-medium">AI Features</span>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Enable chat, NPC team, memory, and AI tools across the app</p>
                                </div>
                                <div
                                    onClick={() => setAiEnabled(!aiEnabled)}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${aiEnabled ? 'bg-blue-500' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-5' : ''}`} />
                                </div>
                            </label>
                        </div>

                        <button
                            onClick={async () => {
                                try {
                                    await (window as any).api?.profileSave?.({ tutorialComplete: false });
                                    window.location.reload();
                                } catch (err) {
                                    console.error('Error resetting tutorial:', err);
                                }
                            }}
                            className="w-full text-left px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-700/50 text-gray-300 transition-colors"
                        >
                            Replay Tutorial
                        </button>

                        {onRerunSetup && (
                            <button
                                onClick={onRerunSetup}
                                className="w-full text-left px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-700/50 text-gray-300 transition-colors"
                            >
                                Re-run Setup Wizard
                            </button>
                        )}

                        <Input
                            label="Default Directory"
                            value={globalSettings.default_folder}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_folder: e.target.value})}
                        />
                        {aiEnabled && (
                            <>
                                <Input
                                    label="Model"
                                    value={globalSettings.model || ''}
                                    onChange={(e) => setGlobalSettings({...globalSettings, model: e.target.value})}
                                />
                                <Input
                                    label="Provider"
                                    value={globalSettings.provider || ''}
                                    onChange={(e) => setGlobalSettings({...globalSettings, provider: e.target.value})}
                                />
                            </>
                        )}

                        {aiEnabled && (
                            <div className="border border-gray-700 rounded-lg p-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={globalSettings.is_predictive_text_enabled}
                                        onChange={(e) => setGlobalSettings({...globalSettings, is_predictive_text_enabled: e.target.checked})}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm font-medium">Predictive Text (Copilot)</span>
                                </label>
                                {globalSettings.is_predictive_text_enabled && (
                                    <div className="mt-3">
                                        <Select
                                            label="Model for Predictions"
                                            value={globalSettings.predictive_text_model}
                                            onChange={(e) => setGlobalSettings({...globalSettings, predictive_text_model: e.target.value})}
                                            options={availableModels.map(m => ({ value: m.value, label: m.display_name }))}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {aiEnabled && (
                            <div className="border border-gray-700 rounded-lg p-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={globalSettings.default_to_agent || false}
                                        onChange={(e) => setGlobalSettings({...globalSettings, default_to_agent: e.target.checked})}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm font-medium">Default to Agent Mode</span>
                                </label>
                                <p className="text-xs text-gray-400 mt-1">
                                    When enabled, new chats will default to agent mode (tool_agent) instead of chat mode.
                                    Agent mode allows the AI to execute tools like file operations, terminal commands, and web search.
                                </p>
                            </div>
                        )}

                        <Select
                            label="Default New Pane Type"
                            value={globalSettings.default_new_pane_type || 'chat'}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_new_pane_type: e.target.value})}
                            options={[
                                { value: 'chat', label: 'Chat' },
                                { value: 'browser', label: 'Browser' },
                                { value: 'terminal', label: 'Terminal' },
                                { value: 'folder', label: 'Folder' },
                                { value: 'code', label: 'Code File' },
                            ]}
                        />

                        <Select
                            label="Default New Terminal Type"
                            value={globalSettings.default_new_terminal_type || 'system'}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_new_terminal_type: e.target.value})}
                            options={[
                                { value: 'system', label: 'Bash' },
                                { value: 'npcsh', label: 'npcsh' },
                                { value: 'guac', label: 'guac' },
                            ]}
                        />

                        <Select
                            label="Default New Document Type"
                            value={globalSettings.default_new_document_type || 'docx'}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_new_document_type: e.target.value})}
                            options={[
                                { value: 'docx', label: 'Word (.docx)' },
                                { value: 'xlsx', label: 'Excel (.xlsx)' },
                                { value: 'pptx', label: 'PowerPoint (.pptx)' },
                                { value: 'mapx', label: 'Mind Map (.mapx)' },
                            ]}
                        />

                        <div className="theme-bg-tertiary p-4 rounded-lg">
                            <h4 className="font-semibold theme-text-secondary mb-2">Backend Python Environment</h4>
                            <p className="text-xs text-gray-400 mb-2">
                                Specify a Python executable with npcpy installed to use instead of the bundled backend.
                                This allows you to use additional packages like torch/diffusers for local image generation.
                                Leave empty to use the bundled backend. Requires app restart to take effect.
                            </p>
                            <Input
                                label="Python Path (e.g., ~/.pyenv/versions/3.11.0/bin/python)"
                                value={globalSettings.backend_python_path || ''}
                                onChange={(e) => setGlobalSettings({...globalSettings, backend_python_path: e.target.value})}
                                placeholder="Leave empty for bundled backend"
                            />
                        </div>

                        <Card title="Custom Global Variables" className="!h-auto">
                            <div className="max-h-64 overflow-y-auto pr-2 mb-3">
                                {customGlobalVars.map((variable, index) => (
                                    <div key={index} className="flex gap-2 mb-2">
                                        <Input
                                            value={variable.key}
                                            onChange={(e) => {
                                                const newVars = [...customGlobalVars];
                                                newVars[index].key = e.target.value;
                                                setCustomGlobalVars(newVars);
                                            }}
                                            placeholder="Variable name"
                                            className="flex-1"
                                        />
                                        <div className="flex-1 relative">
                                            <Input
                                                type={visibleFields[`global_${index}`] || !isSensitiveField(variable.key) ? "text" : "password"}
                                                value={variable.value}
                                                onChange={(e) => {
                                                    const newVars = [...customGlobalVars];
                                                    newVars[index].value = e.target.value;
                                                    setCustomGlobalVars(newVars);
                                                }}
                                                placeholder="Value"
                                            />
                                            {isSensitiveField(variable.key) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibleFields(prev => ({ ...prev, [`global_${index}`]: !prev[`global_${index}`] }))}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                                                >
                                                    {visibleFields[`global_${index}`] ? <EyeOff size={20} /> : <Eye size={20} />}
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newVars = [...customGlobalVars];
                                                newVars.splice(index, 1);
                                                if (newVars.length === 0) newVars.push({ key: '', value: '' });
                                                setCustomGlobalVars(newVars);
                                            }}
                                            className="p-2 text-red-400"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <Button variant="secondary" onClick={() => setCustomGlobalVars([...customGlobalVars, { key: '', value: '' }])}>
                                Add Variable
                            </Button>
                        </Card>
                    </>
                )}

                {activeTab === 'theme' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 theme-bg-tertiary rounded">
                            <span className="text-sm">Dark Mode</span>
                            <button
                                onClick={() => {
                                    const isDark = document.body.classList.contains('dark-mode');
                                    document.body.classList.toggle('dark-mode', !isDark);
                                    document.body.classList.toggle('light-mode', isDark);
                                    localStorage.setItem('npcStudio_darkMode', (!isDark).toString());
                                }}
                                className={`w-10 h-5 rounded-full transition-colors ${document.body.classList.contains('dark-mode') ? 'bg-blue-500' : 'bg-gray-400'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${document.body.classList.contains('dark-mode') ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Hue</span><span>{globalSettings.theme_hue_shift || 0}°</span></div>
                                <input type="range" min="-180" max="180" value={globalSettings.theme_hue_shift || 0}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_hue_shift: val}); document.documentElement.style.setProperty('--theme-hue-shift', `${val}deg`); }}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer" style={{background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}} />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Saturation</span><span>{globalSettings.theme_saturation || 100}%</span></div>
                                <input type="range" min="0" max="200" value={globalSettings.theme_saturation || 100}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_saturation: val}); document.documentElement.style.setProperty('--theme-saturation', `${val}%`); }}
                                    className="w-full h-2 bg-gradient-to-r from-gray-500 to-blue-500 rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Brightness</span><span>{globalSettings.theme_brightness || 100}%</span></div>
                                <input type="range" min="50" max="150" value={globalSettings.theme_brightness || 100}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_brightness: val}); document.documentElement.style.setProperty('--theme-brightness', `${val}%`); }}
                                    className="w-full h-2 bg-gradient-to-r from-gray-900 via-gray-500 to-white rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </div>

                        <div className="text-xs text-gray-400 font-medium">Dark Mode</div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_primary || '#3b82f6'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_primary: e.target.value}); document.documentElement.style.setProperty('--theme-primary-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Primary</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_bg || '#0f172a'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_bg: e.target.value}); document.documentElement.style.setProperty('--theme-bg-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Background</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_text || '#f1f5f9'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_text: e.target.value}); document.documentElement.style.setProperty('--theme-text-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Text</span>
                            </div>
                        </div>

                        <div className="text-xs text-gray-400 font-medium">Light Mode</div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_primary || '#ec4899'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_primary: e.target.value}); document.documentElement.style.setProperty('--theme-primary-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Primary</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_bg || '#ffffff'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_bg: e.target.value}); document.documentElement.style.setProperty('--theme-bg-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Background</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_text || '#1e293b'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_text: e.target.value}); document.documentElement.style.setProperty('--theme-text-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Text</span>
                            </div>
                        </div>

                        <button onClick={() => {
                            setGlobalSettings({...globalSettings, theme_dark_primary: '#3b82f6', theme_dark_bg: '#0f172a', theme_dark_text: '#f1f5f9', theme_light_primary: '#ec4899', theme_light_bg: '#ffffff', theme_light_text: '#1e293b', theme_hue_shift: 0, theme_saturation: 100, theme_brightness: 100});
                            document.documentElement.style.setProperty('--theme-primary-dark', '#3b82f6'); document.documentElement.style.setProperty('--theme-bg-dark', '#0f172a'); document.documentElement.style.setProperty('--theme-text-dark', '#f1f5f9');
                            document.documentElement.style.setProperty('--theme-primary-light', '#ec4899'); document.documentElement.style.setProperty('--theme-bg-light', '#ffffff'); document.documentElement.style.setProperty('--theme-text-light', '#1e293b');
                            document.documentElement.style.setProperty('--theme-hue-shift', '0deg'); document.documentElement.style.setProperty('--theme-saturation', '100%'); document.documentElement.style.setProperty('--theme-brightness', '100%');
                        }} className="text-xs text-gray-400 hover:text-white">Reset to defaults</button>
                    </div>
                )}

                {activeTab === 'shortcuts' && (
                    <Card title="Keyboard Shortcuts">
                        <p className="text-sm text-gray-400 mb-4">
                            Customize keyboard shortcuts for quick actions. Use Ctrl/Cmd, Shift, Alt modifiers.
                        </p>
                        <div className="space-y-3">
                            {Object.entries(globalSettings.keyboard_shortcuts || defaultKeyboardShortcuts).map(([key, value]) => {
                                const labels = {
                                    newConversation: 'New Conversation',
                                    newFolder: 'New Folder',
                                    newBrowser: 'New Browser',
                                    newTerminal: 'New Terminal',
                                    newCodeFile: 'New Code File',
                                    newWorkspace: 'New Workspace',
                                    toggleSidebar: 'Toggle Sidebar',
                                    commandPalette: 'Command Palette',
                                    fileSearch: 'File Search',
                                    globalSearch: 'Global Search',
                                    save: 'Save',
                                    closePane: 'Close Pane',
                                };
                                return (
                                    <div key={key} className="flex items-center justify-between gap-4">
                                        <label className="text-sm text-gray-300 min-w-[150px]">{labels[key] || key}</label>
                                        <Input
                                            value={value}
                                            onChange={(e) => {
                                                setGlobalSettings({
                                                    ...globalSettings,
                                                    keyboard_shortcuts: {
                                                        ...(globalSettings.keyboard_shortcuts || defaultKeyboardShortcuts),
                                                        [key]: e.target.value
                                                    }
                                                });
                                            }}
                                            placeholder="e.g., Ctrl+Shift+N"
                                            className="w-40"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <Button
                                variant="secondary"
                                onClick={() => setGlobalSettings({
                                    ...globalSettings,
                                    keyboard_shortcuts: defaultKeyboardShortcuts
                                })}
                            >
                                Reset to Defaults
                            </Button>
                        </div>
                    </Card>
                )}

                {activeTab === 'models' && <ModelManager />}

                {activeTab === 'voice' && <VoiceManager />}

                {activeTab === 'providers' && (
                    <Card title="Custom API Providers">
                        <p className="text-sm text-gray-400 mb-4">
                            Define custom API providers for your models.
                        </p>
                        {customProviders.map((provider, index) => (
                            <Card key={index}>
                                <div className="space-y-3">
                                    <Input
                                        label="Provider Name"
                                        value={provider.name}
                                        onChange={(e) => {
                                            const newProviders = [...customProviders];
                                            newProviders[index].name = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                                            setCustomProviders(newProviders);
                                        }}
                                        placeholder="mycustomllm"
                                    />
                                    <Input
                                        label="Base URL"
                                        value={provider.baseUrl}
                                        onChange={(e) => {
                                            const newProviders = [...customProviders];
                                            newProviders[index].baseUrl = e.target.value;
                                            setCustomProviders(newProviders);
                                        }}
                                        placeholder="https://api.example.com/v1"
                                    />
                                    <Button
                                        variant="danger"
                                        onClick={() => {
                                            const newProviders = [...customProviders];
                                            newProviders.splice(index, 1);
                                            if (newProviders.length === 0) {
                                                newProviders.push({ name: '', baseUrl: '', apiKeyVar: '', headers: '' });
                                            }
                                            setCustomProviders(newProviders);
                                        }}
                                    >
                                        Remove Provider
                                    </Button>
                                </div>
                            </Card>
                        ))}
                        <Button variant="secondary" onClick={() => setCustomProviders([...customProviders, { name: '', baseUrl: '', apiKeyVar: '', headers: '' }])}>
                            Add Provider
                        </Button>
                    </Card>
                )}

                {activeTab === 'passwords' && <PasswordManager />}
                {activeTab === 'python' && <PythonEnvSettings currentPath={currentPath} />}
                {activeTab === 'permissions' && <PermissionsManager />}
            </div>

            <div className="border-t border-gray-700 p-4 flex justify-end">
                <Button variant="primary" onClick={handleSave}>
                    <Save size={20} /> Save Changes
                </Button>
            </div>
        </div>
    );

    if (embedded) {
        return (
            <div className="flex flex-col h-full theme-bg-primary">
                {content}
            </div>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="md">
            {content}
        </Modal>
    );
};

export default SettingsMenu;