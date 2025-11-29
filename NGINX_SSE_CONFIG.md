# Configuração Nginx para SSE (Server-Sent Events)

## Problema Identificado

O console mostra `ERR_HTTP2_PROTOCOL_ERROR` ao conectar ao endpoint `/api/events`. Isso ocorre quando o proxy Nginx (ou similar) usa HTTP/2 com configurações inadequadas para streams de longa duração (SSE).

## Solução: Configuração Nginx para `/api/events`

Adicione ou modifique a configuração do seu servidor Nginx (arquivo geralmente em `/etc/nginx/sites-available/` ou `/etc/nginx/conf.d/`):

```nginx
# Configuração para SSE (Server-Sent Events)
location /api/events {
    # Proxy para o backend Node.js
    proxy_pass http://localhost:3000;  # Ajuste a porta conforme seu backend

    # CRÍTICO: Forçar HTTP/1.1 (HTTP/2 tem problemas com streams longos)
    proxy_http_version 1.1;

    # CRÍTICO: Não manter conexão persistente do proxy
    proxy_set_header Connection "";

    # CRÍTICO: Desabilitar buffering (essencial para SSE)
    proxy_buffering off;

    # CRÍTICO: Desabilitar cache
    proxy_cache off;
    proxy_cache_bypass $http_upgrade;

    # Headers padrão
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # CRÍTICO: Desabilitar gzip para SSE
    gzip off;

    # Timeout longo (SSE mantém conexão aberta)
    proxy_read_timeout 3600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;

    # Chunked transfer encoding
    chunked_transfer_encoding on;
}

# Configuração para as outras rotas da API (mantém HTTP/2 se desejar)
location /api/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

## Verificações no Backend (Node.js)

Certifique-se de que o endpoint `/api/events` no `server.cjs` envie os headers corretos:

```javascript
app.get("/api/events", (req, res) => {
  // Headers obrigatórios para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Desabilita buffering no Nginx

  // Envia comentário inicial para manter conexão
  res.write(":ok\n\n");

  // ... resto da lógica SSE
});
```

## Passos para Aplicar

1. **Editar configuração Nginx:**

   ```bash
   sudo nano /etc/nginx/sites-available/telao-digital
   # ou
   sudo nano /etc/nginx/conf.d/telao-digital.conf
   ```

2. **Testar configuração:**

   ```bash
   sudo nginx -t
   ```

3. **Recarregar Nginx:**

   ```bash
   sudo systemctl reload nginx
   # ou
   sudo service nginx reload
   ```

4. **Verificar logs se houver erro:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

## Alternativa: Cloudflare ou outro Proxy

Se você usa Cloudflare na frente do Nginx:

- Configure a rota `/api/events` para **não usar proxy** do Cloudflare (ative "DNS only" para esse subdomínio), OU
- Use um subdomínio separado sem Cloudflare para SSE (ex: `sse.suportevca.com.br`)

## Verificação Após Deploy

1. Abra DevTools → Network
2. Conecte ao app
3. Procure a requisição `api/events?implantacao=...`
4. Verifique:
   - **Status:** deve ser `200` e permanecer "pending" (conexão aberta)
   - **Type:** `eventsource`
   - **No erro HTTP2:** não deve aparecer `ERR_HTTP2_PROTOCOL_ERROR`

## Troubleshooting

### Se ainda aparecer o erro:

1. Confirme que o Nginx foi recarregado: `sudo systemctl status nginx`
2. Verifique se há outro proxy/load balancer na frente (ex: Cloudflare, AWS ALB)
3. Teste direto no IP do servidor (bypass proxy): `http://IP_SERVIDOR:3000/api/events?implantacao=TEST`
4. Confirme que o backend responde corretamente (veja logs do PM2): `pm2 logs`

### Logs úteis:

```bash
# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Backend
pm2 logs server --lines 100
```
