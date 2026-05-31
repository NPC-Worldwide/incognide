

const IS_DEV = import.meta.env.DEV;
const BACKEND_PORT = IS_DEV ? 5437 : 5337;

// Detect web mode: web-preload.js sets this flag; Electron preload does not.
const IS_WEB = typeof window !== 'undefined' && (window as any).__INCOGNIDE_IS_WEB;

// In web mode, backend is same-origin (proxied by web-server.js).
// In Electron, hit the local Python backend directly.
export const BACKEND_URL = IS_WEB ? '' : `http://127.0.0.1:${BACKEND_PORT}`;
export const BACKEND_URL_LOCALHOST = `http://localhost:${BACKEND_PORT}`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.incognide.com';
export { IS_WEB };
