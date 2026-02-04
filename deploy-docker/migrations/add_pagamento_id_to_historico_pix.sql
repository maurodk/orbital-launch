-- ============================================
-- Adicionar campo pagamento_id à tabela historico_pix
-- para controlar quando um PIX foi utilizado em um pagamento
-- ============================================

-- 1. Adicionar coluna pagamento_id (nullable, pois PIX pode existir sem estar vinculado a pagamento)
ALTER TABLE public.historico_pix 
ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE SET NULL;

-- 2. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_historico_pix_pagamento_id 
ON public.historico_pix(pagamento_id);

-- 3. Adicionar comentário para documentação
COMMENT ON COLUMN public.historico_pix.pagamento_id IS 'ID do pagamento que utilizou este PIX. NULL = PIX ainda não foi utilizado em nenhum plano de pagamento';

-- 4. Verificar estrutura atualizada
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'historico_pix'
  AND column_name IN ('id', 'cliente', 'unidade', 'valor', 'status_pagamento', 'pagamento_id')
ORDER BY ordinal_position;

-- 5. Query de exemplo: PIX pagos mas ainda não utilizados (disponíveis para uso)
SELECT 
    cliente,
    unidade,
    valor,
    data_pagamento,
    status_pagamento,
    pagamento_id
FROM public.historico_pix
WHERE status_pagamento = 'PAGO'
  AND pagamento_id IS NULL -- PIX não vinculado a nenhum pagamento
ORDER BY data_pagamento DESC;

-- 6. Query de exemplo: PIX já utilizados em pagamentos
SELECT 
    h.cliente,
    h.unidade,
    h.valor,
    h.data_pagamento,
    p.id as pagamento_id,
    p.status as status_pagamento,
    p.data_processamento
FROM public.historico_pix h
INNER JOIN public.pagamentos p ON h.pagamento_id = p.id
WHERE h.status_pagamento = 'PAGO'
  AND h.pagamento_id IS NOT NULL
ORDER BY h.data_pagamento DESC;
