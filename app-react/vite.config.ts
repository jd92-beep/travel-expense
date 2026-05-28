import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.VITE_BASE_PATH || (process.env.VERCEL ? '/' : '/travel-expense/react/');
const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const cnPath = fileURLToPath(new URL('./src/lib/cn.ts', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Serve the parent-dir secrets.local.js for local dev Notion/API token injection
    {
      name: 'serve-parent-secrets',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/travel-expense/secrets.local.js') {
            const filePath = resolve(repoRoot, 'secrets.local.js');
            if (existsSync(filePath)) {
              _res.setHeader('Content-Type', 'application/javascript');
              _res.end(readFileSync(filePath, 'utf8'));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  base,
  resolve: {
    alias: {
      '@/lib/cn': cnPath,
      '@': srcPath,
    },
  },
  server: {
    fs: {
      allow: [srcPath, repoRoot],
    },
  },
});
