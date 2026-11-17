# Changelog

All notable changes. Format based on [Keep a Changelog](https://keepachangelog.com), versions follow [semantic versioning](https://semver.org).

## [Unreleased]

### Fixed
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
