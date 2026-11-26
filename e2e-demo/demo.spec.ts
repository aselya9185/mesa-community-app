import { expect, test, type Locator } from '@playwright/test';
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
  await expect(page.getByRole('heading', { name: 'zumba after work' })).toBeVisible();
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
  await expect(bar(page)).toBeVisible(); // a way back from the invite page
  await page.getByLabel('password', { exact: true }).fill('welcome-demo-1');
  await page.locator('form:has(input[type="password"]) button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding\/card/);
  await expect(page.getByText('photos are switched off in the demo.')).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await noSidewaysScroll(page);
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

test('on a tablet the host can still read every name beside the buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await enter(page, 'member 2');
  await page.getByText('zumba after work').first().click();
  await expect(page.getByRole('heading', { name: 'zumba after work' })).toBeVisible();
  const going = page.getByRole('region', { name: /going/i });
  for (const name of ['júlia', 'marta', 'carla']) {
    const label = going.getByText(name, { exact: true });
    await expect(label).toBeVisible();
    expect(await label.evaluate((el) => el.scrollWidth - el.clientWidth), name).toBeLessThanOrEqual(0);
  }
  await noSidewaysScroll(page);
});

for (const width of [390, 1024, 1440]) {
  test(`the demo bar stays on screen when a long page is scrolled (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 420 });
    await enter(page, 'admin');
    await page.goto('/admin/members');
    await page.getByRole('listitem').filter({ hasText: /marta/i }).waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const box = await bar(page).boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect(box?.y).toBeLessThanOrEqual(1);
    await expect(bar(page).getByRole('button', { name: 'member 1' })).toBeInViewport();
  });
}

test('tabs and names are big enough to tap', async ({ page }) => {
  await enter(page, 'member 1');
  await page.getByText('zumba after work').first().click();
  await expect(page.getByRole('heading', { name: 'zumba after work' })).toBeVisible();
  const tall = async (target: Locator) => expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await tall(page.getByRole('region', { name: /going/i }).getByRole('link', { name: /júlia/ }));
  const plan = new URL(page.url()).pathname;
  await page.setViewportSize({ width: 390, height: 844 });
  await tall(page.getByRole('link', { name: 'chat', exact: true }));
  await page.goto(`${plan}?tab=chat`);
  await tall(page.getByRole('link', { name: 'Júlia', exact: true }));
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  await viewAs(page, 'admin');
  await page.goto('/admin/requests');
  await tall(page.getByRole('link', { name: /^members/ }));
});

test('switching on a page the next person cannot open lands on her plans', async ({ page }) => {
  const { data } = await svc.from('plans').select('id').eq('title', 'beach volleyball').single();
  await enter(page, 'member 1');
  await page.goto(`/plans/${data!.id}?tab=chat`);
  await expect(page.getByText('forecast says rain', { exact: false })).toBeVisible();
  await viewAs(page, 'member 2');
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByText('zumba after work').first()).toBeVisible();
});

test('the demo form still checks what is typed', async ({ page }) => {
  await page.goto('/apply');
  await page.getByLabel('your name').fill('Lu');
  await page.getByLabel('your instagram').fill('@lu.demo');
  await page.getByLabel('whatsapp number').fill('abc');
  await page.getByRole('button', { name: 'request invite' }).click();
  await expect(page.getByText('that number does not look right', { exact: false })).toBeVisible();
});

test('with only the server setting on, a real request is kept and nothing claims to be a demo', async ({ page }) => {
  const phone = '+34699111333';
  const off = await svc.from('demo_config').update({ enabled: false }).eq('id', 1);
  expect(off.error).toBeNull();
  try {
    await page.goto('/demo');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('link', { name: 'try the demo' })).toHaveCount(0);
    await page.goto('/apply');
    await expect(page.getByText('nothing you type in this form is saved in the demo.')).toHaveCount(0);
    await page.getByLabel('your name').fill('A Real Person');
    await page.getByLabel('your instagram').fill('@a.real.person');
    await page.getByLabel('whatsapp number').fill(phone);
    await page.getByRole('button', { name: 'request invite' }).click();
    await expect(page.getByRole('heading', { name: "you're on the list" })).toBeVisible();
    expect((await svc.from('applications').select('id').eq('whatsapp_e164', phone)).data).toHaveLength(1);
  } finally {
    await svc.from('applications').delete().eq('whatsapp_e164', phone);
    expect((await svc.from('demo_config').update({ enabled: true }).eq('id', 1)).error).toBeNull();
  }
});

test('the push hand-off sends nothing in the demo, and still refuses strangers', async ({ request }) => {
  const note = { notification_id: '00000000-0000-4000-8000-000000000000' };
  expect((await request.post('/api/push', { data: note })).status()).toBe(401);
  const mine = await request.post('/api/push', { data: note, headers: { 'x-push-secret': 'e2e-only-secret' } });
  expect(await mine.json()).toEqual({ skipped: 'demo' });
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
