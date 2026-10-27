import { ServerRail } from "@/components/server-rail";
import { CreateServerDialog } from "@/components/dialogs/server-dialogs";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getMe, getMyServers } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ orgRole, profile }, servers] = await Promise.all([getMe(), getMyServers()]);
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <div className="flex h-dvh overflow-hidden bg-main text-fg">
      <ServerRail
        servers={servers}
        createServer={isOrgAdmin ? <CreateServerDialog /> : null}
        showAdmin={isOrgAdmin}
        notifications={profile ? <NotificationBell meId={profile.id} /> : null}
      />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
