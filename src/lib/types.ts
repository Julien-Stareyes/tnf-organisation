export type OrgRole = "owner" | "admin" | "member" | "guest";
export type ServerPole = "cgi" | "ue5" | "webgl" | "general";
export type ProjectStatus = "active" | "delivered" | "archived";
export type ProjectRole = "lead" | "member" | "client";
export type ChannelType = "text" | "announcement";
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: PresenceStatus;
};

export type ServerSummary = {
  id: string;
  name: string;
  icon_url: string | null;
  pole: ServerPole;
  position: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  client_name: string | null;
  color: string | null;
  status: ProjectStatus;
  position: number;
};

export type Project = ProjectSummary & {
  server_id: string;
  client_logo_url: string | null;
  lead_id: string | null;
};

export type Category = {
  id: string;
  name: string;
  position: number;
};

export type Channel = {
  id: string;
  server_id: string;
  project_id: string | null;
  category_id: string | null;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  slowmode_seconds: number;
  client_visible: boolean;
};

export type ChannelTree = {
  uncategorized: Channel[];
  categories: (Category & { channels: Channel[] })[];
};

export type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: PresenceStatus;
};

export type OrgMember = Member & { org_role: OrgRole; email?: string };

export type ProjectMember = Member & { project_role: ProjectRole };

export type ServerMember = Member & { role_ids: string[] };

export type Role = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

export type RoleDetail = Role & { permissions: number; hoist: boolean; is_everyone: boolean };

export type ChannelOverwrite = {
  target_type: "role" | "member";
  target_id: string;
  allow: number;
  deny: number;
};

export type AuditEntry = {
  id: number;
  actor_name: string | null;
  action: "insert" | "update" | "delete";
  target_type: string;
  changes: Record<string, unknown> | null;
  created_at: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  org_role: OrgRole;
  expires_at: string;
  created_at: string;
};

export type ServerWithProjects = ServerSummary & { projects: ProjectSummary[] };

export type MemberGroup = {
  title: string;
  members: Member[];
};
