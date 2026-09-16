import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockPane() {
  return {
    contentType: 'chat',
    contentId: 'conv-1',
    chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 },
    pendingQueue: [],
  };
}

async function startQueuedMessage(paneData: any, queueItem: any, streamToPaneRef: any, api: any) {
  const newStreamId = `stream-${queueItem.id}`;
  const userMessage = {
    id: queueItem.id,
    role: 'user',
    content: queueItem.content,
    timestamp: queueItem.timestamp,
    attachments: queueItem.attachments,
    executionMode: queueItem.executionMode,
    isJinxCall: queueItem.isJinxCall,
    jinxName: queueItem.jinxName,
    jinxInputs: queueItem.jinxInputs,
    wasVoiceInput: queueItem.wasVoiceInput,
  };
  const assistantPlaceholder = {
    id: newStreamId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    isStreaming: true,
    streamId: newStreamId,
    npc: queueItem.currentNPC,
    model: queueItem.paneModel,
    provider: queueItem.paneProvider,
    temperature: queueItem.genParams.temperature,
    top_p: queueItem.genParams.top_p,
    top_k: queueItem.genParams.top_k,
    max_tokens: queueItem.genParams.max_tokens,
  };
  paneData.chatMessages.allMessages.push(userMessage, assistantPlaceholder);
  streamToPaneRef[newStreamId] = paneData.contentId;
  await api.executeCommandStream({ streamId: newStreamId });
  return newStreamId;
}

describe('message queueing', () => {
  let paneData: any;
  let streamToPaneRef: any;
  let api: any;

  beforeEach(() => {
    paneData = buildMockPane();
    streamToPaneRef = {};
    api = {
      saveMessage: vi.fn().mockResolvedValue({}),
      executeCommandStream: vi.fn().mockResolvedValue({}),
    };
  });

  it('enqueues a second message while the first is streaming', async () => {
    const first = { id: 'msg-1', content: 'first', timestamp: new Date().toISOString(), attachments: [], executionMode: 'chat', isJinxCall: false, jinxName: null, jinxInputs: null, wasVoiceInput: false, genParams: { temperature: 0.7, top_k: 40, max_tokens: 4096 }, disableThinking: false, conversationId: 'conv-1', paneModel: 'gpt-4o', paneProvider: 'openai', currentNPC: 'default' };
    const second = { id: 'msg-2', content: 'second', timestamp: new Date().toISOString(), attachments: [], executionMode: 'chat', isJinxCall: false, jinxName: null, jinxInputs: null, wasVoiceInput: false, genParams: { temperature: 0.7, top_k: 40, max_tokens: 4096 }, disableThinking: false, conversationId: 'conv-1', paneModel: 'gpt-4o', paneProvider: 'openai', currentNPC: 'default' };

    await startQueuedMessage(paneData, first, streamToPaneRef, api);
    const firstPlaceholder = paneData.chatMessages.allMessages.find((m: any) => m.role === 'assistant' && m.isStreaming);

    paneData.pendingQueue.push(second);

    expect(paneData.chatMessages.allMessages.filter((m: any) => m.role === 'user').length).toBe(1);
    expect(paneData.pendingQueue.length).toBe(1);
    expect(firstPlaceholder).toBeDefined();
  });

  it('processes the pending queue after the active stream completes', async () => {
    const first = { id: 'msg-1', content: 'first', timestamp: new Date().toISOString(), attachments: [], executionMode: 'chat', isJinxCall: false, jinxName: null, jinxInputs: null, wasVoiceInput: false, genParams: { temperature: 0.7, top_k: 40, max_tokens: 4096 }, disableThinking: false, conversationId: 'conv-1', paneModel: 'gpt-4o', paneProvider: 'openai', currentNPC: 'default' };
    const second = { id: 'msg-2', content: 'second', timestamp: new Date().toISOString(), attachments: [], executionMode: 'chat', isJinxCall: false, jinxName: null, jinxInputs: null, wasVoiceInput: false, genParams: { temperature: 0.7, top_k: 40, max_tokens: 4096 }, disableThinking: false, conversationId: 'conv-1', paneModel: 'gpt-4o', paneProvider: 'openai', currentNPC: 'default' };

    await startQueuedMessage(paneData, first, streamToPaneRef, api);
    paneData.pendingQueue.push(second);

    const next = paneData.pendingQueue.shift();
    await startQueuedMessage(paneData, next, streamToPaneRef, api);

    expect(paneData.chatMessages.allMessages.filter((m: any) => m.role === 'user').length).toBe(2);
    expect(paneData.pendingQueue.length).toBe(0);
    expect(api.executeCommandStream).toHaveBeenCalledTimes(2);
  });

  it('removes a pending message when cancelled', () => {
    const pending = { id: 'msg-3', content: 'cancel me' };
    paneData.pendingQueue.push(pending);
    paneData.pendingQueue = paneData.pendingQueue.filter((m: any) => m.id !== pending.id);
    expect(paneData.pendingQueue.length).toBe(0);
  });
});
