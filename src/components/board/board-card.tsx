"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Clock } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatDue, isOverdue, type BoardCard, type BoardLabel } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/types";

type Lookups = { labelById: Map<string, BoardLabel>; memberById: Map<string, Member> };

export function SortableBoardCard({ card, onOpen, ...lookups }: { card: BoardCard; onOpen: () => void } & Lookups) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      <BoardCardView card={card} onOpen={onOpen} {...lookups} />
    </li>
  );
}

export function BoardCardView({
  card,
  labelById,
  memberById,
  onOpen,
  overlay,
}: { card: BoardCard; onOpen?: () => void; overlay?: boolean } & Lookups) {
  const cardLabels = card.label_ids.map((id) => labelById.get(id)).filter(Boolean) as BoardLabel[];
  const assignees = card.assignee_ids.map((id) => memberById.get(id)).filter(Boolean) as Member[];

  return (
    <div
      role="button"
      tabIndex={-1}
      onClick={onOpen}
      className={cn(
        "cursor-grab space-y-2 rounded-lg border border-line bg-elevated p-2.5 text-left transition hover:border-faint",
        overlay && "rotate-2 cursor-grabbing shadow-2xl",
      )}
    >
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cardLabels.map((label) => (
            <span
              key={label.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-black/80"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm leading-snug text-fg">{card.title}</p>
      {(card.due_date || card.description || assignees.length > 0) && (
        <div className="flex items-center gap-2 text-xs text-faint">
          {card.due_date && (
            <span
              suppressHydrationWarning
              className={cn("flex items-center gap-1 rounded px-1", isOverdue(card.due_date) && "bg-danger/15 text-danger")}
            >
              <Clock className="size-3" />
              {formatDue(card.due_date)}
            </span>
          )}
          {card.description && <AlignLeft className="size-3.5" aria-label="Description" />}
          {assignees.length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
              {assignees.map((member) => (
                <span key={member.user_id} title={member.display_name} className="rounded-full ring-2 ring-elevated">
                  <Avatar name={member.display_name} url={member.avatar_url} className="size-6" />
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
