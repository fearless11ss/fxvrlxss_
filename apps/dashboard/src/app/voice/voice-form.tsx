"use client";

import type { VoiceConfig } from "@fxvrlxss/domain/voice-config";
import { useActionState } from "react";

import { saveVoiceDraft, type VoiceActionState } from "./actions";

const initialState: VoiceActionState = {};

const controlFields = [
  ["allowRename", "Переименование", "Владелец может менять название комнаты."],
  ["allowUserLimit", "Лимит участников", "Доступны значения от 0 до 99."],
  [
    "allowLock",
    "Закрытие входа",
    "Новые участники входят только по разрешению.",
  ],
  ["allowHide", "Скрытие комнаты", "Комната исчезает из списка для остальных."],
  [
    "allowMemberManagement",
    "Участники",
    "Добавление и принудительное удаление.",
  ],
  [
    "allowOwnershipTransfer",
    "Передача владельца",
    "Только участнику внутри комнаты.",
  ],
] as const;

export function VoiceForm({ config }: Readonly<{ config: VoiceConfig }>) {
  const [state, action, pending] = useActionState(saveVoiceDraft, initialState);
  return (
    <form action={action} className="voiceForm">
      <section className="voiceMaster" aria-label="Состояние модуля">
        <div>
          <label className="switchLine">
            <input
              defaultChecked={config.enabled}
              name="enabled"
              type="checkbox"
            />
            <span>Модуль включён</span>
          </label>
          <p>Отключение запрещает создание новых комнат.</p>
        </div>
        <label>
          <span>Лимит по умолчанию</span>
          <input
            defaultValue={config.defaultUserLimit}
            max="99"
            min="0"
            name="defaultUserLimit"
            type="number"
          />
          <small>0 — без ограничений.</small>
        </label>
      </section>

      <section className="voiceSettings" aria-labelledby="voice-settings-title">
        <header className="sectionHeader">
          <p className="sectionPath">Создание комнаты</p>
          <h2 id="voice-settings-title">Основные параметры</h2>
        </header>
        <div className="voiceSettingsGrid">
          <label>
            <span>Заголовок пульта в комнате</span>
            <input
              defaultValue={config.panelTitle}
              maxLength={80}
              name="panelTitle"
              required
            />
          </label>
          <label>
            <span>Шаблон названия комнаты</span>
            <input
              defaultValue={config.roomNameTemplate}
              maxLength={80}
              name="roomNameTemplate"
              required
            />
            <small>{"{name} — отображаемое имя владельца."}</small>
          </label>
          <label className="voiceWideField">
            <span>Описание пульта</span>
            <textarea
              defaultValue={config.panelDescription}
              maxLength={500}
              name="panelDescription"
              required
              rows={3}
            />
          </label>
        </div>
      </section>

      <section className="voiceControls" aria-labelledby="voice-controls-title">
        <header className="sectionHeader">
          <p className="sectionPath">Пульт владельца</p>
          <h2 id="voice-controls-title">Доступные действия</h2>
        </header>
        <div className="voiceControlLedger">
          {controlFields.map(([name, label, description], index) => (
            <label className="voiceControlRow" key={name}>
              <span className="voiceControlIndex">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <input
                defaultChecked={config.controls[name]}
                name={name}
                type="checkbox"
              />
            </label>
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
