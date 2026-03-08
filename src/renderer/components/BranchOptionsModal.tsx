import React, { useState, useEffect } from 'react';
import { X, Send, Radio, Layers, Sparkles, ChevronRight, Check } from 'lucide-react';

interface BranchOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (options: BranchOptions) => void;
    messageContent: string;
    currentModel: string;
    availableModels: any[];
    availableJinxes?: string[];
}

export interface BranchOptions {
    mode: 'same' | 'different' | 'broadcast' | 'jinx';
    models: string[];
    jinxName?: string;
    jinxParams?: Record<string, any>;
}

export const BranchOptionsModal: React.FC<BranchOptionsModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    messageContent,
    currentModel,
    availableModels,
    availableJinxes = []
}) => {
    const [mode, setMode] = useState<'same' | 'different' | 'broadcast' | 'jinx'>('same');
    const [selectedModel, setSelectedModel] = useState(currentModel);
    const [selectedModels, setSelectedModels] = useState<string[]>([currentModel]);
    const [selectedJinx, setSelectedJinx] = useState('');

    useEffect(() => {
        if (isOpen) {
            setMode('same');
            setSelectedModel(currentModel);
            setSelectedModels([currentModel]);
        }
    }, [isOpen, currentModel]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm({
            mode,
            models: mode === 'broadcast' ? selectedModels : [selectedModel],
            jinxName: mode === 'jinx' ? selectedJinx : undefined
        });
    };

    const toggleModelForBroadcast = (model: string) => {
        setSelectedModels(prev =>
            prev.includes(model)
                ? prev.filter(m => m !== model)
                : [...prev, model]
        );
    };

    const modelsByProvider = availableModels.reduce((acc: Record<string, any[]>, model: any) => {
        const provider = model.provider || 'Other';
        if (!acc[provider]) acc[provider] = [];
        acc[provider].push(model);
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
            <div
                className="theme-bg-primary border theme-border rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b theme-border">
                    <h2 className="text-lg font-semibold">Create Branch</h2>
                    <button onClick={onClose} className="p-1 theme-hover rounded">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-4 py-3 border-b theme-border bg-black/20">
                    <div className="text-xs text-gray-400 mb-1">Branching from message:</div>
                    <div className="text-sm line-clamp-2 text-gray-300">
                        {messageContent.slice(0, 150)}{messageContent.length > 150 ? '...' : ''}
                    </div>
                </div>

                <div className="p-4 space-y-3">
                    <button
                        onClick={() => setMode('same')}
                        className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                            mode === 'same'
                                ? 'border-purple-500 bg-purple-500/20'
                                : 'theme-border theme-hover'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            mode === 'same' ? 'bg-purple-500' : 'theme-bg-tertiary'
                        }`}>
                            <Send size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium">Resend to Same Model</div>
                            <div className="text-xs text-gray-400">{currentModel}</div>
                        </div>
                        {mode === 'same' && <Check size={18} className="text-purple-400" />}
                    </button>

                    <button
                        onClick={() => setMode('different')}
                        className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                            mode === 'different'
                                ? 'border-blue-500 bg-blue-500/20'
                                : 'theme-border theme-hover'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            mode === 'different' ? 'bg-blue-500' : 'theme-bg-tertiary'
                        }`}>
                            <Radio size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium">Send to Different Model</div>
                            <div className="text-xs text-gray-400">Choose a different model for this branch</div>
                        </div>
                        {mode === 'different' && <Check size={18} className="text-blue-400" />}
                    </button>

                    {mode === 'different' && (
                        <div className="ml-11 p-3 theme-bg-secondary rounded-lg">
                            <select
                                value={selectedModel}
                                onChange={e => setSelectedModel(e.target.value)}
                                className="w-full p-2 rounded theme-bg-tertiary border theme-border text-sm"
                            >
                                {availableModels.map((model: any) => (
                                    <option key={model.value} value={model.value}>
                                        {model.label || model.value}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        onClick={() => setMode('broadcast')}
                        className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                            mode === 'broadcast'
                                ? 'border-green-500 bg-green-500/20'
                                : 'theme-border theme-hover'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            mode === 'broadcast' ? 'bg-green-500' : 'theme-bg-tertiary'
                        }`}>
                            <Layers size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium">Broadcast to Multiple Models</div>
                            <div className="text-xs text-gray-400">Run in parallel across multiple models</div>
                        </div>
                        {mode === 'broadcast' && <Check size={18} className="text-green-400" />}
                    </button>

                    {mode === 'broadcast' && (
                        <div className="ml-11 p-3 theme-bg-secondary rounded-lg max-h-48 overflow-y-auto space-y-2">
                            {Object.entries(modelsByProvider).map(([provider, models]) => (
                                <div key={provider}>
                                    <div className="text-xs text-gray-400 mb-1 font-medium">{provider}</div>
                                    <div className="space-y-1">
                                        {(models as any[]).map((model: any) => (
                                            <label
                                                key={model.value}
                                                className="flex items-center gap-2 p-1.5 rounded theme-hover cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedModels.includes(model.value)}
                                                    onChange={() => toggleModelForBroadcast(model.value)}
                                                    className="rounded"
                                                />
                                                <span className="text-sm">{model.label || model.value}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div className="text-xs text-gray-500 pt-2 border-t theme-border">
                                {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => setMode('jinx')}
                        className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                            mode === 'jinx'
                                ? 'border-orange-500 bg-orange-500/20'
                                : 'theme-border theme-hover'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            mode === 'jinx' ? 'bg-orange-500' : 'theme-bg-tertiary'
                        }`}>
                            <Sparkles size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium">Apply Jinx</div>
                            <div className="text-xs text-gray-400">Use a structured routine with parallelization</div>
                        </div>
                        {mode === 'jinx' && <Check size={18} className="text-orange-400" />}
                    </button>

                    {mode === 'jinx' && (
                        <div className="ml-11 p-3 theme-bg-secondary rounded-lg">
                            {availableJinxes.length > 0 ? (
                                <select
                                    value={selectedJinx}
                                    onChange={e => setSelectedJinx(e.target.value)}
                                    className="w-full p-2 rounded theme-bg-tertiary border theme-border text-sm"
                                >
                                    <option value="">Select a jinx...</option>
                                    {availableJinxes.map(jinx => (
                                        <option key={jinx} value={jinx}>{jinx}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-sm text-gray-400">
                                    No jinxes available. Create jinxes in your npc_team directory.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 p-4 border-t theme-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg theme-hover border theme-border"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={mode === 'jinx' && !selectedJinx}
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        Create Branch
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BranchOptionsModal;
