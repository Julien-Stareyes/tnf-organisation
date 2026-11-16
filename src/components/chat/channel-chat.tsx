import { getMessagesAround, getRecentMessages } from "@/lib/data";
import type { Channel, Member } from "@/lib/types";
import { Chat } from "./chat";

type Me = { id: string; display_name: string; avatar_url: string | null };

/**
 * Premier écran de messages : les derniers messages, ou ceux autour d'un message ciblé (?m=).
 * Appelé dans la même vague de requêtes que le reste de la page.
 */
export async function loadChatMessages(channelId: string, focusMessageId: string | undefined) {
  const around = focusMessageId ? await getMessagesAround(channelId, focusMessageId) : null;
  return { ...(around ?? (await getRecentMessages(channelId))), focused: Boolean(around) };
}

export type ChatMessagesData = Awaited<ReturnType<typeof loadChatMessages>>;

// Le chargement est fait par la page (en parallèle) ; ensuite le temps réel prend le relais
export function ChannelChat({
  channel,
  permissions,
  members,
  me,
  data,
  focusMessageId,
  threadId,
  threadFocusId,
}: {
  channel: Channel;
  permissions: number;
  /** Personnes mentionnables dans ce salon */
  members: Member[];
  me: Me;
  data: ChatMessagesData;
  focusMessageId?: string;
  threadId?: string;
  threadFocusId?: string;
}) {
  const focus = data.focused ? (focusMessageId ?? null) : null;
  return (
    <Chat
      key={`${channel.id}:${focus ?? ""}`}
      channel={channel}
      initialMessages={data.messages}
      initialHasMore={data.hasMore}
      initialHasNewer={data.hasNewer}
      focusMessageId={focus}
      threadId={threadId ?? null}
      threadFocusId={threadFocusId ?? null}
      permissions={permissions}
      members={members}
      me={me}
    />
  );
}
