---
title: Discord server structure
tags:
  - fxvrlxss
  - discord
status: accepted
---

# Discord server structure

The following order is canonical and protected by an automated test.

```text
прихожая
правила
навигация

ИНФО
├─ объявления
└─ бусты

ПОДДЕРЖКА
├─ открыть-тикет
└─ создаваемые тикеты

ОБЩЕНИЕ
├─ чат
└─ команды-бота

ГОЛОСОВЫЕ
├─ создать-комнату
└─ временные комнаты

КОМАНДА
├─ чат-команды
└─ обсуждение-обращений

ЛОГИ
├─ безопасность
├─ модерация
├─ сообщения
├─ сервер
└─ бот
```

## Roles

1. `Владелец`
2. `fxvrlxss_`
3. `Куратор`
4. `Модератор`
5. `Испытательный срок`
6. Discord Server Booster managed role
7. `Участник`
8. `Карантин`

The bot permanently has Administrator by explicit owner decision. Its token is
therefore treated as a root-equivalent secret.

## Support flow

`открыть-тикет` contains one pinned Components V2 panel. New private text
channels are created directly under `ПОДДЕРЖКА`, numbered sequentially, and
retained after closing for staff review. The four default routes are documented
in [the ticket module](../modules/tickets.md).

## Entry flow

New members see only `прихожая`, `правила`, and `навигация`. After Discord rule
screening and the Components V2 confirmation, the bot grants `Участник` or
places a risky account in `Карантин`.

## Voice flow

`создать-комнату` is the only permanent voice channel. Temporary rooms are
created directly below it in `ГОЛОСОВЫЕ` and are removed as soon as no human
members remain. Their lifecycle is documented in
[the temporary voice room module](../modules/voice-rooms.md).

## Appeal server

Banned members use a separate, minimal guild. The only public channel is the
appeal interface. The bot runs only the appeal-ticket module there.

```text
АПЕЛЛЯЦИИ
├─ открыть-апелляцию
└─ создаваемые тикеты

КОМАНДА
└─ обсуждение-апелляций

ЛОГИ
└─ апелляции
```

The appeal is tied to the main guild's moderation case by Discord user ID and
case number. Approval reverses the reversible action in the main guild. The
appeal guild does not run the main automod, voice, welcome, or manual moderation
modules.
