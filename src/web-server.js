/**
 * web-server.js — Express server that bridges IPC handlers for web deployment.
 *
 * Replaces the minimal static server in the Dockerfile.  For every
 * ipcMain.handle('channel', handler) registered by the IPC modules, this
 * server exposes  POST /api/ipc/<channel>  which calls the same handler.
 *
 * Streaming operations (terminal data, chat streams, file-change events,
 * browser events, etc.) are forwarded over a single WebSocket at /ws.
 *
 * Usage:
 *   NODE_ENV=production node src/web-server.js
 */

// ---------------------------------------------------------------------------
// Shim: Override require('electron') so IPC modules load in pure Node.js
// ---------------------------------------------------------------------------

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'electron') {
    return require.resolve('./electron-shim.js');
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const cors = require('cors');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || process.env.FRONTEND_PORT || '3000', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '5337', 10);
const BACKEND_URL = process.env.BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(os.homedir(), 'npcsh_history.db');
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/data/workspace';
const NPCSH_BASE = process.env.NPCSH_BASE || path.join(os.homedir(), '.npcsh');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const IS_DEV_MODE = process.env.NODE_ENV === 'development';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const logsDir = path.join(NPCSH_BASE, 'incognide', 'logs');
try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}

const log = (...messages) => {
  const msg = `[${new Date().toISOString()}] [WEB-SERVER] ${messages.join(' ')}`;
  console.log(msg);
};

// ---------------------------------------------------------------------------
// SQLite helper  (same contract as main.js dbQuery)
// ---------------------------------------------------------------------------

const dbQuery = (query, params = []) => {
  const isReadQuery =
    query.trim().toUpperCase().startsWith('SELECT') ||
    query.trim().toUpperCase().startsWith('PRAGMA');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      DATABASE_PATH,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (err) => {
        if (err) return reject(err);
      }
    );

    if (isReadQuery) {
      db.all(query, params, (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      });
    } else {
      db.run(query, params, function (err) {
        db.close();
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    }
  });
};

// ---------------------------------------------------------------------------
// Utility functions (mirrors from main.js)
// ---------------------------------------------------------------------------

function generateId() {
  return crypto.randomUUID();
}

const activeStreams = new Map();

async function callBackendApi(url, options = {}) {
  const fetch = require('node-fetch');
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

function parseNpcshrc() {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          result[match[1]] = value;
        }
      }
    }
  } catch (e) {
    log('Error reading .npcshrc:', e.message);
  }
  return result;
}

function getDefaultModelConfig() {
  let yaml;
  try { yaml = require('js-yaml'); } catch { yaml = null; }

  let model = 'llama3.2';
  let provider = 'ollama';
  let npc = 'sibiji';

  const npcshrcEnv = parseNpcshrc();

  const chatModel = process.env.NPCSH_CHAT_MODEL || npcshrcEnv.NPCSH_CHAT_MODEL;
  const chatProvider = process.env.NPCSH_CHAT_PROVIDER || npcshrcEnv.NPCSH_CHAT_PROVIDER;
  const defaultNpc = process.env.NPCSH_DEFAULT_NPC || npcshrcEnv.NPCSH_DEFAULT_NPC;

  if (chatModel) model = chatModel;
  if (chatProvider) provider = chatProvider;
  if (defaultNpc) npc = defaultNpc;

  if (!chatModel && yaml) {
    try {
      const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
      if (fs.existsSync(globalCtx)) {
        const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
        if (ctxData.model) model = ctxData.model;
        if (ctxData.provider) provider = ctxData.provider;
        if (ctxData.npc) npc = ctxData.npc;
      }
    } catch (e) {
      log('Error reading global ctx for default model:', e.message);
    }
  }

  return { model, provider, npc };
}

const defaultModelConfig = getDefaultModelConfig();

const DEFAULT_CONFIG = {
  baseDir: path.resolve(NPCSH_BASE),
  stream: true,
  model: defaultModelConfig.model,
  provider: defaultModelConfig.provider,
  npc: defaultModelConfig.npc,
};

// Device config
const DEVICE_CONFIG_PATH = path.join(NPCSH_BASE, 'incognide', 'device.json');

function getOrCreateDeviceId() {
  try {
    const dir = path.dirname(DEVICE_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(DEVICE_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH, 'utf-8'));
      if (config.deviceId) return config;
    }
    const newConfig = {
      deviceId: crypto.randomUUID(),
      deviceName: os.hostname() || 'Web Instance',
      deviceType: 'web',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(DEVICE_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    return newConfig;
  } catch (err) {
    log('Error creating device config:', err.message);
    return { deviceId: 'web-' + crypto.randomUUID(), deviceName: 'Web Instance', deviceType: 'web' };
  }
}

const deviceConfig = getOrCreateDeviceId();

function updateDeviceConfig(updates) {
  try {
    const current = getOrCreateDeviceId();
    const merged = { ...current, ...updates };
    fs.writeFileSync(DEVICE_CONFIG_PATH, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    log('Error updating device config:', err.message);
    return null;
  }
}

function needsFirstRunSetup() {
  const setupFlagPath = path.join(NPCSH_BASE, 'incognide', '.setup_complete');
  return !fs.existsSync(setupFlagPath);
}

function markSetupComplete() {
  const setupFlagPath = path.join(NPCSH_BASE, 'incognide', '.setup_complete');
  try {
    fs.mkdirSync(path.dirname(setupFlagPath), { recursive: true });
    fs.writeFileSync(setupFlagPath, new Date().toISOString());
  } catch {}
}

function getBackendPythonPath() {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  try {
    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const match = rcContent.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (match && match[1] && match[1].trim()) {
        const pythonPath = match[1].trim().replace(/^~/, os.homedir());
        if (fs.existsSync(pythonPath)) return pythonPath;
      }
    }
  } catch {}
  return null;
}

function saveBackendPythonPath(pythonPath) {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  try {
    let content = '';
    if (fs.existsSync(rcPath)) content = fs.readFileSync(rcPath, 'utf8');
    if (content.includes('BACKEND_PYTHON_PATH=')) {
      content = content.replace(/^(?:export\s+)?BACKEND_PYTHON_PATH=.*$/m, `BACKEND_PYTHON_PATH="${pythonPath}"`);
    } else {
      content += `\nBACKEND_PYTHON_PATH="${pythonPath}"\n`;
    }
    fs.writeFileSync(rcPath, content);
  } catch (err) {
    log('Error saving backend python path:', err.message);
  }
}

const userProfilePath = path.join(NPCSH_BASE, 'incognide', 'profile.json');

function getUserProfile() {
  try {
    if (fs.existsSync(userProfilePath)) {
      return JSON.parse(fs.readFileSync(userProfilePath, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveUserProfile(profile) {
  try {
    fs.mkdirSync(path.dirname(userProfilePath), { recursive: true });
    const merged = { ...getUserProfile(), ...profile };
    fs.writeFileSync(userProfilePath, JSON.stringify(merged, null, 2));
    return true;
  } catch {
    return false;
  }
}

function ensureUserDataDirectory() {
  const userDataPath = path.join(NPCSH_BASE, 'incognide', 'data');
  try { fs.mkdirSync(userDataPath, { recursive: true }); } catch {}
  return userDataPath;
}

// Ensure table creation (same as main.js)
const ensureTablesExist = async () => {
  log('[DB] Ensuring all tables exist...');

  const tables = [
    `CREATE TABLE IF NOT EXISTS pdf_highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      highlighted_text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      annotation TEXT DEFAULT '',
      color TEXT DEFAULT 'yellow',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      folder_path TEXT,
      is_global BOOLEAN DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS site_limits (
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
    )`,
    `CREATE TABLE IF NOT EXISTS browser_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      url TEXT NOT NULL,
      folder_path TEXT,
      pane_id TEXT,
      navigation_type TEXT DEFAULT 'click',
      visit_count INTEGER DEFAULT 1,
      last_visited DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS browser_navigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pane_id TEXT NOT NULL,
      from_url TEXT,
      to_url TEXT NOT NULL,
      navigation_type TEXT DEFAULT 'click',
      folder_path TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pdf_drawings (
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
    )`,
    `CREATE TABLE IF NOT EXISTS jinx_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jinx_name TEXT NOT NULL,
      npc_name TEXT,
      input_summary TEXT,
      output_summary TEXT,
      status TEXT DEFAULT 'success',
      duration_ms INTEGER,
      folder_path TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  const indexes = `
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
  `;

  try {
    for (const sql of tables) {
      await dbQuery(sql);
    }
    await dbQuery(indexes);

    const addColumnIfMissing = async (table, column, definition) => {
      const cols = await dbQuery(`PRAGMA table_info(${table})`);
      if (!cols.find((c) => c.name === column)) {
        await dbQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        log(`[DB] Added ${column} column to ${table}`);
      }
    };

    await addColumnIfMissing('browser_history', 'pane_id', 'TEXT');
    await addColumnIfMissing('browser_history', 'navigation_type', "TEXT DEFAULT 'click'");
    await addColumnIfMissing('pdf_highlights', 'color', "TEXT DEFAULT 'yellow'");

    log('[DB] All tables are ready.');
  } catch (error) {
    console.error('[DB] FATAL: Could not create tables.', error);
  }
};

// ---------------------------------------------------------------------------
// Fake ipcMain — intercepts handle() calls, stores them in a registry
// ---------------------------------------------------------------------------

const ipcHandlers = new Map();
const ipcSendListeners = new Map(); // channel -> Set of ws clients

const fakeIpcMain = {
  handle(channel, handler) {
    ipcHandlers.set(channel, handler);
  },
  on(channel, handler) {
    // Some modules use ipcMain.on() for fire-and-forget messages
    ipcHandlers.set(channel, handler);
  },
  removeHandler(channel) {
    ipcHandlers.delete(channel);
  },
};

// ---------------------------------------------------------------------------
// WebSocket management
// ---------------------------------------------------------------------------

const wsClients = new Set();

/** Broadcast an event to all connected WebSocket clients */
function wsBroadcast(channel, data) {
  const message = JSON.stringify({ channel, data });
  for (const ws of wsClients) {
    if (ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(message);
      } catch {}
    }
  }
}

/** Send to a specific ws client */
function wsSend(ws, channel, data) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ channel, data }));
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Fake event.sender — mimics Electron's event.sender for stream handlers
// ---------------------------------------------------------------------------

function createFakeEventSender(requestWs) {
  return {
    send(channel, data) {
      // Try to send to the requesting client first, fall back to broadcast
      if (requestWs && requestWs.readyState === 1) {
        wsSend(requestWs, channel, data);
      } else {
        wsBroadcast(channel, data);
      }
    },
    isDestroyed() {
      return !requestWs || requestWs.readyState !== 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Fake getMainWindow — returns an object with webContents.send that
// broadcasts over WebSocket
// ---------------------------------------------------------------------------

function getMainWindow() {
  return {
    webContents: {
      send(channel, data) {
        wsBroadcast(channel, data);
      },
    },
    getBounds() {
      return { x: 0, y: 0, width: 1920, height: 1080 };
    },
    isDestroyed() {
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Build the context object (mirrors main.js registerAll call)
// ---------------------------------------------------------------------------

// Cron stubs (cron is available in the container)
let cron;
try { cron = require('node-cron'); } catch { cron = null; }
const cronJobs = new Map();
const daemons = new Map();

function scheduleCronJob(name, schedule, task) {
  if (!cron) return null;
  try {
    if (cronJobs.has(name)) {
      cronJobs.get(name).stop();
    }
    const job = cron.schedule(schedule, task);
    cronJobs.set(name, job);
    return job;
  } catch (err) {
    log('Error scheduling cron job:', err.message);
    return null;
  }
}

// backendProcess stubs
let backendProcess = null;

function killBackendProcess() {
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
    backendProcess = null;
  }
}

async function waitForServer(url, timeout = 30000) {
  const fetch = require('node-fetch');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const ctx = {
  ipcMain: fakeIpcMain,
  getMainWindow,
  dbQuery,
  callBackendApi,
  BACKEND_URL,
  BACKEND_PORT,
  log,
  logBackend: log,
  generateId,
  activeStreams,
  DEFAULT_CONFIG,
  app: {
    getPath(name) {
      if (name === 'userData') return path.join(NPCSH_BASE, 'incognide');
      if (name === 'home') return os.homedir();
      if (name === 'temp') return os.tmpdir();
      if (name === 'appData') return NPCSH_BASE;
      return NPCSH_BASE;
    },
    getVersion() { return require('../package.json').version; },
    getName() { return 'incognide'; },
    quit() { process.exit(0); },
    isReady() { return true; },
  },
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
  registerGlobalShortcut: () => {},  // No-op in web mode
  backendProcess,
  killBackendProcess,
  ensureUserDataDirectory,
  waitForServer,
  logsDir,
  electronLogPath: path.join(logsDir, 'electron.log'),
  backendLogPath: path.join(logsDir, 'backend.log'),
  ensureTablesExist,
  appDir: __dirname,
  NPCSH_BASE,
};

// ---------------------------------------------------------------------------
// Register all IPC modules (populates ipcHandlers map)
// ---------------------------------------------------------------------------

const { registerAll } = require('./ipc');
registerAll(ctx);

// Also register handlers that live in main.js outside the module system
// These are simple handlers that we replicate here:

fakeIpcMain.handle('open-new-window', async () => {
  return { info: 'open-new-window is not supported in web mode' };
});

fakeIpcMain.handle('get-window-count', async () => {
  return 1; // Web mode always has 1 "window"
});

fakeIpcMain.handle('get-all-windows-info', async () => {
  return [{ windowId: 1, folderPath: null, title: 'Web Window' }];
});

fakeIpcMain.handle('close-window-by-id', async () => {
  return { info: 'close-window-by-id is not supported in web mode' };
});

fakeIpcMain.handle('close-window', async () => {
  return { info: 'close-window is not supported in web mode' };
});

fakeIpcMain.handle('show-item-in-folder', async (_event, filePath) => {
  return { info: `show-item-in-folder: ${filePath} — not supported in web mode` };
});

fakeIpcMain.handle('backend:health', async () => {
  const fetch = require('node-fetch');
  try {
    const response = await fetch(`${BACKEND_URL}/api/status`);
    if (response.ok) {
      return { status: 'healthy', backend: await response.json() };
    }
    return { status: 'unhealthy', error: `Backend returned ${response.status}` };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
});

fakeIpcMain.handle('backend:restart', async () => {
  return { info: 'Backend restart not supported in web mode — restart the container' };
});

fakeIpcMain.handle('get-app-version', async () => {
  try {
    return require('../package.json').version;
  } catch {
    return 'unknown';
  }
});

fakeIpcMain.handle('check-for-updates', async () => {
  return { updateAvailable: false, info: 'Updates are managed via container deployment' };
});

fakeIpcMain.handle('download-and-install-update', async () => {
  return { info: 'Updates are managed via container deployment' };
});

fakeIpcMain.handle('getDeviceInfo', async () => {
  return deviceConfig;
});

fakeIpcMain.handle('setDeviceName', async (_event, name) => {
  return updateDeviceConfig({ deviceName: name });
});

fakeIpcMain.handle('getDeviceId', async () => {
  return deviceConfig.deviceId;
});

fakeIpcMain.handle('getLogsDir', async () => {
  return logsDir;
});

fakeIpcMain.handle('readLogFile', async (_event, logType) => {
  try {
    const logFile =
      logType === 'backend'
        ? path.join(logsDir, 'backend.log')
        : path.join(logsDir, 'electron.log');
    if (fs.existsSync(logFile)) {
      return fs.readFileSync(logFile, 'utf-8');
    }
    return '';
  } catch {
    return '';
  }
});

fakeIpcMain.handle('update-shortcut', async () => {
  return { info: 'Global shortcuts not supported in web mode' };
});

fakeIpcMain.handle('showPromptDialog', async (_event, options) => {
  return { response: null, info: 'Native dialogs not available in web mode' };
});

// Dialogs: these need web-side handling but we provide stubs
fakeIpcMain.handle('show-open-dialog', async (_event, options) => {
  return { canceled: true, filePaths: [], info: 'Use web file picker instead' };
});

fakeIpcMain.handle('show-save-dialog', async (_event, options) => {
  return { canceled: true, filePath: undefined, info: 'Use web file picker instead' };
});

// open_directory_picker — in web mode, return workspace root
fakeIpcMain.handle('open_directory_picker', async () => {
  return WORKSPACE_ROOT;
});

// Profile
fakeIpcMain.handle('profile:get', async () => {
  return getUserProfile();
});

fakeIpcMain.handle('profile:save', async (_event, profile) => {
  return saveUserProfile(profile);
});

// openExternal — not supported in web mode (frontend handles window.open)
fakeIpcMain.handle('openExternal', async (_event, url) => {
  return { success: true, info: 'Frontend should use window.open() for external URLs' };
});

fakeIpcMain.handle('browser-open-external', async (_event, { url }) => {
  return { success: true, info: 'Frontend should use window.open()' };
});

// open-file — not supported on web (shell.openPath)
fakeIpcMain.handle('open-file', async (_event, filePath) => {
  return { info: 'open-file not supported in web mode' };
});

// open-in-native-explorer — not supported on web
fakeIpcMain.handle('open-in-native-explorer', async (_event, folderPath) => {
  return { info: 'Not supported in web mode' };
});

// ---------------------------------------------------------------------------
// Channels that use ipcRenderer.send (fire-and-forget) — register stubs
// ---------------------------------------------------------------------------

const fireAndForgetChannels = [
  'trigger-new-text-file',
  'trigger-browser-new-tab',
  'show-pdf',
  'update-pdf-bounds',
  'hide-pdf',
  'set-workspace-path',
  'submit-macro',
];

for (const channel of fireAndForgetChannels) {
  if (!ipcHandlers.has(channel)) {
    fakeIpcMain.handle(channel, async (_event, data) => {
      // Broadcast to all websocket clients as an event
      wsBroadcast(channel, data);
      return { ok: true };
    });
  }
}

// ---------------------------------------------------------------------------
// Express application setup
// ---------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);

// CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '200mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '200mb' }));

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: (() => {
      try { return require('../package.json').version; } catch { return 'unknown'; }
    })(),
    handlers: ipcHandlers.size,
    wsClients: wsClients.size,
  });
});

// ---------------------------------------------------------------------------
// Generic IPC bridge:  POST /api/ipc/:channel
//
// Body: { "args": [ ...positional args ] }
//   or: { ...single-object arg }
//
// The handler signature in the IPC modules is:
//   handler(event, arg1, arg2, ...)
// Most handlers receive (event, singleArg), so we detect and adapt.
// ---------------------------------------------------------------------------

app.post('/api/ipc/:channel', async (req, res) => {
  const channel = req.params.channel;
  const handler = ipcHandlers.get(channel);

  if (!handler) {
    return res.status(404).json({ error: `No handler for channel: ${channel}` });
  }

  // Find the requesting WebSocket client for streaming (best effort)
  let requestWs = null;
  const wsId = req.headers['x-ws-id'];
  if (wsId) {
    for (const ws of wsClients) {
      if (ws._webServerId === wsId) {
        requestWs = ws;
        break;
      }
    }
  }

  // Build a fake Electron event object
  const fakeEvent = {
    sender: createFakeEventSender(requestWs),
    reply: (ch, data) => wsBroadcast(ch, data),
  };

  try {
    let result;
    const body = req.body;

    if (body && Array.isArray(body.args)) {
      // Explicit positional args
      result = await handler(fakeEvent, ...body.args);
    } else if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      // Single object arg (most common pattern)
      result = await handler(fakeEvent, body);
    } else {
      // No args
      result = await handler(fakeEvent);
    }

    // Handle Buffer/Uint8Array results (e.g., readFileBuffer)
    if (result && result instanceof Buffer) {
      res.set('Content-Type', 'application/octet-stream');
      return res.send(result);
    }
    if (result && result instanceof Uint8Array) {
      res.set('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(result));
    }

    res.json(result !== undefined ? result : { ok: true });
  } catch (err) {
    log(`[IPC] Error in handler for ${channel}:`, err.message);
    res.status(500).json({ error: err.message, stack: IS_DEV_MODE ? err.stack : undefined });
  }
});

// ---------------------------------------------------------------------------
// Multi-arg IPC bridge:  POST /api/ipc-multi/:channel
//
// Body: { "args": [arg1, arg2, ...] }
// For handlers that take multiple positional arguments
// (e.g., gitStageFile(repoPath, file))
// ---------------------------------------------------------------------------

app.post('/api/ipc-multi/:channel', async (req, res) => {
  const channel = req.params.channel;
  const handler = ipcHandlers.get(channel);

  if (!handler) {
    return res.status(404).json({ error: `No handler for channel: ${channel}` });
  }

  let requestWs = null;
  const wsId = req.headers['x-ws-id'];
  if (wsId) {
    for (const ws of wsClients) {
      if (ws._webServerId === wsId) {
        requestWs = ws;
        break;
      }
    }
  }

  const fakeEvent = {
    sender: createFakeEventSender(requestWs),
    reply: (ch, data) => wsBroadcast(ch, data),
  };

  try {
    const args = req.body.args || [];
    const result = await handler(fakeEvent, ...args);

    if (result instanceof Buffer || result instanceof Uint8Array) {
      res.set('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(result));
    }

    res.json(result !== undefined ? result : { ok: true });
  } catch (err) {
    log(`[IPC-MULTI] Error in handler for ${channel}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// List available IPC channels (for debugging)
// ---------------------------------------------------------------------------

app.get('/api/ipc', (_req, res) => {
  res.json({ channels: Array.from(ipcHandlers.keys()).sort() });
});

// ---------------------------------------------------------------------------
// Static file serving (built Vite frontend)
// ---------------------------------------------------------------------------

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1d', etag: true, lastModified: true }));
}

// SPA fallback — serve index.html for all unmatched routes
app.use((req, res) => {
  // Don't serve index.html for /api routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found. Run vite build first.');
  }
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const clientId = crypto.randomUUID();
  ws._webServerId = clientId;
  wsClients.add(ws);
  log(`[WS] Client connected: ${clientId} (total: ${wsClients.size})`);

  // Send the client its ID so it can include it in HTTP headers
  ws.send(JSON.stringify({ channel: '__ws_id', data: { id: clientId } }));

  ws.on('message', async (rawMessage) => {
    let msg;
    try {
      msg = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    const { channel, args, requestId } = msg;

    // Handle IPC calls over WebSocket (for streaming operations)
    if (channel && ipcHandlers.has(channel)) {
      const handler = ipcHandlers.get(channel);
      const fakeEvent = {
        sender: createFakeEventSender(ws),
        reply: (ch, data) => wsSend(ws, ch, data),
      };

      try {
        let result;
        if (Array.isArray(args)) {
          result = await handler(fakeEvent, ...args);
        } else if (args !== undefined && args !== null) {
          result = await handler(fakeEvent, args);
        } else {
          result = await handler(fakeEvent);
        }

        // Send response back to the requesting client
        wsSend(ws, '__ipc_response', {
          requestId,
          channel,
          result: result !== undefined ? result : { ok: true },
        });
      } catch (err) {
        wsSend(ws, '__ipc_response', {
          requestId,
          channel,
          error: err.message,
        });
      }
    }

    // Handle subscribe/unsubscribe for push events
    if (msg.type === 'subscribe' && msg.channel) {
      if (!ipcSendListeners.has(msg.channel)) {
        ipcSendListeners.set(msg.channel, new Set());
      }
      ipcSendListeners.get(msg.channel).add(ws);
    }
    if (msg.type === 'unsubscribe' && msg.channel) {
      const subs = ipcSendListeners.get(msg.channel);
      if (subs) subs.delete(ws);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    // Clean up subscriptions
    for (const [, subs] of ipcSendListeners) {
      subs.delete(ws);
    }
    log(`[WS] Client disconnected: ${clientId} (total: ${wsClients.size})`);
  });

  ws.on('error', (err) => {
    log(`[WS] Client error (${clientId}):`, err.message);
  });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  // Ensure workspace directory
  try {
    await fsPromises.mkdir(WORKSPACE_ROOT, { recursive: true });
    log(`[FS] Workspace root: ${WORKSPACE_ROOT}`);
  } catch {}

  // Ensure NPCSH directories
  try {
    await fsPromises.mkdir(path.join(NPCSH_BASE, 'npc_team'), { recursive: true });
    await fsPromises.mkdir(path.join(NPCSH_BASE, 'incognide'), { recursive: true });
  } catch {}

  // Create DB tables
  await ensureTablesExist();

  server.listen(PORT, '0.0.0.0', () => {
    log(`=== Incognide Web Server ===`);
    log(`Frontend + API: http://0.0.0.0:${PORT}`);
    log(`WebSocket:      ws://0.0.0.0:${PORT}/ws`);
    log(`Backend:        ${BACKEND_URL}`);
    log(`Database:       ${DATABASE_PATH}`);
    log(`Workspace:      ${WORKSPACE_ROOT}`);
    log(`IPC handlers:   ${ipcHandlers.size}`);
    log(`============================`);
  });
}

start().catch((err) => {
  console.error('Failed to start web server:', err);
  process.exit(1);
});

module.exports = { app, server, wss };
