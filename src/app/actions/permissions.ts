"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Permission } from "@/lib/permissions";
import type { FormState } from "./structure";

// La hiérarchie des rôles et "on ne donne que les droits qu'on a" sont vérifiés par la RLS.

const DENIED = "Tu n'as pas la permission de faire ça.";
const FAILED = "Une erreur est survenue. Réessaie.";
const ALL_BITS = Object.values(Permission).reduce((acc, bit) => acc | bit, 0);

function refresh() {
  revalidatePath("/", "layout");
}

function permissionsFrom(formData: FormData) {
  return formData
    .getAll("permissions")
    .map(Number)
    .filter((bit) => Number.isInteger(bit) && (bit & ALL_BITS) === bit)
    .reduce((acc, bit) => acc | bit, 0);
}

function roleError(error: { code?: string }) {
  return error.code === "42501"
    ? "Refusé : le rôle doit rester sous ton rôle le plus haut, sans droits que tu n'as pas."
    : FAILED;
}

// ─── Rôles ──────────────────────────────────────────────────────────────────

const roleSchema = z.object({
  name: z.string().trim().min(1, "Donne un nom au rôle.").max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .transform((v) => v || null),
  position: z.coerce.number().int().min(1, "La position doit être au moins 1.").max(10000),
  hoist: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function createRole(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = roleSchema.extend({ server_id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({ ...parsed.data, permissions: permissionsFrom(formData) });
  if (error) return { error: roleError(error) };
  refresh();
  return { done: Date.now() };
}

export async function updateRole(_: FormState, formData: FormData): Promise<FormState> {
  const isEveryone = formData.get("is_everyone") === "true";
  const schema = isEveryone ? z.object({ id: z.uuid() }) : roleSchema.extend({ id: z.uuid() });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // @everyone : seules ses permissions se modifient
  const { id, ...values } = parsed.data as { id: string } & Record<string, unknown>;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .update({ ...values, permissions: permissionsFrom(formData) })
    .eq("id", id)
    .select("id");
  if (error) return { error: roleError(error) };
  if (!data.length) return { error: DENIED };
  refresh();
  return { done: Date.now() };
}

export async function deleteRole(roleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").delete().eq("id", roleId).select("id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  refresh();
  return {};
}

// ─── Exceptions de permissions d'un salon ───────────────────────────────────

export async function setChannelOverwrite(
  channelId: string,
  targetType: "role" | "member",
  targetId: string,
  allow: number,
  deny: number,
) {
  const parsed = z
    .object({
      channelId: z.uuid(),
      targetType: z.enum(["role", "member"]),
      targetId: z.uuid(),
      allow: z.number().int().min(0),
      deny: z.number().int().min(0),
    })
    .safeParse({ channelId, targetType, targetId, allow: allow & ALL_BITS, deny: deny & ALL_BITS });
  if (!parsed.success) return { error: FAILED };

  const supabase = await createClient();
  const match = { channel_id: channelId, target_type: targetType, target_id: targetId };
  // Rien d'autorisé ni de refusé = on hérite : on supprime l'exception
  const { data, error } =
    parsed.data.allow === 0 && parsed.data.deny === 0
      ? await supabase.from("channel_overwrites").delete().match(match).select("id")
      : await supabase
          .from("channel_overwrites")
          .upsert(
            { ...match, allow: parsed.data.allow, deny: parsed.data.deny },
            { onConflict: "channel_id,target_type,target_id" },
          )
          .select("id");
  if (error) return { error: error.code === "42501" ? DENIED : FAILED };
  if (!data.length && (parsed.data.allow || parsed.data.deny)) return { error: DENIED };
  refresh();
  return {};
}

export async function setClientVisible(channelId: string, visible: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .update({ client_visible: visible })
    .eq("id", channelId)
    .not("project_id", "is", null)
    .select("id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  refresh();
  return {};
}
