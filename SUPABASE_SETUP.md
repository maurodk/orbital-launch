# 🚀 Setup Supabase - Guia Rápido

## 1️⃣ Executar Schema no Supabase

1. Acesse: https://supabase.com/dashboard/project/xedjenxobpxhuoqqteed
2. Vá em **SQL Editor** (menu lateral)
3. Clique em **New Query**
4. Cole todo o conteúdo do arquivo: `backend/migrations/supabase_schema_complete.sql`
5. Clique em **Run** (ou pressione Ctrl+Enter)

## 2️⃣ Criar Usuários no Auth

### Via Dashboard (Recomendado):
1. Vá em **Authentication** > **Users**
2. Clique em **Add user** > **Create new user**
3. Preencha:
   - Email: `usuario@exemplo.com`
   - Password: `senha123`
   - Auto Confirm User: ✅ (marcar)
4. Clique em **Create user**

### Via SQL (Alternativo):
```sql
-- Criar usuário admin
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@vcaconstrutora.com.br',
  crypt('vcadmin123', gen_salt('bf')),
  now(),
  '{"full_name": "Administrador VCA"}'::jsonb,
  now(),
  now()
);
```

## 3️⃣ Verificar Tabelas Criadas

Execute no SQL Editor:
```sql
-- Ver todas as tabelas
select table_name 
from information_schema.tables 
where table_schema = 'public';

-- Ver usuários criados
select id, email, created_at from public.users;
```

## 4️⃣ Testar Autenticação

No frontend, faça login com o usuário criado. O sistema deve:
- ✅ Autenticar via Supabase Auth
- ✅ Criar registro automático na tabela `public.users` (via trigger)
- ✅ Permitir acesso às outras tabelas (via RLS)

## 📋 Estrutura de Tabelas

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema (vinculado ao auth.users) |
| `implantacoes` | Projetos/empreendimentos |
| `unidades` | Unidades dos projetos |
| `clientes` | Clientes/pré-cadastros |
| `historico` | Log de ações |
| `funil` | Funil de vendas |
| `config` | Configurações do sistema |

## 🔐 Políticas RLS Configuradas

- ✅ Usuários autenticados podem ler/escrever em todas as tabelas
- ✅ Usuários só podem ver/editar seu próprio perfil
- ✅ Service role (backend) bypassa RLS automaticamente

## ⚠️ Importante

- As chaves no `.env` já estão configuradas
- O trigger `on_auth_user_created` cria automaticamente o registro em `public.users` quando um usuário é criado no Auth
- Não é necessário criar usuários manualmente na tabela `public.users`
