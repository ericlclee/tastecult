import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  test: {
    // Integration tests share one test database, so files must not run concurrently
    fileParallelism: false,
  },
});
