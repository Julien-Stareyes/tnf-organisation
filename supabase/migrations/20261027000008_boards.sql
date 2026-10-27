-- Organisation TNF — kanban sur mesure et tableau blanc par projet (remplacent Trello et Miro)

alter table public.projects drop column miro_board_url, drop column trello_board_id;

-- ─── Kanban ─────────────────────────────────────────────────────────────────
-- position en double precision : on insère entre deux cartes sans renuméroter

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (id, project_id)
);
create index board_columns_project_idx on public.board_columns (project_id);

create table public.board_labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create index board_labels_project_idx on public.board_labels (project_id);

create table public.board_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  column_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  description text check (description is null or char_length(description) <= 10000),
  position double precision not null default 0,
  due_date date,
  label_ids uuid[] not null default '{}',
  assignee_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- une carte ne peut être que dans une colonne de son projet
  foreign key (column_id, project_id) references public.board_columns (id, project_id) on delete cascade
);
create index board_cards_project_idx on public.board_cards (project_id);
create index board_cards_column_idx on public.board_cards (column_id, position);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger on_board_card_update
  before update on public.board_cards
  for each row execute function private.touch_updated_at();

-- ─── Tableau blanc (Excalidraw) ─────────────────────────────────────────────

create table public.whiteboards (
  project_id uuid primary key references public.projects (id) on delete cascade,
  elements jsonb not null default '[]',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Images collées dans le tableau (data URL, ~5 Mo max par image)
create table public.whiteboard_files (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null check (char_length(id) <= 100),
  mime_type text not null check (char_length(mime_type) <= 100),
  data_url text not null check (char_length(data_url) <= 7000000),
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);

-- ─── Accès ──────────────────────────────────────────────────────────────────
-- Kanban et tableau blanc : équipe du projet (les clients n'y ont pas accès)

create or replace function private.can_use_board(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.project_permissions((select auth.uid()), p_project) = -1 then true
    else private.has_project_perm(p_project, private.perm('VIEW_CHANNEL'))
      and not exists (
        select 1 from public.project_members
        where project_id = p_project and user_id = (select auth.uid()) and project_role = 'client'
      )
  end
$$;

create or replace function private.can_manage_board(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_use_board(p_project)
    and private.has_project_perm(p_project, private.perm('MANAGE_CHANNELS'))
$$;

alter table public.board_columns enable row level security;
alter table public.board_labels enable row level security;
alter table public.board_cards enable row level security;
alter table public.whiteboards enable row level security;
alter table public.whiteboard_files enable row level security;

-- Colonnes : visibles par l'équipe, gérées par les leads/admins
create policy "board_columns_select" on public.board_columns for select to authenticated
  using (private.can_use_board(project_id));
create policy "board_columns_write" on public.board_columns for all to authenticated
  using (private.can_manage_board(project_id))
  with check (private.can_manage_board(project_id));

-- Étiquettes et cartes : toute l'équipe du projet
create policy "board_labels_select" on public.board_labels for select to authenticated
  using (private.can_use_board(project_id));
create policy "board_labels_write" on public.board_labels for all to authenticated
  using (private.can_use_board(project_id))
  with check (private.can_use_board(project_id));

create policy "board_cards_select" on public.board_cards for select to authenticated
  using (private.can_use_board(project_id));
create policy "board_cards_insert" on public.board_cards for insert to authenticated
  with check (private.can_use_board(project_id) and created_by = (select auth.uid()));
create policy "board_cards_update" on public.board_cards for update to authenticated
  using (private.can_use_board(project_id))
  with check (private.can_use_board(project_id));
create policy "board_cards_delete" on public.board_cards for delete to authenticated
  using (private.can_use_board(project_id));

create policy "whiteboards_select" on public.whiteboards for select to authenticated
  using (private.can_use_board(project_id));
create policy "whiteboards_insert" on public.whiteboards for insert to authenticated
  with check (private.can_use_board(project_id));
create policy "whiteboards_update" on public.whiteboards for update to authenticated
  using (private.can_use_board(project_id))
  with check (private.can_use_board(project_id));

create policy "whiteboard_files_select" on public.whiteboard_files for select to authenticated
  using (private.can_use_board(project_id));
create policy "whiteboard_files_insert" on public.whiteboard_files for insert to authenticated
  with check (private.can_use_board(project_id));

alter publication supabase_realtime add table public.board_columns, public.board_cards, public.board_labels;

-- ─── Modèle de projet : colonnes par défaut ─────────────────────────────────

create or replace function private.create_default_board(p_project uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.board_columns (project_id, name, color, position) values
    (p_project, 'À faire', '#6c6c78', 1024),
    (p_project, 'En cours', '#4fb3ff', 2048),
    (p_project, 'Review', '#f5b83d', 3072),
    (p_project, 'Livré', '#3ddc84', 4096);
  insert into public.board_labels (project_id, name, color) values
    (p_project, 'Urgent', '#f87168'),
    (p_project, 'Retour client', '#9f8fef'),
    (p_project, 'Bloqué', '#fea362');
$$;

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

  perform private.create_default_board(new.id);

  return new;
end
$$;

-- Projets existants
select private.create_default_board(id) from public.projects;

grant execute on all functions in schema private to authenticated, service_role;
