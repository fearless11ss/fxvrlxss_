---
title: ADR-001 — Declarative guild blueprint
tags:
  - fxvrlxss
  - adr
  - discord
status: accepted
---

# ADR-001 — Declarative guild blueprint

## Decision

Represent the desired Discord structure as immutable domain data. The Discord
adapter computes and applies a plan from current state to desired state.

## Consequences

- Dry-runs and production changes use the same plan.
- Repeated application is idempotent.
- Channel order is testable without Discord.
- Cleanup remains a separate, explicitly destructive operation.

The canonical ordering is documented in
[Discord server structure](../discord/server-structure.md).
