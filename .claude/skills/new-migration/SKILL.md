---
name: new-migration
description: Add or change database tables, columns, policies, functions or triggers. Use for any change under supabase/migrations.
---

1. **Never edit an applied migration** (CI fails it). Add `supabase/migrations/<yyyymmddhhmmss>_<short_name>.sql`.
2. Every new table: `enable row level security`, explicit policies, `revoke all ... from public, anon`, column-level grants.
3. Functions: `security definer set search_path = ''`, fully qualified names, and `revoke all ... from public, anon, authenticated` before granting only what is needed.
4. **Write the failing test first** (see `rls-test-first`).
5. Apply locally: `npx supabase migration up`, then `npm run test:db`.
6. **Think about deploy order.** Old code runs until the deploy finishes; new code may start before the migration.
   - Adding things: migrate first, then deploy.
   - Dropping or renaming: expand first (add the new, make code use it), contract in a later change.
   - Say the order in the pull request.
7. Existing rows: what happens to them? New constraints on old data should be `not valid` or the data fixed in the same migration.
8. Before touching a real database: dry-run (`db push --remote --dry-run`) and rehearse risky SQL in a statement that raises, so it rolls back. Applying to the real database needs the owner's go-ahead.
