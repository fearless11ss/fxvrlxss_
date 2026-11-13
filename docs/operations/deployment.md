---
title: Deployment
tags:
  - fxvrlxss
  - operations
status: accepted
---

# Deployment

## Target

- Ubuntu 22.04
- 2 vCPU
- 4 GB RAM
- 60 GB NVMe
- Docker Compose
- Tailscale on the host

## Network posture

- Deny incoming traffic by default.
- Dashboard binds to localhost and is exposed by Tailscale Serve.
- SSH becomes Tailscale-only after bootstrap.
- Tailscale device identity replaces public-IP allowlists.

## Secrets

Production secrets live in root-owned files outside Git. The Discord token is
mounted only into the bot container. The dashboard never receives it.

Docker Compose expects the files documented in
[the secret-file guide](../../secrets/README.md). The application supports
`*_FILE` variables so secret contents never need to appear in Compose
environment blocks.

## Backups

Encrypted PostgreSQL backups are stored outside the VPS: seven daily, four
weekly, and six monthly snapshots. Restore verification is part of operations,
not an assumed property of a backup file.
