/**
 * electron-shim.js — Provides stub implementations of Electron APIs
 * so that IPC modules (which import from 'electron') can load in a
 * pure Node.js environment (the web server).
 *
 * This module is registered via Module._resolveFilename override in
 * web-server.js so that require('electron') returns this shim.
 */

const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// dialog — file/folder picker stubs
// ---------------------------------------------------------------------------

const dialog = {
  async showOpenDialog(options) {
    return { canceled: true, filePaths: [] };
  },
  async showSaveDialog(options) {
    return { canceled: true, filePath: undefined };
  },
  async showMessageBox(options) {
    return { response: 0 };
  },
  showErrorBox(title, content) {
    console.error(`[dialog.showErrorBox] ${title}: ${content}`);
  },
};

// ---------------------------------------------------------------------------
// shell — open external URLs / paths
// ---------------------------------------------------------------------------

const shell = {
  async openPath(fullPath) {
    console.log(`[shell.openPath] ${fullPath} — not available in web mode`);
    return '';
  },
  async openExternal(url) {
    console.log(`[shell.openExternal] ${url} — not available in web mode`);
  },
  showItemInFolder(fullPath) {
    console.log(`[shell.showItemInFolder] ${fullPath} — not available in web mode`);
  },
};

// ---------------------------------------------------------------------------
// BrowserView — stubbed (no embedded browser in web mode)
// ---------------------------------------------------------------------------

class BrowserView {
  constructor(options) {
    this.webContents = {
      loadURL: (url) => console.log(`[BrowserView.loadURL] ${url}`),
      on: () => {},
      once: () => {},
      removeListener: () => {},
      send: () => {},
      executeJavaScript: async () => '',
      getURL: () => '',
      goBack: () => {},
      goForward: () => {},
      reload: () => {},
      reloadIgnoringCache: () => {},
      stop: () => {},
      canGoBack: () => false,
      canGoForward: () => false,
      isLoading: () => false,
      getTitle: () => '',
      session: {
        webRequest: { onBeforeSendHeaders: () => {} },
        on: () => {},
        cookies: {
          get: async () => [],
          set: async () => {},
          remove: async () => {},
          flushStore: async () => {},
        },
        loadExtension: async () => ({}),
        removeExtension: () => {},
        getAllExtensions: () => [],
      },
      isDestroyed: () => false,
      setWindowOpenHandler: () => {},
    };
    this.setBounds = () => {};
    this.setAutoResize = () => {};
    this.destroy = () => {};
  }
}

// ---------------------------------------------------------------------------
// session — web session stubs
// ---------------------------------------------------------------------------

const defaultSession = {
  webRequest: { onBeforeSendHeaders: () => {} },
  on: () => {},
  cookies: {
    get: async () => [],
    set: async () => {},
    remove: async () => {},
    flushStore: async () => {},
  },
  loadExtension: async () => ({}),
  removeExtension: () => {},
  getAllExtensions: () => [],
};

const session = {
  defaultSession,
  fromPartition: (partition) => ({
    ...defaultSession,
    partition,
  }),
};

// ---------------------------------------------------------------------------
// safeStorage — encryption stubs (passwords won't be encrypted in web mode)
// ---------------------------------------------------------------------------

const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (plainText) => Buffer.from(plainText),
  decryptString: (encrypted) => encrypted.toString(),
};

// ---------------------------------------------------------------------------
// screen — display info stubs
// ---------------------------------------------------------------------------

const screen = {
  getPrimaryDisplay: () => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  }),
  getAllDisplays: () => [
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
    },
  ],
};

// ---------------------------------------------------------------------------
// nativeImage — stub
// ---------------------------------------------------------------------------

const nativeImage = {
  createFromPath: () => ({
    toPNG: () => Buffer.alloc(0),
    toJPEG: () => Buffer.alloc(0),
    toDataURL: () => '',
    getSize: () => ({ width: 0, height: 0 }),
    isEmpty: () => true,
  }),
  createFromBuffer: () => ({
    toPNG: () => Buffer.alloc(0),
    toJPEG: () => Buffer.alloc(0),
    toDataURL: () => '',
    getSize: () => ({ width: 0, height: 0 }),
    isEmpty: () => true,
  }),
  createEmpty: () => ({
    toPNG: () => Buffer.alloc(0),
    toDataURL: () => '',
    isEmpty: () => true,
  }),
};

// ---------------------------------------------------------------------------
// app — application lifecycle stubs
// ---------------------------------------------------------------------------

const app = {
  getPath(name) {
    const NPCSH_BASE = process.env.NPCSH_BASE || path.join(os.homedir(), '.npcsh');
    if (name === 'userData') return path.join(NPCSH_BASE, 'incognide');
    if (name === 'home') return os.homedir();
    if (name === 'temp') return os.tmpdir();
    if (name === 'appData') return NPCSH_BASE;
    return NPCSH_BASE;
  },
  getVersion() {
    try { return require('../package.json').version; } catch { return '0.0.0'; }
  },
  getName() { return 'incognide'; },
  setPath() {},
  quit() { process.exit(0); },
  isReady() { return true; },
  on() {},
  once() {},
  whenReady() { return Promise.resolve(); },
  requestSingleInstanceLock() { return true; },
  setAppUserModelId() {},
  setName() {},
  name: 'incognide',
};

// ---------------------------------------------------------------------------
// ipcMain — this is overridden by web-server.js, but provide a default
// ---------------------------------------------------------------------------

const ipcMain = {
  handle() {},
  on() {},
  removeHandler() {},
};

// ---------------------------------------------------------------------------
// Stubs for less commonly used Electron modules
// ---------------------------------------------------------------------------

const BrowserWindow = class {
  constructor() {
    this.webContents = {
      send: () => {},
      on: () => {},
      once: () => {},
      isDestroyed: () => false,
    };
  }
  static getAllWindows() { return []; }
  static getFocusedWindow() { return null; }
  loadURL() {}
  show() {}
  hide() {}
  close() {}
  destroy() {}
  getBounds() { return { x: 0, y: 0, width: 1920, height: 1080 }; }
  setBounds() {}
  isDestroyed() { return false; }
};

const globalShortcut = {
  register: () => true,
  unregister: () => {},
  unregisterAll: () => {},
  isRegistered: () => false,
};

const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => {},
  getApplicationMenu: () => null,
};

const protocol = {
  registerFileProtocol: () => {},
  registerHttpProtocol: () => {},
  interceptFileProtocol: () => {},
  handle: () => {},
};

const desktopCapturer = {
  getSources: async () => [],
};

const contextBridge = {
  exposeInMainWorld: () => {},
};

const ipcRenderer = {
  invoke: async () => null,
  send: () => {},
  on: () => {},
  once: () => {},
  removeListener: () => {},
};

// ---------------------------------------------------------------------------
// Export everything Electron normally exports
// ---------------------------------------------------------------------------

module.exports = {
  app,
  BrowserWindow,
  BrowserView,
  dialog,
  shell,
  session,
  safeStorage,
  screen,
  nativeImage,
  ipcMain,
  ipcRenderer,
  globalShortcut,
  Menu,
  protocol,
  desktopCapturer,
  contextBridge,
};
