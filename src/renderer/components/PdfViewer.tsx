import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import {
    ChevronLeft, ChevronRight, Highlighter, MessageSquare, Trash2,
    Eye, EyeOff, Edit2, Save, X, PanelRightClose, PanelRightOpen, Palette
} from 'lucide-react';

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

// Global cache for PDF buffers - keyed by filePath
const pdfBufferCache = new Map<string, ArrayBuffer>();

interface Highlight {
    id: number;
    position: { rects: Array<{ left: number; top: number; width: number; height: number; pageIndex?: number }> };
    content: { text: string; annotation: string };
    color?: string;
    highlighted_text?: string;
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
    setSelectedColor
}) => {
    if (!pdfContextMenuPos) return null;

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

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setPdfContextMenuPos(null)} />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm"
                style={{ top: pdfContextMenuPos.y, left: pdfContextMenuPos.x }}
            >
                {selectedPdfText?.text && (
                    <>
                        <button onClick={copyText} className="block px-4 py-2 w-full text-left theme-hover">
                            Copy
                        </button>
                        <div className="border-t theme-border my-1"></div>
                        <div className="px-4 py-2">
                            <div className="text-xs text-gray-500 mb-2">Highlight with color:</div>
                            <div className="flex gap-2">
                                {Object.entries(HIGHLIGHT_COLORS).map(([color, { bg }]) => (
                                    <button
                                        key={color}
                                        onClick={() => highlightText(color)}
                                        className="w-6 h-6 rounded border-2 border-gray-600 hover:border-white transition-colors"
                                        style={{ backgroundColor: bg }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="border-t theme-border my-1"></div>
                        <button onClick={summarizeText} className="block px-4 py-2 w-full text-left theme-hover">
                            Summarize Text
                        </button>
                        <button onClick={explainText} className="block px-4 py-2 w-full text-left theme-hover">
                            Explain Text
                        </button>
                    </>
                )}
                {!selectedPdfText?.text && (
                    <div className="px-4 py-2 text-gray-500">No text selected</div>
                )}
            </div>
        </>
    );
};

// Highlight Note Form Component (for adding notes to highlights)
const HighlightNoteForm = ({
    onSave,
    onCancel,
    initialColor
}: {
    onSave: (note: string, color: string) => void;
    onCancel: () => void;
    initialColor: string;
}) => {
    const [note, setNote] = useState('');
    const [color, setColor] = useState(initialColor);

    return (
        <div
            style={{
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '12px',
                position: 'absolute',
                zIndex: 100,
                minWidth: '250px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
        >
            <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Highlight Color:</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {Object.entries(HIGHLIGHT_COLORS).map(([c, { bg, border }]) => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            style={{
                                width: '28px',
                                height: '28px',
                                background: bg,
                                border: color === c ? '2px solid white' : `2px solid ${border}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                            title={c}
                        />
                    ))}
                </div>
            </div>
            <textarea
                placeholder="Add a note (optional)..."
                rows={3}
                style={{
                    background: '#374151',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    padding: '8px',
                    width: '100%',
                    marginBottom: '10px',
                    color: 'white',
                    resize: 'none',
                }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    style={{
                        flex: 1,
                        background: '#3b82f6',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '8px 16px',
                        fontWeight: 500,
                    }}
                    onClick={() => onSave(note, color)}
                >
                    Save
                </button>
                <button
                    style={{
                        background: '#4b5563',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '8px 16px',
                    }}
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

// Annotations Panel Component
const AnnotationsPanel = ({
    highlights,
    showHighlights,
    setShowHighlights,
    onDeleteHighlight,
    onUpdateHighlight,
    onSelectHighlight,
    selectedHighlightId
}: {
    highlights: Highlight[];
    showHighlights: boolean;
    setShowHighlights: (show: boolean) => void;
    onDeleteHighlight: (id: number) => void;
    onUpdateHighlight: (id: number, annotation: string, color?: string) => void;
    onSelectHighlight: (highlight: Highlight | null) => void;
    selectedHighlightId: number | null;
}) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [editColor, setEditColor] = useState('yellow');

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

    return (
        <div className="w-72 border-l theme-border flex flex-col theme-bg-secondary h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b theme-border">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Highlighter size={16} className="text-yellow-400" />
                    Annotations ({highlights.length})
                </h3>
                <button
                    onClick={() => setShowHighlights(!showHighlights)}
                    className={`p-1.5 rounded ${showHighlights ? 'theme-hover' : 'bg-red-500/20 text-red-400'}`}
                    title={showHighlights ? 'Hide highlights' : 'Show highlights'}
                >
                    {showHighlights ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
            </div>

            {/* Highlights list */}
            <div className="flex-1 overflow-auto p-2 space-y-2">
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
                                {/* Highlighted text */}
                                <p className="text-xs line-clamp-3 mb-2">
                                    "{highlight.content?.text || highlight.highlighted_text || ''}"
                                </p>

                                {/* Annotation */}
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

                                        {/* Actions */}
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
            </div>
        </div>
    );
};

const PdfViewer = ({
    nodeId,
    contentDataRef,
    currentPath,
    activeContentPaneId,
    pdfContextMenuPos,
    setPdfContextMenuPos,
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

    const [selectedPdfText, setSelectedPdfText] = useState(null);
    const [pdfSelectionIndicator, setPdfSelectionIndicator] = useState(null);
    const [showHighlights, setShowHighlights] = useState(true);
    const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false);
    const [selectedHighlightId, setSelectedHighlightId] = useState<number | null>(null);
    const [selectedColor, setSelectedColor] = useState('yellow');
    const [currentScale, setCurrentScale] = useState(1);

    const workerUrl = window.location.protocol === 'file:'
        ? `${window.location.href.substring(0, window.location.href.lastIndexOf('/'))}/pdf.worker.min.js`
        : `${window.location.origin}/pdf.worker.min.js`;

    // Selection popup for highlighting
    const [selectionPopup, setSelectionPopup] = useState<{
        x: number;
        y: number;
        text: string;
        position: any;
    } | null>(null);

    // Create zoom plugin to track scale
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
        // Could scroll to highlight position here if needed
    }, []);

    const createPdfTextSelectHandler = useCallback((setSelectedPdfTextFn, setPdfSelectionIndicatorFn, setPdfContextMenuPosFn) => {
        return (selection) => {
            setSelectedPdfTextFn(selection);
            if (selection?.rects) {
                setPdfSelectionIndicatorFn({
                    pageIndex: selection.pageIndex ?? 0,
                    rects: selection.rects,
                });
            } else {
                setPdfSelectionIndicatorFn(null);
            }
            setPdfContextMenuPosFn(null);
        };
    }, []);

    const createPdfContextMenuHandler = useCallback((selectedPdfTextFn, setPdfContextMenuPosFn) => {
        return (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            setPdfContextMenuPosFn({ x: e.clientX, y: e.clientY });
        };
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
                pdfBufferCache.set(filePath, buffer);
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

    // Aggressively enforce text layer invisibility and scale factor
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const scale = currentScale || 1;

        // Function to make text spans invisible - apply all possible style overrides
        const makeTextLayerInvisible = (textLayer: HTMLElement) => {
            textLayer.style.setProperty('--scale-factor', String(scale));
            textLayer.style.color = 'transparent';
            textLayer.style.setProperty('color', 'transparent', 'important');
            textLayer.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            textLayer.style.setProperty('fill', 'transparent', 'important');

            // Apply to all span children
            const spans = textLayer.querySelectorAll('span');
            spans.forEach((span: HTMLElement) => {
                span.style.color = 'transparent';
                span.style.setProperty('color', 'transparent', 'important');
                span.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                span.style.setProperty('text-shadow', 'none', 'important');
                span.style.setProperty('fill', 'transparent', 'important');
                span.style.setProperty('stroke', 'transparent', 'important');
            });
        };

        // Function to set scale factor on all relevant elements
        const applyAllStyles = () => {
            wrapper.style.setProperty('--scale-factor', String(scale));

            // Apply to all text layers
            const textLayers = wrapper.querySelectorAll('.rpv-core__text-layer');
            textLayers.forEach((el: HTMLElement) => {
                makeTextLayerInvisible(el);
            });

            // Set scale factor on all page-related elements
            const pageElements = wrapper.querySelectorAll('.rpv-core__inner-page, .rpv-core__page-layer, .rpv-core__inner-pages');
            pageElements.forEach((el: HTMLElement) => {
                el.style.setProperty('--scale-factor', String(scale));
            });
        };

        // Apply immediately
        applyAllStyles();

        // Also apply on a short interval for the first few seconds to catch late-rendered text
        let intervalCount = 0;
        const interval = setInterval(() => {
            applyAllStyles();
            intervalCount++;
            if (intervalCount > 20) { // Stop after ~2 seconds
                clearInterval(interval);
            }
        }, 100);

        // Watch for new text layers being added
        const observer = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLElement) {
                            if (node.classList?.contains('rpv-core__text-layer') ||
                                node.querySelector?.('.rpv-core__text-layer')) {
                                needsUpdate = true;
                            }
                        }
                    });
                }
            }
            if (needsUpdate) {
                applyAllStyles();
            }
        });

        observer.observe(wrapper, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
            clearInterval(interval);
        };
    }, [currentScale]);

    const handleActualTextSelect = useMemo(
        () => createPdfTextSelectHandler(setSelectedPdfText, setPdfSelectionIndicator, setPdfContextMenuPos),
        [createPdfTextSelectHandler, setSelectedPdfText, setPdfSelectionIndicator, setPdfContextMenuPos]
    );
    const handleActualContextMenu = useMemo(
        () => createPdfContextMenuHandler(selectedPdfText, setPdfContextMenuPos),
        [createPdfContextMenuHandler, selectedPdfText, setPdfContextMenuPos]
    );

    // Handle text selection - show popup with highlight options
    useEffect(() => {
        const wrapper = viewerWrapperRef.current;
        if (!wrapper) return;

        const handleMouseUp = (e) => {
            // Don't process if clicking on the popup itself
            if (e.target.closest('.highlight-popup')) return;

            if (!wrapper.contains(e.target)) {
                setSelectionPopup(null);
                return;
            }

            setTimeout(() => {
                const selection = window.getSelection();
                const text = selection?.toString().trim();

                if (text && text.length > 0) {
                    const range = selection.getRangeAt(0);
                    const rects = Array.from(range.getClientRects());

                    if (rects.length > 0) {
                        // Find the page container to get relative positioning
                        const pageContainer = (e.target as HTMLElement).closest('.rpv-core__page-layer');
                        const containerRect = pageContainer
                            ? pageContainer.getBoundingClientRect()
                            : wrapper.getBoundingClientRect();

                        const position = {
                            pageIndex: 0,
                            rects: rects.map(rect => ({
                                pageIndex: 0,
                                left: ((rect.left - containerRect.left) / containerRect.width) * 100,
                                top: ((rect.top - containerRect.top) / containerRect.height) * 100,
                                width: (rect.width / containerRect.width) * 100,
                                height: (rect.height / containerRect.height) * 100
                            }))
                        };

                        // Get the last rect for popup positioning
                        const lastRect = rects[rects.length - 1];

                        setSelectionPopup({
                            x: lastRect.right,
                            y: lastRect.bottom + 8,
                            text: text,
                            position: position
                        });

                        // Also update the old selection state for context menu
                        if (handleActualTextSelect) {
                            handleActualTextSelect({
                                text: text,
                                position: position,
                                timestamp: Date.now()
                            });
                        }
                    }
                } else {
                    setSelectionPopup(null);
                }
            }, 50);
        };

        const handleMouseDown = (e) => {
            // Hide popup when clicking elsewhere (but not on the popup)
            if (!e.target.closest('.highlight-popup')) {
                setSelectionPopup(null);
            }
        };

        const contextMenuListener = (e) => {
            if (!wrapper.contains(e.target)) return;
            handleActualContextMenu(e);
        };

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('contextmenu', contextMenuListener, true);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('contextmenu', contextMenuListener, true);
        };
    }, [handleActualTextSelect, handleActualContextMenu]);

    // Handle highlighting from the popup
    const handleQuickHighlight = useCallback((color: string) => {
        if (selectionPopup) {
            handleHighlightPdfSelection(selectionPopup.text, selectionPopup.position, color);
            setSelectionPopup(null);
            window.getSelection()?.removeAllRanges();
        }
    }, [selectionPopup, handleHighlightPdfSelection]);

    if (error) return <div className="p-4 text-red-500">Error loading PDF: {error}</div>;
    if (!pdfData) return <div className="p-4 text-yellow-500">Loading PDF... (filePath: {filePath || 'undefined'}, nodeId: {nodeId})</div>;

    return (
        <div className="flex h-full w-full">
            {/* Main PDF viewer */}
            <div
                ref={viewerWrapperRef}
                className="flex-1 relative overflow-hidden pdf-viewer-container"
                style={{ ['--scale-factor' as any]: currentScale || 1 }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPdfContextMenuPos({ x: e.clientX, y: e.clientY });
                }}
            >
                {/* Toggle annotations panel button */}
                <button
                    onClick={() => setShowAnnotationsPanel(!showAnnotationsPanel)}
                    className="absolute top-2 right-2 z-20 p-2 bg-gray-800 hover:bg-gray-700 rounded shadow-lg"
                    title={showAnnotationsPanel ? 'Hide annotations' : 'Show annotations'}
                >
                    {showAnnotationsPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                </button>

                <Worker workerUrl={workerUrl}>
                    <Viewer
                        fileUrl={pdfData}
                        plugins={[defaultLayoutPluginInstance, zoomPluginInstance]}
                        defaultScale={SpecialZoomLevel.PageWidth}
                        onDocumentLoad={handleDocumentLoad}
                        onZoom={(e) => {
                            setCurrentScale(e.scale);
                            // Update scale factors on all text layers
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
                        renderPage={(props) => (
                            <>
                                {props.canvasLayer.children}
                                {props.textLayer.children}
                                {props.annotationLayer.children}
                                {/* Render highlights for this page */}
                                {showHighlights && pdfHighlights && pdfHighlights.map((highlight, idx) => {
                                    const rects = (highlight.position?.rects || []).filter(r =>
                                        r.pageIndex === props.pageIndex
                                    );
                                    if (rects.length === 0) return null;
                                    const colorStyle = HIGHLIGHT_COLORS[highlight.color || 'yellow'] || HIGHLIGHT_COLORS.yellow;
                                    const isSelected = selectedHighlightId === highlight.id;

                                    return rects.map((rect, rectIdx) => (
                                        <div
                                            key={`${highlight.id}-${rectIdx}`}
                                            style={{
                                                position: 'absolute',
                                                left: `${rect.left}%`,
                                                top: `${rect.top}%`,
                                                width: `${rect.width}%`,
                                                height: `${rect.height}%`,
                                                backgroundColor: colorStyle.bg,
                                                border: isSelected ? '2px solid #3b82f6' : 'none',
                                                pointerEvents: 'none',
                                                zIndex: 1,
                                                mixBlendMode: 'multiply',
                                            }}
                                        />
                                    ));
                                })}
                            </>
                        )}
                    />
                </Worker>

                {/* Selection popup with color buttons */}
                {selectionPopup && (
                    <div
                        className="highlight-popup fixed z-50"
                        style={{
                            left: selectionPopup.x,
                            top: selectionPopup.y,
                        }}
                    >
                        <div
                            className="flex gap-1 p-2 rounded-lg shadow-lg"
                            style={{
                                background: '#1f2937',
                                border: '1px solid #374151',
                            }}
                        >
                            {Object.entries(HIGHLIGHT_COLORS).map(([colorName, { bg, border }]) => (
                                <button
                                    key={colorName}
                                    onClick={() => handleQuickHighlight(colorName)}
                                    className="w-7 h-7 rounded transition-transform hover:scale-110"
                                    style={{
                                        background: bg,
                                        border: `2px solid ${border}`,
                                    }}
                                    title={`Highlight ${colorName}`}
                                />
                            ))}
                            <button
                                onClick={() => {
                                    if (selectionPopup) {
                                        navigator.clipboard.writeText(selectionPopup.text);
                                        setSelectionPopup(null);
                                    }
                                }}
                                className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700"
                                style={{ background: '#374151' }}
                                title="Copy text"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                <PdfContextMenu
                    pdfContextMenuPos={pdfContextMenuPos}
                    setPdfContextMenuPos={setPdfContextMenuPos}
                    handleCopyPdfText={handleCopyPdfText}
                    handleHighlightPdfSelection={(text, position, color) => {
                        handleHighlightPdfSelection(text, position, color || selectedColor);
                    }}
                    handleApplyPromptToPdfText={handleApplyPromptToPdfText}
                    selectedPdfText={selectedPdfText}
                    selectedColor={selectedColor}
                    setSelectedColor={setSelectedColor}
                />
            </div>

            {/* Annotations panel */}
            {showAnnotationsPanel && (
                <AnnotationsPanel
                    highlights={pdfHighlights || []}
                    showHighlights={showHighlights}
                    setShowHighlights={setShowHighlights}
                    onDeleteHighlight={handleDeleteHighlight}
                    onUpdateHighlight={handleUpdateHighlight}
                    onSelectHighlight={handleSelectHighlight}
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
