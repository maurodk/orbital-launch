-- ============================================
-- Criar table de pagamentos separada
-- ============================================

-- Criar table pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  unidade text not null,
  valor_unidade numeric,
  dia_vencimento integer,
  plano_padrao text,
  valor_total numeric, -- Alterado de 'valor' para 'valor_total'
  valor_pix numeric default 0,
  valor_dinheiro numeric default 0,
  valor_cartao numeric default 0,
  valor_cheque numeric default 0,
  tipo_venda text,
  status text default 'pendente', -- pendente, processado, erro
  data_criacao timestamptz default now(),
  data_processamento timestamptz,
  erro_msg text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Garantir colunas caso a tabela já exista (para migração)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pagamentos' AND column_name='valor_total') THEN
        ALTER TABLE public.pagamentos RENAME COLUMN valor TO valor_total;
    END IF;

    ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS valor_pix numeric default 0;
    ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS valor_dinheiro numeric default 0;
    ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS valor_cartao numeric default 0;
    ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS valor_cheque numeric default 0;
END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_id ON public.pagamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_unidade ON public.pagamentos(unidade);

-- Comentários para documentação
COMMENT ON TABLE public.pagamentos IS 'Dados de pagamento e plano para cada reserva de cliente';
COMMENT ON COLUMN public.pagamentos.cliente_id IS 'Foreign key para tabela clientes';
COMMENT ON COLUMN public.pagamentos.unidade IS 'Nome da unidade reservada';
COMMENT ON COLUMN public.pagamentos.valor_unidade IS 'Valor total da unidade em R$';
COMMENT ON COLUMN public.pagamentos.dia_vencimento IS 'Dia escolhido para vencimentos do Plano 1 (5, 15 ou 25).';
COMMENT ON COLUMN public.pagamentos.plano_padrao IS 'Plano de pagamento (Plano 1, Plano 2, Plano 3)';
COMMENT ON COLUMN public.pagamentos.valor_total IS 'Soma de todos os pagamentos (PIX + Outros)';
COMMENT ON COLUMN public.pagamentos.valor_pix IS 'Valor pago via PIX';
COMMENT ON COLUMN public.pagamentos.valor_dinheiro IS 'Valor pago em Dinheiro';
COMMENT ON COLUMN public.pagamentos.valor_cartao IS 'Valor pago em Cartão';
COMMENT ON COLUMN public.pagamentos.valor_cheque IS 'Valor pago em Cheque';
COMMENT ON COLUMN public.pagamentos.tipo_venda IS 'Tipo de venda (cef, facilita)';
COMMENT ON COLUMN public.pagamentos.status IS 'Status do processamento (pendente, processado, erro)';
