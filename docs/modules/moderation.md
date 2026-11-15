---
title: Manual moderation module
tags:
  - fxvrlxss
  - module
  - moderation
status: accepted
---

# Manual moderation module

Manual moderation is a Discord-first staff workflow backed by permanent cases
in PostgreSQL. Staff open `/модерация`, select a member, and use Components V2
controls for a warning, timeout, kick, ban, history, or revocation. The private
dashboard only controls policy; it does not replace the staff workflow.

## Case lifecycle

1. A configured staff member opens a member card with `/модерация`.
2. The action modal requires a reason and accepts an optional evidence link or
   reference. A timeout also requires its duration.
3. The bot creates a sequential case before applying the Discord action. If the
   Discord action fails, the case is immediately resolved as unsuccessful so
   an untracked sanction cannot remain.
4. The case contributes configured points until its expiry date or until an
   approved appeal or staff revocation resolves it.
5. History shows the latest cases and lets staff revoke an active case with a
   required reason. Revoking a timeout or ban also reverses that Discord action
   when it still exists.

## Points and escalation

Each requested action has a configurable point value. The policy sums active,
unexpired points and may raise a requested action to the highest reached
threshold. Defaults are:

| Requested action | Points |
| ---------------- | -----: |
| Warning          |      1 |
| Timeout          |      2 |
| Kick             |      4 |
| Ban              |      6 |

The default thresholds are a 180-minute timeout at 3 points, kick at 6, and ban
at 10. Enabled thresholds must increase strictly. Existing cases keep their
recorded points and action when policy changes; the new policy applies to the
next case.

## Appeals

The `Обжалование наказания` ticket route requires a case number. The ticket is
created only when the case is active, belongs to the author, and has not already
received an appeal decision. The ticket control card displays the linked case.

When staff close the ticket they must enter `удовлетворено` or `отклонено`.
Approval resolves the case, removes its active points, and reverses a timeout or
ban when possible. Denial keeps the case and its points active. When the author
closes the ticket, the appeal is recorded as withdrawn. Appeal decisions are
final, so linked tickets cannot be reopened; further discussion uses a normal
help ticket.

## Invariants

- Only administrators and published staff roles can use moderation controls.
- Bots, the guild owner, the acting moderator, and members at or above the
  moderator's highest role cannot be targeted.
- Every attempted sanction has a durable case number before Discord is changed.
- Active points include open and currently appealed cases, but exclude expired
  and resolved cases.
- A case can receive at most one appeal result.
- The Discord token remains in the bot service. The owner dashboard publishes
  validated configuration through PostgreSQL.

## Ownership

- `packages/domain` validates point values, expiry, thresholds, and escalation.
- `packages/database` stores cases, evidence, appeal state, and configuration
  versions.
- `apps/bot` owns staff authorization, Components V2, Discord sanctions,
  reversals, cases, and appeal integration.
- `apps/dashboard` owns the single-owner policy editor and publication status.

## Audit routing

Case creation, revocation, and appeal decisions are sent to `ЛОГИ/модерация`
with member and moderator mentions, case number, action, points, reason, and
evidence. Failures to apply a sanction or finish a linked appeal are sent to
`ЛОГИ/бот`. PostgreSQL retains the full structured event journal.

See [the ticket module](tickets.md) and
[the architecture overview](../architecture/overview.md).
