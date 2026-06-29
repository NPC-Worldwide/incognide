

import { registerAction, StudioContext, StudioActionResult } from './index';

export const PANE_TYPE_INFO: Record<string, { title: string; description: string; needsPath?: boolean; needsUrl?: boolean }> = {
  'chat':             { title: 'Chat',             description: 'AI chat conversation' },
  'agent':            { title: 'Agent',            description: 'AI agent with tools' },
  'editor':           { title: 'Code Editor',      description: 'Edit code and text files', needsPath: true },
  'terminal':         { title: 'Terminal',          description: 'Shell terminal (system, npcsh, guac)' },

  'pdf':              { title: 'PDF Viewer',        description: 'View PDF documents', needsPath: true },
  'csv':              { title: 'Spreadsheet',       description: 'View/edit CSV and Excel files', needsPath: true },
  'docx':             { title: 'Document',          description: 'View/edit Word documents', needsPath: true },
  'pptx':             { title: 'Presentation',      description: 'View/edit PowerPoint files', needsPath: true },
  'latex':            { title: 'LaTeX',             description: 'Edit LaTeX documents', needsPath: true },
  'notebook':         { title: 'Notebook',          description: 'Jupyter notebook', needsPath: true },
  'exp':              { title: 'Experiment',        description: 'Experiment file', needsPath: true },

    
  'zip':              { title: 'Archive',           description: 'Browse ZIP archives', needsPath: true },
  'image':            { title: 'Image',             description: 'View image files', needsPath: true },
  'graph-viewer':     { title: 'Knowledge Graph',   description: 'View and edit the knowledge graph' },
  'datadash':         { title: 'Dashboard',         description: 'Data dashboard with analytics and stats' },
  'dbtool':           { title: 'Database Tool',     description: 'Query and manage databases' },
  'memory-manager':   { title: 'Memory Manager',    description: 'Manage AI memory and training data' },
  'browser':          { title: 'Browser',           description: 'Web browser', needsUrl: true },
  'npcteam':          { title: 'NPC Team',          description: 'View and manage NPC agents' },
  'jinx':             { title: 'Jinxes',             description: 'View and manage jinx actions' },
  'teammanagement':   { title: 'Team Management',   description: 'Manage NPCs, jinxes, databases, MCP servers, cron jobs' },
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
  'mcp-manager':      { title: 'MCP Manager',       description: 'View and manage MCP servers and tools' },
  'skills-manager':   { title: 'Skills Manager',    description: 'Manage skills, jinxes, and import NPC teams' },
  'folder':           { title: 'Folder',            description: 'Browse folder contents', needsPath: true },
};

const TOOL_PANE_TYPES = new Set([
  'graph-viewer', 'datadash', 'dbtool', 'memory-manager', 'browser', 'image',
  'npcteam', 'jinx', 'teammanagement', 'search', 'library', 'diskusage', 'help',
  'settings', 'cron-daemon', 'projectenv', 'browsergraph', 'data-labeler', 'git',
  'mcp-manager', 'skills-manager', 'chat', 'terminal',
]);

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

export function getPaneTitle(data: any): string {
  if (!data) return 'Untitled';

  const { contentType, contentId } = data;
  const info = PANE_TYPE_INFO[contentType];

  if (contentId && typeof contentId === 'string' && contentId.includes('/')) {
    const fileName = contentId.split('/').pop() || contentId;
    return info ? `${info.title}: ${fileName}` : fileName;
  }

  if (info && TOOL_PANE_TYPES.has(contentType)) {
    return info.title;
  }

  if (contentType === 'browser' && data.browserUrl) {
    try { return `Browser: ${new URL(data.browserUrl).hostname}`; } catch {}
  }

  if (contentType === 'terminal') {
    return `Terminal${data.shellType ? ` (${data.shellType})` : ''}`;
  }

  if (contentType === 'chat' || contentType === 'agent') {
    const shortId = contentId ? String(contentId).slice(-6) : '';
    const npcName = data.npc || (contentType === 'agent' ? 'Agent' : 'Chat');
    return `${npcName}${shortId ? ` ${shortId}` : ''}`;
  }

  return info?.title || contentId || contentType || 'Untitled';
}

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

  let contentId: string;
  if (path) {
    contentId = path;
  } else if (url) {
    contentId = url;
  } else if (TOOL_PANE_TYPES.has(type)) {

    contentId = type;
  } else {

    const info = PANE_TYPE_INFO[type];
    if (info?.needsPath) {
      return { success: false, error: `Pane type "${type}" requires a path argument.` };
    }
    if (info?.needsUrl) {
      return { success: false, error: `Pane type "${type}" requires a url argument.` };
    }
    contentId = ctx.generateId();
  }

  const activePath = ctx.findPanePath(ctx.rootLayoutNode, ctx.activeContentPaneId) || [];

  // Pre-generate a pane ID so we know exactly which pane was created
  const newPaneId = ctx.generateId();

  // Pre-populate contentData so performSplit uses this exact ID
  ctx.contentDataRef.current[newPaneId] = {
    contentType: type,
    contentId: contentId,
    ...(type === 'terminal' && shellType ? { shellType } : {}),
    ...(type === 'browser' && url ? { browserUrl: url } : {}),
  };

  ctx.performSplit(activePath, position, type, contentId, newPaneId);

  // Wait briefly for layout to settle, then verify the pane exists
  const maxWait = type === 'terminal' ? 2000 : 300;
  const startTime = Date.now();
  let actualPaneId: string | null = null;

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (ctx.contentDataRef.current[newPaneId]) {
      actualPaneId = newPaneId;
      // For terminals, also wait until the backend session exists
      if (type === 'terminal') {
        try {
          const writeResult = await (window as any).api?.writeToTerminal?.({ id: contentId, data: '' });
          if (writeResult?.success) break;
        } catch {}
      } else {
        break;
      }
    }
  }

  if (actualPaneId && type === 'dbtool') {
    ctx.updateContentPane(actualPaneId, 'dbtool', 'dbtool');
  }

  const info = PANE_TYPE_INFO[type];

  return {
    success: true,
    paneId: actualPaneId || newPaneId,
    type,
    title: info?.title || type,
    contentId
  };
}

async function close_pane(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const allPanes = collectPaneInfo(ctx.rootLayoutNode, ctx.contentDataRef.current, ctx.activeContentPaneId);
  if (allPanes.length <= 1) {
    return { success: false, error: 'Cannot close the last pane' };
  }

  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);

  if (!nodePath) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  const paneData = ctx.contentDataRef.current[paneId];
  ctx.closeContentPane(paneId, nodePath);

  return {
    success: true,
    closedPaneId: paneId,
    title: getPaneTitle(paneData),
    type: paneData?.contentType || 'unknown'
  };
}

async function focus_pane(
  args: { paneId: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { paneId } = args;

  if (!paneId) {
    return { success: false, error: 'paneId is required' };
  }

  const nodePath = ctx.findPanePath(ctx.rootLayoutNode, paneId);
  if (!nodePath && paneId !== 'active') {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  ctx.setActiveContentPaneId(paneId);

  const focusedData = ctx.contentDataRef.current[paneId];
  return {
    success: true,
    activePaneId: paneId,
    title: getPaneTitle(focusedData),
    type: focusedData?.contentType || 'unknown',
    contentId: focusedData?.contentId || null
  };
}

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

  const contentId = path || (TOOL_PANE_TYPES.has(type) ? type : ctx.generateId());

  // Pre-generate a pane ID so we know exactly which pane was created
  const newPaneId = ctx.generateId();

  // Pre-populate contentData so performSplit uses this exact ID
  ctx.contentDataRef.current[newPaneId] = {
    contentType: type,
    contentId: contentId,
  };

  ctx.performSplit(nodePath, direction, type, contentId, newPaneId);

  // Wait briefly for layout to settle
  await new Promise(resolve => setTimeout(resolve, 100));
  let verifiedPaneId: string | null = null;
  if (ctx.contentDataRef.current[newPaneId]) {
    verifiedPaneId = newPaneId;
  }

  if (verifiedPaneId && type === 'dbtool') {
    ctx.updateContentPane(verifiedPaneId, 'dbtool', 'dbtool');
  }

  return {
    success: true,
    newPaneId: verifiedPaneId || newPaneId,
    type,
    title: PANE_TYPE_INFO[type]?.title || type,
    contentId
  };
}

async function list_panes(
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
    const extra: Record<string, any> = {
      title: getPaneTitle(data),
      contentId: data.contentId || null,
    };
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

registerAction('open_pane', open_pane);
registerAction('close_pane', close_pane);
registerAction('focus_pane', focus_pane);
registerAction('split_pane', split_pane);
registerAction('list_panes', list_panes);
registerAction('list_pane_types', list_pane_types);
registerAction('zen_mode', zen_mode);
