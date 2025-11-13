# 🚀 Guia Rápido: Deploy Backend na AWS EC2

## ⚡ Resumo em 5 Passos (15 minutos)

### 1️⃣ Criar EC2 (2 min)

```
AWS Console → EC2 → Launch Instances
- Ubuntu 24.04 LTS (free tier)
- t2.micro (grátis) ou t2.small (melhor)
- Security Group: liberar portas 22, 80, 443, 3000
- Salvar arquivo .pem
```

### 2️⃣ Conectar via SSH (1 min)

```powershell
# PowerShell local
$IP = "seu-ip-ec2"
$KEY = "C:\caminho\sua-chave.pem"
ssh -i $KEY ubuntu@$IP
```

### 3️⃣ Executar Setup na EC2 (5 min)

```bash
# Na EC2 via SSH
wget https://seu-repo/deploy-ec2.sh
chmod +x deploy-ec2.sh
./deploy-ec2.sh
```

### 4️⃣ Enviar Arquivos de Configuração (2 min)

```powershell
# PowerShell local
scp -i $KEY backend\.env ubuntu@${IP}:/home/ubuntu/projects/telao-digital/backend/
scp -i $KEY backend\credentials.json ubuntu@${IP}:/home/ubuntu/projects/telao-digital/backend/
```

### 5️⃣ Reiniciar e Testar (1 min)

```powershell
# PowerShell local
ssh -i $KEY ubuntu@$IP "pm2 restart simulador-backend"

# Testar no navegador
http://$IP:3000
```

---

## 🎯 Usando o Script PowerShell (MAIS FÁCIL)

```powershell
# Na pasta do projeto local
.\deploy-ec2.ps1 -EC2_IP "seu-ip-ec2" -KEY_PATH "C:\caminho\chave.pem" -ACTION "deploy"

# Ou deixar pedir interativamente
.\deploy-ec2.ps1
```

**Ações disponíveis:**

- `deploy` → Deploy completo (setup + upload .env + restart)
- `upload-env` → Apenas atualizar .env
- `upload-creds` → Apenas atualizar credentials.json
- `logs` → Ver logs em tempo real
- `restart` → Reiniciar servidor
- `stop` → Parar servidor
- `status` → Ver status
- `pull` → Git pull + npm install + restart

---

## 📋 Pré-requisitos

✅ SSH Client (Windows 10+ tem nativo, ou use Git Bash/WSL)
✅ Arquivo .pem da chave salvo localmente
✅ Arquivo `.env` preenchido
✅ Arquivo `credentials.json` do Google Cloud
✅ Acesso à AWS Console

---

## 🔧 Configurar Nginx (Recomendado)

Depois que o server estiver rodando:

```bash
# Na EC2 via SSH
sudo apt install -y nginx

# Copiar arquivo de configuração
sudo cp nginx.conf /etc/nginx/sites-available/simulador-backend
sudo ln -s /etc/nginx/sites-available/simulador-backend /etc/nginx/sites-enabled/

# Testar e reiniciar
sudo nginx -t
sudo systemctl restart nginx
```

Agora acesse apenas via `http://seu-ip` (sem `:3000`)

---

## 🔒 SSL/HTTPS com Let's Encrypt (Grátis)

```bash
# Na EC2
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com

# Renovação automática
sudo systemctl enable certbot.timer
```

---

## 📊 Monitorar e Manter

```bash
# Ver logs em tempo real
pm2 logs

# Ver status
pm2 status

# Atualizar código
cd ~/projects/telao-digital && git pull && cd backend && npm install && pm2 restart all

# Ver CPU/Memória
top
free -h
```

---

## 💰 Custos

- **Free Tier**: t2.micro grátis por 12 meses (750h/mês)
- **Após free tier**: ~$7-10/mês
- **Domínio**: Não configurado neste guia (adicional)

---

## ✅ Checklist

- [ ] Instância EC2 criada
- [ ] Security groups configurados
- [ ] SSH funcionando
- [ ] Deploy script executado
- [ ] .env e credentials.json enviados
- [ ] Server rodando com PM2
- [ ] Acessível em http://seu-ip:3000
- [ ] Nginx configurado (opcional)
- [ ] SSL/HTTPS configurado (opcional)

---

## 🆘 Troubleshooting

**Server não inicia?**

```bash
pm2 logs
node ~/projects/telao-digital/backend/server.js
```

**Porta já em uso?**

```bash
sudo lsof -i :3000
kill -9 PID
```

**Nginx retorna 502?**

```bash
pm2 status
sudo tail -f /var/log/nginx/error.log
pm2 restart simulador-backend
```

**Sem conexão SSH?**

```bash
# Verificar security group
# Verificar arquivo .pem
icacls $KEY_PATH /inheritance:r /grant:r "$env:USERNAME`:F"
```

---

## 🎓 Próximas Etapas

1. Configurar domínio (Route 53 ou similar)
2. CI/CD com GitHub Actions
3. Backup automático do banco
4. Monitorar com CloudWatch
5. Escalar com load balancer se necessário

---

## 📞 Suporte

Arquivo .pem perdido? Termine a instância e crie uma nova.
Server caiu? `pm2 restart all` relança tudo.
Erro de CORS? Verifique allowedOrigins em server.js
Falta memoria? Upgrade t2.micro → t2.small
