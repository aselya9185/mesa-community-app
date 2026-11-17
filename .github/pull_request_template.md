## What and why

<!-- One or two sentences. Link the issue: "Closes #12". -->

## How to check it

<!-- Steps, or the test that proves it. Screenshots for anything visible (phone and desktop). -->

## Checklist

- [ ] Title follows `type(scope): summary` (see CONTRIBUTING.md)
- [ ] `npm run check` passes
- [ ] Database change? It is a new migration (no edited old ones), and `npm run test:db` passes
- [ ] Security rules live in the database, with a test that fails without them
- [ ] No secrets, phone numbers or tokens in code, logs or screenshots
- [ ] Copy follows the lowercase house style
- [ ] `CHANGELOG.md` updated under "Unreleased" when users would notice
