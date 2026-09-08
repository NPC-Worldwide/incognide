import { describe, it, expect } from 'vitest';
import { mockIpcMain, mockBrowserWindow, mockWebContents, mockSession, mockDownloadItem } from '../mocks/electron';

describe('electron mocks', () => {
  it('mockIpcMain rejects duplicate handle registrations', () => {
    const ipcMain = mockIpcMain();
    ipcMain.handle('channel-a', () => { });
    expect(() => ipcMain.handle('channel-a', () => { })).toThrow('Duplicate ipcMain.handle registration');
  });

  it('mockDownloadItem exposes expected metadata', () => {
    const item = mockDownloadItem({ url: 'https://x/y.bin', filename: 'y.bin', totalBytes: 2048 });
    expect(item.getURL()).toBe('https://x/y.bin');
    expect(item.getFilename()).toBe('y.bin');
    expect(item.getTotalBytes()).toBe(2048);
  });

  it('mockWebContents has a session with will-download stub', () => {
    const wc = mockWebContents();
    expect(wc.session.on).toBeDefined();
    wc.session.on('will-download', () => { });
  });

  it('mockBrowserWindow wraps webContents', () => {
    const win = mockBrowserWindow();
    expect(win.webContents.executeJavaScript).toBeDefined();
  });
});
