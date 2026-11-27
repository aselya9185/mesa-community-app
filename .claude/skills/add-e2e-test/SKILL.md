---
name: add-e2e-test
description: Add or fix a Playwright browser test. Use when a screen or flow changes, or a browser test fails.
---

- Normal suite: `e2e/`. Demo suite (demo switched on): `e2e-demo/`. Run both with `npm run test:e2e` (needs the local Supabase).
- Every test runs on desktop and phone. On phones the plan form has steps and chat is a tab.
- Start from `test.beforeEach(resetRateLimits)` (demo: `freshDemo`). Create data with `makeUser` / `makeApplication` and **unique names**: leftovers from earlier runs must never match.
- Log in with `login(page, user)`; it waits until you have left the login page.
- Select by role and visible text, not CSS classes. Scope to the list item when names repeat.
- Prefer waiting for what the user sees (`expect(...).toBeVisible()`) over fixed sleeps.
- A failure: read the screenshot and trace in `test-results/` first. Decide whether the app or the test is wrong, and say which.
- Realtime can say it is connected before it delivers: assert on the visible result with a generous timeout.
