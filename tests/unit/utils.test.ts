import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  getFileName,
  getParentPath,
  generateId,
  stripSourcePrefix,
  hashContext,
  findNodeByPath,
  findNodePath,
} from '../../src/renderer/components/utils';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
  });

  it('removes trailing slash', () => {
    expect(normalizePath('/home/user/')).toBe('/home/user');
  });

  it('preserves root slash', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizePath(null)).toBe('');
    expect(normalizePath(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });
});

describe('getFileName', () => {
  it('extracts filename from path', () => {
    expect(getFileName('/home/user/file.txt')).toBe('file.txt');
  });

  it('handles Windows paths', () => {
    expect(getFileName('C:\\Users\\test\\file.txt')).toBe('file.txt');
  });

  it('returns empty string for null', () => {
    expect(getFileName(null)).toBe('');
    expect(getFileName(undefined)).toBe('');
  });

  it('handles path with no directory', () => {
    expect(getFileName('file.txt')).toBe('file.txt');
  });
});

describe('getParentPath', () => {
  it('returns parent directory', () => {
    expect(getParentPath('/home/user/file.txt')).toBe('/home/user');
  });

  it('handles Windows paths', () => {
    expect(getParentPath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test');
  });

  it('returns root for root-level file', () => {
    expect(getParentPath('/file.txt')).toBe('/');
  });

  it('returns empty string for null', () => {
    expect(getParentPath(null)).toBe('');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('has reasonable length', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(12);
  });
});

describe('stripSourcePrefix', () => {
  it('removes project: prefix', () => {
    expect(stripSourcePrefix('project:myfile')).toBe('myfile');
  });

  it('removes global: prefix', () => {
    expect(stripSourcePrefix('global:settings')).toBe('settings');
  });

  it('leaves unprefixed strings alone', () => {
    expect(stripSourcePrefix('somefile')).toBe('somefile');
  });

  it('returns empty string for null/undefined', () => {
    expect(stripSourcePrefix(null)).toBe('');
    expect(stripSourcePrefix(undefined)).toBe('');
  });
});

describe('hashContext', () => {
  it('returns a base64 string', () => {
    const hash = hashContext([{ type: 'file', path: '/test.txt', content: 'hello' }]);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('returns same hash for same input', () => {
    const ctx = [{ type: 'file', path: '/test.txt', content: 'hello' }];
    expect(hashContext(ctx)).toBe(hashContext(ctx));
  });

  it('returns different hash for different input', () => {
    const a = hashContext([{ type: 'file', path: '/a.txt', content: 'hello' }]);
    const b = hashContext([{ type: 'file', path: '/b.txt', content: 'world' }]);
    expect(a).not.toBe(b);
  });

  it('handles empty array', () => {
    const hash = hashContext([]);
    expect(typeof hash).toBe('string');
  });
});

describe('findNodeByPath', () => {
  const tree = {
    id: 'root',
    type: 'split',
    children: [
      { id: 'a', type: 'pane' },
      {
        id: 'b',
        type: 'split',
        children: [
          { id: 'c', type: 'pane' },
          { id: 'd', type: 'pane' },
        ],
      },
    ],
  };

  it('returns root for empty path', () => {
    expect(findNodeByPath(tree, [])).toBe(tree);
  });

  it('finds first child', () => {
    expect(findNodeByPath(tree, [0])).toBe(tree.children[0]);
  });

  it('finds nested child', () => {
    expect(findNodeByPath(tree, [1, 0])).toBe(tree.children[1].children[0]);
  });

  it('returns null for invalid path', () => {
    expect(findNodeByPath(tree, [5])).toBeNull();
  });

  it('returns null for null node', () => {
    expect(findNodeByPath(null, [0])).toBeNull();
  });
});

describe('findNodePath', () => {
  const tree = {
    id: 'root',
    type: 'split',
    children: [
      { id: 'a', type: 'pane' },
      {
        id: 'b',
        type: 'split',
        children: [
          { id: 'c', type: 'pane' },
          { id: 'd', type: 'pane' },
        ],
      },
    ],
  };

  it('finds root node', () => {
    expect(findNodePath(tree, 'root')).toEqual([]);
  });

  it('finds first-level child', () => {
    expect(findNodePath(tree, 'a')).toEqual([0]);
  });

  it('finds nested child', () => {
    expect(findNodePath(tree, 'c')).toEqual([1, 0]);
    expect(findNodePath(tree, 'd')).toEqual([1, 1]);
  });

  it('returns null for non-existent id', () => {
    expect(findNodePath(tree, 'xyz')).toBeNull();
  });

  it('returns null for null tree', () => {
    expect(findNodePath(null, 'a')).toBeNull();
  });
});
