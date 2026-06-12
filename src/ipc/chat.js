const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const fetch = require('node-fetch');
const { shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const yaml = require('js-yaml');

const dbPath = process.env.INCOGNIDE_DB_PATH || path.join(os.homedir(), '.incognide', 'history.db');

/**
 * Categorize backend errors into user-friendly messages
 */
function categorizeBackendError(error) {
  const errorStr = String(error?.message || error || '');
  const errorCode = error?.code || '';

  // Connection errors
  if (errorCode === 'ECONNREFUSED' || errorStr.includes('ECONNREFUSED')) {
    return {
      userMessage: 'Cannot connect to AI backend. The backend server may not be running.',
      category: 'connection',
      suggestion: 'Try restarting the backend from the status bar menu.',
      original: errorStr,
    };
  }

  if (errorCode === 'ETIMEDOUT' || errorStr.includes('ETIMEDOUT') || errorStr.includes('timeout')) {
    return {
      userMessage: 'Request timed out. The AI service may be overloaded or the model may be too slow.',
      category: 'timeout',
      suggestion: 'Try again or use a smaller/faster model.',
      original: errorStr,
    };
  }

  if (errorCode === 'ENOTFOUND' || errorStr.includes('ENOTFOUND')) {
    return {
      userMessage: 'Cannot reach the AI service. Check your network connection.',
      category: 'network',
      suggestion: 'Verify your internet connection and try again.',
      original: errorStr,
    };
  }

  // HTTP status errors
  if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
    return {
      userMessage: 'Authentication failed. Your API key may be invalid or expired.',
      category: 'auth',
      suggestion: 'Check your API key in Settings.',
      original: errorStr,
    };
  }

  if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
    return {
      userMessage: 'Access denied. You may not have permission to use this model.',
      category: 'auth',
      suggestion: 'Check your API key permissions or try a different model.',
      original: errorStr,
    };
  }

  if (errorStr.includes('429') || errorStr.includes('rate limit') || errorStr.includes('Too Many Requests')) {
    return {
      userMessage: 'Rate limit exceeded. Wait a moment before trying again.',
      category: 'rate_limit',
      suggestion: 'Wait a few seconds and retry your request.',
      original: errorStr,
    };
  }

  if (errorStr.includes('500') || errorStr.includes('Internal Server Error')) {
    return {
      userMessage: 'The AI service encountered an error. Try again in a moment.',
      category: 'server_error',
      suggestion: 'This is usually temporary. Try again shortly.',
      original: errorStr,
    };
  }

  if (errorStr.includes('503') || errorStr.includes('Service Unavailable')) {
    return {
      userMessage: 'The AI service is temporarily unavailable.',
      category: 'server_error',
      suggestion: 'The service may be overloaded. Try again shortly.',
      original: errorStr,
    };
  }

  // Model errors
  if (errorStr.includes('model not found') || errorStr.includes('Model not found') || errorStr.includes('does not exist')) {
    return {
      userMessage: 'The selected AI model is not available.',
      category: 'model',
      suggestion: 'Select a different model from the model picker.',
      original: errorStr,
    };
  }

  if (errorStr.includes('context length') || errorStr.includes('token limit') || errorStr.includes('too long')) {
    return {
      userMessage: 'The conversation is too long for this model.',
      category: 'context',
      suggestion: 'Start a new conversation or use a model with larger context.',
      original: errorStr,
    };
  }

  // Backend not started
  if (errorStr.includes('Backend returned no stream') || errorStr.includes('Failed to set up stream')) {
    return {
      userMessage: 'Unable to connect to the AI backend.',
      category: 'connection',
      suggestion: 'Check if the backend is running in the status bar.',
      original: errorStr,
    };
  }

  // Default fallback
  return {
    userMessage: 'An error occurred while processing your request.',
    category: 'unknown',
    suggestion: 'Check the logs for more details.',
    original: errorStr,
  };
}

function parseIncogniderc() {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {

        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();

          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          result[match[1]] = value;
        }
      }
    }
  } catch (e) {
    console.log('Error reading .incogniderc:', e.message);
  }
  return result;
}

function getBackendPythonPath() {
  const rcPath = path.join(os.homedir(), '.incogniderc');
  try {
    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const match = rcContent.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (match && match[1] && match[1].trim()) {
        const pythonPath = match[1].trim().replace(/^~/, os.homedir());

        if (fs.existsSync(pythonPath)) {
          return pythonPath;
        }
      }
    }
  } catch (err) {
    console.log('Error reading backend Python path from .incogniderc:', err);
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function register(ctx) {
  const {
    ipcMain,
    getMainWindow,
    dbQuery,
    callBackendApi,
    BACKEND_URL,
    BACKEND_PORT,
    log,
    generateId,
    activeStreams,
    DEFAULT_CONFIG,
    readPythonEnvConfig,
    resolvePythonPath,
    INCOGNIDE_HOME: ctxIncognideHome,
  } = ctx;

  const INCOGNIDE_HOME = ctxIncognideHome || path.join(os.homedir(), '.incognide');

  async function getCustomProviders() {
    try {
      const cpPath = path.join(INCOGNIDE_HOME, 'custom_providers.yaml');
      const content = await fsPromises.readFile(cpPath, 'utf8');
      const parsed = yaml.load(content);
      return parsed?.providers || {};
    } catch {
      return {};
    }
  }

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
      proc.on('error', (err) => {
        try { proc.kill(); } catch {}
        resolve({ success: false, error: `Failed to spawn ${pythonPath}: ${err.message}` });
      });
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
        try { proc.kill(); } catch {}
        resolve({ success: false, error: `Failed to write to helper stdin: ${err.message}` });
      }
    });
  }

  const shellOutImageGen = (pythonPath, payload) => shellOutHelper(pythonPath, 'run_image_gen.py', payload);

  ipcMain.handle('getAvailableModels', async (event, currentPath) => {

    if (!currentPath) {
        log('Error: getAvailableModels called without currentPath');
        return { models: [], error: 'Current path is required to fetch models.' };
    }

    let backendModels = [];
    let backendError = null;

    try {
        const url = `${BACKEND_URL}/api/models?currentPath=${encodeURIComponent(currentPath)}`;
        log('Fetching models from:', url);

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            log(`Error fetching models: ${response.status} ${response.statusText} - ${errorText}`);
            backendError = `HTTP error ${response.status}: ${errorText}`;
        } else {
            const data = await response.json();
            log('Received models from backend:', data.models?.length);
            backendModels = data.models || [];
        }
    } catch (err) {
        log('Backend not available:', err.message);
        backendError = err.message;
    }

    const customProviderModels = [];
    try {
      const customProviders = await getCustomProviders();
      for (const [cpName, cpConfig] of Object.entries(customProviders)) {
        const cfg = cpConfig;
        if (!cfg?.base_url) continue;
        let apiKey = process.env[cfg.api_key_var];
        if (!apiKey) apiKey = findApiKeyInShellConfigs(cfg.api_key_var);
        if (!apiKey) {
          log(`[getAvailableModels] No API key for custom provider ${cpName}`);
          continue;
        }
        const cleanUrl = cfg.base_url.replace(/\/+$/, '');
        const modelsUrl = cleanUrl.endsWith('/models') ? cleanUrl : cleanUrl + '/models';
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          let cpResponse;
          try {
            cpResponse = await fetch(modelsUrl, { headers, signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
          if (cpResponse.ok) {
            const cpData = await cpResponse.json();
            const cpModels = (cpData.data || cpData.models || []).map((m) => ({
              value: `${cpName}/${m.id || m.name || m}`,
              display_name: `${m.id || m.name || m} (${cpName})`,
              provider: cpName,
              base_url: cfg.base_url,
              api_key_var: cfg.api_key_var,
            }));
            customProviderModels.push(...cpModels);
            log(`[getAvailableModels] ${cpName}: fetched ${cpModels.length} models`);
          }
        } catch (cpErr) {
          log(`[getAvailableModels] ${cpName} model fetch failed:`, cpErr.message);
        }
      }
    } catch (cpErr) {
      log('[getAvailableModels] Error loading custom providers:', cpErr.message);
    }

    const allModels = [...backendModels, ...customProviderModels];

    if (allModels.length === 0 && backendError) {
        return { models: [], error: backendError };
    }

    return { models: allModels };
  });

  function findApiKeyInShellConfigs(apiKeyVar) {
    const sourceFiles = [
      path.join(os.homedir(), '.incogniderc'),
      path.join(os.homedir(), '.env'),
      path.join(os.homedir(), '.zshrc'),
      path.join(os.homedir(), '.bashrc'),
      path.join(os.homedir(), '.bash_profile'),
    ];
    for (const f of sourceFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const match = content.match(new RegExp(`(?:export\\s+)?${apiKeyVar}=(.*)`, 'm'));
        if (match) {
          let val = match[1].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) return val;
        }
      } catch {}
    }
    return null;
  }

  ipcMain.handle('get-provider-models', async (event, { provider }) => {
    // Delegate to the backend /api/models endpoint which already handles all provider auth
    try {
      const response = await fetch(`${BACKEND_URL}/api/models?currentPath=~`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const filtered = (data.models || []).filter((m) => m.provider === provider || m.provider === provider.toLowerCase());
      return { models: filtered.map((m) => ({ id: m.value || m.id || m.name, name: m.display_name || m.value || m.id || m.name, provider: m.provider })) };
    } catch {
      return { models: [], error: 'Backend unavailable' };
    }
  });

  ipcMain.handle('getAvailableImageModels', async (event, currentPath) => {
    log('[Main Process] getAvailableImageModels called for path:', currentPath);
    if (!currentPath) {
        log('Error: getAvailableImageModels called without currentPath');
        return { models: [], error: 'Current path is required to fetch image models.' };
    }
    try {
        const url = `${BACKEND_URL}/api/image_models?currentPath=${encodeURIComponent(currentPath)}`;
        log('Fetching image models from:', url);

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            log(`Error fetching image models: ${response.status} ${response.statusText} - ${errorText}`);
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data.models)) {
            log('Warning: Backend /api/image_models did not return an array for data.models. Initializing as empty array.');
            data.models = [];
        }

        log('Received image models:', data.models?.length);

        return data;
    } catch (err) {
        log('Error in getAvailableImageModels handler:', err);
        return { models: [], error: err.message || 'Failed to fetch image models from backend' };
    }
  });

  ipcMain.handle('generate_images', async (event, { prompt, n, model, provider, attachments, baseFilename='image_gen_', currentPath='~/.incognide/images', workspacePath, width, height, customModelPath }) => {
    log(`[Main Process] Image gen request: n=${n} prompt="${prompt}" model="${model}" provider=${provider}`);

    if (!prompt) return { error: 'Prompt cannot be empty' };
    if (!model || !provider) return { error: 'Image model and provider must be selected.' };

    const needsLocalVenv = provider === 'diffusers' || !!customModelPath;

    if (!needsLocalVenv) {
      try {
        const apiUrl = `${BACKEND_URL}/api/generate_images`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, n, model, provider, attachments, baseFilename, currentPath }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          return { error: errorBody.error || `HTTP error! status: ${response.status}` };
        }
        const data = await response.json();
        if (data.error) return { error: data.error };
        return { images: data.images, filenames: data.filenames, generation_id: data.generation_id };
      } catch (error) {
        log('Error generating images via backend:', error);
        return { error: error.message || 'Image generation failed' };
      }
    }

    const outputDir = currentPath.startsWith('~')
      ? path.join(os.homedir(), currentPath.slice(1).replace(/^\//, ''))
      : currentPath;

    const python = await resolveWorkspacePython(workspacePath);
    if (!python) {
      return { error: 'No Python environment configured for this workspace. Open Team Management → Python Env and create a venv with diffusers + torch installed.' };
    }

    const payload = {
      prompt,
      n,
      model,
      provider,
      attachments,
      base_filename: baseFilename,
      output_dir: outputDir,
      width,
      height,
      custom_model_path: customModelPath,
    };

    const result = await shellOutImageGen(python, payload);
    if (!result.success) {
      log('Image generation (shell-out) failed:', result.error);
      return { error: result.error };
    }

    const paths = result.paths || [];
    const filenames = paths.map(p => path.basename(p));
    return { images: paths.map(p => `file://${p}`), filenames, generation_id: generateId() };
  });

  ipcMain.handle('deleteMessage', async (_, { conversationId, messageId }) => {
    try {
      const db = new sqlite3.Database(dbPath);

      const deleteMessageQuery = `
        DELETE FROM conversation_history
        WHERE conversation_id = ?
        AND message_id = ?
      `;

      let rowsAffected = 0;
      await new Promise((resolve, reject) => {
        db.run(deleteMessageQuery, [conversationId, messageId], function(err) {
          if (err) {
            reject(err);
          } else {
            rowsAffected = this.changes;
            log(`[DB] Deleted message ${messageId} from conversation ${conversationId}. Rows affected: ${this.changes}`);
            resolve();
          }
        });
      });

      if (rowsAffected > 0) {
        const deleteAttachmentsQuery = 'DELETE FROM message_attachments WHERE message_id = ?';
        await new Promise((resolve) => {
          db.run(deleteAttachmentsQuery, [messageId], function(err) {
            if (err) {
              log(`[DB] Warning: Failed to delete attachments for message ${messageId}:`, err.message);
            }
            resolve();
          });
        });
      }

      db.close();

      return { success: rowsAffected > 0, rowsAffected };
    } catch (err) {
      console.error('Error deleting message:', err);
      return { success: false, error: err.message, rowsAffected: 0 };
    }
  });

  ipcMain.handle('generative-fill', async (event, params) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/generative_fill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generative fill failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Generative fill error:', error);
        return { error: error.message };
    }
  });

  ipcMain.handle('interruptStream', async (event, streamIdToInterrupt) => {
    log(`[Main Process] Received request to interrupt stream: ${streamIdToInterrupt}`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/interrupt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streamId: streamIdToInterrupt }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend failed to acknowledge interruption: ${errorText}`);
      }

      const result = await response.json();
      log(`[Main Process] Backend response to interruption:`, result.message);

      if (activeStreams.has(streamIdToInterrupt)) {
          const { stream } = activeStreams.get(streamIdToInterrupt);
          if (stream && typeof stream.destroy === 'function') {
              stream.destroy();
          }

      }

      return { success: true };

    } catch (error) {
      console.error('[Main Process] Error sending interrupt request to backend:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('wait-for-screenshot', async (event, screenshotPath) => {
    const maxAttempts = 20;
    const delay = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await fsPromises.access(screenshotPath);
        const stats = await fsPromises.stat(screenshotPath);
        if (stats.size > 0) {
          return true;
        }
      } catch (err) {

      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  });

  ipcMain.handle('get_attachment_response', async (_, attachmentData, messages) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/get_attachment_response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attachments: attachmentData,
          messages: messages
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      return result;
    } catch (err) {
      console.error('Error handling attachment response:', err);
      throw err;
    }
  });

  ipcMain.handle('executeCommandStream', async (event, data) => {

    const currentStreamId = data.streamId || generateId();
    log(`[Main Process] executeCommandStream: Starting stream with ID: ${currentStreamId}`);

    try {
      const customProviders = await getCustomProviders();
      let model = data.model;
      let provider = data.provider;
      let apiUrlOverride = null;
      let apiKeyOverride = null;

      if (customProviders[provider]) {
        const cp = customProviders[provider];
        let apiKey = process.env[cp.api_key_var];
        if (!apiKey) apiKey = findApiKeyInShellConfigs(cp.api_key_var);
        if (apiKey) {
          apiKeyOverride = apiKey;
          apiUrlOverride = cp.base_url;
          // Strip provider prefix from model value if present
          const prefix = `${data.provider}/`;
          if (model && model.startsWith(prefix)) {
            model = model.slice(prefix.length);
          }
          log(`[Main Process] Custom provider '${data.provider}' resolved to openai-like endpoint: ${apiUrlOverride}`);
        }
      }

      // Load registered teams from frontend config to pass to backend
      let registeredTeams = [];
      try {
        const teamsContent = await fsPromises.readFile(path.join(INCOGNIDE_HOME, 'teams.yaml'), 'utf8');
        const teamsParsed = yaml.load(teamsContent);
        for (const teamPath of Object.values(teamsParsed?.teams || {})) {
          const tp = String(teamPath || '').replace(/^~(?=\/|$)/, os.homedir());
          if (tp) registeredTeams.push(tp);
        }
      } catch {}

      // Load conversation history from local DB to pass explicitly to backend
      let conversationMessages = [];
      if (data.conversationId) {
        try {
          const msgRows = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbPath);
            const query = `
              SELECT role, content, timestamp, tool_calls, tool_results
              FROM conversation_history
              WHERE conversation_id = ?
              ORDER BY timestamp ASC, id ASC
            `;
            db.all(query, [data.conversationId], (err, rows) => {
              db.close();
              if (err) reject(err);
              else resolve(rows || []);
            });
          });

          conversationMessages = msgRows.map(row => {
            const msg = {
              role: row.role,
              content: row.content,
              timestamp: row.timestamp,
            };

            if (row.role === 'tool' && row.content) {
              try {
                const parsed = JSON.parse(row.content);
                if (parsed && typeof parsed === 'object') {
                  if (parsed.tool_call_id !== undefined) msg.tool_call_id = parsed.tool_call_id;
                  if (parsed.tool_name !== undefined) msg.name = parsed.tool_name;
                  if (parsed.content !== undefined) msg.content = parsed.content;
                }
              } catch (e) {}
            }

            if (row.tool_calls) {
              try {
                const raw = JSON.parse(row.tool_calls);
                if (Array.isArray(raw)) {
                  msg.tool_calls = raw.map(tc => {
                    if (tc && typeof tc === 'object' && tc.function && typeof tc.function === 'object') {
                      return tc;
                    }
                    return {
                      id: tc.id || '',
                      type: 'function',
                      function: {
                        name: tc.function_name || '',
                        arguments: tc.arguments || '{}',
                      },
                    };
                  });
                }
              } catch (e) {}
            }

            return msg;
          });
        } catch (loadErr) {
          console.error('[Main Process] Error loading conversation messages:', loadErr);
        }
      }

      const payload = {
        streamId: currentStreamId,
        commandstr: data.commandstr,
        currentPath: data.currentPath,
        conversationId: data.conversationId,
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        npc: data.npc,
        npcSource: data.npcSource || 'global',
        attachments: data.attachments || [],
        executionMode: data.executionMode || 'chat',
        mcpServerPaths: data.executionMode === 'tool_agent' ? (data.mcpServerPaths || (data.mcpServerPath ? [data.mcpServerPath] : undefined)) : undefined,
        parentMessageId: data.parentMessageId,
        isResend: data.isRerun || false,
        jinxes: data.jinxes || [],
        tools: data.tools || [],
        registered_teams: registeredTeams,
        messages: conversationMessages,

        userMessageId: data.userMessageId,
        assistantMessageId: data.assistantMessageId,

        userParentMessageId: data.userParentMessageId,

        temperature: data.temperature,
        top_p: data.top_p,
        top_k: data.top_k,
        max_tokens: data.max_tokens,

        disableThinking: data.disableThinking || false,
        customProviders,
        extractMemories: data.extractMemories !== false,
      };

      if (apiUrlOverride) {
        payload.api_url = apiUrlOverride;
        payload.api_key = apiKeyOverride;
      }

      const response = await fetch(`${BACKEND_URL}/api/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      log(`[Main Process] Backend response status for streamId ${currentStreamId}: ${response.status}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
      }

      const stream = response.body;
      if (!stream) {
        event.sender.send('stream-error', { streamId: currentStreamId, error: 'Backend returned no stream data.' });
        return { error: 'Backend returned no stream data.', streamId: currentStreamId };
      }

      activeStreams.set(currentStreamId, { stream, eventSender: event.sender });

      (function(capturedStreamId) {
        stream.on('data', (chunk) => {
          if (event.sender.isDestroyed()) {
            stream.destroy();
            activeStreams.delete(capturedStreamId);
            return;
          }
          event.sender.send('stream-data', {
            streamId: capturedStreamId,
            chunk: chunk.toString()
          });
        });

        let streamCompleteSent = false;
        const sendStreamComplete = () => {
          if (streamCompleteSent) return;
          streamCompleteSent = true;
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-complete', { streamId: capturedStreamId });
          }
          activeStreams.delete(capturedStreamId);
        };

        stream.on('end', () => {
          log(`[Main Process] Stream ${capturedStreamId} ended from backend.`);
          sendStreamComplete();
        });

        stream.on('close', () => {
          if (activeStreams.has(capturedStreamId)) {
            log(`[Main Process] Stream ${capturedStreamId} closed without end.`);
            sendStreamComplete();
          }
        });

        stream.on('error', (err) => {
          log(`[Main Process] Stream ${capturedStreamId} error:`, err.message);
          if (!event.sender.isDestroyed()) {
              const categorized = categorizeBackendError(err);
              event.sender.send('stream-error', {
                streamId: capturedStreamId,
                error: categorized.userMessage,
                category: categorized.category,
                suggestion: categorized.suggestion,
                original: categorized.original,
              });
          }
          activeStreams.delete(capturedStreamId);
        });
      })(currentStreamId);

      return { streamId: currentStreamId };

    } catch (err) {
      log(`[Main Process] Error setting up stream ${currentStreamId}:`, err.message);
      const categorized = categorizeBackendError(err);
      if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('stream-error', {
            streamId: currentStreamId,
            error: categorized.userMessage,
            category: categorized.category,
            suggestion: categorized.suggestion,
            original: categorized.original,
          });
      }
      return { error: categorized.userMessage, streamId: currentStreamId };
    }
  });

  ipcMain.handle('executeCommand', async (event, data) => {
    const currentStreamId = generateId();
    log(`[Main Process] executeCommand: Starting. streamId: ${currentStreamId}`);

    try {
        const apiUrl = `${BACKEND_URL}/api/execute`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commandstr: data.commandstr,
                currentPath: data.currentPath,
                conversationId: data.conversationId,
                model: data.model,
                provider: data.provider,
                npc: data.npc,
                npcSource: data.npcSource || 'global',
                attachments: data.attachments || []
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
        }

        const stream = response.body;
        if (!stream) {
            throw new Error('Backend returned no stream data.');
        }

        activeStreams.set(currentStreamId, { stream, eventSender: event.sender });

        stream.on('data', (chunk) => {
            if (event.sender.isDestroyed()) {
                stream.destroy();
                activeStreams.delete(currentStreamId);
                return;
            }
            event.sender.send('stream-data', {
                streamId: currentStreamId,
                chunk: chunk.toString()
            });
        });

        let streamCompleteSent2 = false;
        const sendStreamComplete2 = () => {
          if (streamCompleteSent2) return;
          streamCompleteSent2 = true;
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-complete', { streamId: currentStreamId });
          }
          activeStreams.delete(currentStreamId);
        };

        stream.on('end', () => {
            sendStreamComplete2();
        });

        stream.on('close', () => {
            if (activeStreams.has(currentStreamId)) {
                sendStreamComplete2();
            }
        });

        stream.on('error', (err) => {
            if (!event.sender.isDestroyed()) {
                const categorized = categorizeBackendError(err);
                event.sender.send('stream-error', {
                    streamId: currentStreamId,
                    error: categorized.userMessage,
                    category: categorized.category,
                    suggestion: categorized.suggestion,
                    original: categorized.original,
                });
            }
            activeStreams.delete(currentStreamId);
        });

        return { streamId: currentStreamId };

    } catch (err) {
        const categorized = categorizeBackendError(err);
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
                streamId: currentStreamId,
                error: categorized.userMessage,
                category: categorized.category,
                suggestion: categorized.suggestion,
                original: categorized.original,
            });
        }
        return { error: categorized.userMessage, streamId: currentStreamId };
    }
  });

  ipcMain.handle('get-attachment', async (event, attachmentId) => {
    const response = await fetch(`${BACKEND_URL}/api/attachment/${attachmentId}`);
    return response.json();
  });

  ipcMain.handle('get-message-attachments', async (event, messageId) => {
    const response = await fetch(`${BACKEND_URL}/api/attachments/${messageId}`);
    return response.json();
  });

  ipcMain.handle('get-usage-stats', async () => {
    console.log('[IPC] get-usage-stats handler STARTED');
    try {
      const conversationQuery = `SELECT COUNT(DISTINCT conversation_id) as total FROM conversation_history;`;
      const messagesQuery = `SELECT COUNT(*) as total FROM conversation_history WHERE role = 'user' OR role = 'assistant';`;
      const modelsQuery = `SELECT model, COUNT(*) as count FROM conversation_history WHERE model IS NOT NULL AND model != '' GROUP BY model ORDER BY count DESC LIMIT 5;`;
      const npcsQuery = `SELECT npc, COUNT(*) as count FROM conversation_history WHERE npc IS NOT NULL AND npc != '' GROUP BY npc ORDER BY count DESC LIMIT 5;`;

      const [convResult] = await dbQuery(conversationQuery);
      const [msgResult] = await dbQuery(messagesQuery);
      const topModels = await dbQuery(modelsQuery);
      const topNPCs = await dbQuery(npcsQuery);

      console.log('[IPC] get-usage-stats returning:', {
        totalConversations: convResult?.total || 0,
        totalMessages: msgResult?.total || 0,
        topModels,
        topNPCs
      });

      return {
        stats: {
          totalConversations: convResult?.total || 0,
          totalMessages: msgResult?.total || 0,
          topModels,
          topNPCs
        },
        error: null
      };
    } catch (err) {
      console.error('[IPC] get-usage-stats ERROR:', err);
      return { stats: null, error: err.message };
    }
  });

  ipcMain.handle('getActivityData', async (event, { period }) => {
    try {
      let dateModifier = '-30 days';
      if (period === '7d') dateModifier = '-7 days';
      if (period === '90d') dateModifier = '-90 days';

      const query = `
        SELECT
          strftime('%Y-%m-%d', timestamp) as date,
          COUNT(*) as count
        FROM conversation_history
        WHERE timestamp >= strftime('%Y-%m-%d %H:%M:%S', 'now', ?)
        GROUP BY date
        ORDER BY date ASC;
      `;

      const rows = await dbQuery(query, [dateModifier]);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  });

  ipcMain.handle('getHistogramData', async () => {
    try {
      const query = `
        SELECT
          CASE
            WHEN LENGTH(content) BETWEEN 0 AND 50 THEN '0-50'
            WHEN LENGTH(content) BETWEEN 51 AND 200 THEN '51-200'
            WHEN LENGTH(content) BETWEEN 201 AND 500 THEN '201-500'
            WHEN LENGTH(content) BETWEEN 501 AND 1000 THEN '501-1000'
            ELSE '1000+'
          END as bin,
          COUNT(*) as count
        FROM conversation_history
        WHERE role = 'user' OR role = 'assistant'
        GROUP BY bin
        ORDER BY MIN(LENGTH(content));
      `;
      const rows = await dbQuery(query);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  });

  ipcMain.handle('getConversations', async (_, path_) => {
    try {
      try {
        await fsPromises.access(path_);
      } catch (err) {
        console.error('Directory does not exist or is not accessible:', path_);
        return { conversations: [], error: 'Directory not accessible' };
      }

      const normalizedPath = path_.replace(/\\/g, '/').replace(/\/+$/, '');

      const rows = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        const query = `
          SELECT
            conversation_id as id,
            MIN(timestamp) as timestamp,
            MAX(timestamp) as last_message_timestamp,
            GROUP_CONCAT(content) as preview,
            GROUP_CONCAT(DISTINCT CASE WHEN npc IS NOT NULL AND npc != '' THEN npc END) as npcs,
            GROUP_CONCAT(DISTINCT CASE WHEN model IS NOT NULL AND model != '' THEN model END) as models,
            GROUP_CONCAT(DISTINCT CASE WHEN provider IS NOT NULL AND provider != '' THEN provider END) as providers,
            MAX(execution_mode) as execution_mode
          FROM conversation_history
          WHERE REPLACE(RTRIM(directory_path, '/\\'), '\\', '/') = ?
          GROUP BY conversation_id
          ORDER BY MAX(timestamp) DESC
        `;
        db.all(query, [normalizedPath], (err, rows) => {
          db.close();
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const conversations = rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        last_message_timestamp: row.last_message_timestamp,
        preview: row.preview && row.preview.length > 100 ? row.preview.slice(0, 100) + '...' : row.preview,
        npcs: (row.npcs || '').split(',').filter(Boolean),
        models: (row.models || '').split(',').filter(Boolean),
        providers: (row.providers || '').split(',').filter(Boolean),
        execution_mode: row.execution_mode || 'chat',
        npc: (row.npcs || '').split(',')[0] || '',
        model: (row.models || '').split(',')[0] || '',
        provider: (row.providers || '').split(',')[0] || '',
      }));

      return { conversations, error: null };
    } catch (err) {
      console.error('Error getting conversations:', err);
      return {
        error: err.message,
        conversations: []
      };
    }
  });

  ipcMain.handle('checkServerConnection', async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/status`);
      if (!response.ok) return { error: 'Server not responding properly' };
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('getConversationsInDirectory', async (_, directoryPath) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      const query = `
        SELECT DISTINCT conversation_id,
              MIN(timestamp) as start_time,
              GROUP_CONCAT(content) as preview
        FROM conversation_history
        WHERE directory_path = ?
        GROUP BY conversation_id
        ORDER BY start_time DESC
      `;
      db.all(query, [directoryPath], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
  });

  ipcMain.handle('getConversationMessages', async (_, conversationId) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (dbErr) => {
        if (dbErr) {
          console.error('[DB] Error opening database:', dbErr);
          return reject(dbErr);
        }

        const query = `
        SELECT
            ch.id,
            ch.message_id,
            ch.timestamp,
            ch.role,
            ch.content,
            ch.conversation_id,
            ch.directory_path,
            ch.model,
            ch.provider,
            ch.npc,
            ch.team,
            ch.reasoning_content,
            ch.tool_calls,
            ch.tool_results,
            ch.parent_message_id,
            ch.input_tokens,
            ch.output_tokens,
            ch.cost,
            json_group_array(
                json_object(
                    'id', ma.id,
                    'name', ma.attachment_name,
                    'path', ma.file_path,
                    'type', ma.attachment_type,
                    'size', ma.attachment_size,
                    'timestamp', ma.upload_timestamp
                )
            ) FILTER (WHERE ma.id IS NOT NULL) AS attachments_json
        FROM
            conversation_history ch
        LEFT JOIN
            message_attachments ma ON ch.message_id = ma.message_id
        WHERE
            ch.conversation_id = ?
        GROUP BY
            ch.id
        ORDER BY
            ch.timestamp ASC, ch.id ASC;
      `;

      db.all(query, [conversationId], (err, rows) => {
        db.close();
        if (err) {
            return reject(err);
        }

        const messages = rows.map(row => {
            let attachments = [];
            if (row.attachments_json) {
                try {
                    const parsedAttachments = JSON.parse(row.attachments_json);
                    attachments = parsedAttachments.filter(att => att && att.id !== null);
                } catch (e) {
                    attachments = [];
                }
            }

            let content = row.content;
            if (typeof content === 'string' && content.startsWith('[')) {
                try {
                    content = JSON.parse(content);
                } catch (e) {

                }
            }

            let toolCalls = null;
            let toolResults = null;
            if (row.tool_calls) {
                try {
                    toolCalls = JSON.parse(row.tool_calls);
                } catch (e) {}
            }
            if (row.tool_results) {
                try {
                    toolResults = JSON.parse(row.tool_results);
                } catch (e) {}
            }

            const newRow = {
                ...row,
                attachments,
                content,
                reasoningContent: row.reasoning_content,
                toolCalls,
                toolResults,
                parentMessageId: row.parent_message_id,
                input_tokens: row.input_tokens || 0,
                output_tokens: row.output_tokens || 0,
                cost: row.cost ? parseFloat(row.cost) : null,
            };
            delete newRow.attachments_json;
            delete newRow.reasoning_content;
            delete newRow.tool_calls;
            delete newRow.tool_results;
            delete newRow.parent_message_id;
            return newRow;
        });

        resolve(messages);
      });
    });
  });
  });

  ipcMain.handle('getDefaultConfig', () => {

    console.log('CONFIG:', DEFAULT_CONFIG);
    return DEFAULT_CONFIG;

  });

  ipcMain.handle('getProjectCtx', async (_, currentPath) => {
    const yaml = require('js-yaml');
    let result = { model: null, provider: null, npc: null };

    const rcEnv = parseIncogniderc();

    try {
      const npcTeamDir = path.join(currentPath, 'npc_team');
      if (fs.existsSync(npcTeamDir)) {
        const ctxFiles = fs.readdirSync(npcTeamDir).filter(f => f.endsWith('.ctx'));
        if (ctxFiles.length > 0) {
          const ctxData = yaml.load(fs.readFileSync(path.join(npcTeamDir, ctxFiles[0]), 'utf-8')) || {};
          if (ctxData.model) result.model = ctxData.model;
          if (ctxData.provider) result.provider = ctxData.provider;
          if (ctxData.npc) result.npc = ctxData.npc;
        }
      }
    } catch (e) {
      console.log('Error reading project ctx:', e.message);
    }

    if (!result.model) {
      try {
        const globalCtx = path.join(os.homedir(), '.incognide', 'npc_team', 'incognide.ctx');
        if (fs.existsSync(globalCtx)) {
          const ctxData = yaml.load(fs.readFileSync(globalCtx, 'utf-8')) || {};
          if (ctxData.model) result.model = ctxData.model;
          if (ctxData.provider) result.provider = ctxData.provider;
          if (ctxData.npc) result.npc = ctxData.npc;
        }
      } catch (e) {
        console.log('Error reading global ctx:', e.message);
      }
    }

    if (!result.model) {
      result.model = process.env.INCOGNIDE_CHAT_MODEL || rcEnv.INCOGNIDE_CHAT_MODEL;
    }
    if (!result.provider) {
      result.provider = process.env.INCOGNIDE_CHAT_PROVIDER || rcEnv.INCOGNIDE_CHAT_PROVIDER;
    }

    console.log('getProjectCtx result:', result);
    return result;
  });

  ipcMain.handle('getWorkingDirectory', () => {

    return DEFAULT_CONFIG.baseDir;
  });

  ipcMain.handle('setWorkingDirectory', async (_, dir) => {

    try {
      const normalizedDir = path.normalize(dir);
      const baseDir = DEFAULT_CONFIG.baseDir;
      if (!normalizedDir.startsWith(baseDir)) {
        console.log('Attempted to access directory above base:', normalizedDir);
        return baseDir;
      }
      await fsPromises.access(normalizedDir);
      return normalizedDir;
    } catch (err) {
      console.error('Error in setWorkingDirectory:', err);
      throw err;
    }
  });

  ipcMain.handle('text-predict', async (event, data) => {
    const currentStreamId = data.streamId || generateId();
    log(`[Main] text-predict: Starting stream ${currentStreamId}`);

    try {
      const apiUrl = `${BACKEND_URL}/api/text_predict`;

      const payload = {
        streamId: currentStreamId,
        text_content: data.text_content,
        cursor_position: data.cursor_position,
        currentPath: data.currentPath,
        model: data.model,
        provider: data.provider,
        context_type: data.context_type,
        file_path: data.file_path
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      log(`[Main] Backend status ${response.status} for stream ${currentStreamId}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const stream = response.body;
      if (!stream) {
        event.sender.send('stream-error', {
          streamId: currentStreamId,
          error: 'No stream body returned from backend.'
        });
        return { error: 'No stream body', streamId: currentStreamId };
      }

      activeStreams.set(currentStreamId, { stream, eventSender: event.sender });

      (function(capturedStreamId) {
        let streamCompleteSent3 = false;
        const sendStreamComplete3 = () => {
          if (streamCompleteSent3) return;
          streamCompleteSent3 = true;
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-complete', { streamId: capturedStreamId });
          }
          activeStreams.delete(capturedStreamId);
        };

        stream.on('data', (chunk) => {
          if (event.sender.isDestroyed()) {
            stream.destroy();
            activeStreams.delete(capturedStreamId);
            return;
          }
          event.sender.send('stream-data', {
            streamId: capturedStreamId,
            chunk: chunk.toString()
          });
        });

        stream.on('end', () => {
          log(`[Main] Stream ${capturedStreamId} ended.`);
          sendStreamComplete3();
        });

        stream.on('close', () => {
          if (activeStreams.has(capturedStreamId)) {
            log(`[Main] Stream ${capturedStreamId} closed without end.`);
            sendStreamComplete3();
          }
        });

        stream.on('error', err => {
          log(`[Main] Stream ${capturedStreamId} error: ${err.message}`);
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
              streamId: capturedStreamId,
              error: err.message
            });
          }
          activeStreams.delete(capturedStreamId);
        });
      })(currentStreamId);

      return { streamId: currentStreamId };

    } catch (err) {
      log(`[Main] Error setting up text prediction stream ${currentStreamId}:`, err.message);
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('stream-error', {
          streamId: currentStreamId,
          error: err.message
        });
      }
      return { error: err.message, streamId: currentStreamId };
    }
  });

  ipcMain.handle('deleteConversation', async (_, conversationId) => {
    try {
      const db = new sqlite3.Database(dbPath);
      const deleteQuery = 'DELETE FROM conversation_history WHERE conversation_id = ?';
      await new Promise((resolve, reject) => {
        db.run(deleteQuery, [conversationId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      db.close();
      return { success: true };
    } catch (err) {
      console.error('Error deleting conversation:', err);
      throw err;
    }
  });

  ipcMain.handle('createConversation', async (_, { title, model, provider }) => {
    try {
      const conversationId = Date.now().toString();
      return {
        id: conversationId,
        title: title || 'New Conversation',
        model: model || DEFAULT_CONFIG.model,
        provider: provider || DEFAULT_CONFIG.provider,
        created: new Date().toISOString(),
        messages: []
      };
    } catch (err) {
      console.error('Error creating conversation:', err);
      throw err;
    }
  });

  ipcMain.handle('openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('executeCode', async (_, { code, workingDir }) => {
    try {
      const pythonPath = getBackendPythonPath();

      return new Promise((resolve) => {
        const proc = spawn(pythonPath, ['-c', code], {
          cwd: workingDir || process.cwd(),
          env: { ...process.env },
          timeout: 60000
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (exitCode) => {
          if (exitCode === 0) {
            resolve({ output: stdout, error: null });
          } else {
            resolve({ output: stdout, error: stderr || `Process exited with code ${exitCode}` });
          }
        });

        proc.on('error', (err) => {
          resolve({ output: null, error: err.message });
        });
      });
    } catch (err) {
      console.error('Error executing code:', err);
      return { output: null, error: err.message };
    }
  });

  ipcMain.handle('get-last-used-in-directory', async (event, path_) => {
    if (!path_) return { model: null, npc: null, error: 'Path is required' };
    const normalizedPath = path_.replace(/\\/g, '/').replace(/\/+$/, '');
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      const sql = `
        SELECT model, npc
        FROM conversation_history
        WHERE REPLACE(RTRIM(directory_path, '/\\'), '\\', '/') = ?
          AND model IS NOT NULL AND npc IS NOT NULL
          AND model != '' AND npc != ''
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `;
      db.get(sql, [normalizedPath], (err, row) => {
        db.close();
        if (err) return resolve({ model: null, npc: null, error: err.message });
        resolve(row ? { model: row.model, npc: row.npc } : { model: null, npc: null });
      });
    });
  });

  ipcMain.handle('get-last-used-in-conversation', async (event, conversationId) => {
    if (!conversationId) return { model: null, npc: null, error: 'Conversation ID is required' };
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      const sql = `
        SELECT model, npc
        FROM conversation_history
        WHERE conversation_id = ?
          AND model IS NOT NULL AND npc IS NOT NULL
          AND model != '' AND npc != ''
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `;
      db.get(sql, [conversationId], (err, row) => {
        db.close();
        if (err) return resolve({ model: null, npc: null, error: err.message });
        resolve(row ? { model: row.model, npc: row.npc } : { model: null, npc: null });
      });
    });
  });

  ipcMain.handle('search-conversations', async (event, { query, limit = 20 }) => {
    if (!query) return { conversations: [] };
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      const pattern = `%${query}%`;
      const sql = `
        SELECT DISTINCT conversation_id,
               MIN(timestamp) as start_time,
               MAX(timestamp) as last_message_timestamp,
               GROUP_CONCAT(DISTINCT CASE WHEN npc IS NOT NULL AND npc != '' THEN npc END) as npcs
        FROM conversation_history
        WHERE content LIKE ?
        GROUP BY conversation_id
        ORDER BY MAX(timestamp) DESC
        LIMIT ?
      `;
      db.all(sql, [pattern, limit], (err, rows) => {
        if (err) {
          db.close();
          return resolve({ conversations: [], error: err.message });
        }
        const conversations = [];
        let pending = rows.length;
        if (pending === 0) {
          db.close();
          return resolve({ conversations: [] });
        }
        for (const row of rows) {
          db.get(
            `SELECT content FROM conversation_history WHERE conversation_id = ? AND content LIKE ? LIMIT 1`,
            [row.conversation_id, pattern],
            (err2, snippetRow) => {
              let preview = '';
              if (snippetRow && snippetRow.content) {
                const content = snippetRow.content;
                const idx = content.toLowerCase().indexOf(query.toLowerCase());
                const start = Math.max(0, idx - 40);
                const end = Math.min(content.length, idx + query.length + 40);
                preview = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
              }
              conversations.push({
                id: row.conversation_id,
                timestamp: row.start_time,
                last_message_timestamp: row.last_message_timestamp,
                preview,
                title: preview ? preview.slice(0, 50) : row.conversation_id.slice(0, 20),
                npc: (row.npcs || '').split(',')[0] || '',
              });
              pending--;
              if (pending === 0) {
                db.close();
                resolve({ conversations, error: null });
              }
            }
          );
        }
      });
    });
  });

  // ---- End sync handlers ----
}

module.exports = { register };
