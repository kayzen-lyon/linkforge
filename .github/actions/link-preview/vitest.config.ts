import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The action is not a workspace: its one dependency is the SDK of this repository.
    alias: { '@omnillink/sdk': fileURLToPath(new URL('../../../packages/sdk/dist/index.js', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
