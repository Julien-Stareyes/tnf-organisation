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
  getProject,
  getProjectMemberGroups,
  getProjectMembers,
  getProjectTree,
  getRoleDetails,
  getServer,
  resolveMessageTarget,
} from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";
import { isUuid } from "@/lib/utils";

/**
 * Salon d'un projet : utilisé par /c/[channelId] et directement par la page du projet
 * (premier salon), pour éviter une redirection et un aller-retour de plus.
 */
export async function ProjectChannelView({
  serverId,
  projectId,
  channelId,
  m,
  t,
}: {
  serverId: string;
  projectId: string;
  channelId: string;
  m?: string;
  t?: string;
}) {
  if (!isUuid(channelId)) notFound();

  // Une seule vague de requêtes : tout part en même temps, y compris les messages et les données
  // de gestion (lues sans risque : la RLS ne renvoie rien si l'utilisateur n'y a pas droit).
  // Pôle, projet et arborescence sont déjà en cache (chargés par la colonne du projet).
  const [server, project, channel, permissions, memberGroups, target, tree, me, recent, overwrites, roles, projectMembers] =
    await Promise.all([
      getServer(serverId),
      getProject(projectId),
      getChannel(channelId),
      getMyPermissions({ serverId, channelId }),
      getProjectMemberGroups(projectId),
      resolveMessageTarget(channelId, m),
      getProjectTree(projectId, true),
      getMe(),
      m ? null : loadChatMessages(channelId, undefined),
      getChannelOverwrites(channelId),
      getRoleDetails(serverId),
      getProjectMembers(projectId),
    ]);
  if (!server || !project || !channel || channel.project_id !== project.id) notFound();

  // Lien vers un message précis (?m=) : chargement autour de ce message
  const chatData = recent ?? (await loadChatMessages(channelId, target.focusId));
  const basePath = `/s/${server.id}/p/${project.id}`;
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
                  afterDeleteHref={basePath}
                  overwrites={overwrites}
                  roles={roles}
                  members={projectMembers}
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
