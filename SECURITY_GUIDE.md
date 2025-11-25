# 🔒 Guia de Segurança - Protegendo Credenciais

## ✅ O QUE FOI FEITO

### 1. `.gitignore` Criado no Backend

Agora os seguintes arquivos **NUNCA** serão commitados:

- ✅ `credentials.json`
- ✅ `serviceAccountKey.json`
- ✅ `.env`
- ✅ Arquivos `.pem` e `.key`

### 2. Template Criado

- ✅ `credentials.json.example` - Use como modelo

### 3. Arquivo Desnecessário Identificado

- ❌ `serviceAccountKey.json` - **NÃO É USADO** e pode ser deletado

---

## 🚨 AÇÕES IMEDIATAS NECESSÁRIAS

### 1️⃣ Revogar Chave Antiga (FEITO ✓)

Você já fez isso no Google Cloud Console.

### 2️⃣ Criar Nova Service Account Key

1. Acesse: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Selecione o projeto `upreemindemto`
3. Encontre a service account: `upreendimento@upreemindemto.iam.gserviceaccount.com`
4. Clique em **"Keys"** → **"Add Key"** → **"Create new key"**
5. Escolha **JSON**
6. Salve o arquivo como `credentials.json` no diretório `backend/`

### 3️⃣ Remover Arquivos Sensíveis do Git

```bash
# No diretório raiz do projeto
git rm --cached backend/credentials.json
git rm --cached backend/serviceAccountKey.json
git commit -m "Remove sensitive credentials from tracking"
git push
```

### 4️⃣ Verificar Histórico do GitHub

⚠️ **IMPORTANTE**: Os arquivos ainda estão no histórico do Git!

**Opções:**

#### Opção A: Limpar Histórico (Recomendado)

```bash
# Instalar BFG Repo-Cleaner
# Download: https://reclaimtheweb.org/git-bfg-repo-cleaner/

# Clonar mirror
git clone --mirror https://github.com/ti-vca-construtora/telao-digital.git

# Remover credenciais do histórico
java -jar bfg.jar --delete-files credentials.json telao-digital.git
java -jar bfg.jar --delete-files serviceAccountKey.json telao-digital.git

# Push forçado
cd telao-digital.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push
```

#### Opção B: Criar Novo Repositório (Mais Simples)

```bash
# 1. Fazer backup local do código
# 2. Criar novo repo no GitHub
# 3. Push apenas o código limpo (com .gitignore correto)
```

### 5️⃣ Deletar `serviceAccountKey.json`

Este arquivo **NÃO é usado** pelo código. Pode deletar:

```bash
rm backend/serviceAccountKey.json
```

---

## 📋 CHECKLIST DE SEGURANÇA

### Imediato

- [ ] Criar nova `credentials.json` no Google Cloud
- [ ] Substituir arquivo local
- [ ] Deletar `serviceAccountKey.json` (não usado)
- [ ] Remover do Git: `git rm --cached backend/*.json`
- [ ] Commit e push

### Longo Prazo

- [ ] Limpar histórico do Git com BFG ou criar novo repo
- [ ] Verificar se há outros secrets expostos
- [ ] Configurar GitHub Secrets para CI/CD
- [ ] Rotacionar chaves periodicamente (a cada 90 dias)

---

## 🛡️ BOAS PRÁTICAS PARA O FUTURO

### 1. Sempre Usar `.gitignore` ANTES de Commitar

```bash
# Verificar o que será commitado
git status

# Se aparecer credentials.json, PARE e adicione ao .gitignore
```

### 2. Usar Variáveis de Ambiente

Em vez de arquivos JSON, considere usar `.env`:

```env
GOOGLE_PROJECT_ID=upreemindemto
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_CLIENT_EMAIL=upreendimento@upreemindemto.iam.gserviceaccount.com
```

### 3. GitHub Secrets (Para CI/CD)

No GitHub:

1. Settings → Secrets → Actions
2. Adicionar: `GOOGLE_CREDENTIALS` (conteúdo do JSON)

### 4. Scanner de Secrets

Instale localmente:

```bash
npm install -g git-secrets
git secrets --install
git secrets --register-aws
```

---

## 🔧 COMO USAR NO DEPLOY

### Desenvolvimento Local

1. Copie `credentials.json.example` → `credentials.json`
2. Preencha com suas credenciais
3. Nunca commite o arquivo real

### EC2/AWS

```bash
# Via SCP
scp -i sua-chave.pem credentials.json ubuntu@34.204.204.81:/home/ubuntu/projects/telao-digital/backend/

# Ou criar manualmente via nano
nano ~/projects/telao-digital/backend/credentials.json
# Colar conteúdo
# Ctrl+X, Y, Enter
```

### Vercel/Netlify (Frontend)

Use variáveis de ambiente no dashboard da plataforma.

---

## ❓ FAQ

**Q: E se eu já dei push com credenciais?**
A: As credenciais estão no histórico do Git. Você DEVE:

1. Revogar as chaves antigas (✓ já fez)
2. Limpar o histórico com BFG ou criar novo repo

**Q: Posso usar o mesmo credentials.json em produção e dev?**
A: Tecnicamente sim, mas o ideal é ter Service Accounts separadas:

- `dev-service-account@projeto.iam.gserviceaccount.com`
- `prod-service-account@projeto.iam.gserviceaccount.com`

**Q: Como verificar se há mais secrets expostos?**
A: Use ferramentas:

```bash
# TruffleHog
docker run --rm -v $(pwd):/proj dxa4481/truffleHog file:///proj

# Gitleaks
gitleaks detect --source . --verbose
```

---

## 📞 PRÓXIMOS PASSOS

1. ✅ Criar nova chave no Google Cloud
2. ✅ Substituir `credentials.json` localmente
3. ✅ Deletar `serviceAccountKey.json`
4. ✅ `git rm --cached` nos arquivos sensíveis
5. ✅ Commit e push
6. ⚠️ Limpar histórico do Git (BFG ou novo repo)
7. ✅ Atualizar credenciais na EC2
8. ✅ Testar aplicação

---

## ⚠️ LEMBRETE IMPORTANTE

**Suas credenciais antigas ainda estão visíveis no histórico do GitHub!**

Qualquer pessoa pode acessar commits antigos e ver os arquivos.

**Você DEVE limpar o histórico ou criar um novo repositório.**
