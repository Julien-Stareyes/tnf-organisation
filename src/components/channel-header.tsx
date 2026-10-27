import Link from "next/link";
import { ChevronRight, Hash, KanbanSquare, Megaphone, MessagesSquare, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelType } from "@/lib/types";

export type Crumb = { label: string; href?: string };
export type ProjectTab = "chat" | "miro" | "trello";

export function ChannelHeader({
  crumbs,
  channel,
  project,
  actions,
}: {
  crumbs: Crumb[];
  channel?: { name: string; type: ChannelType; topic: string | null };
  project?: { basePath: string; active: ProjectTab };
  actions?: React.ReactNode;
}) {
  const ChannelIcon = channel?.type === "announcement" ? Megaphone : Hash;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 shadow-sm">
      <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb) => (
          <span key={crumb.label} className="flex shrink-0 items-center gap-1 text-muted">
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-fg">
                {crumb.label}
              </Link>
            ) : (
              crumb.label
            )}
            <ChevronRight className="size-3.5 text-faint" />
          </span>
        ))}
        {channel ? (
          <span className="flex min-w-0 items-center gap-1 font-semibold text-fg">
            <ChannelIcon className="size-4 shrink-0 text-faint" />
            <span className="truncate">{channel.name}</span>
          </span>
        ) : null}
      </nav>

      {channel?.topic && (
        <>
          <span className="hidden h-5 w-px bg-line md:block" />
          <p className="hidden min-w-0 truncate text-sm text-muted md:block">{channel.topic}</p>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
        {project && <ProjectTabs basePath={project.basePath} active={project.active} />}
      </div>
    </header>
  );
}

const TABS = [
  { key: "chat", label: "Chat", icon: MessagesSquare, path: "" },
  { key: "miro", label: "Miro", icon: PenTool, path: "/miro" },
  { key: "trello", label: "Trello", icon: KanbanSquare, path: "/trello" },
] as const;

function ProjectTabs({ basePath, active }: { basePath: string; active: ProjectTab }) {
  return (
    <div role="tablist" className="flex items-center gap-1 rounded-lg bg-rail p-1">
      {TABS.map(({ key, label, icon: Icon, path }) => (
        <Link
          key={key}
          role="tab"
          aria-selected={active === key}
          href={`${basePath}${path}`}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            active === key ? "bg-hover text-fg" : "text-muted hover:text-fg",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
    </div>
  );
}
