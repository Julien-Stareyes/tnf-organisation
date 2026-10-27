"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Hash, Loader2, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, Permission } from "@/lib/permissions";
import {
  formatDay,
  isGroupedWith,
  isSameDay,
  MESSAGE_COLUMNS,
  MESSAGE_PAGE_SIZE,
  type ChatAuthor,
  type ChatMessage,
} from "@/lib/chat";
import type { Channel } from "@/lib/types";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";

type Me = { id: string; display_name: string; avatar_url: string | null };
type MessageRow = Omit<ChatMessage, "author">;

const TYPING_TTL = 4000;

export function Chat({
  channel,
  initialMessages,
  initialHasMore,
  me,
  permissions,
}: {
  channel: Channel;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  me: Me;
  permissions: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const authorsRef = useRef(new Map<string, ChatAuthor>());

  const canSend = hasPermission(permissions, Permission.SEND_MESSAGES);
  const canModerate = hasPermission(permissions, Permission.MANAGE_MESSAGES);

  // Cache des auteurs, pour afficher les messages reçus en temps réel sans requête à chaque fois
  useEffect(() => {
    const authors = authorsRef.current;
    authors.set(me.id, { display_name: me.display_name, avatar_url: me.avatar_url });
    initialMessages.forEach((m) => m.author && authors.set(m.author_id, m.author));
  }, [initialMessages, me]);

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
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === message.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], ...message, author: message.author ?? next[index].author };
        return next;
      }
      return [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  useEffect(() => {
    const realtime = supabase
      .channel(`channel:${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` },
        async ({ new: row }) => {
          const message = row as MessageRow;
          upsert({ ...message, author: await resolveAuthor(message.author_id) });
          setTyping((current) => {
            const next = { ...current };
            delete next[message.author_id];
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` },
        ({ new: row }) => {
          const message = row as MessageRow;
          setMessages((current) =>
            current.map((m) => (m.id === message.id ? { ...m, content: message.content, edited_at: message.edited_at } : m)),
          );
        },
      )
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
  }, [supabase, channel.id, me.id, resolveAuthor, upsert]);

  // Nettoie les indicateurs "en train d'écrire" expirés
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

  const send = useCallback(
    async (content: string) => {
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
      return true;
    },
    [supabase, channel.id, channel.slowmode_seconds, me.id, upsert],
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
    async (id: string) => {
      const { error: deleteError } = await supabase.from("messages").delete().eq("id", id);
      if (deleteError) {
        setError("Le message n'a pas pu être supprimé.");
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== id));
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* column-reverse : la vue reste collée au dernier message */}
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
                  canModerate={canModerate}
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
          <Composer placeholder={`Envoyer un message dans #${channel.name}`} onSend={send} onTyping={notifyTyping} />
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
