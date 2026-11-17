export interface MemberTimeoutChangeDescription {
  readonly summary: string;
  readonly title: string;
}

function discordTimestamp(timestamp: number, style: "F" | "R"): string {
  return `<t:${Math.floor(timestamp / 1_000)}:${style}>`;
}

export function describeMemberTimeoutChange(
  before: number | null,
  after: number | null,
): MemberTimeoutChangeDescription {
  if (before === null && after !== null) {
    return {
      summary: `Тайм-аут выдан до ${discordTimestamp(after, "F")} (${discordTimestamp(after, "R")}).`,
      title: "Тайм-аут выдан",
    };
  }
  if (before !== null && after === null) {
    return { summary: "Тайм-аут снят.", title: "Тайм-аут снят" };
  }
  if (before !== null && after !== null) {
    const extended = after > before;
    return {
      summary: `${extended ? "Тайм-аут продлён" : "Срок тайм-аута сокращён"}: ${discordTimestamp(before, "F")} → ${discordTimestamp(after, "F")}.`,
      title: extended ? "Тайм-аут продлён" : "Срок тайм-аута сокращён",
    };
  }
  return { summary: "Тайм-аут не изменился.", title: "Тайм-аут не изменился" };
}
