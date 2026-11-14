import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { getVoicePageData } from "./data";
import { PublishVoiceForm } from "./publish-form";
import { VoiceForm } from "./voice-form";

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
  new: "Настройки ещё не сохранялись. Действуют безопасные значения по умолчанию.",
  published: "Эта версия управляет созданием и пультом временных комнат.",
  queued: "Бот получил версию и обновляет голосовой модуль.",
  superseded: "Эту версию заменила более новая конфигурация.",
} as const;

export default async function VoicePage() {
  const session = await requireOwnerSession();
  const { activeRoomCount, snapshot } = await getVoicePageData();
  const enabledControls = Object.values(snapshot.config.controls).filter(
    Boolean,
  ).length;
  return (
    <div className="shell automodShell voiceShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>

        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, href], index) => (
            <Link
              aria-current={href === "/voice" ? "page" : undefined}
              className={href === "/voice" ? "navItem active" : "navItem"}
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
            <span>Настройки голосовых комнат</span>
            <form action={logoutAction}>
              <button className="quietButton" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="intro automodIntro">
          <p className="sectionPath">Голосовые комнаты</p>
          <h1>Живой контур</h1>
          <p>
            Настройте создание временных комнат и действия их владельцев. Пустые
            комнаты удаляются сразу, состояние активных хранится в PostgreSQL.
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
          <PublishVoiceForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>

        <VoiceForm config={snapshot.config} />
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
              <dt>Активных комнат</dt>
              <dd>{activeRoomCount}</dd>
            </div>
            <div>
              <dt>Действий владельца</dt>
              <dd>{enabledControls} / 6</dd>
            </div>
            <div>
              <dt>Лимит по умолчанию</dt>
              <dd>
                {snapshot.config.defaultUserLimit === 0
                  ? "Без лимита"
                  : snapshot.config.defaultUserLimit}
              </dd>
            </div>
          </dl>
        </section>
        <section className="riskPanel publicationPanel">
          <p className="sectionPath">Управление версией</p>
          <strong>Передать боту</strong>
          <p>Публикация обновит закреплённый пульт в канале «команды-бота».</p>
          <PublishVoiceForm
            disabled={snapshot.status !== "draft"}
            version={snapshot.version}
          />
        </section>
      </aside>
    </div>
  );
}
