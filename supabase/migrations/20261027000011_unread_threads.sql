-- Organisation TNF — messages non lus, fils de discussion

-- ─── Fils de discussion ─────────────────────────────────────────────────────
-- Un message avec thread_id est une réponse dans le fil du message racine ;
-- il n'apparaît pas dans le salon, seulement dans le panneau du fil.

alter table public.messages
  add column thread_id uuid references public.messages (id) on delete cascade,
  add column thread_count integer not null default 0,
  add column thread_last_at timestamptz;
create index messages_thread_idx on public.messages (thread_id, created_at) where thread_id is not null;

-- Le fil reste dans le salon de son message racine, et on ne crée pas de fil dans un fil
create or replace function private.check_thread_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.thread_id is not null and not exists (
    select 1 from public.messages
    where id = new.thread_id and channel_id = new.channel_id and thread_id is null
  ) then
    raise exception 'fil_invalide';
  end if;
  return new;
end
$$;

create trigger on_message_thread_check
  before insert on public.messages
  for each row execute function private.check_thread_reply();

-- Compteur et date de dernière réponse sur le message racine
create or replace function private.refresh_thread_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid := coalesce(new.thread_id, old.thread_id);
begin
  if v_root is null then
    return null;
  end if;
  update public.messages
  set thread_count = (select count(*) from public.messages where thread_id = v_root),
      thread_last_at = (select max(created_at) from public.messages where thread_id = v_root)
  where id = v_root;
  return null;
end
$$;

create trigger on_message_thread_stats
  after insert or delete on public.messages
  for each row execute function private.refresh_thread_stats();

-- Notification : auteur du message racine et participants du fil
-- (après on_message_mentions, par ordre alphabétique : une personne mentionnée n'est pas notifiée deux fois)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('mention', 'everyone', 'card_assigned', 'review_comment', 'thread_reply'));

create or replace function private.notify_thread_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server uuid;
  v_project uuid;
begin
  if new.thread_id is null then
    return new;
  end if;
  select server_id, project_id into v_server, v_project from public.channels where id = new.channel_id;

  insert into public.notifications (user_id, type, actor_id, server_id, project_id, channel_id, message_id, excerpt)
  select r.user_id, 'thread_reply', new.author_id, v_server, v_project, new.channel_id, new.id,
         left(regexp_replace(new.content, '<@[0-9a-f-]{36}>', '@…', 'g'), 200)
  from (
    select author_id as user_id from public.messages where id = new.thread_id
    union select author_id from public.messages where thread_id = new.thread_id and id <> new.id
  ) r
  where r.user_id <> new.author_id
    and not exists (select 1 from public.notifications n where n.message_id = new.id and n.user_id = r.user_id)
    and (private.channel_permissions(r.user_id, new.channel_id) & private.perm('VIEW_CHANNEL')) <> 0;

  return new;
end
$$;

create trigger on_message_thread_reply
  after insert on public.messages
  for each row execute function private.notify_thread_reply();

-- ─── Non lus ────────────────────────────────────────────────────────────────

alter table public.read_states add column last_read_at timestamptz not null default now();

-- Salons visibles ayant des messages d'autres personnes depuis la dernière lecture
-- (has_unread), et/ou des mentions non lues — y compris dans un fil (mention_count)
create or replace function public.my_unread()
returns table (channel_id uuid, server_id uuid, project_id uuid, has_unread boolean, mention_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.channel_id, x.server_id, x.project_id, x.has_unread, x.mention_count
  from (
    select c.id as channel_id, c.server_id, c.project_id,
           exists (
             select 1 from public.messages m
             where m.channel_id = c.id
               and m.thread_id is null
               and m.author_id <> (select auth.uid())
               and m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
           ) as has_unread,
           (select count(*)::integer from public.notifications n
            where n.user_id = (select auth.uid()) and n.channel_id = c.id and n.read_at is null
              and n.type in ('mention', 'everyone', 'thread_reply')) as mention_count
    from public.channels c
    left join public.read_states rs on rs.channel_id = c.id and rs.user_id = (select auth.uid())
  ) x
  where (x.has_unread or x.mention_count > 0)
    and private.has_channel_perm(x.channel_id, private.perm('VIEW_CHANNEL'))
$$;
revoke execute on function public.my_unread() from public, anon;
grant execute on function public.my_unread() to authenticated;

grant execute on all functions in schema private to authenticated, service_role;
