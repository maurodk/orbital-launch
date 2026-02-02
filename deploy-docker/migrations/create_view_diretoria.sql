-- VIEW para Dashboard da Diretoria
-- Combina dados de pagamentos e unidades para facilitar análises
-- Filtra automaticamente pagamentos cancelados e unidades não reservadas

-- Primeiro, garantir que as colunas necessárias existam na tabela pagamentos
ALTER TABLE public.pagamentos 
  ADD COLUMN IF NOT EXISTS implantacao text,
  ADD COLUMN IF NOT EXISTS corretor text;

-- Criar índice nas novas colunas
CREATE INDEX IF NOT EXISTS idx_pagamentos_implantacao ON public.pagamentos(implantacao);
CREATE INDEX IF NOT EXISTS idx_pagamentos_corretor ON public.pagamentos(corretor);

-- Remover VIEW se já existir
DROP VIEW IF EXISTS public.view_diretoria_pagamentos CASCADE;

-- Criar VIEW com dados combinados
CREATE OR REPLACE VIEW public.view_diretoria_pagamentos AS
SELECT 
  p.id as pagamento_id,
  p.implantacao,
  p.unidade,
  p.cliente_id,
  c.nome as cliente,
  p.corretor,
  p.valor_unidade,
  p.valor_pix,
  p.valor_cartao,
  p.valor_dinheiro,
  p.valor_cheque,
  p.valor_total,
  p.status as status_pagamento,
  p.created_at as data_pagamento,
  u.id as unidade_id,
  u.situacao as situacao_unidade,
  u.tipologia,
  u.imobiliaria,
  u.bloco,
  u.etapa,
  i.id as implantacao_id,
  i.nome as implantacao_nome,
  -- Flag para indicar se o pagamento é válido para contabilização
  CASE 
    WHEN u.situacao = 'Reservada' 
      AND (p.status IS NULL OR LOWER(p.status) NOT IN ('cancelado', 'canceled'))
    THEN true
    ELSE false
  END as pagamento_valido
FROM 
  public.pagamentos p
LEFT JOIN 
  public.clientes c ON c.id = p.cliente_id
LEFT JOIN 
  public.implantacoes i ON i.nome = p.implantacao
LEFT JOIN 
  public.unidades u ON u.nome_unidade = p.unidade 
    AND u.implantacao_id = i.id
ORDER BY 
  p.created_at DESC;

-- Comentários na VIEW
COMMENT ON VIEW public.view_diretoria_pagamentos IS 'VIEW para dashboard da diretoria - combina pagamentos, unidades e implantações com flag de validade';

-- Garantir permissões
GRANT SELECT ON public.view_diretoria_pagamentos TO authenticated;
GRANT SELECT ON public.view_diretoria_pagamentos TO anon;

-- Criar índices nas tabelas base para otimizar a VIEW (se ainda não existirem)
CREATE INDEX IF NOT EXISTS idx_pagamentos_implantacao_unidade 
  ON public.pagamentos(implantacao, unidade);

CREATE INDEX IF NOT EXISTS idx_pagamentos_status 
  ON public.pagamentos(status);

CREATE INDEX IF NOT EXISTS idx_unidades_nome_unidade 
  ON public.unidades(nome_unidade);

CREATE INDEX IF NOT EXISTS idx_implantacoes_nome 
  ON public.implantacoes(nome);
