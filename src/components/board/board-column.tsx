"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { BoardCard, BoardColumn, BoardLabel } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/types";
import { SortableBoardCard } from "./board-card";

export function BoardColumnView({
  column,
  cardIds,
  cardById,
  labelById,
  memberById,
  canManage,
  isFirst,
  isLast,
  onOpenCard,
  onAddCard,
  onRename,
  onMove,
  onDelete,
}: {
  column: BoardColumn;
  cardIds: string[];
  cardById: Map<string, BoardCard>;
  labelById: Map<string, BoardLabel>;
  memberById: Map<string, Member>;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: (columnId: string, title: string) => Promise<void>;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState(false);

  async function submitCard() {
    const title = draft.trim();
    if (!title) return setAdding(false);
    setDraft("");
    await onAddCard(column.id, title.slice(0, 300));
  }

  return (
    <section className="group/col flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-sidebar">
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color ?? "var(--faint)" }} />
        {editingName ? (
          <input
            autoFocus
            defaultValue={column.name}
            maxLength={60}
            onBlur={(event) => {
              setEditingName(false);
              const name = event.target.value.trim();
              if (name && name !== column.name) onRename(name);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setEditingName(false);
            }}
            className="min-w-0 flex-1 rounded bg-rail px-1.5 py-0.5 text-sm font-semibold outline-none"
          />
        ) : (
          <h3
            onDoubleClick={() => canManage && setEditingName(true)}
            title={canManage ? "Double-clic pour renommer" : undefined}
            className="min-w-0 flex-1 truncate text-sm font-semibold"
          >
            {column.name}
          </h3>
        )}
        <span className="rounded-full bg-elevated px-2 text-xs text-faint">{cardIds.length}</span>
        {canManage && (
          <span className="hidden items-center group-hover/col:flex">
            <ColumnButton title="Déplacer à gauche" disabled={isFirst} onClick={() => onMove(-1)}>
              <ChevronLeft className="size-3.5" />
            </ColumnButton>
            <ColumnButton title="Déplacer à droite" disabled={isLast} onClick={() => onMove(1)}>
              <ChevronRight className="size-3.5" />
            </ColumnButton>
            <ColumnButton title="Supprimer la colonne" onClick={onDelete} danger>
              <Trash2 className="size-3.5" />
            </ColumnButton>
          </span>
        )}
      </header>

      <SortableContext id={column.id} items={cardIds} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "min-h-12 flex-1 space-y-2 overflow-y-auto rounded-lg px-2 pb-2 transition-colors",
            isOver && "bg-hover/40",
          )}
        >
          {cardIds.map((id) => {
            const card = cardById.get(id);
            return card ? (
              <SortableBoardCard
                key={id}
                card={card}
                labelById={labelById}
                memberById={memberById}
                onOpen={() => onOpenCard(id)}
              />
            ) : null;
          })}
        </ul>
      </SortableContext>

      <div className="px-2 pb-2">
        {adding ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              rows={2}
              value={draft}
              maxLength={300}
              placeholder="Titre de la carte"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitCard();
                }
                if (event.key === "Escape") setAdding(false);
              }}
              className="w-full resize-none rounded-lg border border-line bg-elevated px-2.5 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitCard}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
              >
                Ajouter
              </button>
              <button type="button" onClick={() => setAdding(false)} className="px-2 text-xs text-muted hover:text-fg">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-faint hover:bg-hover/60 hover:text-fg"
          >
            <Plus className="size-4" />
            Ajouter une carte
          </button>
        )}
      </div>
    </section>
  );
}

function ColumnButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded text-faint hover:bg-hover disabled:invisible",
        danger ? "hover:text-danger" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
