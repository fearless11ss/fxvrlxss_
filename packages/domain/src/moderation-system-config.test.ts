import { describe, expect, it } from "vitest";

import {
  defaultModerationSystemConfig,
  moderationSystemConfigSchema,
} from "./moderation-system-config.js";

describe("moderation system configuration", () => {
  it("validates the combined default", () => {
    expect(
      moderationSystemConfigSchema.parse(defaultModerationSystemConfig),
    ).toEqual(defaultModerationSystemConfig);
  });
});
