-- Organisation TNF — données de démarrage
-- À lancer UNE fois dans le SQL Editor de Supabase, après avoir créé ton premier compte
-- (le premier compte créé devient automatiquement owner de l'organisation).

do $$
declare
  v_owner uuid;
  v_server uuid;
  v_ue5 uuid;
  v_server_name text;
  v_pole public.server_pole;
  v_position integer := 0;
begin
  select user_id into v_owner from public.org_members where org_role = 'owner' limit 1;
  if v_owner is null then
    raise exception 'Crée d''abord un compte : le premier compte devient owner.';
  end if;

  if exists (select 1 from public.servers) then
    raise notice 'Des serveurs existent déjà, seed ignoré.';
    return;
  end if;

  for v_server_name, v_pole in
    select * from (values
      ('TNF Général', 'general'::public.server_pole),
      ('CGI / VFX', 'cgi'),
      ('UE5 / Pixel Streaming', 'ue5'),
      ('WebGL', 'webgl')
    ) as s(name, pole)
  loop
    insert into public.servers (name, pole, owner_id, position)
    values (v_server_name, v_pole, v_owner, v_position)
    returning id into v_server;
    v_position := v_position + 1;
    -- Les rôles @everyone, Admin et Lead sont créés par le trigger on_server_created

    if v_pole = 'ue5' then
      v_ue5 := v_server;
    end if;
  end loop;

  insert into public.projects (server_id, name, client_name, color, lead_id, position) values
    (v_ue5, 'Logitech', 'Logitech', '#00B8FC', v_owner, 0),
    (v_ue5, 'Pussi', 'Pussi', '#FF5FA2', v_owner, 1),
    (v_ue5, 'Louis Vuitton', 'Louis Vuitton', '#B08D57', v_owner, 2);
end
$$;
