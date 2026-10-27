"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { generateInviteToken, hashInviteToken, inviteUrl, sendInviteEmail } from "@/lib/invitations";
import type { FormState } from "./structure";

const DENIED = "Tu n'as pas la permission de faire ça.";
const FAILED = "Une erreur est survenue. Réessaie.";
const NO_ADMIN_KEY = "Ajoute SUPABASE_SERVICE_ROLE_KEY dans .env.local puis relance le serveur.";

const ORG_ROLES = ["admin", "member", "guest"] as const;
const PROJECT_ROLES = ["lead", "member", "client"] as const;

async function requireOrgAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from("org_members").select("org_role").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (org?.org_role !== "owner" && org?.org_role !== "admin") return null;
  return { supabase, userId: auth.user.id, name: profile?.display_name ?? "Un admin TNF" };
}

function refresh() {
  revalidatePath("/", "layout");
}

// ─── Invitations ────────────────────────────────────────────────────────────

export type InviteState = FormState & { link?: string; emailSent?: boolean; email?: string };

export async function createInvitation(_: InviteState, formData: FormData): Promise<InviteState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { error: DENIED };

  const parsed = z
    .object({
      email: z.email("Adresse e-mail invalide.").transform((v) => v.trim().toLowerCase()),
      org_role: z.enum(ORG_ROLES),
    })
    .safeParse({ email: formData.get("email"), org_role: formData.get("org_role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const serverIds = z.array(z.uuid()).safeParse(formData.getAll("server_ids"));
  if (!serverIds.success) return { error: "Sélection de serveurs invalide." };

  // Champs "project:<id>" = rôle dans le projet (vide = non affecté)
  const projectAssignments: { project_id: string; project_role: (typeof PROJECT_ROLES)[number] }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("project:") || !value) continue;
    const projectId = z.uuid().safeParse(key.slice("project:".length));
    const role = z.enum(PROJECT_ROLES).safeParse(value);
    if (projectId.success && role.success) {
      projectAssignments.push({ project_id: projectId.data, project_role: role.data });
    }
  }

  const { email, org_role } = parsed.data;

  // Une seule invitation active par adresse
  await admin.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = generateInviteToken();
  const { error } = await admin.supabase.from("invitations").insert({
    email,
    org_role,
    token_hash: hashInviteToken(token),
    server_ids: serverIds.data,
    project_assignments: projectAssignments,
    invited_by: admin.userId,
  });
  if (error) return { error: error.code === "42501" ? DENIED : FAILED };

  const link = inviteUrl(token);
  const emailSent = await sendInviteEmail({ to: email, inviterName: admin.name, url: link }).catch(() => false);

  refresh();
  return { done: Date.now(), link, emailSent, email };
}

export async function revokeInvitation(invitationId: string) {
  const admin = await requireOrgAdmin();
  if (!admin) return { error: DENIED };
  const { error } = await admin.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) return { error: FAILED };
  refresh();
  return {};
}

const acceptSchema = z
  .object({
    token: z.string().min(20),
    display_name: z.string().trim().min(1, "Indique ton nom.").max(80),
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères.").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas." });

export async function acceptInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!hasAdminKey()) return { error: "Invitations indisponibles : configuration serveur incomplète." };

  const { token, display_name, password } = parsed.data;
  const tokenHash = hashInviteToken(token);
  const adminClient = createAdminClient();

  const { data: invitation } = await adminClient
    .from("invitations")
    .select("email")
    .eq("token_hash", tokenHash)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!invitation) return { error: "Cette invitation est invalide ou a expiré." };

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });
  if (createError || !created.user) {
    return {
      error:
        createError?.code === "email_exists"
          ? "Un compte existe déjà pour cette adresse : connecte-toi directement."
          : createError?.code === "weak_password"
            ? "Mot de passe refusé : choisis-en un plus long."
            : FAILED,
    };
  }

  const { error: acceptError } = await adminClient.rpc("accept_invitation", {
    p_token_hash: tokenHash,
    p_user: created.user.id,
  });
  if (acceptError) {
    // Pas de compte orphelin si l'acceptation échoue
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { error: "Cette invitation est invalide ou a expiré." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: invitation.email, password });
  redirect("/");
}

// ─── Membres de l'organisation ──────────────────────────────────────────────

export async function updateOrgRole(userId: string, role: string) {
  const admin = await requireOrgAdmin();
  const parsedRole = z.enum(ORG_ROLES).safeParse(role);
  if (!admin || !parsedRole.success || userId === admin.userId) return { error: DENIED };

  const { data, error } = await admin.supabase
    .from("org_members")
    .update({ org_role: parsedRole.data })
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  refresh();
  return {};
}

/** Retire tout accès : compte bloqué, appartenances supprimées. Ses messages restent. */
export async function removeOrgMember(userId: string) {
  const admin = await requireOrgAdmin();
  if (!admin || userId === admin.userId) return { error: DENIED };
  if (!hasAdminKey()) return { error: NO_ADMIN_KEY };

  const adminClient = createAdminClient();
  const { data: target } = await adminClient.from("org_members").select("org_role").eq("user_id", userId).maybeSingle();
  if (target?.org_role === "owner") return { error: "Impossible de retirer l'owner." };

  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banError) return { error: FAILED };
  await adminClient.from("project_members").delete().eq("user_id", userId);
  await adminClient.from("server_members").delete().eq("user_id", userId);
  await adminClient.from("org_members").delete().eq("user_id", userId);

  refresh();
  return {};
}

// ─── Membres d'un projet ────────────────────────────────────────────────────

export async function addProjectMember(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ project_id: z.uuid(), user_id: z.uuid("Choisis une personne."), project_role: z.enum(PROJECT_ROLES) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("project_members").insert({ ...parsed.data, added_by: auth.user?.id });
  if (error) return { error: error.code === "42501" ? DENIED : error.code === "23505" ? "Déjà membre du projet." : FAILED };
  refresh();
  return { done: Date.now() };
}

export async function updateProjectMemberRole(projectId: string, userId: string, role: string) {
  const parsedRole = z.enum(PROJECT_ROLES).safeParse(role);
  if (!parsedRole.success) return { error: DENIED };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .update({ project_role: parsedRole.data })
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  refresh();
  return {};
}

export async function removeProjectMember(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };
  refresh();
  return {};
}

// ─── Membres & rôles d'un serveur ───────────────────────────────────────────

export async function addServerMember(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ server_id: z.uuid(), user_id: z.uuid("Choisis une personne.") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("server_members").insert(parsed.data);
  if (error) return { error: error.code === "42501" ? DENIED : error.code === "23505" ? "Déjà membre du serveur." : FAILED };
  refresh();
  return { done: Date.now() };
}

export async function removeServerMember(serverId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data.length) return { error: error ? FAILED : DENIED };

  // Retire aussi ses affectations aux projets de ce serveur
  const { data: projects } = await supabase.from("projects").select("id").eq("server_id", serverId);
  if (projects?.length) {
    await supabase
      .from("project_members")
      .delete()
      .eq("user_id", userId)
      .in(
        "project_id",
        projects.map((p) => p.id),
      );
  }
  refresh();
  return {};
}

export async function setMemberRole(serverId: string, userId: string, roleId: string, enabled: boolean) {
  const supabase = await createClient();
  const query = enabled
    ? supabase.from("member_roles").insert({ server_id: serverId, user_id: userId, role_id: roleId }).select("role_id")
    : supabase.from("member_roles").delete().eq("user_id", userId).eq("role_id", roleId).select("role_id");
  const { data, error } = await query;
  const aboveMine = "Ce rôle est au-dessus du tien : impossible.";
  if (error) return { error: error.code === "42501" ? aboveMine : FAILED };
  if (!data.length) return { error: aboveMine };
  refresh();
  return {};
}
