import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['packages/hive-ui/**', 'node_modules/**'],
  },
});
