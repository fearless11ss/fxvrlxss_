import Link from "next/link";

import { requireOwnerSession } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import { AutomodForm } from "./automod-form";
import { getAutomodDraft } from "./data";

export const dynamic = "force-dynamic";

export default async function AutomodPage() {
  const session = await requireOwnerSession();
  const draft = await getAutomodDraft();
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
              Черновик правил бота. Изменения не применяются к серверу до
              отдельной публикации.
            </p>
          </div>
          <dl>
            <div>
              <dt>Версия</dt>
              <dd>{draft.version || "Новая"}</dd>
            </div>
            <div>
              <dt>Состояние</dt>
              <dd>Черновик</dd>
            </div>
          </dl>
        </header>
        <AutomodForm config={draft.config} />
      </main>
    </div>
  );
}
