-- ============================================
-- SCHEMA COMPLETO SUPABASE - Simulador Implantação
-- ============================================

-- 1) Extensions
create extension if not exists pgcrypto;

-- ============================================
-- 2) TABELA DE USUÁRIOS (vinculada ao auth.users)
-- ============================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text default 'user', -- 'admin', 'user', 'corretor'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para criar usuário automaticamente quando criar no auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 3) TABELAS PRINCIPAIS
-- ============================================

-- Implantações (projetos)
create table if not exists public.implantacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  url text not null,
  tamanho_ponto integer default 15,
  endereco text,
  cidade text,
  estado text,
  cvcrm_id text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clientes (pré-cadastros)
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  id_pre_cadastro text,
  nome text,
  documento text,
  corretor text,
  imobiliaria text,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_clientes_idpre on public.clientes (id_pre_cadastro);

-- Unidades
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  row_index integer,
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
create index if not exists idx_unidades_implantacao on public.unidades (implantacao_id);
create index if not exists idx_unidades_rowindex_implantacao on public.unidades (row_index, implantacao_id);

-- Histórico (log de ações)
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
create index if not exists idx_historico_implantacao on public.historico (implantacao_id);
create index if not exists idx_historico_unidade on public.historico (unidade_nome);

-- Funil
create table if not exists public.funil (
  id uuid primary key default gen_random_uuid(),
  id_pre text,
  unit_name text,
  corretor text,
  implantacao_id uuid references public.implantacoes(id) on delete set null,
  created_at timestamptz default now()
);

-- Config
create table if not exists public.config (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- ============================================
-- 4) TRIGGERS PARA UPDATED_AT
-- ============================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

create trigger trg_implantacoes_updated_at
  before update on public.implantacoes
  for each row execute procedure public.set_updated_at();

create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute procedure public.set_updated_at();

create trigger trg_unidades_updated_at
  before update on public.unidades
  for each row execute procedure public.set_updated_at();

-- ============================================
-- 5) ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS
alter table public.users enable row level security;
alter table public.unidades enable row level security;
alter table public.historico enable row level security;
alter table public.clientes enable row level security;
alter table public.implantacoes enable row level security;
alter table public.funil enable row level security;
alter table public.config enable row level security;

-- Políticas para USERS
create policy "Users podem ver seu próprio perfil"
  on public.users for select
  using (auth.uid() = id);

create policy "Users podem atualizar seu próprio perfil"
  on public.users for update
  using (auth.uid() = id);

-- Políticas para IMPLANTACOES (todos autenticados podem ler)
create policy "Usuários autenticados podem ler implantações"
  on public.implantacoes for select
  using (auth.role() = 'authenticated');

-- Políticas para UNIDADES (todos autenticados podem ler e modificar)
create policy "Usuários autenticados podem ler unidades"
  on public.unidades for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir unidades"
  on public.unidades for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar unidades"
  on public.unidades for update
  using (auth.role() = 'authenticated');

-- Políticas para CLIENTES
create policy "Usuários autenticados podem ler clientes"
  on public.clientes for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir clientes"
  on public.clientes for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar clientes"
  on public.clientes for update
  using (auth.role() = 'authenticated');

-- Políticas para HISTORICO
create policy "Usuários autenticados podem ler histórico"
  on public.historico for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir histórico"
  on public.historico for insert
  with check (auth.role() = 'authenticated');

-- Políticas para FUNIL
create policy "Usuários autenticados podem ler funil"
  on public.funil for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir funil"
  on public.funil for insert
  with check (auth.role() = 'authenticated');

-- Políticas para CONFIG
create policy "Usuários autenticados podem ler config"
  on public.config for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar config"
  on public.config for update
  using (auth.role() = 'authenticated');

-- ============================================
-- 6) VIEWS ÚTEIS
-- ============================================
create or replace view public.unidades_flat as
select 
  u.*, 
  i.nome as implantacao_nome, 
  i.url as implantacao_url
from public.unidades u
left join public.implantacoes i on i.id = u.implantacao_id;

-- ============================================
-- 7) FUNÇÕES AUXILIARES
-- ============================================
create or replace function public.backfill_implantacao_ids()
returns void language plpgsql as $$
begin
  update public.unidades u
  set implantacao_id = i.id
  from public.implantacoes i
  where i.nome = (select nome from public.implantacoes where i.id = i.id limit 1)
  and u.implantacao_id is null;
end;
$$;

-- ============================================
-- FIM DO SCHEMA
-- ============================================
