const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Agent discovery + registry (issue #397).
 *
 * Coding agents each keep their own state directory in the user's home
 * (~/.claude, ~/.codex, ~/.npcsh, ...). Incognide previously only knew about the
 * agents hardcoded in TerminalCreateButton's KNOWN_AGENTS array, so anything
 * installed but unlisted was invisible, and none of an agent's config (default
 * model, attached npc/team) was reachable.
 *
 * Discovery is read-only against those directories. User-owned state (labels,
 * pinning, custom agents) lives in the `agents` table in history.db -- the same
 * SQLite database every other piece of Incognide state uses.
 *
 * SECURITY: discovery never reads credential *values*. It records only whether
 * a credential file exists. Agent credentials are the user's provider keys and
 * must not be copied into a database row or synced.
 */

// ---------------------------------------------------------------------------
// Catalog: where to look for each agent. `homes` are relative to the user home.
// ---------------------------------------------------------------------------
const AGENT_CATALOG = [
    { id: 'npcsh', label: 'npcsh', command: 'npcsh', homes: ['.npcsh'] },
    { id: 'claude', label: 'Claude Code', command: 'claude', homes: ['.claude'], files: ['.claude.json'] },
    { id: 'codex', label: 'Codex', command: 'codex', homes: ['.codex'] },
    { id: 'gemini', label: 'Gemini CLI', command: 'gemini', homes: ['.gemini'] },
    { id: 'opencode', label: 'opencode', command: 'opencode', homes: ['.opencode', '.config/opencode'] },
    { id: 'nanocoder', label: 'Nanocoder', command: 'nanocoder', homes: ['.nanocoder', '.config/nanocoder'] },
    { id: 'qwen', label: 'Qwen Code', command: 'qwen', homes: ['.qwen'] },
    { id: 'hermes', label: 'Hermes', command: 'hermes', homes: ['.hermes'] },
    { id: 'pi', label: 'Pi', command: 'pi', homes: ['.pi'] },
    { id: 'deepseek', label: 'DeepSeek', command: 'deepseek', homes: ['.deepseek'] },
    { id: 'openclaw', label: 'OpenClaw', command: 'openclaw', homes: ['.openclaw'] },
    { id: 'ollama', label: 'Ollama', command: 'ollama', homes: ['.ollama'] },
];

const AGENT_IDS = AGENT_CATALOG.map((a) => a.id);

const normalizeAgentId = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

/** Expand a leading ~ against the supplied home dir. */
const expandHome = (p, home) => {
    if (!p) return null;
    const h = home || os.homedir();
    if (p === '~') return h;
    if (p.startsWith('~/')) return path.join(h, p.slice(2));
    return p;
};

const pathExists = (p) => {
    if (!p) return false;
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
};

const readTextSafe = (p) => {
    try {
        return fs.readFileSync(p, 'utf8');
    } catch {
        return null;
    }
};

const readJsonSafe = (p) => {
    const raw = readTextSafe(p);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/**
 * Pull the default model out of a codex `config.toml` without adding a TOML
 * dependency. Only the top-level `model = "..."` key matters, and keys inside a
 * `[table]` cannot be confused with it.
 */
const parseCodexModel = (tomlText) => {
    if (!tomlText) return null;
    for (const raw of String(tomlText).split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('[')) return null; // top-level keys are over
        const m = line.match(/^model\s*=\s*["']([^"']+)["']/);
        if (m) return m[1];
    }
    return null;
};

/**
 * `~/.npcsh/agent_coders.json` is npcsh's own registry of agents it has been
 * attached to. It is the strongest signal that an agent is actually wired up,
 * because it records the npc/team the agent was bound to.
 */
const parseNpcshAgentCoders = (json) => {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
    const out = [];
    for (const [command, meta] of Object.entries(json)) {
        if (!meta || typeof meta !== 'object') continue;
        out.push({
            id: normalizeAgentId(command),
            command: String(command),
            npc: meta.npc || null,
            teamPath: meta.team_path || null,
            mcpServer: meta.mcp_server || null,
            attachedAt: typeof meta.attached_at === 'number' ? meta.attached_at : null,
        });
    }
    return out;
};

/** `~/.npcsh/agent_coders.json` -- npcsh's index of the agents it has attached. */
const npcshRegistryPath = (home) =>
    path.join(home || os.homedir(), '.npcsh', 'agent_coders.json');

/** Turn one npcsh registry entry into attachable facts. */
const registrationFacts = (reg) => {
    if (!reg) return null;
    return {
        registeredWithNpcsh: true,
        npc: reg.npc,
        teamPath: reg.teamPath,
        mcpServer: reg.mcpServer,
        attachedAt: reg.attachedAt,
    };
};

/**
 * Merge discovered agents with saved registry rows.
 *
 * Saved rows win for user-owned fields (label edits, pinning); discovered data
 * wins for machine facts (installed, home present). Entries that are neither
 * installed, configured, user-added, nor reported by npcsh are dropped so the
 * list stays meaningful.
 */
const mergeAgentRecords = (discovered, saved) => {
    const byId = new Map();

    for (const d of discovered || []) {
        const id = normalizeAgentId(d.id);
        if (!id) continue;
        byId.set(id, { ...d, id });
    }

    for (const s of saved || []) {
        const id = normalizeAgentId(s.id);
        if (!id) continue;
        const prev = byId.get(id);
        if (!prev) {
            byId.set(id, { ...s, id, source: s.source || 'custom' });
        } else {
            byId.set(id, {
                ...prev,
                label: s.label || prev.label,
                pinned: s.pinned !== undefined ? !!s.pinned : prev.pinned,
                custom: s.custom !== undefined ? !!s.custom : prev.custom,
            });
        }
    }

    return Array.from(byId.values())
        .filter((a) => a.installed || a.homePath || a.configured || a.custom)
        .sort((a, b) => {
            if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
            return String(a.label || a.id).localeCompare(String(b.label || b.id));
        });
};

/**
 * Portable subset for sync. Absolute home paths identify a machine and are
 * useless on another one, and credential presence is not carried either.
 */
const sanitizeAgentForSync = (record) => {
    if (!record) return null;
    return {
        id: normalizeAgentId(record.id),
        label: record.label || record.id,
        command: record.command || record.id,
        pinned: !!record.pinned,
        custom: !!record.custom,
    };
};

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const whichBinary = (command) => {
    try {
        const which = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${which} ${command}`, { stdio: 'ignore', timeout: 2000 });
        return true;
    } catch {
        return false;
    }
};

const describeAgent = (spec, home) => {
    const homePaths = (spec.homes || [])
        .map((h) => path.join(home, h))
        .filter((p) => pathExists(p));
    const looseFiles = (spec.files || [])
        .map((f) => path.join(home, f))
        .filter((p) => pathExists(p));

    const installed = whichBinary(spec.command);
    const configured = homePaths.length > 0 || looseFiles.length > 0;

    return {
        id: spec.id,
        label: spec.label,
        command: spec.command,
        installed,
        configured,
        homePath: homePaths[0] || null,
        configFiles: looseFiles,
        source: installed ? 'binary' : configured ? 'home' : 'catalog',
        detectedModel: null,
        detectedProvider: null,
        npc: null,
        teamPath: null,
        hasCredentials: false,
    };
};

/** Read per-agent config for the portable facts worth showing in the UI. */
const enrichAgent = (agent, home) => {
    const out = { ...agent };

    if (agent.id === 'codex' && agent.homePath) {
        const model = parseCodexModel(readTextSafe(path.join(agent.homePath, 'config.toml')));
        if (model) {
            out.detectedModel = model;
            out.detectedProvider = 'openai';
        }
        out.hasCredentials = pathExists(path.join(agent.homePath, 'auth.json'));
    }

    if (agent.id === 'claude') {
        out.hasCredentials =
            pathExists(path.join(home, '.claude.json')) ||
            pathExists(path.join(home, '.claude', 'settings.json'));
    }

    if (agent.id === 'gemini' && agent.homePath) {
        out.hasCredentials = pathExists(path.join(agent.homePath, 'oauth_creds.json'));
        const settings = readJsonSafe(path.join(agent.homePath, 'settings.json'));
        if (settings && typeof settings === 'object') {
            const model = settings.model || settings.defaultModel;
            if (model) {
                out.detectedModel = String(model);
                out.detectedProvider = 'gemini';
            }
        }
    }

    if (agent.id === 'npcsh' && agent.homePath) {
        // npcsh's own entry in the registry, plus the full attached list for
        // callers that want to render it.
        const parsed = parseNpcshAgentCoders(readJsonSafe(npcshRegistryPath(home)));
        const self = parsed.find((p) => p.command === 'npcsh');
        if (self) Object.assign(out, registrationFacts(self) || {});
        out.attachedAgents = parsed;
    }

    return out;
};

/**
 * Full discovery pass. Returns catalog agents plus any agent npcsh knows about
 * that is not in the catalog, so an agent we never hardcoded still shows up.
 */
const discoverAgents = async ({ home } = {}) => {
    const resolvedHome = home || os.homedir();
    const npcshHome = path.join(resolvedHome, '.npcsh');
    const registryPath = npcshRegistryPath(resolvedHome);
    const registry = parseNpcshAgentCoders(readJsonSafe(registryPath));
    const registeredById = new Map(registry.map((r) => [r.id, r]));

    // Catalog agents, each enriched with its own config *and* with whatever
    // npcsh recorded about it. ~/.npcsh/agent_coders.json is the index for every
    // agent npcsh has attached -- not just for npcsh itself -- so its facts are
    // applied to any agent it names.
    const catalogAgents = AGENT_CATALOG.map((spec) => {
        const agent = enrichAgent(describeAgent(spec, resolvedHome), resolvedHome);
        const reg = registeredById.get(agent.id);
        if (!reg) return agent;
        return {
            ...agent,
            ...registrationFacts(reg),
            // An agent npcsh registered is configured even if it has no home dir
            // of its own; ~/.npcsh is where npcsh records it.
            configured: true,
            indexPath: agent.homePath || npcshHome,
        };
    });

    // Agents npcsh knows about that we never hardcoded. Their index location is
    // ~/.npcsh, where the registration lives.
    const known = new Set(catalogAgents.map((a) => a.id));
    const extra = [];
    for (const reg of registry) {
        const id = normalizeAgentId(reg.command);
        if (!id || known.has(id)) continue;
        known.add(id);
        extra.push({
            id,
            label: reg.command,
            command: reg.command,
            installed: whichBinary(reg.command),
            configured: true,
            homePath: npcshHome,
            indexPath: npcshHome,
            configFiles: [registryPath],
            source: 'npcsh-registry',
            detectedModel: null,
            detectedProvider: null,
            hasCredentials: false,
            ...registrationFacts(reg),
        });
    }

    return [...catalogAgents, ...extra];
};

// ---------------------------------------------------------------------------
// Registry (SQLite, in history.db alongside all other Incognide state)
// ---------------------------------------------------------------------------

const CREATE_AGENTS_TABLE = `
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        label TEXT,
        command TEXT,
        pinned INTEGER DEFAULT 0,
        custom INTEGER DEFAULT 0,
        source TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`;

let tableReady = false;

/**
 * `dbQuery` is the main process's SQLite helper, injected through the IPC ctx.
 * Every handler resolves it lazily so the module can be required in tests
 * without a live Electron/SQLite context.
 */
const requireDb = (dbQuery) => {
    if (typeof dbQuery !== 'function') {
        throw new Error('agent registry requires a dbQuery implementation');
    }
    return dbQuery;
};

const ensureTable = async (dbQuery) => {
    if (tableReady) return;
    await dbQuery(CREATE_AGENTS_TABLE);
    tableReady = true;
};

// exposed so tests can reset between temp databases
const resetTableCache = () => {
    tableReady = false;
};

const readRegistry = async (dbQuery) => {
    await ensureTable(dbQuery);
    const rows = await dbQuery('SELECT id, label, command, pinned, custom, source FROM agents');
    return (rows || []).map((r) => ({
        id: r.id,
        label: r.label,
        command: r.command,
        pinned: !!r.pinned,
        custom: !!r.custom,
        source: r.source || undefined,
    }));
};

const upsertAgent = async (dbQuery, record) => {
    await ensureTable(dbQuery);
    await dbQuery(
        `INSERT INTO agents (id, label, command, pinned, custom, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
             label = COALESCE(excluded.label, agents.label),
             command = COALESCE(excluded.command, agents.command),
             pinned = excluded.pinned,
             custom = excluded.custom,
             source = COALESCE(excluded.source, agents.source),
             updated_at = CURRENT_TIMESTAMP`,
        [
            normalizeAgentId(record.id),
            record.label || null,
            record.command || null,
            record.pinned ? 1 : 0,
            record.custom ? 1 : 0,
            record.source || null,
        ]
    );
};

const deleteAgent = async (dbQuery, id) => {
    await ensureTable(dbQuery);
    await dbQuery('DELETE FROM agents WHERE id = ?', [normalizeAgentId(id)]);
};

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

const register = (ctx = {}) => {
    const { ipcMain, dbQuery } = ctx;
    const home = ctx.home || os.homedir();

    ipcMain.handle('agents:discover', async () => {
        try {
            const discovered = await discoverAgents({ home });
            const saved = await readRegistry(requireDb(dbQuery));
            // Persist what discovery learned so labels/pins survive and the row
            // list reflects every agent we have ever seen.
            for (const a of mergeAgentRecords(discovered, saved)) {
                if (a.custom) continue; // user rows already persisted
                await upsertAgent(requireDb(dbQuery), {
                    id: a.id, label: a.label, command: a.command,
                    pinned: !!a.pinned, custom: false, source: a.source,
                });
            }
            const all = await readRegistry(requireDb(dbQuery));
            return { agents: mergeAgentRecords(discovered, all), error: null };
        } catch (err) {
            return { agents: [], error: err.message };
        }
    });

    ipcMain.handle('agents:list', async () => {
        try {
            const discovered = await discoverAgents({ home });
            const saved = await readRegistry(requireDb(dbQuery));
            return { agents: mergeAgentRecords(discovered, saved), error: null };
        } catch (err) {
            return { agents: [], error: err.message };
        }
    });

    ipcMain.handle('agents:update', async (_, payload = {}) => {
        try {
            const { id, label, pinned, custom, command } = payload || {};
            if (!id) return { error: 'id is required' };
            const db = requireDb(dbQuery);
            const saved = await readRegistry(db);
            const key = normalizeAgentId(id);
            const prev = saved.find((a) => normalizeAgentId(a.id) === key) || {};
            await upsertAgent(db, {
                id: key,
                label: label !== undefined ? label : prev.label,
                command: command !== undefined ? command : (prev.command || key),
                pinned: pinned !== undefined ? pinned : prev.pinned,
                custom: custom !== undefined ? custom : prev.custom,
                source: prev.source,
            });
            return { success: true, error: null };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('agents:remove', async (_, id) => {
        try {
            await deleteAgent(requireDb(dbQuery), id);
            return { success: true, error: null };
        } catch (err) {
            return { error: err.message };
        }
    });

    // Portable subset for cloud sync: no paths, no credential state.
    ipcMain.handle('agents:export', async () => {
        try {
            const discovered = await discoverAgents({ home });
            const saved = await readRegistry(requireDb(dbQuery));
            const merged = mergeAgentRecords(discovered, saved);
            return { agents: merged.map(sanitizeAgentForSync).filter(Boolean), error: null };
        } catch (err) {
            return { agents: [], error: err.message };
        }
    });

    ipcMain.handle('agents:import', async (_, payload = {}) => {
        try {
            const agents = (payload || {}).agents;
            if (!Array.isArray(agents)) return { error: 'agents must be an array' };
            const db = requireDb(dbQuery);
            for (const incoming of agents) {
                const clean = sanitizeAgentForSync(incoming);
                if (!clean || !clean.id) continue;
                await upsertAgent(db, clean);
            }
            return { success: true, error: null };
        } catch (err) {
            return { error: err.message };
        }
    });
};

module.exports = {
    register,
    // exported for validation
    AGENT_CATALOG,
    AGENT_IDS,
    CREATE_AGENTS_TABLE,
    normalizeAgentId,
    expandHome,
    parseCodexModel,
    parseNpcshAgentCoders,
    mergeAgentRecords,
    sanitizeAgentForSync,
    discoverAgents,
    resetTableCache,
};
