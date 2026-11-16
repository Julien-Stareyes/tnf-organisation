import { notFound } from "next/navigation";
import { ChannelChat, loadChatMessages } from "@/components/chat/channel-chat";
import { MemberPanel } from "@/components/member-panel";
import { ChannelMenu } from "@/components/menus";
import { ChannelIcon, PageHeader } from "@/components/page-header";
import { MembersToggle } from "@/components/ui-prefs";
import {
  getChannel,
  getChannelOverwrites,
  getMe,
  getMyPermissions,
  getRoleDetails,
  getServer,
  getServerMemberGroups,
  getServerMembersWithRoles,
  getServerTree,
  resolveMessageTarget,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";
import { isUuid } from "@/lib/utils";

/** Salon général d'un pôle : utilisé par /c/[channelId] et directement par la page du pôle (premier salon) */
export async function ServerChannelView({
  serverId,
  channelId,
  m,
  t,
}: {
  serverId: string;
  channelId: string;
  m?: string;
  t?: string;
}) {
  if (!isUuid(channelId)) notFound();

  // Une seule vague de requêtes (voir ProjectChannelView) ; pôle et arborescence déjà en cache
  const [server, channel, permissions, memberGroups, target, { tree }, me, recent, overwrites, roles, serverMembers] =
    await Promise.all([
      getServer(serverId),
      getChannel(channelId),
      getMyPermissions({ serverId, channelId }),
      getServerMemberGroups(serverId),
      resolveMessageTarget(channelId, m),
      getServerTree(serverId, true),
      getMe(),
      m ? null : loadChatMessages(channelId, undefined),
      getChannelOverwrites(channelId),
      getRoleDetails(serverId),
      getServerMembersWithRoles(serverId),
    ]);
  // Le salon doit appartenir à ce pôle et ne pas être un salon de projet
  if (!server || !channel || channel.server_id !== server.id || channel.project_id) notFound();

  // Lien vers un message précis (?m=) : chargement autour de ce message
  const chatData = recent ?? (await loadChatMessages(channelId, target.focusId));
  const threadId = target.threadId ?? (t && isUuid(t) ? t : undefined);
  const canManage = hasPermission(permissions, Permission.MANAGE_CHANNELS);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          icon={<ChannelIcon type={channel.type} />}
          title={channel.name}
          subtitle={channel.topic}
          actions={
            <>
              {!threadId && <MembersToggle />}
              {canManage && (
                <ChannelMenu
                  channel={channel}
                  categories={tree.categories}
                  afterDeleteHref={`/s/${server.id}`}
                  overwrites={overwrites}
                  roles={roles}
                  members={serverMembers}
                />
              )}
            </>
          }
        />
        <ChannelChat
          channel={channel}
          permissions={permissions}
          members={memberGroups.flatMap((group) => group.members)}
          me={{
            id: me.profile?.id ?? "",
            display_name: me.profile?.display_name ?? me.email,
            avatar_url: me.profile?.avatar_url ?? null,
          }}
          data={chatData}
          focusMessageId={target.focusId}
          threadId={threadId}
          threadFocusId={target.threadFocusId}
        />
      </div>
      {/* Le panneau du fil prend la place de la liste des membres */}
      {!threadId && <MemberPanel groups={memberGroups} />}
    </>
  );
}
