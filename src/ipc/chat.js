const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const fetch = require('node-fetch');
const { shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');

const dbPath = path.join(os.homedir(), 'npcsh_history.db');

// ---------------------------------------------------------------------------
// Helper: parse ~/.npcshrc for env vars (since Electron doesn't source shell)
// ---------------------------------------------------------------------------
function parseNpcshrc() {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  const result = {};
  try {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Match export VAR=value or VAR=value
        const match = line.match(/^(?:export\s+)?(\w+)=(.*)$/);
        if (match) {
          let value = match[2].trim();
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          result[match[1]] = value;
        }
      }
    }
  } catch (e) {
    console.log('Error reading .npcshrc:', e.message);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: resolve the Python path configured for the backend
// ---------------------------------------------------------------------------
function getBackendPythonPath() {
  const rcPath = path.join(os.homedir(), '.npcshrc');
  try {
    if (fs.existsSync(rcPath)) {
      const rcContent = fs.readFileSync(rcPath, 'utf8');
      const match = rcContent.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (match && match[1] && match[1].trim()) {
        const pythonPath = match[1].trim().replace(/^~/, os.homedir());
        // Verify the path exists
        if (fs.existsSync(pythonPath)) {
          return pythonPath;
        }
      }
    }
  } catch (err) {
    console.log('Error reading backend Python path from .npcshrc:', err);
  }
  return null;
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
  } = ctx;

  // ===================================================================
  // getAvailableModels  (also scans local GGUF files)
  // ===================================================================
  ipcMain.handle('getAvailableModels', async (event, currentPath) => {

    if (!currentPath) {
        log('Error: getAvailableModels called without currentPath');
        return { models: [], error: 'Current path is required to fetch models.' };
    }

    let backendModels = [];
    let backendError = null;

    // Try to fetch from backend first
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

    // Always scan for local GGUF models (even if backend failed)
    const ggufModels = [];
    try {
        const homeDir = os.homedir();

        const ggufDirs = [
            path.join(homeDir, '.cache', 'huggingface', 'hub'),
            path.join(homeDir, '.cache', 'lm-studio', 'models'),
            path.join(homeDir, '.lmstudio', 'models'),
            path.join(homeDir, 'llama.cpp', 'models'),
            path.join(homeDir, '.npcsh', 'models', 'gguf'),
            path.join(homeDir, '.npcsh', 'models'),
            path.join(homeDir, 'models'),
        ];

        const seenPaths = new Set();

        const scanDir = async (dir, depth = 0) => {
            if (depth > 5) return;
            try {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    // Use stat to follow symlinks
                    try {
                        const stats = await fsPromises.stat(fullPath);
                        if (stats.isDirectory() && !entry.name.startsWith('.git') && entry.name !== 'node_modules') {
                            await scanDir(fullPath, depth + 1);
                        } else if (stats.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (ext === '.gguf' && !seenPaths.has(fullPath)) {
                                seenPaths.add(fullPath);
                                if (stats.size > 50 * 1024 * 1024) { // Files > 50MB
                                    ggufModels.push({
                                        value: fullPath,
                                        display_name: `[GGUF] ${entry.name}`,
                                        provider: 'gguf',
                                        size: stats.size,
                                        path: fullPath
                                    });
                                }
                            }
                        }
                    } catch (statErr) { /* skip broken symlinks */ }
                }
            } catch (e) { /* directory doesn't exist */ }
        };

        for (const dir of ggufDirs) {
            await scanDir(dir);
        }

        log('Found GGUF models:', ggufModels.length);
    } catch (ggufErr) {
        log('Error scanning GGUF models:', ggufErr);
    }

    const allModels = [...backendModels, ...ggufModels];

    if (allModels.length === 0 && backendError) {
        return { models: [], error: backendError };
    }

    return { models: allModels };
  });

  // ===================================================================
  // getAvailableImageModels
  // ===================================================================
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
        // <--- CRITICAL FIX: Ensure data.models is an array before attempting to push
        if (!Array.isArray(data.models)) {
            log('Warning: Backend /api/image_models did not return an array for data.models. Initializing as empty array.');
            data.models = [];
        }

        log('Received image models:', data.models?.length);


        return data; // This `data` object now contains the combined list from Python
    } catch (err) {
        log('Error in getAvailableImageModels handler:', err);
        return { models: [], error: err.message || 'Failed to fetch image models from backend' };
    }
  });

  // ===================================================================
  // generate_images
  // ===================================================================
  ipcMain.handle('generate_images', async (event, { prompt, n, model, provider, attachments, baseFilename='vixynt_gen_', currentPath='~/.npcsh/images' }) => {
    log(`[Main Process] Received request to generate ${n} image(s) with prompt: "${prompt}" using model: "${model}" (${provider})`);

    if (!prompt) {
        return { error: 'Prompt cannot be empty' };
    }
    if (!model || !provider) {
        return { error: 'Image model and provider must be selected.' };
    }

    try {
        const apiUrl = `${BACKEND_URL}/api/generate_images`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              n,
              model,
              provider,
              attachments,
              baseFilename,
              currentPath

            })

          });

        if (!response.ok) {
            const errorBody = await response.json();
            const errorMessage = errorBody.error || `HTTP error! status: ${response.status}`;
            log('Backend image generation failed:', errorMessage);
            return { error: errorMessage };
        }

        const data = await response.json();

        if (data.error) {
            return { error: data.error };
        }
        return { images: data.images };
    } catch (error) {
        log('Error generating images in main process handler:', error);
        return { error: error.message || 'Image generation failed in main process' };
    }
  });

  // ===================================================================
  // deleteMessage
  // ===================================================================
  ipcMain.handle('deleteMessage', async (_, { conversationId, messageId }) => {
    try {
      const db = new sqlite3.Database(dbPath);

      // Delete by message_id column (which is what the backend actually uses)
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

      // Also delete associated attachments
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

  // ===================================================================
  // generative-fill
  // ===================================================================
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

  // ===================================================================
  // interruptStream  (uses activeStreams to kill streams)
  // ===================================================================
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

  // ===================================================================
  // wait-for-screenshot
  // ===================================================================
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

  // ===================================================================
  // get_attachment_response
  // ===================================================================
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

  // ===================================================================
  // executeCommandStream  (streaming command execution to backend)
  // ===================================================================
  ipcMain.handle('executeCommandStream', async (event, data) => {

    const currentStreamId = data.streamId || generateId();
    log(`[Main Process] executeCommandStream: Starting stream with ID: ${currentStreamId}`);

    try {
      const apiUrl = `${BACKEND_URL}/api/stream`;


      const payload = {
        streamId: currentStreamId,
        commandstr: data.commandstr,
        currentPath: data.currentPath,
        conversationId: data.conversationId,
        model: data.model,
        provider: data.provider,
        npc: data.npc,
        npcSource: data.npcSource || 'global',
        attachments: data.attachments || [],
        executionMode: data.executionMode || 'chat',
        mcpServerPath: data.executionMode === 'tool_agent' ? data.mcpServerPath : undefined,
        parentMessageId: data.parentMessageId,
        isResend: data.isRerun || false,
        jinxs: data.jinxs || [],
        tools: data.tools || [],
        // Pass frontend-generated message IDs so backend uses the same IDs
        userMessageId: data.userMessageId,
        assistantMessageId: data.assistantMessageId,
        // For sub-branches: the parent of the user message (points to an assistant message)
        userParentMessageId: data.userParentMessageId,
      };

      const response = await fetch(apiUrl, {
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

        stream.on('end', () => {
          log(`[Main Process] Stream ${capturedStreamId} ended from backend.`);
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-complete', { streamId: capturedStreamId });
          }
          activeStreams.delete(capturedStreamId);
        });

        stream.on('error', (err) => {
          log(`[Main Process] Stream ${capturedStreamId} error:`, err.message);
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
      log(`[Main Process] Error setting up stream ${currentStreamId}:`, err.message);
      if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('stream-error', {
            streamId: currentStreamId,
            error: `Failed to set up stream: ${err.message}`
          });
      }
      return { error: `Failed to set up stream: ${err.message}`, streamId: currentStreamId };
    }
  });

  // ===================================================================
  // executeCommand  (non-streaming variant, still uses stream under the hood)
  // ===================================================================
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

        stream.on('end', () => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('stream-complete', { streamId: currentStreamId });
            }
            activeStreams.delete(currentStreamId);
        });

        stream.on('error', (err) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('stream-error', {
                    streamId: currentStreamId,
                    error: err.message
                });
            }
            activeStreams.delete(currentStreamId);
        });

        return { streamId: currentStreamId };

    } catch (err) {
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
                streamId: currentStreamId,
                error: err.message
            });
        }
        return { error: err.message, streamId: currentStreamId };
    }
  });

  // ===================================================================
  // get-attachment / get-message-attachments
  // ===================================================================
  ipcMain.handle('get-attachment', async (event, attachmentId) => {
    const response = await fetch(`${BACKEND_URL}/api/attachment/${attachmentId}`);
    return response.json();
  });

  ipcMain.handle('get-message-attachments', async (event, messageId) => {
    const response = await fetch(`${BACKEND_URL}/api/attachments/${messageId}`);
    return response.json();
  });

  // ===================================================================
  // get-usage-stats
  // ===================================================================
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

  // ===================================================================
  // getActivityData
  // ===================================================================
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

  // ===================================================================
  // getHistogramData
  // ===================================================================
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

  // ===================================================================
  // getConversations
  // ===================================================================
  ipcMain.handle('getConversations', async (_, path_) => {
    try {


      try {
        await fsPromises.access(path_);
        console.log('Directory exists and is accessible');
      } catch (err) {
        console.error('Directory does not exist or is not accessible:', path_);
        return { conversations: [], error: 'Directory not accessible' };
      }

      const apiUrl = `${BACKEND_URL}/api/conversations?path=${encodeURIComponent(path_)}`;
      console.log('Calling API with URL:', apiUrl);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.error('API returned error status:', response.status);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();


      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error('Error parsing JSON response:', err);
        return { conversations: [], error: 'Invalid JSON response' };
      }




      return {
        conversations: data.conversations || []
      };
    } catch (err) {
      console.error('Error getting conversations:', err);
      return {
        error: err.message,
        conversations: []
      };
    }
  });

  // ===================================================================
  // checkServerConnection
  // ===================================================================
  ipcMain.handle('checkServerConnection', async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/status`);
      if (!response.ok) return { error: 'Server not responding properly' };
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  // ===================================================================
  // getConversationsInDirectory
  // ===================================================================
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

  // ===================================================================
  // getConversationMessages
  // ===================================================================
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

            // Parse tool_calls and tool_results JSON
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
                parentMessageId: row.parent_message_id
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

  // ===================================================================
  // getDefaultConfig
  // ===================================================================
  ipcMain.handle('getDefaultConfig', () => {

    console.log('CONFIG:', DEFAULT_CONFIG);
    return DEFAULT_CONFIG;

  });

  // ===================================================================
  // getProjectCtx  (reads .ctx YAML files and .npcshrc)
  // ===================================================================
  ipcMain.handle('getProjectCtx', async (_, currentPath) => {
    const yaml = require('js-yaml');
    let result = { model: null, provider: null, npc: null };

    // Read .npcshrc for env vars
    const npcshrcEnv = parseNpcshrc();

    // Check project npc_team folder first
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

    // Fall back to global ctx if project doesn't have settings
    if (!result.model) {
      try {
        const globalCtx = path.join(os.homedir(), '.npcsh', 'npc_team', 'npcsh.ctx');
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

    // Fall back to env variables from process.env or .npcshrc
    if (!result.model) {
      result.model = process.env.NPCSH_CHAT_MODEL || npcshrcEnv.NPCSH_CHAT_MODEL;
    }
    if (!result.provider) {
      result.provider = process.env.NPCSH_CHAT_PROVIDER || npcshrcEnv.NPCSH_CHAT_PROVIDER;
    }

    console.log('getProjectCtx result:', result);
    return result;
  });

  // ===================================================================
  // getWorkingDirectory / setWorkingDirectory
  // ===================================================================
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

  // ===================================================================
  // text-predict  (streaming text prediction)
  // ===================================================================
  ipcMain.handle('text-predict', async (event, data) => {
    const currentStreamId = data.streamId || generateId();
    log(`[Main] text-predict: Starting stream ${currentStreamId}`);

    try {
      const apiUrl = `${BACKEND_URL}/api/text_predict`;

      const payload = {
        streamId: currentStreamId,
        text_content: data.text_content,        // FIXED
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
          if (!event.sender.isDestroyed()) {
            event.sender.send('stream-complete', { streamId: capturedStreamId });
          }
          activeStreams.delete(capturedStreamId);
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

  // ===================================================================
  // deleteConversation
  // ===================================================================
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

  // ===================================================================
  // createConversation
  // ===================================================================
  ipcMain.handle('createConversation', async (_, { title, model, provider, directory }) => {
    try {
      const conversationId = Date.now().toString();
      const conversation = {
        id: conversationId,
        title: title || 'New Conversation',
        model: model || DEFAULT_CONFIG.model,
        provider: provider || DEFAULT_CONFIG.provider,
        created: new Date().toISOString(),
        messages: []
      };
      const targetDir = directory || path.join(DEFAULT_CONFIG.baseDir, 'conversations');
      const filePath = path.join(targetDir, `${conversationId}.json`);
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await fsPromises.writeFile(filePath, JSON.stringify(conversation, null, 2));
      return conversation;
    } catch (err) {
      console.error('Error creating conversation:', err);
      throw err;
    }
  });

  // ===================================================================
  // openExternal
  // ===================================================================
  ipcMain.handle('openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  // ===================================================================
  // executeCode  (Python code execution)
  // ===================================================================
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

  // ===================================================================
  // get-last-used-in-directory / get-last-used-in-conversation
  // ===================================================================
  ipcMain.handle('get-last-used-in-directory', async (event, path_) => {
    if (!path_) return { model: null, npc: null, error: 'Path is required' };
    const url = `${BACKEND_URL}/api/last_used_in_directory?path=${encodeURIComponent(path_)}`;
    return await callBackendApi(url);
  });

  ipcMain.handle('get-last-used-in-conversation', async (event, conversationId) => {
    if (!conversationId) return { model: null, npc: null, error: 'Conversation ID is required' };
    const url = `${BACKEND_URL}/api/last_used_in_conversation?conversationId=${encodeURIComponent(conversationId)}`;
    return await callBackendApi(url);
  });
}

module.exports = { register };
