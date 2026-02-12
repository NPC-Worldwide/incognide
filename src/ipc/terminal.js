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

function register(ctx) {
  const { ipcMain, app, IS_DEV_MODE, readPythonEnvConfig } = ctx;

  ipcMain.handle('createTerminalSession', async (event, { id, cwd, cols, rows, shellType }) => {
    if (!pty) {
      return { success: false, error: ptyLoadError?.message || 'Terminal functionality not available (node-pty not loaded)' };
    }

    // Store the sender's webContents for multi-window support
    const senderWebContents = event.sender;

    if (ptyKillTimers.has(id)) {
      clearTimeout(ptyKillTimers.get(id));
      ptyKillTimers.delete(id);

      if (ptySessions.has(id)) {
        return { success: true };
      }
    }

    const workingDir = cwd || os.homedir();
    let shell, args;
    let actualShellType = shellType || 'system';

    // If shellType is explicitly set, use that
    if (shellType === 'npcsh') {
      shell = 'npcsh';
      args = [];
    } else if (shellType === 'guac' || shellType === 'ipython') {
      // guac is IPython-based - try guac first, fall back to ipython
      shell = 'guac';
      args = [];
      // We'll try guac, and if it fails, we'll handle it below
    } else if (shellType === 'python3' || shellType === 'python') {
      // Python REPL - resolve user's selected venv
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
      args = ['-i'];  // Interactive mode
      actualShellType = 'python3';
    } else if (shellType === 'system' || !shellType) {
      // Check for npcsh switch in workspace or global .ctx files for auto-detection
      let useNpcsh = false;
      const yaml = require('js-yaml');

      // Check workspace .ctx first
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
      } catch (e) { /* ignore */ }

      // Fall back to global .ctx
      if (!useNpcsh) {
        const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
        try {
          if (fs.existsSync(globalCtx)) {
            const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
            if (ctxData.switches?.default_shell === 'npcsh') {
              useNpcsh = true;
            }
          }
        } catch (e) { /* ignore */ }
      }

      if (useNpcsh) {
        shell = 'npcsh';
        args = [];
        actualShellType = 'npcsh';
      } else {
        shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
        args = os.platform() === 'win32' ? [] : ['-l'];
        actualShellType = 'system';
      }
    }

    // Create clean env without VS Code artifacts
    const cleanEnv = { ...process.env };
    delete cleanEnv.PYTHONSTARTUP;  // Remove VS Code Python extension startup
    delete cleanEnv.VSCODE_PID;
    delete cleanEnv.VSCODE_CWD;
    delete cleanEnv.VSCODE_NLS_CONFIG;

    // Force unbuffered stdout for Python so output isn't lost after terminal resize (SIGWINCH)
    cleanEnv.PYTHONUNBUFFERED = '1';

    // Set BROWSER to incognide so URLs opened from terminal (like gcloud auth login)
    // open in incognide's browser pane instead of the system browser
    // This works because incognide's second-instance handler catches URL arguments
    // In dev mode, we need to pass the app path to electron
    if (IS_DEV_MODE) {
      // In development, create a command that runs: electron /path/to/app <url>
      cleanEnv.BROWSER = `${process.execPath} ${app.getAppPath()}`;
    } else {
      // In production, the executable directly handles URL arguments
      cleanEnv.BROWSER = process.execPath;
    }

    try {
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: workingDir,
        env: cleanEnv
      });

      // Store both the ptyProcess and the webContents that created it
      ptySessions.set(id, { ptyProcess, webContents: senderWebContents, shellType: actualShellType });

      ptyProcess.onData(data => {
        // Send to the window that created this terminal session
        if (senderWebContents && !senderWebContents.isDestroyed()) {
          senderWebContents.send('terminal-data', { id, data });
        }
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        ptySessions.delete(id);
        // Send to the window that created this terminal session
        if (senderWebContents && !senderWebContents.isDestroyed()) {
          senderWebContents.send('terminal-closed', { id });
        }
      });

      return { success: true, shell: actualShellType };

    } catch (error) {
      // If guac failed, try ipython
      if (shellType === 'guac' || shellType === 'ipython') {
        try {
          const ptyProcess = pty.spawn('ipython', [], {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd: workingDir,
            env: cleanEnv
          });

          ptySessions.set(id, { ptyProcess, webContents: senderWebContents, shellType: 'ipython' });

          ptyProcess.onData(data => {
            if (senderWebContents && !senderWebContents.isDestroyed()) {
              senderWebContents.send('terminal-data', { id, data });
            }
          });

          ptyProcess.onExit(({ exitCode, signal }) => {
            ptySessions.delete(id);
            if (senderWebContents && !senderWebContents.isDestroyed()) {
              senderWebContents.send('terminal-closed', { id });
            }
          });

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

    if (ptySessions.has(id)) {
      if (ptyKillTimers.has(id)) return { success: true };

      const timer = setTimeout(() => {
        if (ptySessions.has(id)) {
          const session = ptySessions.get(id);
          if (session?.ptyProcess) {
            session.ptyProcess.kill();
          }
        }
        ptyKillTimers.delete(id);
      }, 100);

      ptyKillTimers.set(id, timer);
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

module.exports = { register, ptySessions, ptyKillTimers };
