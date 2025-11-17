// backend/server.js - VERSÃO COMPLETA E FINAL COM AUTENTICAÇÃO

// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// =================================================================
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

// Garante que as variáveis de ambiente sejam carregadas primeiro.
require("dotenv").config();

// =================================================================
// 2. INICIALIZAÇÃO DOS SERVIÇOS
// =================================================================

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

// NOVO: Cache em memória para abas de histórico já criadas
const createdHistorySheets = new Set();

// =================================================================
// 3. CONFIGURAÇÕES DE MIDDLEWARE
// =================================================================

// Configuração de CORS para permitir acesso do seu frontend (Vercel)
const allowedOrigins = [
  "https://lancamentos.vcaconstrutora.com.br", // Frontend em produção
  "http://localhost:5173", // Frontend em desenvolvimento local
  "http://localhost:5174", // Frontend em desenvolvimento local (porta alternativa)
  // Adicione outras URLs se necessário
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições sem origin (ex: Postman, curl, apps mobile)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origem bloqueada: ${origin}`);
      callback(new Error("Acesso não permitido pela política de CORS"));
    }
  },
  credentials: true, // Permite envio de cookies/credenciais
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 200,
  maxAge: 86400, // Cache preflight por 24 horas
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
async function cleanupExpiredReservations() {
  const now = Date.now();
  const expiredKeys = [];

  for (const [key, reservation] of tempReservations.entries()) {
    if (now > reservation.expiresAt) {
      expiredKeys.push(key);
    }
  }

  if (expiredKeys.length > 0) {
    console.log(
      `[CLEANUP] Encontradas ${expiredKeys.length} reservas temporárias expiradas. Iniciando limpeza...`
    );
    const sheets = await getSheetsClient();

    for (const key of expiredKeys) {
      const reservation = tempReservations.get(key);
      if (!reservation) continue;

      const [implantacao, rowIndex] = key.split("_");

      try {
        // Reverte o status na planilha para "DISPONÍVEL"
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${implantacao}'!K${rowIndex}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [["DISPONÍVEL"]] },
        });

        // Adiciona um registro no histórico
        await addHistoryEntry(
          sheets,
          implantacao,
          reservation.unitName,
          "Reserva Expirada",
          null,
          null,
          `Sistema (Usuário: ${reservation.userEmail})`
        );
        console.log(`[CLEANUP] Unidade ${key} revertida para DISPONÍVEL.`);
      } catch (error) {
        console.error(
          `[CLEANUP] Falha ao reverter status para a unidade ${key}:`,
          error
        );
      } finally {
        // Remove da memória independentemente do sucesso na planilha
        tempReservations.delete(key);
      }
    }
    console.log("[CLEANUP] Limpeza de reservas expiradas concluída.");
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
  // Otimização: Se os dados já foram fornecidos, use-os diretamente.
  let eventPayload = data.unitData ? { ...data } : { ...data, unitData: null };

  // Se os dados não foram fornecidos, busca na planilha.
  // Isso mantém a compatibilidade com chamadas antigas.
  if (data.rowIndex) {
    try {
      const sheets = await getSheetsClient();
      const range = `'${implantacao}'!A${data.rowIndex}:R${data.rowIndex}`;
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
const SPREADSHEET_ID_CVCRM_COORDS =
  "1IZD98W5-pQvOrSdw5Lg5NJL-NkSLjc3M91hAZnEc0VU";

const SHEET_NAME_DADOS = "Página1";
const SHEET_NAME_CONFIG = "Config";
const SHEET_NAME_IMPLANTACOES = "Implantacoes";
const SHEET_NAME_FUNIL = "Página1";

// =================================================================
// 5. FUNÇÕES AUXILIARES E MIDDLEWARE DE AUTENTICAÇÃO
// (Definidas ANTES de serem usadas nos endpoints)
// =================================================================

// Middleware para verificar o Token do Supabase
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("[AUTH] Token não fornecido. Header:", authHeader);
    return res.status(401).send("Acesso não autorizado: Token não fornecido.");
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (!supabase) {
      console.error("[AUTH] Supabase não configurado");
      return res.status(500).send("Supabase não configurado.");
    }

    console.log("[AUTH] Verificando token...");
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[AUTH] Erro ao verificar token:", error.message);
      return res.status(403).json({
        error: "Acesso proibido: Token inválido.",
        details: error.message,
      });
    }

    if (!user) {
      console.error("[AUTH] Usuário não encontrado");
      return res.status(403).send("Acesso proibido: Token inválido.");
    }

    console.log(
      "[AUTH] Token verificado com sucesso para usuário:",
      user.email
    );
    req.user = { email: user.email, uid: user.id };
    return next();
  } catch (error) {
    console.error("[AUTH] Exceção ao verificar token:", error);
    return res.status(403).json({
      error: "Acesso proibido: Token inválido.",
      details: error.message,
    });
  }
}

async function gerarTimestamp() {
  // Retorna o timestamp atual em segundos (Unix time)
  return Math.floor(Date.now() / 1000);
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
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    );

    const dataFormatada = `'${now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })} às ${now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    const historyRow = [
      now.toISOString(),
      dataFormatada,
      unidade,
      acao,
      cliente || "N/A",
      corretor || "N/A",
      usuario || "Sistema",
    ];

    // Otimização: Usa cache em memória para evitar chamadas de API repetitivas
    const sheetExists = createdHistorySheets.has(implantacao);

    if (!sheetExists) {
      // CORREÇÃO: Envolve a criação da aba em um try-catch.
      // Se o servidor reiniciar, o cache em memória é perdido. Esta lógica
      // tenta criar a aba, mas se ela já existir (causando um erro específico),
      // o erro é ignorado e o código prossegue para inserir a linha.
      try {
        console.log(`[HISTÓRICO] Verificando/Criando aba '${implantacao}'...`);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID_HISTORICO,
          resource: {
            requests: [{ addSheet: { properties: { title: implantacao } } }],
          },
        });

        // Se a criação for bem-sucedida, adiciona o cabeçalho.
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_HISTORICO,
          range: `'${implantacao}'!A1:G1`,
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
      } catch (e) {
        // Ignora o erro se a aba já existir, que é o comportamento esperado após um reinício.
        if (!e.message || !e.message.includes("already exists")) {
          console.error(`[HISTÓRICO] Erro inesperado ao criar aba:`, e.message);
        }
      }
      createdHistorySheets.add(implantacao); // Adiciona ao cache
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

    // NOVO: Notifica todos os clientes conectados sobre a atualização do histórico.
    // O payload pode ser simples, apenas para sinalizar que o frontend deve recarregar o histórico.
    await broadcastEvent(implantacao, "historyUpdated", {
      message: `Novo evento: ${acao}`,
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

// ROTA DE TESTE: Página visual para testar o backend sem o frontend
app.get("/", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Backend - Status</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .container {
          background: white;
          border-radius: 10px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          padding: 40px;
          max-width: 600px;
          width: 100%;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .status-badge {
          display: inline-block;
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 15px;
        }
        
        .status-badge.error {
          background: #ef4444;
        }
        
        h1 {
          color: #333;
          font-size: 32px;
          margin-bottom: 10px;
        }
        
        .subtitle {
          color: #666;
          font-size: 16px;
          margin-bottom: 20px;
        }
        
        .info-section {
          background: #f8f9fa;
          border-left: 4px solid #667eea;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        
        .info-section h3 {
          color: #667eea;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        
        .info-section p {
          color: #555;
          font-size: 14px;
          line-height: 1.6;
          margin: 5px 0;
        }
        
        .status-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .status-item:last-child {
          border-bottom: none;
        }
        
        .status-label {
          font-weight: 600;
          color: #333;
        }
        
        .status-value {
          color: #10b981;
          font-weight: 600;
        }
        
        .status-value.error {
          color: #ef4444;
        }
        
        .endpoints-list {
          background: #f8f9fa;
          border-left: 4px solid #764ba2;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        
        .endpoints-list h3 {
          color: #764ba2;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        
        .endpoint {
          background: white;
          padding: 8px 12px;
          margin: 5px 0;
          border-radius: 4px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          color: #333;
          border-left: 2px solid #764ba2;
        }
        
        .method {
          display: inline-block;
          font-weight: 600;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          margin-right: 8px;
          font-size: 10px;
        }
        
        .method.get {
          background: #3b82f6;
        }
        
        .method.post {
          background: #ef4444;
        }
        
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          color: #999;
          font-size: 12px;
        }
        
        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        
        .btn {
          flex: 1;
          min-width: 120px;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }
        
        .btn-primary {
          background: #667eea;
          color: white;
        }
        
        .btn-primary:hover {
          background: #5568d3;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .btn-secondary {
          background: #764ba2;
          color: white;
        }
        
        .btn-secondary:hover {
          background: #633a87;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(118, 75, 162, 0.4);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="status-badge ${
            supabase ? "" : "error"
          }">✓ Backend Rodando</span>
          <h1>Simulador Implantação</h1>
          <p class="subtitle">Backend API Status</p>
        </div>
        
        <div class="info-section">
          <h3>Status do Servidor</h3>
          <div class="status-item">
            <span class="status-label">Server</span>
            <span class="status-value">✓ Online</span>
          </div>
          <div class="status-item">
            <span class="status-label">Porta</span>
            <span class="status-value">3000</span>
          </div>
          <div class="status-item">
            <span class="status-label">Ambiente</span>
            <span class="status-value">${
              process.env.NODE_ENV || "development"
            }</span>
          </div>
          <div class="status-item">
            <span class="status-label">Supabase</span>
            <span class="status-value ${supabase ? "" : "error"}">${
    supabase ? "✓ Conectado" : "✗ Não configurado"
  }</span>
          </div>
          <div class="status-item">
            <span class="status-label">Supabase URL</span>
            <span class="status-value ${SUPABASE_URL ? "" : "error"}">${
    SUPABASE_URL ? "✓ Configurado" : "✗ Não configurado"
  }</span>
          </div>
          <div class="status-item">
            <span class="status-label">Service Role</span>
            <span class="status-value ${
              SUPABASE_SERVICE_ROLE ? "" : "error"
            }">${
    SUPABASE_SERVICE_ROLE ? "✓ Configurado" : "✗ Não configurado"
  }</span>
          </div>
        </div>
        
        <div class="endpoints-list">
          <h3>Endpoints Disponíveis</h3>
          <div class="endpoint"><span class="method get">GET</span>/api/data - Buscar dados da implantação</div>
          <div class="endpoint"><span class="method get">GET</span>/api/public-data - Dados públicos (sem autenticação)</div>
          <div class="endpoint"><span class="method get">GET</span>/api/implantacoes - Lista de implantações</div>
          <div class="endpoint"><span class="method get">GET</span>/api/config - Configurações</div>
          <div class="endpoint"><span class="method post">POST</span>/api/confirm-reservation - Confirmar reserva</div>
          <div class="endpoint"><span class="method get">GET</span>/api/events - Server-Sent Events (SSE)</div>
          <div class="endpoint"><span class="method get">GET</span>/fullscreen - Página Fullscreen</div>
          <div class="endpoint"><span class="method get">GET</span>/fullscreen/current - Fullscreen atual</div>
        </div>
        
        <div class="info-section">
          <h3>Informações Importantes</h3>
          <p>✓ CORS habilitado para o frontend em desenvolvimento (localhost:5173)</p>
          <p>✓ Google Sheets integrado para gerenciamento de dados</p>
          <p ${supabase ? "" : 'style="color: #ef4444;"'}>
            ${supabase ? "✓" : "✗"} Sistema de autenticação Supabase ${
    supabase ? "ativo" : "INATIVO - VERIFICAR .ENV"
  }
          </p>
          <p>✓ Real-time updates via Server-Sent Events</p>
        </div>
        
        <div class="button-group">
          <button class="btn btn-primary" onclick="testEndpoint('/api/implantacoes')">
            Testar API
          </button>
          <button class="btn btn-secondary" onclick="location.href='/fullscreen/current'">
            Ver Fullscreen
          </button>
        </div>
        
        <div class="footer">
          <p>💡 Para testar endpoints protegidos, use o Postman ou similar com um Bearer token válido</p>
          <p>Backend rodando e pronto para o frontend se conectar!</p>
        </div>
      </div>
      
      <script>
        function testEndpoint(endpoint) {
          fetch(endpoint)
            .then(res => res.json())
            .then(data => {
              alert('Resposta da API:\\n\\n' + JSON.stringify(data, null, 2).substring(0, 200) + '...');
            })
            .catch(err => {
              alert('Erro ao testar endpoint: ' + err.message + '\\n\\nNota: Alguns endpoints requerem autenticação');
            });
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

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
      // Usa a função original de resolução
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );

    if (!resolved || !resolved.found) {
      return res.status(404).json({
        error: `Planilha '${implantacao}' não encontrada no spreadsheet de implantação.`,
        available: resolved.available,
        suggestions: resolved.suggestions,
        resolverError: resolved.error,
      });
    }
    const sheetTitle = resolved.found;
    const [implantacaoRes, dadosRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!A:R`,
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
      range: `'${sheetTitle}'!A:R`,
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
      range: `${SHEET_NAME_IMPLANTACOES}!A2:G`, // Coluna G para a sigla
    });

    const implantacaoData = (implantacoesRes.data.values || []).find(
      (row) => row[0] === implantacao
    );

    const imageUrl = implantacaoData ? implantacaoData[1] : "";
    const dotSize = implantacaoData
      ? parseInt(implantacaoData[2], 10) || 16
      : 16;
    const sigla = implantacaoData ? implantacaoData[6] : ""; // Pega a sigla

    res.json({
      unidades,
      imageUrl,
      dotSize,
      sigla,
    });
  } catch (error) {
    res.status(500).json({
      error: `Falha ao buscar dados para a implantação '${implantacao}'.`,
    });
  }
});

app.get("/api/implantacoes", verifyToken, async (req, res) => {
  try {
    console.log("[/api/implantacoes] Iniciando busca de implantações...");
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:G`, // Coluna G para a sigla
    });
    const implantacoes = (response.data.values || []).map((row) => ({
      nome: row[0],
      url: row[1],
      tamanhoPonto: parseInt(row[2], 10) || 16,
      endereco: row[3] || "Endereço não informado",
      logoUrl: row[4] || "/logo-uni.png",
      cvcrmId: row[5] || null, // Adiciona o ID do CVCRM
      sigla: row[6] || null, // Adiciona a sigla
    }));
    console.log(
      "[/api/implantacoes] Busca concluída. Total:",
      implantacoes.length
    );
    res.json(implantacoes);
  } catch (error) {
    console.error(
      "[/api/implantacoes] ERRO:",
      error && error.message ? error.message : error
    );
    res.status(500).json({
      error: "Falha ao buscar lista de implantações.",
      details: error && error.message ? error.message : String(error),
    });
  }
});

app.get("/api/public-data-cvcrm", async (req, res) => {
  const { implantacao, hideAvailable } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }

  try {
    const sheets = await getSheetsClient();

    // 1. Busca os dados da implantação (imagem, dotSize, cvcrmId)
    const implantacoesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:F`,
    });

    const implantacaoData = (implantacoesRes.data.values || []).find(
      (row) => row[0] === implantacao
    );

    if (!implantacaoData || !implantacaoData[5]) {
      return res.status(404).json({
        error: `Implantação '${implantacao}' ou seu ID do CVCRM não foram encontrados.`,
      });
    }

    const imageUrl = implantacaoData[1] || "";
    const dotSize = parseInt(implantacaoData[2], 10) || 16;
    const cvcrmId = implantacaoData[5];

    // 2. Busca as unidades da API do CVCRM
    const baseUrl = process.env.CVCRM_API_BASE_URL;
    const email = process.env.CVCRM_API_EMAIL;
    const token = process.env.CVCRM_API_TOKEN;
    const finalUrl = `${baseUrl}/${cvcrmId}`;
    let cvcrmUnits = await fetchAllCvcrmUnitPages(finalUrl, email, token);

    // Filtra as unidades se o parâmetro for verdadeiro
    if (hideAvailable === "true") {
      cvcrmUnits = cvcrmUnits.filter(
        (unit) => unit.situacao.toUpperCase() !== "DISPONIVEL"
      );
    }

    // 3. Busca as coordenadas salvas
    const coordsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_CVCRM_COORDS,
      range: "A:E",
    });
    const savedCoords = (coordsRes.data.values || [])
      .slice(1)
      .filter((row) => row[4] === implantacao)
      .reduce((acc, row) => {
        if (row[0]) acc[row[0]] = { coord_x: row[2], coord_y: row[3] };
        return acc;
      }, {});

    // 4. Mescla os dados
    const unidades = cvcrmUnits.map((unit) => ({
      ...unit,
      ...savedCoords[unit.idunidade],
    }));

    res.json({ unidades, imageUrl, dotSize });
  } catch (error) {
    res.status(500).json({ error: "Falha ao buscar dados públicos do CVCRM." });
  }
});

// CORREÇÃO: Este endpoint agora lê a aba 'Config' corretamente.
app.get("/api/config", verifyToken, async (req, res) => {
  try {
    console.log("[/api/config] Iniciando busca de configurações...");
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_CONFIG}!A2:B`, // Lê da aba de configuração
    });
    const configRows = response.data.values || [];
    const config = configRows.reduce((acc, row) => {
      if (row[0]) {
        // se a chave existe
        acc[row[0]] = row[1];
      }
      return acc;
    }, {});
    console.log(
      "[/api/config] Configurações carregadas:",
      Object.keys(config).length,
      "chaves"
    );
    res.json(config);
  } catch (error) {
    console.error(
      "[/api/config] ERRO:",
      error && error.message ? error.message : error
    );
    res.status(500).json({
      error: "Falha ao buscar configurações.",
      details: error && error.message ? error.message : String(error),
    });
  }
});

// NOVO: Endpoint para ATUALIZAR um valor na aba de Config
app.post("/api/update-config", verifyToken, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: "Chave e valor são obrigatórios." });
  }

  try {
    const sheets = await getSheetsClient();
    const range = `${SHEET_NAME_CONFIG}!A:B`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: range,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === key);

    if (rowIndex === -1) {
      return res
        .status(404)
        .json({ error: `Chave '${key}' não encontrada na configuração.` });
    }

    const sheetRowIndex = rowIndex + 1;
    const updateRange = `${SHEET_NAME_CONFIG}!B${sheetRowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[value]],
      },
    });

    res.json({ success: true, message: `Configuração '${key}' atualizada.` });
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error);
    res.status(500).json({ error: "Falha ao atualizar configuração." });
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

// NOVO: Serve a página fullscreen do CVCRM
app.get("/fullscreen-cvcrm", (req, res) => {
  res.sendFile(
    require("path").resolve(
      __dirname,
      "../frontend/public/fullscreen-cvcrm.html"
    )
  );
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

// =================================================================
// 6.1. ENDPOINTS DA API - CVCRM
// =================================================================

/**
 * Busca todas as páginas de unidades da API do CVCRM.
 * @param {string} baseUrl
 * @param {string} email
 * @param {string} token
 * @returns {Promise<any[]>}
 */
async function fetchAllCvcrmUnitPages(baseUrl, email, token) {
  let currentPage = 1;
  let totalPages = 1;
  const allUnits = [];
  const limitPerPage = 100;

  do {
    const urlWithParams = `${baseUrl}?limitePagina=${limitPerPage}&pagina=${currentPage}`;

    console.log(`[CVCRM Fetch] Buscando URL: ${urlWithParams}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(
        `[CVCRM Fetch] Timeout de 20s atingido para: ${urlWithParams}`
      );
      controller.abort();
    }, 20000); // 20 segundos de timeout

    try {
      const response = await fetch(urlWithParams, {
        headers: {
          accept: "application/json",
          email: email,
          token: token.trim(),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erro na API do CVCRM na página ${currentPage}: ${response.status} ${
            response.statusText
          } - ${errorText.substring(0, 200)}`
        );
      }

      const data = await response.json();

      if (data.dados && Array.isArray(data.dados) && data.dados.length > 0) {
        allUnits.push(...data.dados);
      } else {
        console.log(
          `[CVCRM Fetch] Página ${currentPage} não retornou dados. Finalizando busca.`
        );
        break;
      }

      if (data.paginacao && data.paginacao.total_de_paginas) {
        totalPages = data.paginacao.total_de_paginas;
      } else {
        console.warn(
          `[CVCRM Fetch] Objeto 'paginacao' não encontrado na resposta da página ${currentPage}.`
        );
        break;
      }

      console.log(
        `[CVCRM Fetch] Página ${currentPage} de ${totalPages} processada. Unidades acumuladas: ${allUnits.length}`
      );

      currentPage++;
    } catch (error) {
      console.error(
        `[CVCRM Fetch] Falha ao buscar a página ${currentPage}:`,
        error
      );
      // Decide se quer parar ou tentar a próxima página. Por segurança, vamos parar.
      throw error;
    } finally {
      clearTimeout(timeoutId); // Limpa o timeout se a requisição terminar (sucesso ou erro)
    }
  } while (currentPage <= totalPages);

  return allUnits;
}

app.get("/api/cvcrm/units", verifyToken, async (req, res) => {
  const { cvcrmId } = req.query;
  if (!cvcrmId) {
    return res
      .status(400)
      .json({ error: "O ID do empreendimento (cvcrmId) é obrigatório." });
  }

  const baseUrl = process.env.CVCRM_API_BASE_URL;
  const email = process.env.CVCRM_API_EMAIL;
  const token = process.env.CVCRM_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.error("[API CVCRM] ERRO: Variáveis de ambiente faltando.");
    return res.status(500).json({
      error: "Credenciais da API do CVCRM não configuradas no servidor.",
    });
  }

  const finalUrl = `${baseUrl}/${cvcrmId}`;

  try {
    console.log("[API CVCRM] Iniciando busca de unidades do CVCRM...");
    const allUnits = await fetchAllCvcrmUnitPages(finalUrl, email, token);
    console.log(
      `[API CVCRM] Busca concluída. Total de unidades: ${allUnits.length}`
    );
    res.json({ unidades: allUnits });
  } catch (error) {
    console.error("[API CVCRM] CRASH:", error);
    res.status(500).json({
      error: "Não foi possível buscar os dados das unidades do CVCRM.",
    });
  }
});

// Endpoint para buscar as coordenadas já salvas do CVCRM
app.get("/api/cvcrm/get-coords", verifyToken, async (req, res) => {
  const { implantacao } = req.query;
  if (!implantacao) {
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_CVCRM_COORDS,
      range: "A:E", // Colunas: unitId, unitName, coordcv_x, coordcv_y, implantacaoName
    });

    const rows = response.data.values || [];
    // Pula o cabeçalho e transforma em um objeto para fácil acesso
    const coordsMap = rows
      .slice(1)
      .filter((row) => row[4] === implantacao) // Filtra pela implantação correta
      .reduce((acc, row) => {
        const unitId = row[0];
        if (unitId) {
          acc[unitId] = { coord_x: row[2], coord_y: row[3] };
        }
        return acc;
      }, {});

    res.json(coordsMap);
  } catch (error) {
    console.error("[API CVCRM] Erro ao buscar coordenadas:", error);
    res.status(500).json({ error: "Falha ao buscar coordenadas salvas." });
  }
});

// Endpoint para salvar/atualizar as coordenadas de uma unidade do CVCRM
app.post("/api/cvcrm/update-coords", verifyToken, async (req, res) => {
  const { idunidade, unitName, coordX, coordY, implantacao } = req.body;

  if (
    !idunidade ||
    coordX === undefined ||
    coordY === undefined ||
    !implantacao
  ) {
    return res.status(400).json({
      error: "ID da unidade, coordenadas e implantação são obrigatórios.",
    });
  }

  try {
    const sheets = await getSheetsClient();
    const range = "A:E";

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_CVCRM_COORDS,
      range: range,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(
      (row) => row[0] == idunidade && row[4] == implantacao
    );

    if (rowIndex > 0) {
      // 2. Se existe, ATUALIZA a linha
      const updateRange = `C${rowIndex + 1}:D${rowIndex + 1}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_CVCRM_COORDS,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[coordX, coordY]],
        },
      });
      res.json({
        success: true,
        message: `Coordenadas da unidade ${unitName} atualizadas.`,
      });
    } else {
      // 3. Se não existe, ADICIONA uma nova linha
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID_CVCRM_COORDS,
        range: "A1",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: {
          values: [[idunidade, unitName, coordX, coordY, implantacao]],
        },
      });
      res.json({
        success: true,
        message: `Coordenadas da unidade ${unitName} salvas.`,
      });
    }
  } catch (error) {
    console.error("[API CVCRM] Erro ao salvar coordenadas:", error);
    res.status(500).json({ error: "Falha ao salvar coordenadas." });
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
    const resolved = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );
    if (!resolved || !resolved.found) {
      return res
        .status(404)
        .json({ error: `Planilha '${implantacao}' não encontrada.` });
    }
    const sheetTitle = resolved.found;
    const unitCheckRange = `'${sheetTitle}'!K${rowIndex}`;
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
      range: `'${sheetTitle}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["RESERVANDO"]] },
    });

    // Armazena o token de reserva temporária (em memória por 30 segundos)
    const tempReservationKey = `${sheetTitle}_${rowIndex}`;
    tempReservations.set(tempReservationKey, {
      token: reservationToken,
      userEmail,
      unitName,
      timestamp: Date.now(),
      expiresAt: Date.now() + 30000, // 30 segundos
    });

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
    const resolved = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );
    if (!resolved || !resolved.found) {
      return res
        .status(404)
        .json({ error: `Planilha '${implantacao}' não encontrada.` });
    }
    const sheetTitle = resolved.found;

    // Verifica se a reserva temporária ainda é válida
    const tempReservationKey = `${sheetTitle}_${rowIndex}`;
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
    const unitCheckRange = `'${sheetTitle}'!K${rowIndex}`;
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
          .eq("nome", sheetTitle) // Usa o nome completo resolvido
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
      sheetTitle,
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
            range: `'${sheetTitle}'!F${rowIndex}:K${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [data] },
          });

          await broadcastEvent(sheetTitle, "unitUpdated", {
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
      range: `'${sheetTitle}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [data] },
    });

    await broadcastEvent(sheetTitle, "unitUpdated", { rowIndex, unitName });

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
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
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
    const sheets = await getSheetsClient();
    const resolved = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );
    if (!resolved || !resolved.found) {
      return res
        .status(404)
        .json({ error: `Planilha '${implantacao}' não encontrada.` });
    }
    const sheetTitle = resolved.found;
    const tempReservationKey = `${sheetTitle}_${rowIndex}`;
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
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["DISPONÍVEL"]] },
    });

    // Notifica outros clientes sobre a mudança
    await broadcastEvent(sheetTitle, "unitUpdated", {
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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    // VERIFICAÇÃO PRÉVIA: Checa se a unidade ainda está disponível
    const unitCheckRange = `'${sheetTitle}'!K${rowIndex}`;
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
      sheetTitle,
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
            range: `'${sheetTitle}'!F${rowIndex}:K${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [dataToUpdate] },
          });

          await broadcastEvent(sheetTitle, "unitUpdated", {
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
      range: `'${sheetTitle}'!F${rowIndex}:K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [dataToUpdate] },
    });

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    let supabaseOk = false;
    let unitFullName = null;
    if (supabase) {
      try {
        const { data: implData } = await supabase // Usa o nome completo resolvido
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
            sheetTitle,
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
          // CORREÇÃO: Limpa os dados em duas partes para preservar as coordenadas (L e M)
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            resource: {
              valueInputOption: "USER_ENTERED",
              data: [
                {
                  range: `'${sheetTitle}'!F${unitRowIndex}:K${unitRowIndex}`,
                  values: [["", "", "", "", "", "DISPONÍVEL"]],
                },
                {
                  range: `'${sheetTitle}'!N${unitRowIndex}:Q${unitRowIndex}`,
                  values: [["", "", "", ""]],
                },
              ],
            },
          });

          await broadcastEvent(sheetTitle, "unitUpdated", {
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
      // CORREÇÃO: Limpa os dados em duas partes para preservar as coordenadas (L e M)
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        resource: {
          valueInputOption: "USER_ENTERED",
          data: [
            {
              range: `'${sheetTitle}'!F${unitRowIndex}:K${unitRowIndex}`,
              values: [["", "", "", "", "", "DISPONÍVEL"]],
            },
            {
              range: `'${sheetTitle}'!N${unitRowIndex}:Q${unitRowIndex}`,
              values: [["", "", "", ""]],
            },
          ],
        },
      });
      const unidadeInfo = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!C${unitRowIndex}:C${unitRowIndex}`,
      });
      unitFullName = `${unidadeInfo.data.values[0][0]}`;

      await broadcastEvent(sheetTitle, "unitUpdated", {
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

// NOVO: Endpoint para TROCAR unidade
app.post("/api/change-unit", verifyToken, async (req, res) => {
  const { implantacao, oldUnitIndex, newUnitIndex } = req.body;
  const userEmail = req.user.email;

  if (
    !implantacao ||
    oldUnitIndex === undefined ||
    newUnitIndex === undefined
  ) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para a troca de unidade." });
  }

  const oldRow = oldUnitIndex + 2;
  const newRow = newUnitIndex + 2;

  try {
    const sheets = await getSheetsClient();
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    // 1. Otimização: Ler os dados das duas unidades de uma vez
    const rangesToRead = [
      `'${sheetTitle}'!C${oldRow}`, // Nome da unidade antiga
      `'${sheetTitle}'!F${oldRow}:R${oldRow}`, // CORREÇÃO: Inclui coluna R (Timestamp)
      `'${sheetTitle}'!C${newRow}`, // Nome da unidade nova
    ];
    const batchGetData = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      ranges: rangesToRead,
    });

    const [oldUnitNameData, oldUnitDataValues, newUnitNameData] =
      batchGetData.data.valueRanges;

    const oldUnitName = oldUnitNameData.values?.[0]?.[0];
    const oldUnitData = oldUnitDataValues.values?.[0];
    const newUnitName = newUnitNameData.values?.[0]?.[0];

    if (!oldUnitData) {
      return res
        .status(404)
        .json({ error: "Dados da unidade de origem não encontrados." });
    }

    // 2. Preparar dados para atualização
    const dataToTransfer = [
      oldUnitData[0] || "", // F: id_pre_cadastro
      oldUnitData[1] || "", // G: cliente
      oldUnitData[2] || "", // H: documento
      oldUnitData[3] || "", // I: corretor
      oldUnitData[4] || "", // J: imobiliária
      "RESERVADA", // K: situação
      "", // L: coord_x (não transferir) - Limpa na nova unidade
      "", // M: coord_y (não transferir) - Limpa na nova unidade
      oldUnitData[8] || "", // N: IDENTIFICADOR
      oldUnitData[9] || "", // O: Payload
      oldUnitData[10] || "", // P: Valor
      oldUnitData[11] || "", // Q: Pagamento
      oldUnitData[12] || "", // R: Timestamp (adiciona coluna R)
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: [
          // Limpa dados da unidade antiga e a torna disponível
          // CORREÇÃO: Limpa apenas os dados da reserva (F a K), mantendo as coordenadas (L e M)
          {
            range: `'${sheetTitle}'!F${oldRow}:K${oldRow}`,
            values: [["", "", "", "", "", "DISPONÍVEL"]],
          },
          // CORREÇÃO: Inclui coluna R (Timestamp) na limpeza
          {
            range: `'${sheetTitle}'!N${oldRow}:R${oldRow}`,
            values: [["", "", "", "", ""]],
          },
          // Transfere dados para a nova unidade e a reserva
          // CORREÇÃO: Divide a atualização para não apagar as coordenadas (L e M) da nova unidade
          {
            range: `'${sheetTitle}'!F${newRow}:K${newRow}`,
            values: [
              [
                dataToTransfer[0], // F: id_pre_cadastro
                dataToTransfer[1], // G: cliente
                dataToTransfer[2], // H: documento
                dataToTransfer[3], // I: corretor
                dataToTransfer[4], // J: imobiliária
                dataToTransfer[5], // K: situação
              ],
            ],
          },
          // CORREÇÃO: Inclui coluna R (Timestamp) na transferência
          {
            range: `'${sheetTitle}'!N${newRow}:R${newRow}`,
            values: [
              [
                dataToTransfer[8], // N: IDENTIFICADOR
                dataToTransfer[9], // O: Payload
                dataToTransfer[10], // P: Valor
                dataToTransfer[11], // Q: Pagamento
                dataToTransfer[12] || "", // R: Timestamp (adiciona com fallback)
              ],
            ],
          },
        ],
      },
    });

    // 4. Registrar no histórico
    await addHistoryEntry(
      sheets,
      sheetTitle,
      `${oldUnitName} -> ${newUnitName}`,
      "Troca de Unidade",
      oldUnitData[1], // Nome do cliente
      oldUnitData[3], // Nome do corretor
      userEmail
    );

    // 5. Notificar clientes SSE sobre as duas unidades
    // Otimização: Envia os dados já conhecidos para evitar novas leituras
    broadcastEvent(sheetTitle, "unitUpdated", {
      rowIndex: oldRow,
      unitData: ["", "", "", "", "", "", "", "DISPONÍVEL", "", "", "", "", ""], // Simula linha limpa
    });
    broadcastEvent(sheetTitle, "unitUpdated", {
      rowIndex: newRow,
      unitData: dataToTransfer,
    });

    res.json({ success: true, message: "Troca de unidade realizada." });
  } catch (err) {
    console.error("Erro ao trocar unidade:", err);
    res.status(500).json({ error: "Falha ao realizar a troca de unidade." });
  }
});

// Endpoint para ATUALIZAR COORDENADAS
app.post("/api/update-coords", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, coordX, coordY, letra } = req.body;
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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    // Atualiza coordenadas (L e M) e letra (R)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!L${rowIndex}:M${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[coordX, coordY]] },
    });

    // Atualiza a letra na coluna R se fornecida
    if (letra !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!R${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[letra || ""]] },
      });
    }
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
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;
    await addHistoryEntry(
      sheets,
      sheetTitle,
      unitFullName,
      "Mapeamento Adicionado",
      null,
      null,
      userEmail
    );

    await broadcastEvent(sheetTitle, "unitUpdated", {
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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    // Limpa coordenadas (L e M) e letra (R)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${sheetTitle}'!L${rowIndex}:M${rowIndex}`,
            values: [["", ""]],
          },
          {
            range: `'${sheetTitle}'!R${rowIndex}`,
            values: [[""]],
          },
        ],
      },
    });

    // Registrar no histórico
    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;

    await addHistoryEntry(
      sheets,
      sheetTitle,
      unitFullName,
      "Mapeamento Removido",
      null,
      null,
      userEmail
    );

    await broadcastEvent(sheetTitle, "unitUpdated", {
      rowIndex,
      unitName: unitFullName,
    });

    res.json({
      success: true,
      message: `Coordenadas e letra limpas para '${unitFullName}'.`,
    });
  } catch (error) {
    console.error("Erro ao limpar coordenadas na planilha:", error);
    res.status(500).json({ error: "Falha ao limpar coordenadas." });
  }
});

// CORREÇÃO: Removido o `verifyToken` para permitir que as páginas públicas
// (fullscreen.html e fullscreen-cvcrm.html) possam salvar o tamanho do ponto
// sem necessidade de autenticação.
app.post("/api/update-dot-size", async (req, res) => {
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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!K${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newStatus]] },
    });

    // --- ADIÇÃO DA LÓGICA SUPABASE ---
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", sheetTitle)
          .limit(1)
          .single();

        const implantacao_id = implData ? implData.id : null;

        if (implantacao_id) {
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
      }
    }

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
    });
    const unitFullName = `${unidadeInfo.data.values[0][0]}`;
    const acao = newStatus === "BLOQUEADA" ? "Bloqueada" : "Desbloqueada";

    await addHistoryEntry(
      sheets,
      sheetTitle,
      unitFullName,
      acao,
      null,
      null,
      userEmail
    );

    await broadcastEvent(sheetTitle, "unitUpdated", {
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

// NOVO: Endpoint para atualizar dados do PIX
app.post("/api/update-pix-data", verifyToken, async (req, res) => {
  const {
    implantacao,
    rowIndex,
    identificador,
    payloadEmv,
    valor,
    statusPagamento,
  } = req.body;
  const userEmail = req.user.email;

  // Log detalhado dos dados recebidos para debug
  console.log("[UPDATE-PIX-DATA] Payload recebido:", {
    implantacao,
    rowIndex,
    identificador,
    payloadEmv,
    valor,
    statusPagamento,
    userEmail,
  });

  if (
    !implantacao ||
    !rowIndex ||
    !identificador ||
    !payloadEmv ||
    valor === undefined ||
    !statusPagamento
  ) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para atualizar o PIX." });
  }

  try {
    const sheets = await getSheetsClient();
    // CORREÇÃO: Utiliza a função 'resolveSheetName' que é a correta e está disponível no escopo.
    // A função 'getSheetTitle' não existe neste contexto, causando o erro 500.
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);

    // Gera o timestamp atual para controle de expiração
    const pixTimestamp = new Date().toISOString();

    // IMPORTANTE: Antes de atualizar, vamos ler os dados atuais para não sobrescrever colunas indesejadas
    const currentDataRange = `'${sheetTitle}'!A${rowIndex}:R${rowIndex}`;
    const currentDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: currentDataRange,
    });
    const currentRow = currentDataRes.data.values?.[0] || [];

    console.log(`[UPDATE-PIX-DATA] Dados atuais da linha ${rowIndex}:`, {
      colunaF: currentRow[5], // F = índice 5
      colunaG: currentRow[6], // G = índice 6
      colunaH: currentRow[7], // H = índice 7
      colunaI: currentRow[8], // I = índice 8
      colunaJ: currentRow[9], // J = índice 9
      colunaN: currentRow[13], // N = índice 13
      colunaO: currentRow[14], // O = índice 14
      colunaP: currentRow[15], // P = índice 15
      colunaQ: currentRow[16], // Q = índice 16
      colunaR: currentRow[17], // R = índice 17
    });

    console.log(`[UPDATE-PIX-DATA] Atualizando PIX:`, {
      implantacao,
      rowIndex,
      identificador,
      statusPagamento,
      timestamp: pixTimestamp,
    });

    // CORREÇÃO: Garante que nenhum valor seja null/undefined para evitar apagar células
    // Atualiza as colunas N (identificador), O (payloadEmv), P (Valor), Q (Status Pagamento) e R (Timestamp)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!N${rowIndex}:R${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [
          [
            identificador || "",
            payloadEmv || "",
            valor !== undefined && valor !== null ? valor : "",
            statusPagamento || "",
            pixTimestamp || "",
          ],
        ],
      },
    });

    // VERIFICAÇÃO PÓS-ATUALIZAÇÃO: Confirma que as colunas F-J não foram afetadas
    const verifyDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: currentDataRange,
    });
    const verifyRow = verifyDataRes.data.values?.[0] || [];

    console.log(`[UPDATE-PIX-DATA] Verificação pós-atualização:`, {
      colunaF: verifyRow[5],
      colunaG: verifyRow[6],
      colunaH: verifyRow[7],
      colunaI: verifyRow[8],
      colunaJ: verifyRow[9],
      colunaN_atualizada: verifyRow[13],
      colunaO_atualizada: verifyRow[14],
      colunaP_atualizada: verifyRow[15],
      colunaQ_atualizada: verifyRow[16],
      colunaR_atualizada: verifyRow[17],
    });

    // ALERTA: Se as colunas F-J foram apagadas, registra erro crítico
    if (!verifyRow[5] && currentRow[5]) {
      console.error(
        `[UPDATE-PIX-DATA] ERRO CRÍTICO: Coluna F foi apagada! Valor anterior: ${currentRow[5]}`
      );
    }
    if (!verifyRow[6] && currentRow[6]) {
      console.error(
        `[UPDATE-PIX-DATA] ERRO CRÍTICO: Coluna G foi apagada! Valor anterior: ${currentRow[6]}`
      );
    }

    // NOVO: Adiciona ao histórico quando um PIX é gerado.
    if (statusPagamento === "PENDENTE") {
      const unitInfoRange = `'${sheetTitle}'!C${rowIndex}:I${rowIndex}`;
      const unitInfoRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: unitInfoRange,
      });
      const unitInfo = unitInfoRes.data.values?.[0] || [];
      const unitName = unitInfo[0] || `Linha ${rowIndex}`; // Coluna C
      const clientName = unitInfo[4] || null; // Coluna G
      const corretor = unitInfo[6] || null; // Coluna I

      await addHistoryEntry(
        sheets,
        sheetTitle,
        unitName,
        "PIX Gerado",
        clientName,
        corretor,
        userEmail
      );
    }

    res.json({ success: true, message: "Dados do PIX atualizados." });
  } catch (error) {
    // Adiciona um log mais detalhado no servidor para facilitar futuras depurações.
    console.error("Erro em /api/update-pix-data:", error);
    res.status(500).json({ error: "Falha ao atualizar dados do PIX." });
  }
});

// NOVO: Endpoint para receber o webhook de confirmação de pagamento do Santander
app.post("/api/santander/webhook", async (req, res) => {
  const { identificador, status } = req.body;

  console.log("[WEBHOOK SANTANDER] Recebido:", req.body);

  if (!identificador || !status) {
    return res
      .status(400)
      .json({ error: "Identificador e status são obrigatórios." });
  }

  if (status.toUpperCase() !== "PAGO") {
    // Ignora outros status por enquanto (ex: EM_PROCESSAMENTO, REJEITADO)
    return res.json({
      message: `Status '${status}' recebido e ignorado.`,
    });
  }

  try {
    const sheets = await getSheetsClient();

    // 1. Descobrir em qual aba (implantação) está o PIX
    const implantacoesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:A`,
    });
    const implantacoes = (implantacoesResponse.data.values || []).flat();

    let targetSheet = null;
    let targetRowIndex = -1;

    for (const implantacao of implantacoes) {
      const range = `'${implantacao}'!N:N`; // Coluna N (identificador)
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range,
      });

      const allIdentifiers = (sheetData.data.values || []).flat();
      const rowIndexInSheet = allIdentifiers.indexOf(identificador);

      if (rowIndexInSheet !== -1) {
        targetSheet = implantacao;
        targetRowIndex = rowIndexInSheet + 1; // +1 porque o array é 0-based
        break;
      }
    }

    if (!targetSheet || targetRowIndex === -1) {
      console.warn(
        `[WEBHOOK SANTANDER] PIX com identificador '${identificador}' não encontrado em nenhuma implantação.`
      );
      return res.status(404).json({
        error: `PIX com identificador '${identificador}' não encontrado.`,
      });
    }

    // 2. Atualizar o status da unidade para "PAGO"
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${targetSheet}'!Q${targetRowIndex}`, // Coluna Q (Status Pagamento)
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["PAGO"]],
      },
    });

    // 3. Notificar clientes via SSE
    await broadcastEvent(targetSheet, "unitUpdated", {
      rowIndex: targetRowIndex,
      // O nome da unidade não é estritamente necessário aqui, pois o payload do evento
      // será preenchido com a linha inteira de dados da planilha.
    });

    // 4. Adicionar ao histórico
    const unitInfoRange = `'${targetSheet}'!C${targetRowIndex}:I${targetRowIndex}`;
    const unitInfoRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitInfoRange,
    });
    const unitInfo = unitInfoRes.data.values?.[0] || [];
    const unitName = unitInfo[0] || `Linha ${targetRowIndex}`;
    const clientName = unitInfo[4] || null;
    const corretor = unitInfo[6] || null;

    await addHistoryEntry(
      sheets,
      targetSheet,
      unitName,
      "PIX Pago",
      clientName,
      corretor,
      "Sistema (Webhook)"
    );

    res.json({
      success: true,
      message: `Status da unidade ${unitName} atualizado para PAGO.`,
    });
  } catch (error) {
    console.error("[WEBHOOK SANTANDER] Erro ao processar webhook:", error);
    res.status(500).json({ error: "Falha ao processar o webhook." });
  }
});

// NOVO: Endpoint para forçar a atualização de uma unidade e notificar clientes
app.post("/api/refresh-unit", verifyToken, async (req, res) => {
  const { implantacao, rowIndex } = req.body;

  if (!implantacao || !rowIndex) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para atualizar a unidade." });
  }

  try {
    const sheets = await getSheetsClient();
    // CORREÇÃO: A função 'getSheetTitle' não existe. A função correta é 'resolveSheetName'.
    // Esta alteração corrige o ReferenceError que estava causando o crash.
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);

    // A função broadcastEvent já busca os dados mais recentes da planilha
    // e envia para todos os clientes conectados na sala da implantação.
    await broadcastEvent(sheetTitle, "unitUpdated", {
      rowIndex: rowIndex,
      // O nome da unidade não é estritamente necessário aqui, pois o payload do evento
      // será preenchido com a linha inteira de dados da planilha.
    });

    res.json({ success: true, message: "Comando de atualização enviado." });
  } catch (error) {
    console.error("Erro ao forçar atualização da unidade:", error);
    res.status(500).json({ error: "Falha ao forçar atualização da unidade." });
  }
});

// NOVO: Endpoint para verificar o status de pagamento e registrar no histórico se necessário.
// Isso desacopla a lógica de registro do webhook, tornando-a mais robusta.
app.post("/api/check-and-log-payment", verifyToken, async (req, res) => {
  const { implantacao, rowIndex } = req.body;
  const userEmail = req.user.email;

  if (!implantacao || !rowIndex) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para verificação de pagamento." });
  }

  try {
    const sheets = await getSheetsClient();
    const { found: sheetTitle } = await resolveSheetName(
      sheets,
      SPREADSHEET_ID_IMPLANTACAO,
      implantacao
    );

    if (!sheetTitle) {
      return res
        .status(404)
        .json({ error: `Planilha '${implantacao}' não encontrada.` });
    }

    // 1. Obter os dados da unidade, incluindo nome e status de pagamento
    const unitDataRange = `'${sheetTitle}'!C${rowIndex}:Q${rowIndex}`;
    const unitDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitDataRange,
    });

    const unitData = unitDataRes.data.values?.[0] || [];
    const unitName = unitData[0]; // Coluna C
    const clientName = unitData[4]; // Coluna G
    const corretor = unitData[6]; // Coluna I
    const paymentStatus = unitData[14]; // Coluna Q (índice 14 no array de C a Q)

    if (paymentStatus?.toUpperCase() !== "PAGO") {
      return res.json({ message: "Pagamento ainda não confirmado." });
    }

    // 2. Verificar se já existe um registro de "PIX Pago" para esta unidade
    const historyResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
      range: `'${sheetTitle}'!A:D`, // Colunas Timestamp, Data, Unidade, Ação
    });

    const historyEntries = historyResponse.data.values || [];
    const alreadyLogged = historyEntries.some(
      (entry) =>
        entry[2] === unitName && // Mesma unidade
        entry[3] === "PIX Pago" // Mesma ação
    );

    if (alreadyLogged) {
      return res.json({ message: "Pagamento já registrado no histórico." });
    }

    // 3. Se for "PAGO" e não houver registro, adiciona ao histórico
    await addHistoryEntry(
      sheets,
      sheetTitle,
      unitName,
      "PIX Pago",
      clientName || null,
      corretor || null,
      userEmail // Ou "Sistema" se preferir
    );

    res.json({
      success: true,
      message: "Pagamento confirmado e registrado no histórico.",
    });
  } catch (error) {
    console.error("Erro ao verificar e registrar pagamento:", error);
    res.status(500).json({ error: "Falha ao verificar pagamento." });
  }
});

// NOVO: Endpoint para disparar o webhook da Botmaker
app.post("/api/botmaker/trigger-intent", verifyToken, async (req, res) => {
  const {
    nomeCliente,
    nomeEmpreendimento,
    unidade,
    contatoCliente,
    identificadorPix,
  } = req.body;

  if (
    !nomeCliente ||
    !nomeEmpreendimento ||
    !unidade ||
    !contatoCliente ||
    !identificadorPix
  ) {
    return res.status(400).json({ error: "Dados incompletos para o webhook." });
  }

  const BOTMAKER_API_URL =
    "https://api.botmaker.com/v2.0/chats-actions/trigger-intent";
  const BOTMAKER_ACCESS_TOKEN = process.env.BOTMAKER_ACCESS_TOKEN;

  if (!BOTMAKER_ACCESS_TOKEN) {
    console.error("[BOTMAKER] Access token não configurado no .env");
    return res
      .status(500)
      .json({ error: "Configuração do servidor incompleta." });
  }

  const body = {
    chat: {
      channelId: "vcaconstrutora-whatsapp-557730251212",
      contactId: contatoCliente,
    },
    intentIdOrName: "pix_sinal3",
    variables: {
      nomeCliente,
      nomeEmpreendimento,
      unidade,
      pix: `?id=${identificadorPix}&timestamp=${await gerarTimestamp()}`,
    },
  };

  // Log para depuração: mostra o corpo da requisição que será enviada
  console.log(
    "[BOTMAKER] Corpo da requisição para a API externa:",
    JSON.stringify(body, null, 2)
  );

  try {
    const response = await fetch(BOTMAKER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "access-token": BOTMAKER_ACCESS_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    // Log para depuração: mostra a resposta recebida da API externa
    console.log(
      `[BOTMAKER] Resposta da API externa (Status: ${response.status}):`,
      JSON.stringify(responseData, null, 2)
    );

    // Repassa o status da API da Botmaker, se não for sucesso.
    res.status(response.status).json({
      success: response.ok,
      message: "Webhook da Botmaker processado.",
      botmakerResponse: responseData,
    });
  } catch (error) {
    console.error("[BOTMAKER] Erro ao disparar webhook:", error);
    res.status(500).json({ error: "Falha ao disparar o webhook." });
  }
});

// NOVO: Endpoint para atuar como proxy para a API do Santander
app.post("/api/santander/gerapix", verifyToken, async (req, res) => {
  const SANTANDER_API_URL = "https://gatewaypix.suportevca.com.br/api/gerapix";

  // Log para depuração: mostra o corpo da requisição recebida do frontend
  console.log(
    "[PROXY /api/santander/gerapix] Corpo da requisição para a API externa:",
    JSON.stringify(req.body, null, 2)
  );

  try {
    // O corpo da requisição (req.body) já vem do frontend no formato correto.
    // Apenas repassamos para a API do Santander.
    const response = await fetch(SANTANDER_API_URL, {
      method: "POST",
      headers: {
        // GARANTIR que apenas os cabeçalhos necessários sejam enviados,
        // evitando repassar o token de autorização do Firebase.
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const responseData = await response.json();

    // Log para depuração: mostra a resposta recebida da API externa
    console.log(
      `[PROXY /api/santander/gerapix] Resposta da API externa (Status: ${response.status}):`,
      JSON.stringify(responseData, null, 2)
    );

    if (!response.ok) {
      // Se a API do Santander retornar um erro, repassamos o status e a mensagem.
      return res.status(response.status).json({
        sucesso: false,
        mensagem:
          responseData.mensagem ||
          `Erro na API externa: ${response.statusText}`,
      });
    }

    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno do servidor ao contatar a API PIX.",
    });
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

app.get("/api/user/full-name", verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", req.user.uid)
      .single();

    if (error) throw error;
    res.json({ full_name: data?.full_name || null });
  } catch (error) {
    res.status(500).json({ error: "Falha ao buscar nome completo." });
  }
});

app.post("/api/user/full-name", verifyToken, async (req, res) => {
  const { full_name } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: "Nome completo é obrigatório." });
  }

  try {
    const { error } = await supabase
      .from("users")
      .update({ full_name: full_name.trim() })
      .eq("id", req.user.uid);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar nome completo." });
  }
});

/**
 * Função para verificar e cancelar PIX pendentes que expiraram (60 minutos)
 */
async function checkAndCancelExpiredPix() {
  try {
    console.log("[PIX TIMEOUT] Verificando PIX expirados...");
    const sheets = await getSheetsClient();

    // Busca todas as implantações
    const implantacoesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_DADOS,
      range: `${SHEET_NAME_IMPLANTACOES}!A2:A`,
    });
    const implantacoes = (implantacoesResponse.data.values || []).flat();

    const now = new Date();
    const TIMEOUT_MINUTES = 60;
    let totalExpired = 0;

    for (const implantacao of implantacoes) {
      try {
        // Busca o histórico da implantação
        const historyResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_HISTORICO,
          range: `'${implantacao}'!A:D`, // A: Timestamp ISO, B: Data Formatada, C: Unidade, D: Ação
        });

        const historyEntries = historyResponse.data.values || [];

        // Busca todas as unidades da implantação
        const unitsResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${implantacao}'!A2:Q`, // Até coluna Q (status pagamento)
        });

        const units = unitsResponse.data.values || [];

        for (let i = 0; i < units.length; i++) {
          const unit = units[i];
          const rowIndex = i + 2; // +2 porque começa na linha 2

          const statusPagamento = unit[16]; // Coluna Q

          // Verifica se é um PIX pendente
          if (statusPagamento === "PENDENTE") {
            const unitName = unit[2] || `Linha ${rowIndex}`; // Coluna C

            // Busca no histórico quando o PIX foi gerado para esta unidade
            const pixGeradoEntry = historyEntries
              .slice(1) // Pula o cabeçalho
              .reverse() // Mais recente primeiro
              .find(
                (entry) =>
                  entry[2] === unitName && // Mesma unidade (coluna C do histórico)
                  entry[3] === "PIX Gerado" // Ação = PIX Gerado (coluna D do histórico)
              );

            if (pixGeradoEntry && pixGeradoEntry[0]) {
              const pixTimestamp = new Date(pixGeradoEntry[0]); // Coluna A: Timestamp ISO
              const diffMinutes = (now - pixTimestamp) / (1000 * 60);

              // Se passou mais de 60 minutos, cancela a reserva
              if (diffMinutes >= TIMEOUT_MINUTES) {
                const clientName = unit[6] || null; // Coluna G
                const corretor = unit[8] || null; // Coluna I

                console.log(
                  `[PIX TIMEOUT] Cancelando reserva expirada: ${unitName} (${Math.floor(
                    diffMinutes
                  )} minutos desde geração do PIX)`
                );

                // Limpa os dados da unidade e volta para DISPONÍVEL (preserva colunas L e M - coordenadas)
                // Colunas: F, G, H, I, J, K (status), L (preserva), M (preserva), N, O, P, Q
                await sheets.spreadsheets.values.batchUpdate({
                  spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
                  resource: {
                    data: [
                      {
                        range: `'${implantacao}'!F${rowIndex}:K${rowIndex}`, // ID até Status
                        values: [["", "", "", "", "", "DISPONÍVEL"]],
                      },
                      {
                        range: `'${implantacao}'!N${rowIndex}:Q${rowIndex}`, // PIX data
                        values: [["", "", "", ""]],
                      },
                    ],
                    valueInputOption: "USER_ENTERED",
                  },
                });

                // Registra no histórico
                await addHistoryEntry(
                  sheets,
                  implantacao,
                  unitName,
                  "Cancelada Automaticamente (PIX Expirado)",
                  clientName,
                  corretor,
                  "Sistema"
                );

                // Notifica via SSE
                await broadcastEvent(implantacao, "unitUpdated", {
                  rowIndex,
                  unitName,
                });

                totalExpired++;
              }
            }
          }
        }
      } catch (error) {
        console.error(
          `[PIX TIMEOUT] Erro ao verificar implantação ${implantacao}:`,
          error.message
        );
      }
    }

    if (totalExpired > 0) {
      console.log(
        `[PIX TIMEOUT] ${totalExpired} reserva(s) cancelada(s) por expiração.`
      );
    }
  } catch (error) {
    console.error(
      "[PIX TIMEOUT] Erro ao verificar PIX expirados:",
      error.message
    );
  }
}

// Executa a verificação a cada 1 minuto (60000 ms)
setInterval(checkAndCancelExpiredPix, 60000);

// Executa uma vez ao iniciar o servidor
checkAndCancelExpiredPix();

// =================================================================
// INÍCIO DO SERVIDOR
// =================================================================

// ESTA LINHA DEVE SER SEMPRE A ÚLTIMA ANTES DE EXPORTAR O MÓDULO (SE APLICÁVEL)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Servidor rodando na porta ${PORT}`);
  console.log(`✓ Acesse em http://localhost:${PORT}`);
  console.log(
    `✓ Job de verificação de PIX expirados ativo (verifica a cada 1 minuto)`
  );
});
