import { expect, test } from '@playwright/test';
import { cleanup, login, makeUser, resetRateLimits } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

test('the plan form shows the right buttons for the screen size', async ({ page }, info) => {
  const user = await makeUser({ name: 'formy' });
  await login(page, user);
  await page.goto('/plans/new');
  await page.waitForLoadState('networkidle');

  const next = page.getByRole('button', { name: 'next' });
  const back = page.getByRole('button', { name: 'back' });
  const dropIt = page.getByRole('button', { name: 'drop it' });

  if (info.project.name === 'phone') {
    // three steps: only "next" on the first one, "drop it" only on the last
    await expect(next).toBeVisible();
    await expect(dropIt).toBeHidden();
    await expect(back).toBeHidden();
  } else {
    // one page: no steps, so only "drop it"
    await expect(dropIt).toBeVisible();
    await expect(next).toBeHidden();
    await expect(back).toBeHidden();
  }
});
