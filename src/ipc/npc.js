const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const fetch = require('node-fetch');
const yaml = require('js-yaml');

function register(ctx) {
  const { ipcMain, getMainWindow, callBackendApi, BACKEND_URL, log, generateId, activeStreams, appDir } = ctx;

  // ============== Jinx Handlers ==============

  ipcMain.handle('getAvailableJinxs', async (event, { currentPath, npc }) => {
    try {
        const params = new URLSearchParams();
        if (currentPath) params.append('currentPath', currentPath);
        if (npc) params.append('npc', npc);

        const url = `${BACKEND_URL}/api/jinxs/available?${params.toString()}`;
        log('Fetching available jinxs from:', url);

        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        log('Received jinxs:', data.jinxs?.length);
        return data;
    } catch (err) {
        log('Error in getAvailableJinxs handler:', err);
        return { jinxs: [], error: err.message };
    }
  });

  ipcMain.handle('executeJinx', async (event, data) => {
    const currentStreamId = data.streamId || generateId();
    log(`[Main Process] executeJinx: Starting stream with ID: ${currentStreamId}`);

    try {
        const apiUrl = `${BACKEND_URL}/api/jinx/execute`;

        const payload = {
            streamId: currentStreamId,
            jinxName: data.jinxName,
            jinxArgs: data.jinxArgs || [],
            currentPath: data.currentPath,
            conversationId: data.conversationId,
            model: data.model,
            provider: data.provider,
            npc: data.npc,
            npcSource: data.npcSource || 'global',
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        log(`[Main Process] Backend response status for jinx ${data.jinxName}: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
        }

        const stream = response.body;
        if (!stream) {
            event.sender.send('stream-error', {
                streamId: currentStreamId,
                error: 'Backend returned no stream data for jinx execution.'
            });
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
                log(`[Main Process] Jinx stream ${capturedStreamId} ended.`);
                if (!event.sender.isDestroyed()) {
                    event.sender.send('stream-complete', { streamId: capturedStreamId });
                }
                activeStreams.delete(capturedStreamId);
            });

            stream.on('error', (err) => {
                log(`[Main Process] Jinx stream ${capturedStreamId} error:`, err.message);
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
        log(`[Main Process] Error setting up jinx stream ${currentStreamId}:`, err.message);
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('stream-error', {
                streamId: currentStreamId,
                error: `Failed to execute jinx: ${err.message}`
            });
        }
        return { error: `Failed to execute jinx: ${err.message}`, streamId: currentStreamId };
    }
  });

  ipcMain.handle('get-jinxs-global', async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/jinxs/global`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Global jinxs data:', data);
        return data;
    } catch (err) {
        console.error('Error loading global jinxs:', err);
        return { jinxs: [], error: err.message };
    }
  });

  ipcMain.handle('get-jinxs-project', async (event, currentPath) => {
    try {
        const url = `${BACKEND_URL}/api/jinxs/project?currentPath=${encodeURIComponent(currentPath)}`;
        console.log('Fetching project jinxs from URL:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Project jinxs data:', data);
        return data;
    } catch (err) {
        console.error('Error loading project jinxs:', err);
        return { jinxs: [], error: err.message };
    }
  });

  ipcMain.handle('save-jinx', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/jinxs/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error('Error saving jinx:', err);
        return { error: err.message };
    }
  });

  // ============== NPC Team Handlers ==============

  ipcMain.handle('save-npc', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/save_npc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return response.json();
    } catch (error) {
        return { error: error.message };
    }
  });

  ipcMain.handle('getNPCTeamGlobal', async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/npc_team_global`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch NPC team');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching NPC team:', error);
      throw error;
    }
  });

  ipcMain.handle('getNPCTeamProject', async (event, currentPath) => {
    try {
      if (!currentPath || typeof currentPath !== 'string') {
        throw new Error('Invalid currentPath provided');
      }

      const queryParams = new URLSearchParams({
        currentPath: currentPath
      }).toString();

      const url = `${BACKEND_URL}/api/npc_team_project?${queryParams}`;
      console.log('Fetching NPC team from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();
      return {
        npcs: data.npcs || []
      };
    } catch (error) {
      console.error('Error fetching NPC team:', error);
      return {
        npcs: [],
        error: error.message
      };
    }
  });

  // ============== MCP Server Handlers ==============

  // --- MCP Server helpers ---
  async function fetchCtxMcpServers(currentPath) {
    const servers = new Map(); // serverPath -> { serverPath, origin }
    const addServer = (entry, origin) => {
      if (!entry) return;
      const serverPath = typeof entry === 'string' ? entry : entry.value;
      if (serverPath && !servers.has(serverPath)) {
        servers.set(serverPath, { serverPath, origin });
      }
    };

    // Auto-discover MCP servers from known team directories
    const npcshDir = path.join(os.homedir(), '.npcsh');
    const knownTeamDirs = [
      { dir: path.join(npcshDir, 'npc_team'), name: 'npcsh' },
      { dir: path.join(npcshDir, 'incognide', 'npc_team'), name: 'incognide' }
    ];

    for (const { dir, name } of knownTeamDirs) {
      try {
        if (fs.existsSync(dir)) {
          // Look for *_mcp_server.py or mcp_server.py
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.endsWith('_mcp_server.py') || file === 'mcp_server.py') {
              const serverPath = path.join(dir, file);
              addServer(serverPath, `auto:${name}`);
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to scan ${dir} for MCP servers:`, e.message);
      }
    }

    // Also check ~/.npcsh/mcp_server.py directly
    const globalMcpServer = path.join(npcshDir, 'mcp_server.py');
    if (fs.existsSync(globalMcpServer)) {
      addServer(globalMcpServer, 'auto:global');
    }

    // Load from context files (these can override auto-discovered ones)
    try {
      const globalRes = await fetch(`${BACKEND_URL}/api/context/global`);
      const globalJson = await globalRes.json();
      (globalJson.context?.mcp_servers || []).forEach(s => addServer(s, 'global'));
    } catch (e) {
      console.warn('Failed to load global ctx for MCP servers', e.message);
    }

    if (currentPath) {
      try {
        const projRes = await fetch(`${BACKEND_URL}/api/context/project?path=${encodeURIComponent(currentPath)}`);
        const projJson = await projRes.json();
        (projJson.context?.mcp_servers || []).forEach(s => addServer(s, 'project'));
      } catch (e) {
        console.warn('Failed to load project ctx for MCP servers', e.message);
      }
    }
    return Array.from(servers.values());
  }

  ipcMain.handle('mcp:getServers', async (event, { currentPath } = {}) => {
    try {
      const serverList = await fetchCtxMcpServers(currentPath);
      const statuses = [];
      for (const serverInfo of serverList) {
        const { serverPath, origin } = serverInfo;
        try {
          const statusRes = await fetch(`${BACKEND_URL}/api/mcp/server/status?serverPath=${encodeURIComponent(serverPath)}${currentPath ? `&currentPath=${encodeURIComponent(currentPath)}` : ''}`);
          const statusJson = await statusRes.json();
          statuses.push({ serverPath, origin, status: statusJson.status || (statusJson.running ? 'running' : 'unknown'), details: statusJson });
        } catch (err) {
          statuses.push({ serverPath, origin, status: 'error', error: err.message });
        }
      }
      return { servers: statuses, error: null };
    } catch (err) {
      console.error('Error in mcp:getServers', err);
      return { servers: [], error: err.message };
    }
  });

  ipcMain.handle('mcp:startServer', async (event, { serverPath, currentPath } = {}) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/mcp/server/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverPath, currentPath })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { result: json, error: null };
    } catch (err) {
      console.error('Error starting MCP server', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('mcp:stopServer', async (event, { serverPath } = {}) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/mcp/server/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverPath })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { result: json, error: null };
    } catch (err) {
      console.error('Error stopping MCP server', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('mcp:status', async (event, { serverPath, currentPath } = {}) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/mcp/server/status?serverPath=${encodeURIComponent(serverPath || '')}${currentPath ? `&currentPath=${encodeURIComponent(currentPath)}` : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { status: json, error: null };
    } catch (err) {
      console.error('Error fetching MCP server status', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('mcp:listTools', async (event, { serverPath, conversationId, npc, selected, currentPath } = {}) => {
    try {
      const params = new URLSearchParams();
      if (serverPath) params.append('mcpServerPath', serverPath);
      if (conversationId) params.append('conversationId', conversationId);
      if (npc) params.append('npc', npc);
      if (currentPath) params.append('currentPath', currentPath);
      if (selected && selected.length) params.append('selected', selected.join(','));
      const res = await fetch(`${BACKEND_URL}/api/mcp_tools?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { tools: json.tools || [], error: null };
    } catch (err) {
      console.error('Error listing MCP tools', err);
      return { tools: [], error: err.message };
    }
  });

  // Add a desktop integration MCP server
  ipcMain.handle('mcp:addIntegration', async (event, { integrationId, serverScript, envVars, name } = {}) => {
    try {
      // Destination directory for MCP servers
      const npcshDir = path.join(os.homedir(), '.npcsh');
      const mcpServersDir = path.join(npcshDir, 'mcp_servers');

      // Ensure directories exist
      await fsPromises.mkdir(mcpServersDir, { recursive: true });

      // Source path (bundled with app)
      const sourcePath = path.join(appDir, 'mcp_servers', serverScript);
      const destPath = path.join(mcpServersDir, serverScript);

      // Check if source exists
      if (!fs.existsSync(sourcePath)) {
        return { error: `MCP server script not found: ${serverScript}` };
      }

      // Copy the script
      await fsPromises.copyFile(sourcePath, destPath);
      console.log(`[MCP] Copied ${serverScript} to ${destPath}`);

      // Build server path that will be added to context
      const serverPath = destPath;

      // Read current global context
      let globalContext = {};
      const globalCtxPath = path.join(npcshDir, '.ctx');
      try {
        const ctxContent = await fsPromises.readFile(globalCtxPath, 'utf-8');
        globalContext = JSON.parse(ctxContent);
      } catch (e) {
        // File doesn't exist yet, start fresh
        globalContext = {};
      }

      // Ensure mcp_servers array exists
      if (!globalContext.mcp_servers) {
        globalContext.mcp_servers = [];
      }

      // Check if this integration already exists
      const existingIndex = globalContext.mcp_servers.findIndex(s => {
        if (typeof s === 'string') return s === serverPath;
        return s.value === serverPath || s.id === integrationId;
      });

      // Create the server entry with env vars
      const serverEntry = {
        id: integrationId,
        name: name,
        value: serverPath,
        env: envVars || {}
      };

      if (existingIndex >= 0) {
        // Update existing
        globalContext.mcp_servers[existingIndex] = serverEntry;
      } else {
        // Add new
        globalContext.mcp_servers.push(serverEntry);
      }

      // Write back the context
      await fsPromises.writeFile(globalCtxPath, JSON.stringify(globalContext, null, 2), 'utf-8');
      console.log(`[MCP] Added ${name} integration to global context`);

      // Notify npcpy backend to reload context (if endpoint exists)
      try {
        await fetch(`${BACKEND_URL}/api/context/reload`, { method: 'POST' });
      } catch (e) {
        // Ignore if reload endpoint doesn't exist
      }

      return { success: true, serverPath, error: null };
    } catch (err) {
      console.error('Error adding MCP integration', err);
      return { error: err.message };
    }
  });

  // ============== Knowledge Graph Handlers ==============

  ipcMain.handle('kg:getGraphData', async (event, { generation }) => {
    const params = generation !== null ? `?generation=${generation}` : '';
    return await callBackendApi(`${BACKEND_URL}/api/kg/graph${params}`);
  });

  ipcMain.handle('kg:listGenerations', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/generations`);
  });

  ipcMain.handle('kg:getNetworkStats', async (event, { generation }) => {
    const params = generation !== null ? `?generation=${generation}` : '';

    return await callBackendApi(`${BACKEND_URL}/api/kg/network-stats${params}`);
  });

  ipcMain.handle('kg:getCooccurrenceNetwork', async (event, { generation, minCooccurrence = 2 }) => {
    const params = new URLSearchParams();
    if (generation !== null) params.append('generation', generation);
    params.append('min_cooccurrence', minCooccurrence);
    return await callBackendApi(`${BACKEND_URL}/api/kg/cooccurrence?${params.toString()}`);
  });

  ipcMain.handle('kg:getCentralityData', async (event, { generation }) => {
    const params = generation !== null ? `?generation=${generation}` : '';
    return await callBackendApi(`${BACKEND_URL}/api/kg/centrality${params}`);
  });

  ipcMain.handle('kg:triggerProcess', async (event, { type }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ process_type: type }),
    });
  });

  ipcMain.handle('kg:rollback', async (event, { generation }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation }),
    });
  });

  // KG Node/Edge editing handlers
  ipcMain.handle('kg:addNode', async (event, { nodeId, nodeType = 'concept', properties = {} }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: nodeId, type: nodeType, properties }),
    });
  });

  ipcMain.handle('kg:updateNode', async (event, { nodeId, properties }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/node/${encodeURIComponent(nodeId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });
  });

  ipcMain.handle('kg:deleteNode', async (event, { nodeId }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/node/${encodeURIComponent(nodeId)}`, {
      method: 'DELETE',
    });
  });

  ipcMain.handle('kg:addEdge', async (event, { sourceId, targetId, edgeType = 'related_to', weight = 1 }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceId, target: targetId, type: edgeType, weight }),
    });
  });

  ipcMain.handle('kg:deleteEdge', async (event, { sourceId, targetId }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/edge/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
    });
  });

  // KG Search handlers
  ipcMain.handle('kg:search', async (event, { q, generation, type, limit }) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (generation !== null && generation !== undefined) params.append('generation', generation);
    if (type) params.append('type', type);
    if (limit) params.append('limit', limit);
    return await callBackendApi(`${BACKEND_URL}/api/kg/search?${params.toString()}`);
  });

  ipcMain.handle('kg:getFacts', async (event, { generation, limit, offset }) => {
    const params = new URLSearchParams();
    if (generation !== null && generation !== undefined) params.append('generation', generation);
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    return await callBackendApi(`${BACKEND_URL}/api/kg/facts?${params.toString()}`);
  });

  ipcMain.handle('kg:getConcepts', async (event, { generation, limit }) => {
    const params = new URLSearchParams();
    if (generation !== null && generation !== undefined) params.append('generation', generation);
    if (limit) params.append('limit', limit);
    return await callBackendApi(`${BACKEND_URL}/api/kg/concepts?${params.toString()}`);
  });

  ipcMain.handle('kg:search:semantic', async (event, { q, generation, limit }) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (generation !== null && generation !== undefined) params.append('generation', generation);
    if (limit) params.append('limit', limit);
    return await callBackendApi(`${BACKEND_URL}/api/kg/search/semantic?${params.toString()}`);
  });

  ipcMain.handle('kg:embed', async (event, { generation, batch_size }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation, batch_size })
    });
  });

  // ============== Memory Handlers ==============

  ipcMain.handle('memory:search', async (event, { q, npc, team, directory_path, status, limit }) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (npc) params.append('npc', npc);
    if (team) params.append('team', team);
    if (directory_path) params.append('directory_path', directory_path);
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit);
    return await callBackendApi(`${BACKEND_URL}/api/memory/search?${params.toString()}`);
  });

  ipcMain.handle('memory:pending', async (event, { npc, team, directory_path, limit }) => {
    const params = new URLSearchParams();
    if (npc) params.append('npc', npc);
    if (team) params.append('team', team);
    if (directory_path) params.append('directory_path', directory_path);
    if (limit) params.append('limit', limit);
    return await callBackendApi(`${BACKEND_URL}/api/memory/pending?${params.toString()}`);
  });

  ipcMain.handle('memory:scope', async (event, { npc, team, directory_path, status }) => {
    const params = new URLSearchParams();
    if (npc) params.append('npc', npc);
    if (team) params.append('team', team);
    if (directory_path) params.append('directory_path', directory_path);
    if (status) params.append('status', status);
    return await callBackendApi(`${BACKEND_URL}/api/memory/scope?${params.toString()}`);
  });

  ipcMain.handle('memory:approve', async (event, { approvals }) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/memory/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvals })
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[Main Process] Memory approve error:', error);
      return { error: error.message };
    }
  });

  // ============== Map (Mind Map) Handlers ==============

  ipcMain.handle('save-map', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/maps/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error saving map:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('load-map', async (event, filePath) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/maps/load?path=${encodeURIComponent(filePath)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('Error loading map:', err);
        return { error: err.message };
    }
  });

  // ============== Context Handlers ==============

  ipcMain.handle('get-global-context', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/context/global`);
  });

  ipcMain.handle('save-global-context', async (event, contextData) => {
    return await callBackendApi(`${BACKEND_URL}/api/context/global`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextData }),
    });
  });

  // Check if ~/.npcsh exists and has a valid npc_team
  ipcMain.handle('npcsh-check', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/npcsh/check`);
  });

  // Get NPCs and jinxs available in the npcsh package
  ipcMain.handle('npcsh-package-contents', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/npcsh/package-contents`);
  });

  // Initialize ~/.npcsh with default npc_team
  ipcMain.handle('npcsh-init', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/npcsh/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  ipcMain.handle('get-project-context', async (event, path) => {
    if (!path) return { error: 'Path is required' };
    const url = `${BACKEND_URL}/api/context/project?path=${encodeURIComponent(path)}`;
    return await callBackendApi(url);
  });

  ipcMain.handle('save-project-context', async (event, { path, contextData }) => {
    if (!path) return { error: 'Path is required' };
    const url = `${BACKEND_URL}/api/context/project`;
    return await callBackendApi(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, context: contextData }),
    });
  });

  ipcMain.handle('init-project-team', async (event, projectPath) => {
    if (!projectPath) return { error: 'Path is required' };
    const url = `${BACKEND_URL}/api/context/project/init`;
    return await callBackendApi(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath }),
    });
  });
}

module.exports = { register };
