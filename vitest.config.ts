import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const CSS_MOCK = '\0css-mock';

const mockCssPlugin = () => ({
  name: 'mock-css',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id.endsWith('.css')) {
      console.log('[mock-css] resolveId', id);
      return `${CSS_MOCK}:${id}`;
    }
  },
  load(id: string) {
    if (id.startsWith(`${CSS_MOCK}:`)) {
      console.log('[mock-css] load', id);
      return 'export default {}';
    }
  },
});

export default defineConfig({
  plugins: [mockCssPlugin(), react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/renderer/**/*.{ts,tsx}'],
      exclude: ['src/renderer/components/Enpistu.tsx'],
    },
  },
});
