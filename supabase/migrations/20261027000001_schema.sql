-- Organisation TNF — schéma de base
-- Hiérarchie : organisation → serveurs → (salons du serveur | projets → salons du projet)

create type public.org_role as enum ('owner', 'admin', 'member', 'guest');
create type public.server_pole as enum ('cgi', 'ue5', 'webgl', 'general');
create type public.project_status as enum ('active', 'delivered', 'archived');
create type public.project_role as enum ('lead', 'member', 'client');
create type public.channel_type as enum ('text', 'announcement');
create type public.overwrite_target as enum ('role', 'member');

-- ─── Comptes ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  status text not null default 'offline' check (status in ('online', 'idle', 'dnd', 'offline')),
  created_at timestamptz not null default now()
);

create table public.org_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  org_role public.org_role not null default 'member',
  joined_at timestamptz not null default now()
);

-- ─── Serveurs ───────────────────────────────────────────────────────────────

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  icon_url text,
  banner_url text,
  pole public.server_pole not null default 'general',
  owner_id uuid not null references public.profiles (id),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 1 and 80),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index server_members_user_idx on public.server_members (user_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0,
  permissions bigint not null default 0,
  hoist boolean not null default false,
  is_everyone boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create unique index roles_one_everyone_idx on public.roles (server_id) where is_everyone;
create index roles_server_idx on public.roles (server_id);

create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  primary key (user_id, role_id),
  foreign key (server_id, user_id) references public.server_members (server_id, user_id) on delete cascade,
  foreign key (role_id, server_id) references public.roles (id, server_id) on delete cascade
);
create index member_roles_role_idx on public.member_roles (role_id);

-- ─── Projets ────────────────────────────────────────────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  client_name text,
  client_logo_url text,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  status public.project_status not null default 'active',
  start_date date,
  end_date date,
  lead_id uuid references public.profiles (id) on delete set null,
  miro_board_url text check (miro_board_url is null or miro_board_url ~ '^https://miro\.com/'),
  trello_board_id text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create index projects_server_idx on public.projects (server_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_role public.project_role not null default 'member',
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_overwrites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  target_type public.overwrite_target not null,
  target_id uuid not null,
  allow bigint not null default 0,
  deny bigint not null default 0,
  unique (project_id, target_type, target_id)
);

-- ─── Salons ─────────────────────────────────────────────────────────────────
-- project_id vide = salon au niveau du serveur

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  project_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  position integer not null default 0,
  foreign key (project_id, server_id) references public.projects (id, server_id) on delete cascade
);
create index categories_server_idx on public.categories (server_id);
create index categories_project_idx on public.categories (project_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  project_id uuid,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  type public.channel_type not null default 'text',
  topic text check (topic is null or char_length(topic) <= 1024),
  position integer not null default 0,
  slowmode_seconds integer not null default 0 check (slowmode_seconds between 0 and 21600),
  created_at timestamptz not null default now(),
  foreign key (project_id, server_id) references public.projects (id, server_id) on delete cascade
);
create index channels_server_idx on public.channels (server_id);
create index channels_project_idx on public.channels (project_id);
create index channels_category_idx on public.channels (category_id);

create table public.channel_overwrites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  target_type public.overwrite_target not null,
  target_id uuid not null,
  allow bigint not null default 0,
  deny bigint not null default 0,
  unique (channel_id, target_type, target_id)
);

-- ─── Messages ───────────────────────────────────────────────────────────────

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  reply_to_id uuid references public.messages (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index messages_author_idx on public.messages (author_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  mime text not null,
  size bigint not null check (size >= 0),
  width integer,
  height integer
);
create index attachments_message_idx on public.attachments (message_id);

create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.read_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_message_id uuid references public.messages (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- ─── Invitations & audit ────────────────────────────────────────────────────

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  org_role public.org_role not null default 'member' check (org_role <> 'owner'),
  server_ids uuid[] not null default '{}',
  -- [{ "project_id": "...", "project_role": "lead" | "member" | "client" }]
  project_assignments jsonb not null default '[]',
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_email_idx on public.invitations (email);

-- Pas de clés étrangères : le journal doit survivre à la suppression de ce qu'il décrit.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  server_id uuid,
  project_id uuid,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_server_idx on public.audit_logs (server_id, created_at desc);
