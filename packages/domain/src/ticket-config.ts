import { z } from "zod";

export const ticketTypeKeySchema = z.enum([
  "help",
  "member-report",
  "bug-report",
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
    types: z.array(ticketTypeSchema).min(1).max(5),
  })
  .superRefine((config, context) => {
    const keys = config.types.map(({ key }) => key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Ticket type keys must be unique",
        path: ["types"],
      });
    }
  });

export type TicketConfig = z.infer<typeof ticketConfigSchema>;

export const supportTicketTypeKeys = [
  "help",
  "member-report",
  "bug-report",
  "partnership",
] as const satisfies readonly TicketTypeKey[];

const supportTypeDefaults: Readonly<
  Record<(typeof supportTicketTypeKeys)[number], TicketConfig["types"][number]>
> = {
  "bug-report": {
    description: "Сообщить об ошибке в работе сервера или бота.",
    enabled: true,
    key: "bug-report",
    label: "Баг-репорт",
  },
  help: {
    description: "Помощь по серверу, доступу, ролям и другим вопросам.",
    enabled: true,
    key: "help",
    label: "Помощь",
  },
  "member-report": {
    description: "Сообщить команде о нарушении со стороны участника.",
    enabled: true,
    key: "member-report",
    label: "Жалоба на участника",
  },
  partnership: {
    description: "Предложить партнёрство или совместный проект.",
    enabled: true,
    key: "partnership",
    label: "Сотрудничество",
  },
};

export function supportTicketConfig(config: TicketConfig): TicketConfig {
  const configured = new Map(config.types.map((type) => [type.key, type]));
  return ticketConfigSchema.parse({
    ...config,
    types: supportTicketTypeKeys.map(
      (key) => configured.get(key) ?? supportTypeDefaults[key],
    ),
  });
}

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
  types: [...supportTicketTypeKeys.map((key) => supportTypeDefaults[key])],
};
