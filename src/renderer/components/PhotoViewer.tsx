import { getFileName } from './utils';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Loader, Image as ImageIcon, Folder,
    Camera, Wand2, Sliders, Grid, Upload, Trash2, Edit,
    MessageSquare, Check, List, LayoutGrid, Save, Undo,
    Redo, Search, Sparkles, Info, Tag, Crop, RotateCw, Type, ChevronLeft, ChevronRight,
    Download, PlusCircle, Copy, ExternalLink, ChevronsRight, GitBranch,
    Layers, Eye, EyeOff, GripVertical, FileJson, FolderOpen,
    Lasso, Star, Workflow, Video, Film, Scissors, Play, Pause, SkipBack, SkipForward,
    Volume2, VolumeX, Square, Circle, Music, Mic, Move, AlignLeft, AlignCenter, AlignRight,
    Bold, Italic, Underline, Database, HardDrive, Package,
    RectangleHorizontal, Brush, Eraser, Blend, Plus, ZoomIn, ZoomOut, Rewind, FastForward,
  } from 'lucide-react';

// Import primitives from npcts
import {
    ImageGrid,
    Lightbox,
    StarRating,
    RangeSlider,
    SortableList,
    ImageEditor
} from 'npcts';
  
 
  const IMAGES_PER_PAGE = 24;
  

  const DARKROOM_LAYER_TYPES = {
    ADJUSTMENTS: { 
        name: 'Adjustments', 
        icon: Sliders, 
        defaultParams: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, saturation: 0, warmth: 0, tint: 0, pop: 0, vignette: 0 } 
    },
    TEXT: { 
        name: 'Text', 
        icon: Type, 
        defaultParams: { content: 'Hello World', font: 'Arial', size: 50, color: '#FFFFFF', x: 100, y: 100 } 
    },
    TRANSFORM: { 
        name: 'Transform', 
        icon: RotateCw, 
        defaultParams: { rotation: 0, scaleX: 1, scaleY: 1 } 
    },
    GENERATIVE_FILL: { 
        name: 'Generative Fill', 
        icon: Sparkles, 
        defaultParams: { prompt: '' } 
    },
};

const defaultTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };


// Utils
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const downloadJSON = (data, filename = 'labels.json') => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
const readJSONFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => { try { resolve(JSON.parse(reader.result)); } catch (e) { reject(e); } };
  reader.onerror = reject;
  reader.readAsText(file);
});


    const handleStartConversationFromViewer = async (images) => {
        if (!images || images.length === 0) return;
    
        const attachmentsToAdd = images.map(img => {
            const filePath = img.path;
            return {
                id: generateId(),
                name: getFileName(filePath),
                path: filePath,
                size: 0,
                type: 'image/jpeg',
                preview: `file://${filePath}`
            };
        });
    
        setUploadedFiles(prev => [...prev, ...attachmentsToAdd]);
        setPhotoViewerOpen(false);
    };
    const handleImagesClick = () => {
        setPhotoViewerType('images');
        setPhotoViewerOpen(true);
    };

    const handleScreenshotsClick = () => {
        setPhotoViewerType('screenshots');
        setPhotoViewerOpen(true);
    };

const PhotoViewer = ({ currentPath, onStartConversation }) => {
    const [activeTab, setActiveTab] = useState('gallery');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
  
   
    console.log(currentPath);
    const [projectPath, setProjectPath] = useState(currentPath || '~/.npcsh/images');
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [imageSources, setImageSources] = useState([]);
      const [activeSourceId, setActiveSourceId] = useState('project-images');
   
    const [selectedModel, setSelectedModel] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    
   
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedImageGroup, setSelectedImageGroup] = useState(new Set());
    const [lastClickedIndex, setLastClickedIndex] = useState(null);
    const [displayedImagesCount, setDisplayedImagesCount] = useState(IMAGES_PER_PAGE);
    const [lightboxIndex, setLightboxIndex] = useState(null);  
    const [viewMode, setViewMode] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [metaSearch, setMetaSearch] = useState('');
  
   
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, imagePath: null });
    const [renamingImage, setRenamingImage] = useState({ path: null, newName: '' });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('vixynt_sidebarCollapsed');
        return saved === 'true';
    });
    
   
   const [selectionMode, setSelectionMode] = useState(null);
const [selection, setSelection] = useState(null);
const [drawingSelection, setDrawingSelection] = useState(false);
const [selectionPoints, setSelectionPoints] = useState([]);
const [textLayers, setTextLayers] = useState([]);
const [editingTextId, setEditingTextId] = useState(null);
const [selectedTextId, setSelectedTextId] = useState(null);

    // Video Editor state
    const [videoClips, setVideoClips] = useState([]);
    const [videoTracks, setVideoTracks] = useState([
        { id: 'video-1', type: 'video', clips: [] },
        { id: 'audio-1', type: 'audio', clips: [] }
    ]);
    const [videoCurrentTime, setVideoCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(60);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const [videoZoom, setVideoZoom] = useState(1);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [videoTransitions, setVideoTransitions] = useState([]);
    const [selectedTransitionId, setSelectedTransitionId] = useState(null);
    const [videoTextLayers, setVideoTextLayers] = useState([]);
    const [selectedVideoTextId, setSelectedVideoTextId] = useState(null);
    const [addingVideoText, setAddingVideoText] = useState(false);
    const videoPreviewRef = useRef(null);
    const timelineRef = useRef(null);

    // Video Generator state
    const [videoPrompt, setVideoPrompt] = useState('');
    const [generatingVideo, setGeneratingVideo] = useState(false);
    const [generatedVideos, setGeneratedVideos] = useState([]);
    const [videoModel, setVideoModel] = useState('');
    const [videoDurationSetting, setVideoDurationSetting] = useState(5);

    // Video Dataset state
    const [videoDatasets, setVideoDatasets] = useState(() => {
        try {
            const stored = localStorage.getItem('vixynt_videoDatasets');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });
    const [selectedVideoDatasetId, setSelectedVideoDatasetId] = useState(null);
    const [showCreateVideoDataset, setShowCreateVideoDataset] = useState(false);
    const [showAddToVideoDataset, setShowAddToVideoDataset] = useState(false);
    const [newVideoDatasetName, setNewVideoDatasetName] = useState('');
    const [selectedGeneratedVideos, setSelectedGeneratedVideos] = useState(new Set());
    const [videoSelectionMode, setVideoSelectionMode] = useState(false);
    const [videoDatasetExportFormat, setVideoDatasetExportFormat] = useState('jsonl');

    // Save video datasets to localStorage
    useEffect(() => {
        localStorage.setItem('vixynt_videoDatasets', JSON.stringify(videoDatasets));
    }, [videoDatasets]);

    // Dataset/Model Manager state
    const [datasets, setDatasets] = useState([]);
    const [trainedModels, setTrainedModels] = useState([]);
    const [selectedDataset, setSelectedDataset] = useState(null);
    const [datasetImages, setDatasetImages] = useState([]);

    const [adjustments, setAdjustments] = useState({ 
        exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
        saturation: 100, warmth: 0, tint: 0,
        pop: 0, vignette: 0, blur: 0
    });
   
    const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
    const [isCropping, setIsCropping] = useState(false);
    
   
    const [layers, setLayers] = useState([]);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [editorTool, setEditorTool] = useState('select');
    
   
    const [selectionPath, setSelectionPath] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [textEditState, setTextEditState] = useState({ editing: false, layerId: null });
    const [draggingLayerId, setDraggingLayerId] = useState(null);

   
    const [editHistory, setEditHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
  
   
    const [metadata, setMetadata] = useState(null);
    const [customTags, setCustomTags] = useState([]);
    const [rating, setRating] = useState(0);
    const [labels, setLabels] = useState([]);
    const [brushSize, setBrushSize] = useState(10);
const [brushColor, setBrushColor] = useState('#000000');
const canvasRef = useRef(null);
const [isDrawingBrush, setIsDrawingBrush] = useState(false);
   
    const fileInputRef = useRef(null);
    const imageRef = useRef(null);
    const canvasContainerRef = useRef(null);

   
    const activeSource = imageSources.find(s => s.id === activeSourceId);
    const sourceImages = (activeSource?.images || []);
    const filteredImages = sourceImages.filter(img => img.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const [numImagesToGenerate, setNumImagesToGenerate] = useState(1);
    const [selectedGeneratedImages, setSelectedGeneratedImages] = useState(new Set());

    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
const [selectionDragStart, setSelectionDragStart] = useState(null);
    
    const [isDrawingSelection, setIsDrawingSelection] = useState(false);
    
    
    
    const [compareMode, setCompareMode] = useState(false);
  
    const [generatePrompt, setGeneratePrompt] = useState('');
    const [generatedImages, setGeneratedImages] = useState([]);
  
   
    const [generating, setGenerating] = useState(false);

    // Workflow state for ComfyUI-style node editor
    const [workflowNodes, setWorkflowNodes] = useState([]);
    const [workflowConnections, setWorkflowConnections] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [draggingNode, setDraggingNode] = useState(null);
    const [draggingConnection, setDraggingConnection] = useState(null);
    const [workflowExecuting, setWorkflowExecuting] = useState(false);
    const workflowCanvasRef = useRef(null);

  const [fineTuneConfig, setFineTuneConfig] = useState({
    outputName: 'my_diffusion_model',
    epochs: 100,
    batchSize: 4,
    learningRate: 1e-4,
    captions: []
});

const [captionMode, setCaptionMode] = useState('auto');
const [manualCaptions, setManualCaptions] = useState({});
const [showFineTuneModal, setShowFineTuneModal] = useState(false);
const [isFineTuning, setIsFineTuning] = useState(false);
const [fineTuneStatus, setFineTuneStatus] = useState<{
    status: string;
    epoch?: number;
    total_epochs?: number;
    batch?: number;
    total_batches?: number;
    step?: number;
    loss?: number;
    loss_history?: number[];
    outputPath?: string;
    message?: string;
} | null>(null);

const pollFineTuneStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
        const status = await window.api?.getFineTuneStatus?.(jobId);
        if (status?.status === 'complete' || status?.complete) {
            clearInterval(interval);
            setFineTuneStatus({
                status: 'complete',
                outputPath: status.outputPath,
                loss_history: status.loss_history || [],
                message: `Complete! Model saved to ${status.outputPath}`
            });
            setIsFineTuning(false);
            await loadImagesForAllSources(imageSources);
        } else if (status?.status === 'error' || status?.error) {
            clearInterval(interval);
            setFineTuneStatus(null);
            setIsFineTuning(false);
            setError('Training failed: ' + (status.error || 'Unknown error'));
        } else if (status?.status === 'running') {
            setFineTuneStatus({
                status: 'running',
                epoch: status.epoch || 0,
                total_epochs: status.total_epochs || 0,
                batch: status.batch || 0,
                total_batches: status.total_batches || 0,
                step: status.step || 0,
                loss: status.loss,
                loss_history: status.loss_history || []
            });
        }
    }, 1000);  // Poll more frequently for real-time feel
};

const handleStartFineTune = async () => {
    if (selectedImageGroup.size === 0) {
        setError('Select images first');
        return;
    }
    
    setIsFineTuning(true);
    setFineTuneStatus({ status: 'preparing', message: 'Preparing training...' });
    
    const imagePaths = Array.from(selectedImageGroup).map(
        p => p.replace('media://', '')
    );
    
    let captions = [];
    if (captionMode === 'manual') {
        captions = imagePaths.map(p => manualCaptions[p] || '');
    } else if (captionMode === 'filename') {
        captions = imagePaths.map(p => {
            const name = getFileName(p).replace(/\.[^/.]+$/, '');
            return name.replace(/_/g, ' ').replace(/-/g, ' ');
        });
    }
    
    // --- CRITICAL FIX: Update the outputPath here! ---
    // Ensure it points to the dedicated models directory.
    // We'll use a consistent path for fine-tuned models.
    const modelsOutputPath = `${currentPath}/models`; // Or a fixed global path like '~/.npcsh/models'
    // For now, let's use a project-relative models folder for better organization.
    // If currentPath is /Users/caug/.npcsh/incognide, this will be /Users/caug/.npcsh/incognide/models
    // If you prefer a single global models folder, you can hardcode it:
    // const modelsOutputPath = '~/.npcsh/models'; 
    // Just ensure your backend's get_finetuned_models scans the same path.
    // The previous backend change already defaults to '~/.npcsh/models' for scanning.
    // So, let's make the frontend save to a project-specific models folder, or default to global.
    // Given the backend's default scan, let's make the frontend save to the global models path for now.

    const finalOutputPath = '~/.npcsh/models'; // This will expand to /Users/caug/.npcsh/models
    // --------------------------------------------------

    const config = {
        images: imagePaths,
        captions: captions,
        outputName: fineTuneConfig.outputName,
        epochs: fineTuneConfig.epochs,
        batchSize: fineTuneConfig.batchSize,
        learningRate: fineTuneConfig.learningRate,
        outputPath: finalOutputPath // <--- UPDATED THIS LINE
    };
    
    const response = await window.api?.fineTuneDiffusers?.(config);
    
    if (response?.error) {
        setError('Fine-tuning failed: ' + response.error);
        setFineTuneStatus(null);
        setIsFineTuning(false);
    } else if (response?.status === 'started') {
        setFineTuneStatus({ status: 'running', message: 'Training started...' });
        pollFineTuneStatus(response.jobId);
    }
};

const renderFineTuneModal = () => {
    if (!showFineTuneModal) return null;
    
    const selectedImages = Array.from(selectedImageGroup);
    
    return (
        <div className="fixed inset-0 bg-black/70 z-[90] flex items-center 
            justify-center p-8">
            <div className="theme-bg-secondary rounded-lg p-6 w-full max-w-2xl
                space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                        Fine-tune Diffusion Model
                    </h3>
                    <button onClick={() => setShowFineTuneModal(false)}>
                        <X size={20} />
                    </button>
                </div>

                <div className="text-sm theme-text-secondary">
                    Training on {selectedImages.length} images
                </div>
                
                <div className="space-y-3">
                    <div>
                        <label className="text-sm font-medium">
                            Output Model Name
                        </label>
                        <input
                            type="text"
                            value={fineTuneConfig.outputName}
                            onChange={e => setFineTuneConfig(
                                p => ({ ...p, outputName: e.target.value })
                            )}
                            className="w-full theme-input mt-1 text-sm"
                            placeholder="my_diffusion_model"
                        />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs font-medium">Epochs</label>
                            <input
                                type="number"
                                value={fineTuneConfig.epochs}
                                onChange={e => setFineTuneConfig(
                                    p => ({ ...p, epochs: parseInt(e.target.value) })
                                )}
                                className="w-full theme-input mt-1 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium">
                                Batch Size
                            </label>
                            <input
                                type="number"
                                value={fineTuneConfig.batchSize}
                                onChange={e => setFineTuneConfig(
                                    p => ({ ...p, batchSize: parseInt(e.target.value) })
                                )}
                                className="w-full theme-input mt-1 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium">
                                Learning Rate
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={fineTuneConfig.learningRate}
                                onChange={e => setFineTuneConfig(
                                    p => ({ 
                                        ...p, 
                                        learningRate: parseFloat(e.target.value) 
                                    })
                                )}
                                className="w-full theme-input mt-1 text-sm"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-sm font-medium">
                            Caption Mode
                        </label>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <button
                                onClick={() => setCaptionMode('auto')}
                                className={`p-2 text-xs rounded border 
                                    ${captionMode === 'auto' 
                                        ? 'theme-button-primary' 
                                        : 'theme-button'}`}
                            >
                                No Captions
                            </button>
                            <button
                                onClick={() => setCaptionMode('filename')}
                                className={`p-2 text-xs rounded border 
                                    ${captionMode === 'filename' 
                                        ? 'theme-button-primary' 
                                        : 'theme-button'}`}
                            >
                                From Filename
                            </button>
                            <button
                                onClick={() => setCaptionMode('manual')}
                                className={`p-2 text-xs rounded border 
                                    ${captionMode === 'manual' 
                                        ? 'theme-button-primary' 
                                        : 'theme-button'}`}
                            >
                                Manual
                            </button>
                        </div>
                    </div>
                    
                    {captionMode === 'manual' && (
                        <div className="space-y-2 max-h-48 overflow-y-auto 
                            border theme-border rounded p-2">
                            {selectedImages.map(img => {
                                const path = img.replace('media://', '');
                                const name = getFileName(path);
                                return (
                                    <div key={img} className="flex gap-2 
                                        items-center">
                                        <img 
                                            src={img} 
                                            className="w-10 h-10 object-cover 
                                                rounded"
                                        />
                                        <input
                                            type="text"
                                            value={manualCaptions[path] || ''}
                                            onChange={e => setManualCaptions(
                                                p => ({ 
                                                    ...p, 
                                                    [path]: e.target.value 
                                                })
                                            )}
                                            placeholder={name}
                                            className="flex-1 theme-input text-xs"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                {fineTuneStatus && (
                    <div className="bg-blue-900/30 p-4 rounded text-sm space-y-3">
                        {fineTuneStatus.status === 'running' ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <Loader size={14} className="animate-spin" />
                                    <span className="font-medium">Training in progress...</span>
                                </div>

                                {/* Epoch Progress */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>Epoch {fineTuneStatus.epoch}/{fineTuneStatus.total_epochs}</span>
                                        <span>{fineTuneStatus.total_epochs ? Math.round((fineTuneStatus.epoch! / fineTuneStatus.total_epochs) * 100) : 0}%</span>
                                    </div>
                                    <div className="w-full theme-bg-tertiary rounded-full h-2">
                                        <div
                                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${fineTuneStatus.total_epochs ? (fineTuneStatus.epoch! / fineTuneStatus.total_epochs) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Batch Progress */}
                                {fineTuneStatus.total_batches > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs theme-text-secondary">
                                            <span>Batch {fineTuneStatus.batch}/{fineTuneStatus.total_batches}</span>
                                            <span>{Math.round((fineTuneStatus.batch! / fineTuneStatus.total_batches) * 100)}%</span>
                                        </div>
                                        <div className="w-full theme-bg-tertiary rounded-full h-1.5">
                                            <div
                                                className="bg-blue-400 h-1.5 rounded-full transition-all duration-150"
                                                style={{ width: `${(fineTuneStatus.batch! / fineTuneStatus.total_batches) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Current Loss */}
                                {fineTuneStatus.loss != null && (
                                    <div className="flex items-center gap-4 text-xs">
                                        <span className="theme-text-secondary">Current Loss:</span>
                                        <span className="font-mono text-yellow-400">{fineTuneStatus.loss.toFixed(4)}</span>
                                        <span className="theme-text-secondary">Step:</span>
                                        <span className="font-mono">{fineTuneStatus.step}</span>
                                    </div>
                                )}

                                {/* Mini Loss Chart */}
                                {fineTuneStatus.loss_history && fineTuneStatus.loss_history.length > 1 && (
                                    <div className="mt-2">
                                        <div className="text-xs theme-text-secondary mb-1">Loss History (per epoch avg)</div>
                                        <div className="flex items-end gap-0.5 h-12 theme-bg-secondary rounded p-1">
                                            {fineTuneStatus.loss_history.slice(-20).map((loss, i) => {
                                                const maxLoss = Math.max(...fineTuneStatus.loss_history!.slice(-20));
                                                const minLoss = Math.min(...fineTuneStatus.loss_history!.slice(-20));
                                                const range = maxLoss - minLoss || 1;
                                                const height = ((loss - minLoss) / range) * 100;
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex-1 bg-gradient-to-t from-green-600 to-green-400 rounded-t"
                                                        style={{ height: `${Math.max(5, 100 - height)}%` }}
                                                        title={`Epoch ${fineTuneStatus.loss_history!.length - 20 + i + 1}: ${loss.toFixed(4)}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : fineTuneStatus.status === 'complete' ? (
                            <div className="flex items-center gap-2 text-green-400">
                                <Check size={16} />
                                <span>{fineTuneStatus.message}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Loader size={14} className="animate-spin" />
                                <span>{fineTuneStatus.message || 'Processing...'}</span>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => setShowFineTuneModal(false)}
                        className="theme-button px-4 py-2"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStartFineTune}
                        disabled={isFineTuning || selectedImages.length === 0}
                        className="theme-button-primary px-4 py-2 
                            disabled:opacity-50"
                    >
                        {isFineTuning ? 'Training...' : 'Start Training'}
                    </button>
                </div>
            </div>
        </div>
    );
};


   
    const [activeTool, setActiveTool] = useState('rect');
    const [editingLabelId, setEditingLabelId] = useState(null); // Add this line
    const [drawing, setDrawing] = useState(false);
    const [drawPoints, setDrawPoints] = useState([]);
    const imgContainerRef = useRef(null);

    
    
    const downloadFile = (data, filename, mimeType) => {
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    
    const readFileAsText = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
    
    const parseCsvLine = (line) => {
        const regex = /(?:"([^"]*(?:""[^"]*)*)"|([^,]*))(?:,|$)/g;
        const fields = [];
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) && match[0] !== '') {
            fields.push(match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]);
        }
        return fields;
    };
    
  const loadImagesForAllSources = useCallback(async (sourcesToLoad) => {
    setLoading(true); setError(null);
    try {
      const updatedSources = await Promise.all(
        sourcesToLoad.map(async (source) => {
          try {
           
            await window.api?.ensureDirectory?.(source.path);
            const images = await window.api?.readDirectoryImages?.(source.path) || [];
            console.log(images);
            return { ...source, images };
          } catch (err) {
            console.error('Source load failed:', source, err);
            return { ...source, images: [] };
          }
        })
      );
      setImageSources(updatedSources);
    } catch (err) {
      setError('Failed to load image sources: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);
    useEffect(() => {
        const loadAllData = async () => {
            const initialSources = [
                { id: 'project-images', name: 'Project Images', path: currentPath, icon: Folder },
                { id: 'global-images', name: 'Global Images', path: '~/.npcsh/images', icon: ImageIcon },
                { id: 'screenshots', name: 'Screenshots', path: '~/.npcsh/screenshots', icon: Camera },
            ];
            
           
            setLoading(true); 
            setError(null);
            try {
                const updatedSources = await Promise.all(
                    initialSources.map(async (source) => {
                        try {
                            await window.api?.ensureDirectory?.(source.path);
                            const images = await window.api?.readDirectoryImages?.(source.path) || [];
                            return { ...source, images };
                        } catch (err) {
                            console.error('Source load failed:', source, err);
                            return { ...source, images: [] };
                        }
                    })
                );
                setImageSources(updatedSources);
                
               
                const projectSource = updatedSources.find(s => s.id === 'project-images');
                const projectHasImages = projectSource?.images?.length > 0;
                
                if (projectHasImages) {
                    setActiveSourceId('project-images');
                } else {
                    setActiveSourceId('global-images');
                }
                
            } catch (err) {
                setError('Failed to load image sources: ' + err.message);
            } finally {
                setLoading(false);
            }

           
            if (currentPath) {
              try {
                const imageModelsResponse = await window.api.getAvailableImageModels(currentPath);
                if (imageModelsResponse?.models) {
                  // <--- CRITICAL FIX: Directly set the models
                  setAvailableModels(imageModelsResponse.models);
                  
                  // Prioritize the fine-tuned Diffusers model if available
                  const fineTunedDiffusersModel = imageModelsResponse.models.find(
                    model => model.provider === 'diffusers' && model.display_name.includes('Fine-tuned Diffuser')
                  );
                  // Fallback to a standard Diffusers model
                  const standardDiffusersModel = imageModelsResponse.models.find(
                    model => model.provider === 'diffusers' && model.value.toLowerCase().includes('stable-diffusion')
                  );
                  
                  if (fineTunedDiffusersModel) {
                    setSelectedModel(fineTunedDiffusersModel.value);
                    setSelectedProvider('diffusers');
                  } else if (standardDiffusersModel) {
                    setSelectedModel(standardDiffusersModel.value);
                    setSelectedProvider('diffusers');
                  } else if (imageModelsResponse.models.length > 0) {
                    // If no Diffusers models, select the first available model
                    setSelectedModel(imageModelsResponse.models[0].value);
                    setSelectedProvider(imageModelsResponse.models[0].provider);
                  }
                }
              } catch (error) {
                console.error('Error loading image models:', error);
                // Fallback to a default if fetching fails
                setSelectedProvider('diffusers');
              }
            }
        };
        
        loadAllData();
    }, [currentPath, projectPath]);



const [selectedGeneratedImage, setSelectedGeneratedImage] = useState(null);
const [isRefreshing, setIsRefreshing] = useState(false);


// Add this function before the render functions
const handleRefreshImages = async () => {
  setIsRefreshing(true);
  try {
    await loadImagesForAllSources(imageSources);
  } catch (err) {
    setError('Failed to refresh images: ' + err.message);
  } finally {
    setIsRefreshing(false);
  }
};
// Update the Use button handler
const handleUseGeneratedImage = async (imageData) => {
  try {
   
    const response = await fetch(imageData);
    const blob = await response.blob();
    const timestamp = Date.now();
    const filename = `generated_${timestamp}.png`;
    
   
    await window.api?.saveGeneratedImage?.(blob, activeSource?.path, filename);
    
   
    await loadImagesForAllSources(imageSources);
    
   
    const newImagePath = `media://${activeSource?.path}/${filename}`;
    setSelectedImage(newImagePath);
    setActiveTab('editor');
    
   
    setSelectedGeneratedImage({
      path: `${activeSource?.path}/${filename}`,
      data: imageData
    });
    
  } catch (error) {
    console.error('Failed to save generated image:', error);
    setError('Failed to save generated image: ' + error.message);
  }
};

// Add these missing functions before the return statement
const handleUseSelected = () => {
 
  setActiveTab('editor');
 
  setSelectedGeneratedImages(new Set());
};

// Add this state near the top with other state declarations
const [generatedFilenames, setGeneratedFilenames] = useState([]);
const exportLabelsAsJSON = () => {
  if (labels.length === 0) return;
  const payload = { image: selectedImage, labels };
  const filename = `${getFileName(selectedImage) || 'labels'}.labels.json`;
  downloadFile(JSON.stringify(payload, null, 2), filename, 'application/json');
};

const exportLabelsAsCSV = () => {
  if (labels.length === 0) return;

  const headers = ['image_filename', 'id', 'label', 'type', 'coords_json'];
  const rows = labels.map(l => {
      const filename = getFileName(selectedImage) || 'unknown_image';
      const coords_json = JSON.stringify(l.coords);
      const safeLabel = `"${l.label.replace(/"/g, '""')}"`;
      const safeCoords = `"${coords_json.replace(/"/g, '""')}"`;
      return [filename, l.id, safeLabel, l.type, safeCoords].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const filename = `${getFileName(selectedImage) || 'labels'}.labels.csv`;
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
};

const handleLabelImport = async (file) => {
  if (!file) return;
  const extension = file.name.split('.').pop().toLowerCase();

  try {
      const content = await readFileAsText(file);
      
      if (extension === 'json') {
          const json = JSON.parse(content);
          if (Array.isArray(json)) setLabels(json);
          else if (Array.isArray(json.labels)) setLabels(json.labels);
          else throw new Error('Invalid JSON labels file structure.');
      } else if (extension === 'csv') {
          const lines = content.split('\n').filter(line => line.trim() !== '');
          if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.');

          const headerLine = lines.shift();
          const headers = parseCsvLine(headerLine);
          const requiredHeaders = ['id', 'label', 'type', 'coords_json'];
          if (!requiredHeaders.every(h => headers.includes(h))) {
              throw new Error(`CSV must contain headers: ${requiredHeaders.join(', ')}`);
          }

          const idIndex = headers.indexOf('id');
          const labelIndex = headers.indexOf('label');
          const typeIndex = headers.indexOf('type');
          const coordsIndex = headers.indexOf('coords_json');
          
          const newLabels = lines.map(line => {
              const values = parseCsvLine(line);
              if (values.length < headers.length) return null;
              try {
                  return {
                      id: values[idIndex],
                      label: values[labelIndex],
                      type: values[typeIndex],
                      coords: JSON.parse(values[coordsIndex]),
                  };
              } catch {
                  return null; // Skip rows with invalid JSON in coords
              }
          }).filter(Boolean);
          
          setLabels(newLabels);
      } else {
          throw new Error('Unsupported file type. Please upload a .json or .csv file.');
      }
  } catch (e) {
      setError(`Failed to import labels: ${e.message}`);
  }
};
const [generateFilename, setGenerateFilename] = useState('vixynt_gen');
 
  const handleImageSelect = (index, isSelected) => {
    const newSelected = new Set(selectedGeneratedImages);
    if (isSelected) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
    }
    setSelectedGeneratedImages(newSelected);
  };

  

  

  const handleContextMenu = (e, imgPath) => {
    e.preventDefault(); e.stopPropagation();
    // If right-clicked image is not in current selection, start a new selection with just this image
    // If it is in current selection, keep the full selection (for multi-select right-click)
    if (!selectedImageGroup.has(imgPath)) {
        setSelectedImage(imgPath);
        setSelectedImageGroup(new Set([imgPath]));
    } else {
        // Image is already selected - keep current selection but update selectedImage for single operations
        setSelectedImage(imgPath);
    }
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, imagePath: imgPath });
  };
  const handleRenameStart = () => { 
    setRenamingImage({ path: selectedImage, newName: getFileName(selectedImage) }); 
    setContextMenu({ visible: false });
    setLightboxIndex(null);
  };
  

  const handleRenameSubmit = async () => {
    if (!renamingImage.path || !renamingImage.newName.trim()) {
        setRenamingImage({ path: null, newName: '' });
        return;
    }

    try {
        const oldPath = renamingImage.path.replace('media://', '');
        const pathParts = oldPath.split('/');
        const newPath = [...pathParts.slice(0, -1), renamingImage.newName].join('/');
        
        await window.api?.renameFile?.(oldPath, newPath);
        
       
        await loadImagesForAllSources(imageSources);
        
       
        if (selectedImage === renamingImage.path) {
            setSelectedImage(`media://${newPath}`);
        }
        
        setRenamingImage({ path: null, newName: '' });
          setContextMenu({ visible: false });
    setLightboxIndex(null);

    } catch (error) {
        console.error('Rename failed:', error);
        setError('Failed to rename file: ' + error.message);
    }
};

const handleDeleteSelected = async () => {
    if (selectedImageGroup.size === 0) return;
    
    const confirmed = window.confirm(`Delete ${selectedImageGroup.size} image(s)? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const filesToDelete = Array.from(selectedImageGroup).map(path => path.replace('media://', ''));
        await Promise.all(filesToDelete.map(path => window.api?.deleteFile?.(path)));
        
       
        setSelectedImageGroup(new Set());
        setSelectedImage(null);
        await loadImagesForAllSources(imageSources);
    } catch (error) {
        console.error('Delete failed:', error);
        setError('Failed to delete files: ' + error.message);
    }
};




  const renderHeader = () => (
    <div className="flex items-center justify-between p-3 border-b theme-border flex-shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold">Vixynt</h2>
        {renderPathNavigator()}
      </div>
    </div>
  );
  
  
 
  const pushHistory = (actionName) => { 
      console.log(`Pushing history: ${actionName}`);
      setEditHistory(h => [...h, { layers, adjustments, crop }]); 
      setRedoStack([]); 
  };

  const handleUndo = () => {
    if (activeTab !== 'editor' || editHistory.length === 0) return;
    setEditHistory(h => {
        const previousState = h[h.length - 1];
        setRedoStack(r => [{ layers, selectedLayerId, adjustments }, ...r]);
        setLayers(previousState.layers);
        setSelectedLayerId(previousState.selectedLayerId);
        setAdjustments(previousState.adjustments);
        return h.slice(0, -1);
    });
  };
  const handleRedo = () => {
     if (activeTab !== 'editor' || redoStack.length === 0) return;
     setRedoStack(r => {
        const [nextState, ...rest] = r;
        setEditHistory(h => [...h, { layers, selectedLayerId, adjustments }]);
        setLayers(nextState.layers);
        setSelectedLayerId(nextState.selectedLayerId);
        setAdjustments(nextState.adjustments);
        return rest;
     });
  };

 
  const addDarkroomLayer = (type) => {
    const layerConfig = DARKROOM_LAYER_TYPES[type];
    if (!layerConfig) return;

   
    const newLayer = { 
        id: `layer_${Date.now()}`, 
        type, 
        name: layerConfig.name, 
        visible: true, 
        params: { ...layerConfig.defaultParams }, 
        transform: { ...defaultTransform }, 
        mask: null 
    };
    const newLayers = [...layers, newLayer];
    setLayers(newLayers);
    setSelectedLayerId(newLayer.id);
    pushHistory(`Add ${layerConfig.name} Layer`);
};

const updateLayer = (layerId, newProps, commit = false) => {
    setLayers(currentLayers => 
        currentLayers.map(l => l.id === layerId ? { ...l, ...newProps } : l)
    );
    if(commit) { pushHistory('Update Layer'); }
};

const updateLayerParams = (layerId, newParams, commit = false) => {
    setLayers(currentLayers =>
        currentLayers.map(l => l.id === layerId ? { ...l, params: { ...l.params, ...newParams } } : l)
    );
    if(commit) { pushHistory('Update Layer Params'); }
};

const updateLayerTransform = (layerId, newTransform, commit = false) => {
    setLayers(currentLayers =>
        currentLayers.map(l => l.id === layerId ? { ...l, transform: { ...l.transform, ...newTransform } } : l)
    );
    if(commit) { pushHistory('Transform Layer'); }
};

const getRelativeCoords = (e) => {
  const container = e.currentTarget;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  return {
      x: clamp(x / rect.width, 0, 1),
      y: clamp(y / rect.height, 0, 1)
  };
};
const commitLayerParams = () => { pushHistory({ layers, selectedLayerId, adjustments }); };




 

  const maskCanvasRef = useRef(null);

  const calculateCombinedStyle = () => {
    console.log('Calculating combined style with adjustments:', adjustments);
    
   
    let combined = { ...adjustments };

   
    layers
        .filter(l => l.type === 'ADJUSTMENTS' && l.visible)
        .forEach(layer => {
            Object.keys(layer.params).forEach(key => {
                combined[key] = (combined[key] || 0) + layer.params[key];
            });
        });

   
    const brightness = 100 + combined.exposure + (combined.whites / 2.5) + (combined.shadows / -2.5);
    const contrast = 100 + combined.contrast + (combined.pop / 2) + (combined.highlights / 2.5) - (combined.shadows / 2.5);
    const saturate = combined.saturation + (combined.pop);
    const sepia = combined.warmth > 0 ? combined.warmth / 2 : 0;
    const hueRotate = combined.tint;
    
    const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg) blur(${combined.blur || 0}px)`;
    
    console.log('Generated filter style:', filterStyle);
    
    return {
        filter: filterStyle
    };
};

// Add missing mouse handlers:

// Fix the missing handleBaseAdjustmentChange:
const handleBaseAdjustmentChange = (key, value) => {
    console.log(`Adjusting ${key} to ${value}`);
    setAdjustments(prev => ({ ...prev, [key]: value }));
};


const applySelectionAsMask = () => {
    if (!selectionPath || !selectedLayerId) return;
    updateLayer(selectedLayerId, { mask: selectionPath }, true);
    setSelectionPath(null);
};




useEffect(() => { setDisplayedImagesCount(IMAGES_PER_PAGE); }, [activeSourceId, searchTerm]);

useEffect(() => {
    if (!selectedImage) return;
    
   
    setAdjustments({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, saturation: 100, warmth: 0, tint: 0, pop: 0, vignette: 0, blur: 0 });
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setLayers([]); 
    setSelectedLayerId(null);
    setEditHistory([]); 
    setRedoStack([]);
    setSelectionPath(null);
    setIsCropping(false);
    setEditorTool('select');
    
   
   
    const fsPath = selectedImage.replace('media://', '');
    window.api?.getImageMetadata?.(fsPath).then(m => { setMetadata(m || {}); /* ... */ });
    window.api?.loadLabels?.(fsPath).then(ls => setLabels(Array.isArray(ls) ? ls : []));
}, [selectedImage]);

  useEffect(() => {
   
    if (activeTab !== 'editor' || !selectedImage) return;

    const canvas = document.getElementById('editor-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.src = selectedImage;
    img.onload = () => {
       
        const container = canvas.parentElement;
        const hRatio = container.clientWidth / img.width;
        const vRatio = container.clientHeight / img.height;
        const ratio = Math.min(hRatio, vRatio, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

       
        console.log("Canvas ready for layer rendering.");
    };

  }, [selectedImage, layers, selectionPath, activeTab]);

  
  

  useEffect(() => {
    if (currentPath && currentPath !== projectPath) {
        setProjectPath(currentPath);
    }
  }, [currentPath]);
  
  
  
    useEffect(() => {
        const initialSources = [
          { id: 'project-images', name: 'Project Images', path: projectPath, icon: Folder },
          { id: 'global-images', name: 'Global Images', path: '~/.npcsh/images', icon: ImageIcon },
          { id: 'screenshots', name: 'Screenshots', path: '~/.npcsh/screenshots', icon: Camera },
        ];
        loadImagesForAllSources(initialSources);
    }, [projectPath, loadImagesForAllSources]);
  
    useEffect(() => {
      const handleKeyDown = (e) => {
          if (lightboxIndex !== null) {
              if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
                  setLightboxIndex(i => i - 1);
} else if (e.key === 'ArrowRight' && lightboxIndex < sortedAndFilteredImages.length - 1) {                  setLightboxIndex(i => i + 1);
              }
          }

          console.log('Key pressed:', e.key);
          if (e.key === 'Escape') {
              if (lightboxIndex !== null) {
                  setLightboxIndex(null);
              } else if (contextMenu.visible) {
                  setContextMenu({ visible: false });
              } else if (renamingImage.path) {
                  setRenamingImage({ path: null, newName: '' });
              } else if (isEditingPath) {
                  setIsEditingPath(false);
              } else if (selectionPath) {
                  setSelectionPath(null);
              } else if (isCropping) {
                  setIsCropping(false);
              }
          }
          if ((e.ctrlKey || e.metaKey) && !textEditState.editing) {
              if (e.key.toLowerCase() === 'z') handleUndo();
              if (e.key.toLowerCase() === 'y') handleRedo();
          }
          if (e.key === 'Enter' && isEditingPath) {
              setIsEditingPath(false);
          }
      };
  
      const handleClickOutside = () => {
          if (contextMenu.visible) {
              setContextMenu({ visible: false });
          }
      };

      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('click', handleClickOutside);

      return () => {
          document.removeEventListener('keydown', handleKeyDown);
          document.removeEventListener('click', handleClickOutside);
      };
  }, [contextMenu.visible, renamingImage.path, isEditingPath, selectionPath, isCropping, textEditState.editing, lightboxIndex, filteredImages.length]);

  

  const startDraw = (e) => {
    if (!selectedImage) return;
    const ne = e.nativeEvent.touches?.[0] || e;
    const p = getRelativeCoords(e);
    if (!p) return;
    setDrawing(true);
    if (activeTool === 'rect') setDrawPoints([p, p]);
    if (activeTool === 'point') {
      const point = { id: crypto.randomUUID(), type: 'point', coords: [p], label: newLabelName || 'Point' };
      setLabels((ls) => [...ls, point]);
    }
    if (activeTool === 'polygon') setDrawPoints([p]);
  };

  const moveDraw = (e) => {
    if (!drawing) return;
    const ne = e.nativeEvent.touches?.[0] || e;
    const p = getRelativeCoords(e);
    if (!p) return;
    setDrawPoints((pts) => {
      if (activeTool === 'rect' && pts.length === 2) return [pts[0], p];
      if (activeTool === 'polygon' && pts.length >= 1) return [...pts.slice(0, -1), p];
      return pts;
    });
  };

  const addPolygonVertex = (e) => {
    if (!drawing || activeTool !== 'polygon') return;
    const ne = e.nativeEvent.touches?.[0] || e;
    const p = getRelativeCoords(e);
    if (!p) return;
    setDrawPoints((pts) => [...pts.slice(0, -1), p, p]);
  };



  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    const defaultLabel = `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} ${labels.filter(l => l.type === activeTool).length + 1}`;
    if (activeTool === 'rect' && drawPoints.length === 2) {
      const [a, b] = drawPoints;
      const rect = { id: crypto.randomUUID(), type: 'rect', coords: [a, b], label: defaultLabel };
      setLabels((ls) => [...ls, rect]);
    }
    if (activeTool === 'polygon') {
      if (drawPoints.length >= 3) {
        const poly = { id: crypto.randomUUID(), type: 'polygon', coords: drawPoints.slice(0, -1), label: defaultLabel };
        setLabels((ls) => [...ls, poly]);
      }
    }
    setDrawPoints([]);
  };

  const updateLabelName = (id, newName) => {
    setLabels(prevLabels => 
        prevLabels.map(l => l.id === id ? { ...l, label: newName } : l)
    );
    setEditingLabelId(null);
  };
  const removeLabel = (id) => setLabels((ls) => ls.filter(l => l.id !== id));
  const saveLabels = async () => {
    if (!selectedImage) return;
    const fsPath = selectedImage.replace('media://', '');
    try { await window.api?.saveLabels?.(fsPath, labels); }
    catch (e) { console.error('Failed to save labels', e); setError('Failed to save labels'); }
  };
  const exportLabels = () => {
    const payload = { image: selectedImage, labels };
    downloadJSON(payload, `${getFileName(selectedImage) || 'labels'}.labels.json`);
  };
  const importLabels = async (file) => {
    try {
      const json = await readJSONFile(file);
      if (Array.isArray(json)) setLabels(json);
      else if (Array.isArray(json.labels)) setLabels(json.labels);
    } catch (e) { setError('Invalid labels file'); }
  };

 
  const updateMetaField = (path, value) => {
    setMetadata((m) => {
      const clone = { ...(m || {}) };
      const keys = path.split('.');
      let ref = clone;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        ref[k] = ref[k] || {};
        ref = ref[k];
      }
      ref[keys[keys.length - 1]] = value;
      return clone;
    });
  };
  const saveMetadata = async () => {
    if (!selectedImage) return;
    const fsPath = selectedImage.replace('media://', '');
    try {
      await window.api?.updateImageMetadata?.(fsPath, { ...metadata, custom: { ...(metadata?.custom || {}), tags: customTags } });
    } catch (e) {
      console.error('Save metadata failed', e);
      setError('Save metadata failed');
    }
  };
  const applyMetadataToSelection = async () => {
    if (selectedImageGroup.size === 0 || !metadata) return;
    const targets = Array.from(selectedImageGroup).map(p => p.replace('media://', ''));
    try {
      await Promise.all(targets.map(t =>
        window.api?.updateImageMetadata?.(t, { ...metadata, custom: { ...(metadata?.custom || {}), tags: customTags } })
      ));
    } catch (e) { setError('Batch metadata update failed'); }
  };



  
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleUploadFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      await window.api?.saveUploadedFiles?.(files.map(f => ({ name: f.name, blob: f })), activeSource?.path);
      await loadImagesForAllSources(imageSources);
    } catch (err) { setError('Upload failed: ' + err.message); }
  };
 
  const renderSidebar = () => (
    <div className={`${sidebarCollapsed ? 'w-12' : 'w-64'} border-r theme-border flex flex-col flex-shrink-0 theme-sidebar transition-all duration-200`}>
      {/* Collapse toggle button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="p-2 border-b theme-border hover:bg-white/5 transition-colors flex items-center justify-center"
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {!sidebarCollapsed ? (
        <>
          <div className="p-3 border-b theme-border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold theme-text-secondary uppercase tracking-wider">Sources</h4>
              <button
                onClick={handleRefreshImages}
                disabled={isRefreshing}
                className="p-1 theme-hover rounded-full transition-all disabled:opacity-50"
                title="Refresh images"
              >
                {isRefreshing ? (
                  <Loader size={14} className="animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.44-4.5M22 12.5a10 10 0 0 1-18.44 4.5"/>
                  </svg>
                )}
              </button>
            </div>
            {imageSources.map(source => (
              <button key={source.id} onClick={() => setActiveSourceId(source.id)}
                className={`w-full text-left p-2 rounded text-sm mb-1 flex items-center gap-2 ${activeSourceId === source.id ? 'theme-button-primary' : 'theme-hover'}`}>
                <source.icon size={14} /> <span>{source.name}</span>
                <span className="ml-auto text-xs theme-text-muted">({source.images?.length || 0})</span>
              </button>
            ))}
          </div>

          <div className="p-3 border-b theme-border">
            <h4 className="text-xs font-semibold theme-text-secondary uppercase tracking-wider mb-2">View Options</h4>
            <div className="flex gap-1 mb-2">
              <button onClick={() => setViewMode('grid')}
                className={`flex-1 p-2 rounded flex items-center justify-center gap-2 ${viewMode === 'grid' ? 'theme-button-primary' : 'theme-hover'}`}>
                <LayoutGrid size={14} /></button>
              <button onClick={() => setViewMode('list')}
                className={`flex-1 p-2 rounded flex items-center justify-center gap-2 ${viewMode === 'list' ? 'theme-button-primary' : 'theme-button theme-hover'}`}>
                <List size={14} /></button>
            </div>
            <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 theme-text-muted" />
              <input type="text" placeholder="Filter by name..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} className="w-full pl-8 theme-input text-sm rounded" /></div>
            <div className="relative mt-2"><Search size={14} className="absolute left-2.5 top-2.5 theme-text-muted" />
              <input type="text" placeholder="Filter by metadata (keyword)…" value={metaSearch}
                onChange={e => setMetaSearch(e.target.value)} className="w-full pl-8 theme-input text-sm rounded" /></div>
          </div>
          <div className="p-3 flex-1 overflow-y-auto">
            {selectedImageGroup.size > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold theme-text-secondary uppercase tracking-wider">Batch Actions</h4>
                <button
                    className="w-full theme-button flex items-center gap-2
                        justify-center text-sm py-2 rounded"
                    onClick={() => setShowFineTuneModal(true)}
                >
                    <Wand2 size={14} /> Fine-tune Model
                </button>

                <button className="w-full theme-button flex items-center gap-2 justify-center text-sm py-2 rounded"
                  onClick={applyMetadataToSelection}><Save size={14} /> Apply Metadata</button>
                <button className="w-full theme-button flex items-center gap-2 justify-center text-sm py-2 rounded"
                  onClick={() => setActiveTab('labeling')}><Tag size={14} /> Label Selected</button>
                <button className="w-full theme-button flex items-center gap-2 justify-center text-sm py-2 rounded"
                  onClick={handleDeleteSelected}><Trash2 size={14} /> Delete ({selectedImageGroup.size})</button>
              </div>
            )}
          </div>
          <div className="p-3 border-t theme-border">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadFiles} />
            <button className="w-full theme-button-primary flex items-center justify-center gap-2 text-sm py-2 rounded"
              onClick={handleUploadClick}><Upload size={16} /> Upload Image</button>
          </div>
        </>
      ) : (
        /* Collapsed sidebar - icon-only buttons */
        <div className="flex flex-col items-center py-2 space-y-2">
          {imageSources.map(source => (
            <button
              key={source.id}
              onClick={() => setActiveSourceId(source.id)}
              className={`p-2 rounded ${activeSourceId === source.id ? 'theme-button-primary' : 'theme-hover'}`}
              title={source.name}
            >
              <source.icon size={16} />
            </button>
          ))}
          <div className="border-t theme-border w-6 my-2" />
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded ${viewMode === 'grid' ? 'theme-button-primary' : 'theme-hover'}`}
            title="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${viewMode === 'list' ? 'theme-button-primary' : 'theme-hover'}`}
            title="List view"
          >
            <List size={16} />
          </button>
          <div className="flex-1" />
          <button
            onClick={handleUploadClick}
            className="p-2 rounded theme-button-primary"
            title="Upload Image"
          >
            <Upload size={16} />
          </button>
        </div>
      )}
    </div>
  );

  
useEffect(() => {
    const savedView = localStorage.getItem('vixynt_viewMode');
    if (savedView) setViewMode(savedView);
}, []);

useEffect(() => {
    localStorage.setItem('vixynt_viewMode', viewMode);
}, [viewMode]);

useEffect(() => {
    localStorage.setItem('vixynt_sidebarCollapsed', String(sidebarCollapsed));
}, [sidebarCollapsed]);

const [sortBy, setSortBy] = useState('name');
const [sortOrder, setSortOrder] = useState('asc');
const [filterType, setFilterType] = useState('all');
const [imageMetaCache, setImageMetaCache] = useState({});

const sortedAndFilteredImages = React.useMemo(() => {
    const source = imageSources.find(s => s.id === activeSourceId);
    const allImages = source?.images || [];
    
    let result = allImages.filter(img => 
        img.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filterType !== 'all') {
        result = result.filter(img => {
            const ext = img.split('.').pop().toLowerCase();
            if (filterType === 'jpg') return ext === 'jpg' || ext === 'jpeg';
            if (filterType === 'png') return ext === 'png';
            if (filterType === 'webp') return ext === 'webp';
            if (filterType === 'gif') return ext === 'gif';
            return true;
        });
    }
    
    result.sort((a, b) => {
        const nameA = getFileName(a).toLowerCase();
        const nameB = getFileName(b).toLowerCase();
        const extA = a.split('.').pop().toLowerCase();
        const extB = b.split('.').pop().toLowerCase();
        const metaA = imageMetaCache[a] || {};
        const metaB = imageMetaCache[b] || {};
        
        let comparison = 0;
        if (sortBy === 'name') {
            comparison = nameA.localeCompare(nameB);
        } else if (sortBy === 'type') {
            comparison = extA.localeCompare(extB);
        } else if (sortBy === 'size') {
            const sizeA = metaA?.size || metaA?.file?.size || 0;
            const sizeB = metaB?.size || metaB?.file?.size || 0;
            comparison = sizeA - sizeB;
        } else if (sortBy === 'date') {
            const dateA = metaA?.mtime || metaA?.file?.modified || 0;
            const dateB = metaB?.mtime || metaB?.file?.modified || 0;
            comparison = new Date(dateA) - new Date(dateB);
        }
        
        return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return result;
}, [imageSources, activeSourceId, searchTerm, sortBy, sortOrder, filterType, imageMetaCache]);

useEffect(() => {
    if (viewMode !== 'list') return;
    
    const visible = sortedAndFilteredImages.slice(0, displayedImagesCount);
    const toLoad = visible.filter(img => !imageMetaCache[img]);
    
    if (toLoad.length === 0) return;
    
    let cancelled = false;
    
    const loadBatch = async () => {
        for (const img of toLoad) {
            if (cancelled) break;
            const fsPath = img.replace('media://', '');
            const stats = await window.api?.getFileStats?.(fsPath);
            if (!cancelled && stats) {
                setImageMetaCache(prev => ({ ...prev, [img]: stats }));
            }
        }
    };
    
    loadBatch();
    
    return () => { cancelled = true; };
}, [viewMode, sortedAndFilteredImages, displayedImagesCount]);
const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatDate = (dateVal) => {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
};
useEffect(() => {
    if (viewMode !== 'list') return;
    
    const visible = sortedAndFilteredImages.slice(0, displayedImagesCount);
    const toLoad = visible.filter(img => !imageMetaCache[img]);
    
    if (toLoad.length === 0) return;
    
    let cancelled = false;
    
    const loadBatch = async () => {
        for (const img of toLoad) {
            if (cancelled) break;
            const fsPath = img.replace('media://', '');
            console.log('Loading stats for:', fsPath);
            const stats = await window.api?.getFileStats?.(fsPath);
            console.log('Got stats:', stats);
            if (!cancelled && stats) {
                setImageMetaCache(prev => ({ ...prev, [img]: stats }));
            }
        }
    };
    
    loadBatch();
    
    return () => { cancelled = true; };
}, [viewMode, sortedAndFilteredImages, displayedImagesCount]);

// Split clip at playhead for video editor
const splitClipAtPlayhead = useCallback(() => {
    const clipAtPlayhead = videoClips.find(c =>
        c.trackId && c.x <= videoCurrentTime && (c.x + c.duration) >= videoCurrentTime
    );
    if (clipAtPlayhead) {
        const splitPoint = videoCurrentTime - clipAtPlayhead.x;
        if (splitPoint > 0.1 && splitPoint < clipAtPlayhead.duration - 0.1) {
            const newClip = {
                ...clipAtPlayhead,
                id: `clip_${Date.now()}`,
                x: videoCurrentTime,
                duration: clipAtPlayhead.duration - splitPoint,
                trimStart: (clipAtPlayhead.trimStart || 0) + splitPoint
            };
            setVideoClips(prev => [
                ...prev.map(c => c.id === clipAtPlayhead.id ? {...c, duration: splitPoint} : c),
                newClip
            ]);
        }
    }
}, [videoClips, videoCurrentTime]);

// Video editor keyboard shortcuts
useEffect(() => {
    const handleKeyDown = (e) => {
        if (activeTab !== 'video-editor') return;
        if (e.code === 'Space') {
            e.preventDefault();
            const video = videoPreviewRef.current;
            if (video) {
                if (videoPlaying) video.pause();
                else video.play().catch(() => {});
            }
            setVideoPlaying(!videoPlaying);
        }
        if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            splitClipAtPlayhead();
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
            if (selectedClipId && !e.target.closest('input, textarea')) {
                setVideoClips(prev => prev.filter(c => c.id !== selectedClipId));
                setSelectedClipId(null);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeTab, videoPlaying, videoCurrentTime, selectedClipId, splitClipAtPlayhead]);

// Single click: select image only
const handleImageClick = (e, imgPath, index) => {
    e.stopPropagation();
    setRenamingImage({ path: null, newName: '' });

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const newSelection = new Set(selectedImageGroup);
        if (e.shiftKey && lastClickedIndex !== null) {
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            for (let i = start; i <= end; i++) {
                newSelection.add(sortedAndFilteredImages[i]);
            }
        } else {
            if (newSelection.has(imgPath)) {
                newSelection.delete(imgPath);
            } else {
                newSelection.add(imgPath);
            }
        }
        setSelectedImageGroup(newSelection);
        setLastClickedIndex(index);
    } else {
        // Single click: select only, don't open lightbox
        const newSelection = new Set([imgPath]);
        setSelectedImageGroup(newSelection);
        setSelectedImage(imgPath);
        setLastClickedIndex(index);
    }
};

// Double click: open lightbox
const handleImageDoubleClick = (e, imgPath, index) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setSelectedImage(imgPath);
};

const renderLightbox = () => {
    if (lightboxIndex === null) return null;

    // Use npcts Lightbox component
    return (
        <Lightbox
            images={sortedAndFilteredImages}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
            onContextMenu={(src, e) => handleImageContextMenu(e, src)}
            className="z-[60]"
        />
    );
};

const renderGallery = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b 
            theme-border theme-bg-secondary/40">
            <div className="flex items-center gap-2 text-xs theme-text-muted">
                <span>{sortedAndFilteredImages.length} items</span>
                {selectedImageGroup.size > 0 && (
                    <span>• {selectedImageGroup.size} selected</span>
                )}
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <span className="text-xs theme-text-muted">Sort:</span>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="theme-input text-xs py-1"
                    >
                      <option value="name">Name</option>
                      <option value="type">Type</option>
                      <option value="size">Size</option>
                      <option value="date">Date</option>
                    </select>
                    <button
                        onClick={() => setSortOrder(
                            sortOrder === 'asc' ? 'desc' : 'asc'
                        )}
                        className="theme-button px-2 py-1 text-xs"
                        title={sortOrder === 'asc' 
                            ? 'Ascending' 
                            : 'Descending'}
                    >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
                
                <div className="flex items-center gap-1">
                    <span className="text-xs theme-text-muted">Type:</span>
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="theme-input text-xs py-1"
                    >
                        <option value="all">All</option>
                        <option value="jpg">JPG</option>
                        <option value="png">PNG</option>
                        <option value="webp">WebP</option>
                        <option value="gif">GIF</option>
                    </select>
                </div>
                
                <button 
                    className="theme-button px-3 py-1 text-sm rounded 
                        flex items-center gap-1" 
                    onClick={() => setActiveTab('metadata')}
                >
                    <Info size={14} /> Metadata
                </button>
                <button 
                    className="theme-button px-3 py-1 text-sm rounded 
                        flex items-center gap-1" 
                    onClick={() => setActiveTab('labeling')}
                >
                    <Tag size={14} /> Label
                </button>
            </div>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">
            {viewMode === 'grid' ? (
                <ImageGrid
                    images={sortedAndFilteredImages.slice(0, displayedImagesCount)}
                    selected={selectedImageGroup}
                    onSelect={(img, e) => {
                        const index = sortedAndFilteredImages.indexOf(img);
                        handleImageClick(e, img, index);
                    }}
                    onContextMenu={(img, e) => handleContextMenu(e, img)}
                    columns={{ sm: 2, md: 4, lg: 8 }}
                    gap={16}
                    showFilename={false}
                    loading={loading}
                    emptyMessage="No images found."
                    renderItem={(img, isSelected) => {
                        const isRenaming = renamingImage.path === img;
                        if (isRenaming) {
                            return (
                                <div className="relative aspect-square">
                                    <input
                                        type="text"
                                        value={renamingImage.newName}
                                        onChange={(e) => setRenamingImage(
                                            p => ({ ...p, newName: e.target.value })
                                        )}
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' && handleRenameSubmit()
                                        }
                                        onBlur={handleRenameSubmit}
                                        className="w-full h-full p-2 theme-input text-xs"
                                        autoFocus
                                    />
                                </div>
                            );
                        }
                        const index = sortedAndFilteredImages.indexOf(img);
                        return (
                            <div
                                className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group
                                    ${isSelected ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-blue-500' : ''}`}
                                onDoubleClick={(e) => handleImageDoubleClick(e, img, index)}
                            >
                                <img src={img} alt="" className="w-full h-full object-cover theme-bg-secondary" draggable={false} />
                                <div className={`absolute inset-0 transition-all duration-200 pointer-events-none
                                    ${!isSelected ? 'group-hover:bg-black/40' : ''}`} />
                                {isSelected && (
                                    <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                                        <Check size={12} className="text-white" />
                                    </div>
                                )}
                            </div>
                        );
                    }}
                />
            ) : (
    <div className="space-y-1">
        <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs 
            font-semibold theme-text-secondary border-b theme-border">
            <div className="col-span-1"></div>
            <div className="col-span-5">Name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Date</div>
        </div>
                    
        {loading ? (
            <div className="flex justify-center p-8">
                <Loader className="animate-spin" />
            </div>
        ) : sortedAndFilteredImages.length > 0 ? (
            sortedAndFilteredImages
                .slice(0, displayedImagesCount)
                .map((img, index) => {
                    const isSelected = selectedImageGroup.has(img);
                    const isRenaming = renamingImage.path === img;
                    const filename = getFileName(img);
                    const ext = filename.split('.').pop().toUpperCase();
                    const meta = imageMetaCache[img] || {};
                    
                    return (
                        <div
                            key={img}
                            onClick={(e) => handleImageClick(e, img, index)}
                            onDoubleClick={(e) => handleImageDoubleClick(e, img, index)}
                            onContextMenu={(e) => handleContextMenu(e, img)}
                            className={`grid grid-cols-12 gap-2 px-2 py-2
                                rounded cursor-pointer items-center
                                ${isSelected
                                    ? 'bg-blue-900/30 ring-1 ring-blue-500'
                                    : 'theme-hover'}`}
                        >
                            <div className="col-span-1">
                                <img 
                                    src={img} 
                                    alt="" 
                                    className="w-10 h-10 object-cover rounded"
                                />
                            </div>
                            <div className="col-span-5 truncate text-sm">
                                {isRenaming ? (
                                    <input
                                        type="text"
                                        value={renamingImage.newName}
                                        onChange={(e) => setRenamingImage(
                                            p => ({ ...p, newName: e.target.value })
                                        )}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === 'Enter') handleRenameSubmit();
                                            if (e.key === 'Escape') setRenamingImage({ 
                                                path: null, 
                                                newName: '' 
                                            });
                                        }}
                                        onBlur={handleRenameSubmit}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full theme-input text-xs py-1"
                                        autoFocus
                                    />
                                ) : (
                                    <span title={filename}>{filename}</span>
                                )}
                            </div>
                            <div className="col-span-2 text-xs theme-text-muted">
                                {ext}
                            </div>
<div className="col-span-2 text-xs theme-text-muted">
    {formatFileSize(meta?.size)}
</div>
<div className="col-span-2 text-xs theme-text-muted">
    {formatDate(meta?.mtime)}
</div>

                        </div>
                    );
                })
        ) : (
            <div className="text-center p-8 theme-text-muted">
                No images found.
            </div>
        )}
    </div>
)}
        </div>

        {sortedAndFilteredImages.length > displayedImagesCount && (
            <div className="p-4 border-t theme-border text-center">
                <button 
                    onClick={() => setDisplayedImagesCount(prev => prev + IMAGES_PER_PAGE)}
                    className="theme-button px-4 py-2 text-sm rounded"
                >
                    Load More ({sortedAndFilteredImages.length - displayedImagesCount} remaining)
                </button>
            </div>
        )}
    </div>
);
  const renderImageContextMenu = () => (
    contextMenu.visible && (
        <>
            <div
                className="fixed inset-0 z-[75] bg-transparent"
                onClick={() => setContextMenu({ visible: false })}
            />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-[80]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
            >
                <button
                    onClick={handleSendToLLM}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm"
                >
                    <MessageSquare size={14} />
                    <span>Send to LLM</span>
                </button>
                <button
                    onClick={() => { setActiveTab('editor'); setContextMenu({ visible: false }); setLightboxIndex(null); }}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm"
                >
                    <Edit size={14} />
                    <span>Edit Image</span>
                </button>
                <button
                    onClick={handleUseForGeneration}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm"
                >
                    <Sparkles size={14} />
                    <span>Use for Generation</span>
                </button>
                <hr className="my-1 theme-border" />
                <button
                    onClick={handleRenameStart}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm"
                >
                    <Edit size={14} />
                    <span>Rename</span>
                </button>
                <button
                    onClick={() => { handleDeleteSelected(); setContextMenu({ visible: false }); setLightboxIndex(null); }}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-red-400 text-sm hover:bg-red-600/20"
                >
                    <Trash2 size={14} />
                    <span>Delete</span>
                </button>
            </div>
        </>
    )
);


  const handleSendToLLM = () => {
  const selectedImages = Array.from(selectedImageGroup);
  if (selectedImages.length === 0) return;
  
  onStartConversation?.(selectedImages.map(path => ({ path: path.replace('media://', '') })));
  setContextMenu({ visible: false });
  setLightboxIndex(null);
};

const handleUseForGeneration = () => {
  if (contextMenu.imagePath) {
     
      setActiveTab('generator');
     
      setGeneratePrompt(prev => `${prev} ${prev ? '\n\n' : ''}Using reference image: ${getFileName(contextMenu.imagePath)}`);
  }
  setContextMenu({ visible: false });
  setLightboxIndex(null);
  
};
  const handleImageContextMenu = (e, imgPath) => {
    e.preventDefault(); 
    e.stopPropagation();
    if (!selectedImageGroup.has(imgPath)) { 
        setSelectedImage(imgPath); 
        setSelectedImageGroup(new Set([imgPath])); 
    }
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, imagePath: imgPath });
};
  const renderMetadata = () => (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex items-center justify-center theme-bg-primary relative p-4">{selectedImage ? <img src={selectedImage} alt="Metadata" className="max-w-full max-h-full object-contain rounded shadow" /> : <p className="theme-text-muted">Select an image to view metadata</p>}</div>
      <div className="w-96 border-l theme-border theme-bg-secondary p-4 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between"><h4 className="text-lg font-semibold">Image Details</h4><button onClick={saveMetadata} className="theme-button-primary px-3 py-1 rounded flex items-center gap-2"><Save size={14} />Save</button></div>
        {!metadata ? <p className="theme-text-muted">No metadata loaded.</p> : (
          <>
            <SettingsSection title="General">
              <StarRating rating={rating} onChange={setRating} className="mb-4" />
              <Field label="Title" value={metadata?.iptc?.title || ''} onChange={v => updateMetaField('iptc.title', v)} />
              <Field label="Description" value={metadata?.iptc?.description || ''} onChange={v => updateMetaField('iptc.description', v)} multiline />
              <TagsEditor tags={customTags} setTags={setCustomTags} />
            </SettingsSection>
            
            <details className="theme-border border rounded-lg" open>
                <summary className="p-3 cursor-pointer text-sm font-semibold">Camera Details (EXIF)</summary>
                <div className="p-3 border-t theme-border space-y-2">
                    <Field label="Camera" value={metadata?.exif?.camera || 'N/A'} onChange={v => updateMetaField('exif.camera', v)} />
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="ISO" value={metadata?.exif?.iso || 'N/A'} onChange={v => updateMetaField('exif.iso', v)} />
                        <Field label="Aperture" value={metadata?.exif?.aperture || 'N/A'} onChange={v => updateMetaField('exif.aperture', v)} />
                    </div>
                </div>
            </details>

            <details className="theme-border border rounded-lg">
                <summary className="p-3 cursor-pointer text-sm font-semibold">Rights & Credits</summary>
                <div className="p-3 border-t theme-border space-y-2">
                    <Field label="Creator" value={metadata?.iptc?.creator || ''} onChange={v => updateMetaField('iptc.creator', v)} />
                    <Field label="Copyright" value={metadata?.iptc?.copyright || ''} onChange={(v) => updateMetaField('iptc.copyright', v)} />
                </div>
            </details>
          </>
        )}
      </div>
    </div>
  );


  const renderPathNavigator = () => {
    const displayPath = currentPath || projectPath;
    
    return (
      <div className="flex items-center gap-2 text-sm theme-text-secondary p-2 flex-grow min-w-0" onClick={() => setIsEditingPath(true)}>
          <FolderOpen size={16} className="flex-shrink-0 theme-text-muted" />
          {isEditingPath ? (
              <input type="text" value={projectPath} onChange={e => setProjectPath(e.target.value)}
                     className="theme-input bg-transparent theme-text-primary w-full" autoFocus onBlur={() => setIsEditingPath(false)} />
          ) : (
              <div className="flex items-center gap-1 truncate">
                  {displayPath.split('/').map((part, i) => (
                      <React.Fragment key={i}>
                          {i > 0 && <span className="text-gray-600">/</span>}
                          <button className="px-1 rounded hover:theme-bg-tertiary">{part || '/'}</button>
                      </React.Fragment>
                  ))}
              </div>
          )}
      </div>
    );
  };

  
  const renderLabeling = () => (
    <div className="flex-1 flex overflow-hidden">
      <div
        className="flex-1 relative theme-bg-primary flex items-center justify-center select-none"
      >
        {selectedImage ? (
          <div 
            className="relative"
            onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onDoubleClick={addPolygonVertex}
            onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
          >
            <img 
              src={selectedImage} 
              alt="Labeling" 
              className="max-w-full max-h-full object-contain pointer-events-none"
              draggable="false"
            />
            {drawing && drawPoints.length > 0 && (
              <OverlayShape points={drawPoints} type={activeTool} />
            )}
            {labels.map((l) => (
              <PlacedShape key={l.id} shape={l} onRemove={() => removeLabel(l.id)} />
            ))}
          </div>
        ) : (<p className="theme-text-muted">Select an image to label</p>)}
      </div>
      <div className="w-80 border-l theme-border theme-bg-secondary p-4 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold">Labels</h4>
          <div className="flex gap-2">
            <button className="theme-button" onClick={saveLabels} title="Save labels to disk"><Save size={14} /></button>
            
            <div className="relative group">
                <button className="theme-button" title="Export labels"><Download size={14} /></button>
                <div className="absolute right-0 top-full mt-1 w-32 theme-bg-secondary border theme-border rounded shadow-lg hidden group-hover:block z-10">
                    <button onClick={exportLabelsAsJSON} className="w-full text-left px-3 py-1.5 text-sm theme-hover">as JSON</button>
                    <button onClick={exportLabelsAsCSV} className="w-full text-left px-3 py-1.5 text-sm theme-hover">as CSV</button>
                </div>
            </div>

            <label className="theme-button cursor-pointer" title="Import labels from JSON or CSV">
              <input type="file" accept=".json,.csv" className="hidden" onChange={(e) => handleLabelImport(e.target.files?.[0])} />
              <ExternalLink size={14} />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['rect', 'polygon', 'point'].map(t => (
            <button key={t} className={`theme-button py-1 rounded ${activeTool === t ? 'theme-button-primary' : ''}`}
              onClick={() => { setActiveTool(t); setDrawing(false); setDrawPoints([]); }}>{t}</button>
          ))}
        </div>

        <div className="space-y-2">
          {labels.length === 0 ? (
            <div className="theme-text-muted text-sm text-center py-4">No labels yet. Choose a tool and draw on the image to begin.</div>
          ) : labels.map((l) => (
            <div key={l.id} className="flex items-center justify-between theme-bg-secondary p-2 rounded gap-2">
              {editingLabelId === l.id ? (
                <input 
                  type="text"
                  defaultValue={l.label}
                  className="w-full theme-input text-sm theme-bg-tertiary"
                  autoFocus
                  onBlur={(e) => updateLabelName(l.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') updateLabelName(l.id, e.target.value); if (e.key === 'Escape') setEditingLabelId(null); }}
                />
              ) : (
                <span 
                  className="truncate text-sm flex-1 cursor-pointer" 
                  onDoubleClick={() => setEditingLabelId(l.id)}
                  title="Double-click to edit"
                >
                  {l.label} <span className="opacity-60">({l.type})</span>
                </span>
              )}
              <button className="theme-button px-2 py-1 text-xs flex-shrink-0" onClick={() => removeLabel(l.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className="border-t theme-border pt-3">
          <h5 className="font-semibold mb-2">AI Helpers</h5>
          <button className="theme-button w-full" onClick={async () => {
            if (!selectedImage) return;
            try {
              const fsPath = selectedImage.replace('media://', '');
              const suggestions = await window.api?.suggestLabels?.(fsPath) || [];
              setLabels((ls) => [...ls, ...suggestions]);
            } catch (e) { setError('Auto-labeling failed'); }
          }}><Wand2 size={14} /> Auto-label</button>
        </div>
      </div>
    </div>
  );  

  const renderGenerator = useCallback(() => {
    const getGridCols = (imageCount) => {
        if (imageCount === 0) return 'grid-cols-1';
        if (imageCount === 1) return 'grid-cols-1';
        if (imageCount === 2) return 'grid-cols-2';
        if (imageCount === 3) return 'grid-cols-3';
        if (imageCount === 4) return 'grid-cols-2 lg:grid-cols-4';
        if (imageCount <= 6) return 'grid-cols-2 lg:grid-cols-3';
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    };

    const gridColsClass = getGridCols(generatedImages.length);

    // Filter models based on the currently selected provider
    const filteredAvailableModels = availableModels.filter(
        model => model.provider === selectedProvider
    );

    // Get unique providers
    const uniqueProviders = [...new Set(availableModels.map(model => model.provider))];

    // Quick prompt templates
    const promptTemplates = [
        { label: 'Portrait', prompt: 'A professional portrait photograph of' },
        { label: 'Landscape', prompt: 'A stunning landscape photograph of' },
        { label: 'Abstract', prompt: 'An abstract artistic composition featuring' },
        { label: 'Cinematic', prompt: 'A cinematic film still showing' },
        { label: 'Product', prompt: 'A professional product photograph of' },
        { label: 'Concept Art', prompt: 'Detailed concept art depicting' },
    ];

    // Provider display info - comprehensive list of image gen APIs
    const getProviderInfo = (provider) => {
        const info = {
            'diffusers': { name: 'HF Diffusers', color: 'bg-yellow-600', icon: '🤗', order: 0 },
            'openai': { name: 'OpenAI', color: 'bg-green-600', icon: '🤖', order: 1 },
            'stability': { name: 'Stability AI', color: 'bg-purple-600', icon: '🎨', order: 2 },
            'replicate': { name: 'Replicate', color: 'bg-blue-600', icon: '🔄', order: 3 },
            'fal': { name: 'Fal.ai', color: 'bg-pink-600', icon: '⚡', order: 4 },
            'together': { name: 'Together AI', color: 'bg-indigo-600', icon: '🚀', order: 5 },
            'fireworks': { name: 'Fireworks', color: 'bg-orange-600', icon: '🎆', order: 6 },
            'deepinfra': { name: 'DeepInfra', color: 'bg-cyan-600', icon: '🔥', order: 7 },
            'bfl': { name: 'BFL/Flux', color: 'bg-violet-600', icon: '✨', order: 8 },
            'bagel': { name: 'Bagel', color: 'bg-amber-600', icon: '🥯', order: 9 },
            'leonardo': { name: 'Leonardo', color: 'bg-rose-600', icon: '🎭', order: 10 },
            'ideogram': { name: 'Ideogram', color: 'bg-teal-600', icon: '💡', order: 11 },
            'anthropic': { name: 'Anthropic', color: 'bg-orange-600', icon: '🔮', order: 12 },
        };
        return info[provider] || { name: provider.charAt(0).toUpperCase() + provider.slice(1), color: 'bg-gray-600', icon: '🖼️', order: 99 };
    };

    // Sort providers with diffusers first, then by order
    const sortedProviders = [...uniqueProviders].sort((a, b) => {
        return getProviderInfo(a).order - getProviderInfo(b).order;
    });

    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Left: Controls Panel - now 40% */}
            <div className="w-[420px] border-r theme-border theme-bg-secondary flex flex-col overflow-hidden">
                {/* Prompt Section - Top Priority */}
                <div className="p-4 border-b theme-border">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-white">Prompt</label>
                        {generating && (
                            <span className="flex items-center gap-1.5 text-xs text-purple-400">
                                <Loader size={12} className="animate-spin" />
                                Generating...
                            </span>
                        )}
                    </div>
                    <textarea
                        value={generatePrompt}
                        onChange={e => setGeneratePrompt(e.target.value)}
                        rows={4}
                        className="w-full theme-input text-sm resize-none"
                        placeholder="Describe the image you want to create..."
                    />
                    {/* Quick Templates */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {promptTemplates.map(t => (
                            <button
                                key={t.label}
                                onClick={() => setGeneratePrompt(prev => prev ? `${prev} ${t.prompt}` : t.prompt)}
                                className="px-2 py-0.5 text-[10px] rounded-full bg-purple-600/20 text-purple-300 hover:bg-purple-600/40 transition-colors"
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scrollable Settings */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Provider Selection - Visual Cards */}
                    <div>
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">Provider</label>
                        <div className="grid grid-cols-3 gap-2">
                            {sortedProviders.map(provider => {
                                const info = getProviderInfo(provider);
                                return (
                                    <button
                                        key={provider}
                                        onClick={() => {
                                            setSelectedProvider(provider);
                                            const modelsForProvider = availableModels.filter(m => m.provider === provider);
                                            if (modelsForProvider.length > 0) {
                                                setSelectedModel(modelsForProvider[0].value);
                                            }
                                        }}
                                        className={`p-2 rounded-lg border transition-all text-center ${
                                            selectedProvider === provider
                                                ? 'border-purple-500 bg-purple-500/20'
                                                : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="text-lg mb-0.5">{info.icon}</div>
                                        <div className="text-[10px] font-medium truncate">{info.name}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">Model</label>
                        <select
                            value={selectedModel}
                            onChange={e => setSelectedModel(e.target.value)}
                            className="w-full theme-input text-sm"
                        >
                            {filteredAvailableModels.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.display_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Reference Images */}
                    {(selectedImageGroup.size > 0 || selectedGeneratedImages.size > 0) && (
                        <div>
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                                References ({selectedImageGroup.size + selectedGeneratedImages.size})
                            </label>
                            <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-black/20 border border-white/10">
                                {Array.from(selectedImageGroup).slice(0, 4).map((imgPath, idx) => (
                                    <div key={`gallery-${idx}`} className="relative group">
                                        <img src={imgPath} alt="" className="w-14 h-14 object-cover rounded" />
                                        <button
                                            onClick={() => { const newSelection = new Set(selectedImageGroup); newSelection.delete(imgPath); setSelectedImageGroup(newSelection); }}
                                            className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={10} className="text-white" />
                                        </button>
                                    </div>
                                ))}
                                {Array.from(selectedGeneratedImages).slice(0, 4).map(index => (
                                    <div key={`gen-${index}`} className="relative group">
                                        <img src={generatedImages[index]} className="w-14 h-14 object-cover rounded border-2 border-purple-500" alt="" />
                                        <button onClick={() => handleImageSelect(index, false)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <X size={10} className="text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Output Settings - Collapsed by default */}
                    <details className="group">
                        <summary className="text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer flex items-center gap-2 select-none">
                            <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                            Output Settings
                        </summary>
                        <div className="mt-3 space-y-3 pl-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Save Location</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setActiveSourceId('project-images')}
                                        className={`p-2 text-xs rounded flex items-center justify-center gap-1.5 ${activeSourceId === 'project-images' ? 'bg-green-600/30 text-green-300 border border-green-500' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                                    >
                                        <Folder size={12} /> Project
                                    </button>
                                    <button
                                        onClick={() => setActiveSourceId('global-images')}
                                        className={`p-2 text-xs rounded flex items-center justify-center gap-1.5 ${activeSourceId === 'global-images' ? 'bg-blue-600/30 text-blue-300 border border-blue-500' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                                    >
                                        <ImageIcon size={12} /> Global
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Filename Prefix</label>
                                <input
                                    type="text"
                                    value={generateFilename}
                                    onChange={e => setGenerateFilename(e.target.value)}
                                    placeholder="vixynt_gen"
                                    className="w-full theme-input text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Number of Images</label>
                                <div className="flex items-center gap-2">
                                    {[1, 2, 4].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setNumImagesToGenerate(n)}
                                            className={`flex-1 py-1.5 text-sm rounded ${numImagesToGenerate === n ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                    <input
                                        type="number"
                                        value={numImagesToGenerate}
                                        onChange={e => setNumImagesToGenerate(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                                        min="1"
                                        max="10"
                                        className="w-16 theme-input text-sm text-center"
                                    />
                                </div>
                            </div>
                        </div>
                    </details>
                </div>

                {/* Generate Button - Fixed at bottom */}
                <div className="p-4 border-t theme-border bg-black/20">
                    <button
                        onClick={async () => {
                            if (!generatePrompt || !numImagesToGenerate) return;
                            setGenerating(true);
                            try {
                                const baseFilename = generateFilename || 'vixynt_gen';
                                const attachments = [...Array.from(selectedImageGroup).map(path => ({ path: path.replace('media://', '') }))];
                                const outputPath = activeSource?.path || currentPath;
                                const response = await window.api.generateImages(generatePrompt, numImagesToGenerate, selectedModel, selectedProvider, attachments, baseFilename, outputPath);

                                if (response.error) {
                                    throw new Error(response.error);
                                }

                                if (response.filenames && response.filenames.length > 0) {
                                    const imagePaths = response.filenames.map(p => `media://${p}`);
                                    setGeneratedImages(imagePaths);
                                    setGeneratedFilenames(response.filenames);
                                } else if (response.images && response.images.length > 0) {
                                    setGeneratedImages(response.images);
                                    setGeneratedFilenames([]);
                                } else {
                                    setGeneratedImages([]);
                                    setGeneratedFilenames([]);
                                }
                            } catch (e) {
                                setError('Generation failed: ' + e.message);
                            } finally {
                                setGenerating(false);
                            }
                        }}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        disabled={!generatePrompt || generating}
                    >
                        {generating ? (
                            <>
                                <Loader size={18} className="animate-spin" />
                                Generating {numImagesToGenerate} image{numImagesToGenerate > 1 ? 's' : ''}...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                Generate {numImagesToGenerate} Image{numImagesToGenerate > 1 ? 's' : ''}
                            </>
                        )}
                    </button>
                    {selectedGeneratedImages.size === 1 && (
                        <button
                            onClick={handleUseSelected}
                            className="w-full mt-2 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10 transition-colors"
                        >
                            Edit in DarkRoom
                        </button>
                    )}
                </div>
            </div>

            {/* Right: Results Panel - now 60% */}
            <div className="flex-1 p-4 overflow-y-auto theme-bg-primary">
                {generatedImages.length > 0 && (
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-gray-400">{generatedImages.length} generated image{generatedImages.length > 1 ? 's' : ''}</span>
                        <button
                            onClick={() => setGeneratedImages([])}
                            className="px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors flex items-center gap-1.5"
                        >
                            <Trash2 size={12} /> Clear All
                        </button>
                    </div>
                )}

                <div className={`grid ${gridColsClass} gap-4`}>
                    {generating && generatedImages.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center min-h-[400px] text-center">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
                                <Sparkles size={24} className="absolute inset-0 m-auto text-purple-400" />
                            </div>
                            <p className="mt-4 text-gray-400">Creating your image{numImagesToGenerate > 1 ? 's' : ''}...</p>
                            <p className="text-xs text-gray-600 mt-1">This may take a moment</p>
                        </div>
                    )}
                    {generatedImages.length > 0 ? (
                        generatedImages.map((imgSrc, index) => (
                            <div key={index} className="relative group rounded-xl overflow-hidden bg-black/20 aspect-square">
                                <img
                                    src={imgSrc}
                                    className="w-full h-full object-cover"
                                    alt={`Generated image ${index + 1}`}
                                />
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button
                                        onClick={() => handleImageSelect(index, !selectedGeneratedImages.has(index))}
                                        className={`p-2 rounded-lg ${selectedGeneratedImages.has(index) ? 'bg-purple-500' : 'bg-white/20 hover:bg-white/30'} transition-colors`}
                                        title="Select for reference"
                                    >
                                        <Check size={16} />
                                    </button>
                                    <a
                                        className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                                        href={imgSrc}
                                        download={`${generateFilename}_${index}.png`}
                                        title="Download"
                                    >
                                        <Download size={16} />
                                    </a>
                                    <button
                                        onClick={() => { setSelectedImage(imgSrc); setActiveTab('editor'); }}
                                        className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                                        title="Edit in DarkRoom"
                                    >
                                        <Edit size={16} />
                                    </button>
                                </div>
                                {/* Selection indicator */}
                                {selectedGeneratedImages.has(index) && (
                                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                                        <Check size={14} />
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        !generating && (
                            <div className="col-span-full flex flex-col items-center justify-center min-h-[400px] text-center">
                                <div className="w-24 h-24 rounded-full bg-purple-600/10 flex items-center justify-center mb-4">
                                    <Sparkles size={40} className="text-purple-400/50" />
                                </div>
                                <p className="text-gray-400 text-lg">Your generated images will appear here</p>
                                <p className="text-gray-600 text-sm mt-1">Enter a prompt and click Generate to start</p>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}, [
    generatedImages, selectedGeneratedImages, generatePrompt, selectedImageGroup,
    numImagesToGenerate, selectedModel, selectedProvider, availableModels, generating,
    activeSource, currentPath, handleImageSelect, handleUseSelected,
    setGeneratedImages, setGeneratePrompt, setSelectedImageGroup, setNumImagesToGenerate,
    setSelectedModel, setSelectedProvider, setGenerating, setGeneratedFilenames,
    generateFilename, setGenerateFilename, setError, setSelectedImage, setActiveTab
]);

// Workflow node types configuration
const WORKFLOW_NODE_TYPES = {
    source: { name: 'Load Image', icon: '📂', color: 'bg-blue-600', inputs: [], outputs: ['image'] },
    generate: { name: 'Generate', icon: '✨', color: 'bg-purple-600', inputs: ['ref'], outputs: ['image'] },
    upscale: { name: 'Upscale', icon: '🔍', color: 'bg-green-600', inputs: ['image'], outputs: ['image'] },
    adjust: { name: 'Adjust', icon: '🎨', color: 'bg-yellow-600', inputs: ['image'], outputs: ['image'] },
    filter: { name: 'Filter', icon: '🖼️', color: 'bg-pink-600', inputs: ['image', 'style'], outputs: ['image'] },
    mask: { name: 'Mask', icon: '✂️', color: 'bg-cyan-600', inputs: ['image'], outputs: ['image', 'mask'] },
    fill: { name: 'Gen Fill', icon: '🪄', color: 'bg-indigo-600', inputs: ['image', 'mask'], outputs: ['image'] },
    output: { name: 'Save', icon: '💾', color: 'bg-gray-600', inputs: ['image'], outputs: [] }
};

const addWorkflowNode = useCallback((type, x = 100, y = 100) => {
    const nodeConfig = WORKFLOW_NODE_TYPES[type];
    const newNode = {
        id: `node_${Date.now()}`,
        type,
        x,
        y,
        params: type === 'generate' ? { prompt: '', model: selectedModel } :
                type === 'adjust' ? { brightness: 0, contrast: 0, saturation: 0 } :
                type === 'upscale' ? { scale: 2 } :
                type === 'source' ? { imagePath: '' } :
                type === 'output' ? { filename: 'output.png' } : {}
    };
    setWorkflowNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
}, [selectedModel]);

const deleteWorkflowNode = useCallback((nodeId) => {
    setWorkflowNodes(prev => prev.filter(n => n.id !== nodeId));
    setWorkflowConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
}, [selectedNodeId]);

const updateWorkflowNode = useCallback((nodeId, params) => {
    setWorkflowNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, params: { ...n.params, ...params } } : n
    ));
}, []);

const addWorkflowConnection = useCallback((fromNode, fromPort, toNode, toPort) => {
    const existingConnection = workflowConnections.find(
        c => c.to === toNode && c.toPort === toPort
    );
    if (existingConnection) {
        setWorkflowConnections(prev => prev.filter(c => c !== existingConnection));
    }
    setWorkflowConnections(prev => [...prev, {
        id: `conn_${Date.now()}`,
        from: fromNode,
        fromPort,
        to: toNode,
        toPort
    }]);
}, [workflowConnections]);

const executeWorkflow = useCallback(async () => {
    setWorkflowExecuting(true);
    try {
        // Find source nodes and start execution
        const sourceNodes = workflowNodes.filter(n => n.type === 'source' || n.type === 'generate');
        for (const node of sourceNodes) {
            // Execute node chain - simplified for now
            console.log('Executing workflow starting from:', node.id);
        }
        // TODO: Implement actual workflow execution via backend
    } catch (err) {
        setError('Workflow execution failed: ' + err.message);
    } finally {
        setWorkflowExecuting(false);
    }
}, [workflowNodes]);

const renderWorkflow = useCallback(() => {
    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Left: Node Palette */}
            <div className="w-56 border-r theme-border p-3 flex flex-col gap-3 overflow-y-auto theme-bg-secondary">
                <h3 className="text-sm font-semibold text-white mb-2">Add Nodes</h3>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(WORKFLOW_NODE_TYPES).map(([type, config]) => (
                        <button
                            key={type}
                            onClick={() => addWorkflowNode(type, 200 + Math.random() * 200, 100 + Math.random() * 200)}
                            className={`${config.color} p-2 rounded-lg text-white text-xs flex flex-col items-center gap-1 hover:opacity-90 transition-opacity`}
                        >
                            <span className="text-lg">{config.icon}</span>
                            <span>{config.name}</span>
                        </button>
                    ))}
                </div>

                <div className="border-t theme-border pt-3 mt-2">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Workflow</h4>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={executeWorkflow}
                            disabled={workflowExecuting || workflowNodes.length === 0}
                            className="w-full py-2 px-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white text-sm flex items-center justify-center gap-2"
                        >
                            {workflowExecuting ? (
                                <>
                                    <Loader size={14} className="animate-spin" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <ChevronsRight size={14} />
                                    Execute
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => { setWorkflowNodes([]); setWorkflowConnections([]); setSelectedNodeId(null); }}
                            disabled={workflowNodes.length === 0}
                            className="w-full py-2 px-3 bg-red-600/20 hover:bg-red-600/30 disabled:bg-gray-600/20 disabled:cursor-not-allowed rounded-lg text-red-400 text-sm flex items-center justify-center gap-2"
                        >
                            <Trash2 size={14} />
                            Clear All
                        </button>
                    </div>
                </div>
            </div>

            {/* Center: Canvas */}
            <div
                ref={workflowCanvasRef}
                className="flex-1 relative overflow-auto theme-bg-primary"
                style={{
                    backgroundImage: 'radial-gradient(circle, #374151 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            >
                {/* Connection lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: '2000px', minHeight: '2000px' }}>
                    {workflowConnections.map(conn => {
                        const fromNode = workflowNodes.find(n => n.id === conn.from);
                        const toNode = workflowNodes.find(n => n.id === conn.to);
                        if (!fromNode || !toNode) return null;

                        const fromX = fromNode.x + 180;
                        const fromY = fromNode.y + 30 + conn.fromPort * 20;
                        const toX = toNode.x;
                        const toY = toNode.y + 30 + conn.toPort * 20;

                        const cx1 = fromX + 50;
                        const cx2 = toX - 50;

                        return (
                            <path
                                key={conn.id}
                                d={`M ${fromX} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${toX} ${toY}`}
                                stroke="#60a5fa"
                                strokeWidth="2"
                                fill="none"
                                className="drop-shadow-lg"
                            />
                        );
                    })}
                </svg>

                {/* Nodes */}
                {workflowNodes.map(node => {
                    const config = WORKFLOW_NODE_TYPES[node.type];
                    return (
                        <div
                            key={node.id}
                            className={`absolute rounded-lg shadow-xl border-2 ${selectedNodeId === node.id ? 'border-blue-400' : 'border-gray-600'} cursor-move`}
                            style={{ left: node.x, top: node.y, width: 180 }}
                            onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); }}
                            onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                const startX = e.clientX - node.x;
                                const startY = e.clientY - node.y;

                                const handleMove = (e2) => {
                                    setWorkflowNodes(prev => prev.map(n =>
                                        n.id === node.id ? { ...n, x: e2.clientX - startX, y: e2.clientY - startY } : n
                                    ));
                                };

                                const handleUp = () => {
                                    document.removeEventListener('mousemove', handleMove);
                                    document.removeEventListener('mouseup', handleUp);
                                };

                                document.addEventListener('mousemove', handleMove);
                                document.addEventListener('mouseup', handleUp);
                            }}
                        >
                            {/* Header */}
                            <div className={`${config.color} px-3 py-2 rounded-t-md flex items-center gap-2`}>
                                <span>{config.icon}</span>
                                <span className="text-white text-sm font-medium flex-1">{config.name}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteWorkflowNode(node.id); }}
                                    className="text-white/60 hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="bg-gray-800 p-2 rounded-b-md">
                                {/* Input ports */}
                                {config.inputs.map((input, i) => (
                                    <div key={input} className="flex items-center gap-2 py-1">
                                        <div className="w-3 h-3 rounded-full bg-yellow-500 border-2 border-gray-700 -ml-4" />
                                        <span className="text-xs text-gray-400">{input}</span>
                                    </div>
                                ))}

                                {/* Node-specific params */}
                                {node.type === 'generate' && (
                                    <input
                                        type="text"
                                        placeholder="Prompt..."
                                        value={node.params.prompt || ''}
                                        onChange={(e) => updateWorkflowNode(node.id, { prompt: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full text-xs theme-input mt-1 px-2 py-1"
                                    />
                                )}
                                {node.type === 'source' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedImage) {
                                                updateWorkflowNode(node.id, { imagePath: selectedImage });
                                            }
                                        }}
                                        className="w-full text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded mt-1"
                                    >
                                        {node.params.imagePath ? '✓ Image set' : 'Set from selection'}
                                    </button>
                                )}
                                {node.type === 'upscale' && (
                                    <select
                                        value={node.params.scale || 2}
                                        onChange={(e) => updateWorkflowNode(node.id, { scale: parseInt(e.target.value) })}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full text-xs theme-input mt-1 px-2 py-1"
                                    >
                                        <option value={2}>2x</option>
                                        <option value={4}>4x</option>
                                    </select>
                                )}
                                {node.type === 'output' && (
                                    <input
                                        type="text"
                                        placeholder="filename.png"
                                        value={node.params.filename || ''}
                                        onChange={(e) => updateWorkflowNode(node.id, { filename: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full text-xs theme-input mt-1 px-2 py-1"
                                    />
                                )}

                                {/* Output ports */}
                                {config.outputs.map((output, i) => (
                                    <div key={output} className="flex items-center justify-end gap-2 py-1">
                                        <span className="text-xs text-gray-400">{output}</span>
                                        <div
                                            className="w-3 h-3 rounded-full bg-blue-500 border-2 border-gray-700 -mr-4 cursor-crosshair"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setDraggingConnection({ from: node.id, fromPort: i });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {/* Empty state */}
                {workflowNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <Workflow size={48} className="text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400 text-lg">Build Your Workflow</p>
                            <p className="text-gray-600 text-sm mt-2">Click nodes on the left to add them to the canvas</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Right: Node Inspector */}
            <div className="w-64 border-l theme-border p-3 overflow-y-auto theme-bg-secondary">
                <h3 className="text-sm font-semibold text-white mb-3">Node Properties</h3>
                {selectedNodeId ? (() => {
                    const node = workflowNodes.find(n => n.id === selectedNodeId);
                    if (!node) return <p className="text-gray-500 text-sm">Node not found</p>;
                    const config = WORKFLOW_NODE_TYPES[node.type];

                    return (
                        <div className="space-y-3">
                            <div className={`${config.color} p-2 rounded-lg flex items-center gap-2`}>
                                <span className="text-lg">{config.icon}</span>
                                <span className="text-white font-medium">{config.name}</span>
                            </div>

                            {node.type === 'generate' && (
                                <>
                                    <div>
                                        <label className="text-xs text-gray-400">Prompt</label>
                                        <textarea
                                            value={node.params.prompt || ''}
                                            onChange={(e) => updateWorkflowNode(node.id, { prompt: e.target.value })}
                                            className="w-full theme-input mt-1 text-sm"
                                            rows={3}
                                            placeholder="Describe your image..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400">Model</label>
                                        <select
                                            value={node.params.model || ''}
                                            onChange={(e) => updateWorkflowNode(node.id, { model: e.target.value })}
                                            className="w-full theme-input mt-1 text-sm"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

                            {node.type === 'adjust' && (
                                <>
                                    <div>
                                        <label className="text-xs text-gray-400">Brightness</label>
                                        <input
                                            type="range"
                                            min={-100}
                                            max={100}
                                            value={node.params.brightness || 0}
                                            onChange={(e) => updateWorkflowNode(node.id, { brightness: parseInt(e.target.value) })}
                                            className="w-full mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400">Contrast</label>
                                        <input
                                            type="range"
                                            min={-100}
                                            max={100}
                                            value={node.params.contrast || 0}
                                            onChange={(e) => updateWorkflowNode(node.id, { contrast: parseInt(e.target.value) })}
                                            className="w-full mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400">Saturation</label>
                                        <input
                                            type="range"
                                            min={-100}
                                            max={100}
                                            value={node.params.saturation || 0}
                                            onChange={(e) => updateWorkflowNode(node.id, { saturation: parseInt(e.target.value) })}
                                            className="w-full mt-1"
                                        />
                                    </div>
                                </>
                            )}

                            {node.type === 'upscale' && (
                                <div>
                                    <label className="text-xs text-gray-400">Scale Factor</label>
                                    <select
                                        value={node.params.scale || 2}
                                        onChange={(e) => updateWorkflowNode(node.id, { scale: parseInt(e.target.value) })}
                                        className="w-full theme-input mt-1 text-sm"
                                    >
                                        <option value={2}>2x (Double)</option>
                                        <option value={4}>4x (Quadruple)</option>
                                    </select>
                                </div>
                            )}

                            {node.type === 'source' && (
                                <div>
                                    <label className="text-xs text-gray-400">Source Image</label>
                                    <p className="text-sm text-gray-300 mt-1 truncate">
                                        {node.params.imagePath ? getFileName(node.params.imagePath) : 'Not set'}
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (selectedImage) {
                                                updateWorkflowNode(node.id, { imagePath: selectedImage });
                                            }
                                        }}
                                        className="w-full mt-2 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
                                    >
                                        Use Selected Image
                                    </button>
                                </div>
                            )}

                            {node.type === 'output' && (
                                <div>
                                    <label className="text-xs text-gray-400">Output Filename</label>
                                    <input
                                        type="text"
                                        value={node.params.filename || ''}
                                        onChange={(e) => updateWorkflowNode(node.id, { filename: e.target.value })}
                                        className="w-full theme-input mt-1 text-sm"
                                        placeholder="output.png"
                                    />
                                </div>
                            )}

                            <button
                                onClick={() => deleteWorkflowNode(node.id)}
                                className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 text-sm flex items-center justify-center gap-2 mt-4"
                            >
                                <Trash2 size={14} />
                                Delete Node
                            </button>
                        </div>
                    );
                })() : (
                    <p className="text-gray-500 text-sm">Select a node to edit its properties</p>
                )}
            </div>
        </div>
    );
}, [workflowNodes, workflowConnections, selectedNodeId, workflowExecuting, addWorkflowNode,
    deleteWorkflowNode, updateWorkflowNode, executeWorkflow, selectedImage, availableModels]);

// Dataset/Model Manager
const renderDatasetManager = useCallback(() => {
    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Left: Datasets List */}
            <div className="w-72 border-r theme-border p-4 flex flex-col gap-4 overflow-y-auto theme-bg-secondary">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Database size={16}/> Datasets
                    </h3>
                    <button
                        onClick={() => {
                            const newDataset = {
                                id: `dataset_${Date.now()}`,
                                name: `Dataset ${datasets.length + 1}`,
                                images: [],
                                createdAt: new Date().toISOString()
                            };
                            setDatasets(prev => [...prev, newDataset]);
                            setSelectedDataset(newDataset.id);
                        }}
                        className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white"
                        title="New Dataset"
                    >
                        <PlusCircle size={14}/>
                    </button>
                </div>

                <div className="space-y-2">
                    {datasets.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Database size={32} className="mx-auto mb-2 opacity-50"/>
                            <p className="text-sm">No datasets yet</p>
                            <p className="text-xs mt-1">Create one to start collecting training data</p>
                        </div>
                    ) : datasets.map(ds => (
                        <div
                            key={ds.id}
                            onClick={() => setSelectedDataset(ds.id)}
                            className={`p-3 rounded-lg cursor-pointer ${selectedDataset === ds.id ? 'bg-blue-600/30 border border-blue-500' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{ds.name}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDatasets(prev => prev.filter(d => d.id !== ds.id)); }}
                                    className="p-1 hover:bg-red-500/50 rounded opacity-60 hover:opacity-100"
                                >
                                    <Trash2 size={12}/>
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{ds.images?.length || 0} images</p>
                        </div>
                    ))}
                </div>

                <div className="border-t theme-border pt-4 mt-auto">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                        <Package size={16}/> Trained Models
                    </h4>
                    <div className="space-y-2">
                        {trainedModels.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-4">No trained models yet</p>
                        ) : trainedModels.map(model => (
                            <div key={model.id} className="p-2 bg-gray-700/50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <HardDrive size={14} className="text-green-400"/>
                                    <span className="text-sm">{model.name}</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{model.baseModel}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Center: Dataset Content */}
            <div className="flex-1 p-4 overflow-y-auto theme-bg-primary">
                {selectedDataset ? (() => {
                    const dataset = datasets.find(d => d.id === selectedDataset);
                    if (!dataset) return null;
                    return (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <input
                                    type="text"
                                    value={dataset.name}
                                    onChange={(e) => setDatasets(prev => prev.map(d => d.id === dataset.id ? {...d, name: e.target.value} : d))}
                                    className="text-xl font-bold bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500 outline-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            // Add selected images from gallery
                                            const selectedPaths = Array.from(selectedImageGroup);
                                            if (selectedPaths.length > 0) {
                                                setDatasets(prev => prev.map(d => d.id === dataset.id ? {
                                                    ...d,
                                                    images: [...(d.images || []), ...selectedPaths.map(p => ({ path: p, caption: '' }))]
                                                } : d));
                                            }
                                        }}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-2"
                                    >
                                        <PlusCircle size={14}/> Add Selected ({selectedImageGroup.size})
                                    </button>
                                    <button
                                        onClick={() => setShowFineTuneModal(true)}
                                        disabled={!dataset.images || dataset.images.length < 5}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm flex items-center gap-2"
                                    >
                                        <Sparkles size={14}/> Train Model
                                    </button>
                                </div>
                            </div>

                            {dataset.images && dataset.images.length > 0 ? (
                                <div className="grid grid-cols-3 gap-4">
                                    {dataset.images.map((img, idx) => (
                                        <div key={idx} className="relative group rounded-lg overflow-hidden bg-gray-800">
                                            <img
                                                src={img.path.startsWith('media://') ? img.path : `media://${img.path}`}
                                                className="w-full aspect-square object-cover"
                                                alt={`Dataset image ${idx}`}
                                            />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col">
                                                <button
                                                    onClick={() => setDatasets(prev => prev.map(d => d.id === dataset.id ? {
                                                        ...d,
                                                        images: d.images.filter((_, i) => i !== idx)
                                                    } : d))}
                                                    className="absolute top-2 right-2 p-1 bg-red-500/80 rounded hover:bg-red-500"
                                                >
                                                    <X size={14}/>
                                                </button>
                                                <div className="mt-auto">
                                                    <input
                                                        type="text"
                                                        placeholder="Caption..."
                                                        value={img.caption || ''}
                                                        onChange={(e) => {
                                                            const newImages = [...dataset.images];
                                                            newImages[idx] = {...newImages[idx], caption: e.target.value};
                                                            setDatasets(prev => prev.map(d => d.id === dataset.id ? {...d, images: newImages} : d));
                                                        }}
                                                        className="w-full text-xs bg-black/50 border border-gray-600 rounded px-2 py-1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-16">
                                    <ImageIcon size={48} className="mx-auto text-gray-600 mb-4"/>
                                    <p className="text-gray-400">No images in this dataset</p>
                                    <p className="text-sm text-gray-600 mt-1">Select images in Gallery and click "Add Selected"</p>
                                </div>
                            )}
                        </div>
                    );
                })() : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Database size={48} className="mx-auto text-gray-600 mb-4"/>
                            <p className="text-gray-400">Select or create a dataset</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}, [datasets, selectedDataset, trainedModels, selectedImageGroup]);

// Video Generator
const renderVideoGenerator = useCallback(() => {
    const VIDEO_MODELS = [
        // Google Veo via Gemini API (requires GEMINI_API_KEY)
        { id: 'veo-3.1-generate-preview', name: 'Veo 3.1', provider: 'gemini', maxDuration: 8 },
        { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', provider: 'gemini', maxDuration: 8 },
        { id: 'veo-2.0-generate-001', name: 'Veo 2', provider: 'gemini', maxDuration: 8 },
        // Diffusers - damo-vilab/text-to-video-ms-1.7b (local)
        { id: 'damo-vilab/text-to-video-ms-1.7b', name: 'ModelScope 1.7B (Local)', provider: 'diffusers', maxDuration: 4 },
    ];

    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Left: Controls */}
            <div className="w-96 border-r theme-border p-4 flex flex-col gap-4 overflow-y-auto theme-bg-secondary">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Video size={20}/> Video Generator
                </h3>

                <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase">Prompt</label>
                    <textarea
                        value={videoPrompt}
                        onChange={(e) => setVideoPrompt(e.target.value)}
                        placeholder="Describe the video you want to create..."
                        className="w-full theme-input mt-2 text-sm"
                        rows={4}
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase">Model</label>
                    <select
                        value={videoModel}
                        onChange={(e) => setVideoModel(e.target.value)}
                        className="w-full theme-input mt-2 text-sm"
                    >
                        <option value="">Select a model...</option>
                        {VIDEO_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase">Duration (seconds)</label>
                    <div className="flex items-center gap-3 mt-2">
                        <input
                            type="range"
                            min={2}
                            max={16}
                            value={videoDurationSetting}
                            onChange={(e) => setVideoDurationSetting(parseInt(e.target.value))}
                            className="flex-1"
                        />
                        <span className="text-sm w-8">{videoDurationSetting}s</span>
                    </div>
                </div>

                {selectedImage && (
                    <div className="p-3 bg-blue-600/20 rounded-lg border border-blue-500/50">
                        <p className="text-xs text-blue-400 font-semibold mb-2">Reference Image</p>
                        <img src={selectedImage} className="w-full rounded aspect-video object-cover"/>
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                        >
                            Remove reference
                        </button>
                    </div>
                )}

                <button
                    onClick={async () => {
                        if (!videoPrompt || !videoModel) {
                            setError('Please enter a prompt and select a model');
                            return;
                        }
                        setGeneratingVideo(true);
                        try {
                            const selectedModelData = VIDEO_MODELS.find(m => m.id === videoModel);
                            const result = await window.api.generateVideo(
                                videoPrompt,
                                videoModel,
                                selectedModelData?.provider || 'gemini',
                                videoDurationSetting,
                                currentPath,
                                selectedImage ? selectedImage.base64 : null
                            );
                            if (result.error) {
                                throw new Error(result.error);
                            }
                            setGeneratedVideos(prev => [...prev, {
                                id: `video_${Date.now()}`,
                                prompt: videoPrompt,
                                url: result.video_base64 || '',
                                path: result.video_path || '',
                                createdAt: new Date().toISOString()
                            }]);
                        } catch (err) {
                            setError('Video generation failed: ' + err.message);
                        } finally {
                            setGeneratingVideo(false);
                        }
                    }}
                    disabled={generatingVideo || !videoPrompt}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold flex items-center justify-center gap-2"
                >
                    {generatingVideo ? (
                        <>
                            <Loader size={18} className="animate-spin"/>
                            Generating...
                        </>
                    ) : (
                        <>
                            <Sparkles size={18}/>
                            Generate Video
                        </>
                    )}
                </button>
            </div>

            {/* Right: Results */}
            <div className="flex-1 flex flex-col overflow-hidden theme-bg-primary">
                {/* Results toolbar */}
                {generatedVideos.length > 0 && (
                    <div className="p-3 border-b theme-border flex items-center gap-2">
                        <button
                            onClick={() => {
                                setVideoSelectionMode(!videoSelectionMode);
                                if (videoSelectionMode) setSelectedGeneratedVideos(new Set());
                            }}
                            className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 ${
                                videoSelectionMode ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                        >
                            <Layers size={12} /> {videoSelectionMode ? 'Cancel' : 'Select'}
                        </button>
                        {videoSelectionMode && selectedGeneratedVideos.size > 0 && (
                            <>
                                <span className="text-xs text-gray-400">{selectedGeneratedVideos.size} selected</span>
                                <button
                                    onClick={() => setShowAddToVideoDataset(true)}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add to Dataset
                                </button>
                            </>
                        )}
                        <div className="flex-1"/>
                        <button
                            onClick={() => setShowCreateVideoDataset(true)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs flex items-center gap-1"
                        >
                            <Package size={12} /> Datasets
                        </button>
                    </div>
                )}
                <div className="flex-1 p-4 overflow-y-auto">
                {generatedVideos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                        {generatedVideos.map(video => (
                            <div
                                key={video.id}
                                onClick={() => videoSelectionMode && setSelectedGeneratedVideos(prev => {
                                    const next = new Set(prev);
                                    if (next.has(video.id)) next.delete(video.id);
                                    else next.add(video.id);
                                    return next;
                                })}
                                className={`bg-gray-800 rounded-xl overflow-hidden ${
                                    videoSelectionMode
                                        ? selectedGeneratedVideos.has(video.id)
                                            ? 'ring-2 ring-purple-500 bg-purple-900/20 cursor-pointer'
                                            : 'hover:bg-gray-700/50 cursor-pointer'
                                        : ''
                                }`}
                            >
                                <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                                    {videoSelectionMode && (
                                        <input
                                            type="checkbox"
                                            checked={selectedGeneratedVideos.has(video.id)}
                                            onChange={() => setSelectedGeneratedVideos(prev => {
                                                const next = new Set(prev);
                                                if (next.has(video.id)) next.delete(video.id);
                                                else next.add(video.id);
                                                return next;
                                            })}
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute top-2 left-2 w-4 h-4 z-10"
                                        />
                                    )}
                                    {video.url ? (
                                        <video src={video.url} controls className="w-full h-full"/>
                                    ) : (
                                        <div className="text-center">
                                            <Film size={32} className="mx-auto text-gray-600 mb-2"/>
                                            <p className="text-xs text-gray-500">Processing...</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3">
                                    <p className="text-sm text-gray-300 line-clamp-2">{video.prompt}</p>
                                    <div className="flex gap-2 mt-2">
                                        <button className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 rounded text-blue-400 text-xs flex items-center justify-center gap-1">
                                            <Download size={12}/> Download
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Add to video editor
                                                setVideoClips(prev => [...prev, {
                                                    id: `clip_${Date.now()}`,
                                                    type: 'video',
                                                    src: video.url,
                                                    startTime: 0,
                                                    duration: videoDurationSetting,
                                                    trackId: 'video-1'
                                                }]);
                                                setActiveTab('video-editor');
                                            }}
                                            className="flex-1 py-1.5 bg-green-600/20 hover:bg-green-600/30 rounded text-green-400 text-xs flex items-center justify-center gap-1"
                                        >
                                            <Film size={12}/> Edit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Video size={64} className="mx-auto text-gray-600 mb-4"/>
                            <p className="text-gray-400 text-lg">Generate AI Videos</p>
                            <p className="text-gray-600 text-sm mt-2">Enter a prompt and select a model to get started</p>
                        </div>
                    </div>
                )}
                </div>

                {/* Create Video Dataset Modal */}
                {showCreateVideoDataset && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowCreateVideoDataset(false)}>
                        <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                            <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Package className="text-purple-400" size={18} />
                                Create Video Dataset
                            </h4>
                            <input
                                type="text"
                                value={newVideoDatasetName}
                                onChange={(e) => setNewVideoDatasetName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newVideoDatasetName.trim()) {
                                        const newDataset = {
                                            id: `video_dataset_${Date.now()}`,
                                            name: newVideoDatasetName.trim(),
                                            examples: [],
                                            createdAt: new Date().toISOString(),
                                            updatedAt: new Date().toISOString()
                                        };
                                        setVideoDatasets(prev => [...prev, newDataset]);
                                        setSelectedVideoDatasetId(newDataset.id);
                                        setNewVideoDatasetName('');
                                        setShowCreateVideoDataset(false);
                                    }
                                }}
                                placeholder="Dataset name..."
                                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-purple-500 focus:outline-none mb-4"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowCreateVideoDataset(false)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (!newVideoDatasetName.trim()) return;
                                        const newDataset = {
                                            id: `video_dataset_${Date.now()}`,
                                            name: newVideoDatasetName.trim(),
                                            examples: [],
                                            createdAt: new Date().toISOString(),
                                            updatedAt: new Date().toISOString()
                                        };
                                        setVideoDatasets(prev => [...prev, newDataset]);
                                        setSelectedVideoDatasetId(newDataset.id);
                                        setNewVideoDatasetName('');
                                        setShowCreateVideoDataset(false);
                                    }}
                                    disabled={!newVideoDatasetName.trim()}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add to Video Dataset Modal */}
                {showAddToVideoDataset && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowAddToVideoDataset(false)}>
                        <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
                            <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Plus className="text-purple-400" size={18} />
                                Add to Dataset
                            </h4>
                            {videoDatasets.length === 0 ? (
                                <div className="text-center py-4 text-gray-500">
                                    <p>No datasets yet</p>
                                    <button
                                        onClick={() => { setShowAddToVideoDataset(false); setShowCreateVideoDataset(true); }}
                                        className="mt-2 text-purple-400 hover:text-purple-300"
                                    >
                                        Create a dataset first
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {videoDatasets.map(dataset => (
                                        <button
                                            key={dataset.id}
                                            onClick={() => {
                                                const selected = generatedVideos.filter(v => selectedGeneratedVideos.has(v.id));
                                                const newExamples = selected.map(v => ({
                                                    id: `video_ex_${Date.now()}_${v.id}`,
                                                    prompt: v.prompt,
                                                    videoUrl: v.url,
                                                    model: videoModel,
                                                    duration: videoDurationSetting,
                                                    qualityScore: 4,
                                                    createdAt: new Date().toISOString()
                                                }));
                                                setVideoDatasets(prev => prev.map(d =>
                                                    d.id === dataset.id
                                                        ? { ...d, examples: [...d.examples, ...newExamples], updatedAt: new Date().toISOString() }
                                                        : d
                                                ));
                                                setSelectedGeneratedVideos(new Set());
                                                setVideoSelectionMode(false);
                                                setShowAddToVideoDataset(false);
                                            }}
                                            className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded text-left flex items-center justify-between"
                                        >
                                            <div>
                                                <span className="font-medium">{dataset.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">{dataset.examples.length} videos</span>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500"/>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-end mt-4">
                                <button
                                    onClick={() => setShowAddToVideoDataset(false)}
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
}, [videoPrompt, videoModel, videoDurationSetting, generatingVideo, generatedVideos, selectedImage, videoSelectionMode, selectedGeneratedVideos, showCreateVideoDataset, showAddToVideoDataset, newVideoDatasetName, videoDatasets]);

// Video Editor (Pro-style with trimming, splitting, effects)
const renderVideoEditor = useCallback(() => {
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const formatTimeShort = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const PIXELS_PER_SECOND = 50 * videoZoom;
    const totalTimelineWidth = Math.max(videoDuration, 120) * PIXELS_PER_SECOND + 100;

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-10 border-b theme-border flex items-center px-3 gap-1 bg-gray-800/80">
                <button
                    onClick={async () => {
                        try {
                            const fileData = await (window as any).api.showOpenDialog({
                                properties: ['openFile', 'multiSelections'],
                                filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'mp3', 'wav', 'aac', 'm4a'] }]
                            });
                            if (fileData && fileData.length > 0) {
                                const newClips = fileData.map((file, i) => ({
                                    id: `clip_${Date.now()}_${i}`,
                                    type: file.name.match(/\.(mp3|wav|aac|m4a|ogg|flac)$/i) ? 'audio' : 'video',
                                    src: `file://${file.path}`,
                                    name: file.name,
                                    startTime: 0,
                                    duration: 10,
                                    trackId: null,
                                    x: 0,
                                    trimStart: 0,
                                    trimEnd: 0,
                                    volume: 1,
                                    speed: 1
                                }));
                                setVideoClips(prev => [...prev, ...newClips]);
                            }
                        } catch (err) {
                            setError('Import failed: ' + (err as any).message);
                        }
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs flex items-center gap-1"
                >
                    <Upload size={12}/> Import
                </button>
                <div className="w-px h-5 bg-gray-600 mx-1"/>
                <button onClick={() => {}} className="p-1.5 hover:bg-gray-700 rounded" title="Undo (Cmd+Z)">
                    <Undo size={14}/>
                </button>
                <button onClick={() => {}} className="p-1.5 hover:bg-gray-700 rounded" title="Redo (Cmd+Shift+Z)">
                    <Redo size={14}/>
                </button>
                <div className="w-px h-5 bg-gray-600 mx-1"/>
                <button
                    onClick={splitClipAtPlayhead}
                    className="p-1.5 hover:bg-gray-700 rounded"
                    title="Split at Playhead (Cmd+S)"
                >
                    <Scissors size={14}/>
                </button>
                <button
                    onClick={() => {
                        if (selectedClipId) {
                            setVideoClips(prev => prev.filter(c => c.id !== selectedClipId));
                            setSelectedClipId(null);
                        }
                    }}
                    className="p-1.5 hover:bg-gray-700 rounded text-red-400"
                    title="Delete Selected (Del)"
                >
                    <Trash2 size={14}/>
                </button>
                <div className="w-px h-5 bg-gray-600 mx-1"/>
                <button
                    onClick={() => {
                        const newTextLayer = {
                            id: `text_${Date.now()}`,
                            content: 'New Text',
                            x: 50,
                            y: 50,
                            startTime: videoCurrentTime,
                            duration: 5,
                            fontSize: 48,
                            color: '#FFFFFF',
                            fontFamily: 'Arial',
                            bold: true,
                            italic: false,
                            align: 'center',
                            hasBackground: false,
                            backgroundColor: 'rgba(0,0,0,0.5)'
                        };
                        setVideoTextLayers(prev => [...prev, newTextLayer]);
                        setSelectedVideoTextId(newTextLayer.id);
                        setSelectedClipId(null);
                        setSelectedTransitionId(null);
                    }}
                    className="p-1.5 hover:bg-gray-700 rounded"
                    title="Add Text Overlay"
                >
                    <Type size={14}/>
                </button>
                <button
                    onClick={() => {
                        // Add transition between two consecutive clips
                        const videoTrackClips = videoClips.filter(c => c.trackId?.startsWith('video')).sort((a, b) => a.x - b.x);
                        if (videoTrackClips.length >= 2) {
                            // Find first pair without transition
                            for (let i = 0; i < videoTrackClips.length - 1; i++) {
                                const clip1 = videoTrackClips[i];
                                const clip2 = videoTrackClips[i + 1];
                                const hasTransition = videoTransitions.some(t => t.fromClipId === clip1.id && t.toClipId === clip2.id);
                                if (!hasTransition && Math.abs((clip1.x + clip1.duration) - clip2.x) < 0.5) {
                                    setVideoTransitions(prev => [...prev, {
                                        id: `trans_${Date.now()}`,
                                        fromClipId: clip1.id,
                                        toClipId: clip2.id,
                                        type: 'crossfade',
                                        duration: 0.5
                                    }]);
                                    break;
                                }
                            }
                        }
                    }}
                    className="p-1.5 hover:bg-gray-700 rounded"
                    title="Add Transition"
                >
                    <Blend size={14}/>
                </button>
                <div className="flex-1"/>
                <span className="text-xs text-gray-400 font-mono">{formatTime(videoCurrentTime)}</span>
                <div className="w-px h-5 bg-gray-600 mx-2"/>
                <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs flex items-center gap-1">
                    <Download size={12}/> Export
                </button>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Media Browser */}
                <div className="w-56 border-r theme-border flex flex-col overflow-hidden theme-bg-secondary">
                    <div className="p-2 border-b theme-border">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase">Media</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {videoClips.filter(c => !c.trackId).map(clip => (
                            <div
                                key={clip.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('clipId', clip.id)}
                                onClick={() => setSelectedClipId(clip.id)}
                                className={`p-2 rounded cursor-move flex items-center gap-2 group ${
                                    selectedClipId === clip.id ? 'bg-blue-600/40 ring-1 ring-blue-500' : 'bg-gray-700/30 hover:bg-gray-700/50'
                                }`}
                            >
                                <div className={`w-8 h-8 rounded flex items-center justify-center ${clip.type === 'video' ? 'bg-blue-600/30' : 'bg-green-600/30'}`}>
                                    {clip.type === 'video' ? <Film size={14} className="text-blue-400"/> : <Music size={14} className="text-green-400"/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs truncate">{clip.name}</p>
                                    <p className="text-xs text-gray-500">{formatTimeShort(clip.duration || 0)}</p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const trackId = clip.type === 'video' ? 'video-1' : 'audio-1';
                                        const lastClipOnTrack = videoClips.filter(c => c.trackId === trackId).sort((a, b) => (b.x + b.duration) - (a.x + a.duration))[0];
                                        const insertX = lastClipOnTrack ? lastClipOnTrack.x + lastClipOnTrack.duration : 0;
                                        setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, trackId, x: insertX} : c));
                                    }}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-blue-500/50 rounded transition-opacity"
                                >
                                    <Plus size={12}/>
                                </button>
                            </div>
                        ))}
                        {videoClips.filter(c => !c.trackId).length === 0 && (
                            <div className="text-center py-8 text-gray-600">
                                <Film size={24} className="mx-auto mb-2 opacity-50"/>
                                <p className="text-xs">Drop media here</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Center: Preview */}
                <div className="flex-1 flex flex-col">
                    <div className="flex-1 flex items-center justify-center p-4 bg-gray-900/50">
                        {(() => {
                            const timelineClips = videoClips.filter(c => c.trackId?.startsWith('video'));
                            const currentClip = timelineClips.find(c => c.x <= videoCurrentTime && (c.x + c.duration) > videoCurrentTime);
                            const videoSrc = currentClip?.src || (timelineClips[0]?.src || '');

                            return (
                                <div className="relative w-full max-w-4xl">
                                    <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-2xl relative">
                                        {videoSrc ? (
                                            <video
                                                ref={videoPreviewRef}
                                                src={videoSrc}
                                                className="w-full h-full object-contain"
                                                onTimeUpdate={(e) => setVideoCurrentTime((e.target as HTMLVideoElement).currentTime)}
                                                onLoadedMetadata={(e) => {
                                                    const video = e.target as HTMLVideoElement;
                                                    if (currentClip) {
                                                        setVideoClips(prev => prev.map(c => c.id === currentClip.id ? {...c, duration: video.duration} : c));
                                                    }
                                                    setVideoDuration(Math.max(videoDuration, video.duration));
                                                }}
                                                onEnded={() => setVideoPlaying(false)}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="text-center">
                                                    <Film size={48} className="mx-auto text-gray-700 mb-2"/>
                                                    <p className="text-gray-600 text-sm">Add clips to timeline</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Text Overlays */}
                                        {videoTextLayers.filter(t =>
                                            videoCurrentTime >= t.startTime && videoCurrentTime <= (t.startTime + t.duration)
                                        ).map(text => (
                                            <div
                                                key={text.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedVideoTextId(text.id);
                                                    setSelectedClipId(null);
                                                    setSelectedTransitionId(null);
                                                }}
                                                className={`absolute cursor-move ${selectedVideoTextId === text.id ? 'ring-2 ring-yellow-400' : ''}`}
                                                style={{
                                                    left: `${text.x}%`,
                                                    top: `${text.y}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    fontSize: `${text.fontSize}px`,
                                                    color: text.color,
                                                    fontFamily: text.fontFamily,
                                                    fontWeight: text.bold ? 'bold' : 'normal',
                                                    fontStyle: text.italic ? 'italic' : 'normal',
                                                    textAlign: text.align,
                                                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                                    padding: text.hasBackground ? '8px 16px' : '0',
                                                    background: text.hasBackground ? text.backgroundColor : 'transparent',
                                                    borderRadius: text.hasBackground ? '4px' : '0',
                                                    whiteSpace: 'pre-wrap',
                                                    zIndex: 10
                                                }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    const startX = e.clientX;
                                                    const startY = e.clientY;
                                                    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                                                    if (!rect) return;

                                                    const handleMove = (moveE: MouseEvent) => {
                                                        const deltaX = ((moveE.clientX - startX) / rect.width) * 100;
                                                        const deltaY = ((moveE.clientY - startY) / rect.height) * 100;
                                                        setVideoTextLayers(prev => prev.map(t =>
                                                            t.id === text.id
                                                                ? {...t, x: Math.max(0, Math.min(100, text.x + deltaX)), y: Math.max(0, Math.min(100, text.y + deltaY))}
                                                                : t
                                                        ));
                                                    };

                                                    const handleUp = () => {
                                                        document.removeEventListener('mousemove', handleMove);
                                                        document.removeEventListener('mouseup', handleUp);
                                                    };

                                                    document.addEventListener('mousemove', handleMove);
                                                    document.addEventListener('mouseup', handleUp);
                                                }}
                                            >
                                                {text.content}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Transport Controls */}
                    <div className="h-14 border-t theme-border flex items-center justify-center gap-3 bg-gray-800/50">
                        <button onClick={() => { if (videoPreviewRef.current) videoPreviewRef.current.currentTime = 0; setVideoCurrentTime(0); }} className="p-2 hover:bg-gray-700 rounded">
                            <SkipBack size={18}/>
                        </button>
                        <button onClick={() => { if (videoPreviewRef.current) videoPreviewRef.current.currentTime -= 5; }} className="p-2 hover:bg-gray-700 rounded">
                            <Rewind size={18}/>
                        </button>
                        <button
                            onClick={() => {
                                const video = videoPreviewRef.current;
                                if (video) {
                                    if (videoPlaying) video.pause();
                                    else video.play().catch(() => {});
                                }
                                setVideoPlaying(!videoPlaying);
                            }}
                            className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full"
                        >
                            {videoPlaying ? <Pause size={22}/> : <Play size={22}/>}
                        </button>
                        <button onClick={() => { if (videoPreviewRef.current) videoPreviewRef.current.currentTime += 5; }} className="p-2 hover:bg-gray-700 rounded">
                            <FastForward size={18}/>
                        </button>
                        <button onClick={() => { if (videoPreviewRef.current) videoPreviewRef.current.currentTime = videoDuration; setVideoCurrentTime(videoDuration); }} className="p-2 hover:bg-gray-700 rounded">
                            <SkipForward size={18}/>
                        </button>
                        <div className="w-px h-6 bg-gray-600 mx-2"/>
                        <div className="flex items-center gap-2">
                            <Volume2 size={14} className="text-gray-400"/>
                            <input
                                type="range" min={0} max={1} step={0.05} defaultValue={1}
                                onChange={(e) => { if (videoPreviewRef.current) videoPreviewRef.current.volume = parseFloat(e.target.value); }}
                                className="w-16 h-1"
                            />
                        </div>
                    </div>
                </div>

                {/* Right: Inspector */}
                <div className="w-64 border-l theme-border flex flex-col overflow-hidden theme-bg-secondary">
                    <div className="p-2 border-b theme-border">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase">Inspector</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        {selectedClipId ? (() => {
                            const clip = videoClips.find(c => c.id === selectedClipId);
                            if (!clip) return null;
                            return (
                                <div className="space-y-4">
                                    <div className={`p-3 rounded-lg ${clip.type === 'video' ? 'bg-blue-600/20' : 'bg-green-600/20'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            {clip.type === 'video' ? <Film size={16} className="text-blue-400"/> : <Music size={16} className="text-green-400"/>}
                                            <span className="text-sm font-medium truncate">{clip.name}</span>
                                        </div>
                                        <p className="text-xs text-gray-400">Duration: {formatTimeShort(clip.duration || 0)}</p>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-400 uppercase">Name</label>
                                        <input
                                            type="text"
                                            value={clip.name || ''}
                                            onChange={(e) => setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, name: e.target.value} : c))}
                                            className="w-full theme-input text-sm mt-1"
                                        />
                                    </div>

                                    {clip.trackId && (
                                        <>
                                            <div>
                                                <label className="text-xs text-gray-400 uppercase">Position</label>
                                                <input
                                                    type="number"
                                                    value={(clip.x || 0).toFixed(2)}
                                                    onChange={(e) => setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, x: parseFloat(e.target.value) || 0} : c))}
                                                    className="w-full theme-input text-sm mt-1"
                                                    step={0.1}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs text-gray-400 uppercase">Volume</label>
                                                <input
                                                    type="range" min={0} max={2} step={0.01}
                                                    value={clip.volume || 1}
                                                    onChange={(e) => setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, volume: parseFloat(e.target.value)} : c))}
                                                    className="w-full mt-1"
                                                />
                                                <span className="text-xs text-gray-500">{Math.round((clip.volume || 1) * 100)}%</span>
                                            </div>

                                            <div>
                                                <label className="text-xs text-gray-400 uppercase">Speed</label>
                                                <select
                                                    value={clip.speed || 1}
                                                    onChange={(e) => setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, speed: parseFloat(e.target.value)} : c))}
                                                    className="w-full theme-input text-sm mt-1"
                                                >
                                                    <option value={0.25}>0.25x</option>
                                                    <option value={0.5}>0.5x</option>
                                                    <option value={0.75}>0.75x</option>
                                                    <option value={1}>1x (Normal)</option>
                                                    <option value={1.25}>1.25x</option>
                                                    <option value={1.5}>1.5x</option>
                                                    <option value={2}>2x</option>
                                                </select>
                                            </div>
                                        </>
                                    )}

                                    <div className="pt-2 border-t theme-border space-y-2">
                                        {!clip.trackId && (
                                            <button
                                                onClick={() => {
                                                    const trackId = clip.type === 'video' ? 'video-1' : 'audio-1';
                                                    setVideoClips(prev => prev.map(c => c.id === clip.id ? {...c, trackId, x: 0} : c));
                                                }}
                                                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                                            >
                                                Add to Timeline
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setVideoClips(prev => prev.filter(c => c.id !== clip.id)); setSelectedClipId(null); }}
                                            className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 text-xs"
                                        >
                                            Delete Clip
                                        </button>
                                    </div>
                                </div>
                            );
                        })() : selectedTransitionId ? (() => {
                            const transition = videoTransitions.find(t => t.id === selectedTransitionId);
                            if (!transition) return null;
                            return (
                                <div className="space-y-4">
                                    <div className="p-3 rounded-lg bg-purple-600/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Blend size={16} className="text-purple-400"/>
                                            <span className="text-sm font-medium">Transition</span>
                                        </div>
                                        <p className="text-xs text-gray-400">Duration: {transition.duration}s</p>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-400 uppercase">Type</label>
                                        <select
                                            value={transition.type}
                                            onChange={(e) => setVideoTransitions(prev => prev.map(t =>
                                                t.id === transition.id ? {...t, type: e.target.value} : t
                                            ))}
                                            className="w-full theme-input text-sm mt-1"
                                        >
                                            <option value="crossfade">Cross Fade</option>
                                            <option value="fade-black">Fade to Black</option>
                                            <option value="fade-white">Fade to White</option>
                                            <option value="wipe-left">Wipe Left</option>
                                            <option value="wipe-right">Wipe Right</option>
                                            <option value="wipe-up">Wipe Up</option>
                                            <option value="wipe-down">Wipe Down</option>
                                            <option value="dissolve">Dissolve</option>
                                            <option value="zoom">Zoom</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-400 uppercase">Duration (s)</label>
                                        <input
                                            type="range"
                                            min={0.25}
                                            max={3}
                                            step={0.25}
                                            value={transition.duration}
                                            onChange={(e) => setVideoTransitions(prev => prev.map(t =>
                                                t.id === transition.id ? {...t, duration: parseFloat(e.target.value)} : t
                                            ))}
                                            className="w-full mt-1"
                                        />
                                        <span className="text-xs text-gray-500">{transition.duration}s</span>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setVideoTransitions(prev => prev.filter(t => t.id !== transition.id));
                                            setSelectedTransitionId(null);
                                        }}
                                        className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 text-xs"
                                    >
                                        Delete Transition
                                    </button>
                                </div>
                            );
                        })() : selectedVideoTextId ? (() => {
                            const textLayer = videoTextLayers.find(t => t.id === selectedVideoTextId);
                            if (!textLayer) return null;
                            return (
                                <div className="space-y-4">
                                    <div className="p-3 rounded-lg bg-orange-600/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Type size={16} className="text-orange-400"/>
                                            <span className="text-sm font-medium">Text Overlay</span>
                                        </div>
                                        <p className="text-xs text-gray-400">
                                            {textLayer.startTime.toFixed(1)}s - {(textLayer.startTime + textLayer.duration).toFixed(1)}s
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-400 uppercase">Text Content</label>
                                        <textarea
                                            value={textLayer.content}
                                            onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                t.id === textLayer.id ? {...t, content: e.target.value} : t
                                            ))}
                                            className="w-full theme-input text-sm mt-1"
                                            rows={2}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase">Start Time</label>
                                            <input
                                                type="number"
                                                value={textLayer.startTime}
                                                onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                    t.id === textLayer.id ? {...t, startTime: parseFloat(e.target.value) || 0} : t
                                                ))}
                                                className="w-full theme-input text-sm mt-1"
                                                step={0.5}
                                                min={0}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase">Duration</label>
                                            <input
                                                type="number"
                                                value={textLayer.duration}
                                                onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                    t.id === textLayer.id ? {...t, duration: parseFloat(e.target.value) || 1} : t
                                                ))}
                                                className="w-full theme-input text-sm mt-1"
                                                step={0.5}
                                                min={0.5}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase">Font Size</label>
                                            <input
                                                type="number"
                                                value={textLayer.fontSize}
                                                onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                    t.id === textLayer.id ? {...t, fontSize: parseInt(e.target.value) || 32} : t
                                                ))}
                                                className="w-full theme-input text-sm mt-1"
                                                min={12}
                                                max={200}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase">Color</label>
                                            <input
                                                type="color"
                                                value={textLayer.color}
                                                onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                    t.id === textLayer.id ? {...t, color: e.target.value} : t
                                                ))}
                                                className="w-full h-8 mt-1 rounded cursor-pointer"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-gray-400 uppercase">Font</label>
                                        <select
                                            value={textLayer.fontFamily}
                                            onChange={(e) => setVideoTextLayers(prev => prev.map(t =>
                                                t.id === textLayer.id ? {...t, fontFamily: e.target.value} : t
                                            ))}
                                            className="w-full theme-input text-sm mt-1"
                                        >
                                            <option value="Arial">Arial</option>
                                            <option value="Helvetica">Helvetica</option>
                                            <option value="Times New Roman">Times New Roman</option>
                                            <option value="Georgia">Georgia</option>
                                            <option value="Impact">Impact</option>
                                            <option value="Verdana">Verdana</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setVideoTextLayers(prev => prev.map(t =>
                                                t.id === textLayer.id ? {...t, bold: !t.bold} : t
                                            ))}
                                            className={`p-2 rounded ${textLayer.bold ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >
                                            <Bold size={14}/>
                                        </button>
                                        <button
                                            onClick={() => setVideoTextLayers(prev => prev.map(t =>
                                                t.id === textLayer.id ? {...t, italic: !t.italic} : t
                                            ))}
                                            className={`p-2 rounded ${textLayer.italic ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >
                                            <Italic size={14}/>
                                        </button>
                                        <div className="border-l theme-border h-6 mx-1"/>
                                        <button
                                            onClick={() => setVideoTextLayers(prev => prev.map(t =>
                                                t.id === textLayer.id ? {...t, hasBackground: !t.hasBackground} : t
                                            ))}
                                            className={`px-2 py-1 rounded text-xs ${textLayer.hasBackground ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >
                                            BG
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setVideoTextLayers(prev => prev.filter(t => t.id !== textLayer.id));
                                            setSelectedVideoTextId(null);
                                        }}
                                        className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 text-xs"
                                    >
                                        Delete Text Layer
                                    </button>
                                </div>
                            );
                        })() : (
                            <div className="text-center py-8 text-gray-600">
                                <Sliders size={24} className="mx-auto mb-2 opacity-50"/>
                                <p className="text-xs">Select a clip, transition, or text</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="h-56 border-t theme-border flex flex-col bg-gray-900/80">
                {/* Timeline Toolbar */}
                <div className="h-8 border-b theme-border flex items-center px-2 gap-2 bg-gray-800/50">
                    <button onClick={() => setVideoZoom(Math.max(0.25, videoZoom - 0.25))} className="p-1 hover:bg-gray-700 rounded text-xs">
                        <ZoomOut size={12}/>
                    </button>
                    <span className="text-xs text-gray-400 w-10 text-center">{Math.round(videoZoom * 100)}%</span>
                    <button onClick={() => setVideoZoom(Math.min(4, videoZoom + 0.25))} className="p-1 hover:bg-gray-700 rounded text-xs">
                        <ZoomIn size={12}/>
                    </button>
                    <div className="w-px h-4 bg-gray-600 mx-1"/>
                    <span className="text-xs text-gray-500">Total: {formatTimeShort(videoDuration)}</span>
                    <div className="flex-1"/>
                    <span className="text-xs text-gray-500">Clips: {videoClips.filter(c => c.trackId).length}</span>
                </div>

                {/* Time Ruler */}
                <div className="h-6 border-b theme-border flex" style={{ marginLeft: '80px' }}>
                    <div className="relative" style={{ width: `${totalTimelineWidth - 80}px` }}>
                        {Array.from({ length: Math.ceil(Math.max(videoDuration, 120)) }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 border-l border-gray-700 text-xs text-gray-500"
                                style={{ left: `${i * PIXELS_PER_SECOND}px` }}
                            >
                                <span className="ml-1">{formatTimeShort(i)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tracks */}
                <div className="flex-1 overflow-auto">
                    <div className="relative" style={{ width: `${totalTimelineWidth}px`, minHeight: '100%' }}>
                        {videoTracks.map((track, trackIndex) => (
                            <div
                                key={track.id}
                                className={`h-14 border-b theme-border flex relative ${track.type === 'video' ? 'bg-blue-950/30' : 'bg-green-950/30'}`}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                onDrop={(e) => {
                                    const clipId = e.dataTransfer.getData('clipId');
                                    if (!clipId) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = Math.max(0, (e.clientX - rect.left - 80) / PIXELS_PER_SECOND);
                                    setVideoClips(prev => prev.map(c => c.id === clipId ? {...c, trackId: track.id, x} : c));
                                }}
                            >
                                {/* Track Header */}
                                <div className="w-20 flex-shrink-0 px-2 text-xs border-r theme-border flex flex-col justify-center bg-gray-800/90 z-10">
                                    <div className="flex items-center gap-1">
                                        {track.type === 'video' ? <Film size={12} className="text-blue-400"/> : <Music size={12} className="text-green-400"/>}
                                        <span className="text-gray-300">{track.type === 'video' ? `V${trackIndex + 1}` : `A${trackIndex + 1}`}</span>
                                    </div>
                                </div>

                                {/* Clips */}
                                <div className="flex-1 relative">
                                    {videoClips.filter(c => c.trackId === track.id).map(clip => (
                                        <div
                                            key={clip.id}
                                            draggable
                                            onDragStart={(e) => e.dataTransfer.setData('clipId', clip.id)}
                                            onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                                            className={`absolute top-1 bottom-1 rounded cursor-pointer group ${
                                                selectedClipId === clip.id ? 'ring-2 ring-yellow-400' : ''
                                            } ${track.type === 'video' ? 'bg-gradient-to-b from-blue-500 to-blue-700' : 'bg-gradient-to-b from-green-500 to-green-700'}`}
                                            style={{
                                                left: `${(clip.x || 0) * PIXELS_PER_SECOND}px`,
                                                width: `${Math.max((clip.duration || 1) * PIXELS_PER_SECOND, 20)}px`
                                            }}
                                        >
                                            {/* Trim handles - Left */}
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/0 hover:bg-white/40 rounded-l z-10 flex items-center justify-center"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    const startX = e.clientX;
                                                    const origX = clip.x || 0;
                                                    const origDuration = clip.duration || 1;
                                                    const origTrimStart = clip.trimStart || 0;

                                                    const handleMove = (moveE: MouseEvent) => {
                                                        const deltaX = moveE.clientX - startX;
                                                        const deltaTime = deltaX / PIXELS_PER_SECOND;
                                                        const newX = Math.max(0, origX + deltaTime);
                                                        const newDuration = Math.max(0.5, origDuration - deltaTime);
                                                        const newTrimStart = Math.max(0, origTrimStart + deltaTime);

                                                        setVideoClips(prev => prev.map(c =>
                                                            c.id === clip.id
                                                                ? {...c, x: newX, duration: newDuration, trimStart: newTrimStart}
                                                                : c
                                                        ));
                                                    };

                                                    const handleUp = () => {
                                                        document.removeEventListener('mousemove', handleMove);
                                                        document.removeEventListener('mouseup', handleUp);
                                                    };

                                                    document.addEventListener('mousemove', handleMove);
                                                    document.addEventListener('mouseup', handleUp);
                                                }}
                                            >
                                                <div className="w-0.5 h-6 bg-white/50 rounded-full opacity-0 group-hover:opacity-100"/>
                                            </div>
                                            {/* Trim handles - Right */}
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/0 hover:bg-white/40 rounded-r z-10 flex items-center justify-center"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    const startX = e.clientX;
                                                    const origDuration = clip.duration || 1;

                                                    const handleMove = (moveE: MouseEvent) => {
                                                        const deltaX = moveE.clientX - startX;
                                                        const deltaTime = deltaX / PIXELS_PER_SECOND;
                                                        const newDuration = Math.max(0.5, origDuration + deltaTime);

                                                        setVideoClips(prev => prev.map(c =>
                                                            c.id === clip.id
                                                                ? {...c, duration: newDuration}
                                                                : c
                                                        ));
                                                    };

                                                    const handleUp = () => {
                                                        document.removeEventListener('mousemove', handleMove);
                                                        document.removeEventListener('mouseup', handleUp);
                                                    };

                                                    document.addEventListener('mousemove', handleMove);
                                                    document.addEventListener('mouseup', handleUp);
                                                }}
                                            >
                                                <div className="w-0.5 h-6 bg-white/50 rounded-full opacity-0 group-hover:opacity-100"/>
                                            </div>

                                            {/* Clip content */}
                                            <div className="px-2 py-1 h-full flex flex-col overflow-hidden">
                                                <span className="text-xs font-medium truncate">{clip.name}</span>
                                                {clip.duration > 2 && (
                                                    <span className="text-xs text-white/60">{formatTimeShort(clip.duration)}</span>
                                                )}
                                            </div>

                                            {/* Waveform/Thumbnail placeholder */}
                                            <div className="absolute bottom-0 left-0 right-0 h-3 flex items-end px-1 gap-px opacity-40">
                                                {Array.from({ length: Math.min(30, Math.floor((clip.duration || 1) * 3)) }).map((_, i) => (
                                                    <div key={i} className="flex-1 bg-white" style={{ height: `${20 + Math.random() * 80}%` }}/>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Transition indicators */}
                                    {videoTransitions.filter(t => {
                                        const fromClip = videoClips.find(c => c.id === t.fromClipId);
                                        return fromClip?.trackId === track.id;
                                    }).map(transition => {
                                        const fromClip = videoClips.find(c => c.id === transition.fromClipId);
                                        if (!fromClip) return null;
                                        const transitionX = (fromClip.x + fromClip.duration - transition.duration / 2) * PIXELS_PER_SECOND;
                                        return (
                                            <div
                                                key={transition.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTransitionId(transition.id);
                                                    setSelectedClipId(null);
                                                }}
                                                className={`absolute top-1 bottom-1 flex items-center justify-center cursor-pointer ${
                                                    selectedTransitionId === transition.id ? 'ring-2 ring-yellow-400' : ''
                                                }`}
                                                style={{
                                                    left: `${transitionX}px`,
                                                    width: `${transition.duration * PIXELS_PER_SECOND}px`,
                                                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                                                    zIndex: 20
                                                }}
                                                title={`${transition.type} (${transition.duration}s)`}
                                            >
                                                <Blend size={12} className="text-white/70"/>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* Text Track */}
                        {videoTextLayers.length > 0 && (
                            <div className="h-10 border-b theme-border flex relative bg-orange-950/30">
                                <div className="w-20 flex-shrink-0 px-2 text-xs border-r theme-border flex items-center gap-1 bg-gray-800/90 z-10">
                                    <Type size={12} className="text-orange-400"/>
                                    <span className="text-gray-300">Text</span>
                                </div>
                                <div className="flex-1 relative">
                                    {videoTextLayers.map(text => (
                                        <div
                                            key={text.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedVideoTextId(text.id);
                                                setSelectedClipId(null);
                                                setSelectedTransitionId(null);
                                            }}
                                            className={`absolute top-1 bottom-1 rounded cursor-pointer px-2 flex items-center gap-1 ${
                                                selectedVideoTextId === text.id ? 'ring-2 ring-yellow-400' : ''
                                            } bg-gradient-to-b from-orange-500 to-orange-700`}
                                            style={{
                                                left: `${text.startTime * PIXELS_PER_SECOND}px`,
                                                width: `${Math.max(text.duration * PIXELS_PER_SECOND, 30)}px`
                                            }}
                                        >
                                            <Type size={10}/>
                                            <span className="text-xs truncate">{text.content}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add Track */}
                        <button
                            onClick={() => setVideoTracks(prev => [...prev, {
                                id: `track_${Date.now()}`,
                                type: prev.length % 2 === 0 ? 'video' : 'audio',
                                clips: []
                            }])}
                            className="w-full h-8 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-700/30 border-b theme-border"
                        >
                            <Plus size={12} className="mr-1"/> Add Track
                        </button>

                        {/* Playhead */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                            style={{ left: `${80 + videoCurrentTime * PIXELS_PER_SECOND}px` }}
                        >
                            <div className="absolute -top-1 -left-2 w-4 h-3 bg-red-500" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, [videoClips, videoTracks, videoCurrentTime, videoDuration, videoPlaying, videoZoom, selectedClipId, selectedTransitionId, videoTransitions, videoTextLayers, selectedVideoTextId, activeTab]);

const handleCanvasMouseDown = (e) => {
  if (!canvasContainerRef.current) return;
  const p = getRelativeCoords(e, canvasContainerRef.current);
  if (!p) return;

  const rect = canvasContainerRef.current.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (editorTool === 'text') {
      const newText = {
          id: `text_${Date.now()}`,
          content: 'Edit me',
          x: x,
          y: y,
          fontSize: 32,
          color: '#FFFFFF',
          fontFamily: 'Arial'
      };
      setTextLayers(prev => [...prev, newText]);
      setEditingTextId(newText.id);
      return;
  }
  
  if (editorTool === 'brush' || editorTool === 'eraser') {
      setIsDrawingBrush(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = editorTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor;
      ctx.globalCompositeOperation = editorTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(x, y);
      return;
  }
  
  if (editorTool === 'select' && selection) {
      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;
      
      if (selection.type === 'rect') {
          const inSelection = 
              xPercent >= Math.min(selection.x1, selection.x2) &&
              xPercent <= Math.max(selection.x1, selection.x2) &&
              yPercent >= Math.min(selection.y1, selection.y2) &&
              yPercent <= Math.max(selection.y1, selection.y2);
          
          if (inSelection) {
              setIsDraggingSelection(true);
              setSelectionDragStart({ x: xPercent, y: yPercent });
              return;
          }
      }
  }
  
  setDrawingSelection(true);
  
  if (selectionMode === 'rect') {
      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;
      setSelection({ type: 'rect', x1: xPercent, y1: yPercent, x2: xPercent, y2: yPercent });
  } else if (selectionMode === 'lasso') {
      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;
      setSelectionPoints([{ x: xPercent, y: yPercent }]);
  }
};


  const handleCanvasMouseMove = (e) => {
    if (!canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isDrawingBrush && (editorTool === 'brush' || editorTool === 'eraser')) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
        return;
    }
    
    if (isDraggingSelection && selection && editorTool === 'select') {
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;
        
        const dx = xPercent - selectionDragStart.x;
        const dy = yPercent - selectionDragStart.y;
        
        setSelection(prev => ({
            ...prev,
            x1: prev.x1 + dx,
            x2: prev.x2 + dx,
            y1: prev.y1 + dy,
            y2: prev.y2 + dy
        }));
        
        setSelectionDragStart({ x: xPercent, y: yPercent });
        return;
    }
    
    if (!drawingSelection) return;
    
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;
    
    if (selectionMode === 'rect' && selection) {
        setSelection(prev => ({ ...prev, x2: xPercent, y2: yPercent }));
    } else if (selectionMode === 'lasso') {
        setSelectionPoints(prev => [...prev, { x: xPercent, y: yPercent }]);
    }
};

const handleCanvasMouseUp = () => {
    console.log('Mouse up - selectionMode:', selectionMode);
    console.log('selectionPoints length:', selectionPoints.length);
    console.log('selectionPoints:', selectionPoints);
    
    setDrawingSelection(false);
    setIsDrawingBrush(false);
    setIsDraggingSelection(false);
    
    if (selectionMode === 'lasso' && selectionPoints.length > 2) {
        console.log('Creating lasso selection!');
        setSelection({ type: 'lasso', points: selectionPoints });
    }
};
const executeGenerativeFill = async (layerId, prompt) => {
    console.log('executeGenerativeFill called with prompt:', prompt);
    console.log('selectedImage:', selectedImage);
    console.log('selection:', selection);
    
    if (!selectedImage || !selection) {
        setError('Need image and selection for generative fill');
        return;
    }
    
    try {
        const maskData = await createMaskFromSelection(selection);
        console.log('Mask data created:', maskData ? 'yes' : 'no');
        
        const imagePath = selectedImage.replace('media://', '');
        console.log('Image path:', imagePath);
        
        const model = selectedModel || 'gemini-2.5-flash-image-preview';
        const provider = selectedProvider || 'gemini';
        console.log('Using model:', model, 'provider:', provider);
        
        const response = await window.api.generativeFill({
            imagePath,
            mask: maskData,
            prompt: prompt,
            model: model,
            provider: provider
        });
        
        console.log('Response from generativeFill:', response);
        
        if (response.error) throw new Error(response.error);
        
        if (response.resultPath) {
            setSelectedImage(`media://${response.resultPath}`);
            await loadImagesForAllSources(imageSources);
        }
        
        setSelection(null);
        
    } catch (error) {
        console.error('Fill error:', error);
        setError('Generative fill failed: ' + error.message);
    }
};

const createMaskFromSelection = async (sel) => {
    const canvas = document.createElement('canvas');
    const img = imageRef.current;
    if (!img) return null;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    
    if (sel.type === 'rect') {
        const x = Math.min(sel.x1, sel.x2) / 100 * canvas.width;
        const y = Math.min(sel.y1, sel.y2) / 100 * canvas.height;
        const w = Math.abs(sel.x2 - sel.x1) / 100 * canvas.width;
        const h = Math.abs(sel.y2 - sel.y1) / 100 * canvas.height;
        ctx.fillRect(x, y, w, h);
    } else if (sel.type === 'lasso') {
        ctx.beginPath();
        sel.points.forEach((p, i) => {
            const x = (p.x / 100) * canvas.width;
            const y = (p.y / 100) * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
    }
    
    return canvas.toDataURL('image/png');
};
const renderDarkRoom = () => {
    const handleGenerativeFill = async (sel: any, prompt: string) => {
        if (!prompt) {
            setError('Need a prompt');
            return;
        }
        await executeGenerativeFill(sel, prompt);
    };

    return (
        <ImageEditor
            imageSrc={selectedImage}
            onGenerativeFill={handleGenerativeFill}
            showHeader={true}
            title="DarkRoom"
            className="flex-1"
        />
    );
};

// Keep the legacy renderDarkRoom implementation for reference (can be removed later)
const renderDarkRoomLegacy = () => {
    return (
        <div className="flex-1 flex overflow-hidden">
            <div className="w-16 border-r theme-border flex flex-col items-center p-2 gap-2 theme-bg-primary">
                <h4 className="text-xs font-semibold theme-text-secondary uppercase">Tools</h4>

                <button
                    onClick={() => { setEditorTool('select'); setSelectionMode(null); }}
                    className={`p-2 rounded ${editorTool === 'select' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Select"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
                    </svg>
                </button>

                <button
                    onClick={() => { setEditorTool('rect-select'); setSelectionMode('rect'); }}
                    className={`p-2 rounded ${editorTool === 'rect-select' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Rectangle Select"
                >
                    <RectangleHorizontal size={20}/>
                </button>

                <button
                    onClick={() => { setEditorTool('lasso'); setSelectionMode('lasso'); }}
                    className={`p-2 rounded ${editorTool === 'lasso' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Lasso Select"
                >
                    <Lasso size={20}/>
                </button>

                <button
                    onClick={() => { setEditorTool('text'); setSelectionMode(null); }}
                    className={`p-2 rounded ${editorTool === 'text' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Text Tool"
                >
                    <Type size={20}/>
                </button>

                <button
                    onClick={() => { setEditorTool('brush'); }}
                    className={`p-2 rounded ${editorTool === 'brush' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Brush"
                >
                    <Brush size={20}/>
                </button>

                <button
                    onClick={() => { setEditorTool('eraser'); }}
                    className={`p-2 rounded ${editorTool === 'eraser' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Eraser"
                >
                    <Eraser size={20}/>
                </button>

                <div className="border-t theme-border w-full my-2"/>

                <button
                    onClick={() => { setEditorTool('crop'); setIsCropping(true); }}
                    className={`p-2 rounded ${editorTool === 'crop' ? 'theme-button-primary' : 'theme-hover'}`}
                    title="Crop Tool"
                >
                    <Crop size={20}/>
                </button>
            </div>

            <div 
                ref={canvasContainerRef}
                className="flex-1 flex items-center justify-center p-4 overflow-hidden relative theme-bg-secondary/30 select-none"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCanvasMouseDown(e);
                }}
                onMouseMove={(e) => {
                    e.preventDefault();
                    handleCanvasMouseMove(e);
                }}
                onMouseUp={(e) => {
                    e.preventDefault();
                    handleCanvasMouseUp(e);
                }}
                style={{ cursor: editorTool === 'text' ? 'text' : editorTool === 'lasso' ? 'crosshair' : 'default' }}
            >
                {selectedImage ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                        <img 
                            ref={imageRef} 
                            src={selectedImage} 
                            style={calculateCombinedStyle()} 
                            className="max-w-full max-h-full object-contain"
                            alt="Main preview"
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                        />
<canvas
    ref={canvasRef}
    className="absolute inset-0 pointer-events-none"
    width={canvasContainerRef.current?.offsetWidth || 800}
    height={canvasContainerRef.current?.offsetHeight || 600}
    style={{ 
        pointerEvents: editorTool === 'brush' || editorTool === 'eraser' ? 'auto' : 'none',
        zIndex: editorTool === 'brush' || editorTool === 'eraser' ? 20 : 1
    }}
/>
                        {selection && selection.type === 'rect' && (
                            <div 
                                className="absolute border-2 border-dashed border-blue-400 pointer-events-none"
                                style={{
                                    left: `${Math.min(selection.x1, selection.x2)}%`,
                                    top: `${Math.min(selection.y1, selection.y2)}%`,
                                    width: `${Math.abs(selection.x2 - selection.x1)}%`,
                                    height: `${Math.abs(selection.y2 - selection.y1)}%`
                                }}
                            />
                        )}
{selectionMode === 'lasso' && drawingSelection && selectionPoints.length > 1 && (
    <svg 
        className="absolute inset-0 pointer-events-none" 
        style={{width: '100%', height: '100%', zIndex: 15}}
    >
        <polyline 
            points={selectionPoints.map(p => {
                const rect = canvasContainerRef.current?.getBoundingClientRect();
                if (!rect) return '0,0';
                return `${(p.x / 100) * rect.width},${(p.y / 100) * rect.height}`;
            }).join(' ')}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
            strokeDasharray="5,5"
        />
    </svg>
)}

{selection && selection.type === 'lasso' && (
    <svg 
        className="absolute inset-0 pointer-events-none" 
        style={{width: '100%', height: '100%'}}
    >
        <polygon 
            points={selection.points.map(p => {
                const rect = canvasContainerRef.current?.getBoundingClientRect();
                if (!rect) return '0,0';
                return `${(p.x / 100) * rect.width},${(p.y / 100) * rect.height}`;
            }).join(' ')}
            fill="rgba(59, 130, 246, 0.1)"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
            strokeDasharray="5,5"
        />
    </svg>
)}
                        {textLayers.map(text => (
                            <div
                                key={text.id}
                                className={`absolute ${selectedTextId === text.id ? 'ring-2 ring-blue-400' : ''}`}
                                style={{
                                    left: `${text.x}px`,
                                    top: `${text.y}px`,
                                    fontSize: `${text.fontSize}px`,
                                    color: text.color,
                                    fontFamily: text.fontFamily,
                                    fontWeight: text.bold ? 'bold' : 'normal',
                                    fontStyle: text.italic ? 'italic' : 'normal',
                                    textDecoration: text.underline ? 'underline' : 'none',
                                    textAlign: text.align || 'left',
                                    cursor: editingTextId === text.id ? 'text' : 'move',
                                    userSelect: editingTextId === text.id ? 'text' : 'none',
                                    zIndex: 10,
                                    minWidth: '50px'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTextId(text.id);
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTextId(text.id);
                                    setSelectedTextId(text.id);
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    if (editingTextId === text.id) return;
                                    setSelectedTextId(text.id);

                                    const startX = e.clientX;
                                    const startY = e.clientY;
                                    const origX = text.x;
                                    const origY = text.y;

                                    const handleMove = (moveE) => {
                                        const dx = moveE.clientX - startX;
                                        const dy = moveE.clientY - startY;
                                        setTextLayers(prev => prev.map(t =>
                                            t.id === text.id ? {...t, x: origX + dx, y: origY + dy} : t
                                        ));
                                    };

                                    const handleUp = () => {
                                        document.removeEventListener('mousemove', handleMove);
                                        document.removeEventListener('mouseup', handleUp);
                                    };

                                    document.addEventListener('mousemove', handleMove);
                                    document.addEventListener('mouseup', handleUp);
                                }}
                            >
                                {editingTextId === text.id ? (
                                    <textarea
                                        value={text.content}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            setTextLayers(prev =>
                                                prev.map(t => t.id === text.id ? {...t, content: e.target.value} : t)
                                            );
                                        }}
                                        onBlur={() => setEditingTextId(null)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') setEditingTextId(null);
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                        className="bg-black/70 border-2 border-blue-400 outline-none px-2 py-1 rounded resize"
                                        style={{
                                            fontSize: `${text.fontSize}px`,
                                            color: text.color,
                                            fontFamily: text.fontFamily,
                                            fontWeight: text.bold ? 'bold' : 'normal',
                                            fontStyle: text.italic ? 'italic' : 'normal',
                                            minWidth: '150px',
                                            minHeight: '40px'
                                        }}
                                    />
                                ) : (
                                    <span
                                        className="px-2 py-1 rounded whitespace-pre-wrap"
                                        style={{
                                            background: text.hasBackground ? (text.backgroundColor || 'rgba(0,0,0,0.5)') : 'transparent'
                                        }}
                                    >
                                        {text.content}
                                    </span>
                                )}
                            </div>
                        ))}

                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                             style={{boxShadow: `inset 0 0 ${adjustments.vignette * 2.5}px ${adjustments.vignette * 1.5}px rgba(0,0,0,0.9)`}}
                        />
                    </div>
                ) : (
                    <div className="w-full h-full p-4 overflow-y-auto">
                        <div className="text-center mb-6">
                            <Camera size={32} className="mx-auto mb-2 text-gray-500" />
                            <p className="text-gray-400">Select an image to edit</p>
                        </div>
                        {filteredImages.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3">
                                {filteredImages.slice(0, 20).map((imgPath, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedImage(imgPath.startsWith('media://') ? imgPath : `media://${imgPath}`)}
                                        className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all"
                                    >
                                        <img
                                            src={imgPath.startsWith('media://') ? imgPath : `media://${imgPath}`}
                                            className="w-full h-full object-cover"
                                            alt={`Image ${idx}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-gray-600 text-sm">No images in current source</p>
                        )}
                        {filteredImages.length > 20 && (
                            <p className="text-center text-gray-500 text-xs mt-4">
                                Showing 20 of {filteredImages.length} images. Go to Gallery to see all.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="w-80 border-l theme-border theme-bg-secondary flex flex-col overflow-hidden">
                <div className="p-4 border-b theme-border">
                    <h4 className="text-lg font-semibold flex items-center gap-2"><Camera size={18}/> DarkRoom</h4>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    <div className="p-4 border-b theme-border space-y-3">
                        <h5 className="font-semibold text-base">Base Adjustments</h5>
                        <details open><summary className="font-semibold text-sm cursor-pointer">Light</summary>
                            <div className="pt-2 space-y-2">
                                <SliderControl label="Exposure" value={adjustments.exposure} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('exposure', v)} onCommit={pushHistory}/>
                                <SliderControl label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('contrast', v)} onCommit={pushHistory}/>
                                <SliderControl label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('highlights', v)} onCommit={pushHistory}/>
                                <SliderControl label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('shadows', v)} onCommit={pushHistory}/>
                                <SliderControl label="Whites" value={adjustments.whites} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('whites', v)} onCommit={pushHistory}/>
                                <SliderControl label="Blacks" value={adjustments.blacks} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('blacks', v)} onCommit={pushHistory}/>
                            </div>
                        </details>
                        <details open><summary className="font-semibold text-sm cursor-pointer">Color</summary>
                            <div className="pt-2 space-y-2">
                                <SliderControl label="Saturation" value={adjustments.saturation} min={0} max={200} onChange={(v) => handleBaseAdjustmentChange('saturation', v)} onCommit={pushHistory}/>
                                <SliderControl label="Warmth" value={adjustments.warmth} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('warmth', v)} onCommit={pushHistory}/>
                                <SliderControl label="Tint" value={adjustments.tint} min={-100} max={100} onChange={(v) => handleBaseAdjustmentChange('tint', v)} onCommit={pushHistory}/>
                            </div>
                        </details>
                        <details open><summary className="font-semibold text-sm cursor-pointer">Effects</summary>
                            <div className="pt-2 space-y-2">
                                <SliderControl label="Pop" value={adjustments.pop} min={0} max={100} onChange={(v) => handleBaseAdjustmentChange('pop', v)} onCommit={pushHistory}/>
                                <SliderControl label="Vignette" value={adjustments.vignette} min={0} max={100} onChange={(v) => handleBaseAdjustmentChange('vignette', v)} onCommit={pushHistory}/>
                                <SliderControl label="Blur" value={adjustments.blur} min={0} max={20} onChange={(v) => handleBaseAdjustmentChange('blur', v)} onCommit={pushHistory}/>
                            </div>
                        </details>
                    </div>

{/* Text Layers Panel */}
{(editorTool === 'text' || textLayers.length > 0) && (
    <div className="p-4 border-b theme-border space-y-3">
        <h5 className="font-semibold text-base flex items-center gap-2"><Type size={16}/> Text Layers</h5>

        {textLayers.length === 0 ? (
            <p className="text-xs text-gray-500">Click on the image to add text</p>
        ) : (
            <div className="space-y-2">
                {textLayers.map(text => (
                    <div
                        key={text.id}
                        onClick={() => setSelectedTextId(text.id)}
                        className={`p-2 rounded cursor-pointer flex items-center justify-between ${selectedTextId === text.id ? 'bg-blue-600/30 border border-blue-500' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                    >
                        <span className="text-sm truncate flex-1">{text.content || 'Empty text'}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setTextLayers(prev => prev.filter(t => t.id !== text.id)); }}
                            className="p-1 hover:bg-red-500/50 rounded"
                        >
                            <Trash2 size={12}/>
                        </button>
                    </div>
                ))}
            </div>
        )}

        {selectedTextId && (() => {
            const text = textLayers.find(t => t.id === selectedTextId);
            if (!text) return null;
            return (
                <div className="space-y-3 pt-3 border-t theme-border">
                    <div>
                        <label className="text-xs text-gray-400">Text Content</label>
                        <textarea
                            value={text.content}
                            onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, content: e.target.value} : t))}
                            className="w-full theme-input text-sm mt-1"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-gray-400">Font Size</label>
                            <input
                                type="number"
                                value={text.fontSize}
                                onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, fontSize: parseInt(e.target.value) || 32} : t))}
                                className="w-full theme-input text-sm mt-1"
                                min={8}
                                max={200}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400">Color</label>
                            <input
                                type="color"
                                value={text.color}
                                onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, color: e.target.value} : t))}
                                className="w-full h-8 mt-1 rounded cursor-pointer"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400">Font Family</label>
                        <select
                            value={text.fontFamily}
                            onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, fontFamily: e.target.value} : t))}
                            className="w-full theme-input text-sm mt-1"
                        >
                            <option value="Arial">Arial</option>
                            <option value="Helvetica">Helvetica</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Impact">Impact</option>
                            <option value="Comic Sans MS">Comic Sans MS</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, bold: !t.bold} : t))}
                            className={`p-2 rounded ${text.bold ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            title="Bold"
                        >
                            <Bold size={14}/>
                        </button>
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, italic: !t.italic} : t))}
                            className={`p-2 rounded ${text.italic ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            title="Italic"
                        >
                            <Italic size={14}/>
                        </button>
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, underline: !t.underline} : t))}
                            className={`p-2 rounded ${text.underline ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            title="Underline"
                        >
                            <Underline size={14}/>
                        </button>
                        <div className="border-l theme-border h-6 mx-1"/>
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, align: 'left'} : t))}
                            className={`p-2 rounded ${text.align === 'left' || !text.align ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            <AlignLeft size={14}/>
                        </button>
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, align: 'center'} : t))}
                            className={`p-2 rounded ${text.align === 'center' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            <AlignCenter size={14}/>
                        </button>
                        <button
                            onClick={() => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, align: 'right'} : t))}
                            className={`p-2 rounded ${text.align === 'right' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            <AlignRight size={14}/>
                        </button>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400">Background</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="checkbox"
                                checked={text.hasBackground || false}
                                onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, hasBackground: e.target.checked} : t))}
                                className="rounded"
                            />
                            <span className="text-xs">Show background</span>
                            {text.hasBackground && (
                                <input
                                    type="color"
                                    value={text.backgroundColor || '#000000'}
                                    onChange={(e) => setTextLayers(prev => prev.map(t => t.id === text.id ? {...t, backgroundColor: e.target.value} : t))}
                                    className="w-8 h-6 rounded cursor-pointer ml-auto"
                                />
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => { setTextLayers(prev => prev.filter(t => t.id !== text.id)); setSelectedTextId(null); }}
                        className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 text-sm flex items-center justify-center gap-2"
                    >
                        <Trash2 size={14}/> Delete Text Layer
                    </button>
                </div>
            );
        })()}
    </div>
)}

{selection && (
    <div className="p-4 border-b theme-border space-y-2">
        <h5 className="font-semibold text-base">Selection</h5>
        
        <div>
            <label className="text-xs">Model</label>
            <select 
                value={selectedModel} 
                onChange={e => setSelectedModel(e.target.value)} 
                className="w-full theme-input text-xs mt-1"
            >
                {availableModels.map(model => (
                    <option key={model.value} value={model.value}>
                        {model.display_name}
                    </option>
                ))}
            </select>
        </div>

        <div>
            <label className="text-xs">Provider</label>
            <select
                value={selectedProvider}
                onChange={e => {
                    const newProvider = e.target.value;
                    setSelectedProvider(newProvider);
                    // Update model to first available for this provider
                    const modelsForProvider = availableModels.filter(m => m.provider === newProvider);
                    if (modelsForProvider.length > 0) {
                        setSelectedModel(modelsForProvider[0].value);
                    }
                }}
                className="w-full theme-input text-xs mt-1"
            >
                <option value="openai">OpenAI</option>
                <option value="diffusers">Diffusers (Local)</option>
                <option value="gemini">Gemini</option>
            </select>
        </div>
        
        <div>
            <label className="text-xs">Fill Prompt</label>
            <input 
                type="text" 
                placeholder="a realistic continuation..."
                className="w-full theme-input text-xs mt-1"
                id="fill-prompt-input"
            />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
            <button 
                onClick={async () => {
                    const prompt = document.getElementById('fill-prompt-input').value;
                    if (!prompt) {
                        setError('Need a prompt');
                        return;
                    }
                    await executeGenerativeFill(null, prompt);
                }}
                className="theme-button-primary text-xs py-2"
            >
                <Sparkles size={14} className="inline mr-1"/> Fill
            </button>
            <button 
                onClick={() => setSelection(null)}
                className="theme-button text-xs py-2"
            >
                <X size={14} className="inline mr-1"/> Clear
            </button>
        </div>
    </div>
)}
                </div>
            </div>

        </div>
    );
};


const VIXYNT_MODES = [
    { id: 'gallery', name: 'Gallery', icon: Grid, group: 'browse' },
    { id: 'generator', name: 'Image Generate', icon: Sparkles, group: 'create' },
    { id: 'video-gen', name: 'Video Generate', icon: Video, group: 'create' },
    { id: 'workflow', name: 'Workflow', icon: Workflow, group: 'create' },
    { id: 'editor', name: 'DarkRoom', icon: Sliders, group: 'edit' },
    { id: 'video-editor', name: 'Video Editor', icon: Film, group: 'edit' },
    { id: 'datasets', name: 'Datasets', icon: Database, group: 'manage' },
    { id: 'metadata', name: 'Metadata', icon: Info, group: 'manage' },
    { id: 'labeling', name: 'Labeling', icon: Tag, group: 'manage' }
];

const currentMode = VIXYNT_MODES.find(m => m.id === activeTab) || VIXYNT_MODES[0];
const CurrentIcon = currentMode.icon;

return (
  <div className="flex flex-col h-full overflow-hidden">
    <div className="flex-1 flex overflow-hidden">
      {renderSidebar()}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mode Selector - Floating in upper left */}
        <div className="absolute top-2 left-2 z-30">
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/90 hover:bg-gray-700 rounded-lg border border-gray-600 text-sm backdrop-blur-sm">
              <CurrentIcon size={16} className="text-blue-400"/>
              <span className="font-medium">{currentMode.name}</span>
              <ChevronRight size={14} className="text-gray-500 rotate-90"/>
            </button>
            <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-600 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="py-1">
                <div className="px-3 py-1 text-xs text-gray-500 uppercase">Browse</div>
                {VIXYNT_MODES.filter(m => m.group === 'browse').map(mode => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setActiveTab(mode.id)}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-gray-700 ${activeTab === mode.id ? 'text-blue-400 bg-blue-600/20' : 'text-gray-300'}`}
                    >
                      <ModeIcon size={14}/>{mode.name}
                    </button>
                  );
                })}
                <div className="px-3 py-1 text-xs text-gray-500 uppercase mt-1">Create</div>
                {VIXYNT_MODES.filter(m => m.group === 'create').map(mode => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setActiveTab(mode.id)}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-gray-700 ${activeTab === mode.id ? 'text-blue-400 bg-blue-600/20' : 'text-gray-300'}`}
                    >
                      <ModeIcon size={14}/>{mode.name}
                    </button>
                  );
                })}
                <div className="px-3 py-1 text-xs text-gray-500 uppercase mt-1">Edit</div>
                {VIXYNT_MODES.filter(m => m.group === 'edit').map(mode => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setActiveTab(mode.id)}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-gray-700 ${activeTab === mode.id ? 'text-blue-400 bg-blue-600/20' : 'text-gray-300'}`}
                    >
                      <ModeIcon size={14}/>{mode.name}
                    </button>
                  );
                })}
                <div className="px-3 py-1 text-xs text-gray-500 uppercase mt-1">Manage</div>
                {VIXYNT_MODES.filter(m => m.group === 'manage').map(mode => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setActiveTab(mode.id)}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-gray-700 ${activeTab === mode.id ? 'text-blue-400 bg-blue-600/20' : 'text-gray-300'}`}
                    >
                      <ModeIcon size={14}/>{mode.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'gallery' && renderGallery()}
        {activeTab === 'editor' && renderDarkRoom()}
        {activeTab === 'generator' && renderGenerator()}
        {activeTab === 'video-gen' && renderVideoGenerator()}
        {activeTab === 'workflow' && renderWorkflow()}
        {activeTab === 'video-editor' && renderVideoEditor()}
        {activeTab === 'datasets' && renderDatasetManager()}
        {activeTab === 'metadata' && renderMetadata()}
        {activeTab === 'labeling' && renderLabeling()}
        {renderFineTuneModal()}
      </main>
    </div>
    {renderImageContextMenu()}
    {renderLightbox()}
  </div>
);

};



// --- Small UI Helpers ---
const SettingsSection = ({ title, children }) => (
  <div className="border rounded-lg p-3 theme-border">
    <div className="text-sm font-semibold mb-2">{title}</div>
    {children}
  </div>
);

const Field = ({ label, value, onChange, multiline }) => (
  <div className="mb-2">
    <label className="text-xs uppercase font-semibold theme-text-secondary">{label}</label>
    {multiline ? (
      <textarea className="w-full theme-input mt-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
    ) : (
      <input className="w-full theme-input mt-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    )}
  </div>
);

const LayerItem = ({ layer, isSelected, onSelect }) => (
    <div onClick={onSelect} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isSelected ? 'bg-blue-900/50' : 'hover:theme-bg-tertiary/50'}`}>
        <button className="p-1"><GripVertical size={14} className="theme-text-muted"/></button>
        <button className="p-1">{layer.visible ? <Eye size={14}/> : <EyeOff size={14} className="theme-text-muted"/>}</button>
        <div className="flex items-center gap-2 text-sm flex-1">
            <Layers size={14}/>
            <span>{layer.name}</span>
        </div>
        <button className="p-1"><Trash2 size={14} className="text-red-500/80 hover:text-red-500"/></button>
    </div>
);

const SliderControl = ({ label, value, onChange, onCommit, min = 0, max = 100 }) => (
    <div>
        <label className="text-sm capitalize flex justify-between theme-text-secondary">{label}<span>{value}</span></label>
        <input 
            type="range" 
            min={min} 
            max={max} 
            value={value}
            onChange={e => onChange(parseInt(e.target.value, 10))}
            onMouseUp={onCommit}
            onTouchEnd={onCommit}
            className="w-full mt-1" 
        />
    </div>
);



const LayerInspector = ({ layer, onUpdate, onCommit, onGenerativeFill }) => {
    if (!layer) return <div className="text-center text-sm theme-text-muted p-8">Select a layer to inspect its properties.</div>;
    const { type, params, id, name } = layer;
    const config = DARKROOM_LAYER_TYPES[type];
    if (!config) return null; 
    const LayerIcon = config.icon;

    return (
        <div className="space-y-4">
            <h5 className="font-semibold text-base flex items-center gap-2"><LayerIcon size={16}/> {name}</h5>
            {type === 'ADJUSTMENTS' && (
                <div className="space-y-3">
                    <SliderControl label="Exposure" value={params.exposure} min={-100} max={100} onChange={v => onUpdate(id, { exposure: v })} onCommit={onCommit} />
                    <SliderControl label="Contrast" value={params.contrast} min={-100} max={100} onChange={v => onUpdate(id, { contrast: v })} onCommit={onCommit} />
                    <SliderControl label="Highlights" value={params.highlights} min={-100} max={100} onChange={v => onUpdate(id, { highlights: v })} onCommit={onCommit} />
                    <SliderControl label="Shadows" value={params.shadows} min={-100} max={100} onChange={v => onUpdate(id, { shadows: v })} onCommit={onCommit} />
                    <SliderControl label="Saturation" value={params.saturation} min={-100} max={100} onChange={v => onUpdate(id, { saturation: v })} onCommit={onCommit} />
                    <SliderControl label="Warmth" value={params.warmth} min={-100} max={100} onChange={v => onUpdate(id, { warmth: v })} onCommit={onCommit} />
                    <SliderControl label="Pop" value={params.pop} min={0} max={100} onChange={v => onUpdate(id, { pop: v })} onCommit={onCommit} />
                </div>
            )}
            {type === 'TEXT' && (
                <div className="space-y-3">
                    <Field label="Content" multiline value={params.content} onChange={v => onUpdate(id, { content: v }, true)} />
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Size" value={params.size} onChange={v => onUpdate(id, { size: parseInt(v) || 50 }, true)} />
                        <Field label="Color" value={params.color} onChange={v => onUpdate(id, { color: v }, true)} />
                    </div>
                </div>
            )}
            {type === 'TRANSFORM' && (
                <div className="space-y-3">
                    <SliderControl label="Rotation" value={params.rotation} min={-180} max={180} onChange={v => onUpdate(id, { rotation: v })} onCommit={onCommit} />
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onUpdate(id, { scaleX: params.scaleX * -1 }, true)} className="theme-button text-sm">Flip H</button>
                        <button onClick={() => onUpdate(id, { scaleY: params.scaleY * -1 }, true)} className="theme-button text-sm">Flip V</button>
                    </div>
                </div>
            )}
        </div>
    );
};
const TagsEditor = ({ tags, setTags }) => {
    const [input, setInput] = useState('');
    const add = () => { const t = input.trim(); if (!t || tags.includes(t)) return; setTags([...(tags || []), t]); setInput(''); };
    const remove = (i) => setTags(tags.filter((_, idx) => idx !== i));
    return (
      <div>
        <div className="text-xs uppercase font-semibold theme-text-secondary mb-1">Tags</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {(tags || []).map((t, i) => (
            <span key={`${t}-${i}`} className="px-2 py-0.5 rounded-full text-xs theme-bg-secondary flex items-center gap-1">
              {t}<button onClick={() => remove(i)}><X size={10} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 theme-input text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add tag" />
          <button className="theme-button px-3" onClick={add}><PlusCircle size={14} /></button>
        </div>
      </div>
    );
  };
  
  const OverlayShape = ({ points, type }) => {
    if (type === 'rect' && points.length === 2) {
      const [a, b] = points;
      const style = {
        left: `${Math.min(a.x, b.x) * 100}%`,
        top: `${Math.min(a.y, b.y) * 100}%`,
        width: `${Math.abs(a.x - b.x) * 100}%`,
        height: `${Math.abs(a.y - b.y) * 100}%`,
      };
      return <div className="absolute border-2 border-blue-400/80 bg-blue-400/10 pointer-events-none" style={style} />;
    }
    if (type === 'polygon' && points.length >= 2) {
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="rgba(59,130,246,0.1)"
            stroke="rgba(59,130,246,0.8)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
    return null;
  };
  
  const PlacedShape = ({ shape, onRemove }) => {
    const commonLabel = (x, y) => <div style={{ transform: `translate(${x}px, ${y}px)` }} className="absolute"><div className="absolute -top-6 left-0 text-xs bg-black/70 px-1 rounded text-white whitespace-nowrap">{shape.label}</div><button className="absolute -top-3 -right-3 bg-black/70 rounded-full p-0.5 z-10" onClick={onRemove}><X size={10} className="text-white" /></button></div>;
    
    if (shape.type === 'rect') {
      const [a, b] = shape.coords;
      const style = {
        left: `${Math.min(a.x, b.x) * 100}%`,
        top: `${Math.min(a.y, b.y) * 100}%`,
        width: `${Math.abs(a.x - b.x) * 100}%`,
        height: `${Math.abs(a.y - b.y) * 100}%`,
      };
      return <div className="absolute border-2 border-emerald-400/90 bg-emerald-400/10" style={style}>{commonLabel(0, 0)}</div>;
    }
    if (shape.type === 'point') {
      const style = {
        left: `${shape.coords[0].x * 100}%`,
        top: `${shape.coords[0].y * 100}%`,
      };
      return <div className="absolute" style={style}><div className="w-2 h-2 bg-emerald-400 rounded-full -translate-x-1 -translate-y-1"></div>{commonLabel(0, 0)}</div>;
    }
    if (shape.type === 'polygon') {
      return (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            points={shape.coords.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="rgba(16,185,129,0.15)"
            stroke="rgba(16,185,129,0.9)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'auto' }}
          />
          <foreignObject x={shape.coords[0].x * 100} y={shape.coords[0].y * 100} width="1" height="1" style={{ overflow: 'visible', pointerEvents: 'auto' }}>
            {commonLabel(0, 0)}
          </foreignObject>
        </svg>
      );
    }
    return null;
  };
  

  // StarRating is now imported from npcts

export default PhotoViewer;
