import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'tsconfig.vitest.json');

export default defineConfig({
  // Match Next.js: components rely on the automatic JSX runtime and do not
  // import React for JSX, so the classic transform would throw
  // "React is not defined" under test.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'bots/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
