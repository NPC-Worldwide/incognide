/**
 * Shared provider/model resolution.
 *
 * Before this module there were two independent merges: `useModelSelection`
 * (feeding ChatInput/AgentInput) and `CtxEditor` (team view). They disagreed in
 * two user-visible ways:
 *
 *   1. Provider dedupe keyed differently (`provider::value` vs lowercased
 *      provider), so the same model could appear twice in one view and once in
 *      the other.
 *   2. Only the team view re-discovered models for local providers. A stale
 *      hardcoded `ollama` list written by an older build kept showing in the
 *      agent input forever, while the team view refreshed it.
 *
 * Both now go through these functions so the two surfaces cannot drift again.
 */

export type ModelEntry = {
    value: string;
    display_name: string;
    provider: string | null;
    context_window?: number | null;
};

export type ProviderEntry = {
    name: string;
    models: string[];
    model?: string;
    api_url?: string;
    api_key_var?: string;
    [key: string]: any;
};

/**
 * Providers whose configured model list cannot be trusted: it is often a
 * hardcoded default written by an earlier build rather than something the user
 * chose. For these we always re-discover live, even when a list is present.
 */
export const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'llamacpp', 'lms']);

export const providerKeyOf = (p: any): string =>
    String(p?.name || p?.provider || '').trim();

const contextWindowOf = (m: any): number | null => {
    const ctx = m?.context_window ?? m?.context_length ?? m?.max_input_tokens;
    return typeof ctx === 'number' && ctx > 0 ? ctx : null;
};

/**
 * Case-insensitive provider::value key. Used for every dedupe so that
 * "Ollama::llama3" and "ollama::llama3" are recognised as the same model.
 */
export const modelKey = (provider: string | null | undefined, value: string): string =>
    `${String(provider || '').toLowerCase()}::${value}`;

/** Coerce a string or partial object into a ModelEntry. Returns null if unusable. */
export const normalizeModel = (m: any, provider?: string | null): ModelEntry | null => {
    const rawValue = typeof m === 'string' ? m : (m?.value ?? m?.id ?? m?.name);
    if (!rawValue) return null;
    const value = String(rawValue);
    const prov = provider ?? (typeof m === 'string' ? null : (m?.provider ?? null));
    const provStr = prov ? String(prov) : null;
    return {
        value,
        display_name:
            (typeof m === 'object' && m?.display_name) ||
            (provStr ? `${value} | ${provStr}` : value),
        provider: provStr,
        context_window: contextWindowOf(m),
    };
};

/** Dedupe a flat list of models, preserving first-seen order. */
export const mergeModelLists = (groups: any[][]): ModelEntry[] => {
    const out: ModelEntry[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
        for (const item of group || []) {
            const entry = normalizeModel(item);
            if (!entry) continue;
            const key = modelKey(entry.provider, entry.value);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(entry);
        }
    }
    return out;
};

/**
 * Merge provider entries from several sources (saved user models, ctx/team
 * providers, prop overrides). Later sources only fill gaps: a source that
 * actually lists models wins over one that lists none for the same provider.
 */
export const mergeProviderEntries = (...sources: any[][]): ProviderEntry[] => {
    const merged = new Map<string, ProviderEntry>();
    for (const source of sources) {
        for (const p of source || []) {
            const key = providerKeyOf(p);
            if (!key) continue;
            const models = Array.isArray(p?.models) ? p.models.filter(Boolean).map(String) : [];
            const prev = merged.get(key);
            if (!prev) {
                merged.set(key, { ...p, name: key, models });
            } else if (models.length > 0 && (prev.models || []).length === 0) {
                merged.set(key, { ...prev, ...p, name: key, models });
            }
        }
    }
    return Array.from(merged.values());
};

/**
 * Whether live discovery should run for this provider.
 *
 * We discover when the provider lists nothing (nothing to show otherwise), and
 * always for local providers whose lists are frequently stale.
 */
export const shouldDiscoverProvider = (providerName: string, listedCount: number): boolean => {
    if (listedCount <= 0) return true;
    return LOCAL_PROVIDERS.has(String(providerName).toLowerCase());
};

/** Turn a `getProviderModels` response into ModelEntries for one provider. */
export const entriesFromDiscovery = (res: any, providerName: string): ModelEntry[] => {
    const raw: any[] = Array.isArray(res) ? res : (res?.models || []);
    const out: ModelEntry[] = [];
    for (const m of raw) {
        const entry = normalizeModel(m, providerName);
        if (entry) out.push(entry);
    }
    return out;
};

/**
 * Expand provider entries into models: the provider's default `model` first,
 * then its listed models (or discovered ones when discovery has run).
 */
export const modelsFromProviders = (
    providers: ProviderEntry[],
    discovered: Record<string, any[]> = {},
): ModelEntry[] => {
    const out: ModelEntry[] = [];
    for (const prov of providers || []) {
        const key = providerKeyOf(prov);
        if (!key) continue;
        if (prov.model) {
            const entry = normalizeModel({ value: prov.model }, key);
            if (entry) out.push(entry);
        }
        const listed = Array.isArray(prov.models) ? prov.models : [];
        const found = discovered[key];
        // Live discovery wins when it returned anything; otherwise use the
        // configured list rather than showing a provider with no models.
        const effective = Array.isArray(found) && found.length > 0 ? found : listed;
        for (const m of effective || []) {
            const entry = normalizeModel(m, key);
            if (entry) out.push(entry);
        }
    }
    return out;
};
