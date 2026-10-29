import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePaneAwareStreamListeners } from '../../src/renderer/components/utils';

describe('stream listener message identity', () => {
    it('publishes a new message object per chunk so views observe text, reasoning, and tool calls', () => {
        const placeholder: any = {
            id: 'stream-1',
            message_id: 'stream-1',
            role: 'assistant',
            content: '',
            reasoningContent: '',
            toolCalls: [],
            contentParts: null,
            timestamp: new Date().toISOString(),
            isStreaming: true,
            streamId: 'stream-1',
            parent_message_id: null,
            model: 'm',
            provider: 'p',
            npc: 'n',
        };
        const contentDataRef = {
            current: {
                pane1: {
                    contentId: 'c1',
                    executionMode: 'chat',
                    chatMessages: { allMessages: [placeholder], messages: [placeholder], displayedMessageCount: 20 },
                },
            },
        };
        const streamToPaneRef = { current: { 'stream-1': 'pane1' } };
        const listenersAttached = { current: false };
        const emitter = new EventTarget();
        let updates = 0;
        emitter.addEventListener('pane-update', () => {
            updates += 1;
        });
        let dataHandler: any;
        (window as any).api.onStreamData = vi.fn((h: any) => {
            dataHandler = h;
            return () => {};
        });
        (window as any).api.onStreamComplete = vi.fn(() => () => {});
        (window as any).api.onStreamError = vi.fn(() => () => {});
        (window as any).api.saveMessage = vi.fn().mockResolvedValue({});

        const { unmount } = renderHook(() =>
            usePaneAwareStreamListeners(
                { stream: true },
                listenersAttached as any,
                streamToPaneRef as any,
                contentDataRef as any,
                emitter,
                vi.fn(),
                vi.fn(),
                () => [],
                () => ({}),
                async () => {},
                null,
                '/tmp',
                undefined
            )
        );

        const live = () => contentDataRef.current.pane1.chatMessages.allMessages[0];

        const beforeReasoning = live();
        dataHandler(null, { streamId: 'stream-1', chunk: { choices: [{ delta: { reasoning_content: 'hmm' } }] } });
        const afterReasoning = live();
        expect(afterReasoning).not.toBe(beforeReasoning);
        expect(afterReasoning.reasoningContent).toBe('hmm');
        expect(afterReasoning.contentParts.some((p: any) => p.type === 'reasoning' && p.content === 'hmm')).toBe(true);

        dataHandler(null, { streamId: 'stream-1', chunk: { choices: [{ delta: { content: 'Hello' } }] } });
        const afterText = live();
        expect(afterText).not.toBe(afterReasoning);
        expect(afterText.content).toBe('Hello');
        expect(afterText.contentParts.some((p: any) => p.type === 'text' && p.content === 'Hello')).toBe(true);

        dataHandler(null, { streamId: 'stream-1', chunk: { type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' } });
        const afterTool = live();
        expect(afterTool).not.toBe(afterText);
        expect(afterTool.toolCalls).toHaveLength(1);
        expect(afterTool.toolCalls[0].function.name).toBe('my_tool');
        expect(afterTool.contentParts.some((p: any) => p.type === 'tool_call')).toBe(true);

        dataHandler(null, { streamId: 'stream-1', chunk: { type: 'tool_start', name: 'other_tool', args: {}, id: 'c2' } });
        const afterTool2 = live();
        expect(afterTool2).not.toBe(afterTool);
        expect(afterTool2.toolCalls).toHaveLength(2);
        expect(afterTool2.contentParts.filter((p: any) => p.type === 'tool_call')).toHaveLength(2);

        expect(contentDataRef.current.pane1.chatMessages.messages[0]).toBe(afterTool2);
        expect(updates).toBe(4);

        unmount();
    });
});
