import { ProjectChannelView } from "@/components/chat/project-channel-view";

export default async function ProjectChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; projectId: string; channelId: string }>;
  searchParams: Promise<{ m?: string; t?: string }>;
}) {
  const [{ serverId, projectId, channelId }, { m, t }] = await Promise.all([params, searchParams]);
  return <ProjectChannelView serverId={serverId} projectId={projectId} channelId={channelId} m={m} t={t} />;
}
