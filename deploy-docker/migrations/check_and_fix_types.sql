-- =====================================================
-- VERIFICAR E CORRIGIR TIPOS DE DADOS
-- =====================================================
-- Execute este script para verificar os tipos de dados
-- e criar a tabela unidades com o tipo correto
-- =====================================================

-- 1. Verificar tipo da coluna id na tabela implantacoes
SELECT 
  table_name,
  column_name, 
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'implantacoes' 
  AND column_name = 'id';

-- 2. Verificar se a tabela unidades já existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'unidades'
) AS unidades_exists;

-- =====================================================
-- OPÇÃO A: Se implantacoes.id for UUID
-- =====================================================
-- Use o script original: create_unidades_table.sql
-- (mudando implantacao_id de BIGINT para UUID)

-- =====================================================
-- OPÇÃO B: Se implantacoes.id for BIGINT
-- =====================================================
-- Use a versão com BIGINT (já corrigida):

DROP TABLE IF EXISTS public.unidades CASCADE;

CREATE TABLE public.unidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  implantacao_id BIGINT NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  
  torre TEXT,
  andar TEXT,
  nome_unidade TEXT NOT NULL,
  tipo TEXT,
  area TEXT,
  valor TEXT,
  
  id_pre_cadastro TEXT,
  cliente TEXT,
  documento TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  
  situacao TEXT DEFAULT 'Disponível' CHECK (situacao IN ('Disponível', 'Reservada', 'Bloqueada')),
  
  coord_x TEXT,
  coord_y TEXT,
  
  etapa TEXT,
  bloco TEXT,
  area_privativa TEXT,
  tipologia TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unidades_implantacao_row_unique UNIQUE(implantacao_id, row_index)
);

CREATE INDEX idx_unidades_implantacao ON public.unidades(implantacao_id);
CREATE INDEX idx_unidades_situacao ON public.unidades(situacao);
CREATE INDEX idx_unidades_nome ON public.unidades(nome_unidade);
CREATE INDEX idx_unidades_cliente ON public.unidades(cliente);
CREATE INDEX idx_unidades_row_index ON public.unidades(row_index);
CREATE INDEX idx_unidades_implantacao_row ON public.unidades(implantacao_id, row_index);

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

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública de unidades" ON public.unidades;
CREATE POLICY "Permitir leitura pública de unidades"
  ON public.unidades FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insert autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir insert autenticado de unidades"
  ON public.unidades FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Permitir update autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir update autenticado de unidades"
  ON public.unidades FOR UPDATE
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Permitir delete autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir delete autenticado de unidades"
  ON public.unidades FOR DELETE
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

COMMENT ON TABLE public.unidades IS 'Tabela de unidades das implantações, sincronizada bidirecionalmente com Google Sheets';
COMMENT ON COLUMN public.unidades.row_index IS 'Número da linha no Google Sheets (base 1), usado para sincronização';
COMMENT ON COLUMN public.unidades.situacao IS 'Status: Disponível, Reservada ou Bloqueada';
COMMENT ON COLUMN public.unidades.coord_x IS 'Coordenada X (%) para exibição no mapa';
COMMENT ON COLUMN public.unidades.coord_y IS 'Coordenada Y (%) para exibição no mapa';
