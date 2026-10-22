import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The webview has no DOM test setup and does not need one: what is worth
    // testing there is the PURE logic (path detection, scroll math), which
    // runs as plain TS. Component files stay out by only matching *.test.ts.
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'webview-ui/src/**/*.test.ts'],
  },
});
