import React, { useState } from 'react';
import { formatTokens, usageColor } from '../utils/contextUsage';
import type { UsageSource } from '../utils/contextUsage';

interface ContextUsageMeterProps {
    /** Tokens consumed by the most recent prompt (provider-reported when available). */
    used: number | null;
    /** Model context window, or null when the catalog does not know it. */
    limit: number | null;
    /** Where `used` came from, so an estimate is labelled as one. */
    source?: UsageSource;
    /** Optional model label for the tooltip. */
    modelLabel?: string | null;
    className?: string;
    /** Summarise older messages to free context. */
    onCompress?: () => void;
    /** True while a compression request is in flight. */
    compressing?: boolean;
    /** Surfaced in the button tooltip when the last attempt failed. */
    compressError?: string | null;
    /** Custom instructions passed as context to the compression summariser. */
    compressInstructions?: string;
    /** Called when the user saves custom compression instructions. */
    onChangeCompressInstructions?: (value: string) => void;
}

/**
 * A left-to-right context usage bar, colour-coordinated by fill ratio.
 * Renders above the context-files panel in both ChatInput and AgentInput.
 *
 * When `limit` is unknown the bar stays empty (hatched track) and the label
 * reads "window unknown" rather than showing a fabricated percentage.
 */
const ContextUsageMeter: React.FC<ContextUsageMeterProps> = ({
    used,
    limit,
    source = 'reported',
    modelLabel,
    className = '',
    onCompress,
    compressing = false,
    compressError = null,
    compressInstructions = '',
    onChangeCompressInstructions,
}) => {
    const hasLimit = typeof limit === 'number' && limit > 0;
    const hasUsed = typeof used === 'number' && used > 0;

    const ratio = hasLimit && hasUsed ? Math.min(used / limit, 1) : null;
    const pct = ratio === null ? 0 : ratio * 100;
    const color = usageColor(ratio);
    const isEstimate = source === 'estimated';

    const usedLabel = hasUsed ? formatTokens(used) : null;
    const limitLabel = hasLimit ? formatTokens(limit) : null;
    const pctLabel = ratio === null ? null : `${(ratio * 100).toFixed(ratio * 100 < 10 ? 1 : 0)}%`;

    const [editingInstructions, setEditingInstructions] = useState(false);
    const [draftInstructions, setDraftInstructions] = useState(compressInstructions);
    const hasInstructions = compressInstructions.trim().length > 0;

    const tooltipLines = [
        hasUsed
            ? `Used: ${(used as number).toLocaleString()} tokens${isEstimate ? ' (estimated from character count)' : ' (reported by provider)'}`
            : 'No usage recorded for this conversation yet',
        hasLimit
            ? `Window: ${(limit as number).toLocaleString()} tokens`
            : 'Window: unknown for this model — showing tokens used only',
    ];
    if (modelLabel) tooltipLines.push(`Model: ${modelLabel}`);

    const saveInstructions = () => {
        onChangeCompressInstructions?.(draftInstructions.trim());
        setEditingInstructions(false);
    };

    const clearInstructions = () => {
        setDraftInstructions('');
        onChangeCompressInstructions?.('');
    };

    return (
        <div className={`flex flex-col border-b theme-border ${className}`} title={tooltipLines.join('\n')}>
            <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-[9px] font-medium theme-text-muted flex-shrink-0 select-none">
                    Context
                </span>

                <div
                    className="relative flex-1 min-w-0 h-1.5 rounded-full overflow-hidden"
                    style={{
                        background: hasLimit
                            ? 'rgba(255,255,255,0.07)'
                            : 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 4px, rgba(255,255,255,0.10) 4px 8px)',
                    }}
                >
                    {hasLimit && hasUsed && (
                        <div
                            className="h-full rounded-full transition-all duration-300 ease-out"
                            style={{
                                width: `${Math.max(pct, 0.75).toFixed(2)}%`,
                                background: color,
                                opacity: isEstimate ? 0.65 : 1,
                            }}
                        />
                    )}
                </div>

                <span
                    className="text-[9px] tabular-nums flex-shrink-0 whitespace-nowrap"
                    style={{ color: hasLimit ? color : '#6b7280', opacity: isEstimate ? 0.75 : 1 }}
                >
                    {usedLabel === null ? (
                        <span className="theme-text-muted">no usage yet</span>
                    ) : (
                        <>
                            {isEstimate && '≈'}
                            {usedLabel}
                            {limitLabel !== null ? ` / ${limitLabel}` : ' tok'}
                            {pctLabel !== null && ` · ${pctLabel}`}
                            {limitLabel === null && <span className="theme-text-muted"> · window unknown</span>}
                        </>
                    )}
                </span>

                {onChangeCompressInstructions && (
                    <button
                        type="button"
                        onClick={() => {
                            setDraftInstructions(compressInstructions);
                            setEditingInstructions(!editingInstructions);
                        }}
                        className={`relative flex-shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                            hasInstructions
                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/40 hover:bg-blue-500/25'
                                : 'bg-white/5 theme-text-muted border-white/10 hover:text-white hover:bg-white/10'
                        }`}
                        title={hasInstructions ? 'Custom compression instructions set — click to edit' : 'Edit compression instructions'}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {hasInstructions && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        )}
                    </button>
                )}

                {onCompress && (
                    <button
                        type="button"
                        onClick={onCompress}
                        disabled={compressing}
                        className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/5 theme-text-muted border-white/10 hover:text-white hover:bg-white/10"
                        title={compressError || 'Summarise older messages to free up context. Originals stay in the thread; the model sees the summary instead.'}
                    >
                        {compressing ? (
                            <svg className="animate-spin" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <circle cx="12" cy="12" r="9" opacity="0.25" />
                                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
                            </svg>
                        ) : (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                        <span>{compressing ? 'Compressing' : 'Compress'}</span>
                    </button>
                )}
            </div>

            {editingInstructions && (
                <div className="px-2 pb-2">
                    <textarea
                        value={draftInstructions}
                        onChange={(e) => setDraftInstructions(e.target.value)}
                        placeholder="Extra instructions for the compression summary, e.g. preserve all file paths and focus on open tasks."
                        className="w-full theme-input text-xs rounded px-2 py-1 min-h-[60px] resize-y border theme-border focus:outline-none"
                    />
                    <div className="flex items-center justify-end gap-1 mt-1">
                        <button
                            type="button"
                            onClick={() => setEditingInstructions(false)}
                            className="px-2 py-0.5 rounded text-[9px] theme-text-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={clearInstructions}
                            className="px-2 py-0.5 rounded text-[9px] text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={saveInstructions}
                            className="px-2 py-0.5 rounded text-[9px] text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContextUsageMeter;
