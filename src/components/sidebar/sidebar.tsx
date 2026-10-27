import { UserPanel } from "@/components/user-panel";

export function Sidebar({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
      <div className="border-b border-line shadow-sm">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">{children}</div>
      <UserPanel />
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
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
