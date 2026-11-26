---
name: demo-mode
description: Change anything about the public demo (the one-click entry, the fake people and data, the reset, or what demo accounts may do).
---

- On only when the server has `DEMO_MODE=true` **and** the database has `demo_config.enabled`. The database refuses to switch on where real members exist.
- Safety rules live in `supabase/migrations/*_demo.sql`: demo accounts cannot make password links for real accounts or the cast, remove them, upload photos, register for pings or flood plans. The public request form stores nothing. Add a test in `tests/db/demo.test.ts` for any new ability.
- Sample people and plans are in `demo_cast()` and `demo_reset()` (a new migration with `create or replace`). Numbers stay in `+34 600 000 0xx`. Nothing real, ever.
- A nightly job calls `demo_reset_nightly()`. It must never touch an account that is not marked as demo.
- New features should be visible in the sample data, in each persona's hint on `/demo`, and in `e2e-demo/`.
- Full-height layouts subtract `var(--demo-h, 0px)` for the demo bar.
