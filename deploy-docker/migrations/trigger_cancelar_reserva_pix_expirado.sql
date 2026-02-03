-- ============================================
-- Trigger para cancelar reserva quando PIX expira
-- ============================================

-- Função que será executada quando um PIX mudar para EXPIRADO
CREATE OR REPLACE FUNCTION cancelar_reserva_pix_expirado()
RETURNS TRIGGER AS $$
DECLARE
  implantacao_nome_var TEXT;
  unidade_nome_var TEXT;
  cliente_nome_var TEXT;
BEGIN
  -- Verifica se o status mudou para EXPIRADO
  IF NEW.status_pagamento = 'EXPIRADO' AND (OLD.status_pagamento IS NULL OR OLD.status_pagamento != 'EXPIRADO') THEN
    
    -- Busca o nome da implantação
    SELECT nome INTO implantacao_nome_var
    FROM public.implantacoes
    WHERE id = NEW.implantacao_id;
    
    -- Registra no log
    RAISE NOTICE 'PIX expirado detectado: ID=%, Implantação=%, Cliente=%, Unidade=%', 
      NEW.id, implantacao_nome_var, NEW.cliente, NEW.unidade;
    
    -- Chama a função para notificar o backend via HTTP
    -- O backend fará o cancelamento da reserva
    PERFORM net.http_post(
      url := 'https://apitelaodigital.suportevca.com.br/api/internal/cancel-expired-pix',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', current_setting('app.internal_notify_secret', true)
      ),
      body := jsonb_build_object(
        'pix_id', NEW.id,
        'implantacao', implantacao_nome_var,
        'cliente', NEW.cliente,
        'unidade', NEW.unidade,
        'valor', NEW.valor,
        'identificador', NEW.identificador
      )
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o trigger
DROP TRIGGER IF EXISTS trigger_pix_expirado ON public.historico_pix;

CREATE TRIGGER trigger_pix_expirado
  AFTER UPDATE ON public.historico_pix
  FOR EACH ROW
  WHEN (NEW.status_pagamento = 'EXPIRADO')
  EXECUTE FUNCTION cancelar_reserva_pix_expirado();

-- Comentário
COMMENT ON FUNCTION cancelar_reserva_pix_expirado() IS 'Função que cancela automaticamente a reserva quando um PIX expira';

-- ============================================
-- NOTA: Esta trigger usa a extensão pg_net do Supabase
-- Se pg_net não estiver habilitada, execute: CREATE EXTENSION IF NOT EXISTS pg_net;
-- ============================================
