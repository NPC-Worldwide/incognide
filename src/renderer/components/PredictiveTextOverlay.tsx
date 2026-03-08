import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export const PredictiveTextOverlay = ({
    predictionSuggestion,
    predictionTargetElement,
    isPredictiveTextEnabled,
    setPredictionSuggestion,
    setPredictionTargetElement
}) => {
    const overlayRef = useRef(null);
    const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
    const shouldShow = predictionSuggestion && predictionTargetElement && isPredictiveTextEnabled && cursorPosition;

    useEffect(() => {
        if (!predictionTargetElement) {
            setCursorPosition(null);
            return;
        }

        const updateCursorPosition = () => {
            let pos: { x: number; y: number } | null = null;

            if (predictionTargetElement instanceof HTMLTextAreaElement || predictionTargetElement instanceof HTMLInputElement) {

                const rect = predictionTargetElement.getBoundingClientRect();

                pos = {
                    x: rect.left + 10,
                    y: Math.min(rect.bottom, window.innerHeight - 250)
                };
            } else if (predictionTargetElement.isContentEditable) {

                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const rects = range.getClientRects();
                    if (rects.length > 0) {
                        const lastRect = rects[rects.length - 1];
                        pos = {
                            x: lastRect.right,
                            y: Math.min(lastRect.bottom + 5, window.innerHeight - 250)
                        };
                    }
                }

                if (!pos) {
                    const rect = predictionTargetElement.getBoundingClientRect();
                    pos = {
                        x: rect.left + 10,
                        y: Math.min(rect.top + 30, window.innerHeight - 250)
                    };
                }
            }

            if (pos) {
                pos.x = Math.max(10, Math.min(pos.x, window.innerWidth - 320));
                pos.y = Math.max(10, Math.min(pos.y, window.innerHeight - 100));
            }

            setCursorPosition(pos);
        };

        updateCursorPosition();

        window.addEventListener('scroll', updateCursorPosition, true);
        window.addEventListener('resize', updateCursorPosition);

        return () => {
            window.removeEventListener('scroll', updateCursorPosition, true);
            window.removeEventListener('resize', updateCursorPosition);
        };
    }, [predictionTargetElement]);

    const handleAcceptSuggestion = useCallback(() => {
        if (predictionTargetElement && predictionSuggestion) {
            const suggestionToInsert = predictionSuggestion.trim();

            if (predictionTargetElement instanceof HTMLTextAreaElement || predictionTargetElement instanceof HTMLInputElement) {
                const start = predictionTargetElement.selectionStart;
                const end = predictionTargetElement.selectionEnd;
                const value = predictionTargetElement.value;

                predictionTargetElement.value = value.substring(0, start) + suggestionToInsert + value.substring(end);
                predictionTargetElement.selectionStart = predictionTargetElement.selectionEnd = start + suggestionToInsert.length;
                const event = new Event('input', { bubbles: true });
                predictionTargetElement.dispatchEvent(event);

            } else if (predictionTargetElement.isContentEditable) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(suggestionToInsert));
                    range.setStart(range.endContainer, range.endOffset);
                    range.collapse(true);
                }
            }
            setPredictionSuggestion('');
            setPredictionTargetElement(null);
        }
    }, [predictionSuggestion, predictionTargetElement, setPredictionSuggestion, setPredictionTargetElement]);

    useEffect(() => {
        if (!shouldShow) return;

        const handleOverlayKeyDown = (e) => {
            if (e.key === 'Tab' && predictionSuggestion) {
                e.preventDefault();
                handleAcceptSuggestion();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setPredictionSuggestion('');
                setPredictionTargetElement(null);
            }
        };
        document.addEventListener('keydown', handleOverlayKeyDown);
        return () => document.removeEventListener('keydown', handleOverlayKeyDown);
    }, [shouldShow, handleAcceptSuggestion, predictionSuggestion, setPredictionSuggestion, setPredictionTargetElement]);

    const style = useMemo(() => {
        if (!cursorPosition) return {};
        return {
            position: 'fixed' as const,
            left: cursorPosition.x,
            top: cursorPosition.y,
            zIndex: 99999,
            maxWidth: 400,
            minWidth: 200,
            backgroundColor: '#1e1e2e',
            border: '2px solid #89b4fa',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            padding: '12px',
            color: '#cdd6f4',
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap' as const,
            cursor: 'pointer',
            maxHeight: '200px',
            overflow: 'auto',
        };
    }, [cursorPosition]);

    if (!shouldShow) {
        return null;
    }

    const overlay = (
        <div ref={overlayRef} style={style} onClick={handleAcceptSuggestion}>
            <div style={{ fontFamily: 'monospace', marginBottom: '8px' }}>
                {predictionSuggestion}
            </div>
            {predictionSuggestion === 'Generating...' && (
                 <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#89b4fa' }}></span>
            )}
            <div style={{ fontSize: '0.75rem', color: '#89b4fa', borderTop: '1px solid #45475a', paddingTop: '8px', marginTop: '4px' }}>
                Press <span style={{ fontWeight: 'bold' }}>Tab</span> to accept, <span style={{ fontWeight: 'bold' }}>Esc</span> to dismiss
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
};