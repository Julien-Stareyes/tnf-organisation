-- Organisation TNF — mode lent appliqué par la base (les modérateurs y échappent, comme sur Discord)

create or replace function private.enforce_slowmode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slowmode integer;
begin
  select slowmode_seconds into v_slowmode from public.channels where id = new.channel_id;
  if coalesce(v_slowmode, 0) = 0
    or private.has_channel_perm(new.channel_id, private.perm('MANAGE_MESSAGES'))
    or private.has_channel_perm(new.channel_id, private.perm('MANAGE_CHANNELS')) then
    return new;
  end if;

  if exists (
    select 1 from public.messages
    where channel_id = new.channel_id
      and author_id = new.author_id
      and created_at > now() - make_interval(secs => v_slowmode)
  ) then
    raise exception 'mode_lent' using hint = v_slowmode::text;
  end if;
  return new;
end
$$;

create trigger on_message_insert_slowmode
  before insert on public.messages
  for each row execute function private.enforce_slowmode();

grant execute on all functions in schema private to authenticated, service_role;
