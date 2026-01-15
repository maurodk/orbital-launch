-- ============================================
-- CRIAR TABELA historico_pix NO SUPABASE
-- ============================================

-- Drop se existir
drop table if exists public.historico_pix cascade;

-- Criar tabela historico_pix
create table public.historico_pix (
  id uuid primary key default gen_random_uuid(),
  implantacao_id uuid references public.implantacoes(id) on delete set null,
  implantacao_nome text,
  cliente text,
  unidade text,
  identificador text unique not null, -- ID do PIX do Santander
  payload_emv text not null, -- QR Code payload
  valor numeric(12,2) not null,
  status_pagamento text default 'PENDENTE', -- PENDENTE, PAGO, CANCELADO
  data_criacao timestamptz default now(),
  data_pagamento timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices para performance
create index idx_historico_pix_implantacao on public.historico_pix (implantacao_id);
create index idx_historico_pix_identificador on public.historico_pix (identificador);
create index idx_historico_pix_cliente on public.historico_pix (cliente);
create index idx_historico_pix_unidade on public.historico_pix (unidade);
create index idx_historico_pix_status on public.historico_pix (status_pagamento);

-- Trigger para updated_at
create trigger trg_historico_pix_updated_at
  before update on public.historico_pix
  for each row execute procedure public.set_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
alter table public.historico_pix enable row level security;

-- Políticas para historico_pix
create policy "Usuários autenticados podem ler historico_pix"
  on public.historico_pix for select
  using (auth.role() = 'authenticated');

create policy "Usuários autenticados podem inserir historico_pix"
  on public.historico_pix for insert
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem atualizar historico_pix"
  on public.historico_pix for update
  using (auth.role() = 'authenticated');

-- ============================================
-- FIM DA MIGRATION
-- ============================================
