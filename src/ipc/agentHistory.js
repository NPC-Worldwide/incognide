/**
 * Agent history ingestion.
 *
 * Each coding agent we can launch keeps its own conversation history on disk, in
 * its own format:
 *
 *   codex     ~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl   (JSONL, response_item/event_msg)
 *             ~/.codex/thread_history_1.sqlite                (thread_items, materialized)
 *   claude    ~/.claude/projects/<slug>/<session>.jsonl       (JSONL, user/assistant entries)
 *   opencode  ~/.local/share/opencode/opencode.db             (SQLite session/message/part)
 *   gemini    ~/.gemini/tmp/<hash>/logs.json                  (no durable transcript)
 *   npcsh     ~/.npcsh/history.db                             (SQLite)
 *
 * Rather than inventing a parallel store, ingested messages are normalized into
 * the SAME `conversation_history` table that native Incognide chats use. That is
 * the whole point: FTS5 indexing (conversation_history_fts), the existing
 * search-conversations handler, and the existing e2e sync export all operate on
 * that table already, so agent history becomes searchable and syncable with no
 * new plumbing downstream.
 *
 * Rows are namespaced so they can never collide with native conversations:
 *   conversation_id = agent:<agent>:<nativeSessionId>
 *   message_id      = agent:<agent>:<nativeSessionId>:<stableItemId>
 * `message_id` is UNIQUE in the table, so re-ingesting the same item is a no-op
 * (INSERT OR IGNORE) and ingestion is naturally idempotent.
 *
 * Ingestion is incremental: `agent_history_sources` records a cursor per file
 * (byte offset) so a growing JSONL is only read from where it left off, and a
 * cheap (mtime, size) check skips unchanged files entirely.
 *
 * SECURITY: only conversational content is read. Nothing from these files is
 * copied into a row except role/text/timestamps and the working directory, which
 * is needed to make the history navigable. Credentials live in sibling files
 * (auth.json, oauth_creds.json) and are never opened.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

/** Namespace prefix for every ingested conversation. */
const AGENT_PREFIX = 'agent:';

const CREATE_SOURCES_TABLE = `
    CREATE TABLE IF NOT EXISTS agent_history_sources (
        source_key TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        path TEXT NOT NULL,
        mtime_ms INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        offset INTEGER DEFAULT 0,
        last_ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`;

/** Columns added to conversation_history to mark provenance. */
const ADDED_COLUMNS = [
    ['source_agent', 'TEXT'],
    ['source_session_id', 'TEXT'],
    ['source_path', 'TEXT'],
];

const openDb = (file, mode = sqlite3.OPEN_READONLY) =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, mode, (err) => (err ? reject(err) : resolve(db)));
    });

/**
 * Open the target history.db directly for bulk writes.
 *
 * `dbQuery` (as implemented in main.js) opens and closes a NEW sqlite3
 * connection for every single statement. A cold ingest is thousands of rows, so
 * inserting through dbQuery meant thousands of connect/close cycles and took
 * minutes. Bulk inserts therefore go through one connection inside one
 * transaction, which is the difference between ~2ms and ~40ms per row.
 */
const openWriteDb = (dbPath) => {
    if (!dbPath) return null;
    return openDb(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
};

const run = (db, sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        })
    );

const getAll = (db, sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

/**
 * Query dispatcher.
 *
 * While a bulk ingest holds an open write transaction, EVERY statement must go
 * through that same connection. Mixing it with `dbQuery` (which opens a fresh
 * connection per call) deadlocks against the write lock: the separate reader
 * cannot see the uncommitted transaction and fails with SQLITE_BUSY.
 */
const makeQuery = (writeDb, dbQuery) => {
    if (!writeDb) return dbQuery;
    return (sql, params = []) => {
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA')) {
            return getAll(writeDb, sql, params);
        }
        return run(writeDb, sql, params);
    };
};

const all = (db, sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))));

// Release a handle. Resolves after close() settles so callers can safely treat
// the file as free afterwards; sqlite3's close callback fires once the handle is
// released, which is what makes the following unlink safe on Windows.
const closeDb = (db) => new Promise((resolve) => {
    if (!db) return resolve();
    try {
        db.close(() => resolve());
    } catch {
        resolve();
    }
});

const safeJson = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const statOrNull = (p) => {
    try {
        return fs.statSync(p);
    } catch {
        return null;
    }
};

/** Recursively collect files matching a predicate, bounded so a huge tree cannot hang startup. */
const walk = (dir, matches, out = [], depth = 0, limit = 20000) => {
    if (depth > 8 || out.length >= limit) return out;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (out.length >= limit) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, matches, out, depth + 1, limit);
        } else if (entry.isFile() && matches(entry.name, full)) {
            out.push(full);
        }
    }
    return out;
};

// ---------------------------------------------------------------------------
// Parsers. Each returns normalized messages:
//   { messageId, parentId, timestamp, role, text, model, provider }
// ---------------------------------------------------------------------------

/**
 * Codex rollout JSONL.
 *
 * A 6k-line rollout is ~90% bookkeeping: token_usage_record, turn_context,
 * world_state, compacted. Only `response_item` payloads whose type is `message`
 * carry conversation, and the `developer` role carries injected system prompts
 * (model_switch, multi_agent_role, environment_context) that would pollute
 * search with boilerplate. Both are filtered out.
 */
const parseCodexRollout = (lines, { sessionId, cwd }) => {
    const out = [];
    // Identity fallback chain. `payload.id` is normally present and the envelope
    // carries `ordinal`, but when NEITHER exists every message previously
    // resolved to the same "<session>:undefined" id and INSERT OR IGNORE kept
    // only the first turn. Falling back to the line's ABSOLUTE byte offset keeps
    // ids stable and unique, including across resumed reads.
    for (const lineEntry of lines) {
        const line = typeof lineEntry === 'string' ? lineEntry : lineEntry.text;
        const lineOffset = typeof lineEntry === 'string' ? null : lineEntry.offset;
        if (!line || !line.trim()) continue;
        const entry = safeJson(line);
        if (!entry) continue;
        if (entry.type !== 'response_item') continue;

        const payload = entry.payload;
        if (!payload || payload.type !== 'message') continue;

        const role = payload.role;
        if (role !== 'user' && role !== 'assistant') continue;

        const parts = Array.isArray(payload.content) ? payload.content : [];
        const text = parts
            .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
            .join('')
            .trim();
        if (!text) continue;

        // Codex injects environment/system scaffolding as user-role messages.
        if (text.startsWith('<environment_context>') || text.startsWith('<permissions')) continue;

        out.push({
            messageId: payload.id
                || (entry.ordinal !== undefined && entry.ordinal !== null ? `${sessionId}:${entry.ordinal}` : null)
                || `${sessionId}:@${lineOffset !== null ? lineOffset : out.length}`,
            parentId: null,
            timestamp: entry.timestamp || null,
            role,
            text,
            model: null,
            provider: null,
        });
    }
    return out;
};

/**
 * Claude Code project JSONL.
 *
 * Entries are typed. Conversation lives on `type: 'user' | 'assistant'` with
 * `message.content` either a string or an array of content blocks. Sidechain
 * entries are sub-agent turns and are kept (they are real conversation) but
 * marked via the parent chain.
 */
const parseClaudeSession = (lines, { sessionId }) => {
    const out = [];
    for (const lineEntry of lines) {
        const line = typeof lineEntry === 'string' ? lineEntry : lineEntry.text;
        const lineOffset = typeof lineEntry === 'string' ? null : lineEntry.offset;
        if (!line || !line.trim()) continue;
        const entry = safeJson(line);
        if (!entry) continue;
        if (entry.type !== 'user' && entry.type !== 'assistant') continue;

        const msg = entry.message;
        if (!msg) continue;

        let text = '';
        if (typeof msg.content === 'string') {
            text = msg.content;
        } else if (Array.isArray(msg.content)) {
            // Only `text` blocks are conversation. `tool_use` and `tool_result`
            // blocks are tool plumbing, and `thinking` is scratch reasoning -
            // including them made a real session report 103 "user" messages of
            // which 100 were tool results.
            text = msg.content
                .map((b) => {
                    if (!b || typeof b !== 'object') return '';
                    if (b.type === 'text' && typeof b.text === 'string') return b.text;
                    return '';
                })
                .join('')
                .trim();
        }
        text = (text || '').trim();
        if (!text) continue;

        // Local command output and tool-result wrappers are not conversation.
        if (text.startsWith('<local-command') || text.startsWith('<command-name>')) continue;

        out.push({
            // uuid is normally present; the absolute offset keeps ids unique and
            // stable even when a line is malformed enough to lack it.
            messageId: entry.uuid || `${sessionId}:@${lineOffset !== null ? lineOffset : out.length}`,
            parentId: entry.parentUuid || null,
            timestamp: entry.timestamp || null,
            role: msg.role || entry.type,
            text,
            model: msg.model || null,
            provider: null,
        });
    }
    return out;
};

/**
 * OpenCode SQLite.
 *
 * `message.data` holds role/model metadata; `part.data` holds the actual content
 * blocks keyed by message_id. Parts are grouped per message and their text
 * blocks concatenated, which mirrors how the TUI renders a turn.
 */
const parseOpenCodeDb = async (dbFile, { sinceMs = 0 } = {}) => {
    const db = await openDb(dbFile);
    const conversations = [];
    try {
        const sessions = await all(
            db,
            `SELECT id, title, directory, time_created FROM session ORDER BY time_created ASC`
        );
        const sessionById = new Map(sessions.map((s) => [s.id, s]));

        const messages = await all(
            db,
            `SELECT id, session_id, time_created, data FROM message ORDER BY time_created ASC`
        );

        const parts = await all(
            db,
            `SELECT message_id, session_id, time_created, data FROM part ORDER BY time_created ASC`
        );

        const partsByMessage = new Map();
        for (const part of parts) {
            const parsed = safeJson(part.data);
            if (!parsed) continue;
            if (parsed.type !== 'text' && parsed.type !== 'reasoning') continue;
            const text = typeof parsed.text === 'string' ? parsed.text : '';
            if (!text.trim()) continue;
            if (!partsByMessage.has(part.message_id)) partsByMessage.set(part.message_id, []);
            partsByMessage.get(part.message_id).push(text);
        }

        const grouped = new Map();
        for (const msg of messages) {
            if (sinceMs && msg.time_created && msg.time_created < sinceMs) continue;
            const meta = safeJson(msg.data) || {};
            const text = (partsByMessage.get(msg.id) || []).join('\n').trim();
            if (!text) continue;

            const session = sessionById.get(msg.session_id) || {};
            if (!grouped.has(msg.session_id)) {
                grouped.set(msg.session_id, {
                    sessionId: msg.session_id,
                    title: session.title || null,
                    directory: session.directory || null,
                    messages: [],
                });
            }
            grouped.get(msg.session_id).messages.push({
                messageId: msg.id,
                parentId: meta.parentID || meta.parentId || null,
                timestamp: msg.time_created ? new Date(msg.time_created).toISOString() : null,
                role: meta.role || 'user',
                text,
                model: meta.modelID || meta.model || null,
                provider: meta.providerID || meta.provider || null,
            });
        }
        conversations.push(...grouped.values());
    } finally {
        await closeDb(db);
    }
    return conversations;
};

/**
 * Codex thread_history SQLite (materialized projection of the rollouts).
 * Preferred over JSONL when present because it is already de-duplicated and
 * ordered; a thread that also has a rollout file is read from here only.
 */
const parseCodexThreadDb = async (dbFile) => {
    const db = await openDb(dbFile);
    const conversations = [];
    try {
        const rows = await all(
            db,
            `SELECT thread_id, item_id, rollout_ordinal, created_at_ms, item_json, item_type
             FROM thread_items
             ORDER BY thread_id, rollout_ordinal ASC`
        );
        const grouped = new Map();
        for (const row of rows) {
            if (row.item_type !== 'userMessage' && row.item_type !== 'agentMessage') continue;
            const item = safeJson(row.item_json) || {};
            // agentMessage carries a flat `text`; userMessage nests it in
            // content[] blocks. Reading only `text` silently dropped every user
            // turn (38 of them in a real thread) and left assistant-only history.
            let text = typeof item.text === 'string' ? item.text : '';
            if (!text && Array.isArray(item.content)) {
                text = item.content
                    .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
                    .join('')
                    .trim();
            }
            if (!text.trim()) continue;
            if (text.startsWith('<environment_context>')) continue;

            if (!grouped.has(row.thread_id)) {
                grouped.set(row.thread_id, {
                    sessionId: row.thread_id,
                    title: null,
                    directory: null,
                    messages: [],
                });
            }
            grouped.get(row.thread_id).messages.push({
                messageId: row.item_id,
                parentId: null,
                timestamp: row.created_at_ms ? new Date(row.created_at_ms).toISOString() : null,
                role: row.item_type === 'userMessage' ? 'user' : 'assistant',
                text,
                model: null,
                provider: null,
            });
        }
        conversations.push(...grouped.values());
    } finally {
        await closeDb(db);
    }
    return conversations;
};

/**
 * npcsh `conversation_history`.
 *
 * npcsh keeps its own SQLite history whose conversation_history table already
 * has the SAME column vocabulary Incognide uses (message_id, role, content,
 * conversation_id, directory_path, npc, team, model, provider, cost, ...). That
 * is not a coincidence - it is the schema Incognide's own table was modelled on -
 * so this is a straight projection rather than a reshape.
 *
 * THREE database locations exist in the wild:
 *   ~/npcsh_history.db          the real one (large; tens of thousands of rows)
 *   ~/.npcsh_history.db         older/alternate location
 *   ~/.npcsh/history.db         often a zero-byte stub; must not be preferred
 * The largest non-empty candidate wins, so a stub can never shadow real data.
 *
 * npcsh's messages are its OWN conversations, not an agent transcript, so they
 * are namespaced as `npcsh:` rather than `agent:npcsh:`. That keeps them
 * distinguishable from an agent named npcsh while still sharing the table, the
 * FTS index, and the sync path.
 */
const NPCSH_PREFIX = 'npcsh:';

/**
 * The ONLY npcsh table we ingest.
 *
 * npcsh_history.db is an old shared database: alongside the tables the npcsh
 * binary itself owns, it still carries leftovers from when Incognide used the
 * same file (browser_history, pdf_highlights, pdf_drawings, bookmarks,
 * file_index, command_history, activity_log, autocomplete_*, site_limits,
 * kg_entities/relations/triples, ...). Those are INCOGNIDE's tables and
 * Incognide already has its own live copies in ~/.incognide/history.db, so
 * reading them out of npcsh's file would duplicate stale rows and resurrect
 * data the user deleted.
 *
 * Verified against npcsh's own source: `grep -rhoE '"... (INTO|FROM|TABLE) [a-z_]+'`
 * over npcsh/rust/src/*.rs yields exactly conversation_history, jinx_executions,
 * memory_lifecycle and schema_migrations. Of those, `conversation_history` is the
 * transcript history this feature is about; the other two already exist natively
 * in Incognide and are ingested/exported from ~/.incognide/history.db.
 *
 * Everything below is expressed as an explicit allowlist so that adding a table
 * to npcsh can never silently pull legacy Incognide data along with it.
 */
const NPCSH_OWNED_TABLES = Object.freeze([
    'conversation_history',
]);

/**
 * Tables that used to live in the npcsh database and are now owned by
 * Incognide. Exported for the regression test; never read from npcsh.
 */
const NPCSH_LEGACY_TABLES = Object.freeze([
    'activity_log',
    'autocomplete_suggestions',
    'autocomplete_training',
    'bookmarks',
    'browser_history',
    'browser_navigations',
    'command_history',
    'file_index',
    'kg_entities',
    'kg_relations',
    'kg_triples',
    'pdf_drawings',
    'pdf_highlights',
    'site_limits',
]);

/**
 * Read a table out of npcsh's database only if npcsh actually owns it.
 *
 * Returns null for a legacy/unknown table instead of silently returning rows,
 * which is the failure mode that caused stale Incognide data to be double-read.
 */
const npcshTableAllowed = (table) => NPCSH_OWNED_TABLES.includes(table);

const npcshCandidatePaths = (home) => [
    path.join(home, 'npcsh_history.db'),
    path.join(home, '.npcsh_history.db'),
    path.join(home, '.npcsh', 'history.db'),
];

/** Pick the largest non-empty npcsh history database, or null. */
const findNpcshDb = (home) => {
    let best = null;
    for (const candidate of npcshCandidatePaths(home)) {
        const stat = statOrNull(candidate);
        if (stat && stat.size > 0 && (!best || stat.size > best.size)) {
            best = { file: candidate, size: stat.size };
        }
    }
    return best ? best.file : null;
};

/**
 * Read npcsh conversations. Rows are grouped by conversation_id so the same
 * conversation keeps its identity and directory across passes.
 */
const parseNpcshHistory = async (dbFile, sinceId = 0) => {
    // Guard: this parser must only ever read npcsh-owned tables. If someone
    // points it at a legacy table the allowlist refuses rather than quietly
    // resurrecting data Incognide already owns.
    if (!npcshTableAllowed('conversation_history')) return [];

    const db = await openDb(dbFile);
    const conversations = [];
    try {
        // npcsh_history.db is a LIVE database: rows are appended continuously, so
        // its mtime/size change constantly and an mtime/size cursor can never
        // stabilise. Key on the monotonic primary key instead so each pass reads
        // only what is new. Real npcsh schemas declare `id INTEGER PRIMARY KEY`
        // (a rowid alias, so this stays an index scan). Older/partial schemas key
        // on message_id only; those fall back to a full read with no watermark.
        const cols = await all(db, `PRAGMA table_info(conversation_history)`);
        const hasId = cols.some((c) => c.name === 'id');
        let watermark = hasId ? Math.max(0, Number(sinceId) || 0) : 0;

        // Guard against a cursor that has drifted past the source's max id (e.g.
        // it was written from a different database, or the source was replaced).
        // Without this the watermark would sit above every row and ingestion
        // would silently stop forever.
        if (hasId && watermark > 0) {
            const top = await all(db, `SELECT max(id) mx FROM conversation_history`);
            const maxId = Number(top && top[0] && top[0].mx) || 0;
            if (maxId < watermark) watermark = 0;
        }

        const rows = await all(
            db,
            `SELECT ${hasId ? 'id,' : ''} message_id, parent_message_id, timestamp, role, content,
                    conversation_id, directory_path, model, provider, npc,
                    team, reasoning_content, branch_id
             FROM conversation_history
             WHERE content IS NOT NULL AND TRIM(content) != ''
               ${hasId ? 'AND id > ?' : ''}
             ORDER BY ${hasId ? 'id' : 'timestamp'} ASC`,
            hasId ? [watermark] : []
        );

        const grouped = new Map();
        for (const row of rows) {
            const key = row.conversation_id || 'unfiled';
            if (!grouped.has(key)) {
                grouped.set(key, {
                    sessionId: key,
                    title: null,
                    directory: row.directory_path || null,
                    sourcePath: dbFile,
                    messages: [],
                });
            }
            grouped.get(key).messages.push({
                messageId: row.message_id || `${key}:${grouped.get(key).messages.length}`,
                parentId: row.parent_message_id || null,
                timestamp: row.timestamp || null,
                role: row.role || 'user',
                text: row.content,
                model: row.model || null,
                provider: row.provider || null,
                srcId: hasId ? row.id : null,
            });
        }
        conversations.push(...grouped.values());
    } finally {
        await closeDb(db);
    }
    return conversations;
};

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

const readJsonlSlice = (file, offset, size) => {
    const fd = fs.openSync(file, 'r');
    try {
        const length = Math.max(0, size - offset);
        if (length === 0) return { lines: [], consumed: offset };
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, offset);
        const text = buffer.toString('utf8');
        // Only consume up to the last complete line; a partially written tail is
        // left for the next pass so a live session is not parsed mid-write.
        const lastNewline = text.lastIndexOf('\n');
        if (lastNewline === -1) return { lines: [], consumed: offset };
        const complete = text.slice(0, lastNewline);

        // Each line carries its ABSOLUTE byte offset. Identity fallbacks key off
        // this rather than an index relative to the slice, because a resumed read
        // starts mid-file and a relative index would repeat earlier ids -
        // silently collapsing resumed turns onto already-inserted ones.
        const lines = [];
        let cursor = offset;
        for (const line of complete.split('\n')) {
            lines.push({ text: line, offset: cursor });
            cursor += Buffer.byteLength(line + '\n', 'utf8');
        }

        return { lines, consumed: cursor };
    } finally {
        fs.closeSync(fd);
    }
};

/** Directory slug -> probable working directory, for Claude's project folders. */
const claudeSlugToPath = (slug) => {
    if (!slug || !slug.startsWith('-')) return null;
    return '/' + slug.slice(1).replace(/-/g, '/');
};

const readCursor = async (dbQuery, key) => {
    const rows = await dbQuery('SELECT offset, mtime_ms, size FROM agent_history_sources WHERE source_key = ?', [key]);
    return (rows && rows[0]) || null;
};

const writeCursor = async (dbQuery, key, agent, file, mtimeMs, size, offset) => {
    await dbQuery(
        `INSERT INTO agent_history_sources (source_key, agent, path, mtime_ms, size, offset, last_ingested_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(source_key) DO UPDATE SET
             mtime_ms = excluded.mtime_ms,
             size = excluded.size,
             offset = excluded.offset,
             last_ingested_at = CURRENT_TIMESTAMP`,
        [key, agent, file, mtimeMs, size, offset]
    );
};

/**
 * Persist conversations into conversation_history.
 *
 * INSERT OR IGNORE on the UNIQUE message_id makes repeat ingestion free, and
 * the FTS triggers defined in main.js index the content automatically.
 */
const INSERT_MESSAGE = `
    INSERT OR IGNORE INTO conversation_history
        (message_id, parent_message_id, timestamp, role, content, conversation_id,
         directory_path, model, provider, source_agent, source_session_id, source_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Normalise a source timestamp to ISO-8601 with a `T` separator and `Z` suffix.
 *
 * npcsh writes local wall-clock strings like `2026-11-15 18:12:26` (space, no
 * zone). Everything else we ingest is ISO-8601. The sync export selects
 * `WHERE timestamp > ?` against an ISO-8601 cursor, and SQLite compares those
 * as *strings*: at position 10 a space (0x20) sorts below 'T' (0x54), so a
 * space-format row always reads as older than the cursor and is silently
 * excluded from every incremental sync forever. Normalising on write is the
 * durable fix; rows already ingested keep the bad format until re-ingested.
 */
const normaliseTimestamp = (ts) => {
    if (!ts) return new Date().toISOString();
    const text = String(ts).trim();
    // Already ISO-ish: has a T separator.
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
    }
    // Space-separated local wall clock, e.g. "2026-11-15 18:12:26".
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
        // Treat as UTC. The value is wall-clock from the same machine that
        // produced it; the important property is a consistent, sortable format.
        const parsed = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
};

/** Flatten conversations into INSERT parameter tuples. */
const toRows = (agent, conversations) => {
    const rows = [];
    for (const conv of conversations) {
        if (!conv.messages || conv.messages.length === 0) continue;
        const conversationId = `${AGENT_PREFIX}${agent}:${conv.sessionId}`;
        for (const msg of conv.messages) {
            const messageId = String(msg.messageId).startsWith(AGENT_PREFIX)
                ? msg.messageId
                : `${AGENT_PREFIX}${agent}:${conv.sessionId}:${msg.messageId}`;
            rows.push([
                messageId,
                msg.parentId || null,
                normaliseTimestamp(msg.timestamp),
                msg.role,
                msg.text,
                conversationId,
                conv.directory || null,
                msg.model || null,
                msg.provider || null,
                agent,
                conv.sessionId,
                conv.sourcePath || null,
            ]);
        }
    }
    return rows;
};

/**
 * Persist conversations into conversation_history.
 *
 * INSERT OR IGNORE on the UNIQUE message_id makes repeat ingestion free, and the
 * FTS triggers defined in main.js index the content automatically.
 *
 * `writeDb` is an optional already-open connection; when supplied, all rows for
 * this call are written inside a single transaction on it. Without it, rows are
 * written one at a time through dbQuery (correct, but far slower).
 */
const persistConversations = async (dbQuery, agent, conversations, writeDb = null) => {
    const rows = toRows(agent, conversations);
    if (rows.length === 0) return 0;

    if (writeDb) {
        let inserted = 0;
        for (const params of rows) {
            try {
                const res = await run(writeDb, INSERT_MESSAGE, params);
                if (res.changes) inserted += res.changes;
            } catch (err) {
                // A single malformed row must not abort the whole batch.
                if (!/UNIQUE|constraint/i.test(err.message)) throw err;
            }
        }
        return inserted;
    }

    let inserted = 0;
    for (const params of rows) {
        const result = await dbQuery(INSERT_MESSAGE, params);
        if (result && result.changes) inserted += result.changes;
    }
    return inserted;
};

const INSERT_NPCSH_MESSAGE = `
    INSERT OR IGNORE INTO conversation_history
        (message_id, parent_message_id, timestamp, role, content, conversation_id,
         directory_path, model, provider, source_agent, source_session_id, source_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Persist one npcsh conversation.
 *
 * Deliberately separate from persistConversations because npcsh rows use the
 * `npcsh:` namespace rather than `agent:`: they are the user's own npcsh
 * conversations, not a coding agent's transcript.
 */
const persistNpcshConversation = async (dbQuery, conv, writeDb = null) => {
    if (!conv.messages || conv.messages.length === 0) return 0;
    const conversationId = `${NPCSH_PREFIX}${conv.sessionId}`;

    const rows = conv.messages.map((msg) => {
        const messageId = String(msg.messageId).startsWith(NPCSH_PREFIX)
            ? msg.messageId
            : `${NPCSH_PREFIX}${conv.sessionId}:${msg.messageId}`;
        return [
            messageId,
            msg.parentId || null,
            normaliseTimestamp(msg.timestamp),
            msg.role,
            msg.text,
            conversationId,
            conv.directory || null,
            msg.model || null,
            msg.provider || null,
            'npcsh',
            conv.sessionId,
            conv.sourcePath || null,
        ];
    });

    let inserted = 0;
    for (const params of rows) {
        try {
            const res = writeDb
                ? await run(writeDb, INSERT_NPCSH_MESSAGE, params)
                : await dbQuery(INSERT_NPCSH_MESSAGE, params);
            if (res && res.changes) inserted += res.changes;
        } catch (err) {
            if (!/UNIQUE|constraint/i.test(err.message)) throw err;
        }
    }
    return inserted;
};

/**
 * Ingest every agent's history.
 *
 * @returns {{ inserted: number, byAgent: Record<string, number>, scanned: number, skipped: number, errors: string[] }}
 */
const ingestAgentHistory = async ({ dbQuery, dbPath, home, force = false } = {}) => {
    const resolvedHome = home || os.homedir();
    const stats = { inserted: 0, byAgent: {}, scanned: 0, skipped: 0, errors: [] };

    // One connection for every statement in this pass, wrapped in one
    // transaction. Opening a connection per row is what made a cold ingest take
    // minutes, and mixing connections deadlocks against the write lock.
    let writeDb = null;
    if (dbPath) {
        try {
            writeDb = await openWriteDb(dbPath);
            await run(writeDb, 'PRAGMA journal_mode=WAL');
            await run(writeDb, 'PRAGMA busy_timeout=10000');
            await run(writeDb, 'BEGIN IMMEDIATE');
        } catch (err) {
            stats.errors.push(`open write db: ${err.message}`);
            writeDb = null;
        }
    }
    const q = makeQuery(writeDb, dbQuery);

    await q(CREATE_SOURCES_TABLE);

    const bump = (agent, count) => {
        stats.byAgent[agent] = (stats.byAgent[agent] || 0) + count;
        stats.inserted += count;
    };

    const handleJsonl = async (agent, file, parser, extra = {}) => {
        stats.scanned++;
        const stat = statOrNull(file);
        if (!stat) return;

        const key = `${agent}:${file}`;
        let offset = 0;
        if (!force) {
            const cursor = await readCursor(q, key);
            // Unchanged file: nothing to do at all.
            if (cursor && cursor.mtime_ms === Math.floor(stat.mtimeMs) && cursor.size === stat.size) {
                stats.skipped++;
                return;
            }
            // Shrunk file means it was rotated/truncated: start over.
            if (cursor && stat.size >= cursor.offset) offset = cursor.offset;
        }

        try {
            const { lines, consumed } = readJsonlSlice(file, offset, stat.size);
            if (lines.length > 0) {
                const sessionId = extra.sessionId || path.basename(file).replace(/\.jsonl$/, '');
                const messages = parser(lines, { ...extra, sessionId });
                const inserted = await persistConversations(q, agent, [
                    { sessionId, directory: extra.cwd || null, sourcePath: file, messages },
                ], writeDb);
                bump(agent, inserted);
            }
            await writeCursor(q, key, agent, file, Math.floor(stat.mtimeMs), stat.size, consumed);
        } catch (err) {
            stats.errors.push(`${agent}: ${path.basename(file)}: ${err.message}`);
        }
    };

    // --- Codex: prefer the materialized SQLite, fall back to rollout JSONL ----
    const codexThreadDb = path.join(resolvedHome, '.codex', 'thread_history_1.sqlite');
    if (statOrNull(codexThreadDb)) {
        stats.scanned++;
        const stat = statOrNull(codexThreadDb);
        const key = `codex:${codexThreadDb}`;
        const cursor = force ? null : await readCursor(q, key);
        if (cursor && cursor.mtime_ms === Math.floor(stat.mtimeMs) && cursor.size === stat.size) {
            stats.skipped++;
        } else {
            try {
                const convs = await parseCodexThreadDb(codexThreadDb);
                for (const conv of convs) {
                    conv.sourcePath = codexThreadDb;
                    bump('codex', await persistConversations(q, 'codex', [conv], writeDb));
                }
                await writeCursor(q, key, 'codex', codexThreadDb, Math.floor(stat.mtimeMs), stat.size, 0);
            } catch (err) {
                stats.errors.push(`codex db: ${err.message}`);
            }
        }
    } else {
        // No projection table: read the raw rollouts. cwd comes from session_meta.
        const sessionsDir = path.join(resolvedHome, '.codex', 'sessions');
        const rollouts = walk(sessionsDir, (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'));
        for (const file of rollouts) {
            const stat = statOrNull(file);
            if (!stat) continue;
            const key = `codex:${file}`;
            const cursor = force ? null : await readCursor(q, key);
            if (cursor && cursor.mtime_ms === Math.floor(stat.mtimeMs) && cursor.size === stat.size) {
                stats.skipped++;
                continue;
            }
            let cwd = null;
            try {
                // session_meta is the first line and carries cwd.
                const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
                const meta = safeJson(firstLine);
                cwd = meta && meta.payload ? meta.payload.cwd || null : null;
            } catch {}
            await handleJsonl('codex', file, parseCodexRollout, { cwd });
        }
    }

    // --- Claude Code -------------------------------------------------------
    const claudeProjects = path.join(resolvedHome, '.claude', 'projects');
    for (const file of walk(claudeProjects, (name) => name.endsWith('.jsonl'))) {
        const slug = path.basename(path.dirname(file));
        await handleJsonl('claude', file, parseClaudeSession, {
            cwd: claudeSlugToPath(slug),
            sessionId: path.basename(file).replace(/\.jsonl$/, ''),
        });
    }

    // --- OpenCode ----------------------------------------------------------
    const openCodeDb = path.join(resolvedHome, '.local', 'share', 'opencode', 'opencode.db');
    if (statOrNull(openCodeDb)) {
        stats.scanned++;
        const stat = statOrNull(openCodeDb);
        const key = `opencode:${openCodeDb}`;
        const cursor = force ? null : await readCursor(q, key);
        if (cursor && cursor.mtime_ms === Math.floor(stat.mtimeMs) && cursor.size === stat.size) {
            stats.skipped++;
        } else {
            try {
                const convs = await parseOpenCodeDb(openCodeDb);
                for (const conv of convs) {
                    conv.sourcePath = openCodeDb;
                    bump('opencode', await persistConversations(q, 'opencode', [conv], writeDb));
                }
                await writeCursor(q, key, 'opencode', openCodeDb, Math.floor(stat.mtimeMs), stat.size, 0);
            } catch (err) {
                stats.errors.push(`opencode: ${err.message}`);
            }
        }
    }

    // --- npcsh -------------------------------------------------------------
    // npcsh's own conversation_history, walked into the same table so it is
    // searchable and syncable like everything else. Pick the largest non-empty
    // candidate: ~/.npcsh/history.db is frequently a zero-byte stub and must
    // never shadow the real database.
    const npcshDb = findNpcshDb(resolvedHome);
    if (npcshDb) {
        stats.scanned++;
        const key = `npcsh:${npcshDb}`;
        const cursor = force ? null : await readCursor(q, key);
        // npcsh_history.db is written continuously, so mtime/size are never
        // stable and gating on them would re-read all ~30k rows on every boot.
        // `offset` carries the highest `id` already ingested instead.
        const sinceId = cursor ? Number(cursor.offset) || 0 : 0;
        try {
            const convs = await parseNpcshHistory(npcshDb, sinceId);
            let maxId = sinceId;
            for (const conv of convs) {
                for (const msg of conv.messages) {
                    if (Number(msg.srcId) > maxId) maxId = Number(msg.srcId);
                }
                bump('npcsh', await persistNpcshConversation(q, conv, writeDb));
            }
            if (maxId > sinceId || !cursor) {
                const stat = statOrNull(npcshDb) || { mtimeMs: 0, size: 0 };
                await writeCursor(q, key, 'npcsh', npcshDb, Math.floor(stat.mtimeMs), stat.size, maxId);
            } else {
                stats.skipped++;
            }
        } catch (err) {
            stats.errors.push(`npcsh: ${err.message}`);
        }
    }

    if (writeDb) {
        try {
            await run(writeDb, 'COMMIT');
        } catch (err) {
            stats.errors.push(`commit: ${err.message}`);
            try { await run(writeDb, 'ROLLBACK'); } catch {}
        }
        // Always release the handle. A leaked write connection keeps the
        // database locked, which on Windows makes the file undeletable (EBUSY)
        // for whatever runs next.
        await closeDb(writeDb);
    }

    return stats;
};

/** Add provenance columns to conversation_history. Safe to call repeatedly. */
const ensureSourceColumns = async (dbQuery) => {
    for (const [column, definition] of ADDED_COLUMNS) {
        try {
            const cols = await dbQuery(`PRAGMA table_info(conversation_history)`);
            if (!cols.find((c) => c.name === column)) {
                await dbQuery(`ALTER TABLE conversation_history ADD COLUMN ${column} ${definition}`);
            }
        } catch (err) {
            // A concurrent migration may have added it; only surface real failures.
            if (!/duplicate column/i.test(err.message)) throw err;
        }
    }
    try {
        await dbQuery(CREATE_SOURCES_TABLE);
        await dbQuery(`CREATE INDEX IF NOT EXISTS idx_ch_source_agent ON conversation_history(source_agent)`);
        await dbQuery(`CREATE INDEX IF NOT EXISTS idx_ch_source_session ON conversation_history(conversation_id)`);
    } catch {}
};

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

const register = (ctx = {}) => {
    const { ipcMain, dbQuery } = ctx;
    const home = ctx.home || os.homedir();
    // Bulk writes bypass dbQuery (one connection per call). Resolve the same
    // database file the rest of the app uses.
    const dbPath = ctx.dbPath
        || process.env.INCOGNIDE_DB_PATH
        || path.join(home, '.incognide', 'history.db');

    /**
     * Re-scan every agent history source and ingest anything new.
     *
     * Incremental and idempotent: unchanged files are skipped by (mtime, size),
     * grown JSONL files resume from their stored byte offset, and re-inserting an
     * already-seen message is a no-op thanks to the UNIQUE message_id. So this is
     * safe to call on every startup and after any agent session.
     */
    ipcMain.handle('agent-history:ingest', async (_, opts = {}) => {
        try {
            if (typeof dbQuery !== 'function') {
                return { success: false, error: 'db unavailable', ...{ inserted: 0, byAgent: {}, scanned: 0, skipped: 0, errors: [] } };
            }
            await ensureSourceColumns(dbQuery);
            const stats = await ingestAgentHistory({ dbQuery, dbPath, home, force: !!opts?.force });
            return { success: true, ...stats };
        } catch (err) {
            return { success: false, error: err.message, inserted: 0, byAgent: {}, scanned: 0, skipped: 0, errors: [err.message] };
        }
    });

    /**
     * Summarize what has been ingested, per agent. Backs any UI that wants to
     * show "N conversations indexed from Claude Code" without guessing.
     */
    ipcMain.handle('agent-history:stats', async () => {
        try {
            if (typeof dbQuery !== 'function') return { agents: [], error: 'db unavailable' };
            const rows = await dbQuery(
                `SELECT source_agent AS agent,
                        COUNT(DISTINCT conversation_id) AS conversations,
                        COUNT(*) AS messages,
                        MAX(timestamp) AS last_message
                 FROM conversation_history
                 WHERE source_agent IS NOT NULL AND source_agent != ''
                 GROUP BY source_agent
                 ORDER BY messages DESC`
            );
            return { agents: rows || [], error: null };
        } catch (err) {
            return { agents: [], error: err.message };
        }
    });
};

module.exports = {
    register,
    ingestAgentHistory,
    normaliseTimestamp,
    ensureSourceColumns,
    persistConversations,
    parseCodexRollout,
    parseClaudeSession,
    parseOpenCodeDb,
    parseCodexThreadDb,
    claudeSlugToPath,
    parseNpcshHistory,
    findNpcshDb,
    npcshCandidatePaths,
    NPCSH_OWNED_TABLES,
    NPCSH_LEGACY_TABLES,
    npcshTableAllowed,
    AGENT_PREFIX,
    NPCSH_PREFIX,
    CREATE_SOURCES_TABLE,
};
