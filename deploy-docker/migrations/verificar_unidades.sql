-- =====================================================
-- SCRIPT DE LIMPEZA E PREPARAÇÃO
-- =====================================================
-- Execute este script ANTES de rodar o endpoint de sincronização
-- para garantir que a tabela está pronta para receber os dados
-- =====================================================

-- 1. Limpar dados antigos (OPCIONAL - use apenas se quiser resetar)
-- CUIDADO: Isso vai apagar todos os dados da tabela unidades!
-- Descomente apenas se tiver certeza:
-- TRUNCATE TABLE public.unidades RESTART IDENTITY CASCADE;

-- 2. Verificar se há unidades cadastradas
SELECT 
  i.nome AS implantacao,
  COUNT(u.id) AS total_unidades,
  COUNT(CASE WHEN u.situacao = 'Disponível' THEN 1 END) AS disponiveis,
  COUNT(CASE WHEN u.situacao = 'Reservada' THEN 1 END) AS reservadas,
  COUNT(CASE WHEN u.situacao = 'Bloqueada' THEN 1 END) AS bloqueadas
FROM public.implantacoes i
LEFT JOIN public.unidades u ON u.implantacao_id = i.id
GROUP BY i.nome
ORDER BY i.nome;

-- 3. Verificar estrutura da tabela
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'unidades'
ORDER BY ordinal_position;

-- 4. Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'unidades';

-- =====================================================
-- APÓS RODAR ESTE SCRIPT
-- =====================================================
-- Você pode usar o endpoint do backend para sincronizar:
-- POST /api/sync-sheet-to-supabase
-- Body: {
--   "implantacao": "nome-da-implantacao"
-- }
-- 
-- Ou pode criar um script Node.js que lê o Sheets e insere no Supabase
-- =====================================================
