-- MIGRAÇÃO: Adicionar colunas para coordenadas adicionais (coord_x_ad, coord_y_ad)
-- Uso: adicione este arquivo ao processo de migração do banco (Supabase/Postgres)

ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS coord_x_ad double precision;

ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS coord_y_ad double precision;

COMMENT ON COLUMN public.unidades.coord_x_ad IS 'Coordenada X para marcação adicional (coluna O na planilha)';
COMMENT ON COLUMN public.unidades.coord_y_ad IS 'Coordenada Y para marcação adicional (coluna P na planilha)';

-- Verificação rápida (executar manualmente se desejar):
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'unidades' AND column_name IN ('coord_x_ad','coord_y_ad');
