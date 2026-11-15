/**
 * Agent history ingestion.
 *
 * Every launchable coding agent keeps its own transcript on disk in its own
 * format. These tests pin the parts that are easy to get silently wrong:
 *
 *   - text lives in different places per agent (codex nests it in content[],
 *     claude splits into typed blocks, opencode separates parts from messages)
 *   - tool plumbing (tool_use/tool_result/thinking, reasoning, command output)
 *     must NOT be ingested as conversation, or a session reads as thousands of
 *     fake user turns
 *   - re-ingesting must be a no-op, because it runs on every startup
 *   - a grown JSONL must resume from its byte offset instead of re-reading it
 *   - ingested rows must be findable by the EXISTING search-conversations SQL
 *     and carry provenance out through sync export
 *
 * Driven against a real SQLite database with the real FTS5 triggers, so the
 * indexing contract is exercised rather than mocked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import sqlite3 from 'sqlite3';

const require = createRequire(import.meta.url);
const H = require('../../src/ipc/agentHistory.js');

let tmpRoot: string;
let home: string;
let dbPath: string;

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

const mk = (rel: string, content: string) => {
  const p = path.join(home, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
};

const jsonl = (entries: any[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthist-'));
  home = path.join(tmpRoot, 'home');
  dbPath = path.join(tmpRoot, 'history.db');
  fs.mkdirSync(home, { recursive: true });

  // Mirror the production schema, including the FTS triggers from main.js.
  await dbQuery(`CREATE TABLE conversation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL, parent_message_id TEXT, branch_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, role TEXT NOT NULL, content TEXT,
    conversation_id TEXT NOT NULL, directory_path TEXT, model TEXT, provider TEXT,
    npc TEXT, team TEXT, reasoning_content TEXT, tool_calls TEXT, tool_results TEXT,
    params TEXT, input_tokens INTEGER, output_tokens INTEGER, cost TEXT,
    execution_mode TEXT, device_id TEXT, device_name TEXT)`);
  await dbQuery(`CREATE VIRTUAL TABLE conversation_history_fts USING fts5(content, content='conversation_history', content_rowid=rowid)`);
  await dbQuery(`CREATE TRIGGER conversation_history_fts_insert AFTER INSERT ON conversation_history BEGIN INSERT INTO conversation_history_fts(rowid, content) VALUES (new.rowid, new.content); END`);
  await H.ensureSourceColumns(dbQuery);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('codex rollouts', () => {
  it('reads user text from content[] blocks, not just payload.text', () => {
    // Regression: userMessage nests its text in content[] while agentMessage
    // uses a flat `text`. Reading only `text` dropped every user turn.
    const lines = jsonl([
      { type: 'session_meta', payload: { cwd: '/work/proj' } },
      { type: 'response_item', ordinal: 1, timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'explain the build' }] } },
      { type: 'response_item', ordinal: 2, timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'it compiles the sources' }] } },
    ]);
    const msgs = H.parseCodexRollout(lines.split('\n'), { sessionId: 's1' });
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[0].text).toBe('explain the build');
    expect(msgs[1].text).toBe('it compiles the sources');
  });

  it('drops injected developer scaffolding and bookkeeping records', () => {
    const lines = jsonl([
      { type: 'token_usage_record', payload: { total: 10 } },
      { type: 'turn_context', payload: { turn_id: 't' } },
      { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<multi_agent_role>you are' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd=/x' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'real question' }] } },
    ]);
    const msgs = H.parseCodexRollout(lines.split('\n'), { sessionId: 's1' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe('real question');
  });
});

describe('claude sessions', () => {
  it('ingests only text blocks, never tool plumbing or thinking', () => {
    // Regression: treating every block as text made a real session report 103
    // "user" messages of which 100 were tool_result payloads.
    const lines = jsonl([
      { type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:01Z', message: { role: 'user', content: 'fix the build' } },
      { type: 'assistant', uuid: 'a1', timestamp: '2026-01-01T00:00:02Z', message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: 'let me look' },
        { type: 'tool_use', id: 't1', name: 'Read', input: {} },
      ] } },
      { type: 'user', uuid: 'u2', timestamp: '2026-01-01T00:00:03Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file contents' }] } },
    ]);
    const msgs = H.parseClaudeSession(lines.split('\n'), { sessionId: 's' });
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1].text).toBe('let me look');
    expect(msgs.some((m: any) => m.text.includes('file contents'))).toBe(false);
  });

  it('maps a project slug back to a working directory', () => {
    expect(H.claudeSlugToPath('-home-alice-proj')).toBe('/home/alice/proj');
    expect(H.claudeSlugToPath('nope')).toBe(null);
  });
});

describe('ingestion', () => {
  it('lands codex and claude turns in conversation_history with provenance', async () => {
    mk('.codex/sessions/2026/01/01/rollout-a.jsonl', jsonl([
      { type: 'session_meta', payload: { cwd: '/work/alpha' } },
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'question about widgets' }] } },
      { type: 'response_item', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer about widgets' }] } },
    ]));
    mk('.claude/projects/-work-alpha/sess-1.jsonl', jsonl([
      { type: 'user', uuid: 'u1', timestamp: '2026-01-02T00:00:01Z', message: { role: 'user', content: 'claude says hello' } },
    ]));

    const stats = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(stats.inserted).toBe(3);

    const rows: any[] = await dbQuery(
      `SELECT source_agent, conversation_id, directory_path, content FROM conversation_history ORDER BY timestamp ASC`
    );
    expect(rows.map((r) => r.source_agent).sort()).toEqual(['claude', 'codex', 'codex']);

    const codexUser = rows.find((r) => r.content === 'question about widgets');
    expect(codexUser.conversation_id).toBe('agent:codex:rollout-a');
    expect(codexUser.directory_path).toBe('/work/alpha');

    const claudeRow = rows.find((r) => r.source_agent === 'claude');
    expect(claudeRow.conversation_id).toBe('agent:claude:sess-1');
    expect(claudeRow.directory_path).toBe('/work/alpha');
  });

  it('is idempotent: a second pass inserts nothing', async () => {
    mk('.codex/sessions/2026/01/01/rollout-a.jsonl', jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'only once' }] } },
    ]));

    const first = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(first.inserted).toBe(1);

    const second = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(second.inserted).toBe(0);

    const rows: any[] = await dbQuery(`SELECT COUNT(*) n FROM conversation_history`);
    expect(rows[0].n).toBe(1);
  });

  it('resumes a grown JSONL from its byte offset', async () => {
    const file = mk('.codex/sessions/2026/01/01/rollout-a.jsonl', jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'first' }] } },
    ]));
    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    // Append a turn the way a live session would.
    fs.appendFileSync(file, jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'second' }] } },
    ]));

    const stats = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(stats.inserted).toBe(1);

    const contents: any[] = await dbQuery(`SELECT content FROM conversation_history ORDER BY timestamp ASC`);
    expect(contents.map((c) => c.content)).toEqual(['first', 'second']);
  });

  it('ignores a partially written trailing line until it is complete', async () => {
    const file = path.join(home, '.codex/sessions/2026/01/01/rollout-a.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const complete = jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'complete turn' }] } },
    ]);
    // Half a JSON object, no trailing newline.
    fs.writeFileSync(file, complete + '{"type":"response_item","paylo');

    const stats = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(stats.inserted).toBe(1);

    // Finish the line; the next pass picks it up without duplicating the first.
    fs.writeFileSync(file, complete + jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'finished turn' }] } },
    ]));
    const after = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(after.inserted).toBe(1);
    const n: any[] = await dbQuery(`SELECT COUNT(*) n FROM conversation_history`);
    expect(n[0].n).toBe(2);
  });
});

describe('npcsh history', () => {
  /**
   * Build a npcsh_history.db.
   *
   * `withId` mirrors the real npcsh schema (`id INTEGER PRIMARY KEY`, a rowid
   * alias) which is what incremental ingestion keys on. Without it we get the
   * older message_id-keyed shape, which must still parse.
   */
  const makeNpcshDb = async (file: string, rows: any[], opts: { withId?: boolean } = {}) => {
    const db = await new Promise<sqlite3.Database>((res, rej) => {
      const d = new sqlite3.Database(file, (e) => (e ? rej(e) : res(d)));
    });
    const idCol = opts.withId ? 'id INTEGER PRIMARY KEY, ' : '';
    await new Promise<void>((res, rej) =>
      db.run(
        `CREATE TABLE conversation_history (
           ${idCol}message_id TEXT ${opts.withId ? 'UNIQUE' : 'PRIMARY KEY'}, parent_message_id TEXT, timestamp TEXT,
           role TEXT, content TEXT, conversation_id TEXT, directory_path TEXT,
           model TEXT, provider TEXT, npc TEXT, team TEXT, reasoning_content TEXT,
           branch_id TEXT)`,
        (e) => (e ? rej(e) : res())
      )
    );
    for (const row of rows) {
      await new Promise<void>((res, rej) =>
        db.run(
          `INSERT INTO conversation_history
             (message_id, parent_message_id, timestamp, role, content, conversation_id,
              directory_path, model, provider, npc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row,
          (e) => (e ? rej(e) : res())
        )
      );
    }
    await new Promise<void>((res) => db.close(() => res()));
  };

  it('finds the real database and ignores a zero-byte stub', () => {
    // ~/.npcsh/history.db is frequently a 0-byte stub left by npcsh; preferring
    // it would silently import nothing.
    const real = path.join(home, 'npcsh_history.db');
    fs.writeFileSync(real, 'x'.repeat(100));
    fs.mkdirSync(path.join(home, '.npcsh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.npcsh', 'history.db'), '');

    expect(H.findNpcshDb(home)).toBe(real);
  });

  it('prefers the largest non-empty candidate', () => {
    fs.writeFileSync(path.join(home, 'npcsh_history.db'), 'x'.repeat(50));
    fs.writeFileSync(path.join(home, '.npcsh_history.db'), 'x'.repeat(200));
    expect(H.findNpcshDb(home)).toBe(path.join(home, '.npcsh_history.db'));
  });

  it('returns null when no candidate has data', () => {
    fs.mkdirSync(path.join(home, '.npcsh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.npcsh', 'history.db'), '');
    expect(H.findNpcshDb(home)).toBe(null);
  });

  it('groups messages by conversation and keeps the directory', async () => {
    const file = path.join(home, 'npcsh_history.db');
    await makeNpcshDb(file, [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'hello', 'convA', '/work/a', 'gpt-5', 'openai', 'sibiji'],
      ['m2', 'm1', '2026-01-01T00:00:02Z', 'assistant', 'world', 'convA', '/work/a', 'gpt-5', 'openai', 'sibiji'],
      ['m3', null, '2026-01-02T00:00:01Z', 'user', 'other', 'convB', '/work/b', 'claude', 'anthropic', 'guac'],
    ]);

    const convs = await H.parseNpcshHistory(file);
    expect(convs).toHaveLength(2);
    const a = convs.find((c: any) => c.sessionId === 'convA');
    expect(a.messages).toHaveLength(2);
    expect(a.directory).toBe('/work/a');
    expect(a.messages[1].parentId).toBe('m1');
  });

  it('keys incremental reads on id so a live db is not re-read every boot', async () => {
    // Regression: npcsh_history.db is written continuously, so its mtime/size
    // never stabilise and a file-stat cursor re-ingests all ~30k rows on every
    // startup. Ingestion must key on the monotonic id instead.
    const file = path.join(home, 'npcsh_history.db');
    await makeNpcshDb(file, [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'first turn', 'convA', '/work/a', null, null, 'sibiji'],
      ['m2', null, '2026-01-01T00:00:02Z', 'assistant', 'second turn', 'convA', '/work/a', null, null, 'sibiji'],
    ], { withId: true });

    const all1 = await H.parseNpcshHistory(file, 0);
    expect(all1.reduce((n: number, c: any) => n + c.messages.length, 0)).toBe(2);

    // max id already ingested -> nothing new, without touching the whole table
    const maxId = Math.max(...all1.flatMap((c: any) => c.messages.map((m: any) => Number(m.srcId))));
    const none = await H.parseNpcshHistory(file, maxId);
    expect(none.reduce((n: number, c: any) => n + c.messages.length, 0)).toBe(0);

    // reading from just before the tail returns only the tail
    const tail = await H.parseNpcshHistory(file, maxId - 1);
    expect(tail.reduce((n: number, c: any) => n + c.messages.length, 0)).toBe(1);
  });

  it('advances the cursor offset and does not re-insert on the next pass', async () => {
    await makeNpcshDb(path.join(home, 'npcsh_history.db'), [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'once', 'convA', '/work/a', null, null, 'sibiji'],
    ], { withId: true });

    const first = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(first.inserted).toBe(1);

    const cursorRows: any[] = await dbQuery(
      `SELECT offset FROM agent_history_sources WHERE agent = 'npcsh'`
    );
    // watermark must be the max source id, not 0, or every boot rescans
    expect(Number(cursorRows[0].offset)).toBeGreaterThan(0);

    const second = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(second.inserted).toBe(0);
  });

  it('ignores a watermark that has drifted above the source max id', async () => {
    // If the cursor is ever written from a different db (or the source is
    // replaced), it can sit above every row. Ingestion would then silently stop
    // forever, so a drifted watermark must fall back to a full read.
    const file = path.join(home, 'npcsh_history.db');
    await makeNpcshDb(file, [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'only row', 'convA', '/work/a', null, null, 'sibiji'],
    ], { withId: true });

    const drifted = await H.parseNpcshHistory(file, 999999);
    expect(drifted.reduce((n: number, c: any) => n + c.messages.length, 0)).toBe(1);
  });

  it('still parses a schema without an id column (older npcsh)', async () => {
    await makeNpcshDb(path.join(home, 'npcsh_history.db'), [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'legacy row', 'convA', '/work/a', null, null, 'sibiji'],
    ]);

    const convs = await H.parseNpcshHistory(path.join(home, 'npcsh_history.db'), 999999);
    // no watermark available -> full read rather than silently returning nothing
    expect(convs.reduce((n: number, c: any) => n + c.messages.length, 0)).toBe(1);
  });

  it('ingests under the npcsh: namespace, searchable and idempotent', async () => {
    await makeNpcshDb(path.join(home, 'npcsh_history.db'), [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', 'a widget question', 'convA', '/work/a', null, null, 'sibiji'],
    ]);

    const stats = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(stats.inserted).toBe(1);
    expect(stats.byAgent.npcsh).toBe(1);

    const rows: any[] = await dbQuery(
      `SELECT conversation_id, message_id, source_agent, directory_path FROM conversation_history`
    );
    expect(rows).toHaveLength(1);
    // npcsh conversations are the user's own chats, not an agent transcript, so
    // they get the npcsh: namespace rather than agent:npcsh:.
    expect(rows[0].conversation_id).toBe('npcsh:convA');
    expect(rows[0].message_id).toBe('npcsh:convA:m1');
    expect(rows[0].source_agent).toBe('npcsh');
    expect(rows[0].directory_path).toBe('/work/a');

    const again = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(again.inserted).toBe(0);

    const hits: any[] = await dbQuery(
      `SELECT conversation_id FROM conversation_history WHERE content LIKE ?`, ['%widget%']
    );
    expect(hits).toHaveLength(1);
  });

  it('skips rows with empty content', async () => {
    await makeNpcshDb(path.join(home, 'npcsh_history.db'), [
      ['m1', null, '2026-01-01T00:00:01Z', 'user', '', 'convA', '/work/a', null, null, 'sibiji'],
      ['m2', null, '2026-01-01T00:00:02Z', 'user', 'real text', 'convA', '/work/a', null, null, 'sibiji'],
    ]);
    const stats = await H.ingestAgentHistory({ dbQuery, dbPath, home });
    expect(stats.inserted).toBe(1);
  });
});

describe('search and sync integration', () => {
  it('is findable by the existing search-conversations SQL', async () => {
    mk('.codex/sessions/2026/01/01/rollout-a.jsonl', jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'how do I tune the turbine' }] } },
    ]));
    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    // Verbatim shape of the production handler's query.
    const rows: any[] = await dbQuery(
      `SELECT DISTINCT conversation_id, MIN(timestamp) start_time, MAX(timestamp) last_message_timestamp
       FROM conversation_history WHERE content LIKE ?
       GROUP BY conversation_id ORDER BY MAX(timestamp) DESC LIMIT 20`,
      ['%turbine%']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].conversation_id).toBe('agent:codex:rollout-a');
  });

  it('is indexed by FTS5 so content search matches', async () => {
    mk('.codex/sessions/2026/01/01/rollout-a.jsonl', jsonl([
      { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'investigate the flux capacitor' }] } },
    ]));
    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    const hits: any[] = await dbQuery(
      `SELECT c.source_agent FROM conversation_history_fts f
       JOIN conversation_history c ON c.rowid = f.rowid
       WHERE conversation_history_fts MATCH ?`,
      ['capacitor']
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].source_agent).toBe('codex');
  });

  it('carries provenance columns out through a SELECT * sync export', async () => {
    mk('.claude/projects/-work-alpha/sess-1.jsonl', jsonl([
      { type: 'user', uuid: 'u1', timestamp: '2026-01-02T00:00:01Z', message: { role: 'user', content: 'sync me' } },
    ]));
    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    const rows: any[] = await dbQuery(`SELECT * FROM conversation_history WHERE timestamp > ?`, ['1970-01-01T00:00:00.000Z']);
    expect(rows).toHaveLength(1);
    expect(rows[0].source_agent).toBe('claude');
    expect(rows[0].source_session_id).toBe('sess-1');
    expect(rows[0].source_path).toContain('sess-1.jsonl');
  });
});

describe('npcsh legacy tables are not re-ingested', () => {
  it('allowlists only the tables npcsh itself owns', () => {
    // npcsh_history.db is a legacy shared database. Tables Incognide has since
    // taken ownership of still exist in it, and reading them from there would
    // duplicate stale rows and resurrect deleted data.
    expect(H.NPCSH_OWNED_TABLES).toEqual(['conversation_history']);

    expect(H.npcshTableAllowed('conversation_history')).toBe(true);
    for (const legacy of [
      'browser_history', 'pdf_highlights', 'pdf_drawings', 'bookmarks',
      'file_index', 'command_history', 'activity_log', 'kg_entities',
      'kg_relations', 'kg_triples', 'site_limits',
    ]) {
      expect(H.npcshTableAllowed(legacy)).toBe(false);
      expect(H.NPCSH_LEGACY_TABLES).toContain(legacy);
    }
  });

  it('reads no table from npcsh besides conversation_history', async () => {
    // Build an npcsh db that ALSO contains a legacy table full of rows. If
    // ingestion ever reads them, the target would gain them.
    const file = path.join(home, 'npcsh_history.db');
    const db = await new Promise<sqlite3.Database>((res, rej) => {
      const d = new sqlite3.Database(file, (e) => (e ? rej(e) : res(d)));
    });
    await new Promise<void>((res, rej) =>
      db.run(`CREATE TABLE conversation_history (
        id INTEGER PRIMARY KEY, message_id TEXT, parent_message_id TEXT, timestamp TEXT,
        role TEXT, content TEXT, conversation_id TEXT, directory_path TEXT, model TEXT,
        provider TEXT, npc TEXT, team TEXT, reasoning_content TEXT, branch_id TEXT)`,
        (e) => (e ? rej(e) : res())));
    await new Promise<void>((res, rej) =>
      db.run(`INSERT INTO conversation_history (message_id,timestamp,role,content,conversation_id)
              VALUES ('m1','2026-01-01 00:00:01','user','real npcsh turn','convA')`,
        (e) => (e ? rej(e) : res())));
    // Legacy leftovers, as in the real shared db.
    await new Promise<void>((res, rej) =>
      db.run(`CREATE TABLE browser_history (id INTEGER PRIMARY KEY, title TEXT, url TEXT, last_visited TEXT)`,
        (e) => (e ? rej(e) : res())));
    await new Promise<void>((res, rej) =>
      db.run(`INSERT INTO browser_history (title,url,last_visited) VALUES ('stale','http://old','2025-01-01 00:00:00')`,
        (e) => (e ? rej(e) : res())));
    await new Promise<void>((res) => db.close(() => res()));

    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    const rows: any[] = await dbQuery(`SELECT message_id, content FROM conversation_history ORDER BY message_id`);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('real npcsh turn');

    // Nothing from the legacy table leaked in.
    const leaked: any[] = await dbQuery(`SELECT count(*) n FROM conversation_history WHERE content LIKE '%stale%'`);
    expect(leaked[0].n).toBe(0);
  });
});

describe('incremental sync is format-agnostic', () => {
  it('normalises space-format timestamps so they can be synced', () => {
    // SQLite compares timestamps as strings; a space at position 10 sorts below
    // 'T', so `timestamp > ?` never matched a `YYYY-MM-DD HH:MM:SS` row.
    expect(H.normaliseTimestamp('2026-11-15 18:12:26')).toBe('2026-11-15T18:12:26.000Z');
    expect(H.normaliseTimestamp('2026-11-15T18:12:26.123Z')).toBe('2026-11-15T18:12:26.123Z');
    expect(H.normaliseTimestamp('2025-01-18 01:45:29')).toBe('2025-01-18T01:45:29.000Z');
    expect(H.normaliseTimestamp(null)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes ingested rows in ISO form so the cursor can find them', async () => {
    const file = path.join(home, 'npcsh_history.db');
    const db = await new Promise<sqlite3.Database>((res, rej) => {
      const d = new sqlite3.Database(file, (e) => (e ? rej(e) : res(d)));
    });
    await new Promise<void>((res, rej) =>
      db.run(`CREATE TABLE conversation_history (
        id INTEGER PRIMARY KEY, message_id TEXT, parent_message_id TEXT, timestamp TEXT,
        role TEXT, content TEXT, conversation_id TEXT, directory_path TEXT, model TEXT,
        provider TEXT, npc TEXT, team TEXT, reasoning_content TEXT, branch_id TEXT)`,
        (e) => (e ? rej(e) : res())));
    // The format npcsh actually writes.
    await new Promise<void>((res, rej) =>
      db.run(`INSERT INTO conversation_history (message_id,timestamp,role,content,conversation_id)
              VALUES ('m1','2026-01-01 00:00:01','user','space format turn','convA')`,
        (e) => (e ? rej(e) : res())));
    await new Promise<void>((res) => db.close(() => res()));

    await H.ingestAgentHistory({ dbQuery, dbPath, home });

    const rows: any[] = await dbQuery(`SELECT timestamp FROM conversation_history`);
    expect(rows).toHaveLength(1);
    // Stored normalised, so it is comparable against an ISO cursor.
    expect(rows[0].timestamp).toBe('2026-01-01T00:00:01.000Z');
    expect(rows[0].timestamp).not.toContain(' ');
  });
});
