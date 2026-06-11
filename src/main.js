const { app, BrowserWindow, globalShortcut, ipcMain, protocol, shell, BrowserView, safeStorage, session, nativeImage, dialog, screen, Menu } = require('electron');
const { desktopCapturer } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const fsPromises = require('fs/promises');
const os = require('os');
let pty;
let ptyLoadError = null;
try {
  pty = require('node-pty');
} catch (error) {
  pty = null;
  ptyLoadError = error;
  console.error('Failed to load node-pty:', error.message);
  console.error('Stack:', error.stack);
}

const cron = require('node-cron');

const cronJobs = new Map();
const daemons = new Map();

const sqlite3 = require('sqlite3');
const dbPath = path.join(os.homedir(), 'npcsh_history.db');
const fetch = require('node-fetch');
const crypto = require('crypto');
const http = require('http');

const IS_DEV_MODE = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const FRONTEND_PORT = IS_DEV_MODE ? 7337 : 6337;
const BACKEND_PORT = IS_DEV_MODE ? 5437 : 5337;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const NPCSH_BASE = path.join(os.homedir(), '.npcsh');

let splashWindow = null;

let INCOGNIDE_HOME = process.env.INCOGNIDE_HOME || path.join(os.homedir(), '.incognide');
try {
  const _rcPath = path.join(os.homedir(), '.incogniderc');
  if (fs.existsSync(_rcPath)) {
    const _rcContent = fs.readFileSync(_rcPath, 'utf-8');
    const _match = _rcContent.match(/^(?:export\s+)?INCOGNIDE_HOME=(.*)$/m);
    if (_match) {
      let _val = _match[1].trim();
      if ((_val.startsWith('"') && _val.endsWith('"')) || (_val.startsWith("'") && _val.endsWith("'"))) _val = _val.slice(1, -1);
      if (_val.startsWith('~')) _val = _val.replace('~', os.homedir());
      if (_val) INCOGNIDE_HOME = _val;
    }
  }
} catch {}

function readRcFile(rcPath) {
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      for (const line of fs.readFileSync(rcPath, 'utf-8').split('\n')) {
        const m = line.trim().replace(/^export\s+/, '').match(/^(\w+)=(.*)$/);
        if (m) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          result[m[1]] = v;
        }
      }
    }
  } catch {}
  return result;
}

function ensureIncognideRc() {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  let lines = [];
  if (fs.existsSync(rcPath)) {
    lines = fs.readFileSync(rcPath, 'utf-8').split('\n').filter(l => l.trim());
  }
  const has = (key) => lines.some(l => l.match(new RegExp(`^(?:export\\s+)?${key}=`)));
  const seed = (key, fallback) => {
    if (!has(key)) {
      const val = process.env[key] || fallback || '';
      if (val) lines.push(`export ${key}=${val}`);
    }
  };
  if (!has('INCOGNIDE_HOME')) lines.push('export INCOGNIDE_HOME=~/.incognide');
  seed('INCOGNIDE_CHAT_MODEL');
  seed('INCOGNIDE_CHAT_PROVIDER');
  seed('INCOGNIDE_DEFAULT_NPC', 'ledbi');
  try {
    fs.writeFileSync(rcPath, lines.join('\n') + '\n');
  } catch (err) {
    console.error('Failed to write .incogniderc:', err);
  }
  if (!fs.existsSync(INCOGNIDE_HOME)) {
    fs.mkdirSync(INCOGNIDE_HOME, { recursive: true });
  }
}
ensureIncognideRc();

function loadShellEnv() {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (value && !process.env[match[1]]) {
            process.env[match[1]] = value;
          }
        }
      }
    }
  } catch (e) {
    console.log('Error loading .incogniderc into env:', e.message);
  }
}
loadShellEnv();

const RECENT_PATHS_FILE = path.join(INCOGNIDE_HOME, 'recent_paths.json');

function loadRecentPaths() {
  try {
    if (fs.existsSync(RECENT_PATHS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RECENT_PATHS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('[RECENT_PATHS] Error loading:', e.message);
  }
  return [];
}

function saveRecentPaths(paths) {
  try {
    fs.writeFileSync(RECENT_PATHS_FILE, JSON.stringify(paths, null, 2));
  } catch (e) {
    console.error('[RECENT_PATHS] Error saving:', e.message);
  }
}

function addRecentPath(newPath) {
  const paths = loadRecentPaths();
  const filtered = paths.filter(p => p !== newPath);
  filtered.unshift(newPath);
  saveRecentPaths(filtered.slice(0, 20));
}

if (IS_DEV_MODE) {
  app.setPath('userData', path.join(INCOGNIDE_HOME, 'dev'));
} else {
  app.setPath('userData', INCOGNIDE_HOME);
}

const logsDir = path.join(INCOGNIDE_HOME, 'logs');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch (err) {
  console.error('Failed to create logs directory:', err);
}

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const electronLogPath = path.join(logsDir, 'electron.log');
const backendLogPath = path.join(logsDir, 'backend.log');

const rotateLogIfNeeded = (logPath) => {
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > 5 * 1024 * 1024) {
        const rotatedPath = logPath.replace('.log', `.${sessionTimestamp}.log`);
        fs.renameSync(logPath, rotatedPath);
      }
    }
  } catch (err) {
    console.error('Log rotation failed:', err);
  }
};

rotateLogIfNeeded(electronLogPath);
rotateLogIfNeeded(backendLogPath);

const electronLogStream = fs.createWriteStream(electronLogPath, { flags: 'a' });
const backendLogStream = fs.createWriteStream(backendLogPath, { flags: 'a' });

let mainWindow = null;
let pdfView = null;
let uiHidden = false;
let frontendServer = null;
let clerkWebRequestRegistered = false;

function applyAppMenu() {
  if (!mainWindow) return;
  const isMac = process.platform === 'darwin';
  const menuTemplate = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('menu-open-settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', click: () => mainWindow.webContents.send('menu-new-chat') },
        { label: 'New Terminal', accelerator: isMac ? 'Ctrl+Shift+T' : 'Super+Shift+T', click: () => mainWindow.webContents.send('menu-new-terminal') },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow.webContents.send('menu-reopen-tab') },
        { label: 'New Browser Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow.webContents.send('browser-new-tab') },
        { type: 'separator' },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu-open-file') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow.webContents.send('open-folder-picker') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save-file') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('menu-save-file-as') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => mainWindow.webContents.send('menu-close-tab') },
        { type: 'separator' },
        ...(isMac ? [] : [
          { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('menu-open-settings') },
          { type: 'separator' },
          { role: 'quit' }
        ])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { role: 'selectAll' }, { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => mainWindow.webContents.send('menu-find') },
        { label: 'Find in Files', accelerator: 'CmdOrCtrl+Shift+F', click: () => mainWindow.webContents.send('menu-global-search') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.send('menu-command-palette') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow.webContents.send('menu-toggle-sidebar') },
        { label: uiHidden ? 'Show UI' : 'Hide UI', accelerator: 'CmdOrCtrl+F11', click: () => mainWindow.webContents.send('menu-toggle-hide-ui') },
        { type: 'separator' },
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: (_, focusedWindow) => focusedWindow && focusedWindow.webContents.send('zoom-reset') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: (_, focusedWindow) => focusedWindow && focusedWindow.webContents.send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: (_, focusedWindow) => focusedWindow && focusedWindow.webContents.send('zoom-out') },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow.webContents.send('menu-new-window') },
        { type: 'separator' },
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
        { type: 'separator' },
        { label: 'Split Pane Right', click: () => mainWindow.webContents.send('menu-split-right') },
        { label: 'Split Pane Down', click: () => mainWindow.webContents.send('menu-split-down') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Help & Documentation', click: () => mainWindow.webContents.send('menu-open-help') },
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => mainWindow.webContents.send('menu-show-shortcuts') },
        { type: 'separator' },
        { label: 'Report Issue', click: () => shell.openExternal('https://github.com/NPC-Worldwide/incognide/issues') },
        { label: 'Visit Website', click: () => shell.openExternal('https://incognide.com') },
        { type: 'separator' },
        {
          label: 'About Incognide',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Incognide',
              message: 'Incognide',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode: ${process.versions.node}`
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

ipcMain.handle('ui:setHidden', (event, hidden) => {
  uiHidden = !!hidden;
  applyAppMenu();
  return { success: true };
});

const ensureTablesExist = async () => {
  console.log('[DB] Ensuring all tables exist...');

  const createHighlightsTable = `
      CREATE TABLE IF NOT EXISTS pdf_highlights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          highlighted_text TEXT NOT NULL,
          position_json TEXT NOT NULL,
          annotation TEXT DEFAULT '',
          color TEXT DEFAULT 'yellow',
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createBookmarksTable = `
      CREATE TABLE IF NOT EXISTS bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          folder_path TEXT,
          is_global BOOLEAN DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createSiteLimitsTable = `
      CREATE TABLE IF NOT EXISTS site_limits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT NOT NULL,
          folder_path TEXT,
          is_global BOOLEAN DEFAULT 0,
          hourly_time_limit INTEGER DEFAULT 0,
          daily_time_limit INTEGER DEFAULT 0,
          hourly_visit_limit INTEGER DEFAULT 0,
          daily_visit_limit INTEGER DEFAULT 0,
          hourly_time_used INTEGER DEFAULT 0,
          daily_time_used INTEGER DEFAULT 0,
          hourly_visits INTEGER DEFAULT 0,
          daily_visits INTEGER DEFAULT 0,
          last_hourly_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_daily_reset DATE DEFAULT CURRENT_DATE,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(domain, folder_path)
      );
  `;

  const createBrowserHistoryTable = `
      CREATE TABLE IF NOT EXISTS browser_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          url TEXT NOT NULL,
          folder_path TEXT,
          pane_id TEXT,
          navigation_type TEXT DEFAULT 'click',
          visit_count INTEGER DEFAULT 1,
          last_visited DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createBrowserNavigationsTable = `
      CREATE TABLE IF NOT EXISTS browser_navigations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pane_id TEXT NOT NULL,
          from_url TEXT,
          to_url TEXT NOT NULL,
          navigation_type TEXT DEFAULT 'click',
          folder_path TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createDrawingsTable = `
      CREATE TABLE IF NOT EXISTS pdf_drawings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          page_index INTEGER NOT NULL,
          drawing_type TEXT NOT NULL DEFAULT 'freehand',
          svg_path TEXT NOT NULL,
          stroke_color TEXT DEFAULT '#000000',
          stroke_width REAL DEFAULT 2,
          position_x REAL DEFAULT 0,
          position_y REAL DEFAULT 0,
          width REAL DEFAULT 100,
          height REAL DEFAULT 100,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createJinxExecutionLogTable = `
      CREATE TABLE IF NOT EXISTS jinx_execution_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          jinx_name TEXT NOT NULL,
          npc_name TEXT,
          input_summary TEXT,
          output_summary TEXT,
          status TEXT DEFAULT 'success',
          duration_ms INTEGER,
          folder_path TEXT,
          job_id TEXT,
          job_type TEXT,
          log_file_path TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createScheduledJobsTable = `
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          job_type TEXT NOT NULL CHECK(job_type IN ('jinx','finetune_instruction','finetune_diffusers','inference')),
          schedule TEXT NOT NULL,
          command TEXT,
          npc_name TEXT,
          jinx_name TEXT,
          payload TEXT,
          workspace_path TEXT,
          python_env_config TEXT,
          enabled INTEGER DEFAULT 1,
          next_run_at DATETIME,
          last_run_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `;

  const createDaemonStateTable = `
      CREATE TABLE IF NOT EXISTS daemon_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          pid INTEGER,
          port INTEGER,
          started_at DATETIME,
          last_heartbeat DATETIME,
          status TEXT
      );
  `;

  const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_file_path ON pdf_highlights(file_path);
      CREATE INDEX IF NOT EXISTS idx_pdf_drawings_file ON pdf_drawings(file_path);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_folder ON bookmarks(folder_path);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_global ON bookmarks(is_global);
      CREATE INDEX IF NOT EXISTS idx_history_folder ON browser_history(folder_path);
      CREATE INDEX IF NOT EXISTS idx_history_url ON browser_history(url);
      CREATE INDEX IF NOT EXISTS idx_history_pane ON browser_history(pane_id);
      CREATE INDEX IF NOT EXISTS idx_navigations_pane ON browser_navigations(pane_id);
      CREATE INDEX IF NOT EXISTS idx_navigations_folder ON browser_navigations(folder_path);
      CREATE INDEX IF NOT EXISTS idx_jinx_log_name ON jinx_execution_log(jinx_name);
      CREATE INDEX IF NOT EXISTS idx_jinx_log_folder ON jinx_execution_log(folder_path);
      CREATE INDEX IF NOT EXISTS idx_jinx_log_job_id ON jinx_execution_log(job_id);
      CREATE INDEX IF NOT EXISTS idx_sched_jobs_enabled ON scheduled_jobs(enabled);
      CREATE INDEX IF NOT EXISTS idx_sched_jobs_next ON scheduled_jobs(next_run_at);
  `;

  try {
      await dbQuery(createHighlightsTable);
      await dbQuery(createBookmarksTable);
      await dbQuery(createSiteLimitsTable);
      await dbQuery(createBrowserHistoryTable);
      await dbQuery(createBrowserNavigationsTable);
      await dbQuery(createDrawingsTable);
      await dbQuery(createJinxExecutionLogTable);
      await dbQuery(createScheduledJobsTable);
      await dbQuery(createDaemonStateTable);
      await dbQuery(createIndexes);

      const addColumnIfMissing = async (table, column, definition) => {
          const cols = await dbQuery(`PRAGMA table_info(${table})`);
          if (!cols.find(c => c.name === column)) {
              await dbQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
              console.log(`[DB] Added ${column} column to ${table}`);
          }
      };

      await addColumnIfMissing('browser_history', 'pane_id', 'TEXT');
      await addColumnIfMissing('browser_history', 'navigation_type', "TEXT DEFAULT 'click'");
      await addColumnIfMissing('pdf_highlights', 'color', "TEXT DEFAULT 'yellow'");
      await addColumnIfMissing('jinx_execution_log', 'job_id', 'TEXT');
      await addColumnIfMissing('jinx_execution_log', 'job_type', 'TEXT');
      await addColumnIfMissing('jinx_execution_log', 'log_file_path', 'TEXT');

      console.log('[DB] All tables are ready.');
  } catch (error) {
      console.error('[DB] FATAL: Could not create tables.', error);
  }
};

app.setAppUserModelId('com.incognide.chat');
app.name = 'incognide';
app.setName('incognide');

const formatLogMessage = (prefix, messages) => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${prefix} ${messages.join(' ')}`;
};

const log = (...messages) => {
    const msg = formatLogMessage('[ELECTRON]', messages);
    console.log(msg);
    electronLogStream.write(`${msg}\n`);
};

const logBackend = (...messages) => {
    const msg = formatLogMessage('[BACKEND]', messages);
    console.log(msg);
    backendLogStream.write(`${msg}\n`);
};

const DEFAULT_SHORTCUT = process.platform === 'darwin' ? 'Alt+Space' : 'CommandOrControl+Space';
const ptySessions = new Map();
const ptyKillTimers = new Map();

const dbQuery = (query, params = []) => {

  const isReadQuery = query.trim().toUpperCase().startsWith('SELECT') || query.trim().toUpperCase().startsWith('PRAGMA');
  console.log(`[DB] EXECUTING: ${query.substring(0, 100).replace(/\s+/g, ' ')}...`, params);

  return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
          if (err) {
              console.error('[DB] CONNECTION ERROR:', err.message);
              return reject(err);
          }
      });

      if (isReadQuery) {

          db.all(query, params, (err, rows) => {
              db.close();
              if (err) {
                  console.error(`[DB] READ FAILED: ${err.message}`);
                  return reject(err);
              }
              resolve(rows);
          });
      } else {

          db.run(query, params, function(err) {
              db.close();
              if (err) {
                  console.error(`[DB] COMMAND FAILED: ${err.message}`);
                  return reject(err);
              }
              resolve({ lastID: this.lastID, changes: this.changes });
          });
      }
  });
};

function parseIncogniderc() {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          result[match[1]] = value;
        }
      }
    }
  } catch (e) {
    console.log('Error reading .incogniderc:', e.message);
  }
  return result;
}

function getDefaultModelConfig() {
  const yaml = require('js-yaml');
  let model = '';
  let provider = '';
  let npc = 'ledbi';

  const rcEnv = parseIncogniderc();

  const chatModel = process.env.INCOGNIDE_CHAT_MODEL || rcEnv.INCOGNIDE_CHAT_MODEL;
  const chatProvider = process.env.INCOGNIDE_CHAT_PROVIDER || rcEnv.INCOGNIDE_CHAT_PROVIDER;
  const defaultNpc = process.env.INCOGNIDE_DEFAULT_NPC || rcEnv.INCOGNIDE_DEFAULT_NPC;

  if (chatModel) model = chatModel;
  if (chatProvider) provider = chatProvider;
  if (defaultNpc) npc = defaultNpc;

  if (!chatModel) {
    try {
      const globalCtx = path.join(INCOGNIDE_HOME, 'npc_team', 'incognide.ctx');
      if (fs.existsSync(globalCtx)) {
        const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
        if (ctxData.model) model = ctxData.model;
        if (ctxData.provider) provider = ctxData.provider;
        if (ctxData.forenpc) npc = ctxData.forenpc;
      }
    } catch (e) {
      console.log('Error reading incognide.ctx for default model:', e.message);
    }
  }

  console.log('Default model config:', { model, provider, npc });
  return { model, provider, npc };
}

const defaultModelConfig = getDefaultModelConfig();

const DEFAULT_CONFIG = {
  baseDir: path.resolve(INCOGNIDE_HOME),
  stream: true,
  model: defaultModelConfig.model,
  provider: defaultModelConfig.provider,
  npc: defaultModelConfig.npc,
};

const DEVICE_CONFIG_PATH = path.join(INCOGNIDE_HOME, 'device.json');

function getOrCreateDeviceId() {
  try {

    const dir = path.dirname(DEVICE_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(DEVICE_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH, 'utf-8'));
      if (config.deviceId) {
        log(`[DEVICE] Using existing device ID: ${config.deviceId}`);
        return config;
      }
    }

    const newConfig = {
      deviceId: crypto.randomUUID(),
      deviceName: os.hostname() || 'My Device',
      deviceType: process.platform,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(DEVICE_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    log(`[DEVICE] Created new device ID: ${newConfig.deviceId}`);
    return newConfig;
  } catch (err) {
    log(`[DEVICE] Error getting/creating device ID: ${err.message}`);
    return {
      deviceId: crypto.randomUUID(),
      deviceName: os.hostname() || 'My Device',
      deviceType: process.platform,
      createdAt: new Date().toISOString(),
      isTemporary: true
    };
  }
}

function updateDeviceConfig(updates) {
  try {
    const currentConfig = getOrCreateDeviceId();
    const newConfig = { ...currentConfig, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(DEVICE_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    log(`[DEVICE] Updated device config:`, updates);
    return newConfig;
  } catch (err) {
    log(`[DEVICE] Error updating device config: ${err.message}`);
    return null;
  }
}

const deviceConfig = getOrCreateDeviceId();
log(`[DEVICE] Initialized with device ID: ${deviceConfig.deviceId}, name: ${deviceConfig.deviceName}`);

function generateId() {
  return crypto.randomUUID();
}

const activeStreams = new Map();

let isCapturingScreenshot = false;

let lastScreenshotTime = 0;
const SCREENSHOT_COOLDOWN = 1000;

let backendProcess = null;
let _backendPath = null;
let _spawnArgs = [];
let _backendEnv = null;
let _backendStartupError = null;

function killBackendProcess() {
  if (backendProcess) {
    log('Killing backend process');
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' });
      } catch (e) {
        try { backendProcess.kill('SIGKILL'); } catch (e2) {}
      }
    } else {
      try { process.kill(-backendProcess.pid, 'SIGTERM'); } catch (e) {
        try { backendProcess.kill('SIGTERM'); } catch (e2) {}
      }
    }
    backendProcess = null;
  }
}

let daemonProcess = null;
const DAEMON_SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'daemon', 'incognide-daemon.js')
  : path.join(__dirname, 'daemon', 'incognide-daemon.js');

function spawnDaemon() {
  if (daemonProcess) {
    log('[daemon] Already spawned');
    return;
  }
  const scriptPath = fs.existsSync(DAEMON_SCRIPT_PATH)
    ? DAEMON_SCRIPT_PATH
    : path.join(__dirname, 'src', 'daemon', 'incognide-daemon.js');
  if (!fs.existsSync(scriptPath)) {
    log(`[daemon] Script not found at ${scriptPath}`);
    return;
  }
  log(`[daemon] Spawning daemon: ${scriptPath}`);
  daemonProcess = spawn(process.execPath, [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { ...process.env, INCOGNIDE_HOME },
  });
  daemonProcess.stdout.on('data', (d) => {
    log('[daemon stdout]', d.toString().trim());
  });
  daemonProcess.stderr.on('data', (d) => {
    log('[daemon stderr]', d.toString().trim());
  });
  daemonProcess.on('close', (code) => {
    log(`[daemon] exited with code ${code}`);
    daemonProcess = null;
  });
  daemonProcess.on('error', (err) => {
    log(`[daemon] spawn error: ${err.message}`);
    daemonProcess = null;
  });
}

function killDaemon() {
  if (!daemonProcess) {
    log('[daemon] Not running');
    return;
  }
  log('[daemon] Stopping daemon');
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${daemonProcess.pid}`, { stdio: 'ignore' });
    } catch (e) {
      try { daemonProcess.kill('SIGKILL'); } catch (e2) {}
    }
  } else {
    try { process.kill(-daemonProcess.pid, 'SIGTERM'); } catch (e) {
      try { daemonProcess.kill('SIGTERM'); } catch (e2) {}
    }
  }
  daemonProcess = null;
}

async function getDaemonStatus() {
  try {
    const rows = await dbQuery(`SELECT * FROM daemon_state WHERE id = 1`);
    if (!rows.length) return { running: false };
    const state = rows[0];
    let alive = false;
    if (state.pid && state.status === 'running') {
      try {
        process.kill(state.pid, 0);
        alive = true;
      } catch {}
    }
    return { running: alive, pid: state.pid, port: state.port, lastHeartbeat: state.last_heartbeat };
  } catch (err) {
    return { running: false, error: err.message };
  }
}

function spawnBackendProcess(bPath, bArgs, label, env) {
  log(`Spawning backend (${label}): ${bPath} ${bArgs.join(' ')}`);
  const proc = spawn(bPath, bArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: env,
  });

  proc.stdout.on("data", (data) => {
    if (typeof logBackend === 'function') logBackend(`stdout: ${data.toString().trim()}`);
    else log(`Backend stdout: ${data.toString().trim()}`);
  });

  proc.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (typeof logBackend === 'function') logBackend(`stderr: ${msg}`);
    else log(`Backend stderr: ${msg}`);
    if (msg.includes('ModuleNotFoundError') || msg.includes('ImportError')) {
      log(`CRITICAL: Backend missing dependencies: ${msg}`);
    }
  });

  proc.on('error', (err) => {
    log(`Backend process error (${label}): ${err.message}`);
  });

  proc.on('close', (code) => {
    if (code !== null && code !== 0) {
      if (typeof logBackend === 'function') logBackend(`Backend server (${label}) exited with code: ${code}`);
      else log(`Backend server (${label}) exited with code: ${code}`);
    }
  });

  return proc;
}

async function waitForServer(maxAttempts = 120, delay = 1000) {
  log('Waiting for backend server to start...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    if (backendProcess && backendProcess.exitCode !== null) {
      log(`Backend process already exited with code ${backendProcess.exitCode}, stopping wait`);
      return false;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
      if (response.ok) {
        log(`Backend server is ready (attempt ${attempt}/${maxAttempts})`);
        return true;
      }
    } catch (err) {

      log(`Waiting for server... attempt ${attempt}/${maxAttempts}`);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  log('Backend server failed to start in the allocated time');
  return false;
}
function scheduleCronJob(job) {
  if (job.task) job.task.stop();
  job.task = cron.schedule(job.schedule, async () => {
    console.log(`[cron] ${job.id}: ${job.command}`);
    const logDir = path.join(INCOGNIDE_HOME, 'npc_team', 'logs');
    const logFile = path.join(logDir, `${job.id}.log`);
    try { await fsPromises.mkdir(logDir, { recursive: true }); } catch {}

    // Resolve jinx file path from command name
    const parts = job.command.replace(/^\//, '').split(/\s+/);
    const jinxName = parts[0];
    const jinxArgs = parts.slice(1);

    // Search for the jinx file in npc_team dirs
    const searchDirs = [
      path.join(os.homedir(), '.npcsh', 'npc_team', 'jinxes'),
      path.join(INCOGNIDE_HOME, 'npc_team', 'jinxes'),
    ];
    let jinxFile = null;
    for (const dir of searchDirs) {
      try {
        const found = findJinxFile(dir, jinxName);
        if (found) { jinxFile = found; break; }
      } catch {}
    }

    if (!jinxFile) {
      const errMsg = `[cron] ${job.id}: jinx '${jinxName}' not found`;
      console.error(errMsg);
      await fsPromises.writeFile(logFile, errMsg + '\n');
      return;
    }

    // Execute jinx file directly (shebang handles routing)
    const child = spawn(jinxFile, jinxArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    child.on('close', async (code) => {
      console.log(`[cron] ${job.id} exited ${code}`);
      await fsPromises.writeFile(logFile, output);
    });
  }, { scheduled: true });
  return job.task;
}

function findJinxFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findJinxFile(full, name);
      if (found) return found;
    } else if (e.name === `${name}.jinx`) {
      return full;
    }
  }
  return null;
}

async function ensureBaseDir() {
  try {
    await fsPromises.mkdir(DEFAULT_CONFIG.baseDir, { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'config'), { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'images'), { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'screenshots'), { recursive: true });
  } catch (err) {
    console.error('Error creating base directory:', err);
  }
}

const sessionsWithDownloadHandler = new WeakSet();

ipcMain.on('trigger-new-text-file', (event) => {
  event.sender.send('menu-new-text-file');
});

ipcMain.on('trigger-browser-new-tab', (event) => {
  event.sender.send('browser-new-tab');
});

const workspacePathByWindow = new Map();

ipcMain.on('set-workspace-path', (event, workspacePath) => {
  if (workspacePath && typeof workspacePath === 'string') {
    const windowId = event.sender.id;
    const normalized = workspacePath.replace(/\/+$/, '');
    workspacePathByWindow.set(windowId, normalized);
    log(`[DOWNLOAD] Workspace path for window ${windowId}: ${normalized}`);
  }
});

function getWorkspacePathForWebContents(webContents) {

  if (workspacePathByWindow.has(webContents.id)) {
    return workspacePathByWindow.get(webContents.id);
  }

  const allWindows = BrowserWindow.getAllWindows();
  for (const win of allWindows) {
    if (win.webContents && workspacePathByWindow.has(win.webContents.id)) {

      if (win.webContents.id === webContents.hostWebContents?.id ||
          win.webContents === webContents.hostWebContents) {
        return workspacePathByWindow.get(win.webContents.id);
      }
    }
  }

  const paths = Array.from(workspacePathByWindow.values());
  return paths.length > 0 ? paths[paths.length - 1] : app.getPath('downloads');
}

// File opening handlers for system-level file associations (#195)
let pendingFileOpen = null;

function getContentTypeFromExtension(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeTypes = {
    'pdf': 'pdf',
    'csv': 'csv',
    'xlsx': 'csv',
    'xls': 'csv',
    'pptx': 'pptx',
    'tex': 'latex',
    'ipynb': 'notebook',
    'exp': 'exp',
    'pltx': 'exp',
    'docx': 'docx',
    'doc': 'docx',
    'zip': 'zip',
    'stl': 'stl',
    'txt': 'editor',
    'md': 'markdown-preview',
    'json': 'editor',
    'js': 'editor',
    'ts': 'editor',
    'jsx': 'editor',
    'tsx': 'editor',
    'py': 'editor',
    'rs': 'editor',
    'go': 'editor',
    'html': 'html',
    'css': 'editor',
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'webp': 'image',
    'bmp': 'image',
    'svg': 'image',
    'mp4': 'image',
    'mov': 'image',
    'webm': 'image',
    'avi': 'image',
    'mkv': 'image',
    'm4v': 'image'
  };
  return mimeTypes[ext] || 'editor';
}

function handleFileOpen(filePath) {
  log(`[FILE-OPEN] Received file open request: ${filePath}`);
  
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    // Store for when window is created
    pendingFileOpen = filePath;
    log(`[FILE-OPEN] No windows open, storing for later: ${filePath}`);
    return;
  }
  
  const mainWindow = BrowserWindow.getFocusedWindow() || 
    (lastActiveWindow && !lastActiveWindow.isDestroyed() ? lastActiveWindow : null) ||
    windows[0];
  
  const contentType = getContentTypeFromExtension(filePath);
  log(`[FILE-OPEN] Opening ${filePath} as type: ${contentType}`);
  
  // Send to renderer to open the file
  mainWindow.webContents.send('open-file-from-os', {
    filePath: filePath,
    contentType: contentType
  });
  
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function parseFileArgs(argv) {
  log(`[FILE-ARGS] Parsing command line args: ${JSON.stringify(argv)}`);
  
  // Look for file paths in argv (skip first two which are exec path and script)
  const args = argv.slice(1);
  
  for (const arg of args) {
    // Skip flags
    if (arg.startsWith('-') || arg.startsWith('--')) continue;
    
    // Skip URLs (handled by deep link)
    if (arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('file://')) continue;
    
    // Check if it's a file path
    if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      log(`[FILE-ARGS] Found file in args: ${arg}`);
      handleFileOpen(arg);
      return;
    }
  }
  
  // Also check for --folder argument
  const folderArg = argv.find(arg => arg.startsWith('--folder='));
  if (folderArg) {
    const folderPath = folderArg.replace('--folder=', '');
    log(`[FILE-ARGS] Found folder arg: ${folderPath}`);
    // Folder switching is handled elsewhere
    return;
  }
}

// Process any pending file open after window is ready
function processPendingFileOpen(mainWindow) {
  if (pendingFileOpen) {
    log(`[FILE-OPEN] Processing pending file: ${pendingFileOpen}`);
    const contentType = getContentTypeFromExtension(pendingFileOpen);
    mainWindow.webContents.send('open-file-from-os', {
      filePath: pendingFileOpen,
      contentType: contentType
    });
    pendingFileOpen = null;
  }
}

app.setAsDefaultProtocolClient('incognide')
app.on('open-file', (event, path) => { event.preventDefault(); handleFileOpen(path); })
app.on('second-instance', (event, argv) => parseFileArgs(argv))

app.on('web-contents-created', (event, contents) => {

  contents.on('context-menu', async (e, params) => {

    if (contents.getType() !== 'webview' && params.isEditable) {
      const menu = Menu.buildFromTemplate([
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ]);
      menu.popup();
      return;
    }

    if (contents.getType() === 'webview') {
      e.preventDefault();

      const selectedText = params.selectionText || '';
      const linkURL = params.linkURL || '';
      const srcURL = params.srcURL || '';
      const pageURL = params.pageURL || '';
      const isEditable = params.isEditable || false;
      const mediaType = params.mediaType || 'none';

      log(`[CONTEXT MENU] Webview context menu: selectedText="${selectedText.substring(0, 50)}...", linkURL="${linkURL}", mediaType="${mediaType}"`);

      const ctxParentWin = BrowserWindow.fromWebContents(contents.hostWebContents || contents)
        || BrowserWindow.getFocusedWindow()
        || BrowserWindow.getAllWindows()[0];
      if (ctxParentWin && !ctxParentWin.isDestroyed()) {
        const menuTemplate = [];

        // Clipboard operations (native roles work through webview isolation)
        if (isEditable) {
          menuTemplate.push({ role: 'cut' });
        }
        if (selectedText) {
          menuTemplate.push({ role: 'copy' });
        }
        if (isEditable) {
          menuTemplate.push({ role: 'paste' });
        }
        if (isEditable) {
          menuTemplate.push({ role: 'selectAll' });
        }

        // Separator if we had clipboard items
        if (menuTemplate.length > 0) {
          menuTemplate.push({ type: 'separator' });
        }

        // Link actions
        if (linkURL) {
          menuTemplate.push({
            label: 'Open Link in New Tab',
            click: () => ctxParentWin.webContents.send('browser-context-action', { action: 'openLink', url: linkURL }),
          });
          menuTemplate.push({
            label: 'Copy Link Address',
            click: () => { require('electron').clipboard.writeText(linkURL); },
          });
          menuTemplate.push({ type: 'separator' });
        }

        // Image actions
        if (mediaType === 'image' && srcURL) {
          menuTemplate.push({
            label: 'Save Image As...',
            click: () => ctxParentWin.webContents.send('browser-context-action', { action: 'saveImage', url: srcURL }),
          });
          menuTemplate.push({
            label: 'Copy Image Address',
            click: () => { require('electron').clipboard.writeText(srcURL); },
          });
          menuTemplate.push({ type: 'separator' });
        }

        // Navigation
        menuTemplate.push({
          label: 'Back',
          enabled: contents.navigationHistory.canGoBack(),
          click: () => contents.navigationHistory.goBack(),
        });
        menuTemplate.push({
          label: 'Forward',
          enabled: contents.navigationHistory.canGoForward(),
          click: () => contents.navigationHistory.goForward(),
        });
        menuTemplate.push({
          label: 'Reload',
          click: () => contents.reload(),
        });

        if (menuTemplate.length > 0) {
          const menu = Menu.buildFromTemplate(menuTemplate);
          menu.popup({ window: ctxParentWin });
        }
      }
    }
  });

  if (contents.getType() === 'webview') {
    contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const allowedPermissions = [
        'media',
        'mediaKeySystem',
        'geolocation',
        'notifications',
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
        'display-capture',
        'video-capture',
        'audio-capture',
      ];
      if (allowedPermissions.includes(permission)) {
        log(`[Permissions] Granting ${permission} for webview`);
        callback(true);
      } else {
        log(`[Permissions] Denying ${permission} for webview`);
        callback(false);
      }
    });

    contents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const allowedPermissions = [
        'media',
        'mediaKeySystem',
        'geolocation',
        'notifications',
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
        'display-capture',
        'video-capture',
        'audio-capture',
      ];
      return allowedPermissions.includes(permission);
    });
  }

  // Handle screen sharing requests from webviews (Google Meet, etc.)
  if (contents.getType() === 'webview') {
    contents.session.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({});
        }
      } catch (err) {
        log(`[Screen Share] Error: ${err.message}`);
        callback({});
      }
    });
  }

  // Handle OAuth/auth callbacks — allow new-window for auth flows
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      // Allow OAuth callbacks and auth flows to open
      if (url.includes('accounts.google.com') || url.includes('login') || url.includes('auth') || url.includes('oauth') || url.includes('callback')) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });
  }


  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url, disposition }) => {

      if (!url || url === 'about:blank') {
        log(`[WebView] Allowing about:blank popup (disposition: ${disposition}) - will capture navigation`);
        return { action: 'allow' };
      }

      const AUTH_PATTERNS = [
        'accounts.google.com', 'accounts.youtube.com', 'myaccount.google.com',
        'login.microsoftonline.com', 'login.live.com', 'login.windows.net',
        'github.com/login', 'github.com/sessions',
        'auth0.com', 'okta.com', 'onelogin.com',
        'sso.', '/oauth', '/auth/', '/login', '/signin', '/saml',
        'appleid.apple.com', 'idmsa.apple.com',
        'api.twitter.com/oauth', 'x.com/i/oauth',
        'facebook.com/v', 'facebook.com/dialog',
        'linkedin.com/oauth',
        'contacts.google.com/widget', 'apis.google.com',
        'plus.google.com', 'drive.google.com',
      ];
      if (AUTH_PATTERNS.some(p => url.includes(p))) {
        log(`[WebView] Allowing auth/SSO popup: ${url}`);
        return { action: 'allow' };
      }

      log(`[WebView] Intercepting window.open: ${url} (disposition: ${disposition})`);
      const parentWin = BrowserWindow.fromWebContents(contents.hostWebContents || contents)
        || BrowserWindow.getFocusedWindow()
        || BrowserWindow.getAllWindows()[0];
      if (parentWin && !parentWin.isDestroyed()) {
        parentWin.webContents.send('browser-open-in-new-tab', {
          url,
          disposition
        });
      }
      return { action: 'deny' };
    });

    contents.on('did-create-window', (newWindow) => {
      const checkAndRedirect = (realUrl) => {
        if (realUrl && realUrl !== 'about:blank') {
          // Let localhost OAuth callbacks (e.g. gcloud's localhost:8085) reach local HTTP servers
          if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(realUrl)) {
            log(`[WebView] Popup navigated to localhost (OAuth callback), skipping redirect: ${realUrl}`);
            return;
          }
          log(`[WebView] Popup navigated to: ${realUrl} - redirecting to app tab`);
          const parentWin = BrowserWindow.fromWebContents(contents.hostWebContents || contents)
            || BrowserWindow.getFocusedWindow()
            || BrowserWindow.getAllWindows()[0];
          if (parentWin && !parentWin.isDestroyed()) {
            parentWin.webContents.send('browser-open-in-new-tab', {
              url: realUrl,
              disposition: 'new-window'
            });
          }
          try { newWindow.close(); } catch (e) {}
        }
      };

      try {
        const currentUrl = newWindow.webContents.getURL();
        if (currentUrl && currentUrl !== 'about:blank') {
          checkAndRedirect(currentUrl);
          return;
        }
      } catch (e) {}

      newWindow.webContents.on('did-navigate', (event, url) => {
        checkAndRedirect(url);
      });
      newWindow.webContents.on('will-navigate', (event, url) => {
        if (url && url !== 'about:blank') {

          checkAndRedirect(url);
        }
      });

      setTimeout(() => {
        try {
          if (!newWindow.isDestroyed()) {
            const url = newWindow.webContents.getURL();
            if (!url || url === 'about:blank') {
              log('[WebView] Closing stale about:blank popup after timeout');
              newWindow.close();
            }
          }
        } catch (e) {}
      }, 5000);
    });
  }

  if (contents.getType() === 'webview') {
    const session = contents.session;
    if (session && !sessionsWithDownloadHandler.has(session)) {
      sessionsWithDownloadHandler.add(session);

      session.on('will-download', (e, item, webContents) => {
        const url = item.getURL();
        const filename = item.getFilename();

        log(`[DOWNLOAD] Intercepted download: ${filename} from ${url}`);

        item.cancel();

        const dlParentWin = BrowserWindow.fromWebContents(webContents.hostWebContents || webContents)
          || BrowserWindow.getFocusedWindow()
          || BrowserWindow.getAllWindows()[0];
        if (dlParentWin && !dlParentWin.isDestroyed()) {
          dlParentWin.webContents.send('browser-download-requested', {
            url,
            filename,
            mimeType: item.getMimeType(),
            totalBytes: item.getTotalBytes()
          });
        }
      });
    }
  }
});

async function deployIncognideTeamOnStartup() {
  const INCOGNIDE_TEAM_PATH = path.join(INCOGNIDE_HOME, 'npc_team');
  const destBase = INCOGNIDE_TEAM_PATH;
  const manifestPath = path.join(destBase, '.deploy_manifest.json');
  try {
    await fsPromises.mkdir(destBase, { recursive: true });
    const npcTeamSrc = app.isPackaged
      ? path.join(process.resourcesPath, 'npc_team')
      : path.join(__dirname, 'npc_team');
    if (!fs.existsSync(npcTeamSrc)) {
      log(`[Deploy] npc_team source not found at: ${npcTeamSrc}`);
      return { success: false, error: 'Source not found' };
    }
    // Always deploy — overwrite any existing files so updates (like jinx fixes) propagate
    const entries = await fsPromises.readdir(destBase);
    const hasManifest = fs.existsSync(manifestPath);
    if (entries.length > 0 && hasManifest) {
      log(`[Deploy] npc_team already present at ${destBase}, re-deploying to ensure latest files`);
    }
    const newManifest = {};
    const copyAndTrack = async (src, dest, relBase = '') => {
      const stat = await fsPromises.stat(src);
      if (stat.isDirectory()) {
        await fsPromises.mkdir(dest, { recursive: true });
        const items = await fsPromises.readdir(src);
        for (const item of items) {
          await copyAndTrack(path.join(src, item), path.join(dest, item), relBase ? `${relBase}/${item}` : item);
        }
      } else {
        await fsPromises.copyFile(src, dest);
        newManifest[relBase] = crypto.createHash('sha256').update(await fsPromises.readFile(dest)).digest('hex');
      }
    };
    await copyAndTrack(npcTeamSrc, destBase);
    await fsPromises.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));
    log(`[Deploy] Deployed incognide npc_team to ${destBase}`);
    return { success: true };
  } catch (e) {
    log(`[Deploy] Error deploying team: ${e.message}`);
    return { success: false, error: e.message };
  }
}

app.whenReady().then(async () => {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<style>
body { margin:0; background:#0f0f23; display:flex; align-items:center; justify-content:center; height:100vh; font-family:system-ui,sans-serif; }
.box { text-align:center; color:#cdd6f4; }
.spinner { width:48px; height:48px; border:4px solid #313244; border-top-color:#89b4fa; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 20px; }
@keyframes spin { to { transform:rotate(360deg); } }
.title { font-size:20px; font-weight:600; margin-bottom:8px; }
.sub { font-size:13px; color:#6c7086; }
</style>
</head>
<body>
<div class="box">
<div class="spinner"></div>
<div class="title">Incognide</div>
<div class="sub">Starting backend...</div>
</div>
</body>
</html>
  `));
  splashWindow.once('ready-to-show', () => splashWindow.show());

  const dataPath = ensureUserDataDirectory();
  await ensureTablesExist();

  // Ensure bundled npc_team is deployed so daemon jinx paths resolve
  try {
    await deployIncognideTeamOnStartup();
  } catch (e) {
    log(`[Deploy] Startup deploy error: ${e.message}`);
  }

  // Auto-start daemon if it was running or if there are enabled scheduled jobs
  try {
    const daemonStatus = await getDaemonStatus();
    if (daemonStatus.running) {
      log('[daemon] Reconnecting to existing daemon');
    } else {
      const enabledJobs = await dbQuery(`SELECT COUNT(*) as count FROM scheduled_jobs WHERE enabled = 1`);
      if (enabledJobs?.[0]?.count > 0 || daemonStatus.lastHeartbeat) {
        log('[daemon] Auto-starting daemon (enabled jobs exist or was previously running)');
        spawnDaemon();
      }
    }
  } catch (err) {
    log(`[daemon] Status check failed: ${err.message}`);
  }

  protocol.registerFileProtocol('file', (request, callback) => {
    const filepath = request.url.replace('file://', '');
    try {
        return callback(decodeURIComponent(filepath));
    } catch (error) {
        console.error(error);
    }
  });

  protocol.registerFileProtocol('media', (request, callback) => {
    const url = request.url.replace('media://', '');
    try {
        return callback(decodeURIComponent(url));
    } catch (error) {
        console.error(error);
    }
  });

  try {
    log('Starting backend server...');
    log(`Data directory: ${dataPath}`);

    try {
      fs.mkdirSync(dataPath, { recursive: true });
      fs.mkdirSync(path.join(os.homedir(), '.npcsh', 'npc_team'), { recursive: true });
      fs.mkdirSync(path.join(os.homedir(), '.npcsh', 'npc_team', 'jinxes'), { recursive: true });
      log('Created necessary directories for backend');
    } catch (dirErr) {
      log(`Warning: Could not create directories: ${dirErr.message}`);
    }

    const executableName = process.platform === 'win32' ? 'incognide_serve.exe' : 'incognide_serve';
    const bundledPath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', executableName)
      : path.join(app.getAppPath(), 'dist', 'resources', 'backend', executableName);

    const bundledExists = fs.existsSync(bundledPath);
    const devScriptPath = path.join(app.getAppPath(), 'incognide_serve.py');
    const devScriptExists = !app.isPackaged && fs.existsSync(devScriptPath);

    // In dev, prefer python + incognide_serve.py so stdout/stderr flow into logBackend.
    // In prod, use the bundled PyInstaller binary.
    let spawnMode = 'bundled';
    if (!app.isPackaged && devScriptExists) {
      const pyPath = getBackendPythonPath();
      if (pyPath && fs.existsSync(pyPath)) {
        _backendPath = pyPath;
        _spawnArgs = ['-u', devScriptPath];
        spawnMode = 'python-dev';
        log(`Dev mode: spawning backend via ${pyPath} ${devScriptPath}`);
      } else {
        _backendPath = bundledPath;
      }
    } else {
      _backendPath = bundledPath;
    }

    if (spawnMode === 'bundled' && !bundledExists) {
      log(`Bundled backend not found at: ${_backendPath}`);
    }

    log(`Using backend path: ${_backendPath}${_spawnArgs.length ? ' ' + _spawnArgs.join(' ') : ''}`);

    let backendAlreadyRunning = false;
    const canSpawnDev = spawnMode === 'python-dev';
    const checkAttempts = (!bundledExists && !canSpawnDev) ? 15 : 1;
    for (let attempt = 0; attempt < checkAttempts && !backendAlreadyRunning; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          log(`Backend already running on ${BACKEND_URL} - skipping spawn`);
          backendAlreadyRunning = true;
          _backendStartupError = null;
        }
      } catch (e) {
        if (attempt === 0) log(`No existing backend found on ${BACKEND_URL}, ${(bundledExists || canSpawnDev) ? 'will spawn new one' : 'polling for external backend...'}`);
      }
      if (!backendAlreadyRunning && attempt < checkAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    let serverReady = backendAlreadyRunning;

    if (!backendAlreadyRunning && spawnMode === 'bundled' && !bundledExists) {
      log('Skipping bundled backend spawn — binary missing and no external backend detected.');
      _backendStartupError = {
        message: `No backend detected on ${BACKEND_URL} and bundled binary is missing. Start the backend with \`python -m npcpy.serve\` or build the bundle.`,
        binaryPath: _backendPath,
        exitCode: null,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    if (!backendAlreadyRunning) {
      _backendEnv = {
        ...process.env,
        INCOGNIDE_PORT: String(BACKEND_PORT),
        INCOGNIDE_FRONTEND_PORT: String(FRONTEND_PORT),
        FLASK_DEBUG: '1',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        HOME: os.homedir(),
        NPCSH_BASE: path.join(os.homedir(), '.npcsh'),
        INCOGNIDE_HOME: INCOGNIDE_HOME,
        INCOGNIDE_DATA_DIR: path.join(INCOGNIDE_HOME, 'data'),
      };

      backendProcess = spawnBackendProcess(_backendPath, _spawnArgs, spawnMode, _backendEnv);

      serverReady = await waitForServer();
    }

    if (!serverReady) {
      const triedBinary = _backendPath;
      const exitCode = backendProcess?.exitCode;
      const errorMsg = `Bundled backend failed to start (binary: ${triedBinary}, exitCode: ${exitCode ?? 'null'}) — check backend.log for details`;
      log(errorMsg);
      _backendStartupError = {
        message: errorMsg,
        binaryPath: triedBinary,
        exitCode,
        timestamp: new Date().toISOString(),
      };
      // Continue — renderer will show a recovery UI via BackendErrorBanner
    } else {
      _backendStartupError = null;
    }
  } catch (err) {
    log(`Error spawning backend server: ${err.message}`);
    console.error('Error spawning backend server:', err);
    _backendStartupError = {
      message: err.message,
      pythonPath: _backendPath,
      timestamp: new Date().toISOString(),
    };
  }

  await ensureBaseDir();

  const cliArgs = {
    folder: null,
    bookmarks: []
  };

  const folderArg = process.argv.find(arg => arg.startsWith('--folder='));
  const bookmarksArg = process.argv.find(arg => arg.startsWith('--bookmarks='));

  const urlArg = process.argv.slice(2).find(arg =>
    arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('file://')
  );

  const barePathArg = process.argv.slice(2).find(arg =>
    !arg.startsWith('--') &&
    !arg.startsWith('-') &&
    !arg.startsWith('http://') &&
    !arg.startsWith('https://') &&
    !arg.startsWith('file://') &&
    (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.'))
  );

  const originalCwd = process.env.PWD || process.env.INIT_CWD || process.cwd();

  if (folderArg) {
    cliArgs.folder = folderArg.split('=')[1].replace(/^"|"$/g, '');
    log(`[CLI] Workspace folder (--folder): ${cliArgs.folder}`);
  } else if (barePathArg) {
    cliArgs.folder = barePathArg.startsWith('~')
      ? barePathArg.replace('~', os.homedir())
      : barePathArg;
    if (!path.isAbsolute(cliArgs.folder)) {
      cliArgs.folder = path.resolve(originalCwd, cliArgs.folder);
    }
    log(`[CLI] Workspace folder (bare path): ${cliArgs.folder}`);
  }

  if (bookmarksArg) {
    const urls = bookmarksArg.split('=')[1].replace(/^"|"$/g, '');
    cliArgs.bookmarks = urls.split(',').filter(u => u.trim());
    log(`[CLI] Workspace bookmarks: ${cliArgs.bookmarks.join(', ')}`);
  }

  if (urlArg) {
    cliArgs.openUrl = urlArg;
    log(`[CLI] URL to open in browser: ${urlArg}`);
  }

  createWindow(cliArgs);
});

async function callBackendApi(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`API call failed to ${url}:`, err);

    return { error: err.message, success: false };
  }
}
function ensureUserDataDirectory() {
  const userDataPath = path.join(INCOGNIDE_HOME, 'data');
  log('Creating user data directory:', userDataPath);

  try {
      fs.mkdirSync(userDataPath, { recursive: true });
      log('User data directory created/verified');
  } catch (err) {
      log('ERROR creating user data directory:', err);
  }

  return userDataPath;
}

function getBackendPythonPath() {

  const rcPath = path.join(os.homedir(), '.incogniderc');
  try {
    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const match = rcContent.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (match && match[1] && match[1].trim()) {
        const pythonPath = match[1].trim().replace(/^~/, os.homedir());

        if (fs.existsSync(pythonPath)) {
          log(`Found backend Python path: ${pythonPath}`);
          return pythonPath;
        } else {
          log(`Backend Python path configured but not found: ${pythonPath}`);
        }
      }
    }
  } catch (err) {
    log('Error reading backend Python path from .incogniderc:', err);
  }
  return null;
}

function needsFirstRunSetup() {

  const customPythonPath = getBackendPythonPath();
  if (customPythonPath) {
    return false;
  }

  const executableName = process.platform === 'win32' ? 'incognide_serve.exe' : 'incognide_serve';
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', executableName)
    : path.join(app.getAppPath(), 'dist', 'resources', 'backend', executableName);

  if (fs.existsSync(bundledPath)) {
    return false;
  }

  const setupMarkerPath = path.join(INCOGNIDE_HOME, '.setup_complete');
  if (fs.existsSync(setupMarkerPath)) {
    return false;
  }

  log('First-run setup needed: no BACKEND_PYTHON_PATH and no bundled backend');
  return true;
}

function saveBackendPythonPath(pythonPath) {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  let rcContent = '';

  try {
    if (fs.existsSync(rcPath)) {
      rcContent = fs.readFileSync(rcPath, 'utf8');
    }
  } catch (err) {
    log('Error reading .incogniderc:', err);
  }

  rcContent = rcContent.replace(/^BACKEND_PYTHON_PATH=.*$/gm, '').trim();

  rcContent = `${rcContent}\nBACKEND_PYTHON_PATH="${pythonPath}"\n`.trim() + '\n';

  try {
    fs.writeFileSync(rcPath, rcContent);
    log(`Saved BACKEND_PYTHON_PATH to .incogniderc: ${pythonPath}`);
    return true;
  } catch (err) {
    log('Error saving to .incogniderc:', err);
    return false;
  }
}

function markSetupComplete() {
  const setupMarkerPath = path.join(INCOGNIDE_HOME, '.setup_complete');
  try {
    fs.mkdirSync(path.dirname(setupMarkerPath), { recursive: true });
    fs.writeFileSync(setupMarkerPath, new Date().toISOString());
    return true;
  } catch (err) {
    log('Error marking setup complete:', err);
    return false;
  }
}

const userProfilePath = path.join(INCOGNIDE_HOME, 'user_profile.json');

const defaultUserProfile = {
  path: 'local-ai',
  aiEnabled: true,
  extras: 'local',
  tutorialComplete: false,
  setupComplete: false,
};

function getUserProfile() {
  try {
    if (fs.existsSync(userProfilePath)) {
      const content = fs.readFileSync(userProfilePath, 'utf8');
      return { ...defaultUserProfile, ...JSON.parse(content) };
    }
  } catch (err) {
    log('Error reading user profile:', err);
  }
  return { ...defaultUserProfile };
}

function saveUserProfile(profile) {
  try {
    fs.mkdirSync(path.dirname(userProfilePath), { recursive: true });
    const merged = { ...getUserProfile(), ...profile };
    fs.writeFileSync(userProfilePath, JSON.stringify(merged, null, 2));
    log('Saved user profile:', JSON.stringify(merged));
    return true;
  } catch (err) {
    log('Error saving user profile:', err);
    return false;
  }
}

function registerGlobalShortcut(win) {
  if (!win) {
    console.warn('No window provided to registerGlobalShortcut');
    return;
  }

  globalShortcut.unregisterAll();

  try {
    const rcPath = path.join(os.homedir(), '.incogniderc');
    let shortcut = DEFAULT_SHORTCUT;

    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const shortcutMatch = rcContent.match(/CHAT_SHORTCUT=["']?([^"'\n]+)["']?/);
      if (shortcutMatch) {
        shortcut = shortcutMatch[1];
      }
    }

    const macroSuccess = globalShortcut.register(shortcut, () => {
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('show-macro-input');
    });
    console.log('Macro shortcut registered:', macroSuccess);

    const screenshotSuccess = globalShortcut.register('Ctrl+Alt+4', async () => {
      const now = Date.now();
      if (isCapturingScreenshot || (now - lastScreenshotTime) < SCREENSHOT_COOLDOWN) {
        console.log('Screenshot capture blocked - too soon or already capturing');
        return;
      }

      isCapturingScreenshot = true;
      lastScreenshotTime = now;

      console.log('Screenshot shortcut triggered (Ctrl+Alt+4)');
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      const primaryDisplay = displays[0];
      const scaleFactor = primaryDisplay.scaleFactor;

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: primaryDisplay.bounds.width * scaleFactor,
            height: primaryDisplay.bounds.height * scaleFactor
          }
        });

        if (!sources || sources.length === 0) {
          console.error('No screen sources found');
          isCapturingScreenshot = false;
          return;
        }

        const fullScreenImage = sources[0].thumbnail;
        const fullScreenDataUrl = fullScreenImage.toDataURL();

        const selectionWindow = new BrowserWindow({
          x: primaryDisplay.bounds.x,
          y: primaryDisplay.bounds.y,
          width: primaryDisplay.bounds.width,
          height: primaryDisplay.bounds.height,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: false,
          movable: false,
          hasShadow: false,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        selectionWindow.setIgnoreMouseEvents(false);
        selectionWindow.setVisibleOnAllWorkspaces(true);

        const handleScreenshot = async (event, bounds) => {
          try {

            const cropBounds = {
              x: Math.round(bounds.x * scaleFactor),
              y: Math.round(bounds.y * scaleFactor),
              width: Math.round(bounds.width * scaleFactor),
              height: Math.round(bounds.height * scaleFactor)
            };

            const croppedImage = fullScreenImage.crop(cropBounds);
            const screenshotsDir = path.join(DEFAULT_CONFIG.baseDir, 'screenshots');

            if (!fs.existsSync(screenshotsDir)) {
              fs.mkdirSync(screenshotsDir, { recursive: true });
            }

            const screenshotPath = path.join(screenshotsDir, `screenshot-${Date.now()}.png`);
            fs.writeFileSync(screenshotPath, croppedImage.toPNG());

            console.log('Screenshot saved to:', screenshotPath);
            win.webContents.send('screenshot-captured', screenshotPath);

            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();

          } catch (error) {
            console.error('Screenshot crop/save failed:', error);
          } finally {
            ipcMain.removeListener('selection-complete', handleScreenshot);
            selectionWindow.close();
            isCapturingScreenshot = false;
          }
        };

        ipcMain.once('selection-complete', handleScreenshot);

        ipcMain.once('selection-cancel', () => {
          ipcMain.removeListener('selection-complete', handleScreenshot);
          selectionWindow.close();
          isCapturingScreenshot = false;
        });

        const selectionHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                overflow: hidden;
                cursor: crosshair;
                user-select: none;
                background: transparent;
              }
              #overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.15);
              }
              #selection {
                position: fixed;
                border: 2px dashed #00aaff;
                background: rgba(0, 170, 255, 0.1);
                display: none;
                pointer-events: none;
              }
              #dimensions {
                position: fixed;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: system-ui, sans-serif;
                font-size: 12px;
                display: none;
                pointer-events: none;
              }
            </style>
          </head>
          <body>
            <div id="overlay"></div>
            <div id="selection"></div>
            <div id="dimensions"></div>
            <script>
              const { ipcRenderer } = require('electron');

              let startX, startY, isSelecting = false;
              const selection = document.getElementById('selection');
              const dimensions = document.getElementById('dimensions');

              document.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startY = e.clientY;
                isSelecting = true;
                selection.style.display = 'block';
                dimensions.style.display = 'block';
                selection.style.left = startX + 'px';
                selection.style.top = startY + 'px';
                selection.style.width = '0px';
                selection.style.height = '0px';
              });

              document.addEventListener('mousemove', (e) => {
                if (!isSelecting) return;

                const currentX = e.clientX;
                const currentY = e.clientY;

                const left = Math.min(startX, currentX);
                const top = Math.min(startY, currentY);
                const width = Math.abs(currentX - startX);
                const height = Math.abs(currentY - startY);

                selection.style.left = left + 'px';
                selection.style.top = top + 'px';
                selection.style.width = width + 'px';
                selection.style.height = height + 'px';

                dimensions.style.left = (left + width + 5) + 'px';
                dimensions.style.top = (top + height + 5) + 'px';
                dimensions.textContent = width + ' x ' + height;
              });

              document.addEventListener('mouseup', (e) => {
                if (!isSelecting) return;
                isSelecting = false;

                const rect = selection.getBoundingClientRect();
                if (rect.width > 5 && rect.height > 5) {
                  ipcRenderer.send('selection-complete', {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                  });
                } else {
                  ipcRenderer.send('selection-cancel');
                }
              });

              document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                  ipcRenderer.send('selection-cancel');
                }
              });
            </script>
          </body>
          </html>
        `;

        selectionWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(selectionHtml));

      } catch (error) {
        console.error('Screenshot capture failed:', error);
        isCapturingScreenshot = false;
      }
    });

  } catch (error) {
    console.error('Failed to register global shortcut:', error);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log(`Another instance is already running (mode: ${IS_DEV_MODE ? 'dev' : 'production'})`);
  app.quit();
} else {

  if (process.defaultApp) {

    app.setAsDefaultProtocolClient('incognide', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('incognide');
  }

  let pendingDeepLinkUrl = null;

  let lastActiveWindow = null;
  app.on('browser-window-focus', (_, window) => { lastActiveWindow = window; });

  const openUrlInBrowserPane = (targetUrl) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length) {
      const mainWindow = BrowserWindow.getFocusedWindow() ||
        (lastActiveWindow && !lastActiveWindow.isDestroyed() ? lastActiveWindow : null) ||
        windows[0];
      log(`[DEEP-LINK] Opening URL in browser pane: ${targetUrl}`);
      mainWindow.webContents.send('open-url-in-browser', { url: targetUrl });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {

      pendingDeepLinkUrl = targetUrl;
    }
  };

  app.on('open-url', (event, url) => {
    event.preventDefault();
    log(`[DEEP-LINK] Received open-url: ${url}`);

    if (url.startsWith('incognide://open-url')) {
      const prefix = 'incognide://open-url?url=';
      if (url.startsWith(prefix)) {
        let targetUrl = url.substring(prefix.length);

        targetUrl = decodeURIComponent(targetUrl);
        openUrlInBrowserPane(targetUrl);
      }
    } else if (url.startsWith('incognide://')) {

      const match = url.match(/url=(.+)/);
      if (match) {
        openUrlInBrowserPane(decodeURIComponent(match[1]));
      }
    }
  });

  const interceptFilePath = path.join(INCOGNIDE_HOME, 'browser_intercept.txt');
  let interceptWatcher = null;
  const startInterceptFileWatcher = () => {
    try {

      const interceptDir = path.dirname(interceptFilePath);
      fs.mkdirSync(interceptDir, { recursive: true });

      let lastSize = 0;
      try {
        lastSize = fs.statSync(interceptFilePath).size;
      } catch (e) {

      }

      interceptWatcher = fs.watch(interceptDir, (eventType, filename) => {
        if (filename !== 'browser_intercept.txt') return;
        try {
          const stat = fs.statSync(interceptFilePath);
          if (stat.size > lastSize) {

            const fd = fs.openSync(interceptFilePath, 'r');
            const buf = Buffer.alloc(stat.size - lastSize);
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            fs.closeSync(fd);
            lastSize = stat.size;

            const newContent = buf.toString('utf8').trim();
            if (newContent) {

              const urls = newContent.split('\n').filter(u => u.trim());
              for (const url of urls) {
                const trimmed = url.trim();
                if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                  log(`[INTERCEPT-FILE] Opening URL from browser_intercept.txt: ${trimmed}`);
                  openUrlInBrowserPane(trimmed);
                }
              }
            }
          }
        } catch (e) {
          log(`[INTERCEPT-FILE] Error reading intercept file: ${e.message}`);
        }
      });
      log('[INTERCEPT-FILE] Watching browser_intercept.txt for intercepted URLs');
    } catch (e) {
      log(`[INTERCEPT-FILE] Failed to start file watcher: ${e.message}`);
    }
  };

  const getPendingDeepLinkUrl = () => {
    const url = pendingDeepLinkUrl;
    pendingDeepLinkUrl = null;
    return url;
  };

  const expandHomeDir = (filepath) => {
    if (filepath.startsWith('~')) {
      return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
  };

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length) {

      const mainWindow = BrowserWindow.getFocusedWindow() ||
        (lastActiveWindow && !lastActiveWindow.isDestroyed() ? lastActiveWindow : null) ||
        windows[0];

      const folderArg = commandLine.find(arg => arg.startsWith('--folder='));
      const barePathArg = commandLine.slice(1).find(arg =>
        !arg.startsWith('-') && (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.'))
      );
      const actionArg = commandLine.find(arg => arg.startsWith('--action='));

      const urlArg = commandLine.slice(1).find(arg =>
        arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('file://')
      );

      if (urlArg) {
        // OAuth callback URLs (localhost) must reach the local HTTP server, not Electron's browser pane
        const isLocalhostCallback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(urlArg);
        if (isLocalhostCallback) {
          log(`[SECOND-INSTANCE] Ignoring localhost OAuth callback (letting it reach local HTTP server): ${urlArg}`);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          return;
        }
        log(`[SECOND-INSTANCE] Opening URL in browser pane: ${urlArg}`);
        mainWindow.webContents.send('open-url-in-browser', { url: urlArg });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        return;
      }

      let folder = null;
      if (folderArg) {
        folder = folderArg.split('=')[1].replace(/^"|"$/g, '');
      } else if (barePathArg) {
        folder = barePathArg.startsWith('~')
          ? barePathArg.replace('~', os.homedir())
          : barePathArg;
        if (!path.isAbsolute(folder)) {
          folder = path.resolve(workingDirectory, folder);
        }
      }

      if (folder) {
        log(`[SECOND-INSTANCE] Opening workspace: ${folder}`);
        mainWindow.webContents.send('cli-open-workspace', { folder });
      }

      if (actionArg) {
        try {
          const actionJson = actionArg.split('=').slice(1).join('=');
          const actionData = JSON.parse(actionJson);
          log(`[SECOND-INSTANCE] Executing action: ${actionData.action}`);
          mainWindow.webContents.send('execute-studio-action', actionData);
        } catch (err) {
          log(`[SECOND-INSTANCE] Failed to parse action: ${err.message}`);
        }
      }

      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (files) => {
    const attachmentData = [];
    for (const file of Array.from(files)) {
      const base64 = await convertFileToBase64(file);
      attachmentData.push({
        name: file.name,
        type: file.type,
        base64: base64
      });
    }
    await window.api.get_attachment_response(attachmentData);
  };

  protocol.registerSchemesAsPrivileged([{
    scheme: 'media',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      stream: true,
      secure: true,
      corsEnabled: true
    }
  }]);

  async function getConversationsFromDb(dirPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      const query = `
        SELECT DISTINCT conversation_id,
              MIN(timestamp) as start_time,
              GROUP_CONCAT(content) as preview
        FROM conversation_history
        WHERE directory_path = ?
        GROUP BY conversation_id
        ORDER BY start_time DESC
      `;

      db.all(query, [dirPath], (err, rows) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve({
            conversations: rows.map(row => ({
              id: row.conversation_id,
              timestamp: row.start_time,
              preview: row.preview
            }))
          });
        }
      });
    });
  }
  function showWindow() {
    if (!mainWindow) {
      createWindow();
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow.setPosition(
      Math.round(width / 2 - 600),
      Math.round(height / 2 - 400)
    );

    mainWindow.show();
    mainWindow.focus();

    mainWindow.webContents.send('show-macro-input');
  }

function createWindow(cliArgs = {}) {
    const { folder, bookmarks, openUrl, blank } = cliArgs;

    // If opening a specific folder, check if a window already has it open
    if (folder) {
        const normFolder = folder.replace(/\/+$/, '');
        for (const [windowId, wsPath] of workspacePathByWindow.entries()) {
            if (wsPath && wsPath.replace(/\/+$/, '') === normFolder) {
                const existing = BrowserWindow.getAllWindows().find(w => w.webContents?.id === windowId);
                if (existing && !existing.isDestroyed()) {
                    if (existing.isMinimized()) existing.restore();
                    existing.focus();
                    return existing;
                }
            }
        }
    }

    const possibleIconPaths = [
        path.resolve(__dirname, '..', 'assets', 'icon.png'),
        path.join(process.resourcesPath || '', 'assets', 'icon.png'),
        path.join(app.getAppPath(), 'assets', 'icon.png'),
    ];
    const iconPath = possibleIconPaths.find(p => fs.existsSync(p)) || possibleIconPaths[0];
    console.log(`[ICON DEBUG] Using icon path: ${iconPath}, exists: ${fs.existsSync(iconPath)}`);

    let appIcon = null;
    if (fs.existsSync(iconPath)) {
        appIcon = nativeImage.createFromPath(iconPath);
        console.log(`[ICON DEBUG] Created nativeImage, isEmpty: ${appIcon.isEmpty()}`);
    }

    console.log('Creating window');

    app.setName('Incognide');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      icon: appIcon || iconPath,
      title: 'Incognide',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        webSecurity: false,
        webviewTag: true,
        plugins: true,
        enableRemoteModule: true,
        nodeIntegrationInSubFrames: true,
        allowRunningInsecureContent: true,
        experimentalFeatures: true,
        preload: path.join(__dirname, 'preload.js')
      }
          });
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });

    // Mac trackpad swipe gestures for browser back/forward
    if (process.platform === 'darwin') {
      mainWindow.on('swipe', (event, direction) => {
        if (direction === 'left') mainWindow.webContents.send('browser-swipe-back');
        if (direction === 'right') mainWindow.webContents.send('browser-swipe-forward');
      });
    }

    mainWindow.webContents.session.protocol.registerFileProtocol('file', (request, callback) => {
      const pathname = decodeURI(request.url.replace('file:///', ''));
      callback(pathname);
    });
    setTimeout(() => {
      if (appIcon && !appIcon.isEmpty()) {
        mainWindow.setIcon(appIcon);
      } else if (fs.existsSync(iconPath)) {
        mainWindow.setIcon(iconPath);
      } else {
        console.log(`Warning: Icon file not found at ${iconPath}`);
      }
    }, 100);

    registerGlobalShortcut(mainWindow);

applyAppMenu();
    
    // Add Referer header for tile servers that require it (OSM, OpenTopoMap)
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['*://*.tile.openstreetmap.org/*', '*://*.tile.opentopomap.org/*'] }, (details, callback) => {
      details.requestHeaders['Referer'] = 'https://incognide.com';
      details.requestHeaders['User-Agent'] = 'Incognide/0.1 (https://incognide.com)';
      callback({ requestHeaders: details.requestHeaders });
    });

    // Add Referer header for tile servers that require it (OSM, OpenTopoMap)
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['*://*.tile.openstreetmap.org/*', '*://*.tile.opentopomap.org/*'] }, (details, callback) => {
      details.requestHeaders['Referer'] = 'https://incognide.com';
      details.requestHeaders['User-Agent'] = 'Incognide/0.1 (https://incognide.com)';
      callback({ requestHeaders: details.requestHeaders });
    });

    // Clerk requires an Origin header for PATCH requests to /v1/environment.
    // Electron doesn't send one automatically for cross-origin requests from localhost.
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.clerk.accounts.dev/*', 'https://clerk.app.incognide.com/*'] }, (details, callback) => {
      if (!details.requestHeaders['Origin']) {
        details.requestHeaders['Origin'] = `http://localhost:${FRONTEND_PORT}`;
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    if (!clerkWebRequestRegistered) {
      clerkWebRequestRegistered = true;
      const defaultSession = require('electron').session.defaultSession;
      defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        // Rewrite Clerk cookies to SameSite=None so they survive cross-site (localhost -> clerk.app.incognide.com)
        if (responseHeaders['set-cookie']) {
          responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie => {
            if (cookie.toLowerCase().includes('clerk') || cookie.toLowerCase().includes('__client')) {
              let fixed = cookie.replace(/\s*SameSite=[^;]+/gi, '');
              fixed = fixed.replace(/\s*Secure/gi, '');
              return fixed + '; SameSite=None; Secure';
            }
            return cookie;
          });
        }
        callback({
          responseHeaders: {
            ...responseHeaders,
            'Content-Security-Policy': [
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://js.stripe.com https://*.clerk.accounts.dev https://clerk.app.incognide.com https://www.google.com https://www.gstatic.com https://accounts.google.com https://accounts.youtube.com; " +
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com https://fonts.googleapis.com https://www.google.com https://www.gstatic.com https://accounts.google.com https://accounts.youtube.com; " +
          "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com https://fonts.googleapis.com https://www.google.com https://www.gstatic.com https://accounts.google.com https://accounts.youtube.com; " +
          "img-src 'self' data: file: media: blob: http: https:; " +
          "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; " +
          `connect-src 'self' file: media: http://localhost:${FRONTEND_PORT} http://127.0.0.1:${BACKEND_PORT} ${BACKEND_URL} blob: ws: wss: https://* http://*; ` +
          "frame-src 'self' file: data: blob: media: chrome-extension: https://js.stripe.com https://m.stripe.network https://checkout.stripe.com https://*.clerk.accounts.dev https://clerk.app.incognide.com https://accounts.youtube.com https://accounts.google.com https://www.google.com https://www.gstatic.com; " +
          "object-src 'self' file: data: blob: media: chrome-extension:; " +
          "worker-src 'self' blob: data:; " +
          "media-src 'self' data: file: blob: http: https:;"

            ]
          },
        });
      });
    }

    // Clear stale Clerk cookies from old dev instance to avoid key mismatch
    mainWindow.webContents.session.clearStorageData({
      storages: ['cookies'],
      origin: 'https://clerk.app.incognide.com'
    }).catch(() => {});
    mainWindow.webContents.session.clearStorageData({
      storages: ['cookies'],
      origin: 'https://active-wombat-22.clerk.accounts.dev'
    }).catch(() => {});

    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

    if (isDev) {
      mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
    } else {
      const distDir = path.join(app.getAppPath(), 'dist');
      if (frontendServer) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
      } else {
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.otf': 'font/otf',
          '.wasm': 'application/wasm',
          '.map': 'application/json',
        };

        // Studio action queue (replaces python backend studio endpoints)
        const _pendingStudioActions = {};
        let _studioActionCounter = 0;
        const _studioActionResults = {};
        const _studioSSESubscribers = [];
        function _notifyStudioSubscribers(action) {
          const dead = [];
          for (const sub of _studioSSESubscribers) {
            try { sub(action); } catch (e) { dead.push(sub); }
          }
          for (const sub of dead) {
            const idx = _studioSSESubscribers.indexOf(sub);
            if (idx !== -1) _studioSSESubscribers.splice(idx, 1);
          }
        }
        function _sendJSON(res, status, obj) {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        }
        function _readBody(req) {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try { resolve(JSON.parse(body)); } catch { resolve({}); }
            });
          });
        }

        frontendServer = http.createServer(async (req, res) => {
          const url = (req.url || '/').split('?')[0];

          // --- Studio action routes ---
          if (url === '/api/studio/action' && req.method === 'POST') {
            const data = await _readBody(req);
            const action = data.action;
            const args = data.args || {};
            const windowId = data.window_id || '';
            if (!action) { _sendJSON(res, 400, { success: false, error: 'Missing action' }); return; }
            _studioActionCounter += 1;
            const actionId = `mcp_action_${_studioActionCounter}`;
            const actionData = { action, args, status: 'pending' };
            if (windowId) actionData.window_id = windowId;
            _pendingStudioActions[actionId] = actionData;
            console.log(`[Studio] Queued action ${actionId}: ${action}` + (windowId ? ` -> window ${windowId}` : ''));
            _notifyStudioSubscribers({ id: actionId, ...actionData });
            const start = Date.now();
            const interval = setInterval(() => {
              if (actionId in _studioActionResults || Date.now() - start > 30000) {
                clearInterval(interval);
              }
            }, 100);
            while (!(actionId in _studioActionResults) && Date.now() - start < 30000) {
              await new Promise(r => setTimeout(r, 100));
            }
            clearInterval(interval);
            const result = _studioActionResults[actionId];
            delete _studioActionResults[actionId];
            delete _pendingStudioActions[actionId];
            if (result) { _sendJSON(res, 200, result); }
            else { _sendJSON(res, 504, { success: false, error: 'Action timed out waiting for frontend' }); }
            return;
          }

          if (url === '/api/studio/pending_actions' && req.method === 'GET') {
            const pending = {};
            for (const [aid, action] of Object.entries(_pendingStudioActions)) {
              if (action.status === 'pending') pending[aid] = action;
            }
            _sendJSON(res, 200, { success: true, actions: pending });
            return;
          }

          if (url === '/api/studio/actions_stream' && req.method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no'
            });
            const send = (payload) => {
              try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* closed */ }
            };
            _studioSSESubscribers.push(send);
            for (const [aid, action] of Object.entries(_pendingStudioActions)) {
              if (action.status === 'pending') send({ id: aid, ...action });
            }
            const keepalive = setInterval(() => {
              try { res.write(': keepalive\n\n'); } catch { /* closed */ }
            }, 30000);
            req.on('close', () => {
              clearInterval(keepalive);
              const idx = _studioSSESubscribers.indexOf(send);
              if (idx !== -1) _studioSSESubscribers.splice(idx, 1);
            });
            return;
          }

          if (url === '/api/studio/action_complete' && req.method === 'POST') {
            const data = await _readBody(req);
            const actionId = data.actionId;
            const result = data.result || {};
            if (!actionId) { _sendJSON(res, 400, { success: false, error: 'Missing actionId' }); return; }
            if (_pendingStudioActions[actionId]) _pendingStudioActions[actionId].status = 'complete';
            _studioActionResults[actionId] = result;
            console.log(`[Studio] Action complete ${actionId}: success=${result.success || false}`);
            _sendJSON(res, 200, { success: true });
            return;
          }

          // --- Static file serving ---
          let filePath = path.join(distDir, decodeURIComponent(url));
          if (filePath.endsWith('/')) filePath += 'index.html';
          if (!filePath.startsWith(distDir)) {
            res.writeHead(403); res.end('Forbidden'); return;
          }
          fs.readFile(filePath, (err, data) => {
            if (err) {
              if (err.code === 'ENOENT') {
                const indexPath = path.join(distDir, 'index.html');
                fs.readFile(indexPath, (e2, data2) => {
                  if (e2) { res.writeHead(404); res.end('Not found'); }
                  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(data2); }
                });
              } else { res.writeHead(500); res.end('Server error'); }
              return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(data);
          });
        });
        frontendServer.listen(FRONTEND_PORT, '127.0.0.1', () => {
          console.log(`Frontend server running at http://localhost:${FRONTEND_PORT}`);
        });
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
      }
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {

        if (input.control && !input.shift && !input.alt && input.key.toLowerCase() === 't') {
          event.preventDefault();
          mainWindow.webContents.send('browser-new-tab');
        }

        if (input.control && input.shift && !input.alt && input.key.toLowerCase() === 'o') {
          event.preventDefault();
          mainWindow.webContents.send('open-folder-picker');
        }
      }
    });

    const cliWorkspaceArgs = { folder, bookmarks, openUrl };

    mainWindow.webContents.on('did-finish-load', async () => {
      // Send startup error notification if backend failed to start
      if (_backendStartupError) {
        await new Promise(resolve => setTimeout(resolve, 500));
        mainWindow.webContents.send('backend:startup-error', _backendStartupError);
        log('[STARTUP] Sent backend startup error notification to renderer');
      }

      if (blank) {
        await new Promise(resolve => setTimeout(resolve, 100));
        mainWindow.webContents.send('blank-window');
      }
      if (folder || (bookmarks && bookmarks.length > 0) || openUrl) {
        log(`[CLI] Sending workspace args to renderer: folder=${folder}, bookmarks=${bookmarks?.length || 0}, openUrl=${openUrl}`);

        await new Promise(resolve => setTimeout(resolve, 100));

        if (folder) {
          mainWindow.webContents.send('cli-open-workspace', { folder });
        }

        if (bookmarks && bookmarks.length > 0 && folder) {
          for (const url of bookmarks) {
            try {

              await dbQuery(
                'INSERT OR IGNORE INTO bookmarks (url, title, folder_path, is_global) VALUES (?, ?, ?, ?)',
                [url, url, folder, 0]
              );
              log(`[CLI] Added bookmark: ${url}`);
            } catch (err) {
              log(`[CLI] Error adding bookmark ${url}: ${err.message}`);
            }
          }
          mainWindow.webContents.send('cli-bookmarks-added', { bookmarks, folder });
        }

        if (openUrl) {
          log(`[CLI] Opening URL in browser pane: ${openUrl}`);
          mainWindow.webContents.send('open-url-in-browser', { url: openUrl });
        }
      }

      const pendingUrl = getPendingDeepLinkUrl();
      if (pendingUrl) {
        log(`[DEEP-LINK] Opening pending deep link URL: ${pendingUrl}`);
        mainWindow.webContents.send('open-url-in-browser', { url: pendingUrl });
      }

      // Process any file that was opened before the window was ready
      processPendingFileOpen(mainWindow);

      startInterceptFileWatcher();
    });
}

const { registerAll } = require('./ipc');
registerAll({
  ipcMain,
  getMainWindow: () => mainWindow,
  dbQuery,
  callBackendApi,
  BACKEND_URL,
  BACKEND_PORT,
  log,
  logBackend: typeof logBackend !== 'undefined' ? logBackend : log,
  generateId,
  activeStreams,
  DEFAULT_CONFIG,
  app,
  IS_DEV_MODE,
  cronJobs,
  daemons,
  scheduleCronJob,
  deviceConfig,
  updateDeviceConfig,
  getOrCreateDeviceId,
  needsFirstRunSetup,
  saveBackendPythonPath,
  markSetupComplete,
  getBackendPythonPath,
  getUserProfile,
  saveUserProfile,
  registerGlobalShortcut,
  backendProcess,
  killBackendProcess,
  spawnDaemon,
  killDaemon,
  getDaemonStatus,
  ensureUserDataDirectory,
  waitForServer,
  logsDir,
  electronLogPath,
  backendLogPath,
  ensureTablesExist,
  appDir: __dirname,
  NPCSH_BASE,
  INCOGNIDE_HOME,
});

// Generic proxy fetch — bypasses CORS for renderer requests to external APIs

// Recent paths IPC handlers
ipcMain.handle('get-recent-paths', async () => {
  return loadRecentPaths();
});

ipcMain.handle('set-recent-paths', async (_event, paths) => {
  if (Array.isArray(paths)) {
    saveRecentPaths(paths.slice(0, 20));
  }
});

ipcMain.handle('add-recent-path', async (_event, newPath) => {
  if (newPath) {
    addRecentPath(newPath);
  }
});

ipcMain.handle('proxy-fetch', async (_event, url, options = {}) => {
  try {
    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
    });
    const contentType = resp.headers.get('content-type') || '';
    let data;
    if (contentType.includes('json')) {
      data = await resp.json();
    } else {
      data = await resp.text();
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
});

// List serial ports (for radio connections)
ipcMain.handle('list-serial-ports', async () => {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer, vendorId: p.vendorId, productId: p.productId }));
  } catch (err) {
    return [];
  }
});

ipcMain.handle('open-new-window', async (event, initialPath, options) => {
  if (initialPath) {
    // Normalize for comparison (strip trailing slashes)
    const normPath = initialPath.replace(/\/+$/, '');
    // Check if a window already has this folder open — focus it instead
    // (skip dedup when launching a preset — we want all windows)
    if (!options?.skipDedup) {
      for (const [windowId, wsPath] of workspacePathByWindow.entries()) {
        if (wsPath && wsPath.replace(/\/+$/, '') === normPath) {
          const existing = BrowserWindow.getAllWindows().find(w => w.webContents?.id === windowId);
          if (existing && !existing.isDestroyed()) {
            if (existing.isMinimized()) existing.restore();
            existing.focus();
            return;
          }
        }
      }
    }
    const win = createWindow({ folder: initialPath });
    if (options?.bounds && win) {
      win.setBounds(options.bounds);
    }
    return win?.webContents?.id;
  } else {
    const win = createWindow({ blank: true });
    if (options?.bounds && win) {
      win.setBounds(options.bounds);
    }
    return win?.webContents?.id;
  }
});

ipcMain.handle('get-window-count', async () => {
  return BrowserWindow.getAllWindows().length;
});

ipcMain.handle('get-all-windows-info', async () => {
  const allWindows = BrowserWindow.getAllWindows();
  return allWindows
    .filter(w => !w.isDestroyed())
    .map(w => ({
      windowId: w.webContents?.id ?? w.id,
      folderPath: workspacePathByWindow.get(w.webContents?.id) || null,
      title: w.getTitle() || 'Untitled',
      bounds: w.getBounds(),
      display: require('electron').screen.getDisplayMatching(w.getBounds()).id,
    }));
});

// Request a specific window to serialize its workspace and send it back
ipcMain.handle('request-window-workspace', async (_event, windowId) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (!target) return null;
  try {
    const result = await target.webContents.executeJavaScript('window.__serializeWorkspace?.()');
    return result || null;
  } catch (e) {
    console.error('[WORKSPACE] Failed to serialize window workspace:', e);
    return null;
  }
});

// Tell a specific window to restore a workspace layout
ipcMain.handle('restore-window-workspace', async (_event, windowId, workspaceData) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (!target) return false;
  target.webContents.send('restore-workspace', workspaceData);
  return true;
});

ipcMain.handle('close-window-by-id', async (_event, windowId) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (target) {
    target.close();
    return true;
  }
  return false;
});

ipcMain.handle('focus-window-by-id', async (_event, windowId) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (target) {
    if (target.isMinimized()) target.restore();
    target.focus();
    return true;
  }
  return false;
});

ipcMain.handle('minimize-window-by-id', async (_event, windowId) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (target) {
    target.minimize();
    return true;
  }
  return false;
});

ipcMain.handle('maximize-window-by-id', async (_event, windowId) => {
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (target) {
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
    return true;
  }
  return false;
});

ipcMain.handle('get-displays', async () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.map(d => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primary.id,
    size: d.size,
  }));
});

ipcMain.handle('move-window-to-display', async (_event, windowId, displayId) => {
  const { screen } = require('electron');
  const allWindows = BrowserWindow.getAllWindows();
  const target = allWindows.find(w => !w.isDestroyed() && (w.webContents?.id === windowId || w.id === windowId));
  if (!target) return false;
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId);
  if (!targetDisplay) return false;
  const currentBounds = target.getBounds();
  target.setBounds({
    x: targetDisplay.workArea.x + 50,
    y: targetDisplay.workArea.y + 50,
    width: Math.min(currentBounds.width, targetDisplay.workArea.width - 100),
    height: Math.min(currentBounds.height, targetDisplay.workArea.height - 100),
  });
  target.focus();
  return true;
});

ipcMain.handle('backend:health', async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      return {
        status: 'ok',
        pid: backendProcess?.pid || null,
        backendProcess: {
          running: backendProcess !== null && backendProcess.exitCode === null,
          pid: backendProcess?.pid || null,
          exitCode: backendProcess?.exitCode,
        },
        pythonPath: _backendPath,
        backendUrl: BACKEND_URL,
        timestamp: new Date().toISOString(),
        ...data
      };
    }
    return {
      status: 'unhealthy',
      error: `HTTP ${response.status}`,
      backendProcess: {
        running: backendProcess !== null && backendProcess.exitCode === null,
        pid: backendProcess?.pid || null,
        exitCode: backendProcess?.exitCode,
      },
      pythonPath: _backendPath,
      backendUrl: BACKEND_URL,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: 'unreachable',
      error: err.message,
      backendProcess: {
        running: backendProcess !== null && backendProcess.exitCode === null,
        pid: backendProcess?.pid || null,
        exitCode: backendProcess?.exitCode,
      },
      pythonPath: _backendPath,
      backendUrl: BACKEND_URL,
      timestamp: new Date().toISOString(),
    };
  }
});

ipcMain.handle('backend:getStartupError', async () => {
  return _backendStartupError;
});

ipcMain.handle('backend:tryLocalPython', async () => {
  log('Searching for local Python >= 3.10...');
  const versionedBinaries = ['python3.13', 'python3.12', 'python3.11', 'python3.10'];

  // Try versioned binaries first
  for (const bin of versionedBinaries) {
    try {
      const result = execSync(`${bin} --version 2>&1`, { timeout: 5000 }).toString().trim();
      const match = result.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major > 3 || (major === 3 && minor >= 10)) {
          log(`Found Python ${major}.${minor} at: ${bin}`);
          return { found: true, pythonPath: bin, version: `${major}.${minor}` };
        }
      }
    } catch (e) {
      // not found or not executable
    }
  }

  // Check pyenv versions
  const pyenvBase = path.join(os.homedir(), '.pyenv', 'versions');
  if (fs.existsSync(pyenvBase)) {
    try {
      const entries = fs.readdirSync(pyenvBase);
      for (const entry of entries.sort().reverse()) {
        const pyBin = path.join(pyenvBase, entry, 'bin', 'python3');
        if (fs.existsSync(pyBin)) {
          try {
            const result = execSync(`"${pyBin}" --version 2>&1`, { timeout: 5000 }).toString().trim();
            const match = result.match(/Python (\d+)\.(\d+)/);
            if (match) {
              const major = parseInt(match[1], 10);
              const minor = parseInt(match[2], 10);
              if (major > 3 || (major === 3 && minor >= 10)) {
                log(`Found Python ${major}.${minor} via pyenv at: ${pyBin}`);
                return { found: true, pythonPath: pyBin, version: `${major}.${minor}` };
              }
            }
          } catch (e) {
            // skip
          }
        }
      }
    } catch (e) {
      log(`Error reading pyenv versions: ${e.message}`);
    }
  }

  log('No Python >= 3.10 found');
  return { found: false, pythonPath: null, version: null };
});

ipcMain.handle('backend:installAndStart', async (event, { pythonPath, npcpyExtras = 'lite' }) => {
  const mainWindow = getMainWindow();
  const sendProgress = (text) => {
    event.sender.send('backend:installProgress', { text });
    log(`[backend:installAndStart] ${text}`);
  };

  try {
    const venvDir = path.join(INCOGNIDE_HOME, 'venv');

    sendProgress(`Creating virtual environment at ${venvDir}...`);

    // Delete existing venv if present
    if (fs.existsSync(venvDir)) {
      sendProgress('Removing existing venv...');
      fs.rmSync(venvDir, { recursive: true, force: true });
    }

    // Create venv
    execSync(`"${pythonPath}" -m venv "${venvDir}"`, { timeout: 60000 });
    sendProgress('Virtual environment created.');

    const venvPython = path.join(venvDir, 'bin', 'python');

    sendProgress(`Installing npcpy[${npcpyExtras}] and npcsh...`);

    // Stream pip install output
    await new Promise((resolve, reject) => {
      const installProc = spawn(venvPython, ['-m', 'pip', 'install', '--upgrade', `npcpy[${npcpyExtras}]`, 'npcsh'], {
        env: { ...process.env, HOME: os.homedir(), PYTHONUNBUFFERED: '1' },
      });

      installProc.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) sendProgress(line);
      });
      installProc.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) sendProgress(line);
      });
      installProc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pip install exited with code ${code}`));
      });
      installProc.on('error', reject);
    });

    sendProgress('Installation complete. Starting backend...');

    // Kill existing backend if any
    killBackendProcess();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Set up env and spawn with venv python
    _backendEnv = {
      ...process.env,
      INCOGNIDE_PORT: String(BACKEND_PORT),
      INCOGNIDE_FRONTEND_PORT: String(FRONTEND_PORT),
      FLASK_DEBUG: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      HOME: os.homedir(),
      NPCSH_BASE: path.join(os.homedir(), '.npcsh'),
      INCOGNIDE_HOME: INCOGNIDE_HOME,
      NPCSH_DATA_DIR: path.join(INCOGNIDE_HOME, 'data'),
    };

    _backendPath = venvPython;
    _spawnArgs = ['-m', 'npcpy.serve'];

    backendProcess = spawnBackendProcess(venvPython, ['-m', 'npcpy.serve'], 'venv-install', _backendEnv);
    const ready = await waitForServer(60, 1000);

    if (ready) {
      _backendStartupError = null;
      // Save the venv python path to .incogniderc
      saveBackendPythonPath(venvPython);
      sendProgress('Backend started successfully.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:started', { venvPython });
      }
      return { success: true };
    } else {
      const errMsg = `Backend did not become ready after install (exitCode: ${backendProcess?.exitCode ?? 'null'})`;
      sendProgress(errMsg);
      return { success: false, error: errMsg };
    }
  } catch (err) {
    log(`[backend:installAndStart] Error: ${err.message}`);
    sendProgress(`Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backend:restart', async () => {
  try {
    log('Backend restart requested by renderer');
    killBackendProcess();

    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!_backendPath || !_backendEnv) {
      return { success: false, error: 'Backend spawn config not available' };
    }
    backendProcess = spawnBackendProcess(_backendPath, _spawnArgs, 'restart', _backendEnv);
    const ready = await waitForServer(30, 1000);
    if (ready) {
      log('Backend restarted successfully');
      return { success: true };
    } else {
      log('Backend restart failed — server did not become ready');
      return { success: false, error: 'Server did not start in time' };
    }
  } catch (err) {
    log(`Backend restart error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    log('Killing backend process (before-quit)');
    killBackendProcess();
  }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (backendProcess) {
        log('Killing backend process');
        killBackendProcess();
      }
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    console.error(error.stack);
  });

  console.log('MAIN PROCESS SETUP COMPLETE');
}
