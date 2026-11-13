---
title: Implementation status
tags:
  - fxvrlxss
  - status
status: active
updated: 2026-11-13
---

# Implementation status

## Foundation

- [x] Monorepository and local `main` branch
- [x] Portable GitHub/Obsidian documentation map
- [x] Canonical Discord guild blueprint
- [x] Custom moderation domain engine and tests
- [x] PostgreSQL foundation schema and migration
- [x] Bot gateway and health endpoint
- [x] Automatic member onboarding and entry lifecycle messages
- [x] Ordered audit bus with Discord and PostgreSQL adapters
- [x] Owner-only Components V2 status command
- [x] Read-only Discord inventory CLI
- [x] Dashboard visual foundation and health endpoint
- [x] Docker Compose production topology
- [x] CI checks for docs, formatting, lint, types, tests, and build
- [x] Private GitHub remote
- [ ] Ubuntu container smoke-test

## Product modules

- [x] Single-owner password, TOTP, sessions, and brute-force protection
- [x] Versioned automoderation drafts
- [ ] Atomic configuration publication
- [ ] Discord-native AutoMod publication adapter
- [ ] Moderation sanctions, points, evidence, and appeals
- [x] Split Discord log routing and full database event journal foundation
- [ ] Ticket workflow and transcripts
- [ ] Temporary voice-room lifecycle
- [x] Additive staging guild blueprint reconciliation and dry-run
- [ ] Destructive production cleanup dry-run

## Launch

- [ ] Original brand asset set
- [x] Test guild blueprint applied and verified idempotent
- [ ] Tailscale and VPS hardening
- [ ] Production guild cutover
- [ ] Seven-day observation period

## Verification commands

```bash
npm run check
npm run build
npm audit --audit-level=moderate
```

See [deployment](operations/deployment.md) for infrastructure constraints and
[the repository map](architecture/repository-map.md) for module locations.
