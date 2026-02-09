import { getFileName } from './utils';
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Download, Maximize2, RefreshCw } from 'lucide-react';

interface PicViewerProps {
    nodeId: string;
    contentDataRef: React.MutableRefObject<any>;
}

const PicViewer: React.FC<PicViewerProps> = ({ nodeId, contentDataRef }) => {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imageLoaded, setImageLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    const imageSrc = filePath ? `file://${filePath}` : null;

    const handleZoomIn = useCallback(() => {
        setScale(prev => Math.min(prev * 1.25, 10));
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale(prev => Math.max(prev / 1.25, 0.1));
    }, []);

    const handleRotate = useCallback(() => {
        setRotation(prev => (prev + 90) % 360);
    }, []);

    const handleReset = useCallback(() => {
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setScale(prev => Math.min(Math.max(prev * delta, 0.1), 10));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }, [position]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDownload = useCallback(async () => {
        if (!filePath) return;
        try {
            const link = document.createElement('a');
            link.href = `file://${filePath}`;
            link.download = getFileName(filePath) || 'image';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Error downloading image:', err);
        }
    }, [filePath]);

    const handleFitToScreen = useCallback(() => {
        if (!containerRef.current || !imageRef.current) return;

        const container = containerRef.current;
        const img = imageRef.current;

        const containerWidth = container.clientWidth - 40;
        const containerHeight = container.clientHeight - 40;

        const scaleX = containerWidth / img.naturalWidth;
        const scaleY = containerHeight / img.naturalHeight;

        setScale(Math.min(scaleX, scaleY, 1));
        setPosition({ x: 0, y: 0 });
    }, []);

    // Auto-fit to width when image loads
    const handleImageLoad = useCallback(() => {
        setImageLoaded(true);
        // Auto-fit to pane width
        if (containerRef.current && imageRef.current) {
            const containerWidth = containerRef.current.clientWidth - 40;
            const imgWidth = imageRef.current.naturalWidth;
            const fitScale = containerWidth / imgWidth;
            // Don't scale up small images, only scale down large ones
            setScale(Math.min(fitScale, 1));
            setPosition({ x: 0, y: 0 });
        }
    }, []);

    useEffect(() => {
        setImageLoaded(false);
        setError(null);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    }, [filePath]);

    if (!imageSrc) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted">
                <div className="text-center">
                    <div className="text-lg mb-2">No Image</div>
                    <div className="text-sm">Select an image file to view</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden theme-bg-primary">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 theme-bg-secondary border-b theme-border">
                <button
                    onClick={handleZoomOut}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Zoom Out"
                >
                    <ZoomOut size={18} />
                </button>
                <span className="text-sm min-w-[60px] text-center">
                    {Math.round(scale * 100)}%
                </span>
                <button
                    onClick={handleZoomIn}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Zoom In"
                >
                    <ZoomIn size={18} />
                </button>
                <div className="w-px h-5 bg-gray-600 mx-1" />
                <button
                    onClick={handleRotate}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Rotate 90°"
                >
                    <RotateCw size={18} />
                </button>
                <button
                    onClick={handleFitToScreen}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Fit to Screen"
                >
                    <Maximize2 size={18} />
                </button>
                <button
                    onClick={handleReset}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Reset View"
                >
                    <RefreshCw size={18} />
                </button>
                <div className="flex-1" />
                <button
                    onClick={handleDownload}
                    className="p-1.5 rounded theme-hover transition-colors"
                    title="Download"
                >
                    <Download size={18} />
                </button>
            </div>

            {/* Image Container */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ backgroundColor: '#1a1a1a' }}
            >
                {error ? (
                    <div className="text-center theme-text-muted">
                        <div className="text-lg mb-2">Failed to load image</div>
                        <div className="text-sm text-red-400">{error}</div>
                    </div>
                ) : (
                    <img
                        ref={imageRef}
                        src={imageSrc}
                        alt={getFileName(filePath) || 'Image'}
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                            maxWidth: 'none',
                            maxHeight: 'none',
                            userSelect: 'none',
                            pointerEvents: 'none'
                        }}
                        onLoad={handleImageLoad}
                        onError={() => setError('Could not load image file')}
                        draggable={false}
                    />
                )}
                {!imageLoaded && !error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                    </div>
                )}
            </div>

            {/* Status Bar */}
            <div className="px-3 py-1 text-xs theme-bg-secondary border-t theme-border theme-text-muted flex items-center gap-4">
                <span>{getFileName(filePath)}</span>
                {imageLoaded && imageRef.current && (
                    <>
                        <span>{imageRef.current.naturalWidth} x {imageRef.current.naturalHeight}</span>
                    </>
                )}
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(PicViewer, arePropsEqual);
