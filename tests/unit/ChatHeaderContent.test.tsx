import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatHeaderContent from '../../src/renderer/components/pane-headers/ChatHeaderContent';

vi.mock('lucide-react', () => ({
  BarChart3: () => <span data-testid="bar-chart-icon" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
}));

describe('ChatHeaderContent', () => {
  it('displays cost and tokens in the top row when stats are available', () => {
    const stats = {
      messageCount: 5,
      inputTokens: 1200,
      outputTokens: 3400,
      totalCost: 0.0523,
      models: new Set(['gpt-4']),
      agents: new Set(['coder']),
      providers: new Set(['openai']),
    };

    render(
      <ChatHeaderContent
        icon={<span>icon</span>}
        title="Agent session"
        chatStats={stats}
        autoScrollEnabled={true}
        setAutoScrollEnabled={vi.fn()}
      />
    );

    expect(screen.getByText('5m')).toBeInTheDocument();
    expect(screen.getByText('· 4.6ktok')).toBeInTheDocument();
    expect(screen.getByText('· $0.0523')).toBeInTheDocument();
  });

  it('shows a live indicator while streaming', () => {
    const stats = {
      messageCount: 2,
      inputTokens: 100,
      outputTokens: 200,
      totalCost: 0.005,
      models: new Set(),
      agents: new Set(),
      providers: new Set(),
    };

    const { container } = render(
      <ChatHeaderContent
        icon={<span>icon</span>}
        title="Agent session"
        chatStats={stats}
        autoScrollEnabled={true}
        setAutoScrollEnabled={vi.fn()}
        isStreaming={true}
      />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('expands to show detailed stats when clicked', () => {
    const stats = {
      messageCount: 3,
      inputTokens: 500,
      outputTokens: 1000,
      totalCost: 0.02,
      models: new Set(['gpt-4']),
      agents: new Set(['coder']),
      providers: new Set(['openai']),
    };

    render(
      <ChatHeaderContent
        icon={<span>icon</span>}
        title="Agent session"
        chatStats={stats}
        autoScrollEnabled={true}
        setAutoScrollEnabled={vi.fn()}
      />
    );

    const statsButton = screen.getByText('3m').closest('button')!;
    fireEvent.click(statsButton);

    expect(screen.getByText('Input tokens:')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('$0.0200')).toBeInTheDocument();
  });
});
