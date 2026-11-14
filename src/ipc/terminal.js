const path = require('path');
const os = require('os');
const fs = require('fs');

let pty;
let ptyLoadError = null;
try {
  pty = require('node-pty');
} catch (error) {
  pty = null;
  ptyLoadError = error;
  console.error('Failed to load node-pty:', error.message);
}

const ptySessions = new Map();
const ptyKillTimers = new Map();

/**
 * Resolve a usable login shell.
 *
 * Order matters:
 *   1. $SHELL, if set AND the path exists
 *   2. the shell recorded for this user in /etc/passwd (os.userInfo().shell),
 *      which is the only reliable source when the process has no $SHELL -
 *      notably Electron's main process, where $SHELL is frequently unset
 *   3. well-known paths that actually exist
 *
 * A hardcoded fallback is deliberately avoided: spawning a path that does not
 * exist yields a PTY that emits nothing and never exits, so the terminal looks
 * blank and the caller sees no error at all.
 */
function resolveLoginShell() {
  if (os.platform() === 'win32') return 'powershell.exe';

  const candidates = [];
  if (process.env.SHELL) candidates.push(process.env.SHELL);

  try {
    const info = os.userInfo();
    if (info && info.shell) candidates.push(info.shell);
  } catch {}

  candidates.push('/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh');

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  // Last resort: let spawn fail loudly against a real path.
  return '/bin/sh';
}

/**
 * shellTypes that mean "open a login shell, then launch this agent binary".
 *
 * Kept in sync with the discovery catalog in agents.js. Before this set
 * existed, these values fell through every branch of createTerminalSession and
 * were spawned with an undefined binary.
 */
const DISCOVERABLE_AGENT_COMMANDS = new Set([
  'codex', 'claude', 'gemini', 'opencode', 'nanocoder',
  'qwen', 'hermes', 'pi', 'deepseek', 'openclaw', 'aider', 'cursor-agent',
]);

/**
 * Wire a freshly spawned PTY to the renderer and record it.
 *
 * Extracted because the main spawn and the ipython fallback had identical
 * onData/onExit plumbing, and the agent path needs exactly the same wiring.
 */
function wireSession(id, ptyProcess, webContents, shellType) {
  const session = { ptyProcess, webContents, shellType };
  ptySessions.set(id, session);

  ptyProcess.onData(data => {
    const s = ptySessions.get(id);
    const wc = s?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.send('terminal-data', { id, data });
    }
  });

  ptyProcess.onExit(() => {
    const s = ptySessions.get(id);
    const wc = s?.webContents;
    ptySessions.delete(id);
    if (wc && !wc.isDestroyed()) {
      wc.send('terminal-closed', { id });
    }
  });

  return session;
}

function register(ctx) {
  const { ipcMain, app, IS_DEV_MODE, readPythonEnvConfig } = ctx;

  ipcMain.handle('createTerminalSession', async (event, { id, cwd, cols, rows, shellType }) => {
    if (!pty) {
      return { success: false, error: ptyLoadError?.message || 'Terminal functionality not available (node-pty not loaded)' };
    }

    const senderWebContents = event.sender;

    if (ptyKillTimers.has(id)) {
      clearTimeout(ptyKillTimers.get(id));
      ptyKillTimers.delete(id);
    }

    if (ptySessions.has(id)) {
      const existing = ptySessions.get(id);
      if (existing) {
        existing.webContents = senderWebContents;
      }
      return { success: true, reused: true, shell: existing?.shellType };
    }

    const workingDir = cwd || os.homedir();
    let shell, args;
    let actualShellType = shellType || 'system';

    if (shellType === 'npcsh') {
      shell = 'npcsh';
      args = [];
    } else if (shellType === 'guac' || shellType === 'ipython') {

      shell = 'guac';
      args = [];

    } else if (shellType === 'python3' || shellType === 'python') {

      try {
        const config = await readPythonEnvConfig();
        const envConfig = config.workspaces[workingDir];
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const pythonBin = isWindows ? 'python.exe' : 'python';

        if (envConfig) {
          switch (envConfig.type) {
            case 'venv':
              shell = path.join(envConfig.path, isWindows ? 'Scripts' : 'bin', pythonBin);
              break;
            case 'conda':
              shell = path.join(envConfig.path, isWindows ? 'python.exe' : 'bin/python');
              break;
            case 'uv':
              shell = path.join(envConfig.path, isWindows ? 'Scripts' : 'bin', pythonBin);
              break;
            case 'system':
            default:
              shell = envConfig.path || (isWindows ? 'python' : 'python3');
          }
        } else {
          shell = isWindows ? 'python' : 'python3';
        }
      } catch (e) {
        shell = process.platform === 'win32' ? 'python' : 'python3';
      }
      args = ['-i'];
      actualShellType = 'python3';
    } else if (DISCOVERABLE_AGENT_COMMANDS.has(shellType)) {
      // Run the agent as the PTY process itself, via a login shell so the
      // profile has been sourced and PATH includes user bin dirs.
      //
      // Deliberately NOT "open bash then type the command": that needs prompt
      // detection and races the renderer's own writes to the session, and when
      // it loses the race the terminal just shows a bash prompt.
      if (os.platform() === 'win32') {
        shell = 'powershell.exe';
        args = ['-NoLogo', '-Command', `${shellType}; exit`];
      } else {
        shell = resolveLoginShell();
        // -l sources the login profile; -c runs the command; exec replaces the
        // shell so the PTY process IS the agent.
        args = ['-lc', `exec ${shellType}`];
      }
      actualShellType = shellType;

    } else if (shellType === 'system' || !shellType) {

      let useNpcsh = false;
      const yaml = require('js-yaml');

      const npcTeamDir = path.join(workingDir, 'npc_team');
      try {
        if (fs.existsSync(npcTeamDir)) {
          const ctxFiles = fs.readdirSync(npcTeamDir).filter(f => f.endsWith('.ctx'));
          if (ctxFiles.length > 0) {
            const ctxData = yaml.load(fs.readFileSync(path.join(npcTeamDir, ctxFiles[0]), 'utf-8')) || {};
            if (ctxData.switches?.default_shell === 'npcsh') {
              useNpcsh = true;
            }
          }
        }
      } catch (e) {  }

      if (!useNpcsh) {
        const globalCtx = path.join(os.homedir(), '.incognide', 'npc_team', 'incognide.ctx');
        try {
          if (fs.existsSync(globalCtx)) {
            const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
            if (ctxData.switches?.default_shell === 'npcsh') {
              useNpcsh = true;
            }
          }
        } catch (e) {  }
      }

      if (useNpcsh) {
        shell = 'npcsh';
        args = [];
        actualShellType = 'npcsh';
      } else {
        shell = resolveLoginShell();
        args = os.platform() === 'win32' ? [] : ['-l'];
        actualShellType = 'system';
      }
    }

    const cleanEnv = { ...process.env };
    delete cleanEnv.PYTHONSTARTUP;
    delete cleanEnv.VSCODE_PID;
    delete cleanEnv.VSCODE_CWD;
    delete cleanEnv.VSCODE_NLS_CONFIG;

    cleanEnv.PYTHONUNBUFFERED = '1';

    if (IS_DEV_MODE) {

      cleanEnv.BROWSER = `${process.execPath} ${app.getAppPath()}`;
    } else {

      cleanEnv.BROWSER = process.execPath;
    }

    try {
      // Guard against an unmatched shellType reaching spawn(). Previously an
      // unknown type produced pty.spawn(undefined), which node-pty accepts and
      // which opens a plain shell - a silent wrong result rather than an error.
      if (!shell) {
        return { success: false, error: `Unsupported shell type: ${shellType}` };
      }

      // A nonexistent binary produces a PTY that emits nothing and never exits,
      // which surfaces to the user as a blank terminal. Fail loudly instead.
      const looksLikePath = shell.includes('/') || shell.includes('\\');
      if (looksLikePath) {
        try {
          if (!fs.existsSync(shell)) {
            return { success: false, error: `Shell not found: ${shell}` };
          }
        } catch {}
      }

      const ptyProcess = pty.spawn(shell, args || [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: workingDir,
        env: cleanEnv
      });

      wireSession(id, ptyProcess, senderWebContents, actualShellType);

      return { success: true, shell: actualShellType };

    } catch (error) {

      if (shellType === 'guac' || shellType === 'ipython') {
        try {
          const ptyProcess = pty.spawn('ipython', [], {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd: workingDir,
            env: cleanEnv
          });

          wireSession(id, ptyProcess, senderWebContents, 'ipython');
          return { success: true, shell: 'ipython' };
        } catch (ipythonError) {
          return { success: false, error: `Neither guac nor ipython available: ${error.message}` };
        }
      }
      return { success: false, error: String(error?.message || error || 'Unknown terminal error') };
    }
  });

  ipcMain.handle('closeTerminalSession', (event, id) => {
    if (!pty) {
      return { success: false, error: 'Terminal functionality not available' };
    }

    if (ptyKillTimers.has(id)) {
      clearTimeout(ptyKillTimers.get(id));
      ptyKillTimers.delete(id);
    }

    if (ptySessions.has(id)) {
      const session = ptySessions.get(id);
      if (session?.ptyProcess) {
        session.ptyProcess.kill();
      }
      ptySessions.delete(id);
    }
    return { success: true };
  });

  ipcMain.handle('writeToTerminal', (event, { id, data }) => {
    if (!pty) {
      return { success: false, error: 'Terminal functionality not available' };
    }

    const session = ptySessions.get(id);

    if (session?.ptyProcess) {
      session.ptyProcess.write(data);
      return { success: true };
    } else {
      return { success: false, error: 'Session not found in backend' };
    }
  });

  ipcMain.handle('getTerminalCwd', async (event, { id }) => {
    const session = ptySessions.get(id);
    if (!session?.ptyProcess) return { cwd: null };
    const pid = session.ptyProcess.pid;
    const platform = process.platform;
    try {
      if (platform === 'linux') {
        const cwd = require('fs').readlinkSync(`/proc/${pid}/cwd`);
        return { cwd };
      } else if (platform === 'darwin') {
        const { execSync } = require('child_process');
        const cwd = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | tail -1`, { encoding: 'utf8' }).trim().replace(/^n/, '');
        return { cwd: cwd || null };
      } else {
        // Windows: use wmic or powershell
        const { execSync } = require('child_process');
        const cwd = execSync(`powershell -Command "(Get-Process -Id ${pid}).Path | Split-Path"`, { encoding: 'utf8' }).trim();
        return { cwd: cwd || null };
      }
    } catch {
      return { cwd: null };
    }
  });

  ipcMain.handle('resizeTerminal', (event, { id, cols, rows }) => {
    if (!pty) {
      return { success: false, error: 'Terminal functionality not available' };
    }

    const session = ptySessions.get(id);
    if (session?.ptyProcess) {
      try {
        session.ptyProcess.resize(cols, rows);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    } else {
      return { success: false, error: 'Session not found' };
    }
  });

  ipcMain.handle('executeShellCommand', async (event, { command, currentPath }) => {
      console.log(`[TERMINAL DEBUG] Executing command: "${command}"`);
      console.log(`[TERMINAL DEBUG] Current Path: "${currentPath}"`);

      return new Promise((resolve, reject) => {
          const { exec } = require('child_process');

          exec(command, {
              cwd: currentPath || process.env.HOME,
              shell: '/bin/bash'
          }, (error, stdout, stderr) => {
              console.log(`[TERMINAL DEBUG] Command Execution Result:`);
              console.log(`[TERMINAL DEBUG] STDOUT: "${stdout}"`);
              console.log(`[TERMINAL DEBUG] STDERR: "${stderr}"`);
              console.log(`[TERMINAL DEBUG] ERROR: ${error}`);

              const normalizedStdout = stdout.replace(/\n/g, '\r\n');
              const normalizedStderr = stderr.replace(/\n/g, '\r\n');

              if (error) {
                  console.error(`[TERMINAL DEBUG] Execution Error:`, error);
                  resolve({
                      error: normalizedStderr || normalizedStdout || error.message,
                      output: normalizedStdout
                  });
              } else {
                  resolve({
                      output: normalizedStdout,
                      error: normalizedStderr
                  });
              }
          });
      });
  });
}

module.exports = {
  register,
  resolveLoginShell,
  ptySessions,
  ptyKillTimers,
};
