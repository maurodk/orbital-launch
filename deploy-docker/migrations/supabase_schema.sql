-- Supabase schema for "simulador_implantacao"
-- Run this in Supabase SQL editor (requires elevated permissions)

-- 1) Extensions (if not already present)
create extension if not exists pgcrypto;

-- 2) Table: implantacoes (projects / deployments)
create table if not exists public.implantacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  url text not null,
  tamanho_ponto integer default 16,
  endereco text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3) Table: clientes (pre-registrations / prospects)
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  id_pre_cadastro text, -- original spreadsheet id (optional)
  nome text,
  documento text,
  corretor text,
  imobiliaria text,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_clientes_idpre ON public.clientes (id_pre_cadastro);

-- 4) Table: unidades (units)
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  row_index integer, -- keep original spreadsheet row index for traceability
  etapa text,
  bloco text,
  nome_unidade text,
  area_privativa text,
  tipologia text,
  id_pre_cadastro text,
  cliente text,
  documento text,
  corretor text,
  imobiliaria text,
  situacao text,
  coord_x numeric(12,6),
  coord_y numeric(12,6),
  implantacao_id uuid references public.implantacoes(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_unidades_implantacao ON public.unidades (implantacao_id);
create index if not exists idx_unidades_rowindex_implantacao ON public.unidades (row_index, implantacao_id);

-- 5) Table: historico (log)
create table if not exists public.historico (
  id uuid primary key default gen_random_uuid(),
  timestamp_iso timestamptz default now(),
  data_formatada text,
  unidade_nome text,
  acao text,
  cliente text,
  corretor text,
  usuario text,
  implantacao_id uuid references public.implantacoes(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_historico_implantacao ON public.historico (implantacao_id);
create index if not exists idx_historico_unidade ON public.historico (unidade_nome);

-- 5.1) Table: funil (funnel)
create table if not exists public.funil (
  id uuid primary key default gen_random_uuid(),
  id_pre text,
  unit_name text,
  corretor text,
  implantacao_id uuid references public.implantacoes(id) on delete set null,
  created_at timestamptz default now()
);

-- 6) Table: config
create table if not exists public.config (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- 7) Publication for Realtime (if using replication-based realtime)
-- Supabase uses replication to implement realtime on public schema by default.
-- If you need a custom publication, uncomment and adapt below (requires superuser):
-- create publication simulador_pub for table public.unidades, public.historico, public.clientes, public.implantacoes;

-- 8) Trigger for updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_implantacoes_updated_at
  before update on public.implantacoes
  for each row execute procedure public.set_updated_at();

create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute procedure public.set_updated_at();

create trigger trg_unidades_updated_at
  before update on public.unidades
  for each row execute procedure public.set_updated_at();

-- 9) Example Row Level Security (RLS) policies
-- NOTE: This is an opinionated starting point. Adjust to your auth strategy.

-- Enable RLS on tables where appropriate
alter table public.unidades enable row level security;
alter table public.historico enable row level security;
alter table public.clientes enable row level security;
alter table public.implantacoes enable row level security;

-- 10) Function to help backfilling 'implantacao_id' from 'implantacoes.nome'
create or replace function public.backfill_implantacao_ids() returns void language plpgsql as $$
begin
  update public.unidades u
  set implantacao_id = i.id
  from public.implantacoes i
  where i.nome = (select nome from public.implantacoes where i.id = i.id limit 1)
  and u.implantacao_id is null;
end;
$$;

-- 11) Helpful view: unidades_flat (join implantacao name)
create or replace view public.unidades_flat as
select u.*, i.nome as implantacao_nome, i.url as implantacao_url
from public.unidades u
left join public.implantacoes i on i.id = u.implantacao_id;

-- 12) Notes
-- - After running this, review and remove permissive policies (public_read_*) and create stricter RLS rules that match your auth method.
-- - If you keep the backend as gatekeeper, you can set Supabase RLS to allow only the service_role to write (service_role bypasses RLS) and restrict anon to read only if desired.
-- - To enable realtime subscriptions for specific tables, you can use the Supabase UI to toggle "realtime" or create publications if necessary.

-- End of file
