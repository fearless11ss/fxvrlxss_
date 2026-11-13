import { z } from "zod";

export const moderationActionSchema = z.enum([
  "observe",
  "delete",
  "timeout",
  "quarantine",
  "kick",
  "ban",
]);

const ruleSchema = z.object({
  action: moderationActionSchema,
  enabled: z.boolean(),
  timeoutMinutes: z.number().int().min(1).max(40_320).default(10),
});

export const automodConfigSchema = z.object({
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
      action: "delete",
      enabled: false,
      maximumCharacters: 1_500,
      timeoutMinutes: 10,
    }),
  mode: z.enum(["observe", "enforce"]),
  repeatedMessages: ruleSchema.extend({
    maximumRepeats: z.number().int().min(2).max(10),
    windowSeconds: z.number().int().min(5).max(300),
  }),
});

export type AutomodConfig = z.infer<typeof automodConfigSchema>;

export const defaultAutomodConfig: AutomodConfig = {
  attachmentPolicy: {
    action: "delete",
    allowGif: true,
    allowImages: true,
    allowVideo: true,
    enabled: true,
    maximumPerWindow: 4,
    timeoutMinutes: 10,
    windowSeconds: 30,
  },
  caps: {
    action: "observe",
    enabled: true,
    minimumLetters: 12,
    ratio: 0.75,
    timeoutMinutes: 10,
  },
  emojiSpam: {
    action: "observe",
    enabled: true,
    maximum: 10,
    timeoutMinutes: 10,
  },
  enabled: true,
  exemptChannelIds: [],
  exemptRoleIds: [],
  flood: {
    action: "timeout",
    enabled: true,
    maximumMessages: 6,
    timeoutMinutes: 10,
    windowSeconds: 8,
  },
  inviteLinks: { action: "delete", enabled: true, timeoutMinutes: 10 },
  messageLength: {
    action: "delete",
    enabled: false,
    maximumCharacters: 1_500,
    timeoutMinutes: 10,
  },
  mode: "observe",
  repeatedMessages: {
    action: "timeout",
    enabled: true,
    maximumRepeats: 3,
    timeoutMinutes: 10,
    windowSeconds: 45,
  },
};
