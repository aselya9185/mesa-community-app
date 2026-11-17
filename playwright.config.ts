import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { generateVAPIDKeys } from 'web-push';

// End-to-end tests drive a real browser against the app running on the LOCAL Supabase stack (`npx supabase start`).
// Nothing here touches a real project: values come from `supabase status`.
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

function stack(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const map: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m?.[1]) map[m[1]] = m[2] ?? '';
  }
  if (!map.API_URL || !map.ANON_KEY || !map.SERVICE_ROLE_KEY) throw new Error('local supabase is not running: `npx supabase start`');
  return map;
}

const s = stack();
const vapid = generateVAPIDKeys();

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // a production build: no hot reload racing the test, and the same code members run
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SITE_URL: BASE,
      NEXT_PUBLIC_SUPABASE_URL: s.API_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY!,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.test',
      PUSH_WEBHOOK_SECRET: 'e2e-only-secret',
    },
  },
});
