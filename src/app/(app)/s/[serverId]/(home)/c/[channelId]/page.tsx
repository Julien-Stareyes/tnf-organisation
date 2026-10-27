import { notFound } from "next/navigation";
import { ChannelHeader } from "@/components/channel-header";
import { ChannelChat } from "@/components/chat/channel-chat";
import { ChannelSettingsDialog } from "@/components/dialogs/channel-dialogs";
import { MemberPanel } from "@/components/member-panel";
import { ChannelPermissionsDialog } from "@/components/dialogs/channel-permissions-dialog";
import {
  getChannel,
  getChannelOverwrites,
  getMyPermissions,
  getRoleDetails,
  getServer,
  getServerMemberGroups,
  getServerMembersWithRoles,
  getServerTree,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";

export default async function ServerChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ serverId, channelId }, { m: focusMessageId }] = await Promise.all([params, searchParams]);
  const [server, channel] = await Promise.all([getServer(serverId), getChannel(channelId)]);
  // Le salon doit appartenir à ce serveur et ne pas être un salon de projet
  if (!server || !channel || channel.server_id !== server.id || channel.project_id) notFound();

  const [permissions, memberGroups] = await Promise.all([
    getMyPermissions({ serverId: server.id, channelId: channel.id }),
    getServerMemberGroups(server.id),
  ]);
  const canManage = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const manageData = canManage
    ? await Promise.all([
        getServerTree(server.id, true),
        getChannelOverwrites(channel.id),
        getRoleDetails(server.id),
        getServerMembersWithRoles(server.id),
      ])
    : null;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader
          crumbs={[{ label: server.name }]}
          channel={channel}
          actions={
            manageData && (
              <>
                <ChannelPermissionsDialog
                  key={channel.id}
                  channel={channel}
                  overwrites={manageData[1]}
                  roles={manageData[2]}
                  members={manageData[3]}
                />
                <ChannelSettingsDialog
                  channel={channel}
                  categories={manageData[0].tree.categories}
                  afterDeleteHref={`/s/${server.id}`}
                />
              </>
            )
          }
        />
        <ChannelChat
          channel={channel}
          permissions={permissions}
          members={memberGroups.flatMap((group) => group.members)}
          focusMessageId={focusMessageId}
        />
      </div>
      <MemberPanel groups={memberGroups} />
    </>
  );
}
