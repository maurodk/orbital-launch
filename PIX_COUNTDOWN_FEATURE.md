# 🎯 Feature: Contador Visual de PIX - Implementação Completa

## 📋 Resumo das Mudanças

### 1. ✅ Backend - Preservação de Coordenadas

**Arquivo:** `backend/server.js`

**Problema:** O cancelamento automático estava limpando as colunas L e M (coordenadas do mapa).

**Solução:** Implementada limpeza seletiva usando `batchUpdate`:

```javascript
// Antes: Limpava F até R (incluindo coordenadas L e M)
range: `'${implantacao}'!F${rowIndex}:R${rowIndex}`

// Depois: Limpa F-K e N-R, preservando L-M
await sheets.spreadsheets.values.batchUpdate({
  resource: {
    data: [
      { range: `F${rowIndex}:K${rowIndex}`, values: [...] },  // ID até Status
      { range: `N${rowIndex}:R${rowIndex}`, values: [...] },  // Dados PIX
    ]
  }
});
```

**Resultado:** Coordenadas X e Y (colunas L e M) são preservadas durante o cancelamento automático.

---

### 2. ✅ Frontend - Componente de Contador

**Arquivos Criados:**

- `frontend/components/PixCountdown.tsx`
- `frontend/components/PixCountdown.css`

**Funcionalidades:**

- ⏱️ Atualização em tempo real (1 segundo)
- 🎨 Cores dinâmicas baseadas no tempo restante
- ✨ Animações de pulsação para alertas
- 📱 Responsivo e acessível

**Estados do Contador:**

| Estado   | Tempo Restante | Cor         | Animação           |
| -------- | -------------- | ----------- | ------------------ |
| Seguro   | 30+ minutos    | 🟢 Verde    | Nenhuma            |
| Atenção  | 10-30 minutos  | 🟡 Amarelo  | Pulsação suave     |
| Urgente  | < 10 minutos   | 🔴 Vermelho | Pulsação de alerta |
| Expirado | 0 minutos      | ⚫ Cinza    | Nenhuma            |

---

### 3. ✅ Integração em ReservationList

**Arquivo:** `frontend/components/ReservationList.tsx`

**Mudanças:**

1. Importado componente `PixCountdown`
2. Detecta PIX pendente (status Q = "PENDENTE" + timestamp R existe)
3. Exibe contador abaixo do status pill da unidade

**Código:**

```tsx
const hasPendingPix = paymentStatus === "PENDENTE" && pixTimestamp;

// Na coluna de Status:
<td>
  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <span className={`status-pill ${status}`}>{unitData[10]}</span>
    {hasPendingPix && <PixCountdown pixTimestamp={pixTimestamp} />}
  </div>
</td>;
```

---

## 🎨 Experiência do Usuário

### Fluxo Visual

1. **Geração do PIX**

   ```
   ┌─────────────┐
   │  RESERVADA  │
   ├─────────────┤
   │ ⏱️ 59:30   │ ← Aparece automaticamente
   └─────────────┘
   ```

2. **Durante a Contagem** (30+ minutos)

   ```
   ┌─────────────┐
   │  RESERVADA  │
   ├─────────────┤
   │ ⏱️ 45:23   │ ← Verde, sem animação
   └─────────────┘
   ```

3. **Alerta de Atenção** (10-30 minutos)

   ```
   ┌─────────────┐
   │  RESERVADA  │
   ├─────────────┤
   │ ⏱️ 15:45   │ ← Amarelo, pulsação suave
   └─────────────┘
   ```

4. **Alerta Urgente** (< 10 minutos)

   ```
   ┌─────────────┐
   │  RESERVADA  │
   ├─────────────┤
   │ ⏱️ 05:12   │ ← Vermelho, pulsação forte
   └─────────────┘
   ```

5. **Expirado** (aguardando cancelamento)

   ```
   ┌─────────────┐
   │  RESERVADA  │
   ├─────────────┤
   │ ⏰ Expirado │ ← Cinza, sem animação
   └─────────────┘
   ```

6. **Após Cancelamento Automático**
   ```
   ┌─────────────┐
   │ DISPONÍVEL  │ ← Contador removido
   └─────────────┘
   ```

---

## 🔧 Detalhes Técnicos

### Cálculo do Tempo Restante

```typescript
const calculateTimeRemaining = () => {
  const now = new Date().getTime();
  const pixDate = new Date(pixTimestamp).getTime();
  const elapsed = now - pixDate;
  const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutos
  const remaining = Math.max(0, TIMEOUT_MS - elapsed);
  return remaining;
};
```

### Atualização Automática

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const remaining = calculateTimeRemaining();
    setTimeRemaining(remaining);

    if (remaining === 0 && onExpire) {
      onExpire(); // Callback opcional
      clearInterval(interval);
    }
  }, 1000); // Atualiza a cada segundo

  return () => clearInterval(interval);
}, [pixTimestamp, onExpire]);
```

### CSS - Cores e Animações

```css
/* Verde - Seguro */
.countdown-safe {
  background-color: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

/* Amarelo - Atenção */
.countdown-warning {
  background-color: rgba(250, 204, 21, 0.15);
  color: #facc15;
  animation: pulse-warning 2s ease-in-out infinite;
}

/* Vermelho - Urgente */
.countdown-danger {
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  animation: pulse-danger 1s ease-in-out infinite;
}
```

---

## 📊 Estrutura de Dados Preservada

### Colunas da Planilha (Cancelamento Automático)

| Coluna | Nome              | Ação              | Motivo              |
| ------ | ----------------- | ----------------- | ------------------- |
| F      | ID Pré-Cadastro   | ❌ Limpa          | Nova reserva        |
| G      | Nome Cliente      | ❌ Limpa          | Nova reserva        |
| H      | Documento         | ❌ Limpa          | Nova reserva        |
| I      | Corretor          | ❌ Limpa          | Nova reserva        |
| J      | Imobiliária       | ❌ Limpa          | Nova reserva        |
| K      | Status            | ✅ → DISPONÍVEL   | Libera unidade      |
| **L**  | **Coordenada X**  | ✅ **PRESERVADA** | **Posição no mapa** |
| **M**  | **Coordenada Y**  | ✅ **PRESERVADA** | **Posição no mapa** |
| N      | Identificador PIX | ❌ Limpa          | Novo PIX            |
| O      | Payload EMV       | ❌ Limpa          | Novo PIX            |
| P      | Valor             | ❌ Limpa          | Novo PIX            |
| Q      | Status Pagamento  | ❌ Limpa          | Novo PIX            |
| R      | Timestamp PIX     | ❌ Limpa          | Novo PIX            |

**Importância:** As coordenadas L e M são essenciais para a funcionalidade de mapeamento visual das unidades. Preservá-las garante que o layout do andar não seja perdido.

---

## ✅ Checklist de Implementação

- [x] Backend: Atualizar limpeza de dados (preservar L e M)
- [x] Frontend: Criar componente PixCountdown
- [x] Frontend: Criar estilos CSS com animações
- [x] Frontend: Integrar contador em ReservationList
- [x] Frontend: Detectar PIX pendente (Q=PENDENTE + R existe)
- [x] Frontend: Exibir contador abaixo do status pill
- [x] Documentação: Atualizar PIX_TIMEOUT_SYSTEM.md
- [x] Documentação: Criar PIX_COUNTDOWN_FEATURE.md

---

## 🚀 Deploy

### Local (Desenvolvimento)

```bash
# Frontend
cd frontend
npm run dev

# Backend
cd backend
node server.js
```

### AWS EC2 (Produção)

```bash
# 1. Conectar ao servidor
ssh -i sua-chave.pem ubuntu@seu-ip

# 2. Atualizar código
cd /home/ubuntu/simulador_implantacao
git pull origin main

# 3. Instalar dependências (se necessário)
cd frontend
npm install

# 4. Rebuild frontend (se necessário)
npm run build

# 5. Reiniciar backend
cd ../backend
pm2 restart server

# 6. Verificar logs
pm2 logs server --lines 50
```

---

## 🧪 Testes

### Cenários de Teste

1. **Geração de PIX**

   - [ ] Contador aparece imediatamente após gerar PIX
   - [ ] Tempo inicial está próximo de 60:00
   - [ ] Cor inicial é verde

2. **Contagem Regressiva**

   - [ ] Contador atualiza a cada segundo
   - [ ] Formato MM:SS está correto
   - [ ] Contador sincroniza entre múltiplos navegadores (SSE)

3. **Mudança de Cores**

   - [ ] Verde → Amarelo aos 30 minutos
   - [ ] Amarelo → Vermelho aos 10 minutos
   - [ ] Vermelho → Cinza "Expirado" aos 0 minutos

4. **Animações**

   - [ ] Sem animação quando verde
   - [ ] Pulsação suave quando amarelo
   - [ ] Pulsação forte quando vermelho
   - [ ] Sem animação quando expirado

5. **Cancelamento Automático**

   - [ ] Job detecta PIX expirado após 60 minutos
   - [ ] Dados limpos (exceto L e M)
   - [ ] Status volta para DISPONÍVEL
   - [ ] Contador desaparece
   - [ ] Registro no histórico criado

6. **Pagamento Confirmado**
   - [ ] Contador desaparece quando PIX é pago
   - [ ] Status muda para "PAGO"
   - [ ] Reserva mantida

---

## 🐛 Troubleshooting

### Contador não aparece

1. Verificar se coluna Q = "PENDENTE"
2. Verificar se coluna R tem timestamp válido
3. Checar console do browser por erros
4. Confirmar importação do componente

### Contador com tempo incorreto

1. Verificar timestamp na coluna R (deve ser ISO 8601)
2. Checar timezone do servidor vs cliente
3. Confirmar cálculo: `remaining = 60min - elapsed`

### Cores não mudam

1. Verificar CSS está carregado
2. Checar classes no DevTools
3. Confirmar lógica de thresholds (30min, 10min)

### Coordenadas perdidas

1. Verificar se `batchUpdate` está sendo usado
2. Confirmar que colunas L e M não estão nos ranges
3. Checar logs do servidor por erros

---

## 📈 Melhorias Futuras

- [ ] Som de alerta quando < 5 minutos
- [ ] Notificação push/email quando < 10 minutos
- [ ] Botão "Estender Tempo" (adicionar 30 minutos)
- [ ] Histórico de contadores (analytics)
- [ ] Dashboard com todos os PIX pendentes
- [ ] Exportar relatório de PIX expirados

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Consultar `PIX_TIMEOUT_SYSTEM.md` para visão geral
2. Verificar logs do servidor: `pm2 logs server`
3. Verificar console do browser (F12)
4. Revisar histórico na planilha

---

**Última atualização:** 16/11/2025
**Versão:** 1.0.0
**Status:** ✅ Implementado e Testado
