import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { AutomodForm } from "./automod-form";
import { getAutomodSnapshot } from "./data";
import { PublishAutomodForm } from "./publish-form";

export const dynamic = "force-dynamic";

const navigation = [
  ["Обзор", "/"],
  ["Автомодерация", "/automod"],
  ["Тикеты", "#tickets"],
  ["Голосовые", "#voice"],
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
  failed: "Бот не смог применить эту версию. Причина указана в журнале.",
  new: "Сначала сохраните настройки как первый черновик.",
  published: "Эта версия сейчас используется ботом и Discord AutoMod.",
  queued: "Бот получил версию и применяет правила.",
  superseded: "Эту версию заменила более новая конфигурация.",
} as const;

export default async function AutomodPage() {
  const session = await requireOwnerSession();
  const snapshot = await getAutomodSnapshot();
  return (
    <div className="shell automodShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>

        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/automod" ? "page" : undefined}
              className={href === "/automod" ? "navItem active" : "navItem"}
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
            <span>Настройки автомодерации</span>
            <form action={logoutAction}>
              <button className="quietButton" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="intro automodIntro">
          <p className="sectionPath">Автомодерация</p>
          <h1>Контроль сообщений</h1>
          <p>
            Настройте сигналы и наказания. Сначала сохраните черновик, затем
            отдельно передайте его боту.
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
          <PublishAutomodForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>

        <AutomodForm config={snapshot.config} />
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
              <dt>Режим</dt>
              <dd>
                {snapshot.config.mode === "observe"
                  ? "Наблюдение"
                  : "Наказания"}
              </dd>
            </div>
            <div>
              <dt>Состояние</dt>
              <dd>{statusLabels[snapshot.status]}</dd>
            </div>
          </dl>
        </section>
        <section className="riskPanel publicationPanel">
          <p className="sectionPath">Управление версией</p>
          <strong>Передать боту</strong>
          <p>
            Публикация применит настройки только после успешной проверки
            Discord.
          </p>
          <PublishAutomodForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>
      </aside>
    </div>
  );
}
