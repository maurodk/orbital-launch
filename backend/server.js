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
        range: `${implantacao}!A:L`,
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

    // --- Ação 1: Atualizar a planilha de Implantação (como antes) ---
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `${implantacao}!E${rowIndex}:J${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [data] },
    });

    // --- Ação 2: Atualizar o status do cliente na planilha de Dados (como antes) ---
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

    // --- MUDANÇA: Ação 3: Adicionar registro na planilha de Funil ---

    // 3.1: Obter o nome da Unidade/Lote (Coluna D) da planilha de implantação
    const unitDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `${implantacao}!D${rowIndex}`,
    });
    const unitName = unitDataResponse.data.values
      ? unitDataResponse.data.values[0][0]
      : "N/A";

    // 3.2: Preparar a linha para a planilha de funil
    const idPreCadastro = data[0]; // Vem do array enviado pelo frontend
    const corretor = data[3]; // Vem do array enviado pelo frontend
    const funnelRow = [idPreCadastro, unitName || "N/A", corretor];

    // 3.3: Adicionar a nova linha na planilha de funil
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_FUNIL,
      range: `${SHEET_NAME_FUNIL}!A:C`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [funnelRow],
      },
    });

    // --- Fim da Ação 3 ---

    res.json({
      success: true,
      message: `Reserva na implantação, status do cliente e registro no funil atualizados com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao processar a reserva completa:", error);
    res
      .status(500)
      .json({ error: "Falha ao processar a reserva em todas as etapas." });
  }
});

// Endpoint para CANCELAR uma reserva
app.post("/api/cancel-reservation", async (req, res) => {
  // <<< MUDANÇA 1: Receba o idPreCadastro do corpo da requisição
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

    // Ação 1: Limpar dados na planilha de Implantação (já corrigido)
    const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `${implantacao}!E${unitRowIndex}:J${unitRowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [emptyUnitData] },
    });

    // Ação 2: Reverter o status do cliente na planilha de Dados (já correto)
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

    // <<< MUDANÇA 2: Lógica para encontrar e deletar a linha do Funil >>>
    if (idPreCadastro) {
      console.log(
        `Buscando remover a linha com ID: ${idPreCadastro} do Funil.`
      );
      try {
        // 1. Obter todos os IDs da coluna A da planilha Funil
        const funnelData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_FUNIL,
          range: `${SHEET_NAME_FUNIL}!A:A`,
        });
        const funnelIds = (funnelData.data.values || []).flat();

        // 2. Encontrar o índice da linha que corresponde ao nosso ID
        const rowIndexToDelete = funnelIds.findIndex(
          (id) => id === idPreCadastro
        );

        if (rowIndexToDelete !== -1) {
          // 3. Obter o ID numérico da aba (sheetId), necessário para a deleção
          const spreadsheetMeta = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID_FUNIL,
          });
          const sheet = spreadsheetMeta.data.sheets.find(
            (s) => s.properties.title === SHEET_NAME_FUNIL
          );
          const sheetId = sheet.properties.sheetId;

          // 4. Montar e enviar a requisição de deleção
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID_FUNIL,
            resource: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: sheetId,
                      dimension: "ROWS", // Queremos deletar uma linha
                      startIndex: rowIndexToDelete, // O índice da linha (base 0)
                      endIndex: rowIndexToDelete + 1, // O índice final (exclusivo)
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
        // Não paramos o processo, o cancelamento principal já foi feito.
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
    const range = `${implantacao}!K${rowIndex}:L${rowIndex}`;
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
    const range = `${implantacao}!K${rowIndex}:L${rowIndex}`;
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
