/**
 * Pane Actions
 *
 * Actions for managing panes in Incognide:
 * - open_pane, close_pane, focus_pane, split_pane, list_panes, zen_mode
 */

import { registerAction, StudioContext, StudioActionResult } from './index';

/**
 * Collect information about all panes in the layout
 */
export function collectPaneInfo(
  node: any,
  contentData: Record<string, any>,
  activePaneId: string,
  path: number[] = []
): any[] {
  if (!node) return [];

  if (node.type === 'content') {
    const data = contentData[node.id] || {};
    return [{
      id: node.id,
      type: data.contentType || 'unknown',
      title: getPaneTitle(data),
      path: data.contentId || null,
      isActive: node.id === activePaneId,
      nodePath: path
    }];
  }

  if (node.type === 'split' && node.children) {
    const panes: any[] = [];
    node.children.forEach((child: any, idx: number) => {
      panes.push(...collectPaneInfo(child, contentData, activePaneId, [...path, idx]));
    });
    return panes;
  }

  return [];
}

/**
 * Get a human-readable title for a pane
 */
function getPaneTitle(data: any): string {
  if (!data) return 'Untitled';

  const { contentType, contentId } = data;

  if (contentId) {
    // For files, show filename
    if (typeof contentId === 'string' && contentId.includes('/')) {
      return contentId.split('/').pop() || contentId;
    }
    return contentId;
  }

  // Default to content type
  return contentType || 'Untitled';
}

/**
 * Open a new pane
 */
async function open_pane(
  args: { type: string; path?: string; url?: string; position?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { type, path, url, position = 'right' } = args;

  if (!type) {
    return { success: false, error: 'type is required' };
  }

  const contentId = path || url || ctx.generateId();

  // Get path to active pane
  const activePath = ctx.findPanePath(ctx.rootLayoutNode, ctx.activeContentPaneId) || [];

  // Perform split to create new pane
  ctx.performSplit(activePath, position, type, contentId);

  // Find the actual pane ID by looking for the pane with matching contentId
  // performSplit sets the active pane to the new pane, but we need to wait
  // a tick for React state to update. Use contentDataRef to find it.
  let actualPaneId: string | null = null;

  // Give React a moment to update state, then look for the new pane
  await new Promise(resolve => setTimeout(resolve, 50));

  // Find pane by contentId in contentDataRef
  for (const [paneId, data] of Object.entries(ctx.contentDataRef.current)) {
    if (data.contentId === contentId && data.contentType === type) {
      actualPaneId = paneId;
      break;
    }
  }

  return {
    success: true,
    paneId: actualPaneId || 'unknown',
    type,
    contentId
  };
}

/**
 * Close a pane
 */
async function close_pane(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);

  if (!nodePath) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  ctx.closeContentPane(paneId, nodePath);

  return { success: true, closedPaneId: paneId };
}

/**
 * Focus/activate a pane
 */
async function focus_pane(
  args: { paneId: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { paneId } = args;

  if (!paneId) {
    return { success: false, error: 'paneId is required' };
  }

  // Verify pane exists
  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);
  if (!nodePath && paneId !== 'active') {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  ctx.setActiveContentPaneId(paneId);

  return { success: true, activePaneId: paneId };
}

/**
 * Split an existing pane
 */
async function split_pane(
  args: { paneId?: string; direction: string; type: string; path?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { direction, type, path } = args;
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  if (!direction || !type) {
    return { success: false, error: 'direction and type are required' };
  }

  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);
  if (!nodePath) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  const contentId = path || ctx.generateId();
  const newPaneId = ctx.generateId();

  ctx.performSplit(nodePath, direction, type, contentId);

  return {
    success: true,
    newPaneId,
    type,
    contentId
  };
}

/**
 * List all open panes
 */
async function list_panes(
  _args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {
  const panes = collectPaneInfo(
    ctx.rootLayoutNode,
    ctx.contentDataRef.current,
    ctx.activeContentPaneId
  );

  return {
    success: true,
    panes,
    activePaneId: ctx.activeContentPaneId,
    count: panes.length
  };
}

/**
 * Toggle zen mode for a pane
 */
async function zen_mode(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  if (!ctx.toggleZenMode) {
    return { success: false, error: 'Zen mode not available' };
  }

  ctx.toggleZenMode(paneId);

  return { success: true, paneId };
}

// Register all pane actions
registerAction('open_pane', open_pane);
registerAction('close_pane', close_pane);
registerAction('focus_pane', focus_pane);
registerAction('split_pane', split_pane);
registerAction('list_panes', list_panes);
registerAction('zen_mode', zen_mode);
