import { vi } from 'vitest';

export const mockIpcMain = () => {
  const handlers = new Map<string, any>();
  const listeners = new Map<string, any[]>();

  const ipcMain = {
    handle: vi.fn((channel: string, handler: any) => {
      if (handlers.has(channel)) {
        throw new Error(`Duplicate ipcMain.handle registration for channel: ${channel}`);
      }
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, listener: any) => {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel)!.push(listener);
    }),
    once: vi.fn((channel: string, listener: any) => {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel)!.push(listener);
    }),
    removeListener: vi.fn((channel: string, listener: any) => {
      const list = listeners.get(channel) || [];
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    getHandler: (channel: string) => handlers.get(channel),
    getListeners: (channel: string) => listeners.get(channel) || [],
    emit: (channel: string, ...args: any[]) => {
      listeners.get(channel)?.forEach((l: any) => l(...args));
    },
    handlers,
    listeners,
  };

  return ipcMain;
};

export const mockWebContents = (overrides: Record<string, any> = {}) => ({
  id: 1,
  send: vi.fn(),
  invoke: vi.fn(),
  executeJavaScript: vi.fn().mockResolvedValue(''),
  session: overrides.session || mockSession(),
  getURL: vi.fn(() => 'http://localhost/'),
  getTitle: vi.fn(() => 'Test'),
  isDestroyed: vi.fn(() => false),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
  setBounds: vi.fn(),
  ...overrides,
});

export const mockBrowserWindow = (overrides: Record<string, any> = {}) => {
  const webContents = overrides.webContents || mockWebContents();
  const win = {
    id: 1,
    webContents,
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    close: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    setBounds: vi.fn(),
    setContentBounds: vi.fn(),
    setSize: vi.fn(),
    ...overrides,
  };
  return win;
};

export const mockDownloadItem = (overrides: Record<string, any> = {}) => ({
  getURL: vi.fn(() => overrides.url || 'https://example.com/file.zip'),
  getFilename: vi.fn(() => overrides.filename || 'file.zip'),
  getMimeType: vi.fn(() => overrides.mimeType || 'application/zip'),
  getTotalBytes: vi.fn(() => overrides.totalBytes || 1024),
  getReceivedBytes: vi.fn(() => overrides.receivedBytes || 0),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  setSavePath: vi.fn(),
  getSavePath: vi.fn(() => overrides.savePath || ''),
  on: vi.fn(),
  once: vi.fn(),
  ...overrides,
});

export const mockSession = (overrides: Record<string, any> = {}) => ({
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  cookies: {
    get: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  webRequest: {
    onBeforeSendHeaders: vi.fn(),
    onHeadersReceived: vi.fn(),
  },
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setDisplayMediaRequestHandler: vi.fn(),
  loadExtension: vi.fn().mockResolvedValue({}),
  removeExtension: vi.fn().mockResolvedValue(undefined),
  clearStorageData: vi.fn().mockResolvedValue(undefined),
  protocol: {
    registerFileProtocol: vi.fn(),
    handle: vi.fn(),
    interceptFileProtocol: vi.fn(),
  },
  downloadURL: vi.fn(),
  ...overrides,
});

export const mockApp = () => ({
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  whenReady: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn(),
  isReady: vi.fn(() => true),
  getPath: vi.fn((name: string) => `/mock/${name}`),
  setPath: vi.fn(),
  setAsDefaultProtocolClient: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
});

export const mockDialog = () => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/mock/saved.file' }),
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
});

export const mockShell = () => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  showItemInFolder: vi.fn(),
});
