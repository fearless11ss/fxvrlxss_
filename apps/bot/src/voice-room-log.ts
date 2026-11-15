export interface VoiceRoomSnapshot {
  readonly bannedIds: readonly string[];
  readonly channelId: string;
  readonly createdAt: string;
  readonly deletedAt?: string;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly name: string;
  readonly ownerId: string;
  readonly trustedIds: readonly string[];
  readonly userLimit: number;
}

function inline(value: string): string {
  return `\`${value.replaceAll("`", "ˋ")}\``;
}

function timestamp(value: string): string {
  return `<t:${Math.floor(new Date(value).getTime() / 1_000)}:F>`;
}

function state(snapshot: VoiceRoomSnapshot): string {
  return [
    snapshot.locked ? "вход закрыт" : "вход открыт",
    snapshot.hidden ? "скрыта" : "видна",
    snapshot.userLimit === 0 ? "без лимита" : `лимит ${snapshot.userLimit}`,
  ].join(" · ");
}

export function describeVoiceRoomLifecycle(
  kind: "created" | "deleted",
  snapshot: VoiceRoomSnapshot,
): string {
  return [
    `Комната: ${inline(snapshot.name)}`,
    `ID: ${inline(snapshot.channelId)}`,
    `Владелец: <@${snapshot.ownerId}>`,
    `Создана: ${timestamp(snapshot.createdAt)}`,
    kind === "deleted" && snapshot.deletedAt
      ? `Удалена: ${timestamp(snapshot.deletedAt)}`
      : undefined,
    `Состояние: ${state(snapshot)}`,
    `Доступ: доверенных — ${snapshot.trustedIds.length} · забаненных — ${snapshot.bannedIds.length}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
