/**
 * Agent discovery + registry (issue #397).
 *
 * These exercise the REAL IPC handlers against a REAL SQLite database, with a
 * stubbed ipcMain. `register()` takes ipcMain and dbQuery from its ctx rather
 * than requiring electron at module scope, so no electron mock is needed.
 *
 * The contract under test:
 *   - discovery reads each agent's home dir and extracts portable config facts
 *   - ~/.npcsh/agent_coders.json is the index location for every agent npcsh
 *     attached, not just npcsh itself
 *   - the registry lives in SQLite (agents table), never a JSON/YAML sidecar
 *   - nothing machine-specific or credential-shaped leaves via agents:export
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import sqlite3 from 'sqlite3';

const require = createRequire(import.meta.url);
const agents = require('../../src/ipc/agents.js');

type Handler = (event: any, payload?: any) => Promise<any>;

let tmpRoot: string;
let tmpHome: string;
let dbPath: string;
let handlers: Record<string, Handler>;

const EVT = { sender: null };

/** Mirrors src/main.js dbQuery: SELECT/PRAGMA -> all(), else run(). */
const makeDbQuery = (file: string) => (query: string, params: any[] = []) =>
  new Promise<any>((resolve, reject) => {
    const isRead = /^\s*(SELECT|PRAGMA)/i.test(query);
    const db = new sqlite3.Database(file);
    if (isRead) {
      db.all(query, params, (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      });
    } else {
      db.run(query, params, function (this: any, err) {
        db.close();
        if (err) return reject(err);
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    }
  });

const mk = (rel: string, content = '') => {
  const p = path.join(tmpHome, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
  tmpHome = path.join(tmpRoot, 'home');
  dbPath = path.join(tmpRoot, 'history.db');
  fs.mkdirSync(tmpHome, { recursive: true });

  agents.resetTableCache();
  handlers = {};
  const ipcMain = { handle: (ch: string, fn: Handler) => { handlers[ch] = fn; } };
  agents.register({ ipcMain, dbQuery: makeDbQuery(dbPath), home: tmpHome });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('agents IPC surface', () => {
  it('registers all six handlers', () => {
    expect(Object.keys(handlers).sort()).toEqual([
      'agents:discover',
      'agents:export',
      'agents:import',
      'agents:list',
      'agents:remove',
      'agents:update',
    ]);
  });
});

describe('agents:discover', () => {
  beforeEach(() => {
    mk('.codex/config.toml', 'model = "gpt-6-luna"\n[projects."/x"]\ntrust_level = "trusted"\n');
    mk('.codex/auth.json', '{"OPENAI_API_KEY":"sk-must-not-leak"}');
    mk('.claude/settings.json', '{}');
    mk('.gemini/oauth_creds.json', '{}');
    mk('.npcsh/agent_coders.json', JSON.stringify({
      claude: { npc: 'corca', team_path: '/team/c', mcp_server: 'npcsh mcp-server', attached_at: 1 },
      codex: { npc: 'corca', team_path: '/team/x', mcp_server: 'npcsh mcp-server', attached_at: 2 },
      weirdbot: { npc: 'zed', team_path: '/team/w', mcp_server: 'npcsh mcp-server', attached_at: 3 },
    }));
  });

  it('creates the agents table on first run', async () => {
    await handlers['agents:discover'](EVT);
    const rows = await makeDbQuery(dbPath)(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    );
    expect(rows).toHaveLength(1);
  });

  it('reports the home dir it actually found', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    const codex = found.find((a: any) => a.id === 'codex');
    expect(codex.homePath).toBe(path.join(tmpHome, '.codex'));
    expect(codex.installed).toBeDefined();
  });

  it('extracts the top-level model from codex config.toml', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    expect(found.find((a: any) => a.id === 'codex').detectedModel).toBe('gpt-6-luna');
  });

  it('records credential PRESENCE but never the value', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    expect(found.find((a: any) => a.id === 'codex').hasCredentials).toBe(true);
    expect(JSON.stringify(found)).not.toContain('sk-must-not-leak');
  });

  it('applies npcsh registration facts to every agent it names', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    for (const id of ['claude', 'codex']) {
      const rec = found.find((a: any) => a.id === id);
      expect(rec.registeredWithNpcsh).toBe(true);
      expect(rec.npc).toBe('corca');
      expect(rec.mcpServer).toBe('npcsh mcp-server');
    }
  });

  it('keeps an agent own home dir even though npcsh registered it', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    const claude = found.find((a: any) => a.id === 'claude');
    expect(claude.homePath).toBe(path.join(tmpHome, '.claude'));
  });

  it('surfaces a registry-only agent, indexed at ~/.npcsh', async () => {
    const { agents: found } = await handlers['agents:discover'](EVT);
    const wb = found.find((a: any) => a.id === 'weirdbot');
    expect(wb).toBeTruthy();
    expect(wb.homePath).toBe(path.join(tmpHome, '.npcsh'));
    expect(wb.npc).toBe('zed');
  });
});

describe('registry persistence (SQLite, not a file)', () => {
  beforeEach(() => {
    mk('.codex/config.toml', 'model = "m"\n');
    mk('.npcsh/agent_coders.json', JSON.stringify({ claude: { npc: 'n' } }));
  });

  it('does not write a JSON or YAML registry file', () => {
    expect(fs.existsSync(path.join(tmpHome, '.incognide'))).toBe(false);
  });

  it('persists a pin and a label edit', async () => {
    const w = await handlers['agents:update'](EVT, { id: 'codex', pinned: true, label: 'Codex CLI' });
    expect(w.success).toBe(true);

    const { agents: listed } = await handlers['agents:list'](EVT);
    const codex = listed.find((a: any) => a.id === 'codex');
    expect(codex.pinned).toBe(true);
    expect(codex.label).toBe('Codex CLI');
  });

  it('sorts pinned agents first', async () => {
    await handlers['agents:update'](EVT, { id: 'codex', pinned: true });
    const { agents: listed } = await handlers['agents:list'](EVT);
    expect(listed[0].id).toBe('codex');
  });

  it('keeps exactly one row per id across repeated upserts', async () => {
    for (let i = 0; i < 3; i++) {
      await handlers['agents:update'](EVT, { id: 'codex', pinned: i % 2 === 0 });
    }
    const rows = await makeDbQuery(dbPath)("SELECT COUNT(*) AS n FROM agents WHERE id='codex'");
    expect(rows[0].n).toBe(1);
  });

  it('removes a custom agent', async () => {
    await handlers['agents:update'](EVT, { id: 'tmpagent', label: 'Temp', custom: true });
    await handlers['agents:remove'](EVT, 'tmpagent');
    const { agents: listed } = await handlers['agents:list'](EVT);
    expect(listed.some((a: any) => a.id === 'tmpagent')).toBe(false);
  });
});

describe('agents:export / agents:import (sync leg)', () => {
  beforeEach(() => {
    mk('.codex/config.toml', 'model = "m"\n');
    mk('.codex/auth.json', '{"OPENAI_API_KEY":"sk-leak-check"}');
    mk('.claude/settings.json', '{}');
    mk('.npcsh/agent_coders.json', JSON.stringify({
      claude: { npc: 'corca', team_path: '/secret/team', attached_at: 1 },
    }));
  });

  it('exports portable fields only', async () => {
    const { agents: exported } = await handlers['agents:export'](EVT);
    expect(exported.length).toBeGreaterThan(0);
    for (const rec of exported) {
      expect(Object.keys(rec).sort()).toEqual(['command', 'custom', 'id', 'label', 'pinned']);
    }
  });

  it('leaks no secret, no machine path, no credential flag', async () => {
    const { agents: exported } = await handlers['agents:export'](EVT);
    const blob = JSON.stringify(exported);
    expect(blob).not.toContain('sk-leak-check');
    expect(blob).not.toContain(tmpHome);
    expect(blob).not.toContain('/secret/team');
    expect(blob).not.toContain('homePath');
    expect(blob).not.toContain('hasCredentials');
    expect(blob).not.toContain('teamPath');
  });

  it('applies imported records and adds new ones', async () => {
    const res = await handlers['agents:import'](EVT, {
      agents: [
        { id: 'codex', label: 'Codex (remote)', pinned: true },
        { id: 'remoteonly', label: 'Remote Only', command: 'remoteonly', custom: true },
      ],
    });
    expect(res.success).toBe(true);

    const { agents: listed } = await handlers['agents:list'](EVT);
    expect(listed.find((a: any) => a.id === 'codex').label).toBe('Codex (remote)');
    expect(listed.some((a: any) => a.id === 'remoteonly')).toBe(true);
  });

  it('strips machine paths from an incoming record before persisting it', async () => {
    await handlers['agents:import'](EVT, {
      agents: [{ id: 'leaky', label: 'Leaky', command: 'leaky', homePath: '/nope/secret', hasCredentials: true }],
    });

    // Assert at the DB layer, not the list layer: an agent that is neither
    // installed, configured, nor custom is intentionally hidden from the UI, so
    // agents:list would filter it out and prove nothing about sanitisation.
    const rows = await makeDbQuery(dbPath)('SELECT * FROM agents WHERE id = ?', ['leaky']);
    expect(rows).toHaveLength(1);
    const columns = Object.keys(rows[0]);
    expect(columns).not.toContain('homePath');
    expect(columns).not.toContain('hasCredentials');
    expect(JSON.stringify(rows[0])).not.toContain('/nope/secret');
  });

  it('an imported agent is hidden until it is installed, configured, or custom', async () => {
    // Rationale: syncing an agent from another device must not make it appear
    // as available here. The row is kept for reference; the list filters it.
    await handlers['agents:import'](EVT, {
      agents: [{ id: 'absent', label: 'Absent', command: 'absent' }],
    });
    const { agents: listed } = await handlers['agents:list'](EVT);
    expect(listed.some((a: any) => a.id === 'absent')).toBe(false);

    // ...but marking it custom (a user-owned entry) surfaces it.
    await handlers['agents:import'](EVT, {
      agents: [{ id: 'absent', label: 'Absent', command: 'absent', custom: true }],
    });
    const after = await handlers['agents:list'](EVT);
    expect(after.agents.some((a: any) => a.id === 'absent')).toBe(true);
  });
});

describe('malformed payloads return errors instead of throwing', () => {
  it('update without id', async () => {
    const r = await handlers['agents:update'](EVT, {});
    expect(r.error).toBeTruthy();
  });

  it('update with no payload at all', async () => {
    // Regression: the handler used to destructure unconditionally.
    await expect(handlers['agents:update'](EVT, undefined)).resolves.toHaveProperty('error');
  });

  it('import with a non-array', async () => {
    const r = await handlers['agents:import'](EVT, { agents: 'nope' });
    expect(r.error).toBeTruthy();
  });

  it('import with no payload at all', async () => {
    await expect(handlers['agents:import'](EVT, undefined)).resolves.toHaveProperty('error');
  });
});

describe('pure helpers', () => {
  it('normalises ids to lowercase slugs', () => {
    expect(agents.normalizeAgentId('Claude Code')).toBe('claude-code');
    expect(agents.normalizeAgentId('  npcsh ')).toBe('npcsh');
  });

  it('parses only top-level codex model keys', () => {
    expect(agents.parseCodexModel('model = "gpt-6-luna"\n[t]\nmodel = "x"\n')).toBe('gpt-6-luna');
    expect(agents.parseCodexModel('[t]\nmodel = "x"\n')).toBeNull();
    expect(agents.parseCodexModel('')).toBeNull();
  });

  it('rejects malformed npcsh registries', () => {
    expect(agents.parseNpcshAgentCoders(null)).toEqual([]);
    expect(agents.parseNpcshAgentCoders([1, 2])).toEqual([]);
  });

  it('lets a saved label beat the catalog label', () => {
    const merged = agents.mergeAgentRecords(
      [{ id: 'claude', label: 'Claude Code', installed: true, homePath: '/h' }],
      [{ id: 'claude', label: 'My Claude', pinned: true }]
    );
    expect(merged[0].label).toBe('My Claude');
    expect(merged[0].pinned).toBe(true);
  });

  it('drops agents that are neither installed, configured, nor custom', () => {
    const merged = agents.mergeAgentRecords(
      [{ id: 'ghost', label: 'Ghost', installed: false, homePath: null }],
      []
    );
    expect(merged).toEqual([]);
  });
});
