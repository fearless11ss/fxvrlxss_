import type { AutomodConfig } from "@fxvrlxss/domain/automod-config";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  type AutoModerationActionOptions,
  type Guild,
} from "discord.js";

import type { AutomodConfigurationApplier } from "./automod-publication.js";
import type { AutomodRuntime } from "./automod-runtime.js";
import type { GuildResources } from "./guild-resources.js";

const INVITE_RULE_NAME = "[fxvrlxss_] Discord invites";
const INVITE_KEYWORDS = [
  "*discord.gg/*",
  "*discord.com/invite/*",
  "*discordapp.com/invite/*",
];

function inviteActions(
  config: AutomodConfig,
  resources: GuildResources,
): readonly AutoModerationActionOptions[] {
  if (config.mode === "observe" || config.inviteLinks.action === "observe") {
    return [
      {
        metadata: { channel: resources.channels.logs.security },
        type: AutoModerationActionType.SendAlertMessage,
      },
    ];
  }
  const actions: AutoModerationActionOptions[] = [
    {
      metadata: {
        customMessage: "Приглашения на сторонние Discord-серверы запрещены.",
      },
      type: AutoModerationActionType.BlockMessage,
    },
  ];
  if (config.inviteLinks.action === "timeout") {
    actions.push({
      metadata: { durationSeconds: config.timeoutMinutes * 60 },
      type: AutoModerationActionType.Timeout,
    });
  }
  return actions;
}

export class DiscordAutomodAdapter implements AutomodConfigurationApplier {
  readonly #guild: Guild;
  readonly #resources: GuildResources;
  readonly #runtime: AutomodRuntime;
  #inviteRuleId: string | undefined;

  constructor(
    guild: Guild,
    resources: GuildResources,
    runtime: AutomodRuntime,
  ) {
    this.#guild = guild;
    this.#resources = resources;
    this.#runtime = runtime;
  }

  get runtime(): AutomodRuntime {
    return this.#runtime;
  }

  isManagedInviteRule(ruleId: string): boolean {
    return ruleId === this.#inviteRuleId;
  }

  async apply(config: AutomodConfig): Promise<void> {
    const rules = await this.#guild.autoModerationRules.fetch();
    const existing = rules.find(({ name }) => name === INVITE_RULE_NAME);
    const enabled = config.enabled && config.inviteLinks.enabled;
    if (existing) {
      const updated = await this.#guild.autoModerationRules.edit(existing, {
        actions: inviteActions(config, this.#resources),
        enabled,
        exemptChannels: config.exemptChannelIds,
        exemptRoles: config.exemptRoleIds,
        name: INVITE_RULE_NAME,
        reason: "fxvrlxss_ automod configuration publication",
        triggerMetadata: { keywordFilter: INVITE_KEYWORDS },
      });
      this.#inviteRuleId = updated.id;
    } else if (enabled) {
      const created = await this.#guild.autoModerationRules.create({
        actions: inviteActions(config, this.#resources),
        enabled: true,
        eventType: AutoModerationRuleEventType.MessageSend,
        exemptChannels: config.exemptChannelIds,
        exemptRoles: config.exemptRoleIds,
        name: INVITE_RULE_NAME,
        reason: "fxvrlxss_ automod configuration publication",
        triggerMetadata: { keywordFilter: INVITE_KEYWORDS },
        triggerType: AutoModerationRuleTriggerType.Keyword,
      });
      this.#inviteRuleId = created.id;
    }
    this.#runtime.apply(config);
  }
}
