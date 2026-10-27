import { getMe, getRecentMessages } from "@/lib/data";
import type { Channel } from "@/lib/types";
import { Chat } from "./chat";

// Charge le premier écran de messages côté serveur, puis le temps réel prend le relais
export async function ChannelChat({ channel, permissions }: { channel: Channel; permissions: number }) {
  const [{ messages, hasMore }, { profile, email }] = await Promise.all([getRecentMessages(channel.id), getMe()]);

  return (
    <Chat
      key={channel.id}
      channel={channel}
      initialMessages={messages}
      initialHasMore={hasMore}
      permissions={permissions}
      me={{
        id: profile?.id ?? "",
        display_name: profile?.display_name ?? email,
        avatar_url: profile?.avatar_url ?? null,
      }}
    />
  );
}
