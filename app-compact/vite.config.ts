import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const base = process.env.VITE_BASE_PATH || (process.env.VERCEL ? '/' : '/travel-expense/compact/');
const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const cnPath = fileURLToPath(new URL('./src/lib/cn.ts', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Disposable smoke fixtures must never inherit this machine's live .env.
  envDir: process.env.COMPACT_SMOKE_SAFE_MODE === '1' ? false : undefined,
  base,
  build: {
    rolldownOptions: {
      output: {
        // The live deploy gate (smoke:deploy-live) proves the broker client shipped by its
        // own credentialBroker-*.js asset; keep it a named chunk regardless of lazy-load shape.
        manualChunks: (id: string) => (id.includes('/src/lib/credentialBroker.') ? 'credentialBroker' : undefined),
      },
    },
  },
  resolve: {
    alias: {
      '@/lib/cn': cnPath,
      '@': srcPath,
    },
  },
  server: {
    fs: {
      allow: [srcPath, repoRoot],
      deny: ['**/.env', '**/.env.*', '**/*.{crt,pem}', '**/.git/**', '**/secrets.local.*'],
    },
  },
});
