import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { getModerationPageData } from "./data";
import { ModerationForm } from "./moderation-form";
import { PublishModerationForm } from "./publish-form";

export const dynamic = "force-dynamic";

const navigation = [
  ["Обзор", "/"],
  ["Автомодерация", "/automod"],
  ["Модерация", "/moderation"],
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
  new: "Действуют безопасные настройки по умолчанию.",
  published: "Эта версия управляет делами, баллами и эскалацией.",
  queued: "Бот получил версию и применяет настройки.",
  superseded: "Эту версию заменила более новая конфигурация.",
} as const;

export default async function ModerationPage() {
  const session = await requireOwnerSession();
  const { activeCaseCount, roles, snapshot } = await getModerationPageData();
  const enabledThresholds = Object.values(snapshot.config.thresholds).filter(
    ({ enabled }) => enabled,
  ).length;
  return (
    <div className="shell automodShell voiceShell moderationShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/moderation" ? "page" : undefined}
              className={href === "/moderation" ? "navItem active" : "navItem"}
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
            <span>Настройки ручной модерации</span>
            <form action={logoutAction}>
              <button className="quietButton" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="intro automodIntro">
          <p className="sectionPath">Модуль 02</p>
          <h1>Ручная модерация</h1>
          <p>
            Настройте баллы, сроки и автоматическую эскалацию. Сотрудники
            работают через команду /модерация, каждое действие становится
            постоянным делом в PostgreSQL.
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
          <PublishModerationForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>

        <ModerationForm config={snapshot.config} roles={roles} />
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
              <dt>Активных дел</dt>
              <dd>{activeCaseCount}</dd>
            </div>
            <div>
              <dt>Порогов</dt>
              <dd>{enabledThresholds} / 3</dd>
            </div>
            <div>
              <dt>Сгорание баллов</dt>
              <dd>{snapshot.config.pointExpiryDays} дн.</dd>
            </div>
          </dl>
        </section>
        <section className="riskPanel publicationPanel">
          <p className="sectionPath">Управление версией</p>
          <strong>Передать боту</strong>
          <p>Новые правила начнут действовать для следующих дел.</p>
          <PublishModerationForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>
      </aside>
    </div>
  );
}
