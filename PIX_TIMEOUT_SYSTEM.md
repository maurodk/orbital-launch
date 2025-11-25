# Sistema de Timeout Automático de PIX

## Visão Geral

Sistema implementado para cancelar automaticamente reservas com PIX não pago após 60 minutos da geração.

## Como Funciona

### 1. Geração do PIX

Quando um PIX é gerado através do endpoint `/api/update-pix-data`:

- **Coluna N**: Identificador do PIX (txid longo do Santander)
- **Coluna O**: Payload EMV (QR Code)
- **Coluna P**: Valor do PIX
- **Coluna Q**: Status do Pagamento (`PENDENTE` ou `PAGO`)
- **Coluna R**: Timestamp ISO 8601 da geração do PIX (NOVO)

### 2. Verificação Automática

O servidor executa um job a cada **1 minuto** que:

1. Busca todas as implantações ativas
2. Para cada implantação, verifica todas as unidades
3. Identifica PIX com:
   - Status = `PENDENTE` (Coluna Q)
   - Timestamp válido (Coluna R)
4. Calcula o tempo decorrido desde a geração
5. Se passou **60 minutos ou mais**, executa o cancelamento automático

### 3. Cancelamento Automático

Quando um PIX expira, o sistema:

1. **Limpa os dados da unidade**:

   - Colunas F a R são resetadas
   - Status volta para `DISPONÍVEL` (Coluna K)

2. **Registra no histórico**:

   - Ação: `"Cancelada Automaticamente (PIX Expirado)"`
   - Cliente: Nome do cliente original
   - Corretor: Nome do corretor original
   - Usuário: `"Sistema"`
   - Timestamp: Data e hora do cancelamento

3. **Notifica em tempo real**:
   - Envia evento SSE para todos os clientes conectados
   - Frontend atualiza automaticamente a listagem de unidades
   - Contador visual desaparece quando a reserva é cancelada

## Interface do Usuário

### Contador Visual de PIX

Cada unidade com PIX pendente exibe um contador em tempo real na listagem:

- **Verde (⏱️ 59:30)**: Mais de 30 minutos restantes
- **Amarelo (⏱️ 15:45)**: Entre 10 e 30 minutos (com pulsação suave)
- **Vermelho (⏱️ 05:12)**: Menos de 10 minutos (com pulsação de alerta)
- **Cinza (⏰ Expirado)**: PIX expirado, aguardando cancelamento automático

O contador:

- Atualiza a cada segundo
- Aparece logo abaixo do status da unidade
- Muda de cor automaticamente conforme o tempo
- É visível para todos os usuários conectados

### Coluna de Status

A coluna de status agora exibe dois elementos quando há PIX pendente:

```
┌─────────────┐
│  RESERVADA  │ ← Status pill
├─────────────┤
│ ⏱️ 45:23   │ ← Contador PIX
└─────────────┘
```

## Estrutura de Dados

### Colunas da Planilha

| Coluna | Descrição         | Mantida no Cancelamento? |
| ------ | ----------------- | ------------------------ |
| F      | ID Pré-Cadastro   | ❌ Limpa                 |
| G      | Nome Cliente      | ❌ Limpa                 |
| H      | Documento         | ❌ Limpa                 |
| I      | Corretor          | ❌ Limpa                 |
| J      | Imobiliária       | ❌ Limpa                 |
| K      | Status            | ✅ Muda para DISPONÍVEL  |
| L      | **Coordenada X**  | ✅ **PRESERVADA**        |
| M      | **Coordenada Y**  | ✅ **PRESERVADA**        |
| N      | Identificador PIX | ❌ Limpa                 |
| O      | Payload EMV       | ❌ Limpa                 |
| P      | Valor             | ❌ Limpa                 |
| Q      | Status Pagamento  | ❌ Limpa                 |
| R      | Timestamp PIX     | ❌ Limpa                 |

### Limpeza Seletiva de Dados

```javascript
// Backend realiza duas operações separadas para preservar L e M
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
  resource: {
    data: [
      {
        range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`, // ID até Status
        values: [["", "", "", "", "", "DISPONÍVEL"]],
      },
      {
        range: `'${implantacao}'!N${rowIndex}:R${rowIndex}`, // PIX data
        values: [["", "", "", "", ""]],
      },
    ],
    valueInputOption: "USER_ENTERED",
  },
});
// Nota: Colunas L e M (coordenadas) NÃO são tocadas
```

```javascript
// Exemplo de timestamp armazenado:
"2025-11-16T14:30:00.000Z";

// Formato ISO 8601 (UTC)
```

### Cálculo de Expiração

```javascript
const now = new Date();
const pixDate = new Date(pixTimestamp);
const diffMinutes = (now - pixDate) / (1000 * 60);

if (diffMinutes >= 60) {
  // PIX expirado - cancelar reserva
}
```

## Componentes Frontend

### PixCountdown.tsx

Componente React que exibe o contador visual em tempo real:

**Props:**

- `pixTimestamp`: string (ISO 8601) - Timestamp da geração do PIX
- `onExpire?`: função callback (opcional) - Chamada quando o contador chega a zero

**Características:**

- Atualização a cada 1 segundo
- Cores dinâmicas baseadas no tempo restante
- Animações de pulsação para alertas
- Formato MM:SS (minutos:segundos)

**Estados Visuais:**

```tsx
// Verde - Seguro (30+ minutos)
<div className="countdown-safe">⏱️ 45:23</div>

// Amarelo - Atenção (10-30 minutos)
<div className="countdown-warning">⏱️ 15:45</div>

// Vermelho - Urgente (<10 minutos)
<div className="countdown-danger">⏱️ 05:12</div>

// Cinza - Expirado
<div className="countdown-expired">⏰ Expirado</div>
```

### Integração em ReservationList

O contador é exibido automaticamente quando:

- Status da unidade = "RESERVADA"
- Status pagamento (coluna Q) = "PENDENTE"
- Timestamp PIX (coluna R) existe e é válido

## Logs do Sistema

### Console do Servidor

```
[PIX TIMEOUT] Verificando PIX expirados...
[PIX TIMEOUT] Cancelando reserva expirada: Apto 101 (62 minutos)
[PIX TIMEOUT] 1 reserva(s) cancelada(s) por expiração.
```

### Histórico na Planilha

| Timestamp           | Data       | Unidade  | Ação                                     | Cliente    | Corretor     | Usuário |
| ------------------- | ---------- | -------- | ---------------------------------------- | ---------- | ------------ | ------- |
| 16/11/2025 15:32:45 | 16/11/2025 | Apto 101 | Cancelada Automaticamente (PIX Expirado) | João Silva | Maria Santos | Sistema |

## Ciclo de Vida do PIX

```
1. Geração do PIX
   ↓
   Status: PENDENTE
   Timestamp: 2025-11-16T14:30:00Z
   ↓

2. Cliente tem 60 minutos
   ↓

3a. Cliente paga (dentro de 60 min)
    ↓
    Webhook Santander atualiza
    Status: PAGO
    ✓ Reserva mantida

3b. Cliente NÃO paga (após 60 min)
    ↓
    Job detecta expiração
    ↓
    Status: DISPONÍVEL
    Dados limpos
    ✗ Reserva cancelada
    Registro no histórico
```

## Configuração

### Intervalo de Verificação

Por padrão, o job roda a cada **1 minuto**:

```javascript
// Em backend/server.js
setInterval(checkAndCancelExpiredPix, 60000); // 60000 ms = 1 minuto
```

Para alterar, modifique o valor em milissegundos:

- 30 segundos: `30000`
- 2 minutos: `120000`
- 5 minutos: `300000`

### Timeout do PIX

Por padrão, o PIX expira após **60 minutos**:

```javascript
const TIMEOUT_MINUTES = 60;
```

Para alterar, modifique esta constante na função `checkAndCancelExpiredPix()`.

## Início do Servidor

Ao iniciar o servidor, você verá:

```
✓ Servidor rodando na porta 3000
✓ Acesse em http://localhost:${PORT}
✓ Job de verificação de PIX expirados ativo (verifica a cada 1 minuto)
[PIX TIMEOUT] Verificando PIX expirados...
```

O job executa imediatamente ao iniciar e depois a cada intervalo configurado.

## Considerações Importantes

### 1. Fuso Horário

- Timestamps são armazenados em **UTC (ISO 8601)**
- O cálculo de expiração é independente de fuso horário
- Garante consistência mesmo com servidores em regiões diferentes

### 2. Precisão

- Verificações ocorrem a cada 1 minuto
- Um PIX pode levar até **61 minutos** para ser cancelado (60 min + até 1 min para próxima verificação)
- Este delay é aceitável e evita sobrecarga do servidor

### 3. Robustez

- Erros em uma implantação não afetam outras
- Logs detalhados para troubleshooting
- Continua funcionando mesmo se houver falhas pontuais

### 4. Performance

- Apenas unidades com PIX pendente são processadas
- Busca otimizada por implantação
- Impacto mínimo no desempenho do servidor

## Monitoramento

Para verificar se o job está funcionando:

1. Acesse os logs do servidor (console ou PM2)
2. Procure por mensagens `[PIX TIMEOUT]`
3. Verifique o histórico na planilha para cancelamentos automáticos

## Troubleshooting

### PIX não está sendo cancelado

1. Verifique se o timestamp foi salvo corretamente (Coluna R)
2. Confira os logs do servidor por erros
3. Verifique se o job está rodando (deve aparecer logs a cada minuto)

### Cancelamento muito rápido/lento

1. Ajuste a constante `TIMEOUT_MINUTES` no código
2. Reinicie o servidor após a alteração

### Erro ao acessar planilha

1. Verifique as credenciais do Google Sheets
2. Confirme permissões da Service Account
3. Verifique conectividade de rede

## Migração de Dados Existentes

Para PIX gerados antes desta implementação:

- Coluna R estará vazia
- Esses PIX **não serão cancelados automaticamente**
- É seguro fazer a migração sem impacto em reservas existentes

## Atualização no EC2

Para aplicar no servidor AWS:

```bash
# 1. Conectar ao EC2
ssh -i sua-chave.pem ubuntu@seu-ip

# 2. Navegar até o diretório
cd /home/ubuntu/simulador_implantacao/backend

# 3. Atualizar código (git pull ou upload manual)
git pull origin main

# 4. Reiniciar o servidor
pm2 restart server

# 5. Verificar logs
pm2 logs server --lines 50
```

## Backup e Segurança

- Todos os cancelamentos automáticos são registrados no histórico
- Dados do cliente e corretor são preservados no histórico antes da limpeza
- É possível auditar todos os cancelamentos automáticos filtrando por "Usuário: Sistema"
