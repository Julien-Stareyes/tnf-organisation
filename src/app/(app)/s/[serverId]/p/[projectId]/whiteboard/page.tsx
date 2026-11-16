import { notFound } from "next/navigation";
import { Brush } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { WhiteboardLoader } from "@/components/whiteboard/whiteboard-loader";
import { getMe, getMyProjectRole, getProject, getServer, getWhiteboardElements } from "@/lib/data";

export const metadata = { title: "Tableau · Organisation TNF" };

export default async function ProjectWhiteboardPage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  if (!server || !project || project.server_id !== server.id) notFound();
  if ((await getMyProjectRole(project.id)) === "client") notFound();

  const [elements, { profile, email }] = await Promise.all([getWhiteboardElements(project.id), getMe()]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PageHeader
        icon={<Brush className="size-4 text-faint" />}
        title="Tableau"
        subtitle="Tableau blanc partagé : tout le monde dessine en même temps"
      />
      <WhiteboardLoader
        key={project.id}
        projectId={project.id}
        initialElements={elements}
        me={{ id: profile?.id ?? "", name: profile?.display_name ?? email }}
      />
    </div>
  );
}
