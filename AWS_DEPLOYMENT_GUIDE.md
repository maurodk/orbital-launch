# Guia Completo: Subir Backend para EC2 AWS

## 📋 Pré-requisitos

1. **Conta AWS** - Com acesso ao console
2. **AWS CLI** - Instalado e configurado localmente
3. **SSH Client** - Para conectar à instância
4. **Git** - Para clonar seu repositório
5. **Node.js** - Será instalado na instância

---

## 🚀 Passo 1: Criar uma Instância EC2

### Via AWS Console:

1. Acesse: https://console.aws.amazon.com/ec2/
2. Clique em **"Instances"** → **"Launch Instances"**
3. Configure:

   - **Name**: `simulador-backend` (ou outro nome)
   - **AMI**: Ubuntu Server 24.04 LTS (free tier)
   - **Instance Type**: `t2.micro` (free tier) ou `t2.small` para melhor performance
   - **Key Pair**: Crie uma nova ou use existente (salve o `.pem`)
   - **Security Group**: Crie novo com as regras:
     - HTTP (80) - Anywhere
     - HTTPS (443) - Anywhere
     - SSH (22) - Your IP (ou Anywhere com cuidado)
     - Custom TCP (3000) - Anywhere (porta do Node)
     - Custom TCP (5432) - For database if needed

4. Clique em **"Launch Instance"**

### Via AWS CLI:

```bash
# Configure suas credenciais primeiro
aws configure

# Criar security group
aws ec2 create-security-group \
  --group-name simulador-backend-sg \
  --description "Security group para backend simulador"

# Obter ID do security group (salve esse ID)
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=simulador-backend-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

# Adicionar regras de entrada
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 \
  --group-name simulador-backend-sg

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Criar instância EC2
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --count 1 \
  --instance-type t2.micro \
  --key-name sua-chave-pem \
  --security-group-ids $SG_ID \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=simulador-backend}]'
```

---

## 🔑 Passo 2: Conectar à Instância via SSH

### 1. Obter o IP público da instância:

```bash
# Via AWS Console: Instances → Copie o "Public IPv4"
# Ou via CLI:
aws ec2 describe-instances \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text
```

### 2. Conectar via SSH:

```powershell
# No seu PowerShell local
$IP = "seu-ip-publico"
$KEY_PATH = "C:\caminho\para\sua-chave.pem"

# Dar permissão ao arquivo .pem (apenas primeira vez)
icacls $KEY_PATH /inheritance:r /grant:r "$env:USERNAME`:F"

# Conectar
ssh -i $KEY_PATH ubuntu@$IP
```

**Ou use o SSH Client do Windows (mais fácil):**

```bash
# Abra Git Bash ou WSL
ssh -i "C:\Users\carlosmauricio\caminho\sua-chave.pem" ubuntu@seu-ip-publico
```

---

## 🛠️ Passo 3: Preparar a Instância EC2

Após conectar via SSH, rode os comandos abaixo:

```bash
# Atualizar pacotes
sudo apt update
sudo apt upgrade -y

# Instalar Node.js (versão LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar versões
node --version
npm --version

# Instalar Git
sudo apt install -y git

# Instalar PM2 (para rodar o servidor em background)
sudo npm install -g pm2

# Criar diretório para o projeto
mkdir -p ~/projects
cd ~/projects

# Instalar NVM (opcional, mas recomendado)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
```

---

## 📦 Passo 4: Clonar e Configurar o Projeto

```bash
# Na EC2, dentro de ~/projects
git clone https://github.com/ti-vca-construtora/telao-digital.git
cd telao-digital/backend

# Instalar dependências
npm install

# Copiar arquivo .env (você vai precisar fazer isso com SCP ou criar manualmente)
# Via SCP do seu PC:
# scp -i "chave.pem" seu-arquivo.env ubuntu@seu-ip:/home/ubuntu/projects/telao-digital/backend/

# Ou criar manualmente na EC2
nano .env
# Colar as variáveis de ambiente necessárias:
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE=...
# SUPABASE_KEY=...
# CVCRM_API_BASE_URL=...
# CVCRM_API_EMAIL=...
# CVCRM_API_TOKEN=...
# NODE_ENV=production

# Copiar credentials.json também
# scp -i "chave.pem" credentials.json ubuntu@seu-ip:/home/ubuntu/projects/telao-digital/backend/

# Testar se funciona localmente na EC2
node server.js

# Se funcionar, aperte Ctrl+C para parar
```

---

## 🌐 Passo 5: Configurar PM2 para Rodar Automaticamente

```bash
cd ~/projects/telao-digital/backend

# Iniciar com PM2
pm2 start server.js --name "simulador-backend"

# Salvar configuração para iniciar após reboot
pm2 startup
pm2 save

# Verificar status
pm2 status
pm2 logs simulador-backend

# Ver logs em tempo real
pm2 logs simulador-backend --lines 50 --follow
```

---

## 🌍 Passo 6: Configurar Nginx como Reverse Proxy (Recomendado)

Permite usar porta 80/443 e adiciona mais segurança:

```bash
# Instalar Nginx
sudo apt install -y nginx

# Criar arquivo de configuração
sudo nano /etc/nginx/sites-available/simulador-backend

# Colar conteúdo abaixo:
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou IP se não tiver domínio

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Para SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

```bash
# Ativar a configuração
sudo ln -s /etc/nginx/sites-available/simulador-backend /etc/nginx/sites-enabled/

# Testar sintaxe
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 🔒 Passo 7: SSL/HTTPS com Let's Encrypt (Grátis)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado (substitua o domínio)
sudo certbot --nginx -d seu-dominio.com

# Renovação automática
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Verificar renovação
sudo certbot renew --dry-run
```

---

## 📊 Passo 8: Monitoramento e Manutenção

### Ver logs:

```bash
# Logs do Node.js via PM2
pm2 logs

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Status do sistema
top
free -h
df -h
```

### Atualizar código:

```bash
cd ~/projects/telao-digital/backend

# Pull das alterações
git pull origin main

# Reinstalar dependências se houver package.json changes
npm install

# Reiniciar o server
pm2 restart simulador-backend
```

---

## 🚨 Passo 9: Configurar Elastic IP (para manter IP consistente)

```bash
# No console AWS ou via CLI:
aws ec2 allocate-address --domain vpc

# Associar à instância
aws ec2 associate-address \
  --instance-id i-xxxxxxxx \
  --allocation-id eipalloc-xxxxxxxx
```

---

## 📝 Checklist Final

- [ ] Instância EC2 criada e rodando
- [ ] Security groups configurados corretamente
- [ ] SSH funcionando
- [ ] Node.js e npm instalados
- [ ] Projeto clonado
- [ ] `.env` e `credentials.json` copiados
- [ ] Dependencies instaladas (`npm install`)
- [ ] PM2 rodando o servidor
- [ ] Nginx configurado (opcional mas recomendado)
- [ ] SSL/HTTPS configurado (Let's Encrypt)
- [ ] Backend acessível via `http://seu-ip:3000` ou `http://seu-dominio.com`

---

## 🆘 Troubleshooting

### Server não inicia:

```bash
# Verificar erros
pm2 logs simulador-backend
node server.js  # testar manualmente

# Verificar variáveis de ambiente
cat .env

# Verificar permissões
ls -la credentials.json
```

### Porta já em uso:

```bash
# Encontrar processo usando porta 3000
sudo lsof -i :3000

# Matar processo (se necessário)
kill -9 PID
```

### Nginx retorna 502:

```bash
# Verificar se Node está rodando
pm2 status

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log

# Reiniciar Node
pm2 restart all
```

---

## 💰 Custos Estimados (AWS Free Tier)

- **t2.micro**: Grátis por 12 meses (até 750h/mês)
- **Após free tier**: ~$7-10/mês
- **Bandwidth**: Primeiros 1GB/mês é grátis

---

## 🔗 Próximas Etapas

1. Apontar seu domínio para o IP da EC2
2. Configurar CI/CD com GitHub Actions
3. Adicionar backup automático do banco
4. Monitorar performance com CloudWatch
5. Escalar com Load Balancer se necessário
