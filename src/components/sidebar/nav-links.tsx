"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brush, Clapperboard, Hash, KanbanSquare, Megaphone, MessagesSquare } from "lucide-react";
import { MentionBadge, useUnread } from "@/components/unread/unread-provider";
import { cn } from "@/lib/utils";
import type { ChannelType } from "@/lib/types";

const itemClass = "group relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors";
const activeClass = "bg-main font-medium text-fg shadow-sm";

/** Petit trait à gauche, comme Discord, pour signaler du nouveau */
function UnreadMark() {
  return <span className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-fg" />;
}

export function ChannelLink({
  id,
  href,
  alsoActiveAt,
  name,
  type,
}: {
  id: string;
  href: string;
  /** Autre adresse où ce salon est affiché (page du pôle / projet = premier salon) */
  alsoActiveAt?: string;
  name: string;
  type: ChannelType;
}) {
  const pathname = usePathname();
  const active = pathname === href || (alsoActiveAt !== undefined && pathname === alsoActiveAt);
  const { unread, mentions } = useUnread().channel(id);
  const highlight = !active && (unread || mentions > 0);
  const Icon = type === "announcement" ? Megaphone : Hash;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        active ? activeClass : highlight ? "font-semibold text-fg hover:bg-hover" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      {highlight && <UnreadMark />}
      <Icon className={cn("size-4 shrink-0", highlight || active ? "text-fg" : "text-faint")} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {!active && <MentionBadge count={mentions} />}
    </Link>
  );
}

const SECTIONS = {
  chat: { label: "Discussions", icon: MessagesSquare, path: "" },
  board: { label: "Tâches", icon: KanbanSquare, path: "/board" },
  reviews: { label: "Revues", icon: Clapperboard, path: "/reviews" },
  whiteboard: { label: "Tableau", icon: Brush, path: "/whiteboard" },
} as const;

export type ProjectSection = keyof typeof SECTIONS;

/** Sections principales d'un projet, en tête de la colonne projet */
export function ProjectSections({
  projectId,
  basePath,
  sections,
  counts,
}: {
  projectId: string;
  basePath: string;
  sections: ProjectSection[];
  counts: Partial<Record<ProjectSection, { text: string; warn?: boolean }>>;
}) {
  const pathname = usePathname();
  const { unread: hasUnread } = useUnread().project(projectId);
  const current: ProjectSection = pathname.startsWith(`${basePath}/board`)
    ? "board"
    : pathname.startsWith(`${basePath}/reviews`)
      ? "reviews"
      : pathname.startsWith(`${basePath}/whiteboard`)
        ? "whiteboard"
        : "chat";

  return (
    <ul className="space-y-0.5">
      {sections.map((key) => {
        const { label, icon: Icon, path } = SECTIONS[key];
        const active = current === key;
        const count = counts[key];
        return (
          <li key={key}>
            <Link
              href={`${basePath}${path}`}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, active ? activeClass : "text-muted hover:bg-hover hover:text-fg")}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {key === "chat" && hasUnread && !active && <span className="size-2 rounded-full bg-fg" aria-label="Nouveaux messages" />}
              {count && <span className={cn("text-xs", count.warn ? "text-idle" : "text-faint")}>{count.text}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
