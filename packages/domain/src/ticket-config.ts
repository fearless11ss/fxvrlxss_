import { z } from "zod";

export const ticketTypeKeySchema = z.enum([
  "help",
  "member-report",
  "punishment-appeal",
  "partnership",
]);

export type TicketTypeKey = z.infer<typeof ticketTypeKeySchema>;

const ticketTypeSchema = z.object({
  description: z.string().trim().min(1).max(160),
  enabled: z.boolean(),
  key: ticketTypeKeySchema,
  label: z.string().trim().min(1).max(50),
});

export const ticketConfigSchema = z
  .object({
    allowReopen: z.boolean(),
    autoCloseHours: z.number().int().min(0).max(720),
    enabled: z.boolean(),
    maxOpenTicketsPerUser: z.number().int().min(1).max(5),
    panelDescription: z.string().trim().min(1).max(500),
    panelTitle: z.string().trim().min(1).max(80),
    staffRoleIds: z.array(z.string().min(1)).max(20),
    transcriptEnabled: z.boolean(),
    types: z.array(ticketTypeSchema).length(4),
  })
  .superRefine((config, context) => {
    const keys = new Set(config.types.map(({ key }) => key));
    for (const key of ticketTypeKeySchema.options) {
      if (!keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Missing ticket type: ${key}`,
          path: ["types"],
        });
      }
    }
  });

export type TicketConfig = z.infer<typeof ticketConfigSchema>;

export const defaultTicketConfig: TicketConfig = {
  allowReopen: true,
  autoCloseHours: 0,
  enabled: true,
  maxOpenTicketsPerUser: 2,
  panelDescription:
    "Выберите тему обращения. После заполнения формы будет создан приватный канал с командой сервера.",
  panelTitle: "Поддержка",
  staffRoleIds: [],
  transcriptEnabled: true,
  types: [
    {
      description: "Помощь по серверу, доступу, ролям и другим вопросам.",
      enabled: true,
      key: "help",
      label: "Помощь",
    },
    {
      description: "Сообщить команде о нарушении со стороны участника.",
      enabled: true,
      key: "member-report",
      label: "Жалоба на участника",
    },
    {
      description: "Запросить пересмотр выданного наказания.",
      enabled: true,
      key: "punishment-appeal",
      label: "Обжалование наказания",
    },
    {
      description: "Предложить партнёрство или совместный проект.",
      enabled: true,
      key: "partnership",
      label: "Сотрудничество",
    },
  ],
};
