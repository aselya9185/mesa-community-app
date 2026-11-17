# Mesa

Invite-only, women-only community web app (PWA) for group outings in Barcelona. Plan: `docs/PLAN.md` (kept on the developer's computer only, not in the repo; source of truth for architecture, RLS, milestones). UI source of truth: the "brat club" screens (mobile B*, plus the tablet/desktop canvas "Mesa tablet and desktop"). If anything is ambiguous or you must deviate from the design or these rules, **stop and ask** instead of guessing.

## Stack

Next.js (App Router, TypeScript strict) · Supabase free tier (Postgres, Auth, Realtime, Storage, RLS) · Vercel Hobby · installable PWA. Plain CSS (CSS variables + CSS Modules), no Tailwind. Fonts: Bricolage Grotesque 800 (lowercase headings), DM Sans (body) via `next/font`.

## Commands

```bash
npm run dev          # next dev
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run check        # lint + typecheck + test (run before every commit)
npx supabase start -x imgproxy,studio,edge-runtime,vector,logflare,mailpit,postgres-meta   # local Supabase (needs Docker Desktop)
npm run test:db      # security/RLS integration tests (needs the local stack)
npm run test:e2e     # Playwright browser tests on desktop and phone (needs the local stack; builds and starts the app itself)
npm run seed         # dev admin + members + applications
npm run door -- list|approve <+e164>|resend <+e164>   # dev stand-in for the admin door list
node scripts/reset-admin-mfa.mjs             # lost phone: remove the admin's authenticator
node scripts/erase-member.mjs                # erase one person's data (needs CONFIRM=erase)
node scripts/vapid.mjs                       # make VAPID keys + webhook secret for web push (copy into .env.local)
node scripts/set-push-config.mjs <url>        # where the database sends push hand-offs (local: http://host.docker.internal:3000/api/push)
```

## Hard rules

- **Zero running cost for v1.** No paid APIs, SMS or plans. Ask before adding any paid service or any dependency not already approved: `@supabase/supabase-js`, `@supabase/ssr`, `web-push`, `zod`, `libphonenumber-js`, `vitest` (+ the Supabase CLI as a dev dependency). Playwright is approved as a dev dependency for end-to-end tests only. No Tailwind, PWA plugin or Turnstile.
- **Notifications:** web push + in-app only. No WhatsApp/Instagram API.
- **Privacy first.** RLS on every table. A logged-out, pending or removed user reads nothing. Members never see each other's WhatsApp numbers (only the admin does). `noindex` + `robots.txt` disallow-all. No secrets in the repo (`.env.example` only). The service-role key is server-only and used only for: the apply form (+ its rate limits), token redeem + account creation, the login rate limiter, admin auth actions (banning a removed member), web push. A test fails if client code imports it.
- **Auth:** Supabase Auth only (no hand-rolled hashing). Login = WhatsApp number + password. Users are created only via the admin API; public sign-up is disabled. Admin uses MFA (TOTP); `is_admin()` requires AAL2.
- **Invites:** one-time token, >=32 random chars, only its SHA-256 hash is stored, 7 days, single use (atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now()`). Reset link: 24 h. Reject never notifies.
- **Plans:** a plan is any outing. No spots/capacity, no filters; the feed is the next 7 days. The +1 is assigned only by the host, only to a joined member who has not booked; others never see who got it. Booked badges stay visible (decided).
- **Chat:** one realtime chat per plan, joined members only. System rows are written by triggers/RPCs, never by clients.
- **Design:** black `#0E0A0F`, neon pink `#FF2E93` / `#FF7AB8`, burgundy-mauve checker accents, pink glow, floating pill nav. Lowercase playful copy. Mobile first at 390px, tablet 1024, desktop 1440. 44px touch targets, visible focus, accessible contrast. No third-party brand assets.

## Conventions

- Tests first for security (see `docs/PLAN.md` §9). Each milestone: write tests, implement, run `npm run check`, commit with a clear message, summarise.
- All DB changes are migrations under `supabase/migrations`. Security rules live in the database, not only in the UI.
- `invites` has a column-level grant (no `token_hash`): `select('*')` on it errors for every client, so always list columns.
- Never import the service client from client code. Never log tokens, numbers or passwords.
- Copy follows the lowercase house style; see the appendix in `docs/PLAN.md` for undesigned states.

## Workflow (see CONTRIBUTING.md)

- One branch per issue, a pull request, green CI, squash merge. Never push to `main` once branch protection is on.
- Commit and PR titles: `type(scope): summary` (feat, fix, perf, refactor, test, docs, ci, chore, security), lowercase.
- Update `CHANGELOG.md` under "Unreleased" for anything users would notice.
- Fixing review comments: reproduce with a failing test when it is a bug, fix on the same branch, push a new commit, and say which comment it answers. Do not force-push over reviewed commits.
- Never edit a migration that has been applied; add a new one. Never touch secrets, `.env*` or the production database from a review fix.
- AI review and fix automation costs money to run: do not enable or change those workflows without the owner's go-ahead.
