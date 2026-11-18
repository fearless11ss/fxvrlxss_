const eventTypeLabels: Readonly<Record<string, string>> = {
  "appeal_server.ready": "Сервер апелляций запущен",
  "appeal_server.stopping": "Сервер апелляций останавливается",
  "bot.ready": "Бот запущен",
  "bot.stopping": "Бот останавливается",
  "channel.created": "Канал создан",
  "channel.deleted": "Канал удалён",
  "channel.updated": "Канал изменён",
  "configuration.automod_draft_saved": "Черновик автомодерации сохранён",
  "configuration.automod_publication_failed":
    "Не удалось опубликовать автомодерацию",
  "configuration.automod_published": "Автомодерация опубликована",
  "configuration.automod_queued": "Автомодерация поставлена в очередь",
  "configuration.moderation_publication_failed":
    "Не удалось опубликовать настройки модерации",
  "configuration.moderation_published": "Настройки модерации опубликованы",
  "configuration.moderation_system_draft_saved": "Черновик модерации сохранён",
  "configuration.moderation_system_queued":
    "Настройки модерации поставлены в очередь",
  "configuration.tickets_draft_saved": "Черновик тикетов сохранён",
  "configuration.tickets_publication_failed":
    "Не удалось опубликовать настройки тикетов",
  "configuration.tickets_published": "Настройки тикетов опубликованы",
  "configuration.tickets_queued": "Настройки тикетов поставлены в очередь",
  "configuration.voice_draft_saved": "Черновик голосовых комнат сохранён",
  "configuration.voice_publication_failed":
    "Не удалось опубликовать настройки голосовых комнат",
  "configuration.voice_published": "Настройки голосовых комнат опубликованы",
  "configuration.voice_queued":
    "Настройки голосовых комнат поставлены в очередь",
  "dashboard.login_failed": "Неудачный вход в панель",
  "dashboard.login_succeeded": "Вход в панель выполнен",
  "discord_automod.executed": "Сработала автомодерация Discord",
  "invite.created": "Приглашение создано",
  "invite.deleted": "Приглашение удалено",
  "member.banned": "Участник забанен",
  "member.joined": "Участник присоединился",
  "member.left": "Участник вышел",
  "member.onboarding_failed": "Не удалось настроить нового участника",
  "member.timeout_changed": "Тайм-аут участника изменён",
  "member.timeout_expired": "Тайм-аут участника завершён",
  "member.unbanned": "Участник разбанен",
  "member.updated": "Участник изменён",
  "message.bulk_deleted": "Сообщения удалены массово",
  "message.created": "Сообщение отправлено",
  "message.deleted": "Сообщение удалено",
  "message.updated": "Сообщение изменено",
  "moderation.action_failed": "Не удалось применить наказание",
  "moderation.appeal_resolution_failed": "Не удалось завершить апелляцию",
  "moderation.appeal_resolved": "Апелляция рассмотрена",
  "moderation.automod_case_created": "Автомодерация создала дело",
  "moderation.case_created": "Дело модерации создано",
  "moderation.case_failed": "Не удалось создать дело модерации",
  "moderation.case_revoked": "Наказание отменено",
  "moderation.signals_observed": "Сработала автомодерация",
  "role.created": "Роль создана",
  "role.deleted": "Роль удалена",
  "role.updated": "Роль изменена",
  "ticket.channel_deleted": "Канал тикета удалён",
  "ticket.claimed": "Тикет назначен сотруднику",
  "ticket.closed": "Тикет закрыт",
  "ticket.opened": "Тикет открыт",
  "ticket.participant_added": "Участник добавлен в тикет",
  "ticket.participant_removed": "Участник удалён из тикета",
  "ticket.reopened": "Тикет открыт повторно",
  "ticket.transcript_delivery_failed": "Не удалось отправить транскрипт тикета",
  "voice.access_banned_added": "Пользователь добавлен в забаненные",
  "voice.access_banned_removed": "Пользователь удалён из забаненных",
  "voice.access_blocked": "Вход в голосовую комнату заблокирован",
  "voice.access_trusted_added": "Пользователь добавлен в доверенные",
  "voice.access_trusted_removed": "Пользователь удалён из доверенных",
  "voice.channel_changed": "Голосовой канал участника изменён",
  "voice.owner_transferred_automatically":
    "Владелец голосовой комнаты сменён автоматически",
  "voice.room_created": "Временная голосовая комната создана",
  "voice.room_deleted": "Временная голосовая комната удалена",
  "voice.room_updated": "Временная голосовая комната изменена",
};

export function eventTypeLabel(eventType: string): string {
  return eventTypeLabels[eventType] ?? `Системное событие (${eventType})`;
}

export function plainAuditText(
  value: string,
  resourceNames: Readonly<Record<string, string>> = {},
): string {
  return value
    .replace(
      /<@&(\d+)>/gu,
      (_, id: string) => `@${resourceNames[id] ?? `роль ${id}`}`,
    )
    .replace(
      /<@!?(\d+)>/gu,
      (_, id: string) => `@${resourceNames[id] ?? `пользователь ${id}`}`,
    )
    .replace(
      /<#(\d+)>/gu,
      (_, id: string) => `#${resourceNames[id] ?? `канал ${id}`}`,
    )
    .replace(/\\([\\_*`~|])/gu, "$1")
    .replace(/\*\*/gu, "")
    .replace(/`/gu, "");
}

export function technicalJson(
  value: Readonly<Record<string, unknown>>,
): string {
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 12_000
    ? `${serialized.slice(0, 11_999)}…`
    : serialized;
}
