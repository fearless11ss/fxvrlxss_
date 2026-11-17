export const memberScopes = ["all", "current", "history", "attention"] as const;

export type MemberScope = (typeof memberScopes)[number];

export interface MemberFilters {
  readonly memberId: string;
  readonly page: number;
  readonly query: string;
  readonly scope: MemberScope;
}

export type MemberSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

function first(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function clean(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

export function parseMemberFilters(params: MemberSearchParams): MemberFilters {
  const scope = first(params.scope);
  const page = Number.parseInt(first(params.page), 10);
  const memberId = clean(first(params.member), 24);
  return {
    memberId: /^\d{6,22}$/u.test(memberId) ? memberId : "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    query: clean(first(params.q), 120),
    scope: memberScopes.includes(scope as MemberScope)
      ? (scope as MemberScope)
      : "all",
  };
}

export function membersHref(
  filters: MemberFilters,
  options: Readonly<{ memberId?: string; page?: number }> = {},
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  const memberId = options.memberId ?? filters.memberId;
  if (memberId) params.set("member", memberId);
  const page = options.page ?? filters.page;
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/members?${query}` : "/members";
}
