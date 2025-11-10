# Guia de Migração Firebase → Supabase

## 1. Obter as Chaves do Supabase

Acesse: https://supabase.com/dashboard/project/xedjenxobpxhuoqqteed/settings/api

Copie:
- `anon` / `public` key
- `service_role` / `secret` key

## 2. Atualizar Variáveis de Ambiente

### Backend (.env)
```
SUPABASE_URL=https://xedjenxobpxhuoqqteed.supabase.co
SUPABASE_SERVICE_ROLE=<sua_service_role_key>
```

### Frontend (.env)
```
VITE_SUPABASE_URL=https://xedjenxobpxhuoqqteed.supabase.co
VITE_SUPABASE_ANON_KEY=<sua_anon_key>
```

## 3. Criar Tabela de Usuários no Supabase

Execute no SQL Editor do Supabase:

```sql
-- Habilitar autenticação
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para criar usuário na tabela public ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 4. Criar Usuários no Supabase

Acesse: https://supabase.com/dashboard/project/xedjenxobpxhuoqqteed/auth/users

Clique em "Add user" e crie os usuários com email e senha.

## 5. Migrar Dados Existentes (se necessário)

Se você tem dados no Firebase que precisa migrar:

1. Exporte dados do Firebase
2. Importe para o Supabase usando SQL ou API

## 6. Remover Dependências do Firebase

```bash
cd frontend
npm uninstall firebase
```

Remova o arquivo: `frontend/firebaseConfig.ts`

## 7. Instalar Dependências do Supabase (se ainda não instalado)

```bash
cd frontend
npm install @supabase/supabase-js

cd ../backend
npm install @supabase/supabase-js
```

## 8. Testar a Aplicação

1. Inicie o backend: `cd backend && npm start`
2. Inicie o frontend: `cd frontend && npm run dev`
3. Teste o login com os usuários criados no Supabase

## Mudanças Implementadas

✅ Criado `supabaseClient.ts` com helpers de autenticação
✅ Atualizado `Login.tsx` para usar Supabase
✅ Atualizado `MainPage.tsx` para usar Supabase auth
✅ Removido imports do Firebase
✅ Atualizadas variáveis de ambiente

## Próximos Passos

1. Obtenha as chaves reais do Supabase
2. Atualize os arquivos .env com as chaves corretas
3. Crie os usuários no Supabase Auth
4. Remova o Firebase do projeto
5. Teste completamente o sistema de autenticação
