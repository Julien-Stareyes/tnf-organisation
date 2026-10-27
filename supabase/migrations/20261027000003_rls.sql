-- Organisation TNF — règles d'accès (RLS)
-- Toute la sécurité est ici : l'interface ne fait que refléter ce que la base autorise.

alter table public.profiles           enable row level security;
alter table public.org_members        enable row level security;
alter table public.servers            enable row level security;
alter table public.server_members     enable row level security;
alter table public.roles              enable row level security;
alter table public.member_roles       enable row level security;
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.project_overwrites enable row level security;
alter table public.categories         enable row level security;
alter table public.channels           enable row level security;
alter table public.channel_overwrites enable row level security;
alter table public.messages           enable row level security;
alter table public.attachments        enable row level security;
alter table public.reactions          enable row level security;
alter table public.read_states        enable row level security;
alter table public.invitations        enable row level security;
alter table public.audit_logs         enable row level security;

-- ─── Comptes ────────────────────────────────────────────────────────────────

create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_org_member());

create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "org_members_select" on public.org_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_member());

-- Les admins gèrent tout le monde sauf l'owner (le transfert d'ownership se fera à part)
create policy "org_members_insert" on public.org_members for insert to authenticated
  with check (private.is_org_admin((select auth.uid())) and org_role <> 'owner');

create policy "org_members_update" on public.org_members for update to authenticated
  using (private.is_org_admin((select auth.uid())) and org_role <> 'owner')
  with check (private.is_org_admin((select auth.uid())) and org_role <> 'owner');

create policy "org_members_delete" on public.org_members for delete to authenticated
  using (private.is_org_admin((select auth.uid())) and org_role <> 'owner');

-- ─── Serveurs ───────────────────────────────────────────────────────────────

create policy "servers_select" on public.servers for select to authenticated
  using (private.is_server_member(id));

create policy "servers_insert" on public.servers for insert to authenticated
  with check (private.is_org_admin((select auth.uid())) and owner_id = (select auth.uid()));

create policy "servers_update" on public.servers for update to authenticated
  using (private.has_server_perm(id, private.perm('MANAGE_SERVER')))
  with check (private.has_server_perm(id, private.perm('MANAGE_SERVER')));

create policy "servers_delete" on public.servers for delete to authenticated
  using (private.is_org_admin((select auth.uid())));

create policy "server_members_select" on public.server_members for select to authenticated
  using (private.is_server_member(server_id));

create policy "server_members_insert" on public.server_members for insert to authenticated
  with check (private.has_server_perm(server_id, private.perm('MANAGE_SERVER')));

create policy "server_members_update" on public.server_members for update to authenticated
  using (user_id = (select auth.uid()) or private.has_server_perm(server_id, private.perm('MANAGE_SERVER')))
  with check (user_id = (select auth.uid()) or private.has_server_perm(server_id, private.perm('MANAGE_SERVER')));

create policy "server_members_delete" on public.server_members for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_server_perm(server_id, private.perm('KICK_MEMBERS')));

-- ─── Rôles (hiérarchie + on ne donne que les droits qu'on possède) ──────────

create policy "roles_select" on public.roles for select to authenticated
  using (private.is_server_member(server_id));

create policy "roles_insert" on public.roles for insert to authenticated
  with check (
    not is_everyone
    and private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and position < private.my_top_role_position(server_id)
    and (permissions & ~private.server_permissions((select auth.uid()), server_id)) = 0
  );

create policy "roles_update" on public.roles for update to authenticated
  using (
    private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and (is_everyone or position < private.my_top_role_position(server_id))
  )
  with check (
    private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and (is_everyone or position < private.my_top_role_position(server_id))
    and (permissions & ~private.server_permissions((select auth.uid()), server_id)) = 0
  );

create policy "roles_delete" on public.roles for delete to authenticated
  using (
    not is_everyone
    and private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and position < private.my_top_role_position(server_id)
  );

create policy "member_roles_select" on public.member_roles for select to authenticated
  using (private.is_server_member(server_id));

create policy "member_roles_insert" on public.member_roles for insert to authenticated
  with check (
    private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and private.role_position(role_id) < private.my_top_role_position(server_id)
  );

create policy "member_roles_delete" on public.member_roles for delete to authenticated
  using (
    private.has_server_perm(server_id, private.perm('MANAGE_ROLES'))
    and private.role_position(role_id) < private.my_top_role_position(server_id)
  );

-- ─── Projets (visibles uniquement par les personnes affectées) ─────────────

create policy "projects_select" on public.projects for select to authenticated
  using (private.has_project_perm(id, private.perm('VIEW_CHANNEL')));

create policy "projects_insert" on public.projects for insert to authenticated
  with check (private.has_server_perm(server_id, private.perm('CREATE_PROJECTS')));

create policy "projects_update" on public.projects for update to authenticated
  using (
    private.has_project_perm(id, private.perm('MANAGE_PROJECTS'))
    or private.has_project_perm(id, private.perm('MANAGE_INTEGRATIONS'))
  )
  with check (
    private.has_project_perm(id, private.perm('MANAGE_PROJECTS'))
    or private.has_project_perm(id, private.perm('MANAGE_INTEGRATIONS'))
  );

create policy "projects_delete" on public.projects for delete to authenticated
  using (private.has_server_perm(server_id, private.perm('MANAGE_PROJECTS')));

create policy "project_members_select" on public.project_members for select to authenticated
  using (private.has_project_perm(project_id, private.perm('VIEW_CHANNEL')));

create policy "project_members_insert" on public.project_members for insert to authenticated
  with check (private.has_project_perm(project_id, private.perm('MANAGE_PROJECT_MEMBERS')));

create policy "project_members_update" on public.project_members for update to authenticated
  using (private.has_project_perm(project_id, private.perm('MANAGE_PROJECT_MEMBERS')))
  with check (private.has_project_perm(project_id, private.perm('MANAGE_PROJECT_MEMBERS')));

create policy "project_members_delete" on public.project_members for delete to authenticated
  using (private.has_project_perm(project_id, private.perm('MANAGE_PROJECT_MEMBERS')));

create policy "project_overwrites_select" on public.project_overwrites for select to authenticated
  using (private.has_project_perm(project_id, private.perm('VIEW_CHANNEL')));

create policy "project_overwrites_write" on public.project_overwrites for all to authenticated
  using (private.has_project_perm(project_id, private.perm('MANAGE_PROJECTS')))
  with check (private.has_project_perm(project_id, private.perm('MANAGE_PROJECTS')));

-- ─── Catégories & salons ────────────────────────────────────────────────────

create policy "categories_select" on public.categories for select to authenticated
  using (private.has_scope_perm(server_id, project_id, private.perm('VIEW_CHANNEL')));

create policy "categories_write" on public.categories for all to authenticated
  using (private.has_scope_perm(server_id, project_id, private.perm('MANAGE_CHANNELS')))
  with check (private.has_scope_perm(server_id, project_id, private.perm('MANAGE_CHANNELS')));

create policy "channels_select" on public.channels for select to authenticated
  using (private.has_channel_perm(id, private.perm('VIEW_CHANNEL')));

create policy "channels_insert" on public.channels for insert to authenticated
  with check (private.has_scope_perm(server_id, project_id, private.perm('MANAGE_CHANNELS')));

create policy "channels_update" on public.channels for update to authenticated
  using (private.has_channel_perm(id, private.perm('MANAGE_CHANNELS')))
  with check (private.has_scope_perm(server_id, project_id, private.perm('MANAGE_CHANNELS')));

create policy "channels_delete" on public.channels for delete to authenticated
  using (private.has_channel_perm(id, private.perm('MANAGE_CHANNELS')));

create policy "channel_overwrites_select" on public.channel_overwrites for select to authenticated
  using (private.has_channel_perm(channel_id, private.perm('VIEW_CHANNEL')));

create policy "channel_overwrites_write" on public.channel_overwrites for all to authenticated
  using (private.has_channel_perm(channel_id, private.perm('MANAGE_CHANNELS')))
  with check (private.has_channel_perm(channel_id, private.perm('MANAGE_CHANNELS')));

-- ─── Messages ───────────────────────────────────────────────────────────────

create policy "messages_select" on public.messages for select to authenticated
  using (private.has_channel_perm(channel_id, private.perm('VIEW_CHANNEL') | private.perm('READ_HISTORY')));

create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and edited_at is null
    and deleted_at is null
    and private.has_channel_perm(channel_id, private.perm('SEND_MESSAGES'))
  );

create policy "messages_update" on public.messages for update to authenticated
  using (author_id = (select auth.uid()) or private.has_channel_perm(channel_id, private.perm('MANAGE_MESSAGES')))
  with check (author_id = (select auth.uid()) or private.has_channel_perm(channel_id, private.perm('MANAGE_MESSAGES')));

create policy "messages_delete" on public.messages for delete to authenticated
  using (private.has_channel_perm(channel_id, private.perm('MANAGE_MESSAGES')));

create policy "attachments_select" on public.attachments for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id
      and private.has_channel_perm(m.channel_id, private.perm('VIEW_CHANNEL') | private.perm('READ_HISTORY'))
  ));

create policy "attachments_insert" on public.attachments for insert to authenticated
  with check (exists (
    select 1 from public.messages m
    where m.id = message_id
      and m.author_id = (select auth.uid())
      and private.has_channel_perm(m.channel_id, private.perm('ATTACH_FILES'))
  ));

create policy "reactions_select" on public.reactions for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and private.has_channel_perm(m.channel_id, private.perm('VIEW_CHANNEL'))
  ));

create policy "reactions_insert" on public.reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and private.has_channel_perm(m.channel_id, private.perm('ADD_REACTIONS'))
    )
  );

create policy "reactions_delete" on public.reactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.messages m
      where m.id = message_id and private.has_channel_perm(m.channel_id, private.perm('MANAGE_MESSAGES'))
    )
  );

create policy "read_states_own" on public.read_states for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── Invitations & audit ────────────────────────────────────────────────────

create policy "invitations_admin" on public.invitations for all to authenticated
  using (private.is_org_admin((select auth.uid())))
  with check (private.is_org_admin((select auth.uid())));

create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (
    private.is_org_admin((select auth.uid()))
    or (server_id is not null and private.has_server_perm(server_id, private.perm('VIEW_AUDIT_LOG')))
  );

-- ─── Temps réel ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.messages, public.reactions;
