

import { registerAction, StudioContext, StudioActionResult } from './index';

async function read_pane(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  const { contentType, contentId, fileContent, chatMessages } = data;

  let content: any = null;

  const fileContentTypes = ['editor', 'markdown-preview', 'latex', 'notebook', 'exp', 'mindmap'];

  if (fileContentTypes.includes(contentType)) {
    content = fileContent || null;
  } else {
    switch (contentType) {
      case 'chat': {
        const messages = chatMessages?.messages || chatMessages?.allMessages || [];
        content = messages.slice(-50).map((m: any) => ({
          role: m.role,
          content: m.content?.substring(0, 1000),
          timestamp: m.timestamp
        }));
        break;
      }

      case 'terminal':
        if (data.getTerminalContext) {
          try { content = data.getTerminalContext(); } catch { content = data.terminalOutput || null; }
        } else {
          content = data.terminalOutput || null;
        }
        break;

      case 'browser':
        content = { url: data.browserUrl, title: data.browserTitle };
        break;

      case 'csv':
        if (data.readSpreadsheetData) {
          content = await data.readSpreadsheetData({ maxRows: 100, includeStats: true });
        } else {
          content = { type: 'csv', path: contentId };
        }
        break;

      case 'docx':
        if (data.readDocumentContent) {
          content = await data.readDocumentContent({ format: 'text' });
        } else {
          content = { type: 'docx', path: contentId };
        }
        break;

      case 'pptx':
        if (data.readPresentation) {
          content = await data.readPresentation();
        } else {
          content = { type: 'pptx', path: contentId };
        }
        break;

      case 'image':
        content = { type: 'image', path: contentId };
        break;

      case 'pdf':
        content = { type: 'pdf', path: contentId };
        break;

      case 'graph-viewer':
      case 'datadash':
      case 'dbtool':
      case 'memory-manager':
      case 'photoviewer':
      case 'scherzo':
      case 'npcteam':
      case 'jinx':
      case 'teammanagement':
      case 'search':
      case 'library':
      case 'diskusage':
      case 'help':
      case 'settings':
      case 'cron-daemon':
      case 'projectenv':
      case 'browsergraph':
      case 'data-labeler':
      case 'git':
      case 'folder':
        content = { type: contentType, status: 'open' };
        break;

      default:
        content = contentId;
    }
  }

  return {
    success: true,
    paneId,
    type: contentType,
    path: contentId,
    content
  };
}

async function write_file(
  args: { paneId?: string; content: string; path?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'editor') {
    return { success: false, error: `Pane is not an editor: ${data.contentType}` };
  }

  ctx.contentDataRef.current[paneId] = {
    ...data,
    fileContent: args.content,
    fileChanged: true
  };

  if (args.path && args.path !== data.contentId) {
    ctx.updateContentPane(paneId, 'editor', args.path);
  }

  return {
    success: true,
    paneId,
    path: args.path || data.contentId,
    bytesWritten: args.content.length
  };
}

async function get_selection(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  const selection = data.selection || null;

  return {
    success: true,
    paneId,
    selection,
    hasSelection: !!selection
  };
}

async function run_terminal(
  args: { paneId?: string; command: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { command } = args;

  if (!command) {
    return { success: false, error: 'command is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'terminal') {
    return { success: false, error: `Pane is not a terminal: ${data.contentType}` };
  }

  const terminalId = data.contentId;

  if (!terminalId) {
    return { success: false, error: 'Terminal ID not found for pane' };
  }

  try {

    await (window as any).api?.writeToTerminal?.({
      id: terminalId,
      data: command + '\n'
    });

    return {
      success: true,
      paneId,
      terminalId,
      command,
      message: 'Command sent to terminal'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send command to terminal'
    };
  }
}

registerAction('read_pane', read_pane);
registerAction('write_file', write_file);
registerAction('get_selection', get_selection);
registerAction('run_terminal', run_terminal);
