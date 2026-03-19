alter table if exists public.propaganda_campaigns
  add column if not exists media_path text,
  add column if not exists transition_media_type text,
  add column if not exists transition_media_url text,
  add column if not exists transition_media_path text;

do $$
begin
  alter table public.propaganda_campaigns
    add constraint propaganda_campaigns_transition_media_type_check
    check (transition_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;

alter table if exists public.propaganda_runtime
  add column if not exists active_media_path text,
  add column if not exists active_transition_media_type text,
  add column if not exists active_transition_media_url text,
  add column if not exists active_transition_media_path text;

do $$
begin
  alter table public.propaganda_runtime
    add constraint propaganda_runtime_active_transition_media_type_check
    check (active_transition_media_type in ('image', 'gif', 'svg', 'mp4'));
exception
  when duplicate_object then null;
end $$;