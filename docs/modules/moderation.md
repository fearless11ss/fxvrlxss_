---
title: Moderation system
tags:
  - fxvrlxss
  - module
  - moderation
status: accepted
---

# Moderation system

The moderation system is a shared case and points ledger for staff decisions
and automod findings. Staff use `/модерация` through Components V2. The owner
configures automod, staff access, point expiry, and escalation on one dashboard
page and publishes them as one version.

## Manual cases

A warning always adds one point. A manual timeout, kick, or ban adds zero points
and is applied exactly at staff discretion; it is not strengthened by existing
points. Staff can issue a separate warning when a sanction should also add a
point.

The bot creates a case before changing Discord. A failed action resolves that
case as unsuccessful. History shows manual and automod cases together and lets
staff revoke active cases with a required reason.

## Points and escalation

Active, unexpired points are summed across manual warnings and automod point
rules. Default thresholds are a 180-minute timeout at 3 points, kick at 6, and
ban at 10. Thresholds apply to new manual warnings and to automod point awards
in full mode. Points mode records points without threshold sanctions. Changing
policy never rewrites existing cases.

## Appeals

The punishment-appeal ticket requires an active case belonging to its author.
Ban notifications identify the source guild and include a permanent invitation
to the dedicated appeal guild. Other sanctions link directly to the main
guild's ticket panel. Approval resolves the main-guild case and removes its
points. It also removes a timeout, quarantine role, or ban when possible. A kick
or deleted message cannot be restored. Denial leaves the case active; author
closure records withdrawal. Appeal decisions are final and linked tickets
cannot be reopened.

## Invariants

- Only administrators and configured staff roles can use manual controls.
- Bots, the guild owner, the acting moderator, and members at or above the
  moderator's highest role cannot be manually targeted.
- Point awards, timeout, quarantine, kick, and ban are durable cases. Plain
  deletion without points is audit-only and cannot be appealed.
- Active points include open and appealed cases, excluding expired and resolved
  cases.
- One source event can create at most one case and one appeal result.
- Case creation, revocation, and appeal results go to `ЛОГИ/модерация`;
  technical failures go to `ЛОГИ/бот`.

## Ownership

- `packages/domain` validates the combined configuration and escalation policy.
- `packages/database` stores cases, evidence, source-event identity, appeal
  state, and configuration versions.
- `apps/bot` owns Discord detection, sanctions, notifications, reversals, and
  appeals.
- `apps/dashboard` owns the combined owner-only editor and atomic publication.

See [automoderation](automod.md) and [tickets](tickets.md).
