/**
 * Window Actions
 *
 * Actions for window discovery and identification:
 * - list_windows: list all connected windows
 * - get_window_info: get this window's info (id, folder, panes)
 */

import { registerAction, StudioContext, StudioActionResult } from './index';

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
  // Collect pane info from contentDataRef
  const panes: any[] = [];
  if (ctx.contentDataRef?.current) {
    for (const [paneId, data] of Object.entries(ctx.contentDataRef.current)) {
      panes.push({
        id: paneId,
        type: (data as any).contentType || 'unknown',
        title: (data as any).browserTitle || (data as any).contentId || paneId,
        isActive: paneId === ctx.activeContentPaneId,
      });
    }
  }

  return {
    success: true,
    windowId: ctx.windowId || '',
    currentPath: ctx.currentPath || '',
    title: document.title || 'Incognide',
    paneCount: panes.length,
    panes,
  };
}

// Register window actions
registerAction('list_windows', list_windows);
registerAction('get_window_info', get_window_info);
