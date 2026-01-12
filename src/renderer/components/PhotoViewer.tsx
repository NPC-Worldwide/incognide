import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Loader, Image as ImageIcon, Folder,
    Camera, Wand2, Sliders, Grid, Upload, Trash2, Edit,
    MessageSquare, Check, List, LayoutGrid, Save, Undo,
    Redo, Search, Sparkles, Info, Tag, Crop, RotateCw, Type, ChevronLeft, ChevronRight,
    Download, PlusCircle, Copy, ExternalLink, ChevronsRight, GitBranch,
    Layers, Eye, EyeOff, GripVertical, FileJson, FolderOpen,
    Lasso, Star,
    RectangleHorizontal, Brush, Eraser,
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
                name: filePath.split('/').pop(),
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
    
   
   const [selectionMode, setSelectionMode] = useState(null);
const [selection, setSelection] = useState(null);
const [drawingSelection, setDrawingSelection] = useState(false);
const [selectionPoints, setSelectionPoints] = useState([]);
const [textLayers, setTextLayers] = useState([]);
const [editingTextId, setEditingTextId] = useState(null);

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
const [fineTuneStatus, setFineTuneStatus] = useState(null);
const pollFineTuneStatus = async (jobId) => {
    const interval = setInterval(async () => {
        const status = await window.api?.getFineTuneStatus?.(jobId);
        if (status?.complete) {
            clearInterval(interval);
            setFineTuneStatus(`Complete! Model saved to ${status.outputPath}`);
            setIsFineTuning(false);
            await loadImagesForAllSources(imageSources);
        } else if (status?.error) {
            clearInterval(interval);
            setFineTuneStatus(null);
            setIsFineTuning(false);
            setError('Training failed: ' + status.error);
        } else if (status?.step) {
            setFineTuneStatus(`Epoch ${status.step}/${status.total}`);
        }
    }, 5000);
};

const handleStartFineTune = async () => {
    if (selectedImageGroup.size === 0) {
        setError('Select images first');
        return;
    }
    
    setIsFineTuning(true);
    setFineTuneStatus('Preparing training...');
    
    const imagePaths = Array.from(selectedImageGroup).map(
        p => p.replace('media://', '')
    );
    
    let captions = [];
    if (captionMode === 'manual') {
        captions = imagePaths.map(p => manualCaptions[p] || '');
    } else if (captionMode === 'filename') {
        captions = imagePaths.map(p => {
            const name = p.split('/').pop().replace(/\.[^/.]+$/, '');
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
        setFineTuneStatus('Training started...');
        pollFineTuneStatus(response.jobId);
    }
};

const renderFineTuneModal = () => {
    if (!showFineTuneModal) return null;
    
    const selectedImages = Array.from(selectedImageGroup);
    
    return (
        <div className="fixed inset-0 bg-black/70 z-[90] flex items-center 
            justify-center p-8">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl 
                space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                        Fine-tune Diffusion Model
                    </h3>
                    <button onClick={() => setShowFineTuneModal(false)}>
                        <X size={20} />
                    </button>
                </div>
                
                <div className="text-sm text-gray-400">
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
                                const name = path.split('/').pop();
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
                    <div className="bg-blue-900/30 p-3 rounded text-sm 
                        flex items-center gap-2">
                        <Loader size={14} className="animate-spin" />
                        {fineTuneStatus}
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
  const filename = `${selectedImage?.split('/').pop() || 'labels'}.labels.json`;
  downloadFile(JSON.stringify(payload, null, 2), filename, 'application/json');
};

const exportLabelsAsCSV = () => {
  if (labels.length === 0) return;

  const headers = ['image_filename', 'id', 'label', 'type', 'coords_json'];
  const rows = labels.map(l => {
      const filename = selectedImage?.split('/').pop() || 'unknown_image';
      const coords_json = JSON.stringify(l.coords);
      const safeLabel = `"${l.label.replace(/"/g, '""')}"`;
      const safeCoords = `"${coords_json.replace(/"/g, '""')}"`;
      return [filename, l.id, safeLabel, l.type, safeCoords].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const filename = `${selectedImage?.split('/').pop() || 'labels'}.labels.csv`;
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
    setRenamingImage({ path: selectedImage, newName: selectedImage.split('/').pop() }); 
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
    downloadJSON(payload, `${selectedImage?.split('/').pop() || 'labels'}.labels.json`);
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
    <div className="w-64 border-r theme-border flex flex-col flex-shrink-0 theme-sidebar">

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
    </div>
  );

  
useEffect(() => {
    const savedView = localStorage.getItem('vixynt_viewMode');
    if (savedView) setViewMode(savedView);
}, []);

useEffect(() => {
    localStorage.setItem('vixynt_viewMode', viewMode);
}, [viewMode]);


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
        const nameA = a.split('/').pop().toLowerCase();
        const nameB = b.split('/').pop().toLowerCase();
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
        setLightboxIndex(index);
        const newSelection = new Set([imgPath]);
        setSelectedImageGroup(newSelection);
        setSelectedImage(imgPath);
        setLastClickedIndex(index);
    }
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
            theme-border bg-gray-800/40">
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
                        return (
                            <div className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group
                                ${isSelected ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-blue-500' : ''}`}>
                                <img src={img} alt="" className="w-full h-full object-cover bg-gray-800" draggable={false} />
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
                    const filename = img.split('/').pop();
                    const ext = filename.split('.').pop().toUpperCase();
                    const meta = imageMetaCache[img] || {};
                    
                    return (
                        <div
                            key={img}
                            onClick={(e) => handleImageClick(e, img, index)}
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
                className="fixed inset-0 z-[75]"
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
     
      setGeneratePrompt(prev => `${prev} ${prev ? '\n\n' : ''}Using reference image: ${contextMenu.imagePath.split('/').pop()}`);
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
      <div className="flex-1 flex items-center justify-center bg-gray-900 relative p-4">{selectedImage ? <img src={selectedImage} alt="Metadata" className="max-w-full max-h-full object-contain rounded shadow" /> : <p className="theme-text-muted">Select an image to view metadata</p>}</div>
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
      <div className="flex items-center gap-2 text-sm text-gray-400 p-2 flex-grow min-w-0" onClick={() => setIsEditingPath(true)}>
          <FolderOpen size={16} className="flex-shrink-0 text-gray-500" />
          {isEditingPath ? (
              <input type="text" value={projectPath} onChange={e => setProjectPath(e.target.value)}
                     className="theme-input bg-transparent text-gray-300 w-full" autoFocus onBlur={() => setIsEditingPath(false)} />
          ) : (
              <div className="flex items-center gap-1 truncate">
                  {displayPath.split('/').map((part, i) => (
                      <React.Fragment key={i}>
                          {i > 0 && <span className="text-gray-600">/</span>}
                          <button className="px-1 rounded hover:bg-gray-700">{part || '/'}</button>
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
        className="flex-1 relative bg-gray-900 flex items-center justify-center select-none"
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
                <div className="absolute right-0 top-full mt-1 w-32 bg-gray-800 border theme-border rounded shadow-lg hidden group-hover:block z-10">
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
            <div key={l.id} className="flex items-center justify-between bg-gray-800 p-2 rounded gap-2">
              {editingLabelId === l.id ? (
                <input 
                  type="text"
                  defaultValue={l.label}
                  className="w-full theme-input text-sm bg-gray-700"
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
        if (imageCount <= 9) return 'grid-cols-3 lg:grid-cols-3';
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
    };

    const gridColsClass = getGridCols(generatedImages.length);

    // Filter models based on the currently selected provider
    const filteredAvailableModels = availableModels.filter(
        model => model.provider === selectedProvider
    );

    return (
        <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto relative">
                {generatedImages.length > 0 && (
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => setGeneratedImages([])}
                            className="theme-button px-3 py-1 text-sm rounded flex items-center gap-2"
                        >
                            <Trash2 size={14} /> Clear Generated Images
                        </button>
                    </div>
                )}
                <div className={`grid ${gridColsClass} gap-4 relative`}>
                    {generating && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                            <Loader className="animate-spin text-white" />
                        </div>
                    )}
                    {generatedImages.length > 0 ? (
                        generatedImages.map((imgSrc, index) => (
                            <div key={index} className="relative">
                                <img src={imgSrc} className="w-full h-full object-cover rounded-lg shadow-md aspect-square" alt={`Generated image ${index + 1}`} />
                                <div className="absolute top-2 left-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedGeneratedImages.has(index)}
                                        onChange={(e) => handleImageSelect(index, e.target.checked)}
                                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                    />
                                </div>
                                <div className="absolute bottom-2 right-2 flex gap-2">
                                    <a className="theme-button px-2 py-1 text-xs rounded" href={imgSrc} download={`${generateFilename}_${index}.png`}>
                                        <Download size={12} />
                                    </a>
                                </div>
                            </div>
                        ))
                    ) : (
                        !generating && (
                            <div className="col-span-full text-center flex items-center justify-center theme-text-muted min-h-[300px]">
                                Generated images will appear here.
                            </div>
                        )
                    )}
                </div>
            </div>
            <div className="w-96 border-l theme-border theme-bg-secondary p-4 space-y-4 flex flex-col">
                <h4 className="text-lg font-semibold">Image Generation</h4>
                <div className="flex-1 space-y-4">
                    <div>
                        <label className="text-sm font-medium">Prompt</label>
                        <textarea
                            value={generatePrompt}
                            onChange={e => setGeneratePrompt(e.target.value)}
                            rows={6}
                            className="w-full theme-input mt-1 text-sm"
                            placeholder="A photorealistic image of..."
                        />
                    </div>
                    <div className="border theme-border rounded-lg p-3 space-y-3">
                        <h5 className="text-sm font-medium">Output Settings</h5>
                        <div>
                            <label className="text-sm font-medium">Save Location</label>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setActiveSourceId('project-images')}
                                    className={`p-2 text-xs rounded border flex items-center justify-center gap-2 ${activeSourceId === 'project-images' ? 'theme-button-primary' : 'theme-button'}`}
                                >
                                    <Folder size={12} /> Project
                                </button>
                                <button
                                    onClick={() => setActiveSourceId('global-images')}
                                    className={`p-2 text-xs rounded border flex items-center justify-center gap-2 ${activeSourceId === 'global-images' ? 'theme-button-primary' : 'theme-button'}`}
                                >
                                    <ImageIcon size={12} /> Global
                                </button>
                            </div>
                            <div className="mt-2 p-2 bg-gray-800/30 rounded text-xs text-gray-400 font-mono truncate">
                                {activeSource?.path || currentPath}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Filename Prefix</label>
                            <input
                                type="text"
                                value={generateFilename}
                                onChange={e => setGenerateFilename(e.target.value)}
                                placeholder="vixynt_gen"
                                className="w-full theme-input mt-1 text-sm"
                            />
                            <div className="text-xs text-gray-500 mt-1">
                                e.g., {generateFilename || 'vixynt_gen'}_...png
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Number of Images</label>
                            <input
                                type="number"
                                value={numImagesToGenerate}
                                onChange={e => setNumImagesToGenerate(Math.max(1, parseInt(e.target.value, 10)))}
                                min="1"
                                max="10"
                                className="w-full theme-input mt-1 text-sm"
                            />
                        </div>
                    </div>
                    {selectedGeneratedImages.size > 0 && (
                        <div>
                            <label className="text-sm font-medium">Selected for Reference ({selectedGeneratedImages.size})</label>
                            <div className="mt-1 flex flex-wrap gap-2">
                                {Array.from(selectedGeneratedImages).map(index => (
                                    <div key={index} className="relative">
                                        <img src={generatedImages[index]} className="w-12 h-12 object-cover rounded border" alt="" />
                                        <button onClick={() => handleImageSelect(index, false)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5">
                                            <X size={10} className="text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium">Reference Images</label>
                        <div className="mt-1 p-2 border theme-border rounded-md bg-gray-800/30 min-h-[60px]">
                            {selectedImageGroup.size > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(selectedImageGroup).slice(0, 3).map((imgPath, idx) => (
                                        <div key={idx} className="relative">
                                            <img src={imgPath} alt="" className="w-12 h-12 object-cover rounded border" />
                                            <button onClick={() => { const newSelection = new Set(selectedImageGroup); newSelection.delete(imgPath); setSelectedImageGroup(newSelection); }} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5">
                                                <X size={10} className="text-white" />
                                            </button>
                                        </div>
                                    ))}
                                    {selectedImageGroup.size > 3 && (<div className="w-12 h-12 bg-gray-700 rounded border flex items-center justify-center text-xs">+{selectedImageGroup.size - 3}</div>)}
                                </div>
                            ) : (<div className="text-xs text-gray-500 italic">Select images from gallery to use as references</div>)}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Model</label>
                        <select 
                            value={selectedModel} 
                            onChange={e => setSelectedModel(e.target.value)} 
                            className="mt-1 w-full theme-input"
                        >
                            {/* <--- CRITICAL FIX: Filter models here based on selectedProvider */}
                            {filteredAvailableModels.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Provider</label>
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
                            className="mt-1 w-full theme-input"
                        >
                            {/* <--- CRITICAL FIX: Dynamically list unique providers */}
                            {[...new Set(availableModels.map(model => model.provider))].map(provider => (
                                <option key={provider} value={provider}>
                                    {provider === 'diffusers' ? 'HF Diffusers' : provider.charAt(0).toUpperCase() + provider.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
                          className="w-full theme-button-primary py-3 text-base rounded flex items-center justify-center gap-2 disabled:opacity-50"
                          disabled={!generatePrompt}
                        >
                            <Sparkles size={16} /> Generate
                        </button>
                        {selectedGeneratedImages.size === 1 && (
                            <button onClick={handleUseSelected} className="theme-button py-3 text-base rounded">
                                Edit in Darkroom
                            </button>
                        )}
                    </div>
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
    generateFilename, setGenerateFilename, setError
]);

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
            <div className="w-16 border-r theme-border flex flex-col items-center p-2 gap-2 bg-gray-900">
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
                className="flex-1 flex items-center justify-center p-4 overflow-hidden relative bg-gray-800/30 select-none"
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
                                className="absolute"
                                style={{
                                    left: `${text.x}px`,
                                    top: `${text.y}px`,
                                    fontSize: `${text.fontSize}px`,
                                    color: text.color,
                                    fontFamily: text.fontFamily,
                                    cursor: editingTextId === text.id ? 'text' : 'move',
                                    userSelect: editingTextId === text.id ? 'text' : 'none',
                                    zIndex: 10
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTextId(text.id);
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    if (editingTextId === text.id) return;
                                    
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
                                    <input
                                        type="text"
                                        value={text.content}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            setTextLayers(prev => 
                                                prev.map(t => t.id === text.id ? {...t, content: e.target.value} : t)
                                            );
                                        }}
                                        onBlur={() => setEditingTextId(null)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') setEditingTextId(null);
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                        className="bg-black/50 border border-blue-400 outline-none px-2"
                                        style={{
                                            fontSize: `${text.fontSize}px`,
                                            color: text.color,
                                            fontFamily: text.fontFamily,
                                            minWidth: '100px'
                                        }}
                                    />
                                ) : (
                                    <span className="px-2 py-1 bg-black/30 rounded">{text.content}</span>
                                )}
                            </div>
                        ))}

                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                             style={{boxShadow: `inset 0 0 ${adjustments.vignette * 2.5}px ${adjustments.vignette * 1.5}px rgba(0,0,0,0.9)`}}
                        />
                    </div>
                ) : (
                    <div className="text-center theme-text-muted">
                        <Camera size={48} className="mx-auto mb-4" />
                        <p>Select an image to open</p>
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


return (
  <div className="flex flex-col h-full overflow-hidden">
    {renderHeader()}
    <div className="flex-1 flex overflow-hidden">
      {renderSidebar()}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tab navigation */}
        <div className="border-b theme-border flex flex-shrink-0">
          {[
              { id: 'gallery', name: 'Gallery', icon: Grid },
              { id: 'generator', name: 'Generate', icon: Sparkles },
              { id: 'editor', name: 'DarkRoom', icon: Sliders },
              { id: 'metadata', name: 'Metadata', icon: Info },
              { id: 'labeling', name: 'Labeling', icon: Tag }
          ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 py-2 flex items-center gap-2 text-xs border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent theme-text-muted theme-hover'}`}>
                  <tab.icon size={14} />{tab.name}
              </button>
          ))}
        </div>

        {activeTab === 'gallery' && renderGallery()}
        {activeTab === 'editor' && renderDarkRoom()}
        {activeTab === 'generator' && renderGenerator()}
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
    <div onClick={onSelect} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'}`}>
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
            <span key={`${t}-${i}`} className="px-2 py-0.5 rounded-full text-xs bg-gray-800 flex items-center gap-1">
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
