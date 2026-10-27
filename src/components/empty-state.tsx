export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-elevated text-muted">{icon}</div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {children && <div className="text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}
