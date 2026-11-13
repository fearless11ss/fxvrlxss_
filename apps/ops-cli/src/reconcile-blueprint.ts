import {
  productionGuildBlueprint,
  type BlueprintCategory,
} from "@fxvrlxss/domain/guild-blueprint";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Guild,
  type GuildChannelCreateOptions,
  type OverwriteResolvable,
  type PermissionResolvable,
  PermissionsBitField,
  type Role,
} from "discord.js";

export type ReconcileMode = "apply" | "plan";

export interface ReconcileAction {
  readonly action: "create" | "manual" | "preserve";
  readonly kind: "category" | "channel" | "role";
  readonly name: string;
  readonly reason?: string;
}

const permissionMap = {
  AddReactions: PermissionFlagsBits.AddReactions,
  Administrator: PermissionFlagsBits.Administrator,
  AttachFiles: PermissionFlagsBits.AttachFiles,
  BanMembers: PermissionFlagsBits.BanMembers,
  ChangeNickname: PermissionFlagsBits.ChangeNickname,
  Connect: PermissionFlagsBits.Connect,
  CreateInstantInvite: PermissionFlagsBits.CreateInstantInvite,
  CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
  CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
  KickMembers: PermissionFlagsBits.KickMembers,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageMessages: PermissionFlagsBits.ManageMessages,
  ManageNicknames: PermissionFlagsBits.ManageNicknames,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  MoveMembers: PermissionFlagsBits.MoveMembers,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  RequestToSpeak: PermissionFlagsBits.RequestToSpeak,
  SendMessages: PermissionFlagsBits.SendMessages,
  SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
  SendPolls: PermissionFlagsBits.SendPolls,
  SendVoiceMessages: PermissionFlagsBits.SendVoiceMessages,
  SetVoiceChannelStatus: PermissionFlagsBits.SetVoiceChannelStatus,
  Speak: PermissionFlagsBits.Speak,
  Stream: PermissionFlagsBits.Stream,
  UseApplicationCommands: PermissionFlagsBits.UseApplicationCommands,
  UseEmbeddedActivities: PermissionFlagsBits.UseEmbeddedActivities,
  UseExternalEmojis: PermissionFlagsBits.UseExternalEmojis,
  UseExternalStickers: PermissionFlagsBits.UseExternalStickers,
  UseVAD: PermissionFlagsBits.UseVAD,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  ViewAuditLog: PermissionFlagsBits.ViewAuditLog,
} as const satisfies Readonly<Record<string, PermissionResolvable>>;

function recordEveryonePermissions(guild: Guild, actions: ReconcileAction[]) {
  const expected = new PermissionsBitField(
    BigInt(productionGuildBlueprint.everyonePermissionBits),
  );
  const matches =
    guild.roles.everyone.permissions.bitfield === expected.bitfield;
  actions.push({
    action: matches ? "preserve" : "manual",
    kind: "role",
    name: "@everyone",
    reason: matches
      ? "Baseline permissions match the recorded Discord state"
      : "Baseline permissions differ from the recorded Discord state",
  });
}

function findRole(guild: Guild, name: string): Role | undefined {
  return guild.roles.cache.find((role) => role.name === name);
}

function roleIds(guild: Guild) {
  const get = (name: string) => {
    const role = findRole(guild, name);
    if (!role) throw new Error(`Required role was not created: ${name}`);
    return role.id;
  };

  return {
    curator: get("Куратор"),
    member: get("Участник"),
    moderator: get("Модератор"),
    owner: get("Владелец"),
    trial: get("Испытательный срок"),
  };
}

function categoryOverwrites(
  guild: Guild,
  category: BlueprintCategory,
): OverwriteResolvable[] {
  const ids = roleIds(guild);
  const denyEveryone: OverwriteResolvable = {
    id: guild.roles.everyone.id,
    deny: [PermissionFlagsBits.ViewChannel],
  };

  if (["info", "support"].includes(category.key)) {
    return [
      denyEveryone,
      {
        id: ids.member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ];
  }

  if (category.key === "community") {
    return [
      denyEveryone,
      {
        id: ids.member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
        ],
      },
    ];
  }

  if (category.key === "voice") {
    return [
      denyEveryone,
      {
        id: ids.member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
    ];
  }

  if (category.key === "staff") {
    return [
      denyEveryone,
      ...[ids.owner, ids.curator, ids.moderator, ids.trial].map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
        ],
      })),
    ];
  }

  if (category.key === "logs") {
    return [
      denyEveryone,
      ...[ids.owner, ids.curator, ids.moderator].map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [PermissionFlagsBits.SendMessages],
      })),
    ];
  }

  return [denyEveryone];
}

function ungroupedOverwrites(guild: Guild): OverwriteResolvable[] {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];
}

async function createRoles(
  guild: Guild,
  mode: ReconcileMode,
  actions: ReconcileAction[],
) {
  for (const role of productionGuildBlueprint.roles) {
    const existing = findRole(guild, role.name);
    if (existing) {
      actions.push({ action: "preserve", kind: "role", name: role.name });
      continue;
    }

    if (role.managedByDiscord) {
      actions.push({
        action: "manual",
        kind: "role",
        name: role.name,
        reason:
          "Discord creates this managed role when its integration becomes active",
      });
      continue;
    }

    actions.push({ action: "create", kind: "role", name: role.name });
    if (mode === "apply") {
      await guild.roles.create({
        colors: { primaryColor: role.color },
        hoist: role.hoisted,
        name: role.name,
        permissions: role.permissions.map(
          (permission) => permissionMap[permission],
        ),
        reason: "fxvrlxss_ staging blueprint",
      });
    }
  }

  const owner = findRole(guild, "Владелец");
  const bot = findRole(guild, "fxvrlxss_");
  if (owner && bot && owner.comparePositionTo(bot) > 0) {
    actions.push({
      action: "preserve",
      kind: "role",
      name: "Владелец > fxvrlxss_",
      reason: "Owner role hierarchy is correct",
    });
  } else {
    actions.push({
      action: "manual",
      kind: "role",
      name: "Владелец",
      reason: "Move above the managed fxvrlxss_ role in the Discord client",
    });
  }
}

async function createChannel(
  guild: Guild,
  mode: ReconcileMode,
  actions: ReconcileAction[],
  options: GuildChannelCreateOptions,
  parentId?: string,
) {
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.name === options.name &&
      (parentId ? channel.parentId === parentId : !channel.parentId),
  );
  if (existing) {
    actions.push({ action: "preserve", kind: "channel", name: options.name });
    return existing;
  }

  actions.push({ action: "create", kind: "channel", name: options.name });
  if (mode === "plan") return undefined;

  return guild.channels.create({
    ...options,
    ...(parentId ? { parent: parentId } : {}),
    reason: "fxvrlxss_ staging blueprint",
  });
}

async function createChannels(
  guild: Guild,
  mode: ReconcileMode,
  actions: ReconcileAction[],
) {
  for (const channel of productionGuildBlueprint.ungroupedChannels) {
    await createChannel(guild, mode, actions, {
      name: channel.name,
      type: ChannelType.GuildText,
      permissionOverwrites: ungroupedOverwrites(guild),
    });
  }

  for (const category of productionGuildBlueprint.categories) {
    let categoryChannel = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === category.name,
    );

    if (categoryChannel) {
      actions.push({
        action: "preserve",
        kind: "category",
        name: category.name,
      });
    } else {
      actions.push({ action: "create", kind: "category", name: category.name });
      if (mode === "apply") {
        categoryChannel = await guild.channels.create({
          name: category.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: categoryOverwrites(guild, category),
          reason: "fxvrlxss_ staging blueprint",
        });
      }
    }

    if (!categoryChannel)
      throw new Error(`Category was not created: ${category.name}`);
    for (const channel of category.channels) {
      await createChannel(
        guild,
        mode,
        actions,
        {
          name: channel.name,
          type:
            channel.kind === "voice"
              ? ChannelType.GuildVoice
              : ChannelType.GuildText,
        },
        categoryChannel.id,
      );
    }
  }
}

function planChannels(guild: Guild, actions: ReconcileAction[]) {
  for (const channel of productionGuildBlueprint.ungroupedChannels) {
    const exists = guild.channels.cache.some(
      (candidate) => candidate.name === channel.name && !candidate.parentId,
    );
    actions.push({
      action: exists ? "preserve" : "create",
      kind: "channel",
      name: channel.name,
    });
  }

  for (const category of productionGuildBlueprint.categories) {
    const categoryChannel = guild.channels.cache.find(
      (candidate) =>
        candidate.type === ChannelType.GuildCategory &&
        candidate.name === category.name,
    );
    actions.push({
      action: categoryChannel ? "preserve" : "create",
      kind: "category",
      name: category.name,
    });
    for (const channel of category.channels) {
      const exists = categoryChannel
        ? guild.channels.cache.some(
            (candidate) =>
              candidate.parentId === categoryChannel.id &&
              candidate.name === channel.name,
          )
        : false;
      actions.push({
        action: exists ? "preserve" : "create",
        kind: "channel",
        name: `${category.name}/${channel.name}`,
      });
    }
  }
}

export async function reconcileGuildBlueprint(
  token: string,
  guildId: string,
  mode: ReconcileMode,
): Promise<readonly ReconcileAction[]> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);
    await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

    const actions: ReconcileAction[] = [];
    recordEveryonePermissions(guild, actions);
    await createRoles(guild, mode, actions);
    if (mode === "plan") planChannels(guild, actions);
    else await createChannels(guild, mode, actions);
    return actions;
  } finally {
    await client.destroy();
  }
}
