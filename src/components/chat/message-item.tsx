"use client";

import { Fragment, useMemo, useState } from "react";
import { Download, FileIcon, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  encodeMentions,
  formatSize,
  formatTime,
  formatTimestamp,
  MENTION_RE,
  readableMentions,
  type ChatAttachment,
  type ChatMessage,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const EVERYONE_RE = /(@everyone)(?![\p{L}\p{N}_])/gu;
const MENTIONS_EVERYONE = /@everyone(?![\p{L}\p{N}_])/u;

function MentionPill({ label, self }: { label: string; self?: boolean }) {
  return (
    <span className={cn("rounded px-0.5 font-medium", self ? "bg-idle/25 text-idle" : "bg-accent/15 text-accent")}>
      {label}
    </span>
  );
}

/** Texte → liens cliquables + @everyone */
function RichText({ text }: { text: string }) {
  return text.split(URL_RE).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noreferrer" className="text-[#5fb4ff] hover:underline">
        {part}
      </a>
    ) : (
      <Fragment key={index}>
        {part.split(EVERYONE_RE).map((chunk, i) => (i % 2 === 1 ? <MentionPill key={i} label={chunk} /> : chunk))}
      </Fragment>
    ),
  );
}

function MessageContent({ content, names, meId }: { content: string; names: Map<string, string>; meId: string }) {
  // split avec groupe capturant : les indices impairs sont les uuid mentionnés
  const parts = content.split(new RegExp(MENTION_RE.source));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <MentionPill key={index} label={`@${names.get(part) ?? "inconnu"}`} self={part === meId} />
    ) : (
      <RichText key={index} text={part} />
    ),
  );
}

function AttachmentView({ attachment, url }: { attachment: ChatAttachment; url?: string }) {
  if (attachment.mime.startsWith("image/") && url) {
    const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : undefined;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.name}
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="max-h-80 max-w-full rounded-lg border border-line object-contain sm:max-w-md"
        />
      </a>
    );
  }
  if (attachment.mime.startsWith("video/") && url) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-96 max-w-full rounded-lg border border-line bg-black sm:max-w-xl"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex w-fit max-w-full items-center gap-3 rounded-lg border border-line bg-elevated px-3 py-2.5 hover:border-faint"
    >
      <FileIcon className="size-7 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[#5fb4ff]">{attachment.name}</span>
        <span className="text-xs text-faint">{formatSize(attachment.size)}</span>
      </span>
      <Download className="size-4 shrink-0 text-faint" />
    </a>
  );
}

export function MessageItem({
  message,
  grouped,
  isMine,
  meId,
  focused,
  canModerate,
  names,
  signedUrls,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  grouped: boolean;
  isMine: boolean;
  meId: string;
  focused: boolean;
  canModerate: boolean;
  names: Map<string, string>;
  signedUrls: Record<string, string>;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (message: ChatMessage) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const name = message.author?.display_name ?? "Inconnu";
  const people = useMemo(() => [...names].map(([id, n]) => ({ id, name: n })), [names]);
  const mentionsMe = message.content.includes(`<@${meId}>`) || MENTIONS_EVERYONE.test(message.content);

  async function saveEdit() {
    const content = encodeMentions(draft.trim(), people);
    setEditing(false);
    if ((content || message.attachments.length) && content !== message.content) await onEdit(message.id, content);
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        "group relative flex gap-4 px-4 py-0.5 hover:bg-black/15",
        !grouped && "mt-4",
        mentionsMe && !isMine && "border-l-2 border-idle bg-idle/[0.06] hover:bg-idle/10",
        focused && "bg-accent/10 ring-1 ring-inset ring-accent/40",
      )}
    >
      <div className="w-10 shrink-0">
        {grouped ? (
          <span suppressHydrationWarning className="invisible block pt-1 text-right text-[11px] text-faint group-hover:visible">
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
                if (event.key === "Escape") setEditing(false);
              }}
              className="w-full resize-none rounded-md bg-elevated px-3 py-2 text-[15px] text-fg outline-none"
              rows={Math.min(8, draft.split("\n").length)}
            />
            <p className="text-xs text-faint">Échap pour annuler · Entrée pour enregistrer</p>
          </div>
        ) : (
          message.content && (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-fg/90">
              <MessageContent content={message.content} names={names} meId={meId} />
              {message.edited_at && <span className="ml-1 text-[11px] text-faint">(modifié)</span>}
            </p>
          )
        )}

        {message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentView key={attachment.id} attachment={attachment} url={signedUrls[attachment.storage_path]} />
            ))}
          </div>
        )}
      </div>

      {!editing && (isMine || canModerate) && (
        <div className="absolute -top-3 right-4 hidden overflow-hidden rounded-md border border-line bg-sidebar shadow-lg group-hover:flex">
          {isMine && (
            <button
              type="button"
              title="Modifier"
              onClick={() => {
                setDraft(readableMentions(message.content, names));
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
            onClick={() => window.confirm("Supprimer ce message ?") && onDelete(message)}
            className="grid size-8 place-items-center text-muted hover:bg-hover hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
