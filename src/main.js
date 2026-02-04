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


const cronJobs = new Map();  // id => {id, schedule, command, npc, jinx, task}
const daemons = new Map();   // id => {id, name, command, npc, jinx, process}



const sqlite3 = require('sqlite3');
const dbPath = path.join(os.homedir(), 'npcsh_history.db');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Port configuration - use different ports for dev vs prod to allow running both simultaneously
// Dev mode: 7337 (frontend), 5437 (backend)
// Prod mode: 6337 (frontend), 5337 (backend)
const IS_DEV_MODE = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const FRONTEND_PORT = IS_DEV_MODE ? 7337 : 6337;
const BACKEND_PORT = IS_DEV_MODE ? 5437 : 5337;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// Use separate user data paths for dev vs prod to allow running both simultaneously
if (IS_DEV_MODE) {
  app.setPath('userData', path.join(os.homedir(), '.npcsh', 'incognide-dev'));
} else {
  app.setPath('userData', path.join(os.homedir(), '.npcsh', 'incognide'));
}

// Centralized logging setup - all logs go to ~/.npcsh/incognide/logs/
const logsDir = path.join(os.homedir(), '.npcsh', 'incognide', 'logs');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch (err) {
  console.error('Failed to create logs directory:', err);
}

// Create timestamped log files for this session
const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const electronLogPath = path.join(logsDir, 'electron.log');
const backendLogPath = path.join(logsDir, 'backend.log');

// Rotate logs if they get too large (>5MB)
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
// Update your ensureTablesExist function:
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

  const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_file_path ON pdf_highlights(file_path);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_folder ON bookmarks(folder_path);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_global ON bookmarks(is_global);
      CREATE INDEX IF NOT EXISTS idx_history_folder ON browser_history(folder_path);
      CREATE INDEX IF NOT EXISTS idx_history_url ON browser_history(url);
      CREATE INDEX IF NOT EXISTS idx_history_pane ON browser_history(pane_id);
      CREATE INDEX IF NOT EXISTS idx_navigations_pane ON browser_navigations(pane_id);
      CREATE INDEX IF NOT EXISTS idx_navigations_folder ON browser_navigations(folder_path);
  `;

  try {
      await dbQuery(createHighlightsTable);
      await dbQuery(createBookmarksTable);
      await dbQuery(createSiteLimitsTable);
      await dbQuery(createBrowserHistoryTable);
      await dbQuery(createBrowserNavigationsTable);
      await dbQuery(createIndexes);

      // Migration: Add new columns to existing browser_history table if they don't exist
      try {
          await dbQuery('ALTER TABLE browser_history ADD COLUMN pane_id TEXT');
          console.log('[DB] Added pane_id column to browser_history');
      } catch (e) {
          // Column already exists, ignore
      }
      try {
          await dbQuery("ALTER TABLE browser_history ADD COLUMN navigation_type TEXT DEFAULT 'click'");
          console.log('[DB] Added navigation_type column to browser_history');
      } catch (e) {
          // Column already exists, ignore
      }

      console.log('[DB] All tables are ready.');
  } catch (error) {
      console.error('[DB] FATAL: Could not create tables.', error);
  }
};

app.setAppUserModelId('com.incognide.chat');
app.name = 'incognide';
app.setName('incognide');
// Unified logging functions
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
// Use Option+Space on macOS, Command/Control+Space elsewhere
const DEFAULT_SHORTCUT = process.platform === 'darwin' ? 'Alt+Space' : 'CommandOrControl+Space';
const ptySessions = new Map();
const ptyKillTimers = new Map();

// In main.js
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


// Parse .npcshrc file for environment variables
function parseNpcshrc() {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Match export VAR=value or VAR=value
        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          result[match[1]] = value;
        }
      }
    }
  } catch (e) {
    console.log('Error reading .npcshrc:', e.message);
  }
  return result;
}

// Read model/provider from environment or ctx file
function getDefaultModelConfig() {
  const yaml = require('js-yaml');
  let model = 'llama3.2';
  let provider = 'ollama';
  let npc = 'sibiji';

  // Read .npcshrc for env vars (since Electron doesn't source shell configs)
  const npcshrcEnv = parseNpcshrc();

  // Priority 1: Environment variables (from process.env or .npcshrc)
  const chatModel = process.env.NPCSH_CHAT_MODEL || npcshrcEnv.NPCSH_CHAT_MODEL;
  const chatProvider = process.env.NPCSH_CHAT_PROVIDER || npcshrcEnv.NPCSH_CHAT_PROVIDER;
  const defaultNpc = process.env.NPCSH_DEFAULT_NPC || npcshrcEnv.NPCSH_DEFAULT_NPC;

  if (chatModel) {
    model = chatModel;
  }
  if (chatProvider) {
    provider = chatProvider;
  }
  if (defaultNpc) {
    npc = defaultNpc;
  }

  // Priority 2: Read from global npcsh.ctx if env vars not set
  if (!chatModel) {
    try {
      const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
      if (fs.existsSync(globalCtx)) {
        const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
        if (ctxData.model) model = ctxData.model;
        if (ctxData.provider) provider = ctxData.provider;
        if (ctxData.npc) npc = ctxData.npc;
      }
    } catch (e) {
      console.log('Error reading global ctx for default model:', e.message);
    }
  }

  console.log('Default model config:', { model, provider, npc });
  return { model, provider, npc };
}

const defaultModelConfig = getDefaultModelConfig();

const DEFAULT_CONFIG = {
  baseDir: path.resolve(os.homedir(), '.npcsh'),
  stream: true,
  model: defaultModelConfig.model,
  provider: defaultModelConfig.provider,
  npc: defaultModelConfig.npc,
};

function generateId() {
  return crypto.randomUUID();
}

const activeStreams = new Map();


let isCapturingScreenshot = false;

let lastScreenshotTime = 0;
const SCREENSHOT_COOLDOWN = 1000;

let backendProcess = null;
function killBackendProcess() {  if (backendProcess) {    log('Killing backend process');    if (process.platform === 'win32') {      try {        execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' });      } catch (e) {        try { backendProcess.kill('SIGKILL'); } catch (e2) {}      }    } else {      backendProcess.kill('SIGTERM');    }    backendProcess = null;  }}


async function waitForServer(maxAttempts = 120, delay = 1000) {
  log('Waiting for backend server to start...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
  job.task = cron.schedule(job.schedule, () => {
    // Here you can execute the command, maybe via npc/jinx logic or shell exec
    console.log(`Executing cron job ${job.id}: ${job.command}`);
    // Example: spawn a shell command
    const child = spawn(job.command, { shell: true });
    child.stdout.on('data', data => console.log(`Cron job output: ${data}`));
    child.stderr.on('data', data => console.error(`Cron job error: ${data}`));
  }, { scheduled: true });
  return job.task;
}


async function ensureBaseDir() {
  try {
    await fsPromises.mkdir(DEFAULT_CONFIG.baseDir, { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'conversations'), { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'config'), { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'images'), { recursive: true });
    await fsPromises.mkdir(path.join(DEFAULT_CONFIG.baseDir, 'screenshots'), { recursive: true });
  } catch (err) {
    console.error('Error creating base directory:', err);
  }
}



// Track sessions we've set up download handlers for
const sessionsWithDownloadHandler = new WeakSet();

// Track workspace path per window (webContents ID -> path)
const workspacePathByWindow = new Map();

ipcMain.on('set-workspace-path', (event, workspacePath) => {
  if (workspacePath && typeof workspacePath === 'string') {
    const windowId = event.sender.id;
    workspacePathByWindow.set(windowId, workspacePath);
    log(`[DOWNLOAD] Workspace path for window ${windowId}: ${workspacePath}`);
  }
});

// Helper to get workspace path for a webContents (checks parent windows too)
function getWorkspacePathForWebContents(webContents) {
  // Try direct ID first
  if (workspacePathByWindow.has(webContents.id)) {
    return workspacePathByWindow.get(webContents.id);
  }
  // Try to find parent window
  const allWindows = BrowserWindow.getAllWindows();
  for (const win of allWindows) {
    if (win.webContents && workspacePathByWindow.has(win.webContents.id)) {
      // Check if this webContents belongs to this window
      if (win.webContents.id === webContents.hostWebContents?.id ||
          win.webContents === webContents.hostWebContents) {
        return workspacePathByWindow.get(win.webContents.id);
      }
    }
  }
  // Fallback: return most recently set path or downloads folder
  const paths = Array.from(workspacePathByWindow.values());
  return paths.length > 0 ? paths[paths.length - 1] : app.getPath('downloads');
}

// Handle web contents created (for webviews and all web contents)
// This sets up download and context menu handling for all web contents including webviews
app.on('web-contents-created', (event, contents) => {
  // Handle context menu for webviews
  contents.on('context-menu', async (e, params) => {
    // Only handle for webviews (type 'webview')
    if (contents.getType() === 'webview') {
      e.preventDefault();

      // Get selected text
      const selectedText = params.selectionText || '';
      const linkURL = params.linkURL || '';
      const srcURL = params.srcURL || '';
      const pageURL = params.pageURL || '';
      const isEditable = params.isEditable || false;
      const mediaType = params.mediaType || 'none';

      log(`[CONTEXT MENU] Webview context menu: selectedText="${selectedText.substring(0, 50)}...", linkURL="${linkURL}", mediaType="${mediaType}"`);

      // Send context menu event to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Get exact cursor position from screen
        const cursorPos = screen.getCursorScreenPoint();
        const windowBounds = mainWindow.getBounds();

        mainWindow.webContents.send('browser-show-context-menu', {
          x: cursorPos.x - windowBounds.x,
          y: cursorPos.y - windowBounds.y,
          selectedText,
          linkURL,
          srcURL,
          pageURL,
          isEditable,
          mediaType,
          canCopy: selectedText.length > 0,
          canPaste: isEditable,
          canSaveImage: mediaType === 'image' && srcURL,
          canSaveLink: !!linkURL,
        });
      }
    }
  });

  // Handle new window requests from webviews (ctrl+click, middle-click, target="_blank")
  // Send to renderer to open in new tab instead of new window
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url, disposition }) => {
      // Send the URL to renderer to open in a new tab
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-open-in-new-tab', {
          url,
          disposition // 'background-tab', 'foreground-tab', 'new-window', etc.
        });
      }
      // Deny the new window - renderer will handle opening in tab
      return { action: 'deny' };
    });
  }

  // Handle downloads from webviews - send to renderer's download manager
  if (contents.getType() === 'webview') {
    const session = contents.session;
    if (session && !sessionsWithDownloadHandler.has(session)) {
      sessionsWithDownloadHandler.add(session);

      session.on('will-download', (e, item, webContents) => {
        const url = item.getURL();
        const filename = item.getFilename();

        log(`[DOWNLOAD] Intercepted download: ${filename} from ${url}`);

        // Cancel immediately - renderer will handle via download manager
        item.cancel();

        // Send to renderer's download manager
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browser-download-requested', {
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

app.whenReady().then(async () => {

  const dataPath = ensureUserDataDirectory();
  await ensureTablesExist();

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

    // Ensure the data directory and npcsh directories exist before starting backend
    try {
      fs.mkdirSync(dataPath, { recursive: true });
      fs.mkdirSync(path.join(os.homedir(), '.npcsh', 'npc_team'), { recursive: true });
      fs.mkdirSync(path.join(os.homedir(), '.npcsh', 'npc_team', 'jinxs'), { recursive: true });
      log('Created necessary directories for backend');
    } catch (dirErr) {
      log(`Warning: Could not create directories: ${dirErr.message}`);
    }

    // Check if user has configured a custom Python path for the backend
    const customPythonPath = getBackendPythonPath();

    let backendPath;
    let spawnArgs = [];

    if (customPythonPath) {
      // Use user's Python with npcpy module
      log(`Using custom Python for backend: ${customPythonPath}`);
      backendPath = customPythonPath;
      spawnArgs = ['-m', 'npcpy.serve'];
    } else {
      // Use bundled executable
      const executableName = process.platform === 'win32' ? 'incognide_serve.exe' : 'incognide_serve';
      backendPath = app.isPackaged
        ? path.join(process.resourcesPath, 'backend', executableName)
        : path.join(app.getAppPath(), 'dist', 'resources', 'backend', executableName);
    }

    // Check if backend path exists
    if (!customPythonPath && !fs.existsSync(backendPath)) {
      log(`ERROR: Backend executable not found at: ${backendPath}`);
      // Try to fall back to Python if available
      const pythonPaths = ['python3', 'python'];
      for (const pyPath of pythonPaths) {
        try {
          execSync(`${pyPath} -c "import npcpy"`, { stdio: 'ignore' });
          log(`Falling back to system Python: ${pyPath}`);
          backendPath = pyPath;
          spawnArgs = ['-m', 'npcpy.serve'];
          break;
        } catch (e) {
          // Python or npcpy not available
        }
      }
    }

    log(`Using backend path: ${backendPath}${spawnArgs.length ? ' ' + spawnArgs.join(' ') : ''}`);

    backendProcess = spawn(backendPath, spawnArgs, {
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

    backendProcess.stdout.on("data", (data) => {
      logBackend(`stdout: ${data.toString().trim()}`);
    });

    backendProcess.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      logBackend(`stderr: ${msg}`);
      // Check for critical errors
      if (msg.includes('ModuleNotFoundError') || msg.includes('ImportError')) {
        log(`CRITICAL: Backend missing dependencies: ${msg}`);
      }
    });

    backendProcess.on('error', (err) => {
      log(`Backend process error: ${err.message}`);
    });

    backendProcess.on('close', (code) => {
      if (code !== 0) {
        logBackend(`Backend server exited with code: ${code}`);
      }
    });

    const serverReady = await waitForServer();
    if (!serverReady) {
      log('Backend server failed to start in time - check backend.log for details');
      // Try to initialize npcsh directly if backend failed
      try {
        log('Attempting direct npcsh initialization...');
        const initResult = execSync(`python3 -c "from npcsh._state import initialize_base_npcs_if_needed; import os; initialize_base_npcs_if_needed(os.path.expanduser('~/.npcsh/npcsh_history.db'))"`, {
          timeout: 30000,
          env: { ...process.env, HOME: os.homedir() }
        });
        log('Direct npcsh initialization completed');
      } catch (initErr) {
        log(`Direct npcsh initialization failed: ${initErr.message}`);
      }
    }
  } catch (err) {
    log(`Error spawning backend server: ${err.message}`);
    console.error('Error spawning backend server:', err);
  }

 
  await ensureBaseDir();

  // Parse CLI arguments for workspace mode
  const cliArgs = {
    folder: null,
    bookmarks: []
  };

  const folderArg = process.argv.find(arg => arg.startsWith('--folder='));
  const bookmarksArg = process.argv.find(arg => arg.startsWith('--bookmarks='));

  // Check for URL arguments (from xdg-open or when set as default browser)
  const urlArg = process.argv.slice(2).find(arg =>
    arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('file://')
  );

  // Support bare path argument: incognide /path/to/folder
  // Look for arguments that look like paths (start with / or ~ or .)
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
  const userDataPath = path.join(os.homedir(), '.npcsh', 'incognide', 'data');
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
  // Check .npcshrc for BACKEND_PYTHON_PATH setting
  const rcPath = path.join(os.homedir(), '.npcshrc');
  try {
    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const match = rcContent.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (match && match[1] && match[1].trim()) {
        const pythonPath = match[1].trim().replace(/^~/, os.homedir());
        // Verify the path exists
        if (fs.existsSync(pythonPath)) {
          log(`Found backend Python path: ${pythonPath}`);
          return pythonPath;
        } else {
          log(`Backend Python path configured but not found: ${pythonPath}`);
        }
      }
    }
  } catch (err) {
    log('Error reading backend Python path from .npcshrc:', err);
  }
  return null;
}

// Check if first-run setup is needed
function needsFirstRunSetup() {
  // Check if BACKEND_PYTHON_PATH is configured
  const customPythonPath = getBackendPythonPath();
  if (customPythonPath) {
    return false; // Already configured
  }

  // Check if bundled backend exists
  const executableName = process.platform === 'win32' ? 'incognide_serve.exe' : 'incognide_serve';
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', executableName)
    : path.join(app.getAppPath(), 'dist', 'resources', 'backend', executableName);

  if (fs.existsSync(bundledPath)) {
    return false; // Bundled backend exists
  }

  // Check for setup complete marker
  const setupMarkerPath = path.join(os.homedir(), '.npcsh', 'incognide', '.setup_complete');
  if (fs.existsSync(setupMarkerPath)) {
    return false; // Setup was completed before
  }

  log('First-run setup needed: no BACKEND_PYTHON_PATH and no bundled backend');
  return true;
}

// Save BACKEND_PYTHON_PATH to .npcshrc
function saveBackendPythonPath(pythonPath) {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  let rcContent = '';

  try {
    if (fs.existsSync(rcPath)) {
      rcContent = fs.readFileSync(rcPath, 'utf8');
    }
  } catch (err) {
    log('Error reading .npcshrc:', err);
  }

  // Remove existing BACKEND_PYTHON_PATH if present
  rcContent = rcContent.replace(/^BACKEND_PYTHON_PATH=.*$/gm, '').trim();

  // Add new BACKEND_PYTHON_PATH
  rcContent = `${rcContent}\nBACKEND_PYTHON_PATH="${pythonPath}"\n`.trim() + '\n';

  try {
    fs.writeFileSync(rcPath, rcContent);
    log(`Saved BACKEND_PYTHON_PATH to .npcshrc: ${pythonPath}`);
    return true;
  } catch (err) {
    log('Error saving to .npcshrc:', err);
    return false;
  }
}

// Mark setup as complete
function markSetupComplete() {
  const setupMarkerPath = path.join(os.homedir(), '.npcsh', 'incognide', '.setup_complete');
  try {
    fs.mkdirSync(path.dirname(setupMarkerPath), { recursive: true });
    fs.writeFileSync(setupMarkerPath, new Date().toISOString());
    return true;
  } catch (err) {
    log('Error marking setup complete:', err);
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
    const rcPath = path.join(os.homedir(), '.npcshrc');
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

      // First capture the full screen
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

        // Create transparent selection overlay window
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
            // Crop the already-captured full screen image
            const cropBounds = {
              x: Math.round(bounds.x * scaleFactor),
              y: Math.round(bounds.y * scaleFactor),
              width: Math.round(bounds.width * scaleFactor),
              height: Math.round(bounds.height * scaleFactor)
            };

            const croppedImage = fullScreenImage.crop(cropBounds);
            const screenshotsDir = path.join(DEFAULT_CONFIG.baseDir, 'screenshots');

            // Ensure screenshots directory exists
            if (!fs.existsSync(screenshotsDir)) {
              fs.mkdirSync(screenshotsDir, { recursive: true });
            }

            const screenshotPath = path.join(screenshotsDir, `screenshot-${Date.now()}.png`);
            fs.writeFileSync(screenshotPath, croppedImage.toPNG());

            console.log('Screenshot saved to:', screenshotPath);
            win.webContents.send('screenshot-captured', screenshotPath);

            // Bring window to foreground after screenshot capture
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

        // Load selection HTML - minimal transparent overlay, no background image flash
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

    // Ctrl+T handled via window input event instead of global shortcut
    // to avoid interfering with other applications

  } catch (error) {
    console.error('Failed to register global shortcut:', error);
  }
}



const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log(`Another instance is already running (mode: ${IS_DEV_MODE ? 'dev' : 'production'})`);
  app.quit();
} else {


  const expandHomeDir = (filepath) => {
    if (filepath.startsWith('~')) {
      return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
  };

 
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length) {
      const mainWindow = windows[0];

      // Parse CLI args from second instance
      const folderArg = commandLine.find(arg => arg.startsWith('--folder='));
      const barePathArg = commandLine.slice(1).find(arg =>
        !arg.startsWith('-') && (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.'))
      );
      const actionArg = commandLine.find(arg => arg.startsWith('--action='));

      // Check for URL arguments (from xdg-open or similar)
      const urlArg = commandLine.slice(1).find(arg =>
        arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('file://')
      );

      if (urlArg) {
        log(`[SECOND-INSTANCE] Opening URL in browser pane: ${urlArg}`);
        mainWindow.webContents.send('open-url-in-browser', { url: urlArg });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        return;
      }

      // Send workspace change
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

      // Send action (JSON encoded)
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

  
 

const browserViews = new Map();

function createWindow(cliArgs = {}) {
    const { folder, bookmarks, openUrl } = cliArgs;

    // Try multiple icon paths for dev vs production
    const possibleIconPaths = [
        path.resolve(__dirname, '..', 'assets', 'icon.png'),  // dev mode
        path.join(process.resourcesPath || '', 'assets', 'icon.png'),  // production (extraResources)
        path.join(app.getAppPath(), 'assets', 'icon.png'),  // alternative production
    ];
    const iconPath = possibleIconPaths.find(p => fs.existsSync(p)) || possibleIconPaths[0];
    console.log(`[ICON DEBUG] Using icon path: ${iconPath}, exists: ${fs.existsSync(iconPath)}`);

    // Create nativeImage for better Linux support
    let appIcon = null;
    if (fs.existsSync(iconPath)) {
        appIcon = nativeImage.createFromPath(iconPath);
        console.log(`[ICON DEBUG] Created nativeImage, isEmpty: ${appIcon.isEmpty()}`);
    }
  
    console.log('Creating window');

    // Set app name for Linux dock
    app.setName('Incognide');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
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
      contentSecurityPolicy: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${BACKEND_URL};`,
        
        experimentalFeatures: true,
        preload: path.join(__dirname, 'preload.js')
      }
          });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
    
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

    // Set up application menu
    const isMac = process.platform === 'darwin';
    const menuTemplate = [
      // App menu (macOS only)
      ...(isMac ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => mainWindow.webContents.send('menu-open-settings')
          },
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
      // File menu
      {
        label: 'File',
        submenu: [
          {
            label: 'New Chat',
            accelerator: 'CmdOrCtrl+Shift+C',
            click: () => mainWindow.webContents.send('menu-new-chat')
          },
          {
            label: 'New Terminal',
            accelerator: 'CmdOrCtrl+Shift+T',
            click: () => mainWindow.webContents.send('menu-new-terminal')
          },
          {
            label: 'New Browser Tab',
            accelerator: 'CmdOrCtrl+T',
            click: () => mainWindow.webContents.send('browser-new-tab')
          },
          { type: 'separator' },
          {
            label: 'Open File...',
            accelerator: 'CmdOrCtrl+O',
            click: () => mainWindow.webContents.send('menu-open-file')
          },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => mainWindow.webContents.send('open-folder-picker')
          },
          { type: 'separator' },
          {
            label: 'Save',
            accelerator: 'CmdOrCtrl+S',
            click: () => mainWindow.webContents.send('menu-save-file')
          },
          {
            label: 'Save As...',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => mainWindow.webContents.send('menu-save-file-as')
          },
          { type: 'separator' },
          {
            label: 'Close Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => mainWindow.webContents.send('menu-close-tab')
          },
          { type: 'separator' },
          ...(isMac ? [] : [
            {
              label: 'Settings',
              accelerator: 'CmdOrCtrl+,',
              click: () => mainWindow.webContents.send('menu-open-settings')
            },
            { type: 'separator' },
            { role: 'quit' }
          ])
        ]
      },
      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Find',
            accelerator: 'CmdOrCtrl+F',
            click: () => mainWindow.webContents.send('menu-find')
          },
          {
            label: 'Find in Files',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => mainWindow.webContents.send('menu-global-search')
          }
        ]
      },
      // View menu
      {
        label: 'View',
        submenu: [
          {
            label: 'Command Palette',
            accelerator: 'CmdOrCtrl+P',
            click: () => mainWindow.webContents.send('menu-command-palette')
          },
          { type: 'separator' },
          {
            label: 'Toggle Sidebar',
            accelerator: 'CmdOrCtrl+B',
            click: () => mainWindow.webContents.send('menu-toggle-sidebar')
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      // Window menu
      {
        label: 'Window',
        submenu: [
          {
            label: 'New Window',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => mainWindow.webContents.send('menu-new-window')
          },
          { type: 'separator' },
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] : [
            { role: 'close' }
          ]),
          { type: 'separator' },
          {
            label: 'Split Pane Right',
            click: () => mainWindow.webContents.send('menu-split-right')
          },
          {
            label: 'Split Pane Down',
            click: () => mainWindow.webContents.send('menu-split-down')
          }
        ]
      },
      // Help menu
      {
        label: 'Help',
        submenu: [
          {
            label: 'Help & Documentation',
            click: () => mainWindow.webContents.send('menu-open-help')
          },
          {
            label: 'Keyboard Shortcuts',
            accelerator: 'CmdOrCtrl+/',
            click: () => mainWindow.webContents.send('menu-show-shortcuts')
          },
          { type: 'separator' },
          {
            label: 'Report Issue',
            click: () => shell.openExternal('https://github.com/NPC-Worldwide/incognide/issues')
          },
          {
            label: 'Visit Website',
            click: () => shell.openExternal('https://incognide.com')
          },
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

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://js.stripe.com; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com; " +
        "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com; " +
        "img-src 'self' data: file: media: blob: http: https:; " +
        "font-src 'self' data: https://cdn.jsdelivr.net; " +
        `connect-src 'self' file: media: http://localhost:${FRONTEND_PORT} http://127.0.0.1:${BACKEND_PORT} ${BACKEND_URL} blob: ws: wss: https://* http://*; ` +
        "frame-src 'self' file: data: blob: media: chrome-extension: https://js.stripe.com https://m.stripe.network https://checkout.stripe.com; " +
        "object-src 'self' file: data: blob: media: chrome-extension:; " +
        "worker-src 'self' blob: data:; " +
        "media-src 'self' data: file: blob: http: https:;"

          ]
        },
      });
    });
    
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    
    if (isDev) {
      mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
    } else {
      const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
      mainWindow.loadFile(htmlPath);
    }
  
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
    });

    // Handle keyboard shortcuts at window level (not global) to avoid interfering with other apps
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        // Ctrl+T - new browser tab (only when window is focused)
        if (input.control && !input.shift && !input.alt && input.key.toLowerCase() === 't') {
          event.preventDefault();
          mainWindow.webContents.send('browser-new-tab');
        }
        // Ctrl+Shift+O - open folder picker
        if (input.control && input.shift && !input.alt && input.key.toLowerCase() === 'o') {
          event.preventDefault();
          mainWindow.webContents.send('open-folder-picker');
        }
      }
    });

    // Send CLI arguments to renderer when ready
    mainWindow.webContents.on('did-finish-load', async () => {
      if (folder || (bookmarks && bookmarks.length > 0) || openUrl) {
        log(`[CLI] Sending workspace args to renderer: folder=${folder}, bookmarks=${bookmarks?.length || 0}, openUrl=${openUrl}`);

        // If folder is specified, set it as the current working directory for the workspace
        if (folder) {
          mainWindow.webContents.send('cli-open-workspace', { folder });
        }

        // Add bookmarks to the workspace
        if (bookmarks && bookmarks.length > 0 && folder) {
          for (const url of bookmarks) {
            try {
              // Use the existing bookmark handler
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

        // If URL is specified (from xdg-open or similar), open it in a browser pane
        if (openUrl) {
          log(`[CLI] Opening URL in browser pane: ${openUrl}`);
          mainWindow.webContents.send('open-url-in-browser', { url: openUrl });
        }
      }
    });
}
  


  ipcMain.on('submit-macro', (event, command) => {
    mainWindow.hide();
  });

// Add these handlers near your other ipcMain.handle calls

ipcMain.handle('getAvailableJinxs', async (event, { currentPath, npc }) => {
  try {
      const params = new URLSearchParams();
      if (currentPath) params.append('currentPath', currentPath);
      if (npc) params.append('npc', npc);
      
      const url = `${BACKEND_URL}/api/jinxs/available?${params.toString()}`;
      log('Fetching available jinxs from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      log('Received jinxs:', data.jinxs?.length);
      return data;
  } catch (err) {
      log('Error in getAvailableJinxs handler:', err);
      return { jinxs: [], error: err.message };
  }
});

ipcMain.handle('executeJinx', async (event, data) => {
  const currentStreamId = data.streamId || generateId();
  log(`[Main Process] executeJinx: Starting stream with ID: ${currentStreamId}`);
  
  try {
      const apiUrl = `${BACKEND_URL}/api/jinx/execute`;
      
      const payload = {
          streamId: currentStreamId,
          jinxName: data.jinxName,
          jinxArgs: data.jinxArgs || [],
          currentPath: data.currentPath,
          conversationId: data.conversationId,
          model: data.model,
          provider: data.provider,
          npc: data.npc,
          npcSource: data.npcSource || 'global',
      };
      
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      log(`[Main Process] Backend response status for jinx ${data.jinxName}: ${response.status}`);
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
      }

      const stream = response.body;
      if (!stream) {
          event.sender.send('stream-error', { 
              streamId: currentStreamId, 
              error: 'Backend returned no stream data for jinx execution.' 
          });
          return { error: 'Backend returned no stream data.', streamId: currentStreamId };
      }
      
      activeStreams.set(currentStreamId, { stream, eventSender: event.sender });
      
      (function(capturedStreamId) {
          stream.on('data', (chunk) => {
              if (event.sender.isDestroyed()) {
                  stream.destroy();
                  activeStreams.delete(capturedStreamId);
                  return;
              }
              event.sender.send('stream-data', {
                  streamId: capturedStreamId,
                  chunk: chunk.toString()
              });
          });

          stream.on('end', () => {
              log(`[Main Process] Jinx stream ${capturedStreamId} ended.`);
              if (!event.sender.isDestroyed()) {
                  event.sender.send('stream-complete', { streamId: capturedStreamId });
              }
              activeStreams.delete(capturedStreamId);
          });

          stream.on('error', (err) => {
              log(`[Main Process] Jinx stream ${capturedStreamId} error:`, err.message);
              if (!event.sender.isDestroyed()) {
                  event.sender.send('stream-error', {
                      streamId: capturedStreamId,
                      error: err.message
                  });
              }
              activeStreams.delete(capturedStreamId);
          });
      })(currentStreamId);

      return { streamId: currentStreamId };

  } catch (err) {
      log(`[Main Process] Error setting up jinx stream ${currentStreamId}:`, err.message);
      if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('stream-error', {
              streamId: currentStreamId,
              error: `Failed to execute jinx: ${err.message}`
          });
      }
      return { error: `Failed to execute jinx: ${err.message}`, streamId: currentStreamId };
  }
});

    ipcMain.handle('getAvailableModels', async (event, currentPath) => {

      if (!currentPath) {
          log('Error: getAvailableModels called without currentPath');
          return { models: [], error: 'Current path is required to fetch models.' };
      }

      let backendModels = [];
      let backendError = null;

      // Try to fetch from backend first
      try {
          const url = `${BACKEND_URL}/api/models?currentPath=${encodeURIComponent(currentPath)}`;
          log('Fetching models from:', url);

          const response = await fetch(url);

          if (!response.ok) {
              const errorText = await response.text();
              log(`Error fetching models: ${response.status} ${response.statusText} - ${errorText}`);
              backendError = `HTTP error ${response.status}: ${errorText}`;
          } else {
              const data = await response.json();
              log('Received models from backend:', data.models?.length);
              backendModels = data.models || [];
          }
      } catch (err) {
          log('Backend not available:', err.message);
          backendError = err.message;
      }

      // Always scan for local GGUF models (even if backend failed)
      const ggufModels = [];
      try {
          const homeDir = require('os').homedir();
          const fsPromises = require('fs').promises;

          const ggufDirs = [
              path.join(homeDir, '.cache', 'huggingface', 'hub'),
              path.join(homeDir, '.cache', 'lm-studio', 'models'),
              path.join(homeDir, '.lmstudio', 'models'),
              path.join(homeDir, 'llama.cpp', 'models'),
              path.join(homeDir, '.npcsh', 'models', 'gguf'),
              path.join(homeDir, '.npcsh', 'models'),
              path.join(homeDir, 'models'),
          ];

          const seenPaths = new Set();

          const scanDir = async (dir, depth = 0) => {
              if (depth > 5) return;
              try {
                  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                  for (const entry of entries) {
                      const fullPath = path.join(dir, entry.name);
                      // Use stat to follow symlinks
                      try {
                          const stats = await fsPromises.stat(fullPath);
                          if (stats.isDirectory() && !entry.name.startsWith('.git') && entry.name !== 'node_modules') {
                              await scanDir(fullPath, depth + 1);
                          } else if (stats.isFile()) {
                              const ext = path.extname(entry.name).toLowerCase();
                              if (ext === '.gguf' && !seenPaths.has(fullPath)) {
                                  seenPaths.add(fullPath);
                                  if (stats.size > 50 * 1024 * 1024) { // Files > 50MB
                                      ggufModels.push({
                                          value: fullPath,
                                          display_name: `[GGUF] ${entry.name}`,
                                          provider: 'gguf',
                                          size: stats.size,
                                          path: fullPath
                                      });
                                  }
                              }
                          }
                      } catch (statErr) { /* skip broken symlinks */ }
                  }
              } catch (e) { /* directory doesn't exist */ }
          };

          for (const dir of ggufDirs) {
              await scanDir(dir);
          }

          log('Found GGUF models:', ggufModels.length);
      } catch (ggufErr) {
          log('Error scanning GGUF models:', ggufErr);
      }

      const allModels = [...backendModels, ...ggufModels];

      if (allModels.length === 0 && backendError) {
          return { models: [], error: backendError };
      }

      return { models: allModels };
  });



  
  ipcMain.handle('open_directory_picker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  });
  ipcMain.on('screenshot-captured', (event, data) => {
    window.postMessage({
        type: 'screenshot-captured',
        path: data.path,
        timestamp: data.timestamp
    }, '*');
});


ipcMain.handle('getCronDaemons', () => {
  return {
    cronJobs: Array.from(cronJobs.values()).map(({task, ...rest}) => rest),
    daemons: Array.from(daemons.values()).map(({process, ...rest}) => rest)
  };
});

ipcMain.handle('addCronJob', (event, { path, schedule, command, npc, jinx }) => {
  const id = generateId();
  const job = { id, path, schedule, command, npc, jinx, task: null };
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
ipcMain.handle('deleteMessage', async (_, { conversationId, messageId }) => {
  try {
    const db = new sqlite3.Database(dbPath);
    
    // Delete by message_id column (which is what the backend actually uses)
    const deleteMessageQuery = `
      DELETE FROM conversation_history 
      WHERE conversation_id = ? 
      AND message_id = ?
    `;
    
    let rowsAffected = 0;
    await new Promise((resolve, reject) => {
      db.run(deleteMessageQuery, [conversationId, messageId], function(err) {
        if (err) {
          reject(err);
        } else {
          rowsAffected = this.changes;
          log(`[DB] Deleted message ${messageId} from conversation ${conversationId}. Rows affected: ${this.changes}`);
          resolve();
        }
      });
    });
    
    // Also delete associated attachments
    if (rowsAffected > 0) {
      const deleteAttachmentsQuery = 'DELETE FROM message_attachments WHERE message_id = ?';
      await new Promise((resolve) => {
        db.run(deleteAttachmentsQuery, [messageId], function(err) {
          if (err) {
            log(`[DB] Warning: Failed to delete attachments for message ${messageId}:`, err.message);
          }
          resolve();
        });
      });
    }
    
    db.close();
    
    return { success: rowsAffected > 0, rowsAffected };
  } catch (err) {
    console.error('Error deleting message:', err);
    return { success: false, error: err.message, rowsAffected: 0 };
  }
});
ipcMain.handle('addDaemon', (event, { path, name, command, npc, jinx }) => {
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

    daemons.set(id, { id, path, name, command, npc, jinx, process: proc });
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


  ipcMain.handle('update-shortcut', (event, newShortcut) => {
    const rcPath = path.join(os.homedir(), '.npcshrc');
    try {
      let rcContent = '';
      if (fsPromises.existsSync(rcPath)) {
        rcContent = fsPromises.readFileSync(rcPath, 'utf8');
       
        if (rcContent.includes('CHAT_SHORTCUT=')) {
          rcContent = rcContent.replace(/CHAT_SHORTCUT=["']?[^"'\n]+["']?/, `CHAT_SHORTCUT="${newShortcut}"`);
        } else {
         
          rcContent += `\nCHAT_SHORTCUT="${newShortcut}"\n`;
        }
      } else {
        rcContent = `CHAT_SHORTCUT="${newShortcut}"\n`;
      }
      fsPromises.writeFileSync(rcPath, rcContent);
      registerGlobalShortcut(BrowserWindow.getFocusedWindow());
      return true;
    } catch (error) {
      console.error('Failed to update shortcut:', error);
      return false;
    }
  });

ipcMain.handle('open-file', async (_event, filePath) => {
  const { shell } = require('electron');
  try {
    await shell.openPath(filePath);
    return true;
  } catch (err) {
    return { error: err.message };
  }
});

  
  ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    
    if (!result.canceled && result.filePaths.length > 0) {
     
      return result.filePaths.map(filePath => {
        const stats = fs.statSync(filePath);
        return {
          name: path.basename(filePath),
          path: filePath,
          size: stats.size,
          type: getFileType(filePath)
        };
      });
    }
    
    return [];
  });
  
 
  function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }


// Add these alongside your existing ipcMain.handle calls
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
        mainWindow?.webContents.send('ollama-pull-error', err.message);
        return { success: false, error: err.message };
    }
});
ipcMain.handle('generative-fill', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/generative_fill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generative fill failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Generative fill error:', error);
        return { error: error.message };
    }
});
ipcMain.handle('browser-get-page-content', async (event, { viewId }) => {
    if (browserViews.has(viewId)) {
        const browserState = browserViews.get(viewId);
        try {
            // Extract text content from the page
            const pageContent = await browserState.view.webContents.executeJavaScript(`
                (function() {
                    // Get main content, skip nav/footer/ads
                    const main = document.querySelector('main, article, .content, #content') || document.body;
                    
                    // Remove script, style, nav, footer elements
                    const clone = main.cloneNode(true);
                    clone.querySelectorAll('script, style, nav, footer, aside, .nav, .footer, .ads').forEach(el => el.remove());
                    
                    // Get text content
                    let text = clone.innerText || clone.textContent;
                    
                    // Clean up whitespace
                    text = text.replace(/\\s+/g, ' ').trim();
                    
                    // Limit to ~4000 chars to avoid token limits
                    return text.substring(0, 4000);
                })();
            `);
            
            return { 
                success: true, 
                content: pageContent,
                url: browserState.view.webContents.getURL(),
                title: browserState.view.webContents.getTitle()
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, error: 'Browser view not found' };
});
ipcMain.handle('gitStatus', async (event, repoPath) => {
  log(`[Git] Getting status for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const status = await git.status();

    const allChangedFiles = status.files.map(f => {
      let fileStatus = '';
      let isStaged = false;
      let isUntracked = false;

      // Determine the primary status for display
      if (f.index === 'M') {
        fileStatus = 'Staged Modified'; // Modified in index
        isStaged = true;
      } else if (f.index === 'A') {
        fileStatus = 'Staged Added'; // Added to index
        isStaged = true;
      } else if (f.index === 'D') {
        fileStatus = 'Staged Deleted'; // Deleted from index
        isStaged = true;
      } else if (f.working_dir === 'M') {
        fileStatus = 'Modified'; // Modified in working directory, not staged
      } else if (f.working_dir === 'D') {
        fileStatus = 'Deleted'; // Deleted in working directory, not staged
      } else if (f.index === '??') {
        fileStatus = 'Untracked'; // Untracked file
        isUntracked = true;
      } else {
        fileStatus = 'Unknown Change'; // Fallback for any other types
      }

      return {
        path: f.path,
        status: fileStatus,
        isStaged: isStaged,
        isUntracked: isUntracked,
      };
    });

    return {
      success: true,
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
      // Filter based on the new structured 'allChangedFiles'
      staged: allChangedFiles.filter(f => f.isStaged),
      unstaged: allChangedFiles.filter(f => !f.isStaged && !f.isUntracked),
      untracked: allChangedFiles.filter(f => f.isUntracked),
      hasChanges: allChangedFiles.length > 0
    };
  } catch (err) {
    console.error(`[Git] Error getting status for ${repoPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitStageFile', async (event, repoPath, file) => {
  log(`[Git] Staging file: ${file} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    await git.add(file);
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error staging file ${file} in ${repoPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitUnstageFile', async (event, repoPath, file) => {
  log(`[Git] Unstaging file: ${file} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    await git.reset([file]); // 'git reset <file>' unstages it
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error unstaging file ${file} in ${repoPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitCommit', async (event, repoPath, message) => {
  log(`[Git] Committing with message: "${message}" in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const commitResult = await git.commit(message);
    return { success: true, commit: commitResult.commit };
  } catch (err) {
    console.error(`[Git] Error committing in ${repoPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitPull', async (event, repoPath) => {
  log(`[Git] Pulling changes for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const pullResult = await git.pull();
    return { success: true, summary: pullResult };
  } catch (err) {
    console.error(`[Git] Error pulling in ${repoPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitPush', async (event, repoPath) => {
  log(`[Git] Pushing changes for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const pushResult = await git.push();
    return { success: true, summary: pushResult };
  } catch (err) {
    console.error(`[Git] Error pushing in ${repoPath}:`, err);
    // Check if it's the "no upstream branch" error
    const isNoUpstream = err.message && err.message.includes('has no upstream branch');
    if (isNoUpstream) {
      // Get current branch name
      const git = simpleGit(repoPath);
      const branchResult = await git.branch();
      const currentBranch = branchResult.current;
      return {
        success: false,
        error: err.message,
        noUpstream: true,
        currentBranch,
        suggestedCommand: `git push --set-upstream origin ${currentBranch}`
      };
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitPushSetUpstream', async (event, repoPath, branch) => {
  log(`[Git] Pushing with upstream for: ${repoPath}, branch: ${branch}`);
  try {
    const git = simpleGit(repoPath);
    const pushResult = await git.push(['--set-upstream', 'origin', branch]);
    return { success: true, summary: pushResult };
  } catch (err) {
    console.error(`[Git] Error pushing with upstream:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitSetAutoSetupRemote', async (event) => {
  log(`[Git] Setting push.autoSetupRemote to true`);
  try {
    execSync('git config --global push.autoSetupRemote true');
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error setting autoSetupRemote:`, err);
    return { success: false, error: err.message };
  }
});

// Git diff for a file
ipcMain.handle('gitDiff', async (event, repoPath, filePath, staged = false) => {
  log(`[Git] Getting diff for: ${filePath} in ${repoPath} (staged: ${staged})`);
  try {
    const git = simpleGit(repoPath);
    let diff;
    if (staged) {
      diff = await git.diff(['--cached', '--', filePath]);
    } else if (filePath) {
      diff = await git.diff(['--', filePath]);
    } else {
      diff = await git.diff();
    }
    return { success: true, diff };
  } catch (err) {
    console.error(`[Git] Error getting diff:`, err);
    return { success: false, error: err.message };
  }
});

// Git diff for all changes
ipcMain.handle('gitDiffAll', async (event, repoPath) => {
  log(`[Git] Getting all diffs for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const stagedDiff = await git.diff(['--cached']);
    const unstagedDiff = await git.diff();
    return { success: true, staged: stagedDiff, unstaged: unstagedDiff };
  } catch (err) {
    console.error(`[Git] Error getting diffs:`, err);
    return { success: false, error: err.message };
  }
});

// Git blame for a file
ipcMain.handle('gitBlame', async (event, repoPath, filePath) => {
  log(`[Git] Getting blame for: ${filePath} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    // Use raw to get blame output
    const blameOutput = await git.raw(['blame', '--line-porcelain', filePath]);

    // Parse the porcelain output
    const lines = blameOutput.split('\n');
    const blameData = [];
    let currentEntry = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/^[0-9a-f]{40}/)) {
        if (currentEntry.hash) {
          blameData.push(currentEntry);
        }
        const parts = line.split(' ');
        currentEntry = {
          hash: parts[0],
          originalLine: parseInt(parts[1]),
          finalLine: parseInt(parts[2]),
        };
      } else if (line.startsWith('author ')) {
        currentEntry.author = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        currentEntry.timestamp = parseInt(line.substring(12)) * 1000;
      } else if (line.startsWith('summary ')) {
        currentEntry.summary = line.substring(8);
      } else if (line.startsWith('\t')) {
        currentEntry.content = line.substring(1);
      }
    }
    if (currentEntry.hash) {
      blameData.push(currentEntry);
    }

    return { success: true, blame: blameData };
  } catch (err) {
    console.error(`[Git] Error getting blame:`, err);
    return { success: false, error: err.message };
  }
});

// Git branches
ipcMain.handle('gitBranches', async (event, repoPath) => {
  log(`[Git] Getting branches for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const branchSummary = await git.branch(['-a']);
    return {
      success: true,
      current: branchSummary.current,
      branches: branchSummary.all,
      local: branchSummary.branches
    };
  } catch (err) {
    console.error(`[Git] Error getting branches:`, err);
    return { success: false, error: err.message };
  }
});

// Git create branch
ipcMain.handle('gitCreateBranch', async (event, repoPath, branchName) => {
  log(`[Git] Creating branch: ${branchName} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    await git.checkoutLocalBranch(branchName);
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error creating branch:`, err);
    return { success: false, error: err.message };
  }
});

// Git switch branch
ipcMain.handle('gitCheckout', async (event, repoPath, branchName) => {
  log(`[Git] Switching to branch: ${branchName} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    await git.checkout(branchName);
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error switching branch:`, err);
    return { success: false, error: err.message };
  }
});

// Git delete branch
ipcMain.handle('gitDeleteBranch', async (event, repoPath, branchName, force = false) => {
  log(`[Git] Deleting branch: ${branchName} in ${repoPath} (force: ${force})`);
  try {
    const git = simpleGit(repoPath);
    await git.deleteLocalBranch(branchName, force);
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error deleting branch:`, err);
    return { success: false, error: err.message };
  }
});

// Git commit history
ipcMain.handle('gitLog', async (event, repoPath, options = {}) => {
  log(`[Git] Getting commit history for: ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const logOptions = {
      maxCount: options.maxCount || 50,
      ...options
    };
    const logResult = await git.log(logOptions);
    return { success: true, commits: logResult.all, total: logResult.total };
  } catch (err) {
    console.error(`[Git] Error getting log:`, err);
    return { success: false, error: err.message };
  }
});

// Git show commit details
ipcMain.handle('gitShowCommit', async (event, repoPath, commitHash) => {
  log(`[Git] Showing commit: ${commitHash} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    // Use raw to avoid pager issues
    const show = await git.raw(['show', commitHash, '--stat', '--format=fuller', '--no-color']);
    const diff = await git.raw(['show', commitHash, '--format=', '--no-color']);
    return { success: true, details: show, diff };
  } catch (err) {
    console.error(`[Git] Error showing commit:`, err);
    return { success: false, error: err.message };
  }
});

// Git stash
ipcMain.handle('gitStash', async (event, repoPath, action = 'push', message = '') => {
  log(`[Git] Stash ${action} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    let result;
    switch (action) {
      case 'push':
        result = message ? await git.stash(['push', '-m', message]) : await git.stash(['push']);
        break;
      case 'pop':
        result = await git.stash(['pop']);
        break;
      case 'list':
        result = await git.stash(['list']);
        break;
      case 'drop':
        result = await git.stash(['drop']);
        break;
      default:
        result = await git.stash([action]);
    }
    return { success: true, result };
  } catch (err) {
    console.error(`[Git] Error with stash:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitShowFile', async (event, repoPath, filePath, ref = 'HEAD') => {
  log(`[Git] Show file ${filePath} at ${ref} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    const content = await git.show([`${ref}:${filePath}`]);
    return { success: true, content };
  } catch (err) {
    // File might not exist at that ref (new file)
    if (err.message.includes('does not exist') || err.message.includes('fatal:')) {
      return { success: true, content: '' };
    }
    console.error(`[Git] Error showing file:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gitDiscardFile', async (event, repoPath, filePath) => {
  log(`[Git] Discard changes to ${filePath} in ${repoPath}`);
  try {
    const git = simpleGit(repoPath);
    await git.checkout(['--', filePath]);
    return { success: true };
  } catch (err) {
    console.error(`[Git] Error discarding file:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('browser-add-to-history', async (event, { url, title, folderPath }) => {
    try {
        if (!url || url === 'about:blank') return { success: true };
        const existing = await dbQuery('SELECT id FROM browser_history WHERE url = ? AND folder_path = ?', [url, folderPath]);
        if (existing.length > 0) {
            await dbQuery('UPDATE browser_history SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP, title = ? WHERE id = ?', [title, existing[0].id]);
        } else {
            await dbQuery('INSERT INTO browser_history (url, title, folder_path) VALUES (?, ?, ?)', [url, title, folderPath]);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});


// --- FIX 2: Replace your entire 'show-browser' handler with this robust version ---
ipcMain.handle('show-browser', async (event, { url, bounds, viewId }) => {
    log(`[BROWSER VIEW] Received 'show-browser' for viewId: ${viewId}`);
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    // Clean up any pre-existing view with the same ID.
    if (browserViews.has(viewId)) {
        const existingState = browserViews.get(viewId);
        mainWindow.removeBrowserView(existingState.view);
        if (existingState.view && !existingState.view.webContents.isDestroyed()) {
            existingState.view.webContents.destroy();
        }
        browserViews.delete(viewId);
    }

    const finalBounds = { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
    log(`[BROWSER VIEW] FINAL calculated bounds for ${viewId}:`, JSON.stringify(finalBounds));

  const newBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // Use shared partition so all browser panes share cookies/sessions
      // This is needed for Google services to work (auth persists across tabs)
      partition: 'persist:browser-shared',
    },
  });

  // Set Chrome-like user agent so Google services (Drive, Docs, etc.) work properly
  // Extract Chrome version from Electron's user agent and use standard Chrome UA
  const electronUA = newBrowserView.webContents.getUserAgent();
  const chromeMatch = electronUA.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
  const chromeVersion = chromeMatch ? chromeMatch[1] : '120.0.0.0';
  let platformUA;
  if (process.platform === 'win32') {
    platformUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  } else if (process.platform === 'darwin') {
    platformUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  } else {
    platformUA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }
  newBrowserView.webContents.setUserAgent(platformUA);

  newBrowserView.setBackgroundColor('#0f172a');
  
  mainWindow.addBrowserView(newBrowserView);
  newBrowserView.setBounds(finalBounds);
  
  // 🔥 THE FIX: Enable auto-resize with clipping
  newBrowserView.setAutoResize({
    width: true,
    height: true,
    horizontal: true,
    vertical: true
  });

  // Store with clipping enabled flag
  browserViews.set(viewId, { 
    view: newBrowserView, 
    bounds: finalBounds, 
    visible: true 
  });


  
  
    const wc = newBrowserView.webContents;

    // Handle popup windows (Google auth, contacts widget, etc.)
    wc.setWindowOpenHandler(({ url, disposition }) => {
      // Google auth and services - open in system browser for proper auth flow
      if (url.includes('accounts.google.com') ||
          url.includes('accounts.youtube.com') ||
          url.includes('myaccount.google.com')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }

      // Google widgets (contacts hovercard, etc.) - allow them to open
      if (url.includes('contacts.google.com/widget') ||
          url.includes('apis.google.com') ||
          url.includes('plus.google.com')) {
        // Allow these as they're needed for Google Drive functionality
        return { action: 'allow' };
      }

      // For other URLs, send to renderer to open in new browser tab
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-open-in-new-tab', { url, disposition });
      }
      return { action: 'deny' };
    });

    // Listeners now only send events to the renderer; they do not register handlers.
    wc.on('did-navigate', (event, navigatedUrl) => {
        mainWindow.webContents.send('browser-loaded', { viewId, url: navigatedUrl, title: wc.getTitle() });
    });
    wc.on('did-start-loading', () => mainWindow.webContents.send('browser-loading', { viewId, loading: true }));
    wc.on('page-title-updated', (e, title) => mainWindow.webContents.send('browser-title-updated', { viewId, title }));
    wc.on('did-stop-loading', () => {
        mainWindow.webContents.send('browser-loading', { viewId, loading: false });
        mainWindow.webContents.send('browser-navigation-state-updated', { viewId, canGoBack: wc.canGoBack(), canGoForward: wc.canGoForward() });
    });

    // Downloads handled by app.on('web-contents-created') handler

    const finalURL = url.startsWith('http') ? url : `https://${url}`;
    wc.loadURL(finalURL).catch(err => log(`[BROWSER VIEW ${viewId}] loadURL promise rejected: ${err.message}`));

    return { success: true, viewId };
});

// Browser context menu actions
ipcMain.handle('browser-save-image', async (event, { imageUrl, currentPath }) => {
    try {
        if (!currentPath) {
            return { success: false, error: 'No workspace directory provided' };
        }
        const url = new URL(imageUrl);
        const filename = path.basename(url.pathname) || 'image.png';
        const defaultPath = path.join(currentPath, filename);

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Image',
            defaultPath: defaultPath,
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        // Download the image
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.buffer();
        await fsPromises.writeFile(result.filePath, buffer);

        log(`[BROWSER] Image saved to: ${result.filePath}`);
        return { success: true, path: result.filePath };
    } catch (err) {
        log(`[BROWSER] Error saving image: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// Track active downloads for cancel/pause support
const activeDownloads = new Map();

ipcMain.handle('browser-save-link', async (event, { url, suggestedFilename, currentPath }) => {
    const controller = new AbortController();

    try {
        // Use workspace path or downloads folder
        const saveDir = currentPath || app.getPath('downloads');
        const filename = suggestedFilename || path.basename(new URL(url).pathname) || 'download';

        // Ensure unique filename if it already exists
        let finalPath = path.join(saveDir, filename);
        let counter = 1;
        while (fs.existsSync(finalPath)) {
            const ext = path.extname(filename);
            const base = path.basename(filename, ext);
            finalPath = path.join(saveDir, `${base} (${counter})${ext}`);
            counter++;
        }

        const downloadFilename = path.basename(finalPath);

        // Track this download
        activeDownloads.set(downloadFilename, { controller, paused: false });

        log(`[BROWSER] Starting download: ${filename} to ${finalPath}`);

        // Download the file with progress tracking
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        let received = 0;

        // Stream the response to file
        const fileStream = fs.createWriteStream(finalPath);
        const reader = response.body;

        for await (const chunk of reader) {
            // Check if cancelled
            if (controller.signal.aborted) {
                fileStream.destroy();
                fs.unlinkSync(finalPath);
                throw new Error('Download cancelled');
            }

            fileStream.write(chunk);
            received += chunk.length;

            // Send progress to renderer
            if (contentLength > 0 && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-progress', {
                    filename: downloadFilename,
                    received,
                    total: contentLength,
                    percent: Math.round((received / contentLength) * 100)
                });
            }
        }

        fileStream.end();
        activeDownloads.delete(downloadFilename);

        log(`[BROWSER] Download completed: ${finalPath}`);

        // Send completion event
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-complete', {
                filename: downloadFilename,
                path: finalPath,
                state: 'completed'
            });
        }

        return { success: true, path: finalPath };
    } catch (err) {
        const downloadFilename = suggestedFilename || 'download';
        activeDownloads.delete(downloadFilename);

        if (err.name === 'AbortError' || err.message === 'Download cancelled') {
            log(`[BROWSER] Download cancelled: ${downloadFilename}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-complete', {
                    filename: downloadFilename,
                    state: 'cancelled'
                });
            }
            return { success: false, cancelled: true };
        }

        log(`[BROWSER] Error saving link: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('cancel-download', async (event, filename) => {
    const download = activeDownloads.get(filename);
    if (download) {
        download.controller.abort();
        activeDownloads.delete(filename);
        log(`[BROWSER] Cancelled download: ${filename}`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
});

ipcMain.handle('pause-download', async (event, filename) => {
    // Note: Pause/resume with fetch requires range request support - this is a placeholder
    const download = activeDownloads.get(filename);
    if (download) {
        download.paused = true;
        log(`[BROWSER] Pause requested for: ${filename} (not fully implemented)`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
});

ipcMain.handle('resume-download', async (event, filename) => {
    // Note: Pause/resume with fetch requires range request support - this is a placeholder
    const download = activeDownloads.get(filename);
    if (download) {
        download.paused = false;
        log(`[BROWSER] Resume requested for: ${filename} (not fully implemented)`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
});

ipcMain.handle('browser-open-external', async (event, { url }) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        log(`[BROWSER] Error opening external URL: ${err.message}`);
        return { success: false, error: err.message };
    }
});



ipcMain.handle('browser:set-visibility', (event, { viewId, visible }) => {
    if (browserViews.has(viewId)) {
        const browserState = browserViews.get(viewId);
        if (visible) {
            log(`[BROWSER VIEW] Setting visibility to TRUE for ${viewId}`);
            browserState.view.setBounds(browserState.bounds); // Use stored bounds
            browserState.visible = true;
        } else {
            log(`[BROWSER VIEW] Setting visibility to FALSE for ${viewId}`);
           
            browserState.view.setBounds({ x: -2000, y: -2000, width: 0, height: 0 });
            browserState.visible = false;
        }
        return { success: true };
    }
    return { success: false, error: 'View not found' };
});
  
 

ipcMain.handle('update-browser-bounds', (event, { viewId, bounds }) => {
  if (browserViews.has(viewId)) {
    const browserState = browserViews.get(viewId);
    
    // Get main window bounds to establish hard limits
    const winBounds = mainWindow.getBounds();
    
    // Clip bounds to NEVER exceed the pane's boundaries
    const adjustedBounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.min(
        Math.round(bounds.width),
        winBounds.width - Math.round(bounds.x)
      ),
      height: Math.min(
        Math.round(bounds.height),
        winBounds.height - Math.round(bounds.y)
      )
    };
    console.log(`[BROWSER ${viewId}] Setting bounds:`, adjustedBounds);
  console.log(`[BROWSER ${viewId}] Window size:`, mainWindow.getBounds());


    browserState.bounds = adjustedBounds;
    
    if (browserState.visible) {
      browserState.view.setBounds(adjustedBounds);
    }
    return { success: true };
  }
  return { success: false, error: 'Browser view not found' };
});
ipcMain.handle('hide-browser', (event, { viewId }) => {
    log(`[BROWSER VIEW] Received 'hide-browser' for viewId: ${viewId}`);
    if (browserViews.has(viewId) && mainWindow && !mainWindow.isDestroyed()) {
        log(`[BROWSER VIEW] Removing and destroying BrowserView for ${viewId}`);
        const browserState = browserViews.get(viewId);
        mainWindow.removeBrowserView(browserState.view);
        browserState.view.webContents.destroy();
        browserViews.delete(viewId);
        return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
});
  
 
ipcMain.handle('browser:addToHistory', async (event, { url, title, folderPath, paneId, navigationType = 'click', fromUrl }) => {
  try {
    if (!url || url === 'about:blank') {
      log('[BROWSER HISTORY] Skipping add to history for blank or invalid URL:', url);
      return { success: true, message: 'Skipped blank URL' };
    }

    const existing = await dbQuery(
      'SELECT id, visit_count FROM browser_history WHERE url = ? AND folder_path = ?',
      [url, folderPath]
    );

    if (existing.length > 0) {
      await dbQuery(
        'UPDATE browser_history SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP, title = ?, pane_id = ?, navigation_type = ? WHERE id = ?',
        [title, paneId, navigationType, existing[0].id]
      );
      log(`[BROWSER HISTORY] Updated history for ${url} in ${folderPath}`);
    } else {
      await dbQuery(
        'INSERT INTO browser_history (url, title, folder_path, pane_id, navigation_type) VALUES (?, ?, ?, ?, ?)',
        [url, title, folderPath, paneId, navigationType]
      );
      log(`[BROWSER HISTORY] Added new history entry for ${url} in ${folderPath}`);
    }

    // Record the navigation edge if we have a fromUrl (previous page in this pane)
    if (fromUrl && fromUrl !== 'about:blank' && fromUrl !== url) {
      await dbQuery(
        'INSERT INTO browser_navigations (pane_id, from_url, to_url, navigation_type, folder_path) VALUES (?, ?, ?, ?, ?)',
        [paneId, fromUrl, url, navigationType, folderPath]
      );
      log(`[BROWSER HISTORY] Recorded navigation: ${fromUrl} -> ${url} (${navigationType})`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-browser-history', async (event, folderPath) => {
  try {
    // Only return history entries for this specific folder
    const history = await dbQuery(
      'SELECT id, title, url, folder_path, visit_count, last_visited FROM browser_history WHERE folder_path = ? ORDER BY last_visited DESC LIMIT 50',
      [folderPath]
    );
    log(`[BROWSER HISTORY] Retrieved ${history.length} history entries for ${folderPath}`);
    return { history };
  } catch (error) {
    log(`[BROWSER HISTORY] Error getting history for ${folderPath}:`, error);
    return { error: error.message };
  }
});




ipcMain.handle('browser:getHistory', async (event, { folderPath, limit = 50 }) => {
  try {
    const history = await dbQuery(
      'SELECT * FROM browser_history WHERE folder_path = ? ORDER BY last_visited DESC LIMIT ?',
      [folderPath, limit]
    );
    log(`[BROWSER HISTORY] Retrieved ${history.length} history entries for ${folderPath}`);
    return { success: true, history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
  
ipcMain.handle('browser:addBookmark', async (event, { url, title, folderPath, isGlobal = false }) => {
  try {
    if (!url || url === 'about:blank') { // Don't bookmark blank pages
      log('[BROWSER BOOKMARKS] Skipping add bookmark for blank or invalid URL:', url);
      return { success: false, error: 'Cannot bookmark a blank or invalid URL.' };
    }
    await dbQuery(
      'INSERT INTO bookmarks (url, title, folder_path, is_global) VALUES (?, ?, ?, ?)',
      [url, title, isGlobal ? null : folderPath, isGlobal ? 1 : 0]
    );
    log(`[BROWSER BOOKMARKS] Added bookmark: ${title} (${url})`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
  
ipcMain.handle('browser:getBookmarks', async (event, { folderPath }) => {
  try {
   
    const bookmarks = await dbQuery(
      'SELECT * FROM bookmarks WHERE (folder_path = ? OR is_global = 1) ORDER BY is_global ASC, timestamp DESC',
      [folderPath]
    );
    log(`[BROWSER BOOKMARKS] Retrieved ${bookmarks.length} bookmarks for ${folderPath}`);
    return { success: true, bookmarks };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
  
ipcMain.handle('browser:deleteBookmark', async (event, { bookmarkId }) => {
  try {
    await dbQuery('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);
    log(`[BROWSER BOOKMARKS] Deleted bookmark ID: ${bookmarkId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Site limits - for restricting time/visits on any domain
ipcMain.handle('browser:setSiteLimit', async (event, { domain, folderPath, hourlyTimeLimit, dailyTimeLimit, hourlyVisitLimit, dailyVisitLimit, isGlobal = false }) => {
  try {
    // Upsert - insert or update on conflict
    await dbQuery(
      `INSERT INTO site_limits (domain, folder_path, is_global, hourly_time_limit, daily_time_limit, hourly_visit_limit, daily_visit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(domain, folder_path) DO UPDATE SET
         hourly_time_limit = excluded.hourly_time_limit,
         daily_time_limit = excluded.daily_time_limit,
         hourly_visit_limit = excluded.hourly_visit_limit,
         daily_visit_limit = excluded.daily_visit_limit`,
      [domain, isGlobal ? null : folderPath, isGlobal ? 1 : 0, hourlyTimeLimit || 0, dailyTimeLimit || 0, hourlyVisitLimit || 0, dailyVisitLimit || 0]
    );
    log(`[SITE LIMITS] Set limits for ${domain}: hourlyTime=${hourlyTimeLimit}, dailyTime=${dailyTimeLimit}, hourlyVisits=${hourlyVisitLimit}, dailyVisits=${dailyVisitLimit}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:getSiteLimits', async (event, { folderPath }) => {
  try {
    const limits = await dbQuery(
      'SELECT * FROM site_limits WHERE (folder_path = ? OR is_global = 1)',
      [folderPath]
    );
    return { success: true, limits };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:deleteSiteLimit', async (event, { limitId }) => {
  try {
    await dbQuery('DELETE FROM site_limits WHERE id = ?', [limitId]);
    log(`[SITE LIMITS] Deleted limit ID: ${limitId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:clearHistory', async (event, { folderPath }) => {
  try {
    await dbQuery('DELETE FROM browser_history WHERE folder_path = ?', [folderPath]);
    await dbQuery('DELETE FROM browser_navigations WHERE folder_path = ?', [folderPath]);
    log(`[BROWSER HISTORY] Cleared history for ${folderPath}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get browser history as a graph for visualization
ipcMain.handle('browser:getHistoryGraph', async (event, { folderPath, minVisits = 1, dateFrom, dateTo }) => {
  try {
    // Build date filter clause
    let dateFilter = '';
    const params = [folderPath];
    if (dateFrom) {
      dateFilter += ' AND last_visited >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      dateFilter += ' AND last_visited <= ?';
      params.push(dateTo);
    }

    // Get all history entries as nodes (grouped by domain for cleaner visualization)
    const historyEntries = await dbQuery(
      `SELECT url, title, visit_count, last_visited, pane_id, navigation_type
       FROM browser_history
       WHERE folder_path = ? AND visit_count >= ?${dateFilter}
       ORDER BY visit_count DESC`,
      [...params.slice(0, 1), minVisits, ...params.slice(1)]
    );

    // Get all navigations as edges
    let navDateFilter = '';
    const navParams = [folderPath];
    if (dateFrom) {
      navDateFilter += ' AND timestamp >= ?';
      navParams.push(dateFrom);
    }
    if (dateTo) {
      navDateFilter += ' AND timestamp <= ?';
      navParams.push(dateTo);
    }

    const navigations = await dbQuery(
      `SELECT from_url, to_url, navigation_type, COUNT(*) as weight
       FROM browser_navigations
       WHERE folder_path = ?${navDateFilter}
       GROUP BY from_url, to_url, navigation_type
       ORDER BY weight DESC`,
      navParams
    );

    // Helper to extract domain from URL
    const getDomain = (url) => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    };

    // Build node map (by domain)
    const domainMap = new Map();
    for (const entry of historyEntries) {
      const domain = getDomain(entry.url);
      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          id: domain,
          label: domain,
          visitCount: 0,
          urls: [],
          lastVisited: entry.last_visited
        });
      }
      const node = domainMap.get(domain);
      node.visitCount += entry.visit_count;
      node.urls.push({ url: entry.url, title: entry.title, visits: entry.visit_count });
      if (entry.last_visited > node.lastVisited) {
        node.lastVisited = entry.last_visited;
      }
    }

    // Build edge map (domain to domain)
    const edgeMap = new Map();
    for (const nav of navigations) {
      const fromDomain = getDomain(nav.from_url);
      const toDomain = getDomain(nav.to_url);
      if (fromDomain === toDomain) continue; // Skip self-loops

      const edgeKey = `${fromDomain}->${toDomain}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          source: fromDomain,
          target: toDomain,
          weight: 0,
          clickWeight: 0,
          manualWeight: 0
        });
      }
      const edge = edgeMap.get(edgeKey);
      edge.weight += nav.weight;
      if (nav.navigation_type === 'click') {
        edge.clickWeight += nav.weight;
      } else {
        edge.manualWeight += nav.weight;
      }
    }

    // Convert maps to arrays, filtering to only include nodes that are in navigations
    const allDomains = new Set([...domainMap.keys()]);
    const navigatedDomains = new Set();
    for (const edge of edgeMap.values()) {
      navigatedDomains.add(edge.source);
      navigatedDomains.add(edge.target);
    }

    // Include all domains that have visits, plus any in navigations
    const nodes = Array.from(domainMap.values()).filter(n =>
      n.visitCount >= minVisits || navigatedDomains.has(n.id)
    );
    const links = Array.from(edgeMap.values());

    // Calculate stats
    const totalVisits = nodes.reduce((sum, n) => sum + n.visitCount, 0);
    const totalNavigations = links.reduce((sum, l) => sum + l.weight, 0);
    const topDomains = [...nodes].sort((a, b) => b.visitCount - a.visitCount).slice(0, 10);

    log(`[BROWSER HISTORY GRAPH] Built graph with ${nodes.length} nodes, ${links.length} edges`);

    return {
      success: true,
      nodes,
      links,
      stats: {
        totalNodes: nodes.length,
        totalEdges: links.length,
        totalVisits,
        totalNavigations,
        topDomains: topDomains.map(d => ({ domain: d.id, visits: d.visitCount }))
      }
    };
  } catch (error) {
    log(`[BROWSER HISTORY GRAPH] Error:`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-navigate', (event, { viewId, url }) => {
  if (browserViews.has(viewId)) {
    const finalURL = url.startsWith('http') ? url : `https://${url}`;
    log(`[BROWSER VIEW] Navigating ${viewId} to: ${finalURL}`);
    browserViews.get(viewId).view.webContents.loadURL(finalURL); // Access webContents via .view
    return { success: true };
  }
  return { success: false, error: 'Browser view not found' };
});
  
ipcMain.handle('browser-back', (event, { viewId }) => {
  if (browserViews.has(viewId)) {
    const webContents = browserViews.get(viewId).view.webContents; // Access webContents via .view
    if (webContents.canGoBack()) {
      webContents.goBack();
      return { success: true };
    }
    return { success: false, error: 'Cannot go back' };
  }
  return { success: false, error: 'Browser view not found' };
});
  
ipcMain.handle('browser-forward', (event, { viewId }) => {
  if (browserViews.has(viewId)) {
    const webContents = browserViews.get(viewId).view.webContents; // Access webContents via .view
    if (webContents.canGoForward()) {
      webContents.goForward();
      return { success: true };
    }
    return { success: false, error: 'Cannot go forward' };
  }
  return { success: false, error: 'Browser view not found' };
});
  
ipcMain.handle('browser-refresh', (event, { viewId }) => {
  if (browserViews.has(viewId)) {
    browserViews.get(viewId).view.webContents.reload(); // Access webContents via .view
    return { success: true };
  }
  return { success: false, error: 'Browser view not found' };
});

ipcMain.handle('browser-hard-refresh', (event, { viewId }) => {
  if (browserViews.has(viewId)) {
    browserViews.get(viewId).view.webContents.reloadIgnoringCache();
    return { success: true };
  }
  return { success: false, error: 'Browser view not found' };
});
  
ipcMain.handle('browser-get-selected-text', (event, { viewId }) => {
  if (browserViews.has(viewId)) {
    return new Promise((resolve) => {
      browserViews.get(viewId).view.webContents.executeJavaScript(` // Access webContents via .view
        window.getSelection().toString();
      `).then(selectedText => {
        resolve({ success: true, selectedText });
      }).catch(error => {
        resolve({ success: false, error: error.message });
      });
    });
  }
  return { success: false, error: 'Browser view not found' };
});

// ==================== BROWSER EXTENSIONS ====================
const extensionsDir = path.join(os.homedir(), '.npcsh', 'incognide', 'extensions');
const extensionsConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'extensions.json');
const loadedExtensions = new Map(); // extensionId => extension object

// Ensure extensions directory exists
const ensureExtensionsDir = async () => {
  await fsPromises.mkdir(extensionsDir, { recursive: true });
};

// Load extensions config
const loadExtensionsConfig = async () => {
  try {
    await ensureExtensionsDir();
    const data = await fsPromises.readFile(extensionsConfigPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { extensions: [], enabled: {} };
  }
};

// Save extensions config
const saveExtensionsConfig = async (config) => {
  await ensureExtensionsDir();
  await fsPromises.writeFile(extensionsConfigPath, JSON.stringify(config, null, 2));
};

// Load a Chrome extension into the browser session
ipcMain.handle('browser:loadExtension', async (event, extensionPath) => {
  try {
    const browserSession = session.fromPartition('persist:default-browser-session');
    const extension = await browserSession.loadExtension(extensionPath, { allowFileAccess: true });
    loadedExtensions.set(extension.id, extension);

    // Save to config
    const config = await loadExtensionsConfig();
    if (!config.extensions.find(e => e.path === extensionPath)) {
      config.extensions.push({
        id: extension.id,
        name: extension.name,
        path: extensionPath,
        version: extension.version
      });
      config.enabled[extension.id] = true;
      await saveExtensionsConfig(config);
    }

    return { success: true, extension: { id: extension.id, name: extension.name, version: extension.version } };
  } catch (error) {
    console.error('[Extensions] Failed to load extension:', error);
    return { success: false, error: error.message };
  }
});

// Unload/remove an extension
ipcMain.handle('browser:removeExtension', async (event, extensionId) => {
  try {
    const browserSession = session.fromPartition('persist:default-browser-session');
    await browserSession.removeExtension(extensionId);
    loadedExtensions.delete(extensionId);

    // Remove from config
    const config = await loadExtensionsConfig();
    config.extensions = config.extensions.filter(e => e.id !== extensionId);
    delete config.enabled[extensionId];
    await saveExtensionsConfig(config);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get all loaded extensions
ipcMain.handle('browser:getExtensions', async () => {
  try {
    const browserSession = session.fromPartition('persist:default-browser-session');
    const extensions = browserSession.getAllExtensions();
    const config = await loadExtensionsConfig();

    return {
      success: true,
      extensions: extensions.map(ext => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        enabled: config.enabled[ext.id] !== false
      }))
    };
  } catch (error) {
    return { success: false, error: error.message, extensions: [] };
  }
});

// Toggle extension enabled state
ipcMain.handle('browser:toggleExtension', async (event, { extensionId, enabled }) => {
  try {
    const config = await loadExtensionsConfig();
    config.enabled[extensionId] = enabled;
    await saveExtensionsConfig(config);

    // Reload the browser session to apply changes
    // Note: Electron doesn't have a direct enable/disable, so we'd need to reload
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open file dialog to select extension folder
ipcMain.handle('browser:selectExtensionFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Chrome Extension Folder',
    message: 'Select the folder containing the extension manifest.json'
  });

  if (result.canceled || !result.filePaths[0]) {
    return { success: false, canceled: true };
  }

  const extensionPath = result.filePaths[0];

  // Verify it's a valid extension (has manifest.json)
  const manifestPath = path.join(extensionPath, 'manifest.json');
  try {
    await fsPromises.access(manifestPath);
    return { success: true, path: extensionPath };
  } catch {
    return { success: false, error: 'Selected folder does not contain a manifest.json file' };
  }
});

// Get browser profiles from installed browsers
ipcMain.handle('browser:getInstalledBrowsers', async () => {
  const browsers = [];
  const homeDir = os.homedir();

  // Common browser profile paths
  const browserPaths = {
    chrome: {
      linux: path.join(homeDir, '.config', 'google-chrome'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome'),
      win32: path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
    },
    chromium: {
      linux: path.join(homeDir, '.config', 'chromium'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Chromium'),
      win32: path.join(homeDir, 'AppData', 'Local', 'Chromium', 'User Data')
    },
    firefox: {
      linux: path.join(homeDir, '.mozilla', 'firefox'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Firefox', 'Profiles'),
      win32: path.join(homeDir, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
    },
    brave: {
      linux: path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
      win32: path.join(homeDir, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data')
    },
    vivaldi: {
      linux: path.join(homeDir, '.config', 'vivaldi'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Vivaldi'),
      win32: path.join(homeDir, 'AppData', 'Local', 'Vivaldi', 'User Data')
    },
    edge: {
      linux: path.join(homeDir, '.config', 'microsoft-edge'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge'),
      win32: path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data')
    }
  };

  const platform = process.platform;

  for (const [browserName, paths] of Object.entries(browserPaths)) {
    const browserPath = paths[platform];
    if (browserPath) {
      try {
        await fsPromises.access(browserPath);
        browsers.push({
          name: browserName.charAt(0).toUpperCase() + browserName.slice(1),
          path: browserPath,
          key: browserName
        });
      } catch {
        // Browser not installed
      }
    }
  }

  return { success: true, browsers };
});

// Import extensions from another browser
ipcMain.handle('browser:importExtensionsFrom', async (event, { browserKey }) => {
  try {
    const homeDir = os.homedir();
    const platform = process.platform;
    let extensionsPath;

    // Chrome-based browsers store extensions in a similar structure
    const chromiumPaths = {
      chrome: {
        linux: path.join(homeDir, '.config', 'google-chrome', 'Default', 'Extensions'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Extensions')
      },
      brave: {
        linux: path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions'),
        win32: path.join(homeDir, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Extensions')
      },
      vivaldi: {
        linux: path.join(homeDir, '.config', 'vivaldi', 'Default', 'Extensions'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Vivaldi', 'Default', 'Extensions'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Vivaldi', 'User Data', 'Default', 'Extensions')
      },
      edge: {
        linux: path.join(homeDir, '.config', 'microsoft-edge', 'Default', 'Extensions'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Extensions'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Extensions')
      },
      chromium: {
        linux: path.join(homeDir, '.config', 'chromium', 'Default', 'Extensions'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Chromium', 'Default', 'Extensions'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Chromium', 'User Data', 'Default', 'Extensions')
      }
    };

    if (!chromiumPaths[browserKey]) {
      return { success: false, error: 'Firefox extensions are not compatible. Only Chromium-based browsers are supported.' };
    }

    extensionsPath = chromiumPaths[browserKey][platform];

    try {
      await fsPromises.access(extensionsPath);
    } catch {
      return { success: false, error: `No extensions found at ${extensionsPath}` };
    }

    const extensionDirs = await fsPromises.readdir(extensionsPath);
    const imported = [];
    const skipped = [];
    const browserSession = session.fromPartition('persist:default-browser-session');

    for (const extId of extensionDirs) {
      const extPath = path.join(extensionsPath, extId);
      const stat = await fsPromises.stat(extPath);
      if (!stat.isDirectory()) continue;

      // Extensions have version subfolders
      const versions = await fsPromises.readdir(extPath);
      if (versions.length === 0) continue;

      // Get the latest version
      const latestVersion = versions.sort().pop();
      const fullExtPath = path.join(extPath, latestVersion);
      const manifestPath = path.join(fullExtPath, 'manifest.json');

      // Check for manifest.json and read it
      try {
        await fsPromises.access(manifestPath);
        const manifestData = JSON.parse(await fsPromises.readFile(manifestPath, 'utf-8'));
        const manifestVersion = manifestData.manifest_version || 2;
        const extName = manifestData.name || extId;

        // Skip MV3 extensions with service workers (limited support in Electron)
        if (manifestVersion === 3 && manifestData.background?.service_worker) {
          console.log(`[Extensions] Skipping MV3 service worker extension: ${extName}`);
          skipped.push({ name: extName, reason: 'MV3 service worker not fully supported' });
          continue;
        }

        const extension = await browserSession.loadExtension(fullExtPath, { allowFileAccess: true });
        loadedExtensions.set(extension.id, extension);
        imported.push({ id: extension.id, name: extension.name, version: extension.version, path: fullExtPath });
      } catch (err) {
        console.log(`[Extensions] Skipping ${extId}: ${err.message}`);
      }
    }

    // Save imported extensions to config
    if (imported.length > 0) {
      const config = await loadExtensionsConfig();
      for (const ext of imported) {
        if (!config.extensions.find(e => e.id === ext.id)) {
          config.extensions.push(ext);
          config.enabled[ext.id] = true;
        }
      }
      await saveExtensionsConfig(config);
    }

    return { success: true, imported, skipped };
  } catch (error) {
    console.error('[Extensions] Import error:', error);
    return { success: false, error: error.message };
  }
});

// Load previously saved extensions on startup
const loadSavedExtensions = async () => {
  try {
    const config = await loadExtensionsConfig();
    const browserSession = session.fromPartition('persist:default-browser-session');

    for (const ext of config.extensions) {
      if (config.enabled[ext.id] !== false && ext.path) {
        try {
          const extension = await browserSession.loadExtension(ext.path, { allowFileAccess: true });
          loadedExtensions.set(extension.id, extension);
          console.log(`[Extensions] Loaded: ${extension.name}`);
        } catch (err) {
          console.log(`[Extensions] Failed to load ${ext.name}: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.log('[Extensions] No saved extensions to load');
  }
};

// Load extensions after app is ready
app.whenReady().then(() => {
  loadSavedExtensions().catch(err => {
    console.log('[Extensions] Startup load error:', err.message);
  });
});

// ==================== COOKIE INHERITANCE MANAGER ====================
const cookieInheritanceConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'cookie-inheritance.json');
const knownPartitionsPath = path.join(os.homedir(), '.npcsh', 'incognide', 'known-partitions.json');

// Load/save known partitions (folders that have been used with browser)
const loadKnownPartitions = async () => {
  try {
    const data = await fsPromises.readFile(knownPartitionsPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { partitions: [] };
  }
};

const saveKnownPartitions = async (data) => {
  const dir = path.dirname(knownPartitionsPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(knownPartitionsPath, JSON.stringify(data, null, 2));
};

// Load/save cookie inheritance config
const loadCookieInheritanceConfig = async () => {
  try {
    const data = await fsPromises.readFile(cookieInheritanceConfigPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { inheritance: {} }; // { targetPartition: [sourcePartitions] }
  }
};

const saveCookieInheritanceConfig = async (data) => {
  const dir = path.dirname(cookieInheritanceConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(cookieInheritanceConfigPath, JSON.stringify(data, null, 2));
};

// Register a partition as known (called when browser opens in a folder)
ipcMain.handle('browser:registerPartition', async (event, { partition, folderPath }) => {
  try {
    const config = await loadKnownPartitions();
    const existing = config.partitions.find(p => p.partition === partition);
    if (!existing) {
      config.partitions.push({ partition, folderPath, lastUsed: Date.now() });
    } else {
      existing.lastUsed = Date.now();
      existing.folderPath = folderPath; // Update path in case it changed
    }
    await saveKnownPartitions(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get all known partitions
ipcMain.handle('browser:getKnownPartitions', async () => {
  try {
    const config = await loadKnownPartitions();
    return { success: true, partitions: config.partitions };
  } catch (error) {
    return { success: false, error: error.message, partitions: [] };
  }
});

// Get cookies from a specific partition
ipcMain.handle('browser:getCookiesFromPartition', async (event, { partition }) => {
  try {
    const sess = session.fromPartition(`persist:${partition}`);
    const cookies = await sess.cookies.get({});
    return { success: true, cookies };
  } catch (error) {
    return { success: false, error: error.message, cookies: [] };
  }
});

// Import cookies from one partition to another
ipcMain.handle('browser:importCookiesFromPartition', async (event, { sourcePartition, targetPartition, domain }) => {
  try {
    const sourceSession = session.fromPartition(`persist:${sourcePartition}`);
    const targetSession = session.fromPartition(`persist:${targetPartition}`);

    // Get cookies from source (optionally filtered by domain)
    const filter = domain ? { domain } : {};
    const cookies = await sourceSession.cookies.get(filter);

    let imported = 0;
    for (const cookie of cookies) {
      try {
        // Build the URL for the cookie
        const protocol = cookie.secure ? 'https' : 'http';
        const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const url = `${protocol}://${cookieDomain}${cookie.path || '/'}`;

        await targetSession.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate,
          sameSite: cookie.sameSite
        });
        imported++;
      } catch (err) {
        console.log(`[Cookies] Failed to import cookie ${cookie.name}:`, err.message);
      }
    }

    return { success: true, imported, total: cookies.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set cookie inheritance for a partition
ipcMain.handle('browser:setCookieInheritance', async (event, { targetPartition, sourcePartitions }) => {
  try {
    const config = await loadCookieInheritanceConfig();
    config.inheritance[targetPartition] = sourcePartitions;
    await saveCookieInheritanceConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get cookie inheritance config for a partition
ipcMain.handle('browser:getCookieInheritance', async (event, { partition }) => {
  try {
    const config = await loadCookieInheritanceConfig();
    return { success: true, sources: config.inheritance[partition] || [] };
  } catch (error) {
    return { success: false, error: error.message, sources: [] };
  }
});

// Get unique domains with cookies in a partition
ipcMain.handle('browser:getCookieDomains', async (event, { partition }) => {
  try {
    const sess = session.fromPartition(`persist:${partition}`);
    const cookies = await sess.cookies.get({});
    const domains = [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))];
    return { success: true, domains };
  } catch (error) {
    return { success: false, error: error.message, domains: [] };
  }
});

// ==================== PASSWORD MANAGER ====================
const passwordsFilePath = path.join(os.homedir(), '.npcsh', 'incognide', 'credentials.enc');

// Ensure the credentials file exists
const ensurePasswordsFile = async () => {
  const dir = path.dirname(passwordsFilePath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(passwordsFilePath);
  } catch {
    // File doesn't exist, create empty encrypted store
    const emptyData = JSON.stringify({ credentials: [] });
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(emptyData);
      await fsPromises.writeFile(passwordsFilePath, encrypted);
    } else {
      // Fallback to base64 if encryption not available (less secure)
      await fsPromises.writeFile(passwordsFilePath, Buffer.from(emptyData).toString('base64'));
    }
  }
};

// Read all credentials
const readCredentials = async () => {
  await ensurePasswordsFile();
  const fileContent = await fsPromises.readFile(passwordsFilePath);
  let decrypted;
  if (safeStorage.isEncryptionAvailable()) {
    decrypted = safeStorage.decryptString(fileContent);
  } else {
    decrypted = Buffer.from(fileContent.toString(), 'base64').toString('utf8');
  }
  return JSON.parse(decrypted);
};

// Write all credentials
const writeCredentials = async (data) => {
  await ensurePasswordsFile();
  const jsonData = JSON.stringify(data);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(jsonData);
    await fsPromises.writeFile(passwordsFilePath, encrypted);
  } else {
    await fsPromises.writeFile(passwordsFilePath, Buffer.from(jsonData).toString('base64'));
  }
};

// Save a credential
ipcMain.handle('password-save', async (event, { site, username, password, notes }) => {
  try {
    const data = await readCredentials();
    const existingIndex = data.credentials.findIndex(c => c.site === site && c.username === username);

    const credential = {
      id: existingIndex >= 0 ? data.credentials[existingIndex].id : crypto.randomUUID(),
      site,
      username,
      password,
      notes: notes || '',
      createdAt: existingIndex >= 0 ? data.credentials[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      data.credentials[existingIndex] = credential;
    } else {
      data.credentials.push(credential);
    }

    await writeCredentials(data);
    return { success: true, id: credential.id };
  } catch (err) {
    console.error('Error saving credential:', err);
    return { success: false, error: err.message };
  }
});

// Get credentials for a site (for auto-fill)
ipcMain.handle('password-get-for-site', async (event, { site }) => {
  try {
    const data = await readCredentials();
    // Match by domain - extract domain from URL
    const extractDomain = (url) => {
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsed.hostname.replace(/^www\./, '');
      } catch {
        return url.replace(/^www\./, '');
      }
    };

    const siteDomain = extractDomain(site);
    const matches = data.credentials.filter(c => {
      const credDomain = extractDomain(c.site);
      return credDomain === siteDomain || siteDomain.endsWith(`.${credDomain}`) || credDomain.endsWith(`.${siteDomain}`);
    });

    // Return without exposing password in list (get specific one with password-get)
    return {
      success: true,
      credentials: matches.map(c => ({ id: c.id, site: c.site, username: c.username }))
    };
  } catch (err) {
    console.error('Error getting credentials for site:', err);
    return { success: false, error: err.message };
  }
});

// Get a specific credential with password
ipcMain.handle('password-get', async (event, { id }) => {
  try {
    const data = await readCredentials();
    const credential = data.credentials.find(c => c.id === id);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }
    return { success: true, credential };
  } catch (err) {
    console.error('Error getting credential:', err);
    return { success: false, error: err.message };
  }
});

// List all credentials (without passwords)
ipcMain.handle('password-list', async () => {
  try {
    const data = await readCredentials();
    return {
      success: true,
      credentials: data.credentials.map(c => ({
        id: c.id,
        site: c.site,
        username: c.username,
        notes: c.notes,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    };
  } catch (err) {
    console.error('Error listing credentials:', err);
    return { success: false, error: err.message };
  }
});

// Delete a credential
ipcMain.handle('password-delete', async (event, { id }) => {
  try {
    const data = await readCredentials();
    const index = data.credentials.findIndex(c => c.id === id);
    if (index < 0) {
      return { success: false, error: 'Credential not found' };
    }
    data.credentials.splice(index, 1);
    await writeCredentials(data);
    return { success: true };
  } catch (err) {
    console.error('Error deleting credential:', err);
    return { success: false, error: err.message };
  }
});

// Check if encryption is available
ipcMain.handle('password-encryption-status', async () => {
  return {
    available: safeStorage.isEncryptionAvailable(),
    message: safeStorage.isEncryptionAvailable()
      ? 'Credentials are encrypted using system keychain'
      : 'Encryption not available - credentials stored with basic encoding'
  };
});

// ==================== END PASSWORD MANAGER ====================

// ==================== PYTHON ENVIRONMENT CONFIGURATION ====================
const pythonEnvConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'python_envs.json');

// Ensure python env config file exists
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

// Get Python environment config for a workspace
ipcMain.handle('python-env-get', async (event, { workspacePath }) => {
  try {
    const config = await readPythonEnvConfig();
    return config.workspaces[workspacePath] || null;
  } catch (err) {
    console.error('Error getting python env config:', err);
    return null;
  }
});

// Save Python environment config for a workspace
ipcMain.handle('python-env-save', async (event, { workspacePath, envConfig }) => {
  try {
    const config = await readPythonEnvConfig();
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
    const config = await readPythonEnvConfig();
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
    const config = await readPythonEnvConfig();
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
    const config = await readPythonEnvConfig();
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
  const { spawn } = require('child_process');

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
            const config = await readPythonEnvConfig();
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
  const { execSync } = require('child_process');
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
  const { spawn } = require('child_process');
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
  const { spawn } = require('child_process');

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
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }

    // Get the newly configured Python path
    const customPythonPath = getBackendPythonPath();

    if (!customPythonPath) {
      return { success: false, error: 'No Python path configured' };
    }

    const dataPath = ensureUserDataDirectory();

    backendProcess = spawn(customPythonPath, ['-m', 'npcpy.serve'], {
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

    backendProcess.stdout.on('data', (data) => {
      logBackend(`stdout: ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
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

// ==================== END FIRST-RUN SETUP ====================

// Check if Python environment is configured for a workspace
ipcMain.handle('python-env-check-configured', async (event, { workspacePath }) => {
  try {
    const config = await readPythonEnvConfig();
    const envConfig = config.workspaces[workspacePath];
    return { configured: !!envConfig, config: envConfig };
  } catch (err) {
    return { configured: false, error: err.message };
  }
});

// Helper to resolve Python path from config or detect from workspace
const resolvePythonPath = async (workspacePath, envConfig) => {
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
        const { execSync } = require('child_process');
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
    const { execSync } = require('child_process');
    const systemPython = execSync('which python3 || which python', { encoding: 'utf8' }).trim();
    if (systemPython) {
      return { pythonPath: systemPython };
    }
  } catch {}

  return null;
};

// List installed packages in the Python environment
ipcMain.handle('python-env-list-packages', async (event, workspacePath) => {
  const { spawn } = require('child_process');

  try {
    const config = await readPythonEnvConfig();
    const envConfig = config.workspaces[workspacePath];

    // Get the Python path for this workspace
    const pythonInfo = await resolvePythonPath(workspacePath, envConfig);
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
  const { spawn } = require('child_process');

  try {
    const config = await readPythonEnvConfig();
    const envConfig = config.workspaces[workspacePath];

    const pythonInfo = await resolvePythonPath(workspacePath, envConfig);
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
  const { spawn } = require('child_process');

  try {
    const config = await readPythonEnvConfig();
    const envConfig = config.workspaces[workspacePath];

    const pythonInfo = await resolvePythonPath(workspacePath, envConfig);
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

// ==================== END PYTHON ENVIRONMENT ====================

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

// ==================== END TILE CONFIGURATION ====================

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
const componentsDir = path.join(__dirname, 'renderer', 'components');

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

// Track if we've done initial compile
let jinxInitialCompileDone = false;

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

// ==================== END TILE JINX SYSTEM ====================

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

ipcMain.handle('saveProjectSettings', async (event, { path, env_vars }) => {
    try {
        const url = `${BACKEND_URL}/api/settings/project?path=${encodeURIComponent(path)}`;
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

// --- MCP Server helpers ---
async function fetchCtxMcpServers(currentPath) {
  const servers = new Map(); // serverPath -> { serverPath, origin }
  const addServer = (entry, origin) => {
    if (!entry) return;
    const serverPath = typeof entry === 'string' ? entry : entry.value;
    if (serverPath && !servers.has(serverPath)) {
      servers.set(serverPath, { serverPath, origin });
    }
  };

  // Auto-discover MCP servers from known team directories
  const npcshDir = path.join(os.homedir(), '.npcsh');
  const knownTeamDirs = [
    { dir: path.join(npcshDir, 'npc_team'), name: 'npcsh' },
    { dir: path.join(npcshDir, 'incognide', 'npc_team'), name: 'incognide' }
  ];

  for (const { dir, name } of knownTeamDirs) {
    try {
      if (fs.existsSync(dir)) {
        // Look for *_mcp_server.py or mcp_server.py
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('_mcp_server.py') || file === 'mcp_server.py') {
            const serverPath = path.join(dir, file);
            addServer(serverPath, `auto:${name}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to scan ${dir} for MCP servers:`, e.message);
    }
  }

  // Also check ~/.npcsh/mcp_server.py directly
  const globalMcpServer = path.join(npcshDir, 'mcp_server.py');
  if (fs.existsSync(globalMcpServer)) {
    addServer(globalMcpServer, 'auto:global');
  }

  // Load from context files (these can override auto-discovered ones)
  try {
    const globalRes = await fetch(`${BACKEND_URL}/api/context/global`);
    const globalJson = await globalRes.json();
    (globalJson.context?.mcp_servers || []).forEach(s => addServer(s, 'global'));
  } catch (e) {
    console.warn('Failed to load global ctx for MCP servers', e.message);
  }

  if (currentPath) {
    try {
      const projRes = await fetch(`${BACKEND_URL}/api/context/project?path=${encodeURIComponent(currentPath)}`);
      const projJson = await projRes.json();
      (projJson.context?.mcp_servers || []).forEach(s => addServer(s, 'project'));
    } catch (e) {
      console.warn('Failed to load project ctx for MCP servers', e.message);
    }
  }
  return Array.from(servers.values());
}

ipcMain.handle('mcp:getServers', async (event, { currentPath } = {}) => {
  try {
    const serverList = await fetchCtxMcpServers(currentPath);
    const statuses = [];
    for (const serverInfo of serverList) {
      const { serverPath, origin } = serverInfo;
      try {
        const statusRes = await fetch(`${BACKEND_URL}/api/mcp/server/status?serverPath=${encodeURIComponent(serverPath)}${currentPath ? `&currentPath=${encodeURIComponent(currentPath)}` : ''}`);
        const statusJson = await statusRes.json();
        statuses.push({ serverPath, origin, status: statusJson.status || (statusJson.running ? 'running' : 'unknown'), details: statusJson });
      } catch (err) {
        statuses.push({ serverPath, origin, status: 'error', error: err.message });
      }
    }
    return { servers: statuses, error: null };
  } catch (err) {
    console.error('Error in mcp:getServers', err);
    return { servers: [], error: err.message };
  }
});

ipcMain.handle('mcp:startServer', async (event, { serverPath, currentPath } = {}) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/mcp/server/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverPath, currentPath })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return { result: json, error: null };
  } catch (err) {
    console.error('Error starting MCP server', err);
    return { error: err.message };
  }
});

ipcMain.handle('mcp:stopServer', async (event, { serverPath } = {}) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/mcp/server/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverPath })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return { result: json, error: null };
  } catch (err) {
    console.error('Error stopping MCP server', err);
    return { error: err.message };
  }
});

ipcMain.handle('mcp:status', async (event, { serverPath, currentPath } = {}) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/mcp/server/status?serverPath=${encodeURIComponent(serverPath || '')}${currentPath ? `&currentPath=${encodeURIComponent(currentPath)}` : ''}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return { status: json, error: null };
  } catch (err) {
    console.error('Error fetching MCP server status', err);
    return { error: err.message };
  }
});

ipcMain.handle('mcp:listTools', async (event, { serverPath, conversationId, npc, selected, currentPath } = {}) => {
  try {
    const params = new URLSearchParams();
    if (serverPath) params.append('mcpServerPath', serverPath);
    if (conversationId) params.append('conversationId', conversationId);
    if (npc) params.append('npc', npc);
    if (currentPath) params.append('currentPath', currentPath);
    if (selected && selected.length) params.append('selected', selected.join(','));
    const res = await fetch(`${BACKEND_URL}/api/mcp_tools?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return { tools: json.tools || [], error: null };
  } catch (err) {
    console.error('Error listing MCP tools', err);
    return { tools: [], error: err.message };
  }
});

// Add a desktop integration MCP server
ipcMain.handle('mcp:addIntegration', async (event, { integrationId, serverScript, envVars, name } = {}) => {
  try {
    // Destination directory for MCP servers
    const npcshDir = path.join(os.homedir(), '.npcsh');
    const mcpServersDir = path.join(npcshDir, 'mcp_servers');

    // Ensure directories exist
    await fsPromises.mkdir(mcpServersDir, { recursive: true });

    // Source path (bundled with app)
    const sourcePath = path.join(__dirname, 'mcp_servers', serverScript);
    const destPath = path.join(mcpServersDir, serverScript);

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      return { error: `MCP server script not found: ${serverScript}` };
    }

    // Copy the script
    await fsPromises.copyFile(sourcePath, destPath);
    console.log(`[MCP] Copied ${serverScript} to ${destPath}`);

    // Build server path that will be added to context
    const serverPath = destPath;

    // Read current global context
    let globalContext = {};
    const globalCtxPath = path.join(npcshDir, '.ctx');
    try {
      const ctxContent = await fsPromises.readFile(globalCtxPath, 'utf-8');
      globalContext = JSON.parse(ctxContent);
    } catch (e) {
      // File doesn't exist yet, start fresh
      globalContext = {};
    }

    // Ensure mcp_servers array exists
    if (!globalContext.mcp_servers) {
      globalContext.mcp_servers = [];
    }

    // Check if this integration already exists
    const existingIndex = globalContext.mcp_servers.findIndex(s => {
      if (typeof s === 'string') return s === serverPath;
      return s.value === serverPath || s.id === integrationId;
    });

    // Create the server entry with env vars
    const serverEntry = {
      id: integrationId,
      name: name,
      value: serverPath,
      env: envVars || {}
    };

    if (existingIndex >= 0) {
      // Update existing
      globalContext.mcp_servers[existingIndex] = serverEntry;
    } else {
      // Add new
      globalContext.mcp_servers.push(serverEntry);
    }

    // Write back the context
    await fsPromises.writeFile(globalCtxPath, JSON.stringify(globalContext, null, 2), 'utf-8');
    console.log(`[MCP] Added ${name} integration to global context`);

    // Notify npcpy backend to reload context (if endpoint exists)
    try {
      await fetch(`${BACKEND_URL}/api/context/reload`, { method: 'POST' });
    } catch (e) {
      // Ignore if reload endpoint doesn't exist
    }

    return { success: true, serverPath, error: null };
  } catch (err) {
    console.error('Error adding MCP integration', err);
    return { error: err.message };
  }
});

ipcMain.handle('kg:getNetworkStats', async (event, { generation }) => {
  const params = generation !== null ? `?generation=${generation}` : '';
 
  return await callBackendApi(`${BACKEND_URL}/api/kg/network-stats${params}`);
});

ipcMain.handle('kg:getCooccurrenceNetwork', async (event, { generation, minCooccurrence = 2 }) => {
  const params = new URLSearchParams();
  if (generation !== null) params.append('generation', generation);
  params.append('min_cooccurrence', minCooccurrence);
  return await callBackendApi(`${BACKEND_URL}/api/kg/cooccurrence?${params.toString()}`);
});

ipcMain.handle('kg:getCentralityData', async (event, { generation }) => {
  const params = generation !== null ? `?generation=${generation}` : '';
  return await callBackendApi(`${BACKEND_URL}/api/kg/centrality${params}`);
});

// --- Knowledge Graph Handlers ---
ipcMain.handle('kg:getGraphData', async (event, { generation }) => {
  const params = generation !== null ? `?generation=${generation}` : '';
  return await callBackendApi(`${BACKEND_URL}/api/kg/graph${params}`);
});

ipcMain.handle('kg:listGenerations', async () => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/generations`);
});


ipcMain.handle('kg:triggerProcess', async (event, { type }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ process_type: type }),
  });
});

ipcMain.handle('kg:rollback', async (event, { generation }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation }),
  });
});

// KG Node/Edge editing handlers
ipcMain.handle('kg:addNode', async (event, { nodeId, nodeType = 'concept', properties = {} }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: nodeId, type: nodeType, properties }),
  });
});

ipcMain.handle('kg:updateNode', async (event, { nodeId, properties }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/node/${encodeURIComponent(nodeId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
});

ipcMain.handle('kg:deleteNode', async (event, { nodeId }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/node/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
  });
});

ipcMain.handle('kg:addEdge', async (event, { sourceId, targetId, edgeType = 'related_to', weight = 1 }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/edge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: sourceId, target: targetId, type: edgeType, weight }),
  });
});

ipcMain.handle('kg:deleteEdge', async (event, { sourceId, targetId }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/edge/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
  });
});

// KG Search handlers
ipcMain.handle('kg:search', async (event, { q, generation, type, limit }) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (generation !== null && generation !== undefined) params.append('generation', generation);
  if (type) params.append('type', type);
  if (limit) params.append('limit', limit);
  return await callBackendApi(`${BACKEND_URL}/api/kg/search?${params.toString()}`);
});

ipcMain.handle('kg:getFacts', async (event, { generation, limit, offset }) => {
  const params = new URLSearchParams();
  if (generation !== null && generation !== undefined) params.append('generation', generation);
  if (limit) params.append('limit', limit);
  if (offset) params.append('offset', offset);
  return await callBackendApi(`${BACKEND_URL}/api/kg/facts?${params.toString()}`);
});

ipcMain.handle('kg:getConcepts', async (event, { generation, limit }) => {
  const params = new URLSearchParams();
  if (generation !== null && generation !== undefined) params.append('generation', generation);
  if (limit) params.append('limit', limit);
  return await callBackendApi(`${BACKEND_URL}/api/kg/concepts?${params.toString()}`);
});

ipcMain.handle('kg:search:semantic', async (event, { q, generation, limit }) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (generation !== null && generation !== undefined) params.append('generation', generation);
  if (limit) params.append('limit', limit);
  return await callBackendApi(`${BACKEND_URL}/api/kg/search/semantic?${params.toString()}`);
});

ipcMain.handle('kg:embed', async (event, { generation, batch_size }) => {
  return await callBackendApi(`${BACKEND_URL}/api/kg/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation, batch_size })
  });
});

// Memory handlers
ipcMain.handle('memory:search', async (event, { q, npc, team, directory_path, status, limit }) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (npc) params.append('npc', npc);
  if (team) params.append('team', team);
  if (directory_path) params.append('directory_path', directory_path);
  if (status) params.append('status', status);
  if (limit) params.append('limit', limit);
  return await callBackendApi(`${BACKEND_URL}/api/memory/search?${params.toString()}`);
});

ipcMain.handle('memory:pending', async (event, { npc, team, directory_path, limit }) => {
  const params = new URLSearchParams();
  if (npc) params.append('npc', npc);
  if (team) params.append('team', team);
  if (directory_path) params.append('directory_path', directory_path);
  if (limit) params.append('limit', limit);
  return await callBackendApi(`${BACKEND_URL}/api/memory/pending?${params.toString()}`);
});

ipcMain.handle('memory:scope', async (event, { npc, team, directory_path, status }) => {
  const params = new URLSearchParams();
  if (npc) params.append('npc', npc);
  if (team) params.append('team', team);
  if (directory_path) params.append('directory_path', directory_path);
  if (status) params.append('status', status);
  return await callBackendApi(`${BACKEND_URL}/api/memory/scope?${params.toString()}`);
});

ipcMain.handle('memory:approve', async (event, { approvals }) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/memory/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvals })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[Main Process] Memory approve error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('interruptStream', async (event, streamIdToInterrupt) => {
  log(`[Main Process] Received request to interrupt stream: ${streamIdToInterrupt}`);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/interrupt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ streamId: streamIdToInterrupt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend failed to acknowledge interruption: ${errorText}`);
    }

    const result = await response.json();
    log(`[Main Process] Backend response to interruption:`, result.message);
    
   
   
    if (activeStreams.has(streamIdToInterrupt)) {
        const { stream } = activeStreams.get(streamIdToInterrupt);
        if (stream && typeof stream.destroy === 'function') {
            stream.destroy();
        }
       
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[Main Process] Error sending interrupt request to backend:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('wait-for-screenshot', async (event, screenshotPath) => {
    const maxAttempts = 20;
    const delay = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await fs.access(screenshotPath);
        const stats = await fs.stat(screenshotPath);
        if (stats.size > 0) {
          return true;
        }
      } catch (err) {
       
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  });
// Clean up on app quit
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (backendProcess) {
      log('Killing backend process');
      killBackendProcess();
    }
    // Close log streams
    electronLogStream.end();
    backendLogStream.end();
  });

  // Logs directory handler
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

  ipcMain.handle('getNPCTeamGlobal', async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/npc_team_global`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch NPC team');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching NPC team:', error);
      throw error;
    }
  });

  ipcMain.handle('getNPCTeamProject', async (event, currentPath) => {
    try {
      if (!currentPath || typeof currentPath !== 'string') {
        throw new Error('Invalid currentPath provided');
      }

      const queryParams = new URLSearchParams({
        currentPath: currentPath
      }).toString();

      const url = `${BACKEND_URL}/api/npc_team_project?${queryParams}`;
      console.log('Fetching NPC team from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();
      return {
        npcs: data.npcs || [] 
      };
    } catch (error) {
      console.error('Error fetching NPC team:', error);
      return {
        npcs: [],
        error: error.message
      };
    }
  });
  ipcMain.handle('getFileStats', async (event, filePath) => {
    const fs = require('fs').promises;
    const path = require('path');
    
    let resolvedPath = filePath;
    if (filePath.startsWith('~')) {
        resolvedPath = filePath.replace('~', os.homedir());
    }
    
    const stats = await fs.stat(resolvedPath);
    return {
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.ctime
    };
});


  ipcMain.handle('loadGlobalSettings',  async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/settings/global`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }
        return data

      } catch (err) {
        console.error('Error loading global settings:', err)

      }
    }
  );


  ipcMain.handle('get_attachment_response', async (_, attachmentData, messages) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/get_attachment_response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attachments: attachmentData,
          messages: messages
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      return result;
    } catch (err) {
      console.error('Error handling attachment response:', err);
      throw err;
    }
  });

  ipcMain.handle('showPromptDialog', async (event, options) => {
    const { title, message, defaultValue } = options;
    const result = await dialog.showMessageBox({
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
  ipcMain.handle('get-jinxs-global', async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/jinxs/global`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Global jinxs data:', data);
        return data;
    } catch (err) {
        console.error('Error loading global jinxs:', err);
        return { jinxs: [], error: err.message };
    }
});
ipcMain.handle('db:addPdfHighlight', async (event, { filePath, text, position, annotation = '', color = 'yellow' }) => {
  console.log('[DB_ADD_HIGHLIGHT] Received request:', {
    filePath,
    textLength: text?.length,
    positionType: typeof position,
    position: position,
    annotation,
    color
  });

  try {
    const positionJson = JSON.stringify(position);
    console.log('[DB_ADD_HIGHLIGHT] Stringified position:', positionJson.substring(0, 100));

    const result = await dbQuery(
      'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
      [filePath, text, positionJson, annotation, color]
    );

    console.log('[DB_ADD_HIGHLIGHT] Insert result:', result);
    return { success: true, lastID: result.lastID };
  } catch (error) {
    console.error('[DB_ADD_HIGHLIGHT] Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getHighlightsForFile', async (event, { filePath }) => {
  console.log('[DB_GET_HIGHLIGHTS] Fetching for file:', filePath);
  
  try {
    await ensureTablesExist();
    const rows = await dbQuery('SELECT * FROM pdf_highlights WHERE file_path = ? ORDER BY id ASC', [filePath]);
    
    console.log('[DB_GET_HIGHLIGHTS] Found rows:', rows.length);
    
    const highlights = rows.map(r => {
      console.log('[DB_GET_HIGHLIGHTS] Raw row:', r);
      
      let position = {};
      try {
        position = JSON.parse(r.position_json);
        console.log('[DB_GET_HIGHLIGHTS] Parsed position:', position);
      } catch (e) {
        console.error('[DB_GET_HIGHLIGHTS] Error parsing position_json:', e, r.position_json);
      }
      
      return {
        ...r,
        position: position,
        annotation: r.annotation || ''
      };
    });
    
    console.log('[DB_GET_HIGHLIGHTS] Returning highlights:', highlights);
    return { highlights };
  } catch (error) {
    console.error('[DB_GET_HIGHLIGHTS] Error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('db:updatePdfHighlight', async (event, { id, annotation, color }) => {
  console.log('[DB_UPDATE_HIGHLIGHT] Updating highlight:', id);
  try {
    const updates = [];
    const params = [];

    if (annotation !== undefined) {
      updates.push('annotation = ?');
      params.push(annotation);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    params.push(id);
    await dbQuery(`UPDATE pdf_highlights SET ${updates.join(', ')} WHERE id = ?`, params);
    return { success: true };
  } catch (error) {
    console.error('[DB_UPDATE_HIGHLIGHT] Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deletePdfHighlight', async (event, { id }) => {
  console.log('[DB_DELETE_HIGHLIGHT] Deleting highlight:', id);
  try {
    await dbQuery('DELETE FROM pdf_highlights WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    console.error('[DB_DELETE_HIGHLIGHT] Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:listTables', async () => {
  try {
    const rows = await dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    return { tables: rows.map(r => r.name) };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('db:getTableSchema', async (event, { tableName }) => {
 
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return { error: 'Invalid table name provided.' };
  }
  try {
    const rows = await dbQuery(`PRAGMA table_info(${tableName});`);
    return { schema: rows.map(r => ({ name: r.name, type: r.type })) };
  } catch (error) {
    return { error: error.message };
  }
});
ipcMain.handle('open-new-window', async (event, initialPath) => {
    createWindow(initialPath); // Your existing window creation function
});

ipcMain.handle('open-in-native-explorer', async (event, folderPath) => {
    const { shell } = require('electron');
    try {
        const expandedPath = folderPath.startsWith('~')
            ? path.join(os.homedir(), folderPath.slice(1))
            : folderPath;
        await shell.openPath(expandedPath);
        return { success: true };
    } catch (error) {
        return { error: error.message };
    }
});

// =============================================================================
// Multi-Database Connection Support
// Supports: SQLite, PostgreSQL, MySQL, MSSQL, Snowflake via connection strings
// =============================================================================

// Parse connection string to determine database type and connection params
const parseConnectionString = (connString) => {
  if (!connString) {
    return { type: 'sqlite', path: path.join(os.homedir(), 'npcsh_history.db') };
  }

  const str = connString.trim();

  // Handle ~ for home directory in paths
  const expandHome = (p) => p.startsWith('~') ? p.replace('~', os.homedir()) : p;

  // SQLite: file path, sqlite:path, or sqlite://path
  if (str.match(/\.(db|sqlite|sqlite3)$/i) || str.startsWith('sqlite:') || str.startsWith('~') || str.startsWith('/') || str.startsWith('.')) {
    let dbPath = str;
    if (dbPath.startsWith('sqlite://')) {
      dbPath = dbPath.replace('sqlite://', '');
    } else if (dbPath.startsWith('sqlite:')) {
      dbPath = dbPath.replace('sqlite:', '');
    }
    dbPath = expandHome(dbPath);
    return { type: 'sqlite', path: path.resolve(dbPath) };
  }

  // PostgreSQL: postgres:// or postgresql://
  if (str.startsWith('postgres://') || str.startsWith('postgresql://')) {
    return { type: 'postgresql', connectionString: str };
  }

  // MySQL: mysql://
  if (str.startsWith('mysql://')) {
    return { type: 'mysql', connectionString: str };
  }

  // MSSQL: mssql:// or sqlserver://
  if (str.startsWith('mssql://') || str.startsWith('sqlserver://')) {
    return { type: 'mssql', connectionString: str };
  }

  // Snowflake: snowflake://
  if (str.startsWith('snowflake://')) {
    return { type: 'snowflake', connectionString: str };
  }

  // Default: assume SQLite file path
  return { type: 'sqlite', path: path.resolve(expandHome(str)) };
};

// Get database-specific SQL for listing tables
const getListTablesSQL = (dbType) => {
  switch (dbType) {
    case 'postgresql':
      return "SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'";
    case 'mysql':
      return "SHOW TABLES";
    case 'mssql':
      return "SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'";
    case 'snowflake':
      return "SHOW TABLES";
    case 'sqlite':
    default:
      return "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
  }
};

// Get database-specific SQL for table schema
const getTableSchemaSQL = (dbType, tableName) => {
  switch (dbType) {
    case 'postgresql':
      return `SELECT column_name as name, data_type as type, is_nullable,
              CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as pk
              FROM information_schema.columns c
              LEFT JOIN (
                SELECT ku.column_name FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
                WHERE tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'
              ) pk ON c.column_name = pk.column_name
              WHERE c.table_name = '${tableName}'`;
    case 'mysql':
      return `DESCRIBE ${tableName}`;
    case 'mssql':
      return `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as is_nullable
              FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
    case 'snowflake':
      return `DESCRIBE TABLE ${tableName}`;
    case 'sqlite':
    default:
      return `PRAGMA table_info(${tableName})`;
  }
};

// Try to load optional database drivers
const tryRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch (e) {
    return null;
  }
};

// Execute query on any supported database
const executeOnDatabase = async (connConfig, query, params = []) => {
  const { type } = connConfig;

  if (type === 'sqlite') {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(connConfig.path)) {
        return reject(new Error(`Database file not found: ${connConfig.path}`));
      }

      const isReadQuery = query.trim().toUpperCase().startsWith('SELECT') ||
                          query.trim().toUpperCase().startsWith('PRAGMA') ||
                          query.trim().toUpperCase().startsWith('SHOW');
      const mode = isReadQuery ? sqlite3.OPEN_READONLY : (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

      const db = new sqlite3.Database(connConfig.path, mode, (err) => {
        if (err) return reject(err);

        if (isReadQuery) {
          db.all(query, params, (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows);
          });
        } else {
          db.run(query, params, function(err) {
            db.close();
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
          });
        }
      });
    });
  }

  // PostgreSQL
  if (type === 'postgresql') {
    const pg = tryRequire('pg');
    if (!pg) {
      throw new Error('PostgreSQL driver not installed. Run: npm install pg');
    }
    const client = new pg.Client({ connectionString: connConfig.connectionString });
    await client.connect();
    try {
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      await client.end();
    }
  }

  // MySQL
  if (type === 'mysql') {
    const mysql = tryRequire('mysql2/promise');
    if (!mysql) {
      throw new Error('MySQL driver not installed. Run: npm install mysql2');
    }
    const connection = await mysql.createConnection(connConfig.connectionString);
    try {
      const [rows] = await connection.execute(query, params);
      return Array.isArray(rows) ? rows : [rows];
    } finally {
      await connection.end();
    }
  }

  // MSSQL
  if (type === 'mssql') {
    const mssql = tryRequire('mssql');
    if (!mssql) {
      throw new Error('MSSQL driver not installed. Run: npm install mssql');
    }
    await mssql.connect(connConfig.connectionString);
    try {
      const result = await mssql.query(query);
      return result.recordset;
    } finally {
      await mssql.close();
    }
  }

  // Snowflake
  if (type === 'snowflake') {
    const snowflake = tryRequire('snowflake-sdk');
    if (!snowflake) {
      throw new Error('Snowflake driver not installed. Run: npm install snowflake-sdk');
    }
    // Parse snowflake connection string: snowflake://user:pass@account/database/schema?warehouse=WH
    const url = new URL(connConfig.connectionString);
    const connection = snowflake.createConnection({
      account: url.hostname,
      username: url.username,
      password: url.password,
      database: url.pathname.split('/')[1],
      schema: url.pathname.split('/')[2],
      warehouse: url.searchParams.get('warehouse')
    });

    return new Promise((resolve, reject) => {
      connection.connect((err, conn) => {
        if (err) return reject(err);
        conn.execute({
          sqlText: query,
          complete: (err, stmt, rows) => {
            conn.destroy();
            if (err) return reject(err);
            resolve(rows);
          }
        });
      });
    });
  }

  throw new Error(`Unsupported database type: ${type}`);
};

// Test database connection and return basic info
ipcMain.handle('db:testConnection', async (event, { connectionString }) => {
  try {
    const connConfig = parseConnectionString(connectionString);
    const listSQL = getListTablesSQL(connConfig.type);

    const tables = await executeOnDatabase(connConfig, listSQL);
    const tableNames = tables.map(r => r.name || r.tablename || r.TABLE_NAME || Object.values(r)[0]);

    const result = {
      success: true,
      dbType: connConfig.type,
      tableCount: tableNames.length,
      tables: tableNames
    };

    // Add file info for SQLite
    if (connConfig.type === 'sqlite' && connConfig.path) {
      result.resolvedPath = connConfig.path;
      if (fs.existsSync(connConfig.path)) {
        const stats = fs.statSync(connConfig.path);
        result.fileSize = stats.size;
        result.lastModified = stats.mtime;
      }
    }

    return result;
  } catch (err) {
    const connConfig = parseConnectionString(connectionString);
    return {
      success: false,
      error: err.message,
      dbType: connConfig.type,
      resolvedPath: connConfig.path || null
    };
  }
});

// List tables for a database
ipcMain.handle('db:listTablesForPath', async (event, { connectionString }) => {
  try {
    const connConfig = parseConnectionString(connectionString);
    const listSQL = getListTablesSQL(connConfig.type);
    const tables = await executeOnDatabase(connConfig, listSQL);
    const tableNames = tables.map(r => r.name || r.tablename || r.TABLE_NAME || Object.values(r)[0]);
    return { tables: tableNames, dbType: connConfig.type };
  } catch (err) {
    return { error: err.message };
  }
});

// Get table schema for a database
ipcMain.handle('db:getTableSchemaForPath', async (event, { connectionString, tableName }) => {
  // Validate table name (allow dots for schema.table notation)
  if (!/^[a-zA-Z0-9_.]+$/.test(tableName)) {
    return { error: 'Invalid table name provided.' };
  }

  try {
    const connConfig = parseConnectionString(connectionString);
    const schemaSQL = getTableSchemaSQL(connConfig.type, tableName);
    const schemaRows = await executeOnDatabase(connConfig, schemaSQL);

    // Normalize schema response across database types
    const schema = schemaRows.map(r => ({
      name: r.name || r.column_name || r.COLUMN_NAME || r.Field,
      type: r.type || r.data_type || r.DATA_TYPE || r.Type,
      notnull: r.notnull || (r.is_nullable === 'NO') || (r.Null === 'NO') ? 1 : 0,
      pk: r.pk || (r.Key === 'PRI') ? 1 : 0
    }));

    // Try to get row count
    let rowCount = null;
    try {
      const countResult = await executeOnDatabase(connConfig, `SELECT COUNT(*) as count FROM ${tableName}`);
      rowCount = countResult[0]?.count || countResult[0]?.COUNT || null;
    } catch (e) {
      // Ignore count errors
    }

    return { schema, rowCount, dbType: connConfig.type };
  } catch (err) {
    return { error: err.message };
  }
});

// Execute SQL on a database
ipcMain.handle('db:executeSQLForPath', async (event, { connectionString, query, params = [] }) => {
  try {
    const connConfig = parseConnectionString(connectionString);
    const result = await executeOnDatabase(connConfig, query, params);

    // If it's an array, it's rows from a SELECT
    if (Array.isArray(result)) {
      return { rows: result, dbType: connConfig.type };
    }
    // Otherwise it's a write result
    return { ...result, dbType: connConfig.type };
  } catch (err) {
    return { error: err.message };
  }
});

// Browse for database file (SQLite only)
ipcMain.handle('db:browseForDatabase', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Select Database File',
    filters: [
      { name: 'Database Files', extensions: ['db', 'sqlite', 'sqlite3', 'mdb', 'accdb'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (filePaths && filePaths.length > 0) {
    return { path: filePaths[0] };
  }
  return { path: null };
});

// Get supported database types
ipcMain.handle('db:getSupportedTypes', async () => {
  const types = [
    { type: 'sqlite', name: 'SQLite', installed: true, example: '~/database.db or sqlite:~/database.db' }
  ];

  // Check which drivers are installed
  if (tryRequire('pg')) {
    types.push({ type: 'postgresql', name: 'PostgreSQL', installed: true, example: 'postgresql://user:pass@host:5432/database' });
  } else {
    types.push({ type: 'postgresql', name: 'PostgreSQL', installed: false, example: 'postgresql://user:pass@host:5432/database', install: 'npm install pg' });
  }

  if (tryRequire('mysql2/promise')) {
    types.push({ type: 'mysql', name: 'MySQL', installed: true, example: 'mysql://user:pass@host:3306/database' });
  } else {
    types.push({ type: 'mysql', name: 'MySQL', installed: false, example: 'mysql://user:pass@host:3306/database', install: 'npm install mysql2' });
  }

  if (tryRequire('mssql')) {
    types.push({ type: 'mssql', name: 'SQL Server', installed: true, example: 'mssql://user:pass@host/database' });
  } else {
    types.push({ type: 'mssql', name: 'SQL Server', installed: false, example: 'mssql://user:pass@host/database', install: 'npm install mssql' });
  }

  if (tryRequire('snowflake-sdk')) {
    types.push({ type: 'snowflake', name: 'Snowflake', installed: true, example: 'snowflake://user:pass@account/db/schema?warehouse=WH' });
  } else {
    types.push({ type: 'snowflake', name: 'Snowflake', installed: false, example: 'snowflake://user:pass@account/db/schema?warehouse=WH', install: 'npm install snowflake-sdk' });
  }

  return types;
});

ipcMain.handle('db:exportCSV', async (event, data) => {
    if (!data || data.length === 0) {
        return { success: false, error: 'No data to export.'};
    }

    const { filePath } = await dialog.showSaveDialog({
        title: 'Export Query Results to CSV',
        defaultPath: `query-export-${Date.now()}.csv`,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (!filePath) {
        return { success: false, message: 'Export cancelled.' };
    }

    try {
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row => {
            return Object.values(row).map(value => {
                const strValue = String(value ?? '');
               
                if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                    return `"${strValue.replace(/"/g, '""')}"`;
                }
                return strValue;
            }).join(',');
        });
        const csvContent = `${headers}\n${rows.join('\n')}`;
        fs.writeFileSync(filePath, csvContent, 'utf-8');
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-jinxs-project', async (event, currentPath) => {
  try {
      const url = `${BACKEND_URL}/api/jinxs/project?currentPath=${encodeURIComponent(currentPath)}`;
      console.log('Fetching project jinxs from URL:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Project jinxs data:', data);
      return data;
  } catch (err) {
      console.error('Error loading project jinxs:', err);
      return { jinxs: [], error: err.message };
  }
});
  ipcMain.handle('save-jinx', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/jinxs/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error('Error saving jinx:', err);
        return { error: err.message };
    }
});

  ipcMain.handle('save-npc', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/save_npc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return response.json();
    } catch (error) {
        return { error: error.message };
    }
});

// ============== Mapx (Mind Map) IPC Handlers ==============
ipcMain.handle('save-map', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/maps/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error saving map:', err);
        return { error: err.message };
    }
});

ipcMain.handle('load-map', async (event, filePath) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/maps/load?path=${encodeURIComponent(filePath)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error loading map:', err);
        return { error: err.message };
    }
});

// ============== SQL Models IPC Handlers (dbt-style npcsql) ==============
// Models are stored as .sql files in models/ directory (like dbt)
// Metadata is stored alongside in a models_meta.json file

// Helper to get models directory path
const getModelsDir = (basePath, isGlobal) => {
    if (isGlobal) {
        return path.join(os.homedir(), '.npcsh', 'npc_team', 'models');
    }
    return path.join(basePath, 'npc_team', 'models');
};

// Helper to get metadata file path
const getModelsMetaPath = (basePath, isGlobal) => {
    const modelsDir = getModelsDir(basePath, isGlobal);
    return path.join(modelsDir, 'models_meta.json');
};

// Helper to load models from directory
const loadModelsFromDir = (modelsDir) => {
    const models = [];
    if (!fs.existsSync(modelsDir)) return models;

    // Load metadata
    const metaPath = path.join(modelsDir, 'models_meta.json');
    let metadata = {};
    if (fs.existsSync(metaPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
            console.error('Error reading models metadata:', e);
        }
    }

    // Discover .sql files
    const sqlFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.sql'));
    for (const file of sqlFiles) {
        const name = file.replace('.sql', '');
        const filePath = path.join(modelsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        const meta = metadata[name] || {};

        models.push({
            id: name, // Use filename as ID
            name,
            sql,
            description: meta.description || '',
            schedule: meta.schedule || '',
            materialization: meta.materialization || 'table',
            npc: meta.npc || '',
            createdAt: meta.createdAt || new Date().toISOString(),
            updatedAt: meta.updatedAt || new Date().toISOString(),
            lastRunAt: meta.lastRunAt,
            lastRunResult: meta.lastRunResult,
            filePath
        });
    }
    return models;
};

// Helper to save model metadata
const saveModelMeta = (modelsDir, name, meta) => {
    const metaPath = path.join(modelsDir, 'models_meta.json');
    let metadata = {};
    if (fs.existsSync(metaPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {}
    }
    metadata[name] = meta;
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
};

// Get global SQL models
ipcMain.handle('getSqlModelsGlobal', async () => {
    try {
        const modelsDir = getModelsDir(null, true);
        const models = loadModelsFromDir(modelsDir);
        return { models };
    } catch (err) {
        console.error('Error loading global SQL models:', err);
        return { models: [], error: err.message };
    }
});

// Get project SQL models
ipcMain.handle('getSqlModelsProject', async (event, currentPath) => {
    try {
        if (!currentPath) return { models: [], error: 'No project path provided' };
        const modelsDir = getModelsDir(currentPath, false);
        const models = loadModelsFromDir(modelsDir);
        return { models };
    } catch (err) {
        console.error('Error loading project SQL models:', err);
        return { models: [], error: err.message };
    }
});

// Save global SQL model (as .sql file)
ipcMain.handle('saveSqlModelGlobal', async (event, modelData) => {
    try {
        const modelsDir = getModelsDir(null, true);
        if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true });
        }

        // Sanitize model name for filename
        const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

        // Write the SQL file
        fs.writeFileSync(sqlFilePath, modelData.sql);

        // Save metadata
        const meta = {
            description: modelData.description || '',
            schedule: modelData.schedule || '',
            materialization: modelData.materialization || 'table',
            npc: modelData.npc || '',
            createdAt: modelData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRunAt: modelData.lastRunAt,
            lastRunResult: modelData.lastRunResult
        };
        saveModelMeta(modelsDir, safeName, meta);

        return { success: true, model: { ...modelData, id: safeName, filePath: sqlFilePath } };
    } catch (err) {
        console.error('Error saving global SQL model:', err);
        return { success: false, error: err.message };
    }
});

// Save project SQL model (as .sql file)
ipcMain.handle('saveSqlModelProject', async (event, { path: projectPath, model: modelData }) => {
    try {
        if (!projectPath) return { success: false, error: 'No project path provided' };

        const modelsDir = getModelsDir(projectPath, false);
        if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true });
        }

        // Sanitize model name for filename
        const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

        // Write the SQL file
        fs.writeFileSync(sqlFilePath, modelData.sql);

        // Save metadata
        const meta = {
            description: modelData.description || '',
            schedule: modelData.schedule || '',
            materialization: modelData.materialization || 'table',
            npc: modelData.npc || '',
            createdAt: modelData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRunAt: modelData.lastRunAt,
            lastRunResult: modelData.lastRunResult
        };
        saveModelMeta(modelsDir, safeName, meta);

        return { success: true, model: { ...modelData, id: safeName, filePath: sqlFilePath } };
    } catch (err) {
        console.error('Error saving project SQL model:', err);
        return { success: false, error: err.message };
    }
});

// Delete global SQL model
ipcMain.handle('deleteSqlModelGlobal', async (event, modelId) => {
    try {
        const modelsDir = getModelsDir(null, true);
        const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

        // Delete the .sql file
        if (fs.existsSync(sqlFilePath)) {
            fs.unlinkSync(sqlFilePath);
        }

        // Update metadata
        const metaPath = path.join(modelsDir, 'models_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                delete metadata[modelId];
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
            } catch (e) {}
        }

        return { success: true };
    } catch (err) {
        console.error('Error deleting global SQL model:', err);
        return { success: false, error: err.message };
    }
});

// Delete project SQL model
ipcMain.handle('deleteSqlModelProject', async (event, { path: projectPath, modelId }) => {
    try {
        if (!projectPath) return { success: false, error: 'No project path provided' };

        const modelsDir = getModelsDir(projectPath, false);
        const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

        // Delete the .sql file
        if (fs.existsSync(sqlFilePath)) {
            fs.unlinkSync(sqlFilePath);
        }

        // Update metadata
        const metaPath = path.join(modelsDir, 'models_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                delete metadata[modelId];
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
            } catch (e) {}
        }

        return { success: true };
    } catch (err) {
        console.error('Error deleting project SQL model:', err);
        return { success: false, error: err.message };
    }
});

// Run SQL model (execute via npcpy backend API)
ipcMain.handle('runSqlModel', async (event, { path: projectPath, modelId, isGlobal, targetDb: userTargetDb }) => {
    try {
        const modelsDir = getModelsDir(isGlobal ? null : projectPath, isGlobal);
        const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

        if (!fs.existsSync(sqlFilePath)) {
            return { success: false, error: `Model file not found: ${sqlFilePath}` };
        }

        // Load metadata for NPC context
        const metaPath = path.join(modelsDir, 'models_meta.json');
        let meta = {};
        if (fs.existsSync(metaPath)) {
            try {
                const allMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                meta = allMeta[modelId] || {};
            } catch (e) {}
        }

        const npcDirectory = isGlobal
            ? path.join(os.homedir(), '.npcsh', 'npc_team')
            : path.join(projectPath, 'npc_team');

        // Use user-selected database or default to npcsh_history.db
        let targetDb = userTargetDb || '~/npcsh_history.db';
        // Expand ~ to home directory
        if (targetDb.startsWith('~')) {
            targetDb = path.join(os.homedir(), targetDb.slice(1));
        }

        // Call the npcpy backend API
        const response = await fetch(`${BACKEND_URL}/api/npcsql/run_model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelsDir: modelsDir,
                modelName: modelId,
                npcDirectory: npcDirectory,
                targetDb: targetDb
            })
        });

        let result;
        if (!response.ok) {
            try {
                result = await response.json();
            } catch (e) {
                const errorText = await response.text();
                result = { success: false, error: errorText || `HTTP ${response.status}` };
            }
        } else {
            result = await response.json();
        }

        // Update last run timestamp in metadata
        meta.lastRunAt = new Date().toISOString();
        meta.lastRunResult = result.success ? 'success' : 'error';
        saveModelMeta(modelsDir, modelId, meta);

        return result;
    } catch (err) {
        console.error('Error running SQL model:', err);
        return { success: false, error: err.message };
    }
});

// ============== Local Model Provider IPC Handlers ==============
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
        const homeDir = require('os').homedir();
        const fsPromises = require('fs').promises;

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
                    require('fs').accessSync(d);
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
        const stats = await require('fs').promises.stat(filePath);
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

// ============== Activity Tracking IPC Handlers ==============
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

ipcMain.handle('executeCommandStream', async (event, data) => {
 
  const currentStreamId = data.streamId || generateId(); 
  log(`[Main Process] executeCommandStream: Starting stream with ID: ${currentStreamId}`);
  
  try {
    const apiUrl = `${BACKEND_URL}/api/stream`;
    
   
    const payload = {
      streamId: currentStreamId,
      commandstr: data.commandstr,
      currentPath: data.currentPath,
      conversationId: data.conversationId,
      model: data.model,
      provider: data.provider,
      npc: data.npc,
      npcSource: data.npcSource || 'global',
      attachments: data.attachments || [],
      executionMode: data.executionMode || 'chat',
      mcpServerPath: data.executionMode === 'tool_agent' ? data.mcpServerPath : undefined,
      parentMessageId: data.parentMessageId,
      isResend: data.isRerun || false,
      jinxs: data.jinxs || [],
      tools: data.tools || [],
      // Pass frontend-generated message IDs so backend uses the same IDs
      userMessageId: data.userMessageId,
      assistantMessageId: data.assistantMessageId,
      // For sub-branches: the parent of the user message (points to an assistant message)
      userParentMessageId: data.userParentMessageId,
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    log(`[Main Process] Backend response status for streamId ${currentStreamId}: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
    }

    const stream = response.body;
    if (!stream) {
      event.sender.send('stream-error', { streamId: currentStreamId, error: 'Backend returned no stream data.' });
      return { error: 'Backend returned no stream data.', streamId: currentStreamId };
    }
    
   
    activeStreams.set(currentStreamId, { stream, eventSender: event.sender });
    
   
    (function(capturedStreamId) {
      stream.on('data', (chunk) => {
        if (event.sender.isDestroyed()) {
          stream.destroy();
          activeStreams.delete(capturedStreamId);
          return;
        }
        event.sender.send('stream-data', {
          streamId: capturedStreamId,
          chunk: chunk.toString()
        });
      });

      stream.on('end', () => {
        log(`[Main Process] Stream ${capturedStreamId} ended from backend.`);
        if (!event.sender.isDestroyed()) {
          event.sender.send('stream-complete', { streamId: capturedStreamId });
        }
        activeStreams.delete(capturedStreamId);
      });

      stream.on('error', (err) => {
        log(`[Main Process] Stream ${capturedStreamId} error:`, err.message);
        if (!event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
              streamId: capturedStreamId,
              error: err.message
            });
        }
        activeStreams.delete(capturedStreamId);
      });
    })(currentStreamId);

    return { streamId: currentStreamId };

  } catch (err) {
    log(`[Main Process] Error setting up stream ${currentStreamId}:`, err.message);
    if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('stream-error', {
          streamId: currentStreamId,
          error: `Failed to set up stream: ${err.message}`
        });
    }
    return { error: `Failed to set up stream: ${err.message}`, streamId: currentStreamId };
  }
});
ipcMain.handle('read-csv-content', async (_, filePath) => {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    return { 
      headers: jsonData[0] || [], 
      rows: jsonData.slice(1) || [],
      error: null 
    };
  } catch (err) {
    console.error('Error reading CSV/XLSX:', err);
    return { headers: [], rows: [], error: err.message };
  }
});

ipcMain.handle('read-docx-content', async (_, filePath) => {
  try {
    const mammoth = require('mammoth');
    const buffer = await fsPromises.readFile(filePath);
    // Handle empty/new docx files
    if (!buffer || buffer.length === 0) {
      return { content: '', error: null, isNew: true };
    }

    // Convert to HTML with style mapping for better preservation
    const options = {
      buffer,
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
        "p[style-name='Title'] => h1.title:fresh",
        "p[style-name='Subtitle'] => h2.subtitle:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Block Quote'] => blockquote:fresh",
        "p[style-name='List Paragraph'] => li:fresh",
      ],
      convertImage: mammoth.images.imgElement(function(image) {
        return image.read("base64").then(function(imageBuffer) {
          return {
            src: "data:" + image.contentType + ";base64," + imageBuffer
          };
        });
      })
    };

    const result = await mammoth.convertToHtml(options);

    return { content: result.value, messages: result.messages, error: null };
  } catch (err) {
    console.error('Error reading DOCX:', err);
    return { content: null, error: err.message };
  }
});
ipcMain.handle('write-file-buffer', async (_e, path, uint8) => {
  try {
    const fs = require('fs');
    fs.writeFileSync(path, Buffer.from(uint8));
    return true;
  } catch (err) {
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

// Genetic evolution population management
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

ipcMain.handle('save-generated-image', async (event, blob, folderPath, filename) => {
    try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const fullPath = path.join(folderPath, filename);
        await fsPromises.writeFile(fullPath, buffer);
        return { success: true, path: fullPath };
    } catch (error) {
        console.error('Error saving generated image:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('compile-latex', async (_event, texPath, opts) => {
  const { spawnSync } = require('child_process');
  const path = require('path');

  console.log('[LATEX] compile-latex called with:', texPath, opts);

  const engine = opts?.engine || 'pdflatex';

  // Run pdflatex from the directory containing the .tex file
  const workingDir = path.dirname(texPath);
  const texFilename = path.basename(texPath);
  const compileArgs = [
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    texFilename
  ];
  if (opts?.shellEscape) compileArgs.unshift('-shell-escape');

  console.log('[LATEX] Running first pass:', engine, compileArgs, 'in', workingDir);
  const first = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });
  console.log('[LATEX] First pass stdout:', first.stdout);
  console.log('[LATEX] First pass stderr:', first.stderr);

  if (opts?.bibtex) {
    const base = texFilename.replace(/\.tex$/, '');
    console.log('[LATEX] Running bibtex on:', base);
    const bib = spawnSync('bibtex', [base], { encoding: 'utf8', cwd: workingDir });
    console.log('[LATEX] Bibtex stdout:', bib.stdout);
    console.log('[LATEX] Bibtex stderr:', bib.stderr);
  }

  console.log('[LATEX] Running second pass:', engine, compileArgs, 'in', workingDir);
  const result = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });
  console.log('[LATEX] Second pass stdout:', result.stdout);
  console.log('[LATEX] Second pass stderr:', result.stderr);

  const pdfPath = texPath.replace(/\.tex$/, '.pdf');
  const ok = result.status === 0;

  console.log('[LATEX] DONE. Status:', ok ? 'OK' : 'ERROR', 'PDF:', pdfPath);

  return {
    ok,
    pdfPath,
    error: !ok ? result.stderr : null
  };
});

ipcMain.handle('file-exists', async (_event, filePath) => {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('zip-items', async (_event, itemPaths, customName) => {
  const archiver = require('archiver');
  const path = require('path');

  try {
    if (!itemPaths || itemPaths.length === 0) {
      return { error: 'No items to zip' };
    }

    // Determine output path - use parent of first item
    const firstItem = itemPaths[0];
    const parentDir = path.dirname(firstItem);

    // Use custom name or generate default
    let baseName = customName || (itemPaths.length === 1
      ? path.basename(firstItem, path.extname(firstItem))
      : 'archive');

    // Remove .zip if user added it
    baseName = baseName.replace(/\.zip$/i, '');

    // Find unique filename
    let zipPath = path.join(parentDir, `${baseName}.zip`);
    let counter = 1;
    while (fs.existsSync(zipPath)) {
      zipPath = path.join(parentDir, `${baseName}_${counter}.zip`);
      counter++;
    }

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`[ZIP] Created ${zipPath} (${archive.pointer()} bytes)`);
        resolve({ success: true, zipPath });
      });

      archive.on('error', (err) => {
        reject({ error: err.message });
      });

      archive.pipe(output);

      // Add each item
      for (const itemPath of itemPaths) {
        const stat = fs.statSync(itemPath);
        const name = path.basename(itemPath);

        if (stat.isDirectory()) {
          archive.directory(itemPath, name);
        } else {
          archive.file(itemPath, { name });
        }
      }

      archive.finalize();
    });
  } catch (err) {
    console.error('[ZIP] Error:', err);
    return { error: err.message };
  }
});

// Read zip file contents (list entries)
ipcMain.handle('read-zip-contents', async (_event, zipPath) => {
  const AdmZip = require('adm-zip');

  try {
    if (!fs.existsSync(zipPath)) {
      return { error: 'Zip file not found' };
    }

    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    const entries = zipEntries.map(entry => ({
      name: entry.name,
      path: entry.entryName,
      isDirectory: entry.isDirectory,
      size: entry.header.size,
      compressedSize: entry.header.compressedSize
    }));

    console.log(`[ZIP] Read ${entries.length} entries from ${zipPath}`);
    return { entries };
  } catch (err) {
    console.error('[ZIP] Error reading zip:', err);
    return { error: err.message };
  }
});

// Extract zip file contents
ipcMain.handle('extract-zip', async (_event, zipPath, targetDir, entryPath = null) => {
  const AdmZip = require('adm-zip');

  try {
    if (!fs.existsSync(zipPath)) {
      return { error: 'Zip file not found' };
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const zip = new AdmZip(zipPath);

    if (entryPath) {
      // Extract specific entry
      const entry = zip.getEntry(entryPath);
      if (!entry) {
        return { error: `Entry not found: ${entryPath}` };
      }

      if (entry.isDirectory) {
        // Extract directory and all its contents
        const entries = zip.getEntries().filter(e => e.entryName.startsWith(entryPath));
        for (const e of entries) {
          zip.extractEntryTo(e, targetDir, true, true);
        }
      } else {
        zip.extractEntryTo(entry, targetDir, true, true);
      }
      console.log(`[ZIP] Extracted ${entryPath} to ${targetDir}`);
    } else {
      // Extract all
      zip.extractAllTo(targetDir, true);
      console.log(`[ZIP] Extracted all to ${targetDir}`);
    }

    return { success: true, targetDir };
  } catch (err) {
    console.error('[ZIP] Error extracting zip:', err);
    return { error: err.message };
  }
});

ipcMain.handle('read-file-buffer', async (event, filePath) => {
  try {
    console.log(`[Main Process] Reading file buffer for: ${filePath}`);
    const buffer = await fsPromises.readFile(filePath);
    return buffer;
  } catch (error) {
    throw error;
  }
});



ipcMain.handle('getAvailableImageModels', async (event, currentPath) => {
  log('[Main Process] getAvailableImageModels called for path:', currentPath);
  if (!currentPath) {
      log('Error: getAvailableImageModels called without currentPath');
      return { models: [], error: 'Current path is required to fetch image models.' };
  }
  try {
      const url = `${BACKEND_URL}/api/image_models?currentPath=${encodeURIComponent(currentPath)}`;
      log('Fetching image models from:', url);

      const response = await fetch(url);

      if (!response.ok) {
          const errorText = await response.text();
          log(`Error fetching image models: ${response.status} ${response.statusText} - ${errorText}`);
          throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      // <--- CRITICAL FIX: Ensure data.models is an array before attempting to push
      if (!Array.isArray(data.models)) {
          log('Warning: Backend /api/image_models did not return an array for data.models. Initializing as empty array.');
          data.models = [];
      }
      
      log('Received image models:', data.models?.length);
      

      return data; // This `data` object now contains the combined list from Python
  } catch (err) {
      log('Error in getAvailableImageModels handler:', err);
      return { models: [], error: err.message || 'Failed to fetch image models from backend' };
  }
});
ipcMain.handle('generate_images', async (event, { prompt, n, model, provider, attachments, baseFilename='vixynt_gen_', currentPath='~/.npcsh/images' }) => {
  log(`[Main Process] Received request to generate ${n} image(s) with prompt: "${prompt}" using model: "${model}" (${provider})`);

  if (!prompt) {
      return { error: 'Prompt cannot be empty' };
  }
  if (!model || !provider) {
      return { error: 'Image model and provider must be selected.' };
  }

  try {
      const apiUrl = `${BACKEND_URL}/api/generate_images`;
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            n,
            model,
            provider,
            attachments,
            baseFilename, 
            currentPath
            
          })
      
        });

      if (!response.ok) {
          const errorBody = await response.json();
          const errorMessage = errorBody.error || `HTTP error! status: ${response.status}`;
          log('Backend image generation failed:', errorMessage);
          return { error: errorMessage };
      }

      const data = await response.json();
     
      if (data.error) {
          return { error: data.error };
      }
      return { images: data.images };
  } catch (error) {
      log('Error generating images in main process handler:', error);
      return { error: error.message || 'Image generation failed in main process' };
  }
});



ipcMain.handle('createTerminalSession', async (event, { id, cwd, cols, rows, shellType }) => {
  if (!pty) {
    return { success: false, error: ptyLoadError?.message || 'Terminal functionality not available (node-pty not loaded)' };
  }

  // Store the sender's webContents for multi-window support
  const senderWebContents = event.sender;

  if (ptyKillTimers.has(id)) {
    clearTimeout(ptyKillTimers.get(id));
    ptyKillTimers.delete(id);

    if (ptySessions.has(id)) {
      return { success: true };
    }
  }

  const workingDir = cwd || os.homedir();
  let shell, args;
  let actualShellType = shellType || 'system';

  // If shellType is explicitly set, use that
  if (shellType === 'npcsh') {
    shell = 'npcsh';
    args = [];
  } else if (shellType === 'guac' || shellType === 'ipython') {
    // guac is IPython-based - try guac first, fall back to ipython
    shell = 'guac';
    args = [];
    // We'll try guac, and if it fails, we'll handle it below
  } else if (shellType === 'python3' || shellType === 'python') {
    // Python REPL - resolve user's selected venv
    try {
      const config = await readPythonEnvConfig();
      const envConfig = config.workspaces[workingDir];
      const platform = process.platform;
      const isWindows = platform === 'win32';
      const pythonBin = isWindows ? 'python.exe' : 'python';

      if (envConfig) {
        switch (envConfig.type) {
          case 'venv':
            shell = path.join(envConfig.path, isWindows ? 'Scripts' : 'bin', pythonBin);
            break;
          case 'conda':
            shell = path.join(envConfig.path, isWindows ? 'python.exe' : 'bin/python');
            break;
          case 'uv':
            shell = path.join(envConfig.path, isWindows ? 'Scripts' : 'bin', pythonBin);
            break;
          case 'system':
          default:
            shell = envConfig.path || (isWindows ? 'python' : 'python3');
        }
      } else {
        shell = isWindows ? 'python' : 'python3';
      }
    } catch (e) {
      shell = process.platform === 'win32' ? 'python' : 'python3';
    }
    args = ['-i'];  // Interactive mode
    actualShellType = 'python3';
  } else if (shellType === 'system' || !shellType) {
    // Check for npcsh switch in workspace or global .ctx files for auto-detection
    let useNpcsh = false;
    const yaml = require('js-yaml');

    // Check workspace .ctx first
    const npcTeamDir = path.join(workingDir, 'npc_team');
    try {
      if (fs.existsSync(npcTeamDir)) {
        const ctxFiles = fs.readdirSync(npcTeamDir).filter(f => f.endsWith('.ctx'));
        if (ctxFiles.length > 0) {
          const ctxData = yaml.load(fs.readFileSync(path.join(npcTeamDir, ctxFiles[0]), 'utf-8')) || {};
          if (ctxData.switches?.default_shell === 'npcsh') {
            useNpcsh = true;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Fall back to global .ctx
    if (!useNpcsh) {
      const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
      try {
        if (fs.existsSync(globalCtx)) {
          const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
          if (ctxData.switches?.default_shell === 'npcsh') {
            useNpcsh = true;
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (useNpcsh) {
      shell = 'npcsh';
      args = [];
      actualShellType = 'npcsh';
    } else {
      shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
      args = os.platform() === 'win32' ? [] : ['-l'];
      actualShellType = 'system';
    }
  }

  // Create clean env without VS Code artifacts
  const cleanEnv = { ...process.env };
  delete cleanEnv.PYTHONSTARTUP;  // Remove VS Code Python extension startup
  delete cleanEnv.VSCODE_PID;
  delete cleanEnv.VSCODE_CWD;
  delete cleanEnv.VSCODE_NLS_CONFIG;

  // Set BROWSER to incognide so URLs opened from terminal (like gcloud auth login)
  // open in incognide's browser pane instead of the system browser
  // This works because incognide's second-instance handler catches URL arguments
  // In dev mode, we need to pass the app path to electron
  if (IS_DEV_MODE) {
    // In development, create a command that runs: electron /path/to/app <url>
    cleanEnv.BROWSER = `${process.execPath} ${app.getAppPath()}`;
  } else {
    // In production, the executable directly handles URL arguments
    cleanEnv.BROWSER = process.execPath;
  }

  try {
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: workingDir,
      env: cleanEnv
    });

    // Store both the ptyProcess and the webContents that created it
    ptySessions.set(id, { ptyProcess, webContents: senderWebContents, shellType: actualShellType });

    ptyProcess.onData(data => {
      // Send to the window that created this terminal session
      if (senderWebContents && !senderWebContents.isDestroyed()) {
        senderWebContents.send('terminal-data', { id, data });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      ptySessions.delete(id);
      // Send to the window that created this terminal session
      if (senderWebContents && !senderWebContents.isDestroyed()) {
        senderWebContents.send('terminal-closed', { id });
      }
    });

    return { success: true, shell: actualShellType };

  } catch (error) {
    // If guac failed, try ipython
    if (shellType === 'guac' || shellType === 'ipython') {
      try {
        const ptyProcess = pty.spawn('ipython', [], {
          name: 'xterm-256color',
          cols: cols || 80,
          rows: rows || 24,
          cwd: workingDir,
          env: cleanEnv
        });

        ptySessions.set(id, { ptyProcess, webContents: senderWebContents, shellType: 'ipython' });

        ptyProcess.onData(data => {
          if (senderWebContents && !senderWebContents.isDestroyed()) {
            senderWebContents.send('terminal-data', { id, data });
          }
        });

        ptyProcess.onExit(({ exitCode, signal }) => {
          ptySessions.delete(id);
          if (senderWebContents && !senderWebContents.isDestroyed()) {
            senderWebContents.send('terminal-closed', { id });
          }
        });

        return { success: true, shell: 'ipython' };
      } catch (ipythonError) {
        return { success: false, error: `Neither guac nor ipython available: ${error.message}` };
      }
    }
    return { success: false, error: String(error?.message || error || 'Unknown terminal error') };
  }
});

ipcMain.handle('closeTerminalSession', (event, id) => {
  if (!pty) {
    return { success: false, error: 'Terminal functionality not available' };
  }

  if (ptySessions.has(id)) {
    if (ptyKillTimers.has(id)) return { success: true };

    const timer = setTimeout(() => {
      if (ptySessions.has(id)) {
        const session = ptySessions.get(id);
        if (session?.ptyProcess) {
          session.ptyProcess.kill();
        }
      }
      ptyKillTimers.delete(id);
    }, 100);

    ptyKillTimers.set(id, timer);
  }
  return { success: true };
});

ipcMain.handle('writeToTerminal', (event, { id, data }) => {
  if (!pty) {
    return { success: false, error: 'Terminal functionality not available' };
  }

  const session = ptySessions.get(id);

  if (session?.ptyProcess) {
    session.ptyProcess.write(data);
    return { success: true };
  } else {
    return { success: false, error: 'Session not found in backend' };
  }
});

ipcMain.handle('resizeTerminal', (event, { id, cols, rows }) => {
  if (!pty) {
    return { success: false, error: 'Terminal functionality not available' };
  }

  const session = ptySessions.get(id);
  if (session?.ptyProcess) {
    try {
      session.ptyProcess.resize(cols, rows);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  } else {
    return { success: false, error: 'Session not found' };
  }
});


ipcMain.handle('executeShellCommand', async (event, { command, currentPath }) => {
    console.log(`[TERMINAL DEBUG] Executing command: "${command}"`);
    console.log(`[TERMINAL DEBUG] Current Path: "${currentPath}"`);

    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');

        exec(command, { 
            cwd: currentPath || process.env.HOME,
            shell: '/bin/bash'
        }, (error, stdout, stderr) => {
            console.log(`[TERMINAL DEBUG] Command Execution Result:`);
            console.log(`[TERMINAL DEBUG] STDOUT: "${stdout}"`);
            console.log(`[TERMINAL DEBUG] STDERR: "${stderr}"`);
            console.log(`[TERMINAL DEBUG] ERROR: ${error}`);

           
            const normalizedStdout = stdout.replace(/\n/g, '\r\n');
            const normalizedStderr = stderr.replace(/\n/g, '\r\n');

            if (error) {
                console.error(`[TERMINAL DEBUG] Execution Error:`, error);
                resolve({ 
                    error: normalizedStderr || normalizedStdout || error.message,
                    output: normalizedStdout
                });
            } else {
                resolve({ 
                    output: normalizedStdout, 
                    error: normalizedStderr 
                });
            }
        });
    });
});
ipcMain.handle('get-attachment', async (event, attachmentId) => {
  const response = await fetch(`${BACKEND_URL}/api/attachment/${attachmentId}`);
  return response.json();
});

ipcMain.handle('get-message-attachments', async (event, messageId) => {
  const response = await fetch(`${BACKEND_URL}/api/attachments/${messageId}`);
  return response.json();
});


ipcMain.handle('get-usage-stats', async () => {
  console.log('[IPC] get-usage-stats handler STARTED');
  try {
    const conversationQuery = `SELECT COUNT(DISTINCT conversation_id) as total FROM conversation_history;`;
    const messagesQuery = `SELECT COUNT(*) as total FROM conversation_history WHERE role = 'user' OR role = 'assistant';`;
    const modelsQuery = `SELECT model, COUNT(*) as count FROM conversation_history WHERE model IS NOT NULL AND model != '' GROUP BY model ORDER BY count DESC LIMIT 5;`;
    const npcsQuery = `SELECT npc, COUNT(*) as count FROM conversation_history WHERE npc IS NOT NULL AND npc != '' GROUP BY npc ORDER BY count DESC LIMIT 5;`;

    const [convResult] = await dbQuery(conversationQuery);
    const [msgResult] = await dbQuery(messagesQuery);
    const topModels = await dbQuery(modelsQuery);
    const topNPCs = await dbQuery(npcsQuery);

    console.log('[IPC] get-usage-stats returning:', {
      totalConversations: convResult?.total || 0,
      totalMessages: msgResult?.total || 0,
      topModels,
      topNPCs
    });

    return {
      stats: {
        totalConversations: convResult?.total || 0,
        totalMessages: msgResult?.total || 0,
        topModels,
        topNPCs
      },
      error: null
    };
  } catch (err) {
    console.error('[IPC] get-usage-stats ERROR:', err);
    return { stats: null, error: err.message };
  }
});
ipcMain.handle('getActivityData', async (event, { period }) => {
  try {
    let dateModifier = '-30 days';
    if (period === '7d') dateModifier = '-7 days';
    if (period === '90d') dateModifier = '-90 days';

    const query = `
      SELECT 
        strftime('%Y-%m-%d', timestamp) as date, 
        COUNT(*) as count
      FROM conversation_history
      WHERE timestamp >= strftime('%Y-%m-%d %H:%M:%S', 'now', ?)
      GROUP BY date
      ORDER BY date ASC;
    `;
    
    const rows = await dbQuery(query, [dateModifier]);
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('getHistogramData', async () => {
  try {
    const query = `
      SELECT 
        CASE
          WHEN LENGTH(content) BETWEEN 0 AND 50 THEN '0-50'
          WHEN LENGTH(content) BETWEEN 51 AND 200 THEN '51-200'
          WHEN LENGTH(content) BETWEEN 201 AND 500 THEN '201-500'
          WHEN LENGTH(content) BETWEEN 501 AND 1000 THEN '501-1000'
          ELSE '1000+'
        END as bin,
        COUNT(*) as count
      FROM conversation_history
      WHERE role = 'user' OR role = 'assistant'
      GROUP BY bin
      ORDER BY MIN(LENGTH(content));
    `;
    const rows = await dbQuery(query);
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('executeSQL', async (event, { query }) => {
  try {
    const rows = await dbQuery(query);
    return { result: rows, error: null };
  } catch (err) {
    return { result: null, error: err.message };
  }
});
ipcMain.handle('executeCommand', async (event, data) => {
    const currentStreamId = generateId();
    log(`[Main Process] executeCommand: Starting. streamId: ${currentStreamId}`);

    try {
        const apiUrl = `${BACKEND_URL}/api/execute`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commandstr: data.commandstr,
                currentPath: data.currentPath,
                conversationId: data.conversationId,
                model: data.model,
                provider: data.provider,
                npc: data.npc,
                npcSource: data.npcSource || 'global',
                attachments: data.attachments || []
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
        }

        const stream = response.body;
        if (!stream) {
            throw new Error('Backend returned no stream data.');
        }

       
        activeStreams.set(currentStreamId, { stream, eventSender: event.sender });

        stream.on('data', (chunk) => {
            if (event.sender.isDestroyed()) {
                stream.destroy();
                activeStreams.delete(currentStreamId);
                return;
            }
            event.sender.send('stream-data', {
                streamId: currentStreamId,
                chunk: chunk.toString()
            });
        });

        stream.on('end', () => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('stream-complete', { streamId: currentStreamId });
            }
            activeStreams.delete(currentStreamId);
        });

        stream.on('error', (err) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('stream-error', {
                    streamId: currentStreamId,
                    error: err.message
                });
            }
            activeStreams.delete(currentStreamId);
        });

        return { streamId: currentStreamId };

    } catch (err) {
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
                streamId: currentStreamId,
                error: err.message
            });
        }
        return { error: err.message, streamId: currentStreamId };
    }
});
ipcMain.handle('getConversations', async (_, path) => {
    try {
     
     
      try {
        await fsPromises.access(path);
        console.log('Directory exists and is accessible');
      } catch (err) {
        console.error('Directory does not exist or is not accessible:', path);
        return { conversations: [], error: 'Directory not accessible' };
      }

      const apiUrl = `${BACKEND_URL}/api/conversations?path=${encodeURIComponent(path)}`;
      console.log('Calling API with URL:', apiUrl);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.error('API returned error status:', response.status);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
     

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error('Error parsing JSON response:', err);
        return { conversations: [], error: 'Invalid JSON response' };
      }

     

     
      return {
        conversations: data.conversations || []
      };
    } catch (err) {
      console.error('Error getting conversations:', err);
      return {
        error: err.message,
        conversations: []
      };
    }
  });
  ipcMain.handle('checkServerConnection', async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/status`);
      if (!response.ok) return { error: 'Server not responding properly' };
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('getConversationsInDirectory', async (_, directoryPath) => {
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
      db.all(query, [directoryPath], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
  });
  ipcMain.handle('read-file-content', async (_, filePath) => {
    try {
      const content = await fsPromises.readFile(filePath, 'utf8');
      return { content, error: null };
    } catch (err) {
      console.error('Error reading file:', err);
      return { content: null, error: err.message };
    }
  });

  ipcMain.handle('write-file-content', async (_, filePath, content) => {
    try {
      await fsPromises.writeFile(filePath, content, 'utf8');
      return { success: true, error: null };
    } catch (err) {
      console.error('Error writing file:', err);
      return { success: false, error: err.message };
    }
  });

  // Save data to a temp file (for clipboard paste of images/large text)
  ipcMain.handle('save-temp-file', async (_, { name, data, encoding }) => {
    try {
      const os = require('os');
      const tempDir = path.join(os.tmpdir(), 'incognide-paste');
      await fsPromises.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, name);

      if (encoding === 'base64') {
        await fsPromises.writeFile(tempPath, Buffer.from(data, 'base64'));
      } else {
        await fsPromises.writeFile(tempPath, data, encoding || 'utf8');
      }

      return { success: true, path: tempPath };
    } catch (err) {
      console.error('Error saving temp file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-file', async (_, filePath) => {
    try {
      await fsPromises.unlink(filePath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error deleting file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('getConversationMessages', async (_, conversationId) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (dbErr) => {
        if (dbErr) {
          console.error('[DB] Error opening database:', dbErr);
          return reject(dbErr);
        }
  
        const query = `
        SELECT
            ch.id,
            ch.message_id,
            ch.timestamp,
            ch.role,
            ch.content,
            ch.conversation_id,
            ch.directory_path,
            ch.model,
            ch.provider,
            ch.npc,
            ch.team,
            ch.reasoning_content,
            ch.tool_calls,
            ch.tool_results,
            ch.parent_message_id,
            json_group_array(
                json_object(
                    'id', ma.id,
                    'name', ma.attachment_name,
                    'path', ma.file_path,
                    'type', ma.attachment_type,
                    'size', ma.attachment_size,
                    'timestamp', ma.upload_timestamp
                )
            ) FILTER (WHERE ma.id IS NOT NULL) AS attachments_json
        FROM
            conversation_history ch
        LEFT JOIN
            message_attachments ma ON ch.message_id = ma.message_id
        WHERE
            ch.conversation_id = ?
        GROUP BY
            ch.id
        ORDER BY
            ch.timestamp ASC, ch.id ASC;
      `;


      db.all(query, [conversationId], (err, rows) => {
        db.close();
        if (err) {
            return reject(err);
        }

        const messages = rows.map(row => {
            let attachments = [];
            if (row.attachments_json) {
                try {
                    const parsedAttachments = JSON.parse(row.attachments_json);
                    attachments = parsedAttachments.filter(att => att && att.id !== null);
                } catch (e) {
                    attachments = [];
                }
            }

            let content = row.content;
            if (typeof content === 'string' && content.startsWith('[')) {
                try {
                    content = JSON.parse(content);
                } catch (e) {

                }
            }

            // Parse tool_calls and tool_results JSON
            let toolCalls = null;
            let toolResults = null;
            if (row.tool_calls) {
                try {
                    toolCalls = JSON.parse(row.tool_calls);
                } catch (e) {}
            }
            if (row.tool_results) {
                try {
                    toolResults = JSON.parse(row.tool_results);
                } catch (e) {}
            }

            const newRow = {
                ...row,
                attachments,
                content,
                reasoningContent: row.reasoning_content,
                toolCalls,
                toolResults,
                parentMessageId: row.parent_message_id
            };
            delete newRow.attachments_json;
            delete newRow.reasoning_content;
            delete newRow.tool_calls;
            delete newRow.tool_results;
            delete newRow.parent_message_id;
            return newRow;
        });

        resolve(messages);
      });
    });
});
} );


    ipcMain.handle('getDefaultConfig', () => {

    console.log('CONFIG:', DEFAULT_CONFIG);
    return DEFAULT_CONFIG;

  });

  // Get project-level ctx settings (model/provider/npc) for a directory
  ipcMain.handle('getProjectCtx', async (_, currentPath) => {
    const yaml = require('js-yaml');
    let result = { model: null, provider: null, npc: null };

    // Read .npcshrc for env vars
    const npcshrcEnv = parseNpcshrc();

    // Check project npc_team folder first
    try {
      const npcTeamDir = path.join(currentPath, 'npc_team');
      if (fs.existsSync(npcTeamDir)) {
        const ctxFiles = fs.readdirSync(npcTeamDir).filter(f => f.endsWith('.ctx'));
        if (ctxFiles.length > 0) {
          const ctxData = yaml.load(fs.readFileSync(path.join(npcTeamDir, ctxFiles[0]), 'utf-8')) || {};
          if (ctxData.model) result.model = ctxData.model;
          if (ctxData.provider) result.provider = ctxData.provider;
          if (ctxData.npc) result.npc = ctxData.npc;
        }
      }
    } catch (e) {
      console.log('Error reading project ctx:', e.message);
    }

    // Fall back to global ctx if project doesn't have settings
    if (!result.model) {
      try {
        const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
        if (fs.existsSync(globalCtx)) {
          const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
          if (ctxData.model) result.model = ctxData.model;
          if (ctxData.provider) result.provider = ctxData.provider;
          if (ctxData.npc) result.npc = ctxData.npc;
        }
      } catch (e) {
        console.log('Error reading global ctx:', e.message);
      }
    }

    // Fall back to env variables from process.env or .npcshrc
    if (!result.model) {
      result.model = process.env.NPCSH_CHAT_MODEL || npcshrcEnv.NPCSH_CHAT_MODEL;
    }
    if (!result.provider) {
      result.provider = process.env.NPCSH_CHAT_PROVIDER || npcshrcEnv.NPCSH_CHAT_PROVIDER;
    }

    console.log('getProjectCtx result:', result);
    return result;
  });

  ipcMain.handle('getWorkingDirectory', () => {
   
    return DEFAULT_CONFIG.baseDir;
  });

  ipcMain.handle('setWorkingDirectory', async (_, dir) => {
   
    try {
      const normalizedDir = path.normalize(dir);
      const baseDir = DEFAULT_CONFIG.baseDir;
      if (!normalizedDir.startsWith(baseDir)) {
        console.log('Attempted to access directory above base:', normalizedDir);
        return baseDir;
      }
      await fsPromises.access(normalizedDir);
      return normalizedDir;
    } catch (err) {
      console.error('Error in setWorkingDirectory:', err);
      throw err;
    }
  });

  ipcMain.handle('readDirectoryImages', async (_, dirPath) => {
    try {
      const fullPath = expandHomeDir(dirPath);
      const files = await fsPromises.readdir(fullPath);
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      return files
        .filter(file => imageExtensions.some(ext => file.toLowerCase().endsWith(ext)))
        .map(file => {
          const filePath = path.join(fullPath, file);
          return `media://${filePath}`;
        });
    } catch (error) {
      console.error('Error reading directory:', error);
      return [];
    }
  });

  ipcMain.handle('text-predict', async (event, data) => {
  const currentStreamId = data.streamId || generateId();
  log(`[Main] text-predict: Starting stream ${currentStreamId}`);

  try {
    const apiUrl = `${BACKEND_URL}/api/text_predict`;

    const payload = {
      streamId: currentStreamId,
      text_content: data.text_content,        // FIXED
      cursor_position: data.cursor_position,
      currentPath: data.currentPath,
      model: data.model,
      provider: data.provider,
      context_type: data.context_type,
      file_path: data.file_path
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    log(`[Main] Backend status ${response.status} for stream ${currentStreamId}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const stream = response.body;
    if (!stream) {
      event.sender.send('stream-error', {
        streamId: currentStreamId,
        error: 'No stream body returned from backend.'
      });
      return { error: 'No stream body', streamId: currentStreamId };
    }

    activeStreams.set(currentStreamId, { stream, eventSender: event.sender });

    (function(capturedStreamId) {
      stream.on('data', (chunk) => {
        if (event.sender.isDestroyed()) {
          stream.destroy();
          activeStreams.delete(capturedStreamId);
          return;
        }
        event.sender.send('stream-data', {
          streamId: capturedStreamId,
          chunk: chunk.toString()
        });
      });

      stream.on('end', () => {
        log(`[Main] Stream ${capturedStreamId} ended.`);
        if (!event.sender.isDestroyed()) {
          event.sender.send('stream-complete', { streamId: capturedStreamId });
        }
        activeStreams.delete(capturedStreamId);
      });

      stream.on('error', err => {
        log(`[Main] Stream ${capturedStreamId} error: ${err.message}`);
        if (!event.sender.isDestroyed()) {
          event.sender.send('stream-error', {
            streamId: capturedStreamId,
            error: err.message
          });
        }
        activeStreams.delete(capturedStreamId);
      });
    })(currentStreamId);

    return { streamId: currentStreamId };

  } catch (err) {
    log(`[Main] Error setting up text prediction stream ${currentStreamId}:`, err.message);
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('stream-error', {
        streamId: currentStreamId,
        error: err.message
      });
    }
    return { error: err.message, streamId: currentStreamId };
  }
});



ipcMain.handle('readDirectoryStructure', async (_, dirPath) => {
  const allowedExtensions = ['.py', 
                             '.md', 
                             '.js', 
                             '.jsx', 
                             '.docx', 
                             '.csv', 
                             '.xlsx', 
                             '.doc', 
                             '.xlsx', 
                             '.ipynb',
                             '.exp',
                             '.tsx', 
                             '.ts', 
                             '.json', 
                             '.txt', 
                             '.tex', 
                             '.bib', 
                             '.pptx', 
                             '.yaml', 
                             '.yml', 
                             '.html', 
                             '.css', 
                             '.npc', 
                             '.jinx', 
                             '.pdf',
                             '.csv',
                             '.sh',
                             '.ctx',
                             '.cpp',
                             '.c',
                             '.r',
                             '.json',
                             '.jpg',
                             '.jpeg',
                             '.png',
                             '.gif',
                             '.webp',
                             '.bmp',
                             '.svg',
                             '.zip',
                            ];
  
  const ignorePatterns = ['node_modules', '.git', '.DS_Store'];

  // Determine max depth based on path - limit to 2 levels for home directory
  const homeDir = os.homedir();
  const isHomeDir = dirPath === homeDir || dirPath === '~' || dirPath === homeDir + '/';
  const maxDepth = isHomeDir ? 2 : Infinity;

  async function readDirRecursive(currentPath, depth = 0) {
    const result = {};
    let items;
    try {
      items = await fsPromises.readdir(currentPath, { withFileTypes: true });
    } catch (err) {
      // Can't read this directory - return empty result
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        console.log(`[Main Process] Permission denied, skipping: ${currentPath}`);
        return result;
      }
      throw err;
    }
    for (const item of items) {
      if (item.isDirectory() && ignorePatterns.includes(item.name)) {
        console.log(`[Main Process] Ignoring directory: ${path.join(currentPath, item.name)}`);
        continue;
      }

      const itemPath = path.join(currentPath, item.name);
      if (item.isDirectory()) {
        // Only recurse if we haven't hit max depth
        if (depth < maxDepth) {
          try {
            result[item.name] = {
              type: 'directory',
              path: itemPath,
              children: await readDirRecursive(itemPath, depth + 1)
            };
          } catch (err) {
            // If we can't read subdirectory, still show it but mark as inaccessible
            if (err.code === 'EACCES' || err.code === 'EPERM') {
              console.log(`[Main Process] Permission denied for subdirectory: ${itemPath}`);
              result[item.name] = {
                type: 'directory',
                path: itemPath,
                children: {},
                inaccessible: true
              };
            } else {
              throw err;
            }
          }
        } else {
          // At max depth, just show directory without children
          result[item.name] = {
            type: 'directory',
            path: itemPath,
            children: {} // Empty children - will be loaded on expand
          };
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          result[item.name] = {
            type: 'file',
            path: itemPath
          };
        }
      }
    }
    return result;
  }

  try {
    await fsPromises.access(dirPath, fs.constants.R_OK);
    return await readDirRecursive(dirPath, 0);
  } catch (err) {
    console.error(`[Main Process] Error in readDirectoryStructure for ${dirPath}:`, err);
    if (err.code === 'ENOENT') return { error: 'Directory not found' };
    if (err.code === 'EACCES') return { error: 'Permission denied' };
    return { error: err.message || 'Failed to read directory contents' };
  }
});

  ipcMain.handle('goUpDirectory', async (_, currentPath) => {
   
    if (!currentPath) {
      console.log('No current path, returning base dir');
      return DEFAULT_CONFIG.baseDir;
    }
    const parentPath = path.dirname(currentPath);
    console.log('Parent path:', parentPath);
    return parentPath;
  });

  ipcMain.handle('getHomeDir', async () => {
    return os.homedir();
  });

  ipcMain.handle('readDirectory', async (_, dir) => {

    try {
      const items = await fsPromises.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(items.map(async item => {
        const fullPath = path.join(dir, item.name);
        let size = 0;
        let modified = '';
        try {
          const stats = await fsPromises.stat(fullPath);
          size = stats.size;
          modified = stats.mtime.toISOString();
        } catch (e) {
          // Ignore stat errors
        }
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: fullPath,
          size,
          modified
        };
      }));
      return results;
    } catch (err) {
      console.error('Error in readDirectory:', err);
      throw err;
    }
  });

  ipcMain.handle('deleteConversation', async (_, conversationId) => {
    try {
      const db = new sqlite3.Database(dbPath);
      const deleteQuery = 'DELETE FROM conversation_history WHERE conversation_id = ?';
      await new Promise((resolve, reject) => {
        db.run(deleteQuery, [conversationId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      db.close();
      return { success: true };
    } catch (err) {
      console.error('Error deleting conversation:', err);
      throw err;
    }
  });

  


  ipcMain.handle('createConversation', async (_, { title, model, provider, directory }) => {
    try {
      const conversationId = Date.now().toString();
      const conversation = {
        id: conversationId,
        title: title || 'New Conversation',
        model: model || DEFAULT_CONFIG.model,
        provider: provider || DEFAULT_CONFIG.provider,
        created: new Date().toISOString(),
        messages: []
      };
      const targetDir = directory || path.join(DEFAULT_CONFIG.baseDir, 'conversations');
      const filePath = path.join(targetDir, `${conversationId}.json`);
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await fsPromises.writeFile(filePath, JSON.stringify(conversation, null, 2));
      return conversation;
    } catch (err) {
      console.error('Error creating conversation:', err);
      throw err;
    }
  });

  ipcMain.handle('openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ensureDirectory', async (_, dirPath) => {
    try {
      const fullPath = expandHomeDir(dirPath);
      await fsPromises.mkdir(fullPath, { recursive: true });
      return true;
    } catch (error) {
      console.error('Error ensuring directory:', error);
      throw error;
    }
  });

  // Execute Python code directly
  ipcMain.handle('executeCode', async (_, { code, workingDir }) => {
    try {
      const pythonPath = getBackendPythonPath();

      return new Promise((resolve) => {
        const proc = spawn(pythonPath, ['-c', code], {
          cwd: workingDir || process.cwd(),
          env: { ...process.env },
          timeout: 60000
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (exitCode) => {
          if (exitCode === 0) {
            resolve({ output: stdout, error: null });
          } else {
            resolve({ output: stdout, error: stderr || `Process exited with code ${exitCode}` });
          }
        });

        proc.on('error', (err) => {
          resolve({ output: null, error: err.message });
        });
      });
    } catch (err) {
      console.error('Error executing code:', err);
      return { output: null, error: err.message };
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
ipcMain.handle('get-global-context', async () => {
  return await callBackendApi(`${BACKEND_URL}/api/context/global`);
});

ipcMain.handle('save-global-context', async (event, contextData) => {
  return await callBackendApi(`${BACKEND_URL}/api/context/global`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: contextData }),
  });
});

// Check if ~/.npcsh exists and has a valid npc_team
ipcMain.handle('npcsh-check', async () => {
  return await callBackendApi(`${BACKEND_URL}/api/npcsh/check`);
});

// Get NPCs and jinxs available in the npcsh package
ipcMain.handle('npcsh-package-contents', async () => {
  return await callBackendApi(`${BACKEND_URL}/api/npcsh/package-contents`);
});

// Initialize ~/.npcsh with default npc_team
ipcMain.handle('npcsh-init', async () => {
  return await callBackendApi(`${BACKEND_URL}/api/npcsh/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
});
ipcMain.handle('get-last-used-in-directory', async (event, path) => {
  if (!path) return { model: null, npc: null, error: 'Path is required' };
  const url = `${BACKEND_URL}/api/last_used_in_directory?path=${encodeURIComponent(path)}`;
  return await callBackendApi(url);
});

ipcMain.handle('get-last-used-in-conversation', async (event, conversationId) => {
  if (!conversationId) return { model: null, npc: null, error: 'Conversation ID is required' };
  const url = `${BACKEND_URL}/api/last_used_in_conversation?conversationId=${encodeURIComponent(conversationId)}`;
  return await callBackendApi(url);
});
ipcMain.handle('get-project-context', async (event, path) => {
  if (!path) return { error: 'Path is required' };
  const url = `${BACKEND_URL}/api/context/project?path=${encodeURIComponent(path)}`;
  return await callBackendApi(url);
});

ipcMain.handle('save-project-context', async (event, { path, contextData }) => {
  if (!path) return { error: 'Path is required' };
  const url = `${BACKEND_URL}/api/context/project`;
  return await callBackendApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, context: contextData }),
  });
});

ipcMain.handle('init-project-team', async (event, projectPath) => {
  if (!projectPath) return { error: 'Path is required' };
  const url = `${BACKEND_URL}/api/context/project/init`;
  return await callBackendApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: projectPath }),
  });
});

ipcMain.handle('create-directory', async (_, directoryPath) => {
  try {
   
    await fsPromises.mkdir(directoryPath);
    return { success: true, error: null };
  } catch (err) {
    console.error('Error creating directory:', err);
   
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-directory', async (_, directoryPath) => {
  try {
    await fsPromises.rm(directoryPath, { recursive: true, force: true });
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting directory:', err);
    return { success: false, error: err.message };
  }
});

// Add this handler to get all file paths inside a folder for AI overview
ipcMain.handle('get-directory-contents-recursive', async (_, directoryPath) => {
    const allFiles = [];
    async function readDir(currentDir) {
        const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await readDir(fullPath);
            } else if (entry.isFile()) {
                allFiles.push(fullPath);
            }
        }
    }
    try {
        await readDir(directoryPath);
        return { files: allFiles, error: null };
    } catch (err) {
        console.error('Error getting directory contents:', err);
        return { files: [], error: err.message };
    }
});

// Disk usage analyzer handler
ipcMain.handle('analyze-disk-usage', async (_, folderPath) => {
    console.log('[DiskUsage Main] Received request for:', folderPath);

    if (!folderPath) {
        console.error('[DiskUsage Main] No folder path provided');
        return null;
    }

    // Skip virtual/system filesystems that can cause hangs or permission errors
    const SKIP_PATHS = ['/proc', '/sys', '/dev', '/run', '/snap', '/tmp/.X11-unix', '/var/run'];
    const shouldSkip = (p) => SKIP_PATHS.some(skip => p === skip || p.startsWith(skip + '/'));

    try {
        const analyzePath = async (currentPath, depth = 0, maxDepth = 3) => {
            // Skip virtual filesystems
            if (shouldSkip(currentPath)) {
                return null;
            }

            const stats = await fsPromises.stat(currentPath);
            const name = path.basename(currentPath);

            if (stats.isFile()) {
                return {
                    name,
                    path: currentPath,
                    type: 'file',
                    size: stats.size
                };
            }

            if (stats.isDirectory()) {
                let children = [];
                let totalSize = 0;
                let fileCount = 0;
                let folderCount = 0;

                try {
                    const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });

                    // Only go deeper if we haven't hit max depth
                    if (depth < maxDepth) {
                        for (const entry of entries) {
                            const childPath = path.join(currentPath, entry.name);
                            try {
                                const childResult = await analyzePath(childPath, depth + 1, maxDepth);
                                if (childResult) {
                                    children.push(childResult);
                                    totalSize += childResult.size || 0;
                                    if (childResult.type === 'file') {
                                        fileCount++;
                                    } else {
                                        folderCount++;
                                        fileCount += childResult.fileCount || 0;
                                        folderCount += childResult.folderCount || 0;
                                    }
                                }
                            } catch (childErr) {
                                // Skip inaccessible files/folders
                                console.warn(`Skipping inaccessible: ${childPath}`);
                            }
                        }
                    } else {
                        // At max depth, just count sizes without going deeper
                        for (const entry of entries) {
                            const childPath = path.join(currentPath, entry.name);
                            // Skip virtual filesystems at max depth too
                            if (shouldSkip(childPath)) continue;
                            try {
                                const childStats = await fsPromises.stat(childPath);
                                if (childStats.isFile()) {
                                    totalSize += childStats.size;
                                    fileCount++;
                                } else if (childStats.isDirectory()) {
                                    folderCount++;
                                }
                            } catch (e) {
                                // Skip inaccessible
                            }
                        }
                    }
                } catch (readErr) {
                    console.warn(`Cannot read directory: ${currentPath}`);
                }

                // Sort children by size (largest first)
                children.sort((a, b) => (b.size || 0) - (a.size || 0));

                return {
                    name,
                    path: currentPath,
                    type: 'folder',
                    size: totalSize,
                    fileCount,
                    folderCount,
                    children
                };
            }

            return null;
        };

        const result = await analyzePath(folderPath, 0, 3);
        console.log('[DiskUsage Main] Analysis complete. Result:', result ? 'has data' : 'null');
        return result;
    } catch (err) {
        console.error('[DiskUsage Main] Error analyzing disk usage:', err);
        throw err;
    }
});

ipcMain.handle('renameFile', async (_, oldPath, newPath) => {
    try {
      await fsPromises.rename(oldPath, newPath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error renaming file:', err);
      return { success: false, error: err.message };
    }
  }
);

// ============================================
// File Permission Management (chmod/chown)
// ============================================

ipcMain.handle('chmod', async (_, { path: filePath, mode, recursive, useSudo }) => {
    try {
        if (!filePath || !mode) {
            return { success: false, error: 'Path and mode are required' };
        }

        // Validate mode format (octal like 755, 0755, etc.)
        if (!/^[0-7]{3,4}$/.test(mode)) {
            return { success: false, error: 'Invalid mode format. Use octal format (e.g., 755)' };
        }

        const { execSync } = require('child_process');
        const args = recursive ? ['-R', mode, filePath] : [mode, filePath];
        const command = useSudo ? `sudo chmod ${args.join(' ')}` : `chmod ${args.join(' ')}`;

        console.log(`[CHMOD] Executing: ${command}`);
        execSync(command, { encoding: 'utf-8' });
        console.log(`[CHMOD] Successfully changed permissions for ${filePath}`);
        return { success: true, error: null };
    } catch (err) {
        console.error('[CHMOD] Error:', err);
        return { success: false, error: err.message || 'Failed to change permissions' };
    }
});

ipcMain.handle('chown', async (_, { path: filePath, owner, group, recursive, useSudo }) => {
    try {
        if (!filePath || !owner) {
            return { success: false, error: 'Path and owner are required' };
        }

        const { execSync } = require('child_process');
        const ownerGroup = group ? `${owner}:${group}` : owner;
        const args = recursive ? ['-R', ownerGroup, filePath] : [ownerGroup, filePath];
        const command = useSudo ? `sudo chown ${args.join(' ')}` : `chown ${args.join(' ')}`;

        console.log(`[CHOWN] Executing: ${command}`);
        execSync(command, { encoding: 'utf-8' });
        console.log(`[CHOWN] Successfully changed owner for ${filePath}`);
        return { success: true, error: null };
    } catch (err) {
        console.error('[CHOWN] Error:', err);
        return { success: false, error: err.message || 'Failed to change owner' };
    }
});

// ============================================
// Jupyter Kernel Management
// ============================================
const jupyterKernels = new Map(); // kernelId -> { process, connectionFile, executionCount, pythonPath }

// Helper to get Python path for workspace
const getWorkspacePythonPath = async (workspacePath) => {
    if (!workspacePath) return 'python3';

    try {
        const config = await readPythonEnvConfig();
        const wsConfig = config.workspaces[workspacePath];
        if (wsConfig?.path) {
            return wsConfig.path;
        }
    } catch {}

    // Try to find a venv in the workspace
    const isWindows = process.platform === 'win32';
    const binDir = isWindows ? 'Scripts' : 'bin';
    const pythonBin = isWindows ? 'python.exe' : 'python';

    for (const venvDir of ['.venv', 'venv', '.env', 'env']) {
        const venvPythonPath = path.join(workspacePath, venvDir, binDir, pythonBin);
        try {
            await fsPromises.access(venvPythonPath);
            return venvPythonPath;
        } catch {}
    }

    return 'python3';
};

ipcMain.handle('jupyter:listKernels', async (_, { workspacePath } = {}) => {
    try {
        const { spawn } = require('child_process');
        const pythonPath = await getWorkspacePythonPath(workspacePath);

        return new Promise((resolve) => {
            // Use python -m jupyter kernelspec list instead of bare jupyter command
            const proc = spawn(pythonPath, ['-m', 'jupyter', 'kernelspec', 'list', '--json'], {
                env: { ...process.env },
                cwd: workspacePath || process.cwd()
            });

            let stdout = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0 && stdout) {
                    try {
                        const result = JSON.parse(stdout);
                        const kernels = Object.entries(result.kernelspecs || {}).map(([name, spec]) => ({
                            name,
                            displayName: spec.spec?.display_name || name,
                            language: spec.spec?.language || 'unknown'
                        }));
                        resolve({ success: true, kernels, pythonPath });
                    } catch (e) {
                        resolve({ success: true, kernels: [{ name: 'python3', displayName: 'Python 3', language: 'python' }], pythonPath });
                    }
                } else {
                    resolve({ success: true, kernels: [{ name: 'python3', displayName: 'Python 3', language: 'python' }], pythonPath });
                }
            });

            proc.on('error', () => {
                resolve({ success: true, kernels: [{ name: 'python3', displayName: 'Python 3', language: 'python' }], pythonPath });
            });
        });
    } catch (err) {
        return { success: false, error: err.message, kernels: [] };
    }
});

ipcMain.handle('jupyter:startKernel', async (_, { kernelId, kernelName = 'python3', workspacePath }) => {
    try {
        const { spawn } = require('child_process');
        const pythonPath = await getWorkspacePythonPath(workspacePath);

        const connectionFile = path.join(os.tmpdir(), `kernel-${kernelId}.json`);

        log(`[Jupyter] Starting kernel with Python: ${pythonPath}`);

        const proc = spawn(pythonPath, ['-m', 'jupyter', 'kernel', '--kernel=' + kernelName, '--KernelManager.connection_file=' + connectionFile], {
            env: { ...process.env },
            cwd: workspacePath || process.cwd(),
            detached: false
        });

        proc.stderr.on('data', (data) => {
            log('[Jupyter Kernel]', data.toString());
        });

        proc.stdout.on('data', (data) => {
            log('[Jupyter Kernel stdout]', data.toString());
        });

        proc.on('error', (err) => {
            console.error('[Jupyter Kernel] Process error:', err);
            jupyterKernels.delete(kernelId);
        });

        proc.on('exit', (code) => {
            log(`[Jupyter Kernel] Exited with code ${code}`);
            jupyterKernels.delete(kernelId);
            mainWindow?.webContents.send('jupyter:kernelStopped', { kernelId });
        });

        jupyterKernels.set(kernelId, {
            process: proc,
            connectionFile,
            kernelName,
            executionCount: 0,
            pythonPath,
            workspacePath
        });

        // Wait for kernel to start
        await new Promise((resolve) => setTimeout(resolve, 3000));

        try {
            await fsPromises.access(connectionFile);
            return { success: true, kernelId, connectionFile, pythonPath };
        } catch {
            return { success: true, kernelId, connectionFile, pythonPath, warning: 'Connection file may not be ready yet' };
        }
    } catch (err) {
        console.error('[Jupyter] Failed to start kernel:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('jupyter:executeCode', async (_, { kernelId, code }) => {
    try {
        const kernel = jupyterKernels.get(kernelId);
        if (!kernel) {
            return { success: false, error: 'Kernel not found. Start a kernel first.', outputs: [] };
        }

        kernel.executionCount++;
        const execCount = kernel.executionCount;

        const { spawn } = require('child_process');
        const pythonPath = kernel.pythonPath || 'python3';

        const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)
    client.execute(sys.argv[2])
    outputs = []
    while True:
        try:
            msg = client.get_iopub_msg(timeout=30)
            t, c = msg['msg_type'], msg['content']
            if t == 'stream': outputs.append({'output_type': 'stream', 'name': c.get('name','stdout'), 'text': [c.get('text','')]})
            elif t == 'execute_result': outputs.append({'output_type': 'execute_result', 'data': c.get('data',{}), 'execution_count': c.get('execution_count')})
            elif t == 'display_data': outputs.append({'output_type': 'display_data', 'data': c.get('data',{})})
            elif t == 'error': outputs.append({'output_type': 'error', 'ename': c.get('ename','Error'), 'evalue': c.get('evalue',''), 'traceback': c.get('traceback',[])})
            elif t == 'status' and c.get('execution_state') == 'idle': break
        except: break
    client.stop_channels()
    print(json.dumps({'success': True, 'outputs': outputs}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile, code], {
                env: { ...process.env },
                cwd: kernel.workspacePath || process.cwd(),
                timeout: 60000
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', () => {
                if (stdout) {
                    try {
                        const lines = stdout.trim().split('\n');
                        const result = JSON.parse(lines[lines.length - 1]);
                        resolve({ success: result.success, outputs: result.outputs || [], executionCount: execCount, error: result.error });
                    } catch (e) {
                        resolve({ success: false, error: 'Parse error: ' + e.message, executionCount: execCount, outputs: [{ output_type: 'stream', name: 'stdout', text: [stdout] }] });
                    }
                } else {
                    resolve({ success: false, error: stderr || 'No output from kernel', executionCount: execCount, outputs: [] });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message, executionCount: execCount, outputs: [] });
            });
        });
    } catch (err) {
        return { success: false, error: err.message, outputs: [] };
    }
});

ipcMain.handle('jupyter:interruptKernel', async (_, { kernelId }) => {
    try {
        const kernel = jupyterKernels.get(kernelId);
        if (!kernel) return { success: false, error: 'Kernel not found' };
        kernel.process.kill('SIGINT');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Get variables from kernel namespace for Variables pane
ipcMain.handle('jupyter:getVariables', async (_, { kernelId }) => {
    try {
        const kernel = jupyterKernels.get(kernelId);
        if (!kernel) {
            return { success: false, error: 'Kernel not found', variables: [] };
        }

        const { spawn } = require('child_process');
        const pythonPath = kernel.pythonPath || 'python3';

        const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)

    # Introspection code to run in kernel
    introspect_code = '''
import json
def _incognide_get_variables():
    ip = get_ipython()
    ns = ip.user_ns
    variables = []
    skip_types = (type, type(json), type(lambda: None))
    # Skip IPython internals, system vars, and common imports
    skip_names = {
        'In', 'Out', 'get_ipython', 'exit', 'quit',
        '_', '__', '___', '_i', '_ii', '_iii', '_oh', '_dh', '_sh',
        'original_ps1', 'is_wsl', 'sys', 'os', 'np', 'pd', 'plt',
        'numpy', 'pandas', 'matplotlib', 'scipy', 'sklearn',
        'json', 're', 'math', 'random', 'datetime', 'time',
        'collections', 'itertools', 'functools', 'pathlib',
        'warnings', 'logging', 'typing', 'copy', 'io', 'csv',
        'pickle', 'gzip', 'zipfile', 'tempfile', 'shutil',
        'subprocess', 'threading', 'multiprocessing',
        'requests', 'urllib', 'http', 'socket',
        'IPython', 'ipykernel', 'traitlets',
        'display', 'HTML', 'Image', 'Markdown',
    }
    # Also skip anything that looks like an internal/config var
    skip_prefixes = ('_', 'original_', 'is_', 'has_', 'PYTHON', 'LC_', 'XDG_')

    for name, val in ns.items():
        if name.startswith(skip_prefixes) or name in skip_names:
            continue
        if isinstance(val, skip_types):
            continue
        # Skip modules
        if type(val).__name__ == 'module':
            continue

        var_info = {'name': name, 'type': type(val).__name__}

        # Get size/shape info
        try:
            if hasattr(val, 'shape'):
                var_info['shape'] = str(val.shape)
                if hasattr(val, 'dtype'):
                    var_info['dtype'] = str(val.dtype)
            elif hasattr(val, '__len__'):
                var_info['length'] = int(len(val))
        except:
            pass

        # DataFrame specific info
        try:
            if type(val).__name__ == 'DataFrame':
                var_info['columns'] = list(val.columns)[:20]
                var_info['dtypes'] = {str(k): str(v) for k, v in val.dtypes.items()}
                var_info['memory'] = int(val.memory_usage(deep=True).sum())
                var_info['is_dataframe'] = True
        except:
            pass

        # Series info
        try:
            if type(val).__name__ == 'Series':
                var_info['dtype'] = str(val.dtype)
                var_info['is_series'] = True
        except:
            pass

        # Get short repr
        try:
            r = repr(val)
            var_info['repr'] = r[:100] + '...' if len(r) > 100 else r
        except:
            var_info['repr'] = '<unable to repr>'

        variables.append(var_info)

    return variables

print("__VARS__" + json.dumps(_incognide_get_variables()))
del _incognide_get_variables
'''

    client.execute(introspect_code)
    result_json = None
    all_msgs = []
    while True:
        try:
            msg = client.get_iopub_msg(timeout=10)
            t, c = msg['msg_type'], msg['content']
            all_msgs.append({'type': t, 'content': str(c)[:200]})
            if t == 'stream' and '__VARS__' in c.get('text', ''):
                text = c.get('text', '')
                idx = text.find('__VARS__')
                result_json = text[idx + 8:].strip()
                break
            elif t == 'error':
                # Capture error from introspection
                import sys
                sys.stderr.write(f"Introspection error: {c.get('ename')}: {c.get('evalue')}\\n")
            elif t == 'status' and c.get('execution_state') == 'idle':
                break
        except Exception as loop_err:
            import sys
            sys.stderr.write(f"Loop error: {loop_err}\\n")
            break

    client.stop_channels()

    if result_json:
        variables = json.loads(result_json)
        print(json.dumps({'success': True, 'variables': variables}))
    else:
        # Debug: include the messages we received
        print(json.dumps({'success': True, 'variables': [], 'debug_msgs': all_msgs[:10]}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e), 'variables': []}))
`;

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile], {
                env: { ...process.env },
                cwd: kernel.workspacePath || process.cwd(),
                timeout: 15000
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                console.log('[getVariables] Process closed with code:', code);
                console.log('[getVariables] stdout:', stdout.slice(0, 500));
                console.log('[getVariables] stderr:', stderr.slice(0, 500));
                if (stdout) {
                    try {
                        const lines = stdout.trim().split('\n');
                        const result = JSON.parse(lines[lines.length - 1]);
                        resolve({
                            success: result.success,
                            variables: result.variables || [],
                            error: result.error,
                            debug_msgs: result.debug_msgs,
                            stderr: stderr || undefined
                        });
                    } catch (e) {
                        resolve({ success: false, error: 'Parse error: ' + e.message + ' stdout: ' + stdout.slice(0, 500), variables: [], stderr });
                    }
                } else {
                    resolve({ success: false, error: 'No output from python process', variables: [], stderr });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message, variables: [], stderr });
            });
        });
    } catch (err) {
        return { success: false, error: err.message, variables: [] };
    }
});

// Get dataframe data for Data Explorer
ipcMain.handle('jupyter:getDataFrame', async (_, { kernelId, varName, offset = 0, limit = 100 }) => {
    try {
        const kernel = jupyterKernels.get(kernelId);
        if (!kernel) {
            return { success: false, error: 'Kernel not found' };
        }

        const { spawn } = require('child_process');
        const pythonPath = kernel.pythonPath || 'python3';

        const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)

    var_name = sys.argv[2]
    offset = int(sys.argv[3])
    limit = int(sys.argv[4])

    fetch_code = f'''
import json
import pandas as pd
import numpy as np

def _incognide_get_df_data():
    df = get_ipython().user_ns["{var_name}"]
    total_rows = len(df)
    total_cols = len(df.columns)

    # Get slice of data
    df_slice = df.iloc[{offset}:{offset}+{limit}]

    # Convert to records, handling various types
    def safe_val(v):
        if pd.isna(v):
            return None
        if isinstance(v, (np.integer, np.floating)):
            return float(v) if np.isfinite(v) else None
        if isinstance(v, np.ndarray):
            return v.tolist()
        return str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v

    rows = []
    for idx, row in df_slice.iterrows():
        rows.append({{"__index__": safe_val(idx), **{{col: safe_val(row[col]) for col in df.columns}}}})

    # Column info with stats
    columns = []
    for col in df.columns:
        col_info = {{"name": str(col), "dtype": str(df[col].dtype)}}
        try:
            col_info["null_count"] = int(df[col].isna().sum())
            col_info["unique_count"] = int(df[col].nunique())
            if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
                col_info["min"] = safe_val(df[col].min())
                col_info["max"] = safe_val(df[col].max())
                col_info["mean"] = safe_val(df[col].mean())
                col_info["std"] = safe_val(df[col].std())
        except:
            pass
        columns.append(col_info)

    return {{"rows": rows, "columns": columns, "total_rows": total_rows, "total_cols": total_cols, "offset": {offset}}}

print("__DFDATA__" + json.dumps(_incognide_get_df_data()))
del _incognide_get_df_data
'''

    client.execute(fetch_code)
    result_json = None
    while True:
        try:
            msg = client.get_iopub_msg(timeout=15)
            t, c = msg['msg_type'], msg['content']
            if t == 'stream' and '__DFDATA__' in c.get('text', ''):
                text = c.get('text', '')
                idx = text.find('__DFDATA__')
                result_json = text[idx + 10:].strip()
                break
            elif t == 'error':
                print(json.dumps({'success': False, 'error': c.get('evalue', 'Unknown error')}))
                sys.exit(0)
            elif t == 'status' and c.get('execution_state') == 'idle':
                break
        except:
            break

    client.stop_channels()

    if result_json:
        data = json.loads(result_json)
        print(json.dumps({'success': True, **data}))
    else:
        print(json.dumps({'success': False, 'error': 'No data returned'}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile, varName, String(offset), String(limit)], {
                env: { ...process.env },
                cwd: kernel.workspacePath || process.cwd(),
                timeout: 30000
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                console.log('[getDataFrame] Process closed with code:', code);
                console.log('[getDataFrame] stdout:', stdout.slice(0, 500));
                console.log('[getDataFrame] stderr:', stderr.slice(0, 500));
                if (stdout) {
                    try {
                        const lines = stdout.trim().split('\n');
                        const result = JSON.parse(lines[lines.length - 1]);
                        resolve(result);
                    } catch (e) {
                        resolve({ success: false, error: 'Parse error: ' + e.message + ' stdout: ' + stdout.slice(0, 300), stderr });
                    }
                } else {
                    resolve({ success: false, error: 'No output', stderr });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message, stderr });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('jupyter:stopKernel', async (_, { kernelId }) => {
    try {
        const kernel = jupyterKernels.get(kernelId);
        if (!kernel) return { success: true };
        kernel.process.kill('SIGTERM');
        try { await fsPromises.unlink(kernel.connectionFile); } catch {}
        jupyterKernels.delete(kernelId);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('jupyter:getRunningKernels', async () => {
    const running = [];
    for (const [kernelId, kernel] of jupyterKernels) {
        running.push({ kernelId, kernelName: kernel.kernelName, executionCount: kernel.executionCount, pythonPath: kernel.pythonPath });
    }
    return { success: true, kernels: running };
});

// Check if Jupyter is installed in the workspace Python environment
ipcMain.handle('jupyter:checkInstalled', async (_, { workspacePath } = {}) => {
    try {
        const { spawn } = require('child_process');
        const pythonPath = await getWorkspacePythonPath(workspacePath);

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-c', 'import jupyter_client; import ipykernel; print("ok")'], {
                env: { ...process.env },
                cwd: workspacePath || process.cwd()
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0 && stdout.includes('ok')) {
                    resolve({ installed: true, pythonPath });
                } else {
                    resolve({ installed: false, pythonPath, error: stderr || 'Jupyter not found' });
                }
            });

            proc.on('error', (err) => {
                resolve({ installed: false, pythonPath, error: err.message });
            });
        });
    } catch (err) {
        return { installed: false, error: err.message };
    }
});

// Install Jupyter in the workspace Python environment
ipcMain.handle('jupyter:install', async (_, { workspacePath } = {}) => {
    try {
        const { spawn } = require('child_process');
        const pythonPath = await getWorkspacePythonPath(workspacePath);

        log(`[Jupyter] Installing jupyter in: ${pythonPath}`);

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-m', 'pip', 'install', 'jupyter', 'ipykernel', 'jupyter_client'], {
                env: { ...process.env },
                cwd: workspacePath || process.cwd()
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                const msg = data.toString();
                stdout += msg;
                mainWindow?.webContents.send('jupyter:installProgress', { message: msg });
            });
            proc.stderr.on('data', (data) => {
                const msg = data.toString();
                stderr += msg;
                mainWindow?.webContents.send('jupyter:installProgress', { message: msg });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, pythonPath });
                } else {
                    resolve({ success: false, error: stderr || 'Installation failed', pythonPath });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message, pythonPath });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Register the ipykernel for this Python environment
ipcMain.handle('jupyter:registerKernel', async (_, { workspacePath, kernelName = 'python3', displayName = 'Python 3' } = {}) => {
    try {
        const { spawn } = require('child_process');
        const pythonPath = await getWorkspacePythonPath(workspacePath);

        return new Promise((resolve) => {
            const proc = spawn(pythonPath, ['-m', 'ipykernel', 'install', '--user', '--name', kernelName, '--display-name', displayName], {
                env: { ...process.env },
                cwd: workspacePath || process.cwd()
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, pythonPath });
                } else {
                    resolve({ success: false, error: stderr || 'Registration failed', pythonPath });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message, pythonPath });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Version update checker
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/npcww/npc-core/main/incognide/package.json';

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
