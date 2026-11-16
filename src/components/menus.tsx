"use client";

import { useState } from "react";
import { FolderPlus, Lock, Settings, ShieldCheck, Users } from "lucide-react";
import { ChannelSettingsDialog } from "@/components/dialogs/channel-dialogs";
import { ChannelPermissionsDialog } from "@/components/dialogs/channel-permissions-dialog";
import { ProjectMembersDialog, ServerMembersDialog } from "@/components/dialogs/member-dialogs";
import { CreateProjectDialog, ProjectSettingsDialog } from "@/components/dialogs/project-dialogs";
import { ServerSettingsDialog } from "@/components/dialogs/server-dialogs";
import { ActionMenu, type ActionItem } from "@/components/ui/action-menu";
import type {
  Category,
  Channel,
  ChannelOverwrite,
  Member,
  OrgMember,
  Project,
  ProjectMember,
  Role,
  RoleDetail,
  ServerMember,
  ServerSummary,
} from "@/lib/types";

// Menus « ⋯ » : chaque entrée ouvre une fenêtre existante, montée ici pour survivre à la fermeture du menu

function useWhich<T extends string>() {
  const [which, setWhich] = useState<T | null>(null);
  const control = (key: T) => ({ open: which === key, onOpenChange: (open: boolean) => setWhich(open ? key : null) });
  return { open: setWhich, control };
}

export function ServerMenu({
  server,
  canDelete,
  canManageServer,
  canCreateProject,
  settingsHref,
  members,
}: {
  server: ServerSummary;
  canDelete: boolean;
  canManageServer: boolean;
  canCreateProject: boolean;
  /** Page rôles et journal, si accessible */
  settingsHref: string | null;
  members: {
    members: ServerMember[];
    roles: Role[];
    orgMembers: OrgMember[];
    canManageRoles: boolean;
    canAddMembers: boolean;
  } | null;
}) {
  const { open, control } = useWhich<"project" | "members" | "settings">();
  const items: ActionItem[] = [
    ...(canCreateProject ? [{ label: "Nouveau projet", icon: FolderPlus, onSelect: () => open("project") }] : []),
    ...(members ? [{ label: "Membres et rôles", icon: Users, onSelect: () => open("members") }] : []),
    ...(settingsHref ? [{ label: "Rôles et journal d'audit", icon: ShieldCheck, href: settingsHref }] : []),
    ...(canManageServer ? [{ label: "Paramètres du pôle", icon: Settings, onSelect: () => open("settings") }] : []),
  ];

  return (
    <>
      <ActionMenu items={items} label="Options du pôle" />
      {canCreateProject && <CreateProjectDialog serverId={server.id} {...control("project")} />}
      {members && <ServerMembersDialog serverId={server.id} {...members} {...control("members")} />}
      {canManageServer && <ServerSettingsDialog server={server} canDelete={canDelete} {...control("settings")} />}
    </>
  );
}

export function ProjectMenu({
  project,
  canEdit,
  members,
}: {
  project: Project;
  canEdit: boolean;
  members: { members: ProjectMember[]; orgMembers: OrgMember[] } | null;
}) {
  const { open, control } = useWhich<"members" | "settings">();
  const items: ActionItem[] = [
    ...(members ? [{ label: "Membres du projet", icon: Users, onSelect: () => open("members") }] : []),
    ...(canEdit ? [{ label: "Paramètres du projet", icon: Settings, onSelect: () => open("settings") }] : []),
  ];

  return (
    <>
      <ActionMenu items={items} label="Options du projet" />
      {members && <ProjectMembersDialog projectId={project.id} {...members} {...control("members")} />}
      {canEdit && <ProjectSettingsDialog project={project} {...control("settings")} />}
    </>
  );
}

export function ChannelMenu({
  channel,
  categories,
  afterDeleteHref,
  overwrites,
  roles,
  members,
}: {
  channel: Channel;
  categories: Category[];
  afterDeleteHref: string;
  overwrites: ChannelOverwrite[];
  roles: RoleDetail[];
  members: Member[];
}) {
  const { open, control } = useWhich<"permissions" | "settings">();
  return (
    <>
      <ActionMenu
        label="Options du salon"
        items={[
          { label: "Permissions du salon", icon: Lock, onSelect: () => open("permissions") },
          { label: "Paramètres du salon", icon: Settings, onSelect: () => open("settings") },
        ]}
      />
      <ChannelPermissionsDialog
        key={channel.id}
        channel={channel}
        overwrites={overwrites}
        roles={roles}
        members={members}
        {...control("permissions")}
      />
      <ChannelSettingsDialog channel={channel} categories={categories} afterDeleteHref={afterDeleteHref} {...control("settings")} />
    </>
  );
}
