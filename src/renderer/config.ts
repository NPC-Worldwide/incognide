

const IS_DEV = import.meta.env.DEV;
const BACKEND_PORT = IS_DEV ? 5437 : 5337;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const BACKEND_URL_LOCALHOST = `http://localhost:${BACKEND_PORT}`;
