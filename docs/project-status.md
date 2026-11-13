---
title: Implementation status
tags:
  - fxvrlxss
  - status
status: active
updated: 2026-11-12
---

# Implementation status

## Foundation

- [x] Monorepository and local `main` branch
- [x] Portable GitHub/Obsidian documentation map
- [x] Canonical Discord guild blueprint
- [x] Custom moderation domain engine and tests
- [x] PostgreSQL foundation schema and migration
- [x] Bot gateway and health endpoint
- [x] Read-only Discord inventory CLI
- [x] Dashboard visual foundation and health endpoint
- [x] Docker Compose production topology
- [x] CI checks for docs, formatting, lint, types, tests, and build
- [ ] Private GitHub remote
- [ ] Ubuntu container smoke-test

## Product modules

- [ ] Single-owner password and TOTP authentication
- [ ] Configuration drafts and atomic publication
- [ ] Discord-native AutoMod publication adapter
- [ ] Moderation sanctions, points, evidence, and appeals
- [ ] Ticket workflow and transcripts
- [ ] Temporary voice-room lifecycle
- [ ] Guild reconciliation and destructive cleanup dry-run

## Launch

- [ ] Original brand asset set
- [ ] Test guild verification
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
