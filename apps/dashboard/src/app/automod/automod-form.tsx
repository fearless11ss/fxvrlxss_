"use client";

import type { AutomodConfig } from "@fxvrlxss/domain/automod-config";
import { useState } from "react";

import { ResourcePicker } from "../resource-picker";

type AutomodAction = AutomodConfig["flood"]["action"];

interface AutomodResourceOption {
  readonly id: string;
  readonly name: string;
  readonly parentName?: string;
}

interface AutomodResourceOptions {
  readonly channels: readonly AutomodResourceOption[];
  readonly roles: readonly AutomodResourceOption[];
}

const actions = [
  ["observe", "Только наблюдать"],
  ["points", "Добавить баллы"],
  ["timeout", "Выдать тайм-аут"],
  ["quarantine", "Отправить в карантин"],
  ["kick", "Незамедлительно кикнуть"],
  ["ban", "Незамедлительно забанить"],
] as const;

function DeleteMessageToggle({
  checked,
  name,
}: Readonly<{ checked: boolean; name: string }>) {
  return (
    <label className="ruleDeleteOption">
      <input defaultChecked={checked} name={name} type="checkbox" />
      <span>Удалять сообщение с нарушением</span>
    </label>
  );
}

function ActionSelect({
  name,
  points,
  pointsName,
  timeoutMinutes,
  timeoutName,
  value,
}: Readonly<{
  name: string;
  points: number;
  pointsName: string;
  timeoutMinutes: number;
  timeoutName: string;
  value: AutomodAction;
}>) {
  const [selected, setSelected] = useState<AutomodAction>(value);
  return (
    <div className="actionFields">
      <label>
        <span>Действие</span>
        <select
          name={name}
          onChange={(event) =>
            setSelected(event.currentTarget.value as AutomodAction)
          }
          value={selected}
        >
          {actions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {selected === "points" ? (
        <label>
          <span>Количество баллов</span>
          <input
            defaultValue={points}
            max="100"
            min="1"
            name={pointsName}
            type="number"
          />
        </label>
      ) : null}
      {selected === "timeout" ? (
        <label>
          <span>Срок тайм-аута, минут</span>
          <input
            defaultValue={timeoutMinutes}
            max="40320"
            min="1"
            name={timeoutName}
            type="number"
          />
        </label>
      ) : null}
      {selected === "kick" || selected === "ban" ? (
        <p className="actionWarning">
          Наказание применяется сразу после срабатывания правила.
        </p>
      ) : null}
    </div>
  );
}

export function AutomodFields({
  config,
  resources,
}: Readonly<{
  config: AutomodConfig;
  resources: AutomodResourceOptions;
}>) {
  return (
    <div className="automodForm">
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
          <p>Отключение останавливает все проверки автомодерации.</p>
        </div>
        <label>
          <span>Рабочий режим</span>
          <select defaultValue={config.mode} name="mode">
            <option value="observe">Наблюдение без наказаний</option>
            <option value="points">Только начисление баллов</option>
            <option value="enforce">Применение наказаний</option>
          </select>
        </label>
      </section>

      <div className="ruleGrid">
        <section className="ruleCard" aria-labelledby="flood-rule-title">
          <header className="ruleHeader">
            <h2 id="flood-rule-title">Флуд</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.flood.enabled}
                name="floodEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.flood.deleteMessage}
            name="floodDeleteMessage"
          />
          <div className="ruleBody">
            <label>
              <span>Сообщений</span>
              <input
                defaultValue={config.flood.maximumMessages}
                max="30"
                min="2"
                name="floodMaximumMessages"
                type="number"
              />
            </label>
            <label>
              <span>За секунд</span>
              <input
                defaultValue={config.flood.windowSeconds}
                max="120"
                min="2"
                name="floodWindowSeconds"
                type="number"
              />
            </label>
            <ActionSelect
              name="floodAction"
              points={config.flood.points}
              pointsName="floodPoints"
              timeoutMinutes={config.flood.timeoutMinutes}
              timeoutName="floodTimeoutMinutes"
              value={config.flood.action}
            />
          </div>
        </section>

        <section className="ruleCard" aria-labelledby="repeated-rule-title">
          <header className="ruleHeader">
            <h2 id="repeated-rule-title">Повторы</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.repeatedMessages.enabled}
                name="repeatedEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.repeatedMessages.deleteMessage}
            name="repeatedDeleteMessage"
          />
          <div className="ruleBody">
            <label>
              <span>Повторов</span>
              <input
                defaultValue={config.repeatedMessages.maximumRepeats}
                max="10"
                min="2"
                name="repeatedMaximumRepeats"
                type="number"
              />
            </label>
            <label>
              <span>За секунд</span>
              <input
                defaultValue={config.repeatedMessages.windowSeconds}
                max="300"
                min="5"
                name="repeatedWindowSeconds"
                type="number"
              />
            </label>
            <ActionSelect
              name="repeatedAction"
              points={config.repeatedMessages.points}
              pointsName="repeatedPoints"
              timeoutMinutes={config.repeatedMessages.timeoutMinutes}
              timeoutName="repeatedTimeoutMinutes"
              value={config.repeatedMessages.action}
            />
          </div>
        </section>

        <section className="ruleCard" aria-labelledby="caps-rule-title">
          <header className="ruleHeader">
            <h2 id="caps-rule-title">Заглавные буквы</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.caps.enabled}
                name="capsEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.caps.deleteMessage}
            name="capsDeleteMessage"
          />
          <div className="ruleBody">
            <label>
              <span>Минимум букв</span>
              <input
                defaultValue={config.caps.minimumLetters}
                max="100"
                min="5"
                name="capsMinimumLetters"
                type="number"
              />
            </label>
            <label>
              <span>Доля CAPS, %</span>
              <input
                defaultValue={Math.round(config.caps.ratio * 100)}
                max="100"
                min="50"
                name="capsRatio"
                type="number"
              />
            </label>
            <ActionSelect
              name="capsAction"
              points={config.caps.points}
              pointsName="capsPoints"
              timeoutMinutes={config.caps.timeoutMinutes}
              timeoutName="capsTimeoutMinutes"
              value={config.caps.action}
            />
          </div>
        </section>

        <section className="ruleCard" aria-labelledby="emoji-rule-title">
          <header className="ruleHeader">
            <h2 id="emoji-rule-title">Emoji-спам</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.emojiSpam.enabled}
                name="emojiEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.emojiSpam.deleteMessage}
            name="emojiDeleteMessage"
          />
          <div className="ruleBody">
            <label>
              <span>Максимум emoji</span>
              <input
                defaultValue={config.emojiSpam.maximum}
                max="50"
                min="2"
                name="emojiMaximum"
                type="number"
              />
            </label>
            <ActionSelect
              name="emojiAction"
              points={config.emojiSpam.points}
              pointsName="emojiPoints"
              timeoutMinutes={config.emojiSpam.timeoutMinutes}
              timeoutName="emojiTimeoutMinutes"
              value={config.emojiSpam.action}
            />
          </div>
        </section>

        <section className="ruleCard" aria-labelledby="invite-rule-title">
          <header className="ruleHeader">
            <h2 id="invite-rule-title">Приглашения Discord</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.inviteLinks.enabled}
                name="inviteEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.inviteLinks.deleteMessage}
            name="inviteDeleteMessage"
          />
          <div className="ruleBody">
            <p className="ruleDescription">
              Ссылки-приглашения обрабатываются нативным Discord AutoMod.
            </p>
            <ActionSelect
              name="inviteAction"
              points={config.inviteLinks.points}
              pointsName="invitePoints"
              timeoutMinutes={config.inviteLinks.timeoutMinutes}
              timeoutName="inviteTimeoutMinutes"
              value={config.inviteLinks.action}
            />
          </div>
        </section>

        <section className="ruleCard" aria-labelledby="attachment-rule-title">
          <header className="ruleHeader">
            <h2 id="attachment-rule-title">Вложения</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.attachmentPolicy.enabled}
                name="attachmentEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.attachmentPolicy.deleteMessage}
            name="attachmentDeleteMessage"
          />
          <div className="ruleBody">
            <div className="compactChecks">
              <label>
                <input
                  defaultChecked={config.attachmentPolicy.allowImages}
                  name="allowImages"
                  type="checkbox"
                />
                Изображения
              </label>
              <label>
                <input
                  defaultChecked={config.attachmentPolicy.allowGif}
                  name="allowGif"
                  type="checkbox"
                />
                GIF
              </label>
              <label>
                <input
                  defaultChecked={config.attachmentPolicy.allowVideo}
                  name="allowVideo"
                  type="checkbox"
                />
                Видео
              </label>
            </div>
            <label>
              <span>Максимум вложений</span>
              <input
                defaultValue={config.attachmentPolicy.maximumPerWindow}
                max="50"
                min="1"
                name="attachmentMaximumPerWindow"
                type="number"
              />
            </label>
            <label>
              <span>За секунд</span>
              <input
                defaultValue={config.attachmentPolicy.windowSeconds}
                max="300"
                min="5"
                name="attachmentWindowSeconds"
                type="number"
              />
            </label>
            <ActionSelect
              name="attachmentAction"
              points={config.attachmentPolicy.points}
              pointsName="attachmentPoints"
              timeoutMinutes={config.attachmentPolicy.timeoutMinutes}
              timeoutName="attachmentTimeoutMinutes"
              value={config.attachmentPolicy.action}
            />
          </div>
        </section>

        <section
          className="ruleCard ruleCardWide"
          aria-labelledby="message-length-rule-title"
        >
          <header className="ruleHeader">
            <h2 id="message-length-rule-title">Длина сообщения</h2>
            <label className="switchLine">
              <input
                defaultChecked={config.messageLength.enabled}
                name="messageLengthEnabled"
                type="checkbox"
              />
              <span>Включено</span>
            </label>
          </header>
          <DeleteMessageToggle
            checked={config.messageLength.deleteMessage}
            name="messageLengthDeleteMessage"
          />
          <div className="ruleBody">
            <label>
              <span>Максимум символов</span>
              <input
                defaultValue={config.messageLength.maximumCharacters}
                max="4000"
                min="1"
                name="messageLengthMaximum"
                type="number"
              />
            </label>
            <ActionSelect
              name="messageLengthAction"
              points={config.messageLength.points}
              pointsName="messageLengthPoints"
              timeoutMinutes={config.messageLength.timeoutMinutes}
              timeoutName="messageLengthTimeoutMinutes"
              value={config.messageLength.action}
            />
          </div>
        </section>
      </div>

      <section className="exemptionGrid">
        <ResourcePicker
          emptyMessage="Бот ещё не передал список ролей. Обновите страницу через несколько секунд."
          kind="role"
          label="Исключённые роли"
          name="exemptRoleIds"
          options={resources.roles}
          value={config.exemptRoleIds}
        />
        <ResourcePicker
          emptyMessage="Бот ещё не передал список каналов. Обновите страницу через несколько секунд."
          kind="channel"
          label="Исключённые каналы"
          name="exemptChannelIds"
          options={resources.channels}
          value={config.exemptChannelIds}
        />
      </section>
    </div>
  );
}
