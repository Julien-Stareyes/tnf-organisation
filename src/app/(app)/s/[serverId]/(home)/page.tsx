import { redirect } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { firstChannel, getServerTree } from "@/lib/data";

export default async function ServerHomePage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { tree, projects } = await getServerTree(serverId);

  const channel = firstChannel(tree);
  if (channel) redirect(`/s/${serverId}/c/${channel.id}`);
  if (projects.length > 0) redirect(`/s/${serverId}/p/${projects[0].id}`);

  return (
    <EmptyState icon={<FolderKanban className="size-6" />} title="Rien à afficher ici">
      Tu n&apos;as accès à aucun salon ni projet de ce serveur.
    </EmptyState>
  );
}
