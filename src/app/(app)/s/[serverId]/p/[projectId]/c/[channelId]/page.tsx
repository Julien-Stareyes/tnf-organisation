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
  getMyProjectRole,
  getProject,
  getProjectMemberGroups,
  getProjectMembers,
  getProjectTree,
  getRoleDetails,
  getServer,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";

export default async function ProjectChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; projectId: string; channelId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ serverId, projectId, channelId }, { m: focusMessageId }] = await Promise.all([params, searchParams]);
  const [server, project, channel] = await Promise.all([
    getServer(serverId),
    getProject(projectId),
    getChannel(channelId),
  ]);
  if (!server || !project || !channel || channel.project_id !== project.id) notFound();

  const basePath = `/s/${server.id}/p/${project.id}`;
  const [permissions, memberGroups, myProjectRole] = await Promise.all([
    getMyPermissions({ serverId: server.id, channelId: channel.id }),
    getProjectMemberGroups(project.id),
    getMyProjectRole(project.id),
  ]);
  const canManage = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const manageData = canManage
    ? await Promise.all([
        getProjectTree(project.id, true),
        getChannelOverwrites(channel.id),
        getRoleDetails(server.id),
        getProjectMembers(project.id),
      ])
    : null;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader
          crumbs={[{ label: server.name, href: `/s/${server.id}` }, { label: project.name }]}
          channel={channel}
          project={{ basePath, active: "chat", showBoards: myProjectRole !== "client" }}
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
                  categories={manageData[0].categories}
                  afterDeleteHref={basePath}
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
