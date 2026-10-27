// Miroir exact de private.perm() dans supabase/migrations/20261027000002_permissions.sql
export const Permission = {
  VIEW_CHANNEL: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_SERVER: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  CREATE_INVITE: 1 << 4,
  KICK_MEMBERS: 1 << 5,
  BAN_MEMBERS: 1 << 6,
  VIEW_AUDIT_LOG: 1 << 7,
  ADMINISTRATOR: 1 << 8,
  SEND_MESSAGES: 1 << 10,
  ATTACH_FILES: 1 << 11,
  MENTION_EVERYONE: 1 << 12,
  MANAGE_MESSAGES: 1 << 13,
  READ_HISTORY: 1 << 14,
  ADD_REACTIONS: 1 << 15,
  CREATE_PROJECTS: 1 << 20,
  MANAGE_PROJECTS: 1 << 21,
  MANAGE_PROJECT_MEMBERS: 1 << 22,
  MANAGE_INTEGRATIONS: 1 << 23,
} as const;

export type PermissionName = keyof typeof Permission;

export const PERMISSION_GROUPS: { title: string; items: { bit: number; label: string; hint?: string }[] }[] = [
  {
    title: "Général",
    items: [
      { bit: Permission.ADMINISTRATOR, label: "Administrateur", hint: "Tous les droits, ignore toutes les restrictions." },
      { bit: Permission.VIEW_CHANNEL, label: "Voir les salons" },
      { bit: Permission.MANAGE_CHANNELS, label: "Gérer les salons" },
      { bit: Permission.MANAGE_SERVER, label: "Gérer le serveur" },
      { bit: Permission.MANAGE_ROLES, label: "Gérer les rôles" },
      { bit: Permission.CREATE_INVITE, label: "Inviter" },
      { bit: Permission.KICK_MEMBERS, label: "Retirer des membres" },
      { bit: Permission.VIEW_AUDIT_LOG, label: "Voir le journal d'audit" },
    ],
  },
  {
    title: "Messages",
    items: [
      { bit: Permission.SEND_MESSAGES, label: "Envoyer des messages" },
      { bit: Permission.ATTACH_FILES, label: "Joindre des fichiers" },
      { bit: Permission.READ_HISTORY, label: "Lire l'historique" },
      { bit: Permission.ADD_REACTIONS, label: "Ajouter des réactions" },
      { bit: Permission.MENTION_EVERYONE, label: "Mentionner @everyone" },
      { bit: Permission.MANAGE_MESSAGES, label: "Gérer les messages", hint: "Supprimer les messages des autres." },
    ],
  },
  {
    title: "Projets",
    items: [
      { bit: Permission.CREATE_PROJECTS, label: "Créer des projets" },
      { bit: Permission.MANAGE_PROJECTS, label: "Gérer les projets" },
      { bit: Permission.MANAGE_PROJECT_MEMBERS, label: "Gérer les membres des projets" },
      { bit: Permission.MANAGE_INTEGRATIONS, label: "Gérer les liens Miro / Trello" },
    ],
  },
];

/** Permissions modifiables salon par salon */
export const CHANNEL_PERMISSIONS = [
  { bit: Permission.VIEW_CHANNEL, label: "Voir" },
  { bit: Permission.SEND_MESSAGES, label: "Écrire" },
  { bit: Permission.ATTACH_FILES, label: "Fichiers" },
  { bit: Permission.MANAGE_MESSAGES, label: "Modérer" },
];

/** -1 renvoyé par la base = tous les droits. */
export const ALL_PERMISSIONS = -1;

export function hasPermission(perms: number, ...bits: number[]) {
  return bits.every((bit) => (perms & bit) === bit);
}
