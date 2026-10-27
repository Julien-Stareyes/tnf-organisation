import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

/** N'accepte que les chemins internes, pour éviter les redirections ouvertes. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** https://miro.com/app/board/uXjVK.../ → URL d'intégration Live Embed */
export function miroEmbedUrl(boardUrl: string) {
  const match = boardUrl.match(/miro\.com\/app\/board\/([^/?#]+)/);
  return match ? `https://miro.com/app/live-embed/${match[1]}/` : null;
}
