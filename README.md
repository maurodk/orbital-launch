# orbital-launch

Aplicacao web com frontend Vite/React, backend Node.js e workers Python para automacao.

Este repositorio e uma evolucao do projeto original, mantido aqui como `orbital-launch`.

## Estrutura

- `frontend/`: aplicacao React.
- `deploy-docker/backend/`: API Node.js.
- `deploy-docker/worker/`: worker Python.
- `deploy-docker/migrations/`: scripts SQL.

## Ambiente

Copie os arquivos de exemplo e preencha os valores locais:

- `deploy-docker/.env.example` -> `deploy-docker/.env`

Para uso local com Docker, o arquivo principal e `deploy-docker/.env`. Ele deve conter as credenciais reais de Supabase, CVCRM e tokens externos quando esses recursos forem usados.

Variaveis essenciais:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_ANON_KEY`
- `CVCRM_USER_1` / `CVCRM_PASSWORD_1`
- `CVCRM_USER_2` / `CVCRM_PASSWORD_2`
- `BACKEND_INTERNAL_URL=http://backend:3000`
- `VITE_API_URL=http://localhost:3000`

Arquivos `.env`, credenciais, `node_modules`, `dist`, `.venv` e caches nao devem ser versionados.

## Uso local com Docker

```bash
cd deploy-docker
docker compose up --build
```

Servicos locais:

- Frontend: `http://localhost:5173`
- Backend/API: `http://localhost:3000`
- Redis: `localhost:6379`

## Frontend

Para rodar somente o frontend fora do Docker:

```bash
cd frontend
npm install
npm run lint
npm run build
```
