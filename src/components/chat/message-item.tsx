"use client";

import { Fragment, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatTime, formatTimestamp, type ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function Linkified({ text }: { text: string }) {
  return text.split(URL_RE).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noreferrer" className="text-[#5fb4ff] hover:underline">
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export function MessageItem({
  message,
  grouped,
  isMine,
  canModerate,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  grouped: boolean;
  isMine: boolean;
  canModerate: boolean;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const name = message.author?.display_name ?? "Inconnu";

  async function saveEdit() {
    const content = draft.trim();
    setEditing(false);
    if (content && content !== message.content) await onEdit(message.id, content);
  }

  function confirmDelete() {
    if (window.confirm("Supprimer ce message ?")) onDelete(message.id);
  }

  return (
    <div className={cn("group relative flex gap-4 px-4 py-0.5 hover:bg-black/15", !grouped && "mt-4")}>
      <div className="w-10 shrink-0">
        {grouped ? (
          <span
            suppressHydrationWarning
            className="invisible block pt-1 text-right text-[11px] text-faint group-hover:visible"
          >
            {formatTime(message.created_at)}
          </span>
        ) : (
          <Avatar name={name} url={message.author?.avatar_url ?? null} className="size-10" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="font-semibold text-fg">{name}</span>
            <time suppressHydrationWarning dateTime={message.created_at} className="text-xs text-faint">
              {formatTimestamp(message.created_at)}
            </time>
          </p>
        )}

        {editing ? (
          <div className="py-1">
            <textarea
              autoFocus
              value={draft}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveEdit();
                }
                if (event.key === "Escape") {
                  setDraft(message.content);
                  setEditing(false);
                }
              }}
              className="w-full resize-none rounded-md bg-elevated px-3 py-2 text-[15px] text-fg outline-none"
              rows={Math.min(8, draft.split("\n").length)}
            />
            <p className="text-xs text-faint">Échap pour annuler · Entrée pour enregistrer</p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-fg/90">
            <Linkified text={message.content} />
            {message.edited_at && <span className="ml-1 text-[11px] text-faint">(modifié)</span>}
          </p>
        )}
      </div>

      {!editing && (isMine || canModerate) && (
        <div className="absolute -top-3 right-4 hidden overflow-hidden rounded-md border border-line bg-sidebar shadow-lg group-hover:flex">
          {isMine && (
            <button
              type="button"
              title="Modifier"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
              className="grid size-8 place-items-center text-muted hover:bg-hover hover:text-fg"
            >
              <Pencil className="size-4" />
            </button>
          )}
          <button
            type="button"
            title="Supprimer"
            onClick={confirmDelete}
            className="grid size-8 place-items-center text-muted hover:bg-hover hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
