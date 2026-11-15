import { z } from "zod";

import { automodConfigSchema, defaultAutomodConfig } from "./automod-config.js";
import {
  defaultModerationConfig,
  moderationConfigSchema,
} from "./moderation-config.js";

export const moderationSystemConfigSchema = z.object({
  automod: automodConfigSchema,
  manual: moderationConfigSchema,
});

export type ModerationSystemConfig = z.infer<
  typeof moderationSystemConfigSchema
>;

export const defaultModerationSystemConfig: ModerationSystemConfig = {
  automod: defaultAutomodConfig,
  manual: defaultModerationConfig,
};
