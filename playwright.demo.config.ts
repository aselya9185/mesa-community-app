import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The demo runs as its own suite: the same app started with DEMO_MODE=true, and the demo switched on in the LOCAL
// database for the length of the run (it changes how new accounts behave, so it cannot share a run with the other tests).
const PORT = 3101;
const server = base.webServer as { env: Record<string, string> };

export default defineConfig({
  ...base,
  testDir: 'e2e-demo',
  outputDir: 'test-results/demo',
  globalSetup: './e2e-demo/global-setup.ts',
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...server.env, DEMO_MODE: 'true', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` },
  },
});
