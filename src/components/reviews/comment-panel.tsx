"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CornerDownRight, Pencil, Reply, Trash2, Undo2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatTimestamp } from "@/lib/chat";
import { DRAW_COLORS, formatTimecode, type ReviewComment, type Stroke } from "@/lib/reviews";
import { cn } from "@/lib/utils";

type Person = { name: string; avatar_url: string | null };

export function CommentPanel({
  comments,
  people,
  meId,
  isTeam,
  fps,
  isVideoAsset,
  currentTime,
  selectedId,
  drawing,
  drawColor,
  draftStrokes,
  onSelect,
  onSend,
  onToggleResolved,
  onDelete,
  onDrawingChange,
  onDrawColorChange,
  onClearDrawing,
  onComposerFocus,
}: {
  comments: ReviewComment[];
  people: Record<string, Person>;
  meId: string;
  isTeam: boolean;
  fps: number;
  isVideoAsset: boolean;
  currentTime: number;
  selectedId: string | null;
  drawing: boolean;
  drawColor: string;
  draftStrokes: Stroke[];
  onSelect: (comment: ReviewComment) => void;
  onSend: (body: string, options: { withTimecode: boolean; parentId: string | null }) => Promise<boolean>;
  onToggleResolved: (comment: ReviewComment) => void;
  onDelete: (comment: ReviewComment) => void;
  onDrawingChange: (on: boolean) => void;
  onDrawColorChange: (color: string) => void;
  onClearDrawing: () => void;
  onComposerFocus: () => void;
}) {
  const [filter, setFilter] = useState<"open" | "all">("all");
  const [body, setBody] = useState("");
  const [withTimecode, setWithTimecode] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const roots = comments
    .filter((c) => !c.parent_id)
    .filter((c) => filter === "all" || !c.resolved_at)
    .sort((a, b) => (a.timecode ?? -1) - (b.timecode ?? -1) || a.created_at.localeCompare(b.created_at));
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const openCount = comments.filter((c) => !c.parent_id && !c.resolved_at).length;

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    if (await onSend(body.trim(), { withTimecode: isVideoAsset && withTimecode, parentId: null })) setBody("");
    setSending(false);
  }

  async function sendReply(parentId: string) {
    if (!replyBody.trim()) return;
    if (await onSend(replyBody.trim(), { withTimecode: false, parentId })) {
      setReplyBody("");
      setReplyTo(null);
    }
  }

  function CommentRow({ comment, isReply }: { comment: ReviewComment; isReply?: boolean }) {
    const author = people[comment.author_id] ?? { name: "…", avatar_url: null };
    const canDelete = comment.author_id === meId || isTeam;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(comment)}
        className={cn(
          "group rounded-lg p-2.5 transition",
          isReply ? "ml-6" : "",
          selectedId === comment.id ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-hover/50",
          comment.resolved_at && "opacity-50",
        )}
      >
        <div className="flex items-center gap-2">
          {isReply && <CornerDownRight className="size-3.5 text-faint" />}
          <Avatar name={author.name} url={author.avatar_url} className="size-6" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{author.name}</span>
          {comment.timecode !== null && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">
              {formatTimecode(comment.timecode, fps)}
            </span>
          )}
          {comment.drawing?.length ? <Pencil className="size-3.5 text-faint" aria-label="Annotation dessinée" /> : null}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg/90">{comment.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-faint">
          <span suppressHydrationWarning>{formatTimestamp(comment.created_at)}</span>
          <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
            {!isReply && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                }}
                className="flex items-center gap-1 hover:text-fg"
              >
                <Reply className="size-3.5" /> Répondre
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (window.confirm("Supprimer ce commentaire ?")) onDelete(comment);
                }}
                className="hover:text-danger"
                title="Supprimer"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </span>
          {!isReply && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleResolved(comment);
              }}
              title={comment.resolved_at ? "Rouvrir" : "Marquer comme résolu"}
              className={cn("hover:text-online", comment.resolved_at && "text-online")}
            >
              {comment.resolved_at ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-line bg-sidebar">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="flex-1 text-sm font-semibold">
          Commentaires <span className="font-normal text-faint">({openCount} ouvert{openCount > 1 ? "s" : ""})</span>
        </h2>
        <div className="flex rounded-md bg-rail p-0.5 text-xs">
          {(["all", "open"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn("rounded px-2 py-0.5", filter === value ? "bg-hover text-fg" : "text-faint hover:text-fg")}
            >
              {value === "all" ? "Tous" : "Ouverts"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {roots.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-faint">
            {isVideoAsset
              ? "Mets la vidéo en pause sur l'image voulue, puis écris ton retour ci-dessous."
              : "Écris ton retour ci-dessous, en dessinant sur l'image si besoin."}
          </p>
        )}
        {roots.map((comment) => (
          <div key={comment.id} className="space-y-1">
            <CommentRow comment={comment} />
            {repliesOf(comment.id).map((reply) => (
              <CommentRow key={reply.id} comment={reply} isReply />
            ))}
            {replyTo === comment.id && (
              <div className="ml-6 flex gap-2 p-1">
                <input
                  autoFocus
                  value={replyBody}
                  maxLength={4000}
                  onChange={(event) => setReplyBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendReply(comment.id);
                    if (event.key === "Escape") setReplyTo(null);
                  }}
                  placeholder="Répondre…"
                  className="min-w-0 flex-1 rounded-md border border-line bg-rail px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-line p-3">
        <textarea
          rows={3}
          value={body}
          maxLength={4000}
          onFocus={onComposerFocus}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Ton retour sur ce rendu…"
          className="w-full resize-none rounded-md border border-line bg-rail px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          {isVideoAsset && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={withTimecode}
                onChange={(event) => setWithTimecode(event.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
              />
              à <span className="font-mono text-accent">{formatTimecode(currentTime, fps)}</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => onDrawingChange(!drawing)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              drawing ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
            )}
          >
            <Pencil className="size-3.5" />
            Dessiner
          </button>
          {drawing && (
            <>
              {DRAW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => onDrawColorChange(color)}
                  className={cn("size-4 rounded-full", drawColor === color && "ring-2 ring-fg ring-offset-1 ring-offset-sidebar")}
                  style={{ backgroundColor: color }}
                />
              ))}
              {draftStrokes.length > 0 && (
                <button type="button" onClick={onClearDrawing} title="Effacer le dessin" className="text-faint hover:text-fg">
                  <Undo2 className="size-3.5" />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!body.trim() || sending}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
          >
            Commenter
          </button>
        </div>
      </div>
    </aside>
  );
}
