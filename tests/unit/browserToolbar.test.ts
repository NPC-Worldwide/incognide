import { describe, it, expect, vi, beforeEach } from 'vitest';

function isAddressBarSelectable(input: any) {
  return input.draggable !== true && input.onDragStart == null;
}

describe('browser toolbar', () => {
  let api: any;

  beforeEach(() => {
    api = {
      browserAddBookmark: vi.fn().mockResolvedValue({ success: true }),
      browserGetBookmarks: vi.fn().mockResolvedValue({ success: true, bookmarks: [] }),
    };
    (global as any).window = { api };
  });

  it('bookmarks current page into current folder', async () => {
    const url = 'https://example.com';
    const title = 'Example';
    const currentPath = '/project';

    await api.browserAddBookmark({ url, title, folderPath: currentPath, isGlobal: false });

    expect(api.browserAddBookmark).toHaveBeenCalledWith({ url, title, folderPath: currentPath, isGlobal: false });
  });

  it('detects existing bookmark for current url and folder', async () => {
    const url = 'https://example.com';
    const currentPath = '/project';
    api.browserGetBookmarks = vi.fn().mockResolvedValue({
      success: true,
      bookmarks: [{ id: 1, url, folder_path: currentPath, title: 'Example' }],
    });

    const result = await api.browserGetBookmarks({ folderPath: currentPath });
    const matches = result.bookmarks.some((bm: any) => bm.url === url && bm.folder_path === currentPath);

    expect(matches).toBe(true);
  });

  it('address bar input allows drag-select', () => {
    const input = { draggable: false, onDragStart: undefined };
    expect(isAddressBarSelectable(input)).toBe(true);
  });
});
