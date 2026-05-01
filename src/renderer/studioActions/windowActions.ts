

import { registerAction, StudioContext, StudioActionResult } from './index';
import { collectPaneInfo } from './paneActions';

async function list_windows(
  _args: Record<string, any>,
  _ctx: StudioContext
): Promise<StudioActionResult> {
  try {
    const data = await (window as any).api.studioListWindows();
    return data;
  } catch (err) {
    return { success: false, error: `Failed to list windows: ${err}` };
  }
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
