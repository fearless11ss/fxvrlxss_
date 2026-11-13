import { describe, expect, it } from "vitest";

import { describeChannelUpdate } from "./channel-update-log.js";

const base = {
  id: "channel-1",
  name: "тикет-0001",
  parentId: "support",
  permissionOverwrites: [{ allow: "1024", deny: "0", id: "role-1", type: 0 }],
  position: 4,
};

describe("channel update log", () => {
  it("identifies a permission-only update without claiming a rename", () => {
    const result = describeChannelUpdate(base, {
      ...base,
      permissionOverwrites: [
        { allow: "3072", deny: "0", id: "role-1", type: 0 },
      ],
    });

    expect(result.title).toBe("Права канала изменены");
    expect(result.summary).toContain(
      "Изменены права доступа канала <#channel-1>.",
    );
    expect(result.summary).not.toContain("тикет-0001` → `тикет-0001");
  });

  it("reports an actual rename", () => {
    const result = describeChannelUpdate(base, {
      ...base,
      name: "помощь-0001",
    });

    expect(result.title).toBe("Канал переименован");
    expect(result.summary).toContain("`тикет-0001` → `помощь-0001`");
  });
});
