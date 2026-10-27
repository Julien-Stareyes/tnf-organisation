-- Organisation TNF — revue des rendus (vidéos et images) avec commentaires image par image

create type public.review_status as enum ('in_review', 'changes_requested', 'approved');

create table public.review_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status public.review_status not null default 'in_review',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create index review_assets_project_idx on public.review_assets (project_id, updated_at desc);

create table public.review_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  project_id uuid not null,
  version integer not null default 1,
  storage_path text not null,
  thumbnail_path text,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime text not null,
  size bigint not null check (size >= 0),
  duration double precision,
  width integer,
  height integer,
  fps numeric(6, 3) not null default 25 check (fps > 0 and fps <= 240),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (asset_id, project_id) references public.review_assets (id, project_id) on delete cascade,
  unique (asset_id, version),
  unique (id, asset_id)
);
create index review_versions_asset_idx on public.review_versions (asset_id, version desc);

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  asset_id uuid not null,
  project_id uuid not null,
  parent_id uuid references public.review_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  -- secondes depuis le début (null = commentaire général, ou image fixe)
  timecode double precision check (timecode is null or timecode >= 0),
  -- annotations : [{ color, width, points: [[x, y], ...] }] en coordonnées 0..1
  drawing jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  foreign key (version_id, asset_id) references public.review_versions (id, asset_id) on delete cascade
);
create index review_comments_version_idx on public.review_comments (version_id, timecode);

-- ─── Triggers ───────────────────────────────────────────────────────────────

-- Numéro de version attribué par la base (v1, v2…), et rendu remonté en tête de liste
create or replace function private.assign_review_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := coalesce((select max(version) from public.review_versions where asset_id = new.asset_id), 0) + 1;
  update public.review_assets set updated_at = now(), status = 'in_review' where id = new.asset_id;
  return new;
end
$$;

create trigger on_review_version_insert
  before insert on public.review_versions
  for each row execute function private.assign_review_version();

-- Seul l'auteur modifie le texte d'un commentaire ; tout le monde peut le marquer résolu
create or replace function private.guard_review_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version_id <> old.version_id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'commentaire_immuable';
  end if;
  if (new.body is distinct from old.body or new.drawing is distinct from old.drawing or new.timecode is distinct from old.timecode) then
    if old.author_id <> (select auth.uid()) then
      raise exception 'commentaire_autrui';
    end if;
    new.edited_at := now();
  end if;
  return new;
end
$$;

create trigger on_review_comment_update
  before update on public.review_comments
  for each row execute function private.guard_review_comment();

-- ─── Accès ──────────────────────────────────────────────────────────────────
-- Lecture et commentaires : tous ceux qui voient le projet, clients compris.
-- Envoi de versions et suppression : l'équipe (pas les clients).

create or replace function private.can_view_reviews(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_project_perm(p_project, private.perm('VIEW_CHANNEL'))
$$;

alter table public.review_assets enable row level security;
alter table public.review_versions enable row level security;
alter table public.review_comments enable row level security;

create policy "review_assets_select" on public.review_assets for select to authenticated
  using (private.can_view_reviews(project_id));
create policy "review_assets_insert" on public.review_assets for insert to authenticated
  with check (private.can_use_board(project_id) and created_by = (select auth.uid()));
-- Les clients peuvent changer le statut (approuver, demander des corrections)
create policy "review_assets_update" on public.review_assets for update to authenticated
  using (private.can_view_reviews(project_id))
  with check (private.can_view_reviews(project_id));
create policy "review_assets_delete" on public.review_assets for delete to authenticated
  using (private.can_use_board(project_id));

create policy "review_versions_select" on public.review_versions for select to authenticated
  using (private.can_view_reviews(project_id));
create policy "review_versions_insert" on public.review_versions for insert to authenticated
  with check (private.can_use_board(project_id) and uploaded_by = (select auth.uid()));
create policy "review_versions_update" on public.review_versions for update to authenticated
  using (private.can_use_board(project_id))
  with check (private.can_use_board(project_id));
create policy "review_versions_delete" on public.review_versions for delete to authenticated
  using (private.can_use_board(project_id));

create policy "review_comments_select" on public.review_comments for select to authenticated
  using (private.can_view_reviews(project_id));
create policy "review_comments_insert" on public.review_comments for insert to authenticated
  with check (private.can_view_reviews(project_id) and author_id = (select auth.uid()));
create policy "review_comments_update" on public.review_comments for update to authenticated
  using (private.can_view_reviews(project_id))
  with check (private.can_view_reviews(project_id));
create policy "review_comments_delete" on public.review_comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.can_use_board(project_id));

alter publication supabase_realtime add table public.review_assets, public.review_versions, public.review_comments;

-- ─── Fichiers : bucket privé "reviews", chemin "<project_id>/<asset_id>/<version_id>/<fichier>" ─

insert into storage.buckets (id, name, public)
values ('reviews', 'reviews', false)
on conflict (id) do nothing;

create policy "reviews_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'reviews' and private.can_view_reviews(private.try_uuid((storage.foldername(name))[1])));
create policy "reviews_files_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'reviews' and private.can_use_board(private.try_uuid((storage.foldername(name))[1])));
create policy "reviews_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reviews' and private.can_use_board(private.try_uuid((storage.foldername(name))[1])));

-- ─── Notifications de nouveau commentaire ───────────────────────────────────

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('mention', 'everyone', 'card_assigned', 'review_comment'));
alter table public.notifications
  add column review_asset_id uuid references public.review_assets (id) on delete cascade,
  add column review_comment_id uuid references public.review_comments (id) on delete cascade;

-- Préviennent : l'auteur du rendu, l'auteur du commentaire parent et ceux qui ont déjà commenté
create or replace function private.notify_review_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server uuid;
  v_title text;
begin
  select p.server_id, a.title into v_server, v_title
  from public.review_assets a join public.projects p on p.id = a.project_id
  where a.id = new.asset_id;

  insert into public.notifications (user_id, type, actor_id, server_id, project_id, review_asset_id, review_comment_id, excerpt)
  select r.user_id, 'review_comment', new.author_id, v_server, new.project_id, new.asset_id, new.id,
         left(v_title || ' — ' || new.body, 200)
  from (
    select created_by as user_id from public.review_assets where id = new.asset_id
    union select author_id from public.review_comments where asset_id = new.asset_id and id <> new.id
    union select author_id from public.review_comments where id = new.parent_id
  ) r
  where r.user_id is not null
    and r.user_id <> new.author_id
    and (private.project_permissions(r.user_id, new.project_id) & private.perm('VIEW_CHANNEL')) <> 0;

  return new;
end
$$;

create trigger on_review_comment_insert
  after insert on public.review_comments
  for each row execute function private.notify_review_comment();

grant execute on all functions in schema private to authenticated, service_role;
