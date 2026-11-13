import { z } from "zod";

export const moderationActionSchema = z.enum([
  "observe",
  "delete",
  "timeout",
  "quarantine",
]);

const ruleSchema = z.object({
  action: moderationActionSchema,
  enabled: z.boolean(),
});

export const automodConfigSchema = z.object({
  attachmentPolicy: ruleSchema.extend({
    allowGif: z.boolean(),
    allowImages: z.boolean(),
    allowVideo: z.boolean(),
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
  },
  caps: {
    action: "observe",
    enabled: true,
    minimumLetters: 12,
    ratio: 0.75,
  },
  emojiSpam: { action: "observe", enabled: true, maximum: 10 },
  enabled: true,
  exemptChannelIds: [],
  exemptRoleIds: [],
  flood: {
    action: "timeout",
    enabled: true,
    maximumMessages: 6,
    windowSeconds: 8,
  },
  inviteLinks: { action: "delete", enabled: true },
  mode: "observe",
  repeatedMessages: {
    action: "timeout",
    enabled: true,
    maximumRepeats: 3,
    windowSeconds: 45,
  },
};
