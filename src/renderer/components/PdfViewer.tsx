import { getFileName } from './utils';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import {
    Highlighter, MessageSquare, Trash2,
    Eye, EyeOff, Edit2, Save, X, PanelRightClose, PanelRightOpen,
    Clipboard, FileText, BookOpen,
    Pen, Eraser, Download, Printer, PenTool, Type, Undo2, Trash
} from 'lucide-react';
import PdfDrawingCanvas from './PdfDrawingCanvas';
import SignatureModal from './SignatureModal';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';
import './PdfViewer.css';

const HIGHLIGHT_COLORS = {
    yellow: { bg: 'rgba(255, 255, 0, 0.3)', border: 'rgba(255, 200, 0, 0.6)' },
    green: { bg: 'rgba(0, 255, 0, 0.2)', border: 'rgba(0, 200, 0, 0.5)' },
    blue: { bg: 'rgba(0, 150, 255, 0.2)', border: 'rgba(0, 100, 255, 0.5)' },
    pink: { bg: 'rgba(255, 100, 150, 0.3)', border: 'rgba(255, 50, 100, 0.5)' },
    purple: { bg: 'rgba(180, 100, 255, 0.3)', border: 'rgba(150, 50, 255, 0.5)' },
};

// Global cache for PDF buffers - keyed by filePath, max 10 entries
const PDF_CACHE_MAX = 10;
const pdfBufferCache = new Map<string, ArrayBuffer>();
const cachePdfBuffer = (key: string, buffer: ArrayBuffer) => {
    if (pdfBufferCache.size >= PDF_CACHE_MAX) {
        const oldest = pdfBufferCache.keys().next().value;
        if (oldest) pdfBufferCache.delete(oldest);
    }
    pdfBufferCache.set(key, buffer);
};

interface Highlight {
    id: number;
    position: { rects: Array<{ left: number; top: number; width: number; height: number; pageIndex?: number }> };
    content: { text: string; annotation: string };
    color?: string;
    highlighted_text?: string;
}

interface PdfDrawing {
    id: number;
    file_path: string;
    page_index: number;
    drawing_type: string;
    svg_path: string;
    stroke_color: string;
    stroke_width: number;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
}

// Exported utility function for loading PDF highlights for a specific pane
export const loadPdfHighlightsForActivePane = async (
    activeContentPaneId: string | null,
    contentDataRef: React.MutableRefObject<any>,
    setPdfHighlights: (highlights: any[]) => void
) => {
    if (activeContentPaneId) {
        const currentPaneData = contentDataRef.current[activeContentPaneId];
        if (currentPaneData && currentPaneData.contentType === 'pdf') {
            const response = await (window as any).api.getHighlightsForFile(currentPaneData.contentId);
            if (response.highlights) {
                const transformedHighlights = response.highlights.map((h: any) => {
                    const positionObject = typeof h.position === 'string'
                        ? JSON.parse(h.position)
                        : h.position;
                    return {
                        id: h.id,
                        position: positionObject,
                        content: {
                            text: h.highlighted_text,
                            annotation: h.annotation || ''
                        },
                        color: h.color || 'yellow'
                    };
                });
                setPdfHighlights(transformedHighlights);
            } else {
                setPdfHighlights([]);
            }
        } else {
            setPdfHighlights([]);
        }
    } else {
        setPdfHighlights([]);
    }
};

const PdfContextMenu = ({
    pdfContextMenuPos,
    setPdfContextMenuPos,
    handleCopyPdfText,
    handleHighlightPdfSelection,
    handleApplyPromptToPdfText,
    selectedPdfText,
    selectedColor,
    setSelectedColor,
    onAddComment
}) => {
    // All hooks MUST be called before any conditional return
    const copyText = useCallback(() => {
        handleCopyPdfText(selectedPdfText?.text);
        setPdfContextMenuPos(null);
    }, [handleCopyPdfText, selectedPdfText, setPdfContextMenuPos]);

    const highlightText = useCallback((color: string) => {
        handleHighlightPdfSelection(selectedPdfText?.text, selectedPdfText?.position, color);
        setPdfContextMenuPos(null);
    }, [handleHighlightPdfSelection, selectedPdfText, setPdfContextMenuPos]);

    const summarizeText = useCallback(() => {
        handleApplyPromptToPdfText('summarize', selectedPdfText?.text);
        setPdfContextMenuPos(null);
    }, [handleApplyPromptToPdfText, selectedPdfText, setPdfContextMenuPos]);

    const explainText = useCallback(() => {
        handleApplyPromptToPdfText('explain', selectedPdfText?.text);
        setPdfContextMenuPos(null);
    }, [handleApplyPromptToPdfText, selectedPdfText, setPdfContextMenuPos]);

    if (!pdfContextMenuPos) return null;

    // Clamp to viewport bounds
    const menuWidth = 180;
    const menuHeight = 220;
    const clampedX = Math.min(pdfContextMenuPos.x, window.innerWidth - menuWidth);
    const clampedY = Math.min(pdfContextMenuPos.y, window.innerHeight - menuHeight);

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setPdfContextMenuPos(null)} onMouseDown={(e) => e.preventDefault()} />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm min-w-[160px]"
                style={{ top: Math.max(0, clampedY), left: Math.max(0, clampedX) }}
                onMouseDown={(e) => e.preventDefault()}
            >
                {selectedPdfText?.text ? (
                    <>
                        <button onClick={copyText} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <Clipboard size={12} /> Copy
                        </button>
                        <div className="border-t theme-border my-1" />
                        <div className="px-4 py-1.5">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
                                <Highlighter size={12} /> Highlight
                            </div>
                            <div className="flex gap-1.5">
                                {Object.entries(HIGHLIGHT_COLORS).map(([color, { bg }]) => (
                                    <button
                                        key={color}
                                        onClick={() => highlightText(color)}
                                        className="w-5 h-5 rounded border border-gray-600 hover:border-white hover:scale-110 transition-all"
                                        style={{ backgroundColor: bg }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (onAddComment) onAddComment(selectedPdfText?.text, selectedPdfText?.position, selectedColor);
                                setPdfContextMenuPos(null);
                            }}
                            className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs"
                        >
                            <MessageSquare size={12} /> Add Comment
                        </button>
                        <div className="border-t theme-border my-1" />
                        <button onClick={summarizeText} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <FileText size={12} /> Summarize
                        </button>
                        <button onClick={explainText} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <BookOpen size={12} /> Explain
                        </button>
                    </>
                ) : (
                    <div className="px-4 py-1.5 text-xs text-gray-500">Select text for options</div>
                )}
            </div>
        </>
    );
};

// Annotations Panel Component
const AnnotationsPanel = ({
    highlights,
    drawings,
    showHighlights,
    setShowHighlights,
    onDeleteHighlight,
    onUpdateHighlight,
    onSelectHighlight,
    onDeleteDrawing,
    onUndoLastDrawing,
    onClearPageDrawings,
    selectedHighlightId
}: {
    highlights: Highlight[];
    drawings: PdfDrawing[];
    showHighlights: boolean;
    setShowHighlights: (show: boolean) => void;
    onDeleteHighlight: (id: number) => void;
    onUpdateHighlight: (id: number, annotation: string, color?: string) => void;
    onSelectHighlight: (highlight: Highlight | null) => void;
    onDeleteDrawing: (id: number) => void;
    onUndoLastDrawing: () => void;
    onClearPageDrawings: (pageIndex: number) => void;
    selectedHighlightId: number | null;
}) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [editColor, setEditColor] = useState('yellow');
    const [tab, setTab] = useState<'highlights' | 'drawings'>('highlights');

    const startEdit = (highlight: Highlight) => {
        setEditingId(highlight.id);
        setEditText(highlight.content?.annotation || '');
        setEditColor(highlight.color || 'yellow');
    };

    const saveEdit = async () => {
        if (editingId !== null) {
            await onUpdateHighlight(editingId, editText, editColor);
            setEditingId(null);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditText('');
    };

    const getDrawingLabel = (d: PdfDrawing) => {
        if (d.drawing_type === 'typed_signature') {
            const parts = d.svg_path.split(':');
            return `Signature: "${parts.slice(2).join(':')}"`;
        }
        if (d.drawing_type === 'signature') return 'Drawn Signature';
        if (d.drawing_type === 'text') return `Text: "${d.svg_path.replace('TEXT_ANNOTATION:', '')}"`;
        return 'Freehand Drawing';
    };

    const drawingPages = [...new Set(drawings.map(d => d.page_index))].sort((a, b) => a - b);

    return (
        <div className="w-72 border-l theme-border flex flex-col theme-bg-secondary h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b theme-border">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Highlighter size={16} className="text-yellow-400" />
                    Annotations
                </h3>
                <button
                    onClick={() => setShowHighlights(!showHighlights)}
                    className={`p-1.5 rounded ${showHighlights ? 'theme-hover' : 'bg-red-500/20 text-red-400'}`}
                    title={showHighlights ? 'Hide highlights' : 'Show highlights'}
                >
                    {showHighlights ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b theme-border">
                <button
                    onClick={() => setTab('highlights')}
                    className={`flex-1 text-xs py-2 ${tab === 'highlights' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
                >
                    Highlights ({highlights.length})
                </button>
                <button
                    onClick={() => setTab('drawings')}
                    className={`flex-1 text-xs py-2 ${tab === 'drawings' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
                >
                    Drawings ({drawings.length})
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {tab === 'highlights' ? (
                    <>
                        {highlights.length === 0 ? (
                            <div className="text-center text-gray-500 py-8 text-sm">
                                <Highlighter size={32} className="mx-auto mb-2 opacity-30" />
                                <p>No highlights yet</p>
                                <p className="text-xs mt-1">Select text and right-click to highlight</p>
                            </div>
                        ) : (
                            highlights.map((highlight) => {
                                const colorStyle = HIGHLIGHT_COLORS[highlight.color || 'yellow'] || HIGHLIGHT_COLORS.yellow;
                                const isEditing = editingId === highlight.id;
                                const isSelected = selectedHighlightId === highlight.id;

                                return (
                                    <div
                                        key={highlight.id}
                                        onClick={() => !isEditing && onSelectHighlight(highlight)}
                                        className={`p-2 rounded cursor-pointer transition-colors ${
                                            isSelected ? 'ring-2 ring-blue-500' : ''
                                        }`}
                                        style={{ backgroundColor: colorStyle.bg, borderLeft: `3px solid ${colorStyle.border}` }}
                                    >
                                        <p className="text-xs line-clamp-3 mb-2">
                                            "{highlight.content?.text || highlight.highlighted_text || ''}"
                                        </p>

                                        {isEditing ? (
                                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                                <textarea
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    placeholder="Add a note..."
                                                    className="w-full p-2 text-xs rounded bg-gray-800 border theme-border resize-none"
                                                    rows={3}
                                                    autoFocus
                                                />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500">Color:</span>
                                                    {Object.entries(HIGHLIGHT_COLORS).map(([color, { bg }]) => (
                                                        <button
                                                            key={color}
                                                            onClick={() => setEditColor(color)}
                                                            className={`w-5 h-5 rounded ${editColor === color ? 'ring-2 ring-white' : ''}`}
                                                            style={{ backgroundColor: bg }}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={saveEdit}
                                                        className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs flex items-center justify-center gap-1"
                                                    >
                                                        <Save size={12} /> Save
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {highlight.content?.annotation && (
                                                    <div className="flex items-start gap-1 mb-2 p-1.5 bg-black/20 rounded">
                                                        <MessageSquare size={12} className="flex-shrink-0 mt-0.5 text-gray-400" />
                                                        <p className="text-xs text-gray-300">{highlight.content.annotation}</p>
                                                    </div>
                                                )}
                                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => startEdit(highlight)}
                                                        className="p-1 hover:bg-black/20 rounded text-gray-400 hover:text-white"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => onDeleteHighlight(highlight.id)}
                                                        className="p-1 hover:bg-black/20 rounded text-gray-400 hover:text-red-400"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </>
                ) : (
                    <>
                        {drawings.length === 0 ? (
                            <div className="text-center text-gray-500 py-8 text-sm">
                                <Pen size={32} className="mx-auto mb-2 opacity-30" />
                                <p>No drawings yet</p>
                                <p className="text-xs mt-1">Use the pen tool to draw on pages</p>
                            </div>
                        ) : (
                            <>
                                {/* Undo last */}
                                <div className="flex gap-1 mb-2">
                                    <button
                                        onClick={onUndoLastDrawing}
                                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                                    >
                                        <Undo2 size={12} /> Undo Last
                                    </button>
                                </div>

                                {drawingPages.map((pageIdx) => {
                                    const pageDrawings = drawings.filter(d => d.page_index === pageIdx);
                                    return (
                                        <div key={pageIdx}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-gray-500 font-medium uppercase">Page {pageIdx + 1}</span>
                                                <button
                                                    onClick={() => onClearPageDrawings(pageIdx)}
                                                    className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-0.5"
                                                    title="Clear all drawings on this page"
                                                >
                                                    <Trash size={10} /> Clear
                                                </button>
                                            </div>
                                            {pageDrawings.map((d) => (
                                                <div
                                                    key={d.id}
                                                    className="flex items-center justify-between p-2 rounded bg-gray-800/50 border-l-2 mb-1"
                                                    style={{ borderColor: d.stroke_color }}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs truncate">{getDrawingLabel(d)}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => onDeleteDrawing(d.id)}
                                                        className="p-1 hover:bg-black/20 rounded text-gray-400 hover:text-red-400 flex-shrink-0"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// Manager that finds page layers and mounts PdfDrawingCanvas on each
const DrawingCanvasManager = ({
    wrapperRef,
    drawingMode,
    drawingTool,
    strokeColor,
    strokeWidth,
    onPathComplete,
    onErase,
    pdfData,
}: {
    wrapperRef: React.RefObject<HTMLElement>;
    drawingMode: boolean;
    drawingTool: 'pen' | 'eraser' | null;
    strokeColor: string;
    strokeWidth: number;
    onPathComplete: (pageIndex: number, svgPath: string) => void;
    onErase: (pageIndex: number, x: number, y: number) => void;
    pdfData: any;
}) => {
    const [pageElements, setPageElements] = useState<{ el: HTMLElement; idx: number }[]>([]);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !pdfData) { setPageElements([]); return; }

        const findPages = () => {
            const layers = wrapper.querySelectorAll('.rpv-core__page-layer');
            const pages: { el: HTMLElement; idx: number }[] = [];
            layers.forEach((layer: HTMLElement, i: number) => {
                let idx = i;
                const testId = layer.getAttribute('data-testid') || '';
                const m = testId.match(/page-layer-(\d+)/);
                if (m) idx = parseInt(m[1], 10);
                pages.push({ el: layer, idx });
            });
            setPageElements(pages);
        };

        // Find pages initially and watch for new ones
        const timer = setTimeout(findPages, 500);
        const observer = new MutationObserver(() => {
            setTimeout(findPages, 200);
        });
        observer.observe(wrapper, { childList: true, subtree: true });

        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [wrapperRef, pdfData]);

    return (
        <>
            {pageElements.map(({ el, idx }) => (
                <PdfDrawingCanvas
                    key={`draw-${idx}`}
                    pageElement={el}
                    pageIndex={idx}
                    isActive={drawingMode}
                    tool={drawingTool}
                    strokeColor={strokeColor}
                    strokeWidth={strokeWidth}
                    onPathComplete={onPathComplete}
                    onErase={onErase}
                />
            ))}
        </>
    );
};

const PdfViewer = ({
    nodeId,
    contentDataRef,
    currentPath,
    activeContentPaneId,
    handleCopyPdfText,
    handleHighlightPdfSelection,
    handleApplyPromptToPdfText,
    pdfHighlights,
    setPdfHighlights,
    pdfHighlightsTrigger
}) => {
    const [pdfData, setPdfData] = useState(null);
    const [error, setError] = useState(null);
    const viewerWrapperRef = useRef(null);

    const [localContextMenuPos, setLocalContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [localHighlights, setLocalHighlights] = useState<any[]>([]);
    const [selectedPdfText, setSelectedPdfText] = useState(null);
    const [showHighlights, setShowHighlights] = useState(true);
    const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false);
    const [selectedHighlightId, setSelectedHighlightId] = useState<number | null>(null);
    const [selectedColor, setSelectedColor] = useState('yellow');
    const [currentScale, setCurrentScale] = useState(1);
    const [inlineComment, setInlineComment] = useState<{ highlightId: number; x: number; y: number } | null>(null);
    const [inlineCommentText, setInlineCommentText] = useState('');

    // Drawing / Signature state
    const [drawingMode, setDrawingMode] = useState(false);
    const [drawingTool, setDrawingTool] = useState<'pen' | 'eraser' | null>(null);
    const [drawingColor, setDrawingColor] = useState('#000000');
    const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(2.5);
    const [drawings, setDrawings] = useState<PdfDrawing[]>([]);
    const [signatureModalOpen, setSignatureModalOpen] = useState(false);
    const [signaturePlacementMode, setSignaturePlacementMode] = useState(false);
    const [currentSignature, setCurrentSignature] = useState<{ svgPath: string; type: 'drawn' | 'typed' } | null>(null);
    const [textPlacementMode, setTextPlacementMode] = useState(false);
    const [textInput, setTextInput] = useState<{ pageIndex: number; x: number; y: number; text: string } | null>(null);

    const workerUrl = window.location.protocol === 'file:'
        ? `${window.location.href.substring(0, window.location.href.lastIndexOf('/'))}/pdf.worker.min.js`
        : `${window.location.origin}/pdf.worker.min.js`;

    // Plugin factories are custom hooks internally - must be called unconditionally every render
    const zoomPluginInstance = zoomPlugin();

    // Inject global style for --scale-factor to prevent pdfjs warnings
    useEffect(() => {
        const styleId = 'pdf-scale-factor-style';
        let style = document.getElementById(styleId) as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }
        const scale = currentScale || 1;
        style.textContent = `
            :root, html, body,
            .pdf-viewer-container,
            .pdf-viewer-container *,
            .rpv-core__viewer,
            .rpv-core__inner-pages,
            .rpv-core__inner-page,
            .rpv-core__page-layer,
            .rpv-core__text-layer {
                --scale-factor: ${scale} !important;
            }
            .rpv-core__text-layer,
            .rpv-core__text-layer span {
                color: transparent !important;
                -webkit-text-fill-color: transparent !important;
                fill: transparent !important;
            }
        `;
        return () => {
            // Don't remove - other PDF viewers may need it
        };
    }, [currentScale]);

    // Set scale factor on document load
    const handleDocumentLoad = useCallback((e: any) => {
        // Set initial scale factor on wrapper
        const wrapper = viewerWrapperRef.current;
        if (wrapper) {
            wrapper.style.setProperty('--scale-factor', String(currentScale || 1));

            // Also set on all existing text layers
            const textLayers = wrapper.querySelectorAll('.rpv-core__text-layer');
            textLayers.forEach((el: HTMLElement) => {
                el.style.setProperty('--scale-factor', String(currentScale || 1));
            });
        }
    }, [currentScale]);

    const defaultLayoutPluginInstance = defaultLayoutPlugin();

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const lastFilePathRef = useRef<string | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    // Synchronously check cache when filePath changes to avoid loading flash on tab switch
    if (filePath && filePath !== lastFilePathRef.current) {
        const cachedBuffer = pdfBufferCache.get(filePath);
        if (cachedBuffer && !pdfData) {
            // Revoke old blob URL if exists
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            // Create blob URL synchronously for cached content
            const newBlobUrl = URL.createObjectURL(new Blob([cachedBuffer], { type: 'application/pdf' }));
            blobUrlRef.current = newBlobUrl;
            setPdfData(newBlobUrl);
            setError(null);
        } else if (!cachedBuffer && pdfData) {
            // Reset for uncached files
            setPdfData(null);
        }
        lastFilePathRef.current = filePath;
    }

    // Listen for refresh events for this specific PDF
    useEffect(() => {
        const handleRefresh = (e: CustomEvent) => {
            if (e.detail?.pdfPath === filePath) {
                setRefreshTrigger((prev) => prev + 1);
            }
        };
        window.addEventListener('pdf-refresh', handleRefresh as EventListener);
        return () => window.removeEventListener('pdf-refresh', handleRefresh as EventListener);
    }, [filePath]);

    const loadHighlights = useCallback(async () => {
        if (nodeId) {
            const currentPaneData = contentDataRef.current[nodeId];
            if (currentPaneData && currentPaneData.contentType === 'pdf') {
                const response = await (window as any).api.getHighlightsForFile(currentPaneData.contentId);
                if (response.highlights) {
                    const transformedHighlights = response.highlights.map((h) => {
                        const positionObject = typeof h.position === 'string'
                            ? JSON.parse(h.position)
                            : h.position;
                        return {
                            id: h.id,
                            position: positionObject,
                            content: {
                                text: h.highlighted_text,
                                annotation: h.annotation || ''
                            },
                            color: h.color || 'yellow'
                        };
                    });
                    setLocalHighlights(transformedHighlights);
                    setPdfHighlights(transformedHighlights);
                } else {
                    setLocalHighlights([]);
                    setPdfHighlights([]);
                }
            } else {
                setLocalHighlights([]);
                setPdfHighlights([]);
            }
        } else {
            setLocalHighlights([]);
            setPdfHighlights([]);
        }
    }, [nodeId, contentDataRef, setPdfHighlights]);

    const handleDeleteHighlight = useCallback(async (id: number) => {
        try {
            await (window as any).api.deletePdfHighlight(id);
            loadHighlights();
        } catch (err) {
            console.error('Failed to delete highlight:', err);
        }
    }, [loadHighlights]);

    const handleUpdateHighlight = useCallback(async (id: number, annotation: string, color?: string) => {
        try {
            await (window as any).api.updatePdfHighlight({ id, annotation, color });
            loadHighlights();
        } catch (err) {
            console.error('Failed to update highlight:', err);
        }
    }, [loadHighlights]);

    const handleSelectHighlight = useCallback((highlight: Highlight | null) => {
        setSelectedHighlightId(highlight?.id || null);
    }, []);

    // --- Drawing functions ---
    const loadDrawings = useCallback(async () => {
        if (!filePath) { setDrawings([]); return; }
        try {
            const res = await (window as any).api.getDrawingsForFile(filePath);
            setDrawings(res.drawings || []);
        } catch (err) {
            console.error('[PdfViewer] Failed to load drawings:', err);
            setDrawings([]);
        }
    }, [filePath]);

    const handlePathComplete = useCallback(async (pageIndex: number, svgPath: string) => {
        if (!filePath) return;
        await (window as any).api.addPdfDrawing({
            filePath,
            pageIndex,
            drawingType: 'freehand',
            svgPath,
            strokeColor: drawingColor,
            strokeWidth: drawingStrokeWidth,
            positionX: 0,
            positionY: 0,
            width: 100,
            height: 100,
        });
        loadDrawings();
    }, [filePath, drawingColor, drawingStrokeWidth, loadDrawings]);

    const handleEraseAt = useCallback(async (pageIndex: number, x: number, y: number) => {
        // Find and delete the drawing closest to (x, y) on this page
        const pageDrawings = drawings.filter(d => d.page_index === pageIndex);
        if (pageDrawings.length === 0) return;
        // Simple hit-test: check if (x,y) is near any point on a path
        let closestId: number | null = null;
        let closestDist = Infinity;
        for (const d of pageDrawings) {
            const pathParts = d.svg_path.match(/[\d.]+/g);
            if (!pathParts) continue;
            for (let i = 0; i < pathParts.length - 1; i += 2) {
                const px = parseFloat(pathParts[i]);
                const py = parseFloat(pathParts[i + 1]);
                const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestId = d.id;
                }
            }
        }
        if (closestId !== null && closestDist < 5) {
            await (window as any).api.deleteDrawing(closestId);
            loadDrawings();
        }
    }, [drawings, loadDrawings]);

    const handleSignatureSave = useCallback((svgPath: string, type: 'drawn' | 'typed') => {
        setCurrentSignature({ svgPath, type });
        setSignatureModalOpen(false);
        setSignaturePlacementMode(true);
        setDrawingMode(true);
    }, []);

    const handleSignaturePlacement = useCallback(async (pageIndex: number, x: number, y: number) => {
        if (!currentSignature || !filePath) return;
        await (window as any).api.addPdfDrawing({
            filePath,
            pageIndex,
            drawingType: currentSignature.type === 'typed' ? 'typed_signature' : 'signature',
            svgPath: currentSignature.svgPath,
            strokeColor: drawingColor,
            strokeWidth: 2,
            positionX: x,
            positionY: y,
            width: 30,
            height: 12,
        });
        setSignaturePlacementMode(false);
        setCurrentSignature(null);
        setDrawingMode(false);
        setDrawingTool(null);
        loadDrawings();
    }, [currentSignature, filePath, drawingColor, loadDrawings]);

    const handleDeleteDrawing = useCallback(async (id: number) => {
        await (window as any).api.deleteDrawing(id);
        loadDrawings();
    }, [loadDrawings]);

    const handleUndoLastDrawing = useCallback(async () => {
        if (drawings.length === 0) return;
        const last = drawings[drawings.length - 1];
        await (window as any).api.deleteDrawing(last.id);
        loadDrawings();
    }, [drawings, loadDrawings]);

    const handleClearPageDrawings = useCallback(async (pageIndex: number) => {
        if (!filePath) return;
        await (window as any).api.clearDrawingsForPage(filePath, pageIndex);
        loadDrawings();
    }, [filePath, loadDrawings]);

    const toggleDrawingMode = useCallback(() => {
        if (drawingMode) {
            setDrawingMode(false);
            setDrawingTool(null);
            setSignaturePlacementMode(false);
            setCurrentSignature(null);
            setTextPlacementMode(false);
        } else {
            setDrawingMode(true);
            setDrawingTool('pen');
        }
    }, [drawingMode]);

    const handleSaveTextAnnotation = useCallback(async () => {
        if (!textInput || !textInput.text.trim() || !filePath) return;
        await (window as any).api.addPdfDrawing({
            filePath,
            pageIndex: textInput.pageIndex,
            drawingType: 'text',
            svgPath: `TEXT_ANNOTATION:${textInput.text}`,
            strokeColor: drawingColor,
            strokeWidth: 1,
            positionX: textInput.x,
            positionY: textInput.y,
            width: 30,
            height: 5,
        });
        setTextInput(null);
        setTextPlacementMode(false);
        setDrawingMode(false);
        loadDrawings();
    }, [textInput, filePath, drawingColor, loadDrawings]);

    const handleExportPdf = useCallback(async () => {
        try {
            const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
            const cachedBuffer = pdfBufferCache.get(filePath);
            if (!cachedBuffer) { alert('PDF not loaded yet'); return; }
            const pdfDoc = await PDFDocument.load(new Uint8Array(cachedBuffer));
            const pages = pdfDoc.getPages();

            // Draw highlights
            for (const hl of localHighlights) {
                const colorStyle = HIGHLIGHT_COLORS[hl.color || 'yellow'];
                const rgba = colorStyle?.bg || 'rgba(255, 255, 0, 0.3)';
                const match = rgba.match(/[\d.]+/g);
                const r = match ? parseFloat(match[0]) / 255 : 1;
                const g = match ? parseFloat(match[1]) / 255 : 1;
                const b = match ? parseFloat(match[2]) / 255 : 0;
                const a = match && match[3] ? parseFloat(match[3]) : 0.3;

                for (const rect of (hl.position?.rects || [])) {
                    const pageIdx = rect.pageIndex ?? 0;
                    if (pageIdx >= pages.length) continue;
                    const page = pages[pageIdx];
                    const { width: pw, height: ph } = page.getSize();
                    page.drawRectangle({
                        x: (rect.left / 100) * pw,
                        y: ph - ((rect.top / 100) * ph) - ((rect.height / 100) * ph),
                        width: (rect.width / 100) * pw,
                        height: (rect.height / 100) * ph,
                        color: rgb(r, g, b),
                        opacity: a,
                    });
                }
            }

            // Draw annotations
            for (const d of drawings) {
                if (d.page_index >= pages.length) continue;
                const page = pages[d.page_index];
                const { width: pw, height: ph } = page.getSize();

                if (d.drawing_type === 'typed_signature' || d.drawing_type === 'text') {
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    let displayText = d.svg_path;
                    if (d.svg_path.startsWith('TEXT:')) {
                        displayText = d.svg_path.split(':').slice(2).join(':');
                    } else if (d.svg_path.startsWith('TEXT_ANNOTATION:')) {
                        displayText = d.svg_path.replace('TEXT_ANNOTATION:', '');
                    }
                    const cMatch = d.stroke_color.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
                    const cr = cMatch ? parseInt(cMatch[1], 16) / 255 : 0;
                    const cg = cMatch ? parseInt(cMatch[2], 16) / 255 : 0;
                    const cb = cMatch ? parseInt(cMatch[3], 16) / 255 : 0;
                    page.drawText(displayText, {
                        x: (d.position_x / 100) * pw,
                        y: ph - ((d.position_y / 100) * ph) - 12,
                        size: d.drawing_type === 'text' ? 11 : 14,
                        font,
                        color: rgb(cr, cg, cb),
                    });
                } else {
                    // Freehand / signature paths
                    const cmds = d.svg_path.match(/[ML]\s*[\d.]+\s+[\d.]+/g);
                    if (!cmds || cmds.length < 2) continue;
                    const cMatch = d.stroke_color.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
                    const sr = cMatch ? parseInt(cMatch[1], 16) / 255 : 0;
                    const sg = cMatch ? parseInt(cMatch[2], 16) / 255 : 0;
                    const sb = cMatch ? parseInt(cMatch[3], 16) / 255 : 0;

                    const points = cmds.map(c => {
                        const nums = c.match(/[\d.]+/g)!;
                        return { x: parseFloat(nums[0]), y: parseFloat(nums[1]) };
                    });

                    for (let i = 0; i < points.length - 1; i++) {
                        const isSignature = d.drawing_type === 'signature';
                        let x1, y1, x2, y2;
                        if (isSignature) {
                            x1 = ((d.position_x + points[i].x * d.width / 100) / 100) * pw;
                            y1 = ph - (((d.position_y + points[i].y * d.height / 100) / 100) * ph);
                            x2 = ((d.position_x + points[i + 1].x * d.width / 100) / 100) * pw;
                            y2 = ph - (((d.position_y + points[i + 1].y * d.height / 100) / 100) * ph);
                        } else {
                            x1 = (points[i].x / 100) * pw;
                            y1 = ph - ((points[i].y / 100) * ph);
                            x2 = (points[i + 1].x / 100) * pw;
                            y2 = ph - ((points[i + 1].y / 100) * ph);
                        }
                        page.drawLine({
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            thickness: d.stroke_width,
                            color: rgb(sr, sg, sb),
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = getFileName(filePath)?.replace('.pdf', '') || 'document';
            a.href = url;
            a.download = `${baseName}_annotated.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[PdfViewer] Export failed:', err);
            alert('Failed to export PDF: ' + err.message);
        }
    }, [filePath, localHighlights, drawings]);

    const handleTextSelect = useCallback((selection) => {
        setSelectedPdfText(selection);
        setLocalContextMenuPos(null);
    }, []);


    useEffect(() => {
        let currentBlobUrl = null;

        if (!filePath) {
            setPdfData(null);
            setError(null);
            return;
        }

        const loadFile = async () => {
            setError(null);
            try {
                // Check global cache first
                const cachedBuffer = pdfBufferCache.get(filePath);
                if (cachedBuffer) {
                    currentBlobUrl = URL.createObjectURL(new Blob([cachedBuffer], { type: 'application/pdf' }));
                    setPdfData(currentBlobUrl);
                    return;
                }

                const buffer = await (window as any).api.readFile(filePath);
                if (!buffer || buffer.byteLength === 0) {
                    setError('Empty file');
                    return;
                }
                // Cache globally
                cachePdfBuffer(filePath, buffer);
                currentBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
                setPdfData(currentBlobUrl);
            } catch (err) {
                console.error('[PdfViewer] Error loading PDF:', err);
                setError(err.message);
            }
        };

        loadFile();

        return () => {
            if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        };
    }, [filePath, refreshTrigger, nodeId]);

    useEffect(() => {
        loadHighlights();
    }, [nodeId, pdfHighlightsTrigger, loadHighlights]);

    // Load drawings on mount and when filePath changes
    useEffect(() => {
        loadDrawings();
    }, [loadDrawings]);

    // Render highlights as DOM overlays on page layers
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;
        if (!showHighlights || !localHighlights || localHighlights.length === 0) {
            wrapper.querySelectorAll('.pdf-highlight-overlay').forEach(el => el.remove());
            return;
        }

        const renderOverlays = () => {
            wrapper.querySelectorAll('.pdf-highlight-overlay').forEach(el => el.remove());

            const pageLayers = wrapper.querySelectorAll('.rpv-core__page-layer');

            if (pageLayers.length === 0) {
                setTimeout(renderOverlays, 500);
                return;
            }

            pageLayers.forEach((pageLayer: HTMLElement, pageIdx: number) => {
                let detectedIdx = pageIdx;
                const testId = pageLayer.getAttribute('data-testid') || '';
                const pageMatch = testId.match(/page-layer-(\d+)/);
                if (pageMatch) detectedIdx = parseInt(pageMatch[1], 10);

                if (getComputedStyle(pageLayer).position === 'static') {
                    pageLayer.style.position = 'relative';
                }

                localHighlights.forEach((highlight) => {
                    const rects = (highlight.position?.rects || []).filter(r => r.pageIndex === detectedIdx);
                    if (rects.length === 0) return;

                    const colorStyle = HIGHLIGHT_COLORS[highlight.color || 'yellow'] || HIGHLIGHT_COLORS.yellow;
                    const isSelected = selectedHighlightId === highlight.id;

                    rects.forEach((rect) => {
                        const div = document.createElement('div');
                        div.className = 'pdf-highlight-overlay';
                        div.style.cssText = `
                            position: absolute;
                            left: ${rect.left}%;
                            top: ${rect.top}%;
                            width: ${rect.width}%;
                            height: ${rect.height}%;
                            background-color: ${colorStyle.bg};
                            border: ${isSelected ? '2px solid #3b82f6' : 'none'};
                            pointer-events: none;
                            z-index: 3;
                            mix-blend-mode: multiply;
                        `;
                        pageLayer.appendChild(div);
                    });

                    // Add comment bubble at end of last rect
                    const lastRect = rects[rects.length - 1];
                    const hasAnnotation = !!(highlight.content?.annotation);
                    const bubble = document.createElement('div');
                    bubble.className = 'pdf-highlight-overlay pdf-comment-bubble';
                    bubble.title = hasAnnotation ? highlight.content.annotation : 'Click to add comment';
                    bubble.style.cssText = `
                        position: absolute;
                        left: ${lastRect.left + lastRect.width}%;
                        top: ${lastRect.top}%;
                        width: 18px;
                        height: 18px;
                        background: ${hasAnnotation ? colorStyle.border : '#6b7280'};
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        cursor: pointer;
                        pointer-events: auto;
                        z-index: 4;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                        transition: transform 0.15s;
                    `;
                    bubble.addEventListener('mouseenter', () => {
                        bubble.style.transform = 'rotate(-45deg) scale(1.2)';
                    });
                    bubble.addEventListener('mouseleave', () => {
                        bubble.style.transform = 'rotate(-45deg)';
                    });
                    bubble.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const bubbleRect = bubble.getBoundingClientRect();
                        setInlineComment({ highlightId: highlight.id, x: bubbleRect.right + 4, y: bubbleRect.top });
                        setInlineCommentText(highlight.content?.annotation || '');
                    });
                    pageLayer.appendChild(bubble);
                });
            });
        };

        const timer = setTimeout(renderOverlays, 300);
        return () => clearTimeout(timer);
    }, [localHighlights, showHighlights, selectedHighlightId, pdfData]);

    // Render drawings as SVG overlays on page layers
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        // Always clear old drawing overlays
        wrapper.querySelectorAll('.pdf-drawing-overlay').forEach(el => el.remove());

        if (!drawings || drawings.length === 0) return;

        const renderDrawings = () => {
            wrapper.querySelectorAll('.pdf-drawing-overlay').forEach(el => el.remove());
            const pageLayers = wrapper.querySelectorAll('.rpv-core__page-layer');
            if (pageLayers.length === 0) {
                setTimeout(renderDrawings, 500);
                return;
            }

            pageLayers.forEach((pageLayer: HTMLElement, pageIdx: number) => {
                let detectedIdx = pageIdx;
                const testId = pageLayer.getAttribute('data-testid') || '';
                const pageMatch = testId.match(/page-layer-(\d+)/);
                if (pageMatch) detectedIdx = parseInt(pageMatch[1], 10);

                if (getComputedStyle(pageLayer).position === 'static') {
                    pageLayer.style.position = 'relative';
                }

                const pageDrawings = drawings.filter(d => d.page_index === detectedIdx);
                if (pageDrawings.length === 0) return;

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'pdf-drawing-overlay');
                svg.setAttribute('viewBox', '0 0 100 100');
                svg.setAttribute('preserveAspectRatio', 'none');
                svg.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    z-index: 5;
                    pointer-events: none;
                    overflow: visible;
                `;

                pageDrawings.forEach((d) => {
                    if (d.drawing_type === 'typed_signature') {
                        const parts = d.svg_path.split(':');
                        if (parts.length >= 3 && parts[0] === 'TEXT') {
                            const fontFamily = parts[1];
                            const name = parts.slice(2).join(':');
                            const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                            fo.setAttribute('x', String(d.position_x));
                            fo.setAttribute('y', String(d.position_y));
                            fo.setAttribute('width', String(d.width));
                            fo.setAttribute('height', String(d.height));
                            const div = document.createElement('div');
                            div.style.cssText = `font-family: ${fontFamily}; font-size: 6px; color: ${d.stroke_color}; white-space: nowrap; line-height: 1;`;
                            div.textContent = name;
                            fo.appendChild(div);
                            svg.appendChild(fo);
                        }
                    } else if (d.drawing_type === 'text') {
                        const text = d.svg_path.replace('TEXT_ANNOTATION:', '');
                        const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                        fo.setAttribute('x', String(d.position_x));
                        fo.setAttribute('y', String(d.position_y));
                        fo.setAttribute('width', String(Math.max(d.width, 40)));
                        fo.setAttribute('height', String(Math.max(d.height, 5)));
                        const div = document.createElement('div');
                        div.style.cssText = `font-family: sans-serif; font-size: 4px; color: ${d.stroke_color}; white-space: nowrap; line-height: 1.2;`;
                        div.textContent = text;
                        fo.appendChild(div);
                        svg.appendChild(fo);
                    } else if (d.drawing_type === 'signature') {
                        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        g.setAttribute('transform', `translate(${d.position_x}, ${d.position_y}) scale(${d.width / 100}, ${d.height / 100})`);
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', d.svg_path);
                        path.setAttribute('fill', 'none');
                        path.setAttribute('stroke', d.stroke_color);
                        path.setAttribute('stroke-width', String(d.stroke_width * (100 / d.width)));
                        path.setAttribute('stroke-linecap', 'round');
                        path.setAttribute('stroke-linejoin', 'round');
                        g.appendChild(path);
                        svg.appendChild(g);
                    } else {
                        // Freehand path
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', d.svg_path);
                        path.setAttribute('fill', 'none');
                        path.setAttribute('stroke', d.stroke_color);
                        path.setAttribute('stroke-width', String(d.stroke_width * 0.4));
                        path.setAttribute('stroke-linecap', 'round');
                        path.setAttribute('stroke-linejoin', 'round');
                        svg.appendChild(path);
                    }
                });

                pageLayer.appendChild(svg);
            });
        };

        const timer = setTimeout(renderDrawings, 300);
        return () => clearTimeout(timer);
    }, [drawings, pdfData]);

    // Handle signature placement clicks
    useEffect(() => {
        if (!signaturePlacementMode || !currentSignature) return;
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const handleClick = (e: MouseEvent) => {
            const pageLayer = (e.target as HTMLElement).closest('.rpv-core__page-layer') as HTMLElement;
            if (!pageLayer) return;

            const rect = pageLayer.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            let detectedIdx = 0;
            const testId = pageLayer.getAttribute('data-testid') || '';
            const pm = testId.match(/page-layer-(\d+)/);
            if (pm) detectedIdx = parseInt(pm[1], 10);

            handleSignaturePlacement(detectedIdx, x, y);
        };

        wrapper.addEventListener('click', handleClick);
        return () => wrapper.removeEventListener('click', handleClick);
    }, [signaturePlacementMode, currentSignature, handleSignaturePlacement]);

    // Handle text placement clicks
    useEffect(() => {
        if (!textPlacementMode) return;
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const handleClick = (e: MouseEvent) => {
            const pageLayer = (e.target as HTMLElement).closest('.rpv-core__page-layer') as HTMLElement;
            if (!pageLayer) return;

            const rect = pageLayer.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            let detectedIdx = 0;
            const testId = pageLayer.getAttribute('data-testid') || '';
            const pm = testId.match(/page-layer-(\d+)/);
            if (pm) detectedIdx = parseInt(pm[1], 10);

            setTextInput({ pageIndex: detectedIdx, x, y, text: '' });
            setTextPlacementMode(false);
        };

        wrapper.addEventListener('click', handleClick);
        return () => wrapper.removeEventListener('click', handleClick);
    }, [textPlacementMode]);

    // Escape key handler for dismissing popovers and exiting drawing mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (localContextMenuPos) { setLocalContextMenuPos(null); return; }
                if (inlineComment) { setInlineComment(null); return; }
                if (textInput) { setTextInput(null); return; }
                if (signaturePlacementMode) {
                    setSignaturePlacementMode(false);
                    setCurrentSignature(null);
                    setDrawingMode(false);
                    setDrawingTool(null);
                    return;
                }
                if (textPlacementMode) { setTextPlacementMode(false); return; }
                if (drawingMode) {
                    setDrawingMode(false);
                    setDrawingTool(null);
                    return;
                }
            }
            // Keyboard shortcuts (only when not typing in an input)
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            // Also skip if target is a contenteditable element or inside a CodeMirror editor
            if ((e.target as HTMLElement)?.isContentEditable) return;
            if ((e.target as HTMLElement)?.closest?.('.cm-editor')) return;

            // Single-key shortcuts (no modifier) only fire when this PDF pane is active
            const isPaneActive = activeContentPaneId === nodeId;

            if (e.key === 'z' && (e.ctrlKey || e.metaKey) && drawingMode) {
                e.preventDefault();
                handleUndoLastDrawing();
            } else if (isPaneActive && e.key === 'p' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setDrawingMode(true);
                setDrawingTool('pen');
            } else if (isPaneActive && e.key === 'e' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setDrawingMode(true);
                setDrawingTool('eraser');
            } else if (isPaneActive && e.key === 't' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setTextPlacementMode(true);
                setDrawingMode(true);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [localContextMenuPos, inlineComment, textInput, signaturePlacementMode, textPlacementMode, drawingMode, handleUndoLastDrawing, activeContentPaneId, nodeId]);

    // Enforce text layer invisibility and scale factor via MutationObserver
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const scale = currentScale || 1;

        const applyScaleToElement = (el: HTMLElement) => {
            el.style.setProperty('--scale-factor', String(scale));
        };

        const applyStyles = () => {
            wrapper.style.setProperty('--scale-factor', String(scale));
            wrapper.querySelectorAll('.rpv-core__text-layer').forEach((el: HTMLElement) => {
                applyScaleToElement(el);
            });
            wrapper.querySelectorAll('.rpv-core__inner-page, .rpv-core__page-layer, .rpv-core__inner-pages').forEach((el: HTMLElement) => {
                applyScaleToElement(el);
            });
        };

        applyStyles();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node instanceof HTMLElement) {
                            if (node.classList?.contains('rpv-core__text-layer') ||
                                node.classList?.contains('rpv-core__page-layer') ||
                                node.querySelector?.('.rpv-core__text-layer')) {
                                applyStyles();
                                return;
                            }
                        }
                    }
                }
            }
        });

        observer.observe(wrapper, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [currentScale]);

    // Handle text selection
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const handleMouseUp = (e) => {
            if (e.button === 2) return;
            if (!wrapper.contains(e.target)) return;

            setTimeout(() => {
                const selection = window.getSelection();
                const text = selection?.toString().trim();

                if (text && text.length > 0) {
                    const range = selection.getRangeAt(0);
                    const rects = Array.from(range.getClientRects());

                    if (rects.length > 0) {
                        const pageContainer = (e.target as HTMLElement).closest('.rpv-core__page-layer');
                        const containerRect = pageContainer
                            ? pageContainer.getBoundingClientRect()
                            : wrapper.getBoundingClientRect();

                        let detectedPageIndex = 0;
                        if (pageContainer) {
                            const testId = pageContainer.getAttribute('data-testid') || '';
                            const pageMatch = testId.match(/page-layer-(\d+)/);
                            if (pageMatch) {
                                detectedPageIndex = parseInt(pageMatch[1], 10);
                            } else {
                                const allPages = wrapper.querySelectorAll('.rpv-core__page-layer');
                                for (let i = 0; i < allPages.length; i++) {
                                    if (allPages[i] === pageContainer) { detectedPageIndex = i; break; }
                                }
                            }
                        }

                        const position = {
                            pageIndex: detectedPageIndex,
                            rects: rects.map(rect => ({
                                pageIndex: detectedPageIndex,
                                left: ((rect.left - containerRect.left) / containerRect.width) * 100,
                                top: ((rect.top - containerRect.top) / containerRect.height) * 100,
                                width: (rect.width / containerRect.width) * 100,
                                height: (rect.height / containerRect.height) * 100
                            }))
                        };

                        if (handleTextSelect) {
                            handleTextSelect({ text, position, timestamp: Date.now() });
                        }
                    }
                }
            }, 50);
        };

        const handleContextMenu = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            setLocalContextMenuPos({ x: e.clientX, y: e.clientY });
        };

        document.addEventListener('mouseup', handleMouseUp);
        wrapper.addEventListener('contextmenu', handleContextMenu, true);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            wrapper.removeEventListener('contextmenu', handleContextMenu, true);
        };
    }, [handleTextSelect, pdfData]);

    // Save highlight directly using this viewer's own filePath
    const saveHighlight = useCallback(async (text: string, position: any, color: string = 'yellow') => {
        if (!text || !position || !filePath) return;
        try {
            await (window as any).api.addPdfHighlight({
                filePath,
                text,
                position,
                annotation: '',
                color
            });
            await loadHighlights();
        } catch (err) {
            console.error('[PdfViewer] Failed to save highlight:', err);
        }
    }, [filePath, loadHighlights]);

    if (error) return <div className="flex items-center justify-center h-full text-red-400 text-sm">Failed to load PDF: {error}</div>;
    if (!pdfData) return (
        <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-sm animate-pulse">Loading PDF...</div>
        </div>
    );

    return (
        <div className="flex h-full w-full">
            {/* Main PDF viewer column */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Drawing / annotation toolbar row */}
                <div className="flex items-center gap-1 theme-bg-secondary border-b theme-border px-2 py-1 flex-shrink-0">
                    <button
                        onClick={toggleDrawingMode}
                        className={`p-1.5 rounded transition-colors ${drawingMode ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                        title={drawingMode ? 'Exit drawing mode' : 'Enter drawing mode'}
                    >
                        <Pen size={14} />
                    </button>

                    {drawingMode && !signaturePlacementMode && (
                        <>
                            <div className="w-px h-5 bg-gray-600 mx-0.5" />
                            <button
                                onClick={() => setDrawingTool('pen')}
                                className={`p-1.5 rounded transition-colors ${drawingTool === 'pen' ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                                title="Pen tool (P)"
                            >
                                <PenTool size={14} />
                            </button>
                            <button
                                onClick={() => setDrawingTool('eraser')}
                                className={`p-1.5 rounded transition-colors ${drawingTool === 'eraser' ? 'bg-red-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                                title="Eraser (E)"
                            >
                                <Eraser size={14} />
                            </button>
                            <button
                                onClick={handleUndoLastDrawing}
                                disabled={drawings.length === 0}
                                className="p-1.5 rounded transition-colors hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Undo last drawing (Ctrl+Z)"
                            >
                                <Undo2 size={14} />
                            </button>
                            <div className="w-px h-5 bg-gray-600 mx-0.5" />
                            <input
                                type="color"
                                value={drawingColor}
                                onChange={(e) => setDrawingColor(e.target.value)}
                                className="w-6 h-6 cursor-pointer rounded border border-gray-600"
                                title="Stroke color"
                            />
                            <select
                                value={drawingStrokeWidth}
                                onChange={(e) => setDrawingStrokeWidth(Number(e.target.value))}
                                className="bg-gray-700 text-xs text-gray-300 rounded px-1 py-1 border border-gray-600"
                                title="Stroke width"
                            >
                                <option value={1}>1px</option>
                                <option value={2}>2px</option>
                                <option value={2.5}>2.5px</option>
                                <option value={3}>3px</option>
                                <option value={5}>5px</option>
                                <option value={8}>8px</option>
                            </select>
                        </>
                    )}

                    {signaturePlacementMode && (
                        <>
                            <div className="w-px h-5 bg-gray-600 mx-0.5" />
                            <span className="text-xs text-yellow-400 px-1 animate-pulse">Click on page to place signature</span>
                            <button
                                onClick={() => {
                                    setSignaturePlacementMode(false);
                                    setCurrentSignature(null);
                                    setDrawingMode(false);
                                    setDrawingTool(null);
                                }}
                                className="p-1 hover:bg-gray-700 rounded text-gray-400"
                                title="Cancel placement"
                            >
                                <X size={14} />
                            </button>
                        </>
                    )}

                    {textPlacementMode && (
                        <>
                            <div className="w-px h-5 bg-gray-600 mx-0.5" />
                            <span className="text-xs text-yellow-400 px-1 animate-pulse">Click on page to place text</span>
                            <button
                                onClick={() => setTextPlacementMode(false)}
                                className="p-1 hover:bg-gray-700 rounded text-gray-400"
                                title="Cancel"
                            >
                                <X size={14} />
                            </button>
                        </>
                    )}

                    <div className="w-px h-5 bg-gray-600 mx-0.5" />
                    <button
                        onClick={() => setSignatureModalOpen(true)}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                        title="Add signature"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        onClick={() => {
                            setTextPlacementMode(true);
                            setDrawingMode(true);
                        }}
                        className={`p-1.5 rounded transition-colors ${textPlacementMode ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                        title="Add text annotation"
                    >
                        <Type size={14} />
                    </button>

                    <div className="flex-1" />

                    <button
                        onClick={() => setShowAnnotationsPanel(!showAnnotationsPanel)}
                        className={`p-1.5 rounded transition-colors ${showAnnotationsPanel ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                        title={showAnnotationsPanel ? 'Hide annotations' : 'Show annotations'}
                    >
                        {showAnnotationsPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                    </button>
                    <div className="w-px h-5 bg-gray-600 mx-0.5" />
                    <button
                        onClick={() => handleExportPdf()}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                        title="Export annotated PDF"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                        title="Print"
                    >
                        <Printer size={14} />
                    </button>
                </div>

                {/* PDF Viewer */}
                <div
                    ref={viewerWrapperRef}
                    className="flex-1 relative overflow-hidden pdf-viewer-container"
                    style={{ ['--scale-factor' as any]: currentScale || 1 }}
                >
                    <Worker workerUrl={workerUrl}>
                        <Viewer
                            fileUrl={pdfData}
                            plugins={[defaultLayoutPluginInstance, zoomPluginInstance]}
                            defaultScale={SpecialZoomLevel.PageWidth}
                            onDocumentLoad={handleDocumentLoad}
                            onZoom={(e) => {
                                setCurrentScale(e.scale);
                                const wrapper = viewerWrapperRef.current;
                                if (wrapper) {
                                    requestAnimationFrame(() => {
                                        const textLayers = wrapper.querySelectorAll('.rpv-core__text-layer');
                                        textLayers.forEach((textLayer: HTMLElement) => {
                                            textLayer.style.setProperty('--scale-factor', String(e.scale));
                                        });
                                    });
                                }
                            }}
                        />
                    </Worker>

                    {/* Drawing canvas overlays for each visible page */}
                    <DrawingCanvasManager
                        wrapperRef={viewerWrapperRef}
                        drawingMode={drawingMode}
                        drawingTool={signaturePlacementMode || textPlacementMode ? null : drawingTool}
                        strokeColor={drawingColor}
                        strokeWidth={drawingStrokeWidth}
                        onPathComplete={handlePathComplete}
                        onErase={handleEraseAt}
                        pdfData={pdfData}
                    />
                </div>
            </div>

            {/* Signature modal */}
            <SignatureModal
                isOpen={signatureModalOpen}
                onClose={() => setSignatureModalOpen(false)}
                onSave={handleSignatureSave}
            />

            <PdfContextMenu
                pdfContextMenuPos={localContextMenuPos}
                setPdfContextMenuPos={setLocalContextMenuPos}
                handleCopyPdfText={handleCopyPdfText}
                handleHighlightPdfSelection={(text, position, color) => {
                    saveHighlight(text, position, color || selectedColor);
                }}
                handleApplyPromptToPdfText={handleApplyPromptToPdfText}
                selectedPdfText={selectedPdfText}
                selectedColor={selectedColor}
                setSelectedColor={setSelectedColor}
                onAddComment={async (text, position, color) => {
                    if (!text || !position) return;
                    await saveHighlight(text, position, color || selectedColor);
                    setShowAnnotationsPanel(true);
                }}
            />

            {/* Inline comment popover */}
            {inlineComment && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setInlineComment(null)} />
                    <div
                        className="fixed z-50 theme-bg-secondary theme-border border rounded-lg shadow-xl p-3"
                        style={{ top: inlineComment.y, left: inlineComment.x, minWidth: '240px', maxWidth: '320px' }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquare size={14} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-300">Comment</span>
                        </div>
                        <textarea
                            value={inlineCommentText}
                            onChange={(e) => setInlineCommentText(e.target.value)}
                            placeholder="Add a comment..."
                            className="w-full p-2 text-xs rounded bg-gray-800 border theme-border resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex gap-1.5 mt-2">
                            <button
                                onClick={async () => {
                                    await handleUpdateHighlight(inlineComment.highlightId, inlineCommentText);
                                    setInlineComment(null);
                                }}
                                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => {
                                    handleDeleteHighlight(inlineComment.highlightId);
                                    setInlineComment(null);
                                }}
                                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setInlineComment(null)}
                                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Text annotation input */}
            {textInput && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setTextInput(null)} />
                    <div
                        className="fixed z-50 theme-bg-secondary theme-border border rounded-lg shadow-xl p-3"
                        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', minWidth: '280px' }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Type size={14} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-300">Add Text Annotation</span>
                        </div>
                        <input
                            type="text"
                            value={textInput.text}
                            onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                            placeholder="Enter text..."
                            className="w-full p-2 text-sm rounded bg-gray-800 border theme-border focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTextAnnotation(); }}
                        />
                        <div className="flex gap-1.5">
                            <button
                                onClick={handleSaveTextAnnotation}
                                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium"
                            >
                                Place Text
                            </button>
                            <button
                                onClick={() => setTextInput(null)}
                                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Annotations panel */}
            {showAnnotationsPanel && (
                <AnnotationsPanel
                    highlights={localHighlights || []}
                    drawings={drawings}
                    showHighlights={showHighlights}
                    setShowHighlights={setShowHighlights}
                    onDeleteHighlight={handleDeleteHighlight}
                    onUpdateHighlight={handleUpdateHighlight}
                    onSelectHighlight={handleSelectHighlight}
                    onDeleteDrawing={handleDeleteDrawing}
                    onUndoLastDrawing={handleUndoLastDrawing}
                    onClearPageDrawings={handleClearPageDrawings}
                    selectedHighlightId={selectedHighlightId}
                />
            )}
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(PdfViewer, arePropsEqual);
