import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.api (Electron IPC bridge)
const mockApi: Record<string, any> = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDirectory: vi.fn(),
  closeWindow: vi.fn(),
  profileGet: vi.fn().mockResolvedValue({ setupComplete: true, tutorialComplete: false }),
  profileSave: vi.fn().mockResolvedValue({}),
  setupCheckNeeded: vi.fn().mockResolvedValue({ needed: false }),
  getMcpServers: vi.fn().mockResolvedValue([]),
  mcpStartServer: vi.fn().mockResolvedValue({ success: true }),
  mcpListTools: vi.fn().mockResolvedValue({ tools: [] }),
  getConversations: vi.fn().mockResolvedValue([]),
  dbQuery: vi.fn().mockResolvedValue([]),
  gitStatus: vi.fn().mockResolvedValue({ files: [] }),
  cancelDownload: vi.fn(),
  pauseDownload: vi.fn(),
  resumeDownload: vi.fn(),
  browserSaveLink: vi.fn().mockResolvedValue({ success: true }),
};

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
