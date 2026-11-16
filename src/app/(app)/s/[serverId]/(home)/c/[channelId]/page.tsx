import { ServerChannelView } from "@/components/chat/server-channel-view";

export default async function ServerChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
  searchParams: Promise<{ m?: string; t?: string }>;
}) {
  const [{ serverId, channelId }, { m, t }] = await Promise.all([params, searchParams]);
  return <ServerChannelView serverId={serverId} channelId={channelId} m={m} t={t} />;
}
