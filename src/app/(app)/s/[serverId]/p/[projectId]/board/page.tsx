import { notFound } from "next/navigation";
import { KanbanBoard } from "@/components/board/kanban-board";
import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
  searchParams,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
  searchParams: Promise<{ card?: string }>;
}) {
  const [{ serverId, projectId }, { card: openCardId }] = await Promise.all([params, searchParams]);
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
      <PageHeader icon={<KanbanSquare className="size-4 text-faint" />} title="Tâches" subtitle="Glisse les cartes d'une colonne à l'autre" />
      <KanbanBoard
        key={openCardId ?? "board"}
        initialOpenCardId={openCardId}
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
