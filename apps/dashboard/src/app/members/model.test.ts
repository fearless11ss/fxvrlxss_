import { describe, expect, it } from "vitest";

import { buildMemberDirectory, filterMemberDirectory } from "./model.js";

describe("member directory model", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");

  it("merges current profiles, moderation cases, and tickets by user", () => {
    const members = buildMemberDirectory({
      cases: [
        {
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
          points: 2,
          status: "open",
          updatedAt: new Date("2026-11-16T10:00:00.000Z"),
          userId: "1000001",
        },
        {
          expiresAt: new Date("2026-11-01T00:00:00.000Z"),
          points: 4,
          status: "open",
          updatedAt: new Date("2026-11-15T10:00:00.000Z"),
          userId: "1000001",
        },
        {
          expiresAt: null,
          points: 5,
          status: "resolved",
          updatedAt: new Date("2026-11-14T10:00:00.000Z"),
          userId: "2000002",
        },
      ],
      members: [
        {
          id: "1000001",
          name: "Редактор",
          roleIds: ["role-1"],
          username: "editor",
        },
      ],
      now,
      tickets: [
        {
          authorId: "1000001",
          status: "closed",
          updatedAt: new Date("2026-11-17T09:00:00.000Z"),
        },
        {
          authorId: "2000002",
          status: "open",
          updatedAt: new Date("2026-11-17T11:00:00.000Z"),
        },
      ],
    });

    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activeCaseCount: 2,
          activePoints: 2,
          activeTicketCount: 0,
          caseCount: 2,
          id: "1000001",
          name: "Редактор",
          present: true,
          roleIds: ["role-1"],
          ticketCount: 1,
        }),
        expect.objectContaining({
          activeCaseCount: 0,
          activePoints: 0,
          activeTicketCount: 1,
          caseCount: 1,
          id: "2000002",
          name: "Неизвестный участник",
          present: false,
          ticketCount: 1,
        }),
      ]),
    );
  });

  it("filters by presence, attention, name, username, and ID", () => {
    const members = buildMemberDirectory({
      cases: [
        {
          expiresAt: null,
          points: 1,
          status: "open",
          updatedAt: now,
          userId: "1000001",
        },
      ],
      members: [
        {
          id: "1000001",
          name: "Редактор",
          roleIds: [],
          username: "editor",
        },
      ],
      now,
      tickets: [{ authorId: "2000002", status: "closed", updatedAt: now }],
    });

    expect(
      filterMemberDirectory(members, { query: "editor", scope: "attention" }),
    ).toHaveLength(1);
    expect(
      filterMemberDirectory(members, { query: "2000002", scope: "history" }),
    ).toHaveLength(1);
    expect(
      filterMemberDirectory(members, { query: "Ред", scope: "history" }),
    ).toHaveLength(0);
  });
});
