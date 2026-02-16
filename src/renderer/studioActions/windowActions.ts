/**
 * Window Actions
 *
 * Actions for window discovery and identification:
 * - list_windows: list all connected windows
 * - get_window_info: get this window's info (id, folder, panes)
 */

import { registerAction, StudioContext, StudioActionResult } from './index';
import { collectPaneInfo } from './paneActions';

const BACKEND_URL = (window as any).__BACKEND_URL__ ||
  `http://127.0.0.1:${(window as any).__BACKEND_PORT__ || '5437'}`;

/**
 * List all connected incognide windows
 */
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

/**
 * Get info about this specific window
 */
async function get_window_info(
  _args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {
  // Use collectPaneInfo for consistent, detailed pane info
  const panes = collectPaneInfo(
    ctx.rootLayoutNode,
    ctx.contentDataRef.current,
    ctx.activeContentPaneId
  );

  // Enrich with extra detail (URLs, shell types, file paths)
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

// Register window actions
registerAction('list_windows', list_windows);
registerAction('get_window_info', get_window_info);
