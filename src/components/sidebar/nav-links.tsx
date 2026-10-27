"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, Megaphone } from "lucide-react";
import { MentionBadge, useUnread } from "@/components/unread/unread-provider";
import { cn } from "@/lib/utils";
import type { ChannelType, ProjectStatus } from "@/lib/types";

const itemClass = "group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[15px] transition-colors";

/** Petit trait blanc à gauche, comme Discord, pour signaler du nouveau */
function UnreadMark() {
  return <span className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-fg" />;
}

export function ChannelLink({ id, href, name, type }: { id: string; href: string; name: string; type: ChannelType }) {
  const active = usePathname() === href;
  const { unread, mentions } = useUnread().channel(id);
  const highlight = !active && (unread || mentions > 0);
  const Icon = type === "announcement" ? Megaphone : Hash;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        active ? "bg-hover text-fg" : highlight ? "font-semibold text-fg hover:bg-hover/60" : "text-muted hover:bg-hover/60 hover:text-fg",
      )}
    >
      {highlight && <UnreadMark />}
      <Icon className={cn("size-4 shrink-0", highlight ? "text-fg" : "text-faint")} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {!active && <MentionBadge count={mentions} />}
    </Link>
  );
}

const STATUS_LABEL: Partial<Record<ProjectStatus, string>> = { delivered: "Livré" };

export function ProjectLink({
  id,
  href,
  name,
  client,
  color,
  status,
}: {
  id: string;
  href: string;
  name: string;
  client: string | null;
  color: string | null;
  status: ProjectStatus;
}) {
  const active = usePathname().startsWith(href);
  const { unread, mentions } = useUnread().project(id);
  const highlight = !active && (unread || mentions > 0);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        "py-2",
        active ? "bg-hover text-fg" : highlight ? "text-fg hover:bg-hover/60" : "text-muted hover:bg-hover/60 hover:text-fg",
      )}
    >
      {highlight && <UnreadMark />}
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--faint)" }} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", highlight ? "font-semibold" : "font-medium")}>{name}</span>
        {client && client !== name && <span className="block truncate text-xs text-faint">{client}</span>}
      </span>
      {STATUS_LABEL[status] && (
        <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] uppercase text-faint">{STATUS_LABEL[status]}</span>
      )}
      <MentionBadge count={mentions} />
    </Link>
  );
}
