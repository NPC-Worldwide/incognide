import { describe, it, expect } from 'vitest';
import {
  collectPaneIds,
  buildBalancedGridLayout,
  addPaneToLayout,
  syncLayoutWithContentData,
  forceFullRerender,
} from '../../src/renderer/components/LayoutNode';

describe('collectPaneIds', () => {
  it('returns id for a single pane node', () => {
    const node = { id: 'pane1', type: 'content' };
    expect(collectPaneIds(node)).toEqual(['pane1']);
  });

  it('collects ids from split nodes', () => {
    const node = {
      id: 'split1',
      type: 'split',
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
      ],
    };
    const ids = collectPaneIds(node);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toHaveLength(2);
  });

  it('handles deeply nested splits', () => {
    const node = {
      id: 'root',
      type: 'split',
      children: [
        { id: 'a', type: 'content' },
        {
          id: 'inner',
          type: 'split',
          children: [
            { id: 'b', type: 'content' },
            { id: 'c', type: 'content' },
          ],
        },
      ],
    };
    expect(collectPaneIds(node)).toHaveLength(3);
  });

  it('returns empty array for null', () => {
    expect(collectPaneIds(null)).toEqual([]);
  });
});

describe('buildBalancedGridLayout', () => {
  it('returns single pane for one id', () => {
    const layout = buildBalancedGridLayout(['pane1']);
    expect(layout.id).toBe('pane1');
    expect(layout.type).toBe('content');
  });

  it('creates split for two panes', () => {
    const layout = buildBalancedGridLayout(['a', 'b']);
    expect(layout.type).toBe('split');
    expect(layout.children).toHaveLength(2);
  });

  it('creates balanced layout for multiple panes', () => {
    const layout = buildBalancedGridLayout(['a', 'b', 'c', 'd']);
    expect(layout.type).toBe('split');
    const allIds = collectPaneIds(layout);
    expect(allIds).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
  });

  it('returns null for empty array', () => {
    const layout = buildBalancedGridLayout([]);
    expect(layout).toBeNull();
  });
});

describe('addPaneToLayout', () => {
  it('creates root pane when layout is null', () => {
    const layout = addPaneToLayout(null, 'pane1');
    expect(layout.id).toBe('pane1');
    expect(layout.type).toBe('content');
  });

  it('creates split when adding to existing content node', () => {
    const existing = { id: 'a', type: 'content' };
    const layout = addPaneToLayout(existing, 'b');
    expect(layout.type).toBe('split');
    const ids = collectPaneIds(layout);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('adds to existing split', () => {
    const existing = {
      id: 'split1',
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
      ],
    };
    const layout = addPaneToLayout(existing, 'c');
    const ids = collectPaneIds(layout);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
  });
});

describe('syncLayoutWithContentData', () => {
  it('returns null for null layout', () => {
    expect(syncLayoutWithContentData(null, {})).toBeNull();
  });

  it('keeps panes that exist in contentData', () => {
    const layout = {
      id: 'split1',
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
      ],
    };
    const contentData = { a: { contentType: 'editor' }, b: { contentType: 'terminal' } };
    const result = syncLayoutWithContentData(layout, contentData);
    const ids = collectPaneIds(result);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('removes panes not in contentData', () => {
    const layout = {
      id: 'split1',
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
      ],
    };
    const contentData = { a: { contentType: 'editor' } };
    const result = syncLayoutWithContentData(layout, contentData);
    const ids = collectPaneIds(result);
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });
});

describe('forceFullRerender', () => {
  it('returns new object reference', () => {
    const root = { id: 'a', type: 'content' };
    const result = forceFullRerender(root);
    expect(result).not.toBe(root);
    expect(result.id).toBe('a');
  });

  it('handles split with children', () => {
    const root = {
      id: 'split1',
      type: 'split',
      children: [
        { id: 'a', type: 'content' },
        { id: 'b', type: 'content' },
      ],
    };
    const result = forceFullRerender(root);
    expect(result).not.toBe(root);
    expect(result.children[0]).not.toBe(root.children[0]);
  });

  it('returns null for null input', () => {
    expect(forceFullRerender(null)).toBeNull();
  });
});
