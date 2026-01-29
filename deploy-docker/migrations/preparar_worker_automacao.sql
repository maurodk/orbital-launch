-- =============================================================================
-- Script SQL para Preparar Tabela de Clientes para Worker de Automação
-- Execute este script no Supabase SQL Editor
-- =============================================================================

-- 1. Adicionar colunas necessárias para o worker (se não existirem)
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS unidade TEXT,
ADD COLUMN IF NOT EXISTS status_reserva TEXT DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS erro_automacao TEXT,
ADD COLUMN IF NOT EXISTS data_processamento TIMESTAMP WITH TIME ZONE;

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_clientes_status_reserva 
ON public.clientes USING btree (status_reserva);

CREATE INDEX IF NOT EXISTS idx_clientes_id_pre_cadastro 
ON public.clientes USING btree (id_pre_cadastro);

CREATE INDEX IF NOT EXISTS idx_clientes_unidade 
ON public.clientes USING btree (unidade);

-- 3. Adicionar comentários para documentação
COMMENT ON COLUMN public.clientes.unidade IS 'Nome da unidade que será reservada via automação';
COMMENT ON COLUMN public.clientes.status_reserva IS 'Status da automação: pendente (aguardando), processando (em execução), concluida (sucesso), erro (falhou)';
COMMENT ON COLUMN public.clientes.erro_automacao IS 'Descrição detalhada do erro caso status_reserva = erro';
COMMENT ON COLUMN public.clientes.data_processamento IS 'Data/hora em que a automação foi concluída (sucesso ou erro)';

-- 4. Verificar estrutura da tabela (após alterações)
SELECT 
    column_name, 
    data_type, 
    column_default, 
    is_nullable,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'clientes'
ORDER BY ordinal_position;

-- 5. Ver reservas pendentes (para testar o worker)
SELECT 
    id,
    implantacao_id,
    id_pre_cadastro,
    nome,
    documento,
    corretor,
    unidade,
    status,
    status_reserva,
    erro_automacao,
    data_processamento,
    created_at,
    updated_at
FROM public.clientes
WHERE status_reserva = 'pendente'
ORDER BY created_at DESC
LIMIT 20;

-- 6. Estatísticas de automação
SELECT 
    status_reserva,
    COUNT(*) as total,
    COUNT(CASE WHEN erro_automacao IS NOT NULL THEN 1 END) as com_erro,
    MAX(data_processamento) as ultimo_processamento,
    MIN(created_at) as primeiro_registro,
    MAX(created_at) as ultimo_registro
FROM public.clientes
WHERE status_reserva IS NOT NULL
GROUP BY status_reserva
ORDER BY 
    CASE status_reserva
        WHEN 'pendente' THEN 1
        WHEN 'processando' THEN 2
        WHEN 'concluida' THEN 3
        WHEN 'erro' THEN 4
        ELSE 5
    END;

-- 7. Ver últimas 10 reservas processadas com sucesso
SELECT 
    id,
    nome,
    unidade,
    corretor,
    data_processamento,
    created_at
FROM public.clientes
WHERE status_reserva = 'concluida'
ORDER BY data_processamento DESC
LIMIT 10;

-- 8. Ver reservas com erro (para debug)
SELECT 
    id,
    nome,
    unidade,
    corretor,
    erro_automacao,
    data_processamento,
    created_at
FROM public.clientes
WHERE status_reserva = 'erro'
ORDER BY data_processamento DESC
LIMIT 10;

-- 9. Limpar status de teste (OPCIONAL - use apenas se precisar resetar)
-- CUIDADO: Esta query atualiza registros existentes
-- Descomente apenas se souber o que está fazendo:
-- UPDATE public.clientes 
-- SET status_reserva = 'pendente', 
--     erro_automacao = NULL, 
--     data_processamento = NULL
-- WHERE status_reserva IN ('erro', 'processando');
