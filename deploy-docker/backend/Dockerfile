FROM node:22-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package.json ./

# Instala ioredis explicitamente caso não esteja no package.json original
RUN npm install && npm install ioredis

# Copiar código fonte
COPY . .

EXPOSE 3000

CMD ["node", "server.cjs"]
