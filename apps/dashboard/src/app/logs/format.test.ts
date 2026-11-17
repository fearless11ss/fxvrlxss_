import { describe, expect, it } from "vitest";

import { plainAuditText, technicalJson } from "./format.js";

describe("audit log presentation", () => {
  it("turns Discord markdown and mentions into readable panel text", () => {
    expect(
      plainAuditText(
        "Дело: **#0015**\nУчастник: <@1263863111589564468>\nПричина: fxvrlxss\\_ moderation",
      ),
    ).toBe(
      "Дело: #0015\nУчастник: @пользователь 1263863111589564468\nПричина: fxvrlxss_ moderation",
    );
  });

  it("caps oversized technical payloads", () => {
    expect(technicalJson({ content: "x".repeat(13_000) })).toHaveLength(12_000);
    expect(technicalJson({ ok: true })).toBe('{\n  "ok": true\n}');
  });
});
