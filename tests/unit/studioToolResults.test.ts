import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePaneAwareStreamListeners } from '../../src/renderer/components/utils';
import { executeStudioAction } from '../../src/renderer/studioActions';

vi.mock('../../src/renderer/studioActions', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        executeStudioAction: vi.fn().mockResolvedValue({ success: true, result: 'ok' }),
    };
});

describe('studio tool results', () => {
    it('lands the action result on the live tool card exactly once per call', async () => {
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
                {} as any,
                '/tmp',
                undefined
            )
        );

        const live = () => contentDataRef.current.pane1.chatMessages.allMessages[0];
        const execMock = vi.mocked(executeStudioAction);
        let resolveExec: (v: any) => void = () => {};
        execMock.mockImplementation(() => new Promise((res) => { resolveExec = res; }));

        dataHandler(null, {
            streamId: 'stream-1',
            chunk: { type: 'tool_start', name: 'studio.read_pane', args: { pane_id: 'active' }, id: 'c1' },
        });
        const beforeResult = live();
        expect(beforeResult.toolCalls).toHaveLength(1);
        expect(execMock).toHaveBeenCalledTimes(1);
        expect(execMock).toHaveBeenCalledWith('read_pane', { pane_id: 'active' }, expect.anything());

        dataHandler(null, {
            streamId: 'stream-1',
            chunk: { type: 'tool_start', name: 'studio.read_pane', args: { pane_id: 'other' }, id: 'c1' },
        });
        expect(live().toolCalls).toHaveLength(1);
        expect(live().toolCalls[0].function.arguments).toContain('other');
        expect(execMock).toHaveBeenCalledTimes(1);

        resolveExec({ success: true, result: 'ok' });
        await waitFor(() => {
            expect(live().toolCalls[0].status).toBe('complete');
        });
        expect(live().toolCalls[0].result_preview).toContain('ok');
        expect(live().contentParts.find((p: any) => p.type === 'tool_call').call.status).toBe('complete');
        expect(live()).not.toBe(beforeResult);
        expect(execMock).toHaveBeenCalledTimes(1);

        unmount();
    });
});
