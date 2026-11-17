export interface AutomodSignalLogKey {
  readonly action: string;
  readonly channelId: string;
  readonly signals: readonly string[];
  readonly userId: string;
}

export class AutomodSignalLogGate {
  readonly #recent = new Map<string, number>();
  readonly #windowMs: number;

  constructor(windowMs: number) {
    this.#windowMs = windowMs;
  }

  shouldPublish(input: AutomodSignalLogKey, now = Date.now()): boolean {
    for (const [key, expiresAt] of this.#recent) {
      if (expiresAt <= now) this.#recent.delete(key);
    }
    const key = JSON.stringify([
      input.userId,
      input.channelId,
      input.action,
      [...input.signals].sort(),
    ]);
    const duplicate = this.#recent.has(key);
    this.#recent.set(key, now + this.#windowMs);
    return !duplicate;
  }
}
