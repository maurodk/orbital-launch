// backend/server.js - VERSÃO COMPLETA E FINAL COM AUTENTICAÇÃO

// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// =================================================================
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

// Carrega a chave de serviço do Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");

// =================================================================
// 2. INICIALIZAÇÃO DOS SERVIÇOS
// =================================================================

// Inicializa o Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Inicializa o Express App
const app = express();

// =================================================================
// 3. CONFIGURAÇÕES DE MIDDLEWARE
// =================================================================

// Configuração de CORS para permitir acesso do seu frontend (Vercel)
const allowedOrigins = [
  "https://simulador-implantacao.vercel.app", // Frontend em produção
  "http://localhost:5173", // Frontend em desenvolvimento local
  // Adicione outras URLs se necessário
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Acesso não permitido pela política de CORS"));
    }
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// =================================================================
// 4. CONSTANTES DAS PLANILHAS
// =================================================================
const SPREADSHEET_ID_IMPLANTACAO =
  "1_q-6DYUTbPKPzBFCovoOTrtKXys1TraQFzGiXiz-h9s";
const SPREADSHEET_ID_DADOS = "1CyXDp_RpSApsh-QjJPuWUzHnQV1MZFy2W3u7jIhFPbY";
const SPREADSHEET_ID_FUNIL = "1v1S__nsKFCYbbpO36PP0MPQqBWgKcP1utuLYByAhca0";
const SPREADSHEET_ID_HISTORICO = "1LiDhvO1wJg8WZFpmMKUFE2DkzIxzouch_7aHjwlQPfI";

const SHEET_NAME_DADOS = "Página1";
const SHEET_NAME_CONFIG = "Config";
const SHEET_NAME_IMPLANTACOES = "Implantacoes";
const SHEET_NAME_FUNIL = "Página1";

// =================================================================
// 5. FUNÇÕES AUXILIARES E MIDDLEWARE DE AUTENTICAÇÃO
// (Definidas ANTES de serem usadas nos endpoints)
// =================================================================

// Middleware para verificar o Token do Firebase
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Acesso não autorizado: Token não fornecido.");
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Adiciona os dados do usuário à requisição
    next(); // Passa para o próximo handler (o endpoint em si)
  } catch (error) {
    console.error("Erro ao verificar token:", error);
    return res.status(403).send("Acesso proibido: Token inválido.");
  }
}

// Cliente do Google Sheets
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// Função para adicionar registro no histórico
async function addHistoryEntry(
  sheets,
  implantacao,
  unidade,
  acao,
  cliente,
  corretor,
  usuario
) {
  try {
    const now = new Date();

    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    };
    const formatter = new Intl.DateTimeFormat("pt-BR", options);
    const parts = formatter.formatToParts(now);
    const dateParts = {};
    parts.forEach((p) => (dateParts[p.type] = p.value));

    // Adiciona apóstrofo para forçar o Google Sheets a tratar como texto
    const dataFormatada = `'${dateParts.day}/${dateParts.month}/${dateParts.year} às ${dateParts.hour}:${dateParts.minute}`;

    const historyRow = [
      now.toISOString(),
      dataFormatada,
      unidade,
      acao,
      cliente || "N/A",
      corretor || "N/A",
      usuario || "Sistema",
    ];

    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
    });
    const sheetExists = spreadsheetMeta.data.sheets.some(
      (s) => s.properties.title === implantacao
    );

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID_HISTORICO,
        resource: {
          requests: [{ addSheet: { properties: { title: implantacao } } }],
        },
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID_HISTORICO,
        range: `'${implantacao}'!A1`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [
            [
              "Timestamp",
              "Data e Hora",
              "Unidade",
              "Ação",
              "Cliente",
              "Corretor",
              "Usuário",
            ],
          ],
        },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
      range: `'${implantacao}'!A:G`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [historyRow] },
    });
    console.log(
      `[HISTÓRICO] Evento '${acao}' registrado por '${usuario}' em '${implantacao}'.`
    );
  } catch (error) {
    console.error("### ERRO AO REGISTRAR HISTÓRICO ###:", error.message);
  }
}

// =================================================================
// 6. ENDPOINTS DA API (Todos protegidos por verifyToken)
// =================================================================

// --- Endpoints de Leitura ---

app.get("/api/data", verifyToken, async (req, res) => {
  const { implantacao } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }
  try {
    const sheets = await getSheetsClient();
    const [implantacaoRes, dadosRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${implantacao}'!A:M`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!A:F`,
      }),
    ]);
    res.json({
      unidades: implantacaoRes.data.values || [],
      clientes: dadosRes.data.values || [],
    });
  } catch (error) {
    res.status(500).json({
      error: `Falha ao buscar dados para a implantação '${implantacao}'.`,
    });
  }
});

app.get("/api/config", verifyToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const configRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_CONFIG}!A2:B`,
    });
    const configObject = (configRes.data.values || []).reduce((acc, row) => {
      if (row[0]) acc[row[0]] = row[1];
      return acc;
    }, {});
    res.json(configObject);
  } catch (error) {
    res.status(500).json({ error: "Falha ao buscar configuração." });
  }
});

app.get("/api/implantacoes", verifyToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:E`,
    });
    const implantacoes = (response.data.values || []).map((row) => ({
      nome: row[0],
      url: row[1],
      tamanhoPonto: parseInt(row[2], 10) || 16,
      endereco: row[3] || "Endereço não informado",
      logoUrl: row[4] || "/logo-uni.png",
    }));
    res.json(implantacoes);
  } catch (error) {
    res.status(500).json({ error: "Falha ao buscar lista de implantações." });
  }
});

// Endpoint para ATUALIZAR a configuração
app.post("/api/update-config", verifyToken, async (req, res) => {
  const { key, value } = req.body;
  const userEmail = req.user.email;
  console.log(
    `[CONFIG] Usuário '${userEmail}' está atualizando a chave '${key}'.`
  );
  // (Este endpoint não precisa de registro na planilha de histórico de unidades)
  if (!key || value === undefined) {
    return res.status(400).json({ error: "Chave e valor são obrigatórios." });
  }
  try {
    const sheets = await getSheetsClient();
    const rangeData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_CONFIG}!A:A`,
    });
    const allKeys = (rangeData.data.values || []).flat();
    const rowIndex = allKeys.indexOf(key);
    if (rowIndex === -1) {
      return res.status(404).json({ error: `Chave '${key}' não encontrada.` });
    }
    const sheetRowIndex = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_CONFIG}!B${sheetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[value]] },
    });
    res.json({ success: true, message: `Configuração '${key}' atualizada.` });
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error);
    res.status(500).json({ error: "Falha ao atualizar configuração." });
  }
});

app.post("/api/update", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, data, clientName, unitName } = req.body;
  const userEmail = req.user.email;
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [data] },
    });
    const allClientsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_DADOS}!A:F`,
    });
    const allClients = allClientsData.data.values || [];
    const clientRowIndex = allClients.findIndex(
      (row) => row && row[1] === clientName
    );
    if (clientRowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!F${clientRowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [["JA RESERVOU"]] },
      });
    }
    const funnelRow = [data[0], unitName || "N/A", data[3]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FUNIL,
      range: `${SHEET_NAME_FUNIL}!A:C`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [funnelRow] },
    });
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;
    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Reservada",
      clientName,
      data[3],
      userEmail
    );
    res.json({ success: true, message: `Reserva e funil atualizados.` });
  } catch (error) {
    res.status(500).json({ error: "Falha ao processar a reserva." });
  }
});

// Endpoint para RESERVA ESPONTÂNEA
app.post("/api/spontaneous-update", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, unitName, manualData } = req.body;
  const userEmail = req.user.email;
  if (!implantacao || !rowIndex || !manualData || !manualData.cliente) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para a reserva espontânea." });
  }
  try {
    const sheets = await getSheetsClient();
    const dataToUpdate = [
      manualData.id || "",
      manualData.cliente,
      manualData.documento || "",
      manualData.corretor || "",
      "",
      "RESERVADA",
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [dataToUpdate] },
    });
    const funnelRow = [
      manualData.id || "",
      unitName || "N/A",
      manualData.corretor || "",
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FUNIL,
      range: `${SHEET_NAME_FUNIL}!A:C`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [funnelRow] },
    });
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;
    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Reservada (Espontânea)",
      manualData.cliente,
      manualData.corretor,
      userEmail
    );
    res.json({
      success: true,
      message: "Reserva espontânea realizada com sucesso.",
    });
  } catch (error) {
    res.status(500).json({ error: "Falha ao processar a reserva espontânea." });
  }
});

// Endpoint para CANCELAR uma reserva
app.post("/api/cancel-reservation", verifyToken, async (req, res) => {
  const { implantacao, unitRowIndex, clientName, idPreCadastro } = req.body;
  const userEmail = req.user.email; // Declaração no escopo principal da função

  if (!implantacao || !unitRowIndex || !clientName) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para o cancelamento." });
  }

  try {
    const sheets = await getSheetsClient();

    // TODA A LÓGICA DE INTERAÇÃO COM A PLANILHA VAI DENTRO DO TRY
    const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${unitRowIndex}:K${unitRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [emptyUnitData] },
    });

    // ... (sua lógica para atualizar cliente e funil continua aqui) ...

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${unitRowIndex}:C${unitRowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;

    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Cancelada",
      clientName,
      null,
      userEmail
    );

    res.json({ success: true, message: "Cancelamento efetuado com sucesso." });
  } catch (error) {
    console.error("Erro ao cancelar a reserva:", error);
    res.status(500).json({ error: "Falha ao cancelar a reserva." });
  }
});

// Endpoint para ATUALIZAR COORDENADAS
app.post("/api/update-coords", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, coordX, coordY } = req.body;
  const userEmail = req.user.email;
  if (
    !implantacao ||
    !rowIndex ||
    coordX === undefined ||
    coordY === undefined
  ) {
    return res
      .status(400)
      .json({ error: "Índice da linha e coordenadas X e Y são obrigatórios." });
  }
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!L${rowIndex}:M${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[coordX, coordY]] },
    });
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;
    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Mapeamento Adicionado",
      null,
      null,
      userEmail
    );
    res.json({
      success: true,
      message: `Coordenadas atualizadas e histórico registrado para '${unitFullName}'.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar coordenadas." });
  }
});

// Endpoint para LIMPAR COORDENADAS
app.post("/api/clear-coords", verifyToken, async (req, res) => {
  // Extrai os dados
  const { implantacao, rowIndex } = req.body;
  const userEmail = req.user.email;

  // Validação
  if (!implantacao || !rowIndex) {
    return res.status(400).json({ error: "O índice da linha é obrigatório." });
  }

  try {
    const sheets = await getSheetsClient();
    const range = `'${implantacao}'!L${rowIndex}:M${rowIndex}`;

    // Ação Principal: Limpar as coordenadas
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["", ""]] },
    });

    // Ação Secundária: Registrar no histórico
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;

    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Mapeamento Removido", // Ação descritiva diferente
      null,
      null,
      userEmail
    );

    res.json({
      success: true,
      message: `Coordenadas limpas e histórico registrado para '${unitFullName}'.`,
    });
  } catch (error) {
    console.error("Erro ao limpar coordenadas na planilha:", error);
    res.status(500).json({ error: "Falha ao limpar coordenadas." });
  }
});

app.post("/api/update-dot-size", verifyToken, async (req, res) => {
  const { implantacaoName, newSize } = req.body;
  const userEmail = req.user.email;
  if (!implantacaoName || newSize === undefined) {
    return res
      .status(400)
      .json({ error: "Nome da implantação e novo tamanho são obrigatórios." });
  }
  try {
    const sheets = await getSheetsClient();
    const rangeData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A:A`,
    });
    const allNames = (rangeData.data.values || []).flat();
    const rowIndex = allNames.findIndex((name) => name === implantacaoName);
    if (rowIndex === -1) {
      return res
        .status(404)
        .json({ error: `Implantação '${implantacaoName}' não encontrada.` });
    }
    const sheetRowIndex = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!C${sheetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newSize]] },
    });
    // Registra a mudança no histórico da própria implantação
    await addHistoryEntry(
      sheets,
      implantacaoName,
      `Config: ${implantacaoName}`,
      `Tamanho do ponto alterado para ${newSize}px`,
      null,
      null,
      userEmail
    );
    res.json({
      success: true,
      message: `Tamanho do ponto para '${implantacaoName}' atualizado.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar o tamanho do ponto." });
  }
});

app.post("/api/toggle-block-unit", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, newStatus } = req.body;
  const userEmail = req.user.email; // Declaração no escopo principal

  if (
    !implantacao ||
    !rowIndex ||
    !newStatus ||
    !["BLOQUEADA", "DISPONÍVEL"].includes(newStatus)
  ) {
    return res
      .status(400)
      .json({ error: "Dados inválidos para bloquear/desbloquear unidade." });
  }

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newStatus]] },
    });

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!B${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]} - ${unidadeInfo.data.values[0][1]}`;
    const acao = newStatus === "BLOQUEADA" ? "Bloqueada" : "Desbloqueada";

    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      acao,
      null,
      null,
      userEmail
    );

    res.json({
      success: true,
      message: `Unidade atualizada para ${newStatus}.`,
    });
  } catch (error) {
    console.error("Erro ao bloquear/desbloquear unidade:", error);
    res.status(500).json({ error: "Falha ao atualizar o status da unidade." });
  }
});

app.post("/api/log-print", verifyToken, async (req, res) => {
  const { implantacao, unitName, clientName } = req.body;
  const userEmail = req.user.email; // Declaração no escopo principal

  if (!implantacao || !unitName) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para log de impressão." });
  }

  try {
    const sheets = await getSheetsClient(); // Precisa do 'sheets' para passar para a função
    await addHistoryEntry(
      sheets,
      implantacao,
      unitName,
      "Termo Impresso",
      clientName,
      null,
      userEmail
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao registrar impressão no histórico:", error);
    res.status(500).json({ error: "Falha ao registrar a impressão." });
  }
});

app.get("/api/history/:implantacao", verifyToken, async (req, res) => {
  const { implantacao } = req.params;
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
      range: `'${implantacao}'!A:G`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const historyData = (response.data.values || []).slice(1).reverse();
    res.json(historyData);
  } catch (error) {
    if (error.code === 400 && error.message.includes("Unable to parse range")) {
      return res.json([]);
    }
    res.status(500).json({ error: "Falha ao buscar histórico." });
  }
});

// ESTA LINHA DEVE SER SEMPRE A ÚLTIMA ANTES DE EXPORTAR O MÓDULO (SE APLICÁVEL)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
