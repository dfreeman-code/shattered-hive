-- The Shattered Hive private per-user campaign saves.
-- Migration is additive: it never reads or changes existing browser-local campaign data.
create table if not exists public.shattered_hive_cloud_saves (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shattered_hive_cloud_saves enable row level security;
revoke all on public.shattered_hive_cloud_saves from public, anon;
grant select on public.shattered_hive_cloud_saves to authenticated;

drop policy if exists "Cloud owner can read" on public.shattered_hive_cloud_saves;
drop policy if exists "Cloud owner can insert" on public.shattered_hive_cloud_saves;
drop policy if exists "Cloud owner can update" on public.shattered_hive_cloud_saves;
create policy "Cloud owner can read"
  on public.shattered_hive_cloud_saves for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Cloud owner can insert"
  on public.shattered_hive_cloud_saves for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Cloud owner can update"
  on public.shattered_hive_cloud_saves for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- SECURITY DEFINER is required because authenticated clients have SELECT only.
-- The RPC is restricted to the authenticated role and every operation is scoped
-- to auth.uid(). The function never accepts an owner_id from the caller.
-- Do not grant INSERT/UPDATE on this table directly: that would bypass CAS.
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
     or not (document ? 'npcs') or not (document ? 'quests') then
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
  return new_revision; -- NULL means another device has newer campaign data
end;
$$;

revoke all on function public.shattered_hive_store(bigint,jsonb) from public, anon;
grant execute on function public.shattered_hive_store(bigint,jsonb) to authenticated;
