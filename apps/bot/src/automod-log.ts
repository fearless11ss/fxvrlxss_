import type { AutomodConfig } from "@fxvrlxss/domain/automod-config";
import type {
  CustomModerationSignal,
  ModerationFinding,
} from "@fxvrlxss/domain/moderation";

import type { AutomodAction, AutomodDecision } from "./automod-runtime.js";

interface AutomodRule {
  readonly action: AutomodAction;
  readonly deleteMessage: boolean;
  readonly points: number;
  readonly timeoutMinutes: number;
}

function ruleFor(
  config: AutomodConfig,
  signal: CustomModerationSignal,
): AutomodRule {
  switch (signal) {
    case "attachment-rate":
    case "attachment-type":
      return config.attachmentPolicy;
    case "caps":
      return config.caps;
    case "emoji-spam":
      return config.emojiSpam;
    case "flood":
      return config.flood;
    case "message-length":
      return config.messageLength;
    case "repeated-message":
      return config.repeatedMessages;
  }
}

export function automodActionLabel(
  action: AutomodAction,
  timeoutMinutes: number,
): string {
  switch (action) {
    case "ban":
      return "бан";
    case "kick":
      return "кик";
    case "observe":
      return "только наблюдение";
    case "points":
      return "начисление баллов";
    case "quarantine":
      return "карантин";
    case "timeout":
      return `тайм-аут на ${timeoutMinutes} мин.`;
  }
}

function numberDetail(finding: ModerationFinding, key: string): number {
  const value = finding.details[key];
  return typeof value === "number" ? value : 0;
}

function stringDetail(finding: ModerationFinding, key: string): string {
  const value = finding.details[key];
  return typeof value === "string" ? value : "неизвестно";
}

function findingEvidence(
  finding: ModerationFinding,
  config: AutomodConfig,
): { readonly evidence: string; readonly label: string } {
  switch (finding.signal) {
    case "attachment-rate":
      return {
        evidence: `${numberDetail(finding, "attachments")} вложений за ${config.attachmentPolicy.windowSeconds} сек. (порог: ${config.attachmentPolicy.maximumPerWindow})`,
        label: "Частота вложений",
      };
    case "attachment-type":
      return {
        evidence: `тип ${stringDetail(finding, "contentType")}, расширение ${stringDetail(finding, "extension")}`,
        label: "Запрещённый тип вложения",
      };
    case "caps":
      return {
        evidence: `${Math.round(numberDetail(finding, "ratio") * 100)}% заглавных среди ${numberDetail(finding, "letters")} букв (порог: ${Math.round(config.caps.ratio * 100)}%)`,
        label: "Заглавные буквы",
      };
    case "emoji-spam":
      return {
        evidence: `${numberDetail(finding, "count")} эмодзи (лимит: ${config.emojiSpam.maximum})`,
        label: "Emoji-спам",
      };
    case "flood":
      return {
        evidence: `${numberDetail(finding, "messages")} сообщений за ${config.flood.windowSeconds} сек. (порог: ${config.flood.maximumMessages})`,
        label: "Флуд",
      };
    case "message-length":
      return {
        evidence: `${numberDetail(finding, "characters")} символов (лимит: ${numberDetail(finding, "maximum")})`,
        label: "Длина сообщения",
      };
    case "repeated-message":
      return {
        evidence: `${numberDetail(finding, "repeats")} одинаковых сообщений за ${config.repeatedMessages.windowSeconds} сек. (порог: ${config.repeatedMessages.maximumRepeats})`,
        label: "Повторы",
      };
  }
}

export function automodSignalLabel(signal: CustomModerationSignal): string {
  switch (signal) {
    case "attachment-rate":
      return "частота вложений";
    case "attachment-type":
      return "запрещённый тип вложения";
    case "caps":
      return "заглавные буквы";
    case "emoji-spam":
      return "emoji-спам";
    case "flood":
      return "флуд";
    case "message-length":
      return "длина сообщения";
    case "repeated-message":
      return "повторы";
  }
}

export function buildAutomodLogSummary(
  config: AutomodConfig,
  decision: AutomodDecision,
  channelId: string,
): string {
  const findings = decision.findings.map((finding) => {
    const { evidence, label } = findingEvidence(finding, config);
    const rule = ruleFor(config, finding.signal);
    return `• ${label}: ${evidence}. Настройка: ${automodActionLabel(rule.action, rule.timeoutMinutes)}${rule.action === "points" ? ` · +${rule.points} б.` : ""}${rule.deleteMessage ? " · удалить сообщение" : ""}.`;
  });
  const result =
    config.mode === "observe"
      ? "наказание не применялось (режим наблюдения)."
      : config.mode === "points"
        ? "прямые действия отключены (режим только баллов)."
        : decision.action === "observe" && decision.points > 0
          ? "решение автомода — начисление баллов."
          : `решение автомода — ${automodActionLabel(decision.action, decision.timeoutMinutes)}.`;

  const deletion =
    config.mode === "observe"
      ? "Удаление: отключено режимом наблюдения."
      : config.mode === "points"
        ? "Удаление: отключено режимом только баллов."
        : decision.deleteMessage
          ? "Удаление: сообщение с нарушением будет удалено."
          : "Удаление: не настроено.";

  return [
    `Канал: <#${channelId}>`,
    `Сработало правил: ${decision.findings.length}.`,
    ...findings,
    `Баллы: ${config.mode !== "observe" && decision.points > 0 ? `+${decision.points}` : "не начислены"}.`,
    deletion,
    `Итог: ${result}`,
  ].join("\n");
}
