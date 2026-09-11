'use strict';

/**
 * OAuth 2.0 + PKCE primitives for OrcaRouter.
 *
 * No client secret is involved: PKCE binds the authorization code to this
 * process, so an intercepted code cannot be redeemed without the verifier,
 * which never leaves memory and never reaches a URL, a log, or telemetry.
 *
 * SHA-256 and base64url come from the Node standard library on purpose - the
 * flow must not pull a dependency in behind it.
 */

const crypto = require('crypto');
const { authorizeEndpoint, exchangeEndpoint } = require('./origins');

/** How long we wait for the browser round-trip before giving up. */
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
/** Auth codes are single-use with a 10 minute TTL; stay well inside it. */
const EXCHANGE_TIMEOUT_MS = 30 * 1000;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/** Fresh high-entropy verifier, one per authorization attempt. */
function generateVerifier() {
  return base64url(crypto.randomBytes(32));
}

/** Opaque CSRF token echoed back on the callback. */
function generateState() {
  return base64url(crypto.randomBytes(16));
}

/** `base64url(sha256(verifier))` with no padding. */
function challengeFor(verifier) {
  return base64url(crypto.createHash('sha256').update(String(verifier)).digest());
}

/**
 * Constant-time comparison for the callback `state`. Length is compared first
 * because `timingSafeEqual` throws on mismatched buffers.
 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  if (left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Build the consent URL. Always S256: the user can always choose
 * "Show me a code" on the consent screen, so the stronger binding applies
 * regardless of which delivery mode we asked for.
 */
function buildAuthorizeUrl({ authBase, callbackUrl, challenge, state, appName, scope = 'api', loginHint, workspaceHint, prompt }) {
  const url = new URL(authorizeEndpoint(authBase));
  url.searchParams.set('callback_url', callbackUrl);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (appName) url.searchParams.set('app_name', appName);
  if (scope) url.searchParams.set('scope', scope);
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  if (workspaceHint) url.searchParams.set('workspace_hint', workspaceHint);
  if (prompt) url.searchParams.set('prompt', prompt);
  return url.toString();
}

/**
 * Exchange an authorization code for a durable OrcaRouter API key.
 *
 * Errors are classified rather than thrown raw, so callers can distinguish
 * "the user said no" from "this code is dead" from "we are rate limited" and
 * surface something actionable. Response bodies are never echoed back into
 * messages: an error body can quote request material.
 */
async function exchangeCode({ authBase, code, verifier, fetchImpl = globalThis.fetch, timeoutMs = EXCHANGE_TIMEOUT_MS }) {
  if (!code) return { ok: false, error: 'invalid_request', message: 'No authorization code was provided.' };
  if (!verifier) return { ok: false, error: 'invalid_request', message: 'The PKCE verifier is missing for this attempt.' };

  const body = JSON.stringify({
    code,
    code_verifier: verifier,
    code_challenge_method: 'S256',
  });

  let res;
  try {
    res = await fetchImpl(exchangeEndpoint(authBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Network failure / timeout. Never re-run automatically: a retried
    // exchange with a consumed code is indistinguishable from a replay.
    return { ok: false, error: 'network_error', message: 'Could not reach the OrcaRouter authorization service.' };
  }

  if (res.status === 200) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      return { ok: false, error: 'invalid_response', message: 'The authorization service returned an unreadable response.' };
    }
    if (!payload || typeof payload.key !== 'string' || !payload.key) {
      return { ok: false, error: 'invalid_response', message: 'The authorization service did not return a key.' };
    }
    return {
      ok: true,
      key: payload.key,
      userId: payload.user_id != null ? String(payload.user_id) : null,
      // This is what was *granted*, not what we asked for.
      scope: typeof payload.scope === 'string' ? payload.scope : null,
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: 'invalid_request',
      message: 'OrcaRouter rejected the PKCE method for this code. Start the connection again.',
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      error: 'invalid_grant',
      message: 'This authorization code is unknown, expired, already used, or does not match this attempt. Start the connection again.',
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: 'rate_limited',
      message: 'Too many key requests for this account in the last 24 hours. Try again later, or paste an existing API key instead.',
    };
  }
  return {
    ok: false,
    error: 'exchange_failed',
    message: `OrcaRouter authorization failed (HTTP ${res.status}).`,
  };
}

/**
 * Loopback listener for Flow A. Binds 127.0.0.1 on an ephemeral port before
 * the browser opens, so the redirect target is known and nothing races.
 *
 * The listener is a one-shot: it settles on the first `/cb` hit, then closes.
 */
function startLoopbackListener({ state, timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS, http = require('http') }) {
  let resolveCode;
  let rejectCode;
  const settled = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  let server = null;
  let timer = null;
  let done = false;

  const finish = (fn, value) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      if (server) server.close();
    } catch {}
    fn(value);
  };

  const ready = new Promise((resolveReady, rejectReady) => {
    server = http.createServer((req, res) => {
      let parsed;
      try {
        parsed = new URL(req.url || '/', 'http://127.0.0.1');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request.');
        return;
      }
      if (parsed.pathname !== '/cb') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found.');
        return;
      }

      // Answer the browser first: the user should never be left staring at a
      // blank window while the process finishes its work.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>OrcaRouter</title>' +
        '<body style="font-family:system-ui;padding:2rem">' +
        '<h3>OrcaRouter connected</h3><p>You can close this tab and return to incognide.</p>'
      );

      const returnedState = parsed.searchParams.get('state');
      if (!safeEqual(returnedState, state)) {
        finish(rejectCode, Object.assign(new Error('state mismatch'), { code: 'state_mismatch' }));
        return;
      }
      const err = parsed.searchParams.get('error');
      if (err) {
        finish(rejectCode, Object.assign(new Error(err), { code: err }));
        return;
      }
      const code = parsed.searchParams.get('code');
      if (!code) {
        finish(rejectCode, Object.assign(new Error('missing code'), { code: 'missing_code' }));
        return;
      }
      finish(resolveCode, code);
    });

    server.on('error', (err) => {
      if (done) return;
      done = true;
      rejectReady(err);
      rejectCode(err);
    });

    server.listen(0, '127.0.0.1', () => {
      resolveReady(server.address().port);
    });

    timer = setTimeout(() => {
      finish(rejectCode, Object.assign(new Error('authorization timed out'), { code: 'timeout' }));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });

  // A caller that gives up before awaiting `code` (an aborted attempt, a
  // cancelled login) must not produce an unhandled rejection. Awaiting it later
  // still rejects with the same reason.
  settled.catch(() => {});

  return {
    ready,
    code: settled,
    cancel() {
      finish(rejectCode, Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    },
  };
}

/** Literal `oob` callback target for Flow B (out-of-band code). */
const OOB_CALLBACK = 'oob';

module.exports = {
  DEFAULT_LOGIN_TIMEOUT_MS,
  OOB_CALLBACK,
  base64url,
  generateVerifier,
  generateState,
  challengeFor,
  safeEqual,
  buildAuthorizeUrl,
  exchangeCode,
  startLoopbackListener,
};
