import { describe, it, expect } from 'vitest';
import { getConversationStats } from '../../src/renderer/hooks/useLayoutManager';

describe('getConversationStats', () => {
  it('returns zeros for empty messages', () => {
    const stats = getConversationStats([]);
    expect(stats.messageCount).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it('returns zeros for null', () => {
    const stats = getConversationStats(null as any);
    expect(stats.messageCount).toBe(0);
  });

  it('counts tokens correctly', () => {
    const messages = [
      { role: 'user', input_tokens: 100 },
      { role: 'assistant', input_tokens: 0, output_tokens: 200, model: 'gpt-4', provider: 'openai', cost: 0.01 },
    ];
    const stats = getConversationStats(messages);
    expect(stats.messageCount).toBe(2);
    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(200);
    expect(stats.totalCost).toBe(0.01);
  });

  it('collects unique models and providers', () => {
    const messages = [
      { role: 'assistant', model: 'gpt-4', provider: 'openai', npc: 'coder' },
      { role: 'assistant', model: 'gpt-4', provider: 'openai', npc: 'writer' },
      { role: 'assistant', model: 'claude-3', provider: 'anthropic', npc: 'coder' },
    ];
    const stats = getConversationStats(messages);
    expect(stats.models.size).toBe(2);
    expect(stats.providers.size).toBe(2);
    expect(stats.agents.size).toBe(2);
  });

  it('excludes user messages from model/provider tracking', () => {
    const messages = [
      { role: 'user', model: 'should-not-count', provider: 'nope' },
      { role: 'assistant', model: 'gpt-4', provider: 'openai' },
    ];
    const stats = getConversationStats(messages);
    expect(stats.models.size).toBe(1);
    expect(stats.models.has('gpt-4')).toBe(true);
    expect(stats.models.has('should-not-count')).toBe(false);
  });

  it('handles messages with missing optional fields', () => {
    const messages = [
      { role: 'assistant' },
      { role: 'user' },
    ];
    const stats = getConversationStats(messages);
    expect(stats.messageCount).toBe(2);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
  });
});
