import {
  automodConfigSchema,
  defaultAutomodConfig,
  type AutomodConfig,
} from "@fxvrlxss/domain/automod-config";
import {
  CustomModerationEngine,
  type CustomModerationSignal,
  type ModerationFinding,
  type ModerationMessage,
  type ModerationPolicy,
} from "@fxvrlxss/domain/moderation";

export type AutomodAction = AutomodConfig["flood"]["action"];

export interface AutomodDecision {
  readonly action: AutomodAction;
  readonly configuredAction: AutomodAction;
  readonly deleteMessage: boolean;
  readonly findings: readonly ModerationFinding[];
  readonly points: number;
  readonly timeoutMinutes: number;
}

const actionWeight: Readonly<Record<AutomodAction, number>> = {
  ban: 5,
  kick: 4,
  observe: 0,
  points: 0,
  quarantine: 3,
  timeout: 2,
};

function policyFrom(config: AutomodConfig): ModerationPolicy {
  const allowedExtensions = [
    ...(config.attachmentPolicy.allowImages
      ? [".jpeg", ".jpg", ".png", ".webp"]
      : []),
    ...(config.attachmentPolicy.allowGif ? [".gif"] : []),
    ...(config.attachmentPolicy.allowVideo ? [".mov", ".mp4", ".webm"] : []),
  ];
  const allowedMimePrefixes = [
    ...(config.attachmentPolicy.allowImages || config.attachmentPolicy.allowGif
      ? ["image/"]
      : []),
    ...(config.attachmentPolicy.allowVideo ? ["video/"] : []),
  ];
  return {
    attachmentRate: {
      maxAttachments: config.attachmentPolicy.maximumPerWindow,
      windowMs: config.attachmentPolicy.windowSeconds * 1_000,
    },
    attachmentTypes: {
      allowedExtensions,
      allowedMimePrefixes,
      maxEvidenceBytes: 25 * 1024 * 1024,
    },
    caps: {
      minimumLetters: config.caps.minimumLetters,
      ratio: config.caps.ratio,
    },
    emoji: { maxPerMessage: config.emojiSpam.maximum },
    flood: {
      maxMessages: config.flood.maximumMessages,
      windowMs: config.flood.windowSeconds * 1_000,
    },
    messageLength: {
      maxCharacters: config.messageLength.maximumCharacters,
    },
    repeatedMessage: {
      maxRepeats: config.repeatedMessages.maximumRepeats,
      windowMs: config.repeatedMessages.windowSeconds * 1_000,
    },
  };
}

function ruleFor(
  config: AutomodConfig,
  signal: CustomModerationSignal,
): {
  readonly action: AutomodAction;
  readonly deleteMessage: boolean;
  readonly enabled: boolean;
  readonly points: number;
  readonly timeoutMinutes: number;
} {
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

export class AutomodRuntime {
  #config: AutomodConfig;
  #engine: CustomModerationEngine;

  constructor(config: AutomodConfig = defaultAutomodConfig) {
    this.#config = automodConfigSchema.parse(config);
    this.#engine = new CustomModerationEngine(policyFrom(this.#config));
  }

  get config(): AutomodConfig {
    return this.#config;
  }

  apply(config: AutomodConfig): void {
    const parsed = automodConfigSchema.parse(config);
    const engine = new CustomModerationEngine(policyFrom(parsed));
    this.#config = parsed;
    this.#engine = engine;
  }

  inspect(message: ModerationMessage): AutomodDecision {
    if (!this.#config.enabled) {
      return {
        action: "observe",
        configuredAction: "observe",
        deleteMessage: false,
        findings: [],
        points: 0,
        timeoutMinutes: 10,
      };
    }
    const findings = this.#engine
      .inspect(message)
      .findings.filter(
        (finding) => ruleFor(this.#config, finding.signal).enabled,
      );
    const configuredDecision = findings.reduce<{
      action: AutomodAction;
      timeoutMinutes: number;
    }>(
      (strictest, finding) => {
        const rule = ruleFor(this.#config, finding.signal);
        if (actionWeight[rule.action] > actionWeight[strictest.action]) {
          return {
            action: rule.action,
            timeoutMinutes: rule.timeoutMinutes,
          };
        }
        if (
          rule.action === "timeout" &&
          strictest.action === "timeout" &&
          rule.timeoutMinutes > strictest.timeoutMinutes
        ) {
          return { action: "timeout", timeoutMinutes: rule.timeoutMinutes };
        }
        return strictest;
      },
      { action: "observe", timeoutMinutes: 10 },
    );
    const pointRules = new Set<string>();
    let points = 0;
    for (const finding of findings) {
      const key =
        finding.signal === "attachment-rate" ||
        finding.signal === "attachment-type"
          ? "attachment-policy"
          : finding.signal;
      if (pointRules.has(key)) continue;
      pointRules.add(key);
      const rule = ruleFor(this.#config, finding.signal);
      if (rule.action === "points") points = Math.max(points, rule.points);
    }
    return {
      action:
        this.#config.mode === "enforce" ? configuredDecision.action : "observe",
      configuredAction: configuredDecision.action,
      deleteMessage:
        this.#config.mode === "enforce" &&
        findings.some(
          (finding) => ruleFor(this.#config, finding.signal).deleteMessage,
        ),
      findings,
      points: this.#config.mode === "observe" ? 0 : points,
      timeoutMinutes: configuredDecision.timeoutMinutes,
    };
  }
}
