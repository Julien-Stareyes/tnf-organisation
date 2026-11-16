import { Hash } from "lucide-react";
import { ProjectChannelView } from "@/components/chat/project-channel-view";
import { EmptyState } from "@/components/empty-state";
import { firstChannel, getProjectTree } from "@/lib/data";

// Page du projet : affiche directement son premier salon (sans redirection, donc sans aller-retour de plus)
export default async function ProjectHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
  searchParams: Promise<{ m?: string; t?: string }>;
}) {
  const [{ serverId, projectId }, { m, t }] = await Promise.all([params, searchParams]);
  // Même arguments que la colonne du projet : réponse déjà en cache
  const tree = await getProjectTree(projectId, true);
  const channel = firstChannel({ ...tree, categories: tree.categories.filter((c) => c.channels.length > 0) });

  if (!channel) {
    return (
      <EmptyState icon={<Hash className="size-6" />} title="Aucun salon visible">
        Ce projet n&apos;a pas encore de salon auquel tu as accès.
      </EmptyState>
    );
  }
  return <ProjectChannelView serverId={serverId} projectId={projectId} channelId={channel.id} m={m} t={t} />;
}
