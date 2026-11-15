/**
 * Manager → Teams → add team.
 *
 * Reported: "when I try to add a team it only appears after I hit refresh,
 * but it should load automatically after I add."
 *
 * Manager.tsx captures `const api = (window as any).api` at MODULE scope, so the
 * bridge must exist before the module is imported. vi.hoisted() runs before the
 * hoisted ESM imports, which is the only reliable place to install it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const { api, teamsStore, state } = vi.hoisted(() => {
  const teamsStore: Record<string, string> = {};
  const state = { writeShouldFail: false };
  const api = {
    teamsRead: vi.fn(async () => ({ teams: { ...teamsStore } })),
    teamsWrite: vi.fn(async (teams: Record<string, string>) => {
      if (state.writeShouldFail) return { error: 'disk full' };
      for (const k of Object.keys(teamsStore)) delete teamsStore[k];
      Object.assign(teamsStore, teams);
      return { success: true };
    }),
    teamsScan: vi.fn(async () => ({ discovered: [] })),
    getAppVersion: vi.fn(() => Promise.resolve('1.0.0')),
    backendHealth: vi.fn(() => Promise.resolve({ status: 'ok' })),
    getAllWindowsInfo: vi.fn(() => Promise.resolve([])),
    getSavedWorkspaces: vi.fn(() => Promise.resolve([])),
    getDeviceInfo: vi.fn(() => Promise.resolve({})),
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.api = api;
  return { api, teamsStore, state };
});

import Manager from '../../src/renderer/components/Manager';

const settle = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
};

const openTeams = async () => {
  render(<Manager />);
  fireEvent.click(await screen.findByRole('button', { name: /^teams$/i }));
  await waitFor(() => expect(screen.getByPlaceholderText('team name')).toBeInTheDocument());
};

const typeAndAdd = async (name: string, path: string) => {
  fireEvent.change(screen.getByPlaceholderText('team name'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(/path\/to\/npc_team/i), { target: { value: path } });
  const addBtn = screen.getAllByRole('button').find((b) => (b.textContent || '').trim() === 'Add')!;
  fireEvent.click(addBtn);
  await settle();
};

describe('Manager > Teams > add', () => {
  beforeEach(() => {
    for (const k of Object.keys(teamsStore)) delete teamsStore[k];
    state.writeShouldFail = false;
    Object.values(api).forEach((fn: any) => fn.mockClear?.());
  });

  it('the bridge is actually reachable by the component', async () => {
    await openTeams();
    // If this is 0, the component captured an empty api and every other
    // assertion here would be meaningless.
    expect(api.teamsRead).toHaveBeenCalled();
  });

  it('shows a newly added team immediately, without pressing refresh', async () => {
    await openTeams();
    expect(screen.getByText('No teams registered.')).toBeInTheDocument();

    await typeAndAdd('myteam', '/tmp/npc_team');

    await waitFor(() => expect(screen.getByText('myteam')).toBeInTheDocument());
    expect(api.teamsWrite).toHaveBeenCalled();
    expect(screen.queryByText('No teams registered.')).not.toBeInTheDocument();
  });

  it('keeps the row across the Manager 5s polling tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openTeams();
    await typeAndAdd('myteam', '/tmp/npc_team');
    await waitFor(() => expect(screen.getByText('myteam')).toBeInTheDocument());

    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });

    expect(screen.getByText('myteam')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('clears the inputs only after the write succeeds', async () => {
    await openTeams();
    await typeAndAdd('myteam', '/tmp/npc_team');

    await waitFor(() => {
      expect((screen.getByPlaceholderText('team name') as HTMLInputElement).value).toBe('');
      expect((screen.getByPlaceholderText(/path\/to\/npc_team/i) as HTMLInputElement).value).toBe('');
    });
  });

  it('does not show a phantom row when the write fails', async () => {
    state.writeShouldFail = true;
    await openTeams();
    await typeAndAdd('ghost', '/tmp/ghost');

    await waitFor(() => expect(screen.getByText(/disk full/i)).toBeInTheDocument());
    expect(screen.queryByText('ghost')).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText('team name') as HTMLInputElement).value).toBe('ghost');
  });

  it('explains a name that normalises to nothing', async () => {
    await openTeams();
    await typeAndAdd('???', '/tmp/npc_team');

    await waitFor(() => expect(screen.getByText(/must contain at least one letter/i)).toBeInTheDocument());
    expect(api.teamsWrite).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name with a visible message', async () => {
    teamsStore.myteam = '/tmp/original';
    await openTeams();

    await typeAndAdd('myteam', '/tmp/other');

    await waitFor(() => expect(screen.getByText(/already registered/i)).toBeInTheDocument());
    expect(teamsStore.myteam).toBe('/tmp/original');
  });
});
