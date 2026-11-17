# Security policy

Mesa is a private community app. Members' privacy matters most: phone numbers are visible only to the admin, and a logged-out, pending or removed user can read nothing.

## Reporting a problem

Please do not open a public issue for a security problem.

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and what could be exposed. Never include real phone numbers, tokens or passwords.

You can expect an acknowledgement within a few days.

## Scope

In scope: access rules (row level security), login and invite links, admin area and two-step sign-in, chat access, file access, anything that leaks member data.

Out of scope: findings that need a rooted device, social engineering, and problems in third-party services themselves.

## How the project protects data

- Row level security on every table, with tests in `tests/db` that act as visitors, pending, removed, member and admin users.
- Invite links are single-use, expire, and only a hash of the token is stored.
- The admin area requires two-step sign-in, enforced in the database.
- No secrets in the repository. The service key is server-only, and a test fails if client code imports it.
