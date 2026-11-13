export type ChannelKind = "text" | "voice";

export type DiscordPermission =
  | "AddReactions"
  | "Administrator"
  | "AttachFiles"
  | "BanMembers"
  | "ChangeNickname"
  | "Connect"
  | "CreateInstantInvite"
  | "CreatePrivateThreads"
  | "CreatePublicThreads"
  | "EmbedLinks"
  | "KickMembers"
  | "ManageChannels"
  | "ManageGuild"
  | "ManageMessages"
  | "ManageNicknames"
  | "ManageRoles"
  | "ModerateMembers"
  | "MoveMembers"
  | "ReadMessageHistory"
  | "RequestToSpeak"
  | "SendMessages"
  | "SendMessagesInThreads"
  | "SendPolls"
  | "SendVoiceMessages"
  | "SetVoiceChannelStatus"
  | "Speak"
  | "Stream"
  | "UseApplicationCommands"
  | "UseEmbeddedActivities"
  | "UseExternalEmojis"
  | "UseExternalStickers"
  | "UseVAD"
  | "ViewChannel"
  | "ViewAuditLog";

export interface BlueprintChannel {
  readonly key: string;
  readonly kind: ChannelKind;
  readonly name: string;
  readonly readOnly?: boolean;
}

export interface BlueprintCategory {
  readonly key: string;
  readonly name: string;
  readonly channels: readonly BlueprintChannel[];
  readonly dynamicChildren?: "tickets" | "temporary-voice-rooms";
}

export interface BlueprintRole {
  readonly color: `#${string}`;
  readonly hoisted: boolean;
  readonly key: string;
  readonly managedByDiscord?: boolean;
  readonly name: string;
  readonly permissions: readonly DiscordPermission[];
}

export interface GuildBlueprint {
  readonly categories: readonly BlueprintCategory[];
  readonly everyonePermissionBits: string;
  readonly everyonePermissions: readonly DiscordPermission[];
  readonly roles: readonly BlueprintRole[];
  readonly ungroupedChannels: readonly BlueprintChannel[];
}

export const productionGuildBlueprint: GuildBlueprint = {
  // Preserve the complete Discord bitfield, including bit 47 which is returned
  // by the API but is not named in the current public permission table.
  everyonePermissionBits: "1056602794085953",
  everyonePermissions: [
    "CreateInstantInvite",
    "AddReactions",
    "Stream",
    "ViewChannel",
    "SendMessages",
    "EmbedLinks",
    "AttachFiles",
    "ReadMessageHistory",
    "UseExternalEmojis",
    "Connect",
    "Speak",
    "UseVAD",
    "UseApplicationCommands",
    "RequestToSpeak",
    "CreatePublicThreads",
    "CreatePrivateThreads",
    "UseExternalStickers",
    "SendMessagesInThreads",
    "UseEmbeddedActivities",
    "SendVoiceMessages",
    "SetVoiceChannelStatus",
    "SendPolls",
  ],
  ungroupedChannels: [
    { key: "entry", kind: "text", name: "прихожая", readOnly: true },
    { key: "rules", kind: "text", name: "правила", readOnly: true },
    { key: "navigation", kind: "text", name: "навигация", readOnly: true },
  ],
  categories: [
    {
      key: "info",
      name: "ИНФО",
      channels: [
        {
          key: "announcements",
          kind: "text",
          name: "объявления",
          readOnly: true,
        },
        { key: "boosts", kind: "text", name: "бусты", readOnly: true },
      ],
    },
    {
      key: "support",
      name: "ПОДДЕРЖКА",
      dynamicChildren: "tickets",
      channels: [
        {
          key: "open-ticket",
          kind: "text",
          name: "открыть-тикет",
          readOnly: true,
        },
      ],
    },
    {
      key: "community",
      name: "ОБЩЕНИЕ",
      channels: [
        { key: "chat", kind: "text", name: "чат" },
        { key: "bot-commands", kind: "text", name: "команды-бота" },
      ],
    },
    {
      key: "voice",
      name: "ГОЛОСОВЫЕ",
      dynamicChildren: "temporary-voice-rooms",
      channels: [
        { key: "create-room", kind: "voice", name: "создать-комнату" },
      ],
    },
    {
      key: "staff",
      name: "КОМАНДА",
      channels: [
        { key: "staff-chat", kind: "text", name: "чат-команды" },
        { key: "case-review", kind: "text", name: "обсуждение-обращений" },
      ],
    },
    {
      key: "logs",
      name: "ЛОГИ",
      channels: [
        {
          key: "security-log",
          kind: "text",
          name: "безопасность",
          readOnly: true,
        },
        {
          key: "moderation-log",
          kind: "text",
          name: "модерация",
          readOnly: true,
        },
        { key: "message-log", kind: "text", name: "сообщения", readOnly: true },
        { key: "server-log", kind: "text", name: "сервер", readOnly: true },
        { key: "bot-log", kind: "text", name: "бот", readOnly: true },
      ],
    },
  ],
  roles: [
    {
      key: "owner",
      name: "Владелец",
      color: "#f2f2ef",
      hoisted: true,
      permissions: ["Administrator"],
    },
    {
      key: "bot",
      name: "fxvrlxss_",
      color: "#deded9",
      hoisted: true,
      managedByDiscord: true,
      permissions: ["Administrator"],
    },
    {
      key: "curator",
      name: "Куратор",
      color: "#c7c7c2",
      hoisted: true,
      permissions: [
        "BanMembers",
        "ChangeNickname",
        "KickMembers",
        "ManageChannels",
        "ManageMessages",
        "ManageNicknames",
        "ManageRoles",
        "ModerateMembers",
        "MoveMembers",
        "ViewAuditLog",
      ],
    },
    {
      key: "moderator",
      name: "Модератор",
      color: "#9b9b97",
      hoisted: true,
      permissions: [
        "BanMembers",
        "ChangeNickname",
        "KickMembers",
        "ManageMessages",
        "ManageNicknames",
        "ModerateMembers",
        "MoveMembers",
      ],
    },
    {
      key: "trial",
      name: "Испытательный срок",
      color: "#737370",
      hoisted: true,
      permissions: ["ChangeNickname", "ManageMessages", "ModerateMembers"],
    },
    {
      key: "booster",
      name: "Server Booster",
      color: "#b7b7b2",
      hoisted: true,
      managedByDiscord: true,
      permissions: [],
    },
    {
      key: "member",
      name: "Участник",
      color: "#8a8a86",
      hoisted: false,
      permissions: [],
    },
    {
      key: "quarantine",
      name: "Карантин",
      color: "#7f252b",
      hoisted: false,
      permissions: [],
    },
  ],
};
