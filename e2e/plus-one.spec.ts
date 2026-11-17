import { devices, expect, test } from '@playwright/test';
import { cleanup, dropPlan, login, makeUser, resetRateLimits } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

test('the host gives the free +1 to a joined member who has not booked', async ({ page, browser, baseURL }, info) => {
  const host = await makeUser({ name: 'plushost' });
  const guest = await makeUser({ name: 'plusguest' });
  const title = `Class ${Date.now()}`;

  await login(page, host);
  await dropPlan(page, { title, place: 'Studio', booking: 'https://example.com/book', plusOne: true });
  const planPath = new URL(page.url()).pathname;

  // nobody has joined yet: the host is told what she is waiting for, and there is nobody to give it to
  await expect(page.getByText('waiting for someone to join')).toBeVisible();
  await expect(page.getByRole('button', { name: /give the \+1/ })).toHaveCount(0);

  // the guest joins without booking
  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const ctx = await browser.newContext({ ...device, baseURL });
  const her = await ctx.newPage();
  await login(her, guest);
  await her.goto(planPath);
  await her.getByRole('button', { name: 'count me in' }).click();
  await expect(her.getByText('+1 pending')).toBeVisible();

  // the host can now give it to her
  await page.goto(planPath);
  await page.getByRole('button', { name: 'give the +1 to plusguest' }).click();
  await expect(page.getByText('free +1 · given')).toBeVisible();

  // she sees she got it
  await her.goto(planPath);
  await expect(her.getByText('you got the +1').first()).toBeVisible();
  await ctx.close();
});

test('a host without a booking link is told to add one', async ({ page }) => {
  const host = await makeUser();
  const title = `Walk ${Date.now()}`;
  await login(page, host);
  await dropPlan(page, { title, place: 'Park', plusOne: true });
  await expect(page.getByText('to give it, the plan needs a booking link.')).toBeVisible();
  await page.getByRole('link', { name: 'add one' }).click();
  await expect(page).toHaveURL(/\/edit$/);
});
