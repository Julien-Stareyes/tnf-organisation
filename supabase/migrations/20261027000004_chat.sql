-- Organisation TNF — Phase 1 : règles du chat et rôles par défaut

-- Seul l'auteur modifie son message ; l'auteur ou un modérateur peut le supprimer
drop policy "messages_update" on public.messages;
drop policy "messages_delete" on public.messages;

create policy "messages_update_author" on public.messages for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and private.has_channel_perm(channel_id, private.perm('VIEW_CHANNEL'))
  );

create policy "messages_delete" on public.messages for delete to authenticated
  using (
    author_id = (select auth.uid())
    or private.has_channel_perm(channel_id, private.perm('MANAGE_MESSAGES'))
  );

-- Un message ne change ni de salon ni d'auteur ; toute modification du texte est datée
create or replace function private.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.channel_id <> old.channel_id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'message_immuable';
  end if;
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end
$$;

create trigger on_message_update
  before update on public.messages
  for each row execute function private.guard_message_update();

-- Tout nouveau serveur reçoit aussi les rôles Admin et Lead
create or replace function private.handle_new_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category uuid;
begin
  insert into public.roles (server_id, name, color, position, permissions, hoist, is_everyone) values
    (new.id, '@everyone', null, 0, private.perm('DEFAULT_EVERYONE'), false, true),
    (new.id, 'Admin', '#D4FF3A', 100, private.perm('ADMINISTRATOR'), true, false),
    (new.id, 'Lead', '#4FB3FF', 50,
      private.perm('MANAGE_CHANNELS') | private.perm('CREATE_PROJECTS') | private.perm('MANAGE_PROJECTS')
      | private.perm('MANAGE_PROJECT_MEMBERS') | private.perm('MANAGE_INTEGRATIONS')
      | private.perm('MANAGE_MESSAGES') | private.perm('MENTION_EVERYONE') | private.perm('CREATE_INVITE'),
      true, false);

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

grant execute on all functions in schema private to authenticated, service_role;
