/** Colonne de contexte (pôle ou projet), entre la navigation et le contenu */
export function Sidebar({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="shrink-0">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{children}</div>
    </aside>
  );
}

export function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between px-2.5 pb-1">
        <h2 className="text-xs font-medium text-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** En-tête d'une colonne de contexte : titre, sous-titre, menu « ⋯ » */
export function SidebarHeader({
  title,
  subtitle,
  color,
  menu,
}: {
  title: string;
  subtitle?: string | null;
  color?: string | null;
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-4 pb-3 pt-4">
      {color !== undefined && (
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--faint)" }} />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs text-faint">{subtitle}</p>}
      </div>
      {menu}
    </div>
  );
}
