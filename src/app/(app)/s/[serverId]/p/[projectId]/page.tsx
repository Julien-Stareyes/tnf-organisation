import { redirect } from "next/navigation";
import { Hash } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { firstChannel, getProjectTree } from "@/lib/data";

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const channel = firstChannel(await getProjectTree(projectId));
  if (channel) redirect(`/s/${serverId}/p/${projectId}/c/${channel.id}`);

  return (
    <EmptyState icon={<Hash className="size-6" />} title="Aucun salon visible">
      Ce projet n&apos;a pas encore de salon auquel tu as accès.
    </EmptyState>
  );
}
