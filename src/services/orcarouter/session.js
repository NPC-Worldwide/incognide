'use strict';

/**
 * Server-side login session manager.
 *
 * Holds the "a login is already in progress" lock for the main process and
 * guarantees that only the newest attempt can ever mutate credential or UI
 * state. A late callback, exchange response, or poll iteration from an
 * abandoned attempt is recognised by its attempt id and dropped.
 *
 * Every terminal path releases the lock: success, denial, exchange error,
 * timeout, explicit cancel, provider/auth-method switch, and the
 * `pagehide`-driven cancel that arrives when the window is being torn down.
 */

const { acquireCredential, markNeedsReauth, SOURCE_API_KEY, SOURCE_PKCE } = require('./credentials');

/** Attempt ids are opaque and monotonic; nothing else is trusted as an ordering. */
function createAttemptId(generation) {
  return `orca-login-${generation}`;
}

function createLoginManager({ store, env = process.env, fetchImpl = globalThis.fetch, openBrowser } = {}) {
  let generation = 0;
  let current = null; // { attemptId, sourceId, cancelled }
  let state = { busy: false, attemptId: null, authorizeUrl: null, status: 'idle', error: null, hint: null };

  const listeners = new Set();
  function emit() {
    const snapshot = getState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {}
    }
  }

  function getState() {
    return Object.assign({}, state, { generation });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function release(attemptId, patch) {
    // Only the newest attempt may clear or rewrite the shared state. An older
    // attempt finishing late must not stomp a newer login's UI.
    if (!current || current.attemptId !== attemptId) return false;
    current = null;
    state = Object.assign({}, state, { busy: false, ...patch });
    emit();
    return true;
  }

  /**
   * Start a login. Returns the authorization URL for the renderer to open (or
   * to show, for browsers that refuse to open automatically).
   */
  async function start(sourceId = SOURCE_PKCE, options = {}) {
    if (!store) throw new Error('A credential store is required to start an OrcaRouter login.');

    // Switching authentication method supersedes any attempt already running.
    if (current) {
      const previous = current;
      previous.cancelled = true;
      if (previous.abort) previous.abort.abort();
      current = null;
    }

    generation += 1;
    const attemptId = createAttemptId(generation);
    const abort = new AbortController();

    // A pasted key needs no browser and no lock beyond this call.
    if (sourceId === SOURCE_API_KEY) {
      const result = await acquireCredential({
        store,
        sourceId,
        apiKey: options.apiKey,
        now: options.now,
      });
      return { ok: result.ok, attemptId, source: sourceId, result };
    }

    current = { attemptId, sourceId, cancelled: false, abort };
    state = {
      busy: true,
      attemptId,
      authorizeUrl: null,
      status: 'starting',
      error: null,
      hint: null,
    };
    emit();

    const isCurrent = () => Boolean(current) && current.attemptId === attemptId;

    const onAuthorizeUrl = (url) => {
      if (!isCurrent()) return; // a URL from a superseded attempt must not surface
      state = Object.assign({}, state, { authorizeUrl: url, status: 'waiting_for_browser' });
      emit();
    };

    const onStatus = (status) => {
      if (!isCurrent()) return;
      state = Object.assign({}, state, { status });
      emit();
    };

    const outcome = await acquireCredential({
      store,
      sourceId,
      fetchImpl,
      env,
      // A per-call browser opener wins over the manager default, so a caller
      // (or a test) can observe the exact URL this attempt produced.
      openBrowser: options.openBrowser || openBrowser,
      onAuthorizeUrl,
      onStatus,
      signal: abort.signal,
      appName: options.appName || 'incognide',
      scope: options.scope || 'api',
      timeoutMs: options.timeoutMs,
      now: options.now,
    });

    if (!isCurrent()) {
      // Superseded: report it, but do not touch the live attempt's state.
      return { ok: false, attemptId, source: sourceId, superseded: true, result: outcome };
    }

    if (outcome.ok) {
      release(attemptId, { status: 'connected', error: null, hint: outcome.maskedKey || null, authorizeUrl: state.authorizeUrl });
    } else {
      release(attemptId, { status: outcome.error, error: outcome.message, authorizeUrl: state.authorizeUrl });
    }

    return { ok: outcome.ok, attemptId, source: sourceId, result: outcome };
  }

  /**
   * Cancel the running attempt. Idempotent, and safe to call during teardown:
   * it clears busy/hint synchronously rather than waiting for the aborted
   * request's `finally`, which is generation-guarded and would correctly refuse
   * to touch state - leaving a restored page permanently busy.
   */
  function cancel(attemptId = null) {
    if (!current) {
      // Nothing running: still clear the visible flags so a back-forward-cache
      // restore cannot show a stale busy state.
      if (state.busy) {
        state = Object.assign({}, state, { busy: false, status: 'cancelled', authorizeUrl: null, error: null, hint: null });
        emit();
      }
      return { ok: true, cancelled: false };
    }
    if (attemptId && current.attemptId !== attemptId) {
      return { ok: true, cancelled: false };
    }
    const attempt = current;
    attempt.cancelled = true;
    if (attempt.abort) attempt.abort.abort();
    current = null;
    state = Object.assign({}, state, { busy: false, status: 'cancelled', authorizeUrl: null, error: null, hint: null });
    emit();
    return { ok: true, cancelled: true, attemptId: attempt.attemptId };
  }

  /**
   * Record a terminal auth failure from the relay. Marks only the exact account
   * and credential generation that made the rejected request.
   */
  async function reportAuthFailure({ accountId = null, generation: rejectedGeneration = null } = {}) {
    return markNeedsReauth(store, { accountId, generation: rejectedGeneration });
  }

  return { start, cancel, getState, subscribe, reportAuthFailure };
}

module.exports = { createLoginManager, createAttemptId };
