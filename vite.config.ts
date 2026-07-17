import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      // '**/node_modules/**' (not just the bare 'node_modules' segment) so vitest doesn't
      // recurse into a nested checkout's own node_modules - e.g. a git worktree living under
      // .worktrees/ is a real, traversable directory on disk with its own full node_modules,
      // and without the '**/' prefix a plain 'node_modules' pattern only reliably excludes the
      // top-level one. Project-local worktree directories are explicit belt-and-suspenders
      // excludes for the same reason: they duplicate this project's own tests/** at nested paths.
      exclude: ['**/node_modules/**', '.worktrees/**', '.claude/worktrees/**', 'tests/e2e/**'],
    }
  };
});
