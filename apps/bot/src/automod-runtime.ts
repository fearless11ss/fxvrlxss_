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
  readonly findings: readonly ModerationFinding[];
  readonly timeoutMinutes: number;
}

const actionWeight: Readonly<Record<AutomodAction, number>> = {
  delete: 1,
  observe: 0,
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
    repeatedMessage: {
      maxRepeats: config.repeatedMessages.maximumRepeats,
      windowMs: config.repeatedMessages.windowSeconds * 1_000,
    },
  };
}

function ruleFor(
  config: AutomodConfig,
  signal: CustomModerationSignal,
): { readonly action: AutomodAction; readonly enabled: boolean } {
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
        findings: [],
        timeoutMinutes: this.#config.timeoutMinutes,
      };
    }
    const findings = this.#engine
      .inspect(message)
      .findings.filter(
        (finding) => ruleFor(this.#config, finding.signal).enabled,
      );
    const configuredAction = findings.reduce<AutomodAction>(
      (strictest, finding) => {
        const candidate = ruleFor(this.#config, finding.signal).action;
        return actionWeight[candidate] > actionWeight[strictest]
          ? candidate
          : strictest;
      },
      "observe",
    );
    return {
      action: this.#config.mode === "enforce" ? configuredAction : "observe",
      findings,
      timeoutMinutes: this.#config.timeoutMinutes,
    };
  }
}
