"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Hash, Loader2, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, Permission } from "@/lib/permissions";
import {
  ATTACHMENT_COLUMNS,
  ATTACHMENTS_BUCKET,
  formatDay,
  isGroupedWith,
  isSameDay,
  MESSAGE_COLUMNS,
  MESSAGE_PAGE_SIZE,
  storageSafeName,
  type ChatAttachment,
  type ChatAuthor,
  type ChatMessage,
} from "@/lib/chat";
import type { Channel, Member } from "@/lib/types";
import { Composer, type Mentionable } from "./composer";
import { MessageItem } from "./message-item";

type Me = { id: string; display_name: string; avatar_url: string | null };
type MessageRow = Omit<ChatMessage, "author" | "attachments">;

const TYPING_TTL = 4000;

/** URLs signées (1 h) des fichiers du bucket privé, demandées par lots */
function useSignedUrls(paths: string[]) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const key = paths.join("|");

  useEffect(() => {
    const missing = key.split("|").filter((path) => path && !requested.current.has(path));
    if (!missing.length) return;
    missing.forEach((path) => requested.current.add(path));
    supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (!data) return;
        setUrls((current) => ({
          ...current,
          ...Object.fromEntries(
            data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
          ),
        }));
      });
  }, [supabase, key]);

  return urls;
}

async function imageSize(file: File) {
  if (!file.type.startsWith("image/")) return { width: null, height: null };
  try {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    return { width: null, height: null };
  }
}

export function Chat({
  channel,
  initialMessages,
  initialHasMore,
  initialHasNewer,
  focusMessageId,
  me,
  members,
  permissions,
}: {
  channel: Channel;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** Vrai quand on consulte un ancien message (lien de recherche / notification) */
  initialHasNewer: boolean;
  focusMessageId: string | null;
  me: Me;
  members: Member[];
  permissions: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const authorsRef = useRef(new Map<string, ChatAuthor>());
  const pendingAttachments = useRef(new Map<string, ChatAttachment[]>());

  const canSend = hasPermission(permissions, Permission.SEND_MESSAGES);
  const canAttach = hasPermission(permissions, Permission.ATTACH_FILES);
  const canModerate = hasPermission(permissions, Permission.MANAGE_MESSAGES);
  const canMentionEveryone = hasPermission(permissions, Permission.MENTION_EVERYONE);

  const names = useMemo(() => {
    const map = new Map(members.map((m) => [m.user_id, m.display_name]));
    map.set(me.id, me.display_name);
    return map;
  }, [members, me]);

  const mentionables = useMemo<Mentionable[]>(
    () => members.filter((m) => m.user_id !== me.id).map((m) => ({ id: m.user_id, name: m.display_name, avatar_url: m.avatar_url })),
    [members, me.id],
  );

  const paths = useMemo(() => messages.flatMap((m) => m.attachments.map((a) => a.storage_path)), [messages]);
  const signedUrls = useSignedUrls(paths);

  useEffect(() => {
    const authors = authorsRef.current;
    authors.set(me.id, { display_name: me.display_name, avatar_url: me.avatar_url });
    initialMessages.forEach((m) => m.author && authors.set(m.author_id, m.author));
  }, [initialMessages, me]);

  // Fait défiler jusqu'au message ciblé et le met en évidence
  useEffect(() => {
    if (!focusMessageId) return;
    document.getElementById(`msg-${focusMessageId}`)?.scrollIntoView({ block: "center" });
  }, [focusMessageId]);

  const resolveAuthor = useCallback(
    async (authorId: string) => {
      const cached = authorsRef.current.get(authorId);
      if (cached) return cached;
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", authorId).maybeSingle();
      const author = (data as ChatAuthor | null) ?? { display_name: "Inconnu", avatar_url: null };
      authorsRef.current.set(authorId, author);
      return author;
    },
    [supabase],
  );

  const upsert = useCallback((message: ChatMessage) => {
    const pending = pendingAttachments.current.get(message.id) ?? [];
    pendingAttachments.current.delete(message.id);
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === message.id);
      if (index >= 0) {
        const existing = current[index];
        const attachments = [...existing.attachments];
        [...message.attachments, ...pending].forEach((a) => {
          if (!attachments.some((x) => x.id === a.id)) attachments.push(a);
        });
        const next = [...current];
        next[index] = { ...existing, ...message, author: message.author ?? existing.author, attachments };
        return next;
      }
      const merged = { ...message, attachments: [...message.attachments, ...pending] };
      return [...current, merged].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const addAttachment = useCallback((attachment: ChatAttachment) => {
    setMessages((current) => {
      if (!current.some((m) => m.id === attachment.message_id)) {
        // Le message n'est pas encore arrivé : on garde la pièce jointe de côté
        const list = pendingAttachments.current.get(attachment.message_id) ?? [];
        pendingAttachments.current.set(attachment.message_id, [...list, attachment]);
        return current;
      }
      return current.map((m) =>
        m.id === attachment.message_id && !m.attachments.some((a) => a.id === attachment.id)
          ? { ...m, attachments: [...m.attachments, attachment] }
          : m,
      );
    });
  }, []);

  useEffect(() => {
    const filter = `channel_id=eq.${channel.id}`;
    const realtime = supabase
      .channel(`channel:${channel.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async ({ new: row }) => {
        // En consultation d'anciens messages, on n'ajoute pas les nouveaux après le "trou"
        if (initialHasNewer) return;
        const message = row as MessageRow;
        upsert({ ...message, author: await resolveAuthor(message.author_id), attachments: [] });
        setTyping((current) => {
          const next = { ...current };
          delete next[message.author_id];
          return next;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, ({ new: row }) => {
        const message = row as MessageRow;
        setMessages((current) =>
          current.map((m) => (m.id === message.id ? { ...m, content: message.content, edited_at: message.edited_at } : m)),
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attachments", filter }, ({ new: row }) => {
        addAttachment(row as ChatAttachment);
      })
      // Les suppressions ne sont pas filtrables par salon : on ne reçoit que l'id
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, ({ old }) => {
        const id = (old as { id?: string }).id;
        if (id) setMessages((current) => current.filter((m) => m.id !== id));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { user_id, name } = payload as { user_id: string; name: string };
        if (user_id === me.id) return;
        setTyping((current) => ({ ...current, [user_id]: { name, until: Date.now() + TYPING_TTL } }));
      })
      .subscribe();

    realtimeRef.current = realtime;
    return () => {
      realtimeRef.current = null;
      supabase.removeChannel(realtime);
    };
  }, [supabase, channel.id, me.id, initialHasNewer, resolveAuthor, upsert, addAttachment]);

  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((current) => Object.fromEntries(Object.entries(current).filter(([, t]) => t.until > now)));
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  const lastTypingSent = useRef(0);
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_TTL / 2) return;
    lastTypingSent.current = now;
    realtimeRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: me.id, name: me.display_name },
    });
  }, [me.id, me.display_name]);

  const uploadFiles = useCallback(
    async (messageId: string, files: File[]) => {
      const results = await Promise.all(
        files.map(async (file) => {
          const path = `${channel.id}/${messageId}/${crypto.randomUUID().slice(0, 8)}-${storageSafeName(file.name)}`;
          const { error: uploadError } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, file, { contentType: file.type || "application/octet-stream" });
          if (uploadError) return null;
          const { width, height } = await imageSize(file);
          const { data } = await supabase
            .from("attachments")
            .insert({
              message_id: messageId,
              channel_id: channel.id,
              storage_path: path,
              name: file.name.slice(0, 255) || "fichier",
              mime: file.type || "application/octet-stream",
              size: file.size,
              width,
              height,
            })
            .select(ATTACHMENT_COLUMNS)
            .single();
          return data as ChatAttachment | null;
        }),
      );
      results.forEach((attachment) => attachment && addAttachment(attachment));
      if (results.some((r) => !r)) setError("Un ou plusieurs fichiers n'ont pas pu être envoyés.");
    },
    [supabase, channel.id, addAttachment],
  );

  const send = useCallback(
    async (content: string, files: File[]) => {
      setError(null);
      lastTypingSent.current = 0;
      const { data, error: insertError } = await supabase
        .from("messages")
        .insert({ channel_id: channel.id, author_id: me.id, content })
        .select(MESSAGE_COLUMNS)
        .single();
      if (insertError) {
        setError(
          insertError.message.includes("mode_lent")
            ? `Mode lent : un message toutes les ${channel.slowmode_seconds} secondes.`
            : "Le message n'a pas pu être envoyé.",
        );
        return false;
      }
      upsert(data as unknown as ChatMessage);
      if (files.length) await uploadFiles((data as { id: string }).id, files);
      return true;
    },
    [supabase, channel.id, channel.slowmode_seconds, me.id, upsert, uploadFiles],
  );

  const edit = useCallback(
    async (id: string, content: string) => {
      const { data, error: updateError } = await supabase
        .from("messages")
        .update({ content })
        .eq("id", id)
        .select("id, content, edited_at")
        .single();
      if (updateError || !data) {
        setError("La modification n'a pas pu être enregistrée.");
        return;
      }
      setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...data } : m)));
    },
    [supabase],
  );

  const remove = useCallback(
    async (message: ChatMessage) => {
      if (message.attachments.length) {
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove(message.attachments.map((a) => a.storage_path));
      }
      const { error: deleteError } = await supabase.from("messages").delete().eq("id", message.id);
      if (deleteError) {
        setError("Le message n'a pas pu être supprimé.");
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== message.id));
    },
    [supabase],
  );

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channel.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const rows = (data ?? []) as unknown as ChatMessage[];
    rows.forEach((m) => m.author && authorsRef.current.set(m.author_id, m.author));
    setHasMore(rows.length > MESSAGE_PAGE_SIZE);
    setMessages((current) => [...rows.slice(0, MESSAGE_PAGE_SIZE).reverse(), ...current]);
    setLoadingOlder(false);
  }, [supabase, channel.id, messages, loadingOlder]);

  const typingNames = Object.values(typing).map((t) => t.name);
  const Icon = channel.type === "announcement" ? Megaphone : Hash;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!canAttach || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!canAttach) return;
        event.preventDefault();
        setDragging(false);
        setDroppedFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-main/80 text-lg font-semibold text-accent">
          Dépose tes fichiers pour les envoyer dans #{channel.name}
        </div>
      )}

      {initialHasNewer && (
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="mx-4 mt-3 rounded-lg bg-elevated px-3 py-2 text-left text-sm text-muted hover:text-fg"
        >
          Tu consultes d&apos;anciens messages. <span className="font-semibold text-accent">Revenir aux messages récents →</span>
        </button>
      )}

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
        <div className="pb-4">
          {hasMore ? (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="flex items-center gap-2 rounded-md bg-elevated px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                {loadingOlder && <Loader2 className="size-4 animate-spin" />}
                Charger les messages précédents
              </button>
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-4 pt-10">
              <div className="grid size-16 place-items-center rounded-full bg-elevated">
                <Icon className="size-8 text-fg" />
              </div>
              <h2 className="text-3xl font-bold">Bienvenue dans #{channel.name}</h2>
              <p className="text-muted">{channel.topic ?? "C'est le tout début de ce salon."}</p>
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || !isSameDay(previous.created_at, message.created_at);
            return (
              <div key={message.id}>
                {newDay && (
                  <div className="mx-4 my-4 flex items-center gap-2 text-xs font-semibold text-faint">
                    <span className="h-px flex-1 bg-line" />
                    <span suppressHydrationWarning>{formatDay(message.created_at)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageItem
                  message={message}
                  grouped={!newDay && isGroupedWith(previous, message)}
                  isMine={message.author_id === me.id}
                  meId={me.id}
                  focused={message.id === focusMessageId}
                  canModerate={canModerate}
                  names={names}
                  signedUrls={signedUrls}
                  onEdit={edit}
                  onDelete={remove}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-2">
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {canSend ? (
          <Composer
            placeholder={`Envoyer un message dans #${channel.name}`}
            mentionables={mentionables}
            canMentionEveryone={canMentionEveryone}
            canAttach={canAttach}
            droppedFiles={droppedFiles}
            onDroppedFilesTaken={() => setDroppedFiles([])}
            onSend={send}
            onTyping={notifyTyping}
            onError={setError}
          />
        ) : (
          <div className="rounded-lg bg-elevated px-4 py-3 text-sm text-faint">
            Tu n&apos;as pas la permission d&apos;écrire dans ce salon.
          </div>
        )}
        <p className="h-5 truncate pt-1 text-xs text-muted" aria-live="polite">
          {typingNames.length === 1 && `${typingNames[0]} est en train d'écrire…`}
          {typingNames.length === 2 && `${typingNames[0]} et ${typingNames[1]} écrivent…`}
          {typingNames.length > 2 && "Plusieurs personnes écrivent…"}
        </p>
      </div>
    </div>
  );
}
