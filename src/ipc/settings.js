const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const { dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const fetch = require('node-fetch');

// ==================== PYTHON ENVIRONMENT CONFIG ====================
const pythonEnvConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'python_envs.json');

const ensurePythonEnvConfig = async () => {
  const dir = path.dirname(pythonEnvConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(pythonEnvConfigPath);
  } catch {
    await fsPromises.writeFile(pythonEnvConfigPath, JSON.stringify({ workspaces: {} }));
  }
};

// Read python env config
const readPythonEnvConfig = async () => {
  await ensurePythonEnvConfig();
  const content = await fsPromises.readFile(pythonEnvConfigPath, 'utf8');
  return JSON.parse(content);
};

// Write python env config
const writePythonEnvConfig = async (data) => {
  await ensurePythonEnvConfig();
  await fsPromises.writeFile(pythonEnvConfigPath, JSON.stringify(data, null, 2));
};

// ==================== TILE CONFIGURATION ====================
const tilesConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'tiles.json');

// Default tiles configuration
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

// Ensure tiles config file exists
const ensureTilesConfig = async () => {
  const dir = path.dirname(tilesConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(tilesConfigPath);
  } catch {
    await fsPromises.writeFile(tilesConfigPath, JSON.stringify(defaultTilesConfig, null, 2));
  }
};

// Read tiles config
const readTilesConfig = async () => {
  await ensureTilesConfig();
  const content = await fsPromises.readFile(tilesConfigPath, 'utf8');
  const config = JSON.parse(content);
  // Merge with defaults to ensure all default tiles exist
  const defaultIds = defaultTilesConfig.tiles.map(t => t.id);
  const existingIds = (config.tiles || []).map(t => t.id);
  // Add any missing default tiles
  for (const defaultTile of defaultTilesConfig.tiles) {
    if (!existingIds.includes(defaultTile.id)) {
      config.tiles = config.tiles || [];
      config.tiles.push(defaultTile);
    }
  }
  return config;
};

// Write tiles config
const writeTilesConfig = async (data) => {
  await ensureTilesConfig();
  await fsPromises.writeFile(tilesConfigPath, JSON.stringify(data, null, 2));
};

// ==================== TILE JINX SYSTEM ====================
const tileJinxDir = path.join(os.homedir(), '.npcsh', 'incognide', 'tiles');

// Map tile names to their source component files
// Each jinx file contains the FULL component source code
// Bottom grid tiles - 2x2 grid only
// Moved: settings/env to top bar, npc/jinx to bottom right, graph/browsergraph/disk/team elsewhere
const tileSourceMap = {
  'db.jinx': { source: 'DBTool.tsx', label: 'DB Tool', icon: 'Database', order: 0 },
  'photo.jinx': { source: 'PhotoViewer.tsx', label: 'Photo', icon: 'Image', order: 1 },
  'library.jinx': { source: 'LibraryViewer.tsx', label: 'Library', icon: 'BookOpen', order: 2 },
  'datadash.jinx': { source: 'DataDash.tsx', label: 'Data Dash', icon: 'BarChart3', order: 3 },
};

// Components directory path
const componentsDir = path.join(__dirname, '..', 'renderer', 'components');

// Generate jinx header with metadata
const generateJinxHeader = (meta) => `/**
 * @jinx tile.${meta.filename.replace('.jinx', '')}
 * @label ${meta.label}
 * @icon ${meta.icon}
 * @order ${meta.order}
 * @enabled true
 */

`;

// Ensure tile jinx directory exists with defaults
const ensureTileJinxDir = async () => {
  await fsPromises.mkdir(tileJinxDir, { recursive: true });

  // Write default jinx files from actual component source
  // Sync if source is newer than jinx file
  for (const [filename, meta] of Object.entries(tileSourceMap)) {
    const jinxPath = path.join(tileJinxDir, filename);
    const sourcePath = path.join(componentsDir, meta.source);

    try {
      // Check if source exists
      const sourceStats = await fsPromises.stat(sourcePath);

      let shouldWrite = false;
      try {
        const jinxStats = await fsPromises.stat(jinxPath);
        // Jinx exists - check if source is newer
        if (sourceStats.mtime > jinxStats.mtime) {
          console.log(`[Tiles] Source ${meta.source} is newer than ${filename}, syncing...`);
          shouldWrite = true;
        }
      } catch {
        // Jinx doesn't exist, create it
        shouldWrite = true;
      }

      if (shouldWrite) {
        const sourceCode = await fsPromises.readFile(sourcePath, 'utf8');
        const header = generateJinxHeader({ ...meta, filename });
        await fsPromises.writeFile(jinxPath, header + sourceCode);
        console.log(`[Tiles] Wrote ${filename} from ${meta.source}`);
      }
    } catch (err) {
      console.warn(`Could not sync ${filename} from ${meta.source}:`, err.message);
    }
  }
};

// Cache directory for compiled jinx files
const tileJinxCacheDir = path.join(tileJinxDir, '.cache');

// Compile a single jinx file to cached JS
const compileJinxFile = async (jinxFilename) => {
  const ts = require('typescript');
  const jinxPath = path.join(tileJinxDir, jinxFilename);
  const cachePath = path.join(tileJinxCacheDir, jinxFilename.replace('.jinx', '.js'));

  try {
    // Read source
    const source = await fsPromises.readFile(jinxPath, 'utf8');

    // Find exported component name
    const exportMatch = source.match(/export\s+default\s+(\w+)\s*;?\s*$/m);
    const exportFuncMatch = source.match(/export\s+default\s+(?:function|const)\s+(\w+)/);
    const componentName = exportMatch?.[1] || exportFuncMatch?.[1] || 'Component';

    // Clean source: remove JSDoc metadata and imports
    let cleaned = source.replace(/\/\*\*[\s\S]*?\*\/\s*\n?/, '');
    cleaned = cleaned.replace(/^#[^\n]*\n/gm, '');
    cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, '');
    cleaned = cleaned.replace(/^export\s+(default\s+)?/gm, '');

    // Compile TypeScript
    const result = ts.transpileModule(cleaned, {
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
      const errors = result.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n');
      console.error(`Compile error in ${jinxFilename}:`, errors);
      return { success: false, error: errors };
    }

    // Clean compiled output
    let compiled = result.outputText;
    compiled = compiled.replace(/["']use strict["'];?\n?/g, '');
    compiled = compiled.replace(/Object\.defineProperty\(exports[\s\S]*?\);/g, '');
    compiled = compiled.replace(/exports\.\w+\s*=\s*/g, '');
    compiled = compiled.replace(/exports\.default\s*=\s*\w+;?/g, '');
    compiled = compiled.replace(/(?:var|const|let)\s+\w+\s*=\s*require\([^)]+\);?\n?/g, '');
    compiled = compiled.replace(/require\([^)]+\)/g, '{}');
    compiled = compiled.replace(/\w+_\d+\.(\w+)/g, '$1');
    compiled = compiled.replace(/react_1\.(\w+)/g, '$1');

    // Wrap in module format with component name export
    const moduleCode = `// Compiled from ${jinxFilename}
// Component: ${componentName}
${compiled}
// Export component name for loader
var __componentName = "${componentName}";
var __component = ${componentName};
`;

    // Write to cache
    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });
    await fsPromises.writeFile(cachePath, moduleCode);

    console.log(`Compiled ${jinxFilename} -> ${componentName}`);
    return { success: true, componentName, cachePath };
  } catch (err) {
    console.error(`Failed to compile ${jinxFilename}:`, err.message);
    return { success: false, error: err.message };
  }
};

// Compile all jinx files (with mtime-based cache invalidation)
const compileAllJinxFiles = async () => {
  try {
    await ensureTileJinxDir();
    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });

    const files = await fsPromises.readdir(tileJinxDir);
    const jinxFiles = files.filter(f => f.endsWith('.jinx'));

    const results = [];
    for (const jinxFile of jinxFiles) {
      const jinxPath = path.join(tileJinxDir, jinxFile);
      const cachePath = path.join(tileJinxCacheDir, jinxFile.replace('.jinx', '.js'));

      try {
        const jinxStat = await fsPromises.stat(jinxPath);
        let needsCompile = true;

        try {
          const cacheStat = await fsPromises.stat(cachePath);
          // Only recompile if source is newer than cache
          needsCompile = jinxStat.mtimeMs > cacheStat.mtimeMs;
        } catch {
          // Cache doesn't exist, need to compile
        }

        if (needsCompile) {
          const result = await compileJinxFile(jinxFile);
          results.push({ file: jinxFile, ...result });
        } else {
          console.log(`Cache valid for ${jinxFile}, skipping compile`);
          results.push({ file: jinxFile, success: true, cached: true });
        }
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

// Track if we've done initial compile
let jinxInitialCompileDone = false;

// ==================== VERSION / UPDATE ====================
const packageJson = require('../../package.json');
const APP_VERSION = packageJson.version;
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/npcww/npc-core/main/incognide/package.json';

// ==================== HELPER: resolvePythonPath ====================
// Helper to resolve Python path from config or detect from workspace
const resolvePythonPath = async (workspacePath, envConfig, getBackendPythonPath) => {
  const platform = process.platform;
  const isWindows = platform === 'win32';
  const pythonBin = isWindows ? 'python.exe' : 'python';
  const pythonBin3 = isWindows ? 'python3.exe' : 'python3';

  // If we have a config, use it
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
      // pyenv stores versions in ~/.pyenv/versions/<version>/bin/python
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

  // Try to detect venv in workspace
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

  // Fall back to BACKEND_PYTHON_PATH (from first-run setup)
  const backendPython = getBackendPythonPath();
  if (backendPython) {
    return { pythonPath: backendPython };
  }

  // Fall back to system python
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
          registerGlobalShortcut, app, backendProcess, killBackendProcess,
          ensureUserDataDirectory, waitForServer, logBackend,
          logsDir, electronLogPath, backendLogPath,
          readPythonEnvConfig: ctxReadPythonEnvConfig } = ctx;

  // Use context-provided readPythonEnvConfig if available, otherwise use local
  const _readPythonEnvConfig = ctxReadPythonEnvConfig || readPythonEnvConfig;

  // ==================== SUBMIT MACRO ====================
  ipcMain.handle('submit-macro', async (event, command) => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.hide();
  });

  // ==================== SCREENSHOT CAPTURED ====================
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

  // ==================== CRON / DAEMONS ====================
  ipcMain.handle('getCronDaemons', () => {
    return {
      cronJobs: Array.from(cronJobs.values()).map(({task, ...rest}) => rest),
      daemons: Array.from(daemons.values()).map(({process, ...rest}) => rest)
    };
  });

  ipcMain.handle('addCronJob', (event, { path: jobPath, schedule, command, npc, jinx }) => {
    const id = generateId();
    const job = { id, path: jobPath, schedule, command, npc, jinx, task: null };
    scheduleCronJob(job);
    cronJobs.set(id, job);
    return { success: true, id };
  });

  ipcMain.handle('removeCronJob', (event, id) => {
    if (cronJobs.has(id)) {
      const job = cronJobs.get(id);
      if (job.task) job.task.stop();
      cronJobs.delete(id);
      return { success: true };
    } else {
      return { success: false, error: 'Cron job not found' };
    }
  });

  ipcMain.handle('addDaemon', (event, { path: daemonPath, name, command, npc, jinx }) => {
    const id = generateId();

    try {
      // Spawn daemon process, e.g., continuous process for your NPC jinxs or commands
      const proc = spawn(command, {
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      proc.unref();

      proc.stdout.on('data', data => {
        console.log(`[Daemon ${name} stdout]: ${data.toString()}`);
      });
      proc.stderr.on('data', data => {
        console.error(`[Daemon ${name} stderr]: ${data.toString()}`);
      });
      proc.on('exit', (code, signal) => {
        console.log(`[Daemon ${name}] exited with code ${code}, signal ${signal}`);
        // You may want to remove or restart
      });

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
        daemon.process.kill();
      }
      daemons.delete(id);
      return { success: true };
    }
    return { success: false, error: 'Daemon not found' };
  });

  // ==================== UPDATE SHORTCUT ====================
  ipcMain.handle('update-shortcut', (event, newShortcut) => {
    const rcPath = path.join(os.homedir(), '.npcshrc');
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

  // ==================== LOCAL MODEL DETECTION ====================
  ipcMain.handle('detect-local-models', async () => {
    const models = [];

    // Check Ollama directly (port 11434) — works even if backend isn't running
    try {
      const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        const modelNames = (data.models || []).map(m => m.name || m.model).filter(Boolean);
        models.push({ provider: 'ollama', available: true, models: modelNames });
      } else {
        models.push({ provider: 'ollama', available: false, models: [] });
      }
    } catch {
      models.push({ provider: 'ollama', available: false, models: [] });
    }

    // Check LM Studio (port 1234)
    try {
      const lmRes = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(3000) });
      if (lmRes.ok) {
        const data = await lmRes.json();
        const modelNames = (data.data || []).map(m => m.id).filter(Boolean);
        models.push({ provider: 'lmstudio', available: true, models: modelNames });
      } else {
        models.push({ provider: 'lmstudio', available: false, models: [] });
      }
    } catch {
      models.push({ provider: 'lmstudio', available: false, models: [] });
    }

    return { models };
  });

  // ==================== OLLAMA ====================
  ipcMain.handle('ollama:checkStatus', async () => {
    log('[Main Process] Checking Ollama status via backend...');
    return await callBackendApi(`${BACKEND_URL}/api/ollama/status`);
  });

  ipcMain.handle('ollama:install', async () => {
    log('[Main Process] Requesting Ollama installation from backend...');
    return await callBackendApi(`${BACKEND_URL}/api/ollama/install`, { method: 'POST' });
  });

  ipcMain.handle('ollama:getLocalModels', async () => {
    log('[Main Process] Fetching local Ollama models from backend...');
    return await callBackendApi(`${BACKEND_URL}/api/ollama/models`);
  });

  ipcMain.handle('ollama:deleteModel', async (event, { model }) => {
    log(`[Main Process] Requesting deletion of model: ${model}`);
    return await callBackendApi(`${BACKEND_URL}/api/ollama/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
    });
  });

  ipcMain.handle('ollama:pullModel', async (event, { model }) => {
    log(`[Main Process] Starting pull for model: ${model}`);
    try {
        const response = await fetch(`${BACKEND_URL}/api/ollama/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model }),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Backend error on pull start: ${errorText}`);
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
                        log(`[Ollama Pull] Received error from backend stream:`, progress.details);
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

  // ==================== PYTHON ENVIRONMENT HANDLERS ====================

  // Get Python environment config for a workspace
  ipcMain.handle('python-env-get', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      return config.workspaces[workspacePath] || null;
    } catch (err) {
      console.error('Error getting python env config:', err);
      return null;
    }
  });

  // Save Python environment config for a workspace
  ipcMain.handle('python-env-save', async (event, { workspacePath, envConfig }) => {
    try {
      const config = await _readPythonEnvConfig();
      config.workspaces[workspacePath] = {
        ...envConfig,
        updatedAt: Date.now()
      };
      await writePythonEnvConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error saving python env config:', err);
      return { success: false, error: err.message };
    }
  });

  // Delete Python environment config for a workspace
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

  // List all Python environment configs
  ipcMain.handle('python-env-list', async () => {
    try {
      const config = await _readPythonEnvConfig();
      return config.workspaces;
    } catch (err) {
      console.error('Error listing python env configs:', err);
      return {};
    }
  });

  // Detect available Python environments in a workspace
  ipcMain.handle('python-env-detect', async (event, { workspacePath }) => {
    const detected = [];
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const pythonBin = isWindows ? 'python.exe' : 'python';
    const pythonBin3 = isWindows ? 'python3.exe' : 'python3';

    // Check for venv/virtualenv patterns
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
          // Not found
        }
      }
    }

    // Check for uv-created .venv (same as venv but often in .venv)
    // uv uses standard venv structure, so it's already covered above

    // Check for pyenv - both local .python-version and globally installed versions
    const pyenvRoot = process.env.PYENV_ROOT || path.join(os.homedir(), '.pyenv');
    const pyenvVersionsDir = path.join(pyenvRoot, 'versions');

    // First check for local .python-version file (project-specific)
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
        // pyenv version file exists but version not installed
        detected.push({
          type: 'pyenv',
          name: `pyenv (${localPyenvVersion}) - not installed`,
          path: null,
          pyenvVersion: localPyenvVersion,
          notInstalled: true
        });
      }
    } catch {
      // No .python-version file - that's fine
    }

    // Also scan for all installed pyenv versions
    try {
      const versions = await fsPromises.readdir(pyenvVersionsDir);
      for (const version of versions) {
        // Skip if this is the local version (already added)
        if (version === localPyenvVersion) continue;

        // Skip non-version directories (like .DS_Store, envs, etc)
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
          // This version doesn't have python binary - skip
        }
      }
    } catch {
      // pyenv versions directory doesn't exist or not readable
    }

    // Check for conda environment.yml or environment.yaml
    const condaEnvFiles = ['environment.yml', 'environment.yaml'];
    for (const envFile of condaEnvFiles) {
      const envFilePath = path.join(workspacePath, envFile);
      try {
        const content = await fsPromises.readFile(envFilePath, 'utf8');
        // Simple YAML parsing to get name
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          const envName = nameMatch[1].trim();
          // Try common conda paths
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
              // Try next conda path
            }
          }
        }
      } catch {
        // No conda env file
      }
    }

    // Check for pyproject.toml with uv or poetry
    const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
    try {
      const content = await fsPromises.readFile(pyprojectPath, 'utf8');
      if (content.includes('[tool.uv]') || content.includes('uv.lock')) {
        // uv project - check for .venv
        const uvVenvPath = path.join(workspacePath, '.venv', isWindows ? 'Scripts' : 'bin', pythonBin);
        try {
          await fsPromises.access(uvVenvPath);
          // Only add if not already detected as venv
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
      // No pyproject.toml
    }

    // Check uv.lock file
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
      // No uv.lock
    }

    // Always add system Python as fallback
    detected.push({
      type: 'system',
      name: 'System Python',
      path: isWindows ? 'python' : 'python3'
    });

    return detected;
  });

  // Get the resolved Python path for running scripts
  ipcMain.handle('python-env-resolve', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      if (!envConfig) {
        // No config - return system python
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

  // Create a new virtual environment in the workspace
  ipcMain.handle('python-env-create', async (event, { workspacePath, venvName = '.venv', pythonPath = null }) => {
    try {
      const venvDir = path.join(workspacePath, venvName);

      // Check if venv already exists
      try {
        await fsPromises.access(venvDir);
        return { success: false, error: `Virtual environment '${venvName}' already exists` };
      } catch {
        // Good - venv doesn't exist
      }

      // Determine which python to use for creating the venv
      const isWindows = process.platform === 'win32';
      let pythonCmd = pythonPath || (isWindows ? 'python' : 'python3');

      return new Promise((resolve) => {
        // Create venv using python -m venv
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
            // Venv created successfully - auto-configure it
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

  // Check if Python environment is configured for a workspace
  ipcMain.handle('python-env-check-configured', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];
      return { configured: !!envConfig, config: envConfig };
    } catch (err) {
      return { configured: false, error: err.message };
    }
  });

  // List installed packages in the Python environment
  ipcMain.handle('python-env-list-packages', async (event, workspacePath) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      // Get the Python path for this workspace
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

  // Install a package in the Python environment
  ipcMain.handle('python-env-install-package', async (event, workspacePath, packageName, extraArgs = []) => {
    try {
      const config = await _readPythonEnvConfig();
      const envConfig = config.workspaces[workspacePath];

      const pythonInfo = await resolvePythonPath(workspacePath, envConfig, getBackendPythonPath);
      if (!pythonInfo?.pythonPath) {
        return { success: false, error: 'No Python environment configured' };
      }

      // Split package name in case multiple packages are passed
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

  // Uninstall a package from the Python environment
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

  // ==================== FIRST-RUN SETUP ====================

  // Check if first-run setup is needed
  ipcMain.handle('setup:checkNeeded', async () => {
    return { needed: needsFirstRunSetup() };
  });

  // Get current backend Python path
  ipcMain.handle('setup:getBackendPythonPath', async () => {
    const pythonPath = getBackendPythonPath();
    return { pythonPath };
  });

  // Detect available Python installations
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

    // Check for pyenv
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

    // Check for conda
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

  // Create the incognide venv for the backend
  ipcMain.handle('setup:createVenv', async () => {
    const venvDir = path.join(os.homedir(), '.npcsh', 'incognide', 'venv');

    try {
      // Create parent directory
      await fsPromises.mkdir(path.dirname(venvDir), { recursive: true });

      // Check if venv already exists
      try {
        await fsPromises.access(venvDir);
        // Venv exists - return its python path
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

  // Install npcpy and dependencies in a Python environment
  ipcMain.handle('setup:installNpcpy', async (event, { pythonPath, extras = 'local' }) => {
    if (!pythonPath) {
      return { success: false, error: 'No Python path provided' };
    }

    // Validate extras to prevent injection
    const validExtras = ['lite', 'local', 'yap', 'all'];
    const safeExtras = validExtras.includes(extras) ? extras : 'local';

    // Get the sender's webContents to stream updates
    const sender = event.sender;

    return new Promise((resolve) => {
      // Install npcpy with selected extras
      const args = ['-m', 'pip', 'install', '--upgrade', `npcpy[${safeExtras}]`];
      log(`[SETUP] Installing npcpy: ${pythonPath} ${args.join(' ')}`);

      const proc = spawn(pythonPath, args, {
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        log('[SETUP]', text.trim());
        // Stream to renderer
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:installProgress', { type: 'stdout', text: text.trim() });
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        log('[SETUP]', text.trim());
        // Stream to renderer (pip outputs progress to stderr)
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

  // Complete setup - save Python path and mark complete
  ipcMain.handle('setup:complete', async (event, { pythonPath }) => {
    try {
      if (pythonPath) {
        const saved = saveBackendPythonPath(pythonPath);
        if (!saved) {
          return { success: false, error: 'Failed to save Python path to .npcshrc' };
        }
      }

      markSetupComplete();
      return { success: true, message: 'Setup completed successfully' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Skip setup without configuring Python
  ipcMain.handle('setup:skip', async () => {
    markSetupComplete();
    return { success: true };
  });

  // Reset setup to allow re-running the wizard
  ipcMain.handle('setup:reset', async () => {
    const setupMarkerPath = path.join(os.homedir(), '.npcsh', 'incognide', '.setup_complete');
    try {
      await fsPromises.unlink(setupMarkerPath);
      return { success: true };
    } catch (err) {
      // File might not exist, that's fine
      return { success: true };
    }
  });

  // Restart backend with new Python path (for after setup)
  ipcMain.handle('setup:restartBackend', async () => {
    try {
      // Kill existing backend
      if (killBackendProcess) {
        killBackendProcess();
      }

      // Get the newly configured Python path
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

      newBackendProcess.stdout.on('data', (data) => {
        logBackend(`stdout: ${data.toString().trim()}`);
      });

      newBackendProcess.stderr.on('data', (data) => {
        logBackend(`stderr: ${data.toString().trim()}`);
      });

      const serverReady = await waitForServer();
      if (!serverReady) {
        return { success: false, error: 'Backend failed to start' };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==================== USER PROFILE ====================

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

  // ==================== TILE CONFIGURATION HANDLERS ====================

  // Get tiles configuration
  ipcMain.handle('tiles-config-get', async () => {
    try {
      return await readTilesConfig();
    } catch (err) {
      console.error('Error getting tiles config:', err);
      return defaultTilesConfig;
    }
  });

  // Save tiles configuration
  ipcMain.handle('tiles-config-save', async (event, config) => {
    try {
      await writeTilesConfig(config);
      return { success: true };
    } catch (err) {
      console.error('Error saving tiles config:', err);
      return { success: false, error: err.message };
    }
  });

  // Reset tiles to defaults
  ipcMain.handle('tiles-config-reset', async () => {
    try {
      await writeTilesConfig(defaultTilesConfig);
      return { success: true, config: defaultTilesConfig };
    } catch (err) {
      console.error('Error resetting tiles config:', err);
      return { success: false, error: err.message };
    }
  });

  // Add a custom tile
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

  // Remove a custom tile
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

  // ==================== TILE JINX HANDLERS ====================

  // List all tile jinx files (compiles on first access)
  ipcMain.handle('tile-jinx-list', async () => {
    try {
      await ensureTileJinxDir();

      // Compile on first access
      if (!jinxInitialCompileDone) {
        console.log('First jinx list request - compiling all jinx files...');
        const compileResult = await compileAllJinxFiles();
        if (compileResult.success) {
          const compiled = compileResult.results.filter(r => r.success && !r.cached).length;
          const cached = compileResult.results.filter(r => r.cached).length;
          const failed = compileResult.results.filter(r => !r.success).length;
          console.log(`Tile jinx compilation: ${compiled} compiled, ${cached} cached, ${failed} failed`);
        }
        jinxInitialCompileDone = true;
      }

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

  // Read a specific tile jinx
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

  // Write/update a tile jinx
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

  // Delete a tile jinx
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

  // Reset tile jinxes to defaults
  ipcMain.handle('tile-jinx-reset', async () => {
    try {
      // Delete all existing jinx files
      const files = await fsPromises.readdir(tileJinxDir);
      for (const file of files) {
        if (file.endsWith('.jinx')) {
          await fsPromises.unlink(path.join(tileJinxDir, file));
        }
      }
      // Recreate from source component files
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

  // Transform/check TSX code
  ipcMain.handle('transformTsx', async (event, code) => {
    try {
      const ts = require('typescript');

      // Transpile TypeScript to JavaScript (no imports/exports, just plain JS)
      const result = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.None,  // No module system - inline everything
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
          esModuleInterop: false,
          removeComments: true,
        },
        reportDiagnostics: true,
      });

      // Check for errors
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

  // Get compiled jinx code for a tile
  ipcMain.handle('tile-jinx-compiled', async (event, filename) => {
    try {
      const cachePath = path.join(tileJinxCacheDir, filename.replace('.jinx', '.js'));

      try {
        const compiled = await fsPromises.readFile(cachePath, 'utf8');
        return { success: true, compiled };
      } catch {
        // Cache miss - compile now
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

  // Force recompile all jinx files
  ipcMain.handle('tile-jinx-recompile', async () => {
    // Delete cache first
    try {
      const cacheFiles = await fsPromises.readdir(tileJinxCacheDir);
      for (const file of cacheFiles) {
        await fsPromises.unlink(path.join(tileJinxCacheDir, file));
      }
    } catch {}
    return compileAllJinxFiles();
  });

  // ==================== PROJECT / GLOBAL SETTINGS ====================

  ipcMain.handle('loadProjectSettings', async (event, currentPath) => {
    try {
        const url = `${BACKEND_URL}/api/settings/project?path=${encodeURIComponent(currentPath)}`;
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (err) {
        console.error('Error loading project settings in main:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('saveProjectSettings', async (event, { path: settingsPath, env_vars }) => {
    try {
        const url = `${BACKEND_URL}/api/settings/project?path=${encodeURIComponent(settingsPath)}`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ env_vars: env_vars })
        });
        return { success: true };
    } catch (err) {
        console.error('Error saving project settings in main:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('saveGlobalSettings', async (event, { global_settings, global_vars }) => {
    try {
        await fetch(`${BACKEND_URL}/api/settings/global`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                global_settings: global_settings,
                global_vars: global_vars,
            })
        });
        return { success: true };
    } catch (err) {
        console.error('Error saving global settings in main:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('loadGlobalSettings', async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/settings/global`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }
        return data;

      } catch (err) {
        console.error('Error loading global settings:', err);

      }
    }
  );

  // ==================== LOGS ====================

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
        // Read last 1000 lines
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

  // ==================== FILE STATS ====================

  ipcMain.handle('getFileStats', async (event, filePath) => {
    let resolvedPath = filePath;
    if (filePath.startsWith('~')) {
        resolvedPath = filePath.replace('~', os.homedir());
    }

    const stats = await fsPromises.stat(resolvedPath);
    return {
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.ctime
    };
  });

  // ==================== PROMPT DIALOG ====================

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

  // ==================== LOCAL MODEL STATUS / SCANNING ====================

  ipcMain.handle('scan-local-models', async (event, provider) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/local/scan?provider=${encodeURIComponent(provider)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error scanning local models:', err);
        return { models: [], error: err.message };
    }
  });

  ipcMain.handle('get-local-model-status', async (event, provider) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/local/status?provider=${encodeURIComponent(provider)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error getting local model status:', err);
        return { running: false, error: err.message };
    }
  });

  ipcMain.handle('scan-gguf-models', async (event, directory) => {
    try {
        const homeDir = os.homedir();

        // Default directories to scan for GGUF/GGML files
        const defaultDirs = [
            // HuggingFace cache (where transformers downloads GGUF files)
            path.join(homeDir, '.cache', 'huggingface', 'hub'),
            // LM Studio locations
            path.join(homeDir, '.cache', 'lm-studio', 'models'),
            path.join(homeDir, 'lm-studio', 'models'),
            path.join(homeDir, '.lmstudio', 'models'),
            path.join(homeDir, '.local', 'share', 'lmstudio', 'models'),
            // llama.cpp locations
            path.join(homeDir, 'llama.cpp', 'models'),
            path.join(homeDir, '.llama.cpp', 'models'),
            path.join(homeDir, '.local', 'share', 'llama.cpp', 'models'),
            // Kobold.cpp locations
            path.join(homeDir, 'koboldcpp', 'models'),
            path.join(homeDir, '.koboldcpp', 'models'),
            path.join(homeDir, '.local', 'share', 'koboldcpp', 'models'),
            // Ollama models (GGUF based)
            path.join(homeDir, '.ollama', 'models', 'blobs'),
            // GPT4All
            path.join(homeDir, '.cache', 'gpt4all'),
            path.join(homeDir, '.local', 'share', 'gpt4all'),
            // General model directories
            path.join(homeDir, '.npcsh', 'models', 'gguf'),
            path.join(homeDir, '.npcsh', 'models'),
            path.join(homeDir, 'models'),
            path.join(homeDir, 'Models'),
            // Text-generation-webui (oobabooga)
            path.join(homeDir, 'text-generation-webui', 'models'),
        ];

        // Directories to scan
        const dirsToScan = directory
            ? [directory.replace(/^~/, homeDir)]
            : defaultDirs;

        const models = [];
        const seenPaths = new Set();

        // Recursive function to find GGUF/GGML files (follows symlinks)
        const scanDirectory = async (dir, depth = 0) => {
            if (depth > 5) return; // Limit recursion depth
            try {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    // Use stat to follow symlinks (HuggingFace uses symlinks)
                    try {
                        const stats = await fsPromises.stat(fullPath);
                        if (stats.isDirectory()) {
                            // Skip some directories that are unlikely to have models
                            if (!entry.name.startsWith('.git') && entry.name !== 'node_modules') {
                                await scanDirectory(fullPath, depth + 1);
                            }
                        } else if (stats.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (ext === '.gguf' || ext === '.ggml' || ext === '.bin') {
                                // Skip .bin files that are too small (likely not models)
                                if (ext === '.bin' && entry.name.length < 10) continue;

                                if (!seenPaths.has(fullPath)) {
                                    seenPaths.add(fullPath);
                                    // Only include files larger than 50MB (likely actual models)
                                    if (stats.size > 50 * 1024 * 1024) {
                                        models.push({
                                            name: entry.name,
                                            filename: entry.name,
                                            path: fullPath,
                                            size: stats.size,
                                            modified_at: stats.mtime.toISOString(),
                                            source: dir.includes('.cache/huggingface') ? 'HuggingFace' :
                                                    dir.includes('lm-studio') || dir.includes('lmstudio') ? 'LM Studio' :
                                                    dir.includes('llama.cpp') ? 'llama.cpp' :
                                                    dir.includes('koboldcpp') ? 'KoboldCPP' :
                                                    dir.includes('ollama') ? 'Ollama' :
                                                    dir.includes('gpt4all') ? 'GPT4All' :
                                                    dir.includes('text-generation-webui') ? 'oobabooga' :
                                                    'Local'
                                        });
                                    }
                                }
                            }
                        }
                    } catch (statErr) {
                        // Skip broken symlinks or files we can't stat
                    }
                }
            } catch (err) {
                // Directory doesn't exist or can't be read - skip silently
            }
        };

        // Scan all directories
        for (const dir of dirsToScan) {
            await scanDirectory(dir);
        }

        // Sort by modification date (newest first)
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

  // Browse and select individual GGUF/GGML files
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

  // ==================== HUGGINGFACE ====================

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

  // Search HuggingFace for GGUF models
  ipcMain.handle('search-hf-models', async (event, { query, limit = 20 }) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/hf/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error searching HF models:', err);
        return { models: [], error: err.message };
    }
  });

  // List GGUF files in a HuggingFace repository
  ipcMain.handle('list-hf-files', async (event, { repoId }) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/models/hf/files?repo_id=${encodeURIComponent(repoId)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error listing HF files:', err);
        return { files: [], error: err.message };
    }
  });

  // Download a specific file from HuggingFace
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

  // ==================== ACTIVITY TRACKING ====================

  ipcMain.handle('track-activity', async (event, activity) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/activity/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activity)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error tracking activity:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('get-activity-predictions', async (event) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/activity/predictions`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error getting activity predictions:', err);
        return { predictions: [], error: err.message };
    }
  });

  ipcMain.handle('train-activity-model', async (event) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/activity/train`, { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error training activity model:', err);
        return { error: err.message };
    }
  });

  // ==================== ML / FINETUNING ====================

  ipcMain.handle('finetune-diffusers', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/finetune_diffusers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Finetuning failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Finetune diffusers error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('get-finetune-status', async (event, jobId) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/finetune_status/${jobId}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get finetune status');
        }

        return await response.json();
    } catch (error) {
        console.error('Get finetune status error:', error);
        return { error: error.message };
    }
  });

  // Instruction fine-tuning (SFT, USFT, DPO, memory_classifier)
  ipcMain.handle('finetune-instruction', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/finetune_instruction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Instruction finetuning failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Finetune instruction error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('get-instruction-finetune-status', async (event, jobId) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/finetune_instruction_status/${jobId}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get instruction finetune status');
        }

        return await response.json();
    } catch (error) {
        console.error('Get instruction finetune status error:', error);
        return { error: error.message };
    }
  });

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

  // ==================== GENETIC EVOLUTION ====================

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

  // ==================== DEVICE INFO ====================

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

  // ==================== VERSION / UPDATES ====================

  ipcMain.handle('check-for-updates', async () => {
    try {
        log(`[UPDATE] Checking for updates. Current version: ${APP_VERSION}`);
        const response = await fetch(UPDATE_MANIFEST_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const manifest = await response.json();
        const latestVersion = manifest.version;

        // Compare versions (simple semver comparison)
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

        return {
            success: true,
            currentVersion: APP_VERSION,
            latestVersion,
            hasUpdate,
            releaseUrl: 'https://github.com/npcww/npc-core/releases'
        };
    } catch (err) {
        log(`[UPDATE] Error checking for updates: ${err.message}`);
        return { success: false, error: err.message, currentVersion: APP_VERSION };
    }
  });

  ipcMain.handle('get-app-version', () => APP_VERSION);
}

module.exports = { register, readPythonEnvConfig };
