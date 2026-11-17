import { devices, expect, test } from '@playwright/test';
import { cleanup, resetRateLimits, login, makeApplication, makeUser, totp } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

// the whole way in: the admin sets up two-step sign-in, approves a request, the applicant opens her one-time link
test('admin approves a request and the applicant joins with her one-time link', async ({ page, browser, baseURL }, info) => {
  const admin = await makeUser({ role: 'admin', name: 'doorkeeper' });
  const applicant = await makeApplication({ name: 'Newcomer', instagram: '@new.comer' });

  await login(page, admin, '/admin/requests');
  // first visit: set up two-step sign-in with the secret shown on screen, then type the current code
  await page.getByRole('button', { name: 'set up two-step sign-in' }).click();
  const secret = (await page.locator('code').first().innerText()).trim();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: /open the door|check/i }).click();

  await expect(page.getByRole('heading', { name: "who's at the door" })).toBeVisible();
  await expect(page.locator('strong', { hasText: /^newcomer$/i })).toBeVisible();
  await page.getByRole('button', { name: 'approve' }).first().click();

  // the invite message carries a personal link on this site
  const link = (await page.getByText(/\/j\/[a-z0-9]{32}/).first().innerText()).match(/https?:\/\/\S+\/j\/[a-z0-9]{32}/)?.[0];
  expect(link).toBeTruthy();

  // the applicant opens it in her own browser and sets a password
  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const ctx = await browser.newContext({ ...device, baseURL });
  const her = await ctx.newPage();
  await her.goto(link!);
  await expect(her.getByRole('heading', { name: /you.re in, newcomer/i })).toBeVisible();
  await her.getByLabel('password', { exact: true }).fill('welcome-test-1');
  await her.getByRole('button', { name: /.+/ }).filter({ hasText: /in|join|go|set/i }).last().click();
  await expect(her).toHaveURL(/onboarding\/card|\/plans/);

  // the link is single use: opening it again shows the dead-link message
  const again = await ctx.newPage();
  await again.goto(link!);
  await expect(again.getByText(/already been used|expired/i)).toBeVisible();
  await ctx.close();
  void applicant;
});
