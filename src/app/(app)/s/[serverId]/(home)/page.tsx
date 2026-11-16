import { redirect } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { ServerChannelView } from "@/components/chat/server-channel-view";
import { EmptyState } from "@/components/empty-state";
import { firstChannel, getServerTree } from "@/lib/data";

// Page du pôle : affiche directement son premier salon (sans redirection, donc sans aller-retour de plus)
export default async function ServerHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<{ m?: string; t?: string }>;
}) {
  const [{ serverId }, { m, t }] = await Promise.all([params, searchParams]);
  // Même arguments que la colonne du pôle : réponse déjà en cache
  const { tree, projects } = await getServerTree(serverId, true);
  const channel = firstChannel({ ...tree, categories: tree.categories.filter((c) => c.channels.length > 0) });

  if (channel) return <ServerChannelView serverId={serverId} channelId={channel.id} m={m} t={t} />;
  // Invité (client) sans salon de pôle visible : direction son projet
  if (projects.length > 0) redirect(`/s/${serverId}/p/${projects[0].id}`);

  return (
    <EmptyState icon={<FolderKanban className="size-6" />} title="Rien à afficher ici">
      Tu n&apos;as accès à aucun salon ni projet de ce pôle.
    </EmptyState>
  );
}
