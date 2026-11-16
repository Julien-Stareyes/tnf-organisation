"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MENTION_RE, readableMentions } from "@/lib/chat";

// Recherche plein texte (français) dans tous les pôles ; la RLS ne renvoie que ce que l'utilisateur peut voir.

export type MessageHit = {
  id: string;
  excerpt: string;
  created_at: string;
  author: string;
  avatar_url: string | null;
  server_id: string;
  server_name: string;
  channel_id: string;
  channel_name: string;
  project_id: string | null;
  project_name: string | null;
};

export type CardHit = {
  id: string;
  title: string;
  server_id: string;
  project_id: string;
  project_name: string;
};

export type SearchResults = { messages: MessageHit[]; cards: CardHit[] };

const EMPTY: SearchResults = { messages: [], cards: [] };

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  channel_id: string;
  author: { display_name: string; avatar_url: string | null } | null;
  channel: { name: string; server_id: string; project_id: string | null } | null;
};

/**
 * "rendus lookd" → "(rendus:* | rendu:*) & lookd:*" : recherche par préfixe (pendant la frappe)
 * et tolérance au pluriel, que le stemmer français ne ramène pas toujours au singulier.
 */
function buildTsQuery(query: string) {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? `(${word}:* | ${word.slice(0, -1)}:*)` : `${word}:*`))
    .join(" & ");
}

export async function searchEverywhere(rawQuery: string): Promise<SearchResults> {
  const parsed = z.string().trim().min(2).max(100).safeParse(rawQuery);
  if (!parsed.success) return EMPTY;
  const query = buildTsQuery(parsed.data);
  if (!query) return EMPTY;

  const supabase = await createClient();
  const [{ data: messageData }, { data: projectData }, { data: serverData }] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, content, created_at, channel_id, author:profiles!messages_author_id_fkey(display_name, avatar_url), channel:channels!messages_channel_id_fkey!inner(name, server_id, project_id)",
      )
      .textSearch("search", query, { config: "french" })
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("projects").select("id, name, server_id"),
    supabase.from("servers").select("id, name"),
  ]);

  const projects = new Map((projectData ?? []).map((p) => [p.id as string, { name: p.name as string, serverId: p.server_id as string }]));
  const servers = new Map((serverData ?? []).map((s) => [s.id as string, s.name as string]));
  const messages = (messageData ?? []) as unknown as MessageRow[];

  // Noms des personnes mentionnées, pour des extraits lisibles
  const mentionedIds = [...new Set(messages.flatMap((m) => [...m.content.matchAll(MENTION_RE)].map((x) => x[1])))];
  const { data: mentioned } = mentionedIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", mentionedIds)
    : { data: [] };
  const names = new Map((mentioned ?? []).map((p) => [p.id as string, p.display_name as string]));

  const { data: cardData } = projects.size
    ? await supabase
        .from("board_cards")
        .select("id, title, project_id")
        .in("project_id", [...projects.keys()])
        .textSearch("search", query, { config: "french" })
        .limit(10)
    : { data: [] };

  return {
    messages: messages.map((m) => ({
      id: m.id,
      excerpt: readableMentions(m.content, names).slice(0, 300) || "(pièce jointe)",
      created_at: m.created_at,
      author: m.author?.display_name ?? "Inconnu",
      avatar_url: m.author?.avatar_url ?? null,
      server_id: m.channel?.server_id ?? "",
      server_name: servers.get(m.channel?.server_id ?? "") ?? "",
      channel_id: m.channel_id,
      channel_name: m.channel?.name ?? "",
      project_id: m.channel?.project_id ?? null,
      project_name: m.channel?.project_id ? (projects.get(m.channel.project_id)?.name ?? null) : null,
    })),
    cards: (cardData ?? []).flatMap((c) => {
      const project = projects.get(c.project_id as string);
      return project
        ? [{ id: c.id as string, title: c.title as string, server_id: project.serverId, project_id: c.project_id as string, project_name: project.name }]
        : [];
    }),
  };
}
