import { z } from "zod";

export const moderationActionSchema = z.enum([
  "warn",
  "timeout",
  "kick",
  "ban",
]);

export type ModerationAction = z.infer<typeof moderationActionSchema>;

const thresholdSchema = z.object({
  enabled: z.boolean(),
  points: z.number().int().min(1).max(10_000),
});

export const moderationConfigSchema = z
  .object({
    defaultTimeoutMinutes: z.number().int().min(1).max(40_320),
    enabled: z.boolean(),
    pointExpiryDays: z.number().int().min(1).max(3_650),
    staffRoleIds: z.array(z.string().min(1)).max(20),
    thresholds: z.object({
      ban: thresholdSchema,
      kick: thresholdSchema,
      timeout: thresholdSchema.extend({
        timeoutMinutes: z.number().int().min(1).max(40_320),
      }),
    }),
  })
  .superRefine((config, context) => {
    const enabled = [
      config.thresholds.timeout,
      config.thresholds.kick,
      config.thresholds.ban,
    ].filter((threshold) => threshold.enabled);
    for (let index = 1; index < enabled.length; index += 1) {
      if (enabled[index]!.points <= enabled[index - 1]!.points) {
        context.addIssue({
          code: "custom",
          message: "Enabled moderation thresholds must increase",
          path: ["thresholds"],
        });
        break;
      }
    }
  });

export type ModerationConfig = z.infer<typeof moderationConfigSchema>;

export const defaultModerationConfig: ModerationConfig = {
  defaultTimeoutMinutes: 60,
  enabled: true,
  pointExpiryDays: 90,
  staffRoleIds: [],
  thresholds: {
    ban: { enabled: true, points: 10 },
    kick: { enabled: true, points: 6 },
    timeout: {
      enabled: true,
      points: 3,
      timeoutMinutes: 180,
    },
  },
};

const actionRank: Readonly<Record<ModerationAction, number>> = {
  ban: 3,
  kick: 2,
  timeout: 1,
  warn: 0,
};

export interface ModerationDecision {
  readonly action: ModerationAction;
  readonly escalated: boolean;
  readonly timeoutMinutes: number | null;
}

export function decideModerationAction(input: {
  readonly activePoints: number;
  readonly config: ModerationConfig;
  readonly requestedAction: ModerationAction;
  readonly requestedTimeoutMinutes?: number;
}): ModerationDecision {
  let action = input.requestedAction;
  let timeoutMinutes =
    action === "timeout"
      ? (input.requestedTimeoutMinutes ?? input.config.defaultTimeoutMinutes)
      : null;

  const thresholdActions: readonly {
    readonly action: Exclude<ModerationAction, "warn">;
    readonly enabled: boolean;
    readonly points: number;
    readonly timeoutMinutes?: number;
  }[] = [
    {
      action: "timeout",
      ...input.config.thresholds.timeout,
    },
    { action: "kick", ...input.config.thresholds.kick },
    { action: "ban", ...input.config.thresholds.ban },
  ];

  for (const threshold of thresholdActions) {
    if (
      threshold.enabled &&
      input.activePoints >= threshold.points &&
      actionRank[threshold.action] > actionRank[action]
    ) {
      action = threshold.action;
      timeoutMinutes =
        threshold.action === "timeout"
          ? (threshold.timeoutMinutes ?? input.config.defaultTimeoutMinutes)
          : null;
    }
  }

  return {
    action,
    escalated: action !== input.requestedAction,
    timeoutMinutes,
  };
}
