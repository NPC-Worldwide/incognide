'use strict';

/**
 * OrcaRouter as a first-class provider.
 *
 * This is the single definition the registry, the router, model discovery and
 * the docs all read from. It is a named provider with its own id, base URL and
 * env var - not a custom base URL that happens to point at OrcaRouter.
 */

const { PROVIDER_ID, SOURCE_API_KEY, SOURCE_PKCE, KEY_PREFIX } = require('./credentials');
const { resolveOrigins, DEFAULT_AUTH_BASE, DEFAULT_API_BASE } = require('./origins');

/**
 * Registry entry, shaped to match the entries already in
 * `src/ipc/settings.js` KNOWN_PROVIDERS so the existing detection and config
 * code paths keep working unchanged.
 */
const PROVIDER_ENTRY = {
  provider: PROVIDER_ID,
  envVar: 'ORCAROUTER_API_KEY',
  baseUrl: DEFAULT_API_BASE,
  displayName: 'OrcaRouter',
  openAiCompatible: true,
  authBaseUrl: DEFAULT_AUTH_BASE,
  keyPrefix: KEY_PREFIX,
  keyDashboardUrl: `${DEFAULT_AUTH_BASE}/console/api-keys`,
  docsUrl: 'https://www.orcarouter.ai',
  logoUrl: `${DEFAULT_AUTH_BASE}/orca-logo-classic.png`,
  /** Both authentication choices, kept explicit rather than merged into one button. */
  authSources: [
    { id: SOURCE_API_KEY, label: 'OrcaRouter - API', kind: 'api-key' },
    { id: SOURCE_PKCE, label: 'OrcaRouter - Auth', kind: 'oauth-pkce' },
  ],
};

/** GUI metadata, shaped to match API_PROVIDER_META in ModelManager.tsx. */
const PROVIDER_UI_META = {
  name: 'OrcaRouter',
  color: 'text-cyan-300',
  bgColor: 'bg-cyan-600',
  docsUrl: 'https://www.orcarouter.ai',
  defaultModel: 'orcarouter/auto',
};

/** The selection lines that actually route traffic through the provider. */
const DEFAULT_MODEL = 'orcarouter/auto';

/**
 * Resolve the runtime descriptor for the provider. Explicit env overrides win
 * over the shared self-hosted base, which wins over the public defaults.
 */
function describe(env = process.env) {
  const { authBase, apiBase } = resolveOrigins(env);
  return {
    id: PROVIDER_ID,
    displayName: PROVIDER_ENTRY.displayName,
    authBase,
    apiBase,
    // Inference and catalog requests are always OpenAI-wire against `${apiBase}`.
    modelsUrl: `${apiBase}/models`,
    chatCompletionsUrl: `${apiBase}/chat/completions`,
    defaultModel: DEFAULT_MODEL,
    envKey: PROVIDER_ENTRY.envVar,
  };
}

module.exports = {
  PROVIDER_ID,
  PROVIDER_ENTRY,
  PROVIDER_UI_META,
  DEFAULT_MODEL,
  DEFAULT_AUTH_BASE,
  DEFAULT_API_BASE,
  describe,
};
