const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

function register(ctx) {
  const {
    ipcMain,
    BACKEND_URL,
    log,
    readPythonEnvConfig,
    resolvePythonPath,
  } = ctx;

  async function resolveWorkspacePython(workspacePath) {
    if (!workspacePath) return null;
    try {
      const config = await readPythonEnvConfig();
      const envConfig = config?.workspaces?.[workspacePath];
      if (!envConfig) return null;
      const resolved = await resolvePythonPath(workspacePath, envConfig);
      return resolved?.pythonPath || null;
    } catch {
      return null;
    }
  }

  function resolveHelperScript(scriptName) {
    const { app } = require('electron');
    const candidates = [
      path.resolve(__dirname, '..', '..', 'resources', scriptName),
      path.join(process.resourcesPath || '', scriptName),
      path.join(app.getAppPath(), 'resources', scriptName),
    ];
    return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  }

  function shellOutHelper(pythonPath, scriptName, payload) {
    return new Promise((resolve) => {
      const scriptPath = resolveHelperScript(scriptName);
      if (!scriptPath) {
        resolve({ success: false, error: `${scriptName} not found in resources` });
        return;
      }
      const proc = spawn(pythonPath, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('error', (err) => resolve({ success: false, error: `Failed to spawn ${pythonPath}: ${err.message}` }));
      proc.on('close', (code) => {
        if (code !== 0 && !stdout) {
          resolve({ success: false, error: stderr || `${scriptName} exited with code ${code}` });
          return;
        }
        try {
          const last = stdout.trim().split('\n').pop();
          resolve(JSON.parse(last));
        } catch (err) {
          resolve({ success: false, error: `Could not parse helper output: ${err.message}. stderr: ${stderr}` });
        }
      });
      try {
        proc.stdin.write(JSON.stringify(payload));
        proc.stdin.end();
      } catch (err) {
        resolve({ success: false, error: `Failed to write to helper stdin: ${err.message}` });
      }
    });
  }

  ipcMain.handle('load_demo_tracks', async () => {
    try {
      const { app } = require('electron');
      const candidates = [
        path.resolve(__dirname, '..', '..', 'assets', 'demo_audio'),
        path.join(process.resourcesPath || '', 'assets', 'demo_audio'),
        path.join(app.getAppPath(), 'assets', 'demo_audio'),
      ];
      const dir = candidates.find(p => fs.existsSync(p));
      if (!dir) return { success: false, error: 'demo_audio directory not found in app resources' };
      const files = fs.readdirSync(dir)
        .filter(n => /\.(wav|mp3|ogg|flac|m4a|aac|aiff)$/i.test(n))
        .map(n => ({ name: n, path: path.join(dir, n) }));
      return { success: true, tracks: files, dir };
    } catch (error) {
      log('Error loading demo tracks:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('generate_music', async (event, { prompt, provider, model, duration, currentPath, workspacePath, baseFilename, apiKey }) => {
    log(`[Main Process] Generate music: "${prompt}" provider=${provider} model=${model} dur=${duration}s`);
    if (!prompt) return { success: false, error: 'Prompt is required' };

    const p = (provider || 'local').toLowerCase();
    const isLocal = ['local', 'musicgen', 'transformers', 'meta'].includes(p);

    if (!isLocal) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/generate_music`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, provider, model, duration, currentPath }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          return { success: false, error: data.error || `HTTP ${response.status}` };
        }
        return data;
      } catch (error) {
        log('Error generating music via backend:', error);
        return { success: false, error: error.message || 'Music generation failed' };
      }
    }

    const outputDir = currentPath && currentPath.startsWith('~')
      ? path.join(os.homedir(), currentPath.slice(1).replace(/^\//, ''))
      : (currentPath || path.join(os.homedir(), '.incognide', 'audio'));

    const python = await resolveWorkspacePython(workspacePath);
    if (!python) {
      return { success: false, error: 'No Python environment configured for this workspace. Open Team Management → Python Env and create a venv with npcpy + torch + transformers installed.' };
    }

    const result = await shellOutHelper(python, 'run_music_gen.py', {
      prompt,
      provider,
      model,
      duration,
      output_dir: outputDir,
      base_filename: baseFilename,
      api_key: apiKey,
    });
    if (!result.success) {
      log('Music generation (shell-out) failed:', result.error);
      return { success: false, error: result.error };
    }
    return { success: true, path: result.path, url: `file://${result.path}`, format: result.format, provider: result.provider, model: result.model };
  });
}

module.exports = { register };
