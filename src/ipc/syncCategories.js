/**
 * Sync categories.
 *
 * The account panel needs to show the user WHAT is syncable and let them pick
 * per-category, rather than syncing one opaque bundle. This module is the single
 * source of truth for:
 *
 *   - which categories exist (id, label, description, grouping)
 *   - which are on by default
 *   - how many local rows each would contribute (shown next to the toggle)
 *   - whether a category is content-bearing enough to warrant a warning
 *
 * The renderer renders from this list; `sync:export-data` filters by it; the
 * pull/import path checks the same set before writing anything back. Keeping the
 * list in the main process means the UI can never drift from what is actually
 * synced.
 *
 * Choice of defaults:
 *   on  - conversations/messages, bookmarks, browsing history, memories,
 *         agent transcripts, npcsh history
 *   off - command history and jinx/tool execution logs. These are high-volume,
 *         low-value for cross-device continuity, and command history can contain
 *         secrets typed into a shell. Users who want them can opt in.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

/**
 * Category registry.
 *
 * `tables` maps each category to the SQLite tables it covers. `timeColumn` names
 * the column an incremental sync should compare against the cursor — keep it
 * accurate, because it is the reference the export queries were written from.
 * The export SQL itself is hand-written in database.js (each category needs its
 * own filter semantics), so `timeColumn` is descriptive rather than executed;
 * a wrong value here means the query and the description disagree.
 *
 * `timeColumn: null` means the table has no natural cursor and is sent whole.
 */
/**
 * Table/filter wiring, keyed by category id.
 *
 * The labels, descriptions, groupings, and default on/off state live in
 * src/shared/syncCategories.json so the RENDERER can show the full list before
 * (or without) talking to the main process. Only the SQLite plumbing lives here,
 * because only the main process queries tables.
 */
const TABLE_WIRING = {
    conversations: [
        { table: 'conversation_history', timeColumn: 'timestamp', entity: 'message', idColumn: 'message_id' },
        { table: 'message_attachments', timeColumn: 'upload_timestamp', entity: 'attachment', idColumn: 'id' },
    ],
    bookmarks: [{ table: 'bookmarks', timeColumn: 'timestamp', entity: 'bookmark', idColumn: 'id' }],
    browser_history: [{ table: 'browser_history', timeColumn: 'last_visited', entity: 'history', idColumn: 'id' }],
    pdf_annotations: [
        { table: 'pdf_highlights', timeColumn: 'timestamp', entity: 'pdf_highlight', idColumn: 'id' },
        { table: 'pdf_drawings', timeColumn: 'timestamp', entity: 'pdf_drawing', idColumn: 'id' },
    ],
    knowledge_graph: [
        { table: 'kg_entities', timeColumn: 'updated_at', entity: 'kg_entity', idColumn: 'id' },
        { table: 'kg_relations', timeColumn: 'created_at', entity: 'kg_relation', idColumn: 'id' },
        { table: 'kg_triples', timeColumn: 'created_at', entity: 'kg_triple', idColumn: 'id' },
    ],
    agent_registry: [{ table: 'agents', timeColumn: null, entity: 'agent', idColumn: 'id' }],
    file_index: [{ table: 'file_index', timeColumn: 'indexed_at', entity: 'file_index', idColumn: 'id' }],
};

/** Filters for categories served from conversation_history rather than a table. */
const FILTER_WIRING = {
    // npcsh has its own category, so agent transcripts exclude it.
    agent_transcripts: { table: 'conversation_history', column: 'source_agent', notNull: true, excludeEquals: 'npcsh' },
    npcsh_history: { table: 'conversation_history', column: 'source_agent', equals: 'npcsh' },
};

const SHARED = require('../shared/syncCategories.json');

/**
 * Per-category payload versions.
 *
 * A category's `payloadVersion` (from the shared JSON) is bumped when the SET
 * OF FIELDS encrypted for its rows changes. That is not a data change, so the
 * row's own timestamp never moves and the `since` cursor will never select it
 * again -- the device keeps a permanently field-starved blob on the server. Any
 * peer then decrypts a kg_relation with no endpoints, or a pdf_drawing with no
 * geometry, and nothing downstream can recover it.
 *
 * So the version pushed per category is tracked, and a category whose pushed
 * version is behind the code's version is exported in FULL (since=epoch) once,
 * rewriting its blobs with the corrected field list.
 *
 * Persistence is injected by the caller (database.js stores it in the
 * `sync_settings` table alongside the category selection) so this module stays
 * free of database concerns and remains trivially testable.
 */
const payloadVersions = {};

/** Hydrate from a plain object, e.g. the parsed `sync_settings` row. */
const loadPayloadVersions = (stored) => {
    if (!stored || typeof stored !== 'object') return;
    for (const id of Object.keys(stored)) {
        const v = Number(stored[id]);
        if (Number.isFinite(v)) payloadVersions[id] = v;
    }
};

/** Current in-memory versions, for persisting by the caller. */
const getPayloadVersions = () => ({ ...payloadVersions });

/**
 * Which categories must be re-exported in full because their encrypted field
 * list changed since this device last pushed them.
 */
const staleCategories = (selection) => {
    const normalized = normalizeSelection(selection);
    const stale = [];
    for (const category of SYNC_CATEGORIES) {
        if (!normalized[category.id]) continue;
        const codeVersion = Number(category.payloadVersion) || 1;
        const pushedVersion = Number(payloadVersions[category.id]) || 1;
        if (pushedVersion < codeVersion) stale.push(category.id);
    }
    return stale;
};

/**
 * Record that `ids` were pushed at the code's current payload version.
 * Returns the full version map so the caller can persist it.
 */
const markCategoriesPushed = (ids) => {
    for (const id of ids) {
        const category = SYNC_CATEGORIES.find((c) => c.id === id);
        if (category) payloadVersions[id] = Number(category.payloadVersion) || 1;
    }
    return getPayloadVersions();
};

const SYNC_CATEGORIES = SHARED.map((c) => ({
    ...c,
    tables: TABLE_WIRING[c.id] || [],
    ...(FILTER_WIRING[c.id] ? { filter: FILTER_WIRING[c.id] } : {}),
}));

const CATEGORY_IDS = SYNC_CATEGORIES.map((c) => c.id);

const defaultSelection = () => {
    const out = {};
    for (const category of SYNC_CATEGORIES) out[category.id] = !!category.defaultEnabled;
    return out;
};

const byId = (id) => SYNC_CATEGORIES.find((c) => c.id === id) || null;

/**
 * Coerce an incoming selection (from settings or the client) into a complete,
 * valid map. Unknown keys are dropped and missing keys fall back to the default,
 * so a settings file written by an older build cannot disable a new category by
 * omission.
 */
const normalizeSelection = (selection) => {
    const out = defaultSelection();
    if (selection && typeof selection === 'object') {
        for (const id of CATEGORY_IDS) {
            if (selection[id] !== undefined) out[id] = !!selection[id];
        }
    }
    return out;
};

const enabledCategories = (selection) => {
    const normalized = normalizeSelection(selection);
    return CATEGORY_IDS.filter((id) => normalized[id]);
};

const openDb = (file) =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(db)));
    });

const all = (db, sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))));

const closeDb = (db) => new Promise((resolve) => db.close(() => resolve()));

/**
 * Count rows per category in a database.
 *
 * Tables that do not exist in this database report `available: false` rather
 * than failing the whole call, because the set of tables differs between a
 * fresh install and one that has only ever done conversations.
 */
const countCategories = async ({ dbPath, home } = {}) => {
    const resolvedHome = home || os.homedir();
    const dbFile = dbPath || path.join(resolvedHome, '.incognide', 'history.db');
    if (!fs.existsSync(dbFile)) {
        return SYNC_CATEGORIES.map((c) => ({ id: c.id, count: 0, available: false }));
    }

    const db = await openDb(dbFile);
    try {
        const present = new Set(
            (await all(db, `SELECT name FROM sqlite_master WHERE type='table'`)).map((r) => r.name)
        );

        const out = [];
        for (const category of SYNC_CATEGORIES) {
            let count = 0;
            let available = false;

            if (category.filter) {
                const { table, column, notNull, equals, excludeEquals } = category.filter;
                if (present.has(table)) {
                    available = true;
                    // A notNull filter may also exclude one specific value (e.g.
                    // agent transcripts exclude npcsh, which has its own
                    // category) so the count matches what the exporter sends.
                    let where;
                    let params;
                    if (notNull) {
                        where = `${column} IS NOT NULL AND ${column} != ''`;
                        params = [];
                        if (excludeEquals !== undefined) {
                            where += ` AND ${column} != ?`;
                            params.push(excludeEquals);
                        }
                    } else {
                        where = `${column} = ?`;
                        params = [equals];
                    }
                    try {
                        const row = (await all(db, `SELECT COUNT(*) n FROM ${table} WHERE ${where}`, params))[0];
                        count = (row && row.n) || 0;
                    } catch {}
                }
            } else {
                for (const entry of category.tables || []) {
                    if (!present.has(entry.table)) continue;
                    available = true;
                    try {
                        const row = (await all(db, `SELECT COUNT(*) n FROM ${entry.table}`))[0];
                        count += (row && row.n) || 0;
                    } catch {}
                }
            }

            out.push({ id: category.id, count, available });
        }
        return out;
    } finally {
        await closeDb(db);
    }
};

/** The category list plus live counts, ready for the account panel. */
const describeCategories = async ({ dbPath, home } = {}) => {
    const counts = await countCategories({ dbPath, home });
    const countById = new Map(counts.map((c) => [c.id, c]));
    return SYNC_CATEGORIES.map((category) => {
        const c = countById.get(category.id) || { count: 0, available: false };
        return {
            id: category.id,
            label: category.label,
            description: category.description,
            group: category.group,
            defaultEnabled: !!category.defaultEnabled,
            sensitive: !!category.sensitive,
            count: c.count,
            available: c.available,
        };
    });
};

module.exports = {
    SYNC_CATEGORIES,
    CATEGORY_IDS,
    defaultSelection,
    normalizeSelection,
    staleCategories,
    markCategoriesPushed,
    loadPayloadVersions,
    getPayloadVersions,
    enabledCategories,
    byId,
    countCategories,
    describeCategories,
};
