-- Cloud Sync 2.0: bounded, private, revision-addressed recovery snapshots.
-- Additive migration: does not alter or erase any existing campaign save.
create table if not exists public.shattered_hive_save_history (
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  created_at timestamptz not null default now(),
  payload jsonb not null,
  pc_count integer not null default 0,
  npc_count integer not null default 0,
  map_count integer not null default 0,
  primary key (owner_id, revision)
);
alter table public.shattered_hive_save_history enable row level security;
revoke all on public.shattered_hive_save_history from public, anon, authenticated;
grant select on public.shattered_hive_save_history to authenticated;
drop policy if exists "Cloud owner reads own recovery history" on public.shattered_hive_save_history;
create policy "Cloud owner reads own recovery history" on public.shattered_hive_save_history
  for select to authenticated using (owner_id = (select auth.uid()));

-- Seed the currently stored revision, so existing campaigns have a recovery baseline.
insert into public.shattered_hive_save_history(owner_id,revision,created_at,payload,pc_count,npc_count,map_count)
select owner_id,revision,updated_at,payload,
  case when jsonb_typeof(payload->'pcs')='array' then jsonb_array_length(payload->'pcs') else 0 end,
  case when jsonb_typeof(payload->'npcs')='array' then jsonb_array_length(payload->'npcs') else 0 end,
  case when jsonb_typeof(payload->'maps'->'scenes')='array' then jsonb_array_length(payload->'maps'->'scenes') else 0 end
from public.shattered_hive_cloud_saves
on conflict (owner_id,revision) do nothing;

-- Keep the existing RPC signature and optimistic-concurrency behavior.
-- Each accepted update adds one recovery snapshot in the SAME transaction.
-- Rejected stale writes never create snapshots or overwrite existing data.
create or replace function public.shattered_hive_store(
  expected_revision bigint, document jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_revision bigint;
begin
  if caller is null then raise exception 'Sign in is required.'; end if;
  if document is null or jsonb_typeof(document) <> 'object'
    or not (document ? 'campaign') or jsonb_typeof(document->'campaign') <> 'object'
    or jsonb_typeof(document->'pcs') <> 'array'
    or jsonb_typeof(document->'npcs') <> 'array'
    or jsonb_typeof(document->'quests') <> 'array' then
    raise exception 'Invalid campaign data.';
  end if;
  if octet_length(document::text) > 6000000 then
    raise exception 'Campaign exceeds 6 MB cloud document limit. Export a JSON backup instead.';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid expected revision.';
  end if;
  if expected_revision = 0 then
    insert into public.shattered_hive_cloud_saves(owner_id,revision,payload)
      values (caller,1,document)
      on conflict (owner_id) do nothing
      returning revision into new_revision;
  else
    update public.shattered_hive_cloud_saves
      set payload=document, revision=revision+1, updated_at=now()
      where owner_id=caller and revision=expected_revision
      returning revision into new_revision;
  end if;
  if new_revision is not null then
    insert into public.shattered_hive_save_history(owner_id,revision,payload,pc_count,npc_count,map_count)
      values (caller,new_revision,document,
        jsonb_array_length(document->'pcs'),
        jsonb_array_length(document->'npcs'),
        case when jsonb_typeof(document->'maps'->'scenes')='array'
          then jsonb_array_length(document->'maps'->'scenes') else 0 end);
    -- Bounded retention: keep newest 30 including current; older versions
    -- are intentionally pruned. Keep external JSON exports for long-term archives.
    delete from public.shattered_hive_save_history
    where owner_id=caller and revision not in (
      select revision from public.shattered_hive_save_history
      where owner_id=caller order by revision desc limit 30
    );
  end if;
  return new_revision; -- NULL signals a conflict
end;
$$;
revoke all on function public.shattered_hive_store(bigint,jsonb) from public, anon;
grant execute on function public.shattered_hive_store(bigint,jsonb) to authenticated;
