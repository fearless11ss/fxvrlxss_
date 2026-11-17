import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { getMembersPageData } from "./data";
import {
  membersHref,
  parseMemberFilters,
  type MemberSearchParams,
} from "./filters";
import { plainAuditText } from "../logs/format";

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

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Moscow",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

function number(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function MembersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<MemberSearchParams> }>) {
  const [session, rawSearchParams] = await Promise.all([
    requireOwnerSession(),
    searchParams,
  ]);
  const filters = parseMemberFilters(rawSearchParams);
  const data = await getMembersPageData(filters);

  return (
    <div className="shell membersShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/members" ? "page" : undefined}
              className={href === "/members" ? "navItem active" : "navItem"}
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

      <main className="workspace membersWorkspace">
        <header className="topbar">
          <div className="connectionState">
            <span aria-hidden="true" className="statusMark" />
            <span>Каталог доступен</span>
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

        <section className="intro membersIntro">
          <p className="sectionPath">Люди и история</p>
          <h1>Участники</h1>
          <p>
            Карточки участников объединяют дела, баллы, обращения и события
            сервера. Модерация остаётся в Discord — этот раздел ничего не
            изменяет.
          </p>
        </section>

        <section
          aria-label="Сводка участников"
          className="metrics membersMetrics"
        >
          <article className="metric primaryMetric">
            <span>Известно участников</span>
            <strong>{number(data.stats.total)}</strong>
            <small>текущие и сохранённые в истории</small>
          </article>
          <article className="metric">
            <span>Сейчас на сервере</span>
            <strong>{number(data.stats.current)}</strong>
            <small>по каталогу Discord</small>
          </article>
          <article className="metric">
            <span>Есть активные дела</span>
            <strong>{number(data.stats.attention)}</strong>
            <small>открытые или обжалуемые</small>
          </article>
        </section>

        <div className="membersBody">
          <aside className="memberDirectory" aria-label="Список участников">
            <form action="/members" className="memberFilters" method="get">
              <label>
                <span>Поиск</span>
                <input
                  defaultValue={filters.query}
                  name="q"
                  placeholder="Имя, username или ID"
                  type="search"
                />
              </label>
              <label>
                <span>Показать</span>
                <select defaultValue={filters.scope} name="scope">
                  <option value="all">Всех известных</option>
                  <option value="current">На сервере</option>
                  <option value="history">Только в истории</option>
                  <option value="attention">С активными делами</option>
                </select>
              </label>
              <button type="submit">Найти</button>
            </form>

            <div className="memberDirectoryHeading">
              <span>Найдено</span>
              <strong>{number(data.filteredCount)}</strong>
            </div>

            {data.members.length > 0 ? (
              <nav className="memberList" aria-label="Найденные участники">
                {data.members.map((member) => {
                  const selected = data.selected?.id === member.id;
                  return (
                    <Link
                      aria-current={selected ? "true" : undefined}
                      className={selected ? "memberRow selected" : "memberRow"}
                      href={membersHref(filters, { memberId: member.id })}
                      key={member.id}
                    >
                      <span className="memberInitial" aria-hidden="true">
                        {member.name.slice(0, 1).toLocaleUpperCase("ru-RU")}
                      </span>
                      <span className="memberRowIdentity">
                        <strong>{member.name}</strong>
                        <small>{member.username ?? member.id}</small>
                      </span>
                      <span className="memberRowState">
                        {member.activePoints > 0
                          ? `${member.activePoints} б.`
                          : member.present
                            ? "На сервере"
                            : "История"}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <div className="memberDirectoryEmpty">
                <strong>Никого не найдено</strong>
                <p>Измените запрос или выберите другой фильтр.</p>
                <Link href="/members">Сбросить фильтры</Link>
              </div>
            )}

            {data.filteredCount > 0 && data.pageCount > 1 ? (
              <nav
                aria-label="Страницы участников"
                className="memberPagination"
              >
                {data.page > 1 ? (
                  <Link
                    href={membersHref(filters, {
                      memberId: "",
                      page: data.page - 1,
                    })}
                  >
                    Назад
                  </Link>
                ) : (
                  <span>Назад</span>
                )}
                <strong>
                  {data.page} / {data.pageCount}
                </strong>
                {data.page < data.pageCount ? (
                  <Link
                    href={membersHref(filters, {
                      memberId: "",
                      page: data.page + 1,
                    })}
                  >
                    Дальше
                  </Link>
                ) : (
                  <span>Дальше</span>
                )}
              </nav>
            ) : null}
          </aside>

          <section className="memberDossier" aria-live="polite">
            {data.selected ? (
              <>
                <header className="memberDossierHeader">
                  <div className="memberPortrait" aria-hidden="true">
                    {data.selected.name.slice(0, 1).toLocaleUpperCase("ru-RU")}
                  </div>
                  <div>
                    <p className="sectionPath">
                      {data.selected.present
                        ? "Участник сервера"
                        : "Сохранённая история"}
                    </p>
                    <h2>{data.selected.name}</h2>
                    {data.selected.username ? (
                      <p>@{data.selected.username}</p>
                    ) : null}
                    <a
                      href={`https://discord.com/users/${data.selected.id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {data.selected.id}
                    </a>
                  </div>
                  <Link
                    className="memberLogsLink"
                    href={`/logs?q=${encodeURIComponent(data.selected.id)}`}
                  >
                    Все логи
                  </Link>
                </header>

                <dl className="memberFacts">
                  <div>
                    <dt>Активные баллы</dt>
                    <dd>{data.selected.activePoints}</dd>
                  </div>
                  <div>
                    <dt>Активные дела</dt>
                    <dd>{data.selected.activeCaseCount}</dd>
                  </div>
                  <div>
                    <dt>Всего дел</dt>
                    <dd>{data.selected.caseCount}</dd>
                  </div>
                  <div>
                    <dt>Обращения</dt>
                    <dd>{data.selected.ticketCount}</dd>
                  </div>
                </dl>

                <section className="memberRoles" aria-label="Роли участника">
                  <span>Роли Discord</span>
                  {data.selected.roles.length > 0 ? (
                    <ul>
                      {data.selected.roles.map((role) => (
                        <li key={role.id}>{role.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {data.selected.present
                        ? "Назначенных ролей нет."
                        : "Для участника из истории снимок ролей недоступен."}
                    </p>
                  )}
                </section>

                <div className="memberHistoryHeading">
                  <div>
                    <p className="sectionPath">Без обычных сообщений</p>
                    <h2>История</h2>
                  </div>
                  <span>{data.selected.history.length} записей</span>
                </div>

                {data.selected.history.length > 0 ? (
                  <div className="memberHistory">
                    {data.selected.history.map((entry) => (
                      <article
                        className={`memberHistoryEntry tone-${entry.tone}`}
                        key={entry.id}
                      >
                        <time dateTime={entry.occurredAt.toISOString()}>
                          <strong>
                            {timeFormatter.format(entry.occurredAt)}
                          </strong>
                          <span>{dateFormatter.format(entry.occurredAt)}</span>
                        </time>
                        <span
                          className="memberHistoryMark"
                          aria-hidden="true"
                        />
                        <div>
                          <span className="memberHistoryKind">
                            {entry.label}
                          </span>
                          <h3>
                            {plainAuditText(entry.title, data.resourceNames)}
                          </h3>
                          <p>
                            {plainAuditText(entry.summary, data.resourceNames)}
                          </p>
                          <ul>
                            {entry.meta.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          {entry.href ? (
                            <a
                              href={entry.href}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Открыть канал
                            </a>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="memberHistoryEmpty">
                    <strong>История пока пуста</strong>
                    <p>
                      Здесь появятся дела, обращения и события жизненного цикла.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="memberDossierEmpty">
                <strong>Выберите участника</strong>
                <p>Карточка и история появятся в этой части страницы.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
