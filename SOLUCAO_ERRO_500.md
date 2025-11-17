# Solução para Erro 500 no Backend

## Problema Identificado

O erro 500 está ocorrendo nos endpoints `/api/implantacoes` e `/api/config` porque:

1. **As variáveis de ambiente do Supabase não estão configuradas no servidor de produção (EC2)**
2. O middleware `verifyToken` está falhando ao tentar validar tokens do Supabase
3. O servidor pode não ter sido atualizado com a versão mais recente do código

## Sintomas

```
GET https://apitelaodigital.suportevca.com.br/api/implantacoes 500 (Internal Server Error)
GET https://apitelaodigital.suportevca.com.br/api/config 500 (Internal Server Error)
```

Frontend exibe: **"Falha ao carregar os dados da aplicação. Tente recarregar a página."**

## Solução - Passo a Passo

### 1. Verificar o Status do Servidor

Acesse: https://apitelaodigital.suportevca.com.br

A página inicial deve mostrar o status do servidor, incluindo se o Supabase está conectado.

**Se aparecer "✗ Não configurado"** próximo ao Supabase, siga para o passo 2.

### 2. Conectar ao Servidor EC2

```bash
# Conecte-se ao servidor via SSH (substitua pelos seus dados)
ssh -i "sua-chave.pem" ec2-user@apitelaodigital.suportevca.com.br
```

### 3. Atualizar o Código no Servidor

```bash
# Navegue até a pasta do backend
cd /caminho/para/telao-digital/backend

# Puxe as últimas alterações
git pull origin main

# Instale/atualize dependências (se necessário)
npm install
```

### 4. Verificar/Criar o Arquivo .env

```bash
# Verifique se o arquivo .env existe
ls -la .env

# Se não existir, crie:
nano .env
```

Adicione o seguinte conteúdo no arquivo `.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://xedjenxobpxhuoqqteed.supabase.co
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZGplbnhvYnB4aHVvcXF0ZWVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjY2NzU0MCwiZXhwIjoyMDc4MjQzNTQwfQ.sP3qP_8srs60NtHWNyn1Vy_qqtgaYFqKd2Epx332BY8

# Server Configuration
PORT=3000
ADMIN_PASSWORD=vcadmin123

# CVCRM API Configuration
CVCRM_API_BASE_URL=https://vca.cvcrm.com.br/api/v1/cv/mapadisponibilidade
CVCRM_API_EMAIL=carlos.mauricio@vcaconstrutora.com.br
CVCRM_API_TOKEN=b3eb66cff818914ff41d0e538301727f3345fdd6

# Botmaker Configuration
BOTMAKER_ACCESS_TOKEN=eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJPdMOhdmlvIE5ldG8iLCJidXNpbmVzc0lkIjoidmNhY29uc3RydXRvcmEiLCJuYW1lIjoiT3TDoXZpbyBOZXRvIiwiYXBpIjp0cnVlLCJpZCI6IkJiQURrVlVqOVZUNk95N0dOaVlOVDBlZEk3aTEiLCJleHAiOjE5MTU5OTUyMDAsImp0aSI6IkJiQURrVlVqOVZUNk95N0dOaVlOVDBlZEk3aTEifQ.0tb0bLkgIR-u9Z7mKJRBZ0WtzrrOHa03HYdKw1PfyXupQqhvi1VjAK8uNEl6MNTxJX_IUSqqagvx5DuTaeSA6w
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`

### 5. Verificar o arquivo credentials.json

```bash
# Verifique se o credentials.json existe
ls -la credentials.json

# Se não existir, copie do seu backup ou repositório
```

### 6. Reiniciar o Servidor

```bash
# Se estiver usando PM2
pm2 restart server.cjs

# Ou se estiver usando um serviço systemd
sudo systemctl restart telao-backend

# Ou simplesmente reinicie o processo Node
# (Ctrl+C para parar, depois:)
node server.cjs
```

### 7. Verificar os Logs

```bash
# Se usando PM2
pm2 logs server.cjs

# Ou verificar logs do sistema
tail -f /var/log/telao-backend.log
```

**O que procurar nos logs:**

- ✅ `[AUTH] Token verificado com sucesso para usuário: ...`
- ✅ `[/api/implantacoes] Busca concluída. Total: X`
- ✅ `[/api/config] Configurações carregadas: X chaves`

**Sinais de problema:**

- ❌ `Supabase não configurado`
- ❌ `[AUTH] Erro ao verificar token`
- ❌ `variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE não configuradas`

### 8. Testar a API

```bash
# Teste direto no servidor (sem autenticação - deve dar erro 401)
curl https://apitelaodigital.suportevca.com.br/api/implantacoes

# Ou acesse novamente a página inicial
# https://apitelaodigital.suportevca.com.br
```

### 9. Limpar Cache do Navegador

No navegador do usuário:

1. Pressione `Ctrl+Shift+R` (ou `Cmd+Shift+R` no Mac) para forçar recarregamento
2. Ou abra o DevTools (F12), vá em Application > Storage > Clear site data

### 10. Testar o Login no Frontend

1. Acesse: https://lancamentos.vcaconstrutora.com.br
2. Faça login
3. Aguarde o carregamento das implantações

---

## Diagnóstico Rápido

Se ainda estiver com problemas, execute este comando no servidor:

```bash
cd /caminho/para/telao-digital/backend
node -e "
require('dotenv').config();
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Configurado' : '✗ Não configurado');
console.log('SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? '✓ Configurado' : '✗ Não configurado');
"
```

---

## Alterações Feitas no Código (para referência)

1. **Melhorias no middleware `verifyToken`:**

   - Adicionados logs detalhados para debug
   - Retorno de mensagens de erro mais específicas

2. **Melhorias nos endpoints `/api/implantacoes` e `/api/config`:**

   - Adicionados logs de execução
   - Retorno de detalhes do erro na resposta

3. **Página inicial (/) melhorada:**
   - Exibe status do Supabase
   - Mostra se variáveis de ambiente estão configuradas

---

## Contato para Suporte

Se o problema persistir após seguir todos os passos:

1. Capturar screenshot da página https://apitelaodigital.suportevca.com.br
2. Copiar os logs do servidor (últimas 50 linhas)
3. Entrar em contato com o desenvolvedor

---

**Data:** 15/11/2025  
**Versão do documento:** 1.0
