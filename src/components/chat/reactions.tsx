"use client";

import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { groupReactions, REACTION_EMOJIS, type ChatReaction } from "@/lib/chat";
import { cn } from "@/lib/utils";

/** Pastilles de réactions sous un message (clic = ajouter / retirer la sienne) */
export function ReactionBar({
  reactions,
  meId,
  names,
  canReact,
  onToggle,
}: {
  reactions: ChatReaction[];
  meId: string;
  names: Map<string, string>;
  canReact: boolean;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {groupReactions(reactions).map(({ emoji, userIds }) => {
        const mine = userIds.includes(meId);
        const who = userIds.map((id) => (id === meId ? "toi" : (names.get(id) ?? "quelqu'un"))).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            disabled={!canReact}
            title={who}
            onClick={() => onToggle(emoji)}
            className={cn(
              "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition",
              mine ? "border-accent/60 bg-accent/15 text-fg" : "border-line bg-elevated text-muted hover:border-faint",
            )}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="tabular-nums">{userIds.length}</span>
          </button>
        );
      })}
      {canReact && <EmojiPicker onPick={onToggle} compact />}
    </div>
  );
}

/** Bouton qui ouvre la grille d'emojis */
export function EmojiPicker({
  onPick,
  compact,
  below,
}: {
  onPick: (emoji: string) => void;
  compact?: boolean;
  /** Ouvre la grille sous le bouton (barre d'outils en haut d'un message) */
  below?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Ajouter une réaction"
        onClick={() => setOpen(!open)}
        className={cn(
          "grid place-items-center text-muted hover:text-fg",
          compact ? "size-6 rounded-md border border-transparent hover:border-line hover:bg-elevated" : "size-8 hover:bg-hover",
        )}
      >
        <SmilePlus className="size-4" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-30 grid w-64 grid-cols-8 gap-0.5 rounded-lg border border-line bg-sidebar p-1.5 shadow-2xl",
            below ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="grid size-7 place-items-center rounded text-lg hover:bg-hover"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
