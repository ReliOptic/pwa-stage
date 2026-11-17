import { defineConfig, mergeConfig } from 'vitest/config';
import { viteConfig } from './vite.config';

// Worktrees may share read-only node_modules; test results belong to this checkout.
export default mergeConfig(viteConfig, defineConfig({ cacheDir: './.vitest-cache' }));
