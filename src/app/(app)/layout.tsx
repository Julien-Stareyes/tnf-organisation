import { ServerRail } from "@/components/server-rail";
import { CreateServerDialog } from "@/components/dialogs/server-dialogs";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UnreadProvider } from "@/components/unread/unread-provider";
import { getMe, getMyServers, getMyUnread } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ orgRole, profile }, servers, unread] = await Promise.all([getMe(), getMyServers(), getMyUnread()]);
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <UnreadProvider meId={profile?.id ?? ""} initial={unread}>
      <div className="flex h-dvh overflow-hidden bg-main text-fg">
        <ServerRail
          servers={servers}
          createServer={isOrgAdmin ? <CreateServerDialog /> : null}
          showAdmin={isOrgAdmin}
          notifications={profile ? <NotificationBell meId={profile.id} /> : null}
        />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
    </UnreadProvider>
  );
}
