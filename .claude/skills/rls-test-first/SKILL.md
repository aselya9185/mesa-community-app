---
name: rls-test-first
description: Write access-rule tests before changing who can read or write data. Use for new tables, columns, policies, RPCs or anything privacy related.
---

Add to `tests/db/` using `tests/db/helpers.ts`. Write the tests, watch them **fail**, then write the migration.

Check each of these callers, for read **and** write:

| caller | helper |
|---|---|
| visitor | `anonClient()` |
| signed in, never approved | `makeUser({ withProfile: false })` |
| removed member | `makeUser({ status: 'removed' })` |
| another member | a second `makeUser()` |
| the owner of the row | `signIn(user)` |
| admin without two-step | `signIn(admin)` |
| admin with two-step | `signInAal2(admin)` |
| demo accounts | see `tests/db/demo.test.ts` |

- A policy that hides a row makes an update affect 0 rows without an error: assert on the returned rows **and** re-read with `serviceClient()`.
- A good test fails when the rule is removed. Try it: delete the condition, reset the local database, run the test.
- Never rely on the interface for a rule: the public key plus a session can call the database directly.
