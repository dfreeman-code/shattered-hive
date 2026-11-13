-- Run in your OWN Supabase project SQL editor. Do not put SQL credentials in GitHub.
-- Private per-account campaign document. All client writes go through revision-checked RPC.
create table if not exists public.shattered_hive_cloud_saves (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shattered_hive_cloud_saves enable row level security;
revoke all on public.shattered_hive_cloud_saves from public, anon, authenticated;
grant select on public.shattered_hive_cloud_saves to authenticated;

drop policy if exists "Read only my own campaign" on public.shattered_hive_cloud_saves;
create policy "Read only my own campaign"
  on public.shattered_hive_cloud_saves for select to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.shattered_hive_store(
  expected_revision bigint, document jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_revision bigint;
begin
  if caller is null then
    raise exception 'Sign in is required.';
  end if;
  if document is null or jsonb_typeof(document) <> 'object'
     or not (document ? 'campaign') or not (document ? 'pcs')
     or not (document ? 'npcs') then
    raise exception 'Invalid campaign data.';
  end if;
  if octet_length(document::text) > 6000000 then
    raise exception 'Campaign exceeds 6 MB cloud document limit. Export a JSON backup instead.';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid expected revision.';
  end if;
  insert into public.shattered_hive_cloud_saves (owner_id, revision, payload, updated_at)
  values (caller, 1, document, now())
  on conflict (owner_id) do update
    set payload = excluded.payload,
        revision = public.shattered_hive_cloud_saves.revision + 1,
        updated_at = now()
    where public.shattered_hive_cloud_saves.revision = expected_revision
  returning revision into new_revision;
  return new_revision; -- NULL signals another device updated the campaign first
end;
$$;

revoke all on function public.shattered_hive_store(bigint, jsonb) from public, anon;
grant execute on function public.shattered_hive_store(bigint, jsonb) to authenticated;

-- Verification: sign in as User A and User B in separate browsers.
-- Only each user's own row should be readable; attempts to upload with an old
-- expected_revision must return NULL instead of overwriting the newer row.
