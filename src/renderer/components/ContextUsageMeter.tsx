import React from 'react';
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
    /** Restore the full conversation. */
    onUndoCompress?: () => void;
    /** True when an active compression is in effect for this conversation. */
    isCompressed?: boolean;
    /** True while a compression request is in flight. */
    compressing?: boolean;
    /** False disables the compress affordance (e.g. too few messages). */
    canCompress?: boolean;
    /** Surfaced in the button tooltip when the last attempt failed. */
    compressError?: string | null;
    /** How many messages are currently folded into the summary. */
    compressedCount?: number;
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
    onUndoCompress,
    isCompressed = false,
    compressing = false,
    canCompress = true,
    compressError = null,
    compressedCount,
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

    const tooltipLines = [
        hasUsed
            ? `Used: ${(used as number).toLocaleString()} tokens${isEstimate ? ' (estimated from character count)' : ' (reported by provider)'}`
            : 'No usage recorded for this conversation yet',
        hasLimit
            ? `Window: ${(limit as number).toLocaleString()} tokens`
            : 'Window: unknown for this model — showing tokens used only',
    ];
    if (modelLabel) tooltipLines.push(`Model: ${modelLabel}`);

    return (
        <div
            className={`flex items-center gap-2 px-2 py-1 border-b theme-border ${className}`}
            title={tooltipLines.join('\n')}
        >
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

            {(onCompress || onUndoCompress) && (
                <button
                    type="button"
                    onClick={isCompressed ? onUndoCompress : onCompress}
                    disabled={compressing || (!isCompressed && !canCompress)}
                    className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isCompressed
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                            : 'bg-white/5 theme-text-muted border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                    title={
                        compressError
                            ? compressError
                            : isCompressed
                                ? `Context compressed${compressedCount ? ` — ${compressedCount} messages summarised` : ''}. Click to undo and restore the full conversation.`
                                : 'Summarise older messages to free up context. Originals are kept, and this is reversible.'
                    }
                >
                    {compressing ? (
                        <svg className="animate-spin" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <circle cx="12" cy="12" r="9" opacity="0.25" />
                            <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
                        </svg>
                    ) : isCompressed ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                    <span>{compressing ? 'Compressing' : isCompressed ? 'Undo' : 'Compress'}</span>
                </button>
            )}
        </div>
    );
};

export default ContextUsageMeter;
