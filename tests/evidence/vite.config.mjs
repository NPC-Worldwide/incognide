/**
 * Vite configuration for the OrcaRouter UI evidence build.
 *
 * This is a test harness, not production code. It builds the real
 * OrcaRouterConfig component against real catalog data so the screenshots show
 * the shipped UI and the shipped capability filters rather than a mock-up.
 *
 * A production build is used instead of a dev server so React Fast Refresh
 * cannot remount the component mid-interaction.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The application stylesheet opens with a remote webfont `@import`. Module
 * scripts are blocked until every pending stylesheet resolves, and this
 * container has no route to that CDN, so the harness would never boot. Drop
 * the remote import for the evidence build only - the app itself is unchanged
 * and the font is irrelevant to what these screenshots assert.
 */
const stripRemoteFontImport = {
  name: 'strip-remote-font-import',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.css')) return null;
    const stripped = code.replace(/@import\s+url\(\s*['"]?https?:\/\/[^)]*\)\s*;?/g, '');
    return stripped === code ? null : { code: stripped, map: null };
  },
};

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [stripRemoteFontImport, react()],
  // Mirrors the production config so the harness renders the shipped classes.
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: 'tests/evidence/tailwind.config.cjs' }),
        autoprefixer(),
      ],
    },
  },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  // Build output lives outside the repository so the harness leaves no
  // generated files behind in a contributor's working tree.
  build: { outDir: '/tmp/orca-evidence/dist', emptyOutDir: true },
});
