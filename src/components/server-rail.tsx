"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { ServerSummary } from "@/lib/types";

export function ServerRail({
  servers,
  createServer,
  showAdmin,
}: {
  servers: ServerSummary[];
  createServer: React.ReactNode;
  showAdmin: boolean;
}) {
  const params = useParams<{ serverId?: string }>();
  const pathname = usePathname();

  return (
    <nav aria-label="Serveurs" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3">
      <Link
        href="/"
        title="Organisation TNF"
        className="grid size-12 place-items-center rounded-2xl bg-elevated text-xs font-black tracking-tight text-accent transition hover:bg-hover"
      >
        TNF
      </Link>
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
        return (
          <div key={server.id} className="group relative flex w-full justify-center">
            <span
              className={cn(
                "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-fg transition-all",
                active ? "h-10" : "h-0 group-hover:h-5",
              )}
            />
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
