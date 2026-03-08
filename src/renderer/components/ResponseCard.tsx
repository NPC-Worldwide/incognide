import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Play, MessageSquare, Bot, Cpu } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface ResponseCardProps {
    message: any;
    isExpanded: boolean;
    isSelected: boolean;
    onToggleExpand: () => void;
    onToggleSelect: () => void;
    onCopy: () => void;
    onContinue: () => void;
    onApplyToCode?: () => void;
    modelName?: string;
    npcName?: string;
}

const ResponseCard: React.FC<ResponseCardProps> = ({
    message,
    isExpanded,
    isSelected,
    onToggleExpand,
    onToggleSelect,
    onCopy,
    onContinue,
    onApplyToCode,
    modelName,
    npcName
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const previewText = useMemo(() => {
        const content = message.content || '';

        const stripped = content
            .replace(/```[\s\S]*?```/g, '[code]')
            .replace(/`[^`]+`/g, '[code]')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/#{1,6}\s+/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
        return stripped.slice(0, 150) + (stripped.length > 150 ? '...' : '');
    }, [message.content]);

    const getBadgeColor = () => {
        if (npcName) return 'bg-purple-500/30 text-purple-300 border-purple-500/50';
        if (modelName?.includes('claude')) return 'bg-orange-500/30 text-orange-300 border-orange-500/50';
        if (modelName?.includes('gpt')) return 'bg-green-500/30 text-green-300 border-green-500/50';
        if (modelName?.includes('gemini')) return 'bg-blue-500/30 text-blue-300 border-blue-500/50';
        return 'bg-gray-500/30 text-gray-300 border-gray-500/50';
    };

    return (
        <div
            className={`
                relative rounded-lg border transition-all duration-200
                ${isExpanded ? 'flex-basis-full' : 'flex-1 min-w-[280px] max-w-[50%]'}
                ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5'}
                hover:border-white/20
            `}
        >
            <div
                className="flex items-center gap-2 p-2 cursor-pointer"
                onClick={onToggleExpand}
            >
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect();
                    }}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                />

                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getBadgeColor()}`}>
                    {npcName ? <Bot size={10} /> : <Cpu size={10} />}
                    <span>{npcName || modelName || 'Unknown'}</span>
                </div>

                <div className="ml-auto flex items-center gap-1 text-gray-400">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {isExpanded ? (
                <div className="px-3 pb-3">
                    <div className="prose prose-invert prose-sm max-w-none overflow-hidden">
                        <MarkdownRenderer content={message.content || ''} />
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-white/10 transition-colors"
                            title="Copy response"
                        >
                            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                            <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                            onClick={onContinue}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-white/10 transition-colors"
                            title="Continue conversation from this response"
                        >
                            <MessageSquare size={12} />
                            <span>Continue</span>
                        </button>
                        {onApplyToCode && (
                            <button
                                onClick={onApplyToCode}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-white/10 transition-colors"
                                title="Apply code changes"
                            >
                                <Play size={12} />
                                <span>Apply</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (

                <div className="px-3 pb-2">
                    <p className="text-xs text-gray-400 line-clamp-2">{previewText}</p>
                </div>
            )}
        </div>
    );
};

export default ResponseCard;
