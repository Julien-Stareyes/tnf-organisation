import { notFound } from "next/navigation";
import { ExternalLink, KanbanSquare } from "lucide-react";
import { ChannelHeader } from "@/components/channel-header";
import { EmptyState } from "@/components/empty-state";
import { getProject, getServer } from "@/lib/data";

export default async function ProjectTrelloPage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  if (!server || !project || project.server_id !== server.id) notFound();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChannelHeader
        crumbs={[{ label: server.name, href: `/s/${server.id}` }, { label: project.name }]}
        project={{ basePath: `/s/${server.id}/p/${project.id}`, active: "trello" }}
      />
      {project.trello_board_id ? (
        // Trello ne se laisse pas intégrer en iframe : aperçu via l'API Trello en Phase 3
        <EmptyState icon={<KanbanSquare className="size-6" />} title={`Trello — ${project.name}`}>
          <a
            href={`https://trello.com/b/${encodeURIComponent(project.trello_board_id)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 font-semibold text-accent-fg"
          >
            Ouvrir le board <ExternalLink className="size-4" />
          </a>
        </EmptyState>
      ) : (
        <EmptyState icon={<KanbanSquare className="size-6" />} title="Aucun board Trello lié">
          Un lead ou un admin peut lier le board via la roue crantée à côté du nom du projet.
        </EmptyState>
      )}
    </div>
  );
}
