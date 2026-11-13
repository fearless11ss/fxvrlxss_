import { z } from "zod";

const attachmentSchema = z.object({
  contentType: z.string().nullable(),
  name: z.string(),
  size: z.number().int().nonnegative(),
});

const moderationMessageSchema = z.object({
  attachments: z.array(attachmentSchema),
  channelId: z.string().min(1),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  id: z.string().min(1),
  userId: z.string().min(1),
});

export type ModerationMessage = z.infer<typeof moderationMessageSchema>;

export type CustomModerationSignal =
  | "attachment-rate"
  | "attachment-type"
  | "caps"
  | "emoji-spam"
  | "flood"
  | "message-length"
  | "repeated-message";

export interface ModerationFinding {
  readonly details: Readonly<Record<string, number | string>>;
  readonly signal: CustomModerationSignal;
}

export interface ModerationInspection {
  readonly findings: readonly ModerationFinding[];
  readonly messageId: string;
  readonly userId: string;
}

export const moderationPolicySchema = z.object({
  attachmentRate: z.object({
    maxAttachments: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }),
  attachmentTypes: z.object({
    allowedExtensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)),
    allowedMimePrefixes: z.array(z.string().min(1)),
    maxEvidenceBytes: z.number().int().positive(),
  }),
  caps: z.object({
    minimumLetters: z.number().int().positive(),
    ratio: z.number().min(0).max(1),
  }),
  emoji: z.object({
    maxPerMessage: z.number().int().nonnegative(),
  }),
  flood: z.object({
    maxMessages: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }),
  messageLength: z.object({
    maxCharacters: z.number().int().positive(),
  }),
  repeatedMessage: z.object({
    maxRepeats: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }),
});

export type ModerationPolicy = z.infer<typeof moderationPolicySchema>;

export const defaultModerationPolicy = moderationPolicySchema.parse({
  attachmentRate: { maxAttachments: 4, windowMs: 30_000 },
  attachmentTypes: {
    allowedExtensions: [
      ".gif",
      ".jpeg",
      ".jpg",
      ".mov",
      ".mp4",
      ".png",
      ".webm",
      ".webp",
    ],
    allowedMimePrefixes: ["image/", "video/"],
    maxEvidenceBytes: 25 * 1024 * 1024,
  },
  caps: { minimumLetters: 12, ratio: 0.7 },
  emoji: { maxPerMessage: 12 },
  flood: { maxMessages: 5, windowMs: 5_000 },
  messageLength: { maxCharacters: 1_500 },
  repeatedMessage: { maxRepeats: 3, windowMs: 30_000 },
});

interface TimedMessage {
  readonly attachmentCount: number;
  readonly content: string;
  readonly createdAt: number;
}

const emojiPattern = /\p{Extended_Pictographic}/gu;
const letterPattern = /\p{L}/u;

function normalizeContent(content: string): string {
  return content
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1
    ? ""
    : fileName.slice(lastDot).toLocaleLowerCase("en-US");
}

function inspectCaps(
  content: string,
  policy: ModerationPolicy,
): ModerationFinding | undefined {
  const letters = [...content].filter((character) =>
    letterPattern.test(character),
  );
  if (letters.length < policy.caps.minimumLetters) return undefined;

  const uppercase = letters.filter(
    (character) =>
      character.toLocaleUpperCase("ru-RU") === character &&
      character.toLocaleLowerCase("ru-RU") !== character,
  ).length;
  const ratio = uppercase / letters.length;
  if (ratio < policy.caps.ratio) return undefined;

  return { signal: "caps", details: { letters: letters.length, ratio } };
}

function inspectEmoji(
  content: string,
  policy: ModerationPolicy,
): ModerationFinding | undefined {
  const count = content.match(emojiPattern)?.length ?? 0;
  if (count <= policy.emoji.maxPerMessage) return undefined;
  return { signal: "emoji-spam", details: { count } };
}

function inspectMessageLength(
  content: string,
  policy: ModerationPolicy,
): ModerationFinding | undefined {
  const characters = [...content].length;
  if (characters <= policy.messageLength.maxCharacters) return undefined;
  return {
    signal: "message-length",
    details: {
      characters,
      maximum: policy.messageLength.maxCharacters,
    },
  };
}

function inspectAttachmentTypes(
  message: ModerationMessage,
  policy: ModerationPolicy,
): ModerationFinding | undefined {
  const invalid = message.attachments.find((attachment) => {
    const extensionAllowed = policy.attachmentTypes.allowedExtensions.includes(
      getExtension(attachment.name),
    );
    const mimeAllowed =
      attachment.contentType !== null &&
      policy.attachmentTypes.allowedMimePrefixes.some((prefix) =>
        attachment.contentType?.startsWith(prefix),
      );
    return !extensionAllowed || !mimeAllowed;
  });

  if (!invalid) return undefined;
  return {
    signal: "attachment-type",
    details: {
      contentType: invalid.contentType ?? "unknown",
      extension: getExtension(invalid.name) || "none",
    },
  };
}

export class CustomModerationEngine {
  readonly #history = new Map<string, TimedMessage[]>();
  readonly #policy: ModerationPolicy;

  constructor(policy: ModerationPolicy = defaultModerationPolicy) {
    this.#policy = moderationPolicySchema.parse(policy);
  }

  inspect(input: ModerationMessage): ModerationInspection {
    const message = moderationMessageSchema.parse(input);
    const normalizedContent = normalizeContent(message.content);
    const maximumWindow = Math.max(
      this.#policy.flood.windowMs,
      this.#policy.repeatedMessage.windowMs,
      this.#policy.attachmentRate.windowMs,
    );
    const cutoff = message.createdAt - maximumWindow;
    const previous = (this.#history.get(message.userId) ?? []).filter(
      ({ createdAt }) => createdAt >= cutoff,
    );
    const current: TimedMessage = {
      attachmentCount: message.attachments.length,
      content: normalizedContent,
      createdAt: message.createdAt,
    };
    const history = [...previous, current];
    this.#history.set(message.userId, history);

    const findings: ModerationFinding[] = [];
    const recentFlood = history.filter(
      ({ createdAt }) =>
        createdAt >= message.createdAt - this.#policy.flood.windowMs,
    );
    if (recentFlood.length >= this.#policy.flood.maxMessages) {
      findings.push({
        signal: "flood",
        details: { messages: recentFlood.length },
      });
    }

    if (normalizedContent.length > 0) {
      const repeats = history.filter(
        ({ content, createdAt }) =>
          content === normalizedContent &&
          createdAt >=
            message.createdAt - this.#policy.repeatedMessage.windowMs,
      );
      if (repeats.length >= this.#policy.repeatedMessage.maxRepeats) {
        findings.push({
          signal: "repeated-message",
          details: { repeats: repeats.length },
        });
      }
    }

    const recentAttachmentCount = history
      .filter(
        ({ createdAt }) =>
          createdAt >= message.createdAt - this.#policy.attachmentRate.windowMs,
      )
      .reduce((total, { attachmentCount }) => total + attachmentCount, 0);
    if (recentAttachmentCount >= this.#policy.attachmentRate.maxAttachments) {
      findings.push({
        signal: "attachment-rate",
        details: { attachments: recentAttachmentCount },
      });
    }

    const directFindings = [
      inspectCaps(message.content, this.#policy),
      inspectEmoji(message.content, this.#policy),
      inspectMessageLength(message.content, this.#policy),
      inspectAttachmentTypes(message, this.#policy),
    ];
    for (const finding of directFindings) {
      if (finding) findings.push(finding);
    }

    return { findings, messageId: message.id, userId: message.userId };
  }

  forget(userId: string): void {
    this.#history.delete(userId);
  }
}
