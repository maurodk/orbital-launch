-- Criar tabela para armazenar mapeamento visual dos blocos
CREATE TABLE IF NOT EXISTS public.blocos_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    implantacao_id UUID NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
    nome_bloco TEXT NOT NULL,
    -- Coordenadas do retângulo (percentuais 0-100)
    x DECIMAL(10, 3) NOT NULL,
    y DECIMAL(10, 3) NOT NULL,
    width DECIMAL(10, 3) NOT NULL,
    height DECIMAL(10, 3) NOT NULL,
    -- Camada (primary ou additional)
    implantacao_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(implantacao_id, nome_bloco, implantacao_ref)
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_blocos_mapping_implantacao ON public.blocos_mapping(implantacao_id);
CREATE INDEX IF NOT EXISTS idx_blocos_mapping_bloco ON public.blocos_mapping(nome_bloco);

-- RLS (Row Level Security)
ALTER TABLE public.blocos_mapping ENABLE ROW LEVEL SECURITY;

-- Política de leitura (todos podem ler)
CREATE POLICY "Allow public read access on blocos_mapping"
    ON public.blocos_mapping
    FOR SELECT
    USING (true);

-- Política de escrita (apenas autenticados)
CREATE POLICY "Allow authenticated insert on blocos_mapping"
    ON public.blocos_mapping
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on blocos_mapping"
    ON public.blocos_mapping
    FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete on blocos_mapping"
    ON public.blocos_mapping
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_blocos_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_blocos_mapping_timestamp
    BEFORE UPDATE ON public.blocos_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_blocos_mapping_updated_at();

COMMENT ON TABLE public.blocos_mapping IS 'Armazena o mapeamento visual (retângulos) dos blocos para exibição de status vendido';
COMMENT ON COLUMN public.blocos_mapping.x IS 'Coordenada X do canto superior esquerdo (percentual 0-100)';
COMMENT ON COLUMN public.blocos_mapping.y IS 'Coordenada Y do canto superior esquerdo (percentual 0-100)';
COMMENT ON COLUMN public.blocos_mapping.width IS 'Largura do retângulo (percentual)';
COMMENT ON COLUMN public.blocos_mapping.height IS 'Altura do retângulo (percentual)';
