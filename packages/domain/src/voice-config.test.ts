import { describe, expect, it } from "vitest";

import { defaultVoiceConfig, voiceConfigSchema } from "./voice-config.js";

describe("voice configuration", () => {
  it("accepts the safe default configuration", () => {
    expect(voiceConfigSchema.parse(defaultVoiceConfig)).toEqual(
      defaultVoiceConfig,
    );
  });

  it("requires the member name placeholder", () => {
    expect(
      voiceConfigSchema.safeParse({
        ...defaultVoiceConfig,
        roomNameTemplate: "Одинаковое имя",
      }).success,
    ).toBe(false);
  });

  it("accepts an unlimited default and caps Discord limits", () => {
    expect(
      voiceConfigSchema.safeParse({
        ...defaultVoiceConfig,
        defaultUserLimit: 0,
      }).success,
    ).toBe(true);
    expect(
      voiceConfigSchema.safeParse({
        ...defaultVoiceConfig,
        defaultUserLimit: 100,
      }).success,
    ).toBe(false);
  });
});
