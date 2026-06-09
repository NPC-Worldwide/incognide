const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const fetch = require('node-fetch');
const yaml = require('js-yaml');

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return null; }
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function register(ctx) {
  const { ipcMain, getMainWindow, callBackendApi, BACKEND_URL, log, generateId, activeStreams, appDir, dbQuery, INCOGNIDE_HOME: ctxIncognideHome } = ctx;

  const INCOGNIDE_HOME = ctxIncognideHome || path.join(os.homedir(), '.incognide');
  const INCOGNIDE_TEAM_PATH = path.join(INCOGNIDE_HOME, 'npc_team');

  (async () => {
    const destBase = INCOGNIDE_TEAM_PATH;
    const manifestPath = path.join(destBase, '.deploy_manifest.json');
    try {
      await fsPromises.mkdir(destBase, { recursive: true });

      let manifest = {};
      try {
        manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
      } catch {  }

      const newManifest = { ...manifest };
      const skippedFiles = [];

      const smartCopyRecursive = async (src, dest, relBase = '') => {
        const stat = await fsPromises.stat(src);
        if (stat.isDirectory()) {
          await fsPromises.mkdir(dest, { recursive: true });
          const entries = await fsPromises.readdir(src);
          for (const entry of entries) {
            await smartCopyRecursive(path.join(src, entry), path.join(dest, entry), relBase ? `${relBase}/${entry}` : entry);
          }
        } else {
          const relPath = relBase;
          const srcContent = await fsPromises.readFile(src);
          const srcHash = hashBuffer(srcContent);

          if (fs.existsSync(dest)) {
            const localHash = hashFile(dest);
            const lastDeployedHash = manifest[relPath];

            if (localHash === srcHash) {

              newManifest[relPath] = srcHash;
            } else if (lastDeployedHash && localHash !== lastDeployedHash) {

              skippedFiles.push(relPath);
              newManifest[relPath] = lastDeployedHash;
            } else {

              if (!lastDeployedHash && localHash !== srcHash) {

                skippedFiles.push(relPath);
              } else {
                await fsPromises.copyFile(src, dest);
                await fsPromises.chmod(dest, 0o644);
                newManifest[relPath] = srcHash;
              }
            }
          } else {

            await fsPromises.copyFile(src, dest);
            await fsPromises.chmod(dest, 0o644);
            newManifest[relPath] = srcHash;
          }
        }
      };

      const npcTeamSrc = path.join(appDir, 'npc_team');
      if (fs.existsSync(npcTeamSrc)) {
        await smartCopyRecursive(npcTeamSrc, destBase);

        // Remove deployed files that no longer exist in bundled source
        const collectSourceFiles = async (dir, relBase = '') => {
          const result = new Set();
          if (!fs.existsSync(dir)) return result;
          const entries = await fsPromises.readdir(dir);
          for (const entry of entries) {
            const full = path.join(dir, entry);
            const rel = relBase ? `${relBase}/${entry}` : entry;
            const stat = await fsPromises.stat(full);
            if (stat.isDirectory()) {
              const sub = await collectSourceFiles(full, rel);
              sub.forEach(s => result.add(s));
            } else {
              result.add(rel);
            }
          }
          return result;
        };
        const sourceFiles = await collectSourceFiles(npcTeamSrc);
        const cleanRemovedFiles = async (dir, relBase = '') => {
          if (!fs.existsSync(dir)) return;
          const entries = await fsPromises.readdir(dir);
          for (const entry of entries) {
            if (entry === '.deploy_manifest.json' || entry === '.git') continue;
            const full = path.join(dir, entry);
            const rel = relBase ? `${relBase}/${entry}` : entry;
            const stat = await fsPromises.stat(full);
            if (stat.isDirectory()) {
              await cleanRemovedFiles(full, rel);
              // Remove empty dirs
              const remaining = await fsPromises.readdir(full);
              if (remaining.length === 0) await fsPromises.rmdir(full);
            } else if (!sourceFiles.has(rel)) {
              // File exists in dest but not in source — only remove if it was deployed by us
              const lastDeployedHash = manifest[rel];
              const localHash = hashFile(full);
              if (lastDeployedHash && localHash === lastDeployedHash) {
                await fsPromises.unlink(full);
                delete newManifest[rel];
                log(`[NPC] Removed stale deployed file: ${rel}`);
              }
            }
          }
        };
        await cleanRemovedFiles(destBase);

        log(`[NPC] Smart-deployed incognide npc_team to ${destBase}`);
      }

      // MCP servers are now handled via `python -m npcpy.mcp_server --team <path>`
      // No need to deploy *_mcp_server.py scripts anymore

      await fsPromises.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));

      if (skippedFiles.length > 0) {
        log(`[NPC] Skipped ${skippedFiles.length} user-modified files: ${skippedFiles.join(', ')}`);
      }
    } catch (e) {
      console.warn('[NPC] Failed to deploy incognide npc_team:', e.message);
    }
  })();

  ipcMain.handle('getAvailableJinxes', async (event, { currentPath, npc }) => {
    try {
        const params = new URLSearchParams();
        if (currentPath) params.append('currentPath', currentPath);
        if (npc) params.append('npc', npc);

        const url = `${BACKEND_URL}/api/jinxes/available?${params.toString()}`;
        log('Fetching available jinxes from:', url);

        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        log('Received jinxes:', data.jinxes?.length);
        return data;
    } catch (err) {
        log('Error in getAvailableJinxes handler:', err);
        return { jinxes: [], error: err.message };
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

  ipcMain.handle('get-jinxes-global', async (event, globalPath) => {
    try {
        if (globalPath === 'npcsh') {
            const response = await fetch(`${BACKEND_URL}/api/jinxes/global`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return { jinxes: (data.jinxes || []).map(j => ({ ...j, source: 'npcsh' })) };
        }

        const teamPath = globalPath || INCOGNIDE_TEAM_PATH;
        const response = await fetch(`${BACKEND_URL}/api/jinxes/project?currentPath=${encodeURIComponent(teamPath)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return { jinxes: (data.jinxes || []).map(j => ({ ...j, source: globalPath ? 'custom' : 'incognide' })) };
    } catch (err) {
        console.error('Error loading global jinxes:', err);
        return { jinxes: [], error: err.message };
    }
  });

  ipcMain.handle('get-jinxes-project', async (event, currentPath) => {
    try {
        const url = `${BACKEND_URL}/api/jinxes/project?currentPath=${encodeURIComponent(currentPath)}`;
        console.log('Fetching project jinxes from URL:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Project jinxes data:', data);
        return data;
    } catch (err) {
        console.error('Error loading project jinxes:', err);
        return { jinxes: [], error: err.message };
    }
  });

  ipcMain.handle('save-jinx', async (event, data) => {
    try {
        if (data.globalPath !== 'npcsh' && !data.currentPath) {
            data.currentPath = data.globalPath || INCOGNIDE_TEAM_PATH;
        }
        delete data.globalPath;
        const response = await fetch(`${BACKEND_URL}/api/jinxes/save`, {
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

  ipcMain.handle('ingest-jinx', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/jinxes/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error('Error ingesting jinx:', err);
        return { error: err.message };
    }
  });

  ipcMain.handle('delete-jinx', async (event, data) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/jinxes/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      return json;
    } catch (err) {
      console.error('Error deleting jinx:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('import-npc-team', async (event, data) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/npc-team/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      return json;
    } catch (err) {
      console.error('Error importing NPC team:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('get-jinxes-all-teams', async (event, currentPath) => {
    try {
      // Read teams.yaml to fetch jinxes from all of them
      let registeredTeams = {};
      try {
        const teamsYaml = require('js-yaml');
        const teamsPath = path.join(INCOGNIDE_HOME, 'teams.yaml');
        const content = await fsPromises.readFile(teamsPath, 'utf8');
        const parsed = teamsYaml.load(content);
        registeredTeams = parsed?.teams || {};
      } catch {}

      const fetchPromises = [];

      // Always include project jinxes
      if (currentPath) {
        fetchPromises.push(
          fetch(`${BACKEND_URL}/api/jinxes/project?currentPath=${encodeURIComponent(currentPath)}`)
            .then(r => r.ok ? r.json() : { jinxes: [] })
            .then(data => ({ key: 'project', data }))
            .catch(() => ({ key: 'project', data: { jinxes: [] } }))
        );
      }

      // Fetch jinxes from each registered team
      for (const [teamKey, teamPathRaw] of Object.entries(registeredTeams)) {
        const teamPath = String(teamPathRaw || '').replace(/^~(?=\/|$)/, os.homedir());
        if (!teamPath) continue;
        fetchPromises.push(
          fetch(`${BACKEND_URL}/api/jinxes/project?currentPath=${encodeURIComponent(teamPath)}`)
            .then(r => r.ok ? r.json() : { jinxes: [] })
            .then(data => ({ key: teamKey, data }))
            .catch(() => ({ key: teamKey, data: { jinxes: [] } }))
        );
      }

      const results = await Promise.all(fetchPromises);
      const response = {};
      for (const result of results) {
        const jinxes = (result.data?.jinxes || []).map(j => ({
          ...j,
          team: result.key,
          scope: result.key === 'project' ? 'project' : 'global',
        }));
        response[result.key] = jinxes;
      }

      return { ...response, error: null };
    } catch (err) {
      console.error('Error loading all teams jinxes:', err);
      return { project: [], error: err.message };
    }
  });

  ipcMain.handle('save-npc', async (event, data) => {
    try {

        if (data.globalPath !== 'npcsh' && !data.currentPath) {
            data.currentPath = data.globalPath || INCOGNIDE_TEAM_PATH;
        }
        delete data.globalPath;
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

  const normalizeJinxes = (jinxes) => {
    if (!Array.isArray(jinxes)) return [];
    return jinxes.map(j => {
      if (typeof j === 'string') return j;
      if (typeof j === 'object' && j !== null) {
        // Handle template objects like { "Jinx('open_pane')": null }
        const keys = Object.keys(j);
        for (const k of keys) {
          const match = k.match(/Jinx\(['"]([^'"]+)['"]\)/);
          if (match) return match[1];
        }
        // Fallback: use the key itself if it looks like a name
        if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length < 100) return keys[0];
        if (j.name) return j.name;
      }
      return String(j);
    }).filter(j => j && j !== '[object Object]');
  };

  const readNPCTeamFromDir = async (teamDir, source) => {
    try {
      const entries = await fsPromises.readdir(teamDir);
      const npcs = [];
      for (const entry of entries) {
        if (!entry.endsWith('.npc')) continue;
        try {
          const content = await fsPromises.readFile(path.join(teamDir, entry), 'utf8');
          const parsed = yaml.load(content);
          if (parsed && parsed.name) {
            npcs.push({
              ...parsed,
              jinxes: normalizeJinxes(parsed.jinxes),
              source,
              source_path: path.join(teamDir, entry),
              source_ext: '.npc',
              team: source,
            });
          }
        } catch (e) {
          // skip unreadable .npc files
        }
      }
      return npcs;
    } catch {
      return [];
    }
  };

  ipcMain.handle('getNPCTeamGlobal', async (event, globalPath) => {
    try {
      // Resolve team key to path from teams.yaml
      if (globalPath) {
        try {
          const teamsPath = path.join(INCOGNIDE_HOME, 'teams.yaml');
          const content = await fsPromises.readFile(teamsPath, 'utf8');
          const parsed = yaml.load(content);
          const teams = parsed?.teams || {};
          if (teams[globalPath]) {
            const resolved = String(teams[globalPath]).replace(/^~(?=\/|$)/, os.homedir());
            const npcs = await readNPCTeamFromDir(resolved, globalPath);
            return { npcs };
          }
        } catch {}
      }
      // Fallback: no YAML or key not found
      const teamDir = INCOGNIDE_TEAM_PATH;
      const npcs = await readNPCTeamFromDir(teamDir, globalPath || 'incognide');
      return { npcs };
    } catch (error) {
      console.error('Error reading NPC team:', error);
      throw error;
    }
  });

  ipcMain.handle('getNPCTeamProject', async (event, currentPath) => {
    try {
      if (!currentPath || typeof currentPath !== 'string') {
        throw new Error('Invalid currentPath provided');
      }
      const projectTeamDir = path.join(currentPath, 'npc_team');
      const npcs = await readNPCTeamFromDir(projectTeamDir, 'project');
      return { npcs };
    } catch (error) {
      console.error('Error reading NPC team:', error);
      return { npcs: [], error: error.message };
    }
  });

  ipcMain.handle('deploy-incognide-team', async () => {
    const destBase = INCOGNIDE_TEAM_PATH;
    const manifestPath = path.join(destBase, '.deploy_manifest.json');
    try {
      await fsPromises.mkdir(destBase, { recursive: true });
      const npcTeamSrc = path.join(appDir, 'npc_team');
      const newManifest = {};
      if (fs.existsSync(npcTeamSrc)) {
        const copyAndTrack = async (src, dest, relBase = '') => {
          const stat = await fsPromises.stat(src);
          if (stat.isDirectory()) {
            await fsPromises.mkdir(dest, { recursive: true });
            const entries = await fsPromises.readdir(src);
            for (const entry of entries) {
              await copyAndTrack(path.join(src, entry), path.join(dest, entry), relBase ? `${relBase}/${entry}` : entry);
            }
          } else {
            await fsPromises.copyFile(src, dest);
            newManifest[relBase] = hashFile(dest);
          }
        };
        await copyAndTrack(npcTeamSrc, destBase);
        await fsPromises.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));
        log(`[NPC] Force re-deployed incognide npc_team to ${destBase}`);
        return { success: true };
      }
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('npc-team:compare-bundled', async () => {
    const destBase = INCOGNIDE_TEAM_PATH;
    const manifestPath = path.join(destBase, '.deploy_manifest.json');
    try {
      let manifest = {};
      try { manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8')); } catch {}

      const npcTeamSrc = path.join(appDir, 'npc_team');
      const mcpSrc = path.join(appDir, 'mcp_servers');
      const results = [];

      const bundledFiles = {};
      const collectBundled = async (src, relBase = '') => {
        if (!fs.existsSync(src)) return;
        const stat = await fsPromises.stat(src);
        if (stat.isDirectory()) {
          const entries = await fsPromises.readdir(src);
          for (const entry of entries) {
            await collectBundled(path.join(src, entry), relBase ? `${relBase}/${entry}` : entry);
          }
        } else {
          bundledFiles[relBase] = hashFile(src);
        }
      };
      await collectBundled(npcTeamSrc);
      // MCP servers are now handled via npcpy.mcp_server module — no deployed scripts to diff

      const localFiles = {};
      const collectLocal = async (dir, relBase = '') => {
        if (!fs.existsSync(dir)) return;
        const entries = await fsPromises.readdir(dir);
        for (const entry of entries) {
          if (entry === '.deploy_manifest.json' || entry === '.git') continue;
          const fullPath = path.join(dir, entry);
          const stat = await fsPromises.stat(fullPath);
          const rel = relBase ? `${relBase}/${entry}` : entry;
          if (stat.isDirectory()) {
            await collectLocal(fullPath, rel);
          } else {
            localFiles[rel] = hashFile(fullPath);
          }
        }
      };
      await collectLocal(destBase);

      const allFiles = new Set([...Object.keys(bundledFiles), ...Object.keys(localFiles)]);
      for (const file of allFiles) {
        const bundledHash = bundledFiles[file];
        const localHash = localFiles[file];
        const lastDeployedHash = manifest[file];

        if (bundledHash && !localHash) {
          results.push({ file, status: 'new-from-app' });
        } else if (!bundledHash && localHash) {
          results.push({ file, status: 'local-only' });
        } else if (bundledHash === localHash) {
          results.push({ file, status: 'up-to-date' });
        } else {

          const userModified = lastDeployedHash && localHash !== lastDeployedHash;
          const appUpdated = lastDeployedHash && bundledHash !== lastDeployedHash;
          if (userModified && appUpdated) {
            results.push({ file, status: 'both-changed' });
          } else if (userModified) {
            results.push({ file, status: 'user-modified' });
          } else if (appUpdated || !lastDeployedHash) {
            results.push({ file, status: 'app-updated' });
          } else {
            results.push({ file, status: 'up-to-date' });
          }
        }
      }

      return { success: true, files: results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('npc-team:accept-bundled', async (event, { filePath }) => {
    const destBase = INCOGNIDE_TEAM_PATH;
    const manifestPath = path.join(destBase, '.deploy_manifest.json');
    try {

      const npcTeamSrc = path.join(appDir, 'npc_team');
      let srcPath = path.join(npcTeamSrc, filePath);
      if (!fs.existsSync(srcPath)) {
        srcPath = path.join(appDir, 'mcp_servers', filePath);
      }
      if (!fs.existsSync(srcPath)) return { error: `Bundled file not found: ${filePath}` };

      const destPath = path.join(destBase, filePath);
      await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
      await fsPromises.copyFile(srcPath, destPath);

      let manifest = {};
      try { manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8')); } catch {}
      manifest[filePath] = hashFile(destPath);
      await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('npc-team:bundled-diff', async (event, { filePath }) => {
    const destBase = INCOGNIDE_TEAM_PATH;
    try {
      const npcTeamSrc = path.join(appDir, 'npc_team');
      let srcPath = path.join(npcTeamSrc, filePath);
      if (!fs.existsSync(srcPath)) srcPath = path.join(appDir, 'mcp_servers', filePath);

      const localPath = path.join(destBase, filePath);
      const bundledContent = fs.existsSync(srcPath) ? await fsPromises.readFile(srcPath, 'utf8') : null;
      const localContent = fs.existsSync(localPath) ? await fsPromises.readFile(localPath, 'utf8') : null;

      return { success: true, bundledContent, localContent };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('npc-team:sync-status', async (event, globalPath) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const response = await fetch(`${BACKEND_URL}/api/npc-team/status?team_path=${teamPath}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { status: 'unavailable', error: err.message };
    }
  });

  ipcMain.handle('npc-team:sync-init', async (event, globalPath) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const response = await fetch(`${BACKEND_URL}/api/npc-team/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_path: teamPath })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('npc-team:sync-pull', async (event, globalPath) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const response = await fetch(`${BACKEND_URL}/api/npc-team/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_path: teamPath })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('npc-team:sync-resolve', async (event, { filePath, resolution, content, globalPath }) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const response = await fetch(`${BACKEND_URL}/api/npc-team/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath, resolution, content, team_path: teamPath })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('npc-team:sync-commit', async (event, { message, globalPath }) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const response = await fetch(`${BACKEND_URL}/api/npc-team/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, team_path: teamPath })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('npc-team:sync-diff', async (event, { filePath, globalPath }) => {
    try {
      const teamPath = globalPath === 'npcsh' ? 'npcsh' : 'incognide';
      const params = `?team_path=${teamPath}${filePath ? `&file=${encodeURIComponent(filePath)}` : ''}`;
      const response = await fetch(`${BACKEND_URL}/api/npc-team/diff${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  });

  async function fetchCtxMcpServers(currentPath) {
    const servers = new Map();
    const addServer = (entry, origin) => {
      if (!entry) return;
      const isObj = typeof entry === 'object' && entry !== null;
      const serverPath = isObj ? entry.value : entry;
      if (serverPath && !servers.has(serverPath)) {
        const info = { serverPath, origin };
        if (isObj) {
          if (entry.env) info.env = entry.env;
          if (entry.name) info.name = entry.name;
          if (entry.id) info.id = entry.id;
        }
        servers.set(serverPath, info);
      }
    };

    // Load teams from frontend config
    let registeredTeamPaths = [];
    try {
      const teamsContent = await fsPromises.readFile(path.join(INCOGNIDE_HOME, 'teams.yaml'), 'utf8');
      const teamsParsed = yaml.load(teamsContent);
      for (const teamPath of Object.values(teamsParsed?.teams || {})) {
        const tp = String(teamPath || '').replace(/^~(?=\/|$)/, os.homedir());
        if (tp) registeredTeamPaths.push(tp);
      }
    } catch {}

    // Load servers from backend context endpoints
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

    // Load team servers from backend npc_tools endpoint using registered teams
    try {
      const params = new URLSearchParams();
      if (currentPath) params.append('currentPath', currentPath);
      if (registeredTeamPaths.length) params.append('registered_teams', registeredTeamPaths.join(','));
      const teamRes = await fetch(`${BACKEND_URL}/api/npc_tools?${params.toString()}`);
      const teamJson = await teamRes.json();
      for (const srv of (teamJson.team_servers || [])) {
        const serverPath = srv.path || srv.url || '';
        if (serverPath && !servers.has(serverPath)) {
          const ctxLabel = srv.label || serverPath;
          servers.set(serverPath, {
            serverPath,
            origin: 'auto:team',
            name: ctxLabel,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load team servers from backend', e.message);
    }

    return Array.from(servers.values());
  }

  ipcMain.handle('mcp:getServers', async (event, { currentPath } = {}) => {
    try {
      const serverList = await fetchCtxMcpServers(currentPath);
      const statuses = [];
      for (const serverInfo of serverList) {
        const { serverPath, origin, env, name, id } = serverInfo;
        try {
          const statusRes = await fetch(`${BACKEND_URL}/api/mcp/server/status?serverPath=${encodeURIComponent(serverPath)}${currentPath ? `&currentPath=${encodeURIComponent(currentPath)}` : ''}`);
          const statusJson = await statusRes.json();
          statuses.push({
            serverPath, origin, name, id, env,
            status: statusJson.status || (statusJson.running ? 'running' : 'unknown'),
            pid: statusJson.pid,
            details: statusJson,
          });
        } catch (err) {
          statuses.push({ serverPath, origin, name, id, env, status: 'error', error: err.message });
        }
      }
      return { servers: statuses, error: null };
    } catch (err) {
      console.error('Error in mcp:getServers', err);
      return { servers: [], error: err.message };
    }
  });

  ipcMain.handle('mcp:getServersForSidebar', async (event, currentPath) => {
    try {
      const ctxServers = await fetchCtxMcpServers(currentPath);
      // Filter out servers pointing to old ~/.npcsh/incognide/ path (migrated to ~/.incognide/)
      const oldIncognidePath = path.join(os.homedir(), '.npcsh', 'incognide');
      const servers = ctxServers
        .filter(s => !s.serverPath.includes(oldIncognidePath))
        .map(s => ({
        id: s.id || s.serverPath,
        name: s.name || s.serverPath,
        command: s.serverPath,
        origin: s.origin,
        status: 'unknown',
      }));

      // Also read .mcp*.json from team directories
      let registeredTeams = {};
      try {
        const teamsContent = await fsPromises.readFile(path.join(INCOGNIDE_HOME, 'teams.yaml'), 'utf8');
        const teamsParsed = yaml.load(teamsContent);
        registeredTeams = teamsParsed?.teams || {};
      } catch {}

      for (const [key, teamPathRaw] of Object.entries(registeredTeams)) {
        const teamPath = String(teamPathRaw || '').replace(/^~(?=\/|$)/, os.homedir());
        if (!teamPath) continue;

        try {
          const entries = await fsPromises.readdir(teamPath);
          const mcpFiles = entries.filter(f =>
            f === '.mcp.json' || f === '.mcp_servers.json' || f === 'mcp_servers.json'
          );
          for (const mcpFile of mcpFiles) {
            try {
              const content = await fsPromises.readFile(path.join(teamPath, mcpFile), 'utf8');
              const parsed = JSON.parse(content);
              const mcpServers = parsed.mcpServers || parsed.mcp_servers || {};
              for (const [srvName, srvConfig] of Object.entries(mcpServers)) {
                const cfg = srvConfig;
                const command = [cfg.command, ...(cfg.args || [])].join(' ');
                servers.push({
                  id: `${key}:${srvName}`,
                  name: srvName,
                  command,
                  origin: key,
                  status: 'unknown',
                  env: cfg.env || {},
                });
              }
            } catch {}
          }
        } catch {}
      }

      return { servers, error: null };
    } catch (err) {
      console.error('Error in mcp:getServersForSidebar', err);
      return { servers: [], error: err.message };
    }
  });

  ipcMain.handle('mcp:startServer', async (event, { serverPath, currentPath, envVars } = {}) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/mcp/server/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverPath, currentPath, envVars })
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
    if (!serverPath) return { tools: [], error: null };
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

  ipcMain.handle('mcp:addIntegration', async (event, { integrationId, serverScript, envVars, name } = {}) => {
    try {

      const incognideDir = ctx.INCOGNIDE_HOME || path.join(os.homedir(), '.incognide');
      const mcpServersDir = path.join(incognideDir, 'mcp_servers');

      await fsPromises.mkdir(mcpServersDir, { recursive: true });

      const sourcePath = path.join(appDir, 'mcp_servers', serverScript);
      const destPath = path.join(mcpServersDir, serverScript);

      if (!fs.existsSync(sourcePath)) {
        return { error: `MCP server script not found: ${serverScript}` };
      }

      await fsPromises.copyFile(sourcePath, destPath);
      console.log(`[MCP] Copied ${serverScript} to ${destPath}`);

      const serverPath = destPath;

      let globalContext = {};
      const globalCtxPath = path.join(incognideDir, '.ctx');
      try {
        const ctxContent = await fsPromises.readFile(globalCtxPath, 'utf-8');
        globalContext = JSON.parse(ctxContent);
      } catch (e) {

        globalContext = {};
      }

      if (!globalContext.mcp_servers) {
        globalContext.mcp_servers = [];
      }

      const existingIndex = globalContext.mcp_servers.findIndex(s => {
        if (typeof s === 'string') return s === serverPath;
        return s.value === serverPath || s.id === integrationId;
      });

      const serverEntry = {
        id: integrationId,
        name: name,
        value: serverPath,
        env: envVars || {}
      };

      if (existingIndex >= 0) {

        globalContext.mcp_servers[existingIndex] = serverEntry;
      } else {

        globalContext.mcp_servers.push(serverEntry);
      }

      await fsPromises.writeFile(globalCtxPath, JSON.stringify(globalContext, null, 2), 'utf-8');
      console.log(`[MCP] Added ${name} integration to global context`);

      try {
        await fetch(`${BACKEND_URL}/api/context/reload`, { method: 'POST' });
      } catch (e) {

      }

      return { success: true, serverPath, error: null };
    } catch (err) {
      console.error('Error adding MCP integration', err);
      return { error: err.message };
    }
  });

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

  ipcMain.handle('kg:ingest', async (event, { content, context, get_concepts, link_concepts_facts }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, context, get_concepts, link_concepts_facts })
    });
  });

  ipcMain.handle('kg:query', async (event, args) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    });
  });

  ipcMain.handle('kg:population:list', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/populations`);
  });

  ipcMain.handle('kg:population:create', async (event, args) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    });
  });

  ipcMain.handle('kg:population:get', async (event, id) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population/${encodeURIComponent(id)}`);
  });

  ipcMain.handle('kg:population:delete', async (event, id) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  });

  ipcMain.handle('kg:population:evolve', async (event, id) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population/${encodeURIComponent(id)}/evolve`, {
      method: 'POST'
    });
  });

  ipcMain.handle('kg:individual:get', async (event, { populationId, individualId }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population/${encodeURIComponent(populationId)}/individual/${encodeURIComponent(individualId)}`);
  });

  ipcMain.handle('kg:individual:updateGenome', async (event, { populationId, individualId, genome }) => {
    return await callBackendApi(`${BACKEND_URL}/api/kg/population/${encodeURIComponent(populationId)}/individual/${encodeURIComponent(individualId)}/genome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genome || {})
    });
  });

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

  ipcMain.handle('activity:log', async (event, data) => {
    try {
      await dbQuery(
        `CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, activity_type TEXT, activity_data TEXT, timestamp TEXT, npc TEXT, session_id TEXT)`
      );
      await dbQuery(
        `INSERT INTO activity_log (activity_type, activity_data, timestamp, npc, session_id) VALUES (?, ?, ?, ?, ?)`,
        [data.type, JSON.stringify(data.data || {}), new Date().toISOString(), data.npc || null, data.sessionId || null]
      );
      return { success: true };
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('activity:list', async (event, data = {}) => {
    const params = new URLSearchParams();
    if (data.type) params.append('type', data.type);
    if (data.limit) params.append('limit', data.limit);
    if (data.directoryPath) params.append('directoryPath', data.directoryPath);
    if (data.sessionId) params.append('sessionId', data.sessionId);
    return await callBackendApi(`${BACKEND_URL}/api/activity/list?${params.toString()}`);
  });

  ipcMain.handle('autocomplete:log', async (event, data) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/autocomplete/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return await res.json();
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('autocomplete:stats', async (event, data = {}) => {
    const params = new URLSearchParams();
    if (data.type) params.append('type', data.type);
    if (data.npc) params.append('npc', data.npc);
    return await callBackendApi(`${BACKEND_URL}/api/autocomplete/stats?${params.toString()}`);
  });

  ipcMain.handle('autocomplete:training', async (event, data = {}) => {
    const params = new URLSearchParams();
    if (data.type) params.append('type', data.type);
    if (data.acceptedOnly) params.append('acceptedOnly', 'true');
    if (data.limit) params.append('limit', data.limit);
    return await callBackendApi(`${BACKEND_URL}/api/autocomplete/training?${params.toString()}`);
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

  async function findCtxFile(teamDir) {
    try {
      const files = await fsPromises.readdir(teamDir);
      const ctxFile = files.find(f => f.endsWith('.ctx'));
      if (ctxFile) return path.join(teamDir, ctxFile);
    } catch (e) {  }
    return null;
  }

  ipcMain.handle('get-global-context', async (event, globalPath) => {
    if (globalPath === 'npcsh') {
      return await callBackendApi(`${BACKEND_URL}/api/context/global`);
    }

    const teamDir = globalPath || INCOGNIDE_TEAM_PATH;
    const ctxFilePath = await findCtxFile(teamDir);
    if (!ctxFilePath) return { context: {}, error: null };
    try {
      const content = await fsPromises.readFile(ctxFilePath, 'utf-8');
      const context = yaml.load(content) || {};
      return { context, path: ctxFilePath, error: null };
    } catch (err) {
      return { context: {}, error: err.message };
    }
  });

  ipcMain.handle('save-global-context', async (event, contextData, globalPath) => {
    if (globalPath === 'npcsh') {
      return await callBackendApi(`${BACKEND_URL}/api/context/global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: contextData }),
      });
    }

    const teamDir = globalPath || INCOGNIDE_TEAM_PATH;
    let ctxFilePath = await findCtxFile(teamDir);
    if (!ctxFilePath) ctxFilePath = path.join(teamDir, 'incognide.ctx');
    try {
      const content = yaml.dump(contextData);
      await fsPromises.writeFile(ctxFilePath, content, 'utf-8');
      return { success: true, error: null };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('npcsh-check', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/npcsh/check`);
  });

  ipcMain.handle('npcsh-package-contents', async () => {
    return await callBackendApi(`${BACKEND_URL}/api/npcsh/package-contents`);
  });

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
