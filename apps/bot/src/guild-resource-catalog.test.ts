import { Collection } from "discord.js";
import { describe, expect, it } from "vitest";

import { collectGuildResourceCatalog } from "./guild-resource-catalog.js";

describe("guild resource catalog", () => {
  it("collects message channels, roles, and members", () => {
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
      members: {
        cache: new Collection([
          [
            "member-1",
            {
              displayName: "Редактор",
              guild: { id: "guild" },
              id: "member-1",
              roles: {
                cache: new Collection([
                  ["guild", { id: "guild", name: "@everyone", position: 0 }],
                  [
                    "moderator",
                    { id: "moderator", name: "Модератор", position: 4 },
                  ],
                ]),
                highest: { position: 4 },
              },
              user: { username: "editor" },
            },
          ],
        ]),
      },
      roles: {
        cache: new Collection([
          [
            "guild",
            {
              guild: { id: "guild" },
              id: "guild",
              name: "@everyone",
              position: 0,
            },
          ],
          [
            "moderator",
            {
              guild: { id: "guild" },
              id: "moderator",
              name: "Модератор",
              position: 4,
            },
          ],
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
      {
        id: "member-1",
        kind: "member",
        name: "Редактор",
        parentName: "editor",
        position: 4,
        roleIds: ["moderator"],
      },
    ]);
  });
});
