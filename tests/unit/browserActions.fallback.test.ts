import { describe, it, expect, vi } from 'vitest';
import '../../src/renderer/studioActions/paneActions';
import '../../src/renderer/studioActions/contentActions';
import '../../src/renderer/studioActions/browserActions';
import { executeStudioAction } from '../../src/renderer/studioActions';

function makeCtx(overrides: any = {}) {
  const contentData = overrides.contentData || {};
  return {
    activeContentPaneId: overrides.activeContentPaneId || 'active',
    contentDataRef: { current: contentData },
    rootLayoutNode: overrides.rootLayoutNode || null,
    setActiveContentPaneId: vi.fn(),
    setRootLayoutNode: vi.fn(),
    performSplit: vi.fn(),
    closeContentPane: vi.fn(),
    updateContentPane: vi.fn(),
    generateId: vi.fn(() => Math.random().toString(36).slice(2)),
    findPanePath: vi.fn(),
    notifyPaneUpdate: vi.fn(),
    windowId: 'test',
    currentPath: '/test',
    ...overrides.ctx
  };
}

function contentNode(id: string) {
  return { id, type: 'content' };
}

describe('browser action pane fallback', () => {
  it('browser_click targets the active browser pane when it is active', async () => {
    const contentData = {
      browser1: {
        contentType: 'browser',
        browserClick: vi.fn().mockResolvedValue({ success: true, clicked: true }),
        lastActiveAt: 1000
      }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'browser1',
      contentData,
      rootLayoutNode: contentNode('browser1')
    });

    const result = await executeStudioAction('browser_click', { selector: 'button' }, ctx);

    expect(result.success).toBe(true);
    expect(result.paneId).toBe('browser1');
    expect(contentData.browser1.browserClick).toHaveBeenCalledWith('button', { text: undefined, index: undefined });
    expect(contentData.browser1.lastActiveAt).toBeGreaterThan(1000);
  });

  it('browser_click falls back to the most recent browser pane when active pane is agent', async () => {
    const browserClick1 = vi.fn().mockResolvedValue({ success: true });
    const browserClick2 = vi.fn().mockResolvedValue({ success: true, clicked: true });
    const contentData = {
      agent1: { contentType: 'agent' },
      browser1: { contentType: 'browser', browserClick: browserClick1, lastActiveAt: 1000 },
      browser2: { contentType: 'browser', browserClick: browserClick2, lastActiveAt: 2000 }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'agent1',
      contentData,
      rootLayoutNode: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        sizes: [33, 33, 34],
        children: [contentNode('agent1'), contentNode('browser1'), contentNode('browser2')]
      }
    });

    const result = await executeStudioAction('browser_click', { text: 'Submit' }, ctx);

    expect(result.success).toBe(true);
    expect(result.paneId).toBe('browser2');
    expect(browserClick2).toHaveBeenCalledWith('', { text: 'Submit', index: undefined });
    expect(browserClick1).not.toHaveBeenCalled();
    expect(contentData.browser2.lastActiveAt).toBeGreaterThan(2000);
  });

  it('browser_click returns an error when there is no browser pane', async () => {
    const contentData = {
      agent1: { contentType: 'agent' },
      editor1: { contentType: 'editor' }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'agent1',
      contentData,
      rootLayoutNode: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [contentNode('agent1'), contentNode('editor1')]
      }
    });

    const result = await executeStudioAction('browser_click', { selector: 'button' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No browser pane found/i);
  });

  it('browser_type updates lastActiveAt and returns pane info', async () => {
    const browserType = vi.fn().mockResolvedValue({ success: true, typed: true });
    const contentData = {
      agent1: { contentType: 'agent' },
      browser1: { contentType: 'browser', browserType, lastActiveAt: 500 }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'agent1',
      contentData,
      rootLayoutNode: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [contentNode('agent1'), contentNode('browser1')]
      }
    });

    const result = await executeStudioAction('browser_type', { selector: '#q', text: 'hello' }, ctx);

    expect(result.success).toBe(true);
    expect(result.paneId).toBe('browser1');
    expect(browserType).toHaveBeenCalledWith('#q', 'hello', { clear: undefined, submit: undefined });
    expect(contentData.browser1.lastActiveAt).toBeGreaterThan(500);
  });

  it('interact falls back from agent pane to a browser pane', async () => {
    const browserEval = vi.fn().mockResolvedValue({ success: true, result: 'reddit' });
    const contentData = {
      agent1: { contentType: 'agent' },
      browser1: { contentType: 'browser', browserEval, lastActiveAt: 1234 }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'agent1',
      contentData,
      rootLayoutNode: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [contentNode('agent1'), contentNode('browser1')]
      }
    });

    const result = await executeStudioAction('interact', { code: 'document.body.innerText' }, ctx);

    expect(result.success).toBe(true);
    expect(result.paneId).toBe('browser1');
    expect(result.type).toBe('browser');
    expect(browserEval).toHaveBeenCalledWith('document.body.innerText');
  });

  it('interact does not fall back when the active pane already supports code', async () => {
    const terminalWrite = vi.fn().mockResolvedValue({ success: true });
    const browserEval = vi.fn().mockResolvedValue({ success: true });
    const contentData = {
      terminal1: { contentType: 'terminal', contentId: 'term-1' },
      browser1: { contentType: 'browser', browserEval, lastActiveAt: 1234 }
    };
    const ctx = makeCtx({
      activeContentPaneId: 'terminal1',
      contentData,
      rootLayoutNode: {
        id: 'root',
        type: 'split',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [contentNode('terminal1'), contentNode('browser1')]
      }
    });

    // writeToTerminal lives on window.api, so mock it for this test.
    const originalWriteToTerminal = (window as any).api?.writeToTerminal;
    (window as any).api = { ...(window as any).api, writeToTerminal: terminalWrite };

    try {
      const result = await executeStudioAction('interact', { code: 'ls -la' }, ctx);
      expect(result.success).toBe(true);
      expect(result.paneId).toBe('terminal1');
      expect(result.type).toBe('terminal');
      expect(terminalWrite).toHaveBeenCalledWith({ id: 'term-1', data: 'ls -la\n' });
      expect(browserEval).not.toHaveBeenCalled();
    } finally {
      (window as any).api = { ...(window as any).api, writeToTerminal: originalWriteToTerminal };
    }
  });
});
