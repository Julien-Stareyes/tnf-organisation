"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Home, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { MentionBadge, useUnread } from "@/components/unread/unread-provider";
import { cn } from "@/lib/utils";
import type { OrgRole, Profile, ProjectSummary, ServerWithProjects } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", member: "Membre", guest: "Invité" };
const EXPANDED_KEY = "tnf-nav-expanded";

export const navItemClass =
  "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors";

/**
 * Colonne de navigation : accueil, notifications, recherche, puis les pôles (serveurs)
 * et leurs projets, comme un explorateur de fichiers.
 */
export function AppNav({
  servers,
  me,
  orgRole,
  notifications,
  search,
  createServer,
}: {
  servers: ServerWithProjects[];
  me: Profile | null;
  orgRole: OrgRole | null;
  notifications: React.ReactNode;
  search: React.ReactNode;
  createServer: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ serverId?: string }>();
  const [expanded, setExpanded] = useState<string[]>([]);

  // Pôles ouverts mémorisés ; le pôle affiché est toujours ouvert
  useEffect(() => {
    try {
      setExpanded(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
    } catch {
      setExpanded([]);
    }
  }, []);
  useEffect(() => {
    if (params.serverId && !expanded.includes(params.serverId)) setExpanded((current) => [...current, params.serverId!]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.serverId]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const isAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <nav aria-label="Navigation" className="flex w-60 shrink-0 flex-col border-r border-line bg-rail">
      <Link href="/" className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className="grid size-8 place-items-center rounded-lg bg-brand text-[11px] font-black tracking-tight text-brand-fg">
          TNF
        </span>
        <span className="font-semibold">The New Face</span>
      </Link>

      <div className="space-y-0.5 px-2">
        <Link
          href="/"
          className={cn(navItemClass, pathname === "/" ? "bg-main font-medium text-fg shadow-sm" : "text-muted hover:bg-hover hover:text-fg")}
        >
          <Home className="size-4" />
          Accueil
        </Link>
        {notifications}
        {search}
      </div>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-medium text-faint">Pôles</h2>
        {createServer}
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {servers.map((server) => (
          <ServerItem
            key={server.id}
            server={server}
            open={expanded.includes(server.id)}
            onToggle={() => toggle(server.id)}
          />
        ))}
        {servers.length === 0 && <p className="px-2.5 py-2 text-sm text-faint">Aucun pôle pour l&apos;instant.</p>}
      </div>

      <div className="space-y-1 border-t border-line p-2">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              navItemClass,
              pathname.startsWith("/admin") ? "bg-main font-medium text-fg shadow-sm" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            <ShieldCheck className="size-4" />
            Administration
          </Link>
        )}
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
          <Avatar name={me?.display_name ?? "?"} url={me?.avatar_url ?? null} className="size-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{me?.display_name ?? "…"}</p>
            <p className="truncate text-xs text-faint">{orgRole ? ROLE_LABEL[orgRole] : "Sans accès"}</p>
          </div>
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}

function ServerItem({ server, open, onToggle }: { server: ServerWithProjects; open: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const unread = useUnread();
  const href = `/s/${server.id}`;
  const projects = server.projects.filter((p) => p.status !== "archived");
  // Le pôle lui-même (ses salons généraux) est actif hors des pages projet
  const active = pathname.startsWith(href) && !pathname.startsWith(`${href}/p/`);
  const { unread: hasUnread, mentions } = unread.server(server.id);

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Replier ${server.name}` : `Déplier ${server.name}`}
          className="grid size-7 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Link
          href={href}
          className={cn(
            navItemClass,
            "min-w-0 flex-1 pl-1.5",
            active
              ? "bg-main font-medium text-fg shadow-sm"
              : hasUnread && !open
                ? "font-semibold text-fg hover:bg-hover"
                : "text-fg/90 hover:bg-hover",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{server.name}</span>
          {!open && <MentionBadge count={mentions} />}
        </Link>
      </div>
      {open && (
        <ul className="ml-[1.375rem] space-y-0.5 border-l border-line pl-2">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectItem serverId={server.id} project={project} />
            </li>
          ))}
          {projects.length === 0 && <li className="px-2.5 py-1 text-xs text-faint">Aucun projet</li>}
        </ul>
      )}
    </div>
  );
}

function ProjectItem({ serverId, project }: { serverId: string; project: ProjectSummary }) {
  const href = `/s/${serverId}/p/${project.id}`;
  const active = usePathname().startsWith(href);
  const { unread, mentions } = useUnread().project(project.id);
  const highlight = !active && (unread || mentions > 0);

  return (
    <Link
      href={href}
      className={cn(
        navItemClass,
        "py-1",
        active ? "bg-main font-medium text-fg shadow-sm" : highlight ? "font-semibold text-fg hover:bg-hover" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "var(--faint)" }} />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {project.status === "delivered" && <span className="text-[10px] text-faint">Livré</span>}
      <MentionBadge count={mentions} />
    </Link>
  );
}
