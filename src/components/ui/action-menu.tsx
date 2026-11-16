"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionItem = {
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  href?: string;
};

/** Bouton « ⋯ » qui regroupe les actions secondaires (réglages, membres, permissions…) */
export function ActionMenu({ items, label = "Plus d'options" }: { items: ActionItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (items.length === 0) return null;

  const itemClass = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-hover";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg",
          open && "bg-hover text-fg",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-60 rounded-lg border border-line bg-main p-1 shadow-xl">
          {items.map(({ label: itemLabel, icon: Icon, onSelect, href }) =>
            href ? (
              <Link key={itemLabel} href={href} onClick={() => setOpen(false)} className={itemClass}>
                <Icon className="size-4 text-muted" />
                {itemLabel}
              </Link>
            ) : (
              <button
                key={itemLabel}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect?.();
                }}
                className={itemClass}
              >
                <Icon className="size-4 text-muted" />
                {itemLabel}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
