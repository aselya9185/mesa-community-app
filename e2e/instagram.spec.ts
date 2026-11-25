import { expect, test } from '@playwright/test';
import { cleanup, login, makeUser, resetRateLimits } from './support';

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
