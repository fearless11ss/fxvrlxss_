import { z } from "zod";

export const voiceConfigSchema = z.object({
  controls: z.object({
    allowHide: z.boolean(),
    allowLock: z.boolean(),
    allowMemberManagement: z.boolean(),
    allowOwnershipTransfer: z.boolean(),
    allowRename: z.boolean(),
    allowUserLimit: z.boolean(),
  }),
  defaultUserLimit: z.number().int().min(0).max(99),
  enabled: z.boolean(),
  panelDescription: z.string().trim().min(1).max(500),
  panelTitle: z.string().trim().min(1).max(80),
  roomNameTemplate: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => value.includes("{name}"), {
      message: "Room name template must contain {name}",
    }),
});

export type VoiceConfig = z.infer<typeof voiceConfigSchema>;

export const defaultVoiceConfig: VoiceConfig = {
  controls: {
    allowHide: true,
    allowLock: true,
    allowMemberManagement: true,
    allowOwnershipTransfer: true,
    allowRename: true,
    allowUserLimit: true,
  },
  defaultUserLimit: 0,
  enabled: true,
  panelDescription:
    "Пульт доступен владельцу прямо в текстовом чате этой голосовой комнаты.",
  panelTitle: "Временные голосовые комнаты",
  roomNameTemplate: "Комната {name}",
};
