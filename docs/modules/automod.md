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

- keyword and regex rules;
- Discord invite patterns;
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
- attachment frequency, MIME type, and file signature;
- join-rate raids and quarantine.

## Invariants

- One message receives at most one sanction: the strictest decision wins.
- All matched rules are included in the audit event.
- Permanent bans never result from text detection alone.
- New rules support observation mode before enforcement.
- Ordinary untouched messages are not archived.
