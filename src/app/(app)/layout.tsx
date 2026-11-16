import { AppNav } from "@/components/nav/app-nav";
import { CreateServerDialog } from "@/components/dialogs/server-dialogs";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchDialog } from "@/components/search/search-dialog";
import { UiPrefsProvider } from "@/components/ui-prefs";
import { UnreadProvider } from "@/components/unread/unread-provider";
import { getMe, getMyUnread, getServersWithProjects } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ orgRole, profile }, servers, unread] = await Promise.all([getMe(), getServersWithProjects(), getMyUnread()]);
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <UnreadProvider meId={profile?.id ?? ""} initial={unread}>
      <UiPrefsProvider>
        <div className="flex h-dvh overflow-hidden bg-main text-fg">
          <AppNav
            servers={servers}
            me={profile}
            orgRole={orgRole}
            notifications={profile ? <NotificationBell meId={profile.id} /> : null}
            search={<SearchDialog />}
            createServer={isOrgAdmin ? <CreateServerDialog /> : null}
          />
          <div className="flex min-w-0 flex-1">{children}</div>
        </div>
      </UiPrefsProvider>
    </UnreadProvider>
  );
}
