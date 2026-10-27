"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, BellRing, CheckCheck, Clapperboard, KanbanSquare, Megaphone, MessagesSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { CHANNEL_READ_EVENT } from "@/components/unread/unread-provider";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  type: "mention" | "everyone" | "card_assigned" | "review_comment" | "thread_reply";
  server_id: string | null;
  project_id: string | null;
  channel_id: string | null;
  message_id: string | null;
  card_id: string | null;
  review_asset_id: string | null;
  review_comment_id: string | null;
  excerpt: string;
  created_at: string;
  read_at: string | null;
  actor: { display_name: string; avatar_url: string | null } | null;
  channel: { name: string } | null;
  project: { name: string } | null;
};

const COLUMNS =
  "id, type, server_id, project_id, channel_id, message_id, card_id, review_asset_id, review_comment_id, excerpt, created_at, read_at, actor:profiles!notifications_actor_id_fkey(display_name, avatar_url), channel:channels!notifications_channel_id_fkey(name), project:projects!notifications_project_id_fkey(name)";

function linkFor(n: NotificationRow) {
  if (!n.server_id) return null;
  const base = n.project_id ? `/s/${n.server_id}/p/${n.project_id}` : `/s/${n.server_id}`;
  if (n.type === "card_assigned" && n.card_id) return `${base}/board?card=${n.card_id}`;
  if (n.type === "review_comment" && n.review_asset_id) {
    return `${base}/reviews/${n.review_asset_id}${n.review_comment_id ? `?c=${n.review_comment_id}` : ""}`;
  }
  if (n.channel_id) return `${base}/c/${n.channel_id}${n.message_id ? `?m=${n.message_id}` : ""}`;
  return base;
}

function describe(n: NotificationRow) {
  const actor = n.actor?.display_name ?? "Quelqu'un";
  const where = [n.project?.name, n.channel ? `#${n.channel.name}` : null].filter(Boolean).join(" › ");
  if (n.type === "card_assigned") return { title: `${actor} t'a assigné une carte`, where: n.project?.name ?? "" };
  if (n.type === "review_comment") return { title: `${actor} a commenté un rendu`, where: n.project?.name ?? "" };
  if (n.type === "everyone") return { title: `${actor} a mentionné @everyone`, where };
  if (n.type === "thread_reply") return { title: `${actor} a répondu dans un fil`, where };
  return { title: `${actor} t'a mentionné`, where };
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function NotificationBell({ meId }: { meId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  const fetchOne = useCallback(
    async (id: string) => {
      const { data } = await supabase.from("notifications").select(COLUMNS).eq("id", id).maybeSingle();
      return data as unknown as NotificationRow | null;
    },
    [supabase],
  );

  useEffect(() => {
    setBrowserPermission("Notification" in window ? Notification.permission : "unsupported");
    supabase
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => setItems((data ?? []) as unknown as NotificationRow[]));

    const channel = supabase
      .channel(`notifications:${meId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        async ({ new: row }) => {
          const notification = await fetchOne((row as { id: string }).id);
          if (!notification) return;
          setItems((current) => [notification, ...current.filter((n) => n.id !== notification.id)].slice(0, 40));
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            const { title, where } = describe(notification);
            const browserNotification = new Notification(title, { body: [where, notification.excerpt].filter(Boolean).join("\n") });
            browserNotification.onclick = () => {
              window.focus();
              const link = linkFor(notification);
              if (link) router.push(link);
            };
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, meId, fetchOne, router]);

  // Ouvrir un salon marque ses mentions comme lues (voir UnreadProvider)
  useEffect(() => {
    const onChannelRead = (event: Event) => {
      const channelId = (event as CustomEvent<string>).detail;
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((n) => (n.channel_id === channelId && !n.read_at && n.type !== "card_assigned" ? { ...n, read_at: now } : n)),
      );
    };
    window.addEventListener(CHANNEL_READ_EVENT, onChannelRead);
    return () => window.removeEventListener(CHANNEL_READ_EVENT, onChannelRead);
  }, []);

  // Compteur dans l'onglet du navigateur
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  function openNotification(n: NotificationRow) {
    markRead([n.id]);
    setOpen(false);
    const link = linkFor(n);
    if (link) router.push(link);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        title="Notifications"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative grid size-12 place-items-center transition-all",
          open ? "rounded-2xl bg-accent text-accent-fg" : "rounded-3xl bg-elevated text-muted hover:rounded-2xl hover:bg-hover hover:text-fg",
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full border-[3px] border-rail bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-[80px] top-3 z-50 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-xl border border-line bg-sidebar shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <div className="flex items-center gap-1">
              {browserPermission === "default" && (
                <button
                  type="button"
                  title="Recevoir aussi les notifications du navigateur"
                  onClick={async () => setBrowserPermission(await Notification.requestPermission())}
                  className="grid size-8 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
                >
                  <BellRing className="size-4" />
                </button>
              )}
              <button
                type="button"
                title="Tout marquer comme lu"
                disabled={!unread}
                onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
                className="grid size-8 place-items-center rounded text-faint hover:bg-hover hover:text-fg disabled:opacity-30"
              >
                <CheckCheck className="size-4" />
              </button>
            </div>
          </header>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-faint">Rien pour l&apos;instant. Les mentions et cartes assignées arriveront ici.</li>
            )}
            {items.map((n) => {
              const { title, where } = describe(n);
              const Icon =
                n.type === "card_assigned"
                  ? KanbanSquare
                  : n.type === "review_comment"
                    ? Clapperboard
                    : n.type === "thread_reply"
                      ? MessagesSquare
                    : n.type === "everyone"
                      ? Megaphone
                      : AtSign;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      "flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-hover/50",
                      !n.read_at && "bg-accent/[0.04]",
                    )}
                  >
                    <span className="relative shrink-0">
                      <Avatar name={n.actor?.display_name ?? "?"} url={n.actor?.avatar_url ?? null} />
                      <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-sidebar">
                        <Icon className="size-3 text-accent" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                        {!n.read_at && <span className="size-2 shrink-0 rounded-full bg-accent" />}
                      </span>
                      {where && <span className="block truncate text-xs text-faint">{where}</span>}
                      {n.excerpt && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.excerpt}</span>}
                      <span suppressHydrationWarning className="mt-1 block text-[11px] text-faint">
                        {timeFormat.format(new Date(n.created_at))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
