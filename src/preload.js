const { contextBridge, ipcRenderer, shell } = require('electron');

// Backend URL - detect dev mode and use appropriate port
// Dev mode: 5437, Prod mode: 5337
const IS_DEV = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';
const DEFAULT_PORT = IS_DEV ? '5437' : '5337';
const BACKEND_PORT = process.env.INCOGNIDE_PORT || DEFAULT_PORT;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

contextBridge.exposeInMainWorld('api', {
textPredict: (data) => ipcRenderer.invoke('text-predict', data),

readCsvContent: (filePath) => 
  ipcRenderer.invoke('read-csv-content', filePath),

readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
readDocxContent: (filePath) => 
  ipcRenderer.invoke('read-docx-content', filePath),
    getDefaultConfig: () => ipcRenderer.invoke('getDefaultConfig'),
    getProjectCtx: (currentPath) => ipcRenderer.invoke('getProjectCtx', currentPath),
    readDirectoryStructure: (dirPath) => ipcRenderer.invoke('readDirectoryStructure', dirPath),
    goUpDirectory: (currentPath) => ipcRenderer.invoke('goUpDirectory', currentPath),
    readDirectory: (dirPath) => ipcRenderer.invoke('readDirectory', dirPath),
    ensureDir: (dirPath) => ipcRenderer.invoke('ensureDirectory', dirPath),
    ensureDirectory: (dirPath) => ipcRenderer.invoke('ensureDirectory', dirPath),
    getHomeDir: () => ipcRenderer.invoke('getHomeDir'),
    readDirectoryImages: (dirPath) => ipcRenderer.invoke('readDirectoryImages', dirPath),
    open_directory_picker: () => ipcRenderer.invoke('open_directory_picker'),

    getAvailableJinxs: (params) => ipcRenderer.invoke('getAvailableJinxs', params),
    executeJinx: (params) => ipcRenderer.invoke('executeJinx', params),

    getAvailableImageModels: (currentPath) => ipcRenderer.invoke('getAvailableImageModels', currentPath),
    getCronDaemons: (currentPath) => ipcRenderer.invoke('getCronDaemons', currentPath),
    addCronJob: (params) => ipcRenderer.invoke('addCronJob', params),
    removeCronJob: (jobId) => ipcRenderer.invoke('removeCronJob', jobId),
    addDaemon: (params) => ipcRenderer.invoke('addDaemon', params),
    removeDaemon: (daemonId) => ipcRenderer.invoke('removeDaemon', daemonId),

   
    generateImages: (prompt, n, model, provider, attachments, baseFilename, currentPath) => ipcRenderer.invoke('generate_images', { prompt, n, model, provider, attachments, baseFilename,currentPath}),

    openNewWindow: (path) => ipcRenderer.invoke('open-new-window', path),
    openInNativeExplorer: (path) => ipcRenderer.invoke('open-in-native-explorer', path),


    deleteConversation: (id) => ipcRenderer.invoke('deleteConversation', id),
    getConversations: (path) => ipcRenderer.invoke('getConversations', path),
    getConversationsInDirectory: (path) => ipcRenderer.invoke('getConversationsInDirectory', path),
    getConversationMessages: (id) => ipcRenderer.invoke('getConversationMessages', id),
    createConversation: (data) => ipcRenderer.invoke('createConversation', data),
    sendMessage: (data) => ipcRenderer.invoke('sendMessage', data),
    waitForScreenshot: (path) => ipcRenderer.invoke('wait-for-screenshot', path),
    saveNPC: (data) => ipcRenderer.invoke('save-npc', data),
    gitStatus: (repoPath) => ipcRenderer.invoke('gitStatus', repoPath),
    gitStageFile: (repoPath, file) => ipcRenderer.invoke('gitStageFile', repoPath, file),
    gitUnstageFile: (repoPath, file) => ipcRenderer.invoke('gitUnstageFile', repoPath, file),
    gitCommit: (repoPath, message) => ipcRenderer.invoke('gitCommit', repoPath, message),
    gitPull: (repoPath) => ipcRenderer.invoke('gitPull', repoPath),
    gitPush: (repoPath) => ipcRenderer.invoke('gitPush', repoPath),
    gitPushSetUpstream: (repoPath, branch) => ipcRenderer.invoke('gitPushSetUpstream', repoPath, branch),
    gitSetAutoSetupRemote: () => ipcRenderer.invoke('gitSetAutoSetupRemote'),
    gitDiff: (repoPath, filePath, staged) => ipcRenderer.invoke('gitDiff', repoPath, filePath, staged),
    gitDiffAll: (repoPath) => ipcRenderer.invoke('gitDiffAll', repoPath),
    gitBlame: (repoPath, filePath) => ipcRenderer.invoke('gitBlame', repoPath, filePath),
    gitBranches: (repoPath) => ipcRenderer.invoke('gitBranches', repoPath),
    gitCreateBranch: (repoPath, branchName) => ipcRenderer.invoke('gitCreateBranch', repoPath, branchName),
    gitCheckout: (repoPath, branchName) => ipcRenderer.invoke('gitCheckout', repoPath, branchName),
    gitDeleteBranch: (repoPath, branchName, force) => ipcRenderer.invoke('gitDeleteBranch', repoPath, branchName, force),
    gitLog: (repoPath, options) => ipcRenderer.invoke('gitLog', repoPath, options),
    gitShowCommit: (repoPath, commitHash) => ipcRenderer.invoke('gitShowCommit', repoPath, commitHash),
    gitStash: (repoPath, action, message) => ipcRenderer.invoke('gitStash', repoPath, action, message),
    gitShowFile: (repoPath, filePath, ref) => ipcRenderer.invoke('gitShowFile', repoPath, filePath, ref),
    gitDiscardFile: (repoPath, filePath) => ipcRenderer.invoke('gitDiscardFile', repoPath, filePath),
    gitAcceptOurs: (repoPath, filePath) => ipcRenderer.invoke('gitAcceptOurs', repoPath, filePath),
    gitAcceptTheirs: (repoPath, filePath) => ipcRenderer.invoke('gitAcceptTheirs', repoPath, filePath),
    gitMarkResolved: (repoPath, filePath) => ipcRenderer.invoke('gitMarkResolved', repoPath, filePath),
    gitAbortMerge: (repoPath) => ipcRenderer.invoke('gitAbortMerge', repoPath),

    // Terminal shortcut relay methods
    triggerNewTextFile: () => ipcRenderer.send('trigger-new-text-file'),
    triggerBrowserNewTab: () => ipcRenderer.send('trigger-browser-new-tab'),

    // Window management
    closeWindow: () => ipcRenderer.invoke('close-window'),
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),

    // Device ID and info for multi-device sync
    getDeviceInfo: () => ipcRenderer.invoke('getDeviceInfo'),
    setDeviceName: (name) => ipcRenderer.invoke('setDeviceName', name),
    getDeviceId: () => ipcRenderer.invoke('getDeviceId'),

    // Menu callbacks
    onMenuNewTextFile: (callback) => {
        ipcRenderer.on('menu-new-text-file', callback);
        return () => ipcRenderer.removeListener('menu-new-text-file', callback);
    },
    onMenuReopenTab: (callback) => {
        ipcRenderer.on('menu-reopen-tab', callback);
        return () => ipcRenderer.removeListener('menu-reopen-tab', callback);
    },

    readFile: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
   
    readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),
    writeFileContent: (filePath, content) => ipcRenderer.invoke('write-file-content', filePath, content),
    executeCode: (args) => ipcRenderer.invoke('executeCode', args),
    saveTempFile: (args) => ipcRenderer.invoke('save-temp-file', args),
    createDirectory: (path) => ipcRenderer.invoke('create-directory', path),
    deleteDirectory: (path) => ipcRenderer.invoke('delete-directory', path),
    getDirectoryContentsRecursive: (path) => ipcRenderer.invoke('get-directory-contents-recursive', path),
    analyzeDiskUsage: (path) => ipcRenderer.invoke('analyze-disk-usage', path),
    showPdf: (args) => ipcRenderer.send('show-pdf', args),
    updatePdfBounds: (bounds) => ipcRenderer.send('update-pdf-bounds', bounds),
    hidePdf: (filePath) => ipcRenderer.send('hide-pdf', filePath),
    browserNavigate: (args) => ipcRenderer.invoke('browser-navigate', args),
    browserBack: (args) => ipcRenderer.invoke('browser-back', args),
    browserForward: (args) => ipcRenderer.invoke('browser-forward', args),
    browserRefresh: (args) => ipcRenderer.invoke('browser-refresh', args),
    browserHardRefresh: (args) => ipcRenderer.invoke('browser-hard-refresh', args),
    browserGetSelectedText: (args) => ipcRenderer.invoke('browser-get-selected-text', args),
    browserAddToHistory: (args) => ipcRenderer.invoke('browser:addToHistory', args),
    browserGetHistory: (args) => ipcRenderer.invoke('browser:getHistory', args),
    browserAddBookmark: (args) => ipcRenderer.invoke('browser:addBookmark', args),
    browserGetBookmarks: (args) => ipcRenderer.invoke('browser:getBookmarks', args),
    browserDeleteBookmark: (args) => ipcRenderer.invoke('browser:deleteBookmark', args),
    browserSetSiteLimit: (args) => ipcRenderer.invoke('browser:setSiteLimit', args),
    browserGetSiteLimits: (args) => ipcRenderer.invoke('browser:getSiteLimits', args),
    browserDeleteSiteLimit: (args) => ipcRenderer.invoke('browser:deleteSiteLimit', args),
    browserClearHistory: (args) => ipcRenderer.invoke('browser:clearHistory', args),
    browserGetHistoryGraph: (args) => ipcRenderer.invoke('browser:getHistoryGraph', args),
    browserSetVisibility: (args) => ipcRenderer.invoke('browser:set-visibility', args),

    // Browser extensions
    browserLoadExtension: (extensionPath) => ipcRenderer.invoke('browser:loadExtension', extensionPath),
    browserRemoveExtension: (extensionId) => ipcRenderer.invoke('browser:removeExtension', extensionId),
    browserGetExtensions: () => ipcRenderer.invoke('browser:getExtensions'),
    browserToggleExtension: (args) => ipcRenderer.invoke('browser:toggleExtension', args),
    browserSelectExtensionFolder: () => ipcRenderer.invoke('browser:selectExtensionFolder'),
    browserGetInstalledBrowsers: () => ipcRenderer.invoke('browser:getInstalledBrowsers'),
    browserImportExtensionsFrom: (args) => ipcRenderer.invoke('browser:importExtensionsFrom', args),

    // Cookie inheritance management
    browserRegisterPartition: (args) => ipcRenderer.invoke('browser:registerPartition', args),
    browserGetKnownPartitions: () => ipcRenderer.invoke('browser:getKnownPartitions'),
    browserGetCookiesFromPartition: (args) => ipcRenderer.invoke('browser:getCookiesFromPartition', args),
    browserImportCookiesFromPartition: (args) => ipcRenderer.invoke('browser:importCookiesFromPartition', args),
    browserSetCookieInheritance: (args) => ipcRenderer.invoke('browser:setCookieInheritance', args),
    browserGetCookieInheritance: (args) => ipcRenderer.invoke('browser:getCookieInheritance', args),
    browserGetCookieDomains: (args) => ipcRenderer.invoke('browser:getCookieDomains', args),

    // CLI workspace opening - for launching incognide with a folder path
    onCliOpenWorkspace: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('cli-open-workspace', handler);
        return () => ipcRenderer.removeListener('cli-open-workspace', handler);
    },

    // Open URL in browser pane (from xdg-open or command line)
    onOpenUrlInBrowser: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('open-url-in-browser', handler);
        return () => ipcRenderer.removeListener('open-url-in-browser', handler);
    },

    // Ctrl+Shift+O folder picker shortcut
    onOpenFolderPicker: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('open-folder-picker', handler);
        return () => ipcRenderer.removeListener('open-folder-picker', handler);
    },

    // Menu bar event listeners
    onMenuNewChat: (callback) => {
        ipcRenderer.on('menu-new-chat', callback);
        return () => ipcRenderer.removeListener('menu-new-chat', callback);
    },
    onMenuNewTerminal: (callback) => {
        ipcRenderer.on('menu-new-terminal', callback);
        return () => ipcRenderer.removeListener('menu-new-terminal', callback);
    },
    onMenuOpenFile: (callback) => {
        ipcRenderer.on('menu-open-file', callback);
        return () => ipcRenderer.removeListener('menu-open-file', callback);
    },
    onMenuSaveFile: (callback) => {
        ipcRenderer.on('menu-save-file', callback);
        return () => ipcRenderer.removeListener('menu-save-file', callback);
    },
    onMenuSaveFileAs: (callback) => {
        ipcRenderer.on('menu-save-file-as', callback);
        return () => ipcRenderer.removeListener('menu-save-file-as', callback);
    },
    onMenuCloseTab: (callback) => {
        ipcRenderer.on('menu-close-tab', callback);
        return () => ipcRenderer.removeListener('menu-close-tab', callback);
    },
    onMenuOpenSettings: (callback) => {
        ipcRenderer.on('menu-open-settings', callback);
        return () => ipcRenderer.removeListener('menu-open-settings', callback);
    },
    onMenuFind: (callback) => {
        ipcRenderer.on('menu-find', callback);
        return () => ipcRenderer.removeListener('menu-find', callback);
    },
    onMenuGlobalSearch: (callback) => {
        ipcRenderer.on('menu-global-search', callback);
        return () => ipcRenderer.removeListener('menu-global-search', callback);
    },
    onMenuCommandPalette: (callback) => {
        ipcRenderer.on('menu-command-palette', callback);
        return () => ipcRenderer.removeListener('menu-command-palette', callback);
    },
    onMenuToggleSidebar: (callback) => {
        ipcRenderer.on('menu-toggle-sidebar', callback);
        return () => ipcRenderer.removeListener('menu-toggle-sidebar', callback);
    },
    onMenuNewWindow: (callback) => {
        ipcRenderer.on('menu-new-window', callback);
        return () => ipcRenderer.removeListener('menu-new-window', callback);
    },
    onMenuSplitRight: (callback) => {
        ipcRenderer.on('menu-split-right', callback);
        return () => ipcRenderer.removeListener('menu-split-right', callback);
    },
    onMenuSplitDown: (callback) => {
        ipcRenderer.on('menu-split-down', callback);
        return () => ipcRenderer.removeListener('menu-split-down', callback);
    },
    onMenuOpenHelp: (callback) => {
        ipcRenderer.on('menu-open-help', callback);
        return () => ipcRenderer.removeListener('menu-open-help', callback);
    },
    onMenuShowShortcuts: (callback) => {
        ipcRenderer.on('menu-show-shortcuts', callback);
        return () => ipcRenderer.removeListener('menu-show-shortcuts', callback);
    },

    // External studio action execution - for CLI/LLM control
    onExecuteStudioAction: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('execute-studio-action', handler);
        return () => ipcRenderer.removeListener('execute-studio-action', handler);
    },

    onBrowserLoaded: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-loaded', handler);
        return () => ipcRenderer.removeListener('browser-loaded', handler);
    },
    onBrowserLoading: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-loading', handler);
        return () => ipcRenderer.removeListener('browser-loading', handler);
    },
    onBrowserTitleUpdated: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-title-updated', handler);
        return () => ipcRenderer.removeListener('browser-title-updated', handler);
    },
    onBrowserLoadError: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-load-error', handler);
        return () => ipcRenderer.removeListener('browser-load-error', handler);
    },
    onBrowserNavigationStateUpdated: (callback) => { // Expose new event
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-navigation-state-updated', handler);
        return () => ipcRenderer.removeListener('browser-navigation-state-updated', handler);
    },

    // Browser context menu actions - pass currentPath for correct default directory
    browserSaveImage: (imageUrl, currentPath) => ipcRenderer.invoke('browser-save-image', { imageUrl, currentPath }),
    browserSaveLink: (url, suggestedFilename, currentPath) => ipcRenderer.invoke('browser-save-link', { url, suggestedFilename, currentPath }),
    browserOpenExternal: (url) => ipcRenderer.invoke('browser-open-external', { url }),
    setWorkspacePath: (workspacePath) => ipcRenderer.send('set-workspace-path', workspacePath),

    // Listen for download requests from main process (for automatic downloads)
    onBrowserDownloadRequested: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-download-requested', handler);
        return () => ipcRenderer.removeListener('browser-download-requested', handler);
    },

    // Listen for new tab requests from main process (ctrl+click, middle-click on links)
    onBrowserOpenInNewTab: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-open-in-new-tab', handler);
        return () => ipcRenderer.removeListener('browser-open-in-new-tab', handler);
    },

    // Listen for Ctrl+T shortcut from main process
    onBrowserNewTab: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('browser-new-tab', handler);
        return () => ipcRenderer.removeListener('browser-new-tab', handler);
    },

    onDownloadProgress: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('download-progress', handler);
        return () => ipcRenderer.removeListener('download-progress', handler);
    },
    onDownloadComplete: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('download-complete', handler);
        return () => ipcRenderer.removeListener('download-complete', handler);
    },
    cancelDownload: (filename) => ipcRenderer.invoke('cancel-download', filename),
    pauseDownload: (filename) => ipcRenderer.invoke('pause-download', filename),
    resumeDownload: (filename) => ipcRenderer.invoke('resume-download', filename),


    onThumbnailCreated: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('thumbnail-created', handler);
        return () => ipcRenderer.removeListener('thumbnail-created', handler);
    },
    onThumbnailError: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('thumbnail-error', handler);
        return () => ipcRenderer.removeListener('thumbnail-error', handler);
    },
    onThumbnailComplete: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('thumbnail-complete', handler);
        return () => ipcRenderer.removeListener('thumbnail-complete', handler);
    },
    
    
    getHighlightsForFile: (filePath) => ipcRenderer.invoke('db:getHighlightsForFile', { filePath }),
    addPdfHighlight: (data) => ipcRenderer.invoke('db:addPdfHighlight', data),
    updatePdfHighlight: (data) => ipcRenderer.invoke('db:updatePdfHighlight', data),
    deletePdfHighlight: (id) => ipcRenderer.invoke('db:deletePdfHighlight', { id }),

    getDrawingsForFile: (filePath) => ipcRenderer.invoke('db:getDrawingsForFile', { filePath }),
    addPdfDrawing: (data) => ipcRenderer.invoke('db:addPdfDrawing', data),
    deleteDrawing: (id) => ipcRenderer.invoke('db:deleteDrawing', { id }),
    clearDrawingsForPage: (filePath, pageIndex) => ipcRenderer.invoke('db:clearDrawingsForPage', { filePath, pageIndex }),

    deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
    zipItems: (itemPaths, zipName) => ipcRenderer.invoke('zip-items', itemPaths, zipName),
    readZipContents: (zipPath) => ipcRenderer.invoke('read-zip-contents', zipPath),
    extractZip: (zipPath, targetDir, entryPath) => ipcRenderer.invoke('extract-zip', zipPath, targetDir, entryPath),
    renameFile: (oldPath, newPath) => ipcRenderer.invoke('renameFile', oldPath, newPath),
    chmod: (options) => ipcRenderer.invoke('chmod', options),
    chown: (options) => ipcRenderer.invoke('chown', options),

    // Tile configuration
    tilesConfigGet: () => ipcRenderer.invoke('tiles-config-get'),
    tilesConfigSave: (config) => ipcRenderer.invoke('tiles-config-save', config),
    tilesConfigReset: () => ipcRenderer.invoke('tiles-config-reset'),
    tilesConfigAddCustom: (tile) => ipcRenderer.invoke('tiles-config-add-custom', tile),
    tilesConfigRemoveCustom: (tileId) => ipcRenderer.invoke('tiles-config-remove-custom', tileId),

    // Tile Jinx system
    tileJinxList: () => ipcRenderer.invoke('tile-jinx-list'),
    tileJinxRead: (filename) => ipcRenderer.invoke('tile-jinx-read', filename),
    tileJinxWrite: (filename, content) => ipcRenderer.invoke('tile-jinx-write', filename, content),
    tileJinxDelete: (filename) => ipcRenderer.invoke('tile-jinx-delete', filename),
    tileJinxReset: () => ipcRenderer.invoke('tile-jinx-reset'),
    tileJinxCompiled: (filename) => ipcRenderer.invoke('tile-jinx-compiled', filename),
    tileJinxRecompile: () => ipcRenderer.invoke('tile-jinx-recompile'),
    transformTsx: (code) => ipcRenderer.invoke('transformTsx', code),

    getGlobalContext: () => ipcRenderer.invoke('get-global-context'),
    saveGlobalContext: (contextData) => ipcRenderer.invoke('save-global-context', contextData),
    getProjectContext: (path) => ipcRenderer.invoke('get-project-context', path),
    saveProjectContext: (data) => ipcRenderer.invoke('save-project-context', data),
    initProjectTeam: (path) => ipcRenderer.invoke('init-project-team', path),
    getUsageStats: () => ipcRenderer.invoke('get-usage-stats'),
    getActivityData: (options) => ipcRenderer.invoke('getActivityData', options),
    getHistogramData: () => ipcRenderer.invoke('getHistogramData'),
    executeSQL: (options) => ipcRenderer.invoke('executeSQL', options),
    deleteMessage: (params) => ipcRenderer.invoke('deleteMessage', params),

    listTables: () => ipcRenderer.invoke('db:listTables'),
    getTableSchema: (args) => ipcRenderer.invoke('db:getTableSchema', args),
    exportToCSV: (data) => ipcRenderer.invoke('db:exportCSV', data),

    // Custom database connection APIs (supports SQLite, PostgreSQL, MySQL, MSSQL, Snowflake)
    testDbConnection: (args) => ipcRenderer.invoke('db:testConnection', args),
    listTablesForPath: (args) => ipcRenderer.invoke('db:listTablesForPath', args),
    getTableSchemaForPath: (args) => ipcRenderer.invoke('db:getTableSchemaForPath', args),
    executeSQLForPath: (args) => ipcRenderer.invoke('db:executeSQLForPath', args),
    browseForDatabase: () => ipcRenderer.invoke('db:browseForDatabase'),
    getSupportedDbTypes: () => ipcRenderer.invoke('db:getSupportedTypes'),

    getLastUsedInDirectory: (path) => ipcRenderer.invoke('get-last-used-in-directory', path),
    getLastUsedInConversation: (conversationId) => ipcRenderer.invoke('get-last-used-in-conversation', conversationId),

    kg_getGraphData: (args) => ipcRenderer.invoke('kg:getGraphData', args),
    kg_listGenerations: () => ipcRenderer.invoke('kg:listGenerations'),
    kg_triggerProcess: (args) => ipcRenderer.invoke('kg:triggerProcess', args),
    kg_rollback: (args) => ipcRenderer.invoke('kg:rollback', args),
    kg_getNetworkStats: (args) => ipcRenderer.invoke('kg:getNetworkStats', args),
    kg_getCooccurrenceNetwork: (args) => ipcRenderer.invoke('kg:getCooccurrenceNetwork', args),
    kg_getCentralityData: (args) => ipcRenderer.invoke('kg:getCentralityData', args),
    kg_addNode: (args) => ipcRenderer.invoke('kg:addNode', args),
    kg_updateNode: (args) => ipcRenderer.invoke('kg:updateNode', args),
    kg_deleteNode: (args) => ipcRenderer.invoke('kg:deleteNode', args),
    kg_addEdge: (args) => ipcRenderer.invoke('kg:addEdge', args),
    kg_deleteEdge: (args) => ipcRenderer.invoke('kg:deleteEdge', args),
    kg_search: (args) => ipcRenderer.invoke('kg:search', args),
    kg_search_semantic: (args) => ipcRenderer.invoke('kg:search:semantic', args),
    kg_embed: (args) => ipcRenderer.invoke('kg:embed', args),
    kg_getFacts: (args) => ipcRenderer.invoke('kg:getFacts', args),
    kg_getConcepts: (args) => ipcRenderer.invoke('kg:getConcepts', args),

    // Memory APIs
    memory_search: (args) => ipcRenderer.invoke('memory:search', args),
    memory_pending: (args) => ipcRenderer.invoke('memory:pending', args),
    memory_scope: (args) => ipcRenderer.invoke('memory:scope', args),
    memory_approve: (args) => ipcRenderer.invoke('memory:approve', args),

    resizeTerminal: (data) => ipcRenderer.invoke('resizeTerminal', data),

        createTerminalSession: (args) => ipcRenderer.invoke('createTerminalSession', args),
    writeToTerminal: (args) => ipcRenderer.invoke('writeToTerminal', args),
    closeTerminalSession: (id) => ipcRenderer.invoke('closeTerminalSession', id),
    onTerminalData: (callback) => {
        const handler = (_, data) => callback(_, data);
        ipcRenderer.on('terminal-data', handler);
        return () => ipcRenderer.removeListener('terminal-data', handler);
    },
onTerminalClosed: (callback) => {
    const handler = (_, data) => callback(_, data);
    ipcRenderer.on('terminal-closed', handler);
    return () => ipcRenderer.removeListener('terminal-closed', handler);
},
    executeShellCommand: (args) => ipcRenderer.invoke('executeShellCommand', args),

   
    executeCommand: (data) => ipcRenderer.invoke('executeCommand', {
        commandstr: data.commandstr,
        current_path: data.currentPath,
        conversationId: data.conversationId,
        model: data.model,
        provider:data.provider,
        npc: data.npc,
    }),

    executeCommandStream: (data) => ipcRenderer.invoke('executeCommandStream', data),
    interruptStream: async (streamIdToInterrupt) => {
        try {
            await ipcRenderer.invoke('interruptStream', streamIdToInterrupt);
            console.log('Stream interrupted successfully');
        } catch (error) {
            console.error('Error interrupting stream:', error);
            throw error;
        }
    },
    
   
    onStreamData: (callback) => {
        const handler = (_, data) => callback(_, data);
        ipcRenderer.on('stream-data', handler);
        return () => ipcRenderer.removeListener('stream-data', handler);
    },
    onStreamComplete: (callback) => {
        const handler = (_, data) => callback(_, data);
        ipcRenderer.on('stream-complete', handler);
        return () => ipcRenderer.removeListener('stream-complete', handler);
    },
    onStreamError: (callback) => {
        const handler = (_, data) => callback(_, data);
        ipcRenderer.on('stream-error', handler);
        return () => ipcRenderer.removeListener('stream-error', handler);
    },

    // MCP server management
    getMcpServers: (currentPath) => ipcRenderer.invoke('mcp:getServers', { currentPath }),
    startMcpServer: (args) => ipcRenderer.invoke('mcp:startServer', args),
    stopMcpServer: (args) => ipcRenderer.invoke('mcp:stopServer', args),
    getMcpStatus: (args) => ipcRenderer.invoke('mcp:status', args),
    listMcpTools: (args) => ipcRenderer.invoke('mcp:listTools', args),
    addMcpIntegration: (args) => ipcRenderer.invoke('mcp:addIntegration', args),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showBrowser: (args) => ipcRenderer.invoke('show-browser', args),
    hideBrowser: (args) => ipcRenderer.invoke('hide-browser', args),
    updateBrowserBounds: (args) => ipcRenderer.invoke('update-browser-bounds', args),
    getBrowserHistory: (folderPath) => ipcRenderer.invoke('get-browser-history', folderPath),
    browserAddToHistory: (data) => ipcRenderer.invoke('browser-add-to-history', data),
    getJinxsGlobal: async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/jinxs/global`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data; 
        } catch (error) {
            console.error('Error loading global jinxs:', error);
            return { jinxs: [], error: error.message };
        }
    },
    getJinxsProject: async (currentPath) => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/jinxs/project?currentPath=${encodeURIComponent(currentPath)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error loading project jinxs:', error);
            return { jinxs: [], error: error.message };
        }
    },
    saveJinx: (data) => ipcRenderer.invoke('save-jinx', data),

    // Mapx (Mind Map) APIs - YAML-based storage like NPCs/Jinxs
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
            const response = await fetch(`${BACKEND_URL}/api/maps/project?currentPath=${encodeURIComponent(currentPath)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Error loading project maps:', error);
            return { maps: [], error: error.message };
        }
    },
    saveMap: (data) => ipcRenderer.invoke('save-map', data),
    loadMap: (filePath) => ipcRenderer.invoke('load-map', filePath),

    // SQL Models APIs (dbt-style npcsql with jinja syntax)
    getSqlModelsGlobal: () => ipcRenderer.invoke('getSqlModelsGlobal'),
    getSqlModelsProject: (currentPath) => ipcRenderer.invoke('getSqlModelsProject', currentPath),
    saveSqlModelGlobal: (modelData) => ipcRenderer.invoke('saveSqlModelGlobal', modelData),
    saveSqlModelProject: (args) => ipcRenderer.invoke('saveSqlModelProject', args),
    deleteSqlModelGlobal: (modelId) => ipcRenderer.invoke('deleteSqlModelGlobal', modelId),
    deleteSqlModelProject: (args) => ipcRenderer.invoke('deleteSqlModelProject', args),
    runSqlModel: (args) => ipcRenderer.invoke('runSqlModel', args),

    // Local Model Provider APIs (LM Studio, Ollama, llama.cpp, GGUF)
    scanLocalModels: (provider) => ipcRenderer.invoke('scan-local-models', provider),
    getLocalModelStatus: (provider) => ipcRenderer.invoke('get-local-model-status', provider),
    scanGgufModels: (directory) => ipcRenderer.invoke('scan-gguf-models', directory),
    browseGgufFile: () => ipcRenderer.invoke('browse-gguf-file'),
    downloadHfModel: (params) => ipcRenderer.invoke('download-hf-model', params),
    searchHfModels: (params) => ipcRenderer.invoke('search-hf-models', params),
    listHfFiles: (params) => ipcRenderer.invoke('list-hf-files', params),
    downloadHfFile: (params) => ipcRenderer.invoke('download-hf-file', params),

    // Activity Tracking for RNN predictor
    trackActivity: (activity) => ipcRenderer.invoke('track-activity', activity),
    getActivityPredictions: () => ipcRenderer.invoke('get-activity-predictions'),
    trainActivityModel: () => ipcRenderer.invoke('train-activity-model'),

    // Password Manager APIs
    passwordSave: (params) => ipcRenderer.invoke('password-save', params),
    passwordGetForSite: (site) => ipcRenderer.invoke('password-get-for-site', { site }),
    passwordGet: (id) => ipcRenderer.invoke('password-get', { id }),
    passwordList: () => ipcRenderer.invoke('password-list'),
    passwordDelete: (id) => ipcRenderer.invoke('password-delete', { id }),
    passwordEncryptionStatus: () => ipcRenderer.invoke('password-encryption-status'),

    // Python Environment Configuration
    pythonEnvGet: (workspacePath) => ipcRenderer.invoke('python-env-get', { workspacePath }),
    pythonEnvSave: (workspacePath, envConfig) => ipcRenderer.invoke('python-env-save', { workspacePath, envConfig }),
    pythonEnvDelete: (workspacePath) => ipcRenderer.invoke('python-env-delete', { workspacePath }),
    pythonEnvList: () => ipcRenderer.invoke('python-env-list'),
    pythonEnvDetect: (workspacePath) => ipcRenderer.invoke('python-env-detect', { workspacePath }),
    pythonEnvResolve: (workspacePath) => ipcRenderer.invoke('python-env-resolve', { workspacePath }),
    pythonEnvCreate: (workspacePath, venvName, pythonPath) => ipcRenderer.invoke('python-env-create', { workspacePath, venvName, pythonPath }),
    pythonEnvCheckConfigured: (workspacePath) => ipcRenderer.invoke('python-env-check-configured', { workspacePath }),
    pythonEnvListPackages: (workspacePath) => ipcRenderer.invoke('python-env-list-packages', workspacePath),
    pythonEnvInstallPackage: (workspacePath, packageName, extraArgs) => ipcRenderer.invoke('python-env-install-package', workspacePath, packageName, extraArgs),
    pythonEnvUninstallPackage: (workspacePath, packageName) => ipcRenderer.invoke('python-env-uninstall-package', workspacePath, packageName),

    // User profile
    profileGet: () => ipcRenderer.invoke('profile:get'),
    profileSave: (profile) => ipcRenderer.invoke('profile:save', profile),

    // First-run setup
    setupCheckNeeded: () => ipcRenderer.invoke('setup:checkNeeded'),
    setupGetBackendPythonPath: () => ipcRenderer.invoke('setup:getBackendPythonPath'),
    setupDetectPython: () => ipcRenderer.invoke('setup:detectPython'),
    setupCreateVenv: () => ipcRenderer.invoke('setup:createVenv'),
    setupInstallNpcpy: (pythonPath, extras) => ipcRenderer.invoke('setup:installNpcpy', { pythonPath, extras }),
    setupComplete: (pythonPath) => ipcRenderer.invoke('setup:complete', { pythonPath }),
    setupSkip: () => ipcRenderer.invoke('setup:skip'),
    setupReset: () => ipcRenderer.invoke('setup:reset'),
    setupRestartBackend: () => ipcRenderer.invoke('setup:restartBackend'),
    onSetupInstallProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('setup:installProgress', handler);
        return () => ipcRenderer.removeListener('setup:installProgress', handler);
    },

    generativeFill: async (params) => {
    return ipcRenderer.invoke('generative-fill', params);
},
    fineTuneDiffusers: (params) => ipcRenderer.invoke('finetune-diffusers', params),
    getFineTuneStatus: (jobId) => ipcRenderer.invoke('get-finetune-status', jobId),

    // Instruction fine-tuning (SFT, USFT, DPO, memory_classifier)
    fineTuneInstruction: (params) => ipcRenderer.invoke('finetune-instruction', params),
    getInstructionFineTuneStatus: (jobId) => ipcRenderer.invoke('get-instruction-finetune-status', jobId),
    getInstructionModels: (currentPath) => ipcRenderer.invoke('get-instruction-models', currentPath),

    // Genetic evolution population management
    createGeneticPopulation: (params) => ipcRenderer.invoke('genetic-create-population', params),
    evolvePopulation: (params) => ipcRenderer.invoke('genetic-evolve', params),
    getPopulation: (populationId) => ipcRenderer.invoke('genetic-get-population', populationId),
    listPopulations: () => ipcRenderer.invoke('genetic-list-populations'),
    deletePopulation: (populationId) => ipcRenderer.invoke('genetic-delete-population', populationId),
    injectIndividuals: (params) => ipcRenderer.invoke('genetic-inject', params),
    saveGeneratedImage: (blob, folderPath, filename) => ipcRenderer.invoke('save-generated-image', blob, folderPath, filename),


getFileStats: (filePath) => ipcRenderer.invoke('getFileStats', filePath),

openFile: (path) => ipcRenderer.invoke('open-file', path),

writeFileBuffer: (path, uint8) => ipcRenderer.invoke('write-file-buffer', path, uint8),

compileLatex: (path, opts) => ipcRenderer.invoke('compile-latex', path, opts),

fileExists: (path) => ipcRenderer.invoke('file-exists', path),

    getNPCTeamProject: async (currentPath) => {
        if (!currentPath || typeof currentPath !== 'string') {
          throw new Error('currentPath must be a string');
        }
        return await ipcRenderer.invoke('getNPCTeamProject', currentPath);
    },
    getNPCTeamGlobal: () => ipcRenderer.invoke('getNPCTeamGlobal'),
    onBrowserShowContextMenu: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('browser-show-context-menu', handler);
        return () => ipcRenderer.removeListener('browser-show-context-menu', handler);
    },
    browserGetPageContent: (args) => ipcRenderer.invoke('browser-get-page-content', args),
    
   
    getMessageAttachments: (messageId) => ipcRenderer.invoke('get-message-attachments', messageId),
    getAttachment: (attachmentId) => ipcRenderer.invoke('get-attachment', attachmentId),
    get_attachment_response: (attachmentData, conversationId) =>
        ipcRenderer.invoke('get_attachment_response', attachmentData, conversationId),

   
    loadGlobalSettings: () => ipcRenderer.invoke('loadGlobalSettings'),
    saveGlobalSettings: (args) => ipcRenderer.invoke('saveGlobalSettings', args),
    loadProjectSettings: (path) => ipcRenderer.invoke('loadProjectSettings', path),
    saveProjectSettings: (args) => ipcRenderer.invoke('saveProjectSettings', args),

    npcshCheck: () => ipcRenderer.invoke('npcsh-check'),
    npcshPackageContents: () => ipcRenderer.invoke('npcsh-package-contents'),
    npcshInit: () => ipcRenderer.invoke('npcsh-init'),
    deployIncognideTeam: () => ipcRenderer.invoke('deploy-incognide-team'),

    // NPC Team Sync
    npcTeamSyncStatus: () => ipcRenderer.invoke('npc-team:sync-status'),
    npcTeamSyncInit: () => ipcRenderer.invoke('npc-team:sync-init'),
    npcTeamSyncPull: () => ipcRenderer.invoke('npc-team:sync-pull'),
    npcTeamSyncResolve: (args) => ipcRenderer.invoke('npc-team:sync-resolve', args),
    npcTeamSyncCommit: (args) => ipcRenderer.invoke('npc-team:sync-commit', args),
    npcTeamSyncDiff: (args) => ipcRenderer.invoke('npc-team:sync-diff', args),

    getLogsDir: () => ipcRenderer.invoke('getLogsDir'),
    readLogFile: (logType) => ipcRenderer.invoke('readLogFile', logType),

    getAvailableModels: (currentPath) => ipcRenderer.invoke('getAvailableModels', currentPath),
    updateShortcut: (shortcut) => ipcRenderer.invoke('update-shortcut', shortcut),

        checkOllamaStatus: () => ipcRenderer.invoke('ollama:checkStatus'),
    installOllama: () => ipcRenderer.invoke('ollama:install'),
    getLocalOllamaModels: () => ipcRenderer.invoke('ollama:getLocalModels'),
    pullOllamaModel: (args) => ipcRenderer.invoke('ollama:pullModel', args),
    deleteOllamaModel: (args) => ipcRenderer.invoke('ollama:deleteModel', args),

   
    onOllamaPullProgress: (callback) => {
        const handler = (_, progress) => callback(progress);
        ipcRenderer.on('ollama-pull-progress', handler);
        return () => ipcRenderer.removeListener('ollama-pull-progress', handler);
    },
    onOllamaPullComplete: (callback) => {
        ipcRenderer.on('ollama-pull-complete', callback);
        return () => ipcRenderer.removeListener('ollama-pull-complete', callback);
    },
    onOllamaPullError: (callback) => {
        const handler = (_, error) => callback(error);
        ipcRenderer.on('ollama-pull-error', handler);
        return () => ipcRenderer.removeListener('ollama-pull-error', handler);
    },

   
    onShowMacroInput: (callback) => {
      ipcRenderer.on('show-macro-input', callback);
      return () => ipcRenderer.removeListener('show-macro-input', callback);
    },
    submitMacro: (macro) => ipcRenderer.invoke('submit-macro', macro),
    onScreenshotCaptured: (callback) => {
        const wrappedCallback = (_, data) => callback(data);
        ipcRenderer.on('screenshot-captured', wrappedCallback);
        return () => ipcRenderer.removeListener('screenshot-captured', wrappedCallback);
    },

    showPromptDialog: (options) => ipcRenderer.invoke('showPromptDialog', options),
    checkServerConnection: () => ipcRenderer.invoke('checkServerConnection'),
    openExternal: (url) => ipcRenderer.invoke('openExternal', url),

    // Jupyter Kernel APIs
    jupyterListKernels: (args) => ipcRenderer.invoke('jupyter:listKernels', args),
    jupyterStartKernel: (args) => ipcRenderer.invoke('jupyter:startKernel', args),
    jupyterExecuteCode: (args) => ipcRenderer.invoke('jupyter:executeCode', args),
    jupyterInterruptKernel: (args) => ipcRenderer.invoke('jupyter:interruptKernel', args),
    jupyterStopKernel: (args) => ipcRenderer.invoke('jupyter:stopKernel', args),
    jupyterGetRunningKernels: () => ipcRenderer.invoke('jupyter:getRunningKernels'),
    jupyterGetVariables: (args) => ipcRenderer.invoke('jupyter:getVariables', args),
    jupyterGetDataFrame: (args) => ipcRenderer.invoke('jupyter:getDataFrame', args),
    jupyterCheckInstalled: (args) => ipcRenderer.invoke('jupyter:checkInstalled', args),
    jupyterInstall: (args) => ipcRenderer.invoke('jupyter:install', args),
    jupyterRegisterKernel: (args) => ipcRenderer.invoke('jupyter:registerKernel', args),
    onJupyterKernelStopped: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('jupyter:kernelStopped', handler);
        return () => ipcRenderer.removeListener('jupyter:kernelStopped', handler);
    },
    onJupyterInstallProgress: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('jupyter:installProgress', handler);
        return () => ipcRenderer.removeListener('jupyter:installProgress', handler);
    },

    // Version and Update APIs
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
