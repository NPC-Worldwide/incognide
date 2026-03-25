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
        const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
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
        shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
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
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: workingDir,
        env: cleanEnv
      });

      ptySessions.set(id, { ptyProcess, webContents: senderWebContents, shellType: actualShellType });

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

module.exports = { register, ptySessions, ptyKillTimers };
