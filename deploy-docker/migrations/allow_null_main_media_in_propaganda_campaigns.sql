alter table public.propaganda_campaigns
  alter column media_type drop not null,
  alter column media_url drop not null;
