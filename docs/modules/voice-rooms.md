---
title: Temporary voice rooms
tags:
  - fxvrlxss
  - module
  - voice
status: accepted
---

# Temporary voice rooms

The voice module turns `ГОЛОСОВЫЕ/создать-комнату` into a join-to-create entry
point. Created rooms live directly below it in the same Discord category. The
phrase "временные комнаты" in the server blueprint describes these dynamic
children; it is not a separate channel or nested category.

## Lifecycle

1. A member joins `создать-комнату`.
2. The bot creates one voice channel in `ГОЛОСОВЫЕ`, stores its state in
   PostgreSQL, and moves the member into it.
3. If the member already owns a room, the bot moves them back to that room
   instead of creating a duplicate.
4. The bot posts a persistent Components V2 control panel in the text chat of
   the new voice channel. Only the current owner can use its actions.
5. When the owner leaves an occupied room, ownership passes to a remaining
   human member who does not already own another room.
6. When no human members remain, the Discord channel and its active database
   record are deleted immediately.

## Owner controls

The published configuration can independently enable these actions:

- rename the room;
- set a participant limit from 0 to 99, where 0 is unlimited;
- lock or unlock joining;
- hide or show the room;
- grant access to or remove a member;
- transfer ownership to a member currently inside the room.

Locking and hiding apply explicit channel overwrites to `@everyone` and
`Участник`. The owner always receives explicit view and connect permissions.
Administrators continue to follow Discord's native permission rules.

## Recovery and safety

- PostgreSQL is the source of truth for owner, lock, visibility, and user
  limit.
- Startup reconciliation reapplies stored state, restores or updates the
  in-room control message, deletes empty managed rooms, and removes records for
  missing managed channels.
- The bot only reconciles channels already registered in
  `temporary_voice_rooms`; unrelated voice channels are never adopted or
  deleted.
- Disabling the module prevents new room creation without destroying occupied
  rooms.
- Configuration changes use immutable drafts and are acknowledged as published
  only after the bot updates every active in-room control panel.

See [the server structure](../discord/server-structure.md) and
[the architecture overview](../architecture/overview.md).
