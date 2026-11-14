import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { getTicketPageData } from "./data";
import { PublishTicketForm } from "./publish-form";
import { TicketForm } from "./ticket-form";

export const dynamic = "force-dynamic";

const navigation = [
  ["Обзор", "/"],
  ["Автомодерация", "/automod"],
  ["Тикеты", "/tickets"],
  ["Голосовые", "/voice"],
  ["Правила и навигация", "#rules"],
  ["Логи", "#logs"],
  ["Участники", "#members"],
  ["Настройки", "#settings"],
] as const;

const statusLabels = {
  draft: "Черновик",
  failed: "Ошибка",
  new: "Новая",
  published: "Применена",
  queued: "В очереди",
  superseded: "Заменена",
} as const;

const statusDescriptions = {
  draft: "Черновик сохранён и готов к публикации.",
  failed: "Бот не смог применить версию. Причина указана ниже.",
  new: "Настройки ещё не сохранялись. Сейчас используются безопасные значения по умолчанию.",
  published: "Эта версия управляет панелью и всеми новыми обращениями.",
  queued: "Бот получил версию и обновляет панель поддержки.",
  superseded: "Эту версию заменила более новая конфигурация.",
} as const;

export default async function TicketsPage() {
  const session = await requireOwnerSession();
  const { roles, snapshot } = await getTicketPageData();
  const enabledTypes = snapshot.config.types.filter(
    (type) => type.enabled,
  ).length;
  return (
    <div className="shell automodShell ticketShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>

        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/tickets" ? "page" : undefined}
              className={href === "/tickets" ? "navItem active" : "navItem"}
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

      <main className="workspace">
        <header className="topbar">
          <div className="connectionState">
            <span aria-hidden="true" className="statusMark" />
            <span>Система доступна</span>
          </div>
          <div className="topbarMeta">
            <span>Настройки обращений</span>
            <form action={logoutAction}>
              <button className="quietButton" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="intro automodIntro">
          <p className="sectionPath">Тикеты</p>
          <h1>Контур поддержки</h1>
          <p>
            Управляйте типами обращений, доступом команды и жизненным циклом
            приватных каналов. Изменения вступают в силу только после
            публикации.
          </p>
        </section>

        {snapshot.failureReason ? (
          <p className="publicationError">{snapshot.failureReason}</p>
        ) : null}

        <section className="mobilePublication" aria-label="Публикация">
          <div>
            <span>Версия {snapshot.version || "новая"}</span>
            <strong>{statusLabels[snapshot.status]}</strong>
          </div>
          <PublishTicketForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>

        <TicketForm config={snapshot.config} roles={roles} />
      </main>

      <aside className="changeRail" aria-label="Состояние публикации">
        <div className="blade" aria-hidden="true" />
        <section>
          <p className="sectionPath">Публикация</p>
          <h2>{statusLabels[snapshot.status]}</h2>
          <p>{statusDescriptions[snapshot.status]}</p>
          <dl>
            <div>
              <dt>Версия</dt>
              <dd>{snapshot.version || "Новая"}</dd>
            </div>
            <div>
              <dt>Типов включено</dt>
              <dd>{enabledTypes} / 4</dd>
            </div>
            <div>
              <dt>Ролей команды</dt>
              <dd>{snapshot.config.staffRoleIds.length}</dd>
            </div>
            <div>
              <dt>Автозакрытие</dt>
              <dd>
                {snapshot.config.autoCloseHours === 0
                  ? "Выкл."
                  : `${snapshot.config.autoCloseHours} ч.`}
              </dd>
            </div>
          </dl>
        </section>
        <section className="riskPanel publicationPanel">
          <p className="sectionPath">Управление версией</p>
          <strong>Передать боту</strong>
          <p>
            Публикация обновит закреплённую панель в канале «открыть-тикет».
          </p>
          <PublishTicketForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>
      </aside>
    </div>
  );
}
