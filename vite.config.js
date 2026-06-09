// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Use different ports for dev vs prod to allow running both simultaneously
// Dev: 7337 (frontend), 5437 (backend)
// Prod: 6337 (frontend), 5337 (backend)
const DEV_PORT = parseInt(process.env.VITE_PORT || '7337');

// Studio action queue (mirrors the production frontendServer in main.js)
const pendingStudioActions = {};
let studioActionCounter = 0;
const studioActionResults = {};
const studioSSESubscribers = [];
function notifyStudioSubscribers(action) {
  for (let i = studioSSESubscribers.length - 1; i >= 0; i--) {
    try { studioSSESubscribers[i](action); } catch { studioSSESubscribers.splice(i, 1); }
  }
}
function sendJSON(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const studioActionPlugin = {
  name: 'studio-actions',
  configureServer(server) {
    server.middlewares.use('/api/studio/action', async (req, res, next) => {
      if (req.method !== 'POST') return next();
      const data = await readBody(req);
      const action = data.action;
      const args = data.args || {};
      const windowId = data.window_id || '';
      if (!action) { sendJSON(res, 400, { success: false, error: 'Missing action' }); return; }
      studioActionCounter += 1;
      const actionId = `mcp_action_${studioActionCounter}`;
      const actionData = { action, args, status: 'pending' };
      if (windowId) actionData.window_id = windowId;
      pendingStudioActions[actionId] = actionData;
      console.log(`[Studio] Queued action ${actionId}: ${action}` + (windowId ? ` -> window ${windowId}` : ''));
      notifyStudioSubscribers({ id: actionId, ...actionData });
      const start = Date.now();
      while (!(actionId in studioActionResults) && Date.now() - start < 30000) {
        await new Promise(r => setTimeout(r, 100));
      }
      const result = studioActionResults[actionId];
      delete studioActionResults[actionId];
      delete pendingStudioActions[actionId];
      if (result) { sendJSON(res, 200, result); }
      else { sendJSON(res, 504, { success: false, error: 'Action timed out waiting for frontend' }); }
    });

    server.middlewares.use('/api/studio/pending_actions', (req, res, next) => {
      if (req.method !== 'GET') return next();
      const pending = {};
      for (const [aid, action] of Object.entries(pendingStudioActions)) {
        if (action.status === 'pending') pending[aid] = action;
      }
      sendJSON(res, 200, { success: true, actions: pending });
    });

    server.middlewares.use('/api/studio/actions_stream', (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const send = (payload) => {
        try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* closed */ }
      };
      studioSSESubscribers.push(send);
      for (const [aid, action] of Object.entries(pendingStudioActions)) {
        if (action.status === 'pending') send({ id: aid, ...action });
      }
      const keepalive = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch { /* closed */ }
      }, 30000);
      req.on('close', () => {
        clearInterval(keepalive);
        const idx = studioSSESubscribers.indexOf(send);
        if (idx !== -1) studioSSESubscribers.splice(idx, 1);
      });
    });

    server.middlewares.use('/api/studio/action_complete', async (req, res, next) => {
      if (req.method !== 'POST') return next();
      const data = await readBody(req);
      const actionId = data.actionId;
      const result = data.result || {};
      if (!actionId) { sendJSON(res, 400, { success: false, error: 'Missing actionId' }); return; }
      if (pendingStudioActions[actionId]) pendingStudioActions[actionId].status = 'complete';
      studioActionResults[actionId] = result;
      console.log(`[Studio] Action complete ${actionId}: success=${result.success || false}`);
      sendJSON(res, 200, { success: true });
    });
  }
};

export default defineConfig(({ command }) => ({
  plugins: [react(), studioActionPlugin],
  base:'./',
  server: {
    port: DEV_PORT,
    strictPort: true, // Fail if port is already in use instead of trying another
  },
  define: {
    'import.meta.env.VITE_DEV_MODE': JSON.stringify(command === "serve"), // true when running in dev mode
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    postcss: {
      plugins: [require('tailwindcss'), require('autoprefixer')],
    },
  },
  optimizeDeps: {
    include: [
      'react-markdown',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
      'react-syntax-highlighter',
      'react-syntax-highlighter/dist/cjs/styles/prism'
    ]
  }
}));
