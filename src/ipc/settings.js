const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const { dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const fetch = require('node-fetch');
const yaml = require('js-yaml');

let INCOGNIDE_HOME = process.env.INCOGNIDE_HOME || path.join(os.homedir(), '.incognide');

const expandTilde = (filepath) => {
  if (typeof filepath !== 'string') return filepath;
  if (filepath.startsWith('~/')) return path.join(os.homedir(), filepath.slice(2));
  if (filepath === '~') return os.homedir();
  return filepath;
};

const pythonEnvConfigPath = path.join(INCOGNIDE_HOME, 'python_envs.json');

const ensurePythonEnvConfig = async () => {
  const dir = path.dirname(pythonEnvConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(pythonEnvConfigPath);
  } catch {
    await fsPromises.writeFile(pythonEnvConfigPath, JSON.stringify({ workspaces: {} }));
  }
};

const readPythonEnvConfig = async () => {
  await ensurePythonEnvConfig();
  const content = await fsPromises.readFile(pythonEnvConfigPath, 'utf8');
  return JSON.parse(content);
};

const writePythonEnvConfig = async (data) => {
  await ensurePythonEnvConfig();
  await fsPromises.writeFile(pythonEnvConfigPath, JSON.stringify(data, null, 2));
};

const tilesConfigPath = path.join(INCOGNIDE_HOME, 'tiles.json');

const defaultTilesConfig = {
  tiles: [
    { id: 'theme', label: 'Theme', icon: 'theme', enabled: true, order: 0 },
    { id: 'chat', label: 'Chat', icon: 'plus', enabled: true, order: 1 },
    { id: 'folder', label: 'Folder', icon: 'folder', enabled: true, order: 2 },
    { id: 'browser', label: 'Browser', icon: 'globe', enabled: true, order: 3 },
    { id: 'terminal', label: 'Terminal', icon: 'terminal', enabled: true, order: 4, subTypes: ['system', 'npcsh', 'guac'] },
    { id: 'code', label: 'Code', icon: 'code', enabled: true, order: 5 },
    { id: 'document', label: 'Doc', icon: 'file-text', enabled: true, order: 6, subTypes: ['docx', 'xlsx', 'pptx', 'mapx'] },
    { id: 'workspace', label: 'Incognide', icon: 'incognide', enabled: true, order: 7 }
  ],
  customTiles: []
};

const ensureTilesConfig = async () => {
  const dir = path.dirname(tilesConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(tilesConfigPath);
  } catch {
    await fsPromises.writeFile(tilesConfigPath, JSON.stringify(defaultTilesConfig, null, 2));
  }
};

const readTilesConfig = async () => {
  await ensureTilesConfig();
  const content = await fsPromises.readFile(tilesConfigPath, 'utf8');
  const config = JSON.parse(content);

  const defaultIds = defaultTilesConfig.tiles.map(t => t.id);
  const existingIds = (config.tiles || []).map(t => t.id);

  for (const defaultTile of defaultTilesConfig.tiles) {
    if (!existingIds.includes(defaultTile.id)) {
      config.tiles = config.tiles || [];
      config.tiles.push(defaultTile);
    }
  }
  return config;
};

const writeTilesConfig = async (data) => {
  await ensureTilesConfig();
  await fsPromises.writeFile(tilesConfigPath, JSON.stringify(data, null, 2));
};

const tileJinxDir = path.join(INCOGNIDE_HOME, 'tiles');

const tileSourceMap = {
  'db.jinx': { source: 'DBTool.tsx', label: 'DB Tool', icon: 'Database', order: 0 },
};

const componentsDir = path.join(__dirname, '..', 'renderer', 'components');

const generateJinxHeader = (meta) => `

`;

const ensureTileJinxDir = async () => {
  await fsPromises.mkdir(tileJinxDir, { recursive: true });
};

const tileJinxCacheDir = path.join(tileJinxDir, '.cache');

const compileJinxFile = async (jinxFilename) => {
  const jinxPath = path.join(tileJinxDir, jinxFilename);
  const cachePath = path.join(tileJinxCacheDir, jinxFilename.replace('.jinx', '.js'));

  try {
    let ts;
    try {
      ts = require('typescript');
    } catch (tsErr) {
      console.warn(`TypeScript not available, using fallback for ${jinxFilename}`);
      return createFallbackJinx(jinxFilename, cachePath, 'TypeScript not available');
    }

    let source;
    try {
      source = await fsPromises.readFile(jinxPath, 'utf8');
    } catch (readErr) {
      console.error(`Failed to read ${jinxFilename}:`, readErr.message);
      return createFallbackJinx(jinxFilename, cachePath, `Read error: ${readErr.message}`);
    }

    const exportMatch = source.match(/export\s+default\s+(\w+)\s*;?\s*$/m);
    const exportFuncMatch = source.match(/export\s+default\s+(?:function|const)\s+(\w+)/);
    const componentName = exportMatch?.[1] || exportFuncMatch?.[1] || 'Component';

    let cleaned = source.replace(/\/\*\*[\s\S]*?\*\/\s*\n?/, '');
    cleaned = cleaned.replace(/^#[^\n]*\n/gm, '');
    cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, '');
    cleaned = cleaned.replace(/^export\s+(default\s+)?/gm, '');

    let result;
    try {
      result = ts.transpileModule(cleaned, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: false,
          removeComments: true,
        },
        reportDiagnostics: true,
      });
    } catch (transpileErr) {
      console.error(`Transpile error in ${jinxFilename}:`, transpileErr.message);
      return createFallbackJinx(jinxFilename, cachePath, `Transpile error: ${transpileErr.message}`, componentName);
    }

    if (result.diagnostics && result.diagnostics.length > 0) {
      const errors = result.diagnostics.map(d => {
        try {
          return ts.flattenDiagnosticMessageText(d.messageText, '\n');
        } catch (e) {
          return String(d.messageText);
        }
      }).join('\n');
      console.error(`Compile diagnostics in ${jinxFilename}:`, errors);
    }

    let compiled = result.outputText || '';
    compiled = compiled.replace(/["']use strict["'];?\n?/g, '');
    compiled = compiled.replace(/Object\.defineProperty\(exports[\s\S]*?\);/g, '');
    compiled = compiled.replace(/exports\.\w+\s*=\s*/g, '');
    compiled = compiled.replace(/exports\.default\s*=\s*\w+;?/g, '');
    compiled = compiled.replace(/(?:var|const|let)\s+\w+\s*=\s*require\([^)]+\);?\n?/g, '');
    compiled = compiled.replace(/require\([^)]+\)/g, '{}');
    compiled = compiled.replace(/\w+_\d+\.(\w+)/g, '$1');
    compiled = compiled.replace(/react_1\.(\w+)/g, '$1');

    if (!compiled || compiled.trim().length < 10) {
      console.warn(`Empty compiled output for ${jinxFilename}, using fallback`);
      return createFallbackJinx(jinxFilename, cachePath, 'Empty compiled output', componentName);
    }

    const moduleCode = `// Compiled from ${jinxFilename}

${compiled}

var __componentName = "${componentName}";
var __component = ${componentName};
`;

    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });
    await fsPromises.writeFile(cachePath, moduleCode);
    return { success: true, componentName, cachePath };
  } catch (err) {
    console.error(`Failed to compile ${jinxFilename}:`, err.message);
    return createFallbackJinx(jinxFilename, cachePath, err.message);
  }
};

const createFallbackJinx = async (jinxFilename, cachePath, errorMessage, componentName = 'FallbackComponent') => {
  try {
    const fallbackCode = `// Fallback for ${jinxFilename} - compilation failed: ${errorMessage}

const ${componentName} = () => {
  return React.createElement('div', { 
    style: { 
      padding: '20px', 
      color: '#ff6b6b',
      fontFamily: 'system-ui, sans-serif'
    } 
  }, [
    React.createElement('h3', { key: 'title' }, 'Component Error'),
    React.createElement('p', { key: 'msg' }, 'Failed to load ${jinxFilename}: ${errorMessage}'),
    React.createElement('p', { key: 'hint', style: { fontSize: '12px', color: '#888' } }, 
      'Check the console for details. The app can still function.')
  ]);
};

var __componentName = "${componentName}";
var __component = ${componentName};
`;

    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });
    await fsPromises.writeFile(cachePath, fallbackCode);
    
    console.warn(`Created fallback for ${jinxFilename}: ${errorMessage}`);
    return { success: true, componentName, cachePath, fallback: true, error: errorMessage };
  } catch (fallbackErr) {
    console.error(`Failed to create fallback for ${jinxFilename}:`, fallbackErr.message);
    return { success: false, error: `${errorMessage}; Fallback failed: ${fallbackErr.message}` };
  }
};

const compileAllJinxFiles = async () => {
  try {
    await ensureTileJinxDir();
    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });

    const files = await fsPromises.readdir(tileJinxDir);
    const jinxFiles = files.filter(f => f.endsWith('.jinx'));

    const results = [];
    for (const jinxFile of jinxFiles) {
      try {
        const result = await compileJinxFile(jinxFile);
        results.push({ file: jinxFile, ...result });
      } catch (err) {
        results.push({ file: jinxFile, success: false, error: err.message });
      }
    }

    return { success: true, results };
  } catch (err) {
    console.error('Failed to compile jinx files:', err);
    return { success: false, error: err.message };
  }
};

const packageJson = require('../../package.json');
const APP_VERSION = packageJson.version;
const UPDATE_MANIFEST_URL = 'https://storage.googleapis.com/incognide-executables/manifest.json';

const resolvePythonPath = async (workspacePath, envConfig, getBackendPythonPath) => {
  const platform = process.platform;
  const isWindows = platform === 'win32';
  const pythonBin = isWindows ? 'python.exe' : 'python';
  const pythonBin3 = isWindows ? 'python3.exe' : 'python3';

  if (envConfig) {
    if (envConfig.type === 'venv' || envConfig.type === 'uv') {
      const binDir = isWindows ? 'Scripts' : 'bin';
      const venvPath = envConfig.venvPath || '.venv';
      const pythonPath = path.join(workspacePath, venvPath, binDir, pythonBin3);
      const pythonPath2 = path.join(workspacePath, venvPath, binDir, pythonBin);
      try {
        await fsPromises.access(pythonPath);
        return { pythonPath };
      } catch {
        try {
          await fsPromises.access(pythonPath2);
          return { pythonPath: pythonPath2 };
        } catch {}
      }
    } else if (envConfig.type === 'custom' && envConfig.customPath) {
      return { pythonPath: envConfig.customPath };
    } else if (envConfig.type === 'pyenv' && envConfig.pyenvVersion) {

      try {
        const pyenvRoot = execSync('pyenv root 2>/dev/null', { encoding: 'utf8' }).trim() || path.join(os.homedir(), '.pyenv');
        const pyenvPython = path.join(pyenvRoot, 'versions', envConfig.pyenvVersion, 'bin', 'python');
        await fsPromises.access(pyenvPython);
        return { pythonPath: pyenvPython };
      } catch {}
    } else if (envConfig.type === 'conda' && envConfig.condaEnv) {
      const condaRoot = envConfig.condaRoot || path.join(os.homedir(), 'miniconda3');
      const condaPython = path.join(condaRoot, 'envs', envConfig.condaEnv, isWindows ? 'python.exe' : 'bin/python');
      try {
        await fsPromises.access(condaPython);
        return { pythonPath: condaPython };
      } catch {}
    }
  }

  const venvPaths = ['.venv', 'venv', '.env', 'env'];
  for (const venvDir of venvPaths) {
    const binDir = isWindows ? 'Scripts' : 'bin';
    const venvPythonPath = path.join(workspacePath, venvDir, binDir, pythonBin3);
    const venvPythonPath2 = path.join(workspacePath, venvDir, binDir, pythonBin);
    try {
      await fsPromises.access(venvPythonPath);
      return { pythonPath: venvPythonPath };
    } catch {
      try {
        await fsPromises.access(venvPythonPath2);
        return { pythonPath: venvPythonPath2 };
      } catch {}
    }
  }

  const backendPython = getBackendPythonPath();
  if (backendPython) {
    return { pythonPath: backendPython };
  }

  try {
    const systemPython = execSync('which python3 || which python', { encoding: 'utf8' }).trim();
    if (systemPython) {
      return { pythonPath: systemPython };
    }
  } catch {}

  return null;
};

function register(ctx) {
  const { ipcMain, getMainWindow, callBackendApi, BACKEND_URL, BACKEND_PORT, log, generateId,
          cronJobs, daemons, scheduleCronJob,
          deviceConfig, updateDeviceConfig, getOrCreateDeviceId,
          needsFirstRunSetup, saveBackendPythonPath, markSetupComplete, getBackendPythonPath,
          getUserProfile, saveUserProfile,
          registerGlobalShortcut, app, backendProcess, killBackendProcess, setBackendProcess,
          ensureUserDataDirectory, waitForServer, logBackend,
          logsDir, electronLogPath, backendLogPath,
          dbQuery,
          readPythonEnvConfig: ctxReadPythonEnvConfig,
          INCOGNIDE_HOME: ctxIncognideHome,
          spawnDaemon, killDaemon, getDaemonStatus } = ctx;

  if (ctxIncognideHome) INCOGNIDE_HOME = ctxIncognideHome;

  const _readPythonEnvConfig = ctxReadPythonEnvConfig || readPythonEnvConfig;

  ipcMain.handle('submit-macro', async (event, command) => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on('screenshot-captured', (event, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('screenshot-captured-forward', {
        type: 'screenshot-captured',
        path: data.path,
        timestamp: data.timestamp
      });
    }
  });

  ipcMain.handle('daemon:start', async () => {
    try {
      spawnDaemon();
      await new Promise(r => setTimeout(r, 500));
      return await getDaemonStatus();
    } catch (err) {
      return { running: false, error: err.message };
    }
  });

  ipcMain.handle('daemon:stop', async () => {
    try {
      killDaemon();
      await new Promise(r => setTimeout(r, 500));
      return await getDaemonStatus();
    } catch (err) {
      return { running: false, error: err.message };
    }
  });

  ipcMain.handle('daemon:status', async () => {
    try { return await getDaemonStatus(); } catch (err) { return { running: false, error: err.message }; }
  });

  ipcMain.handle('daemon:restart', async () => {
    try {
      killDaemon();
      await new Promise(r => setTimeout(r, 1000));
      spawnDaemon();
      await new Promise(r => setTimeout(r, 500));
      return await getDaemonStatus();
    } catch (err) {
      return { running: false, error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:list', async () => {
    try {
      const rows = await dbQuery(`SELECT * FROM scheduled_jobs ORDER BY created_at DESC`);
      return { jobs: rows };
    } catch (err) {
      return { jobs: [], error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:create', async (event, params) => {
    try {
      const id = params.id || generateId?.() || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await dbQuery(
        `INSERT INTO scheduled_jobs (id, name, job_type, schedule, command, npc_name, jinx_name, payload, workspace_path, python_env_config, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id, params.name, params.jobType, params.schedule, params.command || null,
          params.npcName || null, params.jinxName || null,
          params.payload ? JSON.stringify(params.payload) : null,
          params.workspacePath || null,
          params.pythonEnvConfig ? JSON.stringify(params.pythonEnvConfig) : null,
          params.enabled !== undefined ? params.enabled : 1,
        ]
      );
      try {
        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
        if (state?.[0]?.port) {
          await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
        }
      } catch {}
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:update', async (event, params) => {
    try {
      await dbQuery(
        `UPDATE scheduled_jobs SET
          name = COALESCE(?, name),
          schedule = COALESCE(?, schedule),
          command = COALESCE(?, command),
          npc_name = COALESCE(?, npc_name),
          jinx_name = COALESCE(?, jinx_name),
          payload = COALESCE(?, payload),
          workspace_path = COALESCE(?, workspace_path),
          python_env_config = COALESCE(?, python_env_config),
          updated_at = datetime('now')
         WHERE id = ?`,
        [
          params.name, params.schedule, params.command, params.npcName, params.jinxName,
          params.payload ? JSON.stringify(params.payload) : null,
          params.workspacePath, params.pythonEnvConfig ? JSON.stringify(params.pythonEnvConfig) : null,
          params.id,
        ]
      );
      try {
        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
        if (state?.[0]?.port) {
          await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
        }
      } catch {}
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:delete', async (event, jobId) => {
    try {
      await dbQuery(`DELETE FROM scheduled_jobs WHERE id = ?`, [jobId]);
      try {
        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
        if (state?.[0]?.port) {
          await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
        }
      } catch {}
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:toggle', async (event, { jobId, enabled }) => {
    try {
      await dbQuery(`UPDATE scheduled_jobs SET enabled = ?, updated_at = datetime('now') WHERE id = ?`, [enabled ? 1 : 0, jobId]);
      try {
        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
        if (state?.[0]?.port) {
          await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
        }
      } catch {}
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:runNow', async (event, jobId) => {
    try {
      const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
      if (state?.[0]?.port) {
        const res = await fetch(`http://127.0.0.1:${state[0].port}/run_now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
          signal: AbortSignal.timeout(5000),
        });
        return await res.json();
      }
      return { error: 'Daemon not running' };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('scheduledJob:history', async (event, jobId) => {
    try {
      const rows = await dbQuery(
        `SELECT * FROM jinx_execution_log WHERE job_id = ? ORDER BY timestamp DESC LIMIT 100`,
        [jobId]
      );
      return { logs: rows };
    } catch (err) {
      return { logs: [], error: err.message };
    }
  });

  const KG_REGISTRY_PATH = path.join(INCOGNIDE_HOME, 'kg_registry.yaml');

  async function readKgRegistry() {
    try {
      const raw = await fsPromises.readFile(KG_REGISTRY_PATH, 'utf8');
      const data = yaml.load(raw) || {};
      return { stores: data.stores || [] };
    } catch {
      return { stores: [] };
    }
  }

  async function writeKgRegistry(registry) {
    await fsPromises.mkdir(path.dirname(KG_REGISTRY_PATH), { recursive: true });
    const tmp = KG_REGISTRY_PATH + '.tmp';
    await fsPromises.writeFile(tmp, yaml.dump(registry, { lineWidth: -1 }));
    await fsPromises.rename(tmp, KG_REGISTRY_PATH);
  }

  ipcMain.handle('kg:registerStore', async (event, dirPath) => {
    try {
      const registry = await readKgRegistry();
      const abs = path.resolve(dirPath);
      if (!registry.stores.includes(abs)) {
        registry.stores.push(abs);
        await writeKgRegistry(registry);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('kg:unregisterStore', async (event, dirPath) => {
    try {
      const registry = await readKgRegistry();
      const abs = path.resolve(dirPath);
      registry.stores = registry.stores.filter((d) => d !== abs);
      await writeKgRegistry(registry);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('kg:scanAndRegister', async (event, rootPath) => {
    try {
      const registry = await readKgRegistry();
      const found = new Set(registry.stores);
      const walk = async (dir) => {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory() && !ent.name.startsWith('.') && ent.name !== 'node_modules') {
            await walk(full);
          } else if (ent.name === '.knowledge.yaml') {
            found.add(path.resolve(dir));
          }
        }
      };
      await walk(path.resolve(rootPath || os.homedir()));
      registry.stores = Array.from(found).sort();
      await writeKgRegistry(registry);
      return { stores: registry.stores };
    } catch (err) {
      return { stores: [], error: err.message };
    }
  });

  ipcMain.handle('scanKnowledgeStores', async (event, workspacePath) => {
    try {
      const registry = await readKgRegistry();
      const results = [];
      for (const dir of registry.stores) {
        const file = path.join(dir, '.knowledge.yaml');
        if (!fs.existsSync(file)) continue;
        try {
          const raw = await fsPromises.readFile(file, 'utf8');
          const data = yaml.load(raw) || {};
          results.push({
            path: file,
            directory: dir,
            memoryCount: (data.memories || []).length,
            knowledgeCount: (data.knowledge || []).length,
            conceptCount: (data.concepts || []).length,
            linkCount: (data.links || []).length,
            lastExtractedAt: data.last_extracted_at || null,
            lastEvolvedAt: data.last_evolved_at || null,
          });
        } catch {
          results.push({ path: file, directory: dir, memoryCount: 0, knowledgeCount: 0, conceptCount: 0, linkCount: 0 });
        }
      }
      return { stores: results };
    } catch (err) {
      return { stores: [], error: err.message };
    }
  });

  ipcMain.handle('kg:loadStoreData', async (event, { storePaths } = {}) => {
    try {
      let paths = Array.isArray(storePaths) ? storePaths : [];
      if (paths.length === 0) {
        const reg = await readKgRegistry();
        paths = reg.stores.filter((s) => typeof s === 'string' && s);
      }
      const allMemories = [];
      const allKnowledge = [];
      for (const dir of paths) {
        const file = path.join(dir, '.knowledge.yaml');
        if (!fs.existsSync(file)) continue;
        try {
          const raw = await fsPromises.readFile(file, 'utf8');
          const data = yaml.load(raw) || {};
          for (const m of data.memories || []) {
            allMemories.push({ ...m, _directory: dir });
          }
          for (const k of data.knowledge || []) {
            allKnowledge.push({ ...k, directory: dir });
          }
        } catch {}
      }
      return { memories: allMemories, knowledge: allKnowledge };
    } catch (err) {
      return { memories: [], knowledge: [], error: err.message };
    }
  });

  const kgPipelineProcs = new Map();

  ipcMain.handle('kgPipeline:run', async (event, params) => {
    const jobId = params.jobId || generateId?.() || `kg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { step, storePaths, model, provider, context = '', contentText, operations, numSeeds, workspacePath } = params;
    if (!step || !Array.isArray(storePaths) || storePaths.length === 0) {
      return { error: 'Missing step or storePaths' };
    }

    const controller = new AbortController();
    kgPipelineProcs.set(jobId, controller);

    const push = (kind, message, data) => {
      const entry = { jobId, kind, message, data, timestamp: Date.now() };
      try { event.sender.send('kg-pipeline-log', entry); } catch {}
    };

    (async () => {
      try {
        const resp = await (globalThis.fetch || fetch)(`${BACKEND_URL}/api/kg/pipeline/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, jobId }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const text = await resp.text();
          push('error', `HTTP ${resp.status}: ${text}`);
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              push(parsed.kind || 'stdout', parsed.message || '', parsed.data || parsed);
            } catch {
              push('stdout', line);
            }
          }
        }
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            push(parsed.kind || 'stdout', parsed.message || '', parsed.data || parsed);
          } catch {
            push('stdout', buffer);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          push('error', 'Aborted');
        } else {
          push('error', err.message);
        }
      } finally {
        kgPipelineProcs.delete(jobId);
        push('done', 'All stores processed');
      }
    })();

    return { success: true, jobId };
  });

  ipcMain.handle('kgPipeline:abort', async (event, jobId) => {
    const controller = kgPipelineProcs.get(jobId);
    if (controller && typeof controller.abort === 'function') {
      try { controller.abort(); } catch {}
      kgPipelineProcs.delete(jobId);
    }
    return { aborted: !!controller };
  });

  ipcMain.handle('getCronJobs', async () => {
    const rows = await dbQuery(`SELECT * FROM scheduled_jobs WHERE job_type = 'jinx' ORDER BY created_at DESC`);
    return { jobs: rows };
  });

  ipcMain.handle('scheduleJob', async (event, params) => {
    const id = params.id || generateId?.() || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dbQuery(
      `INSERT INTO scheduled_jobs (id, name, job_type, schedule, command, enabled, created_at, updated_at)
       VALUES (?, ?, 'jinx', ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, params.name, params.schedule, params.command, params.enabled !== undefined ? params.enabled : 1]
    );
    try {
      const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
      if (state?.[0]?.port) {
        await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      }
    } catch {}
    return { success: true, id };
  });

  ipcMain.handle('unscheduleJob', async (event, jobName) => {
    await dbQuery(`DELETE FROM scheduled_jobs WHERE name = ? AND job_type = 'jinx'`, [jobName]);
    try {
      const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
      if (state?.[0]?.port) {
        await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      }
    } catch {}
    return { success: true };
  });

  ipcMain.handle('jobStatus', async (event, jobName) => {
    const rows = await dbQuery(`SELECT * FROM scheduled_jobs WHERE name = ? AND job_type = 'jinx' LIMIT 1`, [jobName]);
    if (!rows.length) return { error: 'Job not found' };
    return { job: rows[0] };
  });

  ipcMain.handle('jobReadScript', async (event, jobName) => {
    try {
      const safeName = String(jobName || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeName) return { error: 'invalid job name' };
      const candidates = [
        path.join(INCOGNIDE_HOME, 'npc_team', 'jobs', `${safeName}.sh`),
        path.join(os.homedir(), '.incognide', 'npc_team', 'jobs', `${safeName}.sh`),
      ];
      for (const scriptPath of candidates) {
        try {
          const content = await fsPromises.readFile(scriptPath, 'utf8');
          const stat = await fsPromises.stat(scriptPath);
          return { scriptPath, content, mtime: stat.mtime.toISOString() };
        } catch {}
      }
      return { error: 'script not found' };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('jobWriteScript', async (event, jobName, content) => {
    try {
      const safeName = String(jobName || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeName) return { error: 'invalid job name' };
      const candidates = [
        path.join(INCOGNIDE_HOME, 'npc_team', 'jobs', `${safeName}.sh`),
        path.join(os.homedir(), '.incognide', 'npc_team', 'jobs', `${safeName}.sh`),
      ];
      for (const scriptPath of candidates) {
        try {
          await fsPromises.access(scriptPath);
          await fsPromises.writeFile(scriptPath, content, { mode: 0o755 });
          await fsPromises.chmod(scriptPath, 0o755);
          const stat = await fsPromises.stat(scriptPath);
          return { scriptPath, mtime: stat.mtime.toISOString() };
        } catch {}
      }
      return { error: 'script not found' };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('jobRunNow', async (event, jobName) => {
    try {
      const safeName = String(jobName || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeName) return { error: 'invalid job name' };
      const candidates = [
        path.join(INCOGNIDE_HOME, 'npc_team', 'jobs', `${safeName}.sh`),
        path.join(os.homedir(), '.incognide', 'npc_team', 'jobs', `${safeName}.sh`),
      ];
      let scriptPath = null;
      for (const c of candidates) {
        try { await fsPromises.access(c); scriptPath = c; break; } catch {}
      }
      if (!scriptPath) return { error: 'script not found' };

      return await new Promise((resolve) => {
        const child = spawn('/bin/bash', [scriptPath], {
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const cap = (s, buf) => {
          s.on('data', (d) => { buf.push(d.toString()); });
        };
        const outBuf = [];
        const errBuf = [];
        cap(child.stdout, outBuf);
        cap(child.stderr, errBuf);
        const timeout = setTimeout(() => {
          try { child.kill('SIGTERM'); } catch {}
        }, 5 * 60 * 1000);
        child.on('close', (code) => {
          clearTimeout(timeout);
          resolve({
            scriptPath,
            exitCode: code,
            stdout: outBuf.join(''),
            stderr: errBuf.join(''),
          });
        });
        child.on('error', (err) => {
          clearTimeout(timeout);
          resolve({ scriptPath, error: err.message });
        });
      });
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('jobReadFullLog', async (event, jobName) => {
    try {
      const safeName = String(jobName || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeName) return { error: 'invalid job name' };
      const candidates = [
        path.join(INCOGNIDE_HOME, 'npc_team', 'logs', `${safeName}.log`),
        path.join(os.homedir(), '.incognide', 'npc_team', 'logs', `${safeName}.log`),
      ];
      for (const logPath of candidates) {
        try {
          const content = await fsPromises.readFile(logPath, 'utf8');
          const stat = await fsPromises.stat(logPath);
          return { logPath, content, mtime: stat.mtime.toISOString(), size: stat.size };
        } catch {}
      }
      return { error: 'log not found' };
    } catch (err) {
      return { error: err.message };
    }
  });

  const _getCrontabLocal = () => {
    const platform = process.platform;
    const result = {};
    if (platform === 'win32') {
      try {
        result.scheduled_tasks = execSync('schtasks /query /fo LIST', { encoding: 'utf8', timeout: 10000 });
      } catch {}
      return result;
    }
    try { result.user_crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
    if (platform === 'linux') {
      try { result.system_crontab = fs.readFileSync('/etc/crontab', 'utf8'); } catch {}
      try {
        const cronDDir = '/etc/cron.d';
        if (fs.existsSync(cronDDir)) {
          result.cron_d = fs.readdirSync(cronDDir)
            .filter(f => !f.startsWith('.'))
            .map(f => {
              try { return { name: f, content: fs.readFileSync(path.join(cronDDir, f), 'utf8') }; }
              catch { return null; }
            }).filter(Boolean);
        }
      } catch {}
      try { result.timers = execSync('systemctl list-timers --all --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
      try { result.services = execSync('systemctl --user list-units --type=service --state=running --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
    }
    if (platform === 'darwin') {
      try {
        const launchDirs = ['/Library/LaunchDaemons', '/Library/LaunchAgents',
                            path.join(os.homedir(), 'Library/LaunchAgents')];
        result.cron_d = [];
        for (const dir of launchDirs) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.plist'));
            for (const f of files.slice(0, 20)) {
              try { result.cron_d.push({ name: `${path.basename(dir)}/${f}`, content: fs.readFileSync(path.join(dir, f), 'utf8') }); }
              catch {}
            }
          }
        }
      } catch {}
    }
    return result;
  };

  const _getSystemDaemonsLocal = () => {
    const platform = process.platform;
    const result = {};
    if (platform === 'linux') {
      try { result.services = execSync('systemctl list-units --type=service --state=running --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
      try { result.user_services = execSync('systemctl --user list-units --type=service --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
    } else if (platform === 'darwin') {
      try { result.launchd_jobs = execSync('launchctl list 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
      try { result.user_services = execSync('launchctl list 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
    } else if (platform === 'win32') {
      try { result.scheduled_tasks = execSync('schtasks /query /fo LIST', { encoding: 'utf8', timeout: 10000 }); } catch {}
    }
    try {
      const triggersDir = path.join(os.homedir(), '.incognide', 'triggers');
      if (fs.existsSync(triggersDir)) {
        result.npcsh_services = fs.readdirSync(triggersDir).filter(f => !f.startsWith('.'));
      }
    } catch {}
    return result;
  };

  const _getServiceInfoLocal = (unit) => {
    const platform = process.platform;
    const result = {};
    const safeUnit = String(unit).replace(/[^a-zA-Z0-9._\-]/g, '');
    if (!safeUnit) return result;
    if (platform === 'linux') {
      try { result.unit_file = execSync(`systemctl cat ${safeUnit} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
      try { result.journal = execSync(`journalctl -u ${safeUnit} --no-pager -n 100 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
    } else if (platform === 'darwin') {
      try { result.unit_file = execSync(`launchctl print system/${safeUnit} 2>/dev/null || launchctl print gui/$(id -u)/${safeUnit} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
      try {
        const searchDirs = ['/Library/LaunchDaemons', '/Library/LaunchAgents',
                            path.join(os.homedir(), 'Library/LaunchAgents')];
        for (const dir of searchDirs) {
          const plistPath = path.join(dir, `${safeUnit}.plist`);
          if (fs.existsSync(plistPath)) {
            result.unit_file = fs.readFileSync(plistPath, 'utf8');
            break;
          }
        }
      } catch {}
    } else if (platform === 'win32') {
      try { result.unit_file = execSync(`schtasks /query /tn "${safeUnit}" /fo LIST /v`, { encoding: 'utf8', timeout: 5000 }); } catch {}
    }
    return result;
  };

  ipcMain.handle('getCrontab', async () => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/crontab`);
      if (r && !r.error) return r;
    } catch {}
    return _getCrontabLocal();
  });

  ipcMain.handle('getSystemDaemons', async () => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/daemons`);
      if (r && !r.error) return r;
    } catch {}
    return _getSystemDaemonsLocal();
  });

  ipcMain.handle('getServiceInfo', async (event, unit) => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/service-info/${encodeURIComponent(unit)}`);
      if (r && !r.error) return r;
    } catch {}
    return _getServiceInfoLocal(unit);
  });

  ipcMain.handle('addDaemon', (event, { path: daemonPath, name, command, npc, jinx }) => {
    const id = generateId();
    const isWindows = process.platform === 'win32';
    try {
      const proc = spawn(command, {
        shell: isWindows ? 'powershell.exe' : true,
        detached: !isWindows,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      if (!isWindows) proc.unref();
      proc.stdout.on('data', data => console.log(`[Daemon ${name}]: ${data.toString()}`));
      proc.stderr.on('data', data => console.error(`[Daemon ${name} err]: ${data.toString()}`));
      proc.on('exit', (code) => console.log(`[Daemon ${name}] exited ${code}`));
      daemons.set(id, { id, path: daemonPath, name, command, npc, jinx, process: proc });
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('removeDaemon', (event, id) => {
    if (daemons.has(id)) {
      const daemon = daemons.get(id);
      if (daemon.process) {
        try {
          if (process.platform === 'win32') {
            try { execSync(`taskkill /PID ${daemon.process.pid} /T /F`, { timeout: 5000 }); }
            catch { daemon.process.kill(); }
          } else {
            try { process.kill(-daemon.process.pid, 'SIGTERM'); }
            catch { daemon.process.kill(); }
          }
        } catch { daemon.process.kill(); }
      }
      daemons.delete(id);
      return { success: true };
    }
    return { success: false, error: 'Daemon not found' };
  });

  ipcMain.handle('getDaemons', () => {
    return Array.from(daemons.values()).map(({ process, ...rest }) => rest);
  });

  ipcMain.handle('update-shortcut', (event, newShortcut) => {
    const rcPath = path.join(os.homedir(), '.incogniderc');
    try {
      let rcContent = '';
      if (fs.existsSync(rcPath)) {
        rcContent = fs.readFileSync(rcPath, 'utf8');

        if (rcContent.includes('CHAT_SHORTCUT=')) {
          rcContent = rcContent.replace(/CHAT_SHORTCUT=["']?[^"'\n]+["']?/, `CHAT_SHORTCUT="${newShortcut}"`);
        } else {

          rcContent += `\nCHAT_SHORTCUT="${newShortcut}"\n`;
        }
      } else {
        rcContent = `CHAT_SHORTCUT="${newShortcut}"\n`;
      }
      fs.writeFileSync(rcPath, rcContent);
      registerGlobalShortcut(getMainWindow());
      return true;
    } catch (error) {
      console.error('Failed to update shortcut:', error);
      return false;
    }
  });

  ipcMain.handle('detect-local-models', async () => {
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    const whichCmd = isWin ? 'where' : 'which';
    const home = os.homedir();
    const extraBinDirs = isWin
      ? []
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          '/usr/bin',
          path.join(home, '.local', 'bin'),
          path.join(home, 'bin'),
          path.join(home, 'miniconda3', 'bin'),
          path.join(home, 'anaconda3', 'bin'),
        ];
    const pathExists = (p) => {
      try { return fs.existsSync(p); } catch { return false; }
    };
    const hasBinary = (name) => {
      try {
        execSync(`${whichCmd} ${name}`, { stdio: 'ignore', timeout: 2000 });
        return true;
      } catch {}
      const suffix = isWin ? '.exe' : '';
      for (const dir of extraBinDirs) {
        if (pathExists(path.join(dir, name + suffix))) return true;
      }
      return false;
    };
    const appExists = (appName) => {
      if (!isMac) return false;
      return pathExists(`/Applications/${appName}`)
        || pathExists(path.join(home, 'Applications', appName));
    };
    const probe = async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    const models = [];

    {
      const data = await probe('http://127.0.0.1:11434/api/tags');
      const running = !!data;
      const modelNames = running ? (data.models || []).map(m => m.name || m.model).filter(Boolean) : [];
      const installed = running
        || hasBinary('ollama')
        || appExists('Ollama.app')
        || (isWin && pathExists(path.join(home, 'AppData', 'Local', 'Programs', 'Ollama')));
      models.push({ provider: 'ollama', running, installed, models: modelNames });
    }

    {
      const data = await probe('http://127.0.0.1:1234/v1/models');
      const running = !!data;
      const modelNames = running ? (data.data || []).map(m => m.id).filter(Boolean) : [];
      const installed = running
        || hasBinary('lms')
        || appExists('LM Studio.app')
        || (isWin && pathExists(path.join(home, 'AppData', 'Local', 'LM-Studio')))
        || (isWin && pathExists(path.join(home, 'AppData', 'Local', 'Programs', 'LM Studio')));
      models.push({ provider: 'lmstudio', running, installed, models: modelNames });
    }

    {
      const data = await probe('http://127.0.0.1:8080/v1/models');
      const running = !!data;
      let modelNames = running ? (data.data || []).map(m => m.id).filter(Boolean) : [];
      const binaries = ['llama-server', 'llama-cli', 'koboldcpp'].filter(hasBinary);
      const installed = running || binaries.length > 0;
      if (!running && binaries.length > 0) modelNames = binaries;
      models.push({ provider: 'llamacpp', running, installed, models: modelNames });
    }

    {
      const data = await probe('http://127.0.0.1:8000/v1/models');
      const running = !!data;
      const modelNames = running ? (data.data || []).map(m => m.id).filter(Boolean) : [];
      const installed = running
        || hasBinary('omlx')
        || appExists('oMLX.app')
        || appExists('OMLX.app');
      models.push({ provider: 'omlx', running, installed, models: modelNames });
    }

    return { models };
  });

  ipcMain.handle('ollama:checkStatus', async () => {
    log('[Main Process] Checking Ollama status directly...');
    try {
      const { shell } = require('electron');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        return { installed: true, running: true, models: data.models || [] };
      }
      return { installed: true, running: false, models: [] };
    } catch (err) {
      return { installed: false, running: false, models: [], error: err.message };
    }
  });

  ipcMain.handle('local-provider:start', async (event, provider) => {
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    try {
      if (provider === 'ollama') {
        if (isMac) {
          spawn('open', ['-a', 'Ollama'], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
        }
        return { success: true, message: 'Ollama starting…' };
      }
      if (provider === 'lmstudio') {
        try {
          spawn('lms', ['server', 'start'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'LM Studio server starting…' };
        } catch {}
        if (isMac) {
          spawn('open', ['-a', 'LM Studio'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'LM Studio launched — start the server from the Developer tab.' };
        }
        return { success: false, error: 'lms CLI not found. Install LM Studio and enable the CLI.' };
      }
      if (provider === 'omlx') {
        if (isMac) {
          spawn('open', ['-a', 'oMLX'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'oMLX launched — start the server from the menu bar.' };
        }
        return { success: false, error: 'oMLX is macOS only.' };
      }
      if (provider === 'llamacpp') {
        return { success: false, error: 'llama.cpp requires a model path to start. Run `llama-server -m <model.gguf> --port 8080` in a terminal.' };
      }
      return { success: false, error: `Unknown provider: ${provider}` };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('local-provider:stop', async (event, provider) => {
    const isWin = process.platform === 'win32';
    try {
      if (provider === 'lmstudio') {
        try {
          execSync('lms server stop', { stdio: 'ignore', timeout: 5000 });
          return { success: true, message: 'LM Studio server stopped' };
        } catch (err) {
          return { success: false, error: 'lms server stop failed — stop it from the LM Studio Developer tab.' };
        }
      }
      if (provider === 'ollama') {
        if (isWin) {
          try { execSync('taskkill /F /IM ollama.exe', { stdio: 'ignore', timeout: 5000 }); return { success: true }; }
          catch (err) { return { success: false, error: 'Could not stop Ollama — quit it from the system tray.' }; }
        }
        try { execSync("pkill -f 'ollama serve'", { stdio: 'ignore', timeout: 5000 }); return { success: true }; }
        catch { return { success: false, error: 'Could not stop Ollama — quit the Ollama app.' }; }
      }
      if (provider === 'llamacpp') {
        if (isWin) {
          try { execSync('taskkill /F /IM llama-server.exe', { stdio: 'ignore', timeout: 5000 }); return { success: true }; }
          catch { return { success: false, error: 'Could not stop llama-server.' }; }
        }
        try { execSync('pkill -f llama-server', { stdio: 'ignore', timeout: 5000 }); return { success: true }; }
        catch { return { success: false, error: 'Could not stop llama-server — no running process found.' }; }
      }
      if (provider === 'omlx') {
        return { success: false, error: 'Stop oMLX from its menu bar icon.' };
      }
      return { success: false, error: `Unknown provider: ${provider}` };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('ollama:install', async () => {
    log('[Main Process] Installing Ollama directly (no backend required)...');
    const { shell } = require('electron');
    const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';

    if (process.platform === 'darwin') {
      try {
        execSync('which brew', { stdio: 'ignore', timeout: 5000 });
        log('[Main Process] Homebrew found, attempting brew install ollama...');
        execSync('brew install ollama', { timeout: 120000, stdio: 'ignore' });
        log('[Main Process] Ollama installed via Homebrew');
        return { success: true, message: 'Ollama installed via Homebrew. Run `brew services start ollama` or launch Ollama to start it.' };
      } catch (brewErr) {
        log(`[Main Process] brew install failed: ${brewErr.message} — falling back to download URL`);
        await shell.openExternal(OLLAMA_DOWNLOAD_URL);
        return { success: false, openDownload: true, downloadUrl: OLLAMA_DOWNLOAD_URL, message: 'Download page opened. Install Ollama, then click Refresh.' };
      }
    } else {
      await shell.openExternal(OLLAMA_DOWNLOAD_URL);
      return { success: false, openDownload: true, downloadUrl: OLLAMA_DOWNLOAD_URL, message: 'Download page opened. Install Ollama, then click Refresh.' };
    }
  });

  ipcMain.handle('ollama:getLocalModels', async () => {
    log('[Main Process] Fetching local Ollama models directly...');
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
      const data = await response.json();
      const models = (data.models || []).map(m => ({
        name: m.name || m.model,
        size: m.size,
        modified_at: m.modified_at,
      })).filter(m => m.name);
      return { models };
    } catch (err) {
      log(`[Main Process] ollama:getLocalModels error: ${err.message}`);
      return { models: [], error: err.message };
    }
  });

  ipcMain.handle('ollama:deleteModel', async (event, { model }) => {
    log(`[Main Process] Deleting Ollama model directly: ${model}`);
    try {
      const response = await fetch('http://127.0.0.1:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama returned HTTP ${response.status}: ${text}`);
      }
      return { success: true };
    } catch (err) {
      log(`[Main Process] ollama:deleteModel error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ollama:pullModel', async (event, { model }) => {
    log(`[Main Process] Starting pull for model directly from Ollama: ${model}`);
    try {
        const response = await fetch('http://127.0.0.1:11434/api/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model, stream: true }),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Ollama error on pull start: ${errorText}`);
        }

        const mainWindow = getMainWindow();
        const stream = response.body;
        stream.on('data', (chunk) => {
            try {
                const progressLines = chunk.toString().trim().split('\n');
                for (const line of progressLines) {
                    if (line) {
                      const progress = JSON.parse(line);

                      if (progress.status && progress.status.toLowerCase() === 'error') {
                          log(`[Ollama Pull] Received error from stream:`, progress.details);
                          mainWindow?.webContents.send('ollama-pull-error', progress.details || 'An unknown error occurred during download.');
                      } else {
                          const frontendProgress = {
                              status: progress.status,
                              details: `${progress.digest || ''} - ${progress.total ? (progress.completed / progress.total * 100).toFixed(1) + '%' : ''}`,
                              percent: progress.total ? (progress.completed / progress.total * 100) : null
                          };
                          mainWindow?.webContents.send('ollama-pull-progress', frontendProgress);
                      }
                    }
                }
            } catch (e) {
                console.error('Error parsing pull progress:', e);
                mainWindow?.webContents.send('ollama-pull-error', 'Failed to parse progress update.');
            }
        });

        stream.on('end', () => {
            log(`[Main Process] Pull stream for ${model} ended.`);
            mainWindow?.webContents.send('ollama-pull-complete');
        });

        stream.on('error', (err) => {
            log(`[Main Process] Pull stream for ${model} errored:`, err);
            mainWindow?.webContents.send('ollama-pull-error', err.message);
        });

        return { success: true, message: 'Pull started.' };
    } catch (err) {
        log(`[Main Process] Failed to initiate pull for ${model}:`, err);
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send('ollama-pull-error', err.message);
        return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-get', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      return config.workspaces[workspacePath] || null;
    } catch (err) {
      console.error('Error getting python env config:', err);
      return null;
    }
  });

  // Persist the notebook's last-selected kernel name per workspace, without
  // touching the rest of the env config (type/venvPath/etc). Lets the notebook
  // restore the same interpreter across crashes and reopens without a reselect.
  ipcMain.handle('python-env-setLastKernel', async (event, { workspacePath, kernelName }) => {
    try {
      const config = await _readPythonEnvConfig();
      const existing = config.workspaces[workspacePath] || {};
      config.workspaces[workspacePath] = { ...existing, lastKernelName: kernelName, updatedAt: Date.now() };
      await writePythonEnvConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error saving last kernel name:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-save', async (event, { workspacePath, envConfig }) => {
    try {
      const config = await _readPythonEnvConfig();
      config.workspaces[workspacePath] = {
        ...envConfig,
        updatedAt: Date.now()
      };
      await writePythonEnvConfig(config);

      try {
        const pythonInfo = await resolvePythonPath(workspacePath, envConfig, getBackendPythonPath);
        if (pythonInfo?.pythonPath) {
          saveBackendPythonPath(pythonInfo.pythonPath);
        }
      } catch (rcErr) {
        console.error('Error updating .incogniderc:', rcErr);
      }

      return { success: true };
    } catch (err) {
      console.error('Error saving python env config:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-delete', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      delete config.workspaces[workspacePath];
      await writePythonEnvConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error deleting python env config:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-list', async () => {
    try {
      const config = await _readPythonEnvConfig();
      return config.workspaces;
    } catch (err) {
      console.error('Error listing python env configs:', err);
      return {};
    }
  });

  ipcMain.handle('python-env-detect', async (event, { workspacePath }) => {
    const detected = [];
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const pythonBin = isWindows ? 'python.exe' : 'python';
    const pythonBin3 = isWindows ? 'python3.exe' : 'python3';

    const venvPaths = ['.venv', 'venv', '.env', 'env'];
    for (const venvDir of venvPaths) {
      const binDir = isWindows ? 'Scripts' : 'bin';
      const venvPythonPath = path.join(workspacePath, venvDir, binDir, pythonBin);
      const venvPython3Path = path.join(workspacePath, venvDir, binDir, pythonBin3);
      try {
        await fsPromises.access(venvPythonPath);
        detected.push({
          type: 'venv',
          name: `venv (${venvDir})`,
          path: venvPythonPath,
          venvPath: venvDir
        });
      } catch {
        try {
          await fsPromises.access(venvPython3Path);
          detected.push({
            type: 'venv',
            name: `venv (${venvDir})`,
            path: venvPython3Path,
            venvPath: venvDir
          });
        } catch {

        }
      }
    }

    const pyenvRoot = process.env.PYENV_ROOT || path.join(os.homedir(), '.pyenv');
    const pyenvVersionsDir = path.join(pyenvRoot, 'versions');

    const pyenvVersionFile = path.join(workspacePath, '.python-version');
    let localPyenvVersion = null;
    try {
      localPyenvVersion = (await fsPromises.readFile(pyenvVersionFile, 'utf8')).trim();
      const pyenvPythonPath = path.join(pyenvVersionsDir, localPyenvVersion, 'bin', pythonBin);
      try {
        await fsPromises.access(pyenvPythonPath);
        detected.push({
          type: 'pyenv',
          name: `pyenv (${localPyenvVersion}) - local`,
          path: pyenvPythonPath,
          pyenvVersion: localPyenvVersion,
          isLocalVersion: true
        });
      } catch {

        detected.push({
          type: 'pyenv',
          name: `pyenv (${localPyenvVersion}) - not installed`,
          path: null,
          pyenvVersion: localPyenvVersion,
          notInstalled: true
        });
      }
    } catch {

    }

    try {
      const versions = await fsPromises.readdir(pyenvVersionsDir);
      for (const version of versions) {

        if (version === localPyenvVersion) continue;

        if (version.startsWith('.') || version === 'envs') continue;

        const pyenvPythonPath = path.join(pyenvVersionsDir, version, 'bin', pythonBin);
        try {
          await fsPromises.access(pyenvPythonPath);
          detected.push({
            type: 'pyenv',
            name: `pyenv (${version})`,
            path: pyenvPythonPath,
            pyenvVersion: version
          });
        } catch {

        }
      }
    } catch {

    }

    const condaEnvFiles = ['environment.yml', 'environment.yaml'];
    for (const envFile of condaEnvFiles) {
      const envFilePath = path.join(workspacePath, envFile);
      try {
        const content = await fsPromises.readFile(envFilePath, 'utf8');

        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          const envName = nameMatch[1].trim();

          const condaPaths = [
            path.join(os.homedir(), 'anaconda3'),
            path.join(os.homedir(), 'miniconda3'),
            path.join(os.homedir(), 'miniforge3'),
            path.join(os.homedir(), '.conda')
          ];
          for (const condaRoot of condaPaths) {
            const condaPythonPath = path.join(condaRoot, 'envs', envName, 'bin', pythonBin);
            try {
              await fsPromises.access(condaPythonPath);
              detected.push({
                type: 'conda',
                name: `conda (${envName})`,
                path: condaPythonPath,
                condaEnv: envName,
                condaRoot: condaRoot
              });
              break;
            } catch {

            }
          }
        }
      } catch {

      }
    }

    const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
    try {
      const content = await fsPromises.readFile(pyprojectPath, 'utf8');
      if (content.includes('[tool.uv]') || content.includes('uv.lock')) {

        const uvVenvPath = path.join(workspacePath, '.venv', isWindows ? 'Scripts' : 'bin', pythonBin);
        try {
          await fsPromises.access(uvVenvPath);

          if (!detected.some(d => d.path === uvVenvPath)) {
            detected.push({
              type: 'uv',
              name: 'uv (.venv)',
              path: uvVenvPath,
              venvPath: '.venv'
            });
          }
        } catch {
          detected.push({
            type: 'uv',
            name: 'uv (not synced)',
            path: null,
            notInstalled: true,
            hint: 'Run "uv sync" to create environment'
          });
        }
      }
    } catch {

    }

    const uvLockPath = path.join(workspacePath, 'uv.lock');
    try {
      await fsPromises.access(uvLockPath);
      const uvVenvPath = path.join(workspacePath, '.venv', isWindows ? 'Scripts' : 'bin', pythonBin);
      try {
        await fsPromises.access(uvVenvPath);
        if (!detected.some(d => d.type === 'uv')) {
          detected.push({
            type: 'uv',
            name: 'uv (.venv)',
            path: uvVenvPath,
            venvPath: '.venv'
          });
        }
      } catch {
        if (!detected.some(d => d.type === 'uv')) {
          detected.push({
            type: 'uv',
            name: 'uv (not synced)',
            path: null,
            notInstalled: true,
            hint: 'Run "uv sync" to create environment'
          });
        }
      }
    } catch {

    }

    detected.push({
      type: 'system',
      name: 'System Python',
      path: isWindows ? 'python' : 'python3'
    });

    return detected;
  });

  ipcMain.handle('python-env-resolve', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      if (!envConfig) {

        return { pythonPath: process.platform === 'win32' ? 'python' : 'python3' };
      }

      const platform = process.platform;
      const isWindows = platform === 'win32';
      const pythonBin = isWindows ? 'python.exe' : 'python';

      switch (envConfig.type) {
        case 'venv':
        case 'uv': {
          const binDir = isWindows ? 'Scripts' : 'bin';
          const venvPath = envConfig.venvPath || '.venv';
          return { pythonPath: path.join(workspacePath, venvPath, binDir, pythonBin) };
        }
        case 'pyenv': {
          const pyenvRoot = process.env.PYENV_ROOT || path.join(os.homedir(), '.pyenv');
          return { pythonPath: path.join(pyenvRoot, 'versions', envConfig.pyenvVersion, 'bin', pythonBin) };
        }
        case 'conda': {
          const condaRoot = envConfig.condaRoot || path.join(os.homedir(), 'anaconda3');
          return { pythonPath: path.join(condaRoot, 'envs', envConfig.condaEnv, 'bin', pythonBin) };
        }
        case 'custom': {
          return { pythonPath: envConfig.customPath };
        }
        case 'system':
        default:
          return { pythonPath: isWindows ? 'python' : 'python3' };
      }
    } catch (err) {
      console.error('Error resolving python path:', err);
      return { pythonPath: process.platform === 'win32' ? 'python' : 'python3' };
    }
  });

  ipcMain.handle('python-env-create', async (event, { workspacePath, venvName = '.venv', pythonPath = null }) => {
    try {
      const venvDir = path.join(workspacePath, venvName);

      try {
        await fsPromises.access(venvDir);
        return { success: false, error: `Virtual environment '${venvName}' already exists` };
      } catch {

      }

      const isWindows = process.platform === 'win32';
      let pythonCmd = pythonPath || (isWindows ? 'python' : 'python3');

      return new Promise((resolve) => {

        const args = ['-m', 'venv', venvDir];
        console.log(`[VENV] Creating venv with: ${pythonCmd} ${args.join(' ')}`);

        const proc = spawn(pythonCmd, args, {
          cwd: workspacePath,
          shell: isWindows
        });

        let stderr = '';
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', async (code) => {
          if (code === 0) {

            try {
              const config = await _readPythonEnvConfig();
              config.workspaces[workspacePath] = {
                type: 'venv',
                venvPath: venvName
              };
              await writePythonEnvConfig(config);

              resolve({
                success: true,
                venvPath: venvDir,
                message: `Virtual environment '${venvName}' created successfully`
              });
            } catch (configErr) {
              resolve({
                success: true,
                venvPath: venvDir,
                warning: 'Venv created but failed to auto-configure: ' + configErr.message
              });
            }
          } else {
            resolve({
              success: false,
              error: `Failed to create venv (exit code ${code}): ${stderr}`
            });
          }
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: `Failed to spawn python: ${err.message}` });
        });
      });
    } catch (err) {
      console.error('Error creating venv:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-check-configured', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];
      return { configured: !!envConfig, config: envConfig };
    } catch (err) {
      return { configured: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-list-packages', async (event, workspacePath) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      const pythonInfo = await resolvePythonPath(workspacePath, envConfig, getBackendPythonPath);
      if (!pythonInfo?.pythonPath) {
        return [];
      }

      return new Promise((resolve) => {
        const proc = spawn(pythonInfo.pythonPath, ['-m', 'pip', 'list', '--format=json'], {
          cwd: workspacePath,
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          if (code === 0) {
            try {
              const packages = JSON.parse(stdout);
              resolve(packages.map(p => ({ name: p.name, version: p.version })));
            } catch {
              resolve([]);
            }
          } else {
            console.error('pip list failed:', stderr);
            resolve([]);
          }
        });

        proc.on('error', () => resolve([]));
      });
    } catch (err) {
      console.error('Error listing packages:', err);
      return [];
    }
  });

  ipcMain.handle('python-env-install-package', async (event, workspacePath, packageName, extraArgs = []) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      const pythonInfo = await resolvePythonPath(workspacePath, envConfig, getBackendPythonPath);
      if (!pythonInfo?.pythonPath) {
        return { success: false, error: 'No Python environment configured' };
      }

      const packages = packageName.split(/\s+/).filter(p => p.trim());
      const args = ['-m', 'pip', 'install', ...packages, ...extraArgs];

      console.log(`[PIP] Installing: ${pythonInfo.pythonPath} ${args.join(' ')}`);

      return new Promise((resolve) => {
        const proc = spawn(pythonInfo.pythonPath, args, {
          cwd: workspacePath,
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
          console.log('[PIP]', data.toString().trim());
        });
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
          console.log('[PIP ERR]', data.toString().trim());
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output: stdout });
          } else {
            resolve({ success: false, error: stderr || 'Installation failed' });
          }
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err) {
      console.error('Error installing package:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('python-env-uninstall-package', async (event, workspacePath, packageName) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      const pythonInfo = await resolvePythonPath(workspacePath, envConfig, getBackendPythonPath);
      if (!pythonInfo?.pythonPath) {
        return { success: false, error: 'No Python environment configured' };
      }

      const args = ['-m', 'pip', 'uninstall', '-y', packageName];

      console.log(`[PIP] Uninstalling: ${pythonInfo.pythonPath} ${args.join(' ')}`);

      return new Promise((resolve) => {
        const proc = spawn(pythonInfo.pythonPath, args, {
          cwd: workspacePath,
          env: { ...process.env }
        });

        let stderr = '';

        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: stderr || 'Uninstall failed' });
          }
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err) {
      console.error('Error uninstalling package:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('setup:checkNeeded', async () => {
    return { needed: needsFirstRunSetup() };
  });

  ipcMain.handle('setup:getBackendPythonPath', async () => {
    const pythonPath = getBackendPythonPath();
    return { pythonPath };
  });

  const KNOWN_PROVIDERS = [
    { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1', displayName: 'Anthropic' },
    { provider: 'ai21', envVar: 'AI21_API_KEY', baseUrl: 'https://api.ai21.com/studio/v1', displayName: 'AI21 Labs' },
    { provider: 'azure', envVar: 'AZURE_API_KEY', baseUrl: 'https://{your-resource}.openai.azure.com', displayName: 'Azure OpenAI' },
    { provider: 'azure_ai', envVar: 'AZURE_AI_API_KEY', baseUrl: 'https://{your-resource}.cognitiveservices.azure.com', displayName: 'Azure AI' },
    { provider: 'bedrock', envVar: 'AWS_ACCESS_KEY_ID', baseUrl: 'https://bedrock-runtime.{region}.amazonaws.com', displayName: 'Amazon Bedrock' },
    { provider: 'cerebras', envVar: 'CEREBRAS_API_KEY', baseUrl: 'https://api.cerebras.ai/v1', displayName: 'Cerebras' },
    { provider: 'cloudflare', envVar: 'CLOUDFLARE_API_KEY', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai', displayName: 'Cloudflare AI' },
    { provider: 'cohere', envVar: 'COHERE_API_KEY', baseUrl: 'https://api.cohere.com/v1', displayName: 'Cohere' },
    { provider: 'deepinfra', envVar: 'DEEPINFRA_API_KEY', baseUrl: 'https://api.deepinfra.com/v1/openai', displayName: 'DeepInfra' },
    { provider: 'deepseek', envVar: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com/v1', displayName: 'DeepSeek' },
    { provider: 'fireworks_ai', envVar: 'FIREWORKS_API_KEY', baseUrl: 'https://api.fireworks.ai/inference/v1', displayName: 'Fireworks AI' },
    { provider: 'gemini', envVar: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', displayName: 'Google Gemini' },
    { provider: 'groq', envVar: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', displayName: 'Groq' },
    { provider: 'hyperbolic', envVar: 'HYPERBOLIC_API_KEY', baseUrl: 'https://api.hyperbolic.xyz/v1', displayName: 'Hyperbolic' },
    { provider: 'mistral', envVar: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1', displayName: 'Mistral AI' },
    { provider: 'moonshot', envVar: 'MOONSHOT_API_KEY', baseUrl: 'https://api.moonshot.cn/v1', displayName: 'Moonshot AI' },
    { provider: 'nebius', envVar: 'NEBIUS_API_KEY', baseUrl: 'https://api.studio.nebius.ai/v1', displayName: 'Nebius AI' },
    { provider: 'novita', envVar: 'NOVITA_API_KEY', baseUrl: 'https://api.novita.ai/v3/openai', displayName: 'Novita AI' },
    { provider: 'nvidia_nim', envVar: 'NVIDIA_NIM_API_KEY', baseUrl: 'https://integrate.api.nvidia.com/v1', displayName: 'NVIDIA NIM' },
    { provider: 'openai', envVar: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1', displayName: 'OpenAI' },
    { provider: 'openrouter', envVar: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', displayName: 'OpenRouter' },
    { provider: 'perplexity', envVar: 'PERPLEXITY_API_KEY', baseUrl: 'https://api.perplexity.ai', displayName: 'Perplexity' },
    { provider: 'replicate', envVar: 'REPLICATE_API_KEY', baseUrl: 'https://api.replicate.com/v1', displayName: 'Replicate' },
    { provider: 'sambanova', envVar: 'SAMBANOVA_API_KEY', baseUrl: 'https://api.sambanova.ai/v1', displayName: 'SambaNova' },
    { provider: 'together', envVar: 'TOGETHER_API_KEY', baseUrl: 'https://api.together.xyz/v1', displayName: 'Together AI' },
    { provider: 'vertex_ai', envVar: 'VERTEX_AI_API_KEY', baseUrl: 'https://{region}-aiplatform.googleapis.com', displayName: 'Google Vertex AI' },
    { provider: 'watsonx', envVar: 'WATSONX_API_KEY', baseUrl: 'https://{region}.ml.cloud.ibm.com', displayName: 'IBM Watsonx' },
    { provider: 'xai', envVar: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1', displayName: 'xAI' },
    { provider: 'ollama', envVar: 'OLLAMA_API_KEY', baseUrl: 'http://localhost:11434', displayName: 'Ollama' },
  ];

  ipcMain.handle('get-known-providers', async () => {
    return KNOWN_PROVIDERS;
  });

  ipcMain.handle('detect-provider-keys', async () => {
    const envSources = new Set();
    for (const key of Object.keys(process.env)) envSources.add(key);
    const sourceFiles = [
      path.join(os.homedir(), '.incogniderc'),
      path.join(os.homedir(), '.env'),
      path.join(os.homedir(), '.zshrc'),
      path.join(os.homedir(), '.bashrc'),
      path.join(os.homedir(), '.bash_profile'),
    ];
    for (const f of sourceFiles) {
      try {
        const txt = await fsPromises.readFile(f, 'utf8');
        const matches = txt.matchAll(/(?:export\s+)?([A-Z_][A-Z0-9_]+)\s*=/g);
        for (const m of matches) envSources.add(m[1]);
      } catch {}
    }
    const detected = KNOWN_PROVIDERS.filter(k => envSources.has(k.envVar));

    try {
      const cpPath = path.join(INCOGNIDE_HOME, 'custom_providers.yaml');
      const content = await fsPromises.readFile(cpPath, 'utf8');
      const parsed = yaml.load(content);
      const providers = parsed?.providers || {};
      for (const [name, config] of Object.entries(providers)) {
        const apiKeyVar = config.api_key_var || `${name.toUpperCase()}_API_KEY`;
        if (!envSources.has(apiKeyVar)) continue;
        detected.push({
          provider: name,
          envVar: apiKeyVar,
          baseUrl: config.base_url || '',
          displayName: config.display_name || name,
          custom: true,
        });
      }
    } catch {}

    return detected;
  });

  ipcMain.handle('run-install-command', async (event, cmd) => {
    return await new Promise((resolve) => {
      if (!cmd || typeof cmd !== 'string' || /[;&|`$<>]/.test(cmd) || cmd.includes('&&') || cmd.includes('||')) {
        return resolve({ error: 'invalid command' });
      }
      const parts = cmd.trim().split(/\s+/);
      const bin = parts[0];
      const allowed = new Set(['brew', 'cargo', 'pip', 'pip3', 'uv', 'pipx']);
      if (!allowed.has(bin)) {
        return resolve({ error: `only ${[...allowed].join(', ')} allowed` });
      }
      const child = spawn(bin, parts.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
      const out = [];
      const err = [];
      child.stdout.on('data', (d) => {
        const s = d.toString();
        out.push(s);
        event.sender.send('install-progress', { text: s });
      });
      child.stderr.on('data', (d) => {
        const s = d.toString();
        err.push(s);
        event.sender.send('install-progress', { text: s });
      });
      const timeout = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 10 * 60 * 1000);
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ exitCode: code, stdout: out.join(''), stderr: err.join('') });
      });
      child.on('error', (e) => {
        clearTimeout(timeout);
        resolve({ error: e.message });
      });
    });
  });

  ipcMain.handle('check-binaries', async (event, names) => {
    const result = {};
    for (const name of names || []) {
      try {
        const which = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${which} ${name}`, { stdio: 'ignore', timeout: 2000 });
        result[name] = true;
      } catch {
        result[name] = false;
      }
    }
    return result;
  });

  ipcMain.handle('setup:detectPython', async () => {
    const pythons = [];

    const tryPython = (cmd, name) => {
      try {
        const version = execSync(`${cmd} --version 2>&1`, { encoding: 'utf8' }).trim();
        const pathResult = execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, { encoding: 'utf8' }).trim().split('\n')[0];
        pythons.push({ name, cmd, version, path: pathResult });
      } catch {}
    };

    tryPython('python3', 'Python 3 (System)');
    tryPython('python', 'Python (System)');

    try {
      const pyenvVersions = execSync('pyenv versions --bare 2>/dev/null', { encoding: 'utf8' }).trim().split('\n').filter(v => v);
      const pyenvRoot = execSync('pyenv root', { encoding: 'utf8' }).trim();
      for (const ver of pyenvVersions) {
        pythons.push({
          name: `pyenv ${ver}`,
          cmd: 'pyenv',
          version: ver,
          path: path.join(pyenvRoot, 'versions', ver, 'bin', 'python')
        });
      }
    } catch {}

    try {
      const condaEnvs = execSync('conda env list --json 2>/dev/null', { encoding: 'utf8' });
      const envData = JSON.parse(condaEnvs);
      for (const envPath of (envData.envs || [])) {
        const envName = path.basename(envPath);
        pythons.push({
          name: `conda ${envName}`,
          cmd: 'conda',
          version: envName,
          path: path.join(envPath, process.platform === 'win32' ? 'python.exe' : 'bin/python')
        });
      }
    } catch {}

    return { pythons };
  });

  ipcMain.handle('setup:createVenv', async () => {
    const venvDir = path.join(INCOGNIDE_HOME, 'venv');

    try {

      await fsPromises.mkdir(path.dirname(venvDir), { recursive: true });

      try {
        await fsPromises.access(venvDir);

        const pythonPath = path.join(venvDir, 'bin', 'python');
        return { success: true, pythonPath, message: 'Using existing virtual environment' };
      } catch {}

      const isWindows = process.platform === 'win32';
      const pythonCmd = isWindows ? 'python' : 'python3';

      return new Promise((resolve) => {
        const args = ['-m', 'venv', venvDir];
        log(`[SETUP] Creating incognide venv: ${pythonCmd} ${args.join(' ')}`);

        const proc = spawn(pythonCmd, args, { shell: isWindows });

        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          if (code === 0) {
            const pythonPath = path.join(venvDir, isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
            resolve({ success: true, pythonPath, message: 'Virtual environment created successfully' });
          } else {
            resolve({ success: false, error: `Failed to create venv: ${stderr}` });
          }
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: `Failed to spawn python: ${err.message}` });
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('setup:installNpcpy', async (event, { pythonPath, extras = 'local' }) => {
    if (!pythonPath) {
      return { success: false, error: 'No Python path provided' };
    }

    const validExtras = ['lite', 'local', 'yap', 'all'];
    const safeExtras = validExtras.includes(extras) ? extras : 'local';

    const sender = event.sender;

    return new Promise((resolve) => {

      const args = ['-m', 'pip', 'install', '--upgrade', `npcpy[${safeExtras}]`, 'npcsh'];
      log(`[SETUP] Installing npcpy and npcsh: ${pythonPath} ${args.join(' ')}`);

      const proc = spawn(pythonPath, args, {
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        log('[SETUP]', text.trim());

        if (sender && !sender.isDestroyed()) {
          sender.send('setup:installProgress', { type: 'stdout', text: text.trim() });
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        log('[SETUP]', text.trim());

        if (sender && !sender.isDestroyed()) {
          sender.send('setup:installProgress', { type: 'stderr', text: text.trim() });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'npcpy installed successfully' });
        } else {
          resolve({ success: false, error: stderr || 'Installation failed' });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  });

  ipcMain.handle('setup:verifyDependencies', async (event, { pythonPath }) => {
    if (!pythonPath) {
      return { success: false, error: 'No Python path provided' };
    }

    const dependencies = [
      { name: 'npcpy', importCheck: 'import npcpy; print(npcpy.__version__)' },
      { name: 'npcsh', importCheck: 'import npcsh; print("ok")' },
      { name: 'flask', importCheck: 'import flask; print(flask.__version__)' },
    ];

    const results = [];
    for (const dep of dependencies) {
      try {
        const { execSync } = require('child_process');
        const output = execSync(`"${pythonPath}" -c "${dep.importCheck}"`, {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
        }).trim();
        results.push({ name: dep.name, installed: true, version: output });
        log(`[SETUP] Verified ${dep.name}: ${output}`);
      } catch (err) {
        results.push({ name: dep.name, installed: false, error: err.message });
        log(`[SETUP] Missing dependency ${dep.name}: ${err.message}`);
      }
    }

    const allInstalled = results.every(r => r.installed);
    const missing = results.filter(r => !r.installed).map(r => r.name);

    return {
      success: allInstalled,
      results,
      missing,
      error: allInstalled ? null : `Missing dependencies: ${missing.join(', ')}`,
    };
  });

  ipcMain.handle('setup:complete', async (event, { pythonPath }) => {
    try {
      if (pythonPath) {
        const saved = saveBackendPythonPath(pythonPath);
        if (!saved) {
          return { success: false, error: 'Failed to save Python path to .incogniderc' };
        }
      }

      markSetupComplete();
      return { success: true, message: 'Setup completed successfully' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('setup:skip', async () => {
    markSetupComplete();
    return { success: true };
  });

  ipcMain.handle('setup:reset', async () => {
    const setupMarkerPath = path.join(INCOGNIDE_HOME, '.setup_complete');
    try {
      await fsPromises.unlink(setupMarkerPath);
      return { success: true };
    } catch (err) {

      return { success: true };
    }
  });

  ipcMain.handle('setup:restartBackend', async () => {
    try {

      if (killBackendProcess) {
        killBackendProcess();
      }

      const customPythonPath = getBackendPythonPath();

      if (!customPythonPath) {
        return { success: false, error: 'No Python path configured' };
      }

      const dataPath = ensureUserDataDirectory();

      let newBackendProcess = spawn(customPythonPath, ['-m', 'npcpy.serve'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          INCOGNIDE_PORT: String(BACKEND_PORT),
          FLASK_DEBUG: '1',
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          HOME: os.homedir(),
        },
      });

      setBackendProcess(newBackendProcess);

      newBackendProcess.stdout.on('data', (data) => {
        logBackend(`stdout: ${data.toString().trim()}`);
      });

      newBackendProcess.stderr.on('data', (data) => {
        logBackend(`stderr: ${data.toString().trim()}`);
      });

      const serverReady = await waitForServer(120, 1000, newBackendProcess);
      if (!serverReady) {
        if (newBackendProcess && !newBackendProcess.killed) {
          try { newBackendProcess.kill('SIGKILL'); } catch (e) {}
        }
        killBackendProcess();
        return { success: false, error: 'Backend failed to start' };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('profile:get', async () => {
    try {
      return getUserProfile();
    } catch (err) {
      console.error('Error getting user profile:', err);
      return { path: 'local-ai', aiEnabled: true, extras: 'local', tutorialComplete: false, setupComplete: false };
    }
  });

  ipcMain.handle('profile:save', async (event, profile) => {
    try {
      const saved = saveUserProfile(profile);
      return { success: saved };
    } catch (err) {
      console.error('Error saving user profile:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tiles-config-get', async () => {
    try {
      return await readTilesConfig();
    } catch (err) {
      console.error('Error getting tiles config:', err);
      return defaultTilesConfig;
    }
  });

  ipcMain.handle('tiles-config-save', async (event, config) => {
    try {
      await writeTilesConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error saving tiles config:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tiles-config-reset', async () => {
    try {
      await writeTilesConfig(defaultTilesConfig);
      return { success: true, config: defaultTilesConfig };
    } catch (err) {
      console.error('Error resetting tiles config:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tiles-config-add-custom', async (event, customTile) => {
    try {
      const config = await readTilesConfig();
      config.customTiles = config.customTiles || [];
      customTile.id = `custom_${Date.now()}`;
      customTile.order = config.tiles.length + config.customTiles.length;
      config.customTiles.push(customTile);
      await writeTilesConfig(config);
      return { success: true, tile: customTile };
    } catch (err) {
      console.error('Error adding custom tile:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tiles-config-remove-custom', async (event, tileId) => {
    try {
      const config = await readTilesConfig();
      config.customTiles = (config.customTiles || []).filter(t => t.id !== tileId);
      await writeTilesConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error removing custom tile:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-list', async () => {
    try {
      await ensureTileJinxDir();

      const files = await fsPromises.readdir(tileJinxDir);
      const jinxFiles = files.filter(f => f.endsWith('.jinx'));

      const tiles = [];
      for (const file of jinxFiles) {
        const content = await fsPromises.readFile(path.join(tileJinxDir, file), 'utf8');
        tiles.push({ filename: file, content });
      }
      return { success: true, tiles };
    } catch (err) {
      console.error('Error listing tile jinxes:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-read', async (event, filename) => {
    try {
      await ensureTileJinxDir();
      const filePath = path.join(tileJinxDir, filename);
      const content = await fsPromises.readFile(filePath, 'utf8');
      return { success: true, content };
    } catch (err) {
      console.error('Error reading tile jinx:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-write', async (event, filename, content) => {
    try {
      await ensureTileJinxDir();
      if (!filename.endsWith('.jinx')) {
        filename += '.jinx';
      }
      const filePath = path.join(tileJinxDir, filename);
      await fsPromises.writeFile(filePath, content);
      return { success: true };
    } catch (err) {
      console.error('Error writing tile jinx:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-delete', async (event, filename) => {
    try {
      const filePath = path.join(tileJinxDir, filename);
      await fsPromises.unlink(filePath);
      return { success: true };
    } catch (err) {
      console.error('Error deleting tile jinx:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-reset', async () => {
    try {

      const files = await fsPromises.readdir(tileJinxDir);
      for (const file of files) {
        if (file.endsWith('.jinx')) {
          await fsPromises.unlink(path.join(tileJinxDir, file));
        }
      }

      for (const [filename, meta] of Object.entries(tileSourceMap)) {
        try {
          const sourcePath = path.join(componentsDir, meta.source);
          const sourceCode = await fsPromises.readFile(sourcePath, 'utf8');
          const header = generateJinxHeader({ ...meta, filename });
          await fsPromises.writeFile(path.join(tileJinxDir, filename), header + sourceCode);
        } catch (err) {
          console.warn(`Could not reset ${filename}:`, err.message);
        }
      }
      return { success: true };
    } catch (err) {
      console.error('Error resetting tile jinxes:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transformTsx', async (event, code) => {
    try {
      const ts = require('typescript');

      const result = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: false,
          removeComments: true,
        },
        reportDiagnostics: true,
      });

      if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map(d => {
          const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
          const line = d.file ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
          return `Line ${line}: ${message}`;
        }).join('\n');
        return { success: false, error: errors };
      }

      return { success: true, output: result.outputText };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-compiled', async (event, filename) => {
    try {
      const cachePath = path.join(tileJinxCacheDir, filename.replace('.jinx', '.js'));

      try {
        const compiled = await fsPromises.readFile(cachePath, 'utf8');
        return { success: true, compiled };
      } catch {

        const result = await compileJinxFile(filename);
        if (result.success) {
          const compiled = await fsPromises.readFile(cachePath, 'utf8');
          return { success: true, compiled };
        }
        return result;
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tile-jinx-recompile', async () => {

    try {
      const cacheFiles = await fsPromises.readdir(tileJinxCacheDir);
      for (const file of cacheFiles) {
        await fsPromises.unlink(path.join(tileJinxCacheDir, file));
      }
    } catch {}
    return compileAllJinxFiles();
  });

  ipcMain.handle('loadProjectSettings', async (event, currentPath) => {
    try {
        const envPath = path.join(currentPath, '.env');
        const env_vars = {};
        try {
            const content = await fsPromises.readFile(envPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx === -1) continue;
                const key = trimmed.slice(0, eqIdx).replace(/^export\s+/, '').trim();
                let value = trimmed.slice(eqIdx + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (key) env_vars[key] = value;
            }
        } catch (readErr) {
        }
        return { env_vars };
    } catch (err) {
        console.error('Error loading project settings in main:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('saveProjectSettings', async (event, { path: settingsPath, env_vars }) => {
    try {
        const envPath = path.join(settingsPath, '.env');
        const lines = Object.entries(env_vars || {}).map(([k, v]) => `${k}=${v}`);
        await fsPromises.mkdir(settingsPath, { recursive: true });
        await fsPromises.writeFile(envPath, lines.join('\n') + (lines.length ? '\n' : ''));
        return { success: true };
    } catch (err) {
        console.error('Error saving project settings in main:', err);
        return { error: err.message };
    }
  });

  const SETTINGS_KEY_MAP = {
    INCOGNIDE_CHAT_MODEL: 'model',
    INCOGNIDE_CHAT_PROVIDER: 'provider',
    INCOGNIDE_EMBEDDING_MODEL: 'embedding_model',
    INCOGNIDE_EMBEDDING_PROVIDER: 'embedding_provider',
    INCOGNIDE_SEARCH_PROVIDER: 'search_provider',
    INCOGNIDE_DEFAULT_FOLDER: 'default_folder',
    INCOGNIDE_HOME: 'data_directory',
    INCOGNIDE_PREDICTIVE_TEXT_ENABLED: 'is_predictive_text_enabled',
    INCOGNIDE_PREDICTIVE_TEXT_MODEL: 'predictive_text_model',
    INCOGNIDE_PREDICTIVE_TEXT_PROVIDER: 'predictive_text_provider',
    INCOGNIDE_ACTIVITY_INTELLIGENCE_ENABLED: 'is_activity_intelligence_enabled',
    INCOGNIDE_ACTIVITY_BASE_REPO: 'activity_base_repo_id',
    INCOGNIDE_KG_ENABLED: 'is_knowledge_graph_enabled',
    INCOGNIDE_KG_BASE_REPO: 'knowledge_graph_base_repo_id',
    BACKEND_PYTHON_PATH: 'backend_python_path',
  };
  const SETTINGS_KEY_MAP_REVERSE = Object.fromEntries(
    Object.entries(SETTINGS_KEY_MAP).map(([k, v]) => [v, k])
  );
  const GLOBAL_SETTINGS_DEFAULTS = {
    model: '',
    provider: '',
    embedding_model: 'nomic-embed-text',
    embedding_provider: 'ollama',
    search_provider: 'perplexity',
    default_folder: '~/.incognide/',
    data_directory: '~/.incognide',
    is_predictive_text_enabled: false,
    predictive_text_model: '',
    predictive_text_provider: '',
    is_activity_intelligence_enabled: false,
    activity_base_repo_id: '',
    is_knowledge_graph_enabled: false,
    knowledge_graph_base_repo_id: '',
    backend_python_path: '',
  };

  ipcMain.handle('saveGlobalSettings', async (event, { global_settings, global_vars }) => {
    try {
        const rcPath = path.join(os.homedir(), '.incogniderc');

        let existing = {};
        let oldActivityEnabled = false;
        let oldBaseRepo = '';
        let oldPredictiveEnabled = false;
        let oldKGEnabled = false;
        try {
            const content = await fsPromises.readFile(rcPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const stripped = trimmed.replace(/^export\s+/, '');
                const eqIdx = stripped.indexOf('=');
                if (eqIdx === -1) continue;
                const key = stripped.slice(0, eqIdx).trim();
                let val = stripped.slice(eqIdx + 1).trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                existing[key] = val;
                if (key === 'INCOGNIDE_ACTIVITY_INTELLIGENCE_ENABLED') {
                    oldActivityEnabled = val === 'true' || val === '1';
                }
                if (key === 'INCOGNIDE_ACTIVITY_BASE_REPO') {
                    oldBaseRepo = val;
                }
                if (key === 'INCOGNIDE_PREDICTIVE_TEXT_ENABLED') {
                    oldPredictiveEnabled = val === 'true' || val === '1';
                }
                if (key === 'INCOGNIDE_KG_ENABLED') {
                    oldKGEnabled = val === 'true' || val === '1';
                }
            }
        } catch {}

        for (const [settingKey, value] of Object.entries(global_settings || {})) {
            const envKey = SETTINGS_KEY_MAP_REVERSE[settingKey] || settingKey;
            if (value === '' || value === null || value === undefined) {
                delete existing[envKey];
            } else {
                existing[envKey] = expandTilde(String(value));
            }
        }
        for (const [envKey, value] of Object.entries(global_vars || {})) {
            if (envKey.startsWith('CUSTOM_PROVIDER_')) continue;
            if (value === '' || value === null || value === undefined) {
                delete existing[envKey];
            } else {
                existing[envKey] = expandTilde(String(value));
            }
        }

        const homeValue = existing.INCOGNIDE_HOME;
        if (homeValue && typeof homeValue === 'string') {
            INCOGNIDE_HOME = homeValue;
            await fsPromises.mkdir(INCOGNIDE_HOME, { recursive: true });
        }

        const lines = Object.entries(existing).map(([k, v]) => `export ${k}=${v}`);
        await fsPromises.writeFile(rcPath, lines.join('\n') + '\n');

        const newActivityEnabled = global_settings?.is_activity_intelligence_enabled === true;
        const newBaseRepo = global_settings?.activity_base_repo_id || '';
        if (newActivityEnabled !== oldActivityEnabled || (newActivityEnabled && newBaseRepo !== oldBaseRepo)) {
            try {
                const rows = await dbQuery(`SELECT id, payload FROM scheduled_jobs WHERE job_type = 'activity_intelligence' LIMIT 1`);
                if (newActivityEnabled) {
                    const payload = JSON.stringify({
                        mode: 'incremental',
                        baseRepoId: newBaseRepo || null,
                    });
                    if (!rows.length) {
                        const id = generateId?.() || `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        await dbQuery(
                          `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                           VALUES (?, ?, 'activity_intelligence', '0 */6 * * *', ?, 1, datetime('now'), datetime('now'))`,
                          [id, 'Activity Intelligence', payload]
                        );
                        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                        if (state?.[0]?.port) {
                            await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                        }
                    } else if (newBaseRepo !== oldBaseRepo) {
                        await dbQuery(
                          `UPDATE scheduled_jobs SET payload = ?, updated_at = datetime('now') WHERE id = ?`,
                          [payload, rows[0].id]
                        );
                    }
                } else if (rows.length) {
                    await dbQuery(`DELETE FROM scheduled_jobs WHERE job_type = 'activity_intelligence'`);
                    const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                    if (state?.[0]?.port) {
                        await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                    }
                }
            } catch (syncErr) {
                console.error('[activity] Failed to sync scheduled job:', syncErr.message);
            }
        }

        const newPredictiveEnabled = global_settings?.is_predictive_text_enabled === true;
        if (newPredictiveEnabled !== oldPredictiveEnabled) {
            try {
                const rows = await dbQuery(`SELECT id FROM scheduled_jobs WHERE job_type = 'autocomplete' LIMIT 1`);
                if (newPredictiveEnabled) {
                    if (!rows.length) {
                        const id = generateId?.() || `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        await dbQuery(
                          `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                           VALUES (?, ?, 'autocomplete', '0 */6 * * *', ?, 1, datetime('now'), datetime('now'))`,
                          [id, 'Autocomplete Model', JSON.stringify({ mode: 'incremental' })]
                        );
                        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                        if (state?.[0]?.port) {
                            await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                        }
                    }
                } else if (rows.length) {
                    await dbQuery(`DELETE FROM scheduled_jobs WHERE job_type = 'autocomplete'`);
                    const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                    if (state?.[0]?.port) {
                        await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                    }
                }
            } catch (syncErr) {
                console.error('[autocomplete] Failed to sync scheduled job:', syncErr.message);
            }
        }

        const newKGEnabled = global_settings?.is_knowledge_graph_enabled === true;
        if (newKGEnabled !== oldKGEnabled) {
            try {
                const rows = await dbQuery(`SELECT id FROM scheduled_jobs WHERE job_type = 'knowledge_graph' LIMIT 1`);
                if (newKGEnabled) {
                    if (!rows.length) {
                        const id = generateId?.() || `kg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        await dbQuery(
                          `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                           VALUES (?, ?, 'knowledge_graph', '0 */12 * * *', ?, 1, datetime('now'), datetime('now'))`,
                          [id, 'Knowledge Graph Evolver', JSON.stringify({ mode: 'incremental' })]
                        );
                        const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                        if (state?.[0]?.port) {
                            await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                        }
                    }
                } else if (rows.length) {
                    await dbQuery(`DELETE FROM scheduled_jobs WHERE job_type = 'knowledge_graph'`);
                    const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
                    if (state?.[0]?.port) {
                        await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
                    }
                }
            } catch (syncErr) {
                console.error('[kg] Failed to sync scheduled job:', syncErr.message);
            }
        }

        return { success: true };
    } catch (err) {
        console.error('[SETTINGS] Error saving global settings:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('loadGlobalSettings', async () => {
    try {
        const rcPath = path.join(os.homedir(), '.incogniderc');
        const global_settings = { ...GLOBAL_SETTINGS_DEFAULTS };
        const global_vars = {};

        try {
            const content = await fsPromises.readFile(rcPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const stripped = trimmed.replace(/^export\s+/, '');
                const eqIdx = stripped.indexOf('=');
                if (eqIdx === -1) continue;
                const envKey = stripped.slice(0, eqIdx).trim();
                let value = stripped.slice(eqIdx + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (envKey in SETTINGS_KEY_MAP) {
                    const settingKey = SETTINGS_KEY_MAP[envKey];
                    if (settingKey === 'is_predictive_text_enabled' || settingKey === 'is_activity_intelligence_enabled' || settingKey === 'is_knowledge_graph_enabled') {
                        global_settings[settingKey] = value === 'true' || value === '1';
                    } else {
                        global_settings[settingKey] = value;
                    }
                } else if (envKey && !envKey.startsWith('CUSTOM_PROVIDER_')) {
                    global_vars[envKey] = value;
                }
            }
        } catch (readErr) {
        }

        return { global_settings, global_vars };
    } catch (err) {
        console.error('Error loading global settings:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('getLogsDir', async () => {
    return {
      logsDir,
      electronLog: electronLogPath,
      backendLog: backendLogPath
    };
  });

  ipcMain.handle('readLogFile', async (event, logType) => {
    try {
      let logPath;
      switch (logType) {
        case 'electron': logPath = electronLogPath; break;
        case 'backend': logPath = backendLogPath; break;
        default: throw new Error(`Unknown log type: ${logType}`);
      }
      if (fs.existsSync(logPath)) {

        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        return lines.slice(-1000).join('\n');
      }
      return '';
    } catch (error) {
      console.error('Error reading log file:', error);
      return '';
    }
  });

  ipcMain.handle('getFileStats', async (event, filePath) => {
    let resolvedPath = filePath;
    if (filePath.startsWith('~')) {
        resolvedPath = filePath.replace('~', os.homedir());
    }

    const stats = await fsPromises.stat(resolvedPath);
    return {
        size: stats.size,
        mtime: stats.mtime,
        mtimeMs: stats.mtimeMs,
        ctime: stats.ctime
    };
  });

  ipcMain.handle('lintFile', async (event, { filePath, content, language }) => {
    const { execFile } = require('child_process');
    const tmpdir = os.tmpdir();
    const path = require('path');

    try {
      if (language === 'python') {

        const tmpFile = path.join(tmpdir, `incognide_lint_${Date.now()}.py`);
        await fsPromises.writeFile(tmpFile, content);
        try {
          const result = await new Promise((resolve, reject) => {
            execFile('ruff', ['check', '--output-format=json', '--no-fix', tmpFile], { timeout: 10000 }, (err, stdout) => {

              try { resolve(JSON.parse(stdout || '[]')); } catch { resolve([]); }
            });
          });
          await fsPromises.unlink(tmpFile).catch(() => {});
          return (result || []).map(d => ({
            from: { line: (d.location?.row || 1) - 1, col: (d.location?.column || 1) - 1 },
            to: { line: (d.end_location?.row || d.location?.row || 1) - 1, col: (d.end_location?.column || d.location?.column || 1) - 1 },
            message: `${d.code || ''}: ${d.message || ''}`.trim(),
            severity: d.code?.startsWith('E') ? 'error' : 'warning',
          }));
        } catch {

          try {
            const result = await new Promise((resolve) => {
              execFile('pyflakes', [tmpFile], { timeout: 10000 }, (err, stdout, stderr) => {
                const output = (stdout || '') + (stderr || '');
                const diagnostics = output.split('\n').filter(Boolean).map(line => {
                  const match = line.match(/:(\d+):(?:(\d+):)?\s*(.+)/);
                  if (match) {
                    return {
                      from: { line: parseInt(match[1]) - 1, col: match[2] ? parseInt(match[2]) - 1 : 0 },
                      to: { line: parseInt(match[1]) - 1, col: match[2] ? parseInt(match[2]) : 999 },
                      message: match[3],
                      severity: 'warning',
                    };
                  }
                  return null;
                }).filter(Boolean);
                resolve(diagnostics);
              });
            });
            await fsPromises.unlink(tmpFile).catch(() => {});
            return result;
          } catch {
            await fsPromises.unlink(tmpFile).catch(() => {});
            return [];
          }
        }
      }

      if (language === 'javascript' || language === 'typescript') {

        const tmpExt = language === 'typescript' ? '.ts' : '.js';
        const tmpFile = path.join(tmpdir, `incognide_lint_${Date.now()}${tmpExt}`);
        await fsPromises.writeFile(tmpFile, content);
        try {
          const result = await new Promise((resolve) => {
            execFile('eslint', ['--format=json', '--no-eslintrc', '--rule', '{"no-undef":"warn","no-unused-vars":"warn","no-extra-semi":"error","no-dupe-keys":"error","no-unreachable":"error","no-constant-condition":"warn","no-empty":"warn","valid-typeof":"error"}', tmpFile], { timeout: 10000 }, (err, stdout) => {
              try {
                const parsed = JSON.parse(stdout || '[]');
                const msgs = parsed[0]?.messages || [];
                resolve(msgs.map(m => ({
                  from: { line: (m.line || 1) - 1, col: (m.column || 1) - 1 },
                  to: { line: (m.endLine || m.line || 1) - 1, col: (m.endColumn || m.column || 1) - 1 },
                  message: `${m.ruleId || ''}: ${m.message || ''}`.trim(),
                  severity: m.severity === 2 ? 'error' : 'warning',
                })));
              } catch { resolve([]); }
            });
          });
          await fsPromises.unlink(tmpFile).catch(() => {});
          return result;
        } catch {
          await fsPromises.unlink(tmpFile).catch(() => {});
          return [];
        }
      }

      if (language === 'tex') {

        const tmpFile = path.join(tmpdir, `incognide_lint_${Date.now()}.tex`);
        await fsPromises.writeFile(tmpFile, content);
        try {
          const result = await new Promise((resolve) => {
            execFile('chktex', ['-q', '-f', '%l:%c:%k:%m\\n', tmpFile], { timeout: 10000 }, (err, stdout) => {
              const output = stdout || '';
              const diagnostics = output.split('\n').filter(Boolean).map(line => {
                const match = line.match(/^(\d+):(\d+):(\w+):(.+)/);
                if (match) {
                  return {
                    from: { line: parseInt(match[1]) - 1, col: parseInt(match[2]) - 1 },
                    to: { line: parseInt(match[1]) - 1, col: parseInt(match[2]) },
                    message: match[4].trim(),
                    severity: match[3] === 'Error' ? 'error' : 'warning',
                  };
                }
                return null;
              }).filter(Boolean);
              resolve(diagnostics);
            });
          });
          await fsPromises.unlink(tmpFile).catch(() => {});
          return result;
        } catch {
          await fsPromises.unlink(tmpFile).catch(() => {});
          return [];
        }
      }

      return [];
    } catch (err) {
      console.error('Lint error:', err);
      return [];
    }
  });

  ipcMain.handle('showPromptDialog', async (event, options) => {
    const { title, message, defaultValue } = options;
    const mainWindow = getMainWindow();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['OK', 'Cancel'],
      title: title,
      message: message,
      detail: defaultValue,
      noLink: true,
    });
    if (result.response === 0) {
      return defaultValue;
    }
    return null;
  });

  const _checkPort = (host, port, timeoutMs = 2000) => {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      let resolved = false;
      const finish = (result) => {
        if (!resolved) { resolved = true; socket.destroy(); resolve(result); }
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.once('timeout', () => finish(false));
      socket.connect(port, host);
    });
  };

  const LOCAL_PROVIDER_CONFIG = {
    ollama:   { port: 11434, tagsUrl: 'http://127.0.0.1:11434/api/tags',       modelsKey: 'models',  nameKey: 'name'  },
    lmstudio: { port: 1234,  tagsUrl: 'http://127.0.0.1:1234/v1/models',       modelsKey: 'data',    nameKey: 'id'    },
    llamacpp: { port: 8080,  tagsUrl: 'http://127.0.0.1:8080/v1/models',       modelsKey: 'data',    nameKey: 'id'    },
    omlx:     { port: 8000,  tagsUrl: 'http://127.0.0.1:8000/v1/models',       modelsKey: 'data',    nameKey: 'id'    },
  };

  ipcMain.handle('scan-local-models', async (event, provider) => {
    try {
        const homeDir = os.homedir();
        const ollamaModels = process.env.OLLAMA_MODELS || path.join(homeDir, '.ollama', 'models');
        const scanDirs = [
            path.join(ollamaModels, 'blobs'),
            path.join(homeDir, '.cache', 'lm-studio', 'models'),
            path.join(homeDir, '.lmstudio', 'models'),
            path.join(homeDir, 'LM Studio', 'models'),
            path.join(homeDir, '.cache', 'huggingface', 'hub'),
            path.join(homeDir, '.incognide', 'models'),
            path.join(homeDir, 'models'),
        ];

        const models = [];
        const seenPaths = new Set();

        const scanDir = async (dir, depth = 0) => {
            if (depth > 4) return;
            try {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    try {
                        const stats = await fsPromises.stat(fullPath);
                        if (stats.isDirectory() && !entry.name.startsWith('.git') && entry.name !== 'node_modules') {
                            await scanDir(fullPath, depth + 1);
                        } else if (stats.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if ((ext === '.gguf' || ext === '.ggml') && stats.size > 50 * 1024 * 1024 && !seenPaths.has(fullPath)) {
                                seenPaths.add(fullPath);
                                models.push({ name: entry.name, path: fullPath, size: stats.size, modified_at: stats.mtime.toISOString() });
                            }
                        }
                    } catch {}
                }
            } catch {}
        };

        const filterDirs = provider && LOCAL_PROVIDER_CONFIG[provider]
            ? scanDirs.filter(d => {
                const dl = d.toLowerCase().replace(/\\/g, '/');
                return dl.includes(provider === 'lmstudio' ? 'lm-studio' : provider);
              })
            : scanDirs;

        for (const dir of (filterDirs.length ? filterDirs : scanDirs)) {
            await scanDir(dir);
        }

        const cfg = provider && LOCAL_PROVIDER_CONFIG[provider];
        if (cfg && cfg.tagsUrl) {
            try {
                const res = await fetch(cfg.tagsUrl, { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const data = await res.json();
                    const apiModels = (data[cfg.modelsKey] || []).map(m => ({
                        name: m[cfg.nameKey],
                        path: null,
                        source: 'api',
                    }));
                    for (const m of apiModels) {
                        if (m.name && !models.some(x => x.name === m.name)) {
                            models.push(m);
                        }
                    }
                }
            } catch {}
        }

        return { models };
    } catch (err) {
        console.error('Error scanning local models:', err);
        return { models: [], error: err.message };
    }
  });

  ipcMain.handle('get-local-model-status', async (event, provider) => {
    try {
        const cfg = LOCAL_PROVIDER_CONFIG[provider];
        if (!cfg) return { running: false, installed: false, error: `Unknown provider: ${provider}` };

        let running = false;
        if (cfg.tagsUrl) {
            try {
                const res = await fetch(cfg.tagsUrl, { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const data = await res.json();
                    const models = data[cfg.modelsKey] || data.models || data.data;
                    if (Array.isArray(models)) running = true;
                }
            } catch {}
        }

        const isMac = process.platform === 'darwin';
        const isWin = process.platform === 'win32';
        const home = os.homedir();
        const extraBinDirs = isWin ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.local', 'bin'), path.join(home, 'bin')];
        const hasBin = (name) => {
            try { execSync(`${isWin ? 'where' : 'which'} ${name}`, { stdio: 'ignore', timeout: 2000 }); return true; } catch {}
            const suf = isWin ? '.exe' : '';
            return extraBinDirs.some(d => { try { return fs.existsSync(path.join(d, name + suf)); } catch { return false; } });
        };
        const appExists = (app) => {
            if (!isMac) return false;
            try { return fs.existsSync(`/Applications/${app}`) || fs.existsSync(path.join(home, 'Applications', app)); } catch { return false; }
        };

        let installed = running;
        if (!installed) {
            if (provider === 'ollama') {
                installed = hasBin('ollama') || appExists('Ollama.app');
            } else if (provider === 'lmstudio') {
                installed = hasBin('lms') || appExists('LM Studio.app');
            } else if (provider === 'llamacpp') {
                installed = hasBin('llama-server') || hasBin('llama-cli') || hasBin('koboldcpp');
            } else if (provider === 'omlx') {
                installed = hasBin('omlx') || appExists('oMLX.app') || appExists('OMLX.app');
            }
        }

        return { running, installed };
    } catch (err) {
        console.error('Error getting local model status:', err);
        return { running: false, installed: false, error: err.message };
    }
  });

  ipcMain.handle('scan-gguf-models', async (event, directory) => {
    try {
        const homeDir = os.homedir();

        const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

        const ollamaModels = process.env.OLLAMA_MODELS || path.join(homeDir, '.ollama', 'models');
        const hfCache = process.env.HF_HOME || process.env.HUGGINGFACE_HUB_CACHE || path.join(homeDir, '.cache', 'huggingface', 'hub');

        const defaultDirs = [
            hfCache,

            path.join(homeDir, '.cache', 'lm-studio', 'models'),
            path.join(homeDir, '.lmstudio', 'models'),

            path.join(ollamaModels, 'blobs'),

            path.join(homeDir, '.local', 'share', 'gpt4all'),
            path.join(localAppData, 'nomic.ai', 'GPT4All', 'models'),
            path.join(localAppData, 'nomic.ai', 'GPT4All'),

            path.join(homeDir, 'jan', 'models'),

            path.join(appData, 'Msty', 'models'),

            path.join(homeDir, 'llama.cpp', 'models'),
            path.join(homeDir, '.local', 'share', 'llama.cpp', 'models'),

            path.join(homeDir, 'koboldcpp', 'models'),

            path.join(homeDir, 'text-generation-webui', 'models'),

            path.join(homeDir, '.incognide', 'models', 'gguf'),
            path.join(homeDir, '.incognide', 'models'),
            path.join(homeDir, 'models'),
            path.join(homeDir, 'Models'),
        ];

        const dirsToScan = directory
            ? [directory.replace(/^~/, homeDir)]
            : defaultDirs;

        const models = [];
        const seenPaths = new Set();

        const scanDirectory = async (dir, depth = 0) => {
            if (depth > 5) return;
            try {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    try {
                        const stats = await fsPromises.stat(fullPath);
                        if (stats.isDirectory()) {

                            if (!entry.name.startsWith('.git') && entry.name !== 'node_modules') {
                                await scanDirectory(fullPath, depth + 1);
                            }
                        } else if (stats.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (ext === '.gguf' || ext === '.ggml' || ext === '.bin') {

                                if (ext === '.bin' && entry.name.length < 10) continue;

                                if (!seenPaths.has(fullPath)) {
                                    seenPaths.add(fullPath);

                                    if (stats.size > 50 * 1024 * 1024) {
                                        models.push({
                                            name: entry.name,
                                            filename: entry.name,
                                            path: fullPath,
                                            size: stats.size,
                                            modified_at: stats.mtime.toISOString(),
                                            source: (() => {
                                                    const d = dir.replace(/\\/g, '/').toLowerCase();
                                                    if (d.includes('huggingface')) return 'HuggingFace';
                                                    if (d.includes('lm-studio') || d.includes('lmstudio')) return 'LM Studio';
                                                    if (d.includes('llama.cpp')) return 'llama.cpp';
                                                    if (d.includes('koboldcpp')) return 'KoboldCPP';
                                                    if (d.includes('ollama')) return 'Ollama';
                                                    if (d.includes('gpt4all') || d.includes('nomic.ai')) return 'GPT4All';
                                                    if (d.includes('text-generation-webui')) return 'oobabooga';
                                                    if (d.includes('/jan/')) return 'Jan';
                                                    if (d.includes('msty')) return 'Msty';
                                                    return 'Local';
                                                })()
                                        });
                                    }
                                }
                            }
                        }
                    } catch (statErr) {

                    }
                }
            } catch (err) {

            }
        };

        for (const dir of dirsToScan) {
            await scanDirectory(dir);
        }

        models.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));

        return {
            models,
            scannedDirectories: dirsToScan.filter(d => {
                try {
                    fs.accessSync(d);
                    return true;
                } catch { return false; }
            })
        };
    } catch (err) {
        console.error('Error scanning GGUF models:', err);
        return { models: [], error: err.message };
    }
  });

  ipcMain.handle('browse-gguf-file', async (event) => {
    try {
        const mainWindow = getMainWindow();
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select GGUF/GGML Model File',
            filters: [
                { name: 'GGUF/GGML Models', extensions: ['gguf', 'ggml', 'bin'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths[0]) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        const stats = await fsPromises.stat(filePath);
        const filename = path.basename(filePath);

        return {
            success: true,
            model: {
                name: filename,
                filename: filename,
                path: filePath,
                size: stats.size,
                modified_at: stats.mtime.toISOString(),
                source: 'Manual'
            }
        };
    } catch (err) {
        console.error('Error browsing for GGUF file:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('download-hf-model', async (event, { url, targetDir }) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/hf/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, target_dir: targetDir })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error downloading HF model:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('search-hf-models', async (event, { query, limit = 20 }) => {
    try {
        const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${limit}&sort=downloads&direction=-1`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HuggingFace API returned HTTP ${response.status}`);
        const data = await response.json();
        return { models: Array.isArray(data) ? data : [] };
    } catch (err) {
        console.error('Error searching HF models:', err);
        return { models: [], error: err.message };
    }
  });

  ipcMain.handle('list-hf-files', async (event, { repoId }) => {
    try {
        const url = `https://huggingface.co/api/models/${encodeURIComponent(repoId)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HuggingFace API returned HTTP ${response.status}`);
        const data = await response.json();
        const files = (data.siblings || []).map(f => ({
            rfilename: f.rfilename,
            size: f.size,
            blob_id: f.blob_id,
            lfs: f.lfs,
        }));
        return { files };
    } catch (err) {
        console.error('Error listing HF files:', err);
        return { files: [], error: err.message };
    }
  });

  ipcMain.handle('download-hf-file', async (event, { repoId, filename, targetDir }) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/hf/download_file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repoId, filename, target_dir: targetDir })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error downloading HF file:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('track-activity', async (event, activity) => {
    try {
        await dbQuery(
            `INSERT INTO activity_log (activity_type, activity_data, directory_path, npc, device_id, session_id, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                activity.type || 'unknown',
                JSON.stringify(activity.data || {}),
                activity.directoryPath || null,
                activity.npc || null,
                activity.deviceId || null,
                activity.sessionId || null,
                new Date().toISOString()
            ]
        );
        return { success: true };
    } catch (err) {
        console.error('Error tracking activity:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('get-activity-predictions', async (event) => {
    try {
        const [browserRows, commandRows, jinxRows, memoryRows, activityRows] = await Promise.all([
            dbQuery(`SELECT title, url, MAX(last_visited) as timestamp, 'website_visit' as type FROM browser_history GROUP BY url ORDER BY timestamp DESC LIMIT 200`).catch(() => []),
            dbQuery(`SELECT command, timestamp, 'terminal_command' as type FROM command_history ORDER BY timestamp DESC LIMIT 200`).catch(() => []),
            dbQuery(`SELECT jinx_name, timestamp, 'jinx_execution' as type FROM jinx_executions ORDER BY timestamp DESC LIMIT 200`).catch(() => []),
            dbQuery(`SELECT initial_memory, npc, timestamp, 'memory_created' as type FROM memory_lifecycle ORDER BY timestamp DESC LIMIT 100`).catch(() => []),
            dbQuery(`SELECT activity_type, activity_data, timestamp, npc FROM activity_log ORDER BY timestamp DESC LIMIT 200`).catch(() => []),
        ]);

        const recentActivities = [
            ...browserRows.map(r => ({ type: r.type, data: { url: r.url, title: r.title }, timestamp: r.timestamp })),
            ...commandRows.map(r => ({ type: r.type, data: { command: r.command }, timestamp: r.timestamp })),
            ...jinxRows.map(r => ({ type: r.type, data: { command: r.jinx_name }, timestamp: r.timestamp })),
            ...memoryRows.map(r => ({ type: r.type, data: { memory: r.initial_memory, npc: r.npc }, timestamp: r.timestamp })),
            ...activityRows.map(r => { let d = {}; try { d = JSON.parse(r.activity_data || '{}'); } catch {} return { type: r.activity_type, data: d, timestamp: r.timestamp }; }),
        ].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).slice(0, 100);

        const domainCounts = {};
        for (const r of browserRows) {
            try { const h = new URL(r.url).hostname; domainCounts[h] = (domainCounts[h] || 0) + 1; } catch {}
        }
        const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const hourCounts = {};
        for (const r of recentActivities) {
            if (r.timestamp) { const h = new Date(r.timestamp).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; }
        }
        const peakHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).map(([h]) => parseInt(h));

        let ssmPredictions = [];
        try {
            ssmPredictions = await _predictWithSSM();
        } catch (ssmErr) {
            console.error('SSM prediction failed:', ssmErr);
        }

        const predictions = [
            ...ssmPredictions,
            ...topDomains.map(([domain, count]) => ({
                type: 'pattern',
                title: `Frequent site: ${domain}`,
                description: `Visited ${count} times recently`,
                confidence: Math.min(count / 50, 0.99)
            })),
        ];

        return {
            predictions,
            stats: {
                totalActivities: recentActivities.length,
                mostCommonPatterns: topDomains.map(([d, c]) => ({ pattern: [d], count: c, avgDuration: 0 })),
                peakHours
            },
            recentActivities,
            memoryCount: memoryRows.length
        };
    } catch (err) {
        console.error('Error getting activity data from local DB:', err);
        return { predictions: [], stats: null, recentActivities: [], error: err.message };
    }
  });

  async function _readActivitySettings() {
      try {
          const rcPath = path.join(os.homedir(), '.incogniderc');
          const content = await fsPromises.readFile(rcPath, 'utf8');
          const settings = {};
          for (const line of content.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const stripped = trimmed.replace(/^export\s+/, '');
              const eqIdx = stripped.indexOf('=');
              if (eqIdx === -1) continue;
              const key = stripped.slice(0, eqIdx).trim();
              let val = stripped.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                  val = val.slice(1, -1);
              }
              settings[key] = val;
          }
          return {
              enabled: settings.INCOGNIDE_ACTIVITY_INTELLIGENCE_ENABLED === 'true' || settings.INCOGNIDE_ACTIVITY_INTELLIGENCE_ENABLED === '1',
              base_repo_id: settings.INCOGNIDE_ACTIVITY_BASE_REPO || '',
          };
      } catch {
          return { enabled: false, base_repo_id: '' };
      }
  }

  async function _predictWithSSM() {
      const { enabled } = await _readActivitySettings();
      if (!enabled) return [];

      try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          const daemonPort = state?.[0]?.port;
          if (!daemonPort) {
              console.error('[activity] Daemon not running, cannot predict');
              return [];
          }
          const res = await fetch(`http://127.0.0.1:${daemonPort}/activity_intelligence/predict`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
              signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) {
              console.error('[activity] Daemon predict HTTP error:', res.status);
              return [];
          }
          const result = await res.json();
          if (result.status !== 'ok' || result.error) {
              console.log('[activity] SSM predict returned error:', result.error || result.message);
              return [];
          }
          const out = [];
          if (result.predicted_action) {
              out.push({
                  type: 'suggestion',
                  title: `Next: ${result.predicted_action.replace(/_/g, ' ')}`,
                  description: 'SSM-based prediction from activity sequence',
                  confidence: result.confidence || 0.5,
                  predictedAction: result.predicted_action,
                  top3: result.top_3 || []
              });
          }
          return out;
      } catch (err) {
          console.error('[activity] SSM predict daemon error:', err.message);
          return [];
      }
  }

  ipcMain.handle('train-activity-model', async (event, { mode = 'full' } = {}) => {
      const { enabled } = await _readActivitySettings();
      if (!enabled) return { success: false, error: 'Activity intelligence is disabled in settings' };

      try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          const daemonPort = state?.[0]?.port;
          if (!daemonPort) {
              return { success: false, error: 'Daemon not running' };
          }

          const rows = await dbQuery(
            `SELECT id FROM scheduled_jobs WHERE job_type = 'activity_intelligence' LIMIT 1`
          );
          let jobId;
          if (!rows.length) {
              jobId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const { base_repo_id } = await _readActivitySettings();
              await dbQuery(
                `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                 VALUES (?, ?, 'activity_intelligence', '0 0 1 1 *', ?, 0, datetime('now'), datetime('now'))`,
                [
                  jobId,
                  'Activity Intelligence (ad-hoc)',
                  JSON.stringify({ mode, baseRepoId: base_repo_id || null }),
                ]
              );
          } else {
              jobId = rows[0].id;
          }

          const res = await fetch(`http://127.0.0.1:${daemonPort}/run_now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
              signal: AbortSignal.timeout(5000),
          });
          return await res.json();
      } catch (err) {
          console.error('[activity] train-activity-model error:', err);
          return { success: false, error: err.message };
      }
  });


  async function _readPredictiveSettings() {
      try {
          const rcPath = path.join(os.homedir(), '.incogniderc');
          const content = await fsPromises.readFile(rcPath, 'utf8');
          const settings = {};
          for (const line of content.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const stripped = trimmed.replace(/^export\s+/, '');
              const eqIdx = stripped.indexOf('=');
              if (eqIdx === -1) continue;
              const key = stripped.slice(0, eqIdx).trim();
              let val = stripped.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                  val = val.slice(1, -1);
              }
              settings[key] = val;
          }
          return {
              enabled: settings.INCOGNIDE_PREDICTIVE_TEXT_ENABLED === 'true' || settings.INCOGNIDE_PREDICTIVE_TEXT_ENABLED === '1',
          };
      } catch {
          return { enabled: false };
      }
  }

  ipcMain.handle('get-autocomplete-suggestions', async (event, { context = '', maxLength = 20 } = {}) => {
      const { enabled } = await _readPredictiveSettings();
      if (!enabled) return { suggestions: [] };

      try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          const daemonPort = state?.[0]?.port;
          if (!daemonPort) {
              console.error('[autocomplete] Daemon not running, cannot predict');
              return { suggestions: [] };
          }
          const res = await fetch(`http://127.0.0.1:${daemonPort}/autocomplete/predict`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ context, maxLength }),
              signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) {
              console.error('[autocomplete] Daemon predict HTTP error:', res.status);
              return { suggestions: [] };
          }
          const result = await res.json();
          if (result.status !== 'ok' || result.error) {
              console.log('[autocomplete] predict returned error:', result.error || result.message);
              return { suggestions: [] };
          }
          return {
              suggestions: [{
                  text: result.completion || '',
                  confidence: result.confidence || 0.5,
              }],
          };
      } catch (err) {
          console.error('[autocomplete] predict daemon error:', err.message);
          return { suggestions: [] };
      }
  });

  ipcMain.handle('train-autocomplete-model', async (event, { mode = 'full' } = {}) => {
      const { enabled } = await _readPredictiveSettings();
      if (!enabled) return { success: false, error: 'Predictive text is disabled in settings' };

      try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          const daemonPort = state?.[0]?.port;
          if (!daemonPort) {
              return { success: false, error: 'Daemon not running' };
          }

          const rows = await dbQuery(
            `SELECT id FROM scheduled_jobs WHERE job_type = 'autocomplete' LIMIT 1`
          );
          let jobId;
          if (!rows.length) {
              jobId = `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              await dbQuery(
                `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                 VALUES (?, ?, 'autocomplete', '0 0 1 1 *', ?, 0, datetime('now'), datetime('now'))`,
                [
                  jobId,
                  'Autocomplete (ad-hoc)',
                  JSON.stringify({ mode }),
                ]
              );
          } else {
              jobId = rows[0].id;
          }

          const res = await fetch(`http://127.0.0.1:${daemonPort}/run_now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
              signal: AbortSignal.timeout(5000),
          });
          return await res.json();
      } catch (err) {
          console.error('[autocomplete] train-autocomplete-model error:', err);
          return { success: false, error: err.message };
      }
  });


  async function _readKGSettings() {
      try {
          const rcPath = path.join(os.homedir(), '.incogniderc');
          const content = await fsPromises.readFile(rcPath, 'utf8');
          const settings = {};
          for (const line of content.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const stripped = trimmed.replace(/^export\s+/, '');
              const eqIdx = stripped.indexOf('=');
              if (eqIdx === -1) continue;
              const key = stripped.slice(0, eqIdx).trim();
              let val = stripped.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                  val = val.slice(1, -1);
              }
              settings[key] = val;
          }
          return {
              enabled: settings.INCOGNIDE_KG_ENABLED === 'true' || settings.INCOGNIDE_KG_ENABLED === '1',
          };
      } catch {
          return { enabled: false };
      }
  }

  ipcMain.handle('kg:evolve', async (event, { full = false } = {}) => {
      const { enabled } = await _readKGSettings();
      if (!enabled) return { success: false, error: 'Knowledge graph is disabled in settings' };
      try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          const daemonPort = state?.[0]?.port;
          if (!daemonPort) return { success: false, error: 'Daemon not running' };
          const rows = await dbQuery(`SELECT id FROM scheduled_jobs WHERE job_type = 'knowledge_graph' LIMIT 1`);
          let jobId;
          if (!rows.length) {
              jobId = `kg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              await dbQuery(
                `INSERT INTO scheduled_jobs (id, name, job_type, schedule, payload, enabled, created_at, updated_at)
                 VALUES (?, ?, 'knowledge_graph', '0 0 1 1 *', ?, 0, datetime('now'), datetime('now'))`,
                [jobId, 'KG Evolve (ad-hoc)', JSON.stringify({ full })]
              );
          } else {
              jobId = rows[0].id;
          }
          const res = await fetch(`http://127.0.0.1:${daemonPort}/run_now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
              signal: AbortSignal.timeout(5000),
          });
          return await res.json();
      } catch (err) {
          console.error('[kg] evolve error:', err);
          return { success: false, error: err.message };
      }
  });

  const finetuneJobsDir = path.join(INCOGNIDE_HOME, 'finetune_jobs');

  function resolveFinetuneHelper(scriptName) {
    const { app } = require('electron');
    const candidates = [
      path.resolve(__dirname, '..', '..', 'resources', scriptName),
      path.join(process.resourcesPath || '', scriptName),
      path.join(app.getAppPath(), 'resources', scriptName),
    ];
    return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  }

  async function spawnFinetuneJob(scriptName, workspacePath, jobPayload) {
    const config = await _readPythonEnvConfig();
    const envConfig = config?.workspaces?.[workspacePath];
    const resolved = envConfig ? await resolvePythonPath(workspacePath, envConfig) : null;
    const pythonPath = resolved?.pythonPath;
    if (!pythonPath) {
      return { error: 'No Python environment configured for this workspace. Open Team Management → Python Env and create a venv with npcpy + torch + diffusers installed.' };
    }
    const scriptPath = resolveFinetuneHelper(scriptName);
    if (!scriptPath) return { error: `${scriptName} not found in resources` };

    const jobId = `ft_${Date.now()}`;
    const jobDir = path.join(finetuneJobsDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });
    const statusFile = path.join(jobDir, 'status.json');

    const payload = { ...jobPayload, job_id: jobId, status_file: statusFile };

    const proc = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: true,
    });
    try {
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    } catch (err) {
      return { error: `Failed to start helper: ${err.message}` };
    }
    proc.unref();

    await fsPromises.writeFile(statusFile, JSON.stringify({ status: 'running', job_id: jobId, start_time: new Date().toISOString() }));
    return { job_id: jobId, status_file: statusFile };
  }

  async function readFinetuneStatus(jobId) {
    const statusFile = path.join(finetuneJobsDir, jobId, 'status.json');
    try {
      const raw = await fsPromises.readFile(statusFile, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      return { error: `Status not available for job ${jobId}: ${err.message}` };
    }
  }

  ipcMain.handle('finetune-diffusers', async (event, params) => {
    try {
      const workspacePath = params.workspacePath || params.currentPath;
      if (params.schedule) {
        const id = generateId?.() || `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await dbQuery(
          `INSERT INTO scheduled_jobs (id, name, job_type, schedule, workspace_path, python_env_config, payload, enabled, created_at, updated_at)
           VALUES (?, ?, 'finetune_diffusers', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [
            id,
            params.name || `Diffusers fine-tune ${new Date().toLocaleString()}`,
            params.schedule,
            workspacePath,
            params.pythonEnvConfig ? JSON.stringify(params.pythonEnvConfig) : null,
            JSON.stringify({
              images: params.images,
              captions: params.captions,
              output_name: params.outputName,
              output_path: params.outputPath,
              epochs: params.epochs,
              batch_size: params.batchSize,
              learning_rate: params.learningRate,
            }),
          ]
        );
        try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          if (state?.[0]?.port) {
            await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
          }
        } catch {}
        return { scheduled: true, id };
      }
      return await spawnFinetuneJob('run_finetune_diffusers.py', workspacePath, {
        images: params.images,
        captions: params.captions,
        output_name: params.outputName,
        output_path: params.outputPath,
        epochs: params.epochs,
        batch_size: params.batchSize,
        learning_rate: params.learningRate,
      });
    } catch (error) {
      console.error('Finetune diffusers error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-finetune-status', async (event, jobId) => readFinetuneStatus(jobId));

  ipcMain.handle('finetune-instruction', async (event, params) => {
    try {
      const workspacePath = params.workspacePath || params.currentPath;
      if (params.schedule) {
        const id = generateId?.() || `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await dbQuery(
          `INSERT INTO scheduled_jobs (id, name, job_type, schedule, workspace_path, python_env_config, payload, enabled, created_at, updated_at)
           VALUES (?, ?, 'finetune_instruction', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [
            id,
            params.name || `Instruction fine-tune ${new Date().toLocaleString()}`,
            params.schedule,
            workspacePath,
            params.pythonEnvConfig ? JSON.stringify(params.pythonEnvConfig) : null,
            JSON.stringify(params),
          ]
        );
        try {
          const state = await dbQuery(`SELECT port FROM daemon_state WHERE id = 1`);
          if (state?.[0]?.port) {
            await fetch(`http://127.0.0.1:${state[0].port}/reload`, { method: 'POST', signal: AbortSignal.timeout(2000) });
          }
        } catch {}
        return { scheduled: true, id };
      }
      return await spawnFinetuneJob('run_finetune_instruction.py', workspacePath, params);
    } catch (error) {
      console.error('Finetune instruction error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-instruction-finetune-status', async (event, jobId) => readFinetuneStatus(jobId));

  ipcMain.handle('get-instruction-models', async (event, currentPath) => {
    try {
        const url = currentPath
            ? `${BACKEND_URL}/api/instruction_models?currentPath=${encodeURIComponent(currentPath)}`
            : `${BACKEND_URL}/api/instruction_models`;
        const response = await fetch(url);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get instruction models');
        }

        return await response.json();
    } catch (error) {
        console.error('Get instruction models error:', error);
        return { error: error.message, models: [] };
    }
  });

  ipcMain.handle('genetic-create-population', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/create_population`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create population');
        }

        return await response.json();
    } catch (error) {
        console.error('Create genetic population error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('genetic-evolve', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/evolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to evolve population');
        }

        return await response.json();
    } catch (error) {
        console.error('Evolve population error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('genetic-get-population', async (event, populationId) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/population/${populationId}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get population');
        }

        return await response.json();
    } catch (error) {
        console.error('Get population error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('genetic-list-populations', async (event) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/populations`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to list populations');
        }

        return await response.json();
    } catch (error) {
        console.error('List populations error:', error);
        return { error: error.message, populations: [] };
    }
  });

  ipcMain.handle('genetic-delete-population', async (event, populationId) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/population/${populationId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete population');
        }

        return await response.json();
    } catch (error) {
        console.error('Delete population error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('genetic-inject', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/genetic/inject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to inject individuals');
        }

        return await response.json();
    } catch (error) {
        console.error('Inject individuals error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('getDeviceInfo', async () => {
    return getOrCreateDeviceId();
  });

  ipcMain.handle('setDeviceName', async (_event, name) => {
    return updateDeviceConfig({ deviceName: name });
  });

  ipcMain.handle('getDeviceId', async () => {
    const config = getOrCreateDeviceId();
    return config.deviceId;
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
        log(`[UPDATE] Checking for updates. Current version: ${APP_VERSION}`);
        const response = await fetch(UPDATE_MANIFEST_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const manifest = await response.json();
        const latestVersion = manifest.version;

        const compareVersions = (a, b) => {
            const pa = a.split('.').map(Number);
            const pb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0;
                const nb = pb[i] || 0;
                if (na > nb) return 1;
                if (na < nb) return -1;
            }
            return 0;
        };

        const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;

        log(`[UPDATE] Latest version: ${latestVersion}, Has update: ${hasUpdate}`);

        const platform = process.platform;
        const arch = process.arch;
        let platformKey = 'macos-arm64';
        if (platform === 'win32') platformKey = 'windows-x64';
        else if (platform === 'linux') platformKey = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
        else if (platform === 'darwin') platformKey = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';

        const releaseUrl = manifest.downloads?.[platformKey] || 'https://storage.googleapis.com/incognide-executables/manifest.json';

        return {
            success: true,
            currentVersion: APP_VERSION,
            latestVersion,
            hasUpdate,
            releaseUrl,
            downloads: manifest.downloads || {},
        };
    } catch (err) {
        log(`[UPDATE] Error checking for updates: ${err.message}`);
        return { success: false, error: err.message, currentVersion: APP_VERSION };
    }
  });

  ipcMain.handle('get-app-version', () => APP_VERSION);

  ipcMain.handle('download-and-install-update', async (event, { releaseUrl }) => {
    try {
      log(`[UPDATE] Downloading update from: ${releaseUrl}`);
      const tmpDir = path.join(os.tmpdir(), 'incognide-update');
      await fsPromises.mkdir(tmpDir, { recursive: true });

      const fileName = path.basename(new URL(releaseUrl).pathname) || 'incognide-update';
      const filePath = path.join(tmpDir, fileName);

      const response = await fetch(releaseUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
      let receivedBytes = 0;
      const fileStream = fs.createWriteStream(filePath);

      await new Promise((resolve, reject) => {
        response.body.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0) {
            const progress = Math.round((receivedBytes / totalBytes) * 100);
            event.sender.send('update-download-progress', { progress, receivedBytes, totalBytes });
          }
        });
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });

      log(`[UPDATE] Downloaded to: ${filePath}`);

      const platform = process.platform;
      if (platform === 'darwin' && filePath.endsWith('.dmg')) {

        spawn('open', [filePath], { detached: true, stdio: 'ignore' });
      } else if (platform === 'win32') {
        spawn(filePath, [], { detached: true, stdio: 'ignore' });
      } else if (platform === 'linux') {

        if (filePath.endsWith('.AppImage')) {
          await fsPromises.chmod(filePath, '755');
          spawn(filePath, [], { detached: true, stdio: 'ignore' });
        } else {
          spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' });
        }
      }

      return { success: true, filePath };
    } catch (err) {
      log(`[UPDATE] Download error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('custom-providers:read', async () => {
    try {
      const filePath = path.join(INCOGNIDE_HOME, 'custom_providers.yaml');
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const parsed = yaml.load(content);
        return { providers: parsed?.providers || {} };
      } catch {
        return { providers: {} };
      }
    } catch (err) {
      return { error: err.message, providers: {} };
    }
  });

  ipcMain.handle('custom-providers:write', async (event, providers) => {
    try {
      const filePath = path.join(INCOGNIDE_HOME, 'custom_providers.yaml');
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      const content = yaml.dump({ providers: providers || {} }, { lineWidth: -1 });
      await fsPromises.writeFile(filePath, content, 'utf8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('teams:read', async () => {
    try {
      const filePath = path.join(INCOGNIDE_HOME, 'teams.yaml');
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      let teams = {};
      try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const parsed = yaml.load(content);
        teams = parsed?.teams || {};
      } catch {
      }
      for (const [key, teamPath] of Object.entries(teams)) {
        if (typeof teamPath === 'string') {
          teams[key] = teamPath.replace(/^~(?=\/|$)/, os.homedir());
        }
      }
      return { teams };
    } catch (err) {
      return { error: err.message, teams: {} };
    }
  });

  ipcMain.handle('teams:write', async (event, teams) => {
    try {
      const filePath = path.join(INCOGNIDE_HOME, 'teams.yaml');
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      const content = yaml.dump({ teams: teams || {} }, { lineWidth: -1 });
      await fsPromises.writeFile(filePath, content, 'utf8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('teams:scan', async (event, currentPath) => {
    try {
      const teamsPath = path.join(INCOGNIDE_HOME, 'teams.yaml');
      let registered = {};
      try {
        const content = await fsPromises.readFile(teamsPath, 'utf8');
        const parsed = yaml.load(content);
        registered = parsed?.teams || {};
      } catch {}

      const registeredPaths = new Set(Object.values(registered).map((t) => {
        return String(t || '').replace(/^~(?=\/|$)/, os.homedir());
      }));

      const discovered = [];
      const seen = new Set();

      const checkDir = async (dir, name) => {
        if (seen.has(dir)) return;
        if (registeredPaths.has(dir)) return;
        for (const rp of registeredPaths) {
          if (dir.startsWith(rp + path.sep) || rp.startsWith(dir + path.sep)) return;
        }

        const dirsToCheck = [dir];
        const npcTeamDir = path.join(dir, 'npc_team');
        try { await fsPromises.access(npcTeamDir); if (!seen.has(npcTeamDir) && !registeredPaths.has(npcTeamDir)) dirsToCheck.push(npcTeamDir); } catch {}

        for (const d of dirsToCheck) {
          if (registeredPaths.has(d) || seen.has(d)) continue;
          seen.add(d);

          let hasNpcs = false, hasCtx = false, hasJinxes = false, hasAgents = false, npcCount = 0, ctxName = '';
          try {
            const entries = await fsPromises.readdir(d);
            const npcFiles = entries.filter(f => f.endsWith('.npc'));
            const ctxFiles = entries.filter(f => f.endsWith('.ctx'));
            const hasMcpJson = entries.some(f => f === '.mcp.json' || f === '.mcp_servers.json' || f === 'mcp_servers.json');

            if (npcFiles.length > 0) { hasNpcs = true; npcCount = npcFiles.length; }
            if (ctxFiles.length > 0) { hasCtx = true; ctxName = ctxFiles[0].replace('.ctx', ''); }
            try { await fsPromises.access(path.join(d, 'jinxes')); hasJinxes = true; } catch {}
            try { await fsPromises.access(path.join(d, 'agents')); hasAgents = true; } catch {}
            try { const agMs = entries.filter(f => f.toLowerCase() === 'agents.md'); if (agMs.length > 0) hasAgents = true; } catch {}

            if (hasNpcs || hasCtx || hasJinxes || hasAgents || hasMcpJson) {
              discovered.push({ name: ctxName || name, path: d, hasNpcs, hasJinxes, hasCtx, hasAgents, npcCount });
            }
          } catch {}
        }
      };

      if (currentPath) {
        await checkDir(currentPath, path.basename(currentPath));
      }

      const wellKnown = [
        { name: 'incognide', dir: path.join(INCOGNIDE_HOME, 'npc_team') },
      ];
      for (const wk of wellKnown) {
        await checkDir(wk.dir, wk.name);
      }

      try {
        const incognideEntries = await fsPromises.readdir(INCOGNIDE_HOME);
        for (const entry of incognideEntries) {
          if (entry.startsWith('.') || entry === 'npc_team') continue;
          const subTeamDir = path.join(INCOGNIDE_HOME, entry, 'npc_team');
          await checkDir(subTeamDir, entry);
        }
      } catch {}

      if (currentPath) {
        try {
          const entries = await fsPromises.readdir(currentPath);
          for (const entry of entries) {
            if (entry.startsWith('.') || entry === 'node_modules') continue;
            const subTeamDir = path.join(currentPath, entry, 'npc_team');
            await checkDir(subTeamDir, entry);
          }
        } catch {}
      }

      return { discovered };
    } catch (err) {
      return { error: err.message, discovered: [] };
    }
  });
}

module.exports = { register, readPythonEnvConfig, resolvePythonPath };
