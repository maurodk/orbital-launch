-- =====================================================
-- TABELA DE UNIDADES - COMPLETA E DEFINITIVA
-- =====================================================
-- Tabela que armazena todas as unidades das implantações
-- Sincronizada bidirecionalmente com Google Sheets
-- =====================================================

-- 1. Dropar tabela existente (se necessário)
-- CUIDADO: Isso apaga todos os dados! Use apenas se quiser recriar do zero
-- DROP TABLE IF EXISTS public.unidades CASCADE;

-- 2. Criar tabela de unidades
CREATE TABLE IF NOT EXISTS public.unidades (
  -- Identificador único
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Relacionamento com implantação (BIGINT para compatibilidade)
  implantacao_id BIGINT NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
  
  -- Número da linha no Google Sheets (usado para sincronização bidirecional)
  row_index INTEGER NOT NULL,
  
  -- Colunas A-F: Dados básicos da unidade
  etapa TEXT,                    -- Coluna A: Etapa (antiga: torre)
  bloco TEXT,                    -- Coluna B: Bloco (antiga: andar)
  nome_unidade TEXT NOT NULL,    -- Coluna C: Nome da Unidade
  tipo TEXT,                     -- Coluna D: Tipo/Tipologia
  area TEXT,                     -- Coluna E: Área
  valor TEXT,                    -- Coluna F: Valor
  
  -- Colunas G-K: Dados da reserva
  id_pre_cadastro TEXT,          -- Coluna G: ID Pré-Cadastro
  cliente TEXT,                  -- Coluna H: Cliente
  documento TEXT,                -- Coluna I: Documento (CPF/CNPJ)
  corretor TEXT,                 -- Coluna J: Corretor
  imobiliaria TEXT,              -- Coluna K: Imobiliária
  
  -- Coluna L: Status da unidade
  situacao TEXT DEFAULT 'Disponível' CHECK (situacao IN ('Disponível', 'Reservada', 'Bloqueada')),
  
  -- Colunas M-N: Coordenadas para exibição no mapa
  coord_x TEXT,                  -- Coluna M: Coordenada X (%)
  coord_y TEXT,                  -- Coluna N: Coordenada Y (%)
  
  -- Colunas O-R: Dados PIX (não implementado no Supabase ainda, mantido para compatibilidade)
  -- pix_identificador TEXT,     -- Coluna O
  -- pix_payload TEXT,           -- Coluna P
  -- pix_valor TEXT,             -- Coluna Q
  -- pix_pagamento TEXT,         -- Coluna R
  
  -- Coluna S: Símbolo/Letra (não implementado no Supabase ainda)
  -- simbolo TEXT,               -- Coluna S
  
  -- Colunas antigas mantidas para compatibilidade (podem ser removidas após migração completa)
  area_privativa TEXT,           -- Antiga estrutura (usar 'area' no lugar)
  tipologia TEXT,                -- Antiga estrutura (usar 'tipo' no lugar)
  
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint de unicidade: uma unidade por linha em cada implantação
  CONSTRAINT unidades_implantacao_row_unique UNIQUE(implantacao_id, row_index)
);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_unidades_implantacao ON public.unidades(implantacao_id);
CREATE INDEX IF NOT EXISTS idx_unidades_situacao ON public.unidades(situacao);
CREATE INDEX IF NOT EXISTS idx_unidades_nome ON public.unidades(nome_unidade);
CREATE INDEX IF NOT EXISTS idx_unidades_cliente ON public.unidades(cliente);
CREATE INDEX IF NOT EXISTS idx_unidades_row_index ON public.unidades(row_index);
CREATE INDEX IF NOT EXISTS idx_unidades_implantacao_row ON public.unidades(implantacao_id, row_index);

-- 4. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Criar trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_unidades_updated_at ON public.unidades;
CREATE TRIGGER update_unidades_updated_at
  BEFORE UPDATE ON public.unidades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Habilitar RLS (Row Level Security)
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

-- 7. Criar políticas de acesso
-- Permitir leitura pública
DROP POLICY IF EXISTS "Permitir leitura pública de unidades" ON public.unidades;
CREATE POLICY "Permitir leitura pública de unidades"
  ON public.unidades
  FOR SELECT
  USING (true);

-- Permitir insert/update/delete apenas para usuários autenticados
DROP POLICY IF EXISTS "Permitir insert autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir insert autenticado de unidades"
  ON public.unidades
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Permitir update autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir update autenticado de unidades"
  ON public.unidades
  FOR UPDATE
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Permitir delete autenticado de unidades" ON public.unidades;
CREATE POLICY "Permitir delete autenticado de unidades"
  ON public.unidades
  FOR DELETE
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 8. Comentários para documentação
COMMENT ON TABLE public.unidades IS 'Tabela de unidades das implantações, sincronizada bidirecionalmente com Google Sheets';
COMMENT ON COLUMN public.unidades.row_index IS 'Número da linha no Google Sheets (base 1), usado para sincronização';
COMMENT ON COLUMN public.unidades.situacao IS 'Status: Disponível, Reservada ou Bloqueada';
COMMENT ON COLUMN public.unidades.coord_x IS 'Coordenada X (%) para exibição no mapa';
COMMENT ON COLUMN public.unidades.coord_y IS 'Coordenada Y (%) para exibição no mapa';

-- =====================================================
-- QUERIES ÚTEIS
-- =====================================================

-- Ver estrutura da tabela
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'unidades' ORDER BY ordinal_position;

-- Ver todas as unidades de uma implantação
-- SELECT * FROM unidades WHERE implantacao_id = 'uuid-da-implantacao' ORDER BY row_index;

-- Contar unidades por status
-- SELECT situacao, COUNT(*) FROM unidades GROUP BY situacao;

-- Buscar unidade por row_index (sincronização)
-- SELECT * FROM unidades WHERE implantacao_id = 'uuid' AND row_index = 42;

