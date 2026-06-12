#!/usr/bin/env node
/**
 * Incognide Daemon — Background job scheduler
 * Spawns as a detached Node.js process. Schedules jinx, fine-tuning, and inference jobs
 * from SQLite. Survives app restarts.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const cron = require('node-cron');
const sqlite3 = require('sqlite3');

const INCOGNIDE_HOME = (() => {
  const env = process.env.INCOGNIDE_HOME;
  if (env) return env.replace(/^~/, os.homedir());
  try {
    const rcPath = path.join(os.homedir(), '.incogniderc');
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf8');
      const m = content.match(/^(?:export\s+)?INCOGNIDE_HOME=(.*)$/m);
      if (m) {
        let val = m[1].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (val.startsWith('~')) val = val.replace('~', os.homedir());
        if (val) return val;
      }
    }
  } catch {}
  return path.join(os.homedir(), '.incognide');
})();

const DB_PATH = process.env.INCOGNIDE_DB_PATH || path.join(os.homedir(), '.incognide', 'history.db');
const JOBS_LOG_DIR = path.join(INCOGNIDE_HOME, 'jobs');
const FINETUNE_JOBS_DIR = path.join(INCOGNIDE_HOME, 'finetune_jobs');
const HEARTBEAT_INTERVAL_MS = 30_000;
const PID = process.pid;

let db;
let server;
let port;
const scheduledTasks = new Map(); // jobId -> cron.Task
const jobDefinitions = new Map();   // jobId -> row

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function heartbeat() {
  try {
    await dbRun(
      `INSERT INTO daemon_state (id, pid, port, started_at, last_heartbeat, status)
       VALUES (1, ?, ?, datetime('now'), datetime('now'), 'running')
       ON CONFLICT(id) DO UPDATE SET
         pid=excluded.pid,
         port=excluded.port,
         last_heartbeat=excluded.last_heartbeat,
         status=excluded.status`,
      [PID, port]
    );
  } catch (err) {
    console.error('[daemon] heartbeat failed:', err.message);
  }
}

async function loadJobs() {
  const rows = await dbAll(`SELECT * FROM scheduled_jobs WHERE enabled = 1`);
  const newIds = new Set();
  for (const row of rows) {
    newIds.add(row.id);
    const existing = jobDefinitions.get(row.id);
    if (existing && existing.updated_at === row.updated_at && scheduledTasks.has(row.id)) {
      continue;
    }
    // Unschedule old if any
    if (scheduledTasks.has(row.id)) {
      scheduledTasks.get(row.id).stop();
      scheduledTasks.delete(row.id);
    }
    jobDefinitions.set(row.id, row);
    if (cron.validate(row.schedule)) {
      const task = cron.schedule(row.schedule, () => executeJob(row), { scheduled: true });
      scheduledTasks.set(row.id, task);
      console.log(`[daemon] Scheduled job "${row.name}" (${row.id}) with cron "${row.schedule}"`);
    } else {
      console.error(`[daemon] Invalid cron for job "${row.name}": ${row.schedule}`);
    }
  }
  // Remove disabled/deleted jobs
  for (const [id, task] of scheduledTasks.entries()) {
    if (!newIds.has(id)) {
      task.stop();
      scheduledTasks.delete(id);
      jobDefinitions.delete(id);
      console.log(`[daemon] Unscheduled job ${id}`);
    }
  }
}

function resolvePythonPath(workspacePath, pythonEnvConfig) {
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
      return path.join(workspacePath, venvPath, binDir, pythonBin);
    }
    case 'pyenv': {
      const pyenvRoot = process.env.PYENV_ROOT || path.join(os.homedir(), '.pyenv');
      return path.join(pyenvRoot, 'versions', pythonEnvConfig.pyenvVersion, 'bin', pythonBin);
    }
    case 'conda': {
      const condaRoot = pythonEnvConfig.condaRoot || path.join(os.homedir(), 'anaconda3');
      return path.join(condaRoot, 'envs', pythonEnvConfig.condaEnv, 'bin', pythonBin);
    }
    case 'custom':
      return pythonEnvConfig.customPath;
    case 'system':
    default:
      return isWin ? 'python' : 'python3';
  }
}

function resolveFinetuneHelper(scriptName) {
  const candidates = [
    path.join(INCOGNIDE_HOME, 'resources', scriptName),
    path.join(__dirname, '..', '..', 'resources', scriptName),
    path.join(__dirname, '..', '..', '..', 'resources', scriptName),
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

function findJinxFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findJinxFile(full, name);
      if (found) return found;
    } else if (e.name === `${name}.jinx`) {
      return full;
    }
  }
  return null;
}

async function executeJob(row) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jobLogDir = path.join(JOBS_LOG_DIR, row.id);
  try { fs.mkdirSync(jobLogDir, { recursive: true }); } catch {}
  const logFilePath = path.join(jobLogDir, `run_${timestamp}.log`);

  let status = 'success';
  let outputSummary = '';
  let durationMs = 0;

  try {
    if (row.job_type === 'jinx') {
      const result = await runJinxJob(row, logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'finetune_instruction') {
      const result = await runFinetuneJob(row, 'run_finetune_instruction.py', logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'finetune_diffusers') {
      const result = await runFinetuneJob(row, 'run_finetune_diffusers.py', logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'inference') {
      const result = await runInferenceJob(row, logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'activity_intelligence') {
      const result = await runActivityIntelligenceJob(row, logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'autocomplete') {
      const result = await runAutocompleteJob(row, logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else if (row.job_type === 'knowledge_graph') {
      const result = await runKnowledgeGraphJob(row, logFilePath);
      status = result.status;
      outputSummary = result.outputSummary;
    } else {
      status = 'unknown_type';
      outputSummary = `Unknown job type: ${row.job_type}`;
    }
  } catch (err) {
    status = 'error';
    outputSummary = String(err.message || err);
    try {
      fs.appendFileSync(logFilePath, `\n[ERROR] ${outputSummary}\n`);
    } catch {}
  } finally {
    durationMs = Date.now() - startTime;
  }

  // Update last_run_at
  try {
    await dbRun(
      `UPDATE scheduled_jobs SET last_run_at = datetime('now') WHERE id = ?`,
      [row.id]
    );
  } catch {}

  // Log to jinx_execution_log (reused for all job types)
  try {
    await dbRun(
      `INSERT INTO jinx_execution_log
       (jinx_name, npc_name, input_summary, output_summary, status, duration_ms, folder_path, job_id, job_type, log_file_path, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        row.name,
        row.npc_name || null,
        row.command || row.payload || null,
        outputSummary.slice(0, 2000),
        status,
        durationMs,
        row.workspace_path || null,
        row.id,
        row.job_type,
        logFilePath,
      ]
    );
  } catch (err) {
    console.error('[daemon] Failed to write execution log:', err.message);
  }

  console.log(`[daemon] Job "${row.name}" (${row.id}) finished with status ${status} in ${durationMs}ms`);
}

async function runJinxJob(row, logFilePath) {
  const parts = (row.command || '').replace(/^\//, '').split(/\s+/);
  const jinxName = parts[0];
  const jinxArgs = parts.slice(1);
  if (!jinxName) {
    return { status: 'error', outputSummary: 'Empty command' };
  }

  const searchDirs = [
    path.join(os.homedir(), '.incognide', 'npc_team', 'jinxes'),
    path.join(INCOGNIDE_HOME, 'npc_team', 'jinxes'),
  ];
  let jinxFile = null;
  for (const dir of searchDirs) {
    const found = findJinxFile(dir, jinxName);
    if (found) { jinxFile = found; break; }
  }
  if (!jinxFile) {
    return { status: 'error', outputSummary: `Jinx '${jinxName}' not found` };
  }

  return new Promise((resolve) => {
    const child = spawn(jinxFile, jinxArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', async (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try {
        fs.writeFileSync(logFilePath, out);
      } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    child.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
  });
}

async function runFinetuneJob(row, scriptName, logFilePath) {
  const payload = JSON.parse(row.payload || '{}');
  const workspacePath = row.workspace_path;
  const pythonEnvConfig = row.python_env_config ? JSON.parse(row.python_env_config) : null;
  const pythonPath = resolvePythonPath(workspacePath, pythonEnvConfig);
  const scriptPath = resolveFinetuneHelper(scriptName);

  if (!scriptPath) {
    return { status: 'error', outputSummary: `${scriptName} not found in resources` };
  }

  const jobId = `ft_${Date.now()}`;
  const jobDir = path.join(FINETUNE_JOBS_DIR, jobId);
  try { fs.mkdirSync(jobDir, { recursive: true }); } catch {}
  const statusFile = path.join(jobDir, 'status.json');
  const fullPayload = { ...payload, job_id: jobId, status_file: statusFile };

  try {
    fs.writeFileSync(statusFile, JSON.stringify({ status: 'running', job_id: jobId, start_time: new Date().toISOString() }));
  } catch {}

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try {
        fs.writeFileSync(logFilePath, out);
        fs.writeFileSync(statusFile, JSON.stringify({ status: code === 0 ? 'completed' : 'failed', job_id: jobId, end_time: new Date().toISOString() }));
      } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    proc.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
    try {
      proc.stdin.write(JSON.stringify(fullPayload));
      proc.stdin.end();
    } catch (err) {
      try { fs.writeFileSync(logFilePath, String(err.message || err)); } catch {}
    }
  });
}

async function runInferenceJob(row, logFilePath) {
  // Inference jobs: command field is treated as a shell command to run
  const cmd = row.command || '';
  if (!cmd) {
    return { status: 'error', outputSummary: 'Empty inference command' };
  }
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : '/bin/sh';
  const arg = isWin ? ['/c', cmd] : ['-c', cmd];

  return new Promise((resolve) => {
    const child = spawn(shell, arg, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try { fs.writeFileSync(logFilePath, out); } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    child.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
  });
}

async function runActivityIntelligenceJob(row, logFilePath) {
  const payload = JSON.parse(row.payload || '{}');
  const modelDir = path.join(INCOGNIDE_HOME, 'activity_model');
  const scriptPath = path.resolve(__dirname, '..', 'activity_model', 'activity_predictor.py');

  if (!fs.existsSync(scriptPath)) {
    return { status: 'error', outputSummary: 'activity_predictor.py not found' };
  }

  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const mode = payload.mode || 'incremental';
  const dbPath = payload.dbPath || DB_PATH;
  const baseRepoId = payload.baseRepoId || null;

  const args = [
    scriptPath,
    '--db-path', dbPath,
    '--model-dir', modelDir,
  ];
  if (baseRepoId) {
    args.push('--base-repo-id', baseRepoId);
  }
  if (mode === 'incremental') {
    args.push('incremental');
  } else {
    args.push('--epochs', String(payload.epochs || 50), '--lr', String(payload.lr || 0.001), 'train');
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try { fs.writeFileSync(logFilePath, out); } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    proc.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
  });
}

async function runAutocompleteJob(row, logFilePath) {
  const payload = JSON.parse(row.payload || '{}');
  const modelDir = path.join(INCOGNIDE_HOME, 'autocomplete_model');
  const scriptPath = path.resolve(__dirname, '..', 'autocomplete_model', 'autocomplete_predictor.py');

  if (!fs.existsSync(scriptPath)) {
    return { status: 'error', outputSummary: 'autocomplete_predictor.py not found' };
  }

  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const mode = payload.mode || 'incremental';
  const dbPath = payload.dbPath || DB_PATH;
  const baseRepoId = payload.baseRepoId || null;

  const args = [
    scriptPath,
    '--db-path', dbPath,
    '--model-dir', modelDir,
  ];
  if (baseRepoId) {
    args.push('--base-repo-id', baseRepoId);
  }
  if (mode === 'incremental') {
    args.push('incremental');
  } else {
    args.push('--epochs', String(payload.epochs || 50), '--lr', String(payload.lr || 0.001), 'train');
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try { fs.writeFileSync(logFilePath, out); } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    proc.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
  });
}

async function runKnowledgeGraphJob(row, logFilePath) {
  const payload = JSON.parse(row.payload || '{}');
  const scriptPath = path.resolve(__dirname, '..', 'knowledge_graph', 'kg_evolver.py');

  if (!fs.existsSync(scriptPath)) {
    return { status: 'error', outputSummary: 'kg_evolver.py not found' };
  }

  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const dbPath = payload.dbPath || DB_PATH;
  const full = payload.full || false;

  const args = [
    scriptPath,
    '--db-path', dbPath,
  ];
  if (full) {
    args.push('--full');
  }
  args.push('evolve');

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      const out = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
      try { fs.writeFileSync(logFilePath, out); } catch {}
      resolve({
        status: code === 0 ? 'success' : 'failed',
        outputSummary: out.slice(0, 2000),
      });
    });
    proc.on('error', (err) => {
      const msg = String(err.message || err);
      try { fs.writeFileSync(logFilePath, msg); } catch {}
      resolve({ status: 'error', outputSummary: msg });
    });
  });
}

function startHttpServer() {
  server = http.createServer(async (req, res) => {
    const setJson = () => {
      res.setHeader('Content-Type', 'application/json');
    };

    if (req.method === 'GET' && req.url === '/health') {
      setJson();
      const jobCount = scheduledTasks.size;
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', pid: PID, port, jobs: jobCount }));
      return;
    }

    if (req.method === 'POST' && req.url === '/reload') {
      setJson();
      try {
        await loadJobs();
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'reloaded', jobs: scheduledTasks.size }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/run_now') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { jobId } = JSON.parse(body || '{}');
          if (!jobId) {
            res.writeHead(400);
            res.end(JSON.stringify({ status: 'error', message: 'Missing jobId' }));
            return;
          }
          const row = await dbAll(`SELECT * FROM scheduled_jobs WHERE id = ?`, [jobId]);
          if (!row.length) {
            res.writeHead(404);
            res.end(JSON.stringify({ status: 'error', message: 'Job not found' }));
            return;
          }
          // Execute without awaiting so HTTP returns immediately
          executeJob(row[0]);
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'started', jobId }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/pause') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { jobId, paused } = JSON.parse(body || '{}');
          if (!jobId) {
            res.writeHead(400);
            res.end(JSON.stringify({ status: 'error', message: 'Missing jobId' }));
            return;
          }
          await dbRun(
            `UPDATE scheduled_jobs SET enabled = ?, updated_at = datetime('now') WHERE id = ?`,
            [paused ? 0 : 1, jobId]
          );
          await loadJobs();
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'updated', jobId, enabled: paused ? 0 : 1 }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/activity_intelligence/predict') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { dbPath, modelDir } = JSON.parse(body || '{}');
          const _modelDir = modelDir || path.join(INCOGNIDE_HOME, 'activity_model');
          const _dbPath = dbPath || DB_PATH;
          const scriptPath = path.resolve(__dirname, '..', 'activity_model', 'activity_predictor.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'activity_predictor.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const proc = spawn(pythonPath, [
            scriptPath,
            '--db-path', _dbPath,
            '--model-dir', _modelDir,
            'predict',
          ], { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Prediction failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', ...result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse prediction output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/autocomplete/predict') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { context, maxLength } = JSON.parse(body || '{}');
          const _context = String(context || '');
          const _maxLength = Math.min(parseInt(maxLength || 20, 10), 100);
          const modelDir = path.join(INCOGNIDE_HOME, 'autocomplete_model');
          const scriptPath = path.resolve(__dirname, '..', 'autocomplete_model', 'autocomplete_predictor.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'autocomplete_predictor.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const proc = spawn(pythonPath, [
            scriptPath,
            '--model-dir', modelDir,
            '--context', _context,
            '--max-length', String(_maxLength),
            '--top-k', '1',
            'predict',
          ], { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Prediction failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', ...result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse prediction output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/knowledge_graph/query') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { name, type, limit } = JSON.parse(body || '{}');
          const scriptPath = path.resolve(__dirname, '..', 'knowledge_graph', 'kg_evolver.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'kg_evolver.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const args = [scriptPath, '--db-path', DB_PATH, 'query', '--name', String(name || '')];
          if (type) args.push('--type', String(type));
          const proc = spawn(pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Query failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse query output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/knowledge_graph/search') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { keyword, head, relation, tail, limit } = JSON.parse(body || '{}');
          const scriptPath = path.resolve(__dirname, '..', 'knowledge_graph', 'kg_evolver.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'kg_evolver.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const args = [scriptPath, '--db-path', DB_PATH, 'search'];
          if (keyword) args.push('--keyword', String(keyword));
          if (head) args.push('--head', String(head));
          if (relation) args.push('--relation', String(relation));
          if (tail) args.push('--tail', String(tail));
          if (limit) args.push('--limit', String(limit));
          const proc = spawn(pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Search failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse search output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/knowledge_graph/graph') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { name, maxDepth, limit } = JSON.parse(body || '{}');
          const scriptPath = path.resolve(__dirname, '..', 'knowledge_graph', 'kg_evolver.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'kg_evolver.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const args = [scriptPath, '--db-path', DB_PATH, 'graph', '--name', String(name || '')];
          if (maxDepth) args.push('--max-depth', String(maxDepth));
          if (limit) args.push('--limit', String(limit));
          const proc = spawn(pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Graph query failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse graph output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/knowledge_graph/hybrid') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        setJson();
        try {
          const { keyword, limit } = JSON.parse(body || '{}');
          const scriptPath = path.resolve(__dirname, '..', 'knowledge_graph', 'kg_evolver.py');
          if (!fs.existsSync(scriptPath)) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: 'kg_evolver.py not found' }));
            return;
          }
          const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
          const args = [scriptPath, '--db-path', DB_PATH, 'hybrid', '--keyword', String(keyword || '')];
          if (limit) args.push('--limit', String(limit));
          const proc = spawn(pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => { stdout += d; });
          proc.stderr.on('data', d => { stderr += d; });
          proc.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: stderr || 'Hybrid search failed' }));
              return;
            }
            try {
              const lines = stdout.trim().split('\n');
              const lastLine = lines.pop() || '{}';
              const result = JSON.parse(lastLine);
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ok', result }));
            } catch {
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to parse hybrid output' }));
            }
          });
          proc.on('error', (err) => {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          });
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ status: 'not_found' }));
  });

  server.listen(0, '127.0.0.1', async () => {
    port = server.address().port;
    console.log(`[daemon] HTTP control API on 127.0.0.1:${port}`);
    await heartbeat();
    await loadJobs();
  });
}

async function main() {
  try {
    fs.mkdirSync(JOBS_LOG_DIR, { recursive: true });
    fs.mkdirSync(FINETUNE_JOBS_DIR, { recursive: true });
  } catch {}

  db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('[daemon] DB connection failed:', err.message);
      process.exit(1);
    }
  });

  startHttpServer();

  setInterval(async () => {
    await heartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // Graceful shutdown on SIGTERM/SIGINT
  const shutdown = () => {
    console.log('[daemon] Shutting down...');
    for (const task of scheduledTasks.values()) task.stop();
    scheduledTasks.clear();
    db.close(() => {
      server?.close(() => {
        process.exit(0);
      });
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
