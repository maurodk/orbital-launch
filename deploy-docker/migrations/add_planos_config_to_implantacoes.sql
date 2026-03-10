-- Migration: Adicionar coluna planos_config à tabela implantacoes
-- Esta coluna armazena a configuração de planos de pagamento disponíveis para cada empreendimento.
-- Formato JSONB: { "habilitado": true/false, "planos": ["plano1","plano2",...] }
-- Quando habilitado=false ou null, o fluxo do worker NÃO será executado após a reserva.
-- Quando habilitado=true, apenas os planos listados em "planos" estarão disponíveis no PaymentModal.

ALTER TABLE public.implantacoes
ADD COLUMN IF NOT EXISTS planos_config jsonb DEFAULT NULL;

COMMENT ON COLUMN public.implantacoes.planos_config IS 'Configuração de planos de pagamento do empreendimento. JSON: { habilitado: bool, planos: string[] }';
