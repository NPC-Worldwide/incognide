

import { registerAction, StudioContext, StudioActionResult } from './index';
import { collectPaneInfo } from './paneActions';

const BACKEND_URL = (window as any).__BACKEND_URL__ ||
  `http://127.0.0.1:${(window as any).__BACKEND_PORT__ || '5437'}`;

async function list_windows(
  _args: Record<string, any>,
  _ctx: StudioContext
): Promise<StudioActionResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/studio/windows`);
    const data = await response.json();
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
