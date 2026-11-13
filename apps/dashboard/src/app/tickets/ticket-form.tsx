"use client";

import type { TicketConfig } from "@fxvrlxss/domain/ticket-config";
import { useActionState } from "react";

import { ResourcePicker } from "../resource-picker";
import { saveTicketDraft, type SaveTicketState } from "./actions";
import type { TicketRoleOption } from "./data";

const initialState: SaveTicketState = {};

export function TicketForm({
  config,
  roles,
}: Readonly<{
  config: TicketConfig;
  roles: readonly TicketRoleOption[];
}>) {
  const [state, action, pending] = useActionState(
    saveTicketDraft,
    initialState,
  );
  return (
    <form action={action} className="ticketForm">
      <section className="automodMaster" aria-label="Состояние модуля">
        <div>
          <label className="switchLine">
            <input
              defaultChecked={config.enabled}
              name="enabled"
              type="checkbox"
            />
            <span>Модуль включён</span>
          </label>
          <p>Отключение запрещает создание новых обращений.</p>
        </div>
        <ResourcePicker
          emptyMessage="Роли ещё не синхронизированы с Discord."
          kind="role"
          label="Роли команды с доступом к тикетам"
          name="staffRoleIds"
          options={roles}
          value={config.staffRoleIds}
        />
      </section>

      <section
        className="ticketSettings"
        aria-labelledby="ticket-settings-title"
      >
        <header className="sectionHeader">
          <p className="sectionPath">Поведение модуля</p>
          <h2 id="ticket-settings-title">Общие настройки</h2>
        </header>
        <div className="ticketSettingsGrid">
          <label>
            <span>Заголовок панели в Discord</span>
            <input
              defaultValue={config.panelTitle}
              maxLength={80}
              name="panelTitle"
              required
            />
          </label>
          <label>
            <span>Максимум открытых тикетов на участника</span>
            <input
              defaultValue={config.maxOpenTicketsPerUser}
              max="5"
              min="1"
              name="maxOpenTicketsPerUser"
              type="number"
            />
          </label>
          <label className="ticketWideField">
            <span>Описание панели</span>
            <textarea
              defaultValue={config.panelDescription}
              maxLength={500}
              name="panelDescription"
              required
              rows={3}
            />
          </label>
          <label>
            <span>Автозакрытие без активности, часов</span>
            <input
              defaultValue={config.autoCloseHours}
              max="720"
              min="0"
              name="autoCloseHours"
              type="number"
            />
            <small>0 — не закрывать автоматически.</small>
          </label>
          <div className="ticketChecks">
            <label className="switchLine">
              <input
                defaultChecked={config.allowReopen}
                name="allowReopen"
                type="checkbox"
              />
              <span>Разрешить повторное открытие</span>
            </label>
            <label className="switchLine">
              <input
                defaultChecked={config.transcriptEnabled}
                name="transcriptEnabled"
                type="checkbox"
              />
              <span>Сохранять транскрипт при закрытии</span>
            </label>
          </div>
        </div>
      </section>

      <section className="ticketTypes" aria-labelledby="ticket-types-title">
        <header className="sectionHeader">
          <p className="sectionPath">Маршруты обращения</p>
          <h2 id="ticket-types-title">Типы тикетов</h2>
        </header>
        <div className="ticketTypeGrid">
          {config.types.map((type, index) => (
            <article className="ticketTypeCard" key={type.key}>
              <header className="ticketTypeHeader">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <label className="switchLine">
                  <input
                    defaultChecked={type.enabled}
                    name={`type-${type.key}-enabled`}
                    type="checkbox"
                  />
                  <span>Включён</span>
                </label>
              </header>
              <div>
                <label>
                  <span>Название</span>
                  <input
                    defaultValue={type.label}
                    maxLength={50}
                    name={`type-${type.key}-label`}
                    required
                  />
                </label>
                <label>
                  <span>Описание в меню Discord</span>
                  <textarea
                    defaultValue={type.description}
                    maxLength={160}
                    name={`type-${type.key}-description`}
                    required
                    rows={3}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="formFooter">
        <div aria-live="polite">
          {state.error ? (
            <span className="formError">{state.error}</span>
          ) : null}
          {state.message ? (
            <span className="formSuccess">{state.message}</span>
          ) : null}
        </div>
        <button disabled={pending} type="submit">
          {pending ? "Сохранение…" : "Сохранить черновик"}
        </button>
      </footer>
    </form>
  );
}
