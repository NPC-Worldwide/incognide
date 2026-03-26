const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const { dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const fetch = require('node-fetch');

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

const readPythonEnvConfig = async () => {
  await ensurePythonEnvConfig();
  const content = await fsPromises.readFile(pythonEnvConfigPath, 'utf8');
  return JSON.parse(content);
};

const writePythonEnvConfig = async (data) => {
  await ensurePythonEnvConfig();
  await fsPromises.writeFile(pythonEnvConfigPath, JSON.stringify(data, null, 2));
};

const tilesConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'tiles.json');

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

const tileJinxDir = path.join(os.homedir(), '.npcsh', 'incognide', 'tiles');

const tileSourceMap = {
  'db.jinx': { source: 'DBTool.tsx', label: 'DB Tool', icon: 'Database', order: 0 },
  'photo.jinx': { source: 'PhotoViewer.tsx', label: 'Photo', icon: 'Image', order: 1 },
  'library.jinx': { source: 'LibraryViewer.tsx', label: 'Library', icon: 'BookOpen', order: 2 },
  'datadash.jinx': { source: 'DataDash.tsx', label: 'Data Dash', icon: 'BarChart3', order: 3 },
};

const componentsDir = path.join(__dirname, '..', 'renderer', 'components');

const generateJinxHeader = (meta) => `

`;

const ensureTileJinxDir = async () => {
  await fsPromises.mkdir(tileJinxDir, { recursive: true });

  for (const [filename, meta] of Object.entries(tileSourceMap)) {
    const jinxPath = path.join(tileJinxDir, filename);
    const sourcePath = path.join(componentsDir, meta.source);

    try {

      const sourceStats = await fsPromises.stat(sourcePath);

      let shouldWrite = false;
      try {
        const jinxStats = await fsPromises.stat(jinxPath);

        if (sourceStats.mtime > jinxStats.mtime) {
          console.log(`[Tiles] Source ${meta.source} is newer than ${filename}, syncing...`);
          shouldWrite = true;
        }
      } catch {

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

const tileJinxCacheDir = path.join(tileJinxDir, '.cache');

const compileJinxFile = async (jinxFilename) => {
  const ts = require('typescript');
  const jinxPath = path.join(tileJinxDir, jinxFilename);
  const cachePath = path.join(tileJinxCacheDir, jinxFilename.replace('.jinx', '.js'));

  try {

    const source = await fsPromises.readFile(jinxPath, 'utf8');

    const exportMatch = source.match(/export\s+default\s+(\w+)\s*;?\s*$/m);
    const exportFuncMatch = source.match(/export\s+default\s+(?:function|const)\s+(\w+)/);
    const componentName = exportMatch?.[1] || exportFuncMatch?.[1] || 'Component';

    let cleaned = source.replace(/\/\*\*[\s\S]*?\*\/\s*\n?/, '');
    cleaned = cleaned.replace(/^#[^\n]*\n/gm, '');
    cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, '');
    cleaned = cleaned.replace(/^export\s+(default\s+)?/gm, '');

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

    let compiled = result.outputText;
    compiled = compiled.replace(/["']use strict["'];?\n?/g, '');
    compiled = compiled.replace(/Object\.defineProperty\(exports[\s\S]*?\);/g, '');
    compiled = compiled.replace(/exports\.\w+\s*=\s*/g, '');
    compiled = compiled.replace(/exports\.default\s*=\s*\w+;?/g, '');
    compiled = compiled.replace(/(?:var|const|let)\s+\w+\s*=\s*require\([^)]+\);?\n?/g, '');
    compiled = compiled.replace(/require\([^)]+\)/g, '{}');
    compiled = compiled.replace(/\w+_\d+\.(\w+)/g, '$1');
    compiled = compiled.replace(/react_1\.(\w+)/g, '$1');

    const moduleCode = `// Compiled from ${jinxFilename}

${compiled}

var __componentName = "${componentName}";
var __component = ${componentName};
`;

    await fsPromises.mkdir(tileJinxCacheDir, { recursive: true });
    await fsPromises.writeFile(cachePath, moduleCode);

    console.log(`Compiled ${jinxFilename} -> ${componentName}`);
    return { success: true, componentName, cachePath };
  } catch (err) {
    console.error(`Failed to compile ${jinxFilename}:`, err.message);
    return { success: false, error: err.message };
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
      const jinxPath = path.join(tileJinxDir, jinxFile);
      const cachePath = path.join(tileJinxCacheDir, jinxFile.replace('.jinx', '.js'));

      try {
        const jinxStat = await fsPromises.stat(jinxPath);
        let needsCompile = true;

        try {
          const cacheStat = await fsPromises.stat(cachePath);

          needsCompile = jinxStat.mtimeMs > cacheStat.mtimeMs;
        } catch {

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

let jinxInitialCompileDone = false;

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
          registerGlobalShortcut, app, backendProcess, killBackendProcess,
          ensureUserDataDirectory, waitForServer, logBackend,
          logsDir, electronLogPath, backendLogPath,
          readPythonEnvConfig: ctxReadPythonEnvConfig } = ctx;

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

  ipcMain.handle('getCronJobs', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/cron/jobs`);
  });

  ipcMain.handle('scheduleJob', async (event, params) => {
    return await callBackendApi(`${BACKEND_URL}/api/cron/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
    });
  });

  ipcMain.handle('unscheduleJob', async (event, jobName) => {
    return await callBackendApi(`${BACKEND_URL}/api/cron/unschedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobName })
    });
  });

  ipcMain.handle('jobStatus', async (event, jobName) => {
    return await callBackendApi(`${BACKEND_URL}/api/cron/status/${encodeURIComponent(jobName)}`);
  });

  // --- Cross-platform crontab helper ---
  // Linux & macOS have crontab; Windows does not (returns empty).
  const _getCrontabLocal = () => {
    const platform = process.platform;
    const result = {};
    if (platform === 'win32') {
      // Windows: no crontab. Return scheduled tasks summary instead.
      try {
        result.scheduled_tasks = execSync('schtasks /query /fo LIST', { encoding: 'utf8', timeout: 10000 });
      } catch {}
      return result;
    }
    // Linux & macOS: user crontab
    try { result.user_crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8', timeout: 5000 }); } catch {}
    if (platform === 'linux') {
      // Linux: system crontab, cron.d, systemd timers, systemd user services
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
    // macOS: launchd plist dirs (informational)
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

  // --- Cross-platform system daemons helper ---
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
    // npcsh triggers (cross-platform)
    try {
      const triggersDir = path.join(os.homedir(), '.npcsh', 'triggers');
      if (fs.existsSync(triggersDir)) {
        result.npcsh_services = fs.readdirSync(triggersDir).filter(f => !f.startsWith('.'));
      }
    } catch {}
    return result;
  };

  // --- Cross-platform service info helper ---
  const _getServiceInfoLocal = (unit) => {
    const platform = process.platform;
    const result = {};
    if (platform === 'linux') {
      try { result.unit_file = execSync(`systemctl cat ${unit} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
      try { result.journal = execSync(`journalctl -u ${unit} --no-pager -n 100 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
    } else if (platform === 'darwin') {
      // unit here is a launchd label
      try { result.unit_file = execSync(`launchctl print system/${unit} 2>/dev/null || launchctl print gui/$(id -u)/${unit} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }); } catch {}
      try {
        // Try to find the plist file
        const searchDirs = ['/Library/LaunchDaemons', '/Library/LaunchAgents',
                            path.join(os.homedir(), 'Library/LaunchAgents')];
        for (const dir of searchDirs) {
          const plistPath = path.join(dir, `${unit}.plist`);
          if (fs.existsSync(plistPath)) {
            result.unit_file = fs.readFileSync(plistPath, 'utf8');
            break;
          }
        }
      } catch {}
    } else if (platform === 'win32') {
      try { result.unit_file = execSync(`schtasks /query /tn "${unit}" /fo LIST /v`, { encoding: 'utf8', timeout: 5000 }); } catch {}
    }
    return result;
  };

  ipcMain.handle('getCrontab', async () => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/crontab`);
      if (r && !r.error) return r;
    } catch {}
    // Fallback: gather crontab data locally
    return _getCrontabLocal();
  });

  ipcMain.handle('getSystemDaemons', async () => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/daemons`);
      if (r && !r.error) return r;
    } catch {}
    // Fallback: gather system daemon data locally
    return _getSystemDaemonsLocal();
  });

  ipcMain.handle('getServiceInfo', async (event, unit) => {
    try {
      const r = await callBackendApi(`${BACKEND_URL}/api/cron/service-info/${encodeURIComponent(unit)}`);
      if (r && !r.error) return r;
    } catch {}
    // Fallback: gather service info locally
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
            // Windows: kill the process tree since detached isn't used
            try { execSync(`taskkill /PID ${daemon.process.pid} /T /F`, { timeout: 5000 }); }
            catch { daemon.process.kill(); }
          } else {
            // Unix: kill process group if detached, otherwise just kill
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

  ipcMain.handle('detect-local-models', async () => {
    const models = [];

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

  ipcMain.handle('python-env-get', async (event, { workspacePath }) => {
    try {
      const config = await _readPythonEnvConfig();
      return config.workspaces[workspacePath] || null;
    } catch (err) {
      console.error('Error getting python env config:', err);
      return null;
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
        console.error('Error updating .npcshrc:', rcErr);
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
    const venvDir = path.join(os.homedir(), '.npcsh', 'incognide', 'venv');

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

  ipcMain.handle('setup:skip', async () => {
    markSetupComplete();
    return { success: true };
  });

  ipcMain.handle('setup:reset', async () => {
    const setupMarkerPath = path.join(os.homedir(), '.npcsh', 'incognide', '.setup_complete');
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

        const defaultDirs = [

            path.join(homeDir, '.cache', 'huggingface', 'hub'),

            path.join(homeDir, '.cache', 'lm-studio', 'models'),
            path.join(homeDir, 'lm-studio', 'models'),
            path.join(homeDir, '.lmstudio', 'models'),
            path.join(homeDir, '.local', 'share', 'lmstudio', 'models'),

            path.join(homeDir, 'llama.cpp', 'models'),
            path.join(homeDir, '.llama.cpp', 'models'),
            path.join(homeDir, '.local', 'share', 'llama.cpp', 'models'),

            path.join(homeDir, 'koboldcpp', 'models'),
            path.join(homeDir, '.koboldcpp', 'models'),
            path.join(homeDir, '.local', 'share', 'koboldcpp', 'models'),

            path.join(homeDir, '.ollama', 'models', 'blobs'),

            path.join(homeDir, '.cache', 'gpt4all'),
            path.join(homeDir, '.local', 'share', 'gpt4all'),

            path.join(homeDir, '.npcsh', 'models', 'gguf'),
            path.join(homeDir, '.npcsh', 'models'),
            path.join(homeDir, 'models'),
            path.join(homeDir, 'Models'),

            path.join(homeDir, 'text-generation-webui', 'models'),
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
        const response = await fetch(`${BACKEND_URL}/api/models/hf/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error searching HF models:', err);
        return { models: [], error: err.message };
    }
  });

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
}

module.exports = { register, readPythonEnvConfig };
