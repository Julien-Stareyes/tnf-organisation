import { getMe, getMessagesAround, getRecentMessages } from "@/lib/data";
import type { Channel, Member } from "@/lib/types";
import { Chat } from "./chat";

// Charge le premier écran de messages côté serveur, puis le temps réel prend le relais
export async function ChannelChat({
  channel,
  permissions,
  members,
  focusMessageId,
}: {
  channel: Channel;
  permissions: number;
  /** Personnes mentionnables dans ce salon */
  members: Member[];
  focusMessageId?: string;
}) {
  const [around, { profile, email }] = await Promise.all([
    focusMessageId ? getMessagesAround(channel.id, focusMessageId) : null,
    getMe(),
  ]);
  const { messages, hasMore, hasNewer } = around ?? (await getRecentMessages(channel.id));

  return (
    <Chat
      key={`${channel.id}:${around ? focusMessageId : ""}`}
      channel={channel}
      initialMessages={messages}
      initialHasMore={hasMore}
      initialHasNewer={hasNewer}
      focusMessageId={around ? (focusMessageId ?? null) : null}
      permissions={permissions}
      members={members}
      me={{
        id: profile?.id ?? "",
        display_name: profile?.display_name ?? email,
        avatar_url: profile?.avatar_url ?? null,
      }}
    />
  );
}
