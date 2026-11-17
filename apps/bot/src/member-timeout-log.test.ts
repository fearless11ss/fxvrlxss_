import { describe, expect, it } from "vitest";

import { describeMemberTimeoutChange } from "./member-timeout-log.js";

describe("member timeout audit wording", () => {
  const before = Date.parse("2026-11-16T08:00:00.000Z");
  const after = Date.parse("2026-11-16T10:00:00.000Z");

  it("distinguishes issuing, changing, and removing a timeout", () => {
    expect(describeMemberTimeoutChange(null, after)).toEqual({
      summary: "Тайм-аут выдан до <t:1794823200:F> (<t:1794823200:R>).",
      title: "Тайм-аут выдан",
    });
    expect(describeMemberTimeoutChange(before, after)).toEqual({
      summary: "Тайм-аут продлён: <t:1794816000:F> → <t:1794823200:F>.",
      title: "Тайм-аут продлён",
    });
    expect(describeMemberTimeoutChange(after, before)).toEqual({
      summary: "Срок тайм-аута сокращён: <t:1794823200:F> → <t:1794816000:F>.",
      title: "Срок тайм-аута сокращён",
    });
    expect(describeMemberTimeoutChange(before, null)).toEqual({
      summary: "Тайм-аут снят.",
      title: "Тайм-аут снят",
    });
  });
});
