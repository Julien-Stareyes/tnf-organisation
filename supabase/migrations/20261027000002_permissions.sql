-- Organisation TNF — calcul des permissions (modèle Discord) et triggers
-- Le schéma "private" n'est pas exposé par l'API : ces fonctions ne servent qu'aux règles RLS et aux RPC.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Bits de permissions — miroir exact de src/lib/permissions.ts
create or replace function private.perm(p_name text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'VIEW_CHANNEL'           then 1::bigint << 0
    when 'MANAGE_CHANNELS'        then 1::bigint << 1
    when 'MANAGE_SERVER'          then 1::bigint << 2
    when 'MANAGE_ROLES'           then 1::bigint << 3
    when 'CREATE_INVITE'          then 1::bigint << 4
    when 'KICK_MEMBERS'           then 1::bigint << 5
    when 'BAN_MEMBERS'            then 1::bigint << 6
    when 'VIEW_AUDIT_LOG'         then 1::bigint << 7
    when 'ADMINISTRATOR'          then 1::bigint << 8
    when 'SEND_MESSAGES'          then 1::bigint << 10
    when 'ATTACH_FILES'           then 1::bigint << 11
    when 'MENTION_EVERYONE'       then 1::bigint << 12
    when 'MANAGE_MESSAGES'        then 1::bigint << 13
    when 'READ_HISTORY'           then 1::bigint << 14
    when 'ADD_REACTIONS'          then 1::bigint << 15
    when 'CREATE_PROJECTS'        then 1::bigint << 20
    when 'MANAGE_PROJECTS'        then 1::bigint << 21
    when 'MANAGE_PROJECT_MEMBERS' then 1::bigint << 22
    when 'MANAGE_INTEGRATIONS'    then 1::bigint << 23
    -- Droits par défaut du rôle @everyone
    when 'DEFAULT_EVERYONE'       then (1::bigint << 0) | (1::bigint << 10) | (1::bigint << 11)
                                     | (1::bigint << 14) | (1::bigint << 15)
  end
$$;

-- ─── Organisation ───────────────────────────────────────────────────────────

create or replace function private.org_role(p_user uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select org_role from public.org_members where user_id = p_user
$$;

create or replace function private.is_org_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.org_role(p_user) in ('owner', 'admin'), false)
$$;

-- ─── Calcul des permissions ─────────────────────────────────────────────────
-- -1 = tous les droits (owner/admin de l'org, propriétaire du serveur, ADMINISTRATOR)

create or replace function private.apply_overwrites(
  p_perms bigint,
  p_everyone_allow bigint, p_everyone_deny bigint,
  p_roles_allow bigint, p_roles_deny bigint,
  p_member_allow bigint, p_member_deny bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (((((p_perms
    & ~coalesce(p_everyone_deny, 0)) | coalesce(p_everyone_allow, 0))
    & ~coalesce(p_roles_deny, 0))    | coalesce(p_roles_allow, 0))
    & ~coalesce(p_member_deny, 0))   | coalesce(p_member_allow, 0)
$$;

create or replace function private.server_permissions(p_user uuid, p_server uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perms bigint;
begin
  if p_user is null then
    return 0;
  end if;
  if private.is_org_admin(p_user) then
    return -1;
  end if;
  if not exists (select 1 from public.server_members where server_id = p_server and user_id = p_user) then
    return 0;
  end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_user) then
    return -1;
  end if;

  select coalesce(bit_or(r.permissions), 0) into v_perms
  from public.roles r
  where r.server_id = p_server
    and (r.is_everyone or exists (
      select 1 from public.member_roles mr where mr.role_id = r.id and mr.user_id = p_user));

  if (v_perms & private.perm('ADMINISTRATOR')) <> 0 then
    return -1;
  end if;
  return v_perms;
end
$$;

create or replace function private.project_permissions(p_user uuid, p_project uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_server uuid;
  v_perms bigint;
  v_role public.project_role;
  v_ea bigint; v_ed bigint; v_ra bigint; v_rd bigint; v_ma bigint; v_md bigint;
begin
  select server_id into v_server from public.projects where id = p_project;
  if v_server is null then
    return 0;
  end if;

  v_perms := private.server_permissions(p_user, v_server);
  if v_perms = -1 then
    return -1;
  end if;

  -- Un projet n'est accessible qu'aux personnes qui y sont affectées
  select project_role into v_role
  from public.project_members
  where project_id = p_project and user_id = p_user;
  if v_perms = 0 or v_role is null then
    return 0;
  end if;

  if v_role = 'lead' then
    v_perms := v_perms
      | private.perm('MANAGE_CHANNELS')
      | private.perm('MANAGE_PROJECT_MEMBERS')
      | private.perm('MANAGE_INTEGRATIONS');
  end if;

  select
    bit_or(o.allow) filter (where o.target_type = 'role' and r.is_everyone),
    bit_or(o.deny)  filter (where o.target_type = 'role' and r.is_everyone),
    bit_or(o.allow) filter (where o.target_type = 'role' and not r.is_everyone),
    bit_or(o.deny)  filter (where o.target_type = 'role' and not r.is_everyone),
    bit_or(o.allow) filter (where o.target_type = 'member'),
    bit_or(o.deny)  filter (where o.target_type = 'member')
  into v_ea, v_ed, v_ra, v_rd, v_ma, v_md
  from public.project_overwrites o
  left join public.roles r on o.target_type = 'role' and r.id = o.target_id
  where o.project_id = p_project
    and (
      (o.target_type = 'member' and o.target_id = p_user)
      or (o.target_type = 'role' and (r.is_everyone or exists (
        select 1 from public.member_roles mr where mr.role_id = r.id and mr.user_id = p_user)))
    );

  return private.apply_overwrites(v_perms, v_ea, v_ed, v_ra, v_rd, v_ma, v_md);
end
$$;

-- Droits sur un "périmètre" : le serveur lui-même (p_project null) ou un projet
create or replace function private.scope_permissions(p_user uuid, p_server uuid, p_project uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perms bigint;
begin
  if p_project is not null then
    return private.project_permissions(p_user, p_project);
  end if;
  v_perms := private.server_permissions(p_user, p_server);
  -- Les invités (clients) ne voient que leurs projets, jamais les salons du serveur
  if v_perms <> -1 and private.org_role(p_user) = 'guest' then
    return 0;
  end if;
  return v_perms;
end
$$;

create or replace function private.channel_permissions(p_user uuid, p_channel uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_server uuid;
  v_project uuid;
  v_perms bigint;
  v_ea bigint; v_ed bigint; v_ra bigint; v_rd bigint; v_ma bigint; v_md bigint;
begin
  select server_id, project_id into v_server, v_project from public.channels where id = p_channel;
  if v_server is null then
    return 0;
  end if;

  v_perms := private.scope_permissions(p_user, v_server, v_project);
  if v_perms = -1 or v_perms = 0 then
    return v_perms;
  end if;

  select
    bit_or(o.allow) filter (where o.target_type = 'role' and r.is_everyone),
    bit_or(o.deny)  filter (where o.target_type = 'role' and r.is_everyone),
    bit_or(o.allow) filter (where o.target_type = 'role' and not r.is_everyone),
    bit_or(o.deny)  filter (where o.target_type = 'role' and not r.is_everyone),
    bit_or(o.allow) filter (where o.target_type = 'member'),
    bit_or(o.deny)  filter (where o.target_type = 'member')
  into v_ea, v_ed, v_ra, v_rd, v_ma, v_md
  from public.channel_overwrites o
  left join public.roles r on o.target_type = 'role' and r.id = o.target_id
  where o.channel_id = p_channel
    and (
      (o.target_type = 'member' and o.target_id = p_user)
      or (o.target_type = 'role' and (r.is_everyone or exists (
        select 1 from public.member_roles mr where mr.role_id = r.id and mr.user_id = p_user)))
    );

  v_perms := private.apply_overwrites(v_perms, v_ea, v_ed, v_ra, v_rd, v_ma, v_md);

  -- Comme Discord : sans "Voir le salon", aucun autre droit ne compte
  if (v_perms & private.perm('VIEW_CHANNEL')) = 0 then
    return 0;
  end if;
  return v_perms;
end
$$;

-- ─── Raccourcis pour les règles RLS (utilisateur courant) ───────────────────

create or replace function private.is_org_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_members where user_id = (select auth.uid()))
$$;

create or replace function private.is_server_member(p_server uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_admin((select auth.uid()))
    or exists (select 1 from public.server_members where server_id = p_server and user_id = (select auth.uid()))
$$;

create or replace function private.has_server_perm(p_server uuid, p_bits bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.server_permissions((select auth.uid()), p_server) & p_bits) = p_bits
$$;

create or replace function private.has_project_perm(p_project uuid, p_bits bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.project_permissions((select auth.uid()), p_project) & p_bits) = p_bits
$$;

create or replace function private.has_scope_perm(p_server uuid, p_project uuid, p_bits bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.scope_permissions((select auth.uid()), p_server, p_project) & p_bits) = p_bits
$$;

create or replace function private.has_channel_perm(p_channel uuid, p_bits bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.channel_permissions((select auth.uid()), p_channel) & p_bits) = p_bits
$$;

-- Position du rôle le plus haut de l'utilisateur courant (hiérarchie des rôles)
create or replace function private.my_top_role_position(p_server uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.server_permissions((select auth.uid()), p_server) = -1 then 2147483647
    else coalesce((
      select max(r.position)
      from public.roles r
      join public.member_roles mr on mr.role_id = r.id
      where r.server_id = p_server and mr.user_id = (select auth.uid())
    ), 0)
  end
$$;

create or replace function private.role_position(p_role uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select position from public.roles where id = p_role
$$;

-- ─── RPC exposée au front ───────────────────────────────────────────────────

create or replace function public.my_permissions(
  p_server uuid,
  p_project uuid default null,
  p_channel uuid default null
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_channel is not null then private.channel_permissions((select auth.uid()), p_channel)
    else private.scope_permissions((select auth.uid()), p_server, p_project)
  end
$$;
revoke execute on function public.my_permissions(uuid, uuid, uuid) from public, anon;
grant execute on function public.my_permissions(uuid, uuid, uuid) to authenticated;

-- ─── Triggers ───────────────────────────────────────────────────────────────

-- Profil créé à l'inscription ; le tout premier compte devient owner de l'organisation
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  if not exists (select 1 from public.org_members) then
    insert into public.org_members (user_id, org_role) values (new.id, 'owner');
  end if;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Nouveau serveur : rôle @everyone, propriétaire membre, salons de base
create or replace function private.handle_new_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category uuid;
begin
  insert into public.roles (server_id, name, position, permissions, is_everyone)
  values (new.id, '@everyone', 0, private.perm('DEFAULT_EVERYONE'), true);

  insert into public.server_members (server_id, user_id)
  values (new.id, new.owner_id)
  on conflict do nothing;

  insert into public.categories (server_id, name, position)
  values (new.id, 'Général', 0)
  returning id into v_category;

  insert into public.channels (server_id, category_id, name, type, position) values
    (new.id, v_category, 'annonces', 'announcement', 0),
    (new.id, v_category, 'général', 'text', 1);

  return new;
end
$$;

create trigger on_server_created
  after insert on public.servers
  for each row execute function private.handle_new_server();

-- Nouveau projet : le lead est affecté, salons créés selon le pôle du serveur
create or replace function private.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pole public.server_pole;
  v_category uuid;
  v_names text[];
begin
  if new.lead_id is not null then
    insert into public.project_members (project_id, user_id, project_role, added_by)
    values (new.id, new.lead_id, 'lead', coalesce((select auth.uid()), new.lead_id))
    on conflict do nothing;
  end if;

  select pole into v_pole from public.servers where id = new.server_id;
  v_names := case v_pole
    when 'cgi'   then array['brief', 'references', 'modeling', 'lookdev', 'anim', 'rendus', 'compo', 'livraison']
    when 'ue5'   then array['brief', 'level-design', 'blueprints', 'pixel-streaming', 'builds', 'qa']
    when 'webgl' then array['brief', 'design', 'dev', 'staging', 'qa']
    else              array['brief', 'général']
  end;

  insert into public.categories (server_id, project_id, name, position)
  values (new.server_id, new.id, 'Production', 0)
  returning id into v_category;

  insert into public.channels (server_id, project_id, category_id, name, position)
  select new.server_id, new.id, v_category, n.name, n.ord - 1
  from unnest(v_names) with ordinality as n(name, ord);

  insert into public.categories (server_id, project_id, name, position)
  values (new.server_id, new.id, 'Client', 1)
  returning id into v_category;

  insert into public.channels (server_id, project_id, category_id, name, position)
  values (new.server_id, new.id, v_category, 'client', 0);

  return new;
end
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function private.handle_new_project();

-- Être affecté à un projet rend automatiquement membre du serveur
create or replace function private.ensure_server_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.server_members (server_id, user_id)
  select p.server_id, new.user_id from public.projects p where p.id = new.project_id
  on conflict do nothing;
  return new;
end
$$;

create trigger on_project_member_added
  before insert on public.project_members
  for each row execute function private.ensure_server_membership();

-- Un rôle supprimé emporte ses exceptions de permissions
create or replace function private.cleanup_role_overwrites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_overwrites where target_type = 'role' and target_id = old.id;
  delete from public.channel_overwrites where target_type = 'role' and target_id = old.id;
  return old;
end
$$;

create trigger on_role_deleted
  after delete on public.roles
  for each row execute function private.cleanup_role_overwrites();

-- Journal d'audit générique
create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (server_id, project_id, actor_id, action, target_type, target_id, changes)
  values (
    case when tg_table_name = 'servers' then (v_row ->> 'id')::uuid else (v_row ->> 'server_id')::uuid end,
    case when tg_table_name = 'projects' then (v_row ->> 'id')::uuid else (v_row ->> 'project_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case tg_op
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else v_row
    end
  );
  return null;
end
$$;

create trigger audit_servers after insert or update or delete on public.servers
  for each row execute function private.audit();
create trigger audit_server_members after insert or delete on public.server_members
  for each row execute function private.audit();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function private.audit();
create trigger audit_member_roles after insert or delete on public.member_roles
  for each row execute function private.audit();
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function private.audit();
create trigger audit_project_members after insert or update or delete on public.project_members
  for each row execute function private.audit();
create trigger audit_project_overwrites after insert or update or delete on public.project_overwrites
  for each row execute function private.audit();
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function private.audit();
create trigger audit_channels after insert or update or delete on public.channels
  for each row execute function private.audit();
create trigger audit_channel_overwrites after insert or update or delete on public.channel_overwrites
  for each row execute function private.audit();

-- ─── Invitations ────────────────────────────────────────────────────────────
-- Appelée uniquement côté serveur (clé service_role) après création du compte invité

create or replace function public.accept_invitation(p_token_hash text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_server uuid;
  v_assignment jsonb;
begin
  select * into v_inv
  from public.invitations
  where token_hash = p_token_hash
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invitation_invalide';
  end if;

  insert into public.org_members (user_id, org_role)
  values (p_user, v_inv.org_role)
  on conflict (user_id) do nothing;

  foreach v_server in array v_inv.server_ids loop
    insert into public.server_members (server_id, user_id)
    values (v_server, p_user)
    on conflict do nothing;
  end loop;

  for v_assignment in select value from jsonb_array_elements(v_inv.project_assignments) loop
    insert into public.project_members (project_id, user_id, project_role, added_by)
    values (
      (v_assignment ->> 'project_id')::uuid,
      p_user,
      coalesce(v_assignment ->> 'project_role', 'member')::public.project_role,
      v_inv.invited_by
    )
    on conflict do nothing;
  end loop;

  update public.invitations set accepted_at = now() where id = v_inv.id;
end
$$;
revoke execute on function public.accept_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation(text, uuid) to service_role;

-- Les règles RLS appellent ces fonctions avec le rôle de l'utilisateur connecté
grant execute on all functions in schema private to authenticated, service_role;
