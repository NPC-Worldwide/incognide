'use strict';

/**
 * Origin resolution and network policy for OrcaRouter.
 *
 * Authentication and inference live on two different public origins. This
 * module is the single place that decides which is which, so no caller can
 * derive one from the other by rewriting a hostname or blindly appending
 * `/v1` (that mistake produces a 404 on `api.orcarouter.ai/v1/auth/keys`).
 */

const DEFAULT_AUTH_BASE = 'https://www.orcarouter.ai';
const DEFAULT_API_BASE = 'https://api.orcarouter.ai/v1';

/** Hosts that may be reached over plain HTTP (loopback development only). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());
}

/**
 * Reject plain-HTTP remote origins. HTTPS is required everywhere except
 * loopback, so a self-hosted deployment cannot silently downgrade the
 * credential exchange to cleartext.
 */
function assertSecureOrigin(rawUrl, label) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is not a valid URL: ${rawUrl}`);
  }
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return parsed;
  throw new Error(
    `${label} must use HTTPS for remote hosts (got ${parsed.protocol}//${parsed.hostname}); ` +
    'plain HTTP is permitted only for loopback development.'
  );
}

function stripTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

/**
 * Resolution order, highest priority first:
 *   1. explicit ORCA_AUTH_BASE_URL / ORCA_API_BASE_URL
 *   2. shared ORCA_BASE_URL (self-hosted single-origin deployments)
 *   3. public defaults
 *
 * The shared fallback keeps the documented `/v1` suffix on the inference side,
 * because `ORCA_BASE_URL` names a deployment root, not an API root.
 */
function resolveOrigins(env = process.env) {
  const shared = stripTrailingSlashes(env.ORCA_BASE_URL);

  const authBase = stripTrailingSlashes(env.ORCA_AUTH_BASE_URL) || shared || DEFAULT_AUTH_BASE;

  let apiBase = stripTrailingSlashes(env.ORCA_API_BASE_URL);
  if (!apiBase) {
    apiBase = shared ? `${shared}/v1` : DEFAULT_API_BASE;
  }

  assertSecureOrigin(authBase, 'OrcaRouter auth base');
  assertSecureOrigin(apiBase, 'OrcaRouter API base');

  return { authBase, apiBase };
}

/** Authorize endpoint. Fixed at `/auth` on the auth origin, never `/v1/auth`. */
function authorizeEndpoint(authBase) {
  return `${stripTrailingSlashes(authBase)}/auth`;
}

/** Code exchange endpoint. Fixed at `/api/v1/auth/keys` on the auth origin. */
function exchangeEndpoint(authBase) {
  return `${stripTrailingSlashes(authBase)}/api/v1/auth/keys`;
}

/** Device-grant endpoints (optional Flow C), same auth origin. */
function deviceCodeEndpoint(authBase) {
  return `${stripTrailingSlashes(authBase)}/api/v1/auth/device/code`;
}

function deviceTokenEndpoint(authBase) {
  return `${stripTrailingSlashes(authBase)}/api/v1/auth/device/token`;
}

/** Model discovery endpoint: `${apiBase}/models`, on the inference origin. */
function modelsEndpoint(apiBase) {
  return `${stripTrailingSlashes(apiBase)}/models`;
}

module.exports = {
  DEFAULT_AUTH_BASE,
  DEFAULT_API_BASE,
  isLoopbackHost,
  assertSecureOrigin,
  resolveOrigins,
  authorizeEndpoint,
  exchangeEndpoint,
  deviceCodeEndpoint,
  deviceTokenEndpoint,
  modelsEndpoint,
};
