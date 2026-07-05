

const IS_DEV = import.meta.env.DEV;
const BACKEND_PORT = IS_DEV ? 5437 : 5337;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const BACKEND_URL_LOCALHOST = `http://localhost:${BACKEND_PORT}`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (IS_DEV ? 'http://127.0.0.1:8080' : 'https://api.incognide.com');
