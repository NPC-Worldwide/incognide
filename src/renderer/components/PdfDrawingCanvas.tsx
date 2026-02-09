import React, { useRef, useState, useCallback, useEffect } from 'react';

interface PdfDrawingCanvasProps {
    pageElement: HTMLElement;
    pageIndex: number;
    isActive: boolean;
    tool: 'pen' | 'eraser' | null;
    strokeColor: string;
    strokeWidth: number;
    onPathComplete: (pageIndex: number, svgPath: string) => void;
    onErase: (pageIndex: number, x: number, y: number) => void;
}

const PdfDrawingCanvas: React.FC<PdfDrawingCanvasProps> = ({
    pageElement,
    pageIndex,
    isActive,
    tool,
    strokeColor,
    strokeWidth,
    onPathComplete,
    onErase,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const pointsRef = useRef<{ x: number; y: number }[]>([]);
    // Keep callback refs to avoid stale closures
    const onPathCompleteRef = useRef(onPathComplete);
    const onEraseRef = useRef(onErase);
    onPathCompleteRef.current = onPathComplete;
    onEraseRef.current = onErase;

    // Create/update canvas on the page element
    useEffect(() => {
        if (!pageElement) return;

        let canvas = pageElement.querySelector('.pdf-drawing-canvas') as HTMLCanvasElement;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'pdf-drawing-canvas';
            canvas.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 7;
                pointer-events: none;
            `;
            pageElement.appendChild(canvas);
        }

        // Match canvas resolution to element size
        const rect = pageElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        if (isActive && tool) {
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = tool === 'pen' ? 'crosshair' : 'cell';
        } else {
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        }

        canvasRef.current = canvas;

        return () => {
            // Don't remove canvas - it may have drawings
        };
    }, [pageElement, isActive, tool]);

    // Mouse handlers - NO isDrawing in deps to avoid re-attach on every stroke
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isActive || !tool) return;

        const getPos = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100,
            };
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            if (tool === 'eraser') {
                const pos = getPos(e);
                onEraseRef.current(pageIndex, pos.x, pos.y);
                return;
            }

            isDrawingRef.current = true;
            pointsRef.current = [getPos(e)];

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const pos = getPos(e);
                ctx.moveTo((pos.x / 100) * canvas.width, (pos.y / 100) * canvas.height);
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDrawingRef.current) return;
            e.preventDefault();
            e.stopPropagation();

            const pos = getPos(e);
            pointsRef.current.push(pos);

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineTo((pos.x / 100) * canvas.width, (pos.y / 100) * canvas.height);
                ctx.stroke();
            }
        };

        const handleMouseUp = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;

            const points = pointsRef.current;
            if (points.length < 2) {
                pointsRef.current = [];
                return;
            }

            // Convert to SVG path
            let svgPath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
            for (let i = 1; i < points.length; i++) {
                svgPath += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
            }

            // Clear the live canvas (SVG overlay will show the saved path)
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

            onPathCompleteRef.current(pageIndex, svgPath);
            pointsRef.current = [];
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [canvasRef.current, isActive, tool, strokeColor, strokeWidth, pageIndex]);

    return null; // Renders via DOM manipulation
};

export default PdfDrawingCanvas;
