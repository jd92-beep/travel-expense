import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const base = process.env.VITE_BASE_PATH || (process.env.VERCEL ? '/' : '/travel-expense/react/');
const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const cnPath = fileURLToPath(new URL('./src/lib/cn.ts', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
      allow: [srcPath],
    },
  },
});
