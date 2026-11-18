export interface MemberTimeoutExpiry {
  readonly timeoutUntil: number;
  readonly userId: string;
}

export interface MemberTimeoutExpiryTrackerOptions {
  readonly graceMs?: number;
  readonly onError?: (error: unknown, userId: string) => void;
  readonly onExpired: (expiry: MemberTimeoutExpiry) => Promise<void>;
  readonly resolveTimeoutUntil: (userId: string) => Promise<number | null>;
}

interface TrackedTimeout {
  readonly timeoutUntil: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

const MAX_TIMER_DELAY_MS = 2_147_000_000;
const RECENT_EXPIRY_TTL_MS = 30_000;
const RETRY_DELAY_MS = 10_000;

export class MemberTimeoutExpiryTracker {
  private readonly graceMs: number;
  private readonly recentExpiries = new Map<string, number>();
  private readonly tracked = new Map<string, TrackedTimeout>();
  private stopped = false;

  constructor(private readonly options: MemberTimeoutExpiryTrackerOptions) {
    this.graceMs = options.graceMs ?? 1_000;
  }

  track(userId: string, timeoutUntil: number): void {
    this.cancel(userId);
    this.recentExpiries.delete(userId);
    if (this.stopped || timeoutUntil <= Date.now()) return;
    this.schedule(userId, timeoutUntil);
  }

  cancel(userId: string): void {
    const current = this.tracked.get(userId);
    if (!current) return;
    clearTimeout(current.timer);
    this.tracked.delete(userId);
  }

  consumeRecentExpiry(userId: string): boolean {
    const expiresAt = this.recentExpiries.get(userId);
    this.recentExpiries.delete(userId);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  stop(): void {
    this.stopped = true;
    for (const { timer } of this.tracked.values()) clearTimeout(timer);
    this.tracked.clear();
    this.recentExpiries.clear();
  }

  private schedule(
    userId: string,
    timeoutUntil: number,
    retryDelayMs?: number,
  ): void {
    if (this.stopped) return;
    const existing = this.tracked.get(userId);
    if (existing) clearTimeout(existing.timer);
    const remaining = retryDelayMs ?? timeoutUntil + this.graceMs - Date.now();
    const timer = setTimeout(
      () => void this.check(userId, timeoutUntil),
      Math.min(MAX_TIMER_DELAY_MS, Math.max(0, remaining)),
    );
    timer.unref?.();
    this.tracked.set(userId, { timeoutUntil, timer });
  }

  private async check(userId: string, timeoutUntil: number): Promise<void> {
    const current = this.tracked.get(userId);
    if (this.stopped || !current || current.timeoutUntil !== timeoutUntil) {
      return;
    }
    if (timeoutUntil + this.graceMs > Date.now()) {
      this.schedule(userId, timeoutUntil);
      return;
    }

    let resolvedTimeoutUntil: number | null;
    try {
      resolvedTimeoutUntil = await this.options.resolveTimeoutUntil(userId);
    } catch (error) {
      this.options.onError?.(error, userId);
      this.schedule(userId, timeoutUntil, RETRY_DELAY_MS);
      return;
    }

    const latest = this.tracked.get(userId);
    if (!latest || latest.timeoutUntil !== timeoutUntil || this.stopped) return;
    if (resolvedTimeoutUntil && resolvedTimeoutUntil > Date.now()) {
      this.track(userId, resolvedTimeoutUntil);
      return;
    }

    clearTimeout(latest.timer);
    this.tracked.delete(userId);
    this.recentExpiries.set(userId, Date.now() + RECENT_EXPIRY_TTL_MS);
    try {
      await this.options.onExpired({ timeoutUntil, userId });
    } catch (error) {
      this.options.onError?.(error, userId);
    }
  }
}
