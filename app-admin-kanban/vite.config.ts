import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    // Worktrees symlink node_modules from the main checkout; allow the parent
    // monorepo path so fontsource assets resolve during local dev/smoke.
    fs: {
      allow: [root, resolve(root, '..'), resolve(root, '../../..')],
    },
  },
});
