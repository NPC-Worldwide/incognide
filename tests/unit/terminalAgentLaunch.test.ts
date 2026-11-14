/**
 * Launching a coding agent from the terminal-create menu.
 *
 * Reported: "launching codex does nothing".
 *
 * Root cause: createTerminalSession had branches for system/npcsh/guac/python3
 * but not for agent names. `shellType: 'codex'` matched nothing, so `shell` and
 * `args` stayed undefined and the handler reached pty.spawn(undefined). node-pty
 * ACCEPTS that and opens an ordinary login shell - so the app asked for codex
 * and silently got bash, with result.success === true.
 *
 * These drive the real handler with a stubbed pty.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
import * as fs from 'fs';

let resolveLoginShell: () => string;

type Handler = (event: any, payload: any) => Promise<any>;

const EVT = { sender: { isDestroyed: () => true, send: () => {} } };

let handlers: Record<string, Handler>;
let spawnCalls: Array<{ shell: any; args: any }>;
let writes: string[];
/** The onData callback registered by wireSession, if any. */
let emitOutput: ((d: string) => void) | null;

/** Load a fresh terminal.js with stubbed electron + node-pty. */
const loadTerminal = () => {
  handlers = {};
  // Capture the arrays locally so the pty stub closes over THIS load's arrays.
  // A pending onReady timer from an earlier test then cannot push into a later
  // test's record after the module-level binding is reassigned.
  const localSpawnCalls: Array<{ shell: any; args: any }> = [];
  const localWrites: string[] = [];
  spawnCalls = localSpawnCalls;
  writes = localWrites;

  const fakeElectron = {
    ipcMain: { handle: (c: string, f: Handler) => { handlers[c] = f; }, on: () => {}, removeHandler: () => {} },
    app: { getAppPath: () => '/tmp', getPath: () => '/tmp' },
  };

  // Keep the registered onData handler so a test can simulate the shell
  // emitting its prompt, which is what triggers the agent command.
  emitOutput = null;
  const fakePty = {
    spawn: (shell: any, args: any) => {
      localSpawnCalls.push({ shell, args });
      return {
        onData: (cb: (d: string) => void) => { emitOutput = cb; },
        onExit: () => {},
        kill: () => {},
        pid: 1,
        write: (d: string) => { localWrites.push(d); },
      };
    },
  };

  // terminal.js is loaded through Node's own CJS loader (createRequire), so
  // vi.resetModules() does not clear it. Drop the cache entry explicitly or
  // register() only runs on the first test.
  const entry = require.resolve('../../src/ipc/terminal.js');
  delete require.cache[entry];

  const Module = require('module');
  const orig = Module._load;
  Module._load = function (request: string) {
    if (request === 'electron') return fakeElectron;
    if (request === 'node-pty') return fakePty;
    return orig.apply(this, arguments as any);
  };
  try {
    const terminal = require('../../src/ipc/terminal.js');
    resolveLoginShell = terminal.resolveLoginShell;
    terminal.register({
      ipcMain: fakeElectron.ipcMain,
      log: () => {},
      IS_DEV_MODE: false,
      app: fakeElectron.app,
      readPythonEnvConfig: async () => ({ workspaces: {} }),
    });
  } finally {
    Module._load = orig;
  }
};

// Every call needs its own session id: createTerminalSession reuses an existing
// session for the same id, which would silently turn later calls into no-ops.
let sessionSeq = 0;
const create = (shellType: string, id?: string) =>
  handlers['createTerminalSession'](EVT, {
    id: id ?? `sess-${++sessionSeq}`,
    cwd: '/tmp', cols: 80, rows: 24, shellType,
  });

/** onReady is scheduled, so let the timer fire. */
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => {
  loadTerminal();
});

describe('agent launch execs the agent as the PTY process', () => {
  // The earlier design spawned bash and then TYPED "codex\r" once prompt output
  // was seen. In the real app that left the user staring at a bash prompt: the
  // typed command raced the renderer's own writes to the session and lost.
  // The agent is now exec'd directly, so the PTY process IS the agent.
  it.each(['codex', 'claude', 'gemini', 'opencode', 'nanocoder', 'qwen', 'hermes', 'pi'])(
    'spawns a login shell that execs %s',
    async (agent) => {
      const res = await create(agent);
      expect(spawnCalls).toHaveLength(1);

      const { shell, args } = spawnCalls[0];
      expect(typeof shell).toBe('string');
      expect(shell).toMatch(/^\//);          // a real path, never undefined
      expect(fs.existsSync(shell)).toBe(true);

      // -lc <cmd>, and the command must exec the agent itself.
      expect(args[0]).toBe('-lc');
      expect(args[1]).toBe(`exec ${agent}`);

      expect(res.success).toBe(true);
      expect(res.shell).toBe(agent);
    }
  );

  it('does not type anything into the session', async () => {
    await create('codex');
    expect(writes).toEqual([]);
    await settle();
    expect(writes).toEqual([]);
  });

  it('does not spawn an undefined binary', async () => {
    for (const agent of ['codex', 'claude', 'opencode']) {
      spawnCalls.length = 0;
      await create(agent);
      expect(spawnCalls[0].shell).toBeTruthy();
      expect(spawnCalls[0].args).toBeTruthy();
    }
  });

  it('plain system shell still gets no exec', async () => {
    const res = await create('system');
    expect(res.shell).toBe('system');
    expect(spawnCalls[0].args).not.toContain('-lc');
  });

  it('returns an error for a shell type it cannot handle', async () => {
    const res = await create('definitely-not-a-shell');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unsupported shell type/);
    expect(spawnCalls).toHaveLength(0);
  });
});

describe('existing shell types are unchanged', () => {
  it('npcsh spawns npcsh directly', async () => {
    const res = await create('npcsh');
    expect(res.shell).toBe('npcsh');
    expect(spawnCalls[0].shell).toBe('npcsh');
    expect(spawnCalls[0].args).toEqual([]);
  });

  it('python3 spawns an interpreter with -i', async () => {
    const res = await create('python3');
    expect(res.shell).toBe('python3');
    expect(spawnCalls[0].shell).toMatch(/python/);
    expect(spawnCalls[0].args).toEqual(['-i']);
  });

  it('system spawns a login shell', async () => {
    const res = await create('system');
    expect(res.shell).toBe('system');
    expect(spawnCalls[0].shell).toBeTruthy();
    expect(spawnCalls[0].args).toEqual(['-l']);
  });
});

describe('session reuse', () => {
  it('reuses an existing session instead of spawning again', async () => {
    await create('codex', 'same-id');
    await settle();
    const res = await create('codex', 'same-id');
    expect(res.reused).toBe(true);
    expect(spawnCalls).toHaveLength(1);
  });
});

describe('login shell resolution', () => {
  // Regression: the agent and system branches both used
  //   process.env.SHELL || '/bin/zsh'
  // $SHELL is ABSENT from Electron's main-process environment (verified via
  // /proc/<pid>/environ), and /bin/zsh does not exist on Debian/Ubuntu. Spawning
  // a nonexistent binary gives a PTY that emits nothing and never exits, so
  // clicking "Codex" opened a blank, dead terminal with no error shown.
  it('never returns a path that does not exist', () => {
    const resolved = resolveLoginShell();
    expect(typeof resolved).toBe('string');
    expect(resolved).not.toBe('/bin/zsh');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('prefers the configured $SHELL when it exists', () => {
    const original = process.env.SHELL;
    try {
      process.env.SHELL = '/bin/bash';
      expect(resolveLoginShell()).toBe('/bin/bash');
    } finally {
      if (original === undefined) delete process.env.SHELL;
      else process.env.SHELL = original;
    }
  });

  it('ignores a $SHELL that does not exist', () => {
    const original = process.env.SHELL;
    try {
      process.env.SHELL = '/nonexistent/zsh';
      const resolved = resolveLoginShell();
      expect(resolved).not.toBe('/nonexistent/zsh');
      expect(fs.existsSync(resolved)).toBe(true);
    } finally {
      if (original === undefined) delete process.env.SHELL;
      else process.env.SHELL = original;
    }
  });

  it('still resolves when $SHELL is unset, as in Electron main', () => {
    const original = process.env.SHELL;
    try {
      delete process.env.SHELL;
      const resolved = resolveLoginShell();
      expect(fs.existsSync(resolved)).toBe(true);
    } finally {
      if (original !== undefined) process.env.SHELL = original;
    }
  });

describe('agent sessions are not treated as shells', () => {
  // Terminal.tsx writes `source <profile>` into the session when the
  // auto-source setting is on. That is fine for bash, but now that an agent
  // session IS the agent process, typing that string would land in the agent's
  // prompt as user input. The renderer now gates that write on result.shell.
  it('reports the agent as the shell so the renderer can distinguish it', async () => {
    const res = await create('codex');
    expect(res.shell).toBe('codex');
    expect(res.shell).not.toBe('system');
  });

  it('reports system for a plain shell', async () => {
    const res = await create('system');
    expect(res.shell).toBe('system');
  });
});

});
