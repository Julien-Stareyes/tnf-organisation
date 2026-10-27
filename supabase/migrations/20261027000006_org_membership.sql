-- Organisation TNF — sans appartenance à l'organisation, aucun droit nulle part
-- (filet de sécurité si quelqu'un est retiré de l'org mais reste listé dans un serveur)

create or replace function private.server_permissions(p_user uuid, p_server uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.org_role;
  v_perms bigint;
begin
  if p_user is null then
    return 0;
  end if;
  v_role := private.org_role(p_user);
  if v_role is null then
    return 0;
  end if;
  if v_role in ('owner', 'admin') then
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

create or replace function private.is_server_member(p_server uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_admin((select auth.uid()))
    or (
      private.is_org_member()
      and exists (select 1 from public.server_members where server_id = p_server and user_id = (select auth.uid()))
    )
$$;
