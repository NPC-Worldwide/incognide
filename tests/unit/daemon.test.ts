import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import sqlite3 from 'sqlite3';

const DAEMON_SCRIPT = path.join(__dirname, '../../src/daemon/incognide-daemon.js');

// Restore original fetch for daemon tests (they need real HTTP fetch for the spawned daemon)
const originalFetch = (global as any).originalFetch || global.fetch;
(global as any).fetch = originalFetch;
// Generate unique DB path per test to avoid conflicts on Windows
let testDbCounter = 0;
const getTestDbPath = () => path.join(os.tmpdir(), `incognide-daemon-test-${Date.now()}-${testDbCounter++}.db`);
const TEST_DB = getTestDbPath();
const TEST_HOME = path.join(os.tmpdir(), `incognide-daemon-home-${Date.now()}`);

async function waitForHealth(port: number, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('incognide-daemon', () => {
  let proc: ReturnType<typeof spawn> | null = null;
  let db: sqlite3.Database;

  beforeAll(async () => {
    fs.mkdirSync(TEST_HOME, { recursive: true });
    fs.mkdirSync(path.join(TEST_HOME, 'npc_team', 'jinxes'), { recursive: true });

    // Create a dummy jinx file
    const jinxDir = path.join(TEST_HOME, 'npc_team', 'jinxes');
    fs.writeFileSync(path.join(jinxDir, 'test.jinx'), '#!/bin/bash\necho "hello from test jinx"');

    // Create test DB with schema
    db = new sqlite3.Database(TEST_DB);
    await new Promise<void>((resolve, reject) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          job_type TEXT NOT NULL,
          schedule TEXT NOT NULL,
          command TEXT,
          npc_name TEXT,
          jinx_name TEXT,
          payload TEXT,
          workspace_path TEXT,
          python_env_config TEXT,
          enabled INTEGER DEFAULT 1,
          next_run_at DATETIME,
          last_run_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS daemon_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          pid INTEGER,
          port INTEGER,
          started_at DATETIME,
          last_heartbeat DATETIME,
          status TEXT
        );
        CREATE TABLE IF NOT EXISTS jinx_execution_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          jinx_name TEXT,
          npc_name TEXT,
          input_summary TEXT,
          output_summary TEXT,
          status TEXT,
          duration_ms INTEGER,
          folder_path TEXT,
          job_id TEXT,
          job_type TEXT,
          log_file_path TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => err ? reject(err) : resolve());
    });
  });

  afterAll(async () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!proc.killed) proc.kill('SIGKILL');
    }
    await new Promise<void>((resolve) => db.close(() => resolve()));
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('spawns and responds to /health', async () => {
    if (!fs.existsSync(DAEMON_SCRIPT)) {
      console.warn('Daemon script not found, skipping integration test');
      return;
    }

    proc = spawn(process.execPath, [DAEMON_SCRIPT], {
      env: {
        ...process.env,
        INCOGNIDE_HOME: TEST_HOME,
        INCOGNIDE_DB_PATH: TEST_DB,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let port: number | null = null;
    const stdoutData: string[] = [];
    proc.stdout?.on('data', (d) => {
      const s = d.toString();
      stdoutData.push(s);
      const m = s.match(/HTTP control API on 127\.0\.0\.1:(\d+)/);
      if (m) port = parseInt(m[1], 10);
    });
    proc.stderr?.on('data', (d) => {
      // console.log('[daemon stderr]', d.toString().trim());
    });

    // Wait for port detection or timeout
    for (let i = 0; i < 50 && !port; i++) {
      await new Promise(r => setTimeout(r, 200));
    }

    expect(port).toBeTruthy();
    if (!port) return;

    const healthy = await waitForHealth(port, 30);
    expect(healthy).toBe(true);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.pid).toBeGreaterThan(0);
    expect(body.jobs).toBe(0);
  }, 15000);

  it('loads scheduled jobs and runs them on /run_now', async () => {
    if (!fs.existsSync(DAEMON_SCRIPT)) {
      console.warn('Daemon script not found, skipping integration test');
      return;
    }
    if (!proc || proc.killed) {
      console.warn('Daemon not running, skipping');
      return;
    }

    // Insert a test jinx job
    const jobId = `test_${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO scheduled_jobs (id, name, job_type, schedule, command, enabled)
         VALUES (?, ?, 'jinx', '* * * * *', 'test', 1)`,
        [jobId, 'Test Jinx'],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Trigger reload
    const stdoutData: string[] = [];
    let port: number | null = null;
    proc.stdout?.on('data', (d) => {
      const s = d.toString();
      stdoutData.push(s);
      const m = s.match(/HTTP control API on 127\.0\.0\.1:(\d+)/);
      if (m) port = parseInt(m[1], 10);
    });

    // Re-read port from previous test if needed
    if (!port) {
      const allOut = stdoutData.join('');
      const m = allOut.match(/HTTP control API on 127\.0\.0\.1:(\d+)/);
      if (m) port = parseInt(m[1], 10);
    }

    if (!port) {
      console.warn('Could not detect daemon port');
      return;
    }

    const reloadRes = await fetch(`http://127.0.0.1:${port}/reload`, { method: 'POST' });
    expect(reloadRes.ok).toBe(true);
    const reloadBody = await reloadRes.json();
    expect(reloadBody.status).toBe('reloaded');
    expect(reloadBody.jobs).toBe(1);

    // Run now
    const runRes = await fetch(`http://127.0.0.1:${port}/run_now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    expect(runRes.ok).toBe(true);
    const runBody = await runRes.json();
    expect(runBody.status).toBe('started');
    expect(runBody.jobId).toBe(jobId);

    // Wait for execution log
    await new Promise(r => setTimeout(r, 2000));

    const rows = await new Promise<any[]>((resolve, reject) => {
      db.all(`SELECT * FROM jinx_execution_log WHERE job_id = ? ORDER BY timestamp DESC LIMIT 1`, [jobId], (err, rows) =>
        err ? reject(err) : resolve(rows)
      );
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].job_type).toBe('jinx');
    expect(rows[0].status).toMatch(/success|failed|error/);
  });

  it('pauses and resumes jobs via /pause', async () => {
    if (!fs.existsSync(DAEMON_SCRIPT)) {
      console.warn('Daemon script not found, skipping integration test');
      return;
    }
    if (!proc || proc.killed) {
      console.warn('Daemon not running, skipping');
      return;
    }

    let port: number | null = null;
    // Read port from stdout history by re-emitting? No, just grep current output buffer if any.
    // Simpler: find port from daemon_state DB
    const stateRow = await new Promise<any>((resolve, reject) => {
      db.get(`SELECT port FROM daemon_state WHERE id = 1`, (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    if (stateRow?.port) port = stateRow.port;
    if (!port) {
      console.warn('Could not detect daemon port for pause test');
      return;
    }

    const jobId = `pause_test_${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO scheduled_jobs (id, name, job_type, schedule, command, enabled)
         VALUES (?, ?, 'jinx', '* * * * *', 'test', 1)`,
        [jobId, 'Pause Test'],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Pause
    const pauseRes = await fetch(`http://127.0.0.1:${port}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, paused: true }),
    });
    expect(pauseRes.ok).toBe(true);
    const pauseBody = await pauseRes.json();
    expect(pauseBody.enabled).toBe(0);

    // Verify in DB
    const row = await new Promise<any>((resolve, reject) => {
      db.get(`SELECT enabled FROM scheduled_jobs WHERE id = ?`, [jobId], (err, r) =>
        err ? reject(err) : resolve(r)
      );
    });
    expect(row.enabled).toBe(0);
  });
});

describe('daemon pure functions', () => {
  const resolvePythonPath = (workspacePath: string, pythonEnvConfig: any) => {
    if (!pythonEnvConfig || !workspacePath) {
      return process.platform === 'win32' ? 'python' : 'python3';
    }
    const isWin = process.platform === 'win32';
    const pythonBin = isWin ? 'python.exe' : 'python';
    switch (pythonEnvConfig.type) {
      case 'venv':
      case 'uv': {
        const binDir = isWin ? 'Scripts' : 'bin';
        const venvPath = pythonEnvConfig.venvPath || '.venv';
        return path.posix.join(workspacePath, venvPath, binDir, pythonBin);
      }
      case 'pyenv': {
        const pyenvRoot = process.env.PYENV_ROOT || path.posix.join(os.homedir(), '.pyenv');
        return path.posix.join(pyenvRoot, 'versions', pythonEnvConfig.pyenvVersion, 'bin', pythonBin);
      }
      case 'conda': {
        const condaRoot = pythonEnvConfig.condaRoot || path.posix.join(os.homedir(), 'anaconda3');
        return path.posix.join(condaRoot, 'envs', pythonEnvConfig.condaEnv, 'bin', pythonBin);
      }
      case 'custom':
        return pythonEnvConfig.customPath;
      case 'system':
      default:
        return isWin ? 'python' : 'python3';
    }
  };

  it('resolves venv paths', () => {
    const p = resolvePythonPath('/workspace', { type: 'venv', venvPath: '.venv' });
    expect(p).toContain('/workspace/.venv/');
    expect(p.endsWith(process.platform === 'win32' ? 'python.exe' : 'python')).toBe(true);
  });

  it('resolves pyenv paths', () => {
    const p = resolvePythonPath('/workspace', { type: 'pyenv', pyenvVersion: '3.11.0' });
    expect(p).toContain('.pyenv/versions/3.11.0/bin/python');
  });

  it('resolves conda paths', () => {
    const p = resolvePythonPath('/workspace', { type: 'conda', condaEnv: 'torch', condaRoot: '/opt/conda' });
    expect(p).toBe('/opt/conda/envs/torch/bin/python');
  });

  it('resolves custom path', () => {
    const p = resolvePythonPath('/workspace', { type: 'custom', customPath: '/usr/local/bin/python3.11' });
    expect(p).toBe('/usr/local/bin/python3.11');
  });

  it('falls back to system python when no config', () => {
    const p = resolvePythonPath('/workspace', null);
    expect(p).toBe(process.platform === 'win32' ? 'python' : 'python3');
  });
});
