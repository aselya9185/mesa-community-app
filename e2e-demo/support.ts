import { expect, type Page } from '@playwright/test';
import { ensureDemo } from '../src/server/demo';
import { serviceClient } from '../tests/db/helpers';

export const svc = serviceClient();

/** every test starts from the written demo data */
export async function freshDemo() {
  await svc.from('rate_limits').delete().neq('key', '');
  await ensureDemo(svc);
  const { error } = await svc.rpc('demo_reset');
  if (error) throw new Error(error.message);
}

export type Persona = 'member 1' | 'member 2' | 'admin';

/** the one-click way in */
export async function enter(page: Page, persona: Persona) {
  await page.goto('/demo');
  await page.getByRole('button', { name: new RegExp(`^${persona}`) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/demo'));
  await expect(bar(page).getByRole('button', { name: persona })).toHaveAttribute('aria-current', 'true');
}

export const bar = (page: Page) => page.getByRole('complementary', { name: 'demo' });

/** switch person with the bar that is always on screen */
export async function viewAs(page: Page, persona: Persona) {
  await bar(page).getByRole('button', { name: persona }).click();
  await expect(bar(page).getByRole('button', { name: persona })).toHaveAttribute('aria-current', 'true', { timeout: 20_000 });
}

export async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}
