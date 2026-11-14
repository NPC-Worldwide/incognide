/**
 * teamSources: which path must be registered for each team layout.
 *
 * The contract that matters (verified against npcpy.npc_compiler.Team):
 *   - .npc / .ctx / jinxes/ are read from team_path itself
 *   - agents.md / AGENTS.md / CLAUDE.md / agents/ are read from
 *     dirname(team_path), because npcpy computes
 *     project_root = os.path.dirname(os.path.abspath(team_path))
 *
 * So a project declaring agents in PROJECT/agents.md must be registered as
 * PROJECT/npc_team — registering PROJECT silently loads nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { detectTeamSources, scanTeamDir, collectAgentsMdNames } =
  require('../../src/ipc/teamSources.js');

let root: string;

const mk = (rel: string, content = '') => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamsrc-'));

  // classic npc_team
  mk('npcProj/npc_team/corca.npc', 'name: corca\nprimary_directive: shell\n');
  mk('npcProj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');

  // agents.md at project root, no npc_team yet
  mk('mdProj/agents.md', '## alicanto\nResearch.\n\n## kadiefa\nExplore.\n');

  // agents/ dir at project root, npc_team exists
  mk('dirProj/agents/plonk.md', 'You are plonk.\n');
  mk('dirProj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');

  // agents.md INSIDE the team dir is NOT a markdown team (npcpy looks at parent)
  mk('innerProj/npc_team/agents.md', '## inner\nInner only.\n');
  mk('innerProj/npc_team/t.ctx', 'model: gpt-4\nprovider: openai\n');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('detectTeamSources', () => {
  it('finds a classic npc_team and returns the dir itself', () => {
    const r = detectTeamSources(path.join(root, 'npcProj'));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('npc_team');
    expect(r[0].path).toBe(path.join(root, 'npcProj', 'npc_team'));
    expect(r[0].agents).toEqual(['corca']);
  });

  it('returns the CHILD npc_team for a project with agents.md at its root', () => {
    const r = detectTeamSources(path.join(root, 'mdProj'));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('markdown_team');
    // not the project root - npcpy reads agents.md from dirname(team_path)
    expect(r[0].path).toBe(path.join(root, 'mdProj', 'npc_team'));
    expect(r[0].agents).toEqual(['alicanto', 'kadiefa']);
    expect(r[0].needsCreate).toBe(true);
  });

  it('finds an agents/ directory and lists its .md files as agents', () => {
    const r = detectTeamSources(path.join(root, 'dirProj'));
    const md = r.find((x: any) => x.kind === 'markdown_team');
    expect(md).toBeTruthy();
    expect(md.path).toBe(path.join(root, 'dirProj', 'npc_team'));
    expect(md.agents).toEqual(['plonk']);
  });

  it('does NOT treat agents.md inside the team dir as a markdown team', () => {
    // npcpy only reads dirname(team_path)/agents.md, so a copy inside the team
    // dir is invisible. It should be reported as a plain npc_team only.
    const r = detectTeamSources(path.join(root, 'innerProj'));
    expect(r.map((x: any) => x.kind)).toEqual(['npc_team']);
  });

  it('returns [] for a directory with nothing registrable', () => {
    expect(detectTeamSources(path.join(root, 'empty'))).toEqual([]);
  });

  it('returns [] for a nonexistent path', () => {
    expect(detectTeamSources('/nope/does/not/exist')).toEqual([]);
  });
});

describe('scanTeamDir', () => {
  it('separates .npc / .ctx / agents.md / agents/', () => {
    const s = scanTeamDir(path.join(root, 'mdProj'));
    expect(s.npcFiles).toEqual([]);
    expect(s.agentsMd).toBe('agents.md');
    expect(s.agentsDirMd).toEqual([]);

    const s2 = scanTeamDir(path.join(root, 'dirProj'));
    expect(s2.agentsMd).toBeNull();
    expect(s2.agentsDirMd).toEqual(['plonk.md']);

    const s3 = scanTeamDir(path.join(root, 'npcProj', 'npc_team'));
    expect(s3.npcFiles).toEqual(['corca.npc']);
    expect(s3.ctxFiles).toEqual(['t.ctx']);
  });
});

describe('collectAgentsMdNames', () => {
  it('takes H2 headings as agent names', () => {
    const names = collectAgentsMdNames(path.join(root, 'mdProj', 'agents.md'));
    expect(names).toEqual(['alicanto', 'kadiefa']);
  });

  it('returns [] for a missing file', () => {
    expect(collectAgentsMdNames(path.join(root, 'nope.md'))).toEqual([]);
  });
});
