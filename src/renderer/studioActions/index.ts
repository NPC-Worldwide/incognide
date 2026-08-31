

import type React from 'react';

export interface StudioContext {
  rootLayoutNode: any;
  contentDataRef: React.MutableRefObject<Record<string, any>>;
  activeContentPaneId: string;
  setActiveContentPaneId: (id: string) => void;
  setRootLayoutNode: (node: any) => void;
  performSplit: (targetPath: number[], side: string, contentType: string, contentId: string, targetPaneId?: string) => void;
  closeContentPane: (paneId: string, nodePath: number[]) => void;
  updateContentPane: (paneId: string, contentType: string, contentId: string, skipMessageLoad?: boolean) => void;
  handleAddTab?: (paneId: string, contentType: string) => void;
  handleTabClose?: (paneId: string, tabIndex: number) => void;
  handleTabSelect?: (paneId: string, tabIndex: number) => void;
  toggleZenMode?: (paneId: string) => void;
  generateId: () => string;
  findPanePath: (node: any, paneId: string, path?: number[]) => number[] | null;
  notifyPaneUpdate?: (paneId: string) => void;
  windowId?: string;
  currentPath?: string;
}

export interface StudioActionResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

export type StudioActionHandler = (
  args: Record<string, any>,
  ctx: StudioContext
) => Promise<StudioActionResult>;

export interface StudioActionMeta {
  description?: string;
  // Pane types for which this action is directly relevant. If omitted, the action is considered global.
  paneTypes?: string[];
}

interface StudioActionRecord {
  handler: StudioActionHandler;
  meta: StudioActionMeta;
}

const STUDIO_SESSION_ID = `session_${Date.now()}`;

const actions: Record<string, StudioActionRecord> = {};

export function registerAction(
  name: string,
  handler: StudioActionHandler,
  meta: StudioActionMeta = {}
): void {
  actions[name] = { handler, meta };
  console.log('[StudioActions] Registered:', name);
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  await import('./paneActions');
  await import('./contentActions');
  await import('./tabActions');
  await import('./browserActions');
  await import('./dataActions');
  await import('./uiActions');
  await import('./windowActions');

  console.log('[StudioActions] All actions loaded:', Object.keys(actions));
}

ensureInitialized();

// Small central activity logger for every studio action. Reuses the existing
// activity:log IPC so there is no new storage path.
function logStudioActivity(
  action: string,
  paneType: string | undefined,
  args: Record<string, any>,
  result: StudioActionResult
): void {
  const enabledPref = localStorage.getItem('incognide_activityTrackingEnabled');
  if (enabledPref === 'false') return;

  const argsPreview = JSON.stringify(args, Object.keys(args).sort());
  const data = {
    action,
    paneType,
    argsSummary: argsPreview.length > 500 ? argsPreview.slice(0, 500) + '...' : argsPreview,
    success: result.success,
    error: result.error || undefined,
  };

  (window as any).api?.logActivity?.({
    type: 'agent_action',
    data,
    sessionId: STUDIO_SESSION_ID,
  }).catch((err: any) => {
    console.warn('[StudioActions] Activity log failed:', err);
  });
}

export async function executeStudioAction(
  name: string,
  args: Record<string, any>,
  ctx: StudioContext
): Promise<StudioActionResult> {
  await ensureInitialized();

  const record = actions[name];

  if (!record) {
    return {
      success: false,
      error: `Unknown studio action: ${name}. Available: ${Object.keys(actions).join(', ')}`
    };
  }

  let result: StudioActionResult;
  try {
    result = await record.handler(args, ctx);
  } catch (error) {
    result = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // Central logging hook: every studio action execution is recorded, regardless
  // of which UI path invoked it (chat tool call, IPC, or SSE action queue).
  try {
    const paneData = ctx.activeContentPaneId ? (ctx as any).contentDataRef?.current?.[ctx.activeContentPaneId] : undefined;
    logStudioActivity(name, paneData?.contentType || ctx.currentPath, args, result);
  } catch (logErr) {
    // Never let logging break the action result.
    console.warn('[StudioActions] Failed to log action activity:', logErr);
  }

  return result;
}

export function getRegisteredActions(): string[] {
  return Object.keys(actions);
}

export function hasAction(name: string): boolean {
  return name in actions;
}

export function getActionMeta(name: string): StudioActionMeta | undefined {
  return actions[name]?.meta;
}

// Per-pane action scoping. Global actions are returned for any pane; pane-specific
// ones are only listed when requested for that pane type.
export function getActionsForPaneType(paneType?: string): string[] {
  const { PANE_TYPE_INFO } = require('./paneActions') as typeof import('./paneActions');
  const info = paneType ? PANE_TYPE_INFO[paneType] : undefined;
  const paneActions = new Set(info?.actions || []);
  return Object.keys(actions).filter((name) => {
    const meta = actions[name].meta;
    // An action explicitly restricted to certain pane types only appears there.
    if (meta?.paneTypes && meta.paneTypes.length > 0) {
      return !paneType || meta.paneTypes.includes(paneType);
    }
    // If the pane has a declared action list, include this action there; otherwise
    // the action is considered global and available everywhere.
    return paneActions.size === 0 || paneActions.has(name);
  });
}

registerAction('list_actions', async (args: Record<string, any>) => {
  const paneType = args?.pane_type || args?.paneType;
  const actionNames = getActionsForPaneType(paneType).sort();
  const categories: Record<string, string[]> = {
    'Pane Management': actionNames.filter(a => ['open_pane', 'close_pane', 'focus_pane', 'split_pane', 'list_panes', 'list_pane_types', 'zen_mode'].includes(a)),
    'Content': actionNames.filter(a => ['read_pane', 'write_file', 'get_selection', 'run_terminal'].includes(a)),
    'Tabs': actionNames.filter(a => a.includes('tab')),
    'Browser': actionNames.filter(a => a.startsWith('browser_') || ['navigate', 'get_browser_info', 'get_browser_content'].includes(a)),
    'Spreadsheet': actionNames.filter(a => a.startsWith('spreadsheet_')),
    'Document': actionNames.filter(a => a.startsWith('document_')),
    'Presentation': actionNames.filter(a => a.startsWith('presentation_')),
    'UI': actionNames.filter(a => ['notify', 'confirm', 'open_file_picker', 'send_message', 'switch_npc'].includes(a)),
    'Window': actionNames.filter(a => ['list_windows', 'get_window_info'].includes(a)),
  };
  return {
    success: true,
    actions: actionNames,
    actionDetails: actionNames.map(name => ({
      name,
      description: actions[name]?.meta?.description || '',
      paneTypes: actions[name]?.meta?.paneTypes || [],
    })),
    categories,
    count: actionNames.length,
    paneType,
  };
});
