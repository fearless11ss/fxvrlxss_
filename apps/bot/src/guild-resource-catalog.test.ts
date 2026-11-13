import { Collection } from "discord.js";
import { describe, expect, it } from "vitest";

import { collectGuildResourceCatalog } from "./guild-resource-catalog.js";

describe("guild resource catalog", () => {
  it("collects message channels and roles without everyone or threads", () => {
    const guild = {
      channels: {
        cache: new Collection([
          [
            "chat",
            {
              id: "chat",
              isTextBased: () => true,
              isThread: () => false,
              name: "чат",
              parent: { name: "ОБЩЕНИЕ" },
              rawPosition: 2,
            },
          ],
          [
            "thread",
            {
              id: "thread",
              isTextBased: () => true,
              isThread: () => true,
              name: "ветка",
              parent: null,
              rawPosition: 1,
            },
          ],
        ]),
      },
      id: "guild",
      roles: {
        cache: new Collection([
          ["guild", { id: "guild", name: "@everyone", position: 0 }],
          ["moderator", { id: "moderator", name: "Модератор", position: 4 }],
        ]),
      },
    };

    expect(collectGuildResourceCatalog(guild as never)).toEqual([
      {
        id: "chat",
        kind: "channel",
        name: "чат",
        parentName: "ОБЩЕНИЕ",
        position: 2,
      },
      {
        id: "moderator",
        kind: "role",
        name: "Модератор",
        position: 4,
      },
    ]);
  });
});
