// backend/server.js - VERSÃO COMPLETA E CORRIGIDA

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
const SPREADSHEET_ID_FUNIL = "1v1S__nsKFCYbbpO36PP0MPQqBWgKcP1utuLYByAhca0";
const SHEET_NAME_FUNIL = "Página1";

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
        range: `'${implantacao}'!A:M`, // <-- CORREÇÃO AQUI
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
    console.error(
      `Erro ao buscar dados da implantação ${implantacao}:`,
      error.message
    );
    res.status(500).json({
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
      // Adicionando a coluna D para o endereço
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

// Endpoint para RESERVAR uma unidade (via lista de clientes)
app.post("/api/update", async (req, res) => {
  const { implantacao, rowIndex, data, clientName, unitName } = req.body;
  if (!implantacao || !rowIndex || !data || !clientName) {
    return res.status(400).json({ error: "Dados incompletos para a reserva." });
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/update para a linha ${rowIndex} em '${implantacao}'`
  );
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`, // <-- CORREÇÃO AQUI
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
    res.json({ success: true, message: `Reserva e funil atualizados.` });
  } catch (error) {
    console.error("Erro ao processar a reserva completa:", error);
    res
      .status(500)
      .json({ error: "Falha ao processar a reserva em todas as etapas." });
  }
});

// Endpoint para RESERVA ESPONTÂNEA
app.post("/api/spontaneous-update", async (req, res) => {
  const { implantacao, rowIndex, unitName, manualData } = req.body;
  if (!implantacao || !rowIndex || !manualData || !manualData.cliente) {
    return res.status(400).json({
      error:
        "Dados incompletos para a reserva espontânea. O nome do cliente é obrigatório.",
    });
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/spontaneous-update para a linha ${rowIndex} em '${implantacao}'`
  );
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
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`, // <-- CORREÇÃO AQUI
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
    res.json({
      success: true,
      message: "Reserva espontânea realizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao processar a reserva espontânea:", error);
    res.status(500).json({ error: "Falha ao processar a reserva espontânea." });
  }
});

// Endpoint para CANCELAR uma reserva
app.post("/api/cancel-reservation", async (req, res) => {
  const { implantacao, unitRowIndex, clientName, idPreCadastro } = req.body;
  if (!implantacao || !unitRowIndex || !clientName) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para o cancelamento." });
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] -> EXECUTANDO CANCELAMENTO para linha ${unitRowIndex}`
  );
  try {
    const sheets = await getSheetsClient();
    const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${unitRowIndex}:K${unitRowIndex}`, // <-- CORREÇÃO AQUI
      valueInputOption: "USER_ENTERED",
      resource: { values: [emptyUnitData] },
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
        resource: { values: [["PODE RESERVAR"]] },
      });
    }
    if (idPreCadastro) {
      console.log(
        `Buscando remover a linha com ID: ${idPreCadastro} do Funil.`
      );
      try {
        const funnelData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_FUNIL,
          range: `${SHEET_NAME_FUNIL}!A:A`,
        });
        const funnelIds = (funnelData.data.values || []).flat();
        const rowIndexToDelete = funnelIds.findIndex(
          (id) => id === idPreCadastro
        );
        if (rowIndexToDelete !== -1) {
          const spreadsheetMeta = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID_FUNIL,
          });
          const sheet = spreadsheetMeta.data.sheets.find(
            (s) => s.properties.title === SHEET_NAME_FUNIL
          );
          const sheetId = sheet.properties.sheetId;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID_FUNIL,
            resource: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: sheetId,
                      dimension: "ROWS",
                      startIndex: rowIndexToDelete,
                      endIndex: rowIndexToDelete + 1,
                    },
                  },
                },
              ],
            },
          });
          console.log(
            `Linha ${rowIndexToDelete + 1} deletada do Funil com sucesso.`
          );
        } else {
          console.log(
            `ID ${idPreCadastro} não encontrado na planilha Funil. Nenhuma linha foi deletada.`
          );
        }
      } catch (funnelError) {
        console.error(
          "Erro ao tentar deletar linha da planilha Funil:",
          funnelError.message
        );
      }
    }
    res.json({
      success: true,
      message: "Cancelamento efetuado com sucesso em todas as planilhas.",
    });
  } catch (error) {
    console.error("Erro ao cancelar a reserva:", error);
    res.status(500).json({ error: "Falha ao cancelar a reserva." });
  }
});

// Endpoint para ATUALIZAR COORDENADAS
app.post("/api/update-coords", async (req, res) => {
  const { implantacao, rowIndex, coordX, coordY } = req.body;
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
  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/update-coords para a linha ${rowIndex} em '${implantacao}'`
  );
  try {
    const sheets = await getSheetsClient();
    const range = `'${implantacao}'!L${rowIndex}:M${rowIndex}`; // <-- CORREÇÃO AQUI
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
  if (!implantacao || !rowIndex) {
    return res.status(400).json({ error: "O índice da linha é obrigatório." });
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] -> POST /api/clear-coords para a linha ${rowIndex} em '${implantacao}'`
  );
  try {
    const sheets = await getSheetsClient();
    const range = `'${implantacao}'!L${rowIndex}:M${rowIndex}`; // <-- CORREÇÃO AQUI
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

app.post("/api/update-dot-size", async (req, res) => {
  const { implantacaoName, newSize } = req.body;

  if (!implantacaoName || newSize === undefined) {
    return res
      .status(400)
      .json({ error: "Nome da implantação e novo tamanho são obrigatórios." });
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] -> ATUALIZANDO TAMANHO DO PONTO para '${implantacaoName}' para ${newSize}px`
  );

  try {
    const sheets = await getSheetsClient();

    // 1. Encontrar a linha correta na planilha de Implantações
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

    // 2. Atualizar a célula na coluna C (TamanhoPonto)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!C${sheetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newSize]] },
    });

    res.json({
      success: true,
      message: `Tamanho do ponto para '${implantacaoName}' atualizado.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar o tamanho do ponto:", error);
    res.status(500).json({ error: "Falha ao atualizar o tamanho do ponto." });
  }
});

app.post("/api/toggle-block-unit", async (req, res) => {
  const { implantacao, rowIndex, newStatus } = req.body;

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

  console.log(
    `[${new Date().toLocaleTimeString()}] -> ATUALIZANDO STATUS para '${newStatus}' na linha ${rowIndex} em '${implantacao}'`
  );

  try {
    const sheets = await getSheetsClient();
    // Atualiza apenas a coluna J (Situação da Unidade)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!K${rowIndex}`, // <-- CORREÇÃO AQUI
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newStatus]] },
    });

    res.json({
      success: true,
      message: `Unidade atualizada para ${newStatus}.`,
    });
  } catch (error) {
    console.error("Erro ao bloquear/desbloquear unidade:", error);
    res.status(500).json({ error: "Falha ao atualizar o status da unidade." });
  }
});

// ESTA LINHA DEVE SER SEMPRE A ÚLTIMA ANTES DE EXPORTAR O MÓDULO (SE APLICÁVEL)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
