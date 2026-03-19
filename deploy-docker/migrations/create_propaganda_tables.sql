create table if not exists public.propaganda_campaigns (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text,
  storage_folder text,
  media_type text not null check (media_type in ('image', 'gif', 'svg', 'mp4')),
  media_url text not null,
  media_path text,
  duration_seconds integer not null default 15 check (duration_seconds > 0),
  transition_style text not null default 'architectural-curtain',
  transition_media_type text check (transition_media_type in ('image', 'gif', 'svg', 'mp4')),
  transition_media_url text,
  transition_media_path text,
  transition_entry_media_type text check (transition_entry_media_type in ('image', 'gif', 'svg', 'mp4')),
  transition_entry_media_url text,
  transition_entry_media_path text,
  transition_exit_media_type text check (transition_exit_media_type in ('image', 'gif', 'svg', 'mp4')),
  transition_exit_media_url text,
  transition_exit_media_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.propaganda_runtime (
  scope text primary key default 'global',
  status text not null default 'idle' check (status in ('idle', 'playing', 'paused')),
  active_campaign_id bigint references public.propaganda_campaigns(id) on delete set null,
  active_campaign_name text,
  active_storage_folder text,
  active_media_type text check (active_media_type in ('image', 'gif', 'svg', 'mp4')),
  active_media_url text,
  active_media_path text,
  active_transition_style text not null default 'architectural-curtain',
  active_transition_media_type text check (active_transition_media_type in ('image', 'gif', 'svg', 'mp4')),
  active_transition_media_url text,
  active_transition_media_path text,
  active_transition_entry_media_type text check (active_transition_entry_media_type in ('image', 'gif', 'svg', 'mp4')),
  active_transition_entry_media_url text,
  active_transition_entry_media_path text,
  active_transition_exit_media_type text check (active_transition_exit_media_type in ('image', 'gif', 'svg', 'mp4')),
  active_transition_exit_media_url text,
  active_transition_exit_media_path text,
  active_duration_seconds integer not null default 15,
  playback_token text,
  trigger_source text default 'manual',
  started_at timestamptz,
  ends_at timestamptz,
  schedule_enabled boolean not null default false,
  schedule_campaign_id bigint references public.propaganda_campaigns(id) on delete set null,
  interval_minutes integer check (interval_minutes is null or interval_minutes > 0),
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.propaganda_runtime (scope)
values ('global')
on conflict (scope) do nothing;

alter table public.propaganda_runtime enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'propaganda_runtime'
      and policyname = 'propaganda_runtime_public_select'
  ) then
    create policy propaganda_runtime_public_select
      on public.propaganda_runtime
      for select
      using (true);
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.propaganda_runtime;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

insert into storage.buckets (id, name, public)
values ('propagandas', 'propagandas', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'propagandas_public_read'
  ) then
    create policy propagandas_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'propagandas');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'propagandas_authenticated_insert'
  ) then
    create policy propagandas_authenticated_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'propagandas');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'propagandas_authenticated_update'
  ) then
    create policy propagandas_authenticated_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'propagandas');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'propagandas_authenticated_delete'
  ) then
    create policy propagandas_authenticated_delete
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'propagandas');
  end if;
end $$;