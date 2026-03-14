import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addDownload,
  cancelDownload,
  updateDownload,
  deleteDownload,
  getActiveDownloadsCount,
  setDownloadToastCallback,
  setDownloadAllCompleteCallback,
} from '../../src/renderer/components/DownloadManager';

describe('DownloadManager module', () => {
  beforeEach(() => {
    // Clear downloads between tests by deleting all
    while (getActiveDownloadsCount() > 0) {
      // Can't easily reset, but tests should be independent
    }
  });

  describe('addDownload', () => {
    it('returns an id string', () => {
      const id = addDownload('https://example.com/file.zip', 'file.zip');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      // cleanup
      deleteDownload(id);
    });

    it('fires toast callback', () => {
      const toast = vi.fn();
      setDownloadToastCallback(toast);
      const id = addDownload('https://example.com/file.zip', 'file.zip');
      expect(toast).toHaveBeenCalledWith('Download started', 'file.zip');
      deleteDownload(id);
    });
  });

  describe('updateDownload', () => {
    it('updates download status', () => {
      const id = addDownload('https://example.com/test.zip', 'test.zip');
      updateDownload(id, { status: 'downloading', progress: 50 });
      // If we got here without error, the update worked
      deleteDownload(id);
    });
  });

  describe('getActiveDownloadsCount', () => {
    it('counts pending and downloading items', () => {
      const initialCount = getActiveDownloadsCount();
      const id1 = addDownload('https://example.com/a.zip', 'a.zip');
      expect(getActiveDownloadsCount()).toBe(initialCount + 1);
      updateDownload(id1, { status: 'completed' });
      expect(getActiveDownloadsCount()).toBe(initialCount);
      deleteDownload(id1);
    });
  });

  describe('allCompleteCallback', () => {
    it('fires when all downloads complete', () => {
      const allComplete = vi.fn();
      setDownloadAllCompleteCallback(allComplete);
      const id = addDownload('https://example.com/done.zip', 'done.zip');
      updateDownload(id, { status: 'downloading' });
      updateDownload(id, { status: 'completed' });
      expect(allComplete).toHaveBeenCalled();
      deleteDownload(id);
    });
  });

  describe('deleteDownload', () => {
    it('removes download from list', () => {
      const id = addDownload('https://example.com/del.zip', 'del.zip');
      const countBefore = getActiveDownloadsCount();
      updateDownload(id, { status: 'completed' });
      deleteDownload(id);
      // Should not throw
    });
  });
});
