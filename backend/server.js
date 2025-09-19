// backend/server.js - VERSÃO COMPLETA E FINAL COM AUTENTICAÇÃO

// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// =================================================================
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");
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

// Inicializa cliente Supabase (use SERVICE ROLE no backend para operações administrativas)
const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || null;
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
} else {
  console.warn(
    "Supabase: variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE não configuradas. Operações Supabase serão ignoradas."
  );
}

// Inicializa o Express App
const app = express();

// =================================================================
// 3. CONFIGURAÇÕES DE MIDDLEWARE
// =================================================================

// Configuração de CORS para permitir acesso do seu frontend (Vercel)
const allowedOrigins = [
  "https://simulador-implantacao.vercel.app", // Frontend em produção
  "http://localhost:5173", // Frontend em desenvolvimento local
  "http://localhost:5174", // Frontend em desenvolvimento local (porta alternativa)
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

// ==========================================================
// SSE: Server-Sent Events - conexões ativas por implantação
// ==========================================================
const sseClients = new Map(); // chave: implantacao, valor: Set de response objects

// ==========================================================
// Sistema de Reservas Temporárias
// ==========================================================
const tempReservations = new Map(); // chave: "implantacao_rowIndex", valor: { token, userEmail, unitName, timestamp, expiresAt }

// Função para limpar reservas expiradas
function cleanupExpiredReservations() {
  const now = Date.now();
  for (const [key, reservation] of tempReservations.entries()) {
    if (now > reservation.expiresAt) {
      tempReservations.delete(key);
      console.log(`[CLEANUP] Reserva temporária expirada removida: ${key}`);
    }
  }
}

// Limpa reservas expiradas a cada 30 segundos
setInterval(cleanupExpiredReservations, 30000);

function addSseClient(implantacao, res) {
  if (!sseClients.has(implantacao)) sseClients.set(implantacao, new Set());
  sseClients.get(implantacao).add(res);
}

function removeSseClient(implantacao, res) {
  if (!sseClients.has(implantacao)) return;
  sseClients.get(implantacao).delete(res);
  if (sseClients.get(implantacao).size === 0) sseClients.delete(implantacao);
}

async function broadcastEvent(implantacao, event, data) {
  const clients = sseClients.get(implantacao);
  if (!clients) return;

  // Busca os dados atualizados da unidade para enviar no payload
  let eventPayload = { ...data };
  if (data.rowIndex) {
    try {
      const sheets = await getSheetsClient();
      const range = `'${implantacao}'!A${data.rowIndex}:M${data.rowIndex}`;
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range,
      });
      if (sheetData.data.values && sheetData.data.values.length > 0) {
        eventPayload.unitData = sheetData.data.values[0];
      }
    } catch (error) {
      console.error(
        `[SSE Broadcast] Falha ao buscar dados da unidade para o evento:`,
        error
      );
    }
  }

  const payload = `event: ${event}\ndata: ${JSON.stringify(eventPayload)}\n\n`;
  for (const res of Array.from(clients)) {
    try {
      res.write(payload);
    } catch (err) {
      // Se der erro, remove o cliente
      removeSseClient(implantacao, res, res.locals.clientId);
    }
  }
}

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

// Tenta resolver o nome da aba (sheet) dentro de um spreadsheet a partir
// do nome solicitado. Retorna o título exato se encontrado, ou null.
async function resolveSheetName(sheetsClient, spreadsheetId, requestedName) {
  // Always return an object: { found: string | null, available: string[], suggestions?: string[], error?: string }
  try {
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const titles = (meta.data.sheets || []).map(
      (s) => s.properties.title || ""
    );

    const normalize = (s) =>
      (s || "")
        .toString()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .trim();

    const reqNorm = normalize(requestedName || "");

    // 1) Exact title match
    for (const t of titles)
      if (t === requestedName) return { found: t, available: titles };

    // 2) Normalized exact match (case/diacritics/spacing)
    for (const t of titles)
      if (normalize(t) === reqNorm) return { found: t, available: titles };

    // 3) Contains match (title contains request or request contains title)
    for (const t of titles) {
      const tn = normalize(t);
      if (!reqNorm) continue;
      if (tn.includes(reqNorm) || reqNorm.includes(tn))
        return { found: t, available: titles };
    }

    // 4) All words present in title
    const reqWords = reqNorm.split(" ").filter(Boolean);
    if (reqWords.length > 0) {
      for (const t of titles) {
        const tn = normalize(t);
        const all = reqWords.every((w) => tn.includes(w));
        if (all) return { found: t, available: titles };
      }
    }

    // 5) Fallback: levenshtein distance to propose suggestions
    function levenshtein(a, b) {
      const al = a.length;
      const bl = b.length;
      if (al === 0) return bl;
      if (bl === 0) return al;
      const matrix = Array.from({ length: al + 1 }, () =>
        new Array(bl + 1).fill(0)
      );
      for (let i = 0; i <= al; i++) matrix[i][0] = i;
      for (let j = 0; j <= bl; j++) matrix[0][j] = j;
      for (let i = 1; i <= al; i++) {
        for (let j = 1; j <= bl; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
      return matrix[al][bl];
    }

    const scored = titles
      .map((t) => ({ title: t, dist: levenshtein(normalize(t), reqNorm) }))
      .sort((a, b) => a.dist - b.dist || a.title.length - b.title.length);

    const suggestions = scored
      .slice(0, 6)
      .map((s) => s.title)
      .filter(Boolean);
    // If the closest match is reasonably close (<= 3 edits or <=25% of length), return it
    if (scored.length > 0) {
      const best = scored[0];
      const threshold = Math.max(
        3,
        Math.floor(
          Math.max(normalize(best.title).length, reqNorm.length) * 0.25
        )
      );
      if (best.dist <= threshold)
        return { found: best.title, available: titles, suggestions };
    }

    return { found: null, available: titles, suggestions };
  } catch (error) {
    return {
      found: null,
      available: [],
      error: error && error.message ? error.message : String(error),
    };
  }
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
              "Timestamp ISO",
              "Data Formatada",
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

    // Append history to Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
      range: `'${implantacao}'!A:G`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [historyRow],
      },
    });

    // Also persist to Supabase (best-effort)
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .limit(1)
          .single();

        const implantacao_id = implData ? implData.id : null;

        await supabase.from("historico").insert({
          timestamp_iso: now.toISOString(),
          data_formatada: dataFormatada,
          unidade_nome: unidade,
          acao: acao,
          cliente: cliente || null,
          corretor: corretor || null,
          usuario: usuario || "Sistema",
          implantacao_id: implantacao_id,
        });
        console.log(
          `[HISTÓRICO] Gravado no Supabase: '${acao}' em '${implantacao}'.`
        );
      } catch (e) {
        console.error(
          "Supabase: Falha ao gravar no histórico (non-blocking)",
          e.message || e
        );
        console.log(
          `[HISTÓRICO] Evento '${acao}' registrado por '${usuario}' em '${implantacao}' (Sheets fallback).`
        );
      }
    } else {
      console.log(
        `[HISTÓRICO] Evento '${acao}' registrado por '${usuario}' em '${implantacao}' (Sheets only).`
      );
    }
  } catch (error) {
    console.error(
      `Erro ao adicionar entrada no histórico para '${implantacao}':`,
      error.message
    );
  }
}

// =================================================================
// 6. ENDPOINTS DA API
// =================================================================

app.get("/api/data", verifyToken, async (req, res) => {
  const { implantacao } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }

  try {
    const sheets = await getSheetsClient();
    const resolved = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );

    if (!resolved || !resolved.found) {
      const available = Array.isArray(resolved && resolved.available)
        ? resolved.available
        : [];
      const suggestions = Array.isArray(resolved && resolved.suggestions)
        ? resolved.suggestions
        : [];
      const resolverError = resolved && resolved.error ? resolved.error : null;
      return res.status(404).json({
        error: `Planilha '${implantacao}' não encontrada no spreadsheet de implantação.`,
        available,
        suggestions,
        resolverError,
      });
    }
    const sheetTitle = resolved.found;
    const [implantacaoRes, dadosRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!A:M`,
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
      details: error && error.message ? error.message : String(error),
    });
  }
});

// Endpoint público (somente leitura) para ser usado pela página fullscreen
app.get("/api/public-data", async (req, res) => {
  const { implantacao, hideAvailable } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }
  try {
    const sheets = await getSheetsClient();
    const resolved = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );
    if (!resolved || !resolved.found) {
      const available = Array.isArray(resolved && resolved.available)
        ? resolved.available
        : [];
      const suggestions = Array.isArray(resolved && resolved.suggestions)
        ? resolved.suggestions
        : [];
      const resolverError = resolved && resolved.error ? resolved.error : null;
      return res.status(404).json({
        error: `Planilha '${implantacao}' não encontrada no spreadsheet de implantação.`,
        available,
        suggestions,
        resolverError,
      });
    }
    const sheetTitle = resolved.found;
    const implantacaoRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!A:M`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    let unidades = implantacaoRes.data.values || [];

    if (hideAvailable === "true") {
      unidades = unidades.filter(
        (u) => u[10] && u[10].toUpperCase() !== "DISPONÍVEL"
      );
    }

    // Busca os dados da implantação (imagem, dotSize)
    const implantacoesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:C`,
    });

    const implantacaoData = (implantacoesRes.data.values || []).find(
      (row) => row[0] === implantacao
    );

    const imageUrl = implantacaoData ? implantacaoData[1] : "";
    const dotSize = implantacaoData
      ? parseInt(implantacaoData[2], 10) || 16
      : 16;

    res.json({
      unidades,
      imageUrl,
      dotSize,
    });
  } catch (error) {
    res.status(500).json({
      error: `Falha ao buscar dados para a implantação '${implantacao}'.`,
    });
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
    console.error(
      "Erro ao buscar lista de implantações:",
      error && error.message ? error.message : error
    );
    res.status(500).json({ error: "Falha ao buscar lista de implantações." });
  }
});

app.get("/api/config", verifyToken, async (req, res) => {
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
    console.error(
      "Erro ao buscar config:",
      error && error.message ? error.message : error
    );
    res.status(500).json({ error: "Falha ao buscar configurações." });
  }
});

// SSE endpoint público para assinaturas em tempo real (fullscreen pode usar)
app.get("/api/events", (req, res) => {
  const implantacao = req.query.implantacao;
  const clientId =
    req.query.clientId || `client_${Date.now()}_${Math.random()}`;
  if (!implantacao) {
    return res.status(400).send("Parâmetro 'implantacao' é obrigatório.");
  }

  // Cabeçalhos SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders && res.flushHeaders();

  // Envia um comentário inicial para manter a conexão
  res.write(`: connected to ${implantacao}\n\n`);

  res.locals.clientId = clientId;
  addSseClient(implantacao, res);

  // Quando o cliente fechar, remova-o
  req.on("close", () => {
    removeSseClient(implantacao, res, clientId);
  });
});

// Serve a página fullscreen estática
app.get("/fullscreen", (req, res) => {
  res.sendFile(require("path").resolve(__dirname, "../public/fullscreen.html"));
});

// Rota útil: redireciona para a fullscreen da implantação atual definida em Config
app.get("/fullscreen/current", async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const configRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_CONFIG}!A2:B`,
    });
    const configRows = configRes.data.values || [];
    const config = configRows.reduce((acc, row) => {
      if (row[0]) acc[row[0]] = row[1];
      return acc;
    }, {});
    const implantacaoAtual =
      config["implantacaoAtual"] || config["implantacao"] || null;
    if (!implantacaoAtual) {
      return res.status(404).send("implantacaoAtual não encontrada na Config.");
    }
    const encoded = encodeURIComponent(implantacaoAtual);
    return res.redirect(`/fullscreen?implantacao=${encoded}`);
  } catch (error) {
    console.error("Erro ao buscar implantacaoAtual:", error);
    return res.status(500).send("Erro ao buscar implantação atual.");
  }
});

// DEBUG: retorna o client_email do credentials.json e os títulos das abas do spreadsheet solicitado
app.get("/api/debug/spreadsheet-meta", async (req, res) => {
  const spreadsheetId = req.query.spreadsheetId || SPREADSHEET_ID_IMPLANTACAO;
  try {
    // read service account email from credentials.json (used by GoogleAuth)
    let credEmail = null;
    try {
      const cred = require("./credentials.json");
      credEmail = cred.client_email || null;
    } catch (e) {
      credEmail = null;
    }

    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const titles = (meta.data.sheets || []).map(
      (s) => s.properties.title || ""
    );
    return res.json({
      ok: true,
      clientEmail: credEmail,
      spreadsheetId,
      titles,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
});

// Endpoint para criar uma reserva temporária (lock)
app.post("/api/reserve-temp", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, unitName, reservationToken } = req.body;
  const userEmail = req.user.email;

  if (!implantacao || !rowIndex || !reservationToken) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para reserva temporária." });
  }

  try {
    const sheets = await getSheetsClient();

    // VERIFICAÇÃO PRÉVIA: Checa se a unidade ainda está disponível
    const unitCheckRange = `'${implantacao}'!K${rowIndex}`;
    const unitCheckResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitCheckRange,
    });

    const currentStatus =
      unitCheckResult.data.values?.[0]?.[0]?.toUpperCase() || "DISPONÍVEL";

    if (currentStatus !== "DISPONÍVEL") {
      return res.status(409).json({
        error: `Esta unidade não está mais disponível. Status atual: ${
          unitCheckResult.data.values?.[0]?.[0] || "Indefinido"
        }.`,
        code: "UNIT_NOT_AVAILABLE",
      });
    }

    // Marca a unidade como "RESERVANDO" temporariamente
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["RESERVANDO"]] },
    });

    // Armazena o token de reserva temporária (em memória por 30 segundos)
    const tempReservationKey = `${implantacao}_${rowIndex}`;
    tempReservations.set(tempReservationKey, {
      token: reservationToken,
      userEmail,
      unitName,
      timestamp: Date.now(),
      expiresAt: Date.now() + 30000, // 30 segundos
    });

    // Limpa reservas expiradas
    cleanupExpiredReservations();

    res.json({
      success: true,
      message: "Reserva temporária criada com sucesso.",
      reservationToken,
      expiresIn: 30000,
    });
  } catch (error) {
    console.error("Erro ao criar reserva temporária:", error);
    res.status(500).json({ error: "Falha ao criar reserva temporária." });
  }
});

// Endpoint para confirmar a reserva definitiva
app.post("/api/confirm-reservation", verifyToken, async (req, res) => {
  const {
    implantacao,
    rowIndex,
    data,
    clientName,
    unitName,
    reservationToken,
  } = req.body;
  const userEmail = req.user.email;

  if (!implantacao || !rowIndex || !reservationToken) {
    return res.status(400).json({ error: "Token de reserva é obrigatório." });
  }

  try {
    const sheets = await getSheetsClient();

    // Verifica se a reserva temporária ainda é válida
    const tempReservationKey = `${implantacao}_${rowIndex}`;
    const tempReservation = tempReservations.get(tempReservationKey);

    if (!tempReservation || tempReservation.token !== reservationToken) {
      return res.status(409).json({
        error: "Reserva temporária expirada ou inválida. Tente novamente.",
        code: "TEMP_RESERVATION_EXPIRED",
      });
    }

    if (tempReservation.userEmail !== userEmail) {
      return res.status(403).json({
        error: "Você não tem permissão para confirmar esta reserva.",
        code: "UNAUTHORIZED_CONFIRMATION",
      });
    }

    // Remove a reserva temporária
    tempReservations.delete(tempReservationKey);

    // Verifica novamente se a unidade ainda está disponível
    const unitCheckRange = `'${implantacao}'!K${rowIndex}`;
    const unitCheckResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitCheckRange,
    });

    const currentStatus =
      unitCheckResult.data.values?.[0]?.[0]?.toUpperCase() || "DISPONÍVEL";

    if (currentStatus !== "RESERVANDO" && currentStatus !== "DISPONÍVEL") {
      return res.status(409).json({
        error: `Esta unidade não está mais disponível. Status atual: ${
          unitCheckResult.data.values?.[0]?.[0] || "Indefinido"
        }.`,
        code: "UNIT_NOT_AVAILABLE",
      });
    }

    // Primary: persist directly into Supabase
    let supabaseOk = false;
    let unitFullName = unitName || null;
    if (supabase) {
      try {
        const { data: implData, error: implDataError } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .maybeSingle(); // Use maybeSingle para não dar erro se não encontrar

        if (implDataError) {
          throw new Error(
            `Erro ao buscar implantação no Supabase: ${implDataError.message}`
          );
        }

        const implantacao_id = implData?.id;
        if (implantacao_id) {
          // <-- CORREÇÃO: Verifica se implantacao_id foi encontrado
          // find existing unit by implantacao_id + row_index
          const { data: existingUnit, error: existingUnitError } =
            await supabase
              .from("unidades")
              .select("id, nome_unidade")
              .eq("implantacao_id", implantacao_id)
              .eq("row_index", parseInt(rowIndex, 10))
              .limit(1)
              .single();
          // Build payload: include imobiliaria (sheet column index 4) and force situacao to RESERVADA
          const payload = {
            // <-- CORREÇÃO AQUI
            id_pre_cadastro: data[0] || null, // ID Pré-Cadastro
            cliente: data[1] || clientName || null, // Cliente
            documento: data[2] || null, // Documento
            corretor: data[3] || null, // Corretor
            imobiliaria: data[4] || null, // Imobiliária
            // Force reserva when this endpoint is used for a reservation flow
            situacao: "RESERVADA", // Situação
            implantacao_id,
            nome_unidade:
              unitName || (existingUnit && existingUnit.nome_unidade) || null,
          };

          console.log(
            "[SUPABASE] Tentando atualizar/inserir unidade com payload:",
            payload
          );

          if (existingUnit && existingUnit.id) {
            const { data: updatedData, error: updateErr } = await supabase
              .from("unidades")
              .update(payload)
              .eq("id", existingUnit.id)
              .select("nome_unidade")
              .single();
            if (updateErr) {
              console.error("Supabase: erro ao ATUALIZAR unidade:", updateErr);
              throw updateErr;
            }
            unitFullName =
              (updatedData && updatedData.nome_unidade) || unitFullName;
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from("unidades")
              .insert(payload)
              .select("nome_unidade")
              .single();
            if (insertErr) {
              console.error("Supabase: erro ao INSERIR unidade:", insertErr);
              throw insertErr;
            }
            unitFullName = (inserted && inserted.nome_unidade) || unitFullName;
          }

          // Update cliente status and try to store imobiliaria/documento there as well (best-effort)
          if (clientName) {
            try {
              const { error: clienteErr } = await supabase // eslint-disable-line no-unused-vars
                .from("clientes")
                .update({
                  status: "JA RESERVOU",
                  imobiliaria: payload.imobiliaria || null,
                  documento: payload.documento || null,
                })
                .eq("nome", clientName);
              if (clienteErr)
                console.error("Supabase: error updating cliente", clienteErr);
            } catch (e) {
              console.error(
                "Supabase: exception updating cliente",
                e && e.message ? e.message : e
              );
            }
          }

          // Insert into funil
          const { error: funilErr } = await supabase.from("funil").insert({
            // eslint-disable-line no-unused-vars
            id_pre: data[0] || null,
            unit_name: unitName || null,
            corretor: data[3] || null,
            implantacao_id,
          });
          if (funilErr) {
            console.error("Supabase: erro ao inserir no funil:", funilErr);
            // Não lançamos erro aqui, pois o funil é secundário
          }
        } else {
          console.warn(
            `[SUPABASE] Implantação '${implantacao}' não encontrada. Pulando persistência no Supabase.`
          );
        }
        supabaseOk = true;
      } catch (e) {
        console.error(
          "Supabase: erro ao persistir reserva (update)",
          e.message || e
        );
        supabaseOk = false;
      }
    }
    // Adiciona ao histórico DEPOIS da operação principal
    await addHistoryEntry(
      sheets,
      implantacao,
      unitName,
      "Reservada",
      clientName,
      data[3], // Corretor
      userEmail
    );

    // Se o Supabase funcionou, já podemos responder e fazer o sync com Sheets em background
    if (supabaseOk) {
      res.json({ success: true, message: `Reserva e funil atualizados.` });

      // Tenta sincronizar com o Sheets em background (best-effort)
      (async () => {
        try {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [data] },
          });

          await broadcastEvent(implantacao, "unitUpdated", {
            rowIndex,
            unitName,
          });

          if (clientName) {
            try {
              const allClientsData = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID_DADOS,
                range: `${SHEET_NAME_DADOS}!A:F`, // Busca todas as colunas para encontrar o cliente
              });
              const allClients = allClientsData.data.values || [];

              // Encontra o índice da linha do cliente pelo nome (na coluna B, índice 1)
              const clientRowIndex = allClients.findIndex(
                (row) => row && row[1] && row[1].trim() === clientName.trim()
              );

              // Se encontrou o cliente, atualiza a coluna F (índice 5) da linha correspondente
              if (clientRowIndex !== -1) {
                // O índice da planilha é baseado em 1, e o array em 0. Se o array não tem cabeçalho, é +1.
                // Como a sua planilha de DADOS tem cabeçalho, e o slice(1) foi removido, a linha da planilha é o índice do array + 1.
                const sheetRowToUpdate = clientRowIndex + 1;

                await sheets.spreadsheets.values.update({
                  spreadsheetId: SPREADSHEET_ID_DADOS,
                  range: `${SHEET_NAME_DADOS}!F${sheetRowToUpdate}`, // Alvo: Coluna F da linha encontrada
                  valueInputOption: "USER_ENTERED",
                  resource: { values: [["JA RESERVOU"]] },
                });
                console.log(
                  `[SHEETS] Status do cliente '${clientName}' atualizado para 'JA RESERVOU'.`
                );
              } else {
                console.warn(
                  `[SHEETS] Cliente '${clientName}' não encontrado na planilha de dados para atualização de status.`
                );
              }
            } catch (error) {
              console.error(
                `[SHEETS] Erro ao tentar atualizar o status do cliente '${clientName}':`,
                error.message
              );
              // Não paramos a execução, pois a reserva da unidade é mais crítica.
            }
          }

          const funnelRow = [data[0], unitName || "N/A", data[3]];
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID_FUNIL,
            range: `${SHEET_NAME_FUNIL}!A:C`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            resource: { values: [funnelRow] },
          });
        } catch (e) {
          console.warn(
            "Sync to Sheets or broadcast failed after Supabase write:",
            e.message
          );
        }
      })();

      return;
    }

    // --- Fallback para Google Sheets se o Supabase falhou ---
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [data] },
    });

    await broadcastEvent(implantacao, "unitUpdated", { rowIndex, unitName });

    const allClientsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_DADOS}!A:F`,
    });
    const allClients = allClientsData.data.values || [];
    const clientRowIndex = allClients.findIndex(
      (row) => row && row[1] === clientName
    );
    // CORREÇÃO: Atualiza o status do cliente para "JA RESERVOU" na coluna F.
    if (clientRowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_DADOS,
        range: `${SHEET_NAME_DADOS}!F${clientRowIndex + 1}`, // CORREÇÃO: Atualiza a coluna F (índice 5)
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
      range: `'${implantacao}'!C${rowIndex}:C${rowIndex}`,
    });
    unitFullName = `${unidadeInfo.data.values[0][0]}`;

    res.json({
      success: true,
      message: `Reserva e funil atualizados (via fallback).`,
    });
  } catch (error) {
    res.status(500).json({ error: "Falha ao processar a reserva." });
  }
});

// Endpoint para cancelar uma reserva temporária
app.post("/api/cancel-temp-reservation", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, reservationToken } = req.body;
  const userEmail = req.user.email;

  if (!implantacao || !rowIndex || !reservationToken) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para cancelar reserva temporária." });
  }

  try {
    const tempReservationKey = `${implantacao}_${rowIndex}`;
    const tempReservation = tempReservations.get(tempReservationKey);

    if (!tempReservation || tempReservation.token !== reservationToken) {
      return res.status(404).json({
        error: "Reserva temporária não encontrada ou já expirada.",
        code: "TEMP_RESERVATION_NOT_FOUND",
      });
    }

    if (tempReservation.userEmail !== userEmail) {
      return res.status(403).json({
        error: "Você não tem permissão para cancelar esta reserva.",
        code: "UNAUTHORIZED_CANCELLATION",
      });
    }

    // Remove a reserva temporária
    tempReservations.delete(tempReservationKey);

    // Restaura o status da unidade para DISPONÍVEL
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["DISPONÍVEL"]] },
    });

    // Notifica outros clientes sobre a mudança
    await broadcastEvent(implantacao, "unitUpdated", {
      rowIndex,
      unitName: tempReservation.unitName,
    });

    res.json({
      success: true,
      message: "Reserva temporária cancelada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao cancelar reserva temporária:", error);
    res.status(500).json({ error: "Falha ao cancelar reserva temporária." });
  }
});

// Endpoint para RESERVA ESPONTÂNEA
app.post("/api/spontaneous-update", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, unitName, manualData, hideAvailable } =
    req.body;
  const userEmail = req.user.email;
  if (!implantacao || !rowIndex || !manualData || !manualData.cliente) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para a reserva espontânea." });
  }
  try {
    const sheets = await getSheetsClient();

    // VERIFICAÇÃO PRÉVIA: Checa se a unidade ainda está disponível
    const unitCheckRange = `'${implantacao}'!K${rowIndex}`;
    const unitCheckResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitCheckRange,
    });

    const currentStatus =
      unitCheckResult.data.values?.[0]?.[0]?.toUpperCase() || "DISPONÍVEL";

    if (currentStatus !== "DISPONÍVEL") {
      return res.status(409).json({
        error: `Esta unidade não está mais disponível. Status atual: ${
          unitCheckResult.data.values?.[0]?.[0] || "Indefinido"
        }.`,
      });
    }
    let supabaseOk = false;
    let unitFullName = unitName || null;
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .limit(1)
          .single();
        const implantacao_id = implData && implData.id ? implData.id : null;
        if (implantacao_id) {
          const { data: existingUnit } = await supabase
            .from("unidades")
            .select("id, nome_unidade")
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(rowIndex, 10))
            .limit(1)
            .single();
          // include imobiliaria (if provided in manualData) and force situacao
          const payload = {
            row_index: parseInt(rowIndex, 10),
            id_pre_cadastro: manualData.id || null,
            cliente: manualData.cliente || null,
            documento: manualData.documento || null,
            corretor: manualData.corretor || null,
            imobiliaria: manualData.imobiliaria || null,
            situacao: "RESERVADA",
            implantacao_id,
            nome_unidade:
              unitName || (existingUnit && existingUnit.nome_unidade) || null,
          };

          console.log("[SUPABASE] spontaneous-unidades payload:", {
            implantacao,
            rowIndex,
            payload,
          });

          if (existingUnit && existingUnit.id) {
            const { data: updatedData, error: updateErr } = await supabase
              .from("unidades")
              .update(payload)
              .eq("id", existingUnit.id)
              .select("nome_unidade")
              .single();
            if (updateErr)
              console.error(
                "Supabase: error updating unidade (spontaneous)",
                updateErr
              );
            unitFullName =
              (updatedData && updatedData.nome_unidade) || unitFullName;
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from("unidades")
              .insert(payload)
              .select("nome_unidade")
              .single();
            if (insertErr)
              console.error(
                "Supabase: error inserting unidade (spontaneous)",
                insertErr
              );
            unitFullName = (inserted && inserted.nome_unidade) || unitFullName;
          }

          if (manualData.cliente) {
            try {
              const { error: clienteErr } = await supabase
                .from("clientes")
                .update({
                  status: "JA RESERVOU",
                  imobiliaria: payload.imobiliaria || null,
                  documento: payload.documento || null,
                })
                .or(
                  `id_pre_cadastro.eq.${manualData.id},nome.eq.${manualData.cliente}`
                );
              if (clienteErr)
                console.error(
                  "Supabase: error updating cliente (spontaneous)",
                  clienteErr
                );
            } catch (e) {
              console.error(
                "Supabase: exception updating cliente (spontaneous)",
                e && e.message ? e.message : e
              );
            }
          }

          const { error: funilErr } = await supabase.from("funil").insert({
            id_pre: manualData.id || null,
            unit_name: unitName || null,
            corretor: manualData.corretor || null,
            implantacao_id: implantacao_id,
          });
          if (funilErr)
            console.error(
              "Supabase: error inserting funil (spontaneous)",
              funilErr
            );
        }
        supabaseOk = true;
      } catch (e) {
        console.error(
          "Supabase: erro ao persistir reserva espontânea",
          e.message || e
        );
        supabaseOk = false;
      }
    }

    // Adiciona ao histórico DEPOIS da operação principal
    await addHistoryEntry(
      sheets,
      implantacao,
      unitName,
      "Reservada (Espontânea)",
      manualData.cliente,
      manualData.corretor,
      userEmail
    );

    // Se o Supabase funcionou, já podemos responder e fazer o sync com Sheets em background
    if (supabaseOk) {
      res.json({
        success: true,
        message: "Reserva espontânea realizada com sucesso.",
      });

      // CORREÇÃO: Inicia a sincronização com o Sheets em background
      (async () => {
        try {
          const dataToUpdate = [
            manualData.id || "",
            manualData.cliente,
            manualData.documento || "",
            manualData.corretor || "",
            "", // imobiliaria
            "RESERVADA",
          ];
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [dataToUpdate] },
          });

          await broadcastEvent(implantacao, "unitUpdated", {
            rowIndex,
            unitName,
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
        } catch (e) {
          console.warn(
            "Sync to Sheets (spontaneous) failed after Supabase write (non-blocking)",
            e.message
          );
        }
      })();

      return;
    }

    // --- Fallback para Google Sheets se o Supabase falhou ---
    const dataToUpdate = [
      manualData.id || "",
      manualData.cliente,
      manualData.documento || "",
      manualData.corretor || "",
      "", // imobiliaria
      "RESERVADA",
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [dataToUpdate] },
    });

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!C${rowIndex}:C${rowIndex}`,
    });
    unitFullName = `${unidadeInfo.data.values[0][0]}`;

    await broadcastEvent(implantacao, "unitUpdated", {
      rowIndex,
      unitName: unitFullName,
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
      message: "Reserva espontânea realizada com sucesso (via fallback).",
    });
  } catch (error) {
    res.status(500).json({ error: "Falha ao processar a reserva espontânea." });
  }
});

// Endpoint para CANCELAR uma reserva
app.post("/api/cancel-reservation", verifyToken, async (req, res) => {
  const {
    implantacao,
    unitRowIndex,
    clientName,
    idPreCadastro,
    brokerName,
    hideAvailable,
  } = req.body;
  const userEmail = req.user.email; // Declaração no escopo principal da função

  if (!implantacao || !unitRowIndex) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para o cancelamento." });
  }

  try {
    const sheets = await getSheetsClient();
    let supabaseOk = false;
    let unitFullName = null;
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .limit(1)
          .single();
        const implantacao_id = implData && implData.id ? implData.id : null;
        if (implantacao_id) {
          // find existing unit to capture name
          const { data: existingUnit } = await supabase
            .from("unidades")
            .select("id, nome_unidade")
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(unitRowIndex, 10))
            .limit(1)
            .single();
          if (existingUnit && existingUnit.id) {
            unitFullName = existingUnit.nome_unidade;
            await supabase
              .from("unidades")
              .update({
                id_pre_cadastro: null,
                cliente: null,
                documento: null,
                corretor: null,
                situacao: "DISPONÍVEL",
              })
              .eq("id", existingUnit.id);
          } else {
            // Se a unidade não existe no Supabase (pode acontecer se a sincronização falhou antes),
            // não há o que cancelar no banco, mas o fallback para o Sheets ainda é importante.
            console.warn(
              `[CANCELAMENTO] Unidade com rowIndex ${unitRowIndex} não encontrada no Supabase para a implantação '${implantacao}'. Procedendo com fallback para Sheets.`
            );
            // Define supabaseOk como false para garantir que o fallback seja executado
            supabaseOk = false;
          }
          // Adiciona ao histórico DEPOIS da operação principal
          await addHistoryEntry(
            sheets,
            implantacao,
            unitFullName || `Unidade na linha ${unitRowIndex}`,
            "Cancelada",
            clientName,
            brokerName,
            userEmail
          );

          // Libera o cliente no Supabase para poder reservar novamente
          if (clientName) {
            await supabase
              .from("clientes")
              .update({ status: "PODE RESERVAR" })
              .eq("nome", clientName);
          }
          // Se chegou até aqui sem erros (mesmo que a unidade não existisse), considera sucesso parcial.
          if (supabaseOk !== false) supabaseOk = true;
        }
      } catch (e) {
        console.error(
          "Supabase: erro ao persistir cancelamento:",
          e.message || e
        );
        supabaseOk = false;
      }
    }

    // Se o Supabase funcionou, já podemos responder e fazer o sync com Sheets em background
    if (supabaseOk) {
      // A resposta será enviada depois para garantir que o fallback também responda
      (async () => {
        try {
          const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${implantacao}'!F${unitRowIndex}:K${unitRowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [emptyUnitData] },
          });

          await broadcastEvent(implantacao, "unitUpdated", {
            rowIndex: unitRowIndex,
            unitName: unitFullName,
          });

          // Libera o cliente na planilha de DADOS (Funil)
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
        } catch (e) {
          console.warn(
            "Sync to Sheets failed after Supabase cancel (non-blocking)",
            e.message || e
          );
        }
      })();
    } else {
      // fallback to Sheets (legacy)
      const emptyUnitData = ["", "", "", "", "", "DISPONÍVEL"];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${implantacao}'!F${unitRowIndex}:K${unitRowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [emptyUnitData] },
      });
      const unidadeInfo = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${implantacao}'!C${unitRowIndex}:C${unitRowIndex}`,
      });
      unitFullName = `${unidadeInfo.data.values[0][0]}`;

      await broadcastEvent(implantacao, "unitUpdated", {
        rowIndex: unitRowIndex,
        unitName: unitFullName,
      });

      // Libera o cliente na planilha de DADOS (Funil)
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
    }
    // CORREÇÃO: Garante que a resposta seja enviada em ambos os casos (Supabase OK ou fallback)
    if (!res.headersSent) {
      res.json({
        success: true,
        message: `Cancelamento efetuado com sucesso${
          !supabaseOk ? " (via fallback)" : ""
        }`,
      });
    }
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
    // Persist coordinates to Supabase unidades as well (if available)
    if (supabase) {
      try {
        // Resolve implantacao_id
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .limit(1)
          .single();
        const implantacao_id = implData && implData.id ? implData.id : null;
        // Try update by implantacao_id + row_index if exists
        if (implantacao_id) {
          const { error: upErr } = await supabase
            .from("unidades")
            .update({ coord_x: coordX, coord_y: coordY })
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(rowIndex, 10));
          if (upErr) {
            // fallback: try to update by matching nome_unidade resolved from sheet
            console.warn(
              "Supabase: falha update por implantacao_id+row_index:",
              upErr.message || upErr
            );
          }
        }
      } catch (e) {
        console.error(
          "Erro ao persistir coordenadas no Supabase:",
          e.message || e
        );
      }
    }
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;
    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Mapeamento Adicionado",
      null,
      null,
      userEmail
    );

    await broadcastEvent(implantacao, "unitUpdated", {
      rowIndex,
      unitName: unitFullName,
    });

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
      range: `'${implantacao}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;

    await addHistoryEntry(
      sheets,
      implantacao,
      unitFullName,
      "Mapeamento Removido", // Ação descritiva diferente
      null,
      null,
      userEmail
    );

    await broadcastEvent(implantacao, "unitUpdated", {
      rowIndex,
      unitName: unitFullName,
    });

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
  const { implantacao, rowIndex, newStatus, password } = req.body;
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

  // Validação de senha apenas para DESBLOQUEAR
  if (newStatus === "DISPONÍVEL") {
    console.log("[VALIDAÇÃO SENHA] Recebida para desbloqueio:", {
      password,
      hasPassword: !!password,
    });
    if (!password || password.trim() === "") {
      console.log("[VALIDAÇÃO SENHA] Senha vazia ou não fornecida");
      return res.status(400).json({
        error: "Senha é obrigatória para desbloquear unidades.",
      });
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "vcadmin123";
    console.log("[VALIDAÇÃO SENHA] Comparando:", {
      received: password,
      expected: ADMIN_PASSWORD,
      match: password === ADMIN_PASSWORD,
    });
    if (password !== ADMIN_PASSWORD) {
      console.log("[VALIDAÇÃO SENHA] Senha incorreta");
      return res
        .status(403)
        .json({ error: "Senha incorreta. Operação não autorizada." });
    }
    console.log("[VALIDAÇÃO SENHA] Senha válida, prosseguindo...");
  }

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newStatus]] },
    });

    // --- ADIÇÃO DA LÓGICA SUPABASE ---
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .limit(1)
          .single();

        const implantacao_id = implData ? implData.id : null;

        if (implantacao_id) {
          // Atualiza a unidade existente com base no implantacao_id e rowIndex
          const { error: updateError } = await supabase
            .from("unidades")
            .update({ situacao: newStatus })
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(rowIndex, 10));

          if (updateError) {
            console.error(
              "Supabase: Erro ao atualizar status da unidade para BLOQUEADA/DISPONÍVEL:",
              updateError
            );
          }
        }
      } catch (e) {
        console.error(
          "Supabase: Exceção ao tentar bloquear/desbloquear unidade:",
          e.message || e
        );
        // A operação continua mesmo se o Supabase falhar, pois o Sheets é a fonte primária aqui.
      }
    }

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;
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

    await broadcastEvent(implantacao, "unitUpdated", {
      rowIndex,
      unitName: unitFullName,
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

app.post("/api/log-print", verifyToken, async (req, res) => {
  const { implantacao, unitName, clientName, brokerName } = req.body;
  const userEmail = req.user.email; // Declaração no escopo principal

  if (!implantacao || !unitName) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para log de impressão." });
  }

  try {
    const sheets = await getSheetsClient();
    await addHistoryEntry(
      sheets,
      implantacao,
      unitName,
      "Termo Impresso",
      clientName,
      brokerName, // <-- SUBSTITUA 'null' por 'brokerName'
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
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`)
);
