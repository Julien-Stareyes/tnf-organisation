// Partagé entre le serveur (premier chargement) et le navigateur (temps réel, historique)

export const MESSAGE_PAGE_SIZE = 50;

export const MESSAGE_COLUMNS =
  "id, channel_id, author_id, content, created_at, edited_at, author:profiles(display_name, avatar_url)";

export type ChatAuthor = {
  display_name: string;
  avatar_url: string | null;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  author: ChatAuthor | null;
};

/** Messages consécutifs du même auteur à moins de 5 min : affichés sans répéter l'en-tête. */
export function isGroupedWith(previous: ChatMessage | undefined, message: ChatMessage) {
  if (!previous || previous.author_id !== message.author_id) return false;
  const gap = new Date(message.created_at).getTime() - new Date(previous.created_at).getTime();
  return gap < 5 * 60 * 1000 && isSameDay(previous.created_at, message.created_at);
}

export function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function formatTime(iso: string) {
  return timeFormat.format(new Date(iso));
}

export function formatDay(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return dayFormat.format(date);
}

export function formatTimestamp(iso: string) {
  return `${formatDay(iso)} à ${formatTime(iso)}`;
}
