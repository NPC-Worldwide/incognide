const path = require('path');
const fs = require('fs');

/**
 * Team source detection (issue: "register both npc teams, specific agents.md
 * files and agents/ folders that have md files").
 *
 * npcpy's compiler already understands all of these layouts -- this module only
 * answers "given a directory, what is the correct team_path to register?".
 * It does NOT parse .npc/.md/.ctx itself; loading is still done by npcpy's Team.
 *
 * The rule that matters, verified against npcpy.npc_compiler.Team:
 *
 *   Team(team_path=X) reads .npc / .ctx / jinxes/ from X, but reads
 *   agents.md / AGENTS.md / CLAUDE.md and agents/ from dirname(X), because
 *   `project_root = os.path.dirname(os.path.abspath(self.team_path))`.
 *
 * So for a project that declares agents in `PROJECT/agents.md`, the value to
 * register is `PROJECT/npc_team` -- NOT `PROJECT`. Registering `PROJECT` makes
 * dirname() resolve to PROJECT's parent and the agents are never seen.
 */

const MD_TEAM_FILES = ['agents.md', 'AGENTS.md', 'CLAUDE.md'];

const exists = (p) => {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
};

const isDir = (p) => {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
};

const listDir = (p) => {
    try {
        return fs.readdirSync(p, { withFileTypes: true });
    } catch {
        return [];
    }
};

/** Files in `dir` that npcpy would load directly as team members. */
const scanTeamDir = (dir) => {
    const entries = listDir(dir);
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const npcFiles = files.filter((f) => f.endsWith('.npc'));
    const ctxFiles = files.filter((f) => f.endsWith('.ctx'));
    const agentsMd = MD_TEAM_FILES.find((f) => files.includes(f)) || null;
    const hasAgentsDir = dirs.includes('agents');

    // agents/*.md are individual agent definitions (filename = agent name).
    const agentsDirMd = hasAgentsDir
        ? listDir(path.join(dir, 'agents')).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name)
        : [];

    return { npcFiles, ctxFiles, agentsMd, hasAgentsDir, agentsDirMd };
};

/**
 * What can be registered from `dir`, and under which team_path.
 *
 * Returns an array of candidates (usually 0 or 1) shaped for the UI:
 *   { name, path, kind, npcCount, agents: [...], reason }
 */
const detectTeamSources = (dir) => {
    if (!dir || !isDir(dir)) return [];
    const abs = path.resolve(dir);
    const here = scanTeamDir(abs);
    const parent = path.dirname(abs);
    const inParent = parent !== abs ? scanTeamDir(parent) : { agentsMd: null, hasAgentsDir: false, agentsDirMd: [] };

    const out = [];

    // 1. A plain npc_team: .npc files and/or a .ctx, and/or a jinxes/ dir.
    const isNpcTeam = here.npcFiles.length > 0 || here.ctxFiles.length > 0 || here.hasAgentsDir === false && scanTeamDir(abs) && false;
    const hasJinxes = isDir(path.join(abs, 'jinxes'));
    if (here.npcFiles.length > 0 || here.ctxFiles.length > 0 || hasJinxes) {
        out.push({
            name: path.basename(abs),
            path: abs,
            kind: 'npc_team',
            npcCount: here.npcFiles.length,
            ctxFile: here.ctxFiles[0] || null,
            agents: here.npcFiles.map((f) => f.replace(/\.npc$/, '')),
            reason: 'contains .npc / .ctx / jinxes',
        });
    }

    // 2. Markdown agents declared in this dir. npcpy reads them from
    //    dirname(team_path), so the registrable path is a CHILD of this dir.
    //
    //    Skip this when the dir is ALREADY a team (.npc/.ctx/jinxes present):
    //    proposing `this/npc_team` there is pointless nesting, because that child
    //    would resolve its agents.md from `this` -- exactly what `this` already
    //    is. It also produced a spurious `<team>/npc_team/npc_team` candidate.
    const isAlreadyTeam = here.npcFiles.length > 0 || here.ctxFiles.length > 0 || hasJinxes;

    const mdAgents = [];
    if (here.agentsMd) mdAgents.push(...collectAgentsMdNames(path.join(abs, here.agentsMd)));
    if (here.agentsDirMd.length) mdAgents.push(...here.agentsDirMd.map((f) => f.replace(/\.md$/, '')));

    if (!isAlreadyTeam && (here.agentsMd || here.agentsDirMd.length)) {
        const child = path.join(abs, 'npc_team');
        out.push({
            name: path.basename(abs),
            // If the child team dir already exists, register it; if not, this is
            // still the right value to create/register.
            path: child,
            kind: 'markdown_team',
            exists: exists(child),
            needsCreate: !exists(child),
            npcCount: mdAgents.length,
            agents: mdAgents,
            agentsMd: here.agentsMd ? path.join(abs, here.agentsMd) : null,
            agentsDir: here.agentsDirMd.length ? path.join(abs, 'agents') : null,
            reason: 'declares agents in agents.md / agents/',
        });
    }

    // 3. A project root that contains an npc_team/ child. The Manager passes
    //    workspace paths, so this is the common case - without it, scanning a
    //    project finds nothing unless the caller also probes the child.
    const childTeam = path.join(abs, 'npc_team');
    if (isDir(childTeam)) {
        const childScan = scanTeamDir(childTeam);
        if (childScan.npcFiles.length > 0 || childScan.ctxFiles.length > 0 || isDir(path.join(childTeam, 'jinxes'))) {
            out.push({
                name: path.basename(abs),
                path: childTeam,
                kind: 'npc_team',
                npcCount: childScan.npcFiles.length,
                ctxFile: childScan.ctxFiles[0] || null,
                agents: childScan.npcFiles.map((f) => f.replace(/\.npc$/, '')),
                reason: 'project contains npc_team/',
            });
        }
    }

    // 4. A dir whose PARENT declares markdown agents: it is already the
    //    correct team_path (that is exactly how npcpy resolves them).
    if (!out.length && (inParent.agentsMd || inParent.agentsDirMd?.length)) {
        out.push({
            name: path.basename(abs),
            path: abs,
            kind: 'markdown_team_child',
            npcCount: (inParent.agentsMd ? collectAgentsMdNames(path.join(parent, inParent.agentsMd)).length : 0) + (inParent.agentsDirMd?.length || 0),
            agents: inParent.agentsMd ? collectAgentsMdNames(path.join(parent, inParent.agentsMd)) : (inParent.agentsDirMd || []).map((f) => f.replace(/\.md$/, '')),
            reason: 'parent dir declares agents.md / agents/',
        });
    }

    return out;
};

/** H2 headings in an agents.md are the agent names (npcpy's format). */
const collectAgentsMdNames = (file) => {
    try {
        const text = fs.readFileSync(file, 'utf8');
        const names = [];
        for (const line of text.split('\n')) {
            if (line.startsWith('## ')) {
                const n = line.slice(3).trim();
                if (n) names.push(n);
            }
        }
        return names;
    } catch {
        return [];
    }
};

/** Directories worth probing for markdown agents when scanning a project. */
const findMarkdownAgentRoots = (root, maxDepth = 3) => {
    const found = [];
    const walk = (dir, depth) => {
        if (depth > maxDepth) return;
        const s = scanTeamDir(dir);
        if (s.agentsMd || s.agentsDirMd.length) {
            found.push(dir);
            return; // don't descend into a project that already declares agents
        }
        for (const e of listDir(dir)) {
            if (!e.isDirectory()) continue;
            if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'jinxes') continue;
            walk(path.join(dir, e.name), depth + 1);
        }
    };
    walk(path.resolve(root), 0);
    return found;
};

module.exports = {
    MD_TEAM_FILES,
    scanTeamDir,
    detectTeamSources,
    collectAgentsMdNames,
    findMarkdownAgentRoots,
};
