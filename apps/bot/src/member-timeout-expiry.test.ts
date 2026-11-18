import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberTimeoutExpiryTracker } from "./member-timeout-expiry.js";

describe("MemberTimeoutExpiryTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T08:34:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects a natural expiry when Discord sends no member update", async () => {
    const onExpired = vi.fn(() => Promise.resolve());
    const resolveTimeoutUntil = vi.fn(() => Promise.resolve(null));
    const tracker = new MemberTimeoutExpiryTracker({
      graceMs: 1_000,
      onExpired,
      resolveTimeoutUntil,
    });
    const timeoutUntil = Date.now() + 60_000;

    tracker.track("member-1", timeoutUntil);
    await vi.advanceTimersByTimeAsync(61_000);

    expect(resolveTimeoutUntil).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledWith({
      timeoutUntil,
      userId: "member-1",
    });
  });

  it("cancels the check when a timeout is removed manually", async () => {
    const onExpired = vi.fn(() => Promise.resolve());
    const resolveTimeoutUntil = vi.fn(() => Promise.resolve(null));
    const tracker = new MemberTimeoutExpiryTracker({
      onExpired,
      resolveTimeoutUntil,
    });

    tracker.track("member-1", Date.now() + 60_000);
    tracker.cancel("member-1");
    await vi.advanceTimersByTimeAsync(61_000);

    expect(resolveTimeoutUntil).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("reschedules the check when the timeout was extended", async () => {
    const extendedUntil = Date.now() + 120_000;
    const onExpired = vi.fn(() => Promise.resolve());
    const resolveTimeoutUntil = vi
      .fn<() => Promise<number | null>>()
      .mockResolvedValueOnce(extendedUntil)
      .mockResolvedValueOnce(null);
    const tracker = new MemberTimeoutExpiryTracker({
      graceMs: 1_000,
      onExpired,
      resolveTimeoutUntil,
    });

    tracker.track("member-1", Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(onExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpired).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledWith({
      timeoutUntil: extendedUntil,
      userId: "member-1",
    });
  });

  it("marks a just-recorded expiry so a delayed Discord event is deduplicated", async () => {
    const tracker = new MemberTimeoutExpiryTracker({
      graceMs: 1_000,
      onExpired: () => Promise.resolve(),
      resolveTimeoutUntil: () => Promise.resolve(null),
    });

    tracker.track("member-1", Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(61_000);

    expect(tracker.consumeRecentExpiry("member-1")).toBe(true);
    expect(tracker.consumeRecentExpiry("member-1")).toBe(false);
  });
});
