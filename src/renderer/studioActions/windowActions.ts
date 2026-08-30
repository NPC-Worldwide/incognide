

import { registerAction, StudioContext, StudioActionResult } from './index';
import { collectPaneInfo } from './paneActions';

async function list_windows(
  _args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {
  // Real enumeration goes through the main process (it sees every
  // BrowserWindow). Fall back to reporting just this window when the IPC
  // bridge is unavailable (e.g. very old builds).
  const api = (window as any).api;
  if (api?.getAllWindowsInfo) {
    try {
      const infos = await api.getAllWindowsInfo();
      const currentId = String(ctx.windowId ?? '');
      const windows = (infos || []).map((w: any) => ({
        id: w.windowId,
        title: w.title || 'Untitled',
        currentPath: w.folderPath || null,
        bounds: w.bounds,
        display: w.display,
        isActive: String(w.windowId) === currentId,
      }));
      return {
        success: true,
        windows,
        count: windows.length,
        activeWindowId: ctx.windowId || '',
      };
    } catch (e) {
      console.warn('[STUDIO] getAllWindowsInfo failed, falling back to current window:', e);
    }
  }

  return {
    success: true,
    windows: [{
      id: ctx.windowId || '',
      currentPath: ctx.currentPath || '',
      title: document.title || 'Incognide',
    }],
    count: 1,
  };
}

async function get_window_info(
  _args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {

  const panes = collectPaneInfo(
    ctx.rootLayoutNode,
    ctx.contentDataRef.current,
    ctx.activeContentPaneId
  );

  const enrichedPanes = panes.map(pane => {
    const data = ctx.contentDataRef.current[pane.id] || {};
    const extra: Record<string, any> = {};
    if (data.browserUrl) extra.url = data.browserUrl;
    if (data.shellType) extra.shellType = data.shellType;
    if (data.contentId && typeof data.contentId === 'string' && data.contentId.includes('/')) {
      extra.filePath = data.contentId;
    }
    return { ...pane, ...extra };
  });

  return {
    success: true,
    windowId: ctx.windowId || '',
    currentPath: ctx.currentPath || '',
    title: document.title || 'Incognide',
    paneCount: enrichedPanes.length,
    panes: enrichedPanes,
  };
}

registerAction('list_windows', list_windows);
registerAction('get_window_info', get_window_info);
