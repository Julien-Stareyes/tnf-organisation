"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelType, ProjectStatus } from "@/lib/types";

const itemClass = "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[15px] transition-colors";

export function ChannelLink({ href, name, type }: { href: string; name: string; type: ChannelType }) {
  const active = usePathname() === href;
  const Icon = type === "announcement" ? Megaphone : Hash;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, active ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg")}
    >
      <Icon className="size-4 shrink-0 text-faint" />
      <span className="truncate">{name}</span>
    </Link>
  );
}

const STATUS_LABEL: Partial<Record<ProjectStatus, string>> = { delivered: "Livré" };

export function ProjectLink({
  href,
  name,
  client,
  color,
  status,
}: {
  href: string;
  name: string;
  client: string | null;
  color: string | null;
  status: ProjectStatus;
}) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, "py-2", active ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg")}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--faint)" }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {client && client !== name && <span className="block truncate text-xs text-faint">{client}</span>}
      </span>
      {STATUS_LABEL[status] && (
        <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] uppercase text-faint">{STATUS_LABEL[status]}</span>
      )}
    </Link>
  );
}
