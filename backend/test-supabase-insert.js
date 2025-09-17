// backend/test-supabase-insert.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Coloque SUPABASE_URL e SUPABASE_SERVICE_ROLE no backend/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function run() {
  // tente inserir um registro simples na tabela `unidades` (ajuste os campos conforme seu schema)
  const payload = {
    row_index: 999999,
    etapa: "TESTE",
    bloco: "T",
    nome_unidade: "TESTE-UNIT",
    tipologia: "T1",
    situacao: "TEST",
    implantacao_id: null,
  };
  const { data, error } = await supabase
    .from("unidades")
    .insert(payload)
    .select();
  console.log("data:", data);
  console.log("error:", error);
}

run().catch(console.error);
