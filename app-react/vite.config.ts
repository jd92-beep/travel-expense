import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const base = process.env.VITE_BASE_PATH || (process.env.VERCEL ? '/' : '/travel-expense/react/');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
});
