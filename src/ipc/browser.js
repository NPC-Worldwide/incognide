const { BrowserView, dialog, session, shell, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Module-local state
const browserViews = new Map();
const activeDownloads = new Map();
const sessionsWithDownloadHandler = new WeakSet();

// ==================== BROWSER EXTENSIONS STATE ====================
const extensionsDir = path.join(os.homedir(), '.npcsh', 'incognide', 'extensions');
const extensionsConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'extensions.json');
const loadedExtensions = new Map(); // extensionId => extension object

// Ensure extensions directory exists
const ensureExtensionsDir = async () => {
  await fsPromises.mkdir(extensionsDir, { recursive: true });
};

// Load extensions config
const loadExtensionsConfig = async () => {
  try {
    await ensureExtensionsDir();
    const data = await fsPromises.readFile(extensionsConfigPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { extensions: [], enabled: {} };
  }
};

// Save extensions config
const saveExtensionsConfig = async (config) => {
  await ensureExtensionsDir();
  await fsPromises.writeFile(extensionsConfigPath, JSON.stringify(config, null, 2));
};

// Load previously saved extensions on startup
const loadSavedExtensions = async () => {
  try {
    const config = await loadExtensionsConfig();
    const browserSession = session.fromPartition('persist:default-browser-session');

    for (const ext of config.extensions) {
      if (config.enabled[ext.id] !== false && ext.path) {
        try {
          const extension = await browserSession.loadExtension(ext.path, { allowFileAccess: true });
          loadedExtensions.set(extension.id, extension);
          console.log(`[Extensions] Loaded: ${extension.name}`);
        } catch (err) {
          console.log(`[Extensions] Failed to load ${ext.name}: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.log('[Extensions] No saved extensions to load');
  }
};

// ==================== COOKIE INHERITANCE STATE ====================
const cookieInheritanceConfigPath = path.join(os.homedir(), '.npcsh', 'incognide', 'cookie-inheritance.json');
const knownPartitionsPath = path.join(os.homedir(), '.npcsh', 'incognide', 'known-partitions.json');

// Load/save known partitions (folders that have been used with browser)
const loadKnownPartitions = async () => {
  try {
    const data = await fsPromises.readFile(knownPartitionsPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { partitions: [] };
  }
};

const saveKnownPartitions = async (data) => {
  const dir = path.dirname(knownPartitionsPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(knownPartitionsPath, JSON.stringify(data, null, 2));
};

// Load/save cookie inheritance config
const loadCookieInheritanceConfig = async () => {
  try {
    const data = await fsPromises.readFile(cookieInheritanceConfigPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { inheritance: {} }; // { targetPartition: [sourcePartitions] }
  }
};

const saveCookieInheritanceConfig = async (data) => {
  const dir = path.dirname(cookieInheritanceConfigPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(cookieInheritanceConfigPath, JSON.stringify(data, null, 2));
};

// ==================== PASSWORD MANAGER STATE ====================
const passwordsFilePath = path.join(os.homedir(), '.npcsh', 'incognide', 'credentials.enc');

// Ensure the credentials file exists
const ensurePasswordsFile = async () => {
  const dir = path.dirname(passwordsFilePath);
  await fsPromises.mkdir(dir, { recursive: true });
  try {
    await fsPromises.access(passwordsFilePath);
  } catch {
    // File doesn't exist, create empty encrypted store
    const emptyData = JSON.stringify({ credentials: [] });
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(emptyData);
      await fsPromises.writeFile(passwordsFilePath, encrypted);
    } else {
      // Fallback to base64 if encryption not available (less secure)
      await fsPromises.writeFile(passwordsFilePath, Buffer.from(emptyData).toString('base64'));
    }
  }
};

// Read all credentials
const readCredentials = async () => {
  await ensurePasswordsFile();
  const fileContent = await fsPromises.readFile(passwordsFilePath);
  let decrypted;
  if (safeStorage.isEncryptionAvailable()) {
    decrypted = safeStorage.decryptString(fileContent);
  } else {
    decrypted = Buffer.from(fileContent.toString(), 'base64').toString('utf8');
  }
  return JSON.parse(decrypted);
};

// Write all credentials
const writeCredentials = async (data) => {
  await ensurePasswordsFile();
  const jsonData = JSON.stringify(data);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(jsonData);
    await fsPromises.writeFile(passwordsFilePath, encrypted);
  } else {
    await fsPromises.writeFile(passwordsFilePath, Buffer.from(jsonData).toString('base64'));
  }
};

// ==================== WEB CONTENTS HANDLER (called from main.js) ====================
/**
 * Sets up browser-related handlers on newly created web contents.
 * Called from app.on('web-contents-created') in main.js.
 */
function setupWebContentsHandlers(contents, getMainWindow, log) {
  // Handle context menu for webviews
  contents.on('context-menu', async (e, params) => {
    // Only handle for webviews (type 'webview')
    if (contents.getType() === 'webview') {
      e.preventDefault();

      // Get selected text
      const selectedText = params.selectionText || '';
      const linkURL = params.linkURL || '';
      const srcURL = params.srcURL || '';
      const pageURL = params.pageURL || '';
      const isEditable = params.isEditable || false;
      const mediaType = params.mediaType || 'none';

      log(`[CONTEXT MENU] Webview context menu: selectedText="${selectedText.substring(0, 50)}...", linkURL="${linkURL}", mediaType="${mediaType}"`);

      // Send context menu event to renderer
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Get exact cursor position from screen
        const cursorPos = screen.getCursorScreenPoint();
        const windowBounds = mainWindow.getBounds();

        mainWindow.webContents.send('browser-show-context-menu', {
          x: cursorPos.x - windowBounds.x,
          y: cursorPos.y - windowBounds.y,
          selectedText,
          linkURL,
          srcURL,
          pageURL,
          isEditable,
          mediaType,
          canCopy: selectedText.length > 0,
          canPaste: isEditable,
          canSaveImage: mediaType === 'image' && srcURL,
          canSaveLink: !!linkURL,
        });
      }
    }
  });

  // Handle downloads from webviews - send to renderer's download manager
  if (contents.getType() === 'webview') {
    const sess = contents.session;
    if (sess && !sessionsWithDownloadHandler.has(sess)) {
      sessionsWithDownloadHandler.add(sess);

      sess.on('will-download', (e, item, webContents) => {
        const url = item.getURL();
        const filename = item.getFilename();

        log(`[DOWNLOAD] Intercepted download: ${filename} from ${url}`);

        // Cancel immediately - renderer will handle via download manager
        item.cancel();

        // Send to renderer's download manager
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browser-download-requested', {
            url,
            filename,
            mimeType: item.getMimeType(),
            totalBytes: item.getTotalBytes()
          });
        }
      });
    }
  }
}

// ==================== REGISTER IPC HANDLERS ====================
function register(ctx) {
  const { ipcMain, getMainWindow, dbQuery, app, log } = ctx;

  // ---- browser-get-page-content ----
  ipcMain.handle('browser-get-page-content', async (event, { viewId }) => {
    if (browserViews.has(viewId)) {
        const browserState = browserViews.get(viewId);
        try {
            // Extract text content from the page
            const pageContent = await browserState.view.webContents.executeJavaScript(`
                (function() {
                    // Get main content, skip nav/footer/ads
                    const main = document.querySelector('main, article, .content, #content') || document.body;

                    // Remove script, style, nav, footer elements
                    const clone = main.cloneNode(true);
                    clone.querySelectorAll('script, style, nav, footer, aside, .nav, .footer, .ads').forEach(el => el.remove());

                    // Get text content
                    let text = clone.innerText || clone.textContent;

                    // Clean up whitespace
                    text = text.replace(/\\s+/g, ' ').trim();

                    // Limit to ~4000 chars to avoid token limits
                    return text.substring(0, 4000);
                })();
            `);

            return {
                success: true,
                content: pageContent,
                url: browserState.view.webContents.getURL(),
                title: browserState.view.webContents.getTitle()
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-add-to-history ----
  ipcMain.handle('browser-add-to-history', async (event, { url, title, folderPath }) => {
    try {
        if (!url || url === 'about:blank') return { success: true };
        const existing = await dbQuery('SELECT id FROM browser_history WHERE url = ? AND folder_path = ?', [url, folderPath]);
        if (existing.length > 0) {
            await dbQuery('UPDATE browser_history SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP, title = ? WHERE id = ?', [title, existing[0].id]);
        } else {
            await dbQuery('INSERT INTO browser_history (url, title, folder_path) VALUES (?, ?, ?)', [url, title, folderPath]);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
  });

  // ---- show-browser ----
  ipcMain.handle('show-browser', async (event, { url, bounds, viewId }) => {
    const mainWindow = getMainWindow();
    log(`[BROWSER VIEW] Received 'show-browser' for viewId: ${viewId}`);
    if (!mainWindow) return { success: false, error: 'Main window not found' };

    // Clean up any pre-existing view with the same ID.
    if (browserViews.has(viewId)) {
        const existingState = browserViews.get(viewId);
        mainWindow.removeBrowserView(existingState.view);
        if (existingState.view && !existingState.view.webContents.isDestroyed()) {
            existingState.view.webContents.destroy();
        }
        browserViews.delete(viewId);
    }

    const finalBounds = { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
    log(`[BROWSER VIEW] FINAL calculated bounds for ${viewId}:`, JSON.stringify(finalBounds));

    const newBrowserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        // Use shared partition so all browser panes share cookies/sessions
        // This is needed for Google services to work (auth persists across tabs)
        partition: 'persist:browser-shared',
      },
    });

    // Set Chrome-like user agent so Google services (Drive, Docs, etc.) work properly
    // Extract Chrome version from Electron's user agent and use standard Chrome UA
    const electronUA = newBrowserView.webContents.getUserAgent();
    const chromeMatch = electronUA.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    const chromeVersion = chromeMatch ? chromeMatch[1] : '120.0.0.0';
    let platformUA;
    if (process.platform === 'win32') {
      platformUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    } else if (process.platform === 'darwin') {
      platformUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    } else {
      platformUA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    }
    newBrowserView.webContents.setUserAgent(platformUA);

    newBrowserView.setBackgroundColor('#0f172a');

    mainWindow.addBrowserView(newBrowserView);
    newBrowserView.setBounds(finalBounds);

    // Enable auto-resize with clipping
    newBrowserView.setAutoResize({
      width: true,
      height: true,
      horizontal: true,
      vertical: true
    });

    // Store with clipping enabled flag
    browserViews.set(viewId, {
      view: newBrowserView,
      bounds: finalBounds,
      visible: true
    });

    const wc = newBrowserView.webContents;

    // Handle popup windows (window.open, target="_blank")
    wc.setWindowOpenHandler(({ url, disposition }) => {
      log('[Browser] window.open intercepted:', url, 'disposition:', disposition);

      // Google auth - open in system browser for proper auth flow
      if (url.includes('accounts.google.com') ||
          url.includes('accounts.youtube.com') ||
          url.includes('myaccount.google.com')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }

      // Google widgets (contacts hovercard, etc.) - allow as popups
      if (url.includes('contacts.google.com/widget') ||
          url.includes('apis.google.com') ||
          url.includes('plus.google.com')) {
        return { action: 'allow' };
      }

      // about:blank or empty URLs: sites like Google Drive call window.open('')
      // then set the popup's location. We can't capture the final URL from here,
      // so allow it and intercept navigation on the created window.
      if (!url || url === 'about:blank') {
        log('[Browser] Allowing about:blank popup - will intercept navigation');
        return { action: 'allow' };
      }

      // All other URLs: open in a new browser tab in the app
      const mw = getMainWindow();
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('browser-open-in-new-tab', { url, disposition });
      }
      return { action: 'deny' };
    });

    // Intercept popup windows (from about:blank opens) to capture real navigation
    wc.on('did-create-window', (newWindow) => {
      log('[Browser] Popup window created, intercepting navigation');
      const newWc = newWindow.webContents;
      let handled = false;

      const forwardAndClose = (realUrl) => {
        if (handled) return;
        if (!realUrl || realUrl === 'about:blank') return;
        handled = true;
        log('[Browser] Popup navigated to:', realUrl, '- forwarding to renderer');
        const mw = getMainWindow();
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send('browser-open-in-new-tab', { url: realUrl, disposition: 'new-window' });
        }
        try { newWindow.close(); } catch (e) {}
      };

      // The opener script sets window.location after creation
      newWc.on('will-navigate', (event, navUrl) => {
        log('[Browser] Popup will-navigate:', navUrl);
        forwardAndClose(navUrl);
      });
      newWc.on('did-navigate', (event, navUrl) => {
        log('[Browser] Popup did-navigate:', navUrl);
        forwardAndClose(navUrl);
      });
      // Also catch in-page redirects
      newWc.on('will-redirect', (event, navUrl) => {
        log('[Browser] Popup will-redirect:', navUrl);
        forwardAndClose(navUrl);
      });

      // Fallback: close orphaned popup after 8s
      setTimeout(() => {
        if (!handled) {
          log('[Browser] Popup timeout - closing unhandled popup');
          // Before closing, check if it navigated somewhere useful
          try {
            const finalUrl = newWc.getURL();
            if (finalUrl && finalUrl !== 'about:blank') {
              forwardAndClose(finalUrl);
            } else {
              newWindow.close();
            }
          } catch (e) {
            try { newWindow.close(); } catch (e2) {}
          }
        }
      }, 8000);
    });

    // Listeners now only send events to the renderer; they do not register handlers.
    wc.on('did-navigate', (event, navigatedUrl) => {
        const mw = getMainWindow();
        mw.webContents.send('browser-loaded', { viewId, url: navigatedUrl, title: wc.getTitle() });
    });
    wc.on('did-start-loading', () => {
        const mw = getMainWindow();
        mw.webContents.send('browser-loading', { viewId, loading: true });
    });
    wc.on('page-title-updated', (e, title) => {
        const mw = getMainWindow();
        mw.webContents.send('browser-title-updated', { viewId, title });
    });
    wc.on('did-stop-loading', () => {
        const mw = getMainWindow();
        mw.webContents.send('browser-loading', { viewId, loading: false });
        mw.webContents.send('browser-navigation-state-updated', { viewId, canGoBack: wc.canGoBack(), canGoForward: wc.canGoForward() });
    });

    // Downloads handled by app.on('web-contents-created') handler

    const finalURL = url.startsWith('http') ? url : `https://${url}`;
    wc.loadURL(finalURL).catch(err => log(`[BROWSER VIEW ${viewId}] loadURL promise rejected: ${err.message}`));

    return { success: true, viewId };
  });

  // ---- browser-save-image ----
  ipcMain.handle('browser-save-image', async (event, { imageUrl, currentPath }) => {
    try {
        const mainWindow = getMainWindow();
        if (!currentPath) {
            return { success: false, error: 'No workspace directory provided' };
        }
        const url = new URL(imageUrl);
        const filename = path.basename(url.pathname) || 'image.png';
        const defaultPath = path.join(currentPath, filename);

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Image',
            defaultPath: defaultPath,
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        // Download the image
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.buffer();
        await fsPromises.writeFile(result.filePath, buffer);

        log(`[BROWSER] Image saved to: ${result.filePath}`);
        return { success: true, path: result.filePath };
    } catch (err) {
        log(`[BROWSER] Error saving image: ${err.message}`);
        return { success: false, error: err.message };
    }
  });

  // ---- browser-save-link ----
  ipcMain.handle('browser-save-link', async (event, { url, suggestedFilename, currentPath }) => {
    const mainWindow = getMainWindow();
    const controller = new AbortController();

    try {
        // Use workspace path or downloads folder
        const saveDir = currentPath || app.getPath('downloads');
        const filename = suggestedFilename || path.basename(new URL(url).pathname) || 'download';

        // Ensure unique filename if it already exists
        let finalPath = path.join(saveDir, filename);
        let counter = 1;
        while (fs.existsSync(finalPath)) {
            const ext = path.extname(filename);
            const base = path.basename(filename, ext);
            finalPath = path.join(saveDir, `${base} (${counter})${ext}`);
            counter++;
        }

        const downloadFilename = path.basename(finalPath);

        // Track this download
        activeDownloads.set(downloadFilename, { controller, paused: false });

        log(`[BROWSER] Starting download: ${filename} to ${finalPath}`);

        // Download the file with progress tracking
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        let received = 0;

        // Stream the response to file
        const fileStream = fs.createWriteStream(finalPath);
        const reader = response.body;

        for await (const chunk of reader) {
            // Check if cancelled
            if (controller.signal.aborted) {
                fileStream.destroy();
                fs.unlinkSync(finalPath);
                throw new Error('Download cancelled');
            }

            fileStream.write(chunk);
            received += chunk.length;

            // Send progress to renderer
            if (contentLength > 0 && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-progress', {
                    filename: downloadFilename,
                    received,
                    total: contentLength,
                    percent: Math.round((received / contentLength) * 100)
                });
            }
        }

        fileStream.end();
        activeDownloads.delete(downloadFilename);

        log(`[BROWSER] Download completed: ${finalPath}`);

        // Send completion event
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-complete', {
                filename: downloadFilename,
                path: finalPath,
                state: 'completed'
            });
        }

        return { success: true, path: finalPath };
    } catch (err) {
        const downloadFilename = suggestedFilename || 'download';
        activeDownloads.delete(downloadFilename);

        if (err.name === 'AbortError' || err.message === 'Download cancelled') {
            log(`[BROWSER] Download cancelled: ${downloadFilename}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-complete', {
                    filename: downloadFilename,
                    state: 'cancelled'
                });
            }
            return { success: false, cancelled: true };
        }

        log(`[BROWSER] Error saving link: ${err.message}`);
        return { success: false, error: err.message };
    }
  });

  // ---- cancel-download ----
  ipcMain.handle('cancel-download', async (event, filename) => {
    const download = activeDownloads.get(filename);
    if (download) {
        download.controller.abort();
        activeDownloads.delete(filename);
        log(`[BROWSER] Cancelled download: ${filename}`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
  });

  // ---- pause-download ----
  ipcMain.handle('pause-download', async (event, filename) => {
    // Note: Pause/resume with fetch requires range request support - this is a placeholder
    const download = activeDownloads.get(filename);
    if (download) {
        download.paused = true;
        log(`[BROWSER] Pause requested for: ${filename} (not fully implemented)`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
  });

  // ---- resume-download ----
  ipcMain.handle('resume-download', async (event, filename) => {
    // Note: Pause/resume with fetch requires range request support - this is a placeholder
    const download = activeDownloads.get(filename);
    if (download) {
        download.paused = false;
        log(`[BROWSER] Resume requested for: ${filename} (not fully implemented)`);
        return { success: true };
    }
    return { success: false, error: 'Download not found' };
  });

  // ---- browser-open-external ----
  ipcMain.handle('browser-open-external', async (event, { url }) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        log(`[BROWSER] Error opening external URL: ${err.message}`);
        return { success: false, error: err.message };
    }
  });

  // ---- browser:set-visibility ----
  ipcMain.handle('browser:set-visibility', (event, { viewId, visible }) => {
    if (browserViews.has(viewId)) {
        const browserState = browserViews.get(viewId);
        if (visible) {
            log(`[BROWSER VIEW] Setting visibility to TRUE for ${viewId}`);
            browserState.view.setBounds(browserState.bounds); // Use stored bounds
            browserState.visible = true;
        } else {
            log(`[BROWSER VIEW] Setting visibility to FALSE for ${viewId}`);

            browserState.view.setBounds({ x: -2000, y: -2000, width: 0, height: 0 });
            browserState.visible = false;
        }
        return { success: true };
    }
    return { success: false, error: 'View not found' };
  });

  // ---- update-browser-bounds ----
  ipcMain.handle('update-browser-bounds', (event, { viewId, bounds }) => {
    if (browserViews.has(viewId)) {
      const mainWindow = getMainWindow();
      const browserState = browserViews.get(viewId);

      // Get main window bounds to establish hard limits
      const winBounds = mainWindow.getBounds();

      // Clip bounds to NEVER exceed the pane's boundaries
      const adjustedBounds = {
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: Math.min(
          Math.round(bounds.width),
          winBounds.width - Math.round(bounds.x)
        ),
        height: Math.min(
          Math.round(bounds.height),
          winBounds.height - Math.round(bounds.y)
        )
      };
      console.log(`[BROWSER ${viewId}] Setting bounds:`, adjustedBounds);
      console.log(`[BROWSER ${viewId}] Window size:`, mainWindow.getBounds());

      browserState.bounds = adjustedBounds;

      if (browserState.visible) {
        browserState.view.setBounds(adjustedBounds);
      }
      return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- hide-browser ----
  ipcMain.handle('hide-browser', (event, { viewId }) => {
    const mainWindow = getMainWindow();
    log(`[BROWSER VIEW] Received 'hide-browser' for viewId: ${viewId}`);
    if (browserViews.has(viewId) && mainWindow && !mainWindow.isDestroyed()) {
        log(`[BROWSER VIEW] Removing and destroying BrowserView for ${viewId}`);
        const browserState = browserViews.get(viewId);
        mainWindow.removeBrowserView(browserState.view);
        browserState.view.webContents.destroy();
        browserViews.delete(viewId);
        return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser:addToHistory ----
  ipcMain.handle('browser:addToHistory', async (event, { url, title, folderPath, paneId, navigationType = 'click', fromUrl }) => {
    try {
      if (!url || url === 'about:blank') {
        log('[BROWSER HISTORY] Skipping add to history for blank or invalid URL:', url);
        return { success: true, message: 'Skipped blank URL' };
      }

      const existing = await dbQuery(
        'SELECT id, visit_count FROM browser_history WHERE url = ? AND folder_path = ?',
        [url, folderPath]
      );

      if (existing.length > 0) {
        await dbQuery(
          'UPDATE browser_history SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP, title = ?, pane_id = ?, navigation_type = ? WHERE id = ?',
          [title, paneId, navigationType, existing[0].id]
        );
        log(`[BROWSER HISTORY] Updated history for ${url} in ${folderPath}`);
      } else {
        await dbQuery(
          'INSERT INTO browser_history (url, title, folder_path, pane_id, navigation_type) VALUES (?, ?, ?, ?, ?)',
          [url, title, folderPath, paneId, navigationType]
        );
        log(`[BROWSER HISTORY] Added new history entry for ${url} in ${folderPath}`);
      }

      // Record the navigation edge if we have a fromUrl (previous page in this pane)
      if (fromUrl && fromUrl !== 'about:blank' && fromUrl !== url) {
        await dbQuery(
          'INSERT INTO browser_navigations (pane_id, from_url, to_url, navigation_type, folder_path) VALUES (?, ?, ?, ?, ?)',
          [paneId, fromUrl, url, navigationType, folderPath]
        );
        log(`[BROWSER HISTORY] Recorded navigation: ${fromUrl} -> ${url} (${navigationType})`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- get-browser-history ----
  ipcMain.handle('get-browser-history', async (event, folderPath) => {
    try {
      // Only return history entries for this specific folder
      const history = await dbQuery(
        'SELECT id, title, url, folder_path, visit_count, last_visited FROM browser_history WHERE folder_path = ? ORDER BY last_visited DESC LIMIT 50',
        [folderPath]
      );
      log(`[BROWSER HISTORY] Retrieved ${history.length} history entries for ${folderPath}`);
      return { history };
    } catch (error) {
      log(`[BROWSER HISTORY] Error getting history for ${folderPath}:`, error);
      return { error: error.message };
    }
  });

  // ---- browser:getHistory ----
  ipcMain.handle('browser:getHistory', async (event, { folderPath, limit = 50 }) => {
    try {
      const history = await dbQuery(
        'SELECT * FROM browser_history WHERE folder_path = ? ORDER BY last_visited DESC LIMIT ?',
        [folderPath, limit]
      );
      log(`[BROWSER HISTORY] Retrieved ${history.length} history entries for ${folderPath}`);
      return { success: true, history };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:addBookmark ----
  ipcMain.handle('browser:addBookmark', async (event, { url, title, folderPath, isGlobal = false }) => {
    try {
      if (!url || url === 'about:blank') { // Don't bookmark blank pages
        log('[BROWSER BOOKMARKS] Skipping add bookmark for blank or invalid URL:', url);
        return { success: false, error: 'Cannot bookmark a blank or invalid URL.' };
      }
      await dbQuery(
        'INSERT INTO bookmarks (url, title, folder_path, is_global) VALUES (?, ?, ?, ?)',
        [url, title, isGlobal ? null : folderPath, isGlobal ? 1 : 0]
      );
      log(`[BROWSER BOOKMARKS] Added bookmark: ${title} (${url})`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getBookmarks ----
  ipcMain.handle('browser:getBookmarks', async (event, { folderPath }) => {
    try {

      const bookmarks = await dbQuery(
        'SELECT * FROM bookmarks WHERE (folder_path = ? OR is_global = 1) ORDER BY is_global ASC, timestamp DESC',
        [folderPath]
      );
      log(`[BROWSER BOOKMARKS] Retrieved ${bookmarks.length} bookmarks for ${folderPath}`);
      return { success: true, bookmarks };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:deleteBookmark ----
  ipcMain.handle('browser:deleteBookmark', async (event, { bookmarkId }) => {
    try {
      await dbQuery('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);
      log(`[BROWSER BOOKMARKS] Deleted bookmark ID: ${bookmarkId}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:setSiteLimit ----
  ipcMain.handle('browser:setSiteLimit', async (event, { domain, folderPath, hourlyTimeLimit, dailyTimeLimit, hourlyVisitLimit, dailyVisitLimit, isGlobal = false }) => {
    try {
      // Upsert - insert or update on conflict
      await dbQuery(
        `INSERT INTO site_limits (domain, folder_path, is_global, hourly_time_limit, daily_time_limit, hourly_visit_limit, daily_visit_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(domain, folder_path) DO UPDATE SET
           hourly_time_limit = excluded.hourly_time_limit,
           daily_time_limit = excluded.daily_time_limit,
           hourly_visit_limit = excluded.hourly_visit_limit,
           daily_visit_limit = excluded.daily_visit_limit`,
        [domain, isGlobal ? null : folderPath, isGlobal ? 1 : 0, hourlyTimeLimit || 0, dailyTimeLimit || 0, hourlyVisitLimit || 0, dailyVisitLimit || 0]
      );
      log(`[SITE LIMITS] Set limits for ${domain}: hourlyTime=${hourlyTimeLimit}, dailyTime=${dailyTimeLimit}, hourlyVisits=${hourlyVisitLimit}, dailyVisits=${dailyVisitLimit}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getSiteLimits ----
  ipcMain.handle('browser:getSiteLimits', async (event, { folderPath }) => {
    try {
      const limits = await dbQuery(
        'SELECT * FROM site_limits WHERE (folder_path = ? OR is_global = 1)',
        [folderPath]
      );
      return { success: true, limits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:deleteSiteLimit ----
  ipcMain.handle('browser:deleteSiteLimit', async (event, { limitId }) => {
    try {
      await dbQuery('DELETE FROM site_limits WHERE id = ?', [limitId]);
      log(`[SITE LIMITS] Deleted limit ID: ${limitId}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:clearHistory ----
  ipcMain.handle('browser:clearHistory', async (event, { folderPath }) => {
    try {
      await dbQuery('DELETE FROM browser_history WHERE folder_path = ?', [folderPath]);
      await dbQuery('DELETE FROM browser_navigations WHERE folder_path = ?', [folderPath]);
      log(`[BROWSER HISTORY] Cleared history for ${folderPath}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getHistoryGraph ----
  ipcMain.handle('browser:getHistoryGraph', async (event, { folderPath, minVisits = 1, dateFrom, dateTo }) => {
    try {
      // Build date filter clause
      let dateFilter = '';
      const params = [folderPath];
      if (dateFrom) {
        dateFilter += ' AND last_visited >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        dateFilter += ' AND last_visited <= ?';
        params.push(dateTo);
      }

      // Get all history entries as nodes (grouped by domain for cleaner visualization)
      const historyEntries = await dbQuery(
        `SELECT url, title, visit_count, last_visited, pane_id, navigation_type
         FROM browser_history
         WHERE folder_path = ? AND visit_count >= ?${dateFilter}
         ORDER BY visit_count DESC`,
        [...params.slice(0, 1), minVisits, ...params.slice(1)]
      );

      // Get all navigations as edges
      let navDateFilter = '';
      const navParams = [folderPath];
      if (dateFrom) {
        navDateFilter += ' AND timestamp >= ?';
        navParams.push(dateFrom);
      }
      if (dateTo) {
        navDateFilter += ' AND timestamp <= ?';
        navParams.push(dateTo);
      }

      const navigations = await dbQuery(
        `SELECT from_url, to_url, navigation_type, COUNT(*) as weight
         FROM browser_navigations
         WHERE folder_path = ?${navDateFilter}
         GROUP BY from_url, to_url, navigation_type
         ORDER BY weight DESC`,
        navParams
      );

      // Helper to extract domain from URL
      const getDomain = (url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      };

      // Build node map (by domain)
      const domainMap = new Map();
      for (const entry of historyEntries) {
        const domain = getDomain(entry.url);
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            id: domain,
            label: domain,
            visitCount: 0,
            urls: [],
            lastVisited: entry.last_visited
          });
        }
        const node = domainMap.get(domain);
        node.visitCount += entry.visit_count;
        node.urls.push({ url: entry.url, title: entry.title, visits: entry.visit_count });
        if (entry.last_visited > node.lastVisited) {
          node.lastVisited = entry.last_visited;
        }
      }

      // Build edge map (domain to domain)
      const edgeMap = new Map();
      for (const nav of navigations) {
        const fromDomain = getDomain(nav.from_url);
        const toDomain = getDomain(nav.to_url);
        if (fromDomain === toDomain) continue; // Skip self-loops

        const edgeKey = `${fromDomain}->${toDomain}`;
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, {
            source: fromDomain,
            target: toDomain,
            weight: 0,
            clickWeight: 0,
            manualWeight: 0
          });
        }
        const edge = edgeMap.get(edgeKey);
        edge.weight += nav.weight;
        if (nav.navigation_type === 'click') {
          edge.clickWeight += nav.weight;
        } else {
          edge.manualWeight += nav.weight;
        }
      }

      // Convert maps to arrays, filtering to only include nodes that are in navigations
      const allDomains = new Set([...domainMap.keys()]);
      const navigatedDomains = new Set();
      for (const edge of edgeMap.values()) {
        navigatedDomains.add(edge.source);
        navigatedDomains.add(edge.target);
      }

      // Include all domains that have visits, plus any in navigations
      const nodes = Array.from(domainMap.values()).filter(n =>
        n.visitCount >= minVisits || navigatedDomains.has(n.id)
      );
      const links = Array.from(edgeMap.values());

      // Calculate stats
      const totalVisits = nodes.reduce((sum, n) => sum + n.visitCount, 0);
      const totalNavigations = links.reduce((sum, l) => sum + l.weight, 0);
      const topDomains = [...nodes].sort((a, b) => b.visitCount - a.visitCount).slice(0, 10);

      log(`[BROWSER HISTORY GRAPH] Built graph with ${nodes.length} nodes, ${links.length} edges`);

      return {
        success: true,
        nodes,
        links,
        stats: {
          totalNodes: nodes.length,
          totalEdges: links.length,
          totalVisits,
          totalNavigations,
          topDomains: topDomains.map(d => ({ domain: d.id, visits: d.visitCount }))
        }
      };
    } catch (error) {
      log(`[BROWSER HISTORY GRAPH] Error:`, error);
      return { success: false, error: error.message };
    }
  });

  // ---- browser-navigate ----
  ipcMain.handle('browser-navigate', (event, { viewId, url }) => {
    if (browserViews.has(viewId)) {
      const finalURL = url.startsWith('http') ? url : `https://${url}`;
      log(`[BROWSER VIEW] Navigating ${viewId} to: ${finalURL}`);
      browserViews.get(viewId).view.webContents.loadURL(finalURL); // Access webContents via .view
      return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-back ----
  ipcMain.handle('browser-back', (event, { viewId }) => {
    if (browserViews.has(viewId)) {
      const webContents = browserViews.get(viewId).view.webContents; // Access webContents via .view
      if (webContents.canGoBack()) {
        webContents.goBack();
        return { success: true };
      }
      return { success: false, error: 'Cannot go back' };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-forward ----
  ipcMain.handle('browser-forward', (event, { viewId }) => {
    if (browserViews.has(viewId)) {
      const webContents = browserViews.get(viewId).view.webContents; // Access webContents via .view
      if (webContents.canGoForward()) {
        webContents.goForward();
        return { success: true };
      }
      return { success: false, error: 'Cannot go forward' };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-refresh ----
  ipcMain.handle('browser-refresh', (event, { viewId }) => {
    if (browserViews.has(viewId)) {
      browserViews.get(viewId).view.webContents.reload(); // Access webContents via .view
      return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-hard-refresh ----
  ipcMain.handle('browser-hard-refresh', (event, { viewId }) => {
    if (browserViews.has(viewId)) {
      browserViews.get(viewId).view.webContents.reloadIgnoringCache();
      return { success: true };
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ---- browser-get-selected-text ----
  ipcMain.handle('browser-get-selected-text', (event, { viewId }) => {
    if (browserViews.has(viewId)) {
      return new Promise((resolve) => {
        browserViews.get(viewId).view.webContents.executeJavaScript(` // Access webContents via .view
          window.getSelection().toString();
        `).then(selectedText => {
          resolve({ success: true, selectedText });
        }).catch(error => {
          resolve({ success: false, error: error.message });
        });
      });
    }
    return { success: false, error: 'Browser view not found' };
  });

  // ==================== BROWSER EXTENSIONS IPC HANDLERS ====================

  // ---- browser:loadExtension ----
  ipcMain.handle('browser:loadExtension', async (event, extensionPath) => {
    try {
      const browserSession = session.fromPartition('persist:default-browser-session');
      const extension = await browserSession.loadExtension(extensionPath, { allowFileAccess: true });
      loadedExtensions.set(extension.id, extension);

      // Save to config
      const config = await loadExtensionsConfig();
      if (!config.extensions.find(e => e.path === extensionPath)) {
        config.extensions.push({
          id: extension.id,
          name: extension.name,
          path: extensionPath,
          version: extension.version
        });
        config.enabled[extension.id] = true;
        await saveExtensionsConfig(config);
      }

      return { success: true, extension: { id: extension.id, name: extension.name, version: extension.version } };
    } catch (error) {
      console.error('[Extensions] Failed to load extension:', error);
      return { success: false, error: error.message };
    }
  });

  // ---- browser:removeExtension ----
  ipcMain.handle('browser:removeExtension', async (event, extensionId) => {
    try {
      const browserSession = session.fromPartition('persist:default-browser-session');
      await browserSession.removeExtension(extensionId);
      loadedExtensions.delete(extensionId);

      // Remove from config
      const config = await loadExtensionsConfig();
      config.extensions = config.extensions.filter(e => e.id !== extensionId);
      delete config.enabled[extensionId];
      await saveExtensionsConfig(config);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getExtensions ----
  ipcMain.handle('browser:getExtensions', async () => {
    try {
      const browserSession = session.fromPartition('persist:default-browser-session');
      const extensions = browserSession.getAllExtensions();
      const config = await loadExtensionsConfig();

      return {
        success: true,
        extensions: extensions.map(ext => ({
          id: ext.id,
          name: ext.name,
          version: ext.version,
          enabled: config.enabled[ext.id] !== false
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, extensions: [] };
    }
  });

  // ---- browser:toggleExtension ----
  ipcMain.handle('browser:toggleExtension', async (event, { extensionId, enabled }) => {
    try {
      const config = await loadExtensionsConfig();
      config.enabled[extensionId] = enabled;
      await saveExtensionsConfig(config);

      // Reload the browser session to apply changes
      // Note: Electron doesn't have a direct enable/disable, so we'd need to reload
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:selectExtensionFolder ----
  ipcMain.handle('browser:selectExtensionFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Chrome Extension Folder',
      message: 'Select the folder containing the extension manifest.json'
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }

    const extensionPath = result.filePaths[0];

    // Verify it's a valid extension (has manifest.json)
    const manifestPath = path.join(extensionPath, 'manifest.json');
    try {
      await fsPromises.access(manifestPath);
      return { success: true, path: extensionPath };
    } catch {
      return { success: false, error: 'Selected folder does not contain a manifest.json file' };
    }
  });

  // ---- browser:getInstalledBrowsers ----
  ipcMain.handle('browser:getInstalledBrowsers', async () => {
    const browsers = [];
    const homeDir = os.homedir();

    // Common browser profile paths
    const browserPaths = {
      chrome: {
        linux: path.join(homeDir, '.config', 'google-chrome'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
      },
      chromium: {
        linux: path.join(homeDir, '.config', 'chromium'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Chromium'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Chromium', 'User Data')
      },
      firefox: {
        linux: path.join(homeDir, '.mozilla', 'firefox'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Firefox', 'Profiles'),
        win32: path.join(homeDir, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
      },
      brave: {
        linux: path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        win32: path.join(homeDir, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data')
      },
      vivaldi: {
        linux: path.join(homeDir, '.config', 'vivaldi'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Vivaldi'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Vivaldi', 'User Data')
      },
      edge: {
        linux: path.join(homeDir, '.config', 'microsoft-edge'),
        darwin: path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge'),
        win32: path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data')
      }
    };

    const platform = process.platform;

    for (const [browserName, paths] of Object.entries(browserPaths)) {
      const browserPath = paths[platform];
      if (browserPath) {
        try {
          await fsPromises.access(browserPath);
          browsers.push({
            name: browserName.charAt(0).toUpperCase() + browserName.slice(1),
            path: browserPath,
            key: browserName
          });
        } catch {
          // Browser not installed
        }
      }
    }

    return { success: true, browsers };
  });

  // ---- browser:importExtensionsFrom ----
  ipcMain.handle('browser:importExtensionsFrom', async (event, { browserKey }) => {
    try {
      const homeDir = os.homedir();
      const platform = process.platform;
      let extensionsPath;

      // Chrome-based browsers store extensions in a similar structure
      const chromiumPaths = {
        chrome: {
          linux: path.join(homeDir, '.config', 'google-chrome', 'Default', 'Extensions'),
          darwin: path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions'),
          win32: path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Extensions')
        },
        brave: {
          linux: path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions'),
          darwin: path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions'),
          win32: path.join(homeDir, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Extensions')
        },
        vivaldi: {
          linux: path.join(homeDir, '.config', 'vivaldi', 'Default', 'Extensions'),
          darwin: path.join(homeDir, 'Library', 'Application Support', 'Vivaldi', 'Default', 'Extensions'),
          win32: path.join(homeDir, 'AppData', 'Local', 'Vivaldi', 'User Data', 'Default', 'Extensions')
        },
        edge: {
          linux: path.join(homeDir, '.config', 'microsoft-edge', 'Default', 'Extensions'),
          darwin: path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Extensions'),
          win32: path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Extensions')
        },
        chromium: {
          linux: path.join(homeDir, '.config', 'chromium', 'Default', 'Extensions'),
          darwin: path.join(homeDir, 'Library', 'Application Support', 'Chromium', 'Default', 'Extensions'),
          win32: path.join(homeDir, 'AppData', 'Local', 'Chromium', 'User Data', 'Default', 'Extensions')
        }
      };

      if (!chromiumPaths[browserKey]) {
        return { success: false, error: 'Firefox extensions are not compatible. Only Chromium-based browsers are supported.' };
      }

      extensionsPath = chromiumPaths[browserKey][platform];

      try {
        await fsPromises.access(extensionsPath);
      } catch {
        return { success: false, error: `No extensions found at ${extensionsPath}` };
      }

      const extensionDirs = await fsPromises.readdir(extensionsPath);
      const imported = [];
      const skipped = [];
      const browserSession = session.fromPartition('persist:default-browser-session');

      for (const extId of extensionDirs) {
        const extPath = path.join(extensionsPath, extId);
        const stat = await fsPromises.stat(extPath);
        if (!stat.isDirectory()) continue;

        // Extensions have version subfolders
        const versions = await fsPromises.readdir(extPath);
        if (versions.length === 0) continue;

        // Get the latest version
        const latestVersion = versions.sort().pop();
        const fullExtPath = path.join(extPath, latestVersion);
        const manifestPath = path.join(fullExtPath, 'manifest.json');

        // Check for manifest.json and read it
        try {
          await fsPromises.access(manifestPath);
          const manifestData = JSON.parse(await fsPromises.readFile(manifestPath, 'utf-8'));
          const manifestVersion = manifestData.manifest_version || 2;
          const extName = manifestData.name || extId;

          // Skip MV3 extensions with service workers (limited support in Electron)
          if (manifestVersion === 3 && manifestData.background?.service_worker) {
            console.log(`[Extensions] Skipping MV3 service worker extension: ${extName}`);
            skipped.push({ name: extName, reason: 'MV3 service worker not fully supported' });
            continue;
          }

          const extension = await browserSession.loadExtension(fullExtPath, { allowFileAccess: true });
          loadedExtensions.set(extension.id, extension);
          imported.push({ id: extension.id, name: extension.name, version: extension.version, path: fullExtPath });
        } catch (err) {
          console.log(`[Extensions] Skipping ${extId}: ${err.message}`);
        }
      }

      // Save imported extensions to config
      if (imported.length > 0) {
        const config = await loadExtensionsConfig();
        for (const ext of imported) {
          if (!config.extensions.find(e => e.id === ext.id)) {
            config.extensions.push(ext);
            config.enabled[ext.id] = true;
          }
        }
        await saveExtensionsConfig(config);
      }

      return { success: true, imported, skipped };
    } catch (error) {
      console.error('[Extensions] Import error:', error);
      return { success: false, error: error.message };
    }
  });

  // ==================== COOKIE MANAGEMENT IPC HANDLERS ====================

  // ---- browser:registerPartition ----
  ipcMain.handle('browser:registerPartition', async (event, { partition, folderPath }) => {
    try {
      const config = await loadKnownPartitions();
      const existing = config.partitions.find(p => p.partition === partition);
      if (!existing) {
        config.partitions.push({ partition, folderPath, lastUsed: Date.now() });
      } else {
        existing.lastUsed = Date.now();
        existing.folderPath = folderPath; // Update path in case it changed
      }
      await saveKnownPartitions(config);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getKnownPartitions ----
  ipcMain.handle('browser:getKnownPartitions', async () => {
    try {
      const config = await loadKnownPartitions();
      return { success: true, partitions: config.partitions };
    } catch (error) {
      return { success: false, error: error.message, partitions: [] };
    }
  });

  // ---- browser:getCookiesFromPartition ----
  ipcMain.handle('browser:getCookiesFromPartition', async (event, { partition }) => {
    try {
      const sess = session.fromPartition(`persist:${partition}`);
      const cookies = await sess.cookies.get({});
      return { success: true, cookies };
    } catch (error) {
      return { success: false, error: error.message, cookies: [] };
    }
  });

  // ---- browser:importCookiesFromPartition ----
  ipcMain.handle('browser:importCookiesFromPartition', async (event, { sourcePartition, targetPartition, domain }) => {
    try {
      const sourceSession = session.fromPartition(`persist:${sourcePartition}`);
      const targetSession = session.fromPartition(`persist:${targetPartition}`);

      // Get cookies from source (optionally filtered by domain)
      const filter = domain ? { domain } : {};
      const cookies = await sourceSession.cookies.get(filter);

      let imported = 0;
      for (const cookie of cookies) {
        try {
          // Build the URL for the cookie
          const protocol = cookie.secure ? 'https' : 'http';
          const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const url = `${protocol}://${cookieDomain}${cookie.path || '/'}`;

          await targetSession.cookies.set({
            url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate,
            sameSite: cookie.sameSite
          });
          imported++;
        } catch (err) {
          console.log(`[Cookies] Failed to import cookie ${cookie.name}:`, err.message);
        }
      }

      return { success: true, imported, total: cookies.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:setCookieInheritance ----
  ipcMain.handle('browser:setCookieInheritance', async (event, { targetPartition, sourcePartitions }) => {
    try {
      const config = await loadCookieInheritanceConfig();
      config.inheritance[targetPartition] = sourcePartitions;
      await saveCookieInheritanceConfig(config);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ---- browser:getCookieInheritance ----
  ipcMain.handle('browser:getCookieInheritance', async (event, { partition }) => {
    try {
      const config = await loadCookieInheritanceConfig();
      return { success: true, sources: config.inheritance[partition] || [] };
    } catch (error) {
      return { success: false, error: error.message, sources: [] };
    }
  });

  // ---- browser:getCookieDomains ----
  ipcMain.handle('browser:getCookieDomains', async (event, { partition }) => {
    try {
      const sess = session.fromPartition(`persist:${partition}`);
      const cookies = await sess.cookies.get({});
      const domains = [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))];
      return { success: true, domains };
    } catch (error) {
      return { success: false, error: error.message, domains: [] };
    }
  });

  // ==================== PASSWORD MANAGER IPC HANDLERS ====================

  // ---- password-save ----
  ipcMain.handle('password-save', async (event, { site, username, password, notes }) => {
    try {
      const data = await readCredentials();
      const existingIndex = data.credentials.findIndex(c => c.site === site && c.username === username);

      const credential = {
        id: existingIndex >= 0 ? data.credentials[existingIndex].id : crypto.randomUUID(),
        site,
        username,
        password,
        notes: notes || '',
        createdAt: existingIndex >= 0 ? data.credentials[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        data.credentials[existingIndex] = credential;
      } else {
        data.credentials.push(credential);
      }

      await writeCredentials(data);
      return { success: true, id: credential.id };
    } catch (err) {
      console.error('Error saving credential:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- password-get-for-site ----
  ipcMain.handle('password-get-for-site', async (event, { site }) => {
    try {
      const data = await readCredentials();
      // Match by domain - extract domain from URL
      const extractDomain = (url) => {
        try {
          const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
          return parsed.hostname.replace(/^www\./, '');
        } catch {
          return url.replace(/^www\./, '');
        }
      };

      const siteDomain = extractDomain(site);
      const matches = data.credentials.filter(c => {
        const credDomain = extractDomain(c.site);
        return credDomain === siteDomain || siteDomain.endsWith(`.${credDomain}`) || credDomain.endsWith(`.${siteDomain}`);
      });

      // Return without exposing password in list (get specific one with password-get)
      return {
        success: true,
        credentials: matches.map(c => ({ id: c.id, site: c.site, username: c.username }))
      };
    } catch (err) {
      console.error('Error getting credentials for site:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- password-get ----
  ipcMain.handle('password-get', async (event, { id }) => {
    try {
      const data = await readCredentials();
      const credential = data.credentials.find(c => c.id === id);
      if (!credential) {
        return { success: false, error: 'Credential not found' };
      }
      return { success: true, credential };
    } catch (err) {
      console.error('Error getting credential:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- password-list ----
  ipcMain.handle('password-list', async () => {
    try {
      const data = await readCredentials();
      return {
        success: true,
        credentials: data.credentials.map(c => ({
          id: c.id,
          site: c.site,
          username: c.username,
          notes: c.notes,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        }))
      };
    } catch (err) {
      console.error('Error listing credentials:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- password-delete ----
  ipcMain.handle('password-delete', async (event, { id }) => {
    try {
      const data = await readCredentials();
      const index = data.credentials.findIndex(c => c.id === id);
      if (index < 0) {
        return { success: false, error: 'Credential not found' };
      }
      data.credentials.splice(index, 1);
      await writeCredentials(data);
      return { success: true };
    } catch (err) {
      console.error('Error deleting credential:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- password-encryption-status ----
  ipcMain.handle('password-encryption-status', async () => {
    return {
      available: safeStorage.isEncryptionAvailable(),
      message: safeStorage.isEncryptionAvailable()
        ? 'Credentials are encrypted using system keychain'
        : 'Encryption not available - credentials stored with basic encoding'
    };
  });
}

module.exports = { register, browserViews, setupWebContentsHandlers, loadSavedExtensions };
