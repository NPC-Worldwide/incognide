import { useCallback, useEffect, useRef } from 'react';
import { generateId } from './utils';

const PRED_PLACEHOLDER = 'Generating...';

interface UsePredictiveTextProps {
    isPredictiveTextEnabled: boolean;
    predictiveTextModel: string | null;
    predictiveTextProvider: string | null;
    currentPath: string | null;
    predictionSuggestion: string;
    setPredictionSuggestion: (value: string | ((prev: string) => string)) => void;
    predictionTargetElement: HTMLElement | null;
    setPredictionTargetElement: (element: HTMLElement | null) => void;
}

export const usePredictiveText = ({
    isPredictiveTextEnabled,
    predictiveTextModel,
    predictiveTextProvider,
    currentPath,
    predictionSuggestion,
    setPredictionSuggestion,
    predictionTargetElement,
    setPredictionTargetElement,
}: UsePredictiveTextProps) => {
    const predictionStreamIdRef = useRef<string | null>(null);
    const predictionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const streamBuffersRef = useRef(new Map<string, string>());

    const handleGlobalPredictionTrigger = useCallback((e: KeyboardEvent) => {
        if (!isPredictiveTextEnabled || !predictiveTextModel || !predictiveTextProvider) {
            setPredictionSuggestion('');
            setPredictionTargetElement(null);
            return;
        }

        if (e.key === 'Tab') {
            if (predictionSuggestion && predictionTargetElement) {
                e.preventDefault();

                const suggestion = predictionSuggestion.replace(/^Generating\.\.\.\s*/, '');
                if (!suggestion) return;

                const el = predictionTargetElement;
                if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                    const start = el.selectionStart ?? 0;
                    const end = el.selectionEnd ?? start;
                    const before = el.value.slice(0, start);
                    const after = el.value.slice(end);
                    el.value = before + suggestion + after;

                    const newPos = before.length + suggestion.length;
                    el.selectionStart = newPos;
                    el.selectionEnd = newPos;

                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (el && (el as any).isContentEditable) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(document.createTextNode(suggestion));
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }

                setPredictionSuggestion('');
                setPredictionTargetElement(null);
                if (predictionStreamIdRef.current) {
                    (window as any).api?.interruptStream?.(predictionStreamIdRef.current);
                    predictionStreamIdRef.current = null;
                }
            }
            return;
        }

        if (e.key === 'Escape') {
            setPredictionSuggestion('');
            setPredictionTargetElement(null);
            if (predictionStreamIdRef.current) {
                (window as any).api?.interruptStream?.(predictionStreamIdRef.current);
                predictionStreamIdRef.current = null;
            }
            return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const activeElement = document.activeElement as HTMLElement | null;
        const isEditable = activeElement &&
            (activeElement instanceof HTMLTextAreaElement ||
             activeElement instanceof HTMLInputElement ||
             (activeElement as any).isContentEditable);

        if (!isEditable) {
            setPredictionSuggestion('');
            setPredictionTargetElement(null);
            return;
        }

        const textContent = (activeElement as any).value || activeElement?.textContent || '';
        let cursorPosition = 0;

        if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
            cursorPosition = activeElement.selectionStart ?? textContent.length;
        } else if ((activeElement as any).isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const pre = range.cloneRange();
                pre.selectNodeContents(activeElement!);
                pre.setEnd(range.endContainer, range.endOffset);
                cursorPosition = pre.toString().length;
            }
        }

        if (textContent.length === 0) {
            setPredictionSuggestion('');
            setPredictionTargetElement(null);
            return;
        }

        if (predictionStreamIdRef.current) {
            (window as any).api?.interruptStream?.(predictionStreamIdRef.current);
            predictionStreamIdRef.current = null;
        }

        setPredictionTargetElement(activeElement);
        setPredictionSuggestion(PRED_PLACEHOLDER);

        const newStreamId = generateId();
        predictionStreamIdRef.current = newStreamId;
        console.log('[PRED] Created new prediction request, streamId:', newStreamId);

        let contextType = 'general';
        let filePathForContext: string | null = null;
        if ((activeElement as any).dataset?.contextType) {
            contextType = (activeElement as any).dataset.contextType;
            filePathForContext = (activeElement as any).dataset.filePath ?? null;
        } else if (activeElement?.classList?.contains('chat-input-textarea')) {
            contextType = 'chat';
        } else if (activeElement?.classList?.contains('browser-url-input')) {
            contextType = 'browser';
        }

        if (predictionTimeoutRef.current) {
            clearTimeout(predictionTimeoutRef.current);
            predictionTimeoutRef.current = null;
        }

        predictionTimeoutRef.current = setTimeout(async () => {
            await (window as any).api?.textPredict?.({
                streamId: newStreamId,
                text_content: textContent,
                cursor_position: cursorPosition,
                currentPath,
                model: predictiveTextModel,
                provider: predictiveTextProvider,
                context_type: contextType,
                file_path: filePathForContext,
            });
        }, 250);
    }, [
        isPredictiveTextEnabled,
        predictiveTextModel,
        predictiveTextProvider,
        currentPath,
        setPredictionSuggestion,
        setPredictionTargetElement,
        predictionSuggestion,
        predictionTargetElement
    ]);

    const setPredictionSuggestionRef = useRef(setPredictionSuggestion);
    setPredictionSuggestionRef.current = setPredictionSuggestion;

    useEffect(() => {
        console.log('[PRED] Setting up stream listeners (one-time)');

        const handleStreamData = (_: any, { streamId: sid, chunk }: { streamId: string; chunk: any }) => {
            const expectedId = predictionStreamIdRef.current;
            console.log('[PRED] handleStreamData called, sid:', sid, 'expected:', expectedId, 'chunk type:', typeof chunk);
            if (!sid) {
                console.log('[PRED] No sid, returning');
                return;
            }
            if (expectedId !== sid) {
                console.log('[PRED] Stream ID mismatch, ignoring. Expected:', expectedId, 'Got:', sid);
                return;
            }

            let piece = '';
            try {
                piece = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
            } catch { return; }
            console.log('[PRED] Raw piece:', piece.substring(0, 200));
            if (!piece) return;

            const prev = streamBuffersRef.current.get(sid) || '';
            let buf = (prev + piece).replace(/\r\n/g, '\n');
            console.log('[PRED] Buffer after append:', buf.substring(0, 200));

            while (true) {
                const sep = buf.indexOf('\n\n');
                if (sep === -1) break;

                const frame = buf.slice(0, sep);
                buf = buf.slice(sep + 2);
                console.log('[PRED] Processing frame:', frame.substring(0, 100));

                const dataLines = frame
                    .split('\n')
                    .filter((l: string) => l.startsWith('data:'))
                    .map((l: string) => l.slice(5).trim());

                console.log('[PRED] Data lines:', dataLines);
                if (dataLines.length === 0) continue;

                const payload = dataLines.join('\n');
                if (payload === '[DONE]') {
                    console.log('[PRED] Got [DONE]');
                    continue;
                }

                let text = '';
                try {
                    const parsed = JSON.parse(payload);
                    console.log('[PRED] Parsed payload:', parsed);
                    text = parsed?.choices?.[0]?.delta?.content || '';
                } catch (e) {
                    console.log('[PRED] JSON parse failed for payload:', payload, 'error:', e);
                    continue;
                }
                if (!text) {
                    console.log('[PRED] No text extracted from parsed payload');
                    continue;
                }

                console.log('[PRED] Setting suggestion with text:', text);
                setPredictionSuggestionRef.current((prev: string) =>
                    prev === PRED_PLACEHOLDER ? text : prev + text
                );
            }

            streamBuffersRef.current.set(sid, buf);
        };

        const handleStreamComplete = (_: any, { streamId }: { streamId: string }) => {
            console.log('[PRED] Stream complete:', streamId);
            if (predictionStreamIdRef.current === streamId) {
                predictionStreamIdRef.current = null;
            }
            streamBuffersRef.current.delete(streamId);
        };

        const handleStreamError = (_: any, { streamId, error }: { streamId: string; error: any }) => {
            console.error('[PRED] Stream error:', streamId, error);
            if (predictionStreamIdRef.current === streamId) {
                setPredictionSuggestionRef.current('');
                predictionStreamIdRef.current = null;
            }
            streamBuffersRef.current.delete(streamId);
        };

        const offData = (window as any).api?.onStreamData?.(handleStreamData);
        const offComplete = (window as any).api?.onStreamComplete?.(handleStreamComplete);
        const offError = (window as any).api?.onStreamError?.(handleStreamError);

        console.log('[PRED] Listeners registered, offData:', !!offData, 'offComplete:', !!offComplete, 'offError:', !!offError);

        return () => {
            console.log('[PRED] Cleaning up stream listeners');
            offData?.();
            offComplete?.();
            offError?.();
        };

    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleGlobalPredictionTrigger, true);
        return () => {
            window.removeEventListener('keydown', handleGlobalPredictionTrigger, true);
            if (predictionTimeoutRef.current) {
                clearTimeout(predictionTimeoutRef.current);
            }
        };
    }, [handleGlobalPredictionTrigger]);
};

export default usePredictiveText;
