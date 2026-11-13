const navigation = [
  ["Обзор", "overview"],
  ["Автомодерация", "automod"],
  ["Тикеты", "tickets"],
  ["Голосовые", "voice"],
  ["Правила и навигация", "rules"],
  ["Логи", "logs"],
  ["Участники", "members"],
  ["Настройки", "settings"],
] as const;

const modules = [
  {
    name: "Discord AutoMod",
    detail: "6 правил опубликовано",
    state: "Работает",
  },
  {
    name: "Контроль сообщений",
    detail: "Режим наблюдения",
    state: "Наблюдение",
  },
  { name: "Тикеты", detail: "3 типа обращений", state: "Работает" },
  { name: "Временные комнаты", detail: "0 комнат сейчас", state: "Работает" },
] as const;

const events = [
  {
    time: "14:32",
    title: "Конфигурация проверена",
    meta: "Автомодерация · версия 12",
  },
  { time: "14:18", title: "Тикет закрыт", meta: "Обжалование · #0042" },
  {
    time: "13:56",
    title: "Правило сработало",
    meta: "Повтор сообщений · наблюдение",
  },
  { time: "13:41", title: "Участник вышел", meta: "Логи безопасности" },
] as const;

function StatusMark({ warning = false }: Readonly<{ warning?: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={warning ? "statusMark warning" : "statusMark"}
    />
  );
}

export default function DashboardPage() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brand">fxvrlxss_</div>
          <span className="brandCaption">control</span>
        </div>

        <nav aria-label="Основная навигация" className="navigation">
          {navigation.map(([label, key], index) => (
            <a
              aria-current={index === 0 ? "page" : undefined}
              className={index === 0 ? "navItem active" : "navItem"}
              href={`#${key}`}
              key={key}
            >
              <span className="navIndex">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="ownerBlock">
          <span className="ownerAvatar">A</span>
          <span>
            <strong>Владелец</strong>
            <small>Защищённая сессия</small>
          </span>
        </div>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="connectionState">
            <StatusMark />
            <span>Система доступна</span>
          </div>
          <div className="topbarMeta">
            <span>Последняя проверка 14:34</span>
            <button className="quietButton" type="button">
              Заблокировать
            </button>
          </div>
        </header>

        <section className="intro">
          <p className="sectionPath">Обзор системы</p>
          <h1>Контур управления</h1>
          <p>
            Состояние сервера, решения автомодерации и изменения конфигурации в
            одном приватном пространстве.
          </p>
        </section>

        <section aria-label="Ключевые показатели" className="metrics">
          <article className="metric primaryMetric">
            <span>Участники</span>
            <strong>2 418</strong>
            <small>+18 за последние сутки</small>
          </article>
          <article className="metric">
            <span>Открытые тикеты</span>
            <strong>07</strong>
            <small>2 ожидают сотрудника</small>
          </article>
          <article className="metric">
            <span>Срабатывания</span>
            <strong>31</strong>
            <small>6 требуют проверки</small>
          </article>
          <article className="metric">
            <span>Задержка бота</span>
            <strong>42</strong>
            <small>мс · gateway стабилен</small>
          </article>
        </section>

        <div className="operationalGrid">
          <section className="moduleRegister" aria-labelledby="modules-title">
            <div className="sectionHeader">
              <div>
                <p className="sectionPath">Контроль модулей</p>
                <h2 id="modules-title">Рабочий контур</h2>
              </div>
              <button className="textButton" type="button">
                Открыть настройки
              </button>
            </div>

            <div className="moduleRows">
              {modules.map((module) => {
                const warning = module.state === "Наблюдение";
                return (
                  <article className="moduleRow" key={module.name}>
                    <StatusMark warning={warning} />
                    <div>
                      <h3>{module.name}</h3>
                      <p>{module.detail}</p>
                    </div>
                    <span
                      className={
                        warning ? "moduleState warningText" : "moduleState"
                      }
                    >
                      {module.state}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="eventLedger" aria-labelledby="events-title">
            <div className="sectionHeader">
              <div>
                <p className="sectionPath">Последние события</p>
                <h2 id="events-title">Журнал</h2>
              </div>
              <button className="textButton" type="button">
                Все логи
              </button>
            </div>

            <ol className="eventList">
              {events.map((event) => (
                <li key={`${event.time}-${event.title}`}>
                  <time>{event.time}</time>
                  <span className="eventCut" aria-hidden="true" />
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.meta}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>

      <aside className="changeRail" aria-label="Состояние публикации">
        <div className="blade" aria-hidden="true" />
        <section>
          <p className="sectionPath">Публикация</p>
          <h2>Изменений нет</h2>
          <p>Опубликованная конфигурация совпадает с рабочим черновиком.</p>
          <dl>
            <div>
              <dt>Версия</dt>
              <dd>12</dd>
            </div>
            <div>
              <dt>Автор</dt>
              <dd>Владелец</dd>
            </div>
            <div>
              <dt>Опубликовано</dt>
              <dd>Сегодня, 12:08</dd>
            </div>
          </dl>
        </section>
        <section className="riskPanel">
          <p className="sectionPath">Требует внимания</p>
          <strong>6 наблюдений</strong>
          <p>Проверьте новые правила до включения автоматических наказаний.</p>
          <button type="button">Перейти к проверке</button>
        </section>
      </aside>
    </div>
  );
}
