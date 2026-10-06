import { describe, it, expect } from 'vitest';
import { mergeToolCalls, StreamingToolCall } from '../../src/renderer/components/utils';

describe('mergeToolCalls', () => {
  it('preserves order for full tool_calls arrays matched by id', () => {
    const existing: StreamingToolCall[] = [];
    const incoming: StreamingToolCall[] = [
      { id: 'call_1', function: { name: 'foo', arguments: '' } },
      { id: 'call_2', function: { name: 'bar', arguments: '' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged.map(tc => tc.id)).toEqual(['call_1', 'call_2']);
    expect(merged.map(tc => tc.function?.name)).toEqual(['foo', 'bar']);
  });

  it('updates arguments in place without changing order', () => {
    const existing: StreamingToolCall[] = [
      { id: 'call_1', function: { name: 'foo', arguments: '' } },
      { id: 'call_2', function: { name: 'bar', arguments: '' } }
    ];
    const incoming: StreamingToolCall[] = [
      { id: 'call_2', function: { name: 'bar', arguments: '{"x":1}' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged.map(tc => tc.id)).toEqual(['call_1', 'call_2']);
    expect(merged[1].function?.arguments).toBe('{"x":1}');
  });

  it('handles OpenAI-style index deltas', () => {
    let merged: StreamingToolCall[] = [];
    merged = mergeToolCalls(merged, [
      { index: 0, id: 'call_a', function: { name: 'foo', arguments: '' } }
    ]);
    merged = mergeToolCalls(merged, [
      { index: 1, id: 'call_b', function: { name: 'bar', arguments: '' } }
    ]);
    merged = mergeToolCalls(merged, [
      { index: 0, function: { arguments: '{"a":1}' } }
    ]);
    merged = mergeToolCalls(merged, [
      { index: 1, function: { arguments: '{"b":2}' } }
    ]);

    expect(merged.map(tc => tc.id)).toEqual(['call_a', 'call_b']);
    expect(merged[0].function?.arguments).toBe('{"a":1}');
    expect(merged[1].function?.arguments).toBe('{"b":2}');
  });

  it('does not move the first call to the end when later chunks omit it', () => {
    const existing: StreamingToolCall[] = [
      { id: 'call_1', function: { name: 'foo', arguments: '' } },
      { id: 'call_2', function: { name: 'bar', arguments: '' } }
    ];
    // Simulate a backend chunk that only lists the second call, then re-lists both.
    const incoming: StreamingToolCall[] = [
      { id: 'call_2', function: { name: 'bar', arguments: '{"x":1}' } },
      { id: 'call_1', function: { name: 'foo', arguments: '{"y":2}' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged.map(tc => tc.id)).toEqual(['call_1', 'call_2']);
    expect(merged[0].function?.arguments).toBe('{"y":2}');
    expect(merged[1].function?.arguments).toBe('{"x":1}');
  });

  it('does not duplicate a completed call when the same id is reused', () => {
    const existing: StreamingToolCall[] = [
      { id: 'call_0', function: { name: 'foo', arguments: '' }, status: 'complete', result_preview: 'done' }
    ];
    // New assistant iteration reuses call_0 for a brand new call.
    const incoming: StreamingToolCall[] = [
      { id: 'call_0', function: { name: 'bar', arguments: '' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('call_0');
    expect(merged[0].function?.name).toBe('foo');
    expect(merged[0].status).toBe('complete');
    expect(merged[1].function?.name).toBe('bar');
    expect(merged[1].id).not.toBe('call_0');
    expect(merged[1].id).toContain('call_0');
  });

  it('matches id-less argument deltas to the recent id-less call with the same name', () => {
    const existing: StreamingToolCall[] = [
      { function: { name: 'foo', arguments: '' } }
    ];
    const incoming: StreamingToolCall[] = [
      { function: { name: 'foo', arguments: '{"a":1}' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].function?.arguments).toBe('{"a":1}');
  });

  it('extends the array when an index appears beyond the current length', () => {
    const existing: StreamingToolCall[] = [
      { id: 'call_0', function: { name: 'foo', arguments: '' } }
    ];
    const incoming: StreamingToolCall[] = [
      { index: 3, id: 'call_3', function: { name: 'baz', arguments: '' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged).toHaveLength(4);
    expect(merged[0].id).toBe('call_0');
    expect(merged[3].id).toBe('call_3');
  });

  it('keeps placeholder entries so future index deltas can fill them', () => {
    const existing: StreamingToolCall[] = [
      { id: 'call_0', function: { name: 'foo', arguments: '' } }
    ];
    const incoming: StreamingToolCall[] = [
      { index: 2, id: 'call_2', function: { name: 'bar', arguments: '' } }
    ];
    const merged = mergeToolCalls(existing, incoming);
    expect(merged.map(tc => tc.id)).toEqual(['call_0', '', 'call_2']);
    expect(merged[1].function?.name).toBe('');
  });

  it('appends streaming argument chunks instead of replacing them', () => {
    let merged: StreamingToolCall[] = [];
    merged = mergeToolCalls(merged, [
      { index: 0, id: 'call_a', function: { name: 'foo', arguments: '{"a"' } }
    ]);
    merged = mergeToolCalls(merged, [
      { index: 0, function: { arguments: ':1}' } }
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('call_a');
    expect(merged[0].function?.arguments).toBe('{"a":1}');
  });

  it('does not replace the first/top call when a same-name second call receives a delta', () => {
    let merged: StreamingToolCall[] = [];
    merged = mergeToolCalls(merged, [
      { index: 0, function: { name: 'browser_click', arguments: '' } },
      { index: 1, function: { name: 'browser_click', arguments: '' } }
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].function?.name).toBe('browser_click');
    expect(merged[1].function?.name).toBe('browser_click');
    expect(merged[0].internalId).toBeDefined();
    expect(merged[1].internalId).toBeDefined();
    expect(merged[0].internalId).not.toBe(merged[1].internalId);

    merged = mergeToolCalls(merged, [
      { index: 1, function: { arguments: '{"selector":"#save"}' } }
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].function?.arguments).toBe('');
    expect(merged[1].function?.arguments).toBe('{"selector":"#save"}');
  });

  it('keeps stable internal identity when an external id appears after id-less deltas', () => {
    let merged: StreamingToolCall[] = [];
    merged = mergeToolCalls(merged, [
      { index: 0, function: { name: 'browser_click', arguments: '' } }
    ]);
    const firstInternalId = merged[0].internalId;

    merged = mergeToolCalls(merged, [
      { index: 0, id: 'call_abc', function: { arguments: '{"selector":"#save"}' } }
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('call_abc');
    expect(merged[0].internalId).toBe(firstInternalId);
  });
});
