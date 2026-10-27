"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessagesSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isGroupedWith, MESSAGE_COLUMNS, type ChatAttachment, type ChatMessage, type ChatReaction } from "@/lib/chat";
import type { Channel } from "@/lib/types";
import { removeMessageFiles, uploadMessageFiles, useSignedUrls } from "./attachments";
import { Composer, type Mentionable } from "./composer";
import { MessageItem } from "./message-item";
import { toggleReaction, withReaction } from "./message-actions";

type Me = { id: string; display_name: string; avatar_url: string | null };

/** Fil de discussion d'un message, ouvert dans un panneau à droite du salon */
export function ThreadPanel({
  rootId,
  channel,
  me,
  names,
  mentionables,
  canSend,
  canAttach,
  canModerate,
  canReact,
  canMentionEveryone,
  focusId,
  onClose,
}: {
  rootId: string;
  channel: Channel;
  me: Me;
  names: Map<string, string>;
  mentionables: Mentionable[];
  canSend: boolean;
  canAttach: boolean;
  canModerate: boolean;
  canReact: boolean;
  canMentionEveryone: boolean;
  focusId: string | null;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [root, setRoot] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  const all = useMemo(() => (root ? [root, ...replies] : replies), [root, replies]);
  const signedUrls = useSignedUrls(all.flatMap((m) => m.attachments.map((a) => a.storage_path)));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("messages").select(MESSAGE_COLUMNS).eq("id", rootId).maybeSingle(),
      supabase.from("messages").select(MESSAGE_COLUMNS).eq("thread_id", rootId).order("created_at").limit(500),
    ]).then(([{ data: rootData }, { data: replyData }]) => {
      if (cancelled) return;
      setRoot(rootData as unknown as ChatMessage | null);
      setReplies((replyData ?? []) as unknown as ChatMessage[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, rootId]);

  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`thread-msg-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, loading]);

  const upsert = useCallback((message: ChatMessage) => {
    setReplies((current) => {
      const index = current.findIndex((m) => m.id === message.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], ...message, author: message.author ?? next[index].author };
        return next;
      }
      return [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const authorOf = useCallback(
    async (authorId: string) => {
      const known = names.get(authorId);
      if (known) return { display_name: known, avatar_url: mentionables.find((m) => m.id === authorId)?.avatar_url ?? null };
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", authorId).maybeSingle();
      return (data as ChatMessage["author"]) ?? { display_name: "Inconnu", avatar_url: null };
    },
    [supabase, names, mentionables],
  );

  // Messages du fil connus, lus par le temps réel sans se réabonner à chaque réponse
  const idsRef = useRef(new Set<string>());
  useEffect(() => {
    idsRef.current = new Set([rootId, ...replies.map((r) => r.id)]);
  }, [rootId, replies]);

  // Temps réel : réponses du fil, leurs pièces jointes et réactions
  useEffect(() => {
    const realtime = supabase
      .channel(`thread:${rootId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${rootId}` }, async ({ new: row }) => {
        const message = row as ChatMessage;
        upsert({ ...message, author: await authorOf(message.author_id), attachments: [], reactions: [] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `thread_id=eq.${rootId}` }, ({ new: row }) => {
        const message = row as ChatMessage;
        setReplies((current) => current.map((m) => (m.id === message.id ? { ...m, content: message.content, edited_at: message.edited_at } : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, ({ old }) => {
        const id = (old as { id: string }).id;
        if (id === rootId) return onClose();
        setReplies((current) => current.filter((m) => m.id !== id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attachments", filter: `channel_id=eq.${channel.id}` }, ({ new: row }) => {
        const attachment = row as ChatAttachment;
        const add = (m: ChatMessage) =>
          m.id === attachment.message_id && !m.attachments.some((a) => a.id === attachment.id)
            ? { ...m, attachments: [...m.attachments, attachment] }
            : m;
        setReplies((current) => current.map(add));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, ({ eventType, new: added, old: removed }) => {
        const reaction = (eventType === "DELETE" ? removed : added) as ChatReaction & { message_id: string };
        if (!idsRef.current.has(reaction.message_id)) return;
        const apply = (list: ChatMessage[]) => withReaction(list, reaction.message_id, reaction, eventType !== "DELETE");
        setReplies(apply);
        setRoot((current) => (current ? apply([current])[0] : current));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(realtime);
    };
  }, [supabase, rootId, channel.id, upsert, authorOf, onClose]);

  async function send(content: string, files: File[]) {
    setError(null);
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({ channel_id: channel.id, author_id: me.id, content, thread_id: rootId })
      .select(MESSAGE_COLUMNS)
      .single();
    if (insertError || !data) {
      setError(
        insertError?.message.includes("mode_lent")
          ? `Mode lent : un message toutes les ${channel.slowmode_seconds} secondes.`
          : "La réponse n'a pas pu être envoyée.",
      );
      return false;
    }
    const message = data as unknown as ChatMessage;
    upsert(message);
    if (files.length) {
      const results = await uploadMessageFiles(supabase, channel.id, message.id, files);
      const ok = results.filter(Boolean) as ChatAttachment[];
      setReplies((current) => current.map((m) => (m.id === message.id ? { ...m, attachments: [...m.attachments, ...ok] } : m)));
      if (ok.length < files.length) setError("Un ou plusieurs fichiers n'ont pas pu être envoyés.");
    }
    return true;
  }

  async function edit(id: string, content: string) {
    const { data } = await supabase.from("messages").update({ content }).eq("id", id).select("id, content, edited_at").single();
    if (data) setReplies((current) => current.map((m) => (m.id === id ? { ...m, ...data } : m)));
  }

  async function remove(message: ChatMessage) {
    await removeMessageFiles(supabase, message.attachments);
    const { error: deleteError } = await supabase.from("messages").delete().eq("id", message.id);
    if (deleteError) return setError("Le message n'a pas pu être supprimé.");
    if (message.id === rootId) return onClose();
    setReplies((current) => current.filter((m) => m.id !== message.id));
  }

  async function react(message: ChatMessage, emoji: string) {
    const mine = message.reactions.some((r) => r.user_id === me.id && r.emoji === emoji);
    const apply = (list: ChatMessage[]) => withReaction(list, message.id, { user_id: me.id, emoji }, !mine);
    setReplies(apply);
    setRoot((current) => (current ? apply([current])[0] : current));
    const { ok } = await toggleReaction(supabase, message, me.id, emoji);
    if (!ok) setError("La réaction n'a pas pu être enregistrée.");
  }

  const itemProps = {
    meId: me.id,
    canModerate,
    canReact,
    names,
    signedUrls,
    onEdit: edit,
    onDelete: remove,
    onToggleReaction: react,
  };

  return (
    <aside
      className="flex w-[420px] shrink-0 flex-col border-l border-line bg-main"
      onDragOver={(event) => canAttach && event.dataTransfer.types.includes("Files") && event.preventDefault()}
      onDrop={(event) => {
        if (!canAttach) return;
        event.preventDefault();
        setDroppedFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <MessagesSquare className="size-4 text-faint" />
        <h2 className="font-semibold">Fil</h2>
        <span className="truncate text-xs text-faint">#{channel.name}</span>
        <button type="button" onClick={onClose} title="Fermer le fil" className="ml-auto text-faint hover:text-fg">
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="grid place-items-center py-10 text-faint">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !root ? (
          <p className="px-4 py-10 text-center text-sm text-faint">Ce message n&apos;existe plus.</p>
        ) : (
          <>
            <div id={`thread-msg-${root.id}`} className="pt-2">
              <MessageItem message={root} grouped={false} isMine={root.author_id === me.id} focused={false} {...itemProps} />
            </div>
            <div className="mx-4 my-3 flex items-center gap-2 text-xs text-faint">
              {replies.length} réponse{replies.length > 1 ? "s" : ""}
              <span className="h-px flex-1 bg-line" />
            </div>
            {replies.map((message, index) => (
              <div key={message.id} id={`thread-msg-${message.id}`}>
                <MessageItem
                  message={message}
                  grouped={isGroupedWith(replies[index - 1], message)}
                  isMine={message.author_id === me.id}
                  focused={message.id === focusId}
                  {...itemProps}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="px-3 pb-3">
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {canSend && root && (
          <Composer
            placeholder="Répondre dans le fil"
            mentionables={mentionables}
            canMentionEveryone={canMentionEveryone}
            canAttach={canAttach}
            droppedFiles={droppedFiles}
            onDroppedFilesTaken={() => setDroppedFiles([])}
            onSend={send}
            onTyping={() => {}}
            onError={setError}
          />
        )}
      </div>
    </aside>
  );
}
