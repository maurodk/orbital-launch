-- ============================================
-- Adicionar coluna worker_id na tabela pagamentos
-- ============================================

-- Adiciona a coluna worker_id para rastrear qual worker processou o pagamento
ALTER TABLE public.pagamentos 
ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- Criar índice para melhorar performance de queries por worker
CREATE INDEX IF NOT EXISTS idx_pagamentos_worker_id ON public.pagamentos (worker_id);

-- Comentário explicativo
COMMENT ON COLUMN public.pagamentos.worker_id IS 'ID do worker (container/hostname) que processou este pagamento';

-- ============================================
-- FIM DA MIGRATION
-- ============================================
