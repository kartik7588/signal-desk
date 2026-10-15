create table if not exists public.vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  envelope jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;
revoke all on table public.vaults from anon;
grant select, insert, update, delete on table public.vaults to authenticated;

create policy "Users can read their encrypted vault"
  on public.vaults for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their encrypted vault"
  on public.vaults for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their encrypted vault"
  on public.vaults for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their encrypted vault"
  on public.vaults for delete to authenticated
  using ((select auth.uid()) = user_id);
