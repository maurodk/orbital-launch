-- Adiciona tipo de pagamento e observacao opcional aos pagamentos
ALTER TABLE public.pagamentos
ADD COLUMN IF NOT EXISTS tipo_pagamento text,
ADD COLUMN IF NOT EXISTS observacao text;

COMMENT ON COLUMN public.pagamentos.tipo_pagamento IS 'Modo do pagamento: presencial ou remoto';
COMMENT ON COLUMN public.pagamentos.observacao IS 'Observacao opcional informada no registro do pagamento';

UPDATE public.pagamentos
SET tipo_pagamento = 'presencial'
WHERE tipo_pagamento IS NULL;