export function plainAuditText(value: string): string {
  return value
    .replace(/<@&(\d+)>/gu, "@роль $1")
    .replace(/<@!?(\d+)>/gu, "@пользователь $1")
    .replace(/<#(\d+)>/gu, "#канал $1")
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
