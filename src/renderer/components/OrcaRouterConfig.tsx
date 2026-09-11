import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Key, LogIn, RefreshCw, ShieldCheck, X, AlertTriangle } from 'lucide-react';

/**
 * OrcaRouter provider configuration.
 *
 * Two authentication choices are shown side by side and stay independent:
 *
 *   - "OrcaRouter - API": paste an existing `sk-orca-...` key.
 *   - "OrcaRouter - Auth": OAuth 2.0 + PKCE in the browser, which returns a key
 *     for the user's own account.
 *
 * Both produce the same durable API key, so the model picker below and every
 * request path are identical whichever one was used. The API key never reaches
 * this component: the main process holds it and returns masked status and model
 * metadata only.
 */

export interface OrcaModel {
  id: string;
  value?: string;
  name?: string;
  display_name?: string;
  provider?: string;
  context_length?: number | null;
  architecture?: { input_modalities?: string[] | null; output_modalities?: string[] | null } | null;
  supported_endpoint_types?: string[] | null;
  reasoning?: boolean;
  reasoning_efforts?: string[] | null;
  seed?: boolean;
}

export interface CatalogState {
  models: OrcaModel[];
  source: 'live' | 'seed' | 'last_known_good' | 'none';
  degraded: boolean;
  loading: boolean;
  error: string | null;
  message?: string | null;
}

const PANEL_WIDTH = 360;

const EMPTY_CATALOG: CatalogState = {
  models: [],
  source: 'none',
  degraded: false,
  loading: false,
  error: null,
};

const api = () => (window as any).api || {};

/**
 * Model picker for one AI input entry point.
 *
 * The option list is whatever the main process returns for the requested
 * capability and input modalities - it is never free text, and a model that
 * does not declare a required modality is not offered at all.
 */
export const OrcaRouterModelPicker = ({
  capability = 'chat',
  inputModalities = ['text'],
  selectedModel,
  onSelect,
  loadingLabel = 'Loading models…',
  idPrefix = 'orca-model',
}: {
  capability?: string;
  inputModalities?: string[];
  selectedModel?: string | null;
  onSelect?: (model: OrcaModel | null) => void;
  loadingLabel?: string;
  idPrefix?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<CatalogState>(EMPTY_CATALOG);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const modalityKey = useMemo(() => [...inputModalities].sort().join(','), [inputModalities]);

  const load = useCallback(async () => {
    setCatalog((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api().orcaRouterListModels?.({ capability, inputModalities });
      if (!res) {
        setCatalog({ models: [], source: 'none', degraded: false, loading: false, error: 'OrcaRouter bridge unavailable.' });
        return;
      }
      setCatalog({
        models: res.models || [],
        source: res.source || 'live',
        degraded: Boolean(res.degraded),
        loading: false,
        error: res.ok === false ? res.message || res.error || 'Model discovery failed.' : null,
        message: res.message || null,
      });
    } catch (err: any) {
      setCatalog({ models: [], source: 'none', degraded: false, loading: false, error: err?.message || 'Model discovery failed.' });
    }
  }, [capability, modalityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute when the provider, the capability, or the attached modalities
  // change - a multimodal turn must not keep offering text-only models.
  useEffect(() => {
    load();
  }, [load]);

  // A selection that is no longer compatible is cleared rather than silently
  // kept, so the composer can never send a model the attachment would break.
  useEffect(() => {
    if (catalog.loading || !selectedModel) return;
    if (!catalog.models.some((m) => (m.value || m.id) === selectedModel)) {
      onSelect?.(null);
    }
  }, [catalog.models, catalog.loading, selectedModel, onSelect]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Right edges aligned: the panel is anchored to the trigger's right edge.
      setPos({ top: rect.bottom + 4, left: Math.round(rect.right - PANEL_WIDTH) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = catalog.models.filter((m) => {
    if (!search) return true;
    const text = `${m.name || ''} ${m.id || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const selectedLabel = catalog.models.find((m) => (m.value || m.id) === selectedModel)?.name
    || selectedModel
    || 'Select an OrcaRouter model';

  const emptyLabel = catalog.loading
    ? loadingLabel
    : catalog.error
      ? 'Model list unavailable'
      : 'No compatible models';

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        data-testid={`${idPrefix}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="OrcaRouter model"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm theme-bg-secondary theme-text-primary theme-border border hover:bg-white/5 w-full"
      >
        <span className="flex-1 truncate text-center">{selectedLabel}</span>
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} />
      </button>

      {catalog.degraded && (
        <div data-testid={`${idPrefix}-degraded`} className="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
          <AlertTriangle size={10} />
          <span>
            {catalog.source === 'last_known_good'
              ? 'Live catalog unavailable - showing the last known good list.'
              : 'Live catalog unavailable - showing the verified fallback list.'}
          </span>
          <button type="button" onClick={load} className="underline hover:text-amber-100">Retry</button>
        </div>
      )}

      {open && pos && createPortal(
        <div
          ref={panelRef}
          id={`${idPrefix}-panel`}
          role="listbox"
          aria-label="OrcaRouter models"
          data-testid={`${idPrefix}-panel`}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: PANEL_WIDTH,
            // Explicit so the surface is opaque and bordered in every theme.
            backgroundColor: '#0b1220',
            borderColor: '#334155',
            borderWidth: 1,
            borderStyle: 'solid',
          }}
          className="z-[120] rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="px-2 py-1.5 border-b border-slate-700 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search models..."
              aria-label="Search OrcaRouter models"
              data-testid={`${idPrefix}-search`}
              className="flex-1 bg-slate-900 text-slate-100 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={load}
              title="Refresh catalog"
              data-testid={`${idPrefix}-refresh`}
              className="p-1 rounded text-slate-400 hover:text-slate-100"
            >
              <RefreshCw size={12} className={catalog.loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div data-testid={`${idPrefix}-empty`} className="px-2 py-3 text-xs text-slate-400 text-center">
                {emptyLabel}
              </div>
            ) : (
              filtered.map((m) => {
                const value = m.value || m.id;
                const isSelected = value === selectedModel;
                return (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-testid={`${idPrefix}-option`}
                    data-model-id={m.id}
                    onClick={() => {
                      onSelect?.(m);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={`flex items-center gap-2 w-full px-2 py-1 text-xs text-left rounded ${isSelected ? 'bg-cyan-600/40 text-cyan-100' : 'text-slate-200 hover:bg-white/5'}`}
                  >
                    <span className="truncate flex-1">{m.name || m.id}</span>
                    {m.seed && <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-300">fallback</span>}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-2 py-1 border-t border-slate-700 text-[10px] text-slate-400 flex items-center justify-between">
            <span data-testid={`${idPrefix}-count`}>{filtered.length} models</span>
            <span>{catalog.source === 'live' ? 'live catalog' : catalog.source}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/**
 * Full OrcaRouter configuration panel.
 *
 * Every terminal login path clears the busy state and the authorization hint:
 * success, denial, exchange error, timeout, explicit cancel, switching the
 * authentication method, unmount, and `pagehide`. A monotonically increasing
 * attempt id stops a late response from a previous attempt rewriting newer UI.
 */
const OrcaRouterConfig = ({
  onModelsChanged,
  capability = 'chat',
  inputModalities = ['text'],
}: {
  onModelsChanged?: (models: OrcaModel[]) => void;
  capability?: string;
  inputModalities?: string[];
}) => {
  const [status, setStatus] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Monotonic generation: every async response must still belong to it.
  const generationRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    const gen = generationRef.current;
    const next = await api().orcaRouterCredentialStatus?.();
    if (gen !== generationRef.current) return; // stale response from an old attempt
    setStatus(next || null);
  }, []);

  const refreshInfo = useCallback(async () => {
    const next = await api().orcaRouterInfo?.();
    setInfo(next || null);
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshInfo();
  }, [refreshStatus, refreshInfo]);

  /**
   * Invalidate the current attempt and clear the visible login state.
   *
   * The generation guard means the aborted request's `finally` will correctly
   * refuse to mutate state, so this handler has to clear busy/hint itself -
   * otherwise a page restored from the back-forward cache stays permanently
   * busy. Returns the attempt id so the caller can cancel the server side.
   */
  const clearLoginState = useCallback(() => {
    generationRef.current += 1;
    setBusy(false);
    setHint(null);
    setAuthorizeUrl(null);
  }, []);

  // Back-forward cache: the page can be hidden and later restored without ever
  // remounting. Cancel the server-side work with keepalive and clear the UI
  // synchronously.
  useEffect(() => {
    const onPageHide = () => {
      const attemptId = (window as any).__orcaAttemptId || null;
      clearLoginState();
      try {
        api().orcaRouterLoginCancel?.(attemptId);
      } catch {}
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [clearLoginState]);

  // Unmount cancels the server-side work without writing React state.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      try {
        api().orcaRouterLoginCancel?.((window as any).__orcaAttemptId || null);
      } catch {}
    };
  }, []);

  const startLogin = async (source: 'api-key' | 'pkce') => {
    // Switching authentication method supersedes whatever was in flight.
    const attemptId = api().orcaRouterLoginCancel?.((window as any).__orcaAttemptId || null);
    void attemptId;

    generationRef.current += 1;
    const gen = generationRef.current;
    setBusy(true);
    setError(null);
    setHint(null);
    setAuthorizeUrl(null);

    try {
      const payload = source === 'api-key' ? { source, apiKey: apiKeyDraft } : { source };
      const result = await api().orcaRouterLoginStart?.(payload);

      if (gen !== generationRef.current) return; // superseded by a newer attempt

      setBusy(false);
      (window as any).__orcaAttemptId = null;

      if (result?.ok) {
        setHint(`Connected${result.maskedKey ? ` as ${result.maskedKey}` : ''}${result.scope ? ` (scope: ${result.scope})` : ''}.`);
        if (result.scopeWarning) setError(result.scopeWarning);
        setApiKeyDraft('');
        await refreshStatus();
        onModelsChanged?.([]);
        return;
      }
      setError(result?.message || 'OrcaRouter sign-in did not complete.');
    } catch (err: any) {
      if (gen !== generationRef.current) return;
      setBusy(false);
      setError(err?.message || 'OrcaRouter sign-in did not complete.');
    }
  };

  // Track the live attempt id so pagehide/unmount can cancel exactly this one.
  useEffect(() => {
    if (!busy) return;
    let cancelled = false;
    const poll = async () => {
      const state = await api().orcaRouterLoginState?.();
      if (cancelled || generationRef.current === 0) return;
      if (state?.attemptId) (window as any).__orcaAttemptId = state.attemptId;
      if (state?.authorizeUrl) setAuthorizeUrl(state.authorizeUrl);
      if (state && state.busy === false && state.status && state.status !== 'starting') {
        setBusy(false);
        setHint(null);
      }
    };
    poll();
    const timer = setInterval(poll, 700);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [busy]);

  const disconnect = async () => {
    generationRef.current += 1;
    clearLoginState();
    await api().orcaRouterDisconnect?.();
    setStatus(null);
    onModelsChanged?.([]);
  };

  const connected = Boolean(status?.connected);
  const needsReauth = Boolean(status?.needsReauth);

  return (
    <div
      data-testid="orcarouter-config"
      data-encryption-available={String(Boolean(info?.encryptionAvailable))}
      className="p-3 space-y-3 text-sm theme-bg-secondary theme-text-primary rounded border theme-border"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-cyan-300" />
        <span className="font-semibold">OrcaRouter</span>
        <span className="text-[10px] text-gray-400">
          {info?.runtime?.apiBase || 'https://api.orcarouter.ai/v1'}
        </span>
      </div>

      {connected && (
        <div data-testid="orcarouter-connected" className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
            {status?.source === 'pkce' ? 'OrcaRouter - Auth' : 'OrcaRouter - API'}
          </span>
          <span data-testid="orcarouter-masked-key" className="font-mono text-gray-300">{status?.maskedKey}</span>
          {needsReauth && (
            <span data-testid="orcarouter-needs-reauth" className="text-amber-300">Reconnect required</span>
          )}
          <button
            type="button"
            data-testid="orcarouter-disconnect"
            onClick={disconnect}
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 hover:bg-red-500/30"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* The two authentication choices, shown side by side and independent. */}
      <div className="grid grid-cols-2 gap-2">
        <div data-testid="orcarouter-api-key-method" className="space-y-1 p-2 rounded border theme-border">
          <div className="flex items-center gap-1 text-[11px] font-medium">
            <Key size={11} /> OrcaRouter - API
          </div>
          <input
            type="password"
            data-testid="orcarouter-api-key-input"
            aria-label="OrcaRouter API key"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-orca-…"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            className="w-full theme-input border theme-border rounded px-2 py-1 text-xs"
          />
          <button
            type="button"
            data-testid="orcarouter-api-key-save"
            disabled={busy || !apiKeyDraft.trim()}
            onClick={() => startLogin('api-key')}
            className="w-full text-[11px] px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 text-white"
          >
            Save API key
          </button>
        </div>

        <div data-testid="orcarouter-pkce-method" className="space-y-1 p-2 rounded border theme-border">
          <div className="flex items-center gap-1 text-[11px] font-medium">
            <LogIn size={11} /> OrcaRouter - Auth
          </div>
          <p className="text-[10px] text-gray-400">OAuth 2.0 + PKCE in your browser. No client secret.</p>
          <button
            type="button"
            data-testid="orcarouter-connect"
            disabled={busy}
            onClick={() => startLogin('pkce')}
            className="w-full text-[11px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white"
          >
            {busy ? 'Waiting for browser…' : 'Connect with OrcaRouter'}
          </button>
          {busy && (
            <button
              type="button"
              data-testid="orcarouter-cancel"
              onClick={() => { clearLoginState(); try { api().orcaRouterLoginCancel?.((window as any).__orcaAttemptId || null); } catch {} }}
              className="w-full text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {authorizeUrl && (
        <div data-testid="orcarouter-authorize-url" className="text-[10px] break-all text-gray-400">
          Browser did not open? Open this URL: <span className="font-mono">{authorizeUrl}</span>
        </div>
      )}

      {hint && <div data-testid="orcarouter-hint" className="text-xs text-emerald-300">{hint}</div>}
      {error && <div data-testid="orcarouter-error" className="text-xs text-red-400">{error}</div>}

      <div className="pt-1 border-t theme-border space-y-1">
        <div className="text-[10px] text-gray-400">Model (discovered from the OrcaRouter catalog)</div>
        <OrcaRouterModelPicker
          capability={capability}
          inputModalities={inputModalities}
          selectedModel={selectedModel}
          onSelect={(model) => setSelectedModel(model ? (model.value || model.id) : null)}
          idPrefix="orca-model"
        />
      </div>
    </div>
  );
};

export default OrcaRouterConfig;
export { OrcaRouterModelPicker as ModelPicker };
