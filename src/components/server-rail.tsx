"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { MentionBadge, useUnread } from "@/components/unread/unread-provider";
import { cn, initials } from "@/lib/utils";
import type { ServerSummary } from "@/lib/types";

export function ServerRail({
  servers,
  createServer,
  showAdmin,
  notifications,
}: {
  servers: ServerSummary[];
  createServer: React.ReactNode;
  showAdmin: boolean;
  notifications: React.ReactNode;
}) {
  const params = useParams<{ serverId?: string }>();
  const pathname = usePathname();
  const unread = useUnread();

  return (
    <nav aria-label="Serveurs" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3">
      <Link
        href="/"
        title="Organisation TNF"
        className="grid size-12 place-items-center rounded-2xl bg-elevated text-xs font-black tracking-tight text-accent transition hover:bg-hover"
      >
        TNF
      </Link>
      {notifications}
      {showAdmin && (
        <Link
          href="/admin"
          title="Administration"
          className={cn(
            "grid size-12 place-items-center transition-all",
            pathname.startsWith("/admin")
              ? "rounded-2xl bg-accent text-accent-fg"
              : "rounded-3xl bg-elevated text-muted hover:rounded-2xl hover:bg-hover hover:text-fg",
          )}
        >
          <ShieldCheck className="size-5" />
        </Link>
      )}
      <div className="my-1 h-0.5 w-8 rounded-full bg-line" />

      {servers.map((server) => {
        const active = params.serverId === server.id;
        const { unread: hasUnread, mentions } = unread.server(server.id);
        return (
          <div key={server.id} className="group relative flex w-full justify-center">
            {/* Comme Discord : petite pastille si non lu, barre haute si serveur ouvert */}
            <span
              className={cn(
                "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-fg transition-all",
                active ? "h-10" : hasUnread ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5",
              )}
            />
            <MentionBadge count={mentions} className="absolute bottom-0 right-2.5 z-10 border-[3px] border-rail" />
            <Link
              href={`/s/${server.id}`}
              title={server.name}
              className={cn(
                "grid size-12 place-items-center overflow-hidden text-sm font-semibold transition-all",
                active
                  ? "rounded-2xl bg-accent text-accent-fg"
                  : "rounded-3xl bg-elevated text-fg hover:rounded-2xl hover:bg-hover",
              )}
            >
              {server.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={server.icon_url} alt="" className="size-full object-cover" />
              ) : (
                initials(server.name)
              )}
            </Link>
          </div>
        );
      })}

      {createServer}
    </nav>
  );
}
