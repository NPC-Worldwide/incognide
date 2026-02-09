import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Music, Play, Pause, Square, Circle, SkipBack, SkipForward,
    Volume2, VolumeX, Upload, Download, Trash2, Plus, Search,
    Mic, Radio, Sliders, Waves, BarChart3, FileAudio, Folder,
    Scissors, Copy, ClipboardPaste, Undo, Redo, ZoomIn, ZoomOut,
    Music2, Music3, Music4, Disc, Disc3, ListMusic, Library,
    Sparkles, Loader, X, ChevronRight, Grid, Settings, Save,
    FastForward, Rewind, RotateCcw, Shuffle, Repeat, Heart,
    PlusCircle, FolderOpen, Clock, Activity, AudioLines, Piano,
    Guitar, ChevronLeft, Star, Package, Layers, FileJson, Tag,
    RefreshCw, Lock, Unlock, Move, MousePointer, Magnet
} from 'lucide-react';
import {
    Renderer as VFRenderer, Stave, StaveNote, Voice, Formatter,
    Beam, Accidental, StaveConnector
} from 'vexflow';

interface ScherzoProps {
    currentPath?: string;
    onClose?: () => void;
}

// Audio file type
interface AudioFile {
    id: string;
    name: string;
    path: string;
    duration?: number;
    waveform?: number[];
    bpm?: number;
    key?: string;
}

// Track colors for visual organization
const TRACK_COLORS = [
    { bg: 'from-purple-600 to-purple-800', border: 'border-purple-500', text: 'text-purple-400' },
    { bg: 'from-blue-600 to-blue-800', border: 'border-blue-500', text: 'text-blue-400' },
    { bg: 'from-green-600 to-green-800', border: 'border-green-500', text: 'text-green-400' },
    { bg: 'from-orange-600 to-orange-800', border: 'border-orange-500', text: 'text-orange-400' },
    { bg: 'from-pink-600 to-pink-800', border: 'border-pink-500', text: 'text-pink-400' },
    { bg: 'from-cyan-600 to-cyan-800', border: 'border-cyan-500', text: 'text-cyan-400' },
    { bg: 'from-red-600 to-red-800', border: 'border-red-500', text: 'text-red-400' },
    { bg: 'from-yellow-600 to-yellow-800', border: 'border-yellow-500', text: 'text-yellow-400' },
];

// Track in editor
interface AudioTrack {
    id: string;
    name: string;
    clips: AudioClip[];
    volume: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    color: number; // Index into TRACK_COLORS
    height: number; // Track height in pixels
}

interface AudioClip {
    id: string;
    audioId: string;
    startTime: number;
    duration: number;
    offset: number;
    name: string;
    gain: number; // Clip-level gain (0-2, 1 = unity)
    fadeIn: number; // Fade in duration in seconds
    fadeOut: number; // Fade out duration in seconds
    color?: number; // Optional override color
}

// Timeline marker
interface TimelineMarker {
    id: string;
    time: number;
    name: string;
    color: string;
}

// Standard guitar tuning: string index → open string MIDI note
const GUITAR_TUNING = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2

const tabToMidi = (stringIdx: number, fret: number): number => {
    return GUITAR_TUNING[stringIdx] + fret;
};

const midiToTab = (midi: number): { string: number; fret: number } | null => {
    let best: { string: number; fret: number } | null = null;
    for (let s = 0; s < GUITAR_TUNING.length; s++) {
        const fret = midi - GUITAR_TUNING[s];
        if (fret >= 0 && fret <= 24) {
            if (!best || fret < best.fret) {
                best = { string: s, fret };
            }
        }
    }
    return best;
};

// Map VexFlow staff position (0=top line, each step=one diatonic note down) to MIDI
const staffPositionToMidi = (pos: number, clef: 'treble' | 'bass'): number => {
    const diatonic = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B semitones from C
    // Treble: top line = F5 (MIDI 77), F is diatonic index 3
    // Bass: top line = A3 (MIDI 57), A is diatonic index 5
    const refIdx = clef === 'bass' ? 5 : 3;
    const refOctave = clef === 'bass' ? 3 : 5;

    let targetIdx = refIdx - pos;
    let targetOctave = refOctave;
    while (targetIdx < 0) { targetIdx += 7; targetOctave--; }
    while (targetIdx >= 7) { targetIdx -= 7; targetOctave++; }

    return (targetOctave + 1) * 12 + diatonic[targetIdx];
};

// DJ Deck
interface DJDeck {
    audioFile: AudioFile | null;
    playing: boolean;
    currentTime: number;
    volume: number;
    speed: number;
    eq: { low: number; mid: number; high: number };
    eqKill: { low: boolean; mid: boolean; high: boolean };
    hotCues: (number | null)[]; // 8 hot cue positions
    loopIn: number | null;
    loopOut: number | null;
    loopActive: boolean;
    filter: number; // 0-100, 50 = neutral
    effects: { echo: number; flanger: number; reverb: number; roll: number };
    activeEffect: string | null;
    // Enhanced features
    beatGrid: number[]; // Array of beat timestamps in seconds
    beatGridOffset: number; // Manual beat grid adjustment
    jogOffset: number; // Temporary jog wheel offset (for nudging)
    keyLock: boolean; // Maintain pitch when changing tempo
    slip: boolean; // Slip mode - continue playing in background while scratching
    slipPosition: number; // Background position during slip
}

// Audio Training Dataset
interface AudioDatasetExample {
    id: string;
    prompt: string;
    negativePrompt?: string;
    audioPath?: string;
    duration: number;
    model: string;
    qualityScore: number;
    tags: string[];
    createdAt: string;
}

interface AudioDataset {
    id: string;
    name: string;
    description?: string;
    examples: AudioDatasetExample[];
    createdAt: string;
    updatedAt: string;
    targetModel?: string;
    tags: string[];
}

export const Scherzo: React.FC<ScherzoProps> = ({ currentPath, onClose }) => {
    // Mode/tab state
    const [activeMode, setActiveMode] = useState('library');

    // Library state
    const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
    const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [audioSource, setAudioSource] = useState(currentPath || '');

    // Update audio source when currentPath changes
    useEffect(() => {
        if (currentPath && currentPath !== audioSource) {
            setAudioSource(currentPath);
        }
    }, [currentPath]);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Generator state
    const [genPrompt, setGenPrompt] = useState('');
    const [genModel, setGenModel] = useState('');
    const [generating, setGenerating] = useState(false);
    const [genDuration, setGenDuration] = useState(30);
    const [generatedAudio, setGeneratedAudio] = useState<AudioFile[]>([]);

    // Editor state
    const [tracks, setTracks] = useState<AudioTrack[]>([
        { id: 'track-1', name: 'Track 1', clips: [], volume: 1, pan: 0, muted: false, solo: false, color: 0, height: 80 },
        { id: 'track-2', name: 'Track 2', clips: [], volume: 1, pan: 0, muted: false, solo: false, color: 1, height: 80 }
    ]);
    const [editorZoom, setEditorZoom] = useState(1);
    const [editorPosition, setEditorPosition] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [waveformCache, setWaveformCache] = useState<Map<string, number[]>>(new Map());
    const editorAudioContextRef = useRef<AudioContext | null>(null);
    const trackNodesRef = useRef<Map<string, { source: AudioBufferSourceNode, gain: GainNode }>>(new Map());
    const [editorPlayhead, setEditorPlayhead] = useState(0);
    const [isEditorPlaying, setIsEditorPlaying] = useState(false);
    const editorAnimationRef = useRef<number | null>(null);
    const editorStartTimeRef = useRef<number>(0);
    const [selectedRegion, setSelectedRegion] = useState<{ start: number; end: number } | null>(null);
    const [clipboard, setClipboard] = useState<AudioClip | null>(null);
    const [undoStack, setUndoStack] = useState<AudioTrack[][]>([]);
    const [redoStack, setRedoStack] = useState<AudioTrack[][]>([]);
    const [editorTool, setEditorTool] = useState<'select' | 'cut' | 'move'>('select');
    const [showEffectsPanel, setShowEffectsPanel] = useState(false);
    const [trackEffects, setTrackEffects] = useState<Map<string, { gain: number; pan: number; reverb: number; delay: number; eq: { low: number; mid: number; high: number } }>>(new Map());
    // Professional editor state
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [gridSize, setGridSize] = useState<0.25 | 0.5 | 1 | 2 | 4>(1); // seconds
    const [trackLevels, setTrackLevels] = useState<Map<string, { left: number; right: number }>>(new Map());
    const [armedTracks, setArmedTracks] = useState<Set<string>>(new Set());
    const [lockedTracks, setLockedTracks] = useState<Set<string>>(new Set());
    const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [masterVolume, setMasterVolume] = useState(1);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [loopStart, setLoopStart] = useState(0);
    const [loopEnd, setLoopEnd] = useState(10);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const levelAnimationRef = useRef<number | null>(null);
    // Timeline markers
    const [markers, setMarkers] = useState<TimelineMarker[]>([]);
    // Project tempo
    const [projectBpm, setProjectBpm] = useState(120);
    const [showBpmGrid, setShowBpmGrid] = useState(false);
    // Vertical waveform zoom
    const [waveformZoom, setWaveformZoom] = useState(1);
    // Dragging state
    const [dragState, setDragState] = useState<{
        type: 'move' | 'resize-left' | 'resize-right' | 'fade-in' | 'fade-out' | 'selection' | null;
        clipId?: string;
        trackId?: string;
        startX: number;
        startTime: number;
        originalClip?: AudioClip;
    } | null>(null);
    // Context menu
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId?: string; trackId?: string } | null>(null);
    // High-resolution waveform cache (for continuous waveform)
    const [waveformDataCache, setWaveformDataCache] = useState<Map<string, Float32Array>>(new Map());

    // Notation state
    const [notationView, setNotationView] = useState<'piano' | 'sheet' | 'tab'>('sheet');
    const [pianoNotes, setPianoNotes] = useState<Array<{ note: number; start: number; duration: number; velocity: number }>>([]);
    const [tabNotes, setTabNotes] = useState<Array<{ string: number; fret: number; start: number; duration: number }>>([]);
    const [notationZoom, setNotationZoom] = useState(1);
    const [notationPlayhead, setNotationPlayhead] = useState(0);
    const [isNotationPlaying, setIsNotationPlaying] = useState(false);
    const [selectedNotes, setSelectedNotes] = useState<Set<number>>(new Set());
    const [notationBpm, setNotationBpm] = useState(120);
    const [notationTimeSignature, setNotationTimeSignature] = useState<[number, number]>([4, 4]);
    const synthRef = useRef<AudioContext | null>(null);
    const activeNotesRef = useRef<Map<number, OscillatorNode>>(new Map());
    const vexflowRef = useRef<HTMLDivElement | null>(null);
    const staveLayoutRef = useRef<Array<{
        x: number; y: number; width: number; measureIdx: number;
        clef: 'treble' | 'bass'; topLineY: number; bottomLineY: number;
    }>>([]);
    const [notationKeySignature, setNotationKeySignature] = useState('C');
    const [notationClef, setNotationClef] = useState<'treble' | 'bass' | 'grand'>('treble');
    const [inputNoteDuration, setInputNoteDuration] = useState(1); // beats: 4=whole, 2=half, 1=quarter, 0.5=eighth, 0.25=16th
    const [inputCursor, setInputCursor] = useState(0); // current beat position for note entry
    const [inputOctave, setInputOctave] = useState(4);

    // Analysis state (enhanced)
    const [analysisAudioBuffer, setAnalysisAudioBuffer] = useState<AudioBuffer | null>(null);
    const [analysisFrequencyData, setAnalysisFrequencyData] = useState<Uint8Array | null>(null);
    const [analysisWaveformData, setAnalysisWaveformData] = useState<number[]>([]);

    // DJ state
    const defaultDeckState: DJDeck = {
        audioFile: null, playing: false, currentTime: 0, volume: 1, speed: 1,
        eq: { low: 0, mid: 0, high: 0 },
        eqKill: { low: false, mid: false, high: false },
        hotCues: [null, null, null, null, null, null, null, null],
        loopIn: null, loopOut: null, loopActive: false,
        filter: 50,
        effects: { echo: 0, flanger: 0, reverb: 0, roll: 0 },
        activeEffect: null,
        beatGrid: [],
        beatGridOffset: 0,
        jogOffset: 0,
        keyLock: false,
        slip: false,
        slipPosition: 0
    };
    // DJ crossfader curve type
    const [crossfaderCurve, setCrossfaderCurve] = useState<'linear' | 'cut' | 'smooth'>('smooth');
    // Active effects for each deck
    const [deckAEffects, setDeckAEffects] = useState<{ [key: string]: number }>({});
    const [deckBEffects, setDeckBEffects] = useState<{ [key: string]: number }>({});
    const [deckA, setDeckA] = useState<DJDeck>({ ...defaultDeckState });
    const [deckB, setDeckB] = useState<DJDeck>({ ...defaultDeckState });
    const [crossfader, setCrossfader] = useState(0.5);
    const deckARef = useRef<HTMLAudioElement>(null);
    const deckBRef = useRef<HTMLAudioElement>(null);
    // DJ effects state
    const [djMasterGain, setDjMasterGain] = useState(1);
    const [djBpm, setDjBpm] = useState<{ a: number; b: number }>({ a: 0, b: 0 });

    // Analysis state
    const [analysisData, setAnalysisData] = useState<{ frequencies: number[], waveform: number[] } | null>(null);
    const [analysisMode, setAnalysisMode] = useState<'waveform' | 'spectrum' | 'spectrogram'>('waveform');
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Visualizer state
    const [visualizerActive, setVisualizerActive] = useState(false);
    const [visualizerMode, setVisualizerMode] = useState<'bars' | 'wave' | 'circle' | 'particles'>('bars');
    const [visualizerColor, setVisualizerColor] = useState<'rainbow' | 'purple' | 'blue' | 'green'>('rainbow');
    const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
    const visualizerAnimationRef = useRef<number | null>(null);
    const visualizerAnalyzerRef = useRef<AnalyserNode | null>(null);
    const visualizerAudioCtxRef = useRef<AudioContext | null>(null);
    const visualizerSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

    // Dataset state
    const [audioDatasets, setAudioDatasets] = useState<AudioDataset[]>(() => {
        try {
            const stored = localStorage.getItem('scherzo_audioDatasets');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });
    const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
    const [showCreateDataset, setShowCreateDataset] = useState(false);
    const [showAddToDataset, setShowAddToDataset] = useState(false);
    const [newDatasetName, setNewDatasetName] = useState('');
    const [selectedGeneratedAudio, setSelectedGeneratedAudio] = useState<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);
    const [datasetExportFormat, setDatasetExportFormat] = useState<'jsonl' | 'json' | 'csv'>('jsonl');

    // Save datasets to localStorage
    useEffect(() => {
        localStorage.setItem('scherzo_audioDatasets', JSON.stringify(audioDatasets));
    }, [audioDatasets]);

    // Get selected dataset
    const selectedDataset = audioDatasets.find(d => d.id === selectedDatasetId);

    // Sidebar collapsed
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('scherzo_sidebarCollapsed');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('scherzo_sidebarCollapsed', String(sidebarCollapsed));
    }, [sidebarCollapsed]);

    // Load audio files from source
    useEffect(() => {
        if (audioSource) {
            loadAudioFiles(audioSource);
        }
    }, [audioSource]);

    // Visualizer animation loop
    useEffect(() => {
        if (!visualizerActive || !visualizerCanvasRef.current) {
            if (visualizerAnimationRef.current) {
                cancelAnimationFrame(visualizerAnimationRef.current);
                visualizerAnimationRef.current = null;
            }
            return;
        }

        const canvas = visualizerCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Connect audio to analyzer if not already
        const connectAudio = () => {
            // Try to connect main audio player
            if (audioRef.current && !visualizerSourceRef.current) {
                try {
                    if (!visualizerAudioCtxRef.current) {
                        visualizerAudioCtxRef.current = new AudioContext();
                    }
                    const analyzer = visualizerAudioCtxRef.current.createAnalyser();
                    analyzer.fftSize = 256;
                    const source = visualizerAudioCtxRef.current.createMediaElementSource(audioRef.current);
                    source.connect(analyzer);
                    analyzer.connect(visualizerAudioCtxRef.current.destination);
                    visualizerAnalyzerRef.current = analyzer;
                    visualizerSourceRef.current = source;
                } catch (e) {
                    // Already connected or error
                }
            }
            // Try DJ deck A
            if (deckARef.current && deckA.playing && !visualizerSourceRef.current) {
                try {
                    if (!visualizerAudioCtxRef.current) {
                        visualizerAudioCtxRef.current = new AudioContext();
                    }
                    const analyzer = visualizerAudioCtxRef.current.createAnalyser();
                    analyzer.fftSize = 256;
                    const source = visualizerAudioCtxRef.current.createMediaElementSource(deckARef.current);
                    source.connect(analyzer);
                    analyzer.connect(visualizerAudioCtxRef.current.destination);
                    visualizerAnalyzerRef.current = analyzer;
                    visualizerSourceRef.current = source;
                } catch (e) {}
            }
        };

        connectAudio();

        const getColor = (i: number, total: number, value: number) => {
            if (visualizerColor === 'rainbow') {
                const hue = (i / total) * 360;
                return `hsl(${hue}, 80%, ${50 + value * 20}%)`;
            } else if (visualizerColor === 'purple') {
                return `rgba(147, 51, 234, ${0.5 + value * 0.5})`;
            } else if (visualizerColor === 'blue') {
                return `rgba(59, 130, 246, ${0.5 + value * 0.5})`;
            } else {
                return `rgba(34, 197, 94, ${0.5 + value * 0.5})`;
            }
        };

        const draw = () => {
            const width = canvas.width;
            const height = canvas.height;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, width, height);

            if (!visualizerAnalyzerRef.current) {
                // Draw placeholder animation when no audio connected
                const time = Date.now() / 1000;
                const bars = 64;
                const barWidth = width / bars;
                for (let i = 0; i < bars; i++) {
                    const value = Math.sin(time * 2 + i * 0.2) * 0.3 + 0.3;
                    const barHeight = value * height;
                    ctx.fillStyle = getColor(i, bars, value);
                    ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
                }
                visualizerAnimationRef.current = requestAnimationFrame(draw);
                return;
            }

            const analyzer = visualizerAnalyzerRef.current;
            const bufferLength = analyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            if (visualizerMode === 'bars' || visualizerMode === 'wave') {
                analyzer.getByteFrequencyData(dataArray);
            } else {
                analyzer.getByteTimeDomainData(dataArray);
            }

            if (visualizerMode === 'bars') {
                const barWidth = width / bufferLength;
                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i] / 255;
                    const barHeight = value * height;
                    ctx.fillStyle = getColor(i, bufferLength, value);
                    ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
                }
            } else if (visualizerMode === 'wave') {
                ctx.beginPath();
                ctx.strokeStyle = getColor(0, 1, 0.8);
                ctx.lineWidth = 2;
                const sliceWidth = width / bufferLength;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i] / 255;
                    const y = height - value * height;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    x += sliceWidth;
                }
                ctx.stroke();
            } else if (visualizerMode === 'circle') {
                analyzer.getByteFrequencyData(dataArray);
                const centerX = width / 2;
                const centerY = height / 2;
                const radius = Math.min(width, height) * 0.3;
                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i] / 255;
                    const angle = (i / bufferLength) * Math.PI * 2;
                    const barHeight = value * radius;
                    const x1 = centerX + Math.cos(angle) * radius;
                    const y1 = centerY + Math.sin(angle) * radius;
                    const x2 = centerX + Math.cos(angle) * (radius + barHeight);
                    const y2 = centerY + Math.sin(angle) * (radius + barHeight);
                    ctx.beginPath();
                    ctx.strokeStyle = getColor(i, bufferLength, value);
                    ctx.lineWidth = 3;
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            } else if (visualizerMode === 'particles') {
                analyzer.getByteFrequencyData(dataArray);
                const avgFreq = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
                const time = Date.now() / 1000;
                for (let i = 0; i < 50; i++) {
                    const angle = (i / 50) * Math.PI * 2 + time;
                    const distance = 50 + avgFreq * 150 + Math.sin(time * 3 + i) * 20;
                    const x = width / 2 + Math.cos(angle) * distance;
                    const y = height / 2 + Math.sin(angle) * distance;
                    const size = 3 + avgFreq * 10;
                    ctx.beginPath();
                    ctx.fillStyle = getColor(i, 50, avgFreq);
                    ctx.arc(x, y, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            visualizerAnimationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (visualizerAnimationRef.current) {
                cancelAnimationFrame(visualizerAnimationRef.current);
            }
        };
    }, [visualizerActive, visualizerMode, visualizerColor, isPlaying, deckA.playing]);

    const loadAudioFiles = async (source: string) => {
        try {
            // Use window.api to list directory contents
            const dirContents = await (window as any).api?.listDirectory?.(source);
            if (dirContents && Array.isArray(dirContents)) {
                const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'aiff'];
                const files = dirContents
                    .filter((f: any) => {
                        if (f.isDirectory) return false;
                        const ext = f.name.split('.').pop()?.toLowerCase();
                        return ext && audioExtensions.includes(ext);
                    })
                    .map((f: any) => ({
                        id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: f.name,
                        path: f.path || `${source}/${f.name}`,
                        duration: 0
                    }));
                setAudioFiles(files);
            }
        } catch (err) {
            console.error('Error loading audio files:', err);
        }
    };

    // Format time
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Simple beat detection from audio buffer
    const detectBeats = useCallback(async (audioPath: string): Promise<{ bpm: number; beats: number[]; key: string }> => {
        try {
            const response = await fetch(`file://${audioPath}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Get mono channel data
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            // Simple onset detection using energy
            const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
            const hopSize = Math.floor(windowSize / 2);
            const energies: number[] = [];

            for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
                let energy = 0;
                for (let j = 0; j < windowSize; j++) {
                    energy += channelData[i + j] * channelData[i + j];
                }
                energies.push(energy);
            }

            // Find peaks (onsets)
            const threshold = energies.reduce((a, b) => a + b, 0) / energies.length * 1.5;
            const peaks: number[] = [];
            for (let i = 1; i < energies.length - 1; i++) {
                if (energies[i] > threshold && energies[i] > energies[i-1] && energies[i] > energies[i+1]) {
                    peaks.push(i * hopSize / sampleRate);
                }
            }

            // Calculate BPM from peak intervals
            const intervals: number[] = [];
            for (let i = 1; i < Math.min(peaks.length, 100); i++) {
                intervals.push(peaks[i] - peaks[i-1]);
            }

            if (intervals.length === 0) {
                return { bpm: 120, beats: [], key: 'Am' };
            }

            // Get median interval
            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];
            const rawBpm = 60 / medianInterval;

            // Normalize BPM to common range (80-180)
            let bpm = rawBpm;
            while (bpm < 80) bpm *= 2;
            while (bpm > 180) bpm /= 2;
            bpm = Math.round(bpm);

            // Generate beat grid from BPM
            const beatInterval = 60 / bpm;
            const beats: number[] = [];
            for (let t = 0; t < audioBuffer.duration; t += beatInterval) {
                beats.push(t);
            }

            // Simple key estimation (placeholder - would need FFT analysis)
            const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const modes = ['', 'm'];
            const keyIndex = Math.floor(Math.random() * 12);
            const modeIndex = Math.floor(Math.random() * 2);
            const key = keys[keyIndex] + modes[modeIndex];

            await audioContext.close();
            return { bpm, beats, key };
        } catch (error) {
            console.error('Beat detection failed:', error);
            return { bpm: 120, beats: [], key: 'Am' };
        }
    }, []);

    // Nudge deck position (for jog wheel)
    const nudgeDeck = useCallback((deck: DJDeck, setDeck: React.Dispatch<React.SetStateAction<DJDeck>>, audioRef: React.RefObject<HTMLAudioElement>, amount: number) => {
        if (audioRef.current && deck.audioFile) {
            const newTime = Math.max(0, Math.min(deck.audioFile.duration || 0, deck.currentTime + amount));
            audioRef.current.currentTime = newTime;
            setDeck(prev => ({ ...prev, currentTime: newTime }));
        }
    }, []);

    // Audio generation models
    const AUDIO_MODELS = [
        { id: 'suno-v4', name: 'Suno v4', provider: 'suno', type: 'music' },
        { id: 'suno-v3.5', name: 'Suno v3.5', provider: 'suno', type: 'music' },
        { id: 'udio-v1.5', name: 'Udio v1.5', provider: 'udio', type: 'music' },
        { id: 'udio-v1', name: 'Udio v1', provider: 'udio', type: 'music' },
        { id: 'stable-audio-2', name: 'Stable Audio 2.0', provider: 'stability', type: 'music' },
        { id: 'musicgen-large', name: 'MusicGen Large', provider: 'meta', type: 'music' },
        { id: 'audiogen', name: 'AudioGen', provider: 'meta', type: 'sfx' },
        { id: 'bark', name: 'Bark', provider: 'suno', type: 'speech' },
        { id: 'eleven-v2', name: 'ElevenLabs v2', provider: 'elevenlabs', type: 'speech' }
    ];

    // Scherzo modes
    const SCHERZO_MODES = [
        { id: 'library', name: 'Library', icon: Library, group: 'browse' },
        { id: 'generator', name: 'Generate', icon: Sparkles, group: 'create' },
        { id: 'editor', name: 'Editor', icon: Waves, group: 'edit' },
        { id: 'dj', name: 'DJ Mixer', icon: Disc3, group: 'edit' },
        { id: 'analysis', name: 'Analysis', icon: Activity, group: 'analyze' },
        { id: 'notation', name: 'Notation', icon: Music2, group: 'analyze' },
        { id: 'datasets', name: 'Datasets', icon: Package, group: 'train' }
    ];

    const currentMode_obj = SCHERZO_MODES.find(m => m.id === activeMode) || SCHERZO_MODES[0];
    const CurrentModeIcon = currentMode_obj.icon;

    // Render sidebar
    const renderSidebar = () => {
        if (sidebarCollapsed) {
            return (
                <div className="w-12 border-r theme-border theme-bg-secondary flex flex-col items-center py-2">
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        className="p-2 hover:bg-gray-700 rounded mb-2"
                        title="Expand sidebar"
                    >
                        <ChevronRight size={16}/>
                    </button>
                    <Music size={20} className="text-purple-400 mb-4"/>
                    <div className="flex-1"/>
                </div>
            );
        }

        return (
            <div className="w-64 border-r theme-border theme-bg-secondary flex flex-col overflow-hidden">
                <div className="p-3 border-b theme-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Music size={20} className="text-purple-400"/>
                        <span className="font-semibold">Scherzo</span>
                    </div>
                    <button
                        onClick={() => setSidebarCollapsed(true)}
                        className="p-1 hover:bg-gray-700 rounded"
                    >
                        <ChevronLeft size={16}/>
                    </button>
                </div>

                {/* Source selector */}
                <div className="p-3 border-b theme-border">
                    <label className="text-xs text-gray-400 uppercase font-semibold">Source Folder</label>
                    <div className="flex gap-2 mt-1">
                        <input
                            type="text"
                            value={audioSource}
                            onChange={(e) => setAudioSource(e.target.value)}
                            placeholder="/path/to/music"
                            className="flex-1 theme-input text-xs"
                        />
                        <button
                            onClick={async () => {
                                try {
                                    const result = await (window as any).api.showOpenDialog({
                                        properties: ['openDirectory']
                                    });
                                    if (result && result.length > 0) {
                                        setAudioSource(result[0].path);
                                    }
                                } catch (err) {
                                    console.error('Error selecting folder:', err);
                                }
                            }}
                            className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                            <FolderOpen size={14}/>
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="p-3 border-b theme-border">
                    <div className="relative">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"/>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search audio..."
                            className="w-full theme-input text-xs pl-7"
                        />
                    </div>
                </div>

                {/* Audio list */}
                <div className="flex-1 overflow-y-auto p-2">
                    {audioFiles
                        .filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(file => (
                            <div
                                key={file.id}
                                onClick={() => setSelectedAudio(file)}
                                onDoubleClick={() => {
                                    setSelectedAudio(file);
                                    if (audioRef.current) {
                                        audioRef.current.src = `file://${file.path}`;
                                        audioRef.current.play();
                                        setIsPlaying(true);
                                    }
                                }}
                                className={`p-2 rounded cursor-pointer flex items-center gap-2 mb-1 ${
                                    selectedAudio?.id === file.id
                                        ? 'bg-purple-600/30 border border-purple-500'
                                        : 'hover:bg-gray-700/50'
                                }`}
                            >
                                <FileAudio size={14} className="text-purple-400 flex-shrink-0"/>
                                <span className="text-xs truncate flex-1">{file.name}</span>
                                {file.duration && (
                                    <span className="text-xs text-gray-500">{formatTime(file.duration)}</span>
                                )}
                            </div>
                        ))}
                    {audioFiles.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            <Music size={32} className="mx-auto mb-2 opacity-50"/>
                            <p className="text-xs">No audio files</p>
                            <p className="text-xs mt-1">Select a source folder above</p>
                        </div>
                    )}
                </div>

                {/* Mini player */}
                {selectedAudio && (
                    <div className="p-3 border-t theme-border bg-gray-800/50">
                        <div className="flex items-center gap-2 mb-2">
                            <FileAudio size={14} className="text-purple-400"/>
                            <span className="text-xs truncate flex-1">{selectedAudio.name}</span>
                            <button
                                onClick={() => setVisualizerActive(!visualizerActive)}
                                className={`p-1 rounded ${visualizerActive ? 'bg-purple-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                                title="Toggle Visualizer"
                            >
                                <Activity size={14}/>
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (audioRef.current) {
                                        if (isPlaying) {
                                            audioRef.current.pause();
                                        } else {
                                            audioRef.current.play();
                                        }
                                        setIsPlaying(!isPlaying);
                                    }
                                }}
                                className="p-1.5 bg-purple-600 hover:bg-purple-700 rounded"
                            >
                                {isPlaying ? <Pause size={14}/> : <Play size={14}/>}
                            </button>
                            <div className="flex-1 h-1 bg-gray-700 rounded overflow-hidden">
                                <div
                                    className="h-full bg-purple-500"
                                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                                />
                            </div>
                            <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
                        </div>
                        <audio
                            ref={audioRef}
                            src={selectedAudio ? `file://${selectedAudio.path}` : ''}
                            onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                            onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
                            onEnded={() => setIsPlaying(false)}
                        />
                    </div>
                )}
            </div>
        );
    };

    // Render Library
    const renderLibrary = () => {
        const filteredFiles = audioFiles.filter(f =>
            !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="grid grid-cols-4 gap-4">
                    {filteredFiles.map(file => (
                        <div
                            key={file.id}
                            onClick={() => setSelectedAudio(file)}
                            onDoubleClick={() => {
                                setSelectedAudio(file);
                                if (audioRef.current) {
                                    audioRef.current.src = `file://${file.path}`;
                                    audioRef.current.play();
                                    setIsPlaying(true);
                                }
                            }}
                            className={`p-4 rounded-xl cursor-pointer transition-all ${
                                selectedAudio?.id === file.id
                                    ? 'bg-purple-600/30 ring-2 ring-purple-500'
                                    : 'bg-gray-800/50 hover:bg-gray-700/50'
                            }`}
                        >
                            <div className="aspect-square bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-lg flex items-center justify-center mb-3">
                                <Music size={32} className="text-purple-400"/>
                            </div>
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            {file.duration && (
                                <p className="text-xs text-gray-500 mt-1">{formatTime(file.duration)}</p>
                            )}
                        </div>
                    ))}
                </div>
                {filteredFiles.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Music size={64} className="mx-auto text-gray-600 mb-4"/>
                            <p className="text-gray-400 text-lg">No Audio Files</p>
                            <p className="text-gray-600 text-sm mt-2">Select a source folder in the sidebar</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Render Generator
    const renderGenerator = () => {
        return (
            <div className="flex-1 flex overflow-hidden">
                {/* Controls */}
                <div className="w-96 border-r theme-border p-4 flex flex-col gap-4 overflow-y-auto theme-bg-secondary">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles size={20} className="text-purple-400"/> Audio Generator
                    </h3>

                    <div>
                        <label className="text-xs text-gray-400 font-semibold uppercase">Prompt</label>
                        <textarea
                            value={genPrompt}
                            onChange={(e) => setGenPrompt(e.target.value)}
                            placeholder="Describe the audio you want to create..."
                            className="w-full theme-input mt-2 text-sm"
                            rows={4}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 font-semibold uppercase">Model</label>
                        <select
                            value={genModel}
                            onChange={(e) => setGenModel(e.target.value)}
                            className="w-full theme-input mt-2 text-sm"
                        >
                            <option value="">Select a model...</option>
                            <optgroup label="Music Generation">
                                {AUDIO_MODELS.filter(m => m.type === 'music').map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Sound Effects">
                                {AUDIO_MODELS.filter(m => m.type === 'sfx').map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Speech/Voice">
                                {AUDIO_MODELS.filter(m => m.type === 'speech').map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 font-semibold uppercase">Duration (seconds)</label>
                        <div className="flex items-center gap-3 mt-2">
                            <input
                                type="range"
                                min={5}
                                max={180}
                                value={genDuration}
                                onChange={(e) => setGenDuration(parseInt(e.target.value))}
                                className="flex-1"
                            />
                            <span className="text-sm w-12">{genDuration}s</span>
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            if (!genPrompt || !genModel) return;
                            setGenerating(true);
                            try {
                                // TODO: Integrate with audio generation API
                                await new Promise(r => setTimeout(r, 3000));
                                setGeneratedAudio(prev => [...prev, {
                                    id: `gen_${Date.now()}`,
                                    name: genPrompt.slice(0, 30) + '...',
                                    path: '',
                                    duration: genDuration
                                }]);
                            } finally {
                                setGenerating(false);
                            }
                        }}
                        disabled={generating || !genPrompt || !genModel}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center gap-2"
                    >
                        {generating ? (
                            <>
                                <Loader size={18} className="animate-spin"/>
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18}/>
                                Generate Audio
                            </>
                        )}
                    </button>
                </div>

                {/* Results */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Results toolbar */}
                    {generatedAudio.length > 0 && (
                        <div className="p-3 border-b theme-border flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setSelectionMode(!selectionMode);
                                    if (selectionMode) setSelectedGeneratedAudio(new Set());
                                }}
                                className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 ${
                                    selectionMode ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
                                }`}
                            >
                                <Layers size={12} /> Select
                            </button>
                            {selectionMode && selectedGeneratedAudio.size > 0 && (
                                <>
                                    <span className="text-xs text-gray-400">{selectedGeneratedAudio.size} selected</span>
                                    <button
                                        onClick={() => setShowAddToDataset(true)}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add to Dataset
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <div className="flex-1 p-4 overflow-y-auto">
                    {generatedAudio.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                            {generatedAudio.map(audio => (
                                <div
                                    key={audio.id}
                                    onClick={() => selectionMode && toggleGeneratedSelection(audio.id)}
                                    className={`bg-gray-800 rounded-xl p-4 ${
                                        selectionMode
                                            ? selectedGeneratedAudio.has(audio.id)
                                                ? 'ring-2 ring-purple-500 bg-purple-900/20 cursor-pointer'
                                                : 'hover:bg-gray-700/50 cursor-pointer'
                                            : ''
                                    }`}
                                >
                                    <div className="relative aspect-video bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg flex items-center justify-center mb-3">
                                        {selectionMode && (
                                            <input
                                                type="checkbox"
                                                checked={selectedGeneratedAudio.has(audio.id)}
                                                onChange={() => toggleGeneratedSelection(audio.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute top-2 left-2 w-4 h-4"
                                            />
                                        )}
                                        <Music size={32} className="text-purple-400"/>
                                    </div>
                                    <p className="text-sm truncate">{audio.name}</p>
                                    <p className="text-xs text-gray-500">{formatTime(audio.duration || 0)}</p>
                                    <div className="flex gap-2 mt-3">
                                        <button className="flex-1 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 rounded text-purple-400 text-xs">
                                            <Play size={12} className="inline mr-1"/> Play
                                        </button>
                                        <button className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 rounded text-blue-400 text-xs">
                                            <Download size={12} className="inline mr-1"/> Save
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <Sparkles size={64} className="mx-auto text-gray-600 mb-4"/>
                                <p className="text-gray-400 text-lg">Generate AI Audio</p>
                                <p className="text-gray-600 text-sm mt-2">Enter a prompt and select a model</p>
                            </div>
                        </div>
                    )}
                    </div>

                    {/* Add to Dataset Modal */}
                    {showAddToDataset && (
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowAddToDataset(false)}>
                            <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                                <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Plus className="text-purple-400" size={18} />
                                    Add to Dataset
                                </h4>
                                {audioDatasets.length === 0 ? (
                                    <div className="text-center py-4 text-gray-500">
                                        <p>No datasets yet</p>
                                        <button
                                            onClick={() => { setShowAddToDataset(false); setActiveMode('datasets'); setShowCreateDataset(true); }}
                                            className="mt-2 text-purple-400 hover:text-purple-300"
                                        >
                                            Create a dataset first
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {audioDatasets.map(dataset => (
                                            <button
                                                key={dataset.id}
                                                onClick={() => addGeneratedToDataset(dataset.id)}
                                                className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded text-left flex items-center justify-between"
                                            >
                                                <div>
                                                    <span className="font-medium">{dataset.name}</span>
                                                    <span className="text-xs text-gray-500 ml-2">{dataset.examples.length} samples</span>
                                                </div>
                                                <ChevronRight size={16} className="text-gray-500"/>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-end mt-4">
                                    <button
                                        onClick={() => setShowAddToDataset(false)}
                                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Load waveform data for an audio file - high resolution for continuous waveform
    const loadWaveform = useCallback(async (audioPath: string, audioId: string) => {
        if (waveformCache.has(audioId)) return waveformCache.get(audioId);

        try {
            const buffer = await (window as any).api?.readFileBuffer?.(audioPath);
            if (!buffer) return null;

            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(buffer.buffer || buffer);
            const channelData = audioBuffer.getChannelData(0);

            // Store high-resolution data (1000 samples per second for smooth waveform)
            const duration = audioBuffer.duration;
            const hiResSamples = Math.min(Math.ceil(duration * 1000), 50000); // Max 50k samples
            const blockSize = Math.floor(channelData.length / hiResSamples);
            const hiResWaveform = new Float32Array(hiResSamples * 2); // Min and max for each block

            for (let i = 0; i < hiResSamples; i++) {
                let min = 1, max = -1;
                const start = i * blockSize;
                const end = Math.min(start + blockSize, channelData.length);
                for (let j = start; j < end; j++) {
                    const val = channelData[j];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                hiResWaveform[i * 2] = min;
                hiResWaveform[i * 2 + 1] = max;
            }

            // Store in high-res cache
            setWaveformDataCache(prev => new Map(prev).set(audioId, hiResWaveform));

            // Also create low-res version for thumbnails (200 samples)
            const samples = 200;
            const thumbBlockSize = Math.floor(channelData.length / samples);
            const waveform: number[] = [];

            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let j = 0; j < thumbBlockSize; j++) {
                    sum += Math.abs(channelData[i * thumbBlockSize + j]);
                }
                waveform.push(sum / thumbBlockSize);
            }

            const maxVal = Math.max(...waveform);
            const normalized = waveform.map(v => v / (maxVal || 1));

            setWaveformCache(prev => new Map(prev).set(audioId, normalized));
            audioContext.close();
            return normalized;
        } catch (err) {
            console.error('Error loading waveform:', err);
            return null;
        }
    }, [waveformCache]);

    // Render continuous waveform path for a clip
    const renderWaveformPath = useCallback((
        audioId: string,
        clipWidth: number,
        clipHeight: number,
        clipOffset: number,
        clipDuration: number,
        audioDuration: number
    ): string => {
        const hiResData = waveformDataCache.get(audioId);
        if (!hiResData) return '';

        const totalSamples = hiResData.length / 2;
        const samplesPerSecond = totalSamples / audioDuration;
        const startSample = Math.floor(clipOffset * samplesPerSecond);
        const endSample = Math.min(Math.floor((clipOffset + clipDuration) * samplesPerSecond), totalSamples);
        const visibleSamples = endSample - startSample;

        if (visibleSamples <= 0) return '';

        const pointsToRender = Math.min(visibleSamples, Math.floor(clipWidth));
        const samplesPerPoint = visibleSamples / pointsToRender;

        const centerY = clipHeight / 2;
        const amplitude = (clipHeight / 2 - 2) * waveformZoom;

        let pathTop = `M 0 ${centerY}`;
        let pathBottom = `M 0 ${centerY}`;

        for (let i = 0; i < pointsToRender; i++) {
            const sampleIndex = Math.floor(startSample + i * samplesPerPoint);
            const x = (i / pointsToRender) * clipWidth;

            if (sampleIndex * 2 + 1 < hiResData.length) {
                const min = hiResData[sampleIndex * 2];
                const max = hiResData[sampleIndex * 2 + 1];
                pathTop += ` L ${x} ${centerY - max * amplitude}`;
                pathBottom += ` L ${x} ${centerY - min * amplitude}`;
            }
        }

        // Close the path to create a filled waveform
        return pathTop + pathBottom.split(' ').reverse().join(' ').replace('M', 'L') + ' Z';
    }, [waveformDataCache, waveformZoom]);

    // Play editor timeline
    const playEditorTimeline = useCallback(async () => {
        if (!editorAudioContextRef.current) {
            editorAudioContextRef.current = new AudioContext();
        }
        const ctx = editorAudioContextRef.current;

        // Stop any existing playback
        trackNodesRef.current.forEach(({ source }) => {
            try { source.stop(); } catch {}
        });
        trackNodesRef.current.clear();

        const startTime = ctx.currentTime;
        editorStartTimeRef.current = performance.now() - (editorPlayhead * 1000);

        // Load and schedule all clips
        for (const track of tracks) {
            if (track.muted) continue;

            for (const clip of track.clips) {
                if (clip.startTime + clip.duration < editorPlayhead) continue;
                if (clip.startTime > editorPlayhead + 60) continue; // Only load clips within 60s

                const audioFile = audioFiles.find(f => f.id === clip.audioId);
                if (!audioFile) continue;

                try {
                    const buffer = await (window as any).api?.readFileBuffer?.(audioFile.path);
                    if (!buffer) continue;

                    const audioBuffer = await ctx.decodeAudioData(buffer.buffer || buffer);
                    const source = ctx.createBufferSource();
                    const gain = ctx.createGain();

                    source.buffer = audioBuffer;
                    gain.gain.value = track.volume;
                    source.connect(gain);
                    gain.connect(ctx.destination);

                    const clipStart = clip.startTime - editorPlayhead;
                    if (clipStart >= 0) {
                        source.start(startTime + clipStart, clip.offset);
                    } else {
                        source.start(startTime, clip.offset - clipStart);
                    }

                    trackNodesRef.current.set(clip.id, { source, gain });
                } catch (err) {
                    console.error('Error playing clip:', err);
                }
            }
        }

        setIsEditorPlaying(true);

        // Animate playhead
        const animate = () => {
            const elapsed = (performance.now() - editorStartTimeRef.current) / 1000;
            setEditorPlayhead(elapsed);
            editorAnimationRef.current = requestAnimationFrame(animate);
        };
        editorAnimationRef.current = requestAnimationFrame(animate);
    }, [tracks, audioFiles, editorPlayhead]);

    // Stop editor playback
    const stopEditorTimeline = useCallback(() => {
        if (editorAnimationRef.current) {
            cancelAnimationFrame(editorAnimationRef.current);
            editorAnimationRef.current = null;
        }
        trackNodesRef.current.forEach(({ source }) => {
            try { source.stop(); } catch {}
        });
        trackNodesRef.current.clear();
        setIsEditorPlaying(false);
    }, []);

    // Export/mixdown timeline
    const exportTimeline = useCallback(async () => {
        const ctx = new OfflineAudioContext(2, 44100 * 60, 44100); // 60 second max

        // Find total duration
        let maxEnd = 0;
        for (const track of tracks) {
            for (const clip of track.clips) {
                maxEnd = Math.max(maxEnd, clip.startTime + clip.duration);
            }
        }
        if (maxEnd === 0) return;

        // Create new context with correct duration
        const renderCtx = new OfflineAudioContext(2, Math.ceil(44100 * maxEnd), 44100);

        for (const track of tracks) {
            if (track.muted) continue;

            for (const clip of track.clips) {
                const audioFile = audioFiles.find(f => f.id === clip.audioId);
                if (!audioFile) continue;

                try {
                    const buffer = await (window as any).api?.readFileBuffer?.(audioFile.path);
                    if (!buffer) continue;

                    const audioBuffer = await renderCtx.decodeAudioData(buffer.buffer || buffer);
                    const source = renderCtx.createBufferSource();
                    const gain = renderCtx.createGain();

                    source.buffer = audioBuffer;
                    gain.gain.value = track.volume;
                    source.connect(gain);
                    gain.connect(renderCtx.destination);
                    source.start(clip.startTime, clip.offset);
                } catch (err) {
                    console.error('Error rendering clip:', err);
                }
            }
        }

        const renderedBuffer = await renderCtx.startRendering();

        // Convert to WAV and download
        const wav = audioBufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mixdown.wav';
        a.click();
        URL.revokeObjectURL(url);
    }, [tracks, audioFiles]);

    // Helper: AudioBuffer to WAV
    const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    };

    // Editor: Save state for undo
    const saveUndoState = useCallback(() => {
        setUndoStack(prev => [...prev.slice(-20), JSON.parse(JSON.stringify(tracks))]);
        setRedoStack([]);
    }, [tracks]);

    // Editor: Undo
    const editorUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(tracks))]);
        setUndoStack(prev => prev.slice(0, -1));
        setTracks(prevState);
    }, [undoStack, tracks]);

    // Editor: Redo
    const editorRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(tracks))]);
        setRedoStack(prev => prev.slice(0, -1));
        setTracks(nextState);
    }, [redoStack, tracks]);

    // Editor: Copy clip
    const copyClip = useCallback(() => {
        if (!selectedClipId) return;
        for (const track of tracks) {
            const clip = track.clips.find(c => c.id === selectedClipId);
            if (clip) {
                setClipboard({ ...clip, id: `clip_${Date.now()}` });
                return;
            }
        }
    }, [selectedClipId, tracks]);

    // Editor: Cut clip
    const cutClip = useCallback(() => {
        if (!selectedClipId) return;
        saveUndoState();
        for (const track of tracks) {
            const clip = track.clips.find(c => c.id === selectedClipId);
            if (clip) {
                setClipboard({ ...clip, id: `clip_${Date.now()}` });
                setTracks(prev => prev.map(t => ({
                    ...t,
                    clips: t.clips.filter(c => c.id !== selectedClipId)
                })));
                setSelectedClipId(null);
                return;
            }
        }
    }, [selectedClipId, tracks, saveUndoState]);

    // Editor: Paste clip
    const pasteClip = useCallback((trackId: string, time: number) => {
        if (!clipboard) return;
        saveUndoState();
        const newClip = { ...clipboard, id: `clip_${Date.now()}`, startTime: time };
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
        ));
    }, [clipboard, saveUndoState]);

    // Editor: Delete clip
    const deleteClip = useCallback(() => {
        if (!selectedClipId) return;
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.filter(c => c.id !== selectedClipId)
        })));
        setSelectedClipId(null);
    }, [selectedClipId, saveUndoState]);

    // Editor: Split clip at playhead
    const splitClipAtPlayhead = useCallback(() => {
        if (!selectedClipId) return;
        saveUndoState();
        setTracks(prev => prev.map(track => {
            const clipIndex = track.clips.findIndex(c => c.id === selectedClipId);
            if (clipIndex === -1) return track;

            const clip = track.clips[clipIndex];
            if (editorPlayhead <= clip.startTime || editorPlayhead >= clip.startTime + clip.duration) {
                return track;
            }

            const splitPoint = editorPlayhead - clip.startTime;
            const clip1 = { ...clip, duration: splitPoint };
            const clip2 = {
                ...clip,
                id: `clip_${Date.now()}`,
                startTime: editorPlayhead,
                duration: clip.duration - splitPoint,
                offset: clip.offset + splitPoint
            };

            const newClips = [...track.clips];
            newClips.splice(clipIndex, 1, clip1, clip2);
            return { ...track, clips: newClips };
        }));
    }, [selectedClipId, editorPlayhead, saveUndoState]);

    // Notation: Note frequency helper
    const noteToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteToName = (note: number) => `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;

    // Notation: Play note
    const playNote = useCallback((note: number, velocity: number = 0.5) => {
        if (!synthRef.current) synthRef.current = new AudioContext();
        const ctx = synthRef.current;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = noteToFrequency(note);
        gain.gain.value = velocity * 0.3;
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        activeNotesRef.current.set(note, osc);
    }, []);

    // Notation: Stop note
    const stopNote = useCallback((note: number) => {
        const osc = activeNotesRef.current.get(note);
        if (osc) {
            try { osc.stop(); } catch {}
            activeNotesRef.current.delete(note);
        }
    }, []);

    // Notation: Add note
    const addPianoNote = useCallback((note: number, start: number, duration: number = 0.5, velocity: number = 0.8) => {
        setPianoNotes(prev => [...prev, { note, start, duration, velocity }]);
    }, []);

    // Notation: Delete selected notes
    const deleteSelectedNotes = useCallback(() => {
        setPianoNotes(prev => prev.filter((_, i) => !selectedNotes.has(i)));
        setSelectedNotes(new Set());
    }, [selectedNotes]);

    // Notation: Play composition
    const playNotation = useCallback(() => {
        if (!synthRef.current) synthRef.current = new AudioContext();
        const ctx = synthRef.current;
        const startTime = ctx.currentTime;

        pianoNotes.forEach(note => {
            const noteStartTime = startTime + (note.start * 60 / notationBpm);
            const noteDuration = note.duration * 60 / notationBpm;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = noteToFrequency(note.note);
            gain.gain.value = note.velocity * 0.3;
            gain.gain.setValueAtTime(note.velocity * 0.3, noteStartTime);
            gain.gain.exponentialRampToValueAtTime(0.01, noteStartTime + noteDuration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(noteStartTime);
            osc.stop(noteStartTime + noteDuration);
        });

        setIsNotationPlaying(true);
        const totalDuration = Math.max(...pianoNotes.map(n => n.start + n.duration), 0) * 60 / notationBpm * 1000;
        setTimeout(() => setIsNotationPlaying(false), totalDuration);
    }, [pianoNotes, notationBpm]);

    // Analysis: Load and analyze audio
    const analyzeAudio = useCallback(async (audioPath: string) => {
        try {
            const buffer = await (window as any).api?.readFileBuffer?.(audioPath);
            if (!buffer) return;

            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(buffer.buffer || buffer);
            setAnalysisAudioBuffer(audioBuffer);

            // Get waveform
            const channelData = audioBuffer.getChannelData(0);
            const samples = 500;
            const blockSize = Math.floor(channelData.length / samples);
            const waveform: number[] = [];
            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += channelData[i * blockSize + j];
                }
                waveform.push(sum / blockSize);
            }
            setAnalysisWaveformData(waveform);

            // Set up analyser for spectrum
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const frequencyData = new Uint8Array(analyser.frequencyBinCount);
            setAnalysisFrequencyData(frequencyData);
            analyzerRef.current = analyser;
            audioContextRef.current = audioContext;

        } catch (err) {
            console.error('Error analyzing audio:', err);
        }
    }, []);

    // Guitar tab: Convert MIDI note to guitar position
    const midiToGuitarTab = (note: number): { string: number; fret: number } | null => {
        const openStrings = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2
        for (let s = 0; s < 6; s++) {
            const fret = note - openStrings[s];
            if (fret >= 0 && fret <= 24) {
                return { string: s, fret };
            }
        }
        return null;
    };

    // Helper: Snap time to grid
    const snapToGridTime = useCallback((time: number): number => {
        if (!snapToGrid) return time;
        return Math.round(time / gridSize) * gridSize;
    }, [snapToGrid, gridSize]);

    // Keyboard shortcuts for editor
    useEffect(() => {
        if (activeMode !== 'editor') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const isMeta = e.metaKey || e.ctrlKey;

            // Transport controls
            if (e.code === 'Space') {
                e.preventDefault();
                isEditorPlaying ? stopEditorTimeline() : playEditorTimeline();
            } else if (e.code === 'Home' || (isMeta && e.code === 'ArrowLeft')) {
                e.preventDefault();
                setEditorPlayhead(0);
            } else if (e.code === 'End' || (isMeta && e.code === 'ArrowRight')) {
                e.preventDefault();
                const maxTime = Math.max(...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)), 0);
                setEditorPlayhead(maxTime);
            }
            // Edit operations
            else if (isMeta && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                editorUndo();
            } else if (isMeta && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
                e.preventDefault();
                editorRedo();
            } else if (isMeta && e.code === 'KeyX') {
                e.preventDefault();
                cutClip();
            } else if (isMeta && e.code === 'KeyC') {
                e.preventDefault();
                copyClip();
            } else if (isMeta && e.code === 'KeyV') {
                e.preventDefault();
                if (tracks.length > 0) pasteClip(tracks[0].id, editorPlayhead);
            } else if (e.code === 'Delete' || e.code === 'Backspace') {
                e.preventDefault();
                deleteClip();
            } else if (e.code === 'KeyS' && !isMeta) {
                e.preventDefault();
                splitClipAtPlayhead();
            }
            // Navigation
            else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                setEditorPlayhead(prev => Math.max(0, prev - (e.shiftKey ? 1 : 0.1)));
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                setEditorPlayhead(prev => prev + (e.shiftKey ? 1 : 0.1));
            }
            // Zoom
            else if (isMeta && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
                e.preventDefault();
                setEditorZoom(prev => Math.min(8, prev + 0.25));
            } else if (isMeta && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
                e.preventDefault();
                setEditorZoom(prev => Math.max(0.25, prev - 0.25));
            }
            // Grid toggle
            else if (e.code === 'KeyG') {
                e.preventDefault();
                setSnapToGrid(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeMode, isEditorPlaying, tracks, editorPlayhead, playEditorTimeline, stopEditorTimeline, editorUndo, editorRedo, cutClip, copyClip, pasteClip, deleteClip, splitClipAtPlayhead]);

    // Drag handlers for clip manipulation
    useEffect(() => {
        if (!dragState) return;

        const pixelsPerSecond = 50 * editorZoom;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - dragState.startX;
            const deltaTime = deltaX / pixelsPerSecond;

            setTracks(prev => prev.map(track => ({
                ...track,
                clips: track.clips.map(clip => {
                    if (clip.id !== dragState.clipId) return clip;

                    const orig = dragState.originalClip!;
                    switch (dragState.type) {
                        case 'move':
                            return { ...clip, startTime: Math.max(0, snapToGridTime(orig.startTime + deltaTime)) };
                        case 'resize-left': {
                            const newStart = Math.max(0, snapToGridTime(orig.startTime + deltaTime));
                            const maxStart = orig.startTime + orig.duration - 0.1;
                            const clampedStart = Math.min(newStart, maxStart);
                            const startDelta = clampedStart - orig.startTime;
                            return {
                                ...clip,
                                startTime: clampedStart,
                                duration: orig.duration - startDelta,
                                offset: Math.max(0, orig.offset + startDelta)
                            };
                        }
                        case 'resize-right': {
                            const newDuration = Math.max(0.1, snapToGridTime(orig.duration + deltaTime));
                            return { ...clip, duration: newDuration };
                        }
                        case 'fade-in': {
                            const newFadeIn = Math.max(0, Math.min(clip.duration / 2, (orig.fadeIn || 0) + deltaTime));
                            return { ...clip, fadeIn: newFadeIn };
                        }
                        case 'fade-out': {
                            const newFadeOut = Math.max(0, Math.min(clip.duration / 2, (orig.fadeOut || 0) - deltaTime));
                            return { ...clip, fadeOut: newFadeOut };
                        }
                        default:
                            return clip;
                    }
                })
            })));
        };

        const handleMouseUp = () => {
            if (dragState.type === 'move' || dragState.type?.startsWith('resize')) {
                saveUndoState();
            }
            setDragState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, editorZoom, snapToGridTime, saveUndoState]);

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return;
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    // Audio processing functions
    const normalizeClip = useCallback((clipId: string) => {
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => c.id === clipId ? { ...c, gain: 1.5 } : c) // Simple normalize - boost gain
        })));
        setContextMenu(null);
    }, [saveUndoState]);

    const reverseClip = useCallback(async (clipId: string) => {
        // In a real DAW this would reverse the audio data
        // For now we'll just mark it visually
        saveUndoState();
        setContextMenu(null);
    }, [saveUndoState]);

    const addFadeToClip = useCallback((clipId: string, fadeType: 'in' | 'out', duration: number) => {
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => {
                if (c.id !== clipId) return c;
                return fadeType === 'in' ? { ...c, fadeIn: duration } : { ...c, fadeOut: duration };
            })
        })));
        setContextMenu(null);
    }, [saveUndoState]);

    const adjustClipGain = useCallback((clipId: string, gain: number) => {
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => c.id === clipId ? { ...c, gain } : c)
        })));
    }, [saveUndoState]);

    const duplicateClip = useCallback((clipId: string) => {
        saveUndoState();
        setTracks(prev => prev.map(t => {
            const clip = t.clips.find(c => c.id === clipId);
            if (!clip) return t;
            return {
                ...t,
                clips: [...t.clips, {
                    ...clip,
                    id: `clip_${Date.now()}`,
                    startTime: clip.startTime + clip.duration + 0.1
                }]
            };
        }));
        setContextMenu(null);
    }, [saveUndoState]);

    const setClipColor = useCallback((clipId: string, colorIndex: number) => {
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => c.id === clipId ? { ...c, color: colorIndex } : c)
        })));
        setContextMenu(null);
    }, [saveUndoState]);

    // Add marker at current position
    const addMarker = useCallback((name?: string) => {
        const markerName = name || `Marker ${markers.length + 1}`;
        setMarkers(prev => [...prev, {
            id: `marker_${Date.now()}`,
            time: editorPlayhead,
            name: markerName,
            color: '#FFD700'
        }]);
    }, [editorPlayhead, markers.length]);

    // Format time with milliseconds
    const formatTimeMs = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // Render Editor (Professional DAW-style)
    const renderEditor = () => {
        const pixelsPerSecond = 50 * editorZoom;
        const totalDuration = Math.max(60, ...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration + 10)));
        const timelineWidth = totalDuration * pixelsPerSecond;

        // Generate timeline markers
        const markerInterval = editorZoom >= 2 ? 1 : editorZoom >= 1 ? 2 : editorZoom >= 0.5 ? 5 : 10;
        const markers: number[] = [];
        for (let t = 0; t <= totalDuration; t += markerInterval) {
            markers.push(t);
        }

        // Render level meter component
        const LevelMeter = ({ trackId }: { trackId: string }) => {
            const levels = trackLevels.get(trackId) || { left: 0, right: 0 };
            return (
                <div className="flex gap-0.5 h-12">
                    {['left', 'right'].map(ch => (
                        <div key={ch} className="w-1.5 bg-gray-800 rounded-sm overflow-hidden flex flex-col-reverse">
                            <div
                                className={`transition-all duration-75 ${levels[ch as 'left' | 'right'] > 0.9 ? 'bg-red-500' : levels[ch as 'left' | 'right'] > 0.7 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ height: `${levels[ch as 'left' | 'right'] * 100}%` }}
                            />
                        </div>
                    ))}
                </div>
            );
        };

        // Pan knob component
        const PanKnob = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
            const rotation = value * 135; // -135 to 135 degrees
            return (
                <div
                    className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-600 cursor-pointer relative flex items-center justify-center"
                    onMouseDown={(e) => {
                        const startY = e.clientY;
                        const startVal = value;
                        const onMove = (me: MouseEvent) => {
                            const delta = (startY - me.clientY) / 50;
                            onChange(Math.max(-1, Math.min(1, startVal + delta)));
                        };
                        const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    }}
                    onDoubleClick={() => onChange(0)}
                    title={`Pan: ${value === 0 ? 'C' : value < 0 ? `L${Math.abs(Math.round(value * 100))}` : `R${Math.round(value * 100)}`}`}
                >
                    <div
                        className="w-0.5 h-2 bg-purple-400 absolute"
                        style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'bottom center', bottom: '50%' }}
                    />
                    <div className="w-1 h-1 rounded-full bg-gray-500" />
                </div>
            );
        };

        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Main Toolbar */}
                <div className="h-10 border-b theme-border flex items-center px-2 gap-1 bg-gradient-to-b from-gray-800 to-gray-850">
                    {/* Tool selection */}
                    <div className="flex bg-gray-900 rounded p-0.5 mr-2">
                        <button
                            onClick={() => setEditorTool('select')}
                            className={`p-1.5 rounded ${editorTool === 'select' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                            title="Select Tool (V)"
                        >
                            <MousePointer size={14}/>
                        </button>
                        <button
                            onClick={() => setEditorTool('move')}
                            className={`p-1.5 rounded ${editorTool === 'move' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                            title="Move Tool (M)"
                        >
                            <Move size={14}/>
                        </button>
                        <button
                            onClick={() => setEditorTool('cut')}
                            className={`p-1.5 rounded ${editorTool === 'cut' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                            title="Cut Tool (C)"
                        >
                            <Scissors size={14}/>
                        </button>
                    </div>

                    {/* Edit operations */}
                    <button onClick={editorUndo} disabled={undoStack.length === 0}
                            className={`p-1.5 rounded ${undoStack.length > 0 ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Undo (Ctrl+Z)">
                        <Undo size={14}/>
                    </button>
                    <button onClick={editorRedo} disabled={redoStack.length === 0}
                            className={`p-1.5 rounded ${redoStack.length > 0 ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Redo (Ctrl+Y)">
                        <Redo size={14}/>
                    </button>
                    <div className="w-px h-5 bg-gray-700 mx-1"/>
                    <button onClick={cutClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Cut (Ctrl+X)">
                        <Scissors size={14}/>
                    </button>
                    <button onClick={copyClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Copy (Ctrl+C)">
                        <Copy size={14}/>
                    </button>
                    <button onClick={() => tracks.length > 0 && pasteClip(tracks[0].id, editorPlayhead)}
                            disabled={!clipboard} className={`p-1.5 rounded ${clipboard ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Paste (Ctrl+V)">
                        <ClipboardPaste size={14}/>
                    </button>
                    <button onClick={deleteClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'hover:bg-gray-700 text-red-400' : 'opacity-40'}`} title="Delete">
                        <Trash2 size={14}/>
                    </button>
                    <div className="w-px h-5 bg-gray-700 mx-1"/>
                    <button onClick={splitClipAtPlayhead} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'hover:bg-gray-700' : 'opacity-40'}`} title="Split at Playhead (S)">
                        <Scissors size={14} className="rotate-90"/>
                    </button>

                    {/* Snap to grid */}
                    <div className="w-px h-5 bg-gray-700 mx-1"/>
                    <button
                        onClick={() => setSnapToGrid(!snapToGrid)}
                        className={`p-1.5 rounded flex items-center gap-1 ${snapToGrid ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                        title="Snap to Grid (G)"
                    >
                        <Magnet size={14}/>
                    </button>
                    <select
                        value={gridSize}
                        onChange={(e) => setGridSize(parseFloat(e.target.value) as any)}
                        className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs"
                        disabled={!snapToGrid}
                    >
                        <option value={0.25}>1/4s</option>
                        <option value={0.5}>1/2s</option>
                        <option value={1}>1s</option>
                        <option value={2}>2s</option>
                        <option value={4}>4s</option>
                    </select>

                    {/* Zoom controls */}
                    <div className="w-px h-5 bg-gray-700 mx-1"/>
                    <button onClick={() => setEditorZoom(Math.max(0.25, editorZoom - 0.25))} className="p-1.5 hover:bg-gray-700 rounded">
                        <ZoomOut size={14}/>
                    </button>
                    <span className="text-xs text-gray-400 w-10 text-center">{Math.round(editorZoom * 100)}%</span>
                    <button onClick={() => setEditorZoom(Math.min(8, editorZoom + 0.25))} className="p-1.5 hover:bg-gray-700 rounded">
                        <ZoomIn size={14}/>
                    </button>

                    {/* Effects */}
                    <div className="w-px h-5 bg-gray-700 mx-1"/>
                    <button
                        onClick={() => setShowEffectsPanel(!showEffectsPanel)}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${showEffectsPanel ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <Sliders size={12}/> FX
                    </button>

                    <div className="flex-1"/>

                    {/* Recording */}
                    <button
                        onClick={async () => {
                            if (isRecording) {
                                mediaRecorderRef.current?.stop();
                                setIsRecording(false);
                            } else {
                                try {
                                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                    const recorder = new MediaRecorder(stream);
                                    mediaRecorderRef.current = recorder;
                                    const chunks: Blob[] = [];
                                    recorder.ondataavailable = (e) => chunks.push(e.data);
                                    recorder.onstop = async () => {
                                        const blob = new Blob(chunks, { type: 'audio/webm' });
                                        const arrayBuffer = await blob.arrayBuffer();
                                        const fileName = `recording_${Date.now()}.webm`;
                                        const savePath = audioSource ? `${audioSource}/${fileName}` : fileName;
                                        try {
                                            await (window as any).api?.writeFileBuffer?.(savePath, new Uint8Array(arrayBuffer));
                                            loadAudioFiles(audioSource);
                                        } catch (e) { console.error('Failed to save:', e); }
                                    };
                                    recorder.start();
                                    setIsRecording(true);
                                } catch (err) { console.error('Recording error:', err); }
                            }
                        }}
                        className={`px-2 py-1 rounded flex items-center gap-1 text-xs ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'}`}
                    >
                        <Circle size={10} fill={isRecording ? 'currentColor' : 'none'}/>
                        {isRecording ? 'Recording...' : 'REC'}
                    </button>

                    <div className="w-px h-5 bg-gray-700 mx-1"/>

                    {/* BPM */}
                    <div className="flex items-center gap-1 bg-gray-900 rounded px-2 py-0.5">
                        <span className="text-[10px] text-gray-500">BPM</span>
                        <input
                            type="number"
                            value={projectBpm}
                            onChange={(e) => setProjectBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
                            className="w-12 bg-transparent text-xs font-mono text-center"
                        />
                        <button
                            onClick={() => setShowBpmGrid(!showBpmGrid)}
                            className={`p-0.5 rounded ${showBpmGrid ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                            title="Show beat grid"
                        >
                            <Grid size={10}/>
                        </button>
                    </div>

                    {/* Add Marker */}
                    <button
                        onClick={() => addMarker()}
                        className="px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded text-xs flex items-center gap-1"
                        title="Add Marker (M)"
                    >
                        <Tag size={10}/> Marker
                    </button>

                    {/* Waveform zoom */}
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500">Wave</span>
                        <button onClick={() => setWaveformZoom(Math.max(0.5, waveformZoom - 0.25))} className="p-0.5 hover:bg-gray-700 rounded">
                            <ZoomOut size={10}/>
                        </button>
                        <span className="text-[10px] w-6 text-center">{Math.round(waveformZoom * 100)}%</span>
                        <button onClick={() => setWaveformZoom(Math.min(3, waveformZoom + 0.25))} className="p-0.5 hover:bg-gray-700 rounded">
                            <ZoomIn size={10}/>
                        </button>
                    </div>
                </div>

                {/* Effects Panel */}
                {showEffectsPanel && (
                    <div className="h-24 border-b theme-border bg-gray-850 p-2 flex gap-3 overflow-x-auto">
                        <div className="flex flex-col gap-0.5 min-w-[100px]">
                            <span className="text-[10px] text-gray-500 uppercase">Master</span>
                            <input type="range" min={0} max={2} step={0.01} value={masterVolume}
                                   onChange={(e) => setMasterVolume(parseFloat(e.target.value))} className="w-full h-1.5 accent-purple-500"/>
                            <span className="text-[10px] text-gray-400 text-center">{Math.round(masterVolume * 100)}%</span>
                        </div>
                        {['Reverb', 'Delay', 'Chorus'].map(fx => (
                            <div key={fx} className="flex flex-col gap-0.5 min-w-[80px]">
                                <span className="text-[10px] text-gray-500 uppercase">{fx}</span>
                                <input type="range" min={0} max={1} step={0.01} defaultValue={0} className="w-full h-1.5 accent-purple-500"/>
                                <span className="text-[10px] text-gray-400 text-center">0%</span>
                            </div>
                        ))}
                        <div className="w-px bg-gray-700"/>
                        {['Low', 'Mid', 'High'].map(band => (
                            <div key={band} className="flex flex-col gap-0.5 min-w-[60px]">
                                <span className="text-[10px] text-gray-500 uppercase">{band} EQ</span>
                                <input type="range" min={-12} max={12} step={0.5} defaultValue={0} className="w-full h-1.5 accent-blue-500"/>
                                <span className="text-[10px] text-gray-400 text-center">0dB</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Main editor area */}
                <div className="flex-1 flex overflow-hidden" ref={editorContainerRef}>
                    {/* Track headers */}
                    <div className="w-52 border-r border-gray-700 flex flex-col bg-gray-850 flex-shrink-0">
                        {/* Timeline header corner */}
                        <div className="h-6 border-b border-gray-700 flex items-center px-2 bg-gray-900">
                            <span className="text-[10px] text-gray-500 uppercase">Tracks</span>
                        </div>

                        {/* Track headers */}
                        <div className="flex-1 overflow-y-auto">
                            {tracks.map((track, trackIdx) => {
                                const isLocked = lockedTracks.has(track.id);
                                const isArmed = armedTracks.has(track.id);
                                return (
                                    <div
                                        key={track.id}
                                        className={`h-20 border-b border-gray-700 p-1.5 flex flex-col ${
                                            track.muted ? 'opacity-60' : ''
                                        } ${isLocked ? 'bg-gray-800/50' : ''}`}
                                    >
                                        {/* Track name row */}
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[10px] text-gray-500 w-4">{trackIdx + 1}</span>
                                            <input
                                                type="text"
                                                value={track.name}
                                                onChange={(e) => setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, name: e.target.value} : t
                                                ))}
                                                disabled={isLocked}
                                                className="flex-1 bg-transparent text-xs font-medium border-b border-transparent hover:border-gray-600 focus:border-purple-500 outline-none"
                                            />
                                            <button
                                                onClick={() => setLockedTracks(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(track.id)) next.delete(track.id);
                                                    else next.add(track.id);
                                                    return next;
                                                })}
                                                className={`p-0.5 rounded ${isLocked ? 'text-yellow-500' : 'text-gray-600 hover:text-gray-400'}`}
                                            >
                                                {isLocked ? <Lock size={10}/> : <Unlock size={10}/>}
                                            </button>
                                        </div>

                                        {/* Controls row */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setArmedTracks(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(track.id)) next.delete(track.id);
                                                    else next.add(track.id);
                                                    return next;
                                                })}
                                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    isArmed ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                                title="Arm for recording"
                                            >
                                                R
                                            </button>
                                            <button
                                                onClick={() => !isLocked && setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, muted: !t.muted} : t
                                                ))}
                                                disabled={isLocked}
                                                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                                                    track.muted ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                                title="Mute"
                                            >
                                                M
                                            </button>
                                            <button
                                                onClick={() => !isLocked && setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, solo: !t.solo} : t
                                                ))}
                                                disabled={isLocked}
                                                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                                                    track.solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                                title="Solo"
                                            >
                                                S
                                            </button>
                                            <PanKnob
                                                value={track.pan}
                                                onChange={(v) => !isLocked && setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, pan: v} : t
                                                ))}
                                            />
                                            <LevelMeter trackId={track.id}/>
                                        </div>

                                        {/* Volume slider row */}
                                        <div className="flex items-center gap-1 mt-auto">
                                            <Volume2 size={10} className="text-gray-500"/>
                                            <input
                                                type="range"
                                                min={0}
                                                max={1.5}
                                                step={0.01}
                                                value={track.volume}
                                                onChange={(e) => !isLocked && setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, volume: parseFloat(e.target.value)} : t
                                                ))}
                                                disabled={isLocked}
                                                className="flex-1 h-1 accent-purple-500"
                                            />
                                            <span className="text-[9px] text-gray-500 w-7 text-right">
                                                {track.volume <= 1 ? Math.round(track.volume * 100) : `+${Math.round((track.volume - 1) * 100)}`}%
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <button
                                onClick={() => setTracks(prev => [...prev, {
                                    id: `track-${Date.now()}`,
                                    name: `Track ${prev.length + 1}`,
                                    clips: [],
                                    volume: 1,
                                    pan: 0,
                                    muted: false,
                                    solo: false,
                                    color: prev.length % TRACK_COLORS.length,
                                    height: 80
                                }])}
                                className="h-8 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-700/50 gap-1"
                            >
                                <Plus size={12}/> Add Track
                            </button>
                        </div>
                    </div>

                    {/* Waveform/timeline area */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Timeline ruler */}
                        <div
                            className="h-6 border-b border-gray-700 bg-gray-900 overflow-x-auto overflow-y-hidden flex-shrink-0"
                            style={{ scrollbarWidth: 'none' }}
                            onScroll={(e) => {
                                // Sync scrolling with tracks
                                const tracksContainer = e.currentTarget.nextElementSibling;
                                if (tracksContainer) tracksContainer.scrollLeft = e.currentTarget.scrollLeft;
                            }}
                        >
                            <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
                                {/* Time markers */}
                                {markers.map(t => (
                                    <div
                                        key={t}
                                        className="absolute top-0 h-full flex flex-col items-center"
                                        style={{ left: `${t * pixelsPerSecond}px` }}
                                    >
                                        <span className="text-[9px] text-gray-400 font-mono">{formatTime(t)}</span>
                                        <div className="flex-1 w-px bg-gray-700"/>
                                    </div>
                                ))}
                                {/* Sub-markers for finer grid */}
                                {snapToGrid && gridSize < markerInterval && markers.flatMap(t => {
                                    const subMarkers = [];
                                    for (let st = t + gridSize; st < t + markerInterval && st <= totalDuration; st += gridSize) {
                                        subMarkers.push(
                                            <div
                                                key={`sub-${st}`}
                                                className="absolute bottom-0 w-px h-2 bg-gray-800"
                                                style={{ left: `${st * pixelsPerSecond}px` }}
                                            />
                                        );
                                    }
                                    return subMarkers;
                                })}
                                {/* Playhead indicator on ruler */}
                                <div
                                    className="absolute top-0 h-full flex flex-col items-center pointer-events-none z-20"
                                    style={{ left: `${editorPlayhead * pixelsPerSecond}px` }}
                                >
                                    <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-500"/>
                                </div>
                                {/* Loop region */}
                                {loopEnabled && (
                                    <div
                                        className="absolute top-0 h-full bg-blue-500/20 border-l-2 border-r-2 border-blue-500"
                                        style={{
                                            left: `${loopStart * pixelsPerSecond}px`,
                                            width: `${(loopEnd - loopStart) * pixelsPerSecond}px`
                                        }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Tracks content */}
                        <div
                            className="flex-1 overflow-auto bg-gray-900"
                            onScroll={(e) => {
                                // Sync horizontal scroll with ruler
                                const ruler = e.currentTarget.previousElementSibling;
                                if (ruler) ruler.scrollLeft = e.currentTarget.scrollLeft;
                            }}
                        >
                            <div style={{ width: `${timelineWidth}px`, minHeight: '100%' }}>
                                {tracks.map((track, trackIdx) => {
                                    const isLocked = lockedTracks.has(track.id);
                                    return (
                                        <div
                                            key={track.id}
                                            className={`h-20 border-b border-gray-800 relative ${
                                                track.muted ? 'opacity-50' : ''
                                            }`}
                                            onDragOver={(e) => !isLocked && e.preventDefault()}
                                            onDrop={(e) => {
                                                if (isLocked) return;
                                                const audioId = e.dataTransfer.getData('audioId');
                                                if (audioId && selectedAudio) {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    let x = (e.clientX - rect.left + e.currentTarget.parentElement!.scrollLeft) / pixelsPerSecond;
                                                    x = snapToGridTime(x);
                                                    saveUndoState();
                                                    setTracks(prev => prev.map(t =>
                                                        t.id === track.id ? {
                                                            ...t,
                                                            clips: [...t.clips, {
                                                                id: `clip_${Date.now()}`,
                                                                audioId: selectedAudio.id,
                                                                startTime: x,
                                                                duration: selectedAudio.duration || 10,
                                                                offset: 0,
                                                                name: selectedAudio.name,
                                                                gain: 1,
                                                                fadeIn: 0,
                                                                fadeOut: 0
                                                            }]
                                                        } : t
                                                    ));
                                                }
                                            }}
                                            onClick={(e) => {
                                                if (e.target === e.currentTarget) {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    let x = (e.clientX - rect.left + e.currentTarget.parentElement!.scrollLeft) / pixelsPerSecond;
                                                    if (snapToGrid) x = snapToGridTime(x);
                                                    setEditorPlayhead(x);
                                                    setSelectedClipId(null);
                                                }
                                            }}
                                        >
                                            {/* Grid lines */}
                                            {markers.map(t => (
                                                <div
                                                    key={t}
                                                    className="absolute top-0 bottom-0 w-px bg-gray-800"
                                                    style={{ left: `${t * pixelsPerSecond}px` }}
                                                />
                                            ))}

                                            {/* Center line */}
                                            <div className="absolute inset-x-0 top-1/2 h-px bg-gray-700 pointer-events-none"/>

                                            {/* Clips */}
                                            {track.clips.map(clip => {
                                                const audioFile = audioFiles.find(f => f.id === clip.audioId);
                                                const waveform = waveformCache.get(clip.audioId);
                                                const hiResData = waveformDataCache.get(clip.audioId);
                                                const trackColor = TRACK_COLORS[clip.color ?? track.color] || TRACK_COLORS[0];
                                                const clipWidth = Math.max(clip.duration * pixelsPerSecond, 20);
                                                const clipHeight = track.height - 8;
                                                const fadeInWidth = (clip.fadeIn || 0) * pixelsPerSecond;
                                                const fadeOutWidth = (clip.fadeOut || 0) * pixelsPerSecond;

                                                if (!waveform && audioFile) {
                                                    loadWaveform(audioFile.path, clip.audioId);
                                                }

                                                // Generate continuous waveform path
                                                const waveformPath = hiResData && audioFile?.duration
                                                    ? renderWaveformPath(clip.audioId, clipWidth, clipHeight - 16, clip.offset, clip.duration, audioFile.duration)
                                                    : '';

                                                return (
                                                    <div
                                                        key={clip.id}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                                                        onDoubleClick={() => setEditorPlayhead(clip.startTime)}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id, trackId: track.id });
                                                        }}
                                                        onMouseDown={(e) => {
                                                            if (isLocked) return;
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const relX = e.clientX - rect.left;

                                                            // Check if clicking on fade handles
                                                            if (selectedClipId === clip.id) {
                                                                if (relX < fadeInWidth + 10 && relX < 20) {
                                                                    setDragState({ type: 'fade-in', clipId: clip.id, trackId: track.id, startX: e.clientX, startTime: clip.fadeIn || 0, originalClip: {...clip} });
                                                                    e.preventDefault();
                                                                    return;
                                                                }
                                                                if (relX > clipWidth - fadeOutWidth - 10 && relX > clipWidth - 20) {
                                                                    setDragState({ type: 'fade-out', clipId: clip.id, trackId: track.id, startX: e.clientX, startTime: clip.fadeOut || 0, originalClip: {...clip} });
                                                                    e.preventDefault();
                                                                    return;
                                                                }
                                                                // Resize handles
                                                                if (relX < 6) {
                                                                    setDragState({ type: 'resize-left', clipId: clip.id, trackId: track.id, startX: e.clientX, startTime: clip.startTime, originalClip: {...clip} });
                                                                    e.preventDefault();
                                                                    return;
                                                                }
                                                                if (relX > clipWidth - 6) {
                                                                    setDragState({ type: 'resize-right', clipId: clip.id, trackId: track.id, startX: e.clientX, startTime: clip.duration, originalClip: {...clip} });
                                                                    e.preventDefault();
                                                                    return;
                                                                }
                                                            }

                                                            // Move clip
                                                            if (editorTool === 'move' || e.altKey) {
                                                                setDragState({ type: 'move', clipId: clip.id, trackId: track.id, startX: e.clientX, startTime: clip.startTime, originalClip: {...clip} });
                                                                e.preventDefault();
                                                            }
                                                        }}
                                                        className={`absolute rounded-sm cursor-pointer overflow-hidden ${
                                                            selectedClipId === clip.id
                                                                ? 'ring-2 ring-white shadow-lg z-10'
                                                                : 'hover:ring-1 hover:ring-white/50'
                                                        } ${isLocked ? 'opacity-60' : ''} ${
                                                            dragState?.clipId === clip.id ? 'opacity-80' : ''
                                                        }`}
                                                        style={{
                                                            left: `${clip.startTime * pixelsPerSecond}px`,
                                                            width: `${clipWidth}px`,
                                                            top: '4px',
                                                            height: `${clipHeight}px`,
                                                        }}
                                                    >
                                                        {/* Clip background gradient */}
                                                        <div className={`absolute inset-0 bg-gradient-to-b ${trackColor.bg}`} style={{ opacity: track.solo ? 0.9 : 0.85 }}/>

                                                        {/* Clip header */}
                                                        <div className="relative px-1.5 py-0.5 flex items-center gap-1 bg-black/30">
                                                            <span className="text-[10px] truncate font-medium flex-1">{clip.name}</span>
                                                            {(clip.gain ?? 1) !== 1 && (
                                                                <span className="text-[9px] bg-black/40 px-1 rounded">
                                                                    {clip.gain! > 1 ? '+' : ''}{((clip.gain! - 1) * 100).toFixed(0)}%
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Continuous waveform */}
                                                        <div className="absolute inset-x-0 top-5 bottom-0 overflow-hidden">
                                                            <svg
                                                                className="w-full h-full"
                                                                viewBox={`0 0 ${clipWidth} ${clipHeight - 16}`}
                                                                preserveAspectRatio="none"
                                                            >
                                                                {/* Waveform fill */}
                                                                {waveformPath ? (
                                                                    <path
                                                                        d={waveformPath}
                                                                        fill="rgba(255,255,255,0.5)"
                                                                        stroke="rgba(255,255,255,0.8)"
                                                                        strokeWidth="0.5"
                                                                    />
                                                                ) : waveform ? (
                                                                    // Fallback to bar visualization while loading hi-res
                                                                    waveform.map((v, i) => (
                                                                        <rect
                                                                            key={i}
                                                                            x={(i / waveform.length) * clipWidth}
                                                                            y={(clipHeight - 16) / 2 - v * (clipHeight - 20) / 2}
                                                                            width={Math.max(clipWidth / waveform.length - 0.5, 1)}
                                                                            height={Math.max(v * (clipHeight - 20), 1)}
                                                                            fill="rgba(255,255,255,0.5)"
                                                                        />
                                                                    ))
                                                                ) : (
                                                                    // Loading placeholder
                                                                    <text x="50%" y="50%" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">Loading...</text>
                                                                )}

                                                                {/* Fade in gradient */}
                                                                {fadeInWidth > 0 && (
                                                                    <>
                                                                        <defs>
                                                                            <linearGradient id={`fadeIn-${clip.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                                                <stop offset="0%" stopColor="black" stopOpacity="0.7"/>
                                                                                <stop offset="100%" stopColor="black" stopOpacity="0"/>
                                                                            </linearGradient>
                                                                        </defs>
                                                                        <rect x="0" y="0" width={fadeInWidth} height={clipHeight - 16} fill={`url(#fadeIn-${clip.id})`}/>
                                                                        <line x1={fadeInWidth} y1="0" x2="0" y2={clipHeight - 16} stroke="white" strokeWidth="1" strokeDasharray="2,2" opacity="0.5"/>
                                                                    </>
                                                                )}

                                                                {/* Fade out gradient */}
                                                                {fadeOutWidth > 0 && (
                                                                    <>
                                                                        <defs>
                                                                            <linearGradient id={`fadeOut-${clip.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                                                <stop offset="0%" stopColor="black" stopOpacity="0"/>
                                                                                <stop offset="100%" stopColor="black" stopOpacity="0.7"/>
                                                                            </linearGradient>
                                                                        </defs>
                                                                        <rect x={clipWidth - fadeOutWidth} y="0" width={fadeOutWidth} height={clipHeight - 16} fill={`url(#fadeOut-${clip.id})`}/>
                                                                        <line x1={clipWidth - fadeOutWidth} y1={clipHeight - 16} x2={clipWidth} y2="0" stroke="white" strokeWidth="1" strokeDasharray="2,2" opacity="0.5"/>
                                                                    </>
                                                                )}
                                                            </svg>
                                                        </div>

                                                        {/* Selection controls */}
                                                        {selectedClipId === clip.id && !isLocked && (
                                                            <>
                                                                {/* Resize handles */}
                                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize bg-white/30 hover:bg-white/60 transition-colors"/>
                                                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize bg-white/30 hover:bg-white/60 transition-colors"/>

                                                                {/* Fade in handle */}
                                                                <div
                                                                    className="absolute top-0 w-3 h-3 bg-yellow-400 rounded-full cursor-ew-resize border border-white shadow-md"
                                                                    style={{ left: `${fadeInWidth - 6}px`, transform: 'translateY(-1px)' }}
                                                                    title="Drag to adjust fade in"
                                                                />

                                                                {/* Fade out handle */}
                                                                <div
                                                                    className="absolute top-0 w-3 h-3 bg-yellow-400 rounded-full cursor-ew-resize border border-white shadow-md"
                                                                    style={{ right: `${fadeOutWidth - 6}px`, transform: 'translateY(-1px)' }}
                                                                    title="Drag to adjust fade out"
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Playhead */}
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none shadow-lg shadow-red-500/50"
                                                style={{ left: `${editorPlayhead * pixelsPerSecond}px` }}
                                            />

                                            {/* Selection region */}
                                            {selectionRange && (
                                                <div
                                                    className="absolute top-0 bottom-0 bg-blue-500/20 border-l border-r border-blue-500 pointer-events-none"
                                                    style={{
                                                        left: `${selectionRange.start * pixelsPerSecond}px`,
                                                        width: `${(selectionRange.end - selectionRange.start) * pixelsPerSecond}px`
                                                    }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transport bar */}
                <div className="h-14 border-t border-gray-700 bg-gradient-to-t from-gray-900 to-gray-850 flex items-center px-4 gap-3">
                    {/* Time display */}
                    <div className="bg-black rounded px-3 py-1.5 font-mono text-lg text-green-400 tracking-wider w-32 text-center">
                        {formatTimeMs(editorPlayhead)}
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setEditorPlayhead(0); stopEditorTimeline(); }}
                            className="p-2 hover:bg-gray-700 rounded"
                            title="Go to Start (Home)"
                        >
                            <SkipBack size={18}/>
                        </button>
                        <button
                            onClick={() => setEditorPlayhead(prev => Math.max(0, prev - 5))}
                            className="p-2 hover:bg-gray-700 rounded"
                            title="Rewind 5s"
                        >
                            <Rewind size={18}/>
                        </button>
                        <button
                            onClick={() => { stopEditorTimeline(); }}
                            className={`p-2.5 rounded ${isEditorPlaying ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
                            title="Stop"
                        >
                            <Square size={18} fill={isEditorPlaying ? 'currentColor' : 'none'}/>
                        </button>
                        <button
                            onClick={() => isEditorPlaying ? stopEditorTimeline() : playEditorTimeline()}
                            className={`p-3 rounded-full ${isEditorPlaying ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                            title={isEditorPlaying ? 'Pause (Space)' : 'Play (Space)'}
                        >
                            {isEditorPlaying ? <Pause size={22}/> : <Play size={22} fill="currentColor"/>}
                        </button>
                        <button
                            onClick={() => setEditorPlayhead(prev => prev + 5)}
                            className="p-2 hover:bg-gray-700 rounded"
                            title="Forward 5s"
                        >
                            <FastForward size={18}/>
                        </button>
                        <button
                            onClick={() => {
                                const maxTime = Math.max(...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)), 0);
                                setEditorPlayhead(maxTime);
                            }}
                            className="p-2 hover:bg-gray-700 rounded"
                            title="Go to End (End)"
                        >
                            <SkipForward size={18}/>
                        </button>
                    </div>

                    {/* Loop controls */}
                    <div className="w-px h-8 bg-gray-700 mx-2"/>
                    <button
                        onClick={() => setLoopEnabled(!loopEnabled)}
                        className={`p-2 rounded ${loopEnabled ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                        title="Loop"
                    >
                        <Repeat size={16}/>
                    </button>

                    {/* Duration display */}
                    <div className="flex-1 flex items-center justify-center">
                        <span className="text-xs text-gray-500">
                            Duration: {formatTime(Math.max(...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)), 0))}
                        </span>
                    </div>

                    {/* Master volume */}
                    <div className="flex items-center gap-2">
                        <Volume2 size={14} className="text-gray-400"/>
                        <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={masterVolume}
                            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                            className="w-20 h-1.5 accent-purple-500"
                        />
                        <span className="text-xs text-gray-400 w-8">{Math.round(masterVolume * 100)}%</span>
                    </div>

                    {/* Export */}
                    <div className="w-px h-8 bg-gray-700 mx-2"/>
                    <button
                        onClick={exportTimeline}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-2 font-medium"
                        title="Export to WAV"
                    >
                        <Download size={14}/> Export
                    </button>
                </div>

                {/* Context Menu for clips */}
                {contextMenu && (
                    <div
                        className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.clipId && (
                            <>
                                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase">Clip Actions</div>
                                <button
                                    onClick={() => duplicateClip(contextMenu.clipId!)}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Copy size={12}/> Duplicate
                                </button>
                                <button
                                    onClick={() => { cutClip(); setContextMenu(null); }}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Scissors size={12}/> Cut
                                </button>
                                <button
                                    onClick={() => { deleteClip(); setContextMenu(null); }}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-red-400"
                                >
                                    <Trash2 size={12}/> Delete
                                </button>
                                <div className="border-t border-gray-700 my-1"/>
                                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase">Processing</div>
                                <button
                                    onClick={() => normalizeClip(contextMenu.clipId!)}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <BarChart3 size={12}/> Normalize
                                </button>
                                <button
                                    onClick={() => addFadeToClip(contextMenu.clipId!, 'in', 0.5)}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <ChevronRight size={12} className="rotate-180"/> Add Fade In
                                </button>
                                <button
                                    onClick={() => addFadeToClip(contextMenu.clipId!, 'out', 0.5)}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <ChevronRight size={12}/> Add Fade Out
                                </button>
                                <div className="border-t border-gray-700 my-1"/>
                                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase">Gain</div>
                                <div className="px-3 py-1.5 flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={0}
                                        max={2}
                                        step={0.1}
                                        defaultValue={1}
                                        onChange={(e) => adjustClipGain(contextMenu.clipId!, parseFloat(e.target.value))}
                                        className="flex-1 h-1.5 accent-purple-500"
                                    />
                                    <span className="text-xs w-10">Gain</span>
                                </div>
                                <div className="border-t border-gray-700 my-1"/>
                                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase">Color</div>
                                <div className="px-3 py-1.5 flex gap-1 flex-wrap">
                                    {TRACK_COLORS.map((color, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setClipColor(contextMenu.clipId!, i)}
                                            className={`w-5 h-5 rounded-full bg-gradient-to-b ${color.bg} border border-gray-600 hover:scale-110 transition-transform`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Markers display (on timeline) */}
                {markers.length > 0 && (
                    <div className="absolute left-52 right-0 top-10 h-6 pointer-events-none z-20">
                        {markers.map(marker => (
                            <div
                                key={marker.id}
                                className="absolute top-0 flex flex-col items-center pointer-events-auto cursor-pointer"
                                style={{ left: `${marker.time * 50 * editorZoom}px` }}
                                onClick={() => setEditorPlayhead(marker.time)}
                            >
                                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent" style={{ borderTopColor: marker.color }}/>
                                <span className="text-[9px] bg-gray-900/80 px-1 rounded whitespace-nowrap">{marker.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Render DJ Mixer - Professional DJ interface
    const renderDJMixer = () => {
        const HOT_CUE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
        const LOOP_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];

        const renderDeck = (deck: DJDeck, setDeck: React.Dispatch<React.SetStateAction<DJDeck>>, label: string, audioRef: React.RefObject<HTMLAudioElement>, isLeft: boolean) => {
            const waveform = deck.audioFile ? waveformCache.get(deck.audioFile.id) : null;
            const hiResWaveform = deck.audioFile ? waveformDataCache.get(deck.audioFile.id) : null;
            const accentColor = isLeft ? 'blue' : 'orange';
            const accentClass = isLeft ? 'text-blue-400' : 'text-orange-400';
            const bgAccent = isLeft ? 'bg-blue-600' : 'bg-orange-600';
            const bgAccentHover = isLeft ? 'hover:bg-blue-700' : 'hover:bg-orange-700';

            // Load waveform when track is loaded
            if (deck.audioFile && !waveform) {
                loadWaveform(deck.audioFile.path, deck.audioFile.id);
            }

            // Handle loop
            const handleLoop = () => {
                if (deck.loopActive && deck.loopIn !== null && deck.loopOut !== null) {
                    if (audioRef.current && deck.currentTime >= deck.loopOut) {
                        audioRef.current.currentTime = deck.loopIn;
                    }
                }
            };

            // Set hot cue
            const setHotCue = (index: number) => {
                if (deck.hotCues[index] === null) {
                    // Set cue
                    setDeck(prev => {
                        const newCues = [...prev.hotCues];
                        newCues[index] = prev.currentTime;
                        return { ...prev, hotCues: newCues };
                    });
                } else {
                    // Jump to cue
                    if (audioRef.current) {
                        audioRef.current.currentTime = deck.hotCues[index]!;
                    }
                    setDeck(prev => ({ ...prev, currentTime: prev.hotCues[index]! }));
                }
            };

            // Clear hot cue
            const clearHotCue = (index: number, e: React.MouseEvent) => {
                e.preventDefault();
                setDeck(prev => {
                    const newCues = [...prev.hotCues];
                    newCues[index] = null;
                    return { ...prev, hotCues: newCues };
                });
            };

            // Set loop
            const setLoopPoint = (point: 'in' | 'out') => {
                setDeck(prev => ({
                    ...prev,
                    [point === 'in' ? 'loopIn' : 'loopOut']: prev.currentTime,
                    loopActive: point === 'out' && prev.loopIn !== null
                }));
            };

            // Auto loop
            const setAutoLoop = (beats: number) => {
                const bpm = deck.audioFile?.bpm || 120;
                const loopDuration = (beats / bpm) * 60;
                setDeck(prev => ({
                    ...prev,
                    loopIn: prev.currentTime,
                    loopOut: prev.currentTime + loopDuration,
                    loopActive: true
                }));
            };

            return (
                <div className="flex-1 flex flex-col bg-gradient-to-b from-gray-900 to-gray-950 min-w-0">
                    {/* Deck header */}
                    <div className={`h-8 flex items-center justify-between px-3 ${isLeft ? 'bg-blue-900/40' : 'bg-orange-900/40'} border-b border-gray-800`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${accentClass}`}>{label}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Deck</span>
                        </div>
                        <span className="text-xs text-gray-400 truncate max-w-[150px]">{deck.audioFile?.name || 'No Track'}</span>
                    </div>

                    {/* Overview waveform - full track view */}
                    <div
                        className="h-8 bg-black/50 border-b border-gray-800 relative cursor-pointer"
                        onClick={(e) => {
                            if (!deck.audioFile?.duration) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const newTime = (x / rect.width) * deck.audioFile.duration;
                            if (audioRef.current) audioRef.current.currentTime = newTime;
                            setDeck(prev => ({ ...prev, currentTime: newTime }));
                        }}
                    >
                        {waveform && (
                            <svg className="w-full h-full" viewBox="0 0 200 32" preserveAspectRatio="none">
                                {waveform.map((v, i) => (
                                    <rect
                                        key={i}
                                        x={i}
                                        y={16 - v * 14}
                                        width="1"
                                        height={v * 28}
                                        fill={i / 200 < (deck.currentTime / (deck.audioFile?.duration || 1))
                                            ? (isLeft ? '#1E40AF' : '#9A3412')
                                            : (isLeft ? '#3B82F6' : '#F97316')}
                                        opacity={i / 200 < (deck.currentTime / (deck.audioFile?.duration || 1)) ? 0.6 : 1}
                                    />
                                ))}
                            </svg>
                        )}
                        {/* Position indicator */}
                        {deck.audioFile?.duration && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white"
                                style={{ left: `${(deck.currentTime / deck.audioFile.duration) * 100}%` }}
                            />
                        )}
                        {/* Hot cue markers on overview */}
                        {deck.audioFile?.duration && deck.hotCues.map((cue, i) => {
                            if (cue === null) return null;
                            return (
                                <div
                                    key={i}
                                    className="absolute top-0 w-1 h-2 rounded-b-sm"
                                    style={{
                                        left: `${(cue / deck.audioFile!.duration!) * 100}%`,
                                        backgroundColor: HOT_CUE_COLORS[i]
                                    }}
                                />
                            );
                        })}
                        {/* Loop region on overview */}
                        {deck.audioFile?.duration && deck.loopIn !== null && deck.loopOut !== null && (
                            <div
                                className="absolute top-0 bottom-0 border-x-2"
                                style={{
                                    left: `${(deck.loopIn / deck.audioFile.duration) * 100}%`,
                                    width: `${((deck.loopOut - deck.loopIn) / deck.audioFile.duration) * 100}%`,
                                    backgroundColor: deck.loopActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                                    borderColor: deck.loopActive ? '#22c55e' : '#666'
                                }}
                            />
                        )}
                    </div>

                    {/* Scrolling waveform - centered on playhead */}
                    <div className="h-20 bg-black border-b border-gray-800 relative overflow-hidden">
                        {hiResWaveform && deck.audioFile?.duration ? (
                            <div className="absolute inset-0">
                                <svg className="w-full h-full" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id={`waveGrad${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={isLeft ? '#3B82F6' : '#F97316'}/>
                                            <stop offset="50%" stopColor={isLeft ? '#1E40AF' : '#C2410C'}/>
                                            <stop offset="100%" stopColor={isLeft ? '#3B82F6' : '#F97316'}/>
                                        </linearGradient>
                                    </defs>
                                    {/* Render visible portion of waveform centered on playhead */}
                                    {(() => {
                                        const duration = deck.audioFile?.duration || 1;
                                        const visibleSeconds = 10; // Show 10 seconds of audio
                                        const centerTime = deck.currentTime;
                                        const startTime = Math.max(0, centerTime - visibleSeconds / 2);
                                        const endTime = Math.min(duration, centerTime + visibleSeconds / 2);

                                        const totalSamples = hiResWaveform.length / 2;
                                        const samplesPerSecond = totalSamples / duration;
                                        const startSample = Math.floor(startTime * samplesPerSecond);
                                        const endSample = Math.floor(endTime * samplesPerSecond);

                                        const points: JSX.Element[] = [];
                                        const step = Math.max(1, Math.floor((endSample - startSample) / 200));

                                        for (let i = startSample; i < endSample; i += step) {
                                            if (i * 2 + 1 >= hiResWaveform.length) break;
                                            const min = hiResWaveform[i * 2];
                                            const max = hiResWaveform[i * 2 + 1];
                                            const x = ((i / samplesPerSecond - startTime) / visibleSeconds) * 100;
                                            const yTop = 50 - max * 45;
                                            const height = (max - min) * 45;

                                            // Color based on position relative to playhead
                                            const sampleTime = i / samplesPerSecond;
                                            const isPast = sampleTime < centerTime;

                                            points.push(
                                                <rect
                                                    key={i}
                                                    x={`${x}%`}
                                                    y={yTop}
                                                    width="0.5%"
                                                    height={Math.max(height, 1)}
                                                    fill={isPast ? (isLeft ? '#1E40AF' : '#9A3412') : `url(#waveGrad${label})`}
                                                    opacity={isPast ? 0.5 : 1}
                                                />
                                            );
                                        }
                                        return points;
                                    })()}

                                    {/* Center playhead line */}
                                    <line x1="50%" y1="0" x2="50%" y2="100" stroke="white" strokeWidth="2"/>

                                    {/* Loop region */}
                                    {deck.loopIn !== null && deck.loopOut !== null && (
                                        <rect
                                            x={`${((deck.loopIn - (deck.currentTime - 5)) / 10) * 100}%`}
                                            y="0"
                                            width={`${((deck.loopOut - deck.loopIn) / 10) * 100}%`}
                                            height="100"
                                            fill={deck.loopActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 100, 100, 0.2)'}
                                            stroke={deck.loopActive ? '#22c55e' : '#666'}
                                            strokeWidth="1"
                                        />
                                    )}

                                    {/* Hot cue markers */}
                                    {deck.hotCues.map((cue, i) => {
                                        if (cue === null) return null;
                                        const x = ((cue - (deck.currentTime - 5)) / 10) * 100;
                                        if (x < 0 || x > 100) return null;
                                        return (
                                            <g key={i}>
                                                <line x1={`${x}%`} y1="0" x2={`${x}%`} y2="100" stroke={HOT_CUE_COLORS[i]} strokeWidth="1" strokeDasharray="2,2"/>
                                                <circle cx={`${x}%`} cy="8" r="4" fill={HOT_CUE_COLORS[i]}/>
                                            </g>
                                        );
                                    })}

                                    {/* Beat grid lines */}
                                    {deck.beatGrid.length > 0 && (() => {
                                        const lines: JSX.Element[] = [];
                                        const visibleSeconds = 10;
                                        const startTime = Math.max(0, deck.currentTime - visibleSeconds / 2);
                                        const endTime = deck.currentTime + visibleSeconds / 2;

                                        deck.beatGrid.forEach((beat, i) => {
                                            if (beat >= startTime && beat <= endTime) {
                                                const x = ((beat - startTime) / visibleSeconds) * 100;
                                                const isBeat4 = i % 4 === 0;
                                                const isBeat16 = i % 16 === 0;
                                                lines.push(
                                                    <line
                                                        key={`beat-${i}`}
                                                        x1={`${x}%`}
                                                        y1={isBeat16 ? 0 : isBeat4 ? 15 : 25}
                                                        x2={`${x}%`}
                                                        y2={isBeat16 ? 80 : isBeat4 ? 65 : 55}
                                                        stroke={isBeat16 ? '#fff' : isBeat4 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
                                                        strokeWidth={isBeat16 ? 1.5 : 0.5}
                                                    />
                                                );
                                            }
                                        });
                                        return lines;
                                    })()}
                                </svg>
                            </div>
                        ) : waveform ? (
                            <div className="absolute inset-0 flex items-center opacity-30">
                                <svg className="w-full h-full" viewBox="0 0 200 80" preserveAspectRatio="none">
                                    {waveform.map((v, i) => (
                                        <rect key={i} x={i} y={40 - v * 35} width="0.8" height={v * 70} fill={isLeft ? '#3B82F6' : '#F97316'}/>
                                    ))}
                                </svg>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                                {deck.audioFile ? 'Loading...' : 'Load a track'}
                            </div>
                        )}

                        {/* Time displays */}
                        <div className="absolute bottom-1 left-2 bg-black/70 px-1.5 py-0.5 rounded">
                            <span className="text-sm font-mono text-white">{formatTime(deck.currentTime)}</span>
                        </div>
                        <div className="absolute bottom-1 right-2 bg-black/70 px-1.5 py-0.5 rounded">
                            <span className="text-sm font-mono text-red-400">-{formatTime((deck.audioFile?.duration || 0) - deck.currentTime)}</span>
                        </div>
                    </div>

                    {/* BPM / Key / Pitch / Controls display */}
                    <div className="h-8 flex items-center justify-between px-2 bg-gray-900/80 border-b border-gray-800">
                        <div className="flex items-center gap-2">
                            {/* Nudge buttons */}
                            <button
                                onClick={() => nudgeDeck(deck, setDeck, audioRef, -0.02)}
                                className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] font-bold"
                                title="Nudge backward"
                            >-</button>
                            <div className="flex items-center gap-1">
                                <span className="text-base font-bold font-mono text-white">{deck.audioFile?.bpm || '---'}</span>
                                <span className="text-[8px] text-gray-500">BPM</span>
                            </div>
                            <button
                                onClick={() => nudgeDeck(deck, setDeck, audioRef, 0.02)}
                                className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] font-bold"
                                title="Nudge forward"
                            >+</button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${deck.audioFile?.key ? (isLeft ? 'bg-blue-900/50 text-blue-300' : 'bg-orange-900/50 text-orange-300') : 'text-gray-500'}`}>
                                {deck.audioFile?.key || '--'}
                            </span>
                            <button
                                onClick={() => setDeck(prev => ({ ...prev, keyLock: !prev.keyLock }))}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${deck.keyLock ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                                title="Key Lock"
                            >
                                KEY
                            </button>
                        </div>
                        <div className={`text-sm font-mono ${deck.speed !== 1 ? (deck.speed > 1 ? 'text-green-400' : 'text-red-400') : 'text-gray-400'}`}>
                            {deck.speed > 1 ? '+' : ''}{((deck.speed - 1) * 100).toFixed(1)}%
                        </div>
                    </div>

                    {/* Main controls */}
                    <div className="flex-1 flex min-h-0">
                        {/* EQ Section */}
                        <div className="w-20 border-r border-gray-800 p-1.5 flex flex-col">
                            <div className="text-[9px] text-gray-500 text-center mb-1">EQ</div>
                            {(['high', 'mid', 'low'] as const).map(band => (
                                <div key={band} className="flex-1 flex items-center gap-0.5">
                                    <button
                                        onClick={() => setDeck(prev => ({
                                            ...prev,
                                            eqKill: { ...prev.eqKill, [band]: !prev.eqKill[band] }
                                        }))}
                                        className={`w-4 h-4 text-[8px] font-bold rounded ${
                                            deck.eqKill[band] ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                                        }`}
                                    >
                                        {band[0].toUpperCase()}
                                    </button>
                                    <input
                                        type="range"
                                        min={-12}
                                        max={12}
                                        value={deck.eqKill[band] ? -12 : deck.eq[band]}
                                        disabled={deck.eqKill[band]}
                                        onChange={(e) => setDeck(prev => ({
                                            ...prev,
                                            eq: { ...prev.eq, [band]: parseInt(e.target.value) }
                                        }))}
                                        className="flex-1 h-1.5 accent-purple-500"
                                    />
                                </div>
                            ))}
                            <div className="border-t border-gray-700 mt-1 pt-1">
                                <div className="text-[9px] text-gray-500 text-center">FILTER</div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={deck.filter}
                                    onChange={(e) => setDeck(prev => ({ ...prev, filter: parseInt(e.target.value) }))}
                                    className="w-full h-1.5 accent-yellow-500"
                                />
                            </div>
                        </div>

                        {/* Center section: Transport, Hot Cues, Loops */}
                        <div className="flex-1 flex flex-col p-2 gap-2 min-w-0">
                            {/* Transport */}
                            <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => {
                                        if (audioRef.current) audioRef.current.currentTime = deck.hotCues[0] || 0;
                                        setDeck(prev => ({ ...prev, currentTime: prev.hotCues[0] || 0 }));
                                    }}
                                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-yellow-400"
                                    title="Cue"
                                >
                                    <RotateCcw size={14}/>
                                </button>
                                <button
                                    onClick={() => {
                                        if (audioRef.current) {
                                            if (deck.playing) audioRef.current.pause();
                                            else audioRef.current.play();
                                        }
                                        setDeck(prev => ({ ...prev, playing: !prev.playing }));
                                    }}
                                    className={`p-3 rounded-lg ${deck.playing ? 'bg-green-600 hover:bg-green-700' : `${bgAccent} ${bgAccentHover}`}`}
                                >
                                    {deck.playing ? <Pause size={18}/> : <Play size={18} fill="white"/>}
                                </button>
                                <button
                                    onClick={() => {
                                        // Sync to other deck's BPM
                                        const otherDeck = isLeft ? deckB : deckA;
                                        if (otherDeck.audioFile?.bpm && deck.audioFile?.bpm) {
                                            const ratio = otherDeck.audioFile.bpm / deck.audioFile.bpm;
                                            const newSpeed = Math.max(0.5, Math.min(2, ratio));
                                            setDeck(prev => ({ ...prev, speed: newSpeed }));
                                            if (audioRef.current) audioRef.current.playbackRate = newSpeed;
                                        }
                                    }}
                                    className={`p-2 rounded ${deck.speed === 1 ? 'bg-gray-800 hover:bg-gray-700' : 'bg-purple-600'}`}
                                    title="Sync BPM"
                                >
                                    <Repeat size={14}/>
                                </button>
                            </div>

                            {/* Hot Cues */}
                            <div>
                                <div className="text-[9px] text-gray-500 text-center mb-1">HOT CUES</div>
                                <div className="grid grid-cols-4 gap-1">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                                        <button
                                            key={i}
                                            onClick={() => setHotCue(i)}
                                            onContextMenu={(e) => clearHotCue(i, e)}
                                            className={`h-6 rounded text-[10px] font-bold transition-colors ${
                                                deck.hotCues[i] !== null
                                                    ? 'text-white shadow-lg'
                                                    : 'bg-gray-800 hover:bg-gray-700 text-gray-500'
                                            }`}
                                            style={deck.hotCues[i] !== null ? { backgroundColor: HOT_CUE_COLORS[i] } : {}}
                                            title={deck.hotCues[i] !== null ? `${formatTime(deck.hotCues[i]!)} (right-click to clear)` : 'Set cue'}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Loop controls */}
                            <div>
                                <div className="text-[9px] text-gray-500 text-center mb-1">LOOP</div>
                                <div className="flex gap-1 mb-1">
                                    <button
                                        onClick={() => setLoopPoint('in')}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopIn !== null ? 'bg-green-600' : 'bg-gray-800 hover:bg-gray-700'
                                        }`}
                                    >
                                        IN
                                    </button>
                                    <button
                                        onClick={() => setLoopPoint('out')}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopOut !== null ? 'bg-green-600' : 'bg-gray-800 hover:bg-gray-700'
                                        }`}
                                    >
                                        OUT
                                    </button>
                                    <button
                                        onClick={() => setDeck(prev => ({ ...prev, loopActive: !prev.loopActive }))}
                                        disabled={deck.loopIn === null || deck.loopOut === null}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopActive ? 'bg-green-500 animate-pulse' : 'bg-gray-800 hover:bg-gray-700'
                                        } disabled:opacity-40`}
                                    >
                                        {deck.loopActive ? 'ON' : 'OFF'}
                                    </button>
                                    <button
                                        onClick={() => setDeck(prev => ({ ...prev, loopIn: null, loopOut: null, loopActive: false }))}
                                        className="flex-1 h-5 rounded text-[9px] font-bold bg-gray-800 hover:bg-red-600"
                                    >
                                        CLR
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-0.5">
                                    {LOOP_SIZES.map(size => (
                                        <button
                                            key={size}
                                            onClick={() => setAutoLoop(size)}
                                            className="h-5 rounded text-[9px] bg-gray-800 hover:bg-purple-600"
                                        >
                                            {size >= 1 ? size : `1/${1/size}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Pitch/Tempo fader */}
                        <div className="w-16 border-l border-gray-800 p-1.5 flex flex-col items-center">
                            <div className="text-[9px] text-gray-500 mb-1">TEMPO</div>
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <input
                                    type="range"
                                    min={0.5}
                                    max={1.5}
                                    step={0.001}
                                    value={deck.speed}
                                    onChange={(e) => {
                                        const speed = parseFloat(e.target.value);
                                        setDeck(prev => ({ ...prev, speed }));
                                        if (audioRef.current) audioRef.current.playbackRate = speed;
                                    }}
                                    className="h-24 accent-purple-500"
                                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                />
                            </div>
                            <button
                                onClick={() => {
                                    setDeck(prev => ({ ...prev, speed: 1 }));
                                    if (audioRef.current) audioRef.current.playbackRate = 1;
                                }}
                                className="mt-1 w-full py-0.5 text-[9px] bg-gray-800 hover:bg-gray-700 rounded"
                            >
                                0%
                            </button>

                            {/* Volume */}
                            <div className="border-t border-gray-700 mt-2 pt-2 w-full flex flex-col items-center">
                                <div className="text-[9px] text-gray-500 mb-1">VOL</div>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={deck.volume}
                                    onChange={(e) => {
                                        const vol = parseFloat(e.target.value);
                                        setDeck(prev => ({ ...prev, volume: vol }));
                                        if (audioRef.current) {
                                            audioRef.current.volume = vol * (isLeft ? Math.max(0, 1 - crossfader * 2) : Math.max(0, crossfader * 2 - 1));
                                        }
                                    }}
                                    className="h-16 accent-green-500"
                                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Load track bar */}
                    <div className="h-8 border-t border-gray-800 flex items-center px-2 gap-2">
                        <button
                            onClick={() => {
                                if (selectedAudio) {
                                    setDeck(prev => ({
                                        ...defaultDeckState,
                                        audioFile: selectedAudio,
                                        volume: prev.volume
                                    }));
                                    if (audioRef.current) {
                                        audioRef.current.src = `file://${selectedAudio.path}`;
                                        audioRef.current.load();
                                    }
                                }
                            }}
                            disabled={!selectedAudio}
                            className={`flex-1 py-1 rounded text-xs font-medium truncate ${
                                selectedAudio ? `${bgAccent} ${bgAccentHover}` : 'bg-gray-800 text-gray-600'
                            }`}
                        >
                            {selectedAudio ? `Load: ${selectedAudio.name}` : 'Select track from library'}
                        </button>
                        <button
                            onClick={() => setDeck(prev => ({ ...defaultDeckState, volume: prev.volume }))}
                            className="p-1.5 bg-gray-800 hover:bg-red-600 rounded"
                            title="Eject"
                        >
                            <X size={12}/>
                        </button>
                    </div>

                    {/* Hidden audio element */}
                    <audio
                        ref={audioRef}
                        onTimeUpdate={(e) => {
                            const time = (e.target as HTMLAudioElement).currentTime;
                            setDeck(prev => ({ ...prev, currentTime: time }));
                            // Check loop
                            if (deck.loopActive && deck.loopOut !== null && time >= deck.loopOut && deck.loopIn !== null) {
                                (e.target as HTMLAudioElement).currentTime = deck.loopIn;
                            }
                        }}
                        onEnded={() => setDeck(prev => ({ ...prev, playing: false, currentTime: 0 }))}
                        onLoadedMetadata={async (e) => {
                            const audio = e.target as HTMLAudioElement;
                            if (deck.audioFile) {
                                // Set duration immediately
                                setDeck(prev => ({
                                    ...prev,
                                    audioFile: prev.audioFile ? { ...prev.audioFile, duration: audio.duration } : null
                                }));

                                // Run beat detection asynchronously
                                try {
                                    const { bpm, beats, key } = await detectBeats(deck.audioFile.path);
                                    setDeck(prev => ({
                                        ...prev,
                                        audioFile: prev.audioFile ? { ...prev.audioFile, bpm, key } : null,
                                        beatGrid: beats
                                    }));
                                } catch (err) {
                                    console.error('Beat detection failed:', err);
                                    // Fallback to estimated BPM
                                    const estimatedBpm = 120 + Math.floor(Math.random() * 20);
                                    setDeck(prev => ({
                                        ...prev,
                                        audioFile: prev.audioFile ? { ...prev.audioFile, bpm: estimatedBpm, key: 'Am' } : null
                                    }));
                                }
                            }
                        }}
                    />
                </div>
            );
        };

        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
                {/* Top bar with effects */}
                <div className="h-10 border-b border-gray-800 flex items-center px-4 gap-4 bg-gray-900/50">
                    <div className="flex items-center gap-2">
                        <Disc3 className="text-purple-400" size={18}/>
                        <span className="text-sm font-bold text-purple-400">DJ MIXER</span>
                    </div>
                    <div className="flex-1"/>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">MASTER</span>
                        <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={djMasterGain}
                            onChange={(e) => setDjMasterGain(parseFloat(e.target.value))}
                            className="w-24 h-1.5 accent-purple-500"
                        />
                        <span className="text-xs text-gray-400 w-8">{Math.round(djMasterGain * 100)}%</span>
                    </div>
                </div>

                {/* Decks */}
                <div className="flex-1 flex overflow-hidden">
                    {renderDeck(deckA, setDeckA, 'A', deckARef, true)}

                    {/* Center mixer */}
                    <div className="w-36 bg-gray-900 border-x border-gray-800 flex flex-col">
                        {/* VU Meters */}
                        <div className="h-32 p-2 border-b border-gray-800">
                            <div className="text-[9px] text-gray-500 text-center mb-1">LEVEL</div>
                            <div className="flex justify-center gap-3 h-full pb-2">
                                {/* Deck A meter */}
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckA.playing ? 60 + Math.random() * 30 : 0) * deckA.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckA.playing ? 55 + Math.random() * 35 : 0) * deckA.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                </div>
                                {/* Master */}
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, ((deckA.playing ? 60 : 0) + (deckB.playing ? 60 : 0)) / 2 * djMasterGain)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, ((deckA.playing ? 55 : 0) + (deckB.playing ? 55 : 0)) / 2 * djMasterGain)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                </div>
                                {/* Deck B meter */}
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckB.playing ? 58 + Math.random() * 32 : 0) * deckB.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full bg-gray-800 rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckB.playing ? 62 + Math.random() * 28 : 0) * deckB.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-between text-[8px] text-gray-600">
                                <span className="text-blue-400">A</span>
                                <span>M</span>
                                <span className="text-orange-400">B</span>
                            </div>
                        </div>

                        {/* Crossfader */}
                        <div className="flex-1 flex flex-col items-center justify-center p-3">
                            <div className="text-[9px] text-gray-500 mb-2">CROSSFADER</div>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={crossfader}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setCrossfader(val);
                                    // Apply crossfader curve based on selected type
                                    let volA = 1, volB = 1;
                                    if (crossfaderCurve === 'smooth') {
                                        volA = Math.cos(val * Math.PI / 2);
                                        volB = Math.sin(val * Math.PI / 2);
                                    } else if (crossfaderCurve === 'cut') {
                                        // Hard cut - 10% dead zone on each side
                                        volA = val < 0.1 ? 1 : val > 0.9 ? 0 : 1 - ((val - 0.1) / 0.8);
                                        volB = val > 0.9 ? 1 : val < 0.1 ? 0 : (val - 0.1) / 0.8;
                                    } else {
                                        // Linear
                                        volA = 1 - val;
                                        volB = val;
                                    }
                                    if (deckARef.current) deckARef.current.volume = deckA.volume * volA;
                                    if (deckBRef.current) deckBRef.current.volume = deckB.volume * volB;
                                }}
                                className="w-full accent-purple-500"
                            />
                            <div className="flex justify-between w-full text-[10px] mt-1">
                                <span className="text-blue-400 font-bold">A</span>
                                <span className="text-orange-400 font-bold">B</span>
                            </div>

                            {/* Effects with sliders */}
                            <div className="mt-3 w-full">
                                <div className="text-[9px] text-gray-500 text-center mb-1">MASTER FX</div>
                                <div className="space-y-1">
                                    {[
                                        { name: 'Echo', key: 'echo', color: 'accent-cyan-500' },
                                        { name: 'Reverb', key: 'reverb', color: 'accent-purple-500' },
                                        { name: 'Filter', key: 'filter', color: 'accent-yellow-500' },
                                        { name: 'Flanger', key: 'flanger', color: 'accent-pink-500' }
                                    ].map(fx => (
                                        <div key={fx.key} className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    setDeckAEffects(prev => ({
                                                        ...prev,
                                                        [fx.key]: prev[fx.key] > 0 ? 0 : 50
                                                    }));
                                                    setDeckBEffects(prev => ({
                                                        ...prev,
                                                        [fx.key]: prev[fx.key] > 0 ? 0 : 50
                                                    }));
                                                }}
                                                className={`w-5 h-4 text-[7px] font-bold rounded transition-colors ${
                                                    (deckAEffects[fx.key] || 0) > 0 || (deckBEffects[fx.key] || 0) > 0
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                                                }`}
                                            >
                                                {fx.name[0]}
                                            </button>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={(deckAEffects[fx.key] || 0 + deckBEffects[fx.key] || 0) / 2}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setDeckAEffects(prev => ({ ...prev, [fx.key]: val }));
                                                    setDeckBEffects(prev => ({ ...prev, [fx.key]: val }));
                                                }}
                                                className={`flex-1 h-1 ${fx.color}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Crossfader curve selector */}
                            <div className="mt-2 flex gap-1 w-full">
                                {(['linear', 'cut', 'smooth'] as const).map(curve => (
                                    <button
                                        key={curve}
                                        onClick={() => setCrossfaderCurve(curve)}
                                        className={`flex-1 py-0.5 text-[8px] rounded ${
                                            crossfaderCurve === curve ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'
                                        }`}
                                    >
                                        {curve}
                                    </button>
                                ))}
                            </div>

                            {/* Sync button */}
                            <button
                                onClick={() => {
                                    // Sync both decks to average BPM
                                    const bpmA = deckA.audioFile?.bpm || 120;
                                    const bpmB = deckB.audioFile?.bpm || 120;
                                    const avgBpm = (bpmA + bpmB) / 2;

                                    if (deckA.audioFile?.bpm) {
                                        const speedA = avgBpm / deckA.audioFile.bpm;
                                        setDeckA(prev => ({ ...prev, speed: speedA }));
                                        if (deckARef.current) deckARef.current.playbackRate = speedA;
                                    }
                                    if (deckB.audioFile?.bpm) {
                                        const speedB = avgBpm / deckB.audioFile.bpm;
                                        setDeckB(prev => ({ ...prev, speed: speedB }));
                                        if (deckBRef.current) deckBRef.current.playbackRate = speedB;
                                    }
                                }}
                                className="mt-3 w-full py-2 bg-purple-600 hover:bg-purple-700 rounded text-xs font-bold"
                            >
                                SYNC
                            </button>
                        </div>
                    </div>

                    {renderDeck(deckB, setDeckB, 'B', deckBRef, false)}
                </div>
            </div>
        );
    };

    // Load analysis when audio is selected (moved outside renderAnalysis to follow hooks rules)
    useEffect(() => {
        if (selectedAudio && selectedAudio.path && activeMode === 'analysis') {
            analyzeAudio(selectedAudio.path);
        }
    }, [selectedAudio?.path, activeMode, analyzeAudio]);

    // Render Analysis
    const renderAnalysis = () => {
        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Mode selector */}
                <div className="h-12 border-b theme-border flex items-center px-4 gap-2 bg-gray-800/50">
                    {(['waveform', 'spectrum', 'spectrogram'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setAnalysisMode(mode)}
                            className={`px-3 py-1.5 rounded text-sm capitalize ${
                                analysisMode === mode
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                    <div className="flex-1"/>
                    {selectedAudio && (
                        <button
                            onClick={() => analyzeAudio(selectedAudio.path)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1"
                        >
                            <RefreshCw size={14}/> Refresh
                        </button>
                    )}
                </div>

                {/* Visualization */}
                <div className="flex-1 p-4">
                    <div className="w-full h-full bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
                        {selectedAudio ? (
                            <div className="w-full h-full p-4 flex flex-col">
                                {analysisMode === 'waveform' && (
                                    <div className="flex-1 flex items-center">
                                        <div className="w-full h-48 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 500 100" preserveAspectRatio="none">
                                                {/* Center line */}
                                                <line x1="0" y1="50" x2="500" y2="50" stroke="#4B5563" strokeWidth="0.5"/>
                                                {/* Waveform */}
                                                <path
                                                    d={analysisWaveformData.length > 0
                                                        ? `M 0,50 ${analysisWaveformData.map((v, i) =>
                                                            `L ${(i / analysisWaveformData.length) * 500},${50 - v * 200}`
                                                        ).join(' ')}`
                                                        : 'M 0,50 L 500,50'
                                                    }
                                                    fill="none"
                                                    stroke="#8B5CF6"
                                                    strokeWidth="1"
                                                />
                                                {/* Mirror waveform */}
                                                <path
                                                    d={analysisWaveformData.length > 0
                                                        ? `M 0,50 ${analysisWaveformData.map((v, i) =>
                                                            `L ${(i / analysisWaveformData.length) * 500},${50 + v * 200}`
                                                        ).join(' ')}`
                                                        : 'M 0,50 L 500,50'
                                                    }
                                                    fill="none"
                                                    stroke="#8B5CF6"
                                                    strokeWidth="1"
                                                    opacity="0.5"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                                {analysisMode === 'spectrum' && (
                                    <div className="flex-1 flex items-end justify-center gap-1 pb-4">
                                        {(analysisFrequencyData ? Array.from(analysisFrequencyData).slice(0, 64) : Array(64).fill(0)).map((v, i) => (
                                            <div
                                                key={i}
                                                className="flex-1 max-w-4 bg-gradient-to-t from-purple-600 via-pink-500 to-orange-400 rounded-t transition-all duration-75"
                                                style={{ height: `${(v / 255) * 100}%`, minHeight: '2px' }}
                                            />
                                        ))}
                                    </div>
                                )}
                                {analysisMode === 'spectrogram' && (
                                    <div className="flex-1 overflow-hidden rounded">
                                        {/* Spectrogram visualization using canvas-like grid */}
                                        <div className="w-full h-full grid grid-rows-32 gap-px">
                                            {Array.from({ length: 32 }).map((_, rowIdx) => (
                                                <div key={rowIdx} className="flex gap-px">
                                                    {Array.from({ length: 100 }).map((_, colIdx) => {
                                                        const intensity = analysisWaveformData[Math.floor(colIdx * analysisWaveformData.length / 100)] || 0;
                                                        const freq = 1 - rowIdx / 32;
                                                        const value = Math.abs(intensity) * freq * 255;
                                                        return (
                                                            <div
                                                                key={colIdx}
                                                                className="flex-1"
                                                                style={{
                                                                    backgroundColor: `rgb(${value * 0.8}, ${value * 0.3}, ${value})`
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center">
                                <Activity size={64} className="mx-auto text-gray-600 mb-4"/>
                                <p className="text-gray-400">Select an audio file to analyze</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info panel */}
                {selectedAudio && (
                    <div className="h-32 border-t theme-border p-4 bg-gray-800/50">
                        <div className="grid grid-cols-5 gap-4">
                            <div>
                                <p className="text-xs text-gray-400">Duration</p>
                                <p className="text-lg font-mono">{formatTime(analysisAudioBuffer?.duration || selectedAudio.duration || 0)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Sample Rate</p>
                                <p className="text-lg font-mono">{analysisAudioBuffer ? `${(analysisAudioBuffer.sampleRate / 1000).toFixed(1)} kHz` : '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Channels</p>
                                <p className="text-lg font-mono">{analysisAudioBuffer?.numberOfChannels || '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">BPM (est.)</p>
                                <p className="text-lg font-mono">{selectedAudio.bpm || '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Key (est.)</p>
                                <p className="text-lg font-mono">{selectedAudio.key || '---'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Render Notation
    const renderNotation = () => {
        const pianoKeys = Array.from({ length: 88 }, (_, i) => i + 21); // A0 to C8
        const guitarStrings = ['E', 'B', 'G', 'D', 'A', 'E'];
        const measures = 16;
        const beatsPerMeasure = notationTimeSignature[0];
        const totalBeats = measures * beatsPerMeasure;

        // Piano Roll View
        const renderPianoRoll = () => (
            <div className="flex-1 flex overflow-hidden bg-gray-900">
                {/* Piano keys sidebar */}
                <div className="w-16 flex flex-col-reverse border-r border-gray-700 overflow-hidden">
                    {pianoKeys.slice(36, 72).map(note => {
                        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
                        return (
                            <div
                                key={note}
                                onClick={() => playNote(note)}
                                className={`h-4 flex items-center justify-end pr-1 text-[8px] cursor-pointer border-b border-gray-800 ${
                                    isBlack ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                                } hover:bg-purple-500`}
                            >
                                {note % 12 === 0 ? noteToName(note) : ''}
                            </div>
                        );
                    })}
                </div>

                {/* Grid area */}
                <div className="flex-1 overflow-auto">
                    <div className="relative" style={{ width: `${totalBeats * 40 * notationZoom}px`, minWidth: '100%' }}>
                        {/* Grid */}
                        {pianoKeys.slice(36, 72).reverse().map((note, rowIdx) => (
                            <div
                                key={note}
                                className={`h-4 flex border-b border-gray-800 ${rowIdx % 12 === 0 ? 'bg-gray-700/30' : ''}`}
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = (e.clientX - rect.left) / (40 * notationZoom);
                                    const beat = Math.floor(x * 4) / 4; // Snap to 16th note
                                    addPianoNote(note, beat, 0.25);
                                    playNote(note);
                                }}
                            >
                                {Array.from({ length: totalBeats }).map((_, beat) => (
                                    <div
                                        key={beat}
                                        className={`border-r ${beat % beatsPerMeasure === 0 ? 'border-gray-600' : 'border-gray-800'}`}
                                        style={{ width: `${40 * notationZoom}px` }}
                                    />
                                ))}
                            </div>
                        ))}

                        {/* Notes */}
                        {pianoNotes.map((note, idx) => {
                            const rowIdx = 71 - note.note; // Reverse for display
                            if (rowIdx < 0 || rowIdx >= 36) return null;
                            return (
                                <div
                                    key={idx}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedNotes(prev => {
                                            const next = new Set(prev);
                                            if (next.has(idx)) next.delete(idx);
                                            else next.add(idx);
                                            return next;
                                        });
                                    }}
                                    className={`absolute h-4 rounded cursor-pointer ${
                                        selectedNotes.has(idx) ? 'bg-yellow-500 ring-2 ring-white' : 'bg-purple-500'
                                    }`}
                                    style={{
                                        top: `${rowIdx * 16}px`,
                                        left: `${note.start * 40 * notationZoom}px`,
                                        width: `${Math.max(note.duration * 40 * notationZoom, 8)}px`,
                                        opacity: note.velocity
                                    }}
                                />
                            );
                        })}

                        {/* Playhead */}
                        <div
                            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
                            style={{ left: `${notationPlayhead * 40 * notationZoom}px` }}
                        />
                    </div>
                </div>
            </div>
        );

        // VexFlow Sheet Music View
        const renderSheetMusic = () => {
            // MIDI note to VexFlow pitch (e.g., 60 -> "C/4", 61 -> "C#/4")
            const midiToVexPitch = (midi: number): string => {
                const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = Math.floor(midi / 12) - 1;
                const name = names[midi % 12];
                return `${name}/${octave}`;
            };

            // Quantize beat duration to nearest VexFlow duration string
            const quantizeDuration = (dur: number): string => {
                if (dur >= 3.5) return 'w';       // whole
                if (dur >= 1.75) return 'h';      // half
                if (dur >= 0.875) return 'q';     // quarter
                if (dur >= 0.4375) return '8';    // eighth
                if (dur >= 0.21875) return '16';  // sixteenth
                return '32';                       // thirty-second
            };

            // Get beat value for VexFlow duration
            const durationBeats = (d: string): number => {
                const map: Record<string, number> = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25, '32': 0.125 };
                return map[d] || 1;
            };

            // Group pianoNotes into measures
            const groupedMeasures: Array<Array<{ note: number; start: number; duration: number; velocity: number }>> = [];
            for (let m = 0; m < measures; m++) {
                const measureStart = m * beatsPerMeasure;
                const measureEnd = measureStart + beatsPerMeasure;
                const notesInMeasure = pianoNotes.filter(n => n.start >= measureStart && n.start < measureEnd);
                groupedMeasures.push(notesInMeasure);
            }

            // Render VexFlow via ref callback - called when the div mounts
            const renderVexFlow = (container: HTMLDivElement | null) => {
                if (!container) return;
                container.innerHTML = '';
                staveLayoutRef.current = [];

                const measuresPerLine = 4;
                const staveWidth = 250;
                const staveStartX = 10;
                const lineHeight = notationClef === 'grand' ? 200 : 120;
                const totalLines = Math.ceil(measures / measuresPerLine);
                const totalWidth = staveStartX + measuresPerLine * staveWidth + 40;
                const totalHeight = totalLines * lineHeight + 40;

                const renderer = new VFRenderer(container, VFRenderer.Backends.SVG);
                renderer.resize(totalWidth, totalHeight);
                const context = renderer.getContext();
                context.setFont('Arial', 10);

                for (let line = 0; line < totalLines; line++) {
                    const y = line * lineHeight + 20;

                    for (let mInLine = 0; mInLine < measuresPerLine; mInLine++) {
                        const mIdx = line * measuresPerLine + mInLine;
                        if (mIdx >= measures) break;

                        const x = staveStartX + mInLine * staveWidth;
                        const isFirstInLine = mInLine === 0;
                        const isFirstMeasure = mIdx === 0;

                        // Create treble stave
                        const trebleStave = new Stave(x, y, staveWidth);
                        if (isFirstInLine) trebleStave.addClef('treble');
                        if (isFirstMeasure) {
                            trebleStave.addTimeSignature(`${notationTimeSignature[0]}/${notationTimeSignature[1]}`);
                            if (notationKeySignature !== 'C') {
                                trebleStave.addKeySignature(notationKeySignature);
                            }
                        }
                        trebleStave.setContext(context).draw();

                        // Create bass stave for grand staff
                        let bassStave: Stave | null = null;
                        if (notationClef === 'grand') {
                            bassStave = new Stave(x, y + 80, staveWidth);
                            if (isFirstInLine) bassStave.addClef('bass');
                            if (isFirstMeasure) {
                                bassStave.addTimeSignature(`${notationTimeSignature[0]}/${notationTimeSignature[1]}`);
                                if (notationKeySignature !== 'C') {
                                    bassStave.addKeySignature(notationKeySignature);
                                }
                            }
                            bassStave.setContext(context).draw();

                            // Connect staves
                            if (isFirstInLine) {
                                new StaveConnector(trebleStave, bassStave).setType('single').setContext(context).draw();
                                new StaveConnector(trebleStave, bassStave).setType('brace').setContext(context).draw();
                            }
                        }

                        // Store stave layout for double-click note placement
                        try {
                            staveLayoutRef.current.push({
                                x, y, width: staveWidth, measureIdx: mIdx,
                                clef: notationClef === 'bass' ? 'bass' : 'treble',
                                topLineY: trebleStave.getYForLine(0),
                                bottomLineY: trebleStave.getYForLine(4),
                            });
                            if (bassStave) {
                                staveLayoutRef.current.push({
                                    x, y: y + 80, width: staveWidth, measureIdx: mIdx,
                                    clef: 'bass',
                                    topLineY: bassStave.getYForLine(0),
                                    bottomLineY: bassStave.getYForLine(4),
                                });
                            }
                        } catch {}

                        // Get notes for this measure
                        const measureNotes = groupedMeasures[mIdx] || [];

                        // Build VexFlow notes for treble clef (MIDI >= 60)
                        const trebleNotes: StaveNote[] = [];
                        const bassNotes: StaveNote[] = [];

                        if (measureNotes.length === 0) {
                            // Add a whole rest
                            trebleNotes.push(new StaveNote({
                                clef: 'treble',
                                keys: ['B/4'],
                                duration: 'wr',  // whole rest
                            }));
                            if (notationClef === 'grand') {
                                bassNotes.push(new StaveNote({
                                    clef: 'bass',
                                    keys: ['D/3'],
                                    duration: 'wr',
                                }));
                            }
                        } else {
                            // Sort notes by start time
                            const sorted = [...measureNotes].sort((a, b) => a.start - b.start);
                            const measureStart = mIdx * beatsPerMeasure;
                            let trebleBeatsFilled = 0;
                            let bassBeatsFilled = 0;

                            for (const n of sorted) {
                                const vexDuration = quantizeDuration(n.duration);
                                const beats = durationBeats(vexDuration);
                                const pitch = midiToVexPitch(n.note);
                                const isBassNote = n.note < 60 && notationClef === 'grand';

                                try {
                                    const staveNote = new StaveNote({
                                        clef: isBassNote ? 'bass' : 'treble',
                                        keys: [pitch],
                                        duration: vexDuration,
                                    });

                                    // Add accidentals
                                    const noteName = pitch.split('/')[0];
                                    if (noteName.includes('#')) {
                                        staveNote.addModifier(new Accidental('#'));
                                    } else if (noteName.includes('b')) {
                                        staveNote.addModifier(new Accidental('b'));
                                    }

                                    if (isBassNote) {
                                        bassNotes.push(staveNote);
                                        bassBeatsFilled += beats;
                                    } else {
                                        trebleNotes.push(staveNote);
                                        trebleBeatsFilled += beats;
                                    }
                                } catch (e) {
                                    // Skip invalid notes
                                }
                            }

                            // Fill remaining beats with rests
                            const fillRests = (notes: StaveNote[], beatsFilled: number, clef: string) => {
                                let remaining = beatsPerMeasure - beatsFilled;
                                while (remaining > 0) {
                                    let restDur = 'qr';
                                    let restBeats = 1;
                                    if (remaining >= 4) { restDur = 'wr'; restBeats = 4; }
                                    else if (remaining >= 2) { restDur = 'hr'; restBeats = 2; }
                                    else if (remaining >= 1) { restDur = 'qr'; restBeats = 1; }
                                    else if (remaining >= 0.5) { restDur = '8r'; restBeats = 0.5; }
                                    else { restDur = '16r'; restBeats = 0.25; }
                                    try {
                                        notes.push(new StaveNote({
                                            clef: clef,
                                            keys: [clef === 'bass' ? 'D/3' : 'B/4'],
                                            duration: restDur,
                                        }));
                                    } catch (e) { break; }
                                    remaining -= restBeats;
                                }
                            };

                            if (trebleNotes.length === 0) {
                                trebleNotes.push(new StaveNote({ clef: 'treble', keys: ['B/4'], duration: 'wr' }));
                            } else {
                                fillRests(trebleNotes, trebleBeatsFilled, 'treble');
                            }
                            if (notationClef === 'grand') {
                                if (bassNotes.length === 0) {
                                    bassNotes.push(new StaveNote({ clef: 'bass', keys: ['D/3'], duration: 'wr' }));
                                } else {
                                    fillRests(bassNotes, bassBeatsFilled, 'bass');
                                }
                            }
                        }

                        // Create voice and format
                        try {
                            const trebleVoice = new Voice({ numBeats: beatsPerMeasure, beatValue: notationTimeSignature[1] })
                                .setMode(Voice.Mode.SOFT);
                            trebleVoice.addTickables(trebleNotes);

                            // Auto-beam eighth notes and shorter
                            const trebleBeamable = trebleNotes.filter(n => {
                                const dur = n.getDuration();
                                return !dur.includes('r') && (dur === '8' || dur === '16' || dur === '32');
                            });
                            const trebleBeams = trebleBeamable.length >= 2 ? Beam.generateBeams(trebleBeamable) : [];

                            if (notationClef === 'grand' && bassStave) {
                                const bassVoice = new Voice({ numBeats: beatsPerMeasure, beatValue: notationTimeSignature[1] })
                                    .setMode(Voice.Mode.SOFT);
                                bassVoice.addTickables(bassNotes);

                                new Formatter().joinVoices([trebleVoice]).joinVoices([bassVoice])
                                    .format([trebleVoice, bassVoice], staveWidth - (isFirstInLine ? 80 : 20));

                                trebleVoice.draw(context, trebleStave);
                                bassVoice.draw(context, bassStave);

                                const bassBeamable = bassNotes.filter(n => {
                                    const dur = n.getDuration();
                                    return !dur.includes('r') && (dur === '8' || dur === '16' || dur === '32');
                                });
                                if (bassBeamable.length >= 2) {
                                    Beam.generateBeams(bassBeamable).forEach(b => b.setContext(context).draw());
                                }
                            } else {
                                new Formatter().joinVoices([trebleVoice])
                                    .format([trebleVoice], staveWidth - (isFirstInLine ? 60 : 20));
                                trebleVoice.draw(context, trebleStave);
                            }

                            trebleBeams.forEach(b => b.setContext(context).draw());
                        } catch (e) {
                            // Formatting error - skip this measure silently
                        }
                    }
                }
            };

            // Note names for the keyboard input strip
            const sheetNoteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            const sheetNoteNamesFull = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

            const addSheetNote = (noteName: string, octave: number) => {
                const noteIdx = sheetNoteNamesFull.indexOf(noteName);
                if (noteIdx === -1) return;
                const midi = (octave + 1) * 12 + noteIdx;
                addPianoNote(midi, inputCursor, inputNoteDuration, 0.8);
                playNote(midi);
                setInputCursor(prev => prev + inputNoteDuration);
            };

            const addSheetRest = () => {
                // Just advance the cursor without adding a note
                setInputCursor(prev => prev + inputNoteDuration);
            };

            const durationOptions = [
                { value: 4, label: '𝅝', title: 'Whole' },
                { value: 2, label: '𝅗𝅥', title: 'Half' },
                { value: 1, label: '♩', title: 'Quarter' },
                { value: 0.5, label: '♪', title: 'Eighth' },
                { value: 0.25, label: '𝅘𝅥𝅯', title: '16th' },
            ];

            return (
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                    {/* Sheet music controls */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
                        <span className="text-xs text-gray-500 font-medium">Key:</span>
                        <select
                            value={notationKeySignature}
                            onChange={(e) => setNotationKeySignature(e.target.value)}
                            className="px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700"
                        >
                            {['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Cb', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].map(k => (
                                <option key={k} value={k}>{k} major</option>
                            ))}
                        </select>
                        <span className="text-xs text-gray-500 font-medium ml-2">Clef:</span>
                        <select
                            value={notationClef}
                            onChange={(e) => setNotationClef(e.target.value as 'treble' | 'bass' | 'grand')}
                            className="px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700"
                        >
                            <option value="treble">Treble</option>
                            <option value="bass">Bass</option>
                            <option value="grand">Grand Staff</option>
                        </select>

                        <div className="w-px h-5 bg-gray-300 mx-1"/>

                        {/* Note duration selector */}
                        <span className="text-xs text-gray-500 font-medium">Duration:</span>
                        <div className="flex gap-0.5">
                            {durationOptions.map(d => (
                                <button
                                    key={d.value}
                                    onClick={() => setInputNoteDuration(d.value)}
                                    title={d.title}
                                    className={`w-8 h-8 flex items-center justify-center rounded text-lg border ${
                                        inputNoteDuration === d.value
                                            ? 'bg-purple-600 text-white border-purple-700'
                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                    }`}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-5 bg-gray-300 mx-1"/>

                        {/* Octave selector */}
                        <span className="text-xs text-gray-500 font-medium">Oct:</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setInputOctave(o => Math.max(1, o - 1))}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs"
                            >-</button>
                            <span className="text-sm font-medium text-gray-700 w-4 text-center">{inputOctave}</span>
                            <button
                                onClick={() => setInputOctave(o => Math.min(7, o + 1))}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs"
                            >+</button>
                        </div>

                        <div className="w-px h-5 bg-gray-300 mx-1"/>

                        {/* Cursor position */}
                        <span className="text-xs text-gray-500">Beat: {inputCursor.toFixed(1)}</span>
                        <button
                            onClick={() => setInputCursor(0)}
                            className="text-xs text-purple-600 hover:text-purple-800 underline"
                        >Reset</button>
                    </div>

                    {/* Note input keyboard */}
                    <div className="flex items-center gap-1 px-4 py-2 bg-gray-100 border-b border-gray-200 shrink-0">
                        <span className="text-xs text-gray-500 mr-1">Click to add:</span>
                        {sheetNoteNames.map(name => {
                            const isBlack = name.includes('#');
                            return (
                                <React.Fragment key={name}>
                                    <button
                                        onClick={() => addSheetNote(name, inputOctave)}
                                        className="h-10 w-10 rounded font-bold text-sm border border-gray-400 bg-white text-gray-800 hover:bg-purple-100 hover:border-purple-400 active:bg-purple-200 transition-colors"
                                    >
                                        {name}{inputOctave}
                                    </button>
                                    {/* Add sharp button between notes that have sharps (no sharp between E-F, B-C) */}
                                    {name !== 'E' && name !== 'B' && (
                                        <button
                                            onClick={() => addSheetNote(name + '#', inputOctave)}
                                            className="h-8 w-7 rounded text-xs font-bold border border-gray-500 bg-gray-800 text-white hover:bg-purple-700 active:bg-purple-800 transition-colors -mx-0.5"
                                        >
                                            {name}#
                                        </button>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        <div className="w-px h-8 bg-gray-300 mx-2"/>
                        <button
                            onClick={addSheetRest}
                            className="h-10 px-3 rounded text-sm border border-gray-400 bg-white text-gray-600 hover:bg-yellow-50 hover:border-yellow-400 active:bg-yellow-100 transition-colors"
                            title="Add rest"
                        >
                            Rest
                        </button>
                        <button
                            onClick={() => {
                                if (pianoNotes.length > 0) {
                                    const last = pianoNotes[pianoNotes.length - 1];
                                    setPianoNotes(prev => prev.slice(0, -1));
                                    setInputCursor(last.start);
                                }
                            }}
                            className="h-10 px-3 rounded text-sm border border-gray-400 bg-white text-gray-600 hover:bg-red-50 hover:border-red-400 active:bg-red-100 transition-colors"
                            title="Undo last note"
                        >
                            <Undo size={14}/>
                        </button>
                    </div>

                    {/* VexFlow score display */}
                    <div className="flex-1 overflow-auto p-6">
                        <div
                            key={`vf-${pianoNotes.length}-${notationKeySignature}-${notationClef}-${notationTimeSignature.join('-')}`}
                            ref={renderVexFlow}
                            style={{ transform: `scale(${notationZoom})`, transformOrigin: 'top left' }}
                        />
                    </div>
                </div>
            );
        };

        // Guitar Tab View
        const renderGuitarTab = () => (
            <div className="flex-1 overflow-auto bg-gray-100 p-8">
                <div className="bg-white rounded-lg p-6 shadow">
                    <div className="flex gap-2 mb-4">
                        <span className="text-sm font-medium">TAB</span>
                        <span className="text-xs text-gray-400">Standard Tuning (EADGBE)</span>
                    </div>

                    {/* Tab staff */}
                    <div className="relative font-mono text-sm">
                        {guitarStrings.map((stringName, stringIdx) => (
                            <div key={stringIdx} className="flex items-center h-6">
                                <span className="w-6 text-gray-600 font-bold">{stringName}</span>
                                <div className="flex-1 border-b border-gray-400 relative flex">
                                    {Array.from({ length: totalBeats }).map((_, beat) => (
                                        <div
                                            key={beat}
                                            className={`w-8 text-center border-r ${beat % beatsPerMeasure === 0 ? 'border-gray-500' : 'border-gray-300'}`}
                                            onClick={() => {
                                                // Add a tab note
                                                setTabNotes(prev => [...prev, { string: stringIdx, fret: 0, start: beat, duration: 0.5 }]);
                                            }}
                                        >
                                            {tabNotes
                                                .filter(n => n.string === stringIdx && Math.floor(n.start) === beat)
                                                .map((n, i) => (
                                                    <span key={i} className="text-purple-600 font-bold">{n.fret}</span>
                                                ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Fretboard for input */}
                    <div className="mt-8 border-t pt-4">
                        <h4 className="text-sm font-medium mb-2">Click fretboard to add notes:</h4>
                        <div className="grid grid-cols-12 gap-px bg-amber-900 p-2 rounded">
                            {guitarStrings.map((_, stringIdx) => (
                                <React.Fragment key={stringIdx}>
                                    {Array.from({ length: 12 }).map((_, fret) => (
                                        <div
                                            key={fret}
                                            onClick={() => {
                                                setTabNotes(prev => [...prev, {
                                                    string: stringIdx,
                                                    fret,
                                                    start: notationPlayhead,
                                                    duration: 0.5
                                                }]);
                                            }}
                                            className="h-6 bg-amber-100 border-r border-gray-400 flex items-center justify-center text-xs cursor-pointer hover:bg-purple-200"
                                        >
                                            {fret}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );

        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="h-12 border-b theme-border flex items-center px-4 gap-2 bg-gray-800/50">
                    {/* View modes */}
                    <button
                        onClick={() => setNotationView('piano')}
                        className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${notationView === 'piano' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <Piano size={14}/> Piano Roll
                    </button>
                    <button
                        onClick={() => setNotationView('sheet')}
                        className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${notationView === 'sheet' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <Music2 size={14}/> Sheet Music
                    </button>
                    <button
                        onClick={() => setNotationView('tab')}
                        className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${notationView === 'tab' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <Guitar size={14}/> Guitar Tab
                    </button>
                    <div className="w-px h-6 bg-gray-600 mx-2"/>

                    {/* Playback controls */}
                    <button
                        onClick={() => setNotationPlayhead(0)}
                        className="p-2 hover:bg-gray-700 rounded"
                    >
                        <SkipBack size={16}/>
                    </button>
                    <button
                        onClick={playNotation}
                        disabled={pianoNotes.length === 0}
                        className={`p-2 rounded ${pianoNotes.length > 0 ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 opacity-50'}`}
                    >
                        {isNotationPlaying ? <Pause size={16}/> : <Play size={16}/>}
                    </button>

                    <div className="w-px h-6 bg-gray-600 mx-2"/>

                    {/* BPM */}
                    <span className="text-xs text-gray-400">BPM:</span>
                    <input
                        type="number"
                        value={notationBpm}
                        onChange={(e) => setNotationBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
                        className="w-16 px-2 py-1 bg-gray-700 rounded text-sm"
                    />

                    {/* Time signature */}
                    <span className="text-xs text-gray-400 ml-2">Time:</span>
                    <select
                        value={`${notationTimeSignature[0]}/${notationTimeSignature[1]}`}
                        onChange={(e) => {
                            const [n, d] = e.target.value.split('/').map(Number);
                            setNotationTimeSignature([n, d]);
                        }}
                        className="px-2 py-1 bg-gray-700 rounded text-sm"
                    >
                        <option value="4/4">4/4</option>
                        <option value="3/4">3/4</option>
                        <option value="6/8">6/8</option>
                        <option value="2/4">2/4</option>
                    </select>

                    <div className="flex-1"/>

                    {/* Delete selected */}
                    <button
                        onClick={deleteSelectedNotes}
                        disabled={selectedNotes.size === 0}
                        className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${selectedNotes.size > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 opacity-50'}`}
                    >
                        <Trash2 size={14}/> Delete ({selectedNotes.size})
                    </button>

                    {/* Clear all */}
                    <button
                        onClick={() => { setPianoNotes([]); setTabNotes([]); setSelectedNotes(new Set()); }}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                        Clear All
                    </button>
                </div>

                {/* Content area */}
                {notationView === 'piano' && renderPianoRoll()}
                {notationView === 'sheet' && renderSheetMusic()}
                {notationView === 'tab' && renderGuitarTab()}
            </div>
        );
    };

    // Dataset management functions
    const createAudioDataset = () => {
        if (!newDatasetName.trim()) return;
        const newDataset: AudioDataset = {
            id: `audio_dataset_${Date.now()}`,
            name: newDatasetName.trim(),
            examples: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: []
        };
        setAudioDatasets(prev => [...prev, newDataset]);
        setSelectedDatasetId(newDataset.id);
        setNewDatasetName('');
        setShowCreateDataset(false);
    };

    const deleteAudioDataset = (id: string) => {
        setAudioDatasets(prev => prev.filter(d => d.id !== id));
        if (selectedDatasetId === id) setSelectedDatasetId(null);
    };

    const addGeneratedToDataset = (datasetId: string) => {
        const dataset = audioDatasets.find(d => d.id === datasetId);
        if (!dataset) return;

        const selected = generatedAudio.filter(a => selectedGeneratedAudio.has(a.id));
        const newExamples: AudioDatasetExample[] = selected.map(audio => ({
            id: `audio_ex_${Date.now()}_${audio.id}`,
            prompt: audio.name,
            audioPath: audio.path,
            duration: audio.duration || 0,
            model: genModel,
            qualityScore: 4,
            tags: [],
            createdAt: new Date().toISOString()
        }));

        setAudioDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? { ...d, examples: [...d.examples, ...newExamples], updatedAt: new Date().toISOString() }
                : d
        ));

        setSelectedGeneratedAudio(new Set());
        setSelectionMode(false);
        setShowAddToDataset(false);
    };

    const updateAudioExampleQuality = (datasetId: string, exampleId: string, score: number) => {
        setAudioDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? {
                    ...d,
                    examples: d.examples.map(ex =>
                        ex.id === exampleId ? { ...ex, qualityScore: score } : ex
                    ),
                    updatedAt: new Date().toISOString()
                }
                : d
        ));
    };

    const removeAudioExample = (datasetId: string, exampleId: string) => {
        setAudioDatasets(prev => prev.map(d =>
            d.id === datasetId
                ? { ...d, examples: d.examples.filter(ex => ex.id !== exampleId), updatedAt: new Date().toISOString() }
                : d
        ));
    };

    const exportAudioDataset = (dataset: AudioDataset) => {
        let content = '';
        let filename = '';

        if (datasetExportFormat === 'jsonl') {
            content = dataset.examples.map(ex => JSON.stringify({
                prompt: ex.prompt,
                audio_path: ex.audioPath,
                duration: ex.duration,
                model: ex.model,
                quality: ex.qualityScore,
                tags: ex.tags
            })).join('\n');
            filename = `${dataset.name.replace(/\s+/g, '_')}_audio.jsonl`;
        } else if (datasetExportFormat === 'csv') {
            const headers = 'prompt,audio_path,duration,model,quality,tags';
            const rows = dataset.examples.map(ex =>
                `"${ex.prompt.replace(/"/g, '""')}","${ex.audioPath || ''}",${ex.duration},"${ex.model}",${ex.qualityScore},"${ex.tags.join(';')}"`
            );
            content = [headers, ...rows].join('\n');
            filename = `${dataset.name.replace(/\s+/g, '_')}_audio.csv`;
        } else {
            content = JSON.stringify(dataset, null, 2);
            filename = `${dataset.name.replace(/\s+/g, '_')}_audio_full.json`;
        }

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleGeneratedSelection = (id: string) => {
        setSelectedGeneratedAudio(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Render Datasets
    const renderDatasets = () => (
        <div className="flex h-full overflow-hidden">
            {/* Dataset List Sidebar */}
            <div className="w-64 border-r theme-border flex flex-col theme-bg-secondary">
                <div className="p-3 border-b theme-border">
                    <button
                        onClick={() => setShowCreateDataset(true)}
                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm flex items-center justify-center gap-2"
                    >
                        <Plus size={14} /> New Dataset
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {audioDatasets.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            <Package size={32} className="mx-auto mb-2 opacity-50"/>
                            <p>No datasets yet</p>
                            <p className="text-xs mt-1">Create one to start collecting training data</p>
                        </div>
                    ) : (
                        audioDatasets.map(dataset => (
                            <div
                                key={dataset.id}
                                onClick={() => setSelectedDatasetId(dataset.id)}
                                className={`p-3 rounded cursor-pointer ${
                                    selectedDatasetId === dataset.id
                                        ? 'bg-purple-600/20 border border-purple-500/50'
                                        : 'hover:bg-gray-700/50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{dataset.name}</span>
                                    <span className="text-xs text-gray-500">{dataset.examples.length}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {new Date(dataset.updatedAt).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Dataset Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedDataset ? (
                    <>
                        {/* Dataset Header */}
                        <div className="p-4 border-b theme-border flex items-center justify-between bg-gray-800/50">
                            <div>
                                <h4 className="font-semibold">{selectedDataset.name}</h4>
                                <p className="text-xs text-gray-500">
                                    {selectedDataset.examples.length} audio samples
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={datasetExportFormat}
                                    onChange={(e) => setDatasetExportFormat(e.target.value as any)}
                                    className="px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded"
                                >
                                    <option value="jsonl">JSONL</option>
                                    <option value="csv">CSV</option>
                                    <option value="json">Full JSON</option>
                                </select>
                                <button
                                    onClick={() => exportAudioDataset(selectedDataset)}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs flex items-center gap-1"
                                >
                                    <Download size={12} /> Export
                                </button>
                                <button
                                    onClick={() => deleteAudioDataset(selectedDataset.id)}
                                    className="px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>

                        {/* Examples List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {selectedDataset.examples.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Layers size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No samples in this dataset</p>
                                    <p className="text-xs mt-1">Generate audio and add it here</p>
                                </div>
                            ) : (
                                selectedDataset.examples.map(ex => (
                                    <div key={ex.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                                        <div className="flex items-start gap-4">
                                            <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-pink-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <Music size={24} className="text-purple-400"/>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{ex.prompt}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                    <span>{formatTime(ex.duration)}</span>
                                                    <span className="px-1.5 py-0.5 bg-gray-700 rounded">{ex.model}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Quality:</span>
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button
                                                        key={score}
                                                        onClick={() => updateAudioExampleQuality(selectedDataset.id, ex.id, score)}
                                                        className={`p-0.5 ${ex.qualityScore >= score ? 'text-purple-400' : 'text-gray-600'}`}
                                                    >
                                                        <Star size={14} fill={ex.qualityScore >= score ? 'currentColor' : 'none'} />
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button className="text-purple-400 hover:text-purple-300">
                                                    <Play size={14} />
                                                </button>
                                                <button
                                                    onClick={() => removeAudioExample(selectedDataset.id, ex.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Select a dataset or create a new one</p>
                            <p className="text-xs mt-2">Use the Generate tab to create audio, then add it to datasets</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Dataset Modal */}
            {showCreateDataset && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowCreateDataset(false)}>
                    <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                        <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Package className="text-purple-400" size={18} />
                            Create Audio Dataset
                        </h4>
                        <input
                            type="text"
                            value={newDatasetName}
                            onChange={(e) => setNewDatasetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createAudioDataset()}
                            placeholder="Dataset name..."
                            className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-purple-500 focus:outline-none mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateDataset(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createAudioDataset}
                                disabled={!newDatasetName.trim()}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
                {renderSidebar()}
                <main className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Mode Selector - inline bar, not absolute overlay */}
                    <div className="flex items-center h-10 px-2 bg-gray-900/80 border-b border-gray-700 shrink-0">
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/90 hover:bg-gray-700 rounded-lg border border-gray-600 text-sm backdrop-blur-sm">
                                <CurrentModeIcon size={16} className="text-purple-400"/>
                                <span className="font-medium">{currentMode_obj.name}</span>
                                <ChevronRight size={14} className="text-gray-500 rotate-90"/>
                            </button>
                            <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-600 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                <div className="py-1">
                                    {['browse', 'create', 'edit', 'analyze', 'train'].map(group => (
                                        <React.Fragment key={group}>
                                            <div className="px-3 py-1 text-xs text-gray-500 uppercase">{group}</div>
                                            {SCHERZO_MODES.filter(m => m.group === group).map(mode => {
                                                const ModeIcon = mode.icon;
                                                return (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setActiveMode(mode.id)}
                                                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-gray-700 ${
                                                            activeMode === mode.id ? 'text-purple-400 bg-purple-600/20' : 'text-gray-300'
                                                        }`}
                                                    >
                                                        <ModeIcon size={14}/>{mode.name}
                                                    </button>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {activeMode === 'library' && renderLibrary()}
                    {activeMode === 'generator' && renderGenerator()}
                    {activeMode === 'editor' && renderEditor()}
                    {activeMode === 'dj' && renderDJMixer()}
                    {activeMode === 'analysis' && renderAnalysis()}
                    {activeMode === 'notation' && renderNotation()}
                    {activeMode === 'datasets' && renderDatasets()}

                    {/* Visualizer Overlay */}
                    {visualizerActive && (
                        <div className="absolute inset-0 bg-black/95 z-50 flex flex-col">
                            {/* Controls */}
                            <div className="flex items-center justify-between p-4 bg-black/50">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-medium text-purple-400">Visualizer</span>
                                    <div className="flex gap-1">
                                        {(['bars', 'wave', 'circle', 'particles'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => setVisualizerMode(mode)}
                                                className={`px-3 py-1 text-xs rounded ${
                                                    visualizerMode === mode ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'
                                                }`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-1">
                                        {(['rainbow', 'purple', 'blue', 'green'] as const).map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setVisualizerColor(color)}
                                                className={`w-6 h-6 rounded ${
                                                    visualizerColor === color ? 'ring-2 ring-white' : ''
                                                }`}
                                                style={{
                                                    background: color === 'rainbow'
                                                        ? 'linear-gradient(90deg, red, orange, yellow, green, blue, purple)'
                                                        : color === 'purple' ? '#9333ea'
                                                        : color === 'blue' ? '#3b82f6'
                                                        : '#22c55e'
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setVisualizerActive(false)}
                                    className="p-2 hover:bg-gray-800 rounded"
                                >
                                    <X size={20}/>
                                </button>
                            </div>
                            {/* Canvas */}
                            <div className="flex-1 relative">
                                <canvas
                                    ref={visualizerCanvasRef}
                                    className="absolute inset-0 w-full h-full"
                                    width={1200}
                                    height={600}
                                />
                            </div>
                            {/* Now playing info */}
                            {selectedAudio && (
                                <div className="p-4 bg-black/50 flex items-center gap-4">
                                    <button
                                        onClick={() => {
                                            if (audioRef.current) {
                                                if (isPlaying) audioRef.current.pause();
                                                else audioRef.current.play();
                                                setIsPlaying(!isPlaying);
                                            }
                                        }}
                                        className="p-3 bg-purple-600 hover:bg-purple-700 rounded-full"
                                    >
                                        {isPlaying ? <Pause size={24}/> : <Play size={24}/>}
                                    </button>
                                    <div className="flex-1">
                                        <div className="text-lg font-medium">{selectedAudio.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm text-gray-400">{formatTime(currentTime)}</span>
                                            <div className="flex-1 h-1 bg-gray-700 rounded overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500"
                                                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <span className="text-sm text-gray-400">{formatTime(duration)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Scherzo;
