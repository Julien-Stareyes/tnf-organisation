"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// La base (RLS) décide qui a le droit : ces actions valident les données et traduisent les refus.

export type FormState = { error?: string; href?: string; done?: number };

const DENIED = "Tu n'as pas la permission de faire ça.";
const FAILED = "Une erreur est survenue. Réessaie.";

const uuid = z.uuid();
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional()
  .transform((v) => v || null);

function parse<T extends z.ZodType>(schema: T, formData: FormData) {
  return schema.safeParse(Object.fromEntries(formData));
}

function invalid(result: { error: z.ZodError }): FormState {
  return { error: result.error.issues[0]?.message ?? "Formulaire invalide." };
}

function dbError(error: { code?: string }): FormState {
  return { error: error.code === "42501" ? DENIED : FAILED };
}

function done(href?: string): FormState {
  revalidatePath("/", "layout");
  return { done: Date.now(), href };
}

/** "Lookdev Final !" → "lookdev-final" (accents conservés, comme Discord) */
function channelSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

async function nextPosition(
  table: "servers" | "projects" | "categories" | "channels",
  scope: Record<string, string | null>,
) {
  const supabase = await createClient();
  let query = supabase.from(table).select("position").order("position", { ascending: false }).limit(1);
  for (const [column, value] of Object.entries(scope)) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data } = await query;
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1;
}

// ─── Serveurs ───────────────────────────────────────────────────────────────

const serverSchema = z.object({
  name: z.string().trim().min(1, "Donne un nom au serveur.").max(100),
  pole: z.enum(["general", "cgi", "ue5", "webgl"]),
});

export async function createServer(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(serverSchema, formData);
  if (!parsed.success) return invalid(parsed);

  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: DENIED };

  const { data, error } = await supabase
    .from("servers")
    .insert({ ...parsed.data, owner_id: userId, position: await nextPosition("servers", {}) })
    .select("id")
    .single();
  if (error) return dbError(error);
  return done(`/s/${data.id}`);
}

export async function updateServer(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(serverSchema.extend({ id: uuid }), formData);
  if (!parsed.success) return invalid(parsed);

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("servers").update(values).eq("id", id).select("id");
  if (error) return dbError(error);
  if (!data.length) return { error: DENIED };
  return done();
}

export async function deleteServer(serverId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("servers").delete().eq("id", serverId).select("id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  revalidatePath("/", "layout");
  redirect("/");
}

// ─── Projets ────────────────────────────────────────────────────────────────

const projectFields = {
  name: z.string().trim().min(1, "Donne un nom au projet.").max(100),
  client_name: optionalText(100),
  color,
};

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(z.object({ server_id: uuid, ...projectFields }), formData);
  if (!parsed.success) return invalid(parsed);

  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: DENIED };

  // Le créateur devient lead : il est donc affecté au projet et le voit
  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      lead_id: userId,
      position: await nextPosition("projects", { server_id: parsed.data.server_id }),
    })
    .select("id, server_id")
    .single();
  if (error) return dbError(error);
  return done(`/s/${data.server_id}/p/${data.id}`);
}

const projectUpdateSchema = z.object({
  id: uuid,
  ...projectFields,
  status: z.enum(["active", "delivered", "archived"]),
});

export async function updateProject(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(projectUpdateSchema, formData);
  if (!parsed.success) return invalid(parsed);

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update(values).eq("id", id).select("id");
  if (error) return dbError(error);
  if (!data.length) return { error: DENIED };
  return done();
}

// ─── Catégories & salons ────────────────────────────────────────────────────

export async function createCategory(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(
    z.object({
      server_id: uuid,
      project_id: optionalUuid,
      name: z.string().trim().min(1, "Donne un nom à la catégorie.").max(100),
    }),
    formData,
  );
  if (!parsed.success) return invalid(parsed);

  const { server_id, project_id } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    ...parsed.data,
    position: await nextPosition("categories", { server_id, project_id }),
  });
  if (error) return dbError(error);
  return done();
}

const channelFields = {
  name: z
    .string()
    .transform(channelSlug)
    .pipe(z.string().min(1, "Donne un nom au salon (lettres, chiffres, tirets).").max(100)),
  type: z.enum(["text", "announcement"]),
  category_id: optionalUuid,
  topic: optionalText(1024),
};

export async function createChannel(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(z.object({ server_id: uuid, project_id: optionalUuid, ...channelFields }), formData);
  if (!parsed.success) return invalid(parsed);

  const { server_id, project_id, category_id } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .insert({ ...parsed.data, position: await nextPosition("channels", { server_id, project_id, category_id }) })
    .select("id")
    .single();
  if (error) return dbError(error);

  const base = project_id ? `/s/${server_id}/p/${project_id}` : `/s/${server_id}`;
  return done(`${base}/c/${data.id}`);
}

export async function updateChannel(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(
    z.object({
      id: uuid,
      ...channelFields,
      slowmode_seconds: z.coerce.number().int().min(0).max(21600),
    }),
    formData,
  );
  if (!parsed.success) return invalid(parsed);

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").update(values).eq("id", id).select("id");
  if (error) return dbError(error);
  if (!data.length) return { error: DENIED };
  return done();
}

export async function deleteChannel(channelId: string, redirectTo: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").delete().eq("id", channelId).select("id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  revalidatePath("/", "layout");
  redirect(redirectTo);
}
