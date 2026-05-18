

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

  const fileContentTypes = ['editor', 'markdown-preview', 'latex', 'notebook', 'exp'];

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
    // Retry if the PTY session isn't ready yet (e.g. terminal just opened)
    let result: any = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      result = await (window as any).api?.writeToTerminal?.({
        id: terminalId,
        data: command + '\n'
      });
      if (result?.success) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Terminal session not ready after retries'
      };
    }

    // Wait for output to appear so the agent can see results
    await new Promise(resolve => setTimeout(resolve, 500));

    // Read terminal output and return it
    let output: string | null = null;
    if (data.getTerminalContext) {
      try { output = data.getTerminalContext(); } catch {}
    }

    return {
      success: true,
      paneId,
      terminalId,
      command,
      output: output || '(command sent, output may still be streaming)',
      message: 'Command executed'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send command to terminal'
    };
  }
}

async function write_pane(
  args: { paneId?: string; content: string; position?: string; path?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];
  if (!data) return { success: false, error: `Pane not found: ${paneId}` };
  if (!args.content) return { success: false, error: 'content is required' };

  const { contentType } = data;
  const fileTypes = ['editor', 'markdown-preview', 'latex', 'notebook', 'exp'];

  if (fileTypes.includes(contentType)) {
    ctx.contentDataRef.current[paneId] = { ...data, fileContent: args.content, fileChanged: true };
    if (args.path && args.path !== data.contentId) {
      ctx.updateContentPane(paneId, 'editor', args.path);
    }
    return { success: true, paneId, type: contentType, bytesWritten: args.content.length };
  }

  if (contentType === 'docx' && data.writeDocumentContent) {
    const result = await data.writeDocumentContent(args.content, args.position || 'replace');
    return { success: true, paneId, type: 'docx', ...result };
  }

  if (contentType === 'csv' && data.updateSpreadsheetCells) {
    try {
      const updates = JSON.parse(args.content);
      const result = await data.updateSpreadsheetCells(updates);
      return { success: true, paneId, type: 'csv', ...result };
    } catch {
      return { success: false, error: 'For spreadsheets, content must be JSON array of {row, col, value}' };
    }
  }

  if (contentType === 'pptx' && data.updateSlideText) {
    try {
      const { shapeIndex, text, slideIndex } = JSON.parse(args.content);
      const result = await data.updateSlideText(shapeIndex, text, slideIndex);
      return { success: true, paneId, type: 'pptx', ...result };
    } catch {
      return { success: false, error: 'For presentations, content must be JSON {shapeIndex, text, slideIndex?}' };
    }
  }

  if (contentType === 'terminal') {
    await (window as any).api?.writeToTerminal?.({ id: data.contentId, data: args.content + '\n' });
    return { success: true, paneId, type: 'terminal', message: 'Sent to terminal' };
  }

  return { success: false, error: `Write not supported for pane type: ${contentType}` };
}

async function interact(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];
  if (!data) return { success: false, error: `Pane not found: ${paneId}` };
  if (!args.code) return { success: false, error: 'code is required' };

  const { contentType } = data;

  if (contentType === 'terminal') {
    await (window as any).api?.writeToTerminal?.({ id: data.contentId, data: args.code + '\n' });
    return { success: true, paneId, type: 'terminal', message: 'Command sent' };
  }

  if (contentType === 'browser' && data.browserEval) {
    try {
      const result = await data.browserEval(args.code);
      return { success: true, paneId, type: 'browser', result };
    } catch (e: any) {
      return { success: false, error: `Browser eval error: ${e.message || e}` };
    }
  }

  if (contentType === 'csv' && data.evalSpreadsheet) {
    try {
      const result = await data.evalSpreadsheet(args.code);
      return { success: true, paneId, type: 'csv', result };
    } catch (e: any) {
      return { success: false, error: `Spreadsheet eval error: ${e.message || e}` };
    }
  }

  if (contentType === 'docx' && data.evalDocument) {
    try {
      const result = await data.evalDocument(args.code);
      return { success: true, paneId, type: 'docx', result };
    } catch (e: any) {
      return { success: false, error: `Document eval error: ${e.message || e}` };
    }
  }

  if (contentType === 'pptx' && data.evalPresentation) {
    try {
      const result = await data.evalPresentation(args.code);
      return { success: true, paneId, type: 'pptx', result };
    } catch (e: any) {
      return { success: false, error: `Presentation eval error: ${e.message || e}` };
    }
  }

  return { success: false, error: `Interact not supported for pane type: ${contentType}` };
}

async function navigate_pane(
  args: { paneId?: string; target: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];
  if (!data) return { success: false, error: `Pane not found: ${paneId}` };
  if (!args.target) return { success: false, error: 'target is required' };

  const { contentType } = data;

  if (contentType === 'browser' && data.navigateTo) {
    await data.navigateTo(args.target);
    return { success: true, paneId, type: 'browser', url: args.target };
  }

  if (contentType === 'pptx' && data.goToSlide) {
    const idx = parseInt(args.target);
    if (isNaN(idx)) return { success: false, error: 'target must be a slide index number for presentations' };
    await data.goToSlide(idx);
    return { success: true, paneId, type: 'pptx', slideIndex: idx };
  }

  if (contentType === 'csv' && data.switchSheet) {
    await data.switchSheet(args.target);
    return { success: true, paneId, type: 'csv', sheet: args.target };
  }

  return { success: false, error: `Navigate not supported for pane type: ${contentType}` };
}

registerAction('read_pane', read_pane);
registerAction('write_file', write_file);
registerAction('write_pane', write_pane);
registerAction('get_selection', get_selection);
registerAction('run_terminal', run_terminal);
registerAction('interact', interact);
registerAction('navigate_pane', navigate_pane);
