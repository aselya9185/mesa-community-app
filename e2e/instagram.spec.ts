import { expect, test } from '@playwright/test';
import { cleanup, login, makeUser, resetRateLimits, serviceClient } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

test('an instagram handle is hidden from other members until she turns it on', async ({ page, browser, baseURL }) => {
  const ana = await makeUser({ name: 'anahandle' }); // the handle is @anahandle, private by default
  const bea = await makeUser({ name: 'beaviewer' });

  // bea looks at ana's card: the handle is not there
  await login(page, bea);
  await page.goto(`/members/${ana.id}`);
  await expect(page.getByText('anahandle', { exact: false }).first()).toBeVisible(); // her name is on the card
  await expect(page.getByText('@anahandle')).toHaveCount(0);

  // ana ticks "show my instagram on my card" and saves
  const ctx = await browser.newContext({ baseURL });
  const her = await ctx.newPage();
  await login(her, ana, '/card/edit');
  await expect(her.getByRole('textbox', { name: 'instagram' })).toHaveValue('@anahandle'); // she always sees her own
  await her.getByLabel('show my instagram on my card, so other members can find me').check();
  await her.getByRole('button', { name: 'done' }).click();
  await her.waitForURL((url) => !url.pathname.includes('/card/edit'));

  // now bea sees it
  await page.goto(`/members/${ana.id}`);
  await expect(page.getByText('@anahandle')).toBeVisible();

  // and she can hide it again
  await her.goto('/card/edit');
  await her.getByLabel('show my instagram on my card, so other members can find me').uncheck();
  await her.getByRole('button', { name: 'done' }).click();
  await her.waitForURL((url) => !url.pathname.includes('/card/edit'));
  await page.goto(`/members/${ana.id}`);
  await expect(page.getByText('@anahandle')).toHaveCount(0);
  await ctx.close();
});

test('a mistake in the form never publishes a handle she just switched off', async ({ page }) => {
  const ana = await makeUser({ name: 'anaerror', instagramPublic: true });
  await login(page, ana, '/card/edit');
  const box = page.getByRole('checkbox', { name: /show my instagram on my card/ });
  const handle = page.getByRole('textbox', { name: 'instagram' });
  await expect(box).toBeChecked();
  await expect(page.getByText('members can see it on your card')).toBeVisible();

  // she switches it off and also types something the form rejects
  await box.uncheck();
  await expect(page.getByText('private: only the club admin sees it')).toBeVisible();
  await handle.fill('https://instagram.com/anaerror');
  await page.getByRole('button', { name: 'done' }).click();

  await expect(page.getByText('that does not look like an instagram handle')).toBeVisible();
  await expect(handle).toBeFocused(); // the keyboard lands on what needs fixing
  await page.getByRole('button', { name: 'done' }).click(); // a second failed try changes nothing either
  await expect(handle).toBeFocused(); // focus comes back only once that second answer has arrived
  await expect(page.getByText('that does not look like an instagram handle')).toBeVisible();
  await expect(box).not.toBeChecked(); // her choice is kept
  await expect(handle).toHaveValue('https://instagram.com/anaerror'); // and what she typed

  await handle.fill('@anaerror');
  await page.getByRole('button', { name: 'done' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/card/edit'));
  const { data } = await serviceClient().from('member_instagram').select('is_public').eq('user_id', ana.id).single();
  expect(data?.is_public).toBe(false);
});

test('a bio with line breaks at the limit saves', async ({ page }) => {
  const ana = await makeUser({ name: 'longbio' });
  await login(page, ana, '/card/edit');
  const bio = `${'a'.repeat(138)}\n${'b'.repeat(141)}`; // 280 characters with a line break
  await page.getByRole('textbox', { name: /bio/ }).fill(bio);
  await page.getByRole('button', { name: 'done' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/card/edit'));
  expect((await serviceClient().from('profiles').select('bio').eq('id', ana.id).single()).data?.bio).toBe(bio);
});
