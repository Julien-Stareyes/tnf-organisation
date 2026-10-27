import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProjectSettingsDialog } from "@/components/dialogs/project-dialogs";
import { ChannelTree } from "@/components/sidebar/channel-tree";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ProjectMembersDialog } from "@/components/dialogs/member-dialogs";
import { getMyPermissions, getOrgMembers, getProject, getProjectMembers, getProjectTree, getServer } from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  // Projet non affecté → invisible via RLS → 404
  if (!server || !project || project.server_id !== server.id) notFound();

  const permissions = await getMyPermissions({ serverId: server.id, projectId: project.id });
  const canManageChannels = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const canEditProject =
    hasPermission(permissions, Permission.MANAGE_PROJECTS) || hasPermission(permissions, Permission.MANAGE_INTEGRATIONS);
  const tree = await getProjectTree(project.id, canManageChannels);
  const membersData = hasPermission(permissions, Permission.MANAGE_PROJECT_MEMBERS)
    ? await Promise.all([getProjectMembers(project.id), getOrgMembers()])
    : null;

  return (
    <>
      <Sidebar
        header={
          <div className="px-3 py-2.5">
            <Link href={`/s/${server.id}`} className="flex items-center gap-1 text-xs text-faint hover:text-fg">
              <ArrowLeft className="size-3.5" />
              {server.name}
            </Link>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? "var(--faint)" }}
              />
              <h1 className="min-w-0 flex-1 truncate font-semibold">{project.name}</h1>
              {membersData && (
                <ProjectMembersDialog projectId={project.id} members={membersData[0]} orgMembers={membersData[1]} />
              )}
              {canEditProject && <ProjectSettingsDialog project={project} />}
            </div>
            {project.client_name && project.client_name !== project.name && (
              <p className="truncate pl-5 text-xs text-muted">{project.client_name}</p>
            )}
          </div>
        }
      >
        <ChannelTree
          tree={tree}
          basePath={`/s/${server.id}/p/${project.id}`}
          manage={canManageChannels ? { serverId: server.id, projectId: project.id } : undefined}
        />
      </Sidebar>
      <main className="flex min-w-0 flex-1">{children}</main>
    </>
  );
}
