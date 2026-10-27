import { notFound } from "next/navigation";
import { PenTool } from "lucide-react";
import { ChannelHeader } from "@/components/channel-header";
import { EmptyState } from "@/components/empty-state";
import { getProject, getServer } from "@/lib/data";
import { miroEmbedUrl } from "@/lib/utils";

export default async function ProjectMiroPage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  if (!server || !project || project.server_id !== server.id) notFound();

  const embedUrl = project.miro_board_url ? miroEmbedUrl(project.miro_board_url) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChannelHeader
        crumbs={[{ label: server.name, href: `/s/${server.id}` }, { label: project.name }]}
        project={{ basePath: `/s/${server.id}/p/${project.id}`, active: "miro" }}
      />
      {embedUrl ? (
        <iframe
          src={embedUrl}
          title={`Miro — ${project.name}`}
          className="min-h-0 flex-1 border-0 bg-white"
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
        />
      ) : (
        <EmptyState icon={<PenTool className="size-6" />} title="Aucun board Miro lié">
          Un lead ou un admin peut coller l&apos;URL du board via la roue crantée à côté du nom du projet.
        </EmptyState>
      )}
    </div>
  );
}
