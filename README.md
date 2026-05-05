# Telao Digital

Aplicacao web com frontend Vite/React, backend Node.js e workers Python para automacao.

## Estrutura

- `frontend/`: aplicacao React.
- `deploy-docker/backend/`: API Node.js.
- `deploy-docker/worker/`: worker Python.
- `deploy-docker/migrations/`: scripts SQL.

## Ambiente

Copie os arquivos de exemplo e preencha os valores locais:

- `.env.example` -> `.env`
- `frontend/.env.example` -> `frontend/.env`
- `deploy-docker/.env.example` -> `deploy-docker/.env`
- `deploy-docker/backend/.env.example` -> `deploy-docker/backend/.env`

Arquivos `.env`, credenciais, `node_modules`, `dist`, `.venv` e caches nao devem ser versionados.

## Frontend

```bash
cd frontend
npm install
npm run lint
npm run build
```

## Docker

```bash
cd deploy-docker
docker compose up --build
```
