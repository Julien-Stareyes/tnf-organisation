"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Salons non lus et mentions, tenus à jour en temps réel pour toute l'application
// (barre latérale, projets, rail des serveurs).

export type UnreadRow = {
  channel_id: string;
  server_id: string;
  project_id: string | null;
  has_unread: boolean;
  mention_count: number;
};

type Entry = { serverId: string; projectId: string | null; unread: boolean; mentions: number };

type UnreadContextValue = {
  channel: (id: string) => { unread: boolean; mentions: number };
  project: (id: string) => { unread: boolean; mentions: number };
  server: (id: string) => { unread: boolean; mentions: number };
  setActiveChannel: (id: string | null) => void;
  markRead: (channelId: string) => void;
};

const EMPTY = { unread: false, mentions: 0 };
const MENTION_TYPES = ["mention", "everyone", "thread_reply"];

const UnreadContext = createContext<UnreadContextValue>({
  channel: () => EMPTY,
  project: () => EMPTY,
  server: () => EMPTY,
  setActiveChannel: () => {},
  markRead: () => {},
});

export const useUnread = () => useContext(UnreadContext);

/** Événement écouté par la cloche pour marquer ses notifications du salon comme lues */
export const CHANNEL_READ_EVENT = "tnf:channel-read";

export function UnreadProvider({ meId, initial, children }: { meId: string; initial: UnreadRow[]; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Map<string, Entry>>(
    () =>
      new Map(
        initial.map((row) => [
          row.channel_id,
          { serverId: row.server_id, projectId: row.project_id, unread: row.has_unread, mentions: row.mention_count },
        ]),
      ),
  );
  const active = useRef<string | null>(null);
  const scopes = useRef(new Map<string, { serverId: string; projectId: string | null }>());
  const readTimers = useRef(new Map<string, number>());

  const markRead = useCallback(
    (channelId: string) => {
      setEntries((current) => {
        if (!current.has(channelId)) return current;
        const next = new Map(current);
        next.delete(channelId);
        return next;
      });
      // Regroupe les écritures quand les messages arrivent en rafale
      window.clearTimeout(readTimers.current.get(channelId));
      readTimers.current.set(
        channelId,
        window.setTimeout(async () => {
          readTimers.current.delete(channelId);
          await Promise.all([
            supabase
              .from("read_states")
              .upsert({ user_id: meId, channel_id: channelId, last_read_at: new Date().toISOString() }, { onConflict: "user_id,channel_id" }),
            supabase
              .from("notifications")
              .update({ read_at: new Date().toISOString() })
              .eq("channel_id", channelId)
              .is("read_at", null)
              .in("type", MENTION_TYPES),
          ]);
          window.dispatchEvent(new CustomEvent(CHANNEL_READ_EVENT, { detail: channelId }));
        }, 800),
      );
    },
    [supabase, meId],
  );

  const setActiveChannel = useCallback(
    (id: string | null) => {
      active.current = id;
      if (id) markRead(id);
    },
    [markRead],
  );

  // Salon d'un message reçu : déjà connu, sinon lu une fois en base (la RLS filtre)
  const scopeOf = useCallback(
    async (channelId: string) => {
      const known = scopes.current.get(channelId);
      if (known) return known;
      const { data } = await supabase.from("channels").select("server_id, project_id").eq("id", channelId).maybeSingle();
      if (!data) return null;
      const scope = { serverId: data.server_id as string, projectId: (data.project_id as string | null) ?? null };
      scopes.current.set(channelId, scope);
      return scope;
    },
    [supabase],
  );

  const bump = useCallback(
    async (channelId: string, kind: "unread" | "mention") => {
      const visibleHere = active.current === channelId && document.visibilityState === "visible";
      if (visibleHere) return markRead(channelId);
      const scope = await scopeOf(channelId);
      if (!scope) return;
      setEntries((current) => {
        const next = new Map(current);
        const entry = next.get(channelId) ?? { ...scope, unread: false, mentions: 0 };
        next.set(channelId, {
          ...entry,
          unread: entry.unread || kind === "unread",
          mentions: entry.mentions + (kind === "mention" ? 1 : 0),
        });
        return next;
      });
    },
    [markRead, scopeOf],
  );

  useEffect(() => {
    initial.forEach((row) => scopes.current.set(row.channel_id, { serverId: row.server_id, projectId: row.project_id }));
  }, [initial]);

  useEffect(() => {
    const channel = supabase
      .channel(`unread:${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
        const message = row as { channel_id: string; author_id: string; thread_id: string | null };
        // Les réponses dans un fil ne rendent pas le salon "non lu" (seules les mentions comptent)
        if (message.author_id !== meId && !message.thread_id) bump(message.channel_id, "unread");
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        ({ new: row }) => {
          const notification = row as { channel_id: string | null; type: string };
          if (notification.channel_id && MENTION_TYPES.includes(notification.type)) bump(notification.channel_id, "mention");
        },
      )
      .subscribe();

    // En revenant sur l'onglet, le salon affiché est considéré comme lu
    const onVisible = () => document.visibilityState === "visible" && active.current && markRead(active.current);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, meId, bump, markRead]);

  const value = useMemo<UnreadContextValue>(() => {
    const sum = (filter: (entry: Entry) => boolean) => {
      let unread = false;
      let mentions = 0;
      entries.forEach((entry) => {
        if (!filter(entry)) return;
        unread ||= entry.unread;
        mentions += entry.mentions;
      });
      return { unread, mentions };
    };
    return {
      channel: (id) => {
        const entry = entries.get(id);
        return entry ? { unread: entry.unread, mentions: entry.mentions } : EMPTY;
      },
      project: (id) => sum((entry) => entry.projectId === id),
      server: (id) => sum((entry) => entry.serverId === id),
      setActiveChannel,
      markRead,
    };
  }, [entries, setActiveChannel, markRead]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

/** Pastille rouge du nombre de mentions */
export function MentionBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={`grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
