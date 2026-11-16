import { Hash, Megaphone } from "lucide-react";
import type { ChannelType } from "@/lib/types";

/** En-tête de page simple : un titre, un sous-titre éventuel, et les actions à droite */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
      <h1 className="flex min-w-0 shrink-0 items-center gap-2 font-semibold">
        {icon}
        <span className="truncate">{title}</span>
      </h1>
      {subtitle && <p className="hidden min-w-0 truncate text-sm text-muted md:block">{subtitle}</p>}
      <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  );
}

export function ChannelIcon({ type }: { type: ChannelType }) {
  const Icon = type === "announcement" ? Megaphone : Hash;
  return <Icon className="size-4 shrink-0 text-faint" />;
}
