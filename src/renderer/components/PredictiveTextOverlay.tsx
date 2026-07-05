import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export const PredictiveTextOverlay = ({
    predictionSuggestion,
    predictionTarget,
    isPredictiveTextEnabled,
    onAcceptSuggestion,
    onDismissSuggestion,
}) => {
    const overlayRef = useRef(null);
    const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
    const shouldShow = predictionSuggestion && predictionTarget && isPredictiveTextEnabled && cursorPosition;

    useEffect(() => {
        if (!predictionTarget) {
            setCursorPosition(null);
            return;
        }

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

        const updateCursorPosition = () => {
            let pos: { x: number; y: number } | null = null;

            if (predictionTarget.kind === 'webview') {
                const { webviewElement, caretRect } = predictionTarget;
                const webviewRect = webviewElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
                pos = {
                    x: webviewRect.left + (caretRect?.right ?? 0),
                    y: Math.min(
                        webviewRect.top + (caretRect?.bottom ?? 0) + 5,
                        window.innerHeight - 250
                    ),
                };
            } else if (predictionTarget.kind === 'dom') {
                const element = predictionTarget.element;
                if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
                    const rect = element.getBoundingClientRect();
                    pos = {
                        x: rect.left + 10,
                        y: Math.min(rect.bottom, window.innerHeight - 250),
                    };
                } else if (element.isContentEditable) {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const rects = range.getClientRects();
                        if (rects.length > 0) {
                            const lastRect = rects[rects.length - 1];
                            pos = {
                                x: lastRect.right,
                                y: Math.min(lastRect.bottom + 5, window.innerHeight - 250),
                            };
                        }
                    }

                    if (!pos) {
                        const rect = element.getBoundingClientRect();
                        pos = {
                            x: rect.left + 10,
                            y: Math.min(rect.top + 30, window.innerHeight - 250),
                        };
                    }
                }
            }

            if (pos) {
                pos.x = clamp(pos.x, 10, window.innerWidth - 320);
                pos.y = clamp(pos.y, 10, window.innerHeight - 100);
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
    }, [predictionTarget]);

    const handleAcceptSuggestion = useCallback(() => {
        try { (window as any).api?.logAutocomplete?.({ type: 'text', inputContext: '', suggestion: predictionSuggestion, accepted: true }); } catch {}
        onAcceptSuggestion?.();
    }, [predictionSuggestion, onAcceptSuggestion]);

    const handleDismissSuggestion = useCallback(() => {
        try { (window as any).api?.logAutocomplete?.({ type: 'text', inputContext: '', suggestion: predictionSuggestion, accepted: false }); } catch {}
        onDismissSuggestion?.();
    }, [predictionSuggestion, onDismissSuggestion]);

    useEffect(() => {
        if (!shouldShow) return;

        const handleOverlayKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab' && predictionSuggestion) {
                e.preventDefault();
                handleAcceptSuggestion();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleDismissSuggestion();
            }
        };

        document.addEventListener('keydown', handleOverlayKeyDown);
        return () => document.removeEventListener('keydown', handleOverlayKeyDown);
    }, [shouldShow, handleAcceptSuggestion, handleDismissSuggestion, predictionSuggestion]);

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
