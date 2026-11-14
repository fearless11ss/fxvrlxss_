---
title: Repository map
tags:
  - fxvrlxss
  - architecture
  - map
status: active
---

# Repository map

```text
apps/
  bot/          Discord gateway adapter and runtime
  dashboard/    Private owner control panel
  ops-cli/      Inventory, dry-run, cleanup, and deployment-safe operations
packages/
  domain/       Pure policies, guild blueprint, moderation decisions
  database/     PostgreSQL schema and persistence adapters
  security/     Password hashing, TOTP, encryption, session and IP hashing
docs/           Obsidian vault and GitHub documentation
infra/          Docker and deployment configuration
scripts/        Repository validation utilities
assets/         User-provided visual references
```

## Navigation

- Policy changes begin in [the domain package](overview.md#modules-and-seams).
- Discord ordering is defined by the
  [server structure](../discord/server-structure.md).
- Automod ownership is defined by the
  [automoderation module](../modules/automod.md).
- Ticket ownership and lifecycle are defined by the
  [ticket module](../modules/tickets.md).
- Temporary room ownership and cleanup are defined by the
  [voice room module](../modules/voice-rooms.md).
- Deployment decisions live in [deployment](../operations/deployment.md).

> [!WARNING]
> Never place Discord tokens, database passwords, TOTP seeds, SSH private keys,
> or backup credentials in this repository.
