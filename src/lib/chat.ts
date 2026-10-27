// Partagé entre le serveur (premier chargement) et le navigateur (temps réel, historique)

export const MESSAGE_PAGE_SIZE = 50;

export const ATTACHMENT_COLUMNS = "id, message_id, channel_id, storage_path, name, mime, size, width, height";

// Clés étrangères nommées : d'autres tables (notifications, réactions…) relient aussi messages et profils,
// l'API exige donc qu'on précise le lien à suivre.
export const MESSAGE_COLUMNS = `id, channel_id, author_id, content, created_at, edited_at, thread_id, thread_count, thread_last_at, author:profiles!messages_author_id_fkey(display_name, avatar_url), attachments!attachments_message_id_fkey(${ATTACHMENT_COLUMNS}), reactions!reactions_message_id_fkey(user_id, emoji)`;

/** Réactions proposées dans le sélecteur */
export const REACTION_EMOJIS = [
  "👍", "❤️", "😂", "🔥", "✅", "👀", "🎉", "🙏",
  "😍", "😮", "😢", "😅", "🤔", "👏", "💯", "🚀",
  "⚡", "🎬", "🎨", "🧊", "❌", "⏳", "📌", "👌",
];

export type ChatReaction = { user_id: string; emoji: string };

/** Réactions regroupées par emoji, dans l'ordre d'apparition */
export function groupReactions(reactions: ChatReaction[]) {
  const groups = new Map<string, string[]>();
  reactions.forEach((r) => groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]));
  return [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

export type ChatAuthor = {
  display_name: string;
  avatar_url: string | null;
};

export type ChatAttachment = {
  id: string;
  message_id: string;
  channel_id: string;
  storage_path: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  /** Message racine si c'est une réponse dans un fil */
  thread_id: string | null;
  thread_count: number;
  thread_last_at: string | null;
  author: ChatAuthor | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
};

// ─── Mentions : stockées "<@uuid>" (comme Discord), affichées "@Nom" ─────────

export const MENTION_RE = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g;

export function mentionToken(userId: string) {
  return `<@${userId}>`;
}

/** "@Julien Lallouche" → "<@uuid>" pour les personnes connues (noms les plus longs d'abord) */
export function encodeMentions(text: string, people: { id: string; name: string }[]) {
  return [...people]
    .sort((a, b) => b.name.length - a.name.length)
    .reduce((result, person) => {
      const escaped = person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return result.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "gu"), mentionToken(person.id));
    }, text);
}

/** Remplace les jetons par des noms lisibles (extraits, notifications, recherche) */
export function readableMentions(content: string, names: Map<string, string>) {
  return content.replace(MENTION_RE, (_, id: string) => `@${names.get(id) ?? "inconnu"}`);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Nom de fichier sûr pour le stockage (accents et espaces retirés) */
export function storageSafeName(name: string) {
  const safe = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(-120);
  return safe || "fichier";
}

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
