// backend/server.js - VERSÃO COMPLETA E DINÂMICA

const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
require("dotenv").config(); // Garante que as variáveis de ambiente sejam carregadas

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÕES ---
const SPREADSHEET_ID_IMPLANTACAO =
  "1_q-6DYUTbPKPzBFCovoOTrtKXys1TraQFzGiXiz-h9s";
const SPREADSHEET_ID_DADOS = "1CyXDp_RpSApsh-QjJPuWUzHnQV1MZFy2W3u7jIhFPbY";
const SHEET_NAME_DADOS = "Página1";
const SHEET_NAME_CONFIG = "Config";
const SHEET_NAME_IMPLANTACOES = "Implantacoes";

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// Endpoint para buscar dados de unidades de uma implantação específica
app.get("/api/data", async (req, res) => {
  const { implantacao } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] -> GET /api/data para a implantação: ${implantacao}`
  );

  try {
    const sheets = await getSheetsClient();
    const [implantacaoRes, dadosRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `${implantacao}!A:M`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!A:G`,
      }),
    ]);
    res.json({
      unidades: implantacaoRes.data.values || [],
      clientes: dadosRes.data.values || [],
    });
  } catch (error) {
    console.error(
      `Erro ao buscar dados da implantação ${implantacao}:`,
      error.message
    );
    res
      .status(500)
      .json({
        error: `Falha ao buscar dados para a implantação '${implantacao}'. Verifique se a aba com este nome existe.`,
      });
  }
});

// Endpoint para buscar a configuração
app.get("/api/config", async (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] -> GET /api/config`);
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
    console.error("Erro ao buscar configuração:", error);
    res.status(500).json({ error: "Falha ao buscar configuração." });
  }
});

// Endpoint para buscar a lista de implantações
app.get("/api/implantacoes", async (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] -> GET /api/implantacoes`);
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:B`,
    });
    const implantacoes = (response.data.values || []).map((row) => ({
      nome: row[0],
      url: row[1],
    }));
    res.json(implantacoes);
  } catch (error) {
    console.error("Erro ao buscar lista de implantações:", error);
    res.status(500).json({ error: "Falha ao buscar lista de implantações." });
  }
});

// Endpoint para ATUALIZAR a configuração
app.post("/api/update-config", async (req, res) => {
  const { key, value } = req.body;
  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/update-config para a chave ${key}`
  );
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

// --- ENDPOINTS DE MODIFICAÇÃO (ATUALIZADOS) ---

// Endpoint para RESERVAR uma unidade
app.post("/api/update", async (req, res) => {
  const { implantacao, rowIndex, data, clientName } = req.body;
  if (!implantacao)
    return res
      .status(400)
      .json({ error: "Nome da implantação é obrigatório." });
  if (!rowIndex || !data || !clientName)
    return res.status(400).json({ error: "Dados incompletos para a reserva." });

  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/update para a linha ${rowIndex} em '${implantacao}'`
  );

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `${implantacao}!E${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [data] },
    });

    const allClientsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_DADOS}!A:G`,
    });
    const allClients = allClientsData.data.values || [];
    const clientRowIndex = allClients.findIndex(
      (row) => row && row[0] === clientName
    );

    if (clientRowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!G${clientRowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [["JA RESERVOU"]] },
      });
    }

    res.json({
      success: true,
      message: `Reserva na implantação '${implantacao}' e status do cliente atualizados.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar a reserva:", error);
    res.status(500).json({ error: "Falha ao atualizar a reserva." });
  }
});

// Endpoint para CANCELAR uma reserva
app.post("/api/cancel-reservation", async (req, res) => {
  const { implantacao, unitRowIndex, clientName } = req.body;
  if (!implantacao)
    return res
      .status(400)
      .json({ error: "Nome da implantação é obrigatório." });
  if (!unitRowIndex || !clientName)
    return res
      .status(400)
      .json({ error: "Dados incompletos para o cancelamento." });

  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/cancel-reservation para a linha ${unitRowIndex} em '${implantacao}'`
  );

  try {
    const sheets = await getSheetsClient();
    const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `${implantacao}!F${unitRowIndex}:K${unitRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [emptyUnitData] },
    });

    const allClientsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_DADOS}!A:G`,
    });
    const allClients = allClientsData.data.values || [];
    const clientRowIndex = allClients.findIndex(
      (row) => row && row[0] === clientName
    );

    if (clientRowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!G${clientRowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [["PODE RESERVAR"]] },
      });
    }

    res.json({ success: true, message: "Cancelamento efetuado com sucesso." });
  } catch (error) {
    console.error("Erro ao cancelar a reserva:", error);
    res.status(500).json({ error: "Falha ao cancelar a reserva." });
  }
});

// Endpoint para ATUALIZAR COORDENADAS
app.post("/api/update-coords", async (req, res) => {
  const { implantacao, rowIndex, coordX, coordY } = req.body;
  if (!implantacao)
    return res
      .status(400)
      .json({ error: "Nome da implantação é obrigatório." });
  if (!rowIndex || coordX === undefined || coordY === undefined) {
    return res
      .status(400)
      .json({ error: "Índice da linha e coordenadas X e Y são obrigatórios." });
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/update-coords para a linha ${rowIndex} em '${implantacao}'`
  );

  try {
    const sheets = await getSheetsClient();
    const range = `${implantacao}!L${rowIndex}:M${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[coordX, coordY]] },
    });
    res.json({
      success: true,
      message: `Coordenadas atualizadas em '${implantacao}'.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar coordenadas na planilha:", error);
    res.status(500).json({ error: "Falha ao atualizar coordenadas." });
  }
});

// Endpoint para LIMPAR COORDENADAS
app.post("/api/clear-coords", async (req, res) => {
  const { implantacao, rowIndex } = req.body;
  if (!implantacao)
    return res
      .status(400)
      .json({ error: "Nome da implantação é obrigatório." });
  if (!rowIndex)
    return res.status(400).json({ error: "O índice da linha é obrigatório." });

  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/clear-coords para a linha ${rowIndex} em '${implantacao}'`
  );

  try {
    const sheets = await getSheetsClient();
    const range = `${implantacao}!L${rowIndex}:M${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["", ""]] },
    });
    res.json({
      success: true,
      message: `Coordenadas limpas em '${implantacao}'.`,
    });
  } catch (error) {
    console.error("Erro ao limpar coordenadas na planilha:", error);
    res.status(500).json({ error: "Falha ao limpar coordenadas." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
