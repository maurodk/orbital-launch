# Configuração do Backend na EC2 para usar Workers na VM

## 1. Configurar variáveis de ambiente no backend (EC2)

Adicione estas variáveis no arquivo `.env` do backend na EC2:

```bash
# Redis na VM (substitua pelo IP da sua VM)
REDIS_HOST=IP_DA_SUA_VM
REDIS_PORT=6379
```

## 2. Configurar Firewall/Security Group da VM

Permita conexões na porta **6379** (Redis) vindas do IP da EC2:

### No Security Group da VM (AWS):
- Tipo: Custom TCP
- Porta: 6379
- Origem: IP_DA_EC2/32

### Ou no firewall da VM (se for outra cloud):
```bash
# Ubuntu/Debian
sudo ufw allow from IP_DA_EC2 to any port 6379

# CentOS/RHEL
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="IP_DA_EC2" port protocol="tcp" port="6379" accept'
sudo firewall-cmd --reload
```

## 3. Subir apenas Redis + Workers na VM

```bash
cd deploy-docker
docker-compose up -d
```

Isso vai subir:
- ✅ Redis (porta 6379)
- ✅ Worker 1 (com credenciais CVCRM_USER_1)
- ✅ Worker 2 (com credenciais CVCRM_USER_2)

## 4. Testar conexão

No backend da EC2, teste se consegue conectar no Redis:

```bash
# Instale redis-cli se necessário
sudo apt install redis-tools

# Teste a conexão
redis-cli -h IP_DA_VM -p 6379 ping
# Deve retornar: PONG
```

## 5. Reiniciar backend na EC2

```bash
pm2 restart telao-backend
# ou
systemctl restart telao-backend
```

## Fluxo de Funcionamento:

```
Frontend (Vercel)
    ↓
Backend (EC2) ← envia jobs para → Redis (VM)
                                      ↓
                            Worker 1 e Worker 2 (VM)
                            processam automações CVCRM
```

## Vantagens dessa arquitetura:

✅ Backend na EC2 (mais estável, já configurado)
✅ Workers na VM (isolados, podem ser escalados)
✅ Redis como fila distribuída
✅ Cada worker com credenciais diferentes
✅ Fácil adicionar mais workers (worker3, worker4...)
