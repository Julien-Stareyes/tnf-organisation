-- Organisation TNF — Phase 4 : pièces jointes, mentions & notifications, recherche

-- ─── Pièces jointes ─────────────────────────────────────────────────────────

-- Un message peut ne contenir qu'une pièce jointe
alter table public.messages drop constraint messages_content_check;
alter table public.messages add constraint messages_content_check check (char_length(content) <= 4000);

-- channel_id : permet le filtre temps réel par salon ; name : nom d'origine du fichier
alter table public.attachments
  add column channel_id uuid not null references public.channels (id) on delete cascade,
  add column name text not null check (char_length(name) between 1 and 255);
create index attachments_channel_idx on public.attachments (channel_id);

drop policy "attachments_insert" on public.attachments;
create policy "attachments_insert" on public.attachments for insert to authenticated
  with check (exists (
    select 1 from public.messages m
    where m.id = message_id
      and m.channel_id = attachments.channel_id
      and m.author_id = (select auth.uid())
      and private.has_channel_perm(m.channel_id, private.perm('ATTACH_FILES'))
  ));

alter publication supabase_realtime add table public.attachments;

-- Fichiers : bucket privé, chemin "<channel_id>/<message_id>/<fichier>"
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end
$$;

create policy "attachments_files_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.has_channel_perm(
      private.try_uuid((storage.foldername(name))[1]),
      private.perm('VIEW_CHANNEL') | private.perm('READ_HISTORY')
    )
  );

create policy "attachments_files_upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.has_channel_perm(private.try_uuid((storage.foldername(name))[1]), private.perm('ATTACH_FILES'))
  );

create policy "attachments_files_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner_id = (select auth.uid())::text
      or private.has_channel_perm(private.try_uuid((storage.foldername(name))[1]), private.perm('MANAGE_MESSAGES'))
    )
  );

-- ─── Notifications ──────────────────────────────────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('mention', 'everyone', 'card_assigned')),
  actor_id uuid references public.profiles (id) on delete set null,
  server_id uuid references public.servers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  card_id uuid references public.board_cards (id) on delete cascade,
  excerpt text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
-- Créées uniquement par les triggers ci-dessous ; chacun ne voit et ne gère que les siennes
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.notifications;

-- Mentions dans le chat : <@uuid> pour une personne, @everyone pour tout le salon
create or replace function private.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server uuid;
  v_project uuid;
  v_mentioned uuid[];
  v_everyone uuid[] := '{}';
  v_excerpt text := new.content;
  v_profile record;
begin
  select coalesce(array_agg(distinct m[1]::uuid), '{}') into v_mentioned
  from regexp_matches(new.content, '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as m;

  select server_id, project_id into v_server, v_project from public.channels where id = new.channel_id;

  if new.content ~* '(^|[^[:alnum:]])@everyone([^[:alnum:]]|$)'
    and (private.channel_permissions(new.author_id, new.channel_id) & private.perm('MENTION_EVERYONE'))
        = private.perm('MENTION_EVERYONE') then
    if v_project is not null then
      select coalesce(array_agg(user_id), '{}') into v_everyone from public.project_members where project_id = v_project;
    else
      select coalesce(array_agg(user_id), '{}') into v_everyone from public.server_members where server_id = v_server;
    end if;
  end if;

  if cardinality(v_mentioned) = 0 and cardinality(v_everyone) = 0 then
    return new;
  end if;

  -- Extrait lisible : <@uuid> → @Nom
  for v_profile in select id, display_name from public.profiles where id = any(v_mentioned) loop
    v_excerpt := replace(v_excerpt, '<@' || v_profile.id || '>', '@' || v_profile.display_name);
  end loop;

  insert into public.notifications (user_id, type, actor_id, server_id, project_id, channel_id, message_id, excerpt)
  select r.user_id,
         case when r.user_id = any(v_mentioned) then 'mention' else 'everyone' end,
         new.author_id, v_server, v_project, new.channel_id, new.id, left(v_excerpt, 200)
  from (select distinct unnest(v_mentioned || v_everyone) as user_id) r
  where r.user_id <> new.author_id
    -- seulement si la personne peut voir le salon
    and (private.channel_permissions(r.user_id, new.channel_id) & private.perm('VIEW_CHANNEL')) <> 0
  limit 500;

  return new;
end
$$;

create trigger on_message_mentions
  after insert on public.messages
  for each row execute function private.notify_mentions();

-- Carte assignée à quelqu'un
create or replace function private.notify_card_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid[];
  v_server uuid;
begin
  v_new := array(
    select unnest(new.assignee_ids)
    except
    select unnest(case when tg_op = 'UPDATE' then old.assignee_ids else '{}'::uuid[] end)
  );
  if cardinality(v_new) = 0 then
    return new;
  end if;

  select server_id into v_server from public.projects where id = new.project_id;

  insert into public.notifications (user_id, type, actor_id, server_id, project_id, card_id, excerpt)
  select a, 'card_assigned', (select auth.uid()), v_server, new.project_id, new.id, left(new.title, 200)
  from unnest(v_new) as a
  where a is distinct from (select auth.uid())
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = new.project_id and pm.user_id = a and pm.project_role <> 'client'
    );

  return new;
end
$$;

create trigger on_card_assigned
  after insert or update of assignee_ids on public.board_cards
  for each row execute function private.notify_card_assignees();

-- ─── Recherche plein texte (français) ───────────────────────────────────────

alter table public.messages
  add column search tsvector generated always as (to_tsvector('french', content)) stored;
create index messages_search_idx on public.messages using gin (search);

alter table public.board_cards
  add column search tsvector generated always as (
    to_tsvector('french', title || ' ' || coalesce(description, ''))
  ) stored;
create index board_cards_search_idx on public.board_cards using gin (search);

grant execute on all functions in schema private to authenticated, service_role;
