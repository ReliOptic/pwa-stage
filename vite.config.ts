import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for the simulator shell (not for the pages under test:
 * those load in <webview> guests and keep their own headers).
 * Injected only in production builds because Vite's dev server relies on
 * inline scripts for HMR.
 */
export const SHELL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // http(s) images: PWA icons / apple-touch-icon read from the page under test
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

function shellCspPlugin(): Plugin {
  return {
    name: 'shell-csp',
    apply: 'build',
    transformIndexHtml(html: string): string {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${SHELL_CSP}" />`
      );
    }
  };
}

export const viteConfig = defineConfig({
  base: './',
  // Keep worktree caches local even when node_modules is a shared symlink.
  cacheDir: '.cache/vite',
  plugins: [react(), shellCspPlugin()],
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
