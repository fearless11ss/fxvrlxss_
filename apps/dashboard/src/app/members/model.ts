import type { MemberFilters } from "./filters.js";

export interface MemberProfileSource {
  readonly id: string;
  readonly name: string;
  readonly roleIds: readonly string[];
  readonly username?: string;
}

export interface MemberCaseSource {
  readonly points: number;
  readonly status: "appealed" | "open" | "resolved";
  readonly updatedAt: Date;
  readonly userId: string;
  readonly expiresAt: Date | null;
}

export interface MemberTicketSource {
  readonly authorId: string;
  readonly status: "claimed" | "closed" | "open" | "reopened";
  readonly updatedAt: Date;
}

export interface DirectoryMember {
  readonly activeCaseCount: number;
  readonly activePoints: number;
  readonly activeTicketCount: number;
  readonly caseCount: number;
  readonly id: string;
  readonly lastActivityAt: Date | null;
  readonly name: string;
  readonly present: boolean;
  readonly roleIds: readonly string[];
  readonly ticketCount: number;
  readonly username?: string;
}

interface MutableDirectoryMember {
  activeCaseCount: number;
  activePoints: number;
  activeTicketCount: number;
  caseCount: number;
  id: string;
  lastActivityAt: Date | null;
  name: string;
  present: boolean;
  roleIds: readonly string[];
  ticketCount: number;
  username?: string;
}

function emptyMember(id: string): MutableDirectoryMember {
  return {
    activeCaseCount: 0,
    activePoints: 0,
    activeTicketCount: 0,
    caseCount: 0,
    id,
    lastActivityAt: null,
    name: "Неизвестный участник",
    present: false,
    roleIds: [],
    ticketCount: 0,
  };
}

function later(current: Date | null, candidate: Date): Date {
  return !current || candidate > current ? candidate : current;
}

export function buildMemberDirectory(
  input: Readonly<{
    cases: readonly MemberCaseSource[];
    members: readonly MemberProfileSource[];
    now: Date;
    tickets: readonly MemberTicketSource[];
  }>,
): readonly DirectoryMember[] {
  const directory = new Map<string, MutableDirectoryMember>();
  const get = (id: string) => {
    const existing = directory.get(id);
    if (existing) return existing;
    const member = emptyMember(id);
    directory.set(id, member);
    return member;
  };

  for (const profile of input.members) {
    const member = get(profile.id);
    member.name = profile.name;
    member.present = true;
    member.roleIds = profile.roleIds;
    if (profile.username) member.username = profile.username;
  }
  for (const moderationCase of input.cases) {
    const member = get(moderationCase.userId);
    member.caseCount += 1;
    member.lastActivityAt = later(
      member.lastActivityAt,
      moderationCase.updatedAt,
    );
    if (moderationCase.status !== "resolved") {
      member.activeCaseCount += 1;
      if (!moderationCase.expiresAt || moderationCase.expiresAt > input.now) {
        member.activePoints += moderationCase.points;
      }
    }
  }
  for (const ticket of input.tickets) {
    const member = get(ticket.authorId);
    member.ticketCount += 1;
    member.lastActivityAt = later(member.lastActivityAt, ticket.updatedAt);
    if (ticket.status !== "closed") member.activeTicketCount += 1;
  }

  return [...directory.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ru", { sensitivity: "base" }),
  );
}

export function filterMemberDirectory(
  members: readonly DirectoryMember[],
  filters: Pick<MemberFilters, "query" | "scope">,
): readonly DirectoryMember[] {
  const query = filters.query.toLocaleLowerCase("ru-RU");
  return members.filter((member) => {
    if (filters.scope === "current" && !member.present) return false;
    if (filters.scope === "history" && member.present) return false;
    if (
      filters.scope === "attention" &&
      member.activeCaseCount === 0 &&
      member.activePoints === 0
    ) {
      return false;
    }
    return (
      !query ||
      member.id.includes(query) ||
      member.name.toLocaleLowerCase("ru-RU").includes(query) ||
      member.username?.toLocaleLowerCase("ru-RU").includes(query)
    );
  });
}
