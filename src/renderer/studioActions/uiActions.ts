import { registerAction, StudioContext, StudioActionResult } from './index';

export interface PromptData {
  id: string;
  message: string;
  prompt_type: 'choices' | 'confirm' | 'text' | 'form';
  options: any;
  response?: any;
  respondedAt?: string;
}

const _pendingResolvers: Map<string, (value: any) => void> = new Map();

export function resolvePrompt(promptId: string, value: any): void {
  const resolve = _pendingResolvers.get(promptId);
  if (resolve) {
    resolve(value);
    _pendingResolvers.delete(promptId);
  }
}

function findChatPaneData(ctx: StudioContext, paneId?: string): any {
  const targetId = (!paneId || paneId === 'active') ? ctx.activeContentPaneId : paneId;
  const data = ctx.contentDataRef.current[targetId];
  if ((data?.contentType === 'chat' || data?.contentType === 'agent')) return { paneData: data, paneId: targetId };

  for (const [id, d] of Object.entries(ctx.contentDataRef.current)) {
    if ((d as any)?.contentType === 'chat' || (d as any)?.contentType === 'agent') return { paneData: d, paneId: id };
  }
  return { paneData: null, paneId: null };
}

async function prompt_user(
  args: { message: string; prompt_type?: string; options?: any; pane_id?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const { message, prompt_type = 'choices' } = args;
  let options = args.options;

  if (!message) {
    return { success: false, error: 'message is required' };
  }

  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = []; }
  }

  const promptId = `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const promptData: PromptData = {
    id: promptId,
    message,
    prompt_type: prompt_type as PromptData['prompt_type'],
    options: options || [],
  };

  const { paneData, paneId } = findChatPaneData(ctx, args.pane_id);
  if (paneData?.chatMessages) {
    const promptMsg = {
      id: `msg_${promptId}`,
      role: 'prompt',
      content: message,
      promptData,
      timestamp: new Date().toISOString(),
    };
    paneData.chatMessages.allMessages.push(promptMsg);
    paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(
      -(paneData.chatMessages.displayedMessageCount || 20)
    );

    if (ctx.notifyPaneUpdate && paneId) {
      ctx.notifyPaneUpdate(paneId);
    }
  }

  const userResponse = await new Promise<any>((resolve) => {
    _pendingResolvers.set(promptId, resolve);
  });

  if (paneData?.chatMessages) {
    const msg = paneData.chatMessages.allMessages.find(
      (m: any) => m.id === `msg_${promptId}`
    );
    if (msg) {
      msg.promptData = { ...promptData, response: userResponse, respondedAt: new Date().toISOString() };
    }
    paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(
      -(paneData.chatMessages.displayedMessageCount || 20)
    );
    if (paneData.notifyUpdate) {
      paneData.notifyUpdate();
    }
  }

  return {
    success: true,
    promptId,
    prompt_type,
    response: userResponse,
  };
}

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

  if ((data.contentType !== 'chat' && data.contentType !== 'agent')) {
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

  if ((data.contentType !== 'chat' && data.contentType !== 'agent')) {
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

registerAction('prompt_user', prompt_user);
registerAction('notify', notify);
registerAction('confirm', confirm);
registerAction('open_file_picker', open_file_picker);
registerAction('send_message', send_message);
registerAction('switch_npc', switch_npc);
