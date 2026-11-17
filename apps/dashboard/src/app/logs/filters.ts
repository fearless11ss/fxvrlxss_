export const logCategories = [
  "security",
  "moderation",
  "messages",
  "server",
  "bot",
] as const;

export const logSeverities = ["info", "warning", "critical"] as const;

export type LogCategory = (typeof logCategories)[number];
export type LogSeverity = (typeof logSeverities)[number];

export interface LogFilters {
  readonly category: "all" | LogCategory;
  readonly event: string;
  readonly from: string;
  readonly page: number;
  readonly query: string;
  readonly severity: "all" | LogSeverity;
  readonly to: string;
}

export type LogSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

function first(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function clean(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function date(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00+03:00`))
    ? value
    : "";
}

export function parseLogFilters(params: LogSearchParams): LogFilters {
  const category = first(params.category);
  const severity = first(params.severity);
  const page = Number.parseInt(first(params.page), 10);
  return {
    category: logCategories.includes(category as LogCategory)
      ? (category as LogCategory)
      : "all",
    event: clean(first(params.event), 120),
    from: date(first(params.from)),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    query: clean(first(params.q), 120),
    severity: logSeverities.includes(severity as LogSeverity)
      ? (severity as LogSeverity)
      : "all",
    to: date(first(params.to)),
  };
}

export function logsHref(filters: LogFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.event) params.set("event", filters.event);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/logs?${query}` : "/logs";
}
