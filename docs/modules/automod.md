---
title: Automoderation module
tags:
  - fxvrlxss
  - module
  - moderation
status: accepted
---

# Automoderation module

Automod and manual moderation share one configuration publication, case
ledger, points total, escalation policy, notification path, and appeal flow.
Detection remains split between Discord-native rules and the bot runtime.

## Detection

Discord AutoMod owns invitation patterns. The bot owns flood, repeated
messages, capital letters, emoji spam, message length, attachment frequency,
MIME type, and extension checks. Both new and edited messages are inspected.
An edit replaces the earlier version in rate windows, so it does not count as
an additional message for flood.

## Rule actions

Each rule selects exactly one direct action: observe, add points, delete,
timeout, quarantine, kick, or ban. Point quantity is shown only for the
add-points action.

The global modes are:

- observation: log findings without cases, points, or actions;
- points: run only add-points rules, without direct or threshold sanctions;
- full: execute configured direct actions and threshold escalation.

When multiple rules match one message, the strictest direct action wins and
only the largest point value is added. All findings remain visible in evidence.
One source event creates at most one case; durable event keys prevent duplicate
Discord delivery from awarding it twice.

There is no incident cooldown. Every subsequent violating message or edited
version may create another case. Per-member processing is ordered, so the first
notification is delivered before the next queued violation is handled.

## Cases and notifications

Point awards, timeouts, quarantine, kicks, and bans create appealable cases. A
plain deletion with no points creates only an audit event and cannot be
appealed.

Before an action, the bot sends the member the violation, action, points, total,
case number, and appeal hint by direct message. If DMs are closed, it mentions
the member in the source channel without exposing evidence and deletes the
notice after one minute.

## Invariants

- Bots, the guild owner, administrators, explicitly exempt roles, and exempt
  channels bypass checks.
- Edited-message logs show both the archived old version and current version.
- Deleted-message evidence remains available in PostgreSQL.
- One combined dashboard draft publishes native rules and the shared moderation
  policy together. The Discord token remains in the bot.
- Detection is logged to `ЛОГИ/безопасность`, cases to `ЛОГИ/модерация`, and
  operational failures to `ЛОГИ/бот`.

See [the shared moderation module](moderation.md).
