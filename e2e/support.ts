import { expect, type Page } from '@playwright/test';
import { serviceClient } from '../tests/db/helpers';

export { cleanup, makeApplication, makeUser, serviceClient, type TestUser } from '../tests/db/helpers';
export { totp } from '../tests/db/totp';

/** log in through the real form */
export async function login(page: Page, user: { phone: string; password: string }, next = '/plans', { expectSuccess = true } = {}) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState('networkidle'); // the form must be live (hydrated) before we type
  await page.getByLabel('whatsapp number').fill(user.phone);
  await page.getByLabel('password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'log in' }).click();
  if (expectSuccess) await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** tomorrow as yyyy-mm-dd: always in the future, whatever the time zone */
export function tomorrow(): string {
  return inDays(1.5);
}

/** a day n days from now as yyyy-mm-dd */
export function inDays(n: number): string {
  return new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** fill the plan form on any screen size: on phones it has three steps, on larger screens one page */
export async function dropPlan(page: Page, plan: { title: string; place: string; poll?: string[]; booking?: string; plusOne?: boolean; daysAhead?: number }) {
  await page.goto('/plans/new');
  await page.getByLabel('what are you doing?').fill(plan.title);
  await page.getByLabel('where?').fill(plan.place);
  const next = page.getByRole('button', { name: 'next' });
  if (await next.isVisible()) await next.click();
  await page.getByLabel('day').fill(plan.daysAhead ? inDays(plan.daysAhead) : tomorrow());
  await page.getByLabel('time').fill('19:00');
  if (plan.booking) await page.getByLabel('booking link').fill(plan.booking);
  if (await next.isVisible()) await next.click();
  if (plan.plusOne) await page.getByRole('switch').check();
  for (const label of plan.poll ?? []) await page.locator('label', { hasText: new RegExp(`^${label}$`) }).click();
  await page.getByRole('button', { name: 'drop it' }).click();
  await expect(page.getByRole('heading', { name: plan.title.toLowerCase() })).toBeVisible();
}

/** the app limits tries per network (login, apply, links): every test starts from zero so runs do not affect each other */
export async function resetRateLimits() {
  const { error } = await serviceClient().from('rate_limits').delete().neq('key', '');
  if (error) throw new Error(`could not reset rate limits: ${error.message}`);
}
