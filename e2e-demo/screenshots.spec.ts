import { expect, test } from '@playwright/test';
import { enter, freshDemo, viewAs } from './support';

// README pictures, from fake data only:  SHOTS=1 npx playwright test -c playwright.demo.config.ts screenshots
test.skip(!process.env.SHOTS, 'only when asked for');
test.beforeEach(freshDemo);

test('screenshots', async ({ page }, info) => {
  const shot = async (name: string) => {
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-${name}.png` });
  };
  await page.goto('/demo');
  await shot('demo');
  await enter(page, 'member 1');
  await shot('plans');
  await page.getByText('zumba after work').first().click();
  await expect(page.getByRole('heading', { name: 'zumba after work' })).toBeVisible();
  await shot('plan');
  const plan = new URL(page.url()).pathname;
  await page.goto(`${plan}?tab=chat`);
  await shot('chat');
  await viewAs(page, 'member 2');
  await page.goto(plan);
  await shot('host');
  await viewAs(page, 'admin');
  await page.goto('/admin/requests');
  await shot('door');
  await page.goto('/card');
  await shot('card');
});
