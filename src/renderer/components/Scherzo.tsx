import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAiEnabled } from './AiFeatureContext';
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
import { demoScores, DemoScore } from './scherzoLibrary';

interface ScherzoProps {
    currentPath?: string;
    onClose?: () => void;
}

interface AudioFile {
    id: string;
    name: string;
    path: string;
    duration?: number;
    waveform?: number[];
    bpm?: number;
    key?: string;
}

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

interface AudioTrack {
    id: string;
    name: string;
    clips: AudioClip[];
    volume: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    color: number;
    height: number;
}

interface AudioClip {
    id: string;
    audioId: string;
    startTime: number;
    duration: number;
    offset: number;
    name: string;
    gain: number;
    fadeIn: number;
    fadeOut: number;
    color?: number;
}

interface TimelineMarker {
    id: string;
    time: number;
    name: string;
    color: string;
}

const GUITAR_TUNING = [64, 59, 55, 50, 45, 40];

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

const staffPositionToMidi = (pos: number, clef: 'treble' | 'bass'): number => {
    const diatonic = [0, 2, 4, 5, 7, 9, 11];

    const refIdx = clef === 'bass' ? 5 : 3;
    const refOctave = clef === 'bass' ? 3 : 5;

    let targetIdx = refIdx - pos;
    let targetOctave = refOctave;
    while (targetIdx < 0) { targetIdx += 7; targetOctave--; }
    while (targetIdx >= 7) { targetIdx -= 7; targetOctave++; }

    return (targetOctave + 1) * 12 + diatonic[targetIdx];
};

interface DJDeck {
    audioFile: AudioFile | null;
    playing: boolean;
    currentTime: number;
    volume: number;
    speed: number;
    eq: { low: number; mid: number; high: number };
    eqKill: { low: boolean; mid: boolean; high: boolean };
    hotCues: (number | null)[];
    loopIn: number | null;
    loopOut: number | null;
    loopActive: boolean;
    filter: number;
    effects: { echo: number; flanger: number; reverb: number; roll: number };
    activeEffect: string | null;

    beatGrid: number[];
    beatGridOffset: number;
    jogOffset: number;
    keyLock: boolean;
    slip: boolean;
    slipPosition: number;
}

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
    const aiEnabled = useAiEnabled();

    const [activeMode, _setActiveMode] = useState(() => localStorage.getItem('scherzo_activeMode') || 'library');
    const setActiveMode = useCallback((mode: string) => {
        _setActiveMode(mode);
        localStorage.setItem('scherzo_activeMode', mode);
    }, []);

    const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
    const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [audioSource, setAudioSource] = useState(currentPath || '');

    useEffect(() => {
        if (currentPath && currentPath !== audioSource) {
            setAudioSource(currentPath);
        }
    }, [currentPath]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [genPrompt, setGenPrompt] = useState('');
    const [genModel, setGenModel] = useState('');
    const [generating, setGenerating] = useState(false);
    const [genDuration, setGenDuration] = useState(30);
    const [generatedAudio, setGeneratedAudio] = useState<AudioFile[]>([]);

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

    const [snapToGrid, setSnapToGrid] = useState(true);
    const [gridSize, setGridSize] = useState<0.25 | 0.5 | 1 | 2 | 4>(1);
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

    const [markers, setMarkers] = useState<TimelineMarker[]>([]);

    const [projectBpm, setProjectBpm] = useState(120);
    const [showBpmGrid, setShowBpmGrid] = useState(false);

    const [waveformZoom, setWaveformZoom] = useState(1);

    const [dragState, setDragState] = useState<{
        type: 'move' | 'resize-left' | 'resize-right' | 'fade-in' | 'fade-out' | 'selection' | null;
        clipId?: string;
        trackId?: string;
        startX: number;
        startTime: number;
        originalClip?: AudioClip;
    } | null>(null);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId?: string; trackId?: string } | null>(null);

    const [waveformDataCache, setWaveformDataCache] = useState<Map<string, Float32Array>>(new Map());

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
    const ghostNoteRef = useRef<HTMLDivElement | null>(null);
    const ghostLabelRef = useRef<HTMLDivElement | null>(null);
    const dragNoteRef = useRef<{ idx: number; origMidi: number; origBeat: number } | null>(null);
    const staveLayoutRef = useRef<Array<{
        x: number; y: number; width: number; measureIdx: number;
        clef: 'treble' | 'bass'; topLineY: number; bottomLineY: number;
    }>>([]);
    const [notationKeySignature, setNotationKeySignature] = useState('C');
    const [notationClef, setNotationClef] = useState<'treble' | 'bass' | 'grand'>('treble');
    const [inputNoteDuration, setInputNoteDuration] = useState(1);
    const [inputCursor, setInputCursor] = useState(0);
    const [inputOctave, setInputOctave] = useState(4);
    const [notationInstrument, setNotationInstrument] = useState<'sine' | 'triangle' | 'square' | 'sawtooth'>('triangle');
    const [noteContextMenu, setNoteContextMenu] = useState<{
        x: number; y: number; noteIdx: number | null; beat: number; measureIdx: number;
    } | null>(null);

    const [notationUndoStack, setNotationUndoStack] = useState<Array<{ note: number; start: number; duration: number; velocity: number }[]>>([]);
    const [notationRedoStack, setNotationRedoStack] = useState<Array<{ note: number; start: number; duration: number; velocity: number }[]>>([]);
    const [notationClipboard, setNotationClipboard] = useState<Array<{ note: number; start: number; duration: number; velocity: number }>>([]);
    const [notationMeasures, setNotationMeasures] = useState(4);
    const [showLibrary, setShowLibrary] = useState(false);
    const pianoRollScrollRef = useRef<HTMLDivElement>(null);
    const pianoRollGridRef = useRef<HTMLDivElement>(null);
    const sheetMusicScrollRef = useRef<HTMLDivElement>(null);
    const vfContainerRef = useRef<HTMLDivElement>(null);
    const tabScrollRef = useRef<HTMLDivElement>(null);
    const notationAnimRef = useRef<number | null>(null);
    const notationOscillators = useRef<OscillatorNode[]>([]);
    const [pianoRollDrag, setPianoRollDrag] = useState<{
        type: 'move' | 'resize';
        noteIdx: number;
        startX: number;
        startY: number;
        origNote: { note: number; start: number; duration: number; velocity: number };
    } | null>(null);

    const [analysisAudioBuffer, setAnalysisAudioBuffer] = useState<AudioBuffer | null>(null);
    const [analysisFrequencyData, setAnalysisFrequencyData] = useState<Uint8Array | null>(null);
    const [analysisWaveformData, setAnalysisWaveformData] = useState<number[]>([]);

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

    const [crossfaderCurve, setCrossfaderCurve] = useState<'linear' | 'cut' | 'smooth'>('smooth');

    const [deckAEffects, setDeckAEffects] = useState<{ [key: string]: number }>({});
    const [deckBEffects, setDeckBEffects] = useState<{ [key: string]: number }>({});
    const [deckA, setDeckA] = useState<DJDeck>({ ...defaultDeckState });
    const [deckB, setDeckB] = useState<DJDeck>({ ...defaultDeckState });
    const [crossfader, setCrossfader] = useState(0.5);
    const deckARef = useRef<HTMLAudioElement>(null);
    const deckBRef = useRef<HTMLAudioElement>(null);

    const [djMasterGain, setDjMasterGain] = useState(1);
    const [djBpm, setDjBpm] = useState<{ a: number; b: number }>({ a: 0, b: 0 });

    const [analysisData, setAnalysisData] = useState<{ frequencies: number[], waveform: number[] } | null>(null);
    const [analysisMode, setAnalysisMode] = useState<'waveform' | 'spectrum' | 'spectrogram'>('waveform');
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const [visualizerActive, setVisualizerActive] = useState(false);
    const [visualizerMode, setVisualizerMode] = useState<'bars' | 'wave' | 'circle' | 'particles'>('bars');
    const [visualizerColor, setVisualizerColor] = useState<'rainbow' | 'purple' | 'blue' | 'green'>('rainbow');
    const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
    const visualizerAnimationRef = useRef<number | null>(null);
    const visualizerAnalyzerRef = useRef<AnalyserNode | null>(null);
    const visualizerAudioCtxRef = useRef<AudioContext | null>(null);
    const visualizerSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

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

    useEffect(() => {
        localStorage.setItem('scherzo_audioDatasets', JSON.stringify(audioDatasets));
    }, [audioDatasets]);

    const selectedDataset = audioDatasets.find(d => d.id === selectedDatasetId);

    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('scherzo_sidebarCollapsed');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('scherzo_sidebarCollapsed', String(sidebarCollapsed));
    }, [sidebarCollapsed]);

    useEffect(() => {
        if (audioSource) {
            loadAudioFiles(audioSource);
        }
    }, [audioSource]);

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

        const connectAudio = () => {

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

                }
            }

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

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const detectBeats = useCallback(async (audioPath: string): Promise<{ bpm: number; beats: number[]; key: string }> => {
        try {
            const response = await fetch(`file://${audioPath}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            const windowSize = Math.floor(sampleRate * 0.02);
            const hopSize = Math.floor(windowSize / 2);
            const energies: number[] = [];

            for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
                let energy = 0;
                for (let j = 0; j < windowSize; j++) {
                    energy += channelData[i + j] * channelData[i + j];
                }
                energies.push(energy);
            }

            const threshold = energies.reduce((a, b) => a + b, 0) / energies.length * 1.5;
            const peaks: number[] = [];
            for (let i = 1; i < energies.length - 1; i++) {
                if (energies[i] > threshold && energies[i] > energies[i-1] && energies[i] > energies[i+1]) {
                    peaks.push(i * hopSize / sampleRate);
                }
            }

            const intervals: number[] = [];
            for (let i = 1; i < Math.min(peaks.length, 100); i++) {
                intervals.push(peaks[i] - peaks[i-1]);
            }

            if (intervals.length === 0) {
                return { bpm: 120, beats: [], key: 'Am' };
            }

            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];
            const rawBpm = 60 / medianInterval;

            let bpm = rawBpm;
            while (bpm < 80) bpm *= 2;
            while (bpm > 180) bpm /= 2;
            bpm = Math.round(bpm);

            const beatInterval = 60 / bpm;
            const beats: number[] = [];
            for (let t = 0; t < audioBuffer.duration; t += beatInterval) {
                beats.push(t);
            }

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

    const nudgeDeck = useCallback((deck: DJDeck, setDeck: React.Dispatch<React.SetStateAction<DJDeck>>, audioRef: React.RefObject<HTMLAudioElement>, amount: number) => {
        if (audioRef.current && deck.audioFile) {
            const newTime = Math.max(0, Math.min(deck.audioFile.duration || 0, deck.currentTime + amount));
            audioRef.current.currentTime = newTime;
            setDeck(prev => ({ ...prev, currentTime: newTime }));
        }
    }, []);

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

    const ALL_SCHERZO_MODES = [
        { id: 'library', name: 'Library', icon: Library, group: 'browse' },
        { id: 'generator', name: 'Generate', icon: Sparkles, group: 'create' },
        { id: 'editor', name: 'Editor', icon: Waves, group: 'edit' },
        { id: 'beats', name: 'Beat Maker', icon: Grid, group: 'create' },
        { id: 'dj', name: 'DJ Mixer', icon: Disc3, group: 'edit' },
        { id: 'analysis', name: 'Analysis', icon: Activity, group: 'analyze' },
        { id: 'notation', name: 'Notation', icon: Music2, group: 'analyze' },
        { id: 'datasets', name: 'Datasets', icon: Package, group: 'train' }
    ];
    const SCHERZO_MODES = aiEnabled ? ALL_SCHERZO_MODES : ALL_SCHERZO_MODES.filter(m => m.id !== 'generator');

    const currentMode_obj = SCHERZO_MODES.find(m => m.id === activeMode) || SCHERZO_MODES[0];
    const CurrentModeIcon = currentMode_obj.icon;

    const renderSidebar = () => {
        if (sidebarCollapsed) {
            return (
                <div className="w-12 border-r theme-border theme-bg-secondary flex flex-col items-center py-2">
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        className="p-2 theme-hover rounded mb-2"
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
                        className="p-1 theme-hover rounded"
                    >
                        <ChevronLeft size={16}/>
                    </button>
                </div>

                <div className="p-3 border-b theme-border">
                    <label className="text-xs theme-text-muted uppercase font-semibold">Source Folder</label>
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
                            className="p-1.5 theme-bg-tertiary theme-hover rounded"
                        >
                            <FolderOpen size={14}/>
                        </button>
                    </div>
                </div>

                <div className="p-3 border-b theme-border">
                    <div className="relative">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted"/>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search audio..."
                            className="w-full theme-input text-xs pl-7"
                        />
                    </div>
                </div>

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
                                        : 'theme-hover'
                                }`}
                            >
                                <FileAudio size={14} className="text-purple-400 flex-shrink-0"/>
                                <span className="text-xs truncate flex-1">{file.name}</span>
                                {file.duration && (
                                    <span className="text-xs theme-text-muted">{formatTime(file.duration)}</span>
                                )}
                            </div>
                        ))}
                    {audioFiles.length === 0 && (
                        <div className="text-center py-8 theme-text-muted">
                            <Music size={32} className="mx-auto mb-2 opacity-50"/>
                            <p className="text-xs">No audio files</p>
                            <p className="text-xs mt-1">Select a source folder above</p>
                        </div>
                    )}
                </div>

                {selectedAudio && (
                    <div className="p-3 border-t theme-border theme-bg-secondary">
                        <div className="flex items-center gap-2 mb-2">
                            <FileAudio size={14} className="text-purple-400"/>
                            <span className="text-xs truncate flex-1">{selectedAudio.name}</span>
                            <button
                                onClick={() => setVisualizerActive(!visualizerActive)}
                                className={`p-1 rounded ${visualizerActive ? 'bg-purple-600 text-white' : 'theme-hover theme-text-muted'}`}
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
                            <div className="flex-1 h-1 theme-bg-tertiary rounded overflow-hidden">
                                <div
                                    className="h-full bg-purple-500"
                                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                                />
                            </div>
                            <span className="text-xs theme-text-muted">{formatTime(currentTime)}</span>
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
                                    : 'theme-bg-secondary theme-hover'
                            }`}
                        >
                            <div className="aspect-square bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-lg flex items-center justify-center mb-3">
                                <Music size={32} className="text-purple-400"/>
                            </div>
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            {file.duration && (
                                <p className="text-xs theme-text-muted mt-1">{formatTime(file.duration)}</p>
                            )}
                        </div>
                    ))}
                </div>
                {filteredFiles.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Music size={64} className="mx-auto theme-text-muted mb-4"/>
                            <p className="theme-text-muted text-lg">No Audio Files</p>
                            <p className="theme-text-muted text-sm mt-2">Select a source folder in the sidebar</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderGenerator = () => {
        return (
            <div className="flex-1 flex overflow-hidden">
                <div className="w-96 border-r theme-border p-4 flex flex-col gap-4 overflow-y-auto theme-bg-secondary">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles size={20} className="text-purple-400"/> Audio Generator
                    </h3>

                    <div>
                        <label className="text-xs theme-text-muted font-semibold uppercase">Prompt</label>
                        <textarea
                            value={genPrompt}
                            onChange={(e) => setGenPrompt(e.target.value)}
                            placeholder="Describe the audio you want to create..."
                            className="w-full theme-input mt-2 text-sm"
                            rows={4}
                        />
                    </div>

                    <div>
                        <label className="text-xs theme-text-muted font-semibold uppercase">Model</label>
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
                        <label className="text-xs theme-text-muted font-semibold uppercase">Duration (seconds)</label>
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
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center gap-2"
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

                <div className="flex-1 flex flex-col overflow-hidden">
                    {generatedAudio.length > 0 && (
                        <div className="p-3 border-b theme-border flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setSelectionMode(!selectionMode);
                                    if (selectionMode) setSelectedGeneratedAudio(new Set());
                                }}
                                className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 ${
                                    selectionMode ? 'bg-purple-600 text-white' : 'theme-bg-tertiary theme-hover'
                                }`}
                            >
                                <Layers size={12} /> Select
                            </button>
                            {selectionMode && selectedGeneratedAudio.size > 0 && (
                                <>
                                    <span className="text-xs theme-text-muted">{selectedGeneratedAudio.size} selected</span>
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
                                    className={`theme-bg-secondary rounded-xl p-4 ${
                                        selectionMode
                                            ? selectedGeneratedAudio.has(audio.id)
                                                ? 'ring-2 ring-purple-500 bg-purple-900/20 cursor-pointer'
                                                : 'theme-hover cursor-pointer'
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
                                    <p className="text-xs theme-text-muted">{formatTime(audio.duration || 0)}</p>
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => {
                                                if (audio.path) {
                                                    const a = new Audio(`file://${audio.path}`);
                                                    a.play().catch(e => console.error('Playback error:', e));
                                                }
                                            }}
                                            disabled={!audio.path}
                                            className="flex-1 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 rounded text-purple-400 text-xs disabled:opacity-40"
                                        >
                                            <Play size={12} className="inline mr-1"/> Play
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (audio.path) {
                                                    // Add to editor timeline
                                                    const file: AudioFile = { id: audio.id, name: audio.name, path: audio.path, duration: audio.duration };
                                                    setAudioFiles(prev => [...prev, file]);
                                                }
                                            }}
                                            disabled={!audio.path}
                                            className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 rounded text-blue-400 text-xs disabled:opacity-40"
                                        >
                                            <Download size={12} className="inline mr-1"/> Add to Editor
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <Sparkles size={64} className="mx-auto theme-text-muted mb-4"/>
                                <p className="theme-text-muted text-lg">Generate AI Audio</p>
                                <p className="theme-text-muted text-sm mt-2">Enter a prompt and select a model</p>
                            </div>
                        </div>
                    )}
                    </div>

                    {showAddToDataset && (
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowAddToDataset(false)}>
                            <div className="theme-bg-secondary rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                                <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Plus className="text-purple-400" size={18} />
                                    Add to Dataset
                                </h4>
                                {audioDatasets.length === 0 ? (
                                    <div className="text-center py-4 theme-text-muted">
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
                                                className="w-full p-3 theme-bg-tertiary theme-hover rounded text-left flex items-center justify-between"
                                            >
                                                <div>
                                                    <span className="font-medium">{dataset.name}</span>
                                                    <span className="text-xs theme-text-muted ml-2">{dataset.examples.length} samples</span>
                                                </div>
                                                <ChevronRight size={16} className="theme-text-muted"/>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-end mt-4">
                                    <button
                                        onClick={() => setShowAddToDataset(false)}
                                        className="px-4 py-2 theme-bg-tertiary theme-hover theme-text-primary rounded"
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

    const loadWaveform = useCallback(async (audioPath: string, audioId: string) => {
        if (waveformCache.has(audioId)) return waveformCache.get(audioId);

        try {
            const buffer = await (window as any).api?.readFileBuffer?.(audioPath);
            if (!buffer) return null;

            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(buffer.buffer || buffer);
            const channelData = audioBuffer.getChannelData(0);

            const duration = audioBuffer.duration;
            const hiResSamples = Math.min(Math.ceil(duration * 1000), 50000);
            const blockSize = Math.floor(channelData.length / hiResSamples);
            const hiResWaveform = new Float32Array(hiResSamples * 2);

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

            setWaveformDataCache(prev => new Map(prev).set(audioId, hiResWaveform));

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
    }, []);

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

        return pathTop + pathBottom.split(' ').reverse().join(' ').replace('M', 'L') + ' Z';
    }, [waveformDataCache, waveformZoom]);

    const playEditorTimeline = useCallback(async () => {
        if (!editorAudioContextRef.current) {
            editorAudioContextRef.current = new AudioContext();
        }
        const ctx = editorAudioContextRef.current;

        trackNodesRef.current.forEach(({ source }) => {
            try { source.stop(); } catch {}
        });
        trackNodesRef.current.clear();

        const startTime = ctx.currentTime;
        editorStartTimeRef.current = performance.now() - (editorPlayhead * 1000);

        for (const track of tracks) {
            if (track.muted) continue;

            for (const clip of track.clips) {
                if (clip.startTime + clip.duration < editorPlayhead) continue;
                if (clip.startTime > editorPlayhead + 60) continue;

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

        const animate = () => {
            const elapsed = (performance.now() - editorStartTimeRef.current) / 1000;
            setEditorPlayhead(elapsed);
            editorAnimationRef.current = requestAnimationFrame(animate);
        };
        editorAnimationRef.current = requestAnimationFrame(animate);
    }, [tracks, audioFiles, editorPlayhead]);

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

    const exportTimeline = useCallback(async () => {
        const ctx = new OfflineAudioContext(2, 44100 * 60, 44100);

        let maxEnd = 0;
        for (const track of tracks) {
            for (const clip of track.clips) {
                maxEnd = Math.max(maxEnd, clip.startTime + clip.duration);
            }
        }
        if (maxEnd === 0) return;

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

        const wav = audioBufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mixdown.wav';
        a.click();
        URL.revokeObjectURL(url);
    }, [tracks, audioFiles]);

    const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

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

    const saveUndoState = useCallback(() => {
        setUndoStack(prev => [...prev.slice(-20), JSON.parse(JSON.stringify(tracks))]);
        setRedoStack([]);
    }, [tracks]);

    const editorUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(tracks))]);
        setUndoStack(prev => prev.slice(0, -1));
        setTracks(prevState);
    }, [undoStack, tracks]);

    const editorRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(tracks))]);
        setRedoStack(prev => prev.slice(0, -1));
        setTracks(nextState);
    }, [redoStack, tracks]);

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

    const pasteClip = useCallback((trackId: string, time: number) => {
        if (!clipboard) return;
        saveUndoState();
        const newClip = { ...clipboard, id: `clip_${Date.now()}`, startTime: time };
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
        ));
    }, [clipboard, saveUndoState]);

    const deleteClip = useCallback(() => {
        if (!selectedClipId) return;
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.filter(c => c.id !== selectedClipId)
        })));
        setSelectedClipId(null);
    }, [selectedClipId, saveUndoState]);

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

    const noteToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteToName = (note: number) => `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;

    const keySignatureToFifths = (key: string): number => {
        const map: Record<string, number> = { 'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1, 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7 };
        return map[key] ?? 0;
    };
    const fifthsToKeySignature = (fifths: number): string => {
        const map: Record<number, string> = { [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };
        return map[fifths] ?? 'C';
    };

    const playNote = useCallback((note: number, velocity: number = 0.5) => {
        if (!synthRef.current) synthRef.current = new AudioContext();
        const ctx = synthRef.current;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = notationInstrument;
        osc.frequency.value = noteToFrequency(note);

        const vol = velocity * 0.3;
        if (notationInstrument === 'square') {
            gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        } else if (notationInstrument === 'sawtooth') {
            gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        } else {
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        }
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
        activeNotesRef.current.set(note, osc);
    }, [notationInstrument]);

    const stopNote = useCallback((note: number) => {
        const osc = activeNotesRef.current.get(note);
        if (osc) {
            try { osc.stop(); } catch {}
            activeNotesRef.current.delete(note);
        }
    }, []);

    const loadDemoScore = useCallback((demo: DemoScore) => {
        setPianoNotes(demo.notes);
        setNotationKeySignature(demo.key);
        setNotationClef(demo.clef);
        setNotationTimeSignature(demo.timeSignature);
        setNotationBpm(demo.bpm);
        setNotationMeasures(demo.measures);
        setSelectedNotes(new Set());
        setInputCursor(0);
        setNotationUndoStack([]);
        setNotationRedoStack([]);
        setShowLibrary(false);
    }, []);

    const pushNotationUndo = useCallback(() => {
        setNotationUndoStack(prev => [...prev.slice(-30), pianoNotes]);
        setNotationRedoStack([]);
    }, [pianoNotes]);

    const notationUndo = useCallback(() => {
        if (notationUndoStack.length === 0) return;
        setNotationRedoStack(prev => [...prev, pianoNotes]);
        const last = notationUndoStack[notationUndoStack.length - 1];
        setNotationUndoStack(prev => prev.slice(0, -1));
        setPianoNotes(last);
        setSelectedNotes(new Set());
    }, [notationUndoStack, pianoNotes]);

    const notationRedo = useCallback(() => {
        if (notationRedoStack.length === 0) return;
        setNotationUndoStack(prev => [...prev, pianoNotes]);
        const last = notationRedoStack[notationRedoStack.length - 1];
        setNotationRedoStack(prev => prev.slice(0, -1));
        setPianoNotes(last);
        setSelectedNotes(new Set());
    }, [notationRedoStack, pianoNotes]);

    const addPianoNote = useCallback((note: number, start: number, duration: number = 0.5, velocity: number = 0.8) => {
        pushNotationUndo();
        setPianoNotes(prev => [...prev, { note, start, duration, velocity }]);
        // Auto-expand measures if note is near or past the end
        const beatsPerMeas = notationTimeSignature[0];
        const noteEndMeasure = Math.ceil((start + duration) / beatsPerMeas);
        if (noteEndMeasure >= notationMeasures) {
            setNotationMeasures(noteEndMeasure + 2);
        }
    }, [pushNotationUndo, notationTimeSignature, notationMeasures]);

    const deleteSelectedNotes = useCallback(() => {
        pushNotationUndo();
        setPianoNotes(prev => prev.filter((_, i) => !selectedNotes.has(i)));
        setSelectedNotes(new Set());
    }, [selectedNotes, pushNotationUndo]);

    const copySelectedNotes = useCallback(() => {
        if (selectedNotes.size === 0) return;
        const copied = pianoNotes.filter((_, i) => selectedNotes.has(i));
        const minStart = Math.min(...copied.map(n => n.start));
        setNotationClipboard(copied.map(n => ({ ...n, start: n.start - minStart })));
    }, [pianoNotes, selectedNotes]);

    const pasteNotes = useCallback(() => {
        if (notationClipboard.length === 0) return;
        pushNotationUndo();
        const offset = inputCursor;
        const pasted = notationClipboard.map(n => ({ ...n, start: n.start + offset }));
        setPianoNotes(prev => [...prev, ...pasted]);
        const maxEnd = Math.max(...pasted.map(n => n.start + n.duration));
        setInputCursor(maxEnd);
    }, [notationClipboard, inputCursor, pushNotationUndo]);

    const transposeSelected = useCallback((semitones: number) => {
        if (selectedNotes.size === 0) return;
        pushNotationUndo();
        setPianoNotes(prev => prev.map((n, i) =>
            selectedNotes.has(i) ? { ...n, note: Math.max(21, Math.min(108, n.note + semitones)) } : n
        ));
    }, [selectedNotes, pushNotationUndo]);

    const selectAllNotes = useCallback(() => {
        setSelectedNotes(new Set(pianoNotes.map((_, i) => i)));
    }, [pianoNotes]);

    const saveNotationProject = useCallback(async () => {
        const project = {
            version: 1,
            notes: pianoNotes,
            bpm: notationBpm,
            timeSignature: notationTimeSignature,
            keySignature: notationKeySignature,
            clef: notationClef,
            instrument: notationInstrument,
            measures: notationMeasures,
        };
        const result = await (window as any).api?.showSaveDialog?.({
            title: 'Save Notation Project',
            defaultPath: 'notation.scherzo.json',
            filters: [{ name: 'Scherzo Project', extensions: ['scherzo.json'] }],
        });
        if (result?.filePath) {
            await (window as any).api?.writeFileContent?.(result.filePath, JSON.stringify(project, null, 2));
        }
    }, [pianoNotes, notationBpm, notationTimeSignature, notationKeySignature, notationClef, notationInstrument, notationMeasures]);

    const loadNotationProject = useCallback(async () => {
        const result = await (window as any).api?.showOpenDialog?.({
            title: 'Open Notation Project',
            filters: [{ name: 'Scherzo Project', extensions: ['json'] }],
            properties: ['openFile'],
        });
        if (result?.filePaths?.[0]) {
            const content = await (window as any).api?.readFileContent?.(result.filePaths[0]);
            if (content) {
                try {
                    const project = JSON.parse(content);
                    if (project.notes) {
                        pushNotationUndo();
                        setPianoNotes(project.notes);
                        if (project.bpm) setNotationBpm(project.bpm);
                        if (project.timeSignature) setNotationTimeSignature(project.timeSignature);
                        if (project.keySignature) setNotationKeySignature(project.keySignature);
                        if (project.clef) setNotationClef(project.clef);
                        if (project.instrument) setNotationInstrument(project.instrument);
                        if (project.measures) setNotationMeasures(project.measures);
                        setSelectedNotes(new Set());
                        setInputCursor(0);
                    }
                } catch (e) { console.error('Failed to load project:', e); }
            }
        }
    }, [pushNotationUndo]);

    const exportMidi = useCallback(async () => {
        // Build a simple MIDI file (format 0, single track)
        const bpm = notationBpm;
        const ticksPerBeat = 480;
        const sorted = [...pianoNotes].sort((a, b) => a.start - b.start);

        const writeVarLen = (value: number): number[] => {
            const bytes: number[] = [];
            let v = value;
            bytes.unshift(v & 0x7F);
            while ((v >>= 7) > 0) {
                bytes.unshift((v & 0x7F) | 0x80);
            }
            return bytes;
        };

        const events: Array<{ tick: number; data: number[] }> = [];

        // Tempo event
        const tempo = Math.round(60000000 / bpm);
        events.push({ tick: 0, data: [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] });

        // Time signature event
        const [num, denom] = notationTimeSignature;
        const denomPow = Math.log2(denom);
        events.push({ tick: 0, data: [0xFF, 0x58, 0x04, num, denomPow, 24, 8] });

        // Note events
        for (const note of sorted) {
            const startTick = Math.round(note.start * ticksPerBeat);
            const endTick = Math.round((note.start + note.duration) * ticksPerBeat);
            const vel = Math.round(note.velocity * 127);
            events.push({ tick: startTick, data: [0x90, note.note, vel] }); // note on
            events.push({ tick: endTick, data: [0x80, note.note, 0] }); // note off
        }

        // End of track
        const lastTick = events.length > 0 ? Math.max(...events.map(e => e.tick)) : 0;
        events.push({ tick: lastTick, data: [0xFF, 0x2F, 0x00] });

        events.sort((a, b) => a.tick - b.tick);

        // Build track data
        const trackData: number[] = [];
        let prevTick = 0;
        for (const evt of events) {
            const delta = evt.tick - prevTick;
            trackData.push(...writeVarLen(delta));
            trackData.push(...evt.data);
            prevTick = evt.tick;
        }

        // MIDI header
        const header = [
            0x4D, 0x54, 0x68, 0x64, // MThd
            0x00, 0x00, 0x00, 0x06, // chunk length
            0x00, 0x00,             // format 0
            0x00, 0x01,             // 1 track
            (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF, // ticks per beat
        ];

        const trackHeader = [
            0x4D, 0x54, 0x72, 0x6B, // MTrk
            (trackData.length >> 24) & 0xFF,
            (trackData.length >> 16) & 0xFF,
            (trackData.length >> 8) & 0xFF,
            trackData.length & 0xFF,
        ];

        const midiBytes = new Uint8Array([...header, ...trackHeader, ...trackData]);

        const result = await (window as any).api?.showSaveDialog?.({
            title: 'Export MIDI',
            defaultPath: 'notation.mid',
            filters: [{ name: 'MIDI File', extensions: ['mid', 'midi'] }],
        });
        if (result?.filePath) {
            await (window as any).api?.writeFileBuffer?.(result.filePath, midiBytes);
        }
    }, [pianoNotes, notationBpm, notationTimeSignature]);

    const exportMusicXML = useCallback(async () => {
        const [tsNum, tsDenom] = notationTimeSignature;
        const beatsPerMeasure = tsNum * (4 / tsDenom);
        const divisions = 4; // divisions per quarter note

        // Group notes into measures
        const measureNotes: Array<Array<{ note: number; start: number; duration: number; velocity: number }>> = [];
        for (let m = 0; m < notationMeasures; m++) measureNotes.push([]);
        for (const n of pianoNotes) {
            const mIdx = Math.floor(n.start / beatsPerMeasure);
            if (mIdx >= 0 && mIdx < notationMeasures) measureNotes[mIdx].push(n);
        }

        const midiToPitch = (midi: number) => {
            const names = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
            const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
            const pc = midi % 12;
            const octave = Math.floor(midi / 12) - 1;
            return { step: names[pc], alter: alters[pc], octave };
        };

        const durationToType = (dur: number): string => {
            if (dur >= 4) return 'whole';
            if (dur >= 2) return 'half';
            if (dur >= 1) return 'quarter';
            if (dur >= 0.5) return 'eighth';
            if (dur >= 0.25) return '16th';
            return '32nd';
        };

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Scherzo Export</work-title></work>
  <identification>
    <creator type="composer">Incognide Scherzo</creator>
    <encoding><software>Incognide Scherzo</software></encoding>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">\n`;

        for (let m = 0; m < notationMeasures; m++) {
            xml += `    <measure number="${m + 1}">\n`;
            if (m === 0) {
                xml += `      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${keySignatureToFifths(notationKeySignature)}</fifths></key>
        <time><beats>${tsNum}</beats><beat-type>${tsDenom}</beat-type></time>
        <clef><sign>${notationClef === 'bass' ? 'F' : 'G'}</sign><line>${notationClef === 'bass' ? 4 : 2}</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${notationBpm}</per-minute></metronome></direction-type></direction>\n`;
            }

            const notes = measureNotes[m].sort((a, b) => a.start - b.start);
            const measureStart = m * beatsPerMeasure;

            if (notes.length === 0) {
                // Whole measure rest
                xml += `      <note><rest/><duration>${Math.round(beatsPerMeasure * divisions)}</duration><type>whole</type></note>\n`;
            } else {
                let cursor = measureStart;
                for (let i = 0; i < notes.length; i++) {
                    const n = notes[i];
                    const noteStart = n.start;

                    // Rest before this note
                    if (noteStart > cursor + 0.01) {
                        const restDur = noteStart - cursor;
                        xml += `      <note><rest/><duration>${Math.round(restDur * divisions)}</duration><type>${durationToType(restDur)}</type></note>\n`;
                    }

                    const { step, alter, octave } = midiToPitch(n.note);
                    const dur = Math.min(n.duration, measureStart + beatsPerMeasure - noteStart);
                    const xmlDur = Math.round(dur * divisions);
                    const dynamics = Math.round(n.velocity * 127);

                    // Check if this note starts at same time as next (chord)
                    const isChord = i > 0 && Math.abs(notes[i].start - notes[i - 1].start) < 0.01;

                    xml += `      <note>\n`;
                    if (isChord) xml += `        <chord/>\n`;
                    xml += `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>\n`;
                    xml += `        <duration>${xmlDur}</duration>\n`;
                    xml += `        <type>${durationToType(dur)}</type>\n`;
                    xml += `        <dynamics><other-dynamics>${dynamics}</other-dynamics></dynamics>\n`;
                    xml += `      </note>\n`;

                    if (!isChord) cursor = noteStart + dur;
                }

                // Fill remaining measure with rest
                const remaining = measureStart + beatsPerMeasure - cursor;
                if (remaining > 0.01) {
                    xml += `      <note><rest/><duration>${Math.round(remaining * divisions)}</duration><type>${durationToType(remaining)}</type></note>\n`;
                }
            }
            xml += `    </measure>\n`;
        }

        xml += `  </part>\n</score-partwise>`;

        const result = await (window as any).api?.showSaveDialog?.({
            title: 'Export MusicXML',
            defaultPath: 'notation.musicxml',
            filters: [{ name: 'MusicXML', extensions: ['musicxml', 'xml'] }],
        });
        if (result?.filePath) {
            await (window as any).api?.writeFileContent?.(result.filePath, xml);
        }
    }, [pianoNotes, notationBpm, notationTimeSignature, notationKeySignature, notationClef, notationMeasures]);

    const importMusicXML = useCallback(async () => {
        const result = await (window as any).api?.showOpenDialog?.({
            title: 'Import MusicXML',
            filters: [{ name: 'MusicXML', extensions: ['musicxml', 'xml', 'mxl'] }],
            properties: ['openFile'],
        });
        if (!result?.filePaths?.[0]) return;

        const content = await (window as any).api?.readFileContent?.(result.filePaths[0]);
        if (!content) return;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/xml');

            const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

            // Extract tempo
            const metronome = doc.querySelector('metronome');
            let bpm = notationBpm;
            if (metronome) {
                const pm = metronome.querySelector('per-minute');
                if (pm?.textContent) bpm = parseInt(pm.textContent) || bpm;
            }

            // Extract time signature
            const timeEl = doc.querySelector('time');
            let tsNum = notationTimeSignature[0], tsDenom = notationTimeSignature[1];
            if (timeEl) {
                const b = timeEl.querySelector('beats');
                const bt = timeEl.querySelector('beat-type');
                if (b?.textContent) tsNum = parseInt(b.textContent) || tsNum;
                if (bt?.textContent) tsDenom = parseInt(bt.textContent) || tsDenom;
            }

            // Extract key signature
            const keyEl = doc.querySelector('key');
            let keySig = notationKeySignature;
            if (keyEl) {
                const fifths = parseInt(keyEl.querySelector('fifths')?.textContent || '0');
                keySig = fifthsToKeySignature(fifths);
            }

            // Extract clef
            const clefEl = doc.querySelector('clef');
            let clef = notationClef;
            if (clefEl) {
                const sign = clefEl.querySelector('sign')?.textContent;
                if (sign === 'F') clef = 'bass';
                else if (sign === 'G') clef = 'treble';
            }

            // Extract divisions (ticks per quarter note)
            const divisionsEl = doc.querySelector('divisions');
            const divisions = parseInt(divisionsEl?.textContent || '1') || 1;

            // Parse notes from all measures
            const notes: Array<{ note: number; start: number; duration: number; velocity: number }> = [];
            const measures = doc.querySelectorAll('measure');
            let beatOffset = 0;

            measures.forEach((measure) => {
                let measureBeat = beatOffset;
                const beatsPerMeasure = tsNum * (4 / tsDenom);
                let chordBeat = measureBeat;

                measure.querySelectorAll('note').forEach((noteEl) => {
                    const isRest = noteEl.querySelector('rest');
                    const isChord = noteEl.querySelector('chord');
                    const durEl = noteEl.querySelector('duration');
                    const durationTicks = parseInt(durEl?.textContent || '0') || 0;
                    const durationBeats = durationTicks / divisions;

                    if (isChord) {
                        // Chord note starts at the same beat as previous
                        measureBeat = chordBeat;
                    }

                    if (!isRest) {
                        const pitchEl = noteEl.querySelector('pitch');
                        if (pitchEl) {
                            const step = pitchEl.querySelector('step')?.textContent || 'C';
                            const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0') || 0;
                            const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4') || 4;
                            const midi = (octave + 1) * 12 + (stepToSemitone[step] || 0) + alter;

                            // Extract velocity from dynamics if present
                            let velocity = 0.8;
                            const dynEl = noteEl.querySelector('dynamics other-dynamics');
                            if (dynEl?.textContent) velocity = (parseInt(dynEl.textContent) || 100) / 127;

                            notes.push({ note: midi, start: measureBeat, duration: durationBeats, velocity: Math.min(1, Math.max(0.1, velocity)) });
                        }
                    }

                    if (!isChord) {
                        chordBeat = measureBeat;
                        measureBeat += durationBeats;
                    }
                });

                beatOffset += beatsPerMeasure;
            });

            pushNotationUndo();
            setPianoNotes(notes);
            setNotationBpm(bpm);
            setNotationTimeSignature([tsNum, tsDenom]);
            setNotationKeySignature(keySig);
            setNotationClef(clef);
            setNotationMeasures(Math.max(notationMeasures, measures.length));
            setSelectedNotes(new Set());
            setInputCursor(0);
        } catch (e) {
            console.error('Failed to import MusicXML:', e);
        }
    }, [notationBpm, notationTimeSignature, notationKeySignature, notationClef, notationMeasures, pushNotationUndo]);

    const stopNotation = useCallback(() => {
        // Stop all oscillators
        notationOscillators.current.forEach(osc => { try { osc.stop(); } catch {} });
        notationOscillators.current = [];
        if (notationAnimRef.current) cancelAnimationFrame(notationAnimRef.current);
        notationAnimRef.current = null;
        setIsNotationPlaying(false);
        setNotationPlayhead(0);
    }, []);

    const playNotation = useCallback(() => {
        if (isNotationPlaying) { stopNotation(); return; }

        if (!synthRef.current) synthRef.current = new AudioContext();
        const ctx = synthRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const startTime = ctx.currentTime;

        // Stop any previous oscillators
        notationOscillators.current.forEach(osc => { try { osc.stop(); } catch {} });
        notationOscillators.current = [];

        pianoNotes.forEach(note => {
            const noteStartTime = startTime + (note.start * 60 / notationBpm);
            const noteDuration = note.duration * 60 / notationBpm;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = notationInstrument;
            osc.frequency.value = noteToFrequency(note.note);
            const vol = note.velocity * 0.3 * (notationInstrument === 'square' ? 0.5 : notationInstrument === 'sawtooth' ? 0.4 : 1);
            gain.gain.setValueAtTime(vol, noteStartTime);
            gain.gain.exponentialRampToValueAtTime(0.01, noteStartTime + noteDuration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(noteStartTime);
            osc.stop(noteStartTime + noteDuration + 0.05);
            notationOscillators.current.push(osc);
        });

        setIsNotationPlaying(true);
        setNotationPlayhead(0);
        const bpmPerMeasure = notationTimeSignature[0];
        const totalNoteBeat = pianoNotes.length > 0 ? Math.max(...pianoNotes.map(n => n.start + n.duration)) : 0;
        // Play through ALL measures, not just to the last note
        const totalBeats = Math.max(totalNoteBeat, notationMeasures * bpmPerMeasure);
        const totalDurationMs = totalBeats * 60 / notationBpm * 1000;
        const playStartTime = performance.now();
        const beatWidthLocal = 40 * notationZoom;
        const tabBeatWidthLocal = 36 * notationZoom;

        const animatePlayhead = () => {
            const elapsed = performance.now() - playStartTime;
            const currentBeat = (elapsed / 1000) * (notationBpm / 60);
            if (elapsed < totalDurationMs) {
                setNotationPlayhead(currentBeat);
                // Auto-scroll piano roll
                if (pianoRollGridRef.current) {
                    const playheadX = currentBeat * beatWidthLocal;
                    const scrollLeft = pianoRollGridRef.current.scrollLeft;
                    const viewWidth = pianoRollGridRef.current.clientWidth;
                    if (playheadX > scrollLeft + viewWidth - 60 || playheadX < scrollLeft) {
                        pianoRollGridRef.current.scrollLeft = playheadX - 80;
                    }
                }
                // Auto-scroll sheet music view
                if (sheetMusicScrollRef.current && staveLayoutRef.current.length > 0) {
                    const measureIdx = Math.floor(currentBeat / bpmPerMeasure);
                    const stave = staveLayoutRef.current.find(s => s.measureIdx === measureIdx && s.clef !== 'bass');
                    if (stave) {
                        const scrollEl = sheetMusicScrollRef.current;
                        const staveY = stave.y * notationZoom;
                        const scrollTop = scrollEl.scrollTop;
                        const viewH = scrollEl.clientHeight;
                        if (staveY < scrollTop + 40 || staveY > scrollTop + viewH - 80) {
                            scrollEl.scrollTop = staveY - 60;
                        }
                    }
                }
                // Auto-scroll tab view
                if (tabScrollRef.current) {
                    const playheadX = currentBeat * tabBeatWidthLocal;
                    const scrollLeft = tabScrollRef.current.scrollLeft;
                    const viewWidth = tabScrollRef.current.clientWidth;
                    if (playheadX > scrollLeft + viewWidth - 60 || playheadX < scrollLeft) {
                        tabScrollRef.current.scrollLeft = playheadX - 80;
                    }
                }
                notationAnimRef.current = requestAnimationFrame(animatePlayhead);
            } else {
                setNotationPlayhead(0);
                setIsNotationPlaying(false);
                notationAnimRef.current = null;
                notationOscillators.current = [];
            }
        };
        notationAnimRef.current = requestAnimationFrame(animatePlayhead);
    }, [pianoNotes, notationBpm, notationInstrument, notationZoom, isNotationPlaying, stopNotation, notationTimeSignature, notationMeasures]);

    // Auto-scroll piano roll to middle C on first render
    useEffect(() => {
        if (activeMode === 'notation' && notationView === 'piano' && pianoRollScrollRef.current) {
            // Middle C is MIDI 60, key index 60-21=39 from bottom
            // Scroll to show middle C area
            const noteHeight = 14;
            const totalKeys = 88;
            const middleCRow = totalKeys - 1 - 39; // row from top
            const scrollTo = middleCRow * noteHeight - (pianoRollScrollRef.current.clientHeight / 2);
            pianoRollScrollRef.current.scrollTop = scrollTo;
        }
    }, [activeMode, notationView]);

    // Keyboard shortcuts for notation mode
    useEffect(() => {
        if (activeMode !== 'notation') return;
        const handler = (e: KeyboardEvent) => {
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); notationUndo(); }
            else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); notationRedo(); }
            else if (ctrl && e.key === 'c') { if (selectedNotes.size > 0) { e.preventDefault(); copySelectedNotes(); } }
            else if (ctrl && e.key === 'v') { if (notationClipboard.length > 0) { e.preventDefault(); pasteNotes(); } }
            else if (ctrl && e.key === 'a') { e.preventDefault(); selectAllNotes(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedNotes.size > 0) { e.preventDefault(); deleteSelectedNotes(); } }
            // Number keys for duration
            else if (e.key === '1') setInputNoteDuration(4);    // whole
            else if (e.key === '2') setInputNoteDuration(2);    // half
            else if (e.key === '3') setInputNoteDuration(1);    // quarter
            else if (e.key === '4') setInputNoteDuration(0.5);  // eighth
            else if (e.key === '5') setInputNoteDuration(0.25); // 16th
            // Arrow keys for transpose
            else if (e.key === 'ArrowUp' && selectedNotes.size > 0 && !ctrl) { e.preventDefault(); transposeSelected(e.shiftKey ? 12 : 1); }
            else if (e.key === 'ArrowDown' && selectedNotes.size > 0 && !ctrl) { e.preventDefault(); transposeSelected(e.shiftKey ? -12 : -1); }
            // Space to play
            else if (e.key === ' ' && !ctrl) { e.preventDefault(); if (pianoNotes.length > 0) playNotation(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [activeMode, notationUndo, notationRedo, copySelectedNotes, pasteNotes, selectAllNotes, deleteSelectedNotes, transposeSelected, playNotation, selectedNotes, notationClipboard, pianoNotes]);

    const analyzeAudio = useCallback(async (audioPath: string) => {
        try {
            const buffer = await (window as any).api?.readFileBuffer?.(audioPath);
            if (!buffer) return;

            // Clean up previous context
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch {}
            }
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(buffer.buffer || buffer);
            setAnalysisAudioBuffer(audioBuffer);

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

    const midiToGuitarTab = (note: number): { string: number; fret: number } | null => {
        const openStrings = [64, 59, 55, 50, 45, 40];
        for (let s = 0; s < 6; s++) {
            const fret = note - openStrings[s];
            if (fret >= 0 && fret <= 24) {
                return { string: s, fret };
            }
        }
        return null;
    };

    const snapToGridTime = useCallback((time: number): number => {
        if (!snapToGrid) return time;
        return Math.round(time / gridSize) * gridSize;
    }, [snapToGrid, gridSize]);

    useEffect(() => {
        if (activeMode !== 'editor') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const isMeta = e.metaKey || e.ctrlKey;

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

            else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                setEditorPlayhead(prev => Math.max(0, prev - (e.shiftKey ? 1 : 0.1)));
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                setEditorPlayhead(prev => prev + (e.shiftKey ? 1 : 0.1));
            }

            else if (isMeta && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
                e.preventDefault();
                setEditorZoom(prev => Math.min(8, prev + 0.25));
            } else if (isMeta && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
                e.preventDefault();
                setEditorZoom(prev => Math.max(0.25, prev - 0.25));
            }

            else if (e.code === 'KeyG') {
                e.preventDefault();
                setSnapToGrid(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeMode, isEditorPlaying, tracks, editorPlayhead, playEditorTimeline, stopEditorTimeline, editorUndo, editorRedo, cutClip, copyClip, pasteClip, deleteClip, splitClipAtPlayhead]);

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

    useEffect(() => {
        if (!contextMenu) return;
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    const normalizeClip = useCallback((clipId: string) => {
        saveUndoState();
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => c.id === clipId ? { ...c, gain: 1.5 } : c)
        })));
        setContextMenu(null);
    }, [saveUndoState]);

    const reverseClip = useCallback(async (clipId: string) => {
        saveUndoState();
        // Find the clip and reverse its audio by swapping start/end offset markers
        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => {
                if (c.id !== clipId) return c;
                return { ...c, reversed: !c.reversed };
            })
        })));
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

    const addMarker = useCallback((name?: string) => {
        const markerName = name || `Marker ${markers.length + 1}`;
        setMarkers(prev => [...prev, {
            id: `marker_${Date.now()}`,
            time: editorPlayhead,
            name: markerName,
            color: '#FFD700'
        }]);
    }, [editorPlayhead, markers.length]);

    const formatTimeMs = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const renderEditor = () => {
        const pixelsPerSecond = 50 * editorZoom;
        const totalDuration = Math.max(60, ...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration + 10)));
        const timelineWidth = totalDuration * pixelsPerSecond;

        const markerInterval = editorZoom >= 2 ? 1 : editorZoom >= 1 ? 2 : editorZoom >= 0.5 ? 5 : 10;
        const markers: number[] = [];
        for (let t = 0; t <= totalDuration; t += markerInterval) {
            markers.push(t);
        }

        const LevelMeter = ({ trackId }: { trackId: string }) => {
            const levels = trackLevels.get(trackId) || { left: 0, right: 0 };
            return (
                <div className="flex gap-0.5 h-12">
                    {['left', 'right'].map(ch => (
                        <div key={ch} className="w-1.5 theme-bg-secondary rounded-sm overflow-hidden flex flex-col-reverse">
                            <div
                                className={`transition-all duration-75 ${levels[ch as 'left' | 'right'] > 0.9 ? 'bg-red-500' : levels[ch as 'left' | 'right'] > 0.7 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ height: `${levels[ch as 'left' | 'right'] * 100}%` }}
                            />
                        </div>
                    ))}
                </div>
            );
        };

        const PanKnob = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
            const rotation = value * 135;
            return (
                <div
                    className="w-6 h-6 rounded-full theme-bg-tertiary border-2 theme-border cursor-pointer relative flex items-center justify-center"
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
                <div className="h-10 border-b theme-border flex items-center px-2 gap-1 theme-bg-secondary">
                    <div className="flex theme-bg-primary rounded p-0.5 mr-2">
                        <button
                            onClick={() => setEditorTool('select')}
                            className={`p-1.5 rounded ${editorTool === 'select' ? 'bg-purple-600' : 'theme-hover'}`}
                            title="Select Tool (V)"
                        >
                            <MousePointer size={14}/>
                        </button>
                        <button
                            onClick={() => setEditorTool('move')}
                            className={`p-1.5 rounded ${editorTool === 'move' ? 'bg-purple-600' : 'theme-hover'}`}
                            title="Move Tool (M)"
                        >
                            <Move size={14}/>
                        </button>
                        <button
                            onClick={() => setEditorTool('cut')}
                            className={`p-1.5 rounded ${editorTool === 'cut' ? 'bg-purple-600' : 'theme-hover'}`}
                            title="Cut Tool (C)"
                        >
                            <Scissors size={14}/>
                        </button>
                    </div>

                    <button onClick={editorUndo} disabled={undoStack.length === 0}
                            className={`p-1.5 rounded ${undoStack.length > 0 ? 'theme-hover' : 'opacity-40'}`} title="Undo (Ctrl+Z)">
                        <Undo size={14}/>
                    </button>
                    <button onClick={editorRedo} disabled={redoStack.length === 0}
                            className={`p-1.5 rounded ${redoStack.length > 0 ? 'theme-hover' : 'opacity-40'}`} title="Redo (Ctrl+Y)">
                        <Redo size={14}/>
                    </button>
                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>
                    <button onClick={cutClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'theme-hover' : 'opacity-40'}`} title="Cut (Ctrl+X)">
                        <Scissors size={14}/>
                    </button>
                    <button onClick={copyClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'theme-hover' : 'opacity-40'}`} title="Copy (Ctrl+C)">
                        <Copy size={14}/>
                    </button>
                    <button onClick={() => tracks.length > 0 && pasteClip(tracks[0].id, editorPlayhead)}
                            disabled={!clipboard} className={`p-1.5 rounded ${clipboard ? 'theme-hover' : 'opacity-40'}`} title="Paste (Ctrl+V)">
                        <ClipboardPaste size={14}/>
                    </button>
                    <button onClick={deleteClip} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'theme-hover text-red-400' : 'opacity-40'}`} title="Delete">
                        <Trash2 size={14}/>
                    </button>
                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>
                    <button onClick={splitClipAtPlayhead} disabled={!selectedClipId}
                            className={`p-1.5 rounded ${selectedClipId ? 'theme-hover' : 'opacity-40'}`} title="Split at Playhead (S)">
                        <Scissors size={14} className="rotate-90"/>
                    </button>

                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>
                    <button
                        onClick={() => setSnapToGrid(!snapToGrid)}
                        className={`p-1.5 rounded flex items-center gap-1 ${snapToGrid ? 'bg-purple-600' : 'theme-hover'}`}
                        title="Snap to Grid (G)"
                    >
                        <Magnet size={14}/>
                    </button>
                    <select
                        value={gridSize}
                        onChange={(e) => setGridSize(parseFloat(e.target.value) as any)}
                        className="px-1.5 py-0.5 theme-bg-secondary border theme-border rounded text-xs"
                        disabled={!snapToGrid}
                    >
                        <option value={0.25}>1/4s</option>
                        <option value={0.5}>1/2s</option>
                        <option value={1}>1s</option>
                        <option value={2}>2s</option>
                        <option value={4}>4s</option>
                    </select>

                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>
                    <button onClick={() => setEditorZoom(Math.max(0.25, editorZoom - 0.25))} className="p-1.5 theme-hover rounded">
                        <ZoomOut size={14}/>
                    </button>
                    <span className="text-xs theme-text-muted w-10 text-center">{Math.round(editorZoom * 100)}%</span>
                    <button onClick={() => setEditorZoom(Math.min(8, editorZoom + 0.25))} className="p-1.5 theme-hover rounded">
                        <ZoomIn size={14}/>
                    </button>

                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>
                    <button
                        onClick={() => setShowEffectsPanel(!showEffectsPanel)}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${showEffectsPanel ? 'bg-purple-600' : 'theme-bg-tertiary theme-hover'}`}
                    >
                        <Sliders size={12}/> FX
                    </button>

                    <div className="flex-1"/>

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

                    <div className="w-px h-5 theme-bg-tertiary mx-1"/>

                    <div className="flex items-center gap-1 theme-bg-primary rounded px-2 py-0.5">
                        <span className="text-[10px] theme-text-muted">BPM</span>
                        <input
                            type="number"
                            value={projectBpm}
                            onChange={(e) => setProjectBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
                            className="w-12 bg-transparent text-xs font-mono text-center"
                        />
                        <button
                            onClick={() => setShowBpmGrid(!showBpmGrid)}
                            className={`p-0.5 rounded ${showBpmGrid ? 'bg-purple-600' : 'theme-hover'}`}
                            title="Show beat grid"
                        >
                            <Grid size={10}/>
                        </button>
                    </div>

                    <button
                        onClick={() => addMarker()}
                        className="px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded text-xs flex items-center gap-1"
                        title="Add Marker (M)"
                    >
                        <Tag size={10}/> Marker
                    </button>

                    <div className="flex items-center gap-1">
                        <span className="text-[10px] theme-text-muted">Wave</span>
                        <button onClick={() => setWaveformZoom(Math.max(0.5, waveformZoom - 0.25))} className="p-0.5 theme-hover rounded">
                            <ZoomOut size={10}/>
                        </button>
                        <span className="text-[10px] w-6 text-center">{Math.round(waveformZoom * 100)}%</span>
                        <button onClick={() => setWaveformZoom(Math.min(3, waveformZoom + 0.25))} className="p-0.5 theme-hover rounded">
                            <ZoomIn size={10}/>
                        </button>
                    </div>
                </div>

                {showEffectsPanel && (
                    <div className="h-24 border-b theme-border theme-bg-secondary p-2 flex gap-3 overflow-x-auto">
                        <div className="flex flex-col gap-0.5 min-w-[100px]">
                            <span className="text-[10px] theme-text-muted uppercase">Master</span>
                            <input type="range" min={0} max={2} step={0.01} value={masterVolume}
                                   onChange={(e) => setMasterVolume(parseFloat(e.target.value))} className="w-full h-1.5 accent-purple-500"/>
                            <span className="text-[10px] theme-text-muted text-center">{Math.round(masterVolume * 100)}%</span>
                        </div>
                        {['Reverb', 'Delay', 'Chorus'].map(fx => (
                            <div key={fx} className="flex flex-col gap-0.5 min-w-[80px]">
                                <span className="text-[10px] theme-text-muted uppercase">{fx}</span>
                                <input type="range" min={0} max={1} step={0.01} defaultValue={0} className="w-full h-1.5 accent-purple-500"/>
                                <span className="text-[10px] theme-text-muted text-center">0%</span>
                            </div>
                        ))}
                        <div className="w-px theme-bg-tertiary"/>
                        {['Low', 'Mid', 'High'].map(band => (
                            <div key={band} className="flex flex-col gap-0.5 min-w-[60px]">
                                <span className="text-[10px] theme-text-muted uppercase">{band} EQ</span>
                                <input type="range" min={-12} max={12} step={0.5} defaultValue={0} className="w-full h-1.5 accent-blue-500"/>
                                <span className="text-[10px] theme-text-muted text-center">0dB</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex-1 flex overflow-hidden" ref={editorContainerRef}>
                    <div className="w-52 border-r theme-border flex flex-col theme-bg-secondary flex-shrink-0">
                        <div className="h-6 border-b theme-border flex items-center px-2 theme-bg-primary">
                            <span className="text-[10px] theme-text-muted uppercase">Tracks</span>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {tracks.map((track, trackIdx) => {
                                const isLocked = lockedTracks.has(track.id);
                                const isArmed = armedTracks.has(track.id);
                                return (
                                    <div
                                        key={track.id}
                                        className={`h-20 border-b theme-border p-1.5 flex flex-col ${
                                            track.muted ? 'opacity-60' : ''
                                        } ${isLocked ? 'theme-bg-secondary' : ''}`}
                                    >
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[10px] theme-text-muted w-4">{trackIdx + 1}</span>
                                            <input
                                                type="text"
                                                value={track.name}
                                                onChange={(e) => setTracks(prev => prev.map(t =>
                                                    t.id === track.id ? {...t, name: e.target.value} : t
                                                ))}
                                                disabled={isLocked}
                                                className="flex-1 bg-transparent text-xs font-medium theme-text-primary border-b border-transparent hover:border-current focus:border-purple-500 outline-none"
                                            />
                                            <button
                                                onClick={() => setLockedTracks(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(track.id)) next.delete(track.id);
                                                    else next.add(track.id);
                                                    return next;
                                                })}
                                                className={`p-0.5 rounded ${isLocked ? 'text-yellow-500' : 'theme-text-muted'}`}
                                            >
                                                {isLocked ? <Lock size={10}/> : <Unlock size={10}/>}
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setArmedTracks(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(track.id)) next.delete(track.id);
                                                    else next.add(track.id);
                                                    return next;
                                                })}
                                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    isArmed ? 'bg-red-600 text-white' : 'theme-bg-tertiary theme-text-muted theme-hover'
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
                                                    track.muted ? 'bg-red-600 text-white' : 'theme-bg-tertiary theme-text-muted theme-hover'
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
                                                    track.solo ? 'bg-yellow-500 text-black' : 'theme-bg-tertiary theme-text-muted theme-hover'
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

                                        <div className="flex items-center gap-1 mt-auto">
                                            <Volume2 size={10} className="theme-text-muted"/>
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
                                            <span className="text-[9px] theme-text-muted w-7 text-right">
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
                                className="h-8 flex items-center justify-center text-xs theme-text-muted theme-hover gap-1"
                            >
                                <Plus size={12}/> Add Track
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div
                            className="h-6 border-b theme-border theme-bg-primary overflow-x-auto overflow-y-hidden flex-shrink-0"
                            style={{ scrollbarWidth: 'none' }}
                            onScroll={(e) => {

                                const tracksContainer = e.currentTarget.nextElementSibling;
                                if (tracksContainer) tracksContainer.scrollLeft = e.currentTarget.scrollLeft;
                            }}
                        >
                            <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
                                {markers.map(t => (
                                    <div
                                        key={t}
                                        className="absolute top-0 h-full flex flex-col items-center"
                                        style={{ left: `${t * pixelsPerSecond}px` }}
                                    >
                                        <span className="text-[9px] theme-text-muted font-mono">{formatTime(t)}</span>
                                        <div className="flex-1 w-px theme-bg-tertiary"/>
                                    </div>
                                ))}
                                {snapToGrid && gridSize < markerInterval && markers.flatMap(t => {
                                    const subMarkers = [];
                                    for (let st = t + gridSize; st < t + markerInterval && st <= totalDuration; st += gridSize) {
                                        subMarkers.push(
                                            <div
                                                key={`sub-${st}`}
                                                className="absolute bottom-0 w-px h-2 theme-bg-secondary"
                                                style={{ left: `${st * pixelsPerSecond}px` }}
                                            />
                                        );
                                    }
                                    return subMarkers;
                                })}
                                <div
                                    className="absolute top-0 h-full flex flex-col items-center pointer-events-none z-20"
                                    style={{ left: `${editorPlayhead * pixelsPerSecond}px` }}
                                >
                                    <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-500"/>
                                </div>
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

                        <div
                            className="flex-1 overflow-auto theme-bg-primary"
                            onScroll={(e) => {

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
                                            className={`h-20 border-b theme-border relative ${
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
                                            {markers.map(t => (
                                                <div
                                                    key={t}
                                                    className="absolute top-0 bottom-0 w-px theme-bg-secondary"
                                                    style={{ left: `${t * pixelsPerSecond}px` }}
                                                />
                                            ))}

                                            <div className="absolute inset-x-0 top-1/2 h-px theme-bg-tertiary pointer-events-none"/>

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
                                                        <div className={`absolute inset-0 bg-gradient-to-b ${trackColor.bg}`} style={{ opacity: track.solo ? 0.9 : 0.85 }}/>

                                                        <div className="relative px-1.5 py-0.5 flex items-center gap-1 bg-black/30">
                                                            <span className="text-[10px] truncate font-medium flex-1">{clip.name}</span>
                                                            {(clip.gain ?? 1) !== 1 && (
                                                                <span className="text-[9px] bg-black/40 px-1 rounded">
                                                                    {clip.gain! > 1 ? '+' : ''}{((clip.gain! - 1) * 100).toFixed(0)}%
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="absolute inset-x-0 top-5 bottom-0 overflow-hidden">
                                                            <svg
                                                                className="w-full h-full"
                                                                viewBox={`0 0 ${clipWidth} ${clipHeight - 16}`}
                                                                preserveAspectRatio="none"
                                                            >
                                                                {waveformPath ? (
                                                                    <path
                                                                        d={waveformPath}
                                                                        fill="rgba(255,255,255,0.5)"
                                                                        stroke="rgba(255,255,255,0.8)"
                                                                        strokeWidth="0.5"
                                                                    />
                                                                ) : waveform ? (

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

                                                                    <text x="50%" y="50%" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">Loading...</text>
                                                                )}

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

                                                        {selectedClipId === clip.id && !isLocked && (
                                                            <>
                                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize bg-white/30 hover:bg-white/60 transition-colors"/>
                                                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize bg-white/30 hover:bg-white/60 transition-colors"/>

                                                                <div
                                                                    className="absolute top-0 w-3 h-3 bg-yellow-400 rounded-full cursor-ew-resize border border-white shadow-md"
                                                                    style={{ left: `${fadeInWidth - 6}px`, transform: 'translateY(-1px)' }}
                                                                    title="Drag to adjust fade in"
                                                                />

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

                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none shadow-lg shadow-red-500/50"
                                                style={{ left: `${editorPlayhead * pixelsPerSecond}px` }}
                                            />

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

                <div className="h-14 border-t theme-border theme-bg-secondary flex items-center px-4 gap-3">
                    <div className="bg-black rounded px-3 py-1.5 font-mono text-lg text-green-400 tracking-wider w-32 text-center">
                        {formatTimeMs(editorPlayhead)}
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setEditorPlayhead(0); stopEditorTimeline(); }}
                            className="p-2 theme-hover rounded"
                            title="Go to Start (Home)"
                        >
                            <SkipBack size={18}/>
                        </button>
                        <button
                            onClick={() => setEditorPlayhead(prev => Math.max(0, prev - 5))}
                            className="p-2 theme-hover rounded"
                            title="Rewind 5s"
                        >
                            <Rewind size={18}/>
                        </button>
                        <button
                            onClick={() => { stopEditorTimeline(); }}
                            className={`p-2.5 rounded ${isEditorPlaying ? 'theme-bg-tertiary' : 'theme-hover'}`}
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
                            className="p-2 theme-hover rounded"
                            title="Forward 5s"
                        >
                            <FastForward size={18}/>
                        </button>
                        <button
                            onClick={() => {
                                const maxTime = Math.max(...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)), 0);
                                setEditorPlayhead(maxTime);
                            }}
                            className="p-2 theme-hover rounded"
                            title="Go to End (End)"
                        >
                            <SkipForward size={18}/>
                        </button>
                    </div>

                    <div className="w-px h-8 theme-bg-tertiary mx-2"/>
                    <button
                        onClick={() => setLoopEnabled(!loopEnabled)}
                        className={`p-2 rounded ${loopEnabled ? 'bg-blue-600' : 'theme-hover'}`}
                        title="Loop"
                    >
                        <Repeat size={16}/>
                    </button>

                    <div className="flex-1 flex items-center justify-center">
                        <span className="text-xs theme-text-muted">
                            Duration: {formatTime(Math.max(...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)), 0))}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Volume2 size={14} className="theme-text-muted"/>
                        <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={masterVolume}
                            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                            className="w-20 h-1.5 accent-purple-500"
                        />
                        <span className="text-xs theme-text-muted w-8">{Math.round(masterVolume * 100)}%</span>
                    </div>

                    <div className="w-px h-8 theme-bg-tertiary mx-2"/>
                    <button
                        onClick={exportTimeline}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-2 font-medium"
                        title="Export to WAV"
                    >
                        <Download size={14}/> Export
                    </button>
                </div>

                {contextMenu && (
                    <div
                        className="fixed theme-bg-secondary border theme-border rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.clipId && (
                            <>
                                <div className="px-3 py-1 text-[10px] theme-text-muted uppercase">Clip Actions</div>
                                <button
                                    onClick={() => duplicateClip(contextMenu.clipId!)}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2"
                                >
                                    <Copy size={12}/> Duplicate
                                </button>
                                <button
                                    onClick={() => { cutClip(); setContextMenu(null); }}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2"
                                >
                                    <Scissors size={12}/> Cut
                                </button>
                                <button
                                    onClick={() => { deleteClip(); setContextMenu(null); }}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2 text-red-400"
                                >
                                    <Trash2 size={12}/> Delete
                                </button>
                                <div className="border-t theme-border my-1"/>
                                <div className="px-3 py-1 text-[10px] theme-text-muted uppercase">Processing</div>
                                <button
                                    onClick={() => normalizeClip(contextMenu.clipId!)}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2"
                                >
                                    <BarChart3 size={12}/> Normalize
                                </button>
                                <button
                                    onClick={() => addFadeToClip(contextMenu.clipId!, 'in', 0.5)}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2"
                                >
                                    <ChevronRight size={12} className="rotate-180"/> Add Fade In
                                </button>
                                <button
                                    onClick={() => addFadeToClip(contextMenu.clipId!, 'out', 0.5)}
                                    className="w-full px-3 py-1.5 text-left text-sm theme-hover flex items-center gap-2"
                                >
                                    <ChevronRight size={12}/> Add Fade Out
                                </button>
                                <div className="border-t theme-border my-1"/>
                                <div className="px-3 py-1 text-[10px] theme-text-muted uppercase">Gain</div>
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
                                <div className="border-t theme-border my-1"/>
                                <div className="px-3 py-1 text-[10px] theme-text-muted uppercase">Color</div>
                                <div className="px-3 py-1.5 flex gap-1 flex-wrap">
                                    {TRACK_COLORS.map((color, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setClipColor(contextMenu.clipId!, i)}
                                            className={`w-5 h-5 rounded-full bg-gradient-to-b ${color.bg} border theme-border hover:scale-110 transition-transform`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

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
                                <span className="text-[9px] theme-bg-primary px-1 rounded whitespace-nowrap">{marker.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

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

            if (deck.audioFile && !waveform) {
                loadWaveform(deck.audioFile.path, deck.audioFile.id);
            }

            const setHotCue = (index: number) => {
                if (deck.hotCues[index] === null) {

                    setDeck(prev => {
                        const newCues = [...prev.hotCues];
                        newCues[index] = prev.currentTime;
                        return { ...prev, hotCues: newCues };
                    });
                } else {

                    if (audioRef.current) {
                        audioRef.current.currentTime = deck.hotCues[index]!;
                    }
                    setDeck(prev => ({ ...prev, currentTime: prev.hotCues[index]! }));
                }
            };

            const clearHotCue = (index: number, e: React.MouseEvent) => {
                e.preventDefault();
                setDeck(prev => {
                    const newCues = [...prev.hotCues];
                    newCues[index] = null;
                    return { ...prev, hotCues: newCues };
                });
            };

            const setLoopPoint = (point: 'in' | 'out') => {
                setDeck(prev => ({
                    ...prev,
                    [point === 'in' ? 'loopIn' : 'loopOut']: prev.currentTime,
                    loopActive: point === 'out' && prev.loopIn !== null
                }));
            };

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
                <div className="flex-1 flex flex-col theme-bg-primary min-w-0">
                    <div className={`h-8 flex items-center justify-between px-3 ${isLeft ? 'bg-blue-900/40' : 'bg-orange-900/40'} border-b theme-border`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${accentClass}`}>{label}</span>
                            <span className="text-[10px] theme-text-muted uppercase">Deck</span>
                        </div>
                        <span className="text-xs theme-text-muted truncate max-w-[150px]">{deck.audioFile?.name || 'No Track'}</span>
                    </div>

                    <div
                        className="h-8 bg-black/50 border-b theme-border relative cursor-pointer"
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
                        {deck.audioFile?.duration && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white"
                                style={{ left: `${(deck.currentTime / deck.audioFile.duration) * 100}%` }}
                            />
                        )}
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

                    <div className="h-20 bg-black border-b theme-border relative overflow-hidden">
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
                                    {(() => {
                                        const duration = deck.audioFile?.duration || 1;
                                        const visibleSeconds = 10;
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

                                    <line x1="50%" y1="0" x2="50%" y2="100" stroke="white" strokeWidth="2"/>

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
                            <div className="flex items-center justify-center h-full theme-text-muted text-sm">
                                {deck.audioFile ? 'Loading...' : 'Load a track'}
                            </div>
                        )}

                        <div className="absolute bottom-1 left-2 bg-black/70 px-1.5 py-0.5 rounded">
                            <span className="text-sm font-mono text-white">{formatTime(deck.currentTime)}</span>
                        </div>
                        <div className="absolute bottom-1 right-2 bg-black/70 px-1.5 py-0.5 rounded">
                            <span className="text-sm font-mono text-red-400">-{formatTime((deck.audioFile?.duration || 0) - deck.currentTime)}</span>
                        </div>
                    </div>

                    <div className="h-8 flex items-center justify-between px-2 theme-bg-primary border-b theme-border">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => nudgeDeck(deck, setDeck, audioRef, -0.02)}
                                className="px-1.5 py-0.5 theme-bg-secondary theme-hover rounded text-[9px] font-bold"
                                title="Nudge backward"
                            >-</button>
                            <div className="flex items-center gap-1">
                                <span className="text-base font-bold font-mono text-white">{deck.audioFile?.bpm || '---'}</span>
                                <span className="text-[8px] theme-text-muted">BPM</span>
                            </div>
                            <button
                                onClick={() => nudgeDeck(deck, setDeck, audioRef, 0.02)}
                                className="px-1.5 py-0.5 theme-bg-secondary theme-hover rounded text-[9px] font-bold"
                                title="Nudge forward"
                            >+</button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${deck.audioFile?.key ? (isLeft ? 'bg-blue-900/50 text-blue-300' : 'bg-orange-900/50 text-orange-300') : 'theme-text-muted'}`}>
                                {deck.audioFile?.key || '--'}
                            </span>
                            <button
                                onClick={() => setDeck(prev => ({ ...prev, keyLock: !prev.keyLock }))}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${deck.keyLock ? 'bg-green-600 text-white' : 'theme-bg-secondary theme-text-muted theme-hover'}`}
                                title="Key Lock"
                            >
                                KEY
                            </button>
                        </div>
                        <div className={`text-sm font-mono ${deck.speed !== 1 ? (deck.speed > 1 ? 'text-green-400' : 'text-red-400') : 'theme-text-muted'}`}>
                            {deck.speed > 1 ? '+' : ''}{((deck.speed - 1) * 100).toFixed(1)}%
                        </div>
                    </div>

                    <div className="flex-1 flex min-h-0">
                        <div className="w-20 border-r theme-border p-1.5 flex flex-col">
                            <div className="text-[9px] theme-text-muted text-center mb-1">EQ</div>
                            {(['high', 'mid', 'low'] as const).map(band => (
                                <div key={band} className="flex-1 flex items-center gap-0.5">
                                    <button
                                        onClick={() => setDeck(prev => ({
                                            ...prev,
                                            eqKill: { ...prev.eqKill, [band]: !prev.eqKill[band] }
                                        }))}
                                        className={`w-4 h-4 text-[8px] font-bold rounded ${
                                            deck.eqKill[band] ? 'bg-red-600 text-white' : 'theme-bg-secondary theme-text-muted theme-hover'
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
                            <div className="border-t theme-border mt-1 pt-1">
                                <div className="text-[9px] theme-text-muted text-center">FILTER</div>
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

                        <div className="flex-1 flex flex-col p-2 gap-2 min-w-0">
                            <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => {
                                        if (audioRef.current) audioRef.current.currentTime = deck.hotCues[0] || 0;
                                        setDeck(prev => ({ ...prev, currentTime: prev.hotCues[0] || 0 }));
                                    }}
                                    className="p-2 theme-bg-secondary theme-hover rounded text-yellow-400"
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

                                        const otherDeck = isLeft ? deckB : deckA;
                                        if (otherDeck.audioFile?.bpm && deck.audioFile?.bpm) {
                                            const ratio = otherDeck.audioFile.bpm / deck.audioFile.bpm;
                                            const newSpeed = Math.max(0.5, Math.min(2, ratio));
                                            setDeck(prev => ({ ...prev, speed: newSpeed }));
                                            if (audioRef.current) audioRef.current.playbackRate = newSpeed;
                                        }
                                    }}
                                    className={`p-2 rounded ${deck.speed === 1 ? 'theme-bg-secondary theme-hover' : 'bg-purple-600'}`}
                                    title="Sync BPM"
                                >
                                    <Repeat size={14}/>
                                </button>
                            </div>

                            <div>
                                <div className="text-[9px] theme-text-muted text-center mb-1">HOT CUES</div>
                                <div className="grid grid-cols-4 gap-1">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                                        <button
                                            key={i}
                                            onClick={() => setHotCue(i)}
                                            onContextMenu={(e) => clearHotCue(i, e)}
                                            className={`h-6 rounded text-[10px] font-bold transition-colors ${
                                                deck.hotCues[i] !== null
                                                    ? 'text-white shadow-lg'
                                                    : 'theme-bg-secondary theme-hover theme-text-muted'
                                            }`}
                                            style={deck.hotCues[i] !== null ? { backgroundColor: HOT_CUE_COLORS[i] } : {}}
                                            title={deck.hotCues[i] !== null ? `${formatTime(deck.hotCues[i]!)} (right-click to clear)` : 'Set cue'}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-[9px] theme-text-muted text-center mb-1">LOOP</div>
                                <div className="flex gap-1 mb-1">
                                    <button
                                        onClick={() => setLoopPoint('in')}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopIn !== null ? 'bg-green-600' : 'theme-bg-secondary theme-hover'
                                        }`}
                                    >
                                        IN
                                    </button>
                                    <button
                                        onClick={() => setLoopPoint('out')}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopOut !== null ? 'bg-green-600' : 'theme-bg-secondary theme-hover'
                                        }`}
                                    >
                                        OUT
                                    </button>
                                    <button
                                        onClick={() => setDeck(prev => ({ ...prev, loopActive: !prev.loopActive }))}
                                        disabled={deck.loopIn === null || deck.loopOut === null}
                                        className={`flex-1 h-5 rounded text-[9px] font-bold ${
                                            deck.loopActive ? 'bg-green-500 animate-pulse' : 'theme-bg-secondary theme-hover'
                                        } disabled:opacity-40`}
                                    >
                                        {deck.loopActive ? 'ON' : 'OFF'}
                                    </button>
                                    <button
                                        onClick={() => setDeck(prev => ({ ...prev, loopIn: null, loopOut: null, loopActive: false }))}
                                        className="flex-1 h-5 rounded text-[9px] font-bold theme-bg-secondary hover:bg-red-600"
                                    >
                                        CLR
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-0.5">
                                    {LOOP_SIZES.map(size => (
                                        <button
                                            key={size}
                                            onClick={() => setAutoLoop(size)}
                                            className="h-5 rounded text-[9px] theme-bg-secondary hover:bg-purple-600"
                                        >
                                            {size >= 1 ? size : `1/${1/size}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="w-16 border-l theme-border p-1.5 flex flex-col items-center">
                            <div className="text-[9px] theme-text-muted mb-1">TEMPO</div>
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
                                className="mt-1 w-full py-0.5 text-[9px] theme-bg-secondary theme-hover rounded"
                            >
                                0%
                            </button>

                            <div className="border-t theme-border mt-2 pt-2 w-full flex flex-col items-center">
                                <div className="text-[9px] theme-text-muted mb-1">VOL</div>
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

                    <div className="h-8 border-t theme-border flex items-center px-2 gap-2">
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
                                selectedAudio ? `${bgAccent} ${bgAccentHover}` : 'theme-bg-secondary theme-text-muted'
                            }`}
                        >
                            {selectedAudio ? `Load: ${selectedAudio.name}` : 'Select track from library'}
                        </button>
                        <button
                            onClick={() => setDeck(prev => ({ ...defaultDeckState, volume: prev.volume }))}
                            className="p-1.5 theme-bg-secondary hover:bg-red-600 rounded"
                            title="Eject"
                        >
                            <X size={12}/>
                        </button>
                    </div>

                    <audio
                        ref={audioRef}
                        onTimeUpdate={(e) => {
                            const time = (e.target as HTMLAudioElement).currentTime;
                            setDeck(prev => ({ ...prev, currentTime: time }));

                            if (deck.loopActive && deck.loopOut !== null && time >= deck.loopOut && deck.loopIn !== null) {
                                (e.target as HTMLAudioElement).currentTime = deck.loopIn;
                            }
                        }}
                        onEnded={() => setDeck(prev => ({ ...prev, playing: false, currentTime: 0 }))}
                        onLoadedMetadata={async (e) => {
                            const audio = e.target as HTMLAudioElement;
                            if (deck.audioFile) {

                                setDeck(prev => ({
                                    ...prev,
                                    audioFile: prev.audioFile ? { ...prev.audioFile, duration: audio.duration } : null
                                }));

                                try {
                                    const { bpm, beats, key } = await detectBeats(deck.audioFile.path);
                                    setDeck(prev => ({
                                        ...prev,
                                        audioFile: prev.audioFile ? { ...prev.audioFile, bpm, key } : null,
                                        beatGrid: beats
                                    }));
                                } catch (err) {
                                    console.error('Beat detection failed:', err);

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
            <div className="flex-1 flex flex-col overflow-hidden theme-bg-primary">
                <div className="h-10 border-b theme-border flex items-center px-4 gap-4 theme-bg-primary">
                    <div className="flex items-center gap-2">
                        <Disc3 className="text-purple-400" size={18}/>
                        <span className="text-sm font-bold text-purple-400">DJ MIXER</span>
                    </div>
                    <div className="flex-1"/>
                    <div className="flex items-center gap-3">
                        <span className="text-xs theme-text-muted">MASTER</span>
                        <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={djMasterGain}
                            onChange={(e) => setDjMasterGain(parseFloat(e.target.value))}
                            className="w-24 h-1.5 accent-purple-500"
                        />
                        <span className="text-xs theme-text-muted w-8">{Math.round(djMasterGain * 100)}%</span>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {renderDeck(deckA, setDeckA, 'A', deckARef, true)}

                    <div className="w-36 theme-bg-primary border-x theme-border flex flex-col">
                        <div className="h-32 p-2 border-b theme-border">
                            <div className="text-[9px] theme-text-muted text-center mb-1">LEVEL</div>
                            <div className="flex justify-center gap-3 h-full pb-2">
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckA.playing ? 60 + Math.random() * 30 : 0) * deckA.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckA.playing ? 55 + Math.random() * 35 : 0) * deckA.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, ((deckA.playing ? 60 : 0) + (deckB.playing ? 60 : 0)) / 2 * djMasterGain)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, ((deckA.playing ? 55 : 0) + (deckB.playing ? 55 : 0)) / 2 * djMasterGain)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
                                        <div
                                            className="absolute bottom-0 w-full rounded-sm"
                                            style={{
                                                height: `${Math.min(100, (deckB.playing ? 58 + Math.random() * 32 : 0) * deckB.volume)}%`,
                                                background: 'linear-gradient(to top, #22c55e, #eab308, #ef4444)'
                                            }}
                                        />
                                    </div>
                                    <div className="w-2 h-full theme-bg-secondary rounded-sm relative overflow-hidden">
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
                            <div className="flex justify-between text-[8px] theme-text-muted">
                                <span className="text-blue-400">A</span>
                                <span>M</span>
                                <span className="text-orange-400">B</span>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center p-3">
                            <div className="text-[9px] theme-text-muted mb-2">CROSSFADER</div>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={crossfader}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setCrossfader(val);

                                    let volA = 1, volB = 1;
                                    if (crossfaderCurve === 'smooth') {
                                        volA = Math.cos(val * Math.PI / 2);
                                        volB = Math.sin(val * Math.PI / 2);
                                    } else if (crossfaderCurve === 'cut') {

                                        volA = val < 0.1 ? 1 : val > 0.9 ? 0 : 1 - ((val - 0.1) / 0.8);
                                        volB = val > 0.9 ? 1 : val < 0.1 ? 0 : (val - 0.1) / 0.8;
                                    } else {

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

                            <div className="mt-3 w-full">
                                <div className="text-[9px] theme-text-muted text-center mb-1">MASTER FX</div>
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
                                                        : 'theme-bg-secondary theme-text-muted theme-hover'
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

                            <div className="mt-2 flex gap-1 w-full">
                                {(['linear', 'cut', 'smooth'] as const).map(curve => (
                                    <button
                                        key={curve}
                                        onClick={() => setCrossfaderCurve(curve)}
                                        className={`flex-1 py-0.5 text-[8px] rounded ${
                                            crossfaderCurve === curve ? 'bg-purple-600' : 'theme-bg-secondary theme-hover'
                                        }`}
                                    >
                                        {curve}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => {

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

    useEffect(() => {
        if (selectedAudio && selectedAudio.path && activeMode === 'analysis') {
            analyzeAudio(selectedAudio.path);
        }
    }, [selectedAudio?.path, activeMode, analyzeAudio]);

    const renderAnalysis = () => {
        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-12 border-b theme-border flex items-center px-4 gap-2 theme-bg-secondary">
                    {(['waveform', 'spectrum', 'spectrogram'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setAnalysisMode(mode)}
                            className={`px-3 py-1.5 rounded text-sm capitalize ${
                                analysisMode === mode
                                    ? 'bg-purple-600 text-white'
                                    : 'theme-bg-tertiary theme-hover theme-text-secondary'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                    <div className="flex-1"/>
                    {selectedAudio && (
                        <button
                            onClick={() => analyzeAudio(selectedAudio.path)}
                            className="px-3 py-1.5 theme-bg-tertiary theme-hover rounded text-sm flex items-center gap-1"
                        >
                            <RefreshCw size={14}/> Refresh
                        </button>
                    )}
                </div>

                <div className="flex-1 p-4">
                    <div className="w-full h-full theme-bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                        {selectedAudio ? (
                            <div className="w-full h-full p-4 flex flex-col">
                                {analysisMode === 'waveform' && (
                                    <div className="flex-1 flex items-center">
                                        <div className="w-full h-48 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 500 100" preserveAspectRatio="none">
                                                <line x1="0" y1="50" x2="500" y2="50" stroke="#4B5563" strokeWidth="0.5"/>
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
                                <Activity size={64} className="mx-auto theme-text-muted mb-4"/>
                                <p className="theme-text-muted">Select an audio file to analyze</p>
                            </div>
                        )}
                    </div>
                </div>

                {selectedAudio && (
                    <div className="h-32 border-t theme-border p-4 theme-bg-secondary">
                        <div className="grid grid-cols-5 gap-4">
                            <div>
                                <p className="text-xs theme-text-muted">Duration</p>
                                <p className="text-lg font-mono">{formatTime(analysisAudioBuffer?.duration || selectedAudio.duration || 0)}</p>
                            </div>
                            <div>
                                <p className="text-xs theme-text-muted">Sample Rate</p>
                                <p className="text-lg font-mono">{analysisAudioBuffer ? `${(analysisAudioBuffer.sampleRate / 1000).toFixed(1)} kHz` : '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs theme-text-muted">Channels</p>
                                <p className="text-lg font-mono">{analysisAudioBuffer?.numberOfChannels || '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs theme-text-muted">BPM (est.)</p>
                                <p className="text-lg font-mono">{selectedAudio.bpm || '---'}</p>
                            </div>
                            <div>
                                <p className="text-xs theme-text-muted">Key (est.)</p>
                                <p className="text-lg font-mono">{selectedAudio.key || '---'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderNotation = () => {
        const pianoKeys = Array.from({ length: 88 }, (_, i) => i + 21);
        const guitarStrings = ['E', 'B', 'G', 'D', 'A', 'E'];
        const measures = notationMeasures;
        const beatsPerMeasure = notationTimeSignature[0];
        const totalBeats = measures * beatsPerMeasure;

        const visibleKeys = pianoKeys; // Full 88 keys
        const noteHeight = 14;
        const beatWidth = 40 * notationZoom;

        const handlePianoRollMouseDown = (e: React.MouseEvent, noteIdx: number, type: 'move' | 'resize') => {
            e.stopPropagation();
            e.preventDefault();
            pushNotationUndo();
            setPianoRollDrag({
                type,
                noteIdx,
                startX: e.clientX,
                startY: e.clientY,
                origNote: { ...pianoNotes[noteIdx] },
            });
        };

        const handlePianoRollMouseMove = (e: React.MouseEvent) => {
            if (!pianoRollDrag) return;
            const dx = e.clientX - pianoRollDrag.startX;
            const dy = e.clientY - pianoRollDrag.startY;
            const { type, noteIdx, origNote } = pianoRollDrag;

            if (type === 'resize') {
                const durationDelta = dx / beatWidth;
                const newDuration = Math.max(0.125, origNote.duration + durationDelta);
                const quantized = Math.round(newDuration * 4) / 4;
                setPianoNotes(prev => prev.map((n, i) => i === noteIdx ? { ...n, duration: Math.max(0.125, quantized) } : n));
            } else {
                const beatDelta = Math.round((dx / beatWidth) * 4) / 4;
                const noteDelta = -Math.round(dy / noteHeight);
                setPianoNotes(prev => prev.map((n, i) => i === noteIdx ? {
                    ...n,
                    start: Math.max(0, origNote.start + beatDelta),
                    note: Math.max(21, Math.min(108, origNote.note + noteDelta)),
                } : n));
            }
        };

        const handlePianoRollMouseUp = () => {
            setPianoRollDrag(null);
        };

        const renderPianoRoll = () => (
            <div
                className="flex-1 flex overflow-hidden"
                style={{ background: '#121218' }}
                onMouseMove={handlePianoRollMouseMove}
                onMouseUp={handlePianoRollMouseUp}
                onMouseLeave={handlePianoRollMouseUp}
            >
                {/* Piano keyboard sidebar */}
                <div className="flex flex-col overflow-y-auto overflow-x-hidden" ref={pianoRollScrollRef}
                    style={{ scrollbarWidth: 'none', width: '52px', background: '#0d0d12' }}
                    onScroll={(e) => {
                        const gridEl = e.currentTarget.nextElementSibling as HTMLElement;
                        if (gridEl) gridEl.scrollTop = e.currentTarget.scrollTop;
                    }}
                >
                    {[...visibleKeys].reverse().map(note => {
                        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
                        const isC = note % 12 === 0;
                        const isE = note % 12 === 4;
                        return (
                            <div
                                key={note}
                                onClick={() => playNote(note)}
                                className="shrink-0 cursor-pointer flex items-center justify-end pr-1"
                                style={{
                                    height: `${noteHeight}px`,
                                    background: isBlack
                                        ? 'linear-gradient(90deg, #1a1a24, #15151e)'
                                        : isC ? '#2a2a38' : '#1e1e2a',
                                    borderBottom: isC ? '1px solid rgba(99,102,241,0.25)' : isE ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.02)',
                                    color: isC ? 'rgba(165,180,252,0.9)' : isBlack ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.35)',
                                    fontSize: '8px',
                                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                                    fontWeight: isC ? 700 : 400,
                                    letterSpacing: '0.5px',
                                }}
                            >
                                {isC ? noteToName(note) : note % 12 === 5 ? 'F' : ''}
                            </div>
                        );
                    })}
                </div>

                {/* Grid area */}
                <div className="flex-1 overflow-auto" ref={pianoRollGridRef}
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 #1a1a1a' }}
                    onScroll={(e) => {
                        if (pianoRollScrollRef.current) pianoRollScrollRef.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                >
                    <div
                        className="relative"
                        style={{
                            width: `${totalBeats * beatWidth}px`,
                            minWidth: '100%',
                            height: `${visibleKeys.length * noteHeight}px`,
                        }}
                        onClick={(e) => {
                            if (pianoRollDrag) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = (e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0));
                            const y = (e.clientY - rect.top + (e.currentTarget.parentElement?.scrollTop || 0));
                            const beat = Math.floor((x / beatWidth) * 4) / 4;
                            const rowIdx = Math.floor(y / noteHeight);
                            const note = visibleKeys[visibleKeys.length - 1 - rowIdx];
                            if (note >= 21 && note <= 108) {
                                addPianoNote(note, beat, inputNoteDuration, 0.8);
                                playNote(note);
                            }
                        }}
                    >
                        {/* Row backgrounds */}
                        {visibleKeys.map((note, idx) => {
                            const rowIdx = visibleKeys.length - 1 - idx;
                            const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
                            const isC = note % 12 === 0;
                            return (
                                <div
                                    key={note}
                                    className="absolute left-0 right-0"
                                    style={{
                                        top: `${rowIdx * noteHeight}px`,
                                        height: `${noteHeight}px`,
                                        backgroundColor: isBlack ? 'rgba(0,0,0,0.3)' : 'rgba(30,30,45,0.15)',
                                        borderBottom: isC ? '1px solid rgba(99,102,241,0.15)' : '1px solid rgba(255,255,255,0.018)',
                                    }}
                                />
                            );
                        })}

                        {/* Beat/measure lines */}
                        {Array.from({ length: totalBeats }).map((_, beat) => {
                            const isMeasure = beat % beatsPerMeasure === 0;
                            const isHalf = beat % (beatsPerMeasure / 2) === 0 && !isMeasure;
                            return (
                                <div
                                    key={beat}
                                    className="absolute top-0 bottom-0"
                                    style={{
                                        left: `${beat * beatWidth}px`,
                                        width: '1px',
                                        backgroundColor: isMeasure ? 'rgba(99,102,241,0.3)' : isHalf ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)',
                                    }}
                                />
                            );
                        })}

                        {/* Measure numbers */}
                        {Array.from({ length: Math.ceil(totalBeats / beatsPerMeasure) }).map((_, m) => (
                            <div
                                key={m}
                                className="absolute pointer-events-none select-none"
                                style={{
                                    left: `${m * beatsPerMeasure * beatWidth + 4}px`,
                                    top: '3px',
                                    fontSize: '9px',
                                    color: 'rgba(99,102,241,0.45)',
                                    fontWeight: 700,
                                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                                    letterSpacing: '0.5px',
                                }}
                            >
                                {m + 1}
                            </div>
                        ))}

                        {/* Notes */}
                        {pianoNotes.map((note, idx) => {
                            const keyIdx = visibleKeys.indexOf(note.note);
                            if (keyIdx === -1) return null;
                            const rowIdx = visibleKeys.length - 1 - keyIdx;
                            const noteW = Math.max(note.duration * beatWidth, 6);
                            const isSelected = selectedNotes.has(idx);
                            const hue = (note.note % 12) * 30;
                            return (
                                <div
                                    key={idx}
                                    className="absolute cursor-grab group"
                                    style={{
                                        top: `${rowIdx * noteHeight + 1}px`,
                                        left: `${note.start * beatWidth}px`,
                                        width: `${noteW}px`,
                                        height: `${noteHeight - 2}px`,
                                        borderRadius: '2px',
                                        background: isSelected
                                            ? 'linear-gradient(180deg, #fbbf24, #f59e0b)'
                                            : `linear-gradient(180deg, hsla(${hue},75%,60%,${0.7 + note.velocity * 0.3}), hsla(${hue},65%,42%,${0.65 + note.velocity * 0.35}))`,
                                        border: isSelected ? '1px solid #fcd34d' : `1px solid hsla(${hue},60%,70%,0.3)`,
                                        boxShadow: isSelected
                                            ? '0 0 10px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
                                            : `0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 hsla(${hue},60%,80%,0.15)`,
                                        zIndex: isSelected ? 10 : 1,
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedNotes(prev => {
                                            const next = new Set(prev);
                                            if (e.shiftKey) {
                                                if (next.has(idx)) next.delete(idx); else next.add(idx);
                                            } else {
                                                if (next.has(idx) && next.size === 1) next.delete(idx);
                                                else { next.clear(); next.add(idx); }
                                            }
                                            return next;
                                        });
                                    }}
                                    onMouseDown={(e) => { if (e.button === 0) handlePianoRollMouseDown(e, idx, 'move'); }}
                                    title={`${noteToName(note.note)} | Beat ${note.start} | Dur ${note.duration} | Vel ${Math.round(note.velocity * 100)}%`}
                                >
                                    <span className="pointer-events-none select-none pl-0.5" style={{
                                        fontSize: '7px', color: 'rgba(255,255,255,0.9)', fontWeight: 600,
                                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                                        textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                                    }}>
                                        {noteW > 30 ? noteToName(note.note) : ''}
                                    </span>
                                    {/* Velocity bar at bottom */}
                                    <div className="absolute bottom-0 left-0 pointer-events-none" style={{
                                        height: '2px', borderRadius: '0 0 2px 2px',
                                        width: `${note.velocity * 100}%`,
                                        background: isSelected ? 'rgba(255,255,255,0.5)' : `hsla(${hue},80%,75%,0.5)`,
                                    }}/>
                                    {/* Resize handle */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                                        style={{ background: 'rgba(255,255,255,0.35)', borderRadius: '0 2px 2px 0' }}
                                        onMouseDown={(e) => { e.stopPropagation(); handlePianoRollMouseDown(e, idx, 'resize'); }}
                                    />
                                </div>
                            );
                        })}

                        {/* Playhead */}
                        {(isNotationPlaying || notationPlayhead > 0) && (
                            <div
                                className="absolute top-0 pointer-events-none z-30"
                                style={{ left: `${notationPlayhead * beatWidth}px`, height: `${visibleKeys.length * noteHeight}px` }}
                            >
                                <div className="absolute top-0 bottom-0" style={{
                                    left: '-6px', width: '13px',
                                    background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.08), rgba(239,68,68,0.12), rgba(239,68,68,0.08), transparent)',
                                }}/>
                                <div style={{
                                    position: 'absolute', top: '-2px', left: '-5px',
                                    width: 0, height: 0,
                                    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                                    borderTop: '8px solid #ef4444',
                                    filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.8))',
                                }}/>
                                <div style={{
                                    width: '2px', height: '100%',
                                    background: 'linear-gradient(180deg, #ef4444, #dc2626)',
                                    transform: 'translateX(-1px)',
                                    boxShadow: '0 0 8px rgba(239,68,68,0.5), 0 0 2px rgba(239,68,68,0.8)',
                                }}/>
                            </div>
                        )}

                        {/* Input cursor */}
                        {!isNotationPlaying && (
                            <div
                                className="absolute top-0 bottom-0 pointer-events-none z-10"
                                style={{
                                    left: `${inputCursor * beatWidth}px`,
                                    width: '1px',
                                    background: 'rgba(52,211,153,0.4)',
                                    boxShadow: '0 0 6px rgba(52,211,153,0.2)',
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        );

        const renderSheetMusic = () => {

            const midiToVexPitch = (midi: number): string => {
                const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = Math.floor(midi / 12) - 1;
                const name = names[midi % 12];
                return `${name}/${octave}`;
            };

            const quantizeDuration = (dur: number): string => {
                if (dur >= 3.5) return 'w';
                if (dur >= 1.75) return 'h';
                if (dur >= 0.875) return 'q';
                if (dur >= 0.4375) return '8';
                if (dur >= 0.21875) return '16';
                return '32';
            };

            const durationBeats = (d: string): number => {
                const map: Record<string, number> = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25, '32': 0.125 };
                return map[d] || 1;
            };

            const groupedMeasures: Array<Array<{ note: number; start: number; duration: number; velocity: number }>> = [];
            for (let m = 0; m < measures; m++) {
                const measureStart = m * beatsPerMeasure;
                const measureEnd = measureStart + beatsPerMeasure;
                const notesInMeasure = pianoNotes.filter(n => n.start >= measureStart && n.start < measureEnd);
                groupedMeasures.push(notesInMeasure);
            }

            const renderVexFlow = (container: HTMLDivElement | null) => {
                if (!container) return;
                // Skip re-render if content hasn't changed (prevents 60fps VexFlow rebuilds during playback)
                const contentKey = `${pianoNotes.map(n => `${n.note}:${n.start}:${n.duration}`).join(',')}|${notationKeySignature}|${notationClef}|${notationTimeSignature.join('/')}|${measures}`;
                if (container.dataset.vfKey === contentKey) return;
                container.dataset.vfKey = contentKey;
                container.innerHTML = '';
                staveLayoutRef.current = [];

                const measuresPerLine = 4;
                const staveStartX = 50;
                const pageWidth = 1100;
                const staveWidth = Math.floor((pageWidth - staveStartX - 30) / measuresPerLine);
                const lineHeight = notationClef === 'grand' ? 240 : 150;
                const totalLines = Math.ceil(measures / measuresPerLine);
                const totalHeight = Math.max(totalLines * lineHeight + 80, 500);

                const renderer = new VFRenderer(container, VFRenderer.Backends.SVG);
                renderer.resize(pageWidth, totalHeight);
                const context = renderer.getContext();
                context.setFont('Arial', 10);

                // Style SVG for professional appearance
                const svgEl = container.querySelector('svg');
                if (svgEl) {
                    svgEl.style.overflow = 'visible';
                    // Thicken staff lines and barlines
                    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
                    style.textContent = `
                        .vf-stave .vf-stave-section rect { stroke-width: 0.8; }
                        line.vf-barline { stroke-width: 1.2 !important; }
                    `;
                    svgEl.prepend(style);
                }

                for (let line = 0; line < totalLines; line++) {
                    const y = line * lineHeight + 30;

                    for (let mInLine = 0; mInLine < measuresPerLine; mInLine++) {
                        const mIdx = line * measuresPerLine + mInLine;
                        if (mIdx >= measures) break;

                        const x = staveStartX + mInLine * staveWidth;
                        const isFirstInLine = mInLine === 0;
                        const isFirstMeasure = mIdx === 0;

                        const trebleStave = new Stave(x, y, staveWidth);
                        if (isFirstInLine) trebleStave.addClef('treble');
                        if (isFirstMeasure) {
                            trebleStave.addTimeSignature(`${notationTimeSignature[0]}/${notationTimeSignature[1]}`);
                            if (notationKeySignature !== 'C') {
                                trebleStave.addKeySignature(notationKeySignature);
                            }
                        }
                        // Add measure number above the stave
                        if (isFirstInLine || mIdx > 0) {
                            trebleStave.setMeasure(mIdx + 1);
                        }
                        trebleStave.setContext(context).draw();

                        let bassStave: Stave | null = null;
                        if (notationClef === 'grand') {
                            bassStave = new Stave(x, y + 100, staveWidth);
                            if (isFirstInLine) bassStave.addClef('bass');
                            if (isFirstMeasure) {
                                bassStave.addTimeSignature(`${notationTimeSignature[0]}/${notationTimeSignature[1]}`);
                                if (notationKeySignature !== 'C') {
                                    bassStave.addKeySignature(notationKeySignature);
                                }
                            }
                            bassStave.setContext(context).draw();

                            if (isFirstInLine) {
                                new StaveConnector(trebleStave, bassStave).setType('single').setContext(context).draw();
                                new StaveConnector(trebleStave, bassStave).setType('brace').setContext(context).draw();
                            }
                        }

                        try {
                            staveLayoutRef.current.push({
                                x, y, width: staveWidth, measureIdx: mIdx,
                                clef: notationClef === 'bass' ? 'bass' : 'treble',
                                topLineY: trebleStave.getYForLine(0),
                                bottomLineY: trebleStave.getYForLine(4),
                            });
                            if (bassStave) {
                                staveLayoutRef.current.push({
                                    x, y: y + 90, width: staveWidth, measureIdx: mIdx,
                                    clef: 'bass',
                                    topLineY: bassStave.getYForLine(0),
                                    bottomLineY: bassStave.getYForLine(4),
                                });
                            }
                        } catch {}

                        const measureNotes = groupedMeasures[mIdx] || [];

                        const trebleNotes: StaveNote[] = [];
                        const bassNotes: StaveNote[] = [];

                        if (measureNotes.length === 0) {

                            trebleNotes.push(new StaveNote({
                                clef: 'treble',
                                keys: ['B/4'],
                                duration: 'wr',
                            }));
                            if (notationClef === 'grand') {
                                bassNotes.push(new StaveNote({
                                    clef: 'bass',
                                    keys: ['D/3'],
                                    duration: 'wr',
                                }));
                            }
                        } else {

                            const sorted = [...measureNotes].sort((a, b) => a.start - b.start || a.note - b.note);
                            const measureStart = mIdx * beatsPerMeasure;
                            let trebleBeatsFilled = 0;
                            let bassBeatsFilled = 0;

                            const groups: Array<typeof measureNotes> = [];
                            for (const n of sorted) {
                                const last = groups[groups.length - 1];
                                if (last && Math.abs(last[0].start - n.start) < 0.01) {
                                    last.push(n);
                                } else {
                                    groups.push([n]);
                                }
                            }

                            for (const group of groups) {

                                const trebleGroup = group.filter(n => !(n.note < 60 && notationClef === 'grand'));
                                const bassGroup = group.filter(n => n.note < 60 && notationClef === 'grand');

                                const buildChordNote = (notes: typeof group, clef: string) => {
                                    if (notes.length === 0) return null;
                                    const maxDur = Math.max(...notes.map(n => n.duration));
                                    const vexDuration = quantizeDuration(maxDur);
                                    const beats = durationBeats(vexDuration);
                                    const keys = notes.map(n => midiToVexPitch(n.note));
                                    try {
                                        const staveNote = new StaveNote({ clef, keys, duration: vexDuration });
                                        keys.forEach((pitch, idx) => {
                                            const noteName = pitch.split('/')[0];
                                            if (noteName.includes('#')) staveNote.addModifier(new Accidental('#'), idx);
                                            else if (noteName.includes('b')) staveNote.addModifier(new Accidental('b'), idx);
                                        });
                                        return { staveNote, beats };
                                    } catch { return null; }
                                };

                                const trebleChord = buildChordNote(trebleGroup, 'treble');
                                if (trebleChord) {
                                    trebleNotes.push(trebleChord.staveNote);
                                    trebleBeatsFilled += trebleChord.beats;
                                }
                                const bassChord = buildChordNote(bassGroup, 'bass');
                                if (bassChord) {
                                    bassNotes.push(bassChord.staveNote);
                                    bassBeatsFilled += bassChord.beats;
                                }
                            }

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

                        try {
                            const trebleVoice = new Voice({ numBeats: beatsPerMeasure, beatValue: notationTimeSignature[1] })
                                .setMode(Voice.Mode.SOFT);
                            trebleVoice.addTickables(trebleNotes);

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

                        }
                    }
                }
            };

            const sheetNoteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            const sheetNoteNamesFull = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

            const addSheetNote = (noteName: string, octave: number) => {
                const noteIdx = sheetNoteNamesFull.indexOf(noteName);
                if (noteIdx === -1) return;
                const midi = (octave + 1) * 12 + noteIdx;
                addPianoNote(midi, inputCursor, inputNoteDuration, 0.8);
                playNote(midi);
            };

            const addSheetRest = () => {

                setInputCursor(prev => prev + inputNoteDuration);
            };

            const snapToStaff = (container: HTMLDivElement, clientX: number, clientY: number) => {
                if (staveLayoutRef.current.length === 0) return null;
                const rect = container.getBoundingClientRect();
                const svgX = (clientX - rect.left) / notationZoom;
                const svgY = (clientY - rect.top) / notationZoom;

                let closestStave: typeof staveLayoutRef.current[0] | null = null;
                let minDist = Infinity;
                for (const stave of staveLayoutRef.current) {
                    const margin = 25;
                    if (svgX >= stave.x && svgX <= stave.x + stave.width &&
                        svgY >= stave.topLineY - margin && svgY <= stave.bottomLineY + margin) {
                        const centerY = (stave.topLineY + stave.bottomLineY) / 2;
                        const dist = Math.abs(svgY - centerY);
                        if (dist < minDist) { minDist = dist; closestStave = stave; }
                    }
                }
                if (!closestStave) return null;

                const lineSpacing = (closestStave.bottomLineY - closestStave.topLineY) / 4;
                const halfLine = lineSpacing / 2;
                const staffPos = Math.round((svgY - closestStave.topLineY) / halfLine);
                const snappedSvgY = closestStave.topLineY + staffPos * halfLine;
                const midi = staffPositionToMidi(staffPos, closestStave.clef);

                const xRatio = (svgX - closestStave.x) / closestStave.width;
                const beatInMeasure = Math.max(0, Math.min(beatsPerMeasure - 0.25, xRatio * beatsPerMeasure));
                const quantStep = Math.min(inputNoteDuration, 0.5);
                const quantizedBeat = Math.round(beatInMeasure / quantStep) * quantStep;
                const snappedSvgX = closestStave.x + (quantizedBeat / beatsPerMeasure) * closestStave.width;
                const globalBeat = closestStave.measureIdx * beatsPerMeasure + quantizedBeat;

                const screenX = rect.left + snappedSvgX * notationZoom;
                const screenY = rect.top + snappedSvgY * notationZoom;

                return { midi, globalBeat, screenX, screenY, staffPos, clef: closestStave.clef };
            };

            const findNoteAt = (midi: number, beat: number): number | null => {
                for (let i = 0; i < pianoNotes.length; i++) {
                    const n = pianoNotes[i];
                    if (Math.abs(n.start - beat) < 0.3 && Math.abs(n.note - midi) <= 1) return i;
                }
                return null;
            };

            const positionGhost = (scrollContainer: HTMLElement, snap: NonNullable<ReturnType<typeof snapToStaff>>, dragging: boolean) => {
                const ghost = ghostNoteRef.current;
                const label = ghostLabelRef.current;
                if (!ghost || !label) return;

                const scrollRect = scrollContainer.getBoundingClientRect();
                const gx = snap.screenX - scrollRect.left + scrollContainer.scrollLeft;
                const gy = snap.screenY - scrollRect.top + scrollContainer.scrollTop;

                ghost.style.display = 'block';
                ghost.style.left = `${gx - 6}px`;
                ghost.style.top = `${gy - 6}px`;
                ghost.style.background = dragging ? 'rgba(234, 88, 12, 0.6)' : 'rgba(147, 51, 234, 0.5)';
                ghost.style.borderColor = dragging ? 'rgba(234, 88, 12, 0.9)' : 'rgba(147, 51, 234, 0.8)';
                ghost.style.width = dragging ? '14px' : '12px';
                ghost.style.height = dragging ? '14px' : '12px';

                label.style.display = 'block';
                label.style.left = `${gx + 12}px`;
                label.style.top = `${gy - 10}px`;
                label.style.color = dragging ? 'rgba(234, 88, 12, 0.9)' : 'rgba(147, 51, 234, 0.9)';
                label.textContent = noteToName(snap.midi);
            };

            const hideGhost = () => {
                if (ghostNoteRef.current) ghostNoteRef.current.style.display = 'none';
                if (ghostLabelRef.current) ghostLabelRef.current.style.display = 'none';
            };

            const handleStaffMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                const vfContainer = e.currentTarget.querySelector('div[style]') as HTMLDivElement;
                if (!vfContainer) return;
                const snap = snapToStaff(vfContainer, e.clientX, e.clientY);
                if (!snap) { hideGhost(); return; }

                const dragging = dragNoteRef.current !== null;

                if (dragging) {

                    positionGhost(e.currentTarget, snap, true);
                    e.currentTarget.style.cursor = 'grabbing';
                } else {

                    const hoverIdx = findNoteAt(snap.midi, snap.globalBeat);
                    if (hoverIdx !== null) {
                        e.currentTarget.style.cursor = 'grab';
                    } else {
                        e.currentTarget.style.cursor = 'crosshair';
                    }
                    positionGhost(e.currentTarget, snap, false);
                }
            };

            const handleStaffMouseLeave = () => {
                hideGhost();
                dragNoteRef.current = null;
            };

            const handleStaffMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
                if (e.button !== 0) return;
                const vfContainer = e.currentTarget.querySelector('div[style]') as HTMLDivElement;
                if (!vfContainer) return;
                const snap = snapToStaff(vfContainer, e.clientX, e.clientY);
                if (!snap) return;

                const noteIdx = findNoteAt(snap.midi, snap.globalBeat);
                if (noteIdx !== null) {
                    e.preventDefault();
                    dragNoteRef.current = {
                        idx: noteIdx,
                        origMidi: pianoNotes[noteIdx].note,
                        origBeat: pianoNotes[noteIdx].start,
                    };
                }
            };

            const handleStaffMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
                const drag = dragNoteRef.current;
                if (!drag) return;

                const vfContainer = e.currentTarget.querySelector('div[style]') as HTMLDivElement;
                if (!vfContainer) { dragNoteRef.current = null; return; }
                const snap = snapToStaff(vfContainer, e.clientX, e.clientY);
                dragNoteRef.current = null;
                e.currentTarget.style.cursor = 'crosshair';

                if (!snap) return;

                if (snap.midi !== drag.origMidi || Math.abs(snap.globalBeat - drag.origBeat) > 0.01) {
                    pushNotationUndo();
                    setPianoNotes(prev => prev.map((n, i) =>
                        i === drag.idx ? { ...n, note: snap.midi, start: snap.globalBeat } : n
                    ));
                    playNote(snap.midi);
                }
            };

            const handleStaffDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
                if (dragNoteRef.current) return;
                const vfContainer = e.currentTarget.querySelector('div[style]') as HTMLDivElement;
                if (!vfContainer) return;
                const snap = snapToStaff(vfContainer, e.clientX, e.clientY);
                if (!snap) return;

                if (findNoteAt(snap.midi, snap.globalBeat) !== null) return;
                addPianoNote(snap.midi, snap.globalBeat, inputNoteDuration, 0.8);
                playNote(snap.midi);
            };

            const handleStaffRightClick = (e: React.MouseEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                const vfContainer = e.currentTarget.querySelector('div[style]') as HTMLDivElement;
                if (!vfContainer || staveLayoutRef.current.length === 0) {
                    setNoteContextMenu(null);
                    return;
                }

                const rect = vfContainer.getBoundingClientRect();
                const clickX = (e.clientX - rect.left) / notationZoom;
                const clickY = (e.clientY - rect.top) / notationZoom;

                let closestStave: typeof staveLayoutRef.current[0] | null = null;
                for (const stave of staveLayoutRef.current) {
                    const margin = 25;
                    if (clickX >= stave.x && clickX <= stave.x + stave.width &&
                        clickY >= stave.topLineY - margin && clickY <= stave.bottomLineY + margin) {
                        closestStave = stave;
                        break;
                    }
                }
                if (!closestStave) { setNoteContextMenu(null); return; }

                const xRatio = (clickX - closestStave.x) / closestStave.width;
                const beatInMeasure = Math.max(0, xRatio * beatsPerMeasure);
                const globalBeat = closestStave.measureIdx * beatsPerMeasure + beatInMeasure;

                let nearestNoteIdx: number | null = null;
                let minDist = 0.5;
                pianoNotes.forEach((n, idx) => {
                    const dist = Math.abs(n.start - globalBeat);
                    if (dist < minDist) { minDist = dist; nearestNoteIdx = idx; }
                });

                setNoteContextMenu({
                    x: e.clientX, y: e.clientY,
                    noteIdx: nearestNoteIdx,
                    beat: globalBeat,
                    measureIdx: closestStave.measureIdx,
                });
            };

            const durationOptions = [
                { value: 4, label: '𝅝', title: 'Whole' },
                { value: 2, label: '𝅗𝅥', title: 'Half' },
                { value: 1, label: '♩', title: 'Quarter' },
                { value: 0.5, label: '♪', title: 'Eighth' },
                { value: 0.25, label: '𝅘𝅥𝅯', title: '16th' },
            ];

            return (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Sheet music input toolbar */}
                    <div className="flex items-center gap-1 px-3 h-8 shrink-0 border-b theme-border theme-bg-secondary">
                        <select value={notationKeySignature} onChange={(e) => setNotationKeySignature(e.target.value)}
                            className="px-1.5 py-0.5 rounded text-xs theme-bg-tertiary theme-border border">
                            {['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Cb', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].map(k => (
                                <option key={k} value={k}>{k}</option>
                            ))}
                        </select>
                        <select value={notationClef} onChange={(e) => setNotationClef(e.target.value as 'treble' | 'bass' | 'grand')}
                            className="px-1.5 py-0.5 rounded text-xs theme-bg-tertiary theme-border border">
                            <option value="treble">Treble</option>
                            <option value="bass">Bass</option>
                            <option value="grand">Grand</option>
                        </select>

                        <div className="w-px h-4 theme-bg-tertiary"/>

                        {durationOptions.map(d => (
                            <button key={d.value} onClick={() => setInputNoteDuration(d.value)} title={d.title}
                                className={`w-6 h-6 flex items-center justify-center rounded text-sm border ${inputNoteDuration === d.value ? 'bg-purple-600 text-white border-purple-600' : 'theme-bg-tertiary theme-text-muted theme-border theme-hover'}`}>
                                {d.label}
                            </button>
                        ))}

                        <div className="w-px h-4 theme-bg-tertiary"/>

                        <span className="text-[10px] font-medium theme-text-muted">Oct</span>
                        <button onClick={() => setInputOctave(o => Math.max(1, o - 1))} className="w-5 h-5 flex items-center justify-center rounded text-xs theme-bg-tertiary theme-hover theme-border border">-</button>
                        <span className="text-xs font-bold w-3 text-center">{inputOctave}</span>
                        <button onClick={() => setInputOctave(o => Math.min(7, o + 1))} className="w-5 h-5 flex items-center justify-center rounded text-xs theme-bg-tertiary theme-hover theme-border border">+</button>

                        <div className="w-px h-4 theme-bg-tertiary"/>

                        {sheetNoteNames.map(name => (
                            <React.Fragment key={name}>
                                <button onClick={() => addSheetNote(name, inputOctave)}
                                    className="h-6 w-6 rounded text-xs font-semibold theme-bg-tertiary theme-hover theme-border border">{name}</button>
                                {name !== 'E' && name !== 'B' && (
                                    <button onClick={() => addSheetNote(name + '#', inputOctave)}
                                        className="h-5 w-5 rounded text-[9px] font-semibold -mx-0.5 bg-gray-600 text-gray-200 hover:bg-gray-500 border border-gray-500">{name}#</button>
                                )}
                            </React.Fragment>
                        ))}
                        <button onClick={addSheetRest} className="h-6 px-2 rounded text-xs font-medium theme-bg-tertiary theme-hover theme-border border" title="Rest">Rest</button>
                    </div>

                    <div
                        className="flex-1 overflow-auto cursor-crosshair relative"
                        ref={sheetMusicScrollRef}
                        onMouseDown={handleStaffMouseDown}
                        onMouseMove={handleStaffMouseMove}
                        onMouseUp={handleStaffMouseUp}
                        onMouseLeave={handleStaffMouseLeave}
                        onDoubleClick={handleStaffDoubleClick}
                        onContextMenu={handleStaffRightClick}
                        onClick={() => setNoteContextMenu(null)}
                        title="Double-click to place notes, drag to move"
                        style={{ background: '#8b8b92', padding: '24px 16px' }}
                    >
                        <div style={{
                            background: '#fff',
                            margin: '0 auto',
                            width: `${(1100 + 90) * notationZoom}px`,
                            maxWidth: '100%',
                            minHeight: `${Math.max((Math.max(Math.ceil(measures / 4) * (notationClef === 'grand' ? 240 : 150) + 80, 500)) * notationZoom + 100, 600)}px`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
                            padding: '40px 45px 60px',
                            position: 'relative',
                        }}>
                            <div
                                ref={renderVexFlow}
                                style={{ transform: `scale(${notationZoom})`, transformOrigin: 'top left' }}
                            />
                        {/* Sheet music playhead — positioned over VexFlow SVG, offset by page padding */}
                        {(isNotationPlaying || notationPlayhead > 0) && staveLayoutRef.current.length > 0 && (() => {
                            const currentMeasure = Math.floor(notationPlayhead / beatsPerMeasure);
                            const beatInMeasure = notationPlayhead - currentMeasure * beatsPerMeasure;
                            const stave = staveLayoutRef.current.find(s => s.measureIdx === currentMeasure && s.clef !== 'bass');
                            if (!stave) return null;
                            const xRatio = beatInMeasure / beatsPerMeasure;
                            // VexFlow SVG coords + page padding (45px left, 40px top)
                            const padLeft = 45;
                            const padTop = 40;
                            const playX = (stave.x + xRatio * stave.width) * notationZoom + padLeft;
                            const playTop = (stave.topLineY - 10) * notationZoom + padTop;
                            const lineH = notationClef === 'grand'
                                ? ((stave.bottomLineY + 120) - stave.topLineY + 20) * notationZoom
                                : (stave.bottomLineY - stave.topLineY + 20) * notationZoom;
                            return (
                                <div className="absolute pointer-events-none z-20" style={{
                                    left: `${playX}px`,
                                    top: `${playTop}px`,
                                    width: '2.5px',
                                    height: `${lineH}px`,
                                    background: 'rgba(59, 130, 246, 0.85)',
                                    boxShadow: '0 0 6px rgba(59,130,246,0.4)',
                                    borderRadius: '1px',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: '-6px', left: '-4.75px',
                                        width: 0, height: 0,
                                        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                                        borderTop: '6px solid rgba(59, 130, 246, 0.9)',
                                    }}/>
                                </div>
                            );
                        })()}
                        <div
                            ref={ghostNoteRef}
                            className="absolute pointer-events-none"
                            style={{
                                display: 'none',
                                width: 12, height: 12,
                                borderRadius: '50%',
                                background: 'rgba(99, 102, 241, 0.5)',
                                border: '2px solid rgba(99, 102, 241, 0.8)',
                                boxShadow: '0 0 6px rgba(99,102,241,0.3)',
                            }}
                        />
                        <div
                            ref={ghostLabelRef}
                            className="absolute pointer-events-none text-xs font-bold"
                            style={{
                                display: 'none',
                                color: 'rgba(99, 102, 241, 0.9)',
                                textShadow: '0 0 3px white, 0 0 3px white',
                                fontFamily: "'SF Mono', monospace",
                            }}
                        />
                        </div>{/* close page div */}
                    </div>

                    {noteContextMenu && (
                        <div
                            className="fixed z-50 theme-bg-secondary border theme-border rounded-lg shadow-xl py-1 min-w-[180px]"
                            style={{ left: noteContextMenu.x, top: noteContextMenu.y }}
                            onClick={() => setNoteContextMenu(null)}
                        >
                            {noteContextMenu.noteIdx !== null ? (
                                <>
                                    <div className="px-3 py-1 text-xs theme-text-muted border-b theme-border">
                                        {noteToName(pianoNotes[noteContextMenu.noteIdx].note)} - Beat {pianoNotes[noteContextMenu.noteIdx].start.toFixed(1)}
                                    </div>
                                    <button
                                        className="w-full text-left px-3 py-1.5 text-sm theme-hover text-red-400"
                                        onClick={() => {
                                            setPianoNotes(prev => prev.filter((_, i) => i !== noteContextMenu.noteIdx));
                                            setNoteContextMenu(null);
                                        }}
                                    >
                                        Delete Note
                                    </button>
                                    <div className="border-t theme-border my-1"/>
                                    <div className="px-3 py-1 text-xs theme-text-muted">Change Duration</div>
                                    {[
                                        { v: 4, l: 'Whole' }, { v: 2, l: 'Half' }, { v: 1, l: 'Quarter' },
                                        { v: 0.5, l: 'Eighth' }, { v: 0.25, l: '16th' }
                                    ].map(d => (
                                        <button
                                            key={d.v}
                                            className={`w-full text-left px-3 py-1 text-sm theme-hover ${
                                                pianoNotes[noteContextMenu.noteIdx!]?.duration === d.v ? 'text-purple-400' : 'theme-text-secondary'
                                            }`}
                                            onClick={() => {
                                                const idx = noteContextMenu.noteIdx!;
                                                setPianoNotes(prev => prev.map((n, i) => i === idx ? { ...n, duration: d.v } : n));
                                                setNoteContextMenu(null);
                                            }}
                                        >
                                            {d.l} {pianoNotes[noteContextMenu.noteIdx!]?.duration === d.v ? '  *' : ''}
                                        </button>
                                    ))}
                                    <div className="border-t theme-border my-1"/>
                                    <div className="px-3 py-1 text-xs theme-text-muted">Octave</div>
                                    <div className="flex gap-1 px-3 py-1">
                                        <button
                                            className="px-2 py-0.5 theme-bg-tertiary rounded text-xs theme-hover"
                                            onClick={() => {
                                                const idx = noteContextMenu.noteIdx!;
                                                setPianoNotes(prev => prev.map((n, i) => i === idx ? { ...n, note: Math.max(21, n.note - 12) } : n));
                                                setNoteContextMenu(null);
                                            }}
                                        >Oct -</button>
                                        <button
                                            className="px-2 py-0.5 theme-bg-tertiary rounded text-xs theme-hover"
                                            onClick={() => {
                                                const idx = noteContextMenu.noteIdx!;
                                                setPianoNotes(prev => prev.map((n, i) => i === idx ? { ...n, note: Math.min(108, n.note + 12) } : n));
                                                setNoteContextMenu(null);
                                            }}
                                        >Oct +</button>
                                    </div>
                                    <div className="border-t theme-border my-1"/>
                                    <div className="px-3 py-1 text-xs theme-text-muted">Velocity</div>
                                    <div className="flex gap-1 px-3 py-1">
                                        {[0.3, 0.5, 0.7, 0.9, 1.0].map(v => (
                                            <button
                                                key={v}
                                                className={`px-2 py-0.5 rounded text-xs ${
                                                    Math.abs((pianoNotes[noteContextMenu.noteIdx!]?.velocity || 0) - v) < 0.05
                                                        ? 'bg-purple-600' : 'theme-bg-tertiary theme-hover'
                                                }`}
                                                onClick={() => {
                                                    const idx = noteContextMenu.noteIdx!;
                                                    setPianoNotes(prev => prev.map((n, i) => i === idx ? { ...n, velocity: v } : n));
                                                    setNoteContextMenu(null);
                                                }}
                                            >
                                                {v === 0.3 ? 'pp' : v === 0.5 ? 'mp' : v === 0.7 ? 'mf' : v === 0.9 ? 'f' : 'ff'}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="px-3 py-1 text-xs theme-text-muted border-b theme-border">
                                        Measure {noteContextMenu.measureIdx + 1}, Beat {(noteContextMenu.beat % beatsPerMeasure).toFixed(1)}
                                    </div>
                                    <button
                                        className="w-full text-left px-3 py-1.5 text-sm theme-hover theme-text-secondary"
                                        onClick={() => {
                                            setInputCursor(noteContextMenu.beat);
                                            setNoteContextMenu(null);
                                        }}
                                    >
                                        Set Cursor Here
                                    </button>
                                    <button
                                        className="w-full text-left px-3 py-1.5 text-sm theme-hover theme-text-secondary"
                                        onClick={() => {
                                            setInputCursor(noteContextMenu.beat + inputNoteDuration);
                                            setNoteContextMenu(null);
                                        }}
                                    >
                                        Add Rest Here
                                    </button>
                                    <div className="border-t theme-border my-1"/>
                                    <button
                                        className="w-full text-left px-3 py-1.5 text-sm theme-hover text-red-400"
                                        onClick={() => {
                                            const mStart = noteContextMenu.measureIdx * beatsPerMeasure;
                                            const mEnd = mStart + beatsPerMeasure;
                                            setPianoNotes(prev => prev.filter(n => n.start < mStart || n.start >= mEnd));
                                            setNoteContextMenu(null);
                                        }}
                                    >
                                        Clear Measure
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            );
        };

        const renderGuitarTab = () => {
            const tabBeatWidth = 36 * notationZoom;

            const derivedTabNotes = pianoNotes.map(n => {
                const tab = midiToTab(n.note);
                return tab ? { ...tab, start: n.start, duration: n.duration } : null;
            }).filter(Boolean) as Array<{ string: number; fret: number; start: number; duration: number }>;

            const addTabNote = (stringIdx: number, fret: number, beat: number) => {
                const midi = tabToMidi(stringIdx, fret);
                addPianoNote(midi, beat, inputNoteDuration, 0.8);
                playNote(midi);
            };

            const stringRowH = 28;

            return (
                <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#121218' }}>
                    {/* Tab toolbar */}
                    <div className="flex items-center gap-3 px-4 py-1.5 shrink-0" style={{
                        background: 'linear-gradient(180deg, #252535, #1e1e2c)',
                        borderBottom: '1px solid rgba(99,102,241,0.15)',
                    }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(165,180,252,0.9)', fontFamily: "'SF Mono', monospace", letterSpacing: '1px' }}>TAB</span>
                        <span style={{ fontSize: '10px', color: 'rgba(165,180,252,0.4)', fontFamily: "'SF Mono', monospace" }}>Standard (EADGBE)</span>
                        <div style={{ width: '1px', height: '16px', background: 'rgba(99,102,241,0.15)', margin: '0 4px' }}/>
                        <span style={{ fontSize: '10px', color: 'rgba(165,180,252,0.5)', fontFamily: "'SF Mono', monospace" }}>Beat {inputCursor.toFixed(1)}</span>
                        <button onClick={() => setInputCursor(0)}
                            style={{ fontSize: '10px', color: 'rgba(129,140,248,0.8)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                            Reset
                        </button>
                    </div>

                    {/* Tab notation area */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* String labels */}
                        <div className="flex flex-col justify-center shrink-0" style={{
                            width: '36px',
                            borderRight: '2px solid rgba(99,102,241,0.25)',
                            background: '#16161f',
                        }}>
                            {guitarStrings.map((s, i) => (
                                <div key={i} style={{
                                    height: `${stringRowH}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 700, color: 'rgba(165,180,252,0.7)',
                                    fontFamily: "'SF Mono', 'Courier New', monospace",
                                    borderBottom: i < 5 ? '1px solid rgba(99,102,241,0.06)' : 'none',
                                }}>{s}</div>
                            ))}
                        </div>

                        {/* Scrollable tab grid */}
                        <div className="flex-1 overflow-auto relative" ref={tabScrollRef} style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 #1a1a1a' }}>
                            <div className="relative" style={{
                                width: `${totalBeats * tabBeatWidth + 40}px`,
                                height: `${guitarStrings.length * stringRowH}px`,
                            }}>
                                {/* String lines */}
                                {guitarStrings.map((_, stringIdx) => (
                                    <div key={stringIdx} className="absolute left-0 right-0" style={{
                                        top: `${stringIdx * stringRowH + stringRowH / 2}px`,
                                        height: '1px',
                                        background: `rgba(165,180,252,${0.12 + stringIdx * 0.01})`,
                                    }}/>
                                ))}

                                {/* Measure lines */}
                                {Array.from({ length: Math.ceil(totalBeats / beatsPerMeasure) + 1 }).map((_, m) => (
                                    <div key={m} className="absolute" style={{
                                        left: `${m * beatsPerMeasure * tabBeatWidth}px`,
                                        top: '0',
                                        height: `${guitarStrings.length * stringRowH}px`,
                                        width: m === 0 ? '2px' : '1px',
                                        background: m === 0 ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.2)',
                                    }}/>
                                ))}

                                {/* Measure numbers */}
                                {Array.from({ length: Math.ceil(totalBeats / beatsPerMeasure) }).map((_, m) => (
                                    <div key={m} className="absolute pointer-events-none" style={{
                                        left: `${m * beatsPerMeasure * tabBeatWidth + 4}px`,
                                        top: '-16px',
                                        fontSize: '9px', color: 'rgba(99,102,241,0.4)', fontWeight: 700,
                                        fontFamily: "'SF Mono', monospace",
                                    }}>{m + 1}</div>
                                ))}

                                {/* Beat sub-lines */}
                                {Array.from({ length: totalBeats }).map((_, beat) => {
                                    if (beat % beatsPerMeasure === 0) return null;
                                    return (
                                        <div key={beat} className="absolute" style={{
                                            left: `${beat * tabBeatWidth}px`,
                                            top: '0',
                                            height: `${guitarStrings.length * stringRowH}px`,
                                            width: '1px',
                                            background: 'rgba(255,255,255,0.025)',
                                        }}/>
                                    );
                                })}

                                {/* Fret numbers on tab */}
                                {derivedTabNotes.map((n, i) => (
                                    <div key={i}
                                        className="absolute flex items-center justify-center cursor-pointer"
                                        style={{
                                            left: `${n.start * tabBeatWidth - 8}px`,
                                            top: `${n.string * stringRowH + 4}px`,
                                            width: '20px', height: '20px',
                                            background: '#121218',
                                            fontSize: '13px', fontWeight: 800,
                                            fontFamily: "'SF Mono', 'Courier New', monospace",
                                            color: '#818cf8',
                                            zIndex: 5,
                                            borderRadius: '2px',
                                            textShadow: '0 0 6px rgba(129,140,248,0.3)',
                                        }}
                                    >
                                        {n.fret}
                                    </div>
                                ))}

                                {/* Click zones for adding notes */}
                                {guitarStrings.map((_, stringIdx) => (
                                    <div key={stringIdx} className="absolute left-0 right-0 cursor-crosshair"
                                        style={{ top: `${stringIdx * stringRowH}px`, height: `${stringRowH}px`, zIndex: 2 }}
                                        onClick={(e) => {
                                            const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                                            if (!rect) return;
                                            const x = e.clientX - rect.left + (e.currentTarget.parentElement?.parentElement?.scrollLeft || 0);
                                            const beat = Math.round((x / tabBeatWidth) * 4) / 4;
                                            addTabNote(stringIdx, 0, beat);
                                        }}
                                    />
                                ))}

                                {/* Playhead */}
                                {(isNotationPlaying || notationPlayhead > 0) && (
                                    <div className="absolute pointer-events-none z-20" style={{
                                        left: `${notationPlayhead * tabBeatWidth}px`,
                                        top: '-4px',
                                        height: `${guitarStrings.length * stringRowH + 8}px`,
                                    }}>
                                        <div className="absolute" style={{
                                            left: '-5px', top: '-2px',
                                            width: 0, height: 0,
                                            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                                            borderTop: '7px solid #ef4444',
                                            filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.6))',
                                        }}/>
                                        <div style={{
                                            width: '2px', height: '100%',
                                            background: 'linear-gradient(180deg, #ef4444, #dc2626)',
                                            boxShadow: '0 0 8px rgba(239,68,68,0.4), 0 0 2px rgba(239,68,68,0.8)',
                                            borderRadius: '1px',
                                        }}/>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Fretboard input */}
                    <div className="shrink-0" style={{
                        borderTop: '1px solid rgba(99,102,241,0.1)',
                        background: '#16161f', padding: '10px 16px',
                    }}>
                        <div style={{ fontSize: '10px', color: 'rgba(165,180,252,0.4)', marginBottom: '6px', fontWeight: 500, fontFamily: "'SF Mono', monospace", letterSpacing: '0.5px' }}>
                            Click fretboard at beat {inputCursor.toFixed(1)}
                        </div>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'auto repeat(15, 1fr)',
                            background: 'linear-gradient(180deg, #2a1f18, #1e1610)',
                            borderRadius: '6px', overflow: 'hidden',
                            border: '1px solid rgba(139,92,46,0.3)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                        }}>
                            {/* Nut */}
                            <div style={{ gridColumn: '1', gridRow: '1 / span 6', background: 'linear-gradient(90deg, #d4c8a8, #e0d8c0, #d4c8a8)', width: '5px' }}/>
                            {guitarStrings.map((stringName, stringIdx) => (
                                <React.Fragment key={stringIdx}>
                                    <div style={{
                                        gridColumn: '1', gridRow: stringIdx + 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '24px', fontSize: '9px', fontWeight: 700,
                                        color: 'rgba(212,200,168,0.7)', fontFamily: "'SF Mono', monospace",
                                    }}>{stringName}</div>
                                    {Array.from({ length: 15 }).map((_, fret) => {
                                        const hasDot = [3, 5, 7, 9].includes(fret) && stringIdx === 2;
                                        const hasDoubleDot = fret === 12 && (stringIdx === 1 || stringIdx === 3);
                                        return (
                                            <div
                                                key={fret}
                                                onClick={() => addTabNote(stringIdx, fret, inputCursor)}
                                                style={{
                                                    height: '22px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    borderRight: '1px solid rgba(139,92,46,0.2)',
                                                    borderBottom: stringIdx < 5 ? `1px solid rgba(200,180,140,${0.15 - stringIdx * 0.015})` : 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '9px', color: 'rgba(200,180,140,0.5)',
                                                    fontFamily: "'SF Mono', monospace",
                                                    background: 'transparent',
                                                    position: 'relative',
                                                }}
                                                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(99,102,241,0.2)'; }}
                                                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                                            >
                                                {fret}
                                                {(hasDot || hasDoubleDot) && <div style={{
                                                    position: 'absolute', bottom: '-2px',
                                                    width: '4px', height: '4px', borderRadius: '50%',
                                                    background: fret === 12 ? 'rgba(212,200,168,0.5)' : 'rgba(139,92,46,0.5)',
                                                }}/>}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            );
        };

        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-10 border-b theme-border flex items-center px-3 gap-1 theme-bg-secondary">
                    <div className="flex items-center rounded-md overflow-hidden border theme-border mr-2">
                        <button
                            onClick={() => setNotationView('piano')}
                            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-r theme-border ${notationView === 'piano' ? 'bg-purple-600 text-white' : 'theme-hover theme-text-muted'}`}
                        >
                            <Piano size={13}/> Piano Roll
                        </button>
                        <button
                            onClick={() => setNotationView('sheet')}
                            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-r theme-border ${notationView === 'sheet' ? 'bg-purple-600 text-white' : 'theme-hover theme-text-muted'}`}
                        >
                            <Music2 size={13}/> Sheet Music
                        </button>
                        <button
                            onClick={() => setNotationView('tab')}
                            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${notationView === 'tab' ? 'bg-purple-600 text-white' : 'theme-hover theme-text-muted'}`}
                        >
                            <Guitar size={13}/> Guitar Tab
                        </button>
                    </div>

                    <button onClick={() => setShowLibrary(!showLibrary)} className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 ${showLibrary ? 'bg-purple-600 text-white' : 'theme-bg-tertiary theme-hover'}`} title="Demo Scores Library">
                        <Library size={13}/> Scores
                    </button>

                    <div className="w-px h-6 theme-bg-tertiary mx-2"/>

                    <button
                        onClick={() => { stopNotation(); setNotationPlayhead(0); }}
                        className="p-2 theme-hover rounded" title="Rewind"
                    >
                        <SkipBack size={16}/>
                    </button>
                    <button
                        onClick={playNotation}
                        className={`p-1.5 rounded ${isNotationPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'theme-bg-tertiary theme-hover'}`}
                        title={isNotationPlaying ? 'Stop' : 'Play'}
                    >
                        {isNotationPlaying ? <Square size={14}/> : <Play size={14}/>}
                    </button>

                    <div className="w-px h-6 theme-bg-tertiary mx-2"/>

                    <span className="text-xs theme-text-muted">BPM:</span>
                    <input
                        type="number"
                        value={notationBpm}
                        onChange={(e) => setNotationBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
                        className="w-16 px-2 py-1 theme-bg-tertiary rounded text-sm"
                    />

                    <span className="text-xs theme-text-muted ml-2">Time:</span>
                    <select
                        value={`${notationTimeSignature[0]}/${notationTimeSignature[1]}`}
                        onChange={(e) => {
                            const [n, d] = e.target.value.split('/').map(Number);
                            setNotationTimeSignature([n, d]);
                        }}
                        className="px-2 py-1 theme-bg-tertiary rounded text-sm"
                    >
                        <option value="4/4">4/4</option>
                        <option value="3/4">3/4</option>
                        <option value="2/4">2/4</option>
                        <option value="6/8">6/8</option>
                        <option value="5/4">5/4</option>
                        <option value="7/8">7/8</option>
                        <option value="2/2">2/2</option>
                        <option value="3/8">3/8</option>
                        <option value="12/8">12/8</option>
                    </select>

                    <div className="w-px h-6 theme-bg-tertiary mx-2"/>

                    <span className="text-xs theme-text-muted">Sound:</span>
                    <select
                        value={notationInstrument}
                        onChange={(e) => setNotationInstrument(e.target.value as typeof notationInstrument)}
                        className="px-2 py-1 theme-bg-tertiary rounded text-sm"
                    >
                        <option value="triangle">{notationView === 'tab' ? 'Clean' : 'Piano'}</option>
                        <option value="sine">{notationView === 'tab' ? 'Mellow' : 'Flute'}</option>
                        <option value="square">{notationView === 'tab' ? 'Drive' : 'Organ'}</option>
                        <option value="sawtooth">{notationView === 'tab' ? 'Distortion' : 'Strings'}</option>
                    </select>

                    <div className="flex-1"/>

                    <div className="w-px h-6 theme-bg-tertiary mx-1"/>

                    <button onClick={notationUndo} disabled={notationUndoStack.length === 0}
                        className={`p-1.5 rounded ${notationUndoStack.length > 0 ? 'theme-hover' : 'opacity-30'}`} title="Undo (Ctrl+Z)">
                        <Undo size={14}/>
                    </button>
                    <button onClick={notationRedo} disabled={notationRedoStack.length === 0}
                        className={`p-1.5 rounded ${notationRedoStack.length > 0 ? 'theme-hover' : 'opacity-30'}`} title="Redo (Ctrl+Y)">
                        <Redo size={14}/>
                    </button>

                    <div className="w-px h-6 theme-bg-tertiary mx-1"/>

                    <button onClick={copySelectedNotes} disabled={selectedNotes.size === 0}
                        className={`p-1.5 rounded ${selectedNotes.size > 0 ? 'theme-hover' : 'opacity-30'}`} title="Copy (Ctrl+C)">
                        <Copy size={14}/>
                    </button>
                    <button onClick={pasteNotes} disabled={notationClipboard.length === 0}
                        className={`p-1.5 rounded ${notationClipboard.length > 0 ? 'theme-hover' : 'opacity-30'}`} title="Paste (Ctrl+V)">
                        <ClipboardPaste size={14}/>
                    </button>

                    {selectedNotes.size > 0 && (
                        <>
                            <div className="w-px h-6 theme-bg-tertiary mx-1"/>
                            <button onClick={() => transposeSelected(1)} className="px-1.5 py-1 theme-bg-tertiary theme-hover rounded text-[10px]" title="Transpose Up">+1</button>
                            <button onClick={() => transposeSelected(-1)} className="px-1.5 py-1 theme-bg-tertiary theme-hover rounded text-[10px]" title="Transpose Down">-1</button>
                            <button onClick={() => transposeSelected(12)} className="px-1.5 py-1 theme-bg-tertiary theme-hover rounded text-[10px]" title="Octave Up">+Oct</button>
                            <button onClick={() => transposeSelected(-12)} className="px-1.5 py-1 theme-bg-tertiary theme-hover rounded text-[10px]" title="Octave Down">-Oct</button>
                        </>
                    )}

                    <div className="flex-1"/>

                    <span className="text-xs theme-text-muted">Meas:</span>
                    <select
                        value={notationMeasures}
                        onChange={(e) => setNotationMeasures(parseInt(e.target.value))}
                        className="w-14 px-1 py-1 theme-bg-tertiary rounded text-sm"
                    >
                        {[4, 8, 16, 24, 32, 48, 64].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>

                    <div className="w-px h-6 theme-bg-tertiary mx-1"/>

                    <button onClick={saveNotationProject} className="p-1.5 theme-hover rounded" title="Save Project">
                        <Save size={14}/>
                    </button>
                    <button onClick={loadNotationProject} className="p-1.5 theme-hover rounded" title="Open Project">
                        <FolderOpen size={14}/>
                    </button>
                    <button onClick={exportMidi} disabled={pianoNotes.length === 0}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${pianoNotes.length > 0 ? 'theme-bg-tertiary theme-hover' : 'opacity-30'}`} title="Export MIDI">
                        <Download size={12}/> MIDI
                    </button>
                    <button onClick={exportMusicXML} disabled={pianoNotes.length === 0}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${pianoNotes.length > 0 ? 'theme-bg-tertiary theme-hover' : 'opacity-30'}`} title="Export MusicXML (MuseScore)">
                        <Download size={12}/> XML
                    </button>
                    <button onClick={importMusicXML}
                        className="px-2 py-1 rounded text-xs flex items-center gap-1 theme-bg-tertiary theme-hover" title="Import MusicXML">
                        <Upload size={12}/> XML
                    </button>

                    <div className="w-px h-6 theme-bg-tertiary mx-1"/>

                    <button
                        onClick={deleteSelectedNotes}
                        disabled={selectedNotes.size === 0}
                        className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${selectedNotes.size > 0 ? 'bg-red-600 hover:bg-red-700' : 'theme-bg-tertiary opacity-50'}`}
                    >
                        <Trash2 size={12}/> {selectedNotes.size > 0 ? selectedNotes.size : ''}
                    </button>

                    <button
                        onClick={() => { pushNotationUndo(); setPianoNotes([]); setSelectedNotes(new Set()); setInputCursor(0); }}
                        className="px-2 py-1 theme-bg-tertiary theme-hover rounded text-xs"
                    >
                        Clear
                    </button>
                </div>

                {showLibrary ? (
                    <div className="flex-1 overflow-auto" style={{ background: '#1a1a2e' }}>
                        <div className="max-w-4xl mx-auto p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">Score Library</h2>
                                <button onClick={() => setShowLibrary(false)} className="p-1 rounded hover:bg-white/10">
                                    <X size={16} className="text-gray-400"/>
                                </button>
                            </div>

                            {(['classical', 'folk', 'guitar'] as const).map(cat => (
                                <div key={cat} className="mb-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: cat === 'classical' ? '#a78bfa' : cat === 'folk' ? '#34d399' : '#f59e0b' }}>
                                        {cat === 'classical' ? 'Classical' : cat === 'folk' ? 'World Folk' : 'Guitar Masters'}
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {demoScores.filter(s => s.category === cat).map((score, i) => (
                                            <button
                                                key={i}
                                                onClick={() => loadDemoScore(score)}
                                                className="text-left p-3 rounded-lg border transition-colors hover:border-purple-500/50"
                                                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
                                            >
                                                <div className="text-sm font-medium text-white truncate">{score.title}</div>
                                                <div className="text-xs text-gray-400 mt-0.5">{score.composer}</div>
                                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
                                                    <span>{score.region}</span>
                                                    <span>·</span>
                                                    <span>{score.year}</span>
                                                    <span>·</span>
                                                    <span>{score.key} {score.timeSignature[0]}/{score.timeSignature[1]}</span>
                                                    <span>·</span>
                                                    <span>{score.notes.length} notes</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <p className="text-[10px] text-gray-600 mt-4">All scores are public domain excerpts. Import full scores via MusicXML from IMSLP or MuseScore.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {notationView === 'piano' && renderPianoRoll()}
                        {notationView === 'sheet' && renderSheetMusic()}
                        {notationView === 'tab' && renderGuitarTab()}
                    </>
                )}
            </div>
        );
    };

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

    const renderDatasets = () => (
        <div className="flex h-full overflow-hidden">
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
                        <div className="text-center py-8 theme-text-muted text-sm">
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
                                        : 'theme-hover'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{dataset.name}</span>
                                    <span className="text-xs theme-text-muted">{dataset.examples.length}</span>
                                </div>
                                <div className="text-xs theme-text-muted mt-1">
                                    {new Date(dataset.updatedAt).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedDataset ? (
                    <>
                        <div className="p-4 border-b theme-border flex items-center justify-between theme-bg-secondary">
                            <div>
                                <h4 className="font-semibold">{selectedDataset.name}</h4>
                                <p className="text-xs theme-text-muted">
                                    {selectedDataset.examples.length} audio samples
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={datasetExportFormat}
                                    onChange={(e) => setDatasetExportFormat(e.target.value as any)}
                                    className="px-2 py-1 text-xs theme-bg-secondary border theme-border rounded"
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

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {selectedDataset.examples.length === 0 ? (
                                <div className="text-center py-12 theme-text-muted">
                                    <Layers size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No samples in this dataset</p>
                                    <p className="text-xs mt-1">Generate audio and add it here</p>
                                </div>
                            ) : (
                                selectedDataset.examples.map(ex => (
                                    <div key={ex.id} className="p-4 theme-bg-secondary rounded-lg border theme-border">
                                        <div className="flex items-start gap-4">
                                            <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-pink-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <Music size={24} className="text-purple-400"/>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{ex.prompt}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs theme-text-muted">
                                                    <span>{formatTime(ex.duration)}</span>
                                                    <span className="px-1.5 py-0.5 theme-bg-tertiary rounded">{ex.model}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t theme-border">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs theme-text-muted">Quality:</span>
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button
                                                        key={score}
                                                        onClick={() => updateAudioExampleQuality(selectedDataset.id, ex.id, score)}
                                                        className={`p-0.5 ${ex.qualityScore >= score ? 'text-purple-400' : 'theme-text-muted'}`}
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
                    <div className="flex-1 flex items-center justify-center theme-text-muted">
                        <div className="text-center">
                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Select a dataset or create a new one</p>
                            <p className="text-xs mt-2">Use the Generate tab to create audio, then add it to datasets</p>
                        </div>
                    </div>
                )}
            </div>

            {showCreateDataset && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowCreateDataset(false)}>
                    <div className="theme-bg-secondary rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
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
                            className="w-full px-3 py-2 theme-bg-tertiary theme-text-primary border theme-border rounded focus:border-purple-500 focus:outline-none mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateDataset(false)}
                                className="px-4 py-2 theme-bg-tertiary theme-hover theme-text-primary rounded"
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
                    <div className="flex items-center h-10 px-2 theme-bg-primary border-b theme-border shrink-0">
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-1.5 theme-bg-secondary theme-hover rounded-lg border theme-border text-sm backdrop-blur-sm">
                                <CurrentModeIcon size={16} className="text-purple-400"/>
                                <span className="font-medium">{currentMode_obj.name}</span>
                                <ChevronRight size={14} className="theme-text-muted rotate-90"/>
                            </button>
                            <div className="absolute top-full left-0 mt-1 w-48 theme-bg-secondary backdrop-blur-sm rounded-lg border theme-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                <div className="py-1">
                                    {['browse', 'create', 'edit', 'analyze', 'train'].map(group => (
                                        <React.Fragment key={group}>
                                            <div className="px-3 py-1 text-xs theme-text-muted uppercase">{group}</div>
                                            {SCHERZO_MODES.filter(m => m.group === group).map(mode => {
                                                const ModeIcon = mode.icon;
                                                return (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setActiveMode(mode.id)}
                                                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm theme-hover ${
                                                            activeMode === mode.id ? 'text-purple-400 bg-purple-600/20' : 'theme-text-secondary'
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
                    {aiEnabled && activeMode === 'generator' && renderGenerator()}
                    {activeMode === 'editor' && renderEditor()}
                    {activeMode === 'dj' && renderDJMixer()}
                    {activeMode === 'analysis' && renderAnalysis()}
                    {activeMode === 'notation' && renderNotation()}
                    {activeMode === 'datasets' && renderDatasets()}

                    {visualizerActive && (
                        <div className="absolute inset-0 bg-black/95 z-50 flex flex-col">
                            <div className="flex items-center justify-between p-4 bg-black/50">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-medium text-purple-400">Visualizer</span>
                                    <div className="flex gap-1">
                                        {(['bars', 'wave', 'circle', 'particles'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => setVisualizerMode(mode)}
                                                className={`px-3 py-1 text-xs rounded ${
                                                    visualizerMode === mode ? 'bg-purple-600' : 'theme-bg-secondary theme-hover'
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
                                    className="p-2 theme-hover rounded"
                                >
                                    <X size={20}/>
                                </button>
                            </div>
                            <div className="flex-1 relative">
                                <canvas
                                    ref={visualizerCanvasRef}
                                    className="absolute inset-0 w-full h-full"
                                    width={1200}
                                    height={600}
                                />
                            </div>
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
                                            <span className="text-sm theme-text-muted">{formatTime(currentTime)}</span>
                                            <div className="flex-1 h-1 theme-bg-tertiary rounded overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500"
                                                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <span className="text-sm theme-text-muted">{formatTime(duration)}</span>
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
