alter table if exists public.propaganda_campaigns
  add column if not exists storage_folder text,
  add column if not exists transition_entry_media_type text,
  add column if not exists transition_entry_media_url text,
  add column if not exists transition_entry_media_path text,
  add column if not exists transition_exit_media_type text,
  add column if not exists transition_exit_media_url text,
  add column if not exists transition_exit_media_path text;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_entry_media_type_check
    check (transition_entry_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_exit_media_type_check
    check (transition_exit_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;

alter table if exists public.propaganda_runtime
  add column if not exists active_storage_folder text,
  add column if not exists active_transition_entry_media_type text,
  add column if not exists active_transition_entry_media_url text,
  add column if not exists active_transition_entry_media_path text,
  add column if not exists active_transition_exit_media_type text,
  add column if not exists active_transition_exit_media_url text,
  add column if not exists active_transition_exit_media_path text;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_entry_media_type_check
    check (active_transition_entry_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_exit_media_type_check
    check (active_transition_exit_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;