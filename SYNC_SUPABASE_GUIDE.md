# Guia de Sincronização: Sheets ↔ Supabase

## 📋 Visão Geral

O sistema agora sincroniza unidades **bidirecionalmente** entre Google Sheets e Supabase:

- **Sheets** continua sendo a fonte primária (para compatibilidade)
- **Supabase** armazena os dados para performance e SSE em tempo real
- **SSE (fullscreen)** agora se baseia nos dados do Supabase (mais rápido)

---

## 🗄️ 1. Criar Tabela no Supabase

### Opção A: Executar SQL no Dashboard

1. Acesse o **Dashboard do Supabase**
2. Vá em **SQL Editor**
3. Execute o script:

```bash
backend/migrations/create_unidades_table.sql
```

### Opção B: Adicionar Colunas à Tabela Existente

Se a tabela `unidades` já existe mas está incompleta:

```bash
backend/migrations/alter_unidades_add_missing_columns.sql
```

---

## 📥 2. Importar Unidades (CSV/XLSX)

Quando você importa um arquivo CSV ou XLSX via endpoint, o sistema agora:

1. ✅ Insere no **Google Sheets**
2. ✅ Insere automaticamente no **Supabase**

### Endpoint

```
POST /api/import-unidades
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- csv: arquivo.xlsx ou arquivo.csv
- implantacao: "nome-da-implantacao"
```

### Exemplo usando cURL

```bash
curl -X POST http://localhost:3000/api/import-unidades \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "csv=@unidades.xlsx" \
  -F "implantacao=Nome da Implantação"
```

---

## 🔄 3. Sincronizar Unidades Existentes

Se você **já tem dados no Sheets** e quer popular o Supabase:

### Endpoint

```
POST /api/sync-sheets-to-supabase
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "implantacao": "nome-da-implantacao"
}
```

### Exemplo usando cURL

```bash
curl -X POST http://localhost:3000/api/sync-sheets-to-supabase \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"implantacao":"Nome da Implantação"}'
```

### O que esse endpoint faz:

1. Busca todas as unidades do **Google Sheets**
2. **Limpa** as unidades existentes no Supabase para essa implantação
3. **Insere** todas as unidades do Sheets no Supabase

⚠️ **ATENÇÃO**: Isso substitui completamente os dados no Supabase pelos dados do Sheets.

---

## 🎯 4. Quando Usar Cada Endpoint

| Cenário                  | Endpoint                       | Descrição                                    |
| ------------------------ | ------------------------------ | -------------------------------------------- |
| Importar novas unidades  | `/api/import-unidades`         | Adiciona unidades no Sheets E Supabase       |
| Popular Supabase inicial | `/api/sync-sheets-to-supabase` | Copia TODAS as unidades do Sheets → Supabase |
| Corrigir dessincronia    | `/api/sync-sheets-to-supabase` | Força Sheets como fonte da verdade           |

---

## ⚡ 5. SSE em Tempo Real (Fullscreen)

### Antes (baseado em Sheets)

```
Reserva → Atualiza Sheets → Busca dados do Sheets → Broadcast SSE
                               ↑ LENTO (API do Google)
```

### Agora (baseado em Supabase)

```
Reserva → Atualiza Supabase → Busca dados do Supabase → Broadcast SSE
                                ↑ RÁPIDO (banco local)
          └─> Sync Sheets em background (não bloqueia)
```

### Resultado:

- ⚡ **Fullscreen atualiza instantaneamente**
- 🔄 **Sheets continua sincronizado** (em background)
- 🛡️ **Fallback automático** se Supabase falhar

---

## 🔍 6. Verificar Sincronização

### Ver unidades no Supabase

```sql
SELECT
  i.nome AS implantacao,
  COUNT(u.id) AS total_unidades,
  COUNT(CASE WHEN u.situacao = 'Disponível' THEN 1 END) AS disponiveis,
  COUNT(CASE WHEN u.situacao = 'Reservada' THEN 1 END) AS reservadas
FROM implantacoes i
LEFT JOIN unidades u ON u.implantacao_id = i.id
GROUP BY i.nome;
```

### Ver estrutura da tabela

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'unidades'
ORDER BY ordinal_position;
```

---

## 📝 7. Estrutura da Tabela Unidades

| Coluna            | Tipo    | Origem   | Descrição                                 |
| ----------------- | ------- | -------- | ----------------------------------------- |
| `id`              | UUID    | Supabase | ID único da unidade                       |
| `implantacao_id`  | UUID    | Supabase | FK para `implantacoes`                    |
| `row_index`       | INTEGER | Sheets   | Número da linha no Sheets (sincronização) |
| `torre`           | TEXT    | A        | Torre/Etapa                               |
| `andar`           | TEXT    | B        | Andar/Bloco                               |
| `nome_unidade`    | TEXT    | C        | Nome da unidade                           |
| `tipo`            | TEXT    | D        | Tipo/Tipologia                            |
| `area`            | TEXT    | E        | Área                                      |
| `valor`           | TEXT    | F        | Valor                                     |
| `id_pre_cadastro` | TEXT    | G        | ID Pré-Cadastro                           |
| `cliente`         | TEXT    | H        | Nome do cliente                           |
| `documento`       | TEXT    | I        | CPF/CNPJ                                  |
| `corretor`        | TEXT    | J        | Nome do corretor                          |
| `imobiliaria`     | TEXT    | K        | Nome da imobiliária                       |
| `situacao`        | TEXT    | L        | Disponível/Reservada/Bloqueada            |
| `coord_x`         | TEXT    | M        | Coordenada X (%)                          |
| `coord_y`         | TEXT    | N        | Coordenada Y (%)                          |

---

## ✅ 8. Checklist de Implementação

- [ ] Executar SQL de criação/alteração da tabela `unidades`
- [ ] Verificar se tabela `implantacoes` já existe e tem dados
- [ ] Para cada implantação existente:
  - [ ] Rodar `/api/sync-sheets-to-supabase`
  - [ ] Verificar contagem de unidades no Supabase
- [ ] Testar importação de nova implantação via CSV/XLSX
- [ ] Testar reserva e verificar atualização em tempo real no fullscreen
- [ ] Testar cancelamento e troca de unidade

---

## 🐛 9. Troubleshooting

### Problema: "Implantação não encontrada no Supabase"

**Solução**: Certifique-se que a implantação existe na tabela `implantacoes` do Supabase.

```sql
SELECT id, nome FROM implantacoes;
```

### Problema: "Unidades não aparecem no fullscreen"

**Solução**:

1. Verifique se as unidades estão no Supabase: `SELECT COUNT(*) FROM unidades WHERE implantacao_id = 'uuid'`
2. Verifique se `coord_x` e `coord_y` estão preenchidos
3. Teste o SSE: abra o fullscreen e veja o console do navegador

### Problema: "Erro ao inserir: duplicate key value"

**Solução**: Já existe uma unidade com mesmo `implantacao_id` e `row_index`. Use `/api/sync-sheets-to-supabase` para resetar.

---

## 📞 Suporte

Em caso de dúvidas, verifique os logs do backend:

```bash
npm run dev  # backend
```

Procure por:

- `[IMPORT UNIDADES]` - Importação de CSV/XLSX
- `[SYNC]` - Sincronização Sheets → Supabase
- `[SSE]` - Broadcast de eventos em tempo real
