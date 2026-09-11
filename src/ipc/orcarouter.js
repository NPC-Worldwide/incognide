'use strict';

/**
 * OrcaRouter main-process integration.
 *
 * This module owns the credential. The renderer never receives an API key: it
 * asks the main process to run discovery, and gets back model metadata only.
 * Linux Chromium, Electron, tests and the renderer all share the exact same
 * service modules under `src/services/orcarouter`, so there is one
 * implementation of the auth, catalog and routing logic rather than a copy per
 * entry point.
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const { PROVIDER_ENTRY, PROVIDER_UI_META, describe } = require('../services/orcarouter/provider');
const { acquireCredential, maskKey, SOURCE_API_KEY, SOURCE_PKCE, credentialLifecycle } = require('../services/orcarouter/credentials');
const { resolveCatalog, seedCatalog, CAPABILITY, filterByCapability, isStillCompatible } = require('../services/orcarouter/catalog');
const { createLoginManager } = require('../services/orcarouter/session');
const { resolveOrigins } = require('../services/orcarouter/origins');

/**
 * Encrypted-at-rest credential store.
 *
 * The single credential record lives in `$INCOGNIDE_HOME/orcarouter_credentials`
 * and is encrypted with Electron's `safeStorage` exactly the way this project
 * already encrypts saved browser passwords. No second secret store, no plaintext
 * side file. If the OS keyring is unavailable the payload is base64-wrapped, the
 * same fallback the existing credential code uses - never written in the clear.
 */
function createFileCredentialStore({ safeStorage, filePath, log = () => {} }) {
  const encryptionAvailable = () => {
    try {
      return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  };

  const encode = (record) => {
    const json = JSON.stringify(record);
    if (encryptionAvailable()) return safeStorage.encryptString(json);
    return Buffer.from(json, 'utf8').toString('base64');
  };

  const decode = (buffer) => {
    const text = encryptionAvailable()
      ? safeStorage.decryptString(buffer)
      : Buffer.from(buffer.toString('utf8'), 'base64').toString('utf8');
    return JSON.parse(text);
  };

  return {
    encryptionAvailable,
    async read() {
      try {
        const buffer = await fsp.readFile(filePath);
        if (!buffer || !buffer.length) return null;
        return decode(buffer);
      } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        // A corrupt or unreadable credential must not crash startup. It is
        // reported as missing so the user can simply connect again; we do not
        // silently delete it.
        log('[orcarouter] stored credential could not be read:', err.message);
        return null;
      }
    },
    async write(record) {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const payload = encode(record);
      const tmp = `${filePath}.tmp`;
      await fsp.writeFile(tmp, payload, { mode: 0o600 });
      await fsp.rename(tmp, filePath);
      try {
        await fsp.chmod(filePath, 0o600);
      } catch {}
      return record;
    },
    async clear() {
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err;
      }
      return true;
    },
  };
}

/**
 * The store instance created by `register`. Other main-process modules (the
 * chat router) read the credential through this accessor instead of keeping
 * their own copy, so there is exactly one place a secret is read from.
 */
let activeStore = null;

function getCredentialStore() {
  return activeStore;
}

function register(ctx) {
  const { ipcMain, log = () => {}, INCOGNIDE_HOME, safeStorage, shell } = ctx;
  const home = INCOGNIDE_HOME || path.join(require('os').homedir(), '.incognide');
  const credentialPath = path.join(home, 'orcarouter_credentials');

  const store = createFileCredentialStore({ safeStorage, filePath: credentialPath, log });
  activeStore = store;

  const openBrowser = async (url) => {
    if (shell && typeof shell.openExternal === 'function') {
      await shell.openExternal(url);
      return true;
    }
    throw new Error('No browser available');
  };

  const loginManager = createLoginManager({
    store,
    env: process.env,
    openBrowser,
  });

  /** Last-known-good catalogs, keyed by capability+modality, for outage fallback. */
  const catalogCache = new Map();
  const cacheKey = (capability, modalities) => `${capability}|${(modalities || []).join(',')}`;

  loginManager.subscribe((snapshot) => {
    // Fan out to every renderer; the payload carries no credential material.
    for (const win of require('electron').BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('orcarouter:login-event', snapshot);
      } catch {}
    }
  });

  ipcMain.handle('orcarouter:provider-info', async () => ({
    ...PROVIDER_ENTRY,
    ui: PROVIDER_UI_META,
    runtime: describe(process.env),
    encryptionAvailable: store.encryptionAvailable(),
  }));

  ipcMain.handle('orcarouter:credential-status', async () => {
    const record = await store.read();
    if (!record) {
      return { connected: false, source: null, maskedKey: null, lifecycle: 'missing', needsReauth: false };
    }
    return {
      connected: true,
      source: record.source,
      userId: record.userId,
      scope: record.scope,
      // Only ever the masked form - the key itself stays in this process.
      maskedKey: maskKey(record.key),
      lifecycle: credentialLifecycle(record),
      needsReauth: Boolean(record.needsReauth),
      generation: record.generation,
    };
  });

  ipcMain.handle('orcarouter:login-start', async (event, payload = {}) => {
    const sourceId = payload.source === SOURCE_API_KEY ? SOURCE_API_KEY : SOURCE_PKCE;
    const outcome = await loginManager.start(sourceId, { apiKey: payload.apiKey, scope: payload.scope });
    if (!outcome.result) return { ok: false, error: outcome.error || 'unknown_error' };

    if (outcome.result.ok) {
      return {
        ok: true,
        attemptId: outcome.attemptId,
        source: sourceId,
        maskedKey: outcome.result.maskedKey,
        userId: outcome.result.userId,
        scope: outcome.result.scope,
        scopeWarning: outcome.result.scopeWarning || null,
      };
    }
    return {
      ok: false,
      attemptId: outcome.attemptId,
      source: sourceId,
      error: outcome.result.error,
      message: outcome.result.message,
    };
  });

  ipcMain.handle('orcarouter:login-cancel', async (event, attemptId = null) => {
    return loginManager.cancel(attemptId);
  });

  ipcMain.handle('orcarouter:login-state', async () => loginManager.getState());

  ipcMain.handle('orcarouter:disconnect', async () => {
    loginManager.cancel();
    await store.clear();
    catalogCache.clear();
    return { ok: true };
  });

  /**
   * Model catalog for one entry point.
   *
   * `capability` and `inputModalities` come from the caller because each AI
   * input filters differently; the filtering itself happens here, in one place,
   * so no page can invent its own rules. Only normalised metadata crosses the
   * IPC boundary.
   */
  ipcMain.handle('orcarouter:list-models', async (event, payload = {}) => {
    const capability = payload.capability || CAPABILITY.CHAT;
    const inputModalities = Array.isArray(payload.inputModalities) ? payload.inputModalities : null;

    const record = await store.read();
    const apiKey = record && !record.needsReauth ? record.key : null;
    const { apiBase } = resolveOrigins(process.env);

    const key = cacheKey(capability, inputModalities);
    const result = await resolveCatalog({
      apiBase,
      apiKey,
      capability,
      inputModalities,
      lastKnownGood: catalogCache.get(key) || null,
    });

    if (result.source === 'live') {
      catalogCache.set(key, result.models);
    }

    // A revoked credential is terminal, not retryable: mark the exact account
    // and generation that was rejected instead of looping.
    if (result.degraded && result.error === 'unauthorized' && record) {
      await loginManager.reportAuthFailure({ accountId: record.userId, generation: record.generation });
    }

    return {
      ok: result.ok,
      models: result.models,
      source: result.source,
      degraded: result.degraded,
      error: result.error || null,
      message: result.message || null,
      total: result.total,
    };
  });

  /**
   * Authoritative seed for outage fallback, filtered the same way a live
   * catalog is. Kept behind its own channel so the renderer can label a
   * degraded catalog rather than present a short list as complete.
   */
  ipcMain.handle('orcarouter:seed-models', async (event, payload = {}) => {
    const capability = payload.capability || CAPABILITY.CHAT;
    const inputModalities = Array.isArray(payload.inputModalities) ? payload.inputModalities : null;
    const models = filterByCapability(seedCatalog(), { capability, inputModalities });
    return { ok: true, models, source: 'seed', degraded: true };
  });

  /** Re-validate a persisted model id against a freshly resolved catalog. */
  ipcMain.handle('orcarouter:validate-model', async (event, payload = {}) => {
    const capability = payload.capability || CAPABILITY.CHAT;
    const inputModalities = Array.isArray(payload.inputModalities) ? payload.inputModalities : null;
    const record = await store.read();
    const apiKey = record && !record.needsReauth ? record.key : null;
    const { apiBase } = resolveOrigins(process.env);
    const result = await resolveCatalog({ apiBase, apiKey, capability, inputModalities });
    return {
      ok: true,
      valid: isStillCompatible(result.models, payload.model, { capability, inputModalities }),
      source: result.source,
      degraded: result.degraded,
    };
  });

  ipcMain.handle('orcarouter:report-auth-failure', async (event, payload = {}) => {
    return loginManager.reportAuthFailure({
      accountId: payload.accountId != null ? payload.accountId : null,
      generation: payload.generation != null ? payload.generation : null,
    });
  });

  log(`[orcarouter] provider registered (auth=${describe(process.env).authBase}, api=${describe(process.env).apiBase})`);

  return { store, loginManager };
}

module.exports = {
  register,
  createFileCredentialStore,
  getCredentialStore,
};
