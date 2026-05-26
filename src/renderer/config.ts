

const IS_DEV = import.meta.env.DEV;
const BACKEND_PORT = IS_DEV ? 5437 : 5337;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const BACKEND_URL_LOCALHOST = `http://localhost:${BACKEND_PORT}`;

// Detect dev Clerk keys and route to dev API
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
export const IS_CLERK_DEV = CLERK_KEY.startsWith('pk_test_');

export const API_BASE_URL = IS_CLERK_DEV
  ? (import.meta.env.VITE_API_BASE_URL_DEV || 'https://api-dev.incognide.com')
  : (import.meta.env.VITE_API_BASE_URL || 'https://api.incognide.com');
