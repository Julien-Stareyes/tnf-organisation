"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KanbanSquare, Loader2, Search } from "lucide-react";
import { searchEverywhere, type SearchResults } from "@/app/actions/search";
import { Avatar } from "@/components/avatar";
import { navItemClass } from "@/components/nav/app-nav";
import { Dialog } from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/chat";
import { cn } from "@/lib/utils";

/** Recherche dans tous les pôles accessibles (ligne de la navigation, ou Ctrl+K) */
export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  // Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Recherche 300 ms après la dernière frappe
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const found = await searchEverywhere(query);
        if (id === requestId.current) setResults(found);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const empty = results && results.messages.length === 0 && results.cards.length === 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(navItemClass, "text-muted hover:bg-hover hover:text-fg")}>
        <Search className="size-4" />
        Rechercher
        <kbd className="ml-auto rounded border border-line bg-main px-1.5 font-sans text-[10px] text-faint">Ctrl K</kbd>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Rechercher">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-line bg-elevated px-3 focus-within:border-accent">
            <Search className="size-4 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Messages, cartes… (ex. rendu final lookdev)"
              className="flex-1 bg-transparent py-2 text-sm text-fg outline-none placeholder:text-faint"
            />
            {pending && <Loader2 className="size-4 animate-spin text-faint" />}
          </div>

          <div className="max-h-[55vh] space-y-4 overflow-y-auto">
            {empty && <p className="py-6 text-center text-sm text-faint">Aucun résultat.</p>}

            {results && results.cards.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-medium text-faint">Tâches</h3>
                <ul>
                  {results.cards.map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => go(`/s/${card.server_id}/p/${card.project_id}/board?card=${card.id}`)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover"
                      >
                        <KanbanSquare className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate text-sm">{card.title}</span>
                        <span className="shrink-0 text-xs text-faint">{card.project_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {results && results.messages.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-medium text-faint">Messages</h3>
                <ul>
                  {results.messages.map((hit) => {
                    const base = hit.project_id ? `/s/${hit.server_id}/p/${hit.project_id}` : `/s/${hit.server_id}`;
                    return (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => go(`${base}/c/${hit.channel_id}?m=${hit.id}`)}
                          className="flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-hover"
                        >
                          <Avatar name={hit.author} url={hit.avatar_url} className="size-8" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2 text-xs">
                              <span className="font-semibold text-fg">{hit.author}</span>
                              <span className="truncate text-faint">
                                {hit.project_name ?? hit.server_name} › #{hit.channel_name}
                              </span>
                              <span suppressHydrationWarning className="ml-auto shrink-0 text-faint">
                                {formatTimestamp(hit.created_at)}
                              </span>
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{hit.excerpt}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
          <p className="text-xs text-faint">
            Tous les mots doivent apparaître ; le début d&apos;un mot suffit (« lookd » trouve « lookdev »).
          </p>
        </div>
      </Dialog>
    </>
  );
}
