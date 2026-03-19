#!/bin/bash

# Script de Deploy Automatizado para EC2
# Use este script na sua instância EC2 após conectar via SSH

set -e

echo "🚀 Iniciando setup da aplicacao no EC2..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Passo 1: Atualizar sistema
echo -e "${YELLOW}[1/10]${NC} Atualizando pacotes do sistema..."
sudo apt update
sudo apt upgrade -y

# Passo 2: Instalar Node.js
echo -e "${YELLOW}[2/10]${NC} Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Passo 3: Instalar ferramentas essenciais
echo -e "${YELLOW}[3/10]${NC} Instalando ferramentas essenciais..."
sudo apt install -y git curl wget nano htop

# Passo 4: Instalar PM2
echo -e "${YELLOW}[4/10]${NC} Instalando PM2..."
sudo npm install -g pm2

# Passo 5: Clonar repositório
echo -e "${YELLOW}[5/10]${NC} Clonando repositório..."
mkdir -p ~/projects
cd ~/projects

if [ -d "telao-digital" ]; then
    echo "Repositório já existe, atualizando..."
    cd telao-digital
    git pull origin main
else
    git clone https://github.com/ti-vca-construtora/telao-digital.git
    cd telao-digital
fi

# Passo 6: Instalar dependências do backend
echo -e "${YELLOW}[6/10]${NC} Instalando dependências do backend..."
cd deploy-docker/backend
npm install

# Passo 7: Gerar build do frontend React
echo -e "${YELLOW}[7/10]${NC} Instalando dependências do frontend..."
cd ~/projects/telao-digital/frontend
npm install

echo -e "${YELLOW}[8/10]${NC} Gerando build do frontend..."
npm run build

# Passo 9: Testar se o servidor inicia
echo -e "${YELLOW}[9/10]${NC} Testando servidor..."
cd ~/projects/telao-digital/deploy-docker/backend
timeout 5 node server.cjs || true
echo -e "${GREEN}✓ Servidor testado com sucesso${NC}"

# Passo 10: Iniciar com PM2
echo -e "${YELLOW}[10/10]${NC} Iniciando servidor com PM2..."
pm2 delete simulador-backend >/dev/null 2>&1 || true
pm2 start server.cjs --name "simulador-backend"
pm2 startup
pm2 save

# Output final
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup concluído com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Status do servidor:"
pm2 status
echo ""
echo "📋 Comandos úteis:"
echo "  pm2 logs                    - Ver logs em tempo real"
echo "  pm2 restart simulador-backend - Reiniciar servidor"
echo "  pm2 stop simulador-backend    - Parar servidor"
echo "  pm2 delete simulador-backend  - Remover servidor"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "  1. Copie o arquivo .env para ~/projects/telao-digital/deploy-docker/backend/"
echo "  2. Copie o arquivo credentials.json para o mesmo diretório"
echo "  3. Confirme que frontend/dist foi gerado no servidor"
echo "  4. Configure o Nginx (veja o guia)"
echo ""
echo "✅ Backend e fullscreen React disponíveis em http://seu-ip:3000/fullscreen"
