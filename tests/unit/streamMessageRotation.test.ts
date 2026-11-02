import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePaneAwareStreamListeners, handleInterruptStream } from '../../src/renderer/components/utils';

const setupStream = (parseFn: any = () => []) => {
    const placeholder: any = {
        id: 'stream-1',
        message_id: 'stream-1',
        role: 'assistant',
        content: '',
        reasoningContent: '',
        toolCalls: [],
        contentParts: [],
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
    let dataHandler: any;
    let completeHandler: any;
    (window as any).api.onStreamData = vi.fn((h: any) => {
        dataHandler = h;
        return () => {};
    });
    (window as any).api.onStreamComplete = vi.fn((h: any) => {
        completeHandler = h;
        return () => {};
    });
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
            parseFn,
            () => ({}),
            async () => {},
            null,
            '/tmp',
            undefined
        )
    );

    return {
        unmount,
        send: (chunk: any) => dataHandler(null, { streamId: 'stream-1', chunk }),
        complete: () => completeHandler(null, { streamId: 'stream-1' }),
        all: () => contentDataRef.current.pane1.chatMessages.allMessages,
        refs: { contentDataRef, streamToPaneRef },
        notify: vi.fn(),
    };
};

describe('stream message rotation', () => {
    it('opens a new message when text resumes after a tool call comes back', () => {
        const { send, all, unmount } = setupStream();

        send({ choices: [{ delta: { content: 'Q' } }] });
        send({ type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' });
        send({ type: 'tool_complete', name: 'my_tool', id: 'c1', result_preview: 'r1' });
        send({ choices: [{ delta: { content: 'A' } }] });

        expect(all()).toHaveLength(2);
        const [first, second] = all();
        expect(first.content).toBe('Q');
        expect(first.toolCalls).toHaveLength(1);
        expect(first.toolCalls[0].status).toBe('complete');
        expect(first.contentParts.map((p: any) => p.type)).toEqual(['text', 'tool_call']);
        expect(first.isStreaming).toBe(false);
        expect(second.content).toBe('A');
        expect(second.id).not.toBe(first.id);
        expect(second.streamId).toBe('stream-1');
        expect(second.isStreaming).toBe(true);

        unmount();
    });

    it('keeps narration with a running tool and never reorders blocks', () => {
        const { send, all, unmount } = setupStream();

        send({ choices: [{ delta: { content: 't1' } }] });
        send({ type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' });
        send({ choices: [{ delta: { content: 't2' } }] });
        send({ type: 'tool_start', name: 'other_tool', args: {}, id: 'c2' });

        expect(all()).toHaveLength(1);
        const parts = all()[0].contentParts;
        expect(parts.map((p: any) => (p.type === 'tool_call' ? p.call.id : `${p.type}:${p.content}`))).toEqual([
            'text:t1',
            'c1',
            'text:t2',
            'c2',
        ]);

        unmount();
    });

    it('parses agent edits from the full resumed text, not just the last bubble', async () => {
        const parseFn = vi.fn(() => []);
        const { send, all, complete, unmount } = setupStream(parseFn);

        send({ choices: [{ delta: { content: 'FILE: a\n' } }] });
        send({ type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' });
        send({ type: 'tool_complete', name: 'my_tool', id: 'c1', result_preview: 'r1' });
        send({ choices: [{ delta: { content: 'REASONING: b\n' } }] });
        expect(all()).toHaveLength(2);

        all().unshift({ id: 'u1', message_id: 'u1', role: 'user', content: 'do it', executionMode: 'tool_agent', timestamp: new Date().toISOString() });
        await complete();

        expect(parseFn).toHaveBeenCalledWith('FILE: a\nREASONING: b\n', expect.anything());

        unmount();
    });

    it('attributes usage as deltas so rotated bubbles sum to the true totals', () => {
        const { send, all, unmount } = setupStream();

        send({ choices: [{ delta: { content: 'Q' } }] });
        send({ type: 'usage', input_tokens: 100, output_tokens: 10, cost: 0.01 });
        send({ type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' });
        send({ type: 'tool_complete', name: 'my_tool', id: 'c1', result_preview: 'r1' });
        send({ choices: [{ delta: { content: 'A' } }] });
        send({ type: 'usage', input_tokens: 250, output_tokens: 30, cost: 0.03 });

        expect(all()).toHaveLength(2);
        const [first, second] = all();
        expect([first.input_tokens, first.output_tokens]).toEqual([100, 10]);
        expect(first.cost).toBeCloseTo(0.01, 10);
        expect([second.input_tokens, second.output_tokens]).toEqual([150, 20]);
        expect(second.cost).toBeCloseTo(0.02, 10);
        expect(all().reduce((s: number, m: any) => s + m.input_tokens, 0)).toBe(250);
        expect(all().reduce((s: number, m: any) => s + m.output_tokens, 0)).toBe(30);
        expect(all().reduce((s: number, m: any) => s + m.cost, 0)).toBeCloseTo(0.03, 10);

        unmount();
    });

    it('ignores duplicate usage snapshots instead of double counting', () => {
        const { send, all, unmount } = setupStream();

        send({ choices: [{ delta: { content: 'Q' } }] });
        send({ type: 'usage', input_tokens: 100, output_tokens: 10, cost: 0.01 });
        send({ type: 'usage', input_tokens: 100, output_tokens: 10, cost: 0.01 });

        expect(all()).toHaveLength(1);
        expect([all()[0].input_tokens, all()[0].output_tokens, all()[0].cost]).toEqual([100, 10, 0.01]);

        unmount();
    });

    it('lands the interrupt marker on the latest bubble, not the first', async () => {
        const { send, all, refs, notify, unmount } = setupStream();

        send({ choices: [{ delta: { content: 'Q' } }] });
        send({ type: 'tool_start', name: 'my_tool', args: { x: 1 }, id: 'c1' });
        send({ type: 'tool_complete', name: 'my_tool', id: 'c1', result_preview: 'r1' });
        send({ choices: [{ delta: { content: 'A' } }] });
        expect(all()).toHaveLength(2);

        (window as any).api.interruptStream = vi.fn().mockResolvedValue({});
        await handleInterruptStream('pane1', refs.contentDataRef as any, refs.streamToPaneRef as any, vi.fn(), notify, '/tmp');

        const [first, second] = all();
        expect(first.content).toBe('Q');
        expect(second.content).toContain('[Stream Interrupted by User]');

        unmount();
    });
});
