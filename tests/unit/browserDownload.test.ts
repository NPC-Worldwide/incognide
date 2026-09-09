import { describe, it, expect, vi } from 'vitest';
import { createWillDownloadHandler } from '../../src/ipc/browser.js';

const fakeWindow = {
  isDestroyed: () => false,
  webContents: {
    sent: [] as any[],
    send: (channel: string, payload: any) => { fakeWindow.webContents.sent.push({ channel, payload }); },
  },
};

function createFakeItem(url: string, filename: string, totalBytes: number) {
  const listeners: Record<string, Function[]> = {};
  let savePath = '';
  let cancelled = false;
  let received = 0;

  const item: any = {
    getURL: () => url,
    getFilename: () => filename,
    getMimeType: () => 'application/octet-stream',
    getTotalBytes: () => totalBytes,
    getReceivedBytes: () => received,
    setSavePath: (p: string) => { savePath = p; },
    getSavePath: () => savePath,
    cancel: () => { cancelled = true; },
    isCancelled: () => cancelled,
    on: (event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    once: (event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    emit: (event: string, ...args: any[]) => (listeners[event] || []).forEach((fn) => fn(...args)),
    setReceived: (n: number) => { received = n; },
  };
  return item;
}

function makeHandler(deps: any) {
  return createWillDownloadHandler({
    app: { getPath: (name: string) => (name === 'downloads' ? '/downloads' : '/') },
    BrowserWindow: { fromWebContents: () => fakeWindow },
    path: {
      join: (...parts: string[]) => parts.join('/'),
      extname: (f: string) => {
        const idx = f.lastIndexOf('.');
        return idx > f.lastIndexOf('/') ? f.slice(idx) : '';
      },
      basename: (f: string, ext?: string) => {
        const name = f.split('/').pop() || f;
        return ext ? name.slice(0, -ext.length) : name;
      },
    },
    fs: { existsSync: () => false },
    activeDownloads: new Map(),
    getMainWindow: () => fakeWindow,
    log: vi.fn(),
    ...deps,
  });
}

describe('browser download handler', () => {
  it('sets a safe save path and notifies the renderer when a download starts', () => {
    const item = createFakeItem('https://example.com/file.pdf', 'file.pdf', 1000);
    const handler = makeHandler({});
    fakeWindow.webContents.sent = [];

    handler({}, item, { hostWebContents: {} });

    expect(item.getSavePath()).toBe('/downloads/file.pdf');
    const startMsg = fakeWindow.webContents.sent.find((m) => m.channel === 'browser-download-requested');
    expect(startMsg).toBeDefined();
    expect(startMsg.payload.filename).toBe('file.pdf');
    expect(startMsg.payload.path).toBe('/downloads/file.pdf');
  });

  it('sanitizes filenames with invalid characters', () => {
    const item = createFakeItem('https://example.com/a:b.txt', 'a:b.txt', 100);
    const handler = makeHandler({});

    handler({}, item, { hostWebContents: {} });

    expect(item.getSavePath()).toBe('/downloads/a_b.txt');
  });

  it('increments filename when a file already exists', () => {
    const existing = new Set(['/downloads/file.pdf']);
    const item = createFakeItem('https://example.com/file.pdf', 'file.pdf', 1000);
    const handler = makeHandler({
      fs: { existsSync: (p: string) => existing.has(p) },
    });

    handler({}, item, { hostWebContents: {} });

    expect(item.getSavePath()).toBe('/downloads/file (1).pdf');
  });

  it('emits progress updates while the download is running', () => {
    const item = createFakeItem('https://example.com/file.zip', 'file.zip', 1000);
    const handler = makeHandler({});
    fakeWindow.webContents.sent = [];

    handler({}, item, { hostWebContents: {} });
    item.setReceived(500);
    item.emit('updated', {}, 'progressing');

    const progressMsg = fakeWindow.webContents.sent.find((m) => m.channel === 'download-progress');
    expect(progressMsg).toBeDefined();
    expect(progressMsg.payload.received).toBe(500);
    expect(progressMsg.payload.percent).toBe(50);
  });

  it('emits a completion event when the download finishes', () => {
    const item = createFakeItem('https://example.com/file.png', 'file.png', 200);
    const handler = makeHandler({});
    fakeWindow.webContents.sent = [];

    handler({}, item, { hostWebContents: {} });
    item.emit('done', {}, 'completed');

    const completeMsg = fakeWindow.webContents.sent.find((m) => m.channel === 'download-complete');
    expect(completeMsg).toBeDefined();
    expect(completeMsg.payload.state).toBe('completed');
    expect(completeMsg.payload.path).toBe('/downloads/file.png');
  });

  it('cancels the item when setSavePath fails', () => {
    const item = createFakeItem('https://example.com/bad.exe', 'bad.exe', 100);
    item.setSavePath = () => { throw new Error('no permission'); };
    const log = vi.fn();
    const handler = makeHandler({ log });

    handler({}, item, { hostWebContents: {} });

    expect(item.isCancelled()).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to set save path'));
  });
});
