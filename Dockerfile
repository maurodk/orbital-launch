# ---- ESTÁGIO ÚNICO: Produção ----
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

# Instala SOMENTE as dependências de produção
RUN npm ci --only=production

# Copia os arquivos de configuração e credenciais
COPY .env .
COPY credentials.json ./backend/
COPY serviceAccountKey.json ./backend/

# Copia o restante do código da aplicação
COPY . .

EXPOSE 3001

# Aponta diretamente para o seu arquivo principal
# Supondo que seu arquivo de início se chame "server.js" e está na raiz
CMD [ "node", "backend/server.js" ]