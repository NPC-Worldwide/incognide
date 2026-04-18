import React, { useState, useEffect, useCallback } from "react";
import { Volume2, Mic, Play, Square, Save } from "lucide-react";
import { Card, Button, Select } from "npcts";
import { BACKEND_URL } from "../config";

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

    const loadVoices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/api/audio/voices`);
            if (!response.ok) throw new Error('Failed to fetch voices');
            const data = await response.json();
            if (data.success && data.engines) {
                setEngines(data.engines);

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

    const loadSettings = useCallback(async () => {
        try {
            const stored = localStorage.getItem('incognide_ttsSettings');
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

    const saveSettings = () => {
        const settings = {
            engine: selectedEngine,
            voice: selectedVoice
        };
        localStorage.setItem('incognide_ttsSettings', JSON.stringify(settings));
        setSavedSettings(settings);

        window.dispatchEvent(new CustomEvent('ttsSettingsChanged', { detail: settings }));
    };

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

            if (selectedEngine === 'kokoro' && voice?.lang) {
                requestBody.lang_code = voice.lang;
            }

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
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
            {error && (
                <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400">
                    {error}
                    <button onClick={() => setError(null)} className="ml-2 text-red-300">×</button>
                </div>
            )}

            <Card title="TTS Engine" className="!h-auto">
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

            {currentEngine?.available && availableVoices.length > 0 && (
                <Card title="Voice" className="!h-auto">
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

            <Card title="Test Voice" className="!h-auto">
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

            <Card title="Speech-to-Text (STT)" className="!h-auto">
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

export default VoiceManager;
