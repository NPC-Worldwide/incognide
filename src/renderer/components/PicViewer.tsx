import { getFileName } from './utils';
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';

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
        setScale(prev => Math.min(prev * 1.1, 10));
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale(prev => Math.max(prev / 1.1, 0.1));
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
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
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

    const handleImageLoad = useCallback(() => {
        setImageLoaded(true);
        if (containerRef.current && imageRef.current) {
            const containerWidth = containerRef.current.clientWidth - 40;
            const imgWidth = imageRef.current.naturalWidth;
            const fitScale = containerWidth / imgWidth;
            setScale(Math.min(fitScale, 1));
            setPosition({ x: 0, y: 0 });
        }
    }, []);

    useEffect(() => {
        if (paneData) {
            paneData.zoomIn = handleZoomIn;
            paneData.zoomOut = handleZoomOut;
            paneData.rotate = handleRotate;
            paneData.fitToScreen = handleFitToScreen;
            paneData.resetView = handleReset;
            paneData.download = handleDownload;
            paneData.scale = scale;
        }
    }, [paneData, handleZoomIn, handleZoomOut, handleRotate, handleFitToScreen, handleReset, handleDownload, scale]);

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

            <div className="px-3 py-1 text-xs theme-bg-secondary border-t theme-border theme-text-muted flex items-center gap-4">
                <span>{getFileName(filePath)}</span>
                {imageLoaded && imageRef.current && (
                    <span>{imageRef.current.naturalWidth} x {imageRef.current.naturalHeight}</span>
                )}
                <span>{Math.round(scale * 100)}%</span>
            </div>
        </div>
    );
};

const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(PicViewer, arePropsEqual);
