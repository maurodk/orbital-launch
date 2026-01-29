-- ============================================================
-- Script para remover a chave 'implantacaoAtual' da tabela config
-- ============================================================
-- 
-- Contexto: A implantação atual agora é armazenada no localStorage
-- de cada usuário, não mais na tabela config compartilhada.
--
-- Este script é OPCIONAL. A chave 'implantacaoAtual' simplesmente
-- será ignorada pelo backend, então não há problema em deixá-la lá.
-- ============================================================

-- 1. Remover a linha 'implantacaoAtual' da tabela config (OPCIONAL)
DELETE FROM config 
WHERE key = 'implantacaoAtual';

-- 2. Verificar se a linha foi removida
SELECT * FROM config WHERE key = 'implantacaoAtual';
-- Resultado esperado: Nenhuma linha retornada

-- ============================================================
-- Notas:
-- - Este script é seguro de executar múltiplas vezes
-- - Não afeta outras configurações da tabela config
-- - A funcionalidade continuará funcionando mesmo sem executar este script
-- ============================================================
