import { expect, test } from '@playwright/test';
import { bar, enter, freshDemo, noSidewaysScroll, svc, viewAs } from './support';

test.beforeEach(freshDemo);

test('a visitor lands on the demo and gets in with one click', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'try mesa' })).toBeVisible();
  await noSidewaysScroll(page);
  const started = Date.now();
  await enter(page, 'member 1');
  await expect(page.getByText('zumba after work').first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(20_000);
  await noSidewaysScroll(page);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/plans/); // already in
});

test('the logged-out pages offer the demo, and the request form stores nothing', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'try the demo' })).toBeVisible();
  await page.goto('/apply');
  await expect(page.getByText('nothing you type in this form is saved in the demo.')).toBeVisible();
  await page.getByLabel('your name').fill('A Real Person');
  await page.getByLabel('your instagram').fill('@a.real.person');
  await page.getByLabel('whatsapp number').fill('+34699111222');
  await page.getByRole('button', { name: 'request invite' }).click();
  await expect(page.getByRole('heading', { name: "you're on the list" })).toBeVisible();
  expect((await svc.from('applications').select('id').eq('whatsapp_e164', '+34699111222')).data).toHaveLength(0);
});

test('member 2 gives member 1 the free +1, switching without ever logging in', async ({ page }) => {
  await enter(page, 'member 1');
  await page.getByText('zumba after work').first().click();
  await expect(page.getByRole('heading', { name: 'zumba after work' })).toBeVisible();
  await expect(page.getByText('+1 pending')).toBeVisible();
  const plan = new URL(page.url()).pathname;

  await viewAs(page, 'member 2');
  await expect(page).toHaveURL(new RegExp(`${plan}$`)); // same page, other person
  await page.getByRole('button', { name: 'give the +1 to marta' }).click();
  await expect(page.getByText('free +1 · given')).toBeVisible();

  await viewAs(page, 'member 1');
  await expect(page.getByText('you got the +1').first()).toBeVisible();
});

test('chat and poll work for the people going', async ({ page }) => {
  await enter(page, 'member 1');
  await page.getByText('zumba after work').first().click();
  const plan = new URL(page.url()).pathname;
  await page.goto(`${plan}?tab=chat`);
  await expect(page.getByText('it is! one sec')).toBeVisible();
  await page.getByPlaceholder('say something to the girls').fill('amazing, thank you');
  await page.getByRole('button', { name: 'send' }).click();
  await expect(page.getByText('amazing, thank you')).toBeVisible();
  // one screen: only the messages scroll
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

  await viewAs(page, 'member 2');
  await expect(page.getByText('amazing, thank you')).toBeVisible();

  await page.goto(plan);
  await page.getByRole('button', { name: /tacos/ }).click();
  await expect(page.getByRole('button', { name: /tacos/ })).toHaveAttribute('aria-pressed', 'true');
});

test('the admin runs the door: approve, open her link, join, and switch back', async ({ page }) => {
  await enter(page, 'admin');
  await expect(page).toHaveURL(/\/admin\/requests/);
  await expect(page.getByText('the demo did that step for you', { exact: false })).toBeVisible();
  await noSidewaysScroll(page);

  const card = page.getByRole('listitem').filter({ hasText: /paula/i });
  await card.getByRole('button', { name: 'approve' }).click();
  await expect(page.getByRole('link', { name: 'send on whatsapp' })).toHaveCount(0);
  await page.getByRole('link', { name: 'open her link' }).click();

  await expect(page.getByRole('heading', { name: /you.re in, paula/i })).toBeVisible();
  await page.getByLabel('password', { exact: true }).fill('welcome-demo-1');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding\/card/);
  await expect(page.getByText('photos are switched off in the demo.')).toBeVisible();
  await page.getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/plans/);

  await viewAs(page, 'admin');
  await page.goto('/admin/members');
  await expect(page.getByRole('listitem').filter({ hasText: /marta/i }).getByText('protected')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /paula/i }).getByRole('button', { name: 'new link' })).toBeVisible();
  await page.goto('/admin/reports');
  await expect(page.getByText('said yes twice and never came')).toBeVisible();
});

test('cards, pings and leaving the demo', async ({ page }) => {
  await enter(page, 'member 1');
  await page.goto('/card/edit');
  await expect(page.getByText('photos are switched off in the demo.')).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText('pings to your phone are switched off in the demo.', { exact: false })).toBeVisible();
  await noSidewaysScroll(page);
  await page.goto('/card');
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: 'log out' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.goto('/plans');
  await expect(page).toHaveURL(/\/login/);
  await expect(bar(page)).toHaveCount(0);
});

test('two visitors can be the same person at once', async ({ page, browser, baseURL }) => {
  await enter(page, 'member 1');
  const other = await browser.newContext({ baseURL });
  const second = await other.newPage();
  await enter(second, 'member 1');
  await page.goto('/chats');
  await expect(page.getByText('zumba after work').first()).toBeVisible(); // the first visitor was not signed out
  await other.close();
});
