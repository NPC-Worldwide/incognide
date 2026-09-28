/**
 * Context-usage helpers for the chat/agent input meters.
 *
 * The numerator is a real, provider-reported number: the `input_tokens` of the
 * most recent assistant message is the exact size of the prompt that was just
 * sent (system prompt + context files + history). We prefer that over any
 * tokenizer estimate.
 *
 * The denominator comes from the model catalog (`context_window`), which is
 * populated server-side by npcpy's `get_model_context_window`. When the window
 * is unknown we return null and the caller degrades to reporting tokens-used
 * only, rather than inventing a ratio.
 */

export type UsageSource = 'reported' | 'estimated' | 'none';

export interface ContextUsage {
    used: number | null;
    source: UsageSource;
}

/**
 * Find the context window for a model value across one or more model lists.
 * Accepts any of the field names the various model sources use.
 */
export function findContextWindow(modelValue: string | null | undefined, ...modelLists: any[]): number | null {
    if (!modelValue) return null;
    for (const list of modelLists) {
        if (!Array.isArray(list)) continue;
        const match = list.find((m: any) => m && m.value === modelValue);
        if (!match) continue;
        const ctx = match.context_window ?? match.context_length ?? match.max_input_tokens;
        if (typeof ctx === 'number' && ctx > 0) return ctx;
    }
    return null;
}

/**
 * Walk backwards for the most recent provider-reported input token count.
 * Later messages may lack usage data (e.g. a queued/branching user turn), so
 * we take the newest one that has it.
 */
export function lastReportedInputTokens(messages: any[] | null | undefined): number | null {
    if (!Array.isArray(messages)) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg) continue;
        const v = msg.input_tokens;
        if (typeof v === 'number' && v > 0) return v;
    }
    return null;
}

/**
 * Rough chars/4 estimate, used only when a provider reports no usage at all.
 * Deliberately conservative: it will under-report rather than over-report.
 */
export function estimateTokens(messages: any[] | null | undefined): number | null {
    if (!Array.isArray(messages)) return null;
    let chars = 0;
    for (const msg of messages) {
        if (!msg) continue;
        const content = msg.content;
        if (typeof content === 'string') {
            chars += content.length;
        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (typeof part === 'string') chars += part.length;
                else if (part && typeof part.text === 'string') chars += part.text.length;
            }
        }
    }
    if (chars === 0) return null;
    return Math.round(chars / 4);
}

/** Resolve usage for a pane's message list, preferring reported over estimated. */
export function computeContextUsage(messages: any[] | null | undefined): ContextUsage {
    const reported = lastReportedInputTokens(messages);
    if (reported !== null) return { used: reported, source: 'reported' };
    const estimated = estimateTokens(messages);
    if (estimated !== null) return { used: estimated, source: 'estimated' };
    return { used: null, source: 'none' };
}

/** Compact token formatting: 942, 12.4k, 128k, 1M */
export function formatTokens(n: number | null | undefined): string {
    if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '0';
    if (n < 1000) return String(Math.round(n));
    if (n < 1000000) {
        const k = n / 1000;
        // Keep one decimal below 100k (12.4k reads better than 12k); round above.
        const s = k < 100 ? k.toFixed(1) : String(Math.round(k));
        return `${s.replace(/\.0$/, '')}k`;
    }
    const m = n / 1000000;
    const s = m < 100 ? m.toFixed(1) : String(Math.round(m));
    return `${s.replace(/\.0$/, '')}M`;
}

/** Green below 60%, amber 60-85%, red at/above 85%. Grey when unknown. */
export function usageColor(ratio: number | null): string {
    if (ratio === null || !isFinite(ratio)) return '#6b7280';
    if (ratio >= 0.85) return '#ef4444';
    if (ratio >= 0.6) return '#f59e0b';
    return '#22c55e';
}
