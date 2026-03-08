

import { registerAction, StudioContext, StudioActionResult } from './index';

async function notify(
  args: { message: string; type?: 'info' | 'success' | 'warning' | 'error'; duration?: number },
  _ctx: StudioContext
): Promise<StudioActionResult> {
  const { message, type = 'info', duration = 3000 } = args;

  if (!message) {
    return { success: false, error: 'message is required' };
  }

  try {

    console.log(`[${type.toUpperCase()}] ${message}`);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Incognide', { body: message });
      }
    }

    return {
      success: true,
      message,
      type,
      duration
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to show notification'
    };
  }
}

async function confirm(
  args: { message: string; title?: string },
  _ctx: StudioContext
): Promise<StudioActionResult> {
  const { message, title = 'Confirm' } = args;

  if (!message) {
    return { success: false, error: 'message is required' };
  }

  const confirmed = window.confirm(`${title}\n\n${message}`);

  return {
    success: true,
    confirmed,
    message
  };
}

async function open_file_picker(
  args: { type?: 'file' | 'directory'; multiple?: boolean; filters?: any[] },
  _ctx: StudioContext
): Promise<StudioActionResult> {
  const { type = 'file', multiple = false } = args;

  try {

    const result = await (window as any).api?.showOpenDialog?.({
      properties: [
        type === 'directory' ? 'openDirectory' : 'openFile',
        ...(multiple ? ['multiSelections'] : [])
      ]
    });

    if (!result || result.canceled) {
      return {
        success: true,
        canceled: true,
        paths: []
      };
    }

    return {
      success: true,
      canceled: false,
      paths: result.filePaths || []
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open file picker'
    };
  }
}

async function send_message(
  args: { paneId?: string; message: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { message } = args;

  if (!message) {
    return { success: false, error: 'message is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'chat') {
    return { success: false, error: `Pane is not a chat: ${data.contentType}` };
  }

  return {
    success: true,
    paneId,
    message,
    note: 'Message queued for sending'
  };
}

async function switch_npc(
  args: { paneId?: string; npcName: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { npcName } = args;

  if (!npcName) {
    return { success: false, error: 'npcName is required' };
  }

  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];

  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }

  if (data.contentType !== 'chat') {
    return { success: false, error: `Pane is not a chat: ${data.contentType}` };
  }

  ctx.contentDataRef.current[paneId] = {
    ...data,
    selectedNpc: npcName
  };

  return {
    success: true,
    paneId,
    npcName
  };
}

registerAction('notify', notify);
registerAction('confirm', confirm);
registerAction('open_file_picker', open_file_picker);
registerAction('send_message', send_message);
registerAction('switch_npc', switch_npc);
