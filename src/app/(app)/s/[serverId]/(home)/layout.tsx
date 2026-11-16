import { notFound } from "next/navigation";
import { ServerMenu } from "@/components/menus";
import { ChannelTree } from "@/components/sidebar/channel-tree";
import { Sidebar, SidebarHeader } from "@/components/sidebar/sidebar";
import {
  getMe,
  getMyPermissions,
  getOrgMembers,
  getServer,
  getServerMembersWithRoles,
  getServerRoles,
  getServerTree,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";
import { isUuid } from "@/lib/utils";

/** Colonne du pôle : ses salons généraux (les projets sont dans la navigation à gauche) */
export default async function ServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  if (!isUuid(serverId)) notFound();

  // Tout part en même temps (la RLS filtre déjà ce qui n'est pas autorisé)
  const [server, permissions, { orgRole }, { tree: fullTree }, serverMembers, roles, orgMembers] = await Promise.all([
    getServer(serverId),
    getMyPermissions({ serverId }),
    getMe(),
    getServerTree(serverId, true),
    getServerMembersWithRoles(serverId),
    getServerRoles(serverId),
    getOrgMembers(),
  ]);
  if (!server) notFound();

  const canManageChannels = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const canManageRoles = hasPermission(permissions, Permission.MANAGE_ROLES);
  const canAddMembers = hasPermission(permissions, Permission.MANAGE_SERVER);
  // Comme Discord : sans droit de gestion, une catégorie sans salon visible est masquée
  const tree = canManageChannels
    ? fullTree
    : { ...fullTree, categories: fullTree.categories.filter((category) => category.channels.length > 0) };
  // Les membres ne sont transmis au menu que si l'utilisateur peut les gérer
  const membersData = canManageRoles || canAddMembers ? ([serverMembers, roles, orgMembers] as const) : null;
  const basePath = `/s/${server.id}`;

  return (
    <>
      <Sidebar
        header={
          <SidebarHeader
            title={server.name}
            subtitle="Salons du pôle"
            menu={
              <ServerMenu
                server={server}
                canDelete={orgRole === "owner" || orgRole === "admin"}
                canManageServer={canAddMembers}
                canCreateProject={hasPermission(permissions, Permission.CREATE_PROJECTS)}
                settingsHref={
                  canManageRoles || hasPermission(permissions, Permission.VIEW_AUDIT_LOG) ? `${basePath}/settings` : null
                }
                members={
                  membersData
                    ? {
                        members: membersData[0],
                        roles: membersData[1],
                        orgMembers: membersData[2],
                        canManageRoles,
                        canAddMembers,
                      }
                    : null
                }
              />
            }
          />
        }
      >
        <ChannelTree
          tree={tree}
          basePath={basePath}
          manage={canManageChannels ? { serverId: server.id, projectId: null } : undefined}
        />
      </Sidebar>
      <main className="flex min-w-0 flex-1">{children}</main>
    </>
  );
}
