import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const viteConfig = defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5199,
    strictPort: true
  }
});

export { viteConfig as default };
