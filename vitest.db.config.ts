import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// integration tests: need Docker + `npx supabase start`
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
