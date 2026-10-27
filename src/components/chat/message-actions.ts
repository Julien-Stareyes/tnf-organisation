"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, ChatReaction } from "@/lib/chat";

// Réactions : partagées entre le salon et le panneau de fil

export function withReaction(messages: ChatMessage[], messageId: string, reaction: ChatReaction, add: boolean) {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const others = m.reactions.filter((r) => !(r.user_id === reaction.user_id && r.emoji === reaction.emoji));
    return { ...m, reactions: add ? [...others, reaction] : others };
  });
}

/** Ajoute ou retire la réaction de l'utilisateur ; renvoie false en cas d'échec */
export async function toggleReaction(supabase: SupabaseClient, message: ChatMessage, meId: string, emoji: string) {
  const mine = message.reactions.some((r) => r.user_id === meId && r.emoji === emoji);
  const { error } = mine
    ? await supabase.from("reactions").delete().match({ message_id: message.id, user_id: meId, emoji })
    : await supabase.from("reactions").insert({ message_id: message.id, user_id: meId, emoji });
  return { added: !mine, ok: !error };
}
