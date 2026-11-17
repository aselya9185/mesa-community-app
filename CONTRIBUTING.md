# Contributing

How changes are made in this repository. The same rules apply to people and to AI assistants.

## Flow

1. **Start from an issue** (bug report or feature request) when the change is more than a typo.
2. **Branch from `main`**, short-lived: `fix/plan-form-stuck-step`, `feat/event-reminders`, `chore/ci-codeql`, `docs/readme-diagram`.
3. **Commit small**, with [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.
4. **Open a pull request.** Fill in the template. CI must be green.
5. **Squash merge.** The pull request title becomes the commit message on `main`, so it must follow the format below.

## Commit and PR titles

`type(scope): summary` in lowercase, present tense, no full stop.

| type | use for |
|---|---|
| `feat` | something members or admins can now do |
| `fix` | a bug |
| `perf` | speed |
| `refactor` | structure, no behaviour change |
| `test` | tests only |
| `docs` | documentation only |
| `ci` | workflows and automation |
| `chore` | tooling, dependencies, housekeeping |
| `security` | access rules, hardening |

Examples: `fix(plans): next button checks the step before moving on`, `feat(chat): unread badge on the chats tab`, `ci: run CodeQL on pull requests`.

## Before opening a pull request

```bash
npm run check      # lint, type-check, unit tests
npm run test:db    # needs the local Supabase (see README)
```

## Rules that always apply

- **Database changes are new migrations** in `supabase/migrations`. Never edit one that has been applied.
- **Security rules live in the database**, not only in the UI. A new table needs row level security and a test that fails without it.
- **Tests first for security.** Write the failing test, then the code.
- **No secrets** in the repository, logs or screenshots. No phone numbers or tokens in issues.
- **The service-role key** is only used in the places listed in `CLAUDE.md`.
- **Copy** is lowercase and playful (see existing screens).
- **Dependencies:** ask before adding one. Dev-only tools for quality gates are fine when agreed in the issue.

## Review

- Reviewers look first at: access rules, data exposure, migrations, then behaviour and tests.
- Fix review comments with follow-up commits on the same branch. Do not force-push over a reviewed commit.
- AI assistants follow the same flow: one branch per issue, a pull request, green CI, and a link back to the comment they address.

## Releases

Versions follow [semantic versioning](https://semver.org). Notable changes are listed in `CHANGELOG.md` under "Unreleased" and moved under a version when tagged.
