# Sistema de Monitoramento de PIX em Tempo Real

## 📋 Visão Geral

O sistema agora monitora automaticamente o status dos pagamentos PIX no Supabase e exibe uma animação quando o pagamento é confirmado.

## 🎯 Funcionalidades

### 1. **Salvamento no Supabase**
- Quando um PIX é gerado, os dados são salvos na tabela `historico_pix`
- Status inicial: `PENDENTE`
- Campos salvos: `identificador`, `cliente`, `unidade`, `valor`, `payload_emv`, etc.

### 2. **Monitoramento em Tempo Real**
- O modal PIX verifica a cada 3 segundos se o status mudou no Supabase
- Quando detecta `status_pagamento = 'PAGO'`, mostra a animação
- Modal fecha automaticamente após 4 segundos

### 3. **Sincronização com Google Sheets**
- Endpoint `/api/pix/update-status` atualiza tanto Supabase quanto Sheets
- Backup automático em caso de falha no Sheets

## 🚀 Configuração

### 1. Criar a Tabela no Supabase

Execute o SQL no Supabase SQL Editor:

```bash
# Arquivo: backend/migrations/create_historico_pix_table.sql
```

Ou execute via linha de comando:

```sql
-- Copie todo o conteúdo do arquivo create_historico_pix_table.sql
```

### 2. Verificar Variáveis de Ambiente

```env
SUPABASE_URL=https://xedjenxobpxhuoqqteed.supabase.co
SUPABASE_SERVICE_ROLE=sua-service-role-key
SUPABASE_KEY=sua-anon-key
```

## 🧪 Como Testar

### Método 1: Teste Manual (Recomendado)

1. **Gere um PIX no frontend:**
   - Abra o modal de PIX em qualquer unidade
   - Preencha o valor e gere o QR Code
   - Anote o `identificador` que aparece no console do navegador

2. **Simule o pagamento:**
   ```bash
   cd backend
   node test-pix-payment.js <IDENTIFICADOR_PIX>
   ```

3. **Veja a animação:**
   - A animação aparecerá automaticamente no modal
   - O modal fecha após 4 segundos

### Método 2: Atualizar via API

```bash
curl -X POST http://localhost:3001/api/pix/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "identificador": "DLQD01CASA01_12345",
    "status": "PAGO",
    "dataPagamento": "2026-01-15T10:30:00Z"
  }'
```

### Método 3: Atualizar Direto no Supabase

1. Acesse o Supabase Dashboard
2. Vá em `Table Editor` > `historico_pix`
3. Encontre o registro pelo `identificador`
4. Altere `status_pagamento` de `PENDENTE` para `PAGO`
5. Clique em Save
6. A animação aparecerá automaticamente no frontend

## 📊 Estrutura da Tabela historico_pix

```sql
historico_pix (
  id                  uuid PRIMARY KEY
  implantacao_id      uuid REFERENCES implantacoes(id)
  implantacao_nome    text
  cliente             text
  unidade             text
  identificador       text UNIQUE NOT NULL  -- ID do PIX do Santander
  payload_emv         text NOT NULL         -- QR Code payload
  valor               numeric(12,2) NOT NULL
  status_pagamento    text DEFAULT 'PENDENTE'  -- PENDENTE, PAGO, CANCELADO
  data_criacao        timestamptz DEFAULT now()
  data_pagamento      timestamptz
  created_at          timestamptz DEFAULT now()
  updated_at          timestamptz DEFAULT now()
)
```

## 🔄 Fluxo Completo

```
1. Usuário gera PIX no frontend
   ↓
2. PixModal.tsx chama handleGenerateQr()
   ↓
3. API Santander retorna identificador + payload
   ↓
4. onConfirm salva no Supabase (historico_pix)
   ↓
5. PixModal inicia monitoramento (polling a cada 3s)
   ↓
6. Webhook do Santander/Sistema externo atualiza status para PAGO
   ↓
7. PixModal detecta mudança
   ↓
8. Exibe animação de sucesso
   ↓
9. Modal fecha automaticamente após 4s
```

## 🎨 Animação de Sucesso

A animação inclui:
- ✅ Checkmark animado com bounce
- 💚 Cor verde (accent-green)
- 📝 Mensagem "Pagamento Confirmado!"
- ⏱️ Fecha automaticamente em 4 segundos

## 🔧 Troubleshooting

### Animação não aparece?

1. **Verifique o console do navegador:**
   ```
   🔍 Iniciando monitoramento do PIX: <identificador>
   ✅ PIX PAGO! Mostrando animação...
   ```

2. **Verifique o Supabase:**
   - O registro existe na tabela `historico_pix`?
   - O `status_pagamento` está como `PAGO`?
   - O `identificador` está correto?

3. **Verifique as permissões RLS:**
   ```sql
   -- Teste a query manualmente
   SELECT * FROM historico_pix 
   WHERE identificador = 'SEU_IDENTIFICADOR';
   ```

### PIX não está sendo salvo?

1. **Verifique o console do navegador:**
   ```
   ✅ PIX salvo com sucesso no Supabase: { identificador, cliente, unidade, valor }
   ```

2. **Verifique as políticas RLS:**
   - Usuário está autenticado?
   - Políticas de INSERT estão ativas?

## 📝 Logs Úteis

### Frontend (Console do Navegador)
```
Dados do cliente carregados do Supabase: {...}
Request Body enviado para API: {...}
🔍 Iniciando monitoramento do PIX: <identificador>
✅ PIX PAGO! Mostrando animação...
🛑 Parando monitoramento do PIX
```

### Backend (Terminal)
```
✅ PIX atualizado no Supabase: {...}
✅ Status atualizado no Google Sheets: Linha X
```

## 🚨 Notas Importantes

1. **Polling vs Realtime**: Atualmente usa polling (3s). Para produção, considere usar Supabase Realtime Subscriptions
2. **Google Sheets**: É usado como backup, não como fonte principal
3. **Rate Limiting**: Polling de 3s é seguro para o free tier do Supabase
4. **Identificador**: Deve ser único. Format: `{SIGLA}{UNIDADE}_{TIMESTAMP}`

## 📚 Próximos Passos

- [ ] Implementar Supabase Realtime (WebSockets) ao invés de polling
- [ ] Adicionar notificação sonora quando PIX for pago
- [ ] Criar dashboard de PIX pendentes/pagos
- [ ] Implementar webhook do Santander para atualização automática
