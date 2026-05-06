import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
