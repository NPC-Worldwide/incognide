/**
 * Pane Actions
 *
 * Actions for managing panes in Incognide:
 * - open_pane, close_pane, focus_pane, split_pane, list_panes, list_pane_types, zen_mode
 */

import { registerAction, StudioContext, StudioActionResult } from './index';

/**
 * All known pane types with human-readable names and descriptions.
 * Tool panes use their type as contentId (e.g., datadash → 'datadash').
 * File panes need an explicit path/url as contentId.
 */
const PANE_TYPE_INFO: Record<string, { title: string; description: string; needsPath?: boolean; needsUrl?: boolean }> = {
  'chat':             { title: 'Chat',             description: 'AI chat conversation' },
  'editor':           { title: 'Code Editor',      description: 'Edit code and text files', needsPath: true },
  'terminal':         { title: 'Terminal',          description: 'Shell terminal (system, npcsh, guac)' },
  'browser':          { title: 'Browser',           description: 'Web browser', needsUrl: true },
  'pdf':              { title: 'PDF Viewer',        description: 'View PDF documents', needsPath: true },
  'csv':              { title: 'Spreadsheet',       description: 'View/edit CSV and Excel files', needsPath: true },
  'docx':             { title: 'Document',          description: 'View/edit Word documents', needsPath: true },
  'pptx':             { title: 'Presentation',      description: 'View/edit PowerPoint files', needsPath: true },
  'latex':            { title: 'LaTeX',             description: 'Edit LaTeX documents', needsPath: true },
  'notebook':         { title: 'Notebook',          description: 'Jupyter notebook', needsPath: true },
  'exp':              { title: 'Experiment',        description: 'Experiment file', needsPath: true },
  'mindmap':          { title: 'Mind Map',          description: 'Mind map document', needsPath: true },
  'zip':              { title: 'Archive',           description: 'Browse ZIP archives', needsPath: true },
  'image':            { title: 'Image',             description: 'View image files', needsPath: true },
  'graph-viewer':     { title: 'Knowledge Graph',   description: 'View and edit the knowledge graph' },
  'datadash':         { title: 'Dashboard',         description: 'Data dashboard with analytics and stats' },
  'dbtool':           { title: 'Database Tool',     description: 'Query and manage databases' },
  'memory-manager':   { title: 'Memory Manager',    description: 'Manage AI memory and training data' },
  'photoviewer':      { title: 'Photo Viewer',      description: 'Browse and view photos' },
  'scherzo':          { title: 'Audio Studio',      description: 'Audio playback and generation' },
  'npcteam':          { title: 'NPC Team',          description: 'View and manage NPC agents' },
  'jinx':             { title: 'Jinxs',             description: 'View and manage jinx actions' },
  'teammanagement':   { title: 'Team Management',   description: 'Manage NPCs, jinxs, databases, MCP servers, cron jobs' },
  'search':           { title: 'Search',            description: 'Search files and content' },
  'library':          { title: 'Library',           description: 'Browse installed packages and libraries' },
  'diskusage':        { title: 'Disk Usage',        description: 'Analyze disk space usage' },
  'help':             { title: 'Help',              description: 'Help and documentation' },
  'settings':         { title: 'Settings',          description: 'App settings and configuration' },
  'cron-daemon':      { title: 'Cron Jobs',         description: 'Manage scheduled tasks and cron jobs' },
  'projectenv':       { title: 'Project Environment', description: 'Project environment configuration' },
  'browsergraph':     { title: 'Web Graph',         description: 'Browser navigation history graph' },
  'data-labeler':     { title: 'Data Labeler',      description: 'Label and annotate data' },
  'diff':             { title: 'Diff Viewer',       description: 'View file diffs' },
  'git':              { title: 'Git',               description: 'Git repository management' },
  'folder':           { title: 'Folder',            description: 'Browse folder contents', needsPath: true },
};

// Tool pane types that use their type name as contentId (no path needed)
const TOOL_PANE_TYPES = new Set([
  'graph-viewer', 'datadash', 'dbtool', 'memory-manager', 'photoviewer', 'scherzo',
  'npcteam', 'jinx', 'teammanagement', 'search', 'library', 'diskusage', 'help',
  'settings', 'cron-daemon', 'projectenv', 'browsergraph', 'data-labeler', 'git',
  'chat', 'terminal',
]);

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
  const info = PANE_TYPE_INFO[contentType];

  // For file-based panes, show the filename
  if (contentId && typeof contentId === 'string' && contentId.includes('/')) {
    const fileName = contentId.split('/').pop() || contentId;
    return info ? `${info.title}: ${fileName}` : fileName;
  }

  // For tool panes, use the human-readable title
  if (info && TOOL_PANE_TYPES.has(contentType)) {
    return info.title;
  }

  // For browser panes, show URL hostname
  if (contentType === 'browser' && data.browserUrl) {
    try { return `Browser: ${new URL(data.browserUrl).hostname}`; } catch {}
  }

  // For terminal panes, show shell type
  if (contentType === 'terminal') {
    return `Terminal${data.shellType ? ` (${data.shellType})` : ''}`;
  }

  // Fallback
  return info?.title || contentId || contentType || 'Untitled';
}

/**
 * Open a new pane
 */
async function open_pane(
  args: { type: string; path?: string; url?: string; position?: string; shellType?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { type, path, url, position = 'right', shellType } = args;

  if (!type) {
    return { success: false, error: `type is required. Use list_pane_types to see available types.` };
  }

  if (!PANE_TYPE_INFO[type]) {
    const available = Object.keys(PANE_TYPE_INFO).join(', ');
    return { success: false, error: `Unknown pane type: "${type}". Available types: ${available}` };
  }

  // Determine contentId based on pane type
  let contentId: string;
  if (path) {
    contentId = path;
  } else if (url) {
    contentId = url;
  } else if (TOOL_PANE_TYPES.has(type)) {
    // Tool panes use their type name as contentId
    contentId = type;
  } else {
    // File-based panes need a path
    const info = PANE_TYPE_INFO[type];
    if (info?.needsPath) {
      return { success: false, error: `Pane type "${type}" requires a path argument.` };
    }
    if (info?.needsUrl) {
      return { success: false, error: `Pane type "${type}" requires a url argument.` };
    }
    contentId = ctx.generateId();
  }

  // Get path to active pane
  const activePath = ctx.findPanePath(ctx.rootLayoutNode, ctx.activeContentPaneId) || [];

  // Perform split to create new pane
  ctx.performSplit(activePath, position, type, contentId);

  // For tool panes, also set extra pane data after creation
  await new Promise(resolve => setTimeout(resolve, 50));

  let actualPaneId: string | null = null;
  for (const [paneId, data] of Object.entries(ctx.contentDataRef.current)) {
    if ((data as any).contentId === contentId && (data as any).contentType === type) {
      actualPaneId = paneId;
      break;
    }
  }

  // Set shell type for terminal panes
  if (actualPaneId && type === 'terminal' && shellType) {
    ctx.contentDataRef.current[actualPaneId] = {
      ...ctx.contentDataRef.current[actualPaneId],
      shellType
    };
  }

  // For dbtool, trigger updateContentPane for proper initialization
  if (actualPaneId && type === 'dbtool') {
    ctx.updateContentPane(actualPaneId, 'dbtool', 'dbtool');
  }

  const info = PANE_TYPE_INFO[type];

  return {
    success: true,
    paneId: actualPaneId || 'unknown',
    type,
    title: info?.title || type,
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

  if (!PANE_TYPE_INFO[type]) {
    return { success: false, error: `Unknown pane type: "${type}". Use list_pane_types to see available types.` };
  }

  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);
  if (!nodePath) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  // Use type as contentId for tool panes, path for file panes
  const contentId = path || (TOOL_PANE_TYPES.has(type) ? type : ctx.generateId());

  ctx.performSplit(nodePath, direction, type, contentId);

  // Wait for React to update, then find the new pane
  await new Promise(resolve => setTimeout(resolve, 50));
  let newPaneId: string | null = null;
  for (const [pid, data] of Object.entries(ctx.contentDataRef.current)) {
    if ((data as any).contentId === contentId && (data as any).contentType === type && pid !== paneId) {
      newPaneId = pid;
      break;
    }
  }

  if (newPaneId && type === 'dbtool') {
    ctx.updateContentPane(newPaneId, 'dbtool', 'dbtool');
  }

  return {
    success: true,
    newPaneId: newPaneId || 'unknown',
    type,
    title: PANE_TYPE_INFO[type]?.title || type,
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
    panes: enrichedPanes,
    activePaneId: ctx.activeContentPaneId,
    count: enrichedPanes.length
  };
}

/**
 * List all available pane types that can be opened
 */
async function list_pane_types(
  _args: Record<string, any>,
  _ctx: StudioContext
): Promise<StudioActionResult> {
  const types = Object.entries(PANE_TYPE_INFO).map(([type, info]) => ({
    type,
    title: info.title,
    description: info.description,
    requiresPath: !!info.needsPath,
    requiresUrl: !!info.needsUrl,
  }));

  return {
    success: true,
    types,
    count: types.length
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
registerAction('list_pane_types', list_pane_types);
registerAction('zen_mode', zen_mode);
