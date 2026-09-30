import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/newsflow/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../newsflow',
    emptyOutDir: true,
    sourcemap: false,
  },
});
