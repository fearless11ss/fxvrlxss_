import { describe, expect, it } from "vitest";

import { eventTypeLabel, plainAuditText, technicalJson } from "./format.js";

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

  it("resolves Discord mentions through the server resource catalog", () => {
    expect(
      plainAuditText("Канал: <#1570666844870807572>", {
        "1570666844870807572": "чат",
      }),
    ).toBe("Канал: #чат");
  });

  it("presents internal event types in plain Russian", () => {
    expect(eventTypeLabel("moderation.signals_observed")).toBe(
      "Сработала автомодерация",
    );
    expect(eventTypeLabel("future.unknown_event")).toBe(
      "Системное событие (future.unknown_event)",
    );
  });

  it("caps oversized technical payloads", () => {
    expect(technicalJson({ content: "x".repeat(13_000) })).toHaveLength(12_000);
    expect(technicalJson({ ok: true })).toBe('{\n  "ok": true\n}');
  });
});
