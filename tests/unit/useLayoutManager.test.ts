import { describe, it, expect } from 'vitest';
import { removePaneFromTree } from '../../src/renderer/hooks/useLayoutManager';

describe('removePaneFromTree', () => {
  it('removes pane from 2-child split (returns sibling)', () => {
    const oldRoot = {
      id: 'root',
      type: 'split',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        { id: 'top', type: 'content' },
        { id: 'bottom', type: 'content' },
      ],
    };
    const result = removePaneFromTree(oldRoot, 'bottom', [1]);
    expect(result).toEqual({ id: 'top', type: 'content' });
  });

  it('removes pane from multi-child split', () => {
    const oldRoot = {
      id: 'root',
      type: 'split',
      direction: 'horizontal',
      sizes: [33, 33, 34],
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
        { id: 'c', type: 'content' },
      ],
    };
    const result = removePaneFromTree(oldRoot, 'b', [1]);
    expect(result.children).toHaveLength(2);
    expect(result.children[0].id).toBe('a');
    expect(result.children[1].id).toBe('c');
    expect(result.sizes).toEqual([50, 50]);
  });

  it('removes nested pane from split inside split', () => {
    const oldRoot = {
      id: 'root',
      type: 'split',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        { id: 'top', type: 'content' },
        {
          id: 'inner',
          type: 'split',
          direction: 'horizontal',
          sizes: [50, 50],
          children: [
            { id: 'left', type: 'content' },
            { id: 'right', type: 'content' },
          ],
        },
      ],
    };
    const result = removePaneFromTree(oldRoot, 'right', [1, 1]);
    expect(result.children[1]).toEqual({ id: 'left', type: 'content' });
  });

  it('removes first pane from 2-child split (returns other sibling)', () => {
    const oldRoot = {
      id: 'root',
      type: 'split',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        { id: 'top', type: 'content' },
        { id: 'bottom', type: 'content' },
      ],
    };
    const result = removePaneFromTree(oldRoot, 'top', [0]);
    expect(result).toEqual({ id: 'bottom', type: 'content' });
  });
});
