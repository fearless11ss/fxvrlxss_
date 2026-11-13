---
title: Automoderation module
tags:
  - fxvrlxss
  - module
  - moderation
status: accepted
---

# Automoderation module

Detection ownership is intentionally non-overlapping.

## Discord-native detection

- Discord invite patterns (implemented);
- keyword and regex rules (planned);
- mention spam and mention raids;
- generic spam filter;
- member profile terms;
- Discord suspicious-link protection.

The dashboard publishes these rules through Discord's AutoMod endpoints. The
bot listens for execution events to apply points, additional sanctions, audit,
and appeal links.

## Bot detection

- message-rate flood;
- repeated messages;
- excessive capital letters;
- emoji spam;
- excessive message length;
- attachment frequency, MIME type, and file extension;
- join-rate raids and quarantine.

## Invariants

- One message receives at most one sanction: the strictest decision wins.
- All matched rules are included in the audit event.
- Every rule can observe, delete, time out, quarantine, kick, or ban. Kick and
  ban execute immediately only in enforcement mode.
- Timeout duration belongs to the individual rule; simultaneous timeout
  findings use the longest configured duration.
- New rules support observation mode before enforcement.
- Ordinary untouched messages are archived only in PostgreSQL. Discord receives
  message edits, deletions, moderation signals, and other actionable events.
- Dashboard edits create immutable versioned drafts; publishing remains disabled
  until the owner explicitly submits a draft.
- Publication moves a draft to `queued`; only the bot, which owns the Discord
  token, can acknowledge it as `published` after both native and custom rules
  have been applied. Failures are stored as `failed` with a visible reason.
- The bot polls at most one queued version at a time. The previously published
  version becomes `superseded` only after the replacement is applied.

## Current publication mapping

| Dashboard rule       | Enforcement owner |
| -------------------- | ----------------- |
| Discord invitations  | Discord AutoMod   |
| Flood                | Bot runtime       |
| Repeated messages    | Bot runtime       |
| Capital letters      | Bot runtime       |
| Emoji spam           | Bot runtime       |
| Message length       | Bot runtime       |
| Attachment type/rate | Bot runtime       |

The global observation mode reports matches without punishment. Enforcement
mode supports deletion, timeout, quarantine, kick, and ban. Administrator,
Manage Messages, and explicitly exempted roles/channels bypass custom checks.
