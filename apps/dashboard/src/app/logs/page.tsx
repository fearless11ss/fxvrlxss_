import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { getDashboardEnvironment } from "../../lib/environment";
import { logoutAction } from "../logout-action";
import { getLogsPageData, type LogResource } from "./data";
import {
  logCategories,
  logsHref,
  parseLogFilters,
  type LogCategory,
  type LogSearchParams,
  type LogSeverity,
} from "./filters";
import { eventTypeLabel, plainAuditText, technicalJson } from "./format";

export const dynamic = "force-dynamic";

const navigation = [
  ["Обзор", "/"],
  ["Модерация", "/moderation"],
  ["Тикеты", "/tickets"],
  ["Голосовые", "/voice"],
  ["Правила и навигация", "#rules"],
  ["Логи", "/logs"],
  ["Участники", "/members"],
  ["Настройки", "#settings"],
] as const;

const categoryLabels: Record<LogCategory, string> = {
  bot: "Бот",
  messages: "Сообщения",
  moderation: "Модерация",
  security: "Безопасность",
  server: "Сервер",
};

const severityLabels: Record<LogSeverity, string> = {
  critical: "Критическое",
  info: "Обычное",
  warning: "Внимание",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Moscow",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Moscow",
});

function number(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function Resource({
  guildId,
  resource,
}: Readonly<{ guildId: string; resource: LogResource }>) {
  const fallbackLabels: Readonly<Record<string, string>> = {
    channel: "Канал",
    message: "Сообщение",
    role: "Роль",
    user: "Пользователь",
  };
  const label = resource.name ?? fallbackLabels[resource.kind] ?? "Объект";
  const content = (
    <>
      <strong>{label}</strong>
      {resource.secondaryName ? <span>{resource.secondaryName}</span> : null}
      <small>{resource.id}</small>
    </>
  );
  if (resource.kind === "channel") {
    return (
      <a
        className="logEntity"
        href={`https://discord.com/channels/${guildId}/${resource.id}`}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }
  if (resource.kind === "member" || resource.kind === "user") {
    return (
      <Link className="logEntity" href={`/members?member=${resource.id}`}>
        {content}
      </Link>
    );
  }
  if (resource.kind === "message" && resource.channelId) {
    return (
      <a
        className="logEntity"
        href={`https://discord.com/channels/${guildId}/${resource.channelId}/${resource.id}`}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }
  return <span className="logEntity">{content}</span>;
}

export default async function LogsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<LogSearchParams> }>) {
  const [session, rawSearchParams] = await Promise.all([
    requireOwnerSession(),
    searchParams,
  ]);
  const filters = parseLogFilters(rawSearchParams);
  const data = await getLogsPageData(filters);
  const { guildId } = getDashboardEnvironment();
  const hasFilters = logsHref(filters, 1) !== "/logs";

  return (
    <div className="shell logsShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/logs" ? "page" : undefined}
              className={href === "/logs" ? "navItem active" : "navItem"}
              href={href}
              key={href}
            >
              <span className="navIndex">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ownerBlock">
          <span className="ownerAvatar">A</span>
          <span>
            <strong>{session.username}</strong>
            <small>Защищённая сессия</small>
          </span>
        </div>
      </aside>

      <main className="workspace logsWorkspace">
        <header className="topbar">
          <div className="connectionState">
            <span aria-hidden="true" className="statusMark" />
            <span>Журнал доступен</span>
          </div>
          <div className="topbarMeta">
            <span>Только чтение</span>
            <form action={logoutAction}>
              <button className="quietButton" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="intro logsIntro">
          <p className="sectionPath">Наблюдение</p>
          <h1>Журнал событий</h1>
          <p>
            История действий сервера, модерации и самого бота. Записи остаются
            доступны в панели, даже когда исходный объект Discord уже удалён.
          </p>
        </section>

        <section aria-label="Сводка журнала" className="metrics logsMetrics">
          <article className="metric primaryMetric">
            <span>Всего записей</span>
            <strong>{number(data.stats.total)}</strong>
            <small>за всё время хранения</small>
          </article>
          <article className="metric">
            <span>За последние сутки</span>
            <strong>{number(data.stats.lastDay)}</strong>
            <small>скользящий интервал 24 часа</small>
          </article>
          <article className="metric">
            <span>Требуют внимания</span>
            <strong>{number(data.stats.attention)}</strong>
            <small>предупреждения и критические события</small>
          </article>
        </section>

        <div className="logsBody">
          <section className="logLedger" aria-labelledby="log-ledger-title">
            <div className="sectionHeader logLedgerHeader">
              <div>
                <p className="sectionPath">
                  Найдено {number(data.filteredCount)}
                </p>
                <h2 id="log-ledger-title">Хронология</h2>
              </div>
              <span>
                Страница {data.page} из {data.pageCount}
              </span>
            </div>

            {data.entries.length > 0 ? (
              <div className="logEvents">
                {data.entries.map((entry) => (
                  <article
                    className={`logEvent logSeverity-${entry.severity}`}
                    key={entry.id}
                  >
                    <div className="logMoment">
                      <time dateTime={entry.occurredAt.toISOString()}>
                        <strong>
                          {timeFormatter.format(entry.occurredAt)}
                        </strong>
                        <span>{dateFormatter.format(entry.occurredAt)}</span>
                      </time>
                      <span aria-hidden="true" className="logTimelineMark" />
                    </div>
                    <div className="logEventBody">
                      <div className="logEventMeta">
                        <span>{categoryLabels[entry.category]}</span>
                        <span>{severityLabels[entry.severity]}</span>
                        <span title={entry.eventType}>
                          {eventTypeLabel(entry.eventType)}
                        </span>
                      </div>
                      <h3>{plainAuditText(entry.title, data.resourceNames)}</h3>
                      <p>{plainAuditText(entry.summary, data.resourceNames)}</p>
                      {entry.actor || entry.subject ? (
                        <div className="logEntities">
                          {entry.actor ? (
                            <div>
                              <span>Инициатор</span>
                              <Resource
                                guildId={guildId}
                                resource={entry.actor}
                              />
                            </div>
                          ) : null}
                          {entry.subject ? (
                            <div>
                              <span>Объект</span>
                              <Resource
                                guildId={guildId}
                                resource={entry.subject}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {Object.keys(entry.technical).length > 0 ? (
                        <details className="logTechnical">
                          <summary>Технические данные</summary>
                          <pre>{technicalJson(entry.technical)}</pre>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="logEmpty">
                <strong>Событий по этим условиям нет</strong>
                <p>Измените период или снимите один из фильтров.</p>
                {hasFilters ? <Link href="/logs">Сбросить фильтры</Link> : null}
              </div>
            )}

            {data.filteredCount > 0 ? (
              <nav aria-label="Страницы журнала" className="logPagination">
                {data.page > 1 ? (
                  <Link href={logsHref(filters, data.page - 1)}>
                    Предыдущая
                  </Link>
                ) : (
                  <span>Предыдущая</span>
                )}
                <strong>
                  {data.page} / {data.pageCount}
                </strong>
                {data.page < data.pageCount ? (
                  <Link href={logsHref(filters, data.page + 1)}>Следующая</Link>
                ) : (
                  <span>Следующая</span>
                )}
              </nav>
            ) : null}
          </section>

          <aside className="logControlRail" aria-label="Фильтры журнала">
            <form action="/logs" className="logFilters" method="get">
              <div className="logFilterHeading">
                <p className="sectionPath">Отбор записей</p>
                <h2>Фильтры</h2>
                <p>Имя, упоминание, ID и содержимое события.</p>
              </div>
              <label>
                <span>Поиск</span>
                <input
                  defaultValue={filters.query}
                  name="q"
                  placeholder="Участник, канал или текст"
                  type="search"
                />
              </label>
              <label>
                <span>Раздел</span>
                <select defaultValue={filters.category} name="category">
                  <option value="all">Все разделы</option>
                  {logCategories.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Уровень</span>
                <select defaultValue={filters.severity} name="severity">
                  <option value="all">Все уровни</option>
                  <option value="info">Обычные</option>
                  <option value="warning">Внимание</option>
                  <option value="critical">Критические</option>
                </select>
              </label>
              <label>
                <span>Тип события</span>
                <select defaultValue={filters.event} name="event">
                  <option value="">Все события</option>
                  {[...data.eventTypes]
                    .sort((left, right) =>
                      eventTypeLabel(left).localeCompare(
                        eventTypeLabel(right),
                        "ru",
                      ),
                    )
                    .map((eventType) => (
                      <option key={eventType} value={eventType}>
                        {eventTypeLabel(eventType)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="logDateRange">
                <label>
                  <span>С даты</span>
                  <input defaultValue={filters.from} name="from" type="date" />
                </label>
                <label>
                  <span>По дату</span>
                  <input defaultValue={filters.to} name="to" type="date" />
                </label>
              </div>
              <button className="logApplyButton" type="submit">
                Применить
              </button>
              {hasFilters ? (
                <Link className="logResetLink" href="/logs">
                  Сбросить всё
                </Link>
              ) : null}
            </form>

            <section className="logCategoryRegister">
              <p className="sectionPath">Вся история</p>
              <h2>По разделам</h2>
              <dl>
                {logCategories.map((category) => (
                  <div key={category}>
                    <dt>{categoryLabels[category]}</dt>
                    <dd>{number(data.categoryCounts[category])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
