// Squelettes affichés instantanément pendant le chargement d'une page (fichiers loading.tsx)

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-hover ${className}`} />;
}

/** Colonne du pôle ou du projet */
export function ContextColumnSkeleton() {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-line bg-sidebar px-4 pt-4">
      <Bar className="h-5 w-32" />
      <Bar className="mb-4 h-3 w-24" />
      {Array.from({ length: 4 }, (_, i) => (
        <Bar key={i} className="h-7 w-full" />
      ))}
      <Bar className="mt-4 h-3 w-16" />
      {Array.from({ length: 5 }, (_, i) => (
        <Bar key={i} className="h-6 w-4/5" />
      ))}
    </aside>
  );
}

/** Zone de contenu : en-tête puis quelques lignes */
export function ContentSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
        <Bar className="h-5 w-40" />
        <Bar className="h-4 w-56" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-5 p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Bar className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Bar className="h-3.5 w-32" />
              <Bar className={i % 2 ? "h-3.5 w-3/5" : "h-3.5 w-4/5"} />
            </div>
          </div>
        ))}
        <Bar className="h-11 w-full" />
      </div>
    </div>
  );
}
