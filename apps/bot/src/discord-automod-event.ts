import { randomUUID } from "node:crypto";

export interface DiscordAutomodEventIdentity {
  readonly alertSystemMessageId: string | null;
  readonly matchedContent: string | null;
  readonly messageId: string | null;
  readonly ruleId: string;
  readonly userId: string;
}

export function buildDiscordAutomodSourceEventKey(
  event: DiscordAutomodEventIdentity,
  createOccurrenceId: () => string = randomUUID,
): string {
  const eventId =
    event.messageId ?? event.alertSystemMessageId ?? createOccurrenceId();
  return `discord-automod:${event.ruleId}:${eventId}`;
}
