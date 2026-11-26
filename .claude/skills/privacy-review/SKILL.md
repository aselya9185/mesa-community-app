---
name: privacy-review
description: Review a feature for privacy before building or merging it. Use whenever it shows, stores, sends or shares anything about a person.
---

Answer in writing, with file and line evidence:

1. What personal data is involved (name, number, handle, photo, where and when someone will be, messages)?
2. Who can read it: visitor, pending, removed, member, host, admin, demo account? Enforced where in the database?
3. Is it **private by default**? Can she change that, and does an error, a rejoin, a removal or a reset ever switch it back on?
4. Does anything leak it indirectly: joins, counts, system messages, notifications, logs, error messages, URLs, signed links?
5. What happens on removal and on erase (`scripts/erase-member.mjs`)?
6. In the demo: can a stranger type real data that gets stored, or change something real?

Phone numbers are admin only. Instagram handles are private unless the member opts in. Never log numbers, tokens or passwords.
