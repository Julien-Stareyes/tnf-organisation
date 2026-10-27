import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, type ChatMessage } from "@/lib/chat";
import { CARD_COLUMNS, type BoardCard, type BoardColumn, type BoardLabel } from "@/lib/board";
import type { UnreadRow } from "@/components/unread/unread-provider";
import {
  COMMENT_COLUMNS,
  isImage,
  REVIEWS_BUCKET,
  VERSION_COLUMNS,
  type ReviewAsset,
  type ReviewComment,
  type ReviewVersion,
} from "@/lib/reviews";
import type {
  AuditEntry,
  ChannelOverwrite,
  RoleDetail,
  Category,
  Channel,
  ChannelTree,
  Member,
  MemberGroup,
  OrgMember,
  OrgRole,
  PendingInvitation,
  Profile,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectSummary,
  Role,
  ServerMember,
  ServerSummary,
  ServerWithProjects,
} from "@/lib/types";

// Toutes les lectures passent par le client "utilisateur" : la RLS filtre ce qui n'est pas autorisé.
// Un élément invisible renvoie null → la page affiche un 404, même si on tape l'URL à la main.

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export const getMe = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, status").eq("id", user.id).maybeSingle(),
    supabase.from("org_members").select("org_role").eq("user_id", user.id).maybeSingle(),
  ]);
  return {
    email: user.email ?? "",
    profile: profile as Profile | null,
    orgRole: (org?.org_role ?? null) as OrgRole | null,
  };
});

export const getMyServers = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("servers")
    .select("id, name, icon_url, pole, position")
    .is("archived_at", null)
    .order("position");
  return (data ?? []) as ServerSummary[];
});

export const getServer = cache(async (serverId: string) => {
  if (!isUuid(serverId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("servers")
    .select("id, name, icon_url, pole, position")
    .eq("id", serverId)
    .maybeSingle();
  return data as ServerSummary | null;
});

export const getProject = cache(async (projectId: string) => {
  if (!isUuid(projectId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, server_id, name, client_name, client_logo_url, color, status, position, lead_id",
    )
    .eq("id", projectId)
    .maybeSingle();
  return data as Project | null;
});

export const getChannel = cache(async (channelId: string) => {
  if (!isUuid(channelId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("channels")
    .select("id, server_id, project_id, category_id, name, type, topic, position, slowmode_seconds, client_visible")
    .eq("id", channelId)
    .maybeSingle();
  return data as Channel | null;
});

const CHANNEL_COLUMNS =
  "id, server_id, project_id, category_id, name, type, topic, position, slowmode_seconds, client_visible";

/**
 * Salons du serveur (hors projets) + projets auxquels l'utilisateur est affecté.
 * includeEmpty : garde les catégories vides (pour ceux qui peuvent y créer des salons).
 */
export const getServerTree = cache(async (serverId: string, includeEmpty = false) => {
  const supabase = await createClient();
  const [{ data: categories }, { data: channels }, { data: projects }] = await Promise.all([
    supabase.from("categories").select("id, name, position").eq("server_id", serverId).is("project_id", null).order("position"),
    supabase.from("channels").select(CHANNEL_COLUMNS).eq("server_id", serverId).is("project_id", null).order("position"),
    supabase
      .from("projects")
      .select("id, name, client_name, color, status, position")
      .eq("server_id", serverId)
      .neq("status", "archived")
      .order("position"),
  ]);
  return {
    tree: buildTree((categories ?? []) as Category[], (channels ?? []) as Channel[], includeEmpty),
    projects: (projects ?? []) as ProjectSummary[],
  };
});

export const getProjectTree = cache(async (projectId: string, includeEmpty = false) => {
  const supabase = await createClient();
  const [{ data: categories }, { data: channels }] = await Promise.all([
    supabase.from("categories").select("id, name, position").eq("project_id", projectId).order("position"),
    supabase.from("channels").select(CHANNEL_COLUMNS).eq("project_id", projectId).order("position"),
  ]);
  return buildTree((categories ?? []) as Category[], (channels ?? []) as Channel[], includeEmpty);
});

export async function getMyUnread() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unread");
  return (data ?? []) as UnreadRow[];
}

/**
 * Lien vers un message (?m=) : si c'est une réponse dans un fil, on cible le message racine
 * dans le salon et on ouvre le fil sur la réponse.
 */
export async function resolveMessageTarget(channelId: string, messageId: string | undefined) {
  if (!messageId || !isUuid(messageId)) return { focusId: undefined, threadId: undefined, threadFocusId: undefined };
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, thread_id")
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!data) return { focusId: undefined, threadId: undefined, threadFocusId: undefined };
  return data.thread_id
    ? { focusId: data.thread_id as string, threadId: data.thread_id as string, threadFocusId: data.id as string }
    : { focusId: data.id as string, threadId: undefined, threadFocusId: undefined };
}

export async function getRecentMessages(channelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("channel_id", channelId)
    .is("thread_id", null)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);
  const rows = (data ?? []) as unknown as ChatMessage[];
  return {
    messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(),
    hasMore: rows.length > MESSAGE_PAGE_SIZE,
    hasNewer: false,
  };
}

/** Messages autour d'un message précis (lien depuis la recherche ou une notification) */
export async function getMessagesAround(channelId: string, messageId: string) {
  if (!isUuid(messageId)) return null;
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("messages")
    .select("created_at")
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!target) return null;

  const half = MESSAGE_PAGE_SIZE / 2;
  const [{ data: before }, { data: after }] = await Promise.all([
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .is("thread_id", null)
      .lte("created_at", target.created_at)
      .order("created_at", { ascending: false })
      .limit(half + 1),
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .is("thread_id", null)
      .gt("created_at", target.created_at)
      .order("created_at", { ascending: true })
      .limit(half + 1),
  ]);
  const older = (before ?? []) as unknown as ChatMessage[];
  const newer = (after ?? []) as unknown as ChatMessage[];
  return {
    messages: [...older.slice(0, half).reverse(), ...newer.slice(0, half)],
    hasMore: older.length > half,
    hasNewer: newer.length > half,
  };
}

export function firstChannel(tree: ChannelTree) {
  return tree.uncategorized[0] ?? tree.categories.find((c) => c.channels.length > 0)?.channels[0] ?? null;
}

function buildTree(categories: Category[], channels: Channel[], includeEmpty: boolean): ChannelTree {
  return {
    uncategorized: channels.filter((ch) => !ch.category_id),
    categories: categories
      .map((cat) => ({ ...cat, channels: channels.filter((ch) => ch.category_id === cat.id) }))
      // Comme Discord : une catégorie dont on ne voit aucun salon est masquée
      .filter((cat) => includeEmpty || cat.channels.length > 0),
  };
}

export async function getMyPermissions(scope: { serverId: string; projectId?: string; channelId?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_permissions", {
    p_server: scope.serverId,
    p_project: scope.projectId ?? null,
    p_channel: scope.channelId ?? null,
  });
  return (data ?? 0) as number;
}

type ProfileJoin = { display_name: string; avatar_url: string | null; status: Member["status"] } | null;

function toMember(userId: string, profile: ProfileJoin): Member {
  return {
    user_id: userId,
    display_name: profile?.display_name ?? "Inconnu",
    avatar_url: profile?.avatar_url ?? null,
    status: profile?.status ?? "offline",
  };
}

export async function getServerMemberGroups(serverId: string): Promise<MemberGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("server_members")
    .select("user_id, profiles(display_name, avatar_url, status)")
    .eq("server_id", serverId);
  const members = (data ?? []).map((row) =>
    toMember(row.user_id as string, row.profiles as unknown as ProfileJoin),
  );
  return groupByPresence(members);
}

const PROJECT_ROLE_TITLES: Record<ProjectRole, string> = {
  lead: "Leads",
  member: "Équipe",
  client: "Clients",
};

export async function getProjectMemberGroups(projectId: string): Promise<MemberGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("user_id, project_role, profiles!project_members_user_id_fkey(display_name, avatar_url, status)")
    .eq("project_id", projectId);
  const rows = data ?? [];
  return (Object.keys(PROJECT_ROLE_TITLES) as ProjectRole[])
    .map((role) => ({
      title: PROJECT_ROLE_TITLES[role],
      members: sortMembers(
        rows
          .filter((row) => row.project_role === role)
          .map((row) => toMember(row.user_id as string, row.profiles as unknown as ProfileJoin)),
      ),
    }))
    .filter((group) => group.members.length > 0);
}

// ─── Administration & gestion des membres ───────────────────────────────────

export async function getOrgMembers(): Promise<OrgMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("user_id, org_role, profiles(display_name, avatar_url, status)")
    .order("joined_at");
  return sortMembers(
    (data ?? []).map((row) => ({
      ...toMember(row.user_id as string, row.profiles as unknown as ProfileJoin),
      org_role: row.org_role as OrgRole,
    })),
  );
}

/** Ajoute les e-mails (visibles uniquement côté admin, via la clé service_role). */
export async function withEmails(members: OrgMember[]): Promise<OrgMember[]> {
  if (!hasAdminKey()) return members;
  const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const emails = new Map(data.users.map((u) => [u.id, u.email]));
  return members.map((m) => ({ ...m, email: emails.get(m.user_id) ?? undefined }));
}

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("id, email, org_role, expires_at, created_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []) as PendingInvitation[];
}

export async function getServersWithProjects(): Promise<ServerWithProjects[]> {
  const supabase = await createClient();
  const [servers, { data: projects }] = await Promise.all([
    getMyServers(),
    supabase.from("projects").select("id, server_id, name, client_name, color, status, position").order("position"),
  ]);
  return servers.map((server) => ({
    ...server,
    projects: ((projects ?? []) as Project[]).filter((p) => p.server_id === server.id),
  }));
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("user_id, project_role, profiles!project_members_user_id_fkey(display_name, avatar_url, status)")
    .eq("project_id", projectId);
  return sortMembers(
    (data ?? []).map((row) => ({
      ...toMember(row.user_id as string, row.profiles as unknown as ProfileJoin),
      project_role: row.project_role as ProjectRole,
    })),
  );
}

export async function getServerRoles(serverId: string): Promise<Role[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, name, color, position")
    .eq("server_id", serverId)
    .eq("is_everyone", false)
    .order("position", { ascending: false });
  return (data ?? []) as Role[];
}

export async function getServerMembersWithRoles(serverId: string): Promise<ServerMember[]> {
  const supabase = await createClient();
  const [{ data: members }, { data: memberRoles }] = await Promise.all([
    supabase.from("server_members").select("user_id, profiles(display_name, avatar_url, status)").eq("server_id", serverId),
    supabase.from("member_roles").select("user_id, role_id").eq("server_id", serverId),
  ]);
  return sortMembers(
    (members ?? []).map((row) => ({
      ...toMember(row.user_id as string, row.profiles as unknown as ProfileJoin),
      role_ids: (memberRoles ?? []).filter((mr) => mr.user_id === row.user_id).map((mr) => mr.role_id as string),
    })),
  );
}

export async function getRoleDetails(serverId: string): Promise<RoleDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, name, color, position, permissions, hoist, is_everyone")
    .eq("server_id", serverId)
    .order("position", { ascending: false });
  return (data ?? []) as RoleDetail[];
}

export async function getChannelOverwrites(channelId: string): Promise<ChannelOverwrite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("channel_overwrites")
    .select("target_type, target_id, allow, deny")
    .eq("channel_id", channelId);
  return (data ?? []) as ChannelOverwrite[];
}

export async function getAuditLog(serverId: string, limit = 100): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, target_type, changes, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.display_name as string]));
  return rows.map((row) => ({
    id: row.id as number,
    actor_name: row.actor_id ? (names.get(row.actor_id) ?? "Quelqu'un") : null,
    action: row.action as AuditEntry["action"],
    target_type: row.target_type as string,
    changes: row.changes as AuditEntry["changes"],
    created_at: row.created_at as string,
  }));
}

// ─── Kanban & tableau blanc ─────────────────────────────────────────────────

export const getMyProjectRole = cache(async (projectId: string) => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("project_role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.project_role ?? null) as ProjectRole | null;
});

export async function getBoard(projectId: string) {
  const supabase = await createClient();
  const [{ data: columns }, { data: cards }, { data: labels }] = await Promise.all([
    supabase.from("board_columns").select("id, project_id, name, color, position").eq("project_id", projectId).order("position"),
    supabase.from("board_cards").select(CARD_COLUMNS).eq("project_id", projectId).order("position"),
    supabase.from("board_labels").select("id, project_id, name, color").eq("project_id", projectId).order("name"),
  ]);
  return {
    columns: (columns ?? []) as BoardColumn[],
    cards: (cards ?? []) as BoardCard[],
    labels: (labels ?? []) as BoardLabel[],
  };
}

export async function getWhiteboardElements(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("whiteboards").select("elements").eq("project_id", projectId).maybeSingle();
  return (data?.elements ?? []) as unknown[];
}

// ─── Revue des rendus ───────────────────────────────────────────────────────

const SIGNED_URL_TTL = 6 * 3600;

export async function getReviewAssets(projectId: string) {
  const supabase = await createClient();
  const [{ data: assets }, { data: versions }, { data: comments }] = await Promise.all([
    supabase
      .from("review_assets")
      .select("id, project_id, title, status, created_by, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase.from("review_versions").select(VERSION_COLUMNS).eq("project_id", projectId).order("version", { ascending: false }),
    supabase.from("review_comments").select("asset_id").eq("project_id", projectId).is("resolved_at", null),
  ]);
  const openComments = new Map<string, number>();
  (comments ?? []).forEach((c) => openComments.set(c.asset_id, (openComments.get(c.asset_id) ?? 0) + 1));
  const allVersions = (versions ?? []) as ReviewVersion[];
  const latest = new Map<string, ReviewVersion>();
  allVersions.forEach((v) => !latest.has(v.asset_id) && latest.set(v.asset_id, v));

  const thumbPaths = [...latest.values()].map((v) => v.thumbnail_path ?? (isImage(v.mime) ? v.storage_path : null));
  const signed = await signReviewPaths(thumbPaths.filter(Boolean) as string[]);

  // Un rendu sans version (envoi interrompu) n'a rien à afficher
  return ((assets ?? []) as ReviewAsset[]).filter((asset) => latest.has(asset.id)).map((asset) => {
    const version = latest.get(asset.id) ?? null;
    const thumb = version ? (version.thumbnail_path ?? (isImage(version.mime) ? version.storage_path : null)) : null;
    return {
      asset,
      version,
      versionCount: allVersions.filter((v) => v.asset_id === asset.id).length,
      thumbnailUrl: thumb ? (signed.get(thumb) ?? null) : null,
      openComments: openComments.get(asset.id) ?? 0,
    };
  });
}

export async function getReviewAsset(assetId: string) {
  if (!isUuid(assetId)) return null;
  const supabase = await createClient();
  const [{ data: asset }, { data: versions }] = await Promise.all([
    supabase.from("review_assets").select("id, project_id, title, status, created_by, updated_at").eq("id", assetId).maybeSingle(),
    supabase.from("review_versions").select(VERSION_COLUMNS).eq("asset_id", assetId).order("version", { ascending: false }),
  ]);
  if (!asset) return null;
  return { asset: asset as ReviewAsset, versions: (versions ?? []) as ReviewVersion[] };
}

export async function getReviewComments(versionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("review_comments")
    .select(COMMENT_COLUMNS)
    .eq("version_id", versionId)
    .order("created_at");
  return (data ?? []) as ReviewComment[];
}

export async function getProfilesByIds(ids: string[]) {
  const unique = [...new Set(ids)].filter(isUuid);
  if (!unique.length) return [] as { id: string; display_name: string; avatar_url: string | null }[];
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", unique);
  return (data ?? []) as { id: string; display_name: string; avatar_url: string | null }[];
}

/** URLs signées (6 h) : la lecture respecte les règles d'accès du bucket "reviews" */
export async function signReviewPaths(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(REVIEWS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

function groupByPresence(members: Member[]): MemberGroup[] {
  const online = members.filter((m) => m.status !== "offline");
  const offline = members.filter((m) => m.status === "offline");
  return [
    { title: "En ligne", members: sortMembers(online) },
    { title: "Hors ligne", members: sortMembers(offline) },
  ].filter((group) => group.members.length > 0);
}

function sortMembers<T extends Member>(members: T[]) {
  return members.sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));
}
