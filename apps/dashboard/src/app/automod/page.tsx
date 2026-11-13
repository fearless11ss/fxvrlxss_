import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { AutomodForm } from "./automod-form";
import { getAutomodSnapshot } from "./data";
import { PublishAutomodForm } from "./publish-form";

export const dynamic = "force-dynamic";

const statusLabels = {
  draft: "Черновик",
  failed: "Ошибка",
  new: "Новая",
  published: "Применена",
  queued: "В очереди",
  superseded: "Заменена",
} as const;

export default async function AutomodPage() {
  const session = await requireOwnerSession();
  const snapshot = await getAutomodSnapshot();
  return (
    <div className="moduleShell">
      <aside className="moduleSidebar">
        <Link className="moduleBrand" href="/">
          fxvrlxss_
        </Link>
        <nav aria-label="Разделы панели">
          <Link href="/">Обзор</Link>
          <Link aria-current="page" href="/automod">
            Автомодерация
          </Link>
        </nav>
        <div className="moduleOwner">
          <strong>{session.username}</strong>
          <form action={logoutAction}>
            <button type="submit">Заблокировать</button>
          </form>
        </div>
      </aside>
      <main className="moduleWorkspace">
        <header className="moduleHeader">
          <div>
            <p className="sectionPath">Модуль 01</p>
            <h1>Автомодерация</h1>
            <p>
              Версионируемые правила. Discord-токен остаётся у бота; панель
              передаёт ему только проверенную конфигурацию.
            </p>
          </div>
          <dl>
            <div>
              <dt>Версия</dt>
              <dd>{snapshot.version || "Новая"}</dd>
            </div>
            <div>
              <dt>Состояние</dt>
              <dd>{statusLabels[snapshot.status]}</dd>
            </div>
          </dl>
        </header>
        {snapshot.failureReason ? (
          <p className="publicationError">{snapshot.failureReason}</p>
        ) : null}
        <PublishAutomodForm
          disabled={snapshot.status !== "draft"}
          version={snapshot.version}
        />
        <AutomodForm config={snapshot.config} />
      </main>
    </div>
  );
}
