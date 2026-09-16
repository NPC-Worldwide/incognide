

const IS_DEV = import.meta.env.DEV;
const BACKEND_PORT = IS_DEV ? 5437 : 5337;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const BACKEND_URL_LOCALHOST = `http://localhost:${BACKEND_PORT}`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (IS_DEV ? 'https://devapi.incognide.com' : 'https://api.incognide.com');
export const CLOUD_APP_URL = import.meta.env.VITE_CLOUD_APP_URL || 'https://app.incognide.com';
