-- MIGRAÇÃO: Adiciona coluna `implantacao_ref` para referenciar qual implantação é ativa para uma coordenada
-- Tipo: text (aceita nomes de implantação ou identificadores)

ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS implantacao_ref text;

COMMENT ON COLUMN public.unidades.implantacao_ref IS 'Referência à implantação que valida a coordenada (coluna Q nas planilhas)';
