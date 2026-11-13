---
title: Ticket module
tags:
  - fxvrlxss
  - module
  - support
status: accepted
---

# Ticket module

The ticket module turns `открыть-тикет` into a pinned Components V2 entry
panel. A member chooses a route, completes a modal, and receives a private text
channel under `ПОДДЕРЖКА`.

## Routes

| Key                 | Default label         | Purpose                                      |
| ------------------- | --------------------- | -------------------------------------------- |
| `help`              | Помощь                | Server help and questions for administration |
| `member-report`     | Жалоба на участника   | Report another member                        |
| `punishment-appeal` | Обжалование наказания | Request a punishment review                  |
| `partnership`       | Сотрудничество        | Partnership and collaboration proposals      |

The owner can edit labels and descriptions or disable a route without changing
its stable key.

## Lifecycle

1. The member selects a route and submits a subject and description.
2. The bot reserves a sequential ticket number and creates a private channel.
3. Configured staff roles can claim the ticket and add or remove participants.
4. The author or staff can close it with a required reason.
5. Closing stores a transcript, posts a readable copy to
   `КОМАНДА/обсуждение-обращений`, locks member replies, and keeps the channel
   for review. Staff can reopen it when the published configuration allows
   this.
6. Optional inactivity handling closes untouched tickets after the configured
   number of hours. A value of `0` disables automatic closing.

## Invariants

- A member cannot open two active tickets of the same route.
- The total number of active tickets per member is configurable from one to
  five.
- The `@everyone` overwrite cannot view ticket channels. Authors, explicitly
  added participants, configured staff roles, and administrators can access
  them.
- Ticket messages are archived in the database and are excluded from the public
  custom automoderation path so evidence and support context are not removed.
- Transcripts contain message authors, timestamps, text, and attachment
  metadata. Embeds, Components V2 data, stickers, replies, and edit timestamps
  are preserved as well. Discord tokens and panel credentials are never
  included.
- Discord receives the complete transcript as UTF-8 text attachments. Large
  histories are split across numbered files and, when necessary, multiple
  messages so card and upload limits do not truncate their contents.
- Dashboard changes are immutable drafts. Only the bot acknowledges a queued
  version as published after it updates the pinned Discord panel.

## Ownership

- `packages/domain` validates the versioned configuration.
- `packages/database` stores configuration versions, ticket state, participants,
  close reasons, and transcripts.
- `apps/bot` owns Discord channels, Components V2 interactions, permissions,
  lifecycle actions, and publication acknowledgement.
- `apps/dashboard` edits drafts and requests publication without receiving the
  Discord token.

See [the server structure](../discord/server-structure.md) and
[the architecture overview](../architecture/overview.md).
