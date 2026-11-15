/**
 * Per-category sync selection.
 *
 * The account panel is only honest if three things agree: the category list it
 * renders, the export that filters by it, and the import that writes back. These
 * pin that agreement, plus the two behaviours that are easy to break silently:
 *
 *   - a disabled category must export NOTHING (opting out means the data never
 *     leaves the machine)
 *   - npcsh history and coding-agent transcripts are subsets of the same
 *     conversation_history table, so enabling several at once must not duplicate
 *     rows or drop any
 *
 * Driven against a real SQLite database with the real IPC handlers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import sqlite3 from 'sqlite3';

const require = createRequire(import.meta.url);

let tmpRoot: string;
let dbPath: string;
let handlers: Record<string, (event: any, payload?: any) => Promise<any>>;
let SC: any;
let AH: any;

const dbQuery = (query: string, params: any[] = []) =>
  new Promise<any>((resolve, reject) => {
    const isRead = /^\s*(SELECT|PRAGMA)/i.test(query.trim());
    const db = new sqlite3.Database(dbPath);
    if (isRead) {
      db.all(query, params, (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows || []);
      });
    } else {
      db.run(query, params, function (this: any, err) {
        db.close();
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    }
  });

const SCHEMA = [
  `CREATE TABLE conversation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL,
    parent_message_id TEXT, branch_id TEXT, timestamp DATETIME, role TEXT,
    content TEXT, conversation_id TEXT NOT NULL, directory_path TEXT, model TEXT,
    provider TEXT, npc TEXT, team TEXT, reasoning_content TEXT, tool_calls TEXT,
    tool_results TEXT, params TEXT, input_tokens INTEGER, output_tokens INTEGER,
    cost TEXT, execution_mode TEXT, device_id TEXT, device_name TEXT)`,
  `CREATE TABLE bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, folder_path TEXT, is_global INTEGER, timestamp DATETIME)`,
  `CREATE TABLE browser_history (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, folder_path TEXT, visit_count INTEGER, last_visited DATETIME)`,
  `CREATE TABLE pdf_highlights (id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT, highlighted_text TEXT, annotation TEXT, color TEXT, position TEXT)`,
  `CREATE TABLE pdf_drawings (id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT, drawing_data TEXT)`,
  `CREATE TABLE kg_entities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, entity_type TEXT)`,
  `CREATE TABLE kg_relations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER, target_id INTEGER, relation_type TEXT)`,
  `CREATE TABLE kg_triples (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, predicate TEXT, object TEXT)`,
  `CREATE TABLE file_index (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, filename TEXT)`,
];

/** Every category off; tests opt specific ones in. */
const ALL_OFF = {
  conversations: false, bookmarks: false, browser_history: false,
  pdf_annotations: false, knowledge_graph: false,
  agent_registry: false, agent_transcripts: false, npcsh_history: false,
  file_index: false,
};

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synccat-'));
  dbPath = path.join(tmpRoot, 'history.db');

  // database.js binds its dbPath at module load, so the env var must be set
  // before it is required, and the module cache must be cleared between tests.
  process.env.INCOGNIDE_DB_PATH = dbPath;
  delete require.cache[require.resolve('../../src/ipc/syncCategories.js')];
  delete require.cache[require.resolve('../../src/ipc/agentHistory.js')];
  delete require.cache[require.resolve('../../src/ipc/database.js')];

  SC = require('../../src/ipc/syncCategories.js');
  AH = require('../../src/ipc/agentHistory.js');

  for (const statement of SCHEMA) await dbQuery(statement);
  await AH.ensureSourceColumns(dbQuery);

  handlers = {};
  const database = require('../../src/ipc/database.js');
  database.register({
    ipcMain: { handle: (ch: string, fn: any) => { handlers[ch] = fn; } },
    dbQuery,
    dbPath,
    log: () => {},
    app: { getPath: () => tmpRoot },
    INCOGNIDE_HOME: tmpRoot,
  });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.INCOGNIDE_DB_PATH;
});

const seed = async () => {
  await dbQuery(`INSERT INTO conversation_history (message_id, timestamp, role, content, conversation_id) VALUES
    ('native1','2026-01-01T00:00:00Z','user','native message','conv_native'),
    ('agent1','2026-01-02T00:00:00Z','user','codex message','agent:codex:s1'),
    ('npcsh1','2026-01-03T00:00:00Z','user','npcsh message','npcsh:pc')`);
  await dbQuery(`UPDATE conversation_history SET source_agent='codex' WHERE message_id='agent1'`);
  await dbQuery(`UPDATE conversation_history SET source_agent='npcsh' WHERE message_id='npcsh1'`);
  await dbQuery(`INSERT INTO bookmarks (title, url, timestamp) VALUES ('b','https://x','2026-01-01T00:00:00Z')`);
  await dbQuery(`INSERT INTO browser_history (title, url, visit_count, last_visited) VALUES ('h','https://y',2,'2026-01-01T00:00:00Z')`);
};

const exportWith = async (categories: any) =>
  handlers['sync:export-data']({}, { fullDump: true, categories });

const ids = (res: any) => res.messages.map((m: any) => m.message_id).sort();

describe('category registry', () => {
  it('reports counts per category from the real database', async () => {
    await seed();
    const res = await handlers['sync:categories']({});
    const byId = Object.fromEntries(res.categories.map((c: any) => [c.id, c]));

    expect(byId.conversations.count).toBe(3);
    expect(byId.agent_transcripts.count).toBe(1);
    expect(byId.npcsh_history.count).toBe(1);
    expect(byId.bookmarks.count).toBe(1);
    expect(byId.browser_history.count).toBe(1);
    expect(byId).not.toHaveProperty('memories');
    expect(byId).not.toHaveProperty('command_history');
  });

  it('defaults file index to OFF and the core categories to ON', async () => {
    const defaults = SC.defaultSelection();
    expect(defaults.file_index).toBe(false);
    expect(defaults.conversations).toBe(true);
    expect(defaults.npcsh_history).toBe(true);
  });

  it('does not offer categories whose tables nothing writes', async () => {
    // memory_lifecycle, command_history and jinx_executions are legacy
    // npcsh-era tables. Nothing in the live app writes them, so shipping them
    // as sync toggles would sync frozen data.
    const res = await handlers['sync:categories']({});
    const ids = res.categories.map((c: any) => c.id);
    expect(ids).not.toContain('memories');
    expect(ids).not.toContain('command_history');
    expect(ids).not.toContain('execution_logs');
  });

  it('normalizes a partial selection without disabling unmentioned categories', async () => {
    // A settings file written before a category existed must not turn it off.
    const normalized = SC.normalizeSelection({ bookmarks: false });
    expect(normalized.bookmarks).toBe(false);
    expect(normalized.conversations).toBe(true);
    expect(normalized.npcsh_history).toBe(true);
  });

  it('drops unknown category ids from a selection', () => {
    const normalized = SC.normalizeSelection({ not_a_category: true, bookmarks: false });
    expect(normalized).not.toHaveProperty('not_a_category');
    expect(normalized.bookmarks).toBe(false);
  });

  it('persists and reloads the selection', async () => {
    const selection = { ...SC.defaultSelection(), knowledge_graph: true, bookmarks: false };
    const saved = await handlers['sync:set-categories']({}, { selection });
    expect(saved.success).toBe(true);

    const reloaded = await handlers['sync:get-categories-selection']({});
    expect(reloaded.selection.knowledge_graph).toBe(true);
    expect(reloaded.selection.bookmarks).toBe(false);
  });
});

describe('export filtering', () => {
  it('exports nothing when every category is off', async () => {
    await seed();
    const res = await exportWith(ALL_OFF);
    expect(res.messages).toHaveLength(0);
    expect(res.bookmarks).toHaveLength(0);
    expect(res.history).toHaveLength(0);
    expect(res.pdfHighlights).toHaveLength(0);
  });

  it('separates native conversations from agent transcripts and npcsh history', async () => {
    await seed();

    const native = await exportWith({ ...ALL_OFF, conversations: true });
    expect(ids(native)).toEqual(['native1']);

    const agent = await exportWith({ ...ALL_OFF, agent_transcripts: true });
    expect(ids(agent)).toEqual(['agent1']);

    const npcsh = await exportWith({ ...ALL_OFF, npcsh_history: true });
    expect(ids(npcsh)).toEqual(['npcsh1']);
  });

  it('does not duplicate rows when all three conversation categories are on', async () => {
    await seed();
    const res = await exportWith({
      ...ALL_OFF, conversations: true, agent_transcripts: true, npcsh_history: true,
    });
    expect(ids(res)).toEqual(['agent1', 'native1', 'npcsh1']);
    expect(new Set(res.messages.map((m: any) => m.message_id)).size).toBe(3);
  });

  it('includes only the requested non-conversation categories', async () => {
    await seed();
    const res = await exportWith({ ...ALL_OFF, bookmarks: true });
    expect(res.bookmarks).toHaveLength(1);
    expect(res.messages).toHaveLength(0);
  });

  it('controls the agent registry payload', async () => {
    // Regression: agent_registry was offered as a default-ON toggle but had no
    // export branch, so the switch silently did nothing.
    await dbQuery(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, label TEXT, command TEXT, pinned INTEGER DEFAULT 0, custom INTEGER DEFAULT 0, source TEXT)`);
    await dbQuery(`INSERT INTO agents (id, label, command) VALUES ('codex','Codex','codex')`);

    const off = await exportWith({ ...ALL_OFF, agent_registry: false });
    expect(off.agents).toHaveLength(0);

    const on = await exportWith({ ...ALL_OFF, agent_registry: true });
    expect(on.agents).toHaveLength(1);
    expect(on.agents[0].id).toBe('codex');
  });

  it('never sends agent home paths or credential flags in the registry payload', async () => {
    await dbQuery(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, label TEXT, command TEXT, pinned INTEGER DEFAULT 0, custom INTEGER DEFAULT 0, source TEXT)`);
    await dbQuery(`INSERT INTO agents (id, label, command) VALUES ('claude','Claude','claude')`);

    const res = await exportWith({ ...ALL_OFF, agent_registry: true });
    const agent = res.agents[0];
    expect(agent).not.toHaveProperty('homePath');
    expect(agent).not.toHaveProperty('hasCredentials');
    expect(Object.keys(agent).sort()).toEqual(['command', 'custom', 'id', 'label', 'pinned']);
  });

  it('exports every category when none is specified', async () => {
    await seed();
    const res = await exportWith(undefined);
    expect(ids(res)).toEqual(['agent1', 'native1', 'npcsh1']);
    expect(res.bookmarks).toHaveLength(1);
    expect(res.history).toHaveLength(1);
  });
});

describe('import', () => {
  it('round-trips a category through export and import', async () => {
    await seed();
    const exported = await exportWith({ ...ALL_OFF, bookmarks: true });
    expect(exported.bookmarks).toHaveLength(1);

    // Wipe, then re-import the exported payload.
    await dbQuery(`DELETE FROM bookmarks`);
    const imported = await handlers['sync:import-data']({}, { bookmarks: exported.bookmarks });
    expect(imported.bookmarks).toBe(1);

    const rows: any[] = await dbQuery(`SELECT url FROM bookmarks`);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe('https://x');
  });

  it('is idempotent for a repeated import', async () => {
    await seed();
    const exported = await exportWith({ ...ALL_OFF, bookmarks: true });
    await dbQuery(`DELETE FROM bookmarks`);

    await handlers['sync:import-data']({}, { bookmarks: exported.bookmarks });
    await handlers['sync:import-data']({}, { bookmarks: exported.bookmarks });

    const rows: any[] = await dbQuery(`SELECT COUNT(*) n FROM bookmarks`);
    expect(rows[0].n).toBe(1);
  });

  it('ignores a category whose table does not exist on this install', async () => {
    // A fresh install may lack kg_* tables; importing must not throw.
    await dbQuery(`DROP TABLE IF EXISTS kg_entities`);
    const res = await handlers['sync:import-data']({}, {
      kgEntities: [{ id: 1, name: 'n', entity_type: 't' }],
      messages: [],
    });
    expect(res.kgEntities).toBe(0);
  });
});
