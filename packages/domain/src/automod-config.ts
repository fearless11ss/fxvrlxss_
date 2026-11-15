import { z } from "zod";

export const moderationActionSchema = z.enum([
  "observe",
  "points",
  "timeout",
  "quarantine",
  "kick",
  "ban",
]);

const ruleSchema = z.object({
  action: moderationActionSchema,
  deleteMessage: z.boolean(),
  enabled: z.boolean(),
  points: z.number().int().min(0).max(100).default(0),
  timeoutMinutes: z.number().int().min(1).max(40_320).default(10),
});

const automodConfigObjectSchema = z
  .object({
    attachmentPolicy: ruleSchema.extend({
      allowGif: z.boolean(),
      allowImages: z.boolean(),
      allowVideo: z.boolean(),
      maximumPerWindow: z.number().int().min(1).max(50).default(4),
      windowSeconds: z.number().int().min(5).max(300).default(30),
    }),
    caps: ruleSchema.extend({
      minimumLetters: z.number().int().min(5).max(100),
      ratio: z.number().min(0.5).max(1),
    }),
    emojiSpam: ruleSchema.extend({
      maximum: z.number().int().min(2).max(50),
    }),
    enabled: z.boolean(),
    exemptChannelIds: z.array(z.string()),
    exemptRoleIds: z.array(z.string()),
    flood: ruleSchema.extend({
      maximumMessages: z.number().int().min(2).max(30),
      windowSeconds: z.number().int().min(2).max(120),
    }),
    inviteLinks: ruleSchema,
    messageLength: ruleSchema
      .extend({
        maximumCharacters: z.number().int().min(1).max(4_000),
      })
      .default({
        action: "observe",
        deleteMessage: true,
        enabled: false,
        maximumCharacters: 1_500,
        points: 0,
        timeoutMinutes: 10,
      }),
    mode: z.enum(["observe", "points", "enforce"]),
    repeatedMessages: ruleSchema.extend({
      maximumRepeats: z.number().int().min(2).max(10),
      windowSeconds: z.number().int().min(5).max(300),
    }),
  })
  .superRefine((config, context) => {
    for (const [key, rule] of Object.entries({
      attachmentPolicy: config.attachmentPolicy,
      caps: config.caps,
      emojiSpam: config.emojiSpam,
      flood: config.flood,
      inviteLinks: config.inviteLinks,
      messageLength: config.messageLength,
      repeatedMessages: config.repeatedMessages,
    })) {
      if (rule.action === "points" && rule.points < 1) {
        context.addIssue({
          code: "custom",
          message: "Point actions require at least one point",
          path: [key, "points"],
        });
      }
    }
  });

const ruleKeys = [
  "attachmentPolicy",
  "caps",
  "emojiSpam",
  "flood",
  "inviteLinks",
  "messageLength",
  "repeatedMessages",
] as const;

function upgradeLegacyAutomodConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const config = { ...(value as Record<string, unknown>) };
  for (const key of ruleKeys) {
    const candidate = config[key];
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const rule = candidate as Record<string, unknown>;
    const legacyAction = rule.action;
    config[key] = {
      ...rule,
      action: legacyAction === "delete" ? "observe" : legacyAction,
      deleteMessage:
        typeof rule.deleteMessage === "boolean"
          ? rule.deleteMessage
          : legacyAction !== "observe" && legacyAction !== "points",
    };
  }
  return config;
}

export const automodConfigSchema = z.preprocess(
  upgradeLegacyAutomodConfig,
  automodConfigObjectSchema,
);

export type AutomodConfig = z.infer<typeof automodConfigSchema>;

export const defaultAutomodConfig: AutomodConfig = {
  attachmentPolicy: {
    action: "observe",
    allowGif: true,
    allowImages: true,
    allowVideo: true,
    deleteMessage: true,
    enabled: true,
    maximumPerWindow: 4,
    points: 0,
    timeoutMinutes: 10,
    windowSeconds: 30,
  },
  caps: {
    action: "observe",
    deleteMessage: false,
    enabled: true,
    minimumLetters: 12,
    points: 0,
    ratio: 0.75,
    timeoutMinutes: 10,
  },
  emojiSpam: {
    action: "observe",
    deleteMessage: false,
    enabled: true,
    maximum: 10,
    points: 0,
    timeoutMinutes: 10,
  },
  enabled: true,
  exemptChannelIds: [],
  exemptRoleIds: [],
  flood: {
    action: "timeout",
    deleteMessage: true,
    enabled: true,
    maximumMessages: 6,
    points: 0,
    timeoutMinutes: 10,
    windowSeconds: 8,
  },
  inviteLinks: {
    action: "observe",
    deleteMessage: true,
    enabled: true,
    points: 0,
    timeoutMinutes: 10,
  },
  messageLength: {
    action: "observe",
    deleteMessage: true,
    enabled: false,
    maximumCharacters: 1_500,
    points: 0,
    timeoutMinutes: 10,
  },
  mode: "observe",
  repeatedMessages: {
    action: "timeout",
    deleteMessage: true,
    enabled: true,
    maximumRepeats: 3,
    points: 0,
    timeoutMinutes: 10,
    windowSeconds: 45,
  },
};
