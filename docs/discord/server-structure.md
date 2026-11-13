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
