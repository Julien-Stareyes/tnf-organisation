-- Organisation TNF — les clients d'un projet ne voient que les salons marqués "visible par les clients"

alter table public.channels add column client_visible boolean not null default false;
update public.channels set client_visible = true where project_id is not null and name = 'client';

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
  v_client_visible boolean;
  v_perms bigint;
  v_ea bigint; v_ed bigint; v_ra bigint; v_rd bigint; v_ma bigint; v_md bigint;
begin
  select server_id, project_id, client_visible into v_server, v_project, v_client_visible
  from public.channels where id = p_channel;
  if v_server is null then
    return 0;
  end if;

  v_perms := private.scope_permissions(p_user, v_server, v_project);
  if v_perms = -1 or v_perms = 0 then
    return v_perms;
  end if;

  -- Rôle "client" dans le projet : uniquement les salons ouverts aux clients
  if v_project is not null and not v_client_visible and exists (
    select 1 from public.project_members
    where project_id = v_project and user_id = p_user and project_role = 'client'
  ) then
    return 0;
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

  if (v_perms & private.perm('VIEW_CHANNEL')) = 0 then
    return 0;
  end if;
  return v_perms;
end
$$;

-- Modèle de projet : #client est le seul salon ouvert aux clients par défaut
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

  insert into public.channels (server_id, project_id, category_id, name, position, client_visible)
  values (new.server_id, new.id, v_category, 'client', 0, true);

  return new;
end
$$;

grant execute on all functions in schema private to authenticated, service_role;
