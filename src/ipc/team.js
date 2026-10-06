const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const yaml = require('js-yaml');
const os = require('os');

const INCOGNIDE_HOME = path.join(os.homedir(), '.incognide');
const USER_MODELS_PATH = path.join(INCOGNIDE_HOME, 'models.yaml');

function preprocessJinja(content) {
  return content.replace(/(?<!["'])\{\{[^{}]*\}\}(?!["'])/g, (match) => `"${match}"`);
}

async function findCtxFile(dirPath) {
  try {
    const items = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const ctxFiles = items.filter((item) => item.isFile() && item.name.endsWith('.ctx'));
    if (ctxFiles.length > 0) return ctxFiles[0].name;
  } catch {}
  return null;
}

function readCtxSync(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return yaml.load(preprocessJinja(raw)) || {};
  } catch {
    return {};
  }
}

function writeCtxSync(filePath, ctx) {
  delete ctx.external_jinx_teams;
  delete ctx.EXTERNAL_JINX_TEAMS;
  fs.writeFileSync(filePath, yaml.dump(ctx, { lineWidth: -1 }), 'utf8');
}

function buildUpdatedProviders(providers, providerName, models, options = {}) {
  const next = Array.isArray(providers) ? [...providers] : [];
  const existing = next.find((p) => p.name === providerName);

  const newEntry = {
    name: providerName,
    ...(options.apiUrl ? { api_url: options.apiUrl } : {}),
    ...(options.apiKey ? { api_key: options.apiKey } : {}),
    ...(options.apiKeyVar ? { api_key_var: options.apiKeyVar } : {}),
  };

  if (models === null) {
    newEntry.models = [];
  } else if (Array.isArray(models) && models.length > 0) {
    const existingModels = new Set(existing?.models || []);
    models.forEach((m) => existingModels.add(m));
    newEntry.models = Array.from(existingModels);
  }
  if (!newEntry.models && existing?.models) {
    newEntry.models = existing.models;
  }

  if (!existing) {
    next.push(newEntry);
  } else {
    const idx = next.indexOf(existing);
    next[idx] = { ...existing, ...newEntry };
  }

  return next;
}

function createFileSerializer() {
  const chains = new Map();

  return {
    run(filePath, update) {
      const chain = (chains.get(filePath) || Promise.resolve()).then(update, update);
      chains.set(filePath, chain);
      return chain.finally(() => {
        if (chains.get(filePath) === chain) {
          chains.delete(filePath);
        }
      });
    },
  };
}

function register(ctx) {
  const { ipcMain, getMainWindow, log } = ctx;

  const serializer = createFileSerializer();

  function notifyTeamConfigsUpdated(teamPath) {
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('team-configs-updated', { teamPath });
    }
  }

  async function updateProviderInTeamCtx(teamPath, providerName, models, options = {}) {
    if (!teamPath) throw new Error('No team path available.');
    const ctxFile = await findCtxFile(teamPath);
    const targetFile = ctxFile || 'team.ctx';
    const filePath = path.join(teamPath, targetFile);

    return serializer.run(filePath, async () => {
      const rawCtx = await fsPromises.readFile(filePath, 'utf8').catch(() => null);
      let teamCtx = {};
      if (rawCtx) {
        try {
          teamCtx = yaml.load(preprocessJinja(rawCtx)) || {};
        } catch {
          teamCtx = {};
        }
      }

      const providers = buildUpdatedProviders(teamCtx.providers, providerName, models, options);
      const cleanCtx = { ...teamCtx, providers };
      await fsPromises.writeFile(filePath, yaml.dump(cleanCtx, { lineWidth: -1 }), 'utf8');
      notifyTeamConfigsUpdated(teamPath);
      return { filePath, targetFile };
    });
  }

  ipcMain.handle('team:update-provider', async (_, { teamPath, providerName, models, options }) => {
    try {
      return await updateProviderInTeamCtx(teamPath, providerName, models, options || {});
    } catch (err) {
      log(`[team:update-provider] failed: ${err.message}`);
      return { error: err.message };
    }
  });

  async function ensureUserModelsFile() {
    try {
      await fsPromises.mkdir(INCOGNIDE_HOME, { recursive: true });
      try {
        await fsPromises.access(USER_MODELS_PATH);
        return USER_MODELS_PATH;
      } catch {
        const defaultContent = `providers: []
`;
        await fsPromises.writeFile(USER_MODELS_PATH, defaultContent, 'utf8');
      }
      return USER_MODELS_PATH;
    } catch {
      return null;
    }
  }

  async function readUserModelsConfig() {
    const filePath = await ensureUserModelsFile();
    if (!filePath) return { providers: [] };
    try {
      const raw = await fsPromises.readFile(filePath, 'utf8');
      const parsed = yaml.load(preprocessJinja(raw)) || {};
      return { providers: Array.isArray(parsed.providers) ? parsed.providers : [] };
    } catch {
      return { providers: [] };
    }
  }

  async function updateUserModelsConfig(providerName, models, options = {}) {
    const filePath = await ensureUserModelsFile();
    if (!filePath) throw new Error('Could not access user models file.');
    const config = await readUserModelsConfig();
    const providers = buildUpdatedProviders(config.providers, providerName, models, options);
    await fsPromises.writeFile(filePath, yaml.dump({ providers }, { lineWidth: -1 }), 'utf8');
    notifyTeamConfigsUpdated(filePath);
    return { filePath };
  }


  ipcMain.handle('user-models:load', async () => {
    try {
      return { config: await readUserModelsConfig(), error: null };
    } catch (err) {
      log(`[user-models:load] failed: ${err.message}`);
      return { config: { providers: [] }, error: err.message };
    }
  });

  ipcMain.handle('user-models:update', async (_, { providerName, models, options }) => {
    try {
      return await updateUserModelsConfig(providerName, models, options || {});
    } catch (err) {
      log(`[user-models:update] failed: ${err.message}`);
      return { error: err.message };
    }
  });
}

module.exports = { register, buildUpdatedProviders, createFileSerializer };
