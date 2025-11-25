# ✅ Frontend Configurado para AWS

## 📝 Alterações Realizadas

### 1. Arquivo `.env` Atualizado

Adicionadas variáveis de ambiente:

```env
VITE_AWS_API_URL=http://34.204.204.81:3000
VITE_PRODUCTION_API_URL=https://simulador-implantacao.onrender.com
VITE_LOCALHOST_API_URL=http://localhost:3000
```

### 2. Páginas Atualizadas

- **`MainPage.tsx`** - Agora usa AWS em produção, localhost em desenvolvimento
- **`CVCrmMappingPage.tsx`** - Mesma configuração

### 3. Lógica de Roteamento

```typescript
// Em desenvolvimento (npm run dev): Usa localhost:3000
const apiUrl =
  process.env.NODE_ENV === "development" ? LOCALHOST_API_URL : AWS_API_URL;
```

---

## 🚀 Como Testar

### Desenvolvimento (localhost)

```bash
cd frontend
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000` (se rodando localmente)

### Produção (AWS)

```bash
npm run build
```

- Frontend: `http://localhost:5173` (build local) ou deploy
- Backend: `http://34.204.204.81:3000` (AWS)

---

## 🔒 Verificar CORS no Backend AWS

Se receber erro de CORS, execute na EC2:

```bash
# Conectar à EC2
ssh -i "sua-chave.pem" ubuntu@34.204.204.81

# Verificar arquivo server.js
grep -A 10 "allowedOrigins" ~/projects/telao-digital/backend/server.js

# Adicionar seu domínio/IP ao CORS se necessário
# (Edite server.js e faça restart)
pm2 restart simulador-backend
```

---

## ✅ Checklist

- [x] Frontend configurado para usar AWS_API_URL
- [x] Variáveis de ambiente adicionadas ao `.env`
- [x] Lógica de roteamento implementada
- [ ] Testar conexão ao backend AWS
- [ ] Verificar CORS se houver erros
- [ ] Build para produção

---

## 📊 Fluxo de Requisições

```
Frontend (Vite)
    ↓
    ├─ Desenvolvimento: localhost:3000
    └─ Produção: 34.204.204.81:3000 (AWS)
        ↓
        └─ Backend (Node.js + Express)
            ├─ Google Sheets API
            ├─ Supabase
            └─ CVCRM API
```

---

## 🔄 Como Mudar de Backend

### Para usar Render de novo:

Edite o arquivo `.env`:

```env
VITE_AWS_API_URL=https://simulador-implantacao.onrender.com
```

### Para usar outro IP AWS:

Edite o arquivo `.env`:

```env
VITE_AWS_API_URL=http://novo-ip:3000
```

---

## 📞 Possíveis Problemas

### CORS Error

**Sintoma**: `Access to XMLHttpRequest blocked by CORS policy`

**Solução**:

1. Verifique `allowedOrigins` em `backend/server.js`
2. Adicione o domínio do frontend ao CORS
3. Faça restart do backend: `pm2 restart simulador-backend`

### Conexão Recusada

**Sintoma**: `Cannot GET /` ou timeout

**Solução**:

1. Verifique se backend está rodando: `pm2 status`
2. Verifique security group da EC2 (liberar porta 3000)
3. Ping do servidor: `ping 34.204.204.81`

### Requisição Lenta

**Sintoma**: Requests demorando muito

**Solução**:

1. Verifique latência: `ping 34.204.204.81`
2. Verifique logs: `pm2 logs simulador-backend`
3. Upgrade EC2 (t2.micro → t2.small)

---

## 🎯 Próximas Etapas

1. Deploy do frontend (Vercel, Netlify, etc)
2. Configurar domínio próprio
3. SSL/HTTPS na EC2
4. Monitorar performance
5. Backups automáticos
