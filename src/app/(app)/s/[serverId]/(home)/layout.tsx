import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { CreateProjectDialog } from "@/components/dialogs/project-dialogs";
import { ServerSettingsDialog } from "@/components/dialogs/server-dialogs";
import { ChannelTree } from "@/components/sidebar/channel-tree";
import { ProjectLink } from "@/components/sidebar/nav-links";
import { Sidebar, SidebarSection } from "@/components/sidebar/sidebar";
import { ServerMembersDialog } from "@/components/dialogs/member-dialogs";
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

export default async function ServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  const server = await getServer(serverId);
  if (!server) notFound();

  const [permissions, { orgRole }] = await Promise.all([getMyPermissions({ serverId: server.id }), getMe()]);
  const canManageChannels = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const canManageRoles = hasPermission(permissions, Permission.MANAGE_ROLES);
  const canAddMembers = hasPermission(permissions, Permission.MANAGE_SERVER);
  const { tree, projects } = await getServerTree(server.id, canManageChannels);
  const membersData =
    canManageRoles || canAddMembers
      ? await Promise.all([getServerMembersWithRoles(server.id), getServerRoles(server.id), getOrgMembers()])
      : null;
  const basePath = `/s/${server.id}`;

  return (
    <>
      <Sidebar
        header={
          <div className="flex items-center gap-2 px-4 py-3">
            <h1 className="min-w-0 flex-1 truncate font-semibold">{server.name}</h1>
            {membersData && (
              <ServerMembersDialog
                serverId={server.id}
                members={membersData[0]}
                roles={membersData[1]}
                orgMembers={membersData[2]}
                canManageRoles={canManageRoles}
                canAddMembers={canAddMembers}
              />
            )}
            {(canManageRoles || hasPermission(permissions, Permission.VIEW_AUDIT_LOG)) && (
              <Link
                href={`${basePath}/settings`}
                title="Rôles et journal d'audit"
                className="grid size-6 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
              >
                <ShieldCheck className="size-4" />
              </Link>
            )}
            {hasPermission(permissions, Permission.MANAGE_SERVER) && (
              <ServerSettingsDialog server={server} canDelete={orgRole === "owner" || orgRole === "admin"} />
            )}
          </div>
        }
      >
        <ChannelTree
          tree={tree}
          basePath={basePath}
          manage={canManageChannels ? { serverId: server.id, projectId: null } : undefined}
        />
        <SidebarSection
          title="Projets"
          action={
            hasPermission(permissions, Permission.CREATE_PROJECTS) ? <CreateProjectDialog serverId={server.id} /> : null
          }
        >
          {projects.length > 0 ? (
            <ul className="space-y-0.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <ProjectLink
                    href={`${basePath}/p/${project.id}`}
                    name={project.name}
                    client={project.client_name}
                    color={project.color}
                    status={project.status}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 text-sm text-faint">Aucun projet ne t&apos;est affecté ici.</p>
          )}
        </SidebarSection>
      </Sidebar>
      <main className="flex min-w-0 flex-1">{children}</main>
    </>
  );
}
