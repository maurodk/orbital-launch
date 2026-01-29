-- =====================================================
-- MIGRAÇÃO: Adicionar colunas faltantes na tabela unidades
-- =====================================================
-- Este script adiciona as colunas necessárias que estão
-- sendo usadas pelo código mas não existem na tabela atual
-- =====================================================

-- 1. Adicionar colunas que estão faltando (se não existirem)

-- Coluna A: Torre
ALTER TABLE public.unidades 
ADD COLUMN IF NOT EXISTS torre TEXT;

-- Coluna B: Andar  
ALTER TABLE public.unidades 
ADD COLUMN IF NOT EXISTS andar TEXT;

-- Coluna D: Tipo (já existe como 'tipologia', criar alias ou renomear)
ALTER TABLE public.unidades 
ADD COLUMN IF NOT EXISTS tipo TEXT;

-- Coluna E: Area (já existe como 'area_privativa', criar alias)
ALTER TABLE public.unidades 
ADD COLUMN IF NOT EXISTS area TEXT;

-- Coluna F: Valor
ALTER TABLE public.unidades 
ADD COLUMN IF NOT EXISTS valor TEXT;

-- 2. Copiar dados existentes para as novas colunas (se houver)
UPDATE public.unidades 
SET tipo = tipologia 
WHERE tipo IS NULL AND tipologia IS NOT NULL;

UPDATE public.unidades 
SET area = area_privativa 
WHERE area IS NULL AND area_privativa IS NOT NULL;

-- 3. Garantir que situacao tenha valores corretos
ALTER TABLE public.unidades 
DROP CONSTRAINT IF EXISTS unidades_situacao_check;

ALTER TABLE public.unidades 
ADD CONSTRAINT unidades_situacao_check 
CHECK (situacao IN ('Disponível', 'Reservada', 'Bloqueada', 'disponivel', 'reservada', 'bloqueada') OR situacao IS NULL);

-- 4. Adicionar constraint para evitar duplicatas
ALTER TABLE public.unidades 
DROP CONSTRAINT IF EXISTS unidades_implantacao_row_unique;

ALTER TABLE public.unidades 
ADD CONSTRAINT unidades_implantacao_row_unique 
UNIQUE(implantacao_id, row_index);

-- 5. Criar índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_unidades_situacao ON public.unidades(situacao);
CREATE INDEX IF NOT EXISTS idx_unidades_nome ON public.unidades(nome_unidade);
CREATE INDEX IF NOT EXISTS idx_unidades_cliente ON public.unidades(cliente);

-- 6. Criar trigger para atualizar updated_at (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_unidades_updated_at ON public.unidades;
CREATE TRIGGER update_unidades_updated_at
  BEFORE UPDATE ON public.unidades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Comentários para documentação das novas colunas
COMMENT ON COLUMN public.unidades.torre IS 'Coluna A do Sheets - Torre/Bloco da unidade';
COMMENT ON COLUMN public.unidades.andar IS 'Coluna B do Sheets - Andar da unidade';
COMMENT ON COLUMN public.unidades.tipo IS 'Coluna D do Sheets - Tipo/Tipologia da unidade';
COMMENT ON COLUMN public.unidades.area IS 'Coluna E do Sheets - Área da unidade';
COMMENT ON COLUMN public.unidades.valor IS 'Coluna F do Sheets - Valor da unidade';
COMMENT ON COLUMN public.unidades.row_index IS 'Número da linha no Google Sheets (usado para sincronização)';

-- =====================================================
-- VERIFICAÇÃO
-- =====================================================
-- Para verificar se as colunas foram criadas:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'unidades' ORDER BY ordinal_position;
