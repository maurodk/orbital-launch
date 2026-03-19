alter table if exists public.propaganda_campaigns
  add column if not exists media_muted boolean not null default false,
  add column if not exists media_volume numeric(4,3) not null default 1,
  add column if not exists transition_media_muted boolean not null default false,
  add column if not exists transition_media_volume numeric(4,3) not null default 1,
  add column if not exists transition_entry_muted boolean not null default false,
  add column if not exists transition_entry_volume numeric(4,3) not null default 1,
  add column if not exists transition_exit_muted boolean not null default false,
  add column if not exists transition_exit_volume numeric(4,3) not null default 1;

alter table if exists public.propaganda_runtime
  add column if not exists active_media_muted boolean not null default false,
  add column if not exists active_media_volume numeric(4,3) not null default 1,
  add column if not exists active_transition_media_muted boolean not null default false,
  add column if not exists active_transition_media_volume numeric(4,3) not null default 1,
  add column if not exists active_transition_entry_muted boolean not null default false,
  add column if not exists active_transition_entry_volume numeric(4,3) not null default 1,
  add column if not exists active_transition_exit_muted boolean not null default false,
  add column if not exists active_transition_exit_volume numeric(4,3) not null default 1;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_media_volume_check
    check (media_volume >= 0 and media_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_media_volume_check
    check (transition_media_volume >= 0 and transition_media_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_entry_volume_check
    check (transition_entry_volume >= 0 and transition_entry_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_exit_volume_check
    check (transition_exit_volume >= 0 and transition_exit_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_media_volume_check
    check (active_media_volume >= 0 and active_media_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_media_volume_check
    check (active_transition_media_volume >= 0 and active_transition_media_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_entry_volume_check
    check (active_transition_entry_volume >= 0 and active_transition_entry_volume <= 1);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_exit_volume_check
    check (active_transition_exit_volume >= 0 and active_transition_exit_volume <= 1);
exception
  when duplicate_object then null;
end $$;