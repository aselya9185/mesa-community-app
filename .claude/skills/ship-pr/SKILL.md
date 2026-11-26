---
name: ship-pr
description: Take finished work to main safely in this repository. Use when asked to open, ship or merge a pull request.
---

1. Branch from `main`, never commit to it. If the owner runs a dev server in the main folder, work in a `git worktree`.
2. `npm run check`, `npm run test:db`, `npm run test:e2e`.
3. Update `CHANGELOG.md` under "Unreleased" for anything users notice.
4. Commit and title: `type(scope): summary` (see `CONTRIBUTING.md`). Stage files on purpose.
5. Open the pull request with the template. State the deploy and migration order.
6. Run the `qa-tester` agent with only the "done when" list and the branch. Fix what it finds and run it again.
7. Merge (squash) only when every required check is green and the owner has allowed it.
8. `main` deploys by itself. Check the live site afterwards, and say what you could not check.

Merging with `--delete-branch` closes any pull request stacked on that branch: rebase it onto `main` and reopen.
