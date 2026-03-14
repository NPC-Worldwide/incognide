/**
 * web-preload.js — Browser-side script that creates `window.api` with the
 * same interface as the Electron preload.js, using fetch() and WebSocket
 * instead of ipcRenderer.invoke().
 *
 * Include this script before the app bundle:
 *   <script src="/web-preload.js"></script>
 *
 * Or import it in your entry point:
 *   import './web-preload';
 */

(function () {
  'use strict';

  // Skip if window.api already exists (running in Electron)
  if (window.api) return;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const API_BASE = window.__INCOGNIDE_API_BASE || '';
  const WS_URL =
    window.__INCOGNIDE_WS_URL ||
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

  // ---------------------------------------------------------------------------
  // WebSocket connection with auto-reconnect
  // ---------------------------------------------------------------------------

  let ws = null;
  let wsId = null;
  let wsReady = false;
  let wsReconnectTimer = null;
  const wsListeners = new Map(); // channel -> Set<callback>
  const wsPendingRequests = new Map(); // requestId -> { resolve, reject }
  let requestIdCounter = 0;

  function connectWs() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('[web-preload] WebSocket connection failed:', err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[web-preload] WebSocket connected');
      wsReady = true;
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const { channel, data } = msg;

      // Handle server-assigned WS ID
      if (channel === '__ws_id' && data && data.id) {
        wsId = data.id;
        return;
      }

      // Handle IPC response to a WS-initiated call
      if (channel === '__ipc_response' && data && data.requestId) {
        const pending = wsPendingRequests.get(data.requestId);
        if (pending) {
          wsPendingRequests.delete(data.requestId);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
        return;
      }

      // Dispatch to registered listeners
      if (channel) {
        const listeners = wsListeners.get(channel);
        if (listeners) {
          for (const cb of listeners) {
            try {
              cb(data);
            } catch (err) {
              console.error(`[web-preload] Error in listener for ${channel}:`, err);
            }
          }
        }
      }
    };

    ws.onclose = () => {
      wsReady = false;
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[web-preload] WebSocket error:', err);
    };
  }

  function scheduleReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      connectWs();
    }, 2000);
  }

  // Subscribe to a WS push channel
  function wsSubscribe(channel) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }

  // Unsubscribe from a WS push channel
  function wsUnsubscribe(channel) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }

  // Register a listener for a push channel. Returns an unsubscribe function.
  function onChannel(channel, callback) {
    if (!wsListeners.has(channel)) {
      wsListeners.set(channel, new Set());
      wsSubscribe(channel);
    }
    wsListeners.get(channel).add(callback);

    return () => {
      const set = wsListeners.get(channel);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          wsListeners.delete(channel);
          wsUnsubscribe(channel);
        }
      }
    };
  }

  // Invoke an IPC handler via WebSocket (for streaming ops)
  function wsInvoke(channel, ...args) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const requestId = `req_${++requestIdCounter}_${Date.now()}`;
      wsPendingRequests.set(requestId, { resolve, reject });

      ws.send(
        JSON.stringify({
          channel,
          args: args.length === 1 ? args[0] : args.length === 0 ? undefined : args,
          requestId,
        })
      );

      // Timeout after 120 seconds
      setTimeout(() => {
        if (wsPendingRequests.has(requestId)) {
          wsPendingRequests.delete(requestId);
          reject(new Error(`WS invoke timeout for channel: ${channel}`));
        }
      }, 120000);
    });
  }

  // Connect immediately
  connectWs();

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  /** Invoke a single-arg IPC handler via REST */
  async function invoke(channel, arg) {
    const headers = { 'Content-Type': 'application/json' };
    if (wsId) headers['X-WS-Id'] = wsId;

    const body = arg !== undefined ? JSON.stringify(arg) : '{}';

    const response = await fetch(`${API_BASE}/api/ipc/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    // Handle binary responses
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/octet-stream')) {
      return await response.arrayBuffer();
    }

    return await response.json();
  }

  /** Invoke a multi-arg IPC handler via REST */
  async function invokeMulti(channel, ...args) {
    const headers = { 'Content-Type': 'application/json' };
    if (wsId) headers['X-WS-Id'] = wsId;

    const response = await fetch(`${API_BASE}/api/ipc-multi/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/octet-stream')) {
      return await response.arrayBuffer();
    }

    return await response.json();
  }

  /**
   * Invoke a streaming IPC handler — uses WebSocket so that stream-data,
   * stream-complete, stream-error events are received via the WS connection.
   */
  async function invokeStreaming(channel, arg) {
    // For streaming, we prefer WebSocket invocation so the fake event.sender
    // targets our specific client
    if (ws && ws.readyState === WebSocket.OPEN) {
      return wsInvoke(channel, arg);
    }
    // Fallback to HTTP (stream events will be broadcast)
    return invoke(channel, arg);
  }

  // ---------------------------------------------------------------------------
  // Build window.api — mirrors preload.js exactly
  // ---------------------------------------------------------------------------

  const BACKEND_URL = `${API_BASE}`;

  window.api = {
    // ==================== Chat / Streaming ====================
    textPredict: (data) => invokeStreaming('text-predict', data),

    // ==================== File I/O ====================
    readCsvContent: (filePath) => invoke('read-csv-content', filePath),
    readFileBuffer: (filePath) => invoke('read-file-buffer', filePath),
    readDocxContent: (filePath) => invoke('read-docx-content', filePath),
    readFile: (filePath) => invoke('read-file-buffer', filePath),
    readFileContent: (filePath) => invoke('read-file-content', filePath),
    writeFileContent: (filePath, content) => invokeMulti('write-file-content', filePath, content),
    writeDocxContent: (filePath, html, opts) => invokeMulti('write-docx-content', filePath, html, opts),
    watchFile: (filePath) => invoke('file:watch', filePath),
    unwatchFile: (filePath) => invoke('file:unwatch', filePath),
    onFileChanged: (callback) => onChannel('file:changed', callback),
    deleteFile: (filePath) => invoke('delete-file', filePath),
    zipItems: (itemPaths, zipName) => invokeMulti('zip-items', itemPaths, zipName),
    readZipContents: (zipPath) => invoke('read-zip-contents', zipPath),
    extractZip: (zipPath, targetDir, entryPath) => invokeMulti('extract-zip', zipPath, targetDir, entryPath),
    renameFile: (oldPath, newPath) => invokeMulti('renameFile', oldPath, newPath),
    copyFile: (srcPath, destPath) => invokeMulti('copy-file', srcPath, destPath),
    chmod: (options) => invoke('chmod', options),
    chown: (options) => invoke('chown', options),
    getFileStats: (filePath) => invoke('getFileStats', filePath),
    lintFile: (opts) => invoke('lintFile', opts),
    openFile: (path) => invoke('open-file', path),
    writeFileBuffer: (path, uint8) => invokeMulti('write-file-buffer', path, uint8),
    compileLatex: (path, opts) => invokeMulti('compile-latex', path, opts),
    fileExists: (path) => invoke('file-exists', path),

    // ==================== Directory ====================
    getDefaultConfig: () => invoke('getDefaultConfig'),
    getProjectCtx: (currentPath) => invoke('getProjectCtx', currentPath),
    readDirectoryStructure: (dirPath) => invoke('readDirectoryStructure', dirPath),
    goUpDirectory: (currentPath) => invoke('goUpDirectory', currentPath),
    readDirectory: (dirPath) => invoke('readDirectory', dirPath),
    ensureDir: (dirPath) => invoke('ensureDirectory', dirPath),
    ensureDirectory: (dirPath) => invoke('ensureDirectory', dirPath),
    getHomeDir: () => invoke('getHomeDir'),
    getNpcshHome: () => invoke('getNpcshHome'),
    readDirectoryImages: (dirPath) => invoke('readDirectoryImages', dirPath),
    open_directory_picker: () => invoke('open_directory_picker'),
    createDirectory: (path) => invoke('create-directory', path),
    deleteDirectory: (path) => invoke('delete-directory', path),
    getDirectoryContentsRecursive: (path) => invoke('get-directory-contents-recursive', path),
    searchFiles: (data) => invoke('search-files', data),
    analyzeDiskUsage: (path) => invoke('analyze-disk-usage', path),
    saveTempFile: (args) => invoke('save-temp-file', args),
    executeCode: (args) => invoke('executeCode', args),
    saveGeneratedImage: (blob, folderPath, filename) => invokeMulti('save-generated-image', blob, folderPath, filename),

    // ==================== Jinxes ====================
    getAvailableJinxes: (params) => invoke('getAvailableJinxes', params),
    executeJinx: (params) => invoke('executeJinx', params),

    // ==================== Models / Images ====================
    getAvailableImageModels: (currentPath) => invoke('getAvailableImageModels', currentPath),
    generateImages: (prompt, n, model, provider, attachments, baseFilename, currentPath) =>
      invoke('generate_images', { prompt, n, model, provider, attachments, baseFilename, currentPath }),
    getAvailableModels: (currentPath) => invoke('getAvailableModels', currentPath),

    // ==================== Cron / Daemons ====================
    getCronJobs: () => invoke('getCronJobs'),
    scheduleJob: (params) => invoke('scheduleJob', params),
    unscheduleJob: (jobName) => invoke('unscheduleJob', jobName),
    jobStatus: (jobName) => invoke('jobStatus', jobName),
    getCrontab: () => invoke('getCrontab'),
    getSystemDaemons: () => invoke('getSystemDaemons'),
    getServiceInfo: (unit) => invoke('getServiceInfo', unit),
    addDaemon: (params) => invoke('addDaemon', params),
    removeDaemon: (daemonId) => invoke('removeDaemon', daemonId),
    getDaemons: () => invoke('getDaemons'),

    // ==================== Window ====================
    openNewWindow: (path) => invoke('open-new-window', path),
    getWindowCount: () => invoke('get-window-count'),
    getAllWindowsInfo: () => invoke('get-all-windows-info'),
    closeWindowById: (windowId) => invoke('close-window-by-id', windowId),
    openInNativeExplorer: (path) => invoke('open-in-native-explorer', path),
    closeWindow: () => invoke('close-window'),
    showItemInFolder: (path) => invoke('show-item-in-folder', path),

    // ==================== Conversations ====================
    deleteConversation: (id) => invoke('deleteConversation', id),
    getConversations: (path) => invoke('getConversations', path),
    getConversationsInDirectory: (path) => invoke('getConversationsInDirectory', path),
    getConversationMessages: (id) => invoke('getConversationMessages', id),
    createConversation: (data) => invoke('createConversation', data),
    sendMessage: (data) => invoke('sendMessage', data),
    deleteMessage: (params) => invoke('deleteMessage', params),
    searchConversations: (data) => invoke('search-conversations', data),
    getLastUsedInDirectory: (path) => invoke('get-last-used-in-directory', path),
    getLastUsedInConversation: (conversationId) => invoke('get-last-used-in-conversation', conversationId),

    // ==================== Screenshots ====================
    waitForScreenshot: (path) => invoke('wait-for-screenshot', path),

    // ==================== NPC ====================
    saveNPC: (data) => invoke('save-npc', data),
    getNPCTeamProject: (currentPath) => invoke('getNPCTeamProject', currentPath),
    getNPCTeamGlobal: (globalPath) => invoke('getNPCTeamGlobal', globalPath),

    // ==================== Git ====================
    gitStatus: (repoPath) => invoke('gitStatus', repoPath),
    gitStageFile: (repoPath, file) => invokeMulti('gitStageFile', repoPath, file),
    gitUnstageFile: (repoPath, file) => invokeMulti('gitUnstageFile', repoPath, file),
    gitCommit: (repoPath, message) => invokeMulti('gitCommit', repoPath, message),
    gitPull: (repoPath) => invoke('gitPull', repoPath),
    gitPush: (repoPath) => invoke('gitPush', repoPath),
    gitPushSetUpstream: (repoPath, branch) => invokeMulti('gitPushSetUpstream', repoPath, branch),
    gitSetAutoSetupRemote: () => invoke('gitSetAutoSetupRemote'),
    gitDiff: (repoPath, filePath, staged) => invokeMulti('gitDiff', repoPath, filePath, staged),
    gitDiffAll: (repoPath) => invoke('gitDiffAll', repoPath),
    gitBlame: (repoPath, filePath) => invokeMulti('gitBlame', repoPath, filePath),
    gitBranches: (repoPath) => invoke('gitBranches', repoPath),
    gitCreateBranch: (repoPath, branchName) => invokeMulti('gitCreateBranch', repoPath, branchName),
    gitCheckout: (repoPath, branchName) => invokeMulti('gitCheckout', repoPath, branchName),
    gitDeleteBranch: (repoPath, branchName, force) => invokeMulti('gitDeleteBranch', repoPath, branchName, force),
    gitLog: (repoPath, options) => invokeMulti('gitLog', repoPath, options),
    gitShowCommit: (repoPath, commitHash) => invokeMulti('gitShowCommit', repoPath, commitHash),
    gitStash: (repoPath, action, message) => invokeMulti('gitStash', repoPath, action, message),
    gitShowFile: (repoPath, filePath, ref) => invokeMulti('gitShowFile', repoPath, filePath, ref),
    gitDiscardFile: (repoPath, filePath) => invokeMulti('gitDiscardFile', repoPath, filePath),
    gitAcceptOurs: (repoPath, filePath) => invokeMulti('gitAcceptOurs', repoPath, filePath),
    gitAcceptTheirs: (repoPath, filePath) => invokeMulti('gitAcceptTheirs', repoPath, filePath),
    gitMarkResolved: (repoPath, filePath) => invokeMulti('gitMarkResolved', repoPath, filePath),
    gitAbortMerge: (repoPath) => invoke('gitAbortMerge', repoPath),
    gitCherryPick: (repoPath, commitHash) => invokeMulti('gitCherryPick', repoPath, commitHash),
    gitCherryPickAbort: (repoPath) => invoke('gitCherryPickAbort', repoPath),
    gitCherryPickContinue: (repoPath) => invoke('gitCherryPickContinue', repoPath),
    gitRevert: (repoPath, commitHash) => invokeMulti('gitRevert', repoPath, commitHash),
    gitResetToCommit: (repoPath, commitHash, mode) => invokeMulti('gitResetToCommit', repoPath, commitHash, mode),
    gitLogBranch: (repoPath, branchName, options) => invokeMulti('gitLogBranch', repoPath, branchName, options),

    // ==================== Menu triggers (fire-and-forget via WS) ====================
    triggerNewTextFile: () => invoke('trigger-new-text-file'),
    triggerBrowserNewTab: () => invoke('trigger-browser-new-tab'),

    // ==================== Menu event listeners ====================
    onMenuNewTextFile: (callback) => onChannel('menu-new-text-file', callback),
    onMenuReopenTab: (callback) => onChannel('menu-reopen-tab', callback),
    onMenuNewChat: (callback) => onChannel('menu-new-chat', callback),
    onMenuNewTerminal: (callback) => onChannel('menu-new-terminal', callback),
    onMenuOpenFile: (callback) => onChannel('menu-open-file', callback),
    onMenuSaveFile: (callback) => onChannel('menu-save-file', callback),
    onMenuSaveFileAs: (callback) => onChannel('menu-save-file-as', callback),
    onMenuCloseTab: (callback) => onChannel('menu-close-tab', callback),
    onMenuOpenSettings: (callback) => onChannel('menu-open-settings', callback),
    onMenuFind: (callback) => onChannel('menu-find', callback),
    onMenuGlobalSearch: (callback) => onChannel('menu-global-search', callback),
    onMenuCommandPalette: (callback) => onChannel('menu-command-palette', callback),
    onMenuToggleSidebar: (callback) => onChannel('menu-toggle-sidebar', callback),
    onMenuNewWindow: (callback) => onChannel('menu-new-window', callback),
    onMenuSplitRight: (callback) => onChannel('menu-split-right', callback),
    onMenuSplitDown: (callback) => onChannel('menu-split-down', callback),
    onMenuOpenHelp: (callback) => onChannel('menu-open-help', callback),
    onMenuShowShortcuts: (callback) => onChannel('menu-show-shortcuts', callback),

    // ==================== CLI / Deep links ====================
    onCliOpenWorkspace: (callback) => onChannel('cli-open-workspace', callback),
    onBlankWindow: (callback) => onChannel('blank-window', callback),
    onOpenUrlInBrowser: (callback) => onChannel('open-url-in-browser', callback),
    onOpenFolderPicker: (callback) => onChannel('open-folder-picker', callback),

    // ==================== Studio ====================
    onExecuteStudioAction: (callback) => onChannel('execute-studio-action', callback),

    // ==================== Browser ====================
    browserNavigate: (args) => invoke('browser-navigate', args),
    browserBack: (args) => invoke('browser-back', args),
    browserForward: (args) => invoke('browser-forward', args),
    browserRefresh: (args) => invoke('browser-refresh', args),
    browserHardRefresh: (args) => invoke('browser-hard-refresh', args),
    browserGetSelectedText: (args) => invoke('browser-get-selected-text', args),
    browserAddToHistory: (args) => invoke('browser:addToHistory', args),
    browserGetHistory: (args) => invoke('browser:getHistory', args),
    browserAddBookmark: (args) => invoke('browser:addBookmark', args),
    browserGetBookmarks: (args) => invoke('browser:getBookmarks', args),
    browserDeleteBookmark: (args) => invoke('browser:deleteBookmark', args),
    browserSetSiteLimit: (args) => invoke('browser:setSiteLimit', args),
    browserGetSiteLimits: (args) => invoke('browser:getSiteLimits', args),
    browserDeleteSiteLimit: (args) => invoke('browser:deleteSiteLimit', args),
    browserClearHistory: (args) => invoke('browser:clearHistory', args),
    browserGetHistoryGraph: (args) => invoke('browser:getHistoryGraph', args),
    browserSetVisibility: (args) => invoke('browser:set-visibility', args),

    // Browser extensions
    browserLoadExtension: (extensionPath) => invoke('browser:loadExtension', extensionPath),
    browserRemoveExtension: (extensionId) => invoke('browser:removeExtension', extensionId),
    browserGetExtensions: () => invoke('browser:getExtensions'),
    browserToggleExtension: (args) => invoke('browser:toggleExtension', args),
    browserSelectExtensionFolder: () => invoke('browser:selectExtensionFolder'),
    browserGetInstalledBrowsers: () => invoke('browser:getInstalledBrowsers'),
    browserImportExtensionsFrom: (args) => invoke('browser:importExtensionsFrom', args),

    // Browser partitions / cookies
    browserRegisterPartition: (args) => invoke('browser:registerPartition', args),
    browserGetKnownPartitions: () => invoke('browser:getKnownPartitions'),
    browserGetCookiesFromPartition: (args) => invoke('browser:getCookiesFromPartition', args),
    browserImportCookiesFromPartition: (args) => invoke('browser:importCookiesFromPartition', args),
    browserSetCookieInheritance: (args) => invoke('browser:setCookieInheritance', args),
    browserGetCookieInheritance: (args) => invoke('browser:getCookieInheritance', args),
    browserGetCookieDomains: (args) => invoke('browser:getCookieDomains', args),

    // Browser events
    onBrowserLoaded: (callback) => onChannel('browser-loaded', callback),
    onBrowserLoading: (callback) => onChannel('browser-loading', callback),
    onBrowserTitleUpdated: (callback) => onChannel('browser-title-updated', callback),
    onBrowserLoadError: (callback) => onChannel('browser-load-error', callback),
    onBrowserNavigationStateUpdated: (callback) => onChannel('browser-navigation-state-updated', callback),
    onBrowserShowContextMenu: (callback) => onChannel('browser-show-context-menu', callback),
    onBrowserDownloadRequested: (callback) => onChannel('browser-download-requested', callback),
    onBrowserOpenInNewTab: (callback) => onChannel('browser-open-in-new-tab', callback),
    onBrowserNewTab: (callback) => onChannel('browser-new-tab', callback),

    browserSaveImage: (imageUrl, currentPath) => invoke('browser-save-image', { imageUrl, currentPath }),
    browserSaveLink: (url, suggestedFilename, currentPath) =>
      invoke('browser-save-link', { url, suggestedFilename, currentPath }),
    browserOpenExternal: (url) => invoke('browser-open-external', { url }),
    setWorkspacePath: (workspacePath) => invoke('set-workspace-path', workspacePath),
    browserGetPageContent: (args) => invoke('browser-get-page-content', args),

    // Browser downloads
    onDownloadProgress: (callback) => onChannel('download-progress', callback),
    onDownloadComplete: (callback) => onChannel('download-complete', callback),
    cancelDownload: (filename) => invoke('cancel-download', filename),
    pauseDownload: (filename) => invoke('pause-download', filename),
    resumeDownload: (filename) => invoke('resume-download', filename),

    // Thumbnails
    onThumbnailCreated: (callback) => onChannel('thumbnail-created', callback),
    onThumbnailError: (callback) => onChannel('thumbnail-error', callback),
    onThumbnailComplete: (callback) => onChannel('thumbnail-complete', callback),

    // ==================== PDF Highlights / Drawings ====================
    getHighlightsForFile: (filePath) => invoke('db:getHighlightsForFile', { filePath }),
    addPdfHighlight: (data) => invoke('db:addPdfHighlight', data),
    updatePdfHighlight: (data) => invoke('db:updatePdfHighlight', data),
    deletePdfHighlight: (id) => invoke('db:deletePdfHighlight', { id }),
    getDrawingsForFile: (filePath) => invoke('db:getDrawingsForFile', { filePath }),
    addPdfDrawing: (data) => invoke('db:addPdfDrawing', data),
    deleteDrawing: (id) => invoke('db:deleteDrawing', { id }),
    clearDrawingsForPage: (filePath, pageIndex) => invoke('db:clearDrawingsForPage', { filePath, pageIndex }),

    showPdf: (args) => invoke('show-pdf', args),
    updatePdfBounds: (bounds) => invoke('update-pdf-bounds', bounds),
    hidePdf: (filePath) => invoke('hide-pdf', filePath),

    // ==================== Tiles ====================
    tilesConfigGet: () => invoke('tiles-config-get'),
    tilesConfigSave: (config) => invoke('tiles-config-save', config),
    tilesConfigReset: () => invoke('tiles-config-reset'),
    tilesConfigAddCustom: (tile) => invoke('tiles-config-add-custom', tile),
    tilesConfigRemoveCustom: (tileId) => invoke('tiles-config-remove-custom', tileId),

    tileJinxList: () => invoke('tile-jinx-list'),
    tileJinxRead: (filename) => invoke('tile-jinx-read', filename),
    tileJinxWrite: (filename, content) => invokeMulti('tile-jinx-write', filename, content),
    tileJinxDelete: (filename) => invoke('tile-jinx-delete', filename),
    tileJinxReset: () => invoke('tile-jinx-reset'),
    tileJinxCompiled: (filename) => invoke('tile-jinx-compiled', filename),
    tileJinxRecompile: () => invoke('tile-jinx-recompile'),
    transformTsx: (code) => invoke('transformTsx', code),

    // ==================== Context ====================
    getGlobalContext: (globalPath) => invoke('get-global-context', globalPath),
    saveGlobalContext: (contextData, globalPath) => invokeMulti('save-global-context', contextData, globalPath),
    getProjectContext: (path) => invoke('get-project-context', path),
    saveProjectContext: (data) => invoke('save-project-context', data),
    initProjectTeam: (path) => invoke('init-project-team', path),

    // ==================== Usage / Activity ====================
    getUsageStats: () => invoke('get-usage-stats'),
    getActivityData: (options) => invoke('getActivityData', options),
    getHistogramData: () => invoke('getHistogramData'),

    // ==================== SQL ====================
    executeSQL: (options) => invoke('executeSQL', options),
    listTables: () => invoke('db:listTables'),
    getTableSchema: (args) => invoke('db:getTableSchema', args),
    exportToCSV: (data) => invoke('db:exportCSV', data),
    testDbConnection: (args) => invoke('db:testConnection', args),
    listTablesForPath: (args) => invoke('db:listTablesForPath', args),
    getTableSchemaForPath: (args) => invoke('db:getTableSchemaForPath', args),
    executeSQLForPath: (args) => invoke('db:executeSQLForPath', args),
    browseForDatabase: () => invoke('db:browseForDatabase'),
    getSupportedDbTypes: () => invoke('db:getSupportedTypes'),

    // ==================== SQL Models ====================
    getSqlModelsGlobal: () => invoke('getSqlModelsGlobal'),
    getSqlModelsProject: (currentPath) => invoke('getSqlModelsProject', currentPath),
    saveSqlModelGlobal: (modelData) => invoke('saveSqlModelGlobal', modelData),
    saveSqlModelProject: (args) => invoke('saveSqlModelProject', args),
    deleteSqlModelGlobal: (modelId) => invoke('deleteSqlModelGlobal', modelId),
    deleteSqlModelProject: (args) => invoke('deleteSqlModelProject', args),
    runSqlModel: (args) => invoke('runSqlModel', args),

    // ==================== Knowledge Graph ====================
    kg_getGraphData: (args) => invoke('kg:getGraphData', args),
    kg_listGenerations: () => invoke('kg:listGenerations'),
    kg_triggerProcess: (args) => invoke('kg:triggerProcess', args),
    kg_rollback: (args) => invoke('kg:rollback', args),
    kg_getNetworkStats: (args) => invoke('kg:getNetworkStats', args),
    kg_getCooccurrenceNetwork: (args) => invoke('kg:getCooccurrenceNetwork', args),
    kg_getCentralityData: (args) => invoke('kg:getCentralityData', args),
    kg_addNode: (args) => invoke('kg:addNode', args),
    kg_updateNode: (args) => invoke('kg:updateNode', args),
    kg_deleteNode: (args) => invoke('kg:deleteNode', args),
    kg_addEdge: (args) => invoke('kg:addEdge', args),
    kg_deleteEdge: (args) => invoke('kg:deleteEdge', args),
    kg_search: (args) => invoke('kg:search', args),
    kg_search_semantic: (args) => invoke('kg:search:semantic', args),
    kg_embed: (args) => invoke('kg:embed', args),
    kg_getFacts: (args) => invoke('kg:getFacts', args),
    kg_getConcepts: (args) => invoke('kg:getConcepts', args),
    kg_ingest: (args) => invoke('kg:ingest', args),
    kg_query: (args) => invoke('kg:query', args),

    // ==================== Backend ====================
    backendHealth: () => invoke('backend:health'),
    backendRestart: () => invoke('backend:restart'),

    // ==================== Memory ====================
    memory_search: (args) => invoke('memory:search', args),
    memory_pending: (args) => invoke('memory:pending', args),
    memory_scope: (args) => invoke('memory:scope', args),
    memory_approve: (args) => invoke('memory:approve', args),

    // ==================== Terminal ====================
    resizeTerminal: (data) => invoke('resizeTerminal', data),
    createTerminalSession: (args) => invokeStreaming('createTerminalSession', args),
    writeToTerminal: (args) => invoke('writeToTerminal', args),
    closeTerminalSession: (id) => invoke('closeTerminalSession', id),
    onTerminalData: (callback) => onChannel('terminal-data', (data) => callback(null, data)),
    onTerminalClosed: (callback) => onChannel('terminal-closed', (data) => callback(null, data)),
    executeShellCommand: (args) => invoke('executeShellCommand', args),

    // ==================== Command execution ====================
    executeCommand: (data) =>
      invokeStreaming('executeCommand', {
        commandstr: data.commandstr,
        current_path: data.currentPath,
        conversationId: data.conversationId,
        model: data.model,
        provider: data.provider,
        npc: data.npc,
      }),

    executeCommandStream: (data) => invokeStreaming('executeCommandStream', data),

    interruptStream: async (streamIdToInterrupt) => {
      try {
        await invoke('interruptStream', streamIdToInterrupt);
        console.log('Stream interrupted successfully');
      } catch (error) {
        console.error('Error interrupting stream:', error);
        throw error;
      }
    },

    onStreamData: (callback) => onChannel('stream-data', (data) => callback(null, data)),
    onStreamComplete: (callback) => onChannel('stream-complete', (data) => callback(null, data)),
    onStreamError: (callback) => onChannel('stream-error', (data) => callback(null, data)),

    // ==================== MCP ====================
    getMcpServers: (currentPath) => invoke('mcp:getServers', { currentPath }),
    startMcpServer: (args) => invoke('mcp:startServer', args),
    stopMcpServer: (args) => invoke('mcp:stopServer', args),
    getMcpStatus: (args) => invoke('mcp:status', args),
    listMcpTools: (args) => invoke('mcp:listTools', args),
    addMcpIntegration: (args) => invoke('mcp:addIntegration', args),

    // ==================== Dialogs ====================
    showOpenDialog: (options) => invoke('show-open-dialog', options),
    showSaveDialog: (options) => invoke('show-save-dialog', options),

    // ==================== Browser views ====================
    showBrowser: (args) => invoke('show-browser', args),
    hideBrowser: (args) => invoke('hide-browser', args),
    updateBrowserBounds: (args) => invoke('update-browser-bounds', args),
    getBrowserHistory: (folderPath) => invoke('get-browser-history', folderPath),

    // ==================== Jinxes ====================
    getJinxesGlobal: (globalPath) => invoke('get-jinxes-global', globalPath),
    getJinxesProject: async (currentPath) => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/jinxes/project?currentPath=${encodeURIComponent(currentPath)}`
        );
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error('Error loading project jinxes:', error);
        return { jinxes: [], error: error.message };
      }
    },
    saveJinx: (data) => invoke('save-jinx', data),
    ingestJinx: (data) => invoke('ingest-jinx', data),
    deleteJinx: (data) => invoke('delete-jinx', data),
    importNpcTeam: (data) => invoke('import-npc-team', data),
    getJinxesAllTeams: (currentPath) => invoke('get-jinxes-all-teams', currentPath),

    // ==================== Maps ====================
    getMapsGlobal: async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/maps/global`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error('Error loading global maps:', error);
        return { maps: [], error: error.message };
      }
    },
    getMapsProject: async (currentPath) => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/maps/project?currentPath=${encodeURIComponent(currentPath)}`
        );
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error('Error loading project maps:', error);
        return { maps: [], error: error.message };
      }
    },
    saveMap: (data) => invoke('save-map', data),
    loadMap: (filePath) => invoke('load-map', filePath),

    // ==================== Local models / Ollama ====================
    scanLocalModels: (provider) => invoke('scan-local-models', provider),
    getLocalModelStatus: (provider) => invoke('get-local-model-status', provider),
    scanGgufModels: (directory) => invoke('scan-gguf-models', directory),
    browseGgufFile: () => invoke('browse-gguf-file'),
    downloadHfModel: (params) => invoke('download-hf-model', params),
    searchHfModels: (params) => invoke('search-hf-models', params),
    listHfFiles: (params) => invoke('list-hf-files', params),
    downloadHfFile: (params) => invoke('download-hf-file', params),
    detectLocalModels: () => invoke('detect-local-models'),
    checkOllamaStatus: () => invoke('ollama:checkStatus'),
    installOllama: () => invoke('ollama:install'),
    getLocalOllamaModels: () => invoke('ollama:getLocalModels'),
    pullOllamaModel: (args) => invoke('ollama:pullModel', args),
    deleteOllamaModel: (args) => invoke('ollama:deleteModel', args),
    onOllamaPullProgress: (callback) => onChannel('ollama-pull-progress', callback),
    onOllamaPullComplete: (callback) => onChannel('ollama-pull-complete', callback),
    onOllamaPullError: (callback) => onChannel('ollama-pull-error', callback),

    // ==================== Activity tracking / Predictions ====================
    trackActivity: (activity) => invoke('track-activity', activity),
    getActivityPredictions: () => invoke('get-activity-predictions'),
    trainActivityModel: () => invoke('train-activity-model'),

    // ==================== Passwords ====================
    passwordSave: (params) => invoke('password-save', params),
    passwordGetForSite: (site) => invoke('password-get-for-site', { site }),
    passwordGet: (id) => invoke('password-get', { id }),
    passwordList: () => invoke('password-list'),
    passwordDelete: (id) => invoke('password-delete', { id }),
    passwordEncryptionStatus: () => invoke('password-encryption-status'),

    // ==================== Python environments ====================
    pythonEnvGet: (workspacePath) => invoke('python-env-get', { workspacePath }),
    pythonEnvSave: (workspacePath, envConfig) => invoke('python-env-save', { workspacePath, envConfig }),
    pythonEnvDelete: (workspacePath) => invoke('python-env-delete', { workspacePath }),
    pythonEnvList: () => invoke('python-env-list'),
    pythonEnvDetect: (workspacePath) => invoke('python-env-detect', { workspacePath }),
    pythonEnvResolve: (workspacePath) => invoke('python-env-resolve', { workspacePath }),
    pythonEnvCreate: (workspacePath, venvName, pythonPath) =>
      invoke('python-env-create', { workspacePath, venvName, pythonPath }),
    pythonEnvCheckConfigured: (workspacePath) => invoke('python-env-check-configured', { workspacePath }),
    pythonEnvListPackages: (workspacePath) => invoke('python-env-list-packages', workspacePath),
    pythonEnvInstallPackage: (workspacePath, packageName, extraArgs) =>
      invokeMulti('python-env-install-package', workspacePath, packageName, extraArgs),
    pythonEnvUninstallPackage: (workspacePath, packageName) =>
      invokeMulti('python-env-uninstall-package', workspacePath, packageName),

    // ==================== Profile ====================
    profileGet: () => invoke('profile:get'),
    profileSave: (profile) => invoke('profile:save', profile),

    // ==================== Setup wizard ====================
    setupCheckNeeded: () => invoke('setup:checkNeeded'),
    setupGetBackendPythonPath: () => invoke('setup:getBackendPythonPath'),
    setupDetectPython: () => invoke('setup:detectPython'),
    setupCreateVenv: () => invoke('setup:createVenv'),
    setupInstallNpcpy: (pythonPath, extras) => invoke('setup:installNpcpy', { pythonPath, extras }),
    setupComplete: (pythonPath) => invoke('setup:complete', { pythonPath }),
    setupSkip: () => invoke('setup:skip'),
    setupReset: () => invoke('setup:reset'),
    setupRestartBackend: () => invoke('setup:restartBackend'),
    onSetupInstallProgress: (callback) => onChannel('setup:installProgress', callback),

    // ==================== Generative / Fine-tuning ====================
    generativeFill: (params) => invoke('generative-fill', params),
    fineTuneDiffusers: (params) => invoke('finetune-diffusers', params),
    getFineTuneStatus: (jobId) => invoke('get-finetune-status', jobId),
    fineTuneInstruction: (params) => invoke('finetune-instruction', params),
    getInstructionFineTuneStatus: (jobId) => invoke('get-instruction-finetune-status', jobId),
    getInstructionModels: (currentPath) => invoke('get-instruction-models', currentPath),

    // ==================== Genetic ====================
    createGeneticPopulation: (params) => invoke('genetic-create-population', params),
    evolvePopulation: (params) => invoke('genetic-evolve', params),
    getPopulation: (populationId) => invoke('genetic-get-population', populationId),
    listPopulations: () => invoke('genetic-list-populations'),
    deletePopulation: (populationId) => invoke('genetic-delete-population', populationId),
    injectIndividuals: (params) => invoke('genetic-inject', params),

    // ==================== Attachments ====================
    getMessageAttachments: (messageId) => invoke('get-message-attachments', messageId),
    getAttachment: (attachmentId) => invoke('get-attachment', attachmentId),
    get_attachment_response: (attachmentData, conversationId) =>
      invokeMulti('get_attachment_response', attachmentData, conversationId),

    // ==================== Settings ====================
    loadGlobalSettings: () => invoke('loadGlobalSettings'),
    saveGlobalSettings: (args) => invoke('saveGlobalSettings', args),
    loadProjectSettings: (path) => invoke('loadProjectSettings', path),
    saveProjectSettings: (args) => invoke('saveProjectSettings', args),

    // ==================== npcsh ====================
    npcshCheck: () => invoke('npcsh-check'),
    npcshPackageContents: () => invoke('npcsh-package-contents'),
    npcshInit: () => invoke('npcsh-init'),
    deployIncognideTeam: () => invoke('deploy-incognide-team'),

    // ==================== NPC Team Sync ====================
    npcTeamSyncStatus: (globalPath) => invoke('npc-team:sync-status', globalPath),
    npcTeamSyncInit: (globalPath) => invoke('npc-team:sync-init', globalPath),
    npcTeamSyncPull: (globalPath) => invoke('npc-team:sync-pull', globalPath),
    npcTeamSyncResolve: (args) => invoke('npc-team:sync-resolve', args),
    npcTeamSyncCommit: (args) => invoke('npc-team:sync-commit', args),
    npcTeamSyncDiff: (args) => invoke('npc-team:sync-diff', args),
    npcTeamCompareBundled: () => invoke('npc-team:compare-bundled'),
    npcTeamAcceptBundled: (args) => invoke('npc-team:accept-bundled', args),
    npcTeamBundledDiff: (args) => invoke('npc-team:bundled-diff', args),

    // ==================== Logs ====================
    getLogsDir: () => invoke('getLogsDir'),
    readLogFile: (logType) => invoke('readLogFile', logType),
    updateShortcut: (shortcut) => invoke('update-shortcut', shortcut),

    // ==================== Device ====================
    getDeviceInfo: () => invoke('getDeviceInfo'),
    setDeviceName: (name) => invoke('setDeviceName', name),
    getDeviceId: () => invoke('getDeviceId'),

    // ==================== Jupyter ====================
    jupyterListKernels: (args) => invoke('jupyter:listKernels', args),
    jupyterStartKernel: (args) => invoke('jupyter:startKernel', args),
    jupyterExecuteCode: (args) => invoke('jupyter:executeCode', args),
    jupyterInterruptKernel: (args) => invoke('jupyter:interruptKernel', args),
    jupyterStopKernel: (args) => invoke('jupyter:stopKernel', args),
    jupyterGetRunningKernels: () => invoke('jupyter:getRunningKernels'),
    jupyterGetVariables: (args) => invoke('jupyter:getVariables', args),
    jupyterGetDataFrame: (args) => invoke('jupyter:getDataFrame', args),
    jupyterCheckInstalled: (args) => invoke('jupyter:checkInstalled', args),
    jupyterInstall: (args) => invoke('jupyter:install', args),
    jupyterRegisterKernel: (args) => invoke('jupyter:registerKernel', args),
    onJupyterKernelStopped: (callback) => onChannel('jupyter:kernelStopped', callback),
    onJupyterInstallProgress: (callback) => onChannel('jupyter:installProgress', callback),

    // ==================== Zoom ====================
    onZoomIn: (callback) => onChannel('zoom-in', callback),
    onZoomOut: (callback) => onChannel('zoom-out', callback),
    onZoomReset: (callback) => onChannel('zoom-reset', callback),

    // ==================== Updates ====================
    checkForUpdates: () => invoke('check-for-updates'),
    getAppVersion: () => invoke('get-app-version'),
    downloadAndInstallUpdate: (opts) => invoke('download-and-install-update', opts),
    onUpdateDownloadProgress: (callback) => onChannel('update-download-progress', callback),

    // ==================== Macro / Screenshot ====================
    onShowMacroInput: (callback) => onChannel('show-macro-input', callback),
    submitMacro: (macro) => invoke('submit-macro', macro),
    onScreenshotCaptured: (callback) => onChannel('screenshot-captured', callback),

    // ==================== Misc ====================
    showPromptDialog: (options) => invoke('showPromptDialog', options),
    checkServerConnection: () => invoke('checkServerConnection'),
    openExternal: (url) => invoke('openExternal', url),
  };

  console.log('[web-preload] window.api initialized with', Object.keys(window.api).length, 'methods');
})();
