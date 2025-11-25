# Migração para Supabase - Sistema de Implantações

## 📋 Resumo das Alterações

Este documento descreve as mudanças implementadas para migrar completamente da planilha do Google Sheets para o Supabase como fonte de dados para implantações (empreendimentos).

## 🗄️ Alterações no Banco de Dados

### 1. Schema Atualizado (`backend/migrations/supabase_schema_complete.sql`)

A tabela `implantacoes` foi atualizada com os seguintes campos:

- `id` (uuid) - Chave primária
- `nome` (text) - Nome do empreendimento (obrigatório, único)
- `url` (text) - URL da imagem de implantação
- `tamanho_ponto` (integer) - Tamanho padrão dos pontos (fixo em 15)
- `endereco` (text) - Endereço do empreendimento (obrigatório)
- `cidade` (text) - Cidade do empreendimento (obrigatório)
- `estado` (text) - Estado do empreendimento (obrigatório)
- `cvcrm_id` (text) - ID no CVCRM (opcional)
- `logo_url` (text) - URL do logo do empreendimento
- `created_at` e `updated_at` - Timestamps

### 2. Supabase Storage (`backend/migrations/supabase_storage_bucket.sql`)

Criado bucket público `implantacoes` para armazenar imagens de implantações com políticas de:

- Upload para usuários autenticados
- Leitura pública
- Atualização e exclusão para usuários autenticados

## 🔧 Backend - Novos Endpoints

### Arquivo: `backend/server.cjs`

#### Dependências Adicionadas

- `multer` - Para upload de arquivos
- `path` - Para manipulação de caminhos

#### Endpoints Implementados

1. **GET /api/implantacoes**

   - Lista todas as implantações
   - Ordenadas por data de criação (mais recentes primeiro)

2. **POST /api/implantacoes**

   - Cria nova implantação
   - Suporta upload de imagem via multipart/form-data
   - Campos obrigatórios: nome, endereço, cidade, estado
   - Campo opcional: cvcrm_id, imagem

3. **PUT /api/implantacoes/:id**

   - Atualiza implantação existente
   - Suporta upload de nova imagem
   - Mantém imagem anterior se nenhuma nova for enviada

4. **DELETE /api/implantacoes/:id**
   - Deleta implantação por ID

## 🎨 Frontend - Novos Componentes

### 1. Header (`frontend/components/Header.tsx`)

- Header fixo no topo da página
- Contém apenas logo e título
- Responsivo para mobile

### 2. HamburgerMenu (`frontend/components/HamburgerMenu.tsx`)

- Menu flutuante no canto superior direito
- Opções:
  - 📊 Histórico
  - 🗺️ Mapeamento
  - 🚪 Sair (logout)
- Animação de abertura/fechamento

### 3. NewImplantationModal (`frontend/components/NewImplantationModal.tsx`)

- Modal para criar novo empreendimento
- Campos:
  - Nome do Empreendimento (obrigatório)
  - Endereço (obrigatório)
  - Cidade (obrigatório)
  - Estado (obrigatório, select com todos os estados brasileiros)
  - ID no CVCRM (opcional)
  - Upload de Imagem (opcional)
- Validação de formulário
- Feedback de erro

### 4. EditImplantationModal (`frontend/components/EditImplantationModal.tsx`)

- Modal para editar empreendimento selecionado
- Mesmos campos do NewImplantationModal
- Preview da imagem atual
- Opção de substituir imagem

## 📱 Integração no MainPage

### Arquivo: `frontend/src/pages/MainPage.tsx`

#### Alterações na UI

1. **Header Simplificado**

   - Removido header antigo com logo e título
   - Adicionado novo componente `<Header />` fixo no topo

2. **Botão "+ Novo Lançamento"**

   - Posicionado no topo do conteúdo principal
   - Abre modal de criação de implantação

3. **Seleção de Empreendimento**

   - Mantido `<ImplantationSwitcher />`
   - Adicionado ícone de configuração (⚙️) ao lado
   - Ícone abre modal de edição do empreendimento selecionado

4. **Menu Hamburger**
   - Substituiu botões antigos de histórico e mapeamento
   - Adicionada opção de logout

#### Funções Adicionadas

- `fetchImplantations()` - Recarrega lista de implantações
- `handleOpenNewImplantation()` - Abre modal de criação
- `handleOpenEditImplantation()` - Abre modal de edição
- `handleImplantationSuccess()` - Callback após criar/editar
- `handleLogout()` - Realiza logout do usuário

## 📦 Instalação de Dependências

### Backend

```bash
cd backend
npm install multer
```

### Atualizar package.json

```json
"dependencies": {
  "@supabase/supabase-js": "^2.81.1",
  "cors": "^2.8.5",
  "dotenv": "^16.0.3",
  "express": "^4.18.2",
  "googleapis": "^118.0.0",
  "multer": "^1.4.5-lts.1",
  "node-fetch": "^2.7.0"
}
```

## 🚀 Deploy

### 1. Aplicar Migrations no Supabase

Execute os seguintes scripts SQL no Supabase SQL Editor:

1. `backend/migrations/supabase_schema_complete.sql`
2. `backend/migrations/supabase_storage_bucket.sql`

### 2. Atualizar Backend

```bash
cd backend
npm install
npm start
```

### 3. Atualizar Frontend

```bash
cd frontend
npm install
npm run dev
```

## ✅ Testes Recomendados

1. **Criar Novo Empreendimento**

   - Clicar em "+ Novo Lançamento"
   - Preencher todos os campos obrigatórios
   - Fazer upload de uma imagem
   - Verificar se aparece na lista

2. **Editar Empreendimento**

   - Selecionar um empreendimento
   - Clicar no ícone ⚙️
   - Modificar campos
   - Verificar se alterações foram salvas

3. **Upload de Imagem**

   - Criar/editar empreendimento com imagem
   - Verificar se imagem é exibida corretamente no mapa

4. **Menu Hamburger**
   - Testar navegação para histórico
   - Testar ativação do modo mapeamento
   - Testar logout

## 🔒 Configuração de Segurança

As políticas RLS (Row Level Security) já estão configuradas para:

- Permitir que usuários autenticados leiam todas as implantações
- Permitir que usuários autenticados criem, atualizem e deletem implantações

Se precisar restringir mais (ex: apenas admins podem criar/editar), atualize as políticas no Supabase.

## 📝 Notas Importantes

1. **Tamanho do Ponto**: Agora fixo em 15 (não aparece no modal)
2. **Imagens**: Armazenadas no Supabase Storage bucket "implantacoes"
3. **Config antiga**: A dependência da aba Config (key/value) foi removida. A seleção de empreendimento agora é armazenada localmente.
4. **Estados**: Lista completa de estados brasileiros disponível nos selects

## 🐛 Troubleshooting

### Erro de CORS ao fazer upload

Verifique se o bucket está configurado como público no Supabase Storage.

### Imagem não aparece

Verifique se as políticas de storage permitem leitura pública.

### Erro 401 ao criar/editar

Verifique se o token de autenticação está sendo enviado no header Authorization.

## 🎯 Próximos Passos Sugeridos

1. Adicionar paginação na lista de implantações (se houver muitos)
2. Adicionar busca/filtro de implantações
3. Adicionar confirmação antes de deletar
4. Adicionar preview da implantação antes de selecionar
5. Migrar dados das unidades também para o Supabase (se aplicável)

---

**Data da Implementação**: 25 de Novembro de 2025
**Versão**: 2.0.0
