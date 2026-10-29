import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessage } from '../../src/renderer/components/ChatMessage';

vi.mock('lucide-react', () => {
    const stub = () => null;
    return {
        Paperclip: stub,
        Tag: stub,
        Star: stub,
        ChevronDown: stub,
        ChevronUp: stub,
        ChevronRight: stub,
        Volume2: stub,
        VolumeX: stub,
        Loader: stub,
        RotateCcw: stub,
        SlidersHorizontal: stub,
        Bot: stub,
        Zap: stub,
        Cpu: stub,
        BarChart3: stub,
        X: stub,
        Globe: stub,
        Terminal: stub,
        FileText: stub,
        Layout: stub,
        Bell: stub,
        Calendar: stub,
        Compass: stub,
        Edit3: stub,
        Eye: stub,
        Play: stub,
        Wrench: stub,
    };
});

vi.mock('../../src/renderer/components/MarkdownRenderer', () => ({
    default: ({ content }: any) => <div data-testid="md">{content}</div>,
}));

const noopResend = vi.fn();
const noopOpen = vi.fn();

describe('ChatMessage live streaming', () => {
    it('paints in-place content, reasoning, and tool-call growth on same-reference rerender', () => {
        const msg: any = {
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
        };
        const { rerender } = render(
            <ChatMessage message={msg} onResendMessage={noopResend} onOpenFile={noopOpen} paneNodeId="pane-1" />
        );

        msg.content += 'Hello world';
        msg.contentParts.push({ type: 'text', content: 'Hello world' });
        rerender(
            <ChatMessage message={msg} onResendMessage={noopResend} onOpenFile={noopOpen} paneNodeId="pane-1" />
        );
        expect(screen.getByTestId('md')).toHaveTextContent('Hello world');

        msg.reasoningContent += 'Let me think';
        msg.contentParts.push({ type: 'reasoning', content: 'Let me think' });
        msg.toolCalls = [{ id: 'c1', type: 'function', function: { name: 'my_tool', arguments: '{}' }, status: 'running' }];
        msg.contentParts.push({ type: 'tool_call', call: msg.toolCalls[0] });
        rerender(
            <ChatMessage message={msg} onResendMessage={noopResend} onOpenFile={noopOpen} paneNodeId="pane-1" />
        );
        expect(screen.getByText('Thinking Process:')).toBeInTheDocument();
        expect(screen.getByText('my_tool')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Thinking Process:'));
        expect(screen.getAllByTestId('md').map((el) => el.textContent).join(' ')).toContain('Let me think');
    });

    it('keeps reloaded text alongside reasoning and tool calls as separate blocks', () => {
        const msg: any = {
            id: 'db-1',
            message_id: 'db-1',
            role: 'assistant',
            content: 'Full reply text',
            reasoningContent: 'some thoughts',
            toolCalls: [{ id: 'c1', type: 'function', function: { name: 'my_tool', arguments: '{}' }, status: 'complete', result_preview: 'done' }],
            contentParts: null,
            timestamp: new Date().toISOString(),
            isStreaming: false,
        };
        const { container } = render(
            <ChatMessage message={msg} onResendMessage={noopResend} onOpenFile={noopOpen} paneNodeId="pane-1" />
        );
        expect(screen.getByText('Thinking Process:')).toBeInTheDocument();
        expect(screen.getByText('Full reply text')).toBeInTheDocument();
        expect(screen.getByText('my_tool')).toBeInTheDocument();
        const html = container.innerHTML;
        expect(html.indexOf('Thinking Process:')).toBeLessThan(html.indexOf('Full reply text'));
        expect(html.indexOf('Full reply text')).toBeLessThan(html.indexOf('my_tool'));
    });

    it('does not duplicate text that already has a text part', () => {
        const msg: any = {
            id: 'stream-2',
            message_id: 'stream-2',
            role: 'assistant',
            content: 'Hello',
            reasoningContent: '',
            toolCalls: [],
            contentParts: [{ type: 'text', content: 'Hello' }],
            timestamp: new Date().toISOString(),
            isStreaming: true,
            streamId: 'stream-2',
        };
        render(
            <ChatMessage message={msg} onResendMessage={noopResend} onOpenFile={noopOpen} paneNodeId="pane-1" />
        );
        expect(screen.getAllByTestId('md')).toHaveLength(1);
    });
});
