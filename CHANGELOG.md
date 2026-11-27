# Changelog

All notable changes. Format based on [Keep a Changelog](https://keepachangelog.com), versions follow [semantic versioning](https://semver.org).

## [Unreleased]

### Added
- Demo mode: try the app in one click as member 1, member 2 (host) or the admin, switch at any time from a bar at the top, with fake people and plans that start fresh every night. Photos, pings and real WhatsApp messages are off, the request form saves nothing, a demo database never holds real members or real requests, and demo accounts cannot touch or see into real ones (enforced in the database). What a visitor changes on a demo login is undone at the nightly reset, and switching the demo off shuts every demo account.
- Easier tapping: plan, chat and admin tabs and name links are now at least 44px tall.
- Project skills for AI-assisted work in `.claude/skills/`.

### Security
- A member who is removed, or who rejoins, always comes back with her instagram handle private.
- A form error on your card no longer re-ticks "show my instagram": your choice and what you typed are kept.
- The database refuses blank or link-shaped instagram handles.
- The door list shows who an applicant says invited her.
- Handles must look like handles everywhere (request form, "invited by", card, door list); older values that did not are cleaned up.
- Removing a member reports an error if it fails; a voucher without a handle still shows by name; the request form keeps "invited by" after a mistake; the card form puts the cursor on the field to fix.

### Fixed
- A plan you host or have joined always stays in your plans list, even when it is more than a week away (it used to show only in chats). Other people's plans still show for the next 7 days.
- Plan form: day and time numbers are centred again, and "next" no longer shows beside "drop it" on desktop.

### Changed
- Instagram handles are private by default: only the member and the admin see a handle, and other members see it only when she turns on "show my instagram on my card". The handle moved to its own table with its own access rules (database migration, with tests). Existing handles are kept and stay private until their owner opts in.
- The request form says that the handle is only for the admin.

### Changed
- "Plans after" is always there for people who are going, even when the host picked no options: anyone can add the first idea, and others vote.

### Fixed
- The plan page updates by itself when someone joins, leaves, gets the +1 or the plan changes, without reloading.
- Hosts see what is missing before the free +1 can be given: a booking link, and someone who has joined.

### Added
- End-to-end browser tests (Playwright) on desktop and phone sizes: visitors, the invite journey with two-step sign-in, and a plan with join, live chat, poll and cancel.
- CI: production build, dependency audit, migration history check, secrets guard test, weekly dependency updates, code scanning (runs once the repository is public).

## [0.1.0] - 2026-11-17

First live version.

### Added
- Membership: request an invite, admin approval, one-time invite links, login with WhatsApp number and password.
- Plans: feed, detail, create, edit, cancel, join and leave, host tools.
- Booking states, a host-assigned free +1, and a "plans after" poll.
- Realtime plan chat, in-app notifications and web push.
- Report and block, member profiles with photos.
- Admin door list with two-step sign-in.
- Installable PWA, offline page, accessibility pass.
- Automated tests for access rules (visitors, pending, removed, member, admin).

### Fixed
- Plan form: no longer gets stuck on the first step after a server error; errors clear as the field is edited.
- Plan form: "next" checks names, links and dates before moving on; day and time fields no longer overlap on iOS.
- Chat page fits one screen on phones, so only the messages scroll.
- Host's empty going list reads "just you so far"; cancelled plans no longer show the +1 card.

### Changed
- "Plans after" options start unselected; no options means no poll.
- Passwords need 8+ characters with a letter and a number.
- App runs in the same region as the database, with fewer sequential queries per page.
