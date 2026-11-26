import { expect, test } from '@playwright/test';
import { cleanup, resetRateLimits, login, makeUser, serviceClient } from './support';

test.beforeEach(resetRateLimits);
test.afterAll(cleanup);

test.describe('visitors', () => {
  test('are sent to the login page and see nothing of the club', async ({ page, request }) => {
    await page.goto('/plans');
    await expect(page).toHaveURL(/\/login\?next=%2Fplans/);

    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
    const apply = await request.get('/apply');
    expect(apply.headers()['x-robots-tag']).toContain('noindex');
  });

  test('can ask for an invite and the request reaches the door list', async ({ page }) => {
    const phone = `+3469${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await page.goto('/apply');
    await page.getByLabel('your name').fill('E2E Visitor');
    await page.getByLabel('your instagram').fill('@e2e.visitor');
    await page.getByLabel('whatsapp number').fill(phone);
    await page.getByRole('button', { name: 'request invite' }).click();
    await expect(page.getByRole('heading', { name: "you're on the list" })).toBeVisible();

    const { data } = await serviceClient().from('applications').select('status, instagram').eq('whatsapp_e164', phone).single();
    expect(data).toMatchObject({ status: 'pending', instagram: '@e2e.visitor' });
    await serviceClient().from('applications').delete().eq('whatsapp_e164', phone);
  });

  test('keep what they typed after a mistake, including who invited them', async ({ page }) => {
    await page.goto('/apply');
    await page.getByLabel('your name').fill('Lu');
    await page.getByLabel('your instagram').fill('@lu.e2e');
    await page.getByLabel('whatsapp number').fill('12');
    await page.getByLabel(/invited by a member/).fill('@carla.e2e');
    await page.getByRole('button', { name: 'request invite' }).click();
    await expect(page.getByText('that number does not look right', { exact: false })).toBeVisible();
    await expect(page.getByLabel(/invited by a member/)).toHaveValue('@carla.e2e');
    await expect(page.getByLabel('your instagram')).toHaveValue('@lu.e2e');
  });

  test('get a generic message for a wrong password', async ({ page }) => {
    const user = await makeUser();
    await login(page, { phone: user.phone, password: 'not-the-password-1' }, '/plans', { expectSuccess: false });
    await expect(page.locator('p[role="alert"]')).toContainText(/don.t match|wrong/i);
    await expect(page).toHaveURL(/\/login/);
  });
});
