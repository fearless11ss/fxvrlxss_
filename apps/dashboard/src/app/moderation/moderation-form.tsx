"use client";

import type { ModerationConfig } from "@fxvrlxss/domain/moderation-config";

import { ResourcePicker } from "../resource-picker";
import type { ModerationRoleOption } from "./data";

export function ModerationFields({
  config,
  roles,
}: Readonly<{
  config: ModerationConfig;
  roles: readonly ModerationRoleOption[];
}>) {
  return (
    <div className="voiceForm moderationForm">
      <section className="automodMaster" aria-label="Состояние модуля">
        <div>
          <label className="switchLine">
            <input
              defaultChecked={config.enabled}
              name="manualEnabled"
              type="checkbox"
            />
            <span>Модуль включён</span>
          </label>
          <p>Отключение запрещает создание новых дел через Discord.</p>
        </div>
        <ResourcePicker
          emptyMessage="Роли ещё не синхронизированы с Discord."
          kind="role"
          label="Роли с доступом к ручной модерации"
          name="manualStaffRoleIds"
          options={roles}
          value={config.staffRoleIds}
        />
      </section>

      <section className="voiceSettings" aria-labelledby="moderation-general">
        <header className="sectionHeader">
          <p className="sectionPath">Сроки</p>
          <h2 id="moderation-general">Основные параметры</h2>
        </header>
        <div className="voiceSettingsGrid">
          <label>
            <span>Сгорание баллов, дней</span>
            <input
              defaultValue={config.pointExpiryDays}
              max="3650"
              min="1"
              name="manualPointExpiryDays"
              type="number"
            />
          </label>
          <label>
            <span>Тайм-аут по умолчанию, минут</span>
            <input
              defaultValue={config.defaultTimeoutMinutes}
              max="40320"
              min="1"
              name="manualDefaultTimeoutMinutes"
              type="number"
            />
          </label>
        </div>
      </section>

      <section className="voiceControls" aria-labelledby="moderation-actions">
        <header className="sectionHeader">
          <p className="sectionPath">Ручные решения</p>
          <h2 id="moderation-actions">Предупреждения и наказания</h2>
        </header>
        <p className="ruleDescription">
          Предупреждение всегда начисляет 1 балл. Тайм-аут, кик и бан создают
          дело без баллов и применяются по решению сотрудника.
        </p>
      </section>

      <section
        className="voiceControls"
        aria-labelledby="moderation-thresholds"
      >
        <header className="sectionHeader">
          <p className="sectionPath">Эскалация</p>
          <h2 id="moderation-thresholds">Автоматические пороги</h2>
        </header>
        <div className="moderationThresholdGrid">
          <article>
            <label className="switchLine">
              <input
                defaultChecked={config.thresholds.timeout.enabled}
                name="threshold-timeout-enabled"
                type="checkbox"
              />
              <span>Тайм-аут</span>
            </label>
            <label>
              <span>Баллов</span>
              <input
                defaultValue={config.thresholds.timeout.points}
                min="1"
                name="threshold-timeout-points"
                type="number"
              />
            </label>
            <label>
              <span>Срок, минут</span>
              <input
                defaultValue={config.thresholds.timeout.timeoutMinutes}
                max="40320"
                min="1"
                name="threshold-timeout-minutes"
                type="number"
              />
            </label>
          </article>
          {(["kick", "ban"] as const).map((key) => (
            <article key={key}>
              <label className="switchLine">
                <input
                  defaultChecked={config.thresholds[key].enabled}
                  name={`threshold-${key}-enabled`}
                  type="checkbox"
                />
                <span>{key === "kick" ? "Кик" : "Бан"}</span>
              </label>
              <label>
                <span>Баллов</span>
                <input
                  defaultValue={config.thresholds[key].points}
                  min="1"
                  name={`threshold-${key}-points`}
                  type="number"
                />
              </label>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
