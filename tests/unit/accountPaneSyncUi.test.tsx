/**
 * The sync category picker must be visible BEFORE the user signs in.
 *
 * Reported: "I still don't see anywhere for me to control these things in the
 * account panel". Two causes, both fixed here:
 *
 *   1. The whole Sync card was nested inside `auth.isAuthenticated && (...)`, so
 *      on a signed-out machine the card — including the picker — never rendered.
 *   2. The category list started as an empty array and only filled in after the
 *      `sync:categories` IPC round trip, so even when it rendered there was a
 *      window (or a failure mode) where it showed nothing at all.
 *
 * Deciding what syncs is local configuration. Only the actions that push data
 * need auth, so the picker is ungated and seeded from the shared definitions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import SYNC_CATEGORY_DEFS from '../../src/shared/syncCategories.json';

const mockAuth = {
  isAuthenticated: false,
  isEncryptionReady: false,
  user: null,
  device: null,
  error: null,
  openSignIn: vi.fn(),
  signOut: vi.fn(),
  setupPassphrase: vi.fn(),
  unlockWithPassphrase: vi.fn(),
  resetPassphrase: vi.fn(),
};

vi.mock('../../src/renderer/components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/renderer/hooks/useSync', () => ({
  useSync: () => ({
    syncStatus: 'idle',
    isOnline: true,
    lastSyncTime: null,
    pendingChanges: 0,
    syncError: null,
    syncFrequency: '10m',
    lastSyncStats: null,
    syncProgress: 0,
    triggerSync: vi.fn(),
    forceFullResync: vi.fn(),
    setSyncFrequency: vi.fn(),
    // What the real hook now produces on first render: the full shared list,
    // before any IPC reply.
    syncCategories: (SYNC_CATEGORY_DEFS as any[]).map((c) => ({ ...c, count: 0, available: false })),
    categorySelection: Object.fromEntries((SYNC_CATEGORY_DEFS as any[]).map((c) => [c.id, !!c.defaultEnabled])),
    categoriesLoading: false,
    toggleCategory: vi.fn(),
    refreshCategories: vi.fn(),
  }),
}));

vi.mock('../../src/renderer/utils/encryption', () => ({
  getEncryptionKey: () => null,
}));

const renderPane = async () => {
  const { default: AccountPane } = await import('../../src/renderer/components/AccountPane');
  return renderToString(React.createElement(AccountPane, { nodeId: 'test' }));
};

describe('AccountPane sync category UI', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = false;
  });

  it('renders the sync section even when signed out', async () => {
    const html = await renderPane();
    expect(html).toContain('Sync');
    expect(html).toContain('What syncs');
  });

  it('renders the category picker without any IPC reply', async () => {
    const html = await renderPane();
    // The toggle is collapsed by default; the summary line proves the list is
    // populated and the control is present.
    expect(html).toMatch(/What syncs/);
    expect(html).toMatch(/\d+\/\d+/); // enabled/total counter
  });

  it('shows a counter reflecting the default selection, not 0/0', async () => {
    // React inserts <!-- --> separators between adjacent text nodes, so strip
    // them before matching rendered values.
    const html = (await renderPane()).replace(/<!--.*?-->/g, '');
    const total = (SYNC_CATEGORY_DEFS as any[]).length;
    const enabled = (SYNC_CATEGORY_DEFS as any[]).filter((c) => c.defaultEnabled).length;
    expect(html).toContain(`${enabled}/${total}`);
    // Guards against the empty-array regression specifically.
    expect(html).not.toContain('0/0');
  });

  it('renders every category label without expanding anything first', async () => {
    // Decode the entities React escapes (& -> &amp;) before comparing labels.
    const html = (await renderPane())
      .replace(/<!--.*?-->/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");
    for (const category of SYNC_CATEGORY_DEFS as any[]) {
      expect(html).toContain(category.label);
    }
  });

  it('renders checkboxes the user can actually toggle', async () => {
    const html = await renderPane();
    const boxes = html.match(/type="checkbox"/g) || [];
    expect(boxes.length).toBe((SYNC_CATEGORY_DEFS as any[]).length);
  });

  it('renders the "sensitive" badge only when a category is flagged', async () => {
    // Command history was the only sensitive category and has been retired
    // (nothing writes the table any more). The badge is still supported, so
    // assert the behaviour rather than the current contents.
    const defs = SYNC_CATEGORY_DEFS as any[];
    const sensitive = defs.filter((c) => c.sensitive);
    const html = await renderPane();
    if (sensitive.length > 0) {
      expect(html).toContain('sensitive');
    } else {
      expect(html).not.toContain('>sensitive<');
    }
  });

  it('offers no category backed by a table nothing writes', () => {
    // memory_lifecycle / command_history / jinx_executions froze in early 2026
    // and no live code path inserts into them, so they must not appear as
    // sync toggles.
    const ids = (SYNC_CATEGORY_DEFS as any[]).map((c) => c.id);
    expect(ids).not.toContain('memories');
    expect(ids).not.toContain('command_history');
    expect(ids).not.toContain('execution_logs');
  });

  it('still offers sign-in when signed out', async () => {
    const html = await renderPane();
    expect(html).toContain('Not signed in');
  });
});
