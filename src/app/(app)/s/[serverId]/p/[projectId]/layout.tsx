import { notFound } from "next/navigation";
import { ProjectMenu } from "@/components/menus";
import { ChannelTree } from "@/components/sidebar/channel-tree";
import { ProjectSections, type ProjectSection } from "@/components/sidebar/nav-links";
import { Sidebar, SidebarHeader, SidebarSection } from "@/components/sidebar/sidebar";
import {
  getMyPermissions,
  getMyProjectRole,
  getOrgMembers,
  getProject,
  getProjectCounts,
  getProjectMembers,
  getProjectTree,
  getServer,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";
import type { ProjectStatus } from "@/lib/types";
import { isUuid } from "@/lib/utils";

const STATUS_LABEL: Record<ProjectStatus, string> = { active: "en cours", delivered: "livré", archived: "archivé" };

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  if (!isUuid(serverId) || !isUuid(projectId)) notFound();

  // Une seule vague de requêtes (la RLS filtre déjà ce qui n'est pas autorisé) ;
  // les membres ne sont transmis au menu que si l'utilisateur peut les gérer
  const [server, project, permissions, role, counts, fullTree, projectMembers, orgMembers] = await Promise.all([
    getServer(serverId),
    getProject(projectId),
    getMyPermissions({ serverId, projectId }),
    getMyProjectRole(projectId),
    getProjectCounts(projectId),
    getProjectTree(projectId, true),
    getProjectMembers(projectId),
    getOrgMembers(),
  ]);
  // Projet non affecté → invisible via RLS → 404
  if (!server || !project || project.server_id !== server.id) notFound();

  const isClient = role === "client";
  const canManageChannels = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const canEditProject =
    hasPermission(permissions, Permission.MANAGE_PROJECTS) || hasPermission(permissions, Permission.MANAGE_INTEGRATIONS);
  // Comme Discord : sans droit de gestion, une catégorie sans salon visible est masquée
  const tree = canManageChannels
    ? fullTree
    : { ...fullTree, categories: fullTree.categories.filter((category) => category.channels.length > 0) };
  const membersData = hasPermission(permissions, Permission.MANAGE_PROJECT_MEMBERS) ? [projectMembers, orgMembers] as const : null;

  const basePath = `/s/${server.id}/p/${project.id}`;
  // Les clients n'ont que les discussions et les revues
  const sections: ProjectSection[] = isClient ? ["chat", "reviews"] : ["chat", "board", "reviews", "whiteboard"];
  const subtitle = [project.client_name !== project.name ? project.client_name : null, server.name, STATUS_LABEL[project.status]]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Sidebar
        header={
          <SidebarHeader
            title={project.name}
            subtitle={subtitle}
            color={project.color}
            menu={
              <ProjectMenu
                project={project}
                canEdit={canEditProject}
                members={membersData ? { members: membersData[0], orgMembers: membersData[1] } : null}
              />
            }
          />
        }
      >
        <ProjectSections
          projectId={project.id}
          basePath={basePath}
          sections={sections}
          counts={{
            board: counts.openTasks ? { text: String(counts.openTasks) } : undefined,
            reviews: counts.toReview ? { text: `${counts.toReview} à valider`, warn: true } : undefined,
          }}
        />
        <SidebarSection title="Salons">
          <ChannelTree
            tree={tree}
            basePath={basePath}
            manage={canManageChannels ? { serverId: server.id, projectId: project.id } : undefined}
          />
        </SidebarSection>
      </Sidebar>
      <main className="flex min-w-0 flex-1">{children}</main>
    </>
  );
}
