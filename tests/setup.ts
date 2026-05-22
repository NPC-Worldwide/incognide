import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.api (Electron IPC bridge)
const mockApi: Record<string, any> = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  writeFileBuffer: vi.fn().mockResolvedValue({ success: true }),
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
  
  // PDF-related mocks
  addPdfHighlight: vi.fn().mockResolvedValue({ success: true, lastID: 1 }),
  getHighlightsForFile: vi.fn().mockResolvedValue({ highlights: [] }),
  updatePdfHighlight: vi.fn().mockResolvedValue({ success: true }),
  deletePdfHighlight: vi.fn().mockResolvedValue({ success: true }),
  addPdfDrawing: vi.fn().mockResolvedValue({ success: true, lastID: 1 }),
  getDrawingsForFile: vi.fn().mockResolvedValue({ drawings: [] }),
  updatePdfDrawing: vi.fn().mockResolvedValue({ success: true }),
  deleteDrawing: vi.fn().mockResolvedValue({ success: true }),
  clearDrawingsForPage: vi.fn().mockResolvedValue({ success: true }),
  showSaveDialog: vi.fn().mockResolvedValue({ filePath: '/test/annotated.pdf' }),
  getFileStats: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
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

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock fetch for loading fonts
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  text: vi.fn().mockResolvedValue(''),
});
