'use strict';

/**
 * The credential seam.
 *
 * Everything downstream of this module - the provider registry, the router,
 * model discovery, every AI input - consumes one shape: a plain OrcaRouter API
 * key plus the account it belongs to. How that key was obtained is an
 * implementation detail of the adapter that produced it.
 *
 *   source = "api-key"  -> the user pasted an existing `sk-orca-...` key
 *   source = "pkce"     -> OAuth 2.0 + PKCE issued a fresh `sk-orca-...` key
 *
 * Both adapters return the same `Credential`, so no request path ever needs to
 * branch on how the user signed in.
 */

const { generateVerifier, generateState, challengeFor, buildAuthorizeUrl, exchangeCode, startLoopbackListener } = require('./pkce');
const { resolveOrigins } = require('./origins');

/** Both choices live under one provider id; `source` records how it was obtained. */
const PROVIDER_ID = 'orcarouter';

/** Display ids used by the GUI. Kept distinct so support and logout stay unambiguous. */
const SOURCE_API_KEY = 'api-key';
const SOURCE_PKCE = 'pkce';

/** Light input check only - a prefix is not proof of validity and never bills. */
const KEY_PREFIX = 'sk-orca-';

function looksLikeOrcaKey(value) {
  return typeof value === 'string' && value.trim().startsWith(KEY_PREFIX) && value.trim().length > KEY_PREFIX.length + 8;
}

/** Never render a whole key: enough to tell two credentials apart, not enough to use one. */
function maskKey(key) {
  if (typeof key !== 'string' || !key) return '';
  const tail = key.slice(-4);
  return `${KEY_PREFIX}…${tail}`;
}

/**
 * Build the one credential shape every adapter and every consumer agrees on.
 * `generation` increments on each successful acquisition; it is what makes a
 * late 401 from an old request unable to poison a freshly reauthorized one.
 */
function makeCredential({ key, source, userId = null, scope = null, generation = 1, now = null }) {
  return {
    provider: PROVIDER_ID,
    key,
    source,
    userId: userId != null ? String(userId) : null,
    scope,
    generation,
    needsReauth: false,
    createdAt: now,
  };
}

/**
 * Credential storage interface. The main process supplies an encrypted
 * implementation; tests supply the in-memory one. Nothing here invents a
 * second secret store.
 */
class MemoryCredentialStore {
  constructor(initial = null) {
    this._value = initial;
  }
  async read() {
    return this._value;
  }
  async write(record) {
    this._value = record;
    return record;
  }
  async clear() {
    const had = this._value;
    this._value = null;
    return had;
  }
}

/**
 * Adapter: the user pastes a key they already own.
 *
 * No network call is made. OrcaRouter exposes no free, non-billing validation
 * request, so validity is reported as unknown and the first real inference
 * request settles it - we do not spend a paid request to make a form look green.
 */
const apiKeySource = {
  id: SOURCE_API_KEY,
  label: 'OrcaRouter - API',
  async acquire({ apiKey } = {}) {
    const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!trimmed) {
      return { ok: false, error: 'invalid_request', message: 'Enter an OrcaRouter API key.' };
    }
    if (!looksLikeOrcaKey(trimmed)) {
      return { ok: false, error: 'invalid_format', message: 'An OrcaRouter API key starts with "sk-orca-".' };
    }
    return { ok: true, key: trimmed, userId: null, scope: null, validation: 'unknown' };
  },
};

/**
 * Adapter: authorize in the browser via OAuth 2.0 + PKCE (Flow A, loopback).
 *
 * Flow A is the right choice for incognide: it is a desktop Electron app, so it
 * has a real browser and can bind 127.0.0.1 on an ephemeral port. The user
 * clicks once and the code returns by itself; there is no address to register
 * and no code to copy. S256 is always sent.
 */
const pkceSource = {
  id: SOURCE_PKCE,
  label: 'OrcaRouter - Auth',
  async acquire(ctx = {}) {
    const {
      fetchImpl = globalThis.fetch,
      openBrowser,
      onAuthorizeUrl,
      onStatus,
      appName = 'incognide',
      scope = 'api',
      timeoutMs,
      loopback = startLoopbackListener,
      env = process.env,
      signal,
    } = ctx;

    const { authBase } = resolveOrigins(env);

    // Fresh verifier + state on every attempt, from a cryptographic RNG.
    const verifier = generateVerifier();
    const state = generateState();
    const challenge = challengeFor(verifier);

    const listener = loopback(Object.assign({ state }, timeoutMs ? { timeoutMs } : {}));

    let port;
    try {
      port = await listener.ready;
    } catch (err) {
      return { ok: false, error: 'listener_failed', message: 'Could not open a local callback listener for OrcaRouter sign-in.' };
    }

    const callbackUrl = `http://127.0.0.1:${port}/cb`;
    const authorizeUrl = buildAuthorizeUrl({ authBase, callbackUrl, challenge, state, appName, scope });

    if (typeof onAuthorizeUrl === 'function') onAuthorizeUrl(authorizeUrl);
    if (typeof onStatus === 'function') onStatus('waiting_for_browser');

    if (signal && signal.aborted) {
      listener.cancel();
      return { ok: false, error: 'cancelled', message: 'OrcaRouter sign-in was cancelled.' };
    }
    const onAbort = () => listener.cancel();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      if (typeof openBrowser === 'function') {
        try {
          await openBrowser(authorizeUrl);
        } catch {
          // A browser that will not open is not fatal: the URL is already
          // surfaced to the caller so the user can paste it themselves.
        }
      }

      let code;
      try {
        code = await listener.code;
      } catch (err) {
        const codeName = err && err.code;
        if (codeName === 'state_mismatch') {
          return { ok: false, error: 'state_mismatch', message: 'The authorization response did not match this sign-in attempt. It was ignored.' };
        }
        if (codeName === 'access_denied') {
          return { ok: false, error: 'access_denied', message: 'OrcaRouter authorization was denied.' };
        }
        if (codeName === 'timeout') {
          return { ok: false, error: 'timeout', message: 'OrcaRouter sign-in timed out. Start it again.' };
        }
        if (codeName === 'cancelled') {
          return { ok: false, error: 'cancelled', message: 'OrcaRouter sign-in was cancelled.' };
        }
        return { ok: false, error: codeName || 'callback_failed', message: 'OrcaRouter sign-in did not complete.' };
      }

      if (typeof onStatus === 'function') onStatus('exchanging_code');

      const exchanged = await exchangeCode({ authBase, code, verifier, fetchImpl });
      if (!exchanged.ok) return exchanged;

      // The response states what was *granted*. Surface a narrower grant
      // instead of assuming we hold what we asked for.
      const grantedScope = exchanged.scope;
      const scopeWarning = grantedScope && scope && grantedScope !== scope
        ? `OrcaRouter granted scope "${grantedScope}", not "${scope}".`
        : null;

      return {
        ok: true,
        key: exchanged.key,
        userId: exchanged.userId,
        scope: grantedScope,
        scopeWarning,
        validation: 'unknown',
      };
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      listener.cancel();
    }
  },
};

/** The two adapters, keyed by their stable ids. */
const SOURCES = {
  [SOURCE_API_KEY]: apiKeySource,
  [SOURCE_PKCE]: pkceSource,
};

/**
 * Run an adapter and persist what it produced. Both adapters land in the same
 * record shape, so callers get an identical result whichever one ran.
 */
async function acquireCredential({ store, sourceId, ...rest }) {
  const source = SOURCES[sourceId];
  if (!source) {
    return { ok: false, error: 'unknown_source', message: `Unknown OrcaRouter credential source: ${sourceId}` };
  }

  const previous = await store.read();
  const result = await source.acquire(rest);
  if (!result.ok) return result;

  const credential = makeCredential({
    key: result.key,
    source: sourceId,
    userId: result.userId,
    scope: result.scope,
    // A new key is a new generation, so any in-flight 401 against the old one
    // can no longer mark this credential broken.
    generation: (previous && previous.generation ? previous.generation : 0) + 1,
    now: rest.now || null,
  });

  await store.write(credential);

  return {
    ok: true,
    credential,
    key: credential.key,
    source: sourceId,
    userId: credential.userId,
    scope: credential.scope,
    generation: credential.generation,
    maskedKey: maskKey(credential.key),
    scopeWarning: result.scopeWarning || null,
  };
}

/**
 * A relay `401` means the key is revoked or invalid. That is terminal: there is
 * no refresh grant to call, and re-running the exchange with a spent code is
 * indistinguishable from a replay.
 *
 * Only the exact account *and* credential generation that made the rejected
 * request is marked, so a late failure from an old request can never disable a
 * freshly reauthorized credential. The stored secret is left in place - a
 * misclassified transient failure must not destroy the user's only copy.
 */
async function markNeedsReauth(store, { accountId = null, generation = null } = {}) {
  const current = await store.read();
  if (!current) return { ok: false, marked: false, reason: 'no_credential' };

  if (accountId != null && current.userId != null && String(current.userId) !== String(accountId)) {
    return { ok: true, marked: false, reason: 'different_account' };
  }
  if (generation != null && Number(current.generation) !== Number(generation)) {
    return { ok: true, marked: false, reason: 'stale_generation' };
  }

  const next = Object.assign({}, current, { needsReauth: true });
  await store.write(next);
  return { ok: true, marked: true, reason: 'marked' };
}

/** True when a relay response means "reauthenticate", not "retry". */
function isTerminalAuthFailure(status) {
  return status === 401;
}

/**
 * A PKCE-issued key is durable, not refreshable. This exists so UI copy and
 * callers do not have to guess: there is no refresh endpoint, so nothing in
 * this module will ever attempt a refresh grant.
 */
function credentialLifecycle(credential) {
  if (!credential) return 'missing';
  if (credential.needsReauth) return 'needs_reauth';
  return credential.source === SOURCE_PKCE ? 'durable_key_grant' : 'user_supplied_key';
}

module.exports = {
  PROVIDER_ID,
  SOURCE_API_KEY,
  SOURCE_PKCE,
  KEY_PREFIX,
  SOURCES,
  MemoryCredentialStore,
  apiKeySource,
  pkceSource,
  looksLikeOrcaKey,
  maskKey,
  makeCredential,
  acquireCredential,
  markNeedsReauth,
  isTerminalAuthFailure,
  credentialLifecycle,
};
