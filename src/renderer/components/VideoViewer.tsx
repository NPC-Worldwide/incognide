import { getFileName } from './utils';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Download } from 'lucide-react';

interface VideoViewerProps {
    nodeId: string;
    contentDataRef: React.MutableRefObject<any>;
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', 'flv', 'ogv'];

const VideoViewer: React.FC<VideoViewerProps> = ({ nodeId, contentDataRef }) => {
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const videoSrc = filePath ? `file://${filePath}` : null;
    const fileName = getFileName(filePath) || 'Video';

    const handlePlayPause = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }, []);

    const handleMuteToggle = useCallback(() => {
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    }, []);

    const handleFullscreen = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.requestFullscreen) {
            videoRef.current.requestFullscreen().catch(() => {});
        }
    }, []);

    const handleDownload = useCallback(async () => {
        if (!filePath) return;
        try {
            const link = document.createElement('a');
            link.href = `file://${filePath}`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Error downloading video:', err);
        }
    }, [filePath, fileName]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
        };
    }, []);

    if (!filePath) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted">
                No video file selected.
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden theme-bg-primary">
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
                {error ? (
                    <div className="text-center">
                        <p className="text-red-400 mb-2">Failed to load video</p>
                        <p className="theme-text-muted text-sm">{error}</p>
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        controls
                        className="max-w-full max-h-full shadow-lg"
                        onError={() => setError(`Unable to play ${fileName}`)}
                        style={{ outline: 'none' }}
                    />
                )}
            </div>
            <div className="flex items-center justify-between px-4 py-2 theme-bg-secondary border-t theme-border">
                <span className="text-sm theme-text-primary truncate max-w-[50%]" title={fileName}>{fileName}</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePlayPause}
                        className="p-1.5 rounded theme-button theme-hover"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                        onClick={handleMuteToggle}
                        className="p-1.5 rounded theme-button theme-hover"
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <button
                        onClick={handleFullscreen}
                        className="p-1.5 rounded theme-button theme-hover"
                        title="Fullscreen"
                    >
                        <Maximize size={16} />
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-1.5 rounded theme-button theme-hover"
                        title="Download"
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoViewer;
export { VIDEO_EXTENSIONS };
