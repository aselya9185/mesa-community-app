import { devices, expect, test } from '@playwright/test';
import { cleanup, dropPlan, resetRateLimits, login, makeUser } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

test('a member drops a plan, another joins, they chat live and the plan is cancelled', async ({ page, browser, baseURL }, info) => {
  const host = await makeUser({ name: 'hosty' });
  const guest = await makeUser({ name: 'guesty' });
  const title = `Yoga ${Date.now()}`;

  // host drops a plan with a poll option
  await login(page, host);
  await dropPlan(page, { title, place: 'Studio Poblenou', poll: ['matcha'] });
  const planPath = new URL(page.url()).pathname;

  // guest sees it in the feed and joins
  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const guestCtx = await browser.newContext({ ...device, baseURL });
  const guestPage = await guestCtx.newPage();
  await login(guestPage, guest);
  await guestPage.goto('/plans');
  await guestPage.getByText(title).first().click();
  await guestPage.getByRole('button', { name: 'count me in' }).click();
  await expect(guestPage.getByText('can\'t make it? leave this plan')).toBeVisible();

  // chat: both open it; a message from the guest reaches the host without a reload
  await page.goto(`${planPath}?tab=chat`);
  await guestPage.goto(`${planPath}?tab=chat`);
  await expect(page.getByText('guesty is in')).toBeVisible();
  await guestPage.getByPlaceholder('say something to the girls').fill('see you at 7!');
  await guestPage.getByRole('button', { name: 'send' }).click();
  await expect(page.getByText('see you at 7!')).toBeVisible({ timeout: 20_000 });

  // poll: the guest votes
  await guestPage.goto(planPath);
  await guestPage.getByRole('button', { name: /matcha/ }).click();
  await expect(guestPage.getByRole('button', { name: /matcha/ })).toHaveAttribute('aria-pressed', 'true');

  // the host cancels; the guest sees it and the chat closes
  await page.goto(planPath);
  await page.getByRole('button', { name: 'cancel plan' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'cancel plan' }).click();
  await expect(page.getByText('this plan was cancelled by the host.')).toBeVisible();
  await guestPage.goto(planPath);
  await expect(guestPage.getByText('this plan was cancelled by the host.')).toBeVisible();

  await guestCtx.close();
});

test('someone who is not in a plan cannot read its chat', async ({ page, browser, baseURL }, info) => {
  const host = await makeUser();
  const outsider = await makeUser();
  const title = `Run ${Date.now()}`;
  await login(page, host);
  await dropPlan(page, { title, place: 'Parc de la Ciutadella' });
  const planPath = new URL(page.url()).pathname;

  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const ctx = await browser.newContext({ ...device, baseURL });
  const other = await ctx.newPage();
  await login(other, outsider);
  await other.goto(`${planPath}?tab=chat`);
  await expect(other.getByPlaceholder('say something to the girls')).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'count me in' })).toBeVisible();
  await ctx.close();
});

test('plans after starts empty: nothing is filled in, but anyone going can add the first idea and others vote', async ({ page, browser, baseURL }, info) => {
  const host = await makeUser({ name: 'emptyhost' });
  const guest = await makeUser({ name: 'emptyguest' });
  const title = `Pilates ${Date.now()}`;

  await login(page, host);
  await dropPlan(page, { title, place: 'Studio' }); // no suggestions picked
  const planPath = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: 'plans after' })).toBeVisible();
  await expect(page.getByText('no ideas yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /matcha|coffee|brunch/ })).toHaveCount(0);

  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const ctx = await browser.newContext({ ...device, baseURL });
  const her = await ctx.newPage();
  await login(her, guest);
  await her.goto(planPath);
  // she has not joined: she cannot add or see a poll yet
  await expect(her.getByRole('heading', { name: 'plans after' })).toHaveCount(0);
  await her.getByRole('button', { name: 'count me in' }).click();
  await her.getByLabel('add your own').fill('sunset walk');
  await her.getByRole('button', { name: 'add', exact: true }).click();
  await expect(her.getByRole('button', { name: /sunset walk/ })).toBeVisible();

  // the host sees the idea and can vote for it
  await page.goto(planPath);
  await page.getByRole('button', { name: /sunset walk/ }).click();
  await expect(page.getByRole('button', { name: /sunset walk/ })).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test('a plan dropped for later stays in its host\'s own list, but the others only see this week', async ({ page, browser, baseURL }, info) => {
  const host = await makeUser({ name: 'laterhost' });
  const other = await makeUser({ name: 'laterother' });
  const title = `Later ${Date.now()}`;

  await login(page, host);
  await dropPlan(page, { title, place: 'Studio', daysAhead: 14 }); // well beyond the 7 days of "this week"
  await page.goto('/plans');
  await expect(page.getByText(title).first()).toBeVisible();

  const device = info.project.name === 'phone' ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const ctx = await browser.newContext({ ...device, baseURL });
  const her = await ctx.newPage();
  await login(her, other);
  await her.goto('/plans');
  await expect(her.getByText(title)).toHaveCount(0);
  await ctx.close();
});
