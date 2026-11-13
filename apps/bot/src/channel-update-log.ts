export interface ChannelPermissionSnapshot {
  readonly allow: string;
  readonly deny: string;
  readonly id: string;
  readonly type: number;
}

export interface ChannelUpdateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly nsfw?: boolean;
  readonly parentId: string | null;
  readonly permissionOverwrites: readonly ChannelPermissionSnapshot[];
  readonly position: number;
  readonly rateLimitPerUser?: number | null;
  readonly topic?: string | null;
  readonly type?: number;
}

export interface ChannelUpdateDescription {
  readonly changes: readonly string[];
  readonly summary: string;
  readonly title: string;
}

function permissionsKey(
  permissions: readonly ChannelPermissionSnapshot[],
): string {
  return JSON.stringify(
    [...permissions].sort(
      (left, right) =>
        left.type - right.type || left.id.localeCompare(right.id),
    ),
  );
}

function category(id: string | null): string {
  return id ? `<#${id}>` : "без категории";
}

export function describeChannelUpdate(
  before: ChannelUpdateSnapshot,
  after: ChannelUpdateSnapshot,
): ChannelUpdateDescription {
  const changes: string[] = [];
  const lines: string[] = [];

  if (before.name !== after.name) {
    changes.push("name");
    lines.push(`Канал переименован: \`${before.name}\` → \`${after.name}\`.`);
  }
  if (
    permissionsKey(before.permissionOverwrites) !==
    permissionsKey(after.permissionOverwrites)
  ) {
    changes.push("permissions");
    lines.push(`Изменены права доступа канала <#${after.id}>.`);
  }
  if (before.parentId !== after.parentId) {
    changes.push("parent");
    lines.push(
      `Канал <#${after.id}> перемещён: ${category(before.parentId)} → ${category(after.parentId)}.`,
    );
  }
  if (before.position !== after.position) {
    changes.push("position");
    lines.push(
      `Изменена позиция канала <#${after.id}>: ${before.position} → ${after.position}.`,
    );
  }
  if (before.type !== after.type) {
    changes.push("type");
    lines.push(`Изменён тип канала <#${after.id}>.`);
  }
  if (before.topic !== after.topic) {
    changes.push("topic");
    lines.push(`Изменена тема канала <#${after.id}>.`);
  }
  if (before.nsfw !== after.nsfw) {
    changes.push("nsfw");
    lines.push(
      `${after.nsfw ? "Включена" : "Отключена"} отметка 18+ для канала <#${after.id}>.`,
    );
  }
  if (before.rateLimitPerUser !== after.rateLimitPerUser) {
    changes.push("slowmode");
    lines.push(
      `Изменён медленный режим канала <#${after.id}>: ${before.rateLimitPerUser ?? 0} → ${after.rateLimitPerUser ?? 0} сек.`,
    );
  }

  if (changes.length === 0) {
    return {
      changes: ["other"],
      summary: `Обновлены параметры канала <#${after.id}>.`,
      title: "Канал изменён",
    };
  }

  const title =
    changes.length > 1
      ? "Канал изменён"
      : changes[0] === "permissions"
        ? "Права канала изменены"
        : changes[0] === "name"
          ? "Канал переименован"
          : changes[0] === "parent"
            ? "Канал перемещён"
            : changes[0] === "position"
              ? "Позиция канала изменена"
              : "Параметры канала изменены";
  return { changes, summary: lines.join("\n"), title };
}
