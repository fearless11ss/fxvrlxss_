"use client";

import type { AutomodConfig } from "@fxvrlxss/domain/automod-config";
import { useActionState } from "react";

import { saveAutomodDraft, type SaveAutomodState } from "./actions";

const initialState: SaveAutomodState = {};
const actions = [
  ["observe", "Только наблюдать"],
  ["delete", "Удалить сообщение"],
  ["timeout", "Выдать тайм-аут"],
  ["quarantine", "Отправить в карантин"],
] as const;

function ActionSelect({
  name,
  value,
}: Readonly<{ name: string; value: string }>) {
  return (
    <select defaultValue={value} name={name}>
      {actions.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function AutomodForm({ config }: Readonly<{ config: AutomodConfig }>) {
  const [state, action, pending] = useActionState(
    saveAutomodDraft,
    initialState,
  );
  return (
    <form action={action} className="automodForm">
      <section className="automodMaster">
        <label className="switchLine">
          <input
            defaultChecked={config.enabled}
            name="enabled"
            type="checkbox"
          />
          <span>Модуль включён</span>
        </label>
        <label>
          <span>Рабочий режим</span>
          <select defaultValue={config.mode} name="mode">
            <option value="observe">Наблюдение без наказаний</option>
            <option value="enforce">Применение наказаний</option>
          </select>
        </label>
        <label>
          <span>Тайм-аут, минут</span>
          <input
            defaultValue={config.timeoutMinutes}
            min="1"
            max="40320"
            name="timeoutMinutes"
            type="number"
          />
        </label>
      </section>

      <div className="ruleGrid">
        <fieldset>
          <legend>Флуд</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.flood.enabled}
              name="floodEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <label>
            <span>Сообщений</span>
            <input
              defaultValue={config.flood.maximumMessages}
              min="2"
              max="30"
              name="floodMaximumMessages"
              type="number"
            />
          </label>
          <label>
            <span>За секунд</span>
            <input
              defaultValue={config.flood.windowSeconds}
              min="2"
              max="120"
              name="floodWindowSeconds"
              type="number"
            />
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect name="floodAction" value={config.flood.action} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Повторы</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.repeatedMessages.enabled}
              name="repeatedEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <label>
            <span>Повторов</span>
            <input
              defaultValue={config.repeatedMessages.maximumRepeats}
              min="2"
              max="10"
              name="repeatedMaximumRepeats"
              type="number"
            />
          </label>
          <label>
            <span>За секунд</span>
            <input
              defaultValue={config.repeatedMessages.windowSeconds}
              min="5"
              max="300"
              name="repeatedWindowSeconds"
              type="number"
            />
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect
              name="repeatedAction"
              value={config.repeatedMessages.action}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Заглавные буквы</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.caps.enabled}
              name="capsEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <label>
            <span>Минимум букв</span>
            <input
              defaultValue={config.caps.minimumLetters}
              min="5"
              max="100"
              name="capsMinimumLetters"
              type="number"
            />
          </label>
          <label>
            <span>Доля CAPS, %</span>
            <input
              defaultValue={Math.round(config.caps.ratio * 100)}
              min="50"
              max="100"
              name="capsRatio"
              type="number"
            />
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect name="capsAction" value={config.caps.action} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Emoji-спам</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.emojiSpam.enabled}
              name="emojiEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <label>
            <span>Максимум emoji</span>
            <input
              defaultValue={config.emojiSpam.maximum}
              min="2"
              max="50"
              name="emojiMaximum"
              type="number"
            />
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect name="emojiAction" value={config.emojiSpam.action} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Приглашения Discord</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.inviteLinks.enabled}
              name="inviteEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect
              name="inviteAction"
              value={config.inviteLinks.action}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Вложения</legend>
          <label className="switchLine">
            <input
              defaultChecked={config.attachmentPolicy.enabled}
              name="attachmentEnabled"
              type="checkbox"
            />
            <span>Включено</span>
          </label>
          <div className="compactChecks">
            <label>
              <input
                defaultChecked={config.attachmentPolicy.allowImages}
                name="allowImages"
                type="checkbox"
              />{" "}
              Изображения
            </label>
            <label>
              <input
                defaultChecked={config.attachmentPolicy.allowGif}
                name="allowGif"
                type="checkbox"
              />{" "}
              GIF
            </label>
            <label>
              <input
                defaultChecked={config.attachmentPolicy.allowVideo}
                name="allowVideo"
                type="checkbox"
              />{" "}
              Видео
            </label>
          </div>
          <label>
            <span>Максимум вложений</span>
            <input
              defaultValue={config.attachmentPolicy.maximumPerWindow}
              min="1"
              max="50"
              name="attachmentMaximumPerWindow"
              type="number"
            />
          </label>
          <label>
            <span>За секунд</span>
            <input
              defaultValue={config.attachmentPolicy.windowSeconds}
              min="5"
              max="300"
              name="attachmentWindowSeconds"
              type="number"
            />
          </label>
          <label>
            <span>Действие</span>
            <ActionSelect
              name="attachmentAction"
              value={config.attachmentPolicy.action}
            />
          </label>
        </fieldset>
      </div>

      <section className="exemptionGrid">
        <label>
          <span>Исключённые роли — ID через запятую</span>
          <textarea
            defaultValue={config.exemptRoleIds.join(", ")}
            name="exemptRoleIds"
          />
        </label>
        <label>
          <span>Исключённые каналы — ID через запятую</span>
          <textarea
            defaultValue={config.exemptChannelIds.join(", ")}
            name="exemptChannelIds"
          />
        </label>
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
