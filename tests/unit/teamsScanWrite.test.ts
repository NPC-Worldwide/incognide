/**
 * teams:scan / teams:write (issue: register npc teams, agents.md and agents/).
 *
 * These drive the REAL IPC handlers. The behaviour that matters:
 *   - teams:scan returns the path npcpy actually needs (agents.md and agents/
 *     are read from dirname(team_path), so a project declaring them must be
 *     registered as PROJECT/npc_team, not PROJECT)
 *   - teams:write creates the registered directory, because npcpy raises
 *     "Team directory not found" otherwise
 *   - already-registered teams are not offered again
 *
 * Loading is npcpy's job and is verified separately against the real Team
 * class; these tests only cover path resolution and persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

type Handler = (event: any, payload?: any) => Promise<any>;

let tmpRoot: string;
let tmpHome: string;
let incognideHome: string;
let handlers: Record<string, Handler>;

const EVT = { sender: null };

const mk = (rel: string, content = '') => {
  const p = path.join(tmpHome, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

beforeEach(() => {
  vi.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teamsscan-'));
  tmpHome = path.join(tmpRoot, 'home');
  incognideHome = path.join(tmpHome, '.incognide');
  fs.mkdirSync(incognideHome, { recursive: true });

  handlers = {};
  const ipcMain = {
    handle: (ch: string, fn: Handler) => { handlers[ch] = fn; },
    on: () => {},
    removeHandler: () => {},
  };

  // settings.js binds INCOGNIDE_HOME from ctx at register() time.
  const settings = require('../../src/ipc/settings.js');
  settings.register({ ipcMain, INCOGNIDE_HOME: incognideHome, log: () => {} });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const scan = (p: string) => handlers['teams:scan'](EVT, p);

describe('teams:scan path resolution', () => {
  it('returns the npc_team dir for a classic .npc team', async () => {
    mk('proj/npc_team/a.npc', 'name: a\nprimary_directive: hi\n');
    const { discovered } = await scan(path.join(tmpHome, 'proj'));
    const hit = discovered.find((d: any) => d.path === path.join(tmpHome, 'proj', 'npc_team'));
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('npc_team');
    expect(hit.agents).toContain('a');
  });

  it('returns the CHILD npc_team for a project with agents.md at its root', async () => {
    // npcpy reads agents.md from dirname(team_path), so the project root itself
    // would silently load nothing.
    mk('proj/agents.md', '## md1\nOne.\n\n## md2\nTwo.\n');
    const { discovered } = await scan(path.join(tmpHome, 'proj'));
    const hit = discovered.find((d: any) => d.path === path.join(tmpHome, 'proj', 'npc_team'));
    expect(hit).toBeTruthy();
    expect(hit.agents).toEqual(['md1', 'md2']);
    expect(hit.needsCreate).toBe(true);
  });

  it('finds an agents/ directory and names its .md files', async () => {
    mk('proj/agents/plonk.md', 'You are plonk.\n');
    mk('proj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');
    const { discovered } = await scan(path.join(tmpHome, 'proj'));
    const hit = discovered.find((d: any) => d.path === path.join(tmpHome, 'proj', 'npc_team'));
    expect(hit).toBeTruthy();
    expect(hit.agents).toEqual(['plonk']);
  });

  it('does not treat agents.md inside the team dir as a markdown team', async () => {
    // dirname(npc_team)/agents.md is what npcpy reads; a copy inside is invisible.
    mk('proj/npc_team/agents.md', '## inner\nInner only.\n');
    mk('proj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');
    const { discovered } = await scan(path.join(tmpHome, 'proj'));

    // teams:scan also probes the real global team locations (~/.npcsh/npc_team),
    // so scope the assertion to entries inside this fixture.
    const local = discovered.filter((d: any) => String(d.path).startsWith(tmpHome));
    expect(local).toHaveLength(1);
    expect(local[0].kind).toBe('npc_team');
    expect(local[0].path).toBe(path.join(tmpHome, 'proj', 'npc_team'));
    // and the inner agents.md must not have been counted as an agent
    expect(local[0].agents).toEqual([]);
  });

  it('skips a team that is already registered', async () => {
    mk('proj/npc_team/a.npc', 'name: a\nprimary_directive: hi\n');
    const teamPath = path.join(tmpHome, 'proj', 'npc_team');
    fs.writeFileSync(
      path.join(incognideHome, 'teams.yaml'),
      yaml.dump({ teams: { proj: teamPath } })
    );
    const { discovered } = await scan(path.join(tmpHome, 'proj'));
    expect(discovered.some((d: any) => d.path === teamPath)).toBe(false);
  });

  it('reports needsCreate false when the child dir already exists', async () => {
    mk('proj/agents.md', '## md1\nOne.\n');
    mk('proj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');
    const { discovered } = await scan(path.join(tmpHome, 'proj'));
    const hit = discovered.find((d: any) => d.path === path.join(tmpHome, 'proj', 'npc_team'));
    expect(hit.needsCreate).toBe(false);
  });
});

describe('teams:write', () => {
  it('persists the team and creates the directory', async () => {
    const target = path.join(tmpHome, 'brandnew', 'npc_team');
    // does not exist yet - this is the markdown-team registration case
    expect(fs.existsSync(target)).toBe(false);

    const res = await handlers['teams:write'](EVT, { brandnew: target });
    expect(res.success).toBe(true);
    expect(fs.existsSync(target)).toBe(true);

    const raw = yaml.load(fs.readFileSync(path.join(incognideHome, 'teams.yaml'), 'utf8'));
    expect(raw.teams.brandnew).toBe(target);
  });

  it('does not lose an existing team on a second write', async () => {
    await handlers['teams:write'](EVT, { one: path.join(tmpHome, 'one') });
    await handlers['teams:write'](EVT, { one: path.join(tmpHome, 'one'), two: path.join(tmpHome, 'two') });

    const raw = yaml.load(fs.readFileSync(path.join(incognideHome, 'teams.yaml'), 'utf8'));
    expect(Object.keys(raw.teams).sort()).toEqual(['one', 'two']);
    expect(fs.existsSync(path.join(tmpHome, 'two'))).toBe(true);
  });

  it('round-trips through teams:read with ~ expanded', async () => {
    await handlers['teams:write'](EVT, { tildeteam: '~/npc_team' });
    const { teams } = await handlers['teams:read'](EVT);
    expect(teams.tildeteam).toBe(path.join(os.homedir(), 'npc_team'));
  });

  it('is idempotent for an already-existing directory', async () => {
    const target = path.join(tmpHome, 'existing');
    fs.mkdirSync(target, { recursive: true });
    const res = await handlers['teams:write'](EVT, { existing: target });
    expect(res.success).toBe(true);
  });
});
