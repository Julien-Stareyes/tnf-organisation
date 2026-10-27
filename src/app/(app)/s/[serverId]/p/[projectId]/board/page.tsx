import { notFound } from "next/navigation";
import { KanbanBoard } from "@/components/board/kanban-board";
import { ChannelHeader } from "@/components/channel-header";
import {
  getBoard,
  getMe,
  getMyPermissions,
  getMyProjectRole,
  getProject,
  getProjectMembers,
  getServer,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";

export const metadata = { title: "Tâches · Organisation TNF" };

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  if (!server || !project || project.server_id !== server.id) notFound();
  // Les clients n'ont pas accès au kanban interne
  if ((await getMyProjectRole(project.id)) === "client") notFound();

  const [board, members, permissions, { profile }] = await Promise.all([
    getBoard(project.id),
    getProjectMembers(project.id),
    getMyPermissions({ serverId: server.id, projectId: project.id }),
    getMe(),
  ]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChannelHeader
        crumbs={[{ label: server.name, href: `/s/${server.id}` }, { label: project.name }]}
        project={{ basePath: `/s/${server.id}/p/${project.id}`, active: "board" }}
      />
      <KanbanBoard
        projectId={project.id}
        initialColumns={board.columns}
        initialCards={board.cards}
        initialLabels={board.labels}
        members={members.filter((m) => m.project_role !== "client")}
        meId={profile?.id ?? ""}
        canManageColumns={hasPermission(permissions, Permission.MANAGE_CHANNELS)}
      />
    </div>
  );
}
