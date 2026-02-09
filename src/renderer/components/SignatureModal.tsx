import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Pen, Type, Trash2 } from 'lucide-react';

interface SignatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (svgPath: string, type: 'drawn' | 'typed') => void;
}

const SIGNATURE_FONTS = [
    { name: 'Dancing Script', family: "'Dancing Script', cursive" },
    { name: 'Great Vibes', family: "'Great Vibes', cursive" },
    { name: 'Pacifico', family: "'Pacifico', cursive" },
    { name: 'Caveat', family: "'Caveat', cursive" },
    { name: 'Satisfy', family: "'Satisfy', cursive" },
];

const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<'draw' | 'type'>('draw');
    const [isDrawing, setIsDrawing] = useState(false);
    const [typedName, setTypedName] = useState('');
    const [selectedFont, setSelectedFont] = useState(0);
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [hasDrawing, setHasDrawing] = useState(false);
    const pointsRef = useRef<{ x: number; y: number }[]>([]);
    const allPathsRef = useRef<{ x: number; y: number }[][]>([]);

    useEffect(() => {
        if (!isOpen) return;
        // Load Google Fonts for signatures
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pacifico&family=Caveat&family=Satisfy&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, [isOpen]);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        allPathsRef.current = [];
        setHasDrawing(false);
    }, []);

    useEffect(() => {
        if (!isOpen || mode !== 'draw') return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = 500;
        canvas.height = 200;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw guide line
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(20, 150);
        ctx.lineTo(480, 150);
        ctx.stroke();
        ctx.setLineDash([]);

        const getPos = (e: MouseEvent) => ({
            x: e.offsetX,
            y: e.offsetY,
        });

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            setIsDrawing(true);
            pointsRef.current = [getPos(e)];
            ctx.beginPath();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const pos = getPos(e);
            ctx.moveTo(pos.x, pos.y);
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDrawing) return;
            const pos = getPos(e);
            pointsRef.current.push(pos);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        const handleMouseUp = () => {
            if (!isDrawing) return;
            setIsDrawing(false);
            if (pointsRef.current.length > 1) {
                allPathsRef.current.push([...pointsRef.current]);
                setHasDrawing(true);
            }
            pointsRef.current = [];
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [isOpen, mode, isDrawing, strokeColor]);

    const handleSaveDrawn = useCallback(() => {
        if (allPathsRef.current.length === 0) return;

        // Convert all paths to SVG, normalized to 0-100% of canvas
        const canvas = canvasRef.current;
        if (!canvas) return;

        let svgPath = '';
        for (const path of allPathsRef.current) {
            if (path.length < 2) continue;
            svgPath += `M ${((path[0].x / canvas.width) * 100).toFixed(2)} ${((path[0].y / canvas.height) * 100).toFixed(2)} `;
            for (let i = 1; i < path.length; i++) {
                svgPath += `L ${((path[i].x / canvas.width) * 100).toFixed(2)} ${((path[i].y / canvas.height) * 100).toFixed(2)} `;
            }
        }

        onSave(svgPath.trim(), 'drawn');
    }, [onSave]);

    const handleSaveTyped = useCallback(() => {
        if (!typedName.trim()) return;
        // For typed signatures, we store as a special format the renderer will handle
        const fontFamily = SIGNATURE_FONTS[selectedFont].family;
        onSave(`TEXT:${fontFamily}:${typedName}`, 'typed');
    }, [typedName, selectedFont, onSave]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="relative z-[61] theme-bg-secondary rounded-lg shadow-2xl border theme-border" style={{ width: '560px' }}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b theme-border">
                    <h2 className="text-sm font-semibold">Create Signature</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                        <X size={16} />
                    </button>
                </div>

                {/* Mode tabs */}
                <div className="flex border-b theme-border">
                    <button
                        onClick={() => setMode('draw')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium ${
                            mode === 'draw' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Pen size={14} /> Draw
                    </button>
                    <button
                        onClick={() => setMode('type')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium ${
                            mode === 'type' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Type size={14} /> Type
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {mode === 'draw' ? (
                        <>
                            <div className="flex items-center gap-3 mb-3">
                                <label className="text-xs text-gray-400">Color:</label>
                                <input
                                    type="color"
                                    value={strokeColor}
                                    onChange={(e) => setStrokeColor(e.target.value)}
                                    className="w-6 h-6 cursor-pointer rounded"
                                />
                                <button
                                    onClick={clearCanvas}
                                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                                >
                                    <Trash2 size={12} /> Clear
                                </button>
                            </div>
                            <canvas
                                ref={canvasRef}
                                className="w-full rounded border theme-border cursor-crosshair"
                                style={{ height: '200px', background: '#fff' }}
                            />
                            <p className="text-[10px] text-gray-500 mt-2 text-center">Draw your signature above the line</p>
                        </>
                    ) : (
                        <>
                            <input
                                type="text"
                                value={typedName}
                                onChange={(e) => setTypedName(e.target.value)}
                                placeholder="Type your name..."
                                className="w-full p-3 text-lg rounded bg-gray-800 border theme-border mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                            />
                            <div className="space-y-2">
                                {SIGNATURE_FONTS.map((font, idx) => (
                                    <button
                                        key={font.name}
                                        onClick={() => setSelectedFont(idx)}
                                        className={`w-full p-3 rounded border text-left transition-colors ${
                                            selectedFont === idx
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : 'theme-border hover:bg-gray-700'
                                        }`}
                                    >
                                        <span
                                            style={{ fontFamily: font.family, fontSize: '24px', color: '#000' }}
                                            className="bg-white px-3 py-1 rounded inline-block"
                                        >
                                            {typedName || 'Your Name'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t theme-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={mode === 'draw' ? handleSaveDrawn : handleSaveTyped}
                        disabled={mode === 'draw' ? !hasDrawing : !typedName.trim()}
                        className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                        Save Signature
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignatureModal;
