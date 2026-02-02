// backend/server.js - VERSÃO COMPLETA E FINAL COM AUTENTICAÇÃO

// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// =================================================================
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const path = require("path");
const XLSX = require("xlsx");
const { spawn } = require("child_process");
const Redis = require("ioredis");
const fs = require("fs");

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

// Wrapper para operações Supabase com rate limiting
async function supabaseWithRateLimit(operation) {
  if (!supabase) {
    throw new Error("Supabase não configurado");
  }
  const rateLimitCheck = checkRateLimit("supabase_global", "supabase");
  if (!rateLimitCheck.allowed) {
    const waitSeconds = Math.ceil(rateLimitCheck.resetIn / 1000);
    const error = new Error(
      `Rate limit do Supabase excedido. Tente novamente em ${waitSeconds}s`
    );
    error.rateLimitError = true;
    error.resetIn = rateLimitCheck.resetIn;
    console.warn(`[SUPABASE] Rate limit atingido. Aguarde ${waitSeconds}s`);
    throw error;
  }

  return await operation(supabase);
}

// Helper: procura implantação por nome de forma tolerante
async function findImplantacaoByName(sheetName) {
  if (!supabase) return null;
  try {
    // tenta correspondência exata sem lançar erro se não encontrar
    const { data, error } = await supabase
      .from("implantacoes")
      .select("id,nome")
      .eq("nome", sheetName)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[FIND_IMPLANT] erro na busca exata:", error.message || error);
    }
    if (data) return data;

    // fallback: cria um padrão flexível removendo acentos e caracteres especiais
    const cleaned = String(sheetName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]+/g, " ")
      .trim();
    const pattern = cleaned.split(/\s+/).join("%");
    console.log(`[FIND_IMPLANT] exact not found, trying ilike pattern '%${pattern}%' for '${sheetName}'`);

    const { data: data2, error: err2 } = await supabase
      .from("implantacoes")
      .select("id,nome")
      .ilike("nome", `%${pattern}%`)
      .limit(1)
      .maybeSingle();

    if (err2) console.warn("[FIND_IMPLANT] erro na busca ilike:", err2.message || err2);
    return data2 || null;
  } catch (e) {
    console.error("[FIND_IMPLANT] exception:", e && e.message ? e.message : e);
    return null;
  }
}

// Helper: upload robusto ao Supabase Storage e retorna publicUrl
async function uploadFileToSupabaseStorage(bucket, fileObj, prefix = "") {
  if (!supabase) throw new Error("Supabase não configurado");
  if (!fileObj) throw new Error("fileObj não fornecido");

  const original = fileObj.originalname || "file";
  const sanitized = sanitizeFilename(original);
  const timestamp = Date.now();
  const filename = `${prefix}${timestamp}_${sanitized}`;

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[STORAGE] upload attempt ${attempt} -> bucket='${bucket}' file='${filename}' size=${fileObj.size || (fileObj.buffer && fileObj.buffer.length) || 0}`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filename, fileObj.buffer, {
          contentType: fileObj.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        console.warn(`[STORAGE] upload error attempt ${attempt}:`, uploadError.message || uploadError);
        if (attempt === maxAttempts) throw uploadError;
        // small delay before retry
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }

      const { data: urlData, error: urlErr } = supabase.storage
        .from(bucket)
        .getPublicUrl(filename);

      if (urlErr) {
        console.warn(`[STORAGE] getPublicUrl error:`, urlErr.message || urlErr);
      }

      const publicUrl = urlData && urlData.publicUrl ? urlData.publicUrl : null;
      console.log(`[STORAGE] upload successful: ${publicUrl}`);
      return { filename, publicUrl };
    } catch (e) {
      console.error(`[STORAGE] exception on upload attempt ${attempt}:`, e && e.message ? e.message : e);
      if (attempt === maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

// Configuração do Redis
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on("error", (err) => console.error("[REDIS] Erro:", err));
redis.on("connect", () => console.log("[REDIS] Conectado com sucesso"));

// Inicializa o Express App
const app = express();

// Serve static frontend files (fullscreen pages) when available
try {
  const staticDir = path.join(__dirname, '..', '..', 'frontend', 'public');
  if (fs.existsSync(staticDir)) {
    app.use('/', express.static(staticDir));
    console.log(`[STATIC] Servindo arquivos estáticos de: ${staticDir}`);
  } else {
    console.warn(`[STATIC] Diretório estático não encontrado em: ${staticDir}`);
  }
} catch (e) {
  console.warn('[STATIC] Falha ao configurar arquivos estáticos:', e && e.message ? e.message : e);
}

// NOVO: Cache em memória para abas de histórico já criadas
const createdHistorySheets = new Set();

// =================================================================
// SISTEMA INTELIGENTE DE POLLING E RATE LIMITING
// =================================================================

// Cache de dados com TTL (Time To Live)
const dataCache = new Map();
const CACHE_TTL = 5000; // 5 segundos de cache

// Rate limiting por endpoint e implantação
const rateLimitMap = new Map();
const RATE_LIMIT = {
  sheets: { maxRequests: 60, windowMs: 60000 }, // 60 req/min (Google Sheets)
  supabase: { maxRequests: 100, windowMs: 60000 }, // 100 req/min (Supabase)
  polling: { minInterval: 3000 }, // Mínimo 3s entre polls da mesma unidade
};

// Tracking de mudanças para backoff adaptativo
const changeTracker = new Map();
const BACKOFF_CONFIG = {
  noChanges: 10000, // 10s quando não há mudanças
  withChanges: 3000, // 3s quando há mudanças recentes
  maxBackoff: 30000, // 30s máximo
};

// Pool de requisições pendentes para evitar duplicatas
const requestPool = new Map();

// Helper: Verifica rate limit
function checkRateLimit(key, type = "sheets") {
  const now = Date.now();
  const limit = RATE_LIMIT[type];

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  const requests = rateLimitMap.get(key);
  const windowStart = now - limit.windowMs;

  // Remove requisições antigas
  const recentRequests = requests.filter((time) => time > windowStart);
  rateLimitMap.set(key, recentRequests);

  if (recentRequests.length >= limit.maxRequests) {
    const oldestRequest = recentRequests[0];
    const resetTime = oldestRequest + limit.windowMs;
    return { allowed: false, resetIn: resetTime - now };
  }

  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);
  return { allowed: true };
}

// === Redis-based simple lock helpers ===
async function acquireLock(key, owner, ttlMs = 15000) {
  try {
    const lockKey = `lock:${key}`;
    const res = await redis.set(lockKey, owner, "PX", ttlMs, "NX");
    return res === "OK";
  } catch (e) {
    console.error("[LOCK] acquire error:", e && e.message ? e.message : e);
    return false;
  }
}

async function releaseLock(key, owner) {
  try {
    const lockKey = `lock:${key}`;
    const val = await redis.get(lockKey);
    if (val === owner) {
      await redis.del(lockKey);
      return true;
    }
    return false;
  } catch (e) {
    console.error("[LOCK] release error:", e && e.message ? e.message : e);
    return false;
  }
}

// Helper: Cache com TTL
function getCachedData(key) {
  const cached = dataCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    dataCache.delete(key);
    return null;
  }

  return cached.data;
}

function setCachedData(key, data) {
  dataCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

// Helper: Backoff adaptativo baseado em mudanças
function getAdaptiveInterval(implantacao) {
  const tracker = changeTracker.get(implantacao);
  if (!tracker) {
    changeTracker.set(implantacao, {
      lastChange: Date.now(),
      changeCount: 0,
    });
    return BACKOFF_CONFIG.withChanges;
  }

  const timeSinceChange = Date.now() - tracker.lastChange;

  // Se houve mudanças recentes (últimos 2 minutos), mantém intervalo curto
  if (timeSinceChange < 120000 && tracker.changeCount > 0) {
    return BACKOFF_CONFIG.withChanges;
  }

  // Aumenta gradualmente o backoff até o máximo
  const backoff = Math.min(
    BACKOFF_CONFIG.noChanges + (timeSinceChange / 10000) * 1000,
    BACKOFF_CONFIG.maxBackoff
  );

  return Math.floor(backoff);
}

function registerChange(implantacao) {
  const tracker = changeTracker.get(implantacao) || {
    lastChange: 0,
    changeCount: 0,
  };
  tracker.lastChange = Date.now();
  tracker.changeCount += 1;
  changeTracker.set(implantacao, tracker);
}

// Helper: Pool de requisições para evitar duplicatas
async function pooledRequest(key, requestFn) {
  if (requestPool.has(key)) {
    // Já existe uma requisição em andamento, aguarda ela
    return await requestPool.get(key);
  }

  const promise = requestFn().finally(() => {
    requestPool.delete(key);
  });

  requestPool.set(key, promise);
  return await promise;
}

// Limpeza periódica de caches antigos
setInterval(() => {
  const now = Date.now();

  // Limpa cache expirado
  for (const [key, value] of dataCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      dataCache.delete(key);
    }
  }

  // Limpa rate limits antigos (mantém apenas última hora)
  for (const [key, requests] of rateLimitMap.entries()) {
    const recent = requests.filter((time) => now - time < 3600000);
    if (recent.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recent);
    }
  }

  console.log(
    `[CACHE] Limpeza: ${dataCache.size} entradas em cache, ${rateLimitMap.size} rate limits ativos`
  );
}, 60000); // Limpa a cada 1 minuto

// =================================================================
// HELPER: Normalização de Status (case e accent insensitive)
// =================================================================
function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "";
  return status
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// =================================================================
// HELPER: Converte dados do Supabase para formato array (A-S) compatível com fullscreen
// =================================================================
function supabaseUnitToArray(unitData) {
  if (!unitData) return null;
  // Retorna exatamente 19 colunas (A..S) compatíveis com a estrutura do fullscreen.
  // Mantemos O:P por compatibilidade, mas expomos Q (índice 16) como `implantacao_ref`
  // quando disponível, com fallbacks para identificadores/payloads.
  return [
    unitData.etapa || "", // A
    unitData.bloco || "", // B
    unitData.nome_unidade || "", // C
    unitData.area || "", // D - area_privativa
    unitData.tipo || "", // E - tipologia
    unitData.valor || "", // F
    unitData.id_pre_cadastro || "", // G
    unitData.cliente || "", // H
    unitData.documento || "", // I
    unitData.corretor || "", // J
    unitData.imobiliaria || "", // K
    unitData.situacao || "Disponível", // L
    unitData.coord_x || "", // M
    unitData.coord_y || "", // N
    unitData.coord_x_ad || "", // O - coord_x_ad (adicional) - mantido por compatibilidade
    unitData.coord_y_ad || "", // P - coord_y_ad (adicional) - mantido por compatibilidade
    // Q (índice 16) -> implantacao_ref (se não existir, fallback para identificador/pix)
    unitData.implantacao_ref || unitData.identificador || unitData.identificador_pix || "",
    // R (índice 17) -> identificador (pix) ou payload
    unitData.identificador || unitData.identificador_pix || "",
    // S (índice 18) -> payload_emv / payload / simbolo
    unitData.payload_emv || unitData.payload || unitData.simbolo || unitData.simbolo_unidade || unitData.letra || "",
  ];
}

// =================================================================
// 3. CONFIGURAÇÕES DE MIDDLEWARE
// =================================================================

// Configuração de CORS para permitir acesso do seu frontend (Vercel)
const allowedOrigins = [
  "https://lancamentos.vcaconstrutora.com.br", // Frontend em produção
  "https://apitelaodigital.suportevca.com.br", // Fullscreen host
  "http://localhost:3000", // Backend servindo arquivos estáticos (fullscreen.html)
  "http://localhost:5173", // Frontend em desenvolvimento local
  "http://localhost:5174", // Frontend em desenvolvimento local (porta alternativa)
  "http://127.0.0.1:5500", // Live Server
  "http://localhost:5500", // Live Server
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

// Endpoint interno para notificações do worker sobre processamento de pagamentos
// Body esperado: { unidade, pagamento_id, status, rowIndex?, implantacao? }
app.post("/internal/notify-payment-processed", async (req, res) => {
  try {
    const secret = process.env.INTERNAL_NOTIFY_SECRET;
    if (secret) {
      const header = req.headers["x-internal-secret"] || req.headers["x-internal-token"];
      if (!header || header !== secret) {
        console.warn("/internal/notify-payment-processed: secret mismatch or missing");
        return res.status(403).json({ error: "forbidden" });
      }
    }

    const { unidade, pagamento_id, status, rowIndex, implantacao, reserva_id, reserva_url } = req.body || {};
    if (!unidade && !pagamento_id) {
      return res.status(400).json({ error: "unidade or pagamento_id required" });
    }

    const payload = { unitName: unidade, pagamento_id, pagamentos_status: status, rowIndex, reserva_id, reserva_url };

    // If client provided an implantacao name, broadcast there; otherwise broadcast to all
    if (implantacao) {
      await broadcastEvent(implantacao, "unitUpdated", payload);
      console.log("[INTERNAL] Notified implantacao:", implantacao, "payload:", payload);
    } else {
      for (const imp of Array.from(sseClients.keys())) {
        try {
          await broadcastEvent(imp, "unitUpdated", payload);
        } catch (e) {
          console.warn("[INTERNAL] failed broadcasting to implantacao", imp, e && e.message);
        }
      }
      console.log("[INTERNAL] Broadcasted notification to all implantacoes", payload);
    }

    // Additionally, try to record this event in the historico (Sheets + Supabase)
    try {
      let implantacaoName = implantacao || null;
      let clienteName = null;
      let corretorName = null;

      // If pagamento_id provided, try to fetch related cliente info
      if (pagamento_id) {
        try {
          const { data: pagData } = await supabase
            .from('pagamentos')
            .select('unidade, cliente_id')
            .eq('id', pagamento_id)
            .single();
          if (pagData) {
            if (!unidade && pagData.unidade) unidade = pagData.unidade;
            const clienteId = pagData.cliente_id;
            if (clienteId) {
              const { data: clienteRow } = await supabase
                .from('clientes')
                .select('nome, corretor')
                .eq('id', clienteId)
                .limit(1)
                .single();
              if (clienteRow) {
                clienteName = clienteRow.nome || null;
                corretorName = clienteRow.corretor || null;
              }
            }
          }
        } catch (e) {
          // non-blocking
        }
      }

      // If implantacao not provided, attempt to infer by matching unidade in 'unidades'
      if (!implantacaoName && unidade) {
        try {
          const { data: unidadeRow } = await supabase
            .from('unidades')
            .select('implantacao_id, nome_unidade')
            .ilike('nome_unidade', `%${unidade}%`)
            .limit(1)
            .single();
          if (unidadeRow && unidadeRow.implantacao_id) {
            const { data: impl } = await supabase
              .from('implantacoes')
              .select('nome')
              .eq('id', unidadeRow.implantacao_id)
              .limit(1)
              .single();
            if (impl && impl.nome) implantacaoName = impl.nome;
          }
        } catch (e) {
          // ignore
        }
      }

      // Determine a action text more precisely:
      // - If reserva_id is present and status is processado, it's a successful reservation by worker
      // - If pagamento_id is present but no reserva_id, it's just a payment registration
      // - Otherwise, it's an error
      let acao = 'Erro ao processar reserva (Worker)';
      try {
        const statusNorm = (status || '').toString().toLowerCase();
        
        // Priority 1: Check if it's a successful reservation (has reserva_id)
        if (reserva_id && (statusNorm === 'processado' || statusNorm === 'pago' || statusNorm === 'paid' || statusNorm === 'processed' || statusNorm === 'sucesso')) {
          acao = 'Reserva processada (Worker)';
        }
        // Priority 2: Payment registration (no reserva_id but has pagamento_id)
        else if (pagamento_id && !reserva_id) {
          if (statusNorm === 'processado' || statusNorm === 'pago' || statusNorm === 'paid') {
            acao = 'Pagamento Registrado';
          } else {
            acao = 'Erro ao registrar pagamento (Worker)';
          }
        }
        // Priority 3: General reservation processing (no pagamento_id)
        else if (!pagamento_id) {
          if (statusNorm === 'processado' || statusNorm === 'processed' || statusNorm === 'sucesso') {
            acao = 'Reserva processada (Worker)';
          } else {
            acao = 'Erro ao processar reserva (Worker)';
          }
        }
        // Default: error
        else {
          acao = 'Erro ao processar reserva (Worker)';
        }
      } catch (e) {
        acao = status === 'processado' ? 'Reserva processada (Worker)' : 'Erro ao processar reserva (Worker)';
      }

      if (implantacaoName) {
        try {
          const sheets = await getSheetsClient();
          await addHistoryEntry(sheets, implantacaoName, unidade || null, acao, clienteName, corretorName, 'Worker', reserva_url || null);
        } catch (e) {
          console.warn('[INTERNAL] Falha ao gravar histórico via Sheets, attempting Supabase only', e && e.message);
            // fallback to Supabase only
            try {
              const { data: implData } = await supabase
                .from('implantacoes')
                .select('id')
                .eq('nome', implantacaoName)
                .limit(1)
                .single();
              const implantacao_id = implData ? implData.id : null;
              const { data: insertedHistorico, error: insertError } = await supabase.from('historico').insert({
                timestamp_iso: new Date().toISOString(),
                data_formatada: null,
                unidade_nome: unidade || null,
                acao,
                cliente: clienteName || null,
                corretor: corretorName || null,
                implantacao_id: implantacao_id,
                reserva_url: reserva_url || null,
                usuario: 'Worker',
              }).select();
              
              if (insertError) {
                console.error('[INTERNAL] Erro ao inserir histórico:', insertError);
              }
              
              // Build a compatible history row for immediate SSE update
              const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
              const dataFormatada = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + ' às ' + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              
              // Use the inserted ID if available, otherwise use timestamp as temporary ID
              const historicoId = (insertedHistorico && insertedHistorico[0] && insertedHistorico[0].id) ? String(insertedHistorico[0].id) : now.toISOString();
              
              const historyRow = [historicoId, dataFormatada, unidade || null, acao, clienteName || "N/A", corretorName || "N/A", "Worker", reserva_url || ""];
              // notify clients about history update and include the row
              // Attempt to include rowIndex for better frontend updates (best-effort)
              try {
                let resolvedRowIndex = null;
                if (unidade) {
                  try {
                    const colC = await getSheetsClient().then(s => s.spreadsheets.values.get({
                      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
                      range: `'${implantacaoName}'!C:C`,
                      valueRenderOption: 'FORMATTED_VALUE',
                    }));
                    const vals = colC.data.values || [];
                    const targetNorm = (unidade || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
                    for (let i = 0; i < vals.length; i++) {
                      const cell = (vals[i] && vals[i][0]) ? vals[i][0].toString() : '';
                      const cellNorm = cell.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
                      if (cellNorm === targetNorm) { resolvedRowIndex = i + 1; break; }
                    }
                  } catch (e) {}
                }
                const payload = { message: `Novo evento: ${acao}`, row: historyRow };
                if (resolvedRowIndex) payload.rowIndex = resolvedRowIndex;
                await broadcastEvent(implantacaoName, 'historyUpdated', payload);
              } catch (e) {
                await broadcastEvent(implantacaoName, 'historyUpdated', { message: `Novo evento: ${acao}`, row: historyRow });
              }
            } catch (e2) {
              console.error('[INTERNAL] Falha ao gravar histórico no Supabase também:', e2 && e2.message);
            }
        }
      } else {
        // If we couldn't infer implantacao, write to Supabase historico without implantacao_id
        try {
          const { data: insertedHistorico, error: insertError } = await supabase.from('historico').insert({
            timestamp_iso: new Date().toISOString(),
            data_formatada: null,
            unidade_nome: unidade || null,
            acao,
            cliente: clienteName || null,
            corretor: corretorName || null,
            reserva_url: reserva_url || null,
            usuario: 'Worker',
          }).select();
          
          if (insertError) {
            console.error('[INTERNAL] Erro ao inserir histórico sem implantação:', insertError);
          }
          
          // Broadcast to all connected clients so they can refresh histories generically
          // Include a constructed history row so clients can update immediately
          const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
          const dataFormatada = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + ' às ' + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          
          // Use the inserted ID if available, otherwise use timestamp as temporary ID
          const historicoId = (insertedHistorico && insertedHistorico[0] && insertedHistorico[0].id) ? String(insertedHistorico[0].id) : now.toISOString();
          
          const historyRow = [historicoId, dataFormatada, unidade || null, acao, clienteName || "N/A", corretorName || "N/A", "Worker", reserva_url || ""];
          for (const imp of Array.from(sseClients.keys())) {
            try {
              try {
                let resolvedRowIndex = null;
                if (unidade) {
                  try {
                    const colC2 = await getSheetsClient().then(s => s.spreadsheets.values.get({
                      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
                      range: `'${imp}'!C:C`,
                      valueRenderOption: 'FORMATTED_VALUE',
                    }));
                    const vals2 = colC2.data.values || [];
                    const targetNorm2 = (unidade || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
                    for (let i = 0; i < vals2.length; i++) {
                      const cell = (vals2[i] && vals2[i][0]) ? vals2[i][0].toString() : '';
                      const cellNorm = cell.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
                      if (cellNorm === targetNorm2) { resolvedRowIndex = i + 1; break; }
                    }
                  } catch (e) {}
                }
                const payload2 = { message: `Novo evento: ${acao}`, row: historyRow };
                if (resolvedRowIndex) payload2.rowIndex = resolvedRowIndex;
                await broadcastEvent(imp, 'historyUpdated', payload2);
              } catch (e) {
                await broadcastEvent(imp, 'historyUpdated', { message: `Novo evento: ${acao}`, row: historyRow });
              }
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          console.error('[INTERNAL] Falha ao gravar histórico sem implantacao:', e && e.message);
        }
      }
    } catch (e) {
      console.warn('[INTERNAL] Erro ao tentar gravar histórico a partir da notificação:', e && e.message ? e.message : e);
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("/internal/notify-payment-processed error:", e && e.message ? e.message : e);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Configuração do multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedCsvTypes = /csv/;
    const allowedXlsxTypes = /xlsx/;

    const extname = path.extname(file.originalname).toLowerCase();
    const ext = extname.replace(/^\./, "");
    const isImage =
      allowedImageTypes.test(ext) && /^image\//.test(file.mimetype);
    const isCsv =
      allowedCsvTypes.test(ext) ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel";
    const isXlsx =
      allowedXlsxTypes.test(ext) ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // Debug logs para diagnosticar uploads
    try {
      console.log("[MULTER fileFilter] originalname:", file.originalname);
      console.log("[MULTER fileFilter] mimetype:", file.mimetype);
      console.log("[MULTER fileFilter] ext:", ext);
      console.log(
        `[MULTER fileFilter] isImage:${isImage} isCsv:${isCsv} isXlsx:${isXlsx}`
      );
    } catch (e) {
      console.warn("[MULTER fileFilter] erro ao logar file info", e && e.message);
    }

    if (isImage || isCsv || isXlsx) {
      return cb(null, true);
    }
    const errMsg =
      "Apenas imagens (jpeg, jpg, png, gif, webp), arquivos CSV e XLSX são permitidos";
    console.warn("[MULTER fileFilter] rejeitado:", file.originalname, ext, file.mimetype);
    cb(new Error(errMsg));
  },
});

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
        // Verifica o status atual antes de reverter
        const statusCheck = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${implantacao}'!L${rowIndex}`,
        });

        const currentStatus = statusCheck.data.values?.[0]?.[0] || "";
        const normalized = normalizeStatus(currentStatus);

        // Só reverte se ainda estiver "RESERVANDO"
        if (normalized === "reservando") {
          // Reverte o status na planilha para "Disponível"
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${implantacao}'!L${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [["Disponível"]] },
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
          console.log(`[CLEANUP] Unidade ${key} revertida para Disponível.`);
        } else {
          console.log(
            `[CLEANUP] Unidade ${key} já está como '${currentStatus}', não será revertida.`
          );
        }
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
  // Build event payload and ensure we always transmit a full row (A..S)
  let eventPayload = data.unitData ? { ...data } : { ...data, unitData: null };

  if (data.rowIndex && !data.unitData) {
    try {
      const sheets = await getSheetsClient();
      // Fetch full A..S (19 cols) so both primary (M:N) and additional (O:P) coords + simbolo (S) are included
      const range = `'${implantacao}'!A${data.rowIndex}:S${data.rowIndex}`;
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range,
      });
      if (sheetData.data.values && sheetData.data.values.length > 0) {
        const row = sheetData.data.values[0] || [];
        const padded = new Array(19).fill("");
        for (let i = 0; i < Math.min(19, row.length); i++) padded[i] = row[i];
        eventPayload.unitData = padded;
      }
    } catch (error) {
      console.error(`[SSE Broadcast] Falha ao buscar dados da unidade para o evento:`, error);
    }
  }

  // Attach pagamentos.status if available
  if (supabase && (eventPayload.unitData || data.unitName || data.rowIndex)) {
    try {
      let unidadeNome = data.unitName || null;
      if (!unidadeNome && eventPayload.unitData && Array.isArray(eventPayload.unitData)) {
        unidadeNome = eventPayload.unitData[2] || null;
      }
      if (unidadeNome) {
        let pagamentosResp = await supabase
          .from("pagamentos")
          .select("status, unidade, data_processamento")
          .eq("unidade", unidadeNome)
          .order("data_processamento", { ascending: false })
          .limit(1)
          .single();
        if ((!pagamentosResp || !pagamentosResp.data) && unidadeNome) {
          try {
            pagamentosResp = await supabase
              .from("pagamentos")
              .select("status, unidade, data_processamento")
              .ilike("unidade", `%${unidadeNome}%`)
              .order("data_processamento", { ascending: false })
              .limit(1)
              .single();
          } catch (e) {
            // ignore
          }
        }
        if (pagamentosResp && pagamentosResp.data && pagamentosResp.data.status) {
          eventPayload.pagamentos_status = pagamentosResp.data.status;
          if (eventPayload.unitData && Array.isArray(eventPayload.unitData)) {
            eventPayload.unitData[20] = pagamentosResp.data.status;
          }
        }
      }
    } catch (err) {
      console.warn("[SSE] Não foi possível anexar pagamentos.status ao payload:", err && err.message ? err.message : err);
    }
  }

  // Ensure metadata
  eventPayload.changeType = eventPayload.changeType || data.changeType || "update";
  eventPayload.actor = eventPayload.actor || data.actor || null;
  eventPayload.ts = eventPayload.ts || data.ts || Date.now();

  // Log do que está sendo enviado (resumido)
  console.log(`[SSE Broadcast] Enviando evento '${event}' para '${implantacao}' (row=${eventPayload.rowIndex} - unitData=${!!eventPayload.unitData})`);

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
  process.env.SPREADSHEET_ID_IMPLANTACAO ||
  "1_q-6DYUTbPKPzBFCovoOTrtKXys1TraQFzGiXiz-h9s";
const SPREADSHEET_ID_DADOS =
  process.env.SPREADSHEET_ID_DADOS ||
  "1CyXDp_RpSApsh-QjJPuWUzHnQV1MZFy2W3u7jIhFPbY";
const SPREADSHEET_ID_HISTORICO =
  process.env.SPREADSHEET_ID_HISTORICO ||
  "1LiDhvO1wJg8WZFpmMKUFE2DkzIxzouch_7aHjwlQPfI";
const SPREADSHEET_ID_PIX =
  process.env.SPREADSHEET_ID_PIX ||
  "1p2cFQIvT2Gq23VmfGUpvmCo3MK2Y5LkudR7ekrmkTdY";

const SHEET_NAME_DADOS = "Página1";
const SHEET_NAME_CONFIG = "Config";
const SHEET_NAME_IMPLANTACOES = "Implantacoes";

// =================================================================
// 5. FUNÇÕES AUXILIARES E MIDDLEWARE DE AUTENTICAÇÃO
// (Definidas ANTES de serem usadas nos endpoints)
// =================================================================

// Middleware para verificar o Token do Supabase
async function verifyToken(req, res, next) {
  console.log("[AUTH] ===== VERIFICANDO TOKEN =====");
  console.log("[AUTH] Método:", req.method, "| Path:", req.path);
  console.log("[AUTH] Headers:", JSON.stringify(req.headers, null, 2));
  // Allow token via query param for clients like EventSource that cannot set headers
  if (
    (!req.headers || !req.headers.authorization) &&
    req.query &&
    req.query.token
  ) {
    req.headers = req.headers || {};
    req.headers.authorization = `Bearer ${req.query.token}`;
    console.log("[AUTH] Token extraído da query param 'token'");
  }

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

// Função para sanitizar nomes de arquivo (remove acentos e caracteres especiais)
function sanitizeFilename(filename) {
  return filename
    .normalize("NFD") // Decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Remove marcas diacríticas
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Substitui caracteres especiais por _
    .replace(/_+/g, "_") // Remove underscores duplicados
    .replace(/^_|_$/g, ""); // Remove underscores do início e fim
}

async function gerarTimestamp() {
  // Retorna o timestamp atual em segundos (Unix time)
  return Math.floor(Date.now() / 1000);
}

// Cliente do Google Sheets
async function getSheetsClient() {
  // Verifica rate limit do Google Sheets antes de criar o cliente
  const rateLimitCheck = checkRateLimit("sheets_global", "sheets");
  if (!rateLimitCheck.allowed) {
    const waitSeconds = Math.ceil(rateLimitCheck.resetIn / 1000);
    const error = new Error(
      `Rate limit do Google Sheets excedido. Tente novamente em ${waitSeconds}s`
    );
    error.rateLimitError = true;
    error.resetIn = rateLimitCheck.resetIn;
    console.warn(`[SHEETS] Rate limit atingido. Aguarde ${waitSeconds}s`);
    throw error;
  }

  // --- VERIFICAÇÃO DE SEGURANÇA PARA DOCKER ---
  const keyPath = path.resolve("credentials.json");
  try {
    if (fs.existsSync(keyPath) && fs.lstatSync(keyPath).isDirectory()) {
       throw new Error(
         `ERRO CRÍTICO: O arquivo 'credentials.json' foi montado como um DIRETÓRIO. \n` +
         `Isso ocorre quando o arquivo não existe no host ao rodar o docker-compose. \n` +
         `SOLUÇÃO: No host, apague a pasta 'backend/credentials.json', coloque o arquivo correto e reinicie.`
       );
    }
  } catch (e) {
     if (e.message.includes("ERRO CRÍTICO")) throw e;
  }
  // -------------------------------------------

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
  usuario,
  reserva_url = null
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
      reserva_url || "",
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

        // Se a criação for bem-sucedida, adiciona o cabeçalho (agora com coluna Reserva URL).
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_HISTORICO,
          range: `'${implantacao}'!A1:H1`,
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
                "Reserva URL",
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

    // Append history to Google Sheets (inclui coluna Reserva URL como H)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID_HISTORICO,
      range: `'${implantacao}'!A:H`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [historyRow],
      },
    });

    // NOVO: Notifica todos os clientes conectados sobre a atualização do histórico.
    // O payload pode ser simples, apenas para sinalizar que o frontend deve recarregar o histórico.
    // Try to resolve the corresponding rowIndex for the unidade (best-effort)
    let resolvedRowIndex = null;
    try {
      if (unidade) {
        try {
          const colC = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${implantacao}'!C:C`,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          const values = colC.data.values || [];
          const targetNorm = (unidade || '').toString().normalize('NFD').replace(/[ -\u036f]/g, '').trim().toLowerCase();
          for (let i = 0; i < values.length; i++) {
            const cell = (values[i] && values[i][0]) ? values[i][0].toString() : '';
            const cellNorm = cell.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
            if (cellNorm === targetNorm) {
              resolvedRowIndex = i + 1; // sheet rows are 1-based
              break;
            }
          }
        } catch (e) {
          // non-blocking
        }
      }
    } catch (e) {
      // ignore lookup errors
    }

    const historyPayload = { message: `Novo evento: ${acao}`, row: historyRow };
    if (resolvedRowIndex) historyPayload.rowIndex = resolvedRowIndex;
    await broadcastEvent(implantacao, "historyUpdated", historyPayload);

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
          reserva_url: reserva_url || null,
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
// Supabase Realtime: Subscribe to pagamentos table and broadcast updates
// =================================================================
async function setupPagamentosRealtime() {
  if (!supabase) {
    console.warn('[REALTIME] Supabase não configurado — pulando subscription de pagamentos');
    return;
  }

  try {
    console.log('[REALTIME] Inicializando subscription para tabela pagamentos...');

    const channel = supabase
      .channel('realtime:pagamentos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagamentos' },
        async (payload) => {
          try {
            const ev = payload.event || payload.eventType || 'unknown';
            const record = payload.new || payload.record || payload;
            const status = record && record.status;
            const unidade = record && (record.unidade || record.nome_unidade || null);
            const pagamento_id = record && record.id;

            // Try to infer implantacao and rowIndex from 'unidades' table
            let implantacaoName = null;
            let rowIndex = null;
            if (unidade) {
              try {
                const resp = await supabase
                  .from('unidades')
                  .select('implantacao_id, nome_unidade')
                  .ilike('nome_unidade', `%${unidade}%`)
                  .limit(1)
                  .execute();

                let unidade_row = null;
                if (resp && resp.data) {
                  unidade_row = Array.isArray(resp.data) ? resp.data[0] : resp.data;
                }

                if (unidade_row) {
                  // rowIndex/linha/row não existem por padrão na tabela 'unidades' em muitas implantações.
                  // Mantemos apenas implantacao_id e nome_unidade; rowIndex ficará null quando não disponível.
                  const implantacao_id = unidade_row.implantacao_id;
                  if (implantacao_id) {
                    try {
                      const implResp = await supabase
                        .from('implantacoes')
                        .select('nome')
                        .eq('id', implantacao_id)
                        .limit(1)
                        .execute();
                      if (implResp && implResp.data) {
                        const implData = Array.isArray(implResp.data) ? implResp.data[0] : implResp.data;
                        implantacaoName = implData ? implData.nome : null;
                      }
                    } catch (e) {
                      // non-blocking
                    }
                  }
                }
              } catch (e) {
                // ignore
              }
            }

            const out = { unitName: unidade, pagamento_id, pagamentos_status: status };
            if (rowIndex) out.rowIndex = rowIndex;

            if (implantacaoName) {
              await broadcastEvent(implantacaoName, 'unitUpdated', out);
              console.log('[REALTIME] Broadcast pago ->', implantacaoName, out);
            } else {
              // Broadcast to all implantacoes as fallback
              for (const imp of Array.from(sseClients.keys())) {
                try {
                  await broadcastEvent(imp, 'unitUpdated', out);
                } catch (e) {
                  console.warn('[REALTIME] Falha ao broadcast para', imp, e && e.message);
                }
              }
              console.log('[REALTIME] Broadcast pago para todas implantações (fallback)', out);
            }
          } catch (err) {
            console.error('[REALTIME] Erro ao processar evento pagamentos:', err && err.message ? err.message : err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] subscription status for pagamentos channel:', status);
      });

    // Monitor subscription lifecycle
    channel.on('visibility_change', (v) => {
      console.log('[REALTIME] visibility_change:', v);
    });
  } catch (e) {
    console.error('[REALTIME] Não foi possível inicializar subscription de pagamentos:', e && e.message ? e.message : e);
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
  console.log("📊 [/api/data] Requisição recebida");
  console.log("📊 Query params:", req.query);

  const { implantacao, forceRefresh } = req.query;
  if (!implantacao) {
    console.error("📊 [/api/data] Nome da implantação não fornecido");
    return res
      .status(400)
      .json({ error: "O nome da implantação é obrigatório." });
  }

  console.log("📊 [/api/data] Buscando dados para:", implantacao);

  // Verifica cache (exceto se forceRefresh=true)
  const cacheKey = `data_${implantacao}`;
  if (!forceRefresh) {
    const cached = getCachedData(cacheKey);
    if (cached) {
      console.log("📊 [/api/data] Retornando dados do cache");
      return res.json({ ...cached, fromCache: true });
    }
  }

  // Usa pooling para evitar requisições duplicadas simultâneas
  return pooledRequest(cacheKey, async () => {
    try {
      const sheets = await getSheetsClient();
      const resolved = await resolveSheetName(
        sheets,
        SPREADSHEET_ID_IMPLANTACAO,
        implantacao
      );

      if (!resolved || !resolved.found) {
        // Se a planilha não existe, retorna dados vazios ao invés de erro 404
        console.log(
          `⚠️ [/api/data] Planilha '${implantacao}' ainda não existe (sem unidades importadas)`
        );
        return res.json({
          unidades: [],
          clientes: [],
          sheetNotFound: true,
          message: "Nenhuma unidade importada ainda para esta implantação",
        });
      }
      const sheetTitle = resolved.found;

      // Busca unidades da planilha (Google Sheets) — inclui coluna Q (implantacao_ref)
      const implantacaoRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!A:Q`,
      });

      // Busca clientes do Supabase
      let clientes = [];
      if (supabase) {
        try {
          // Primeiro encontra o ID da implantação
          let implData = null;
          try {
            implData = await findImplantacaoByName(sheetTitle);
          } catch (e) {
            console.error("[FIND_IMPLANT] erro ao localizar implantação:", e && e.message ? e.message : e);
          }

          if (implData && implData.id) {
            // Busca os clientes associados a esta implantação
            const { data: clientesData } = await supabase
              .from("clientes")
              .select("*")
              .eq("implantacao_id", implData.id);

            clientes = (clientesData || []).map((c) => [
              c.id_pre_cadastro || "",
              c.nome || "",
              c.documento || "",
              c.corretor || "",
              c.imobiliaria || "",
              c.status || "",
            ]);
          }
        } catch (e) {
          console.error("Erro ao buscar clientes do Supabase:", e);
          // Em caso de erro, retorna array vazio
        }
      }

      const responseData = {
        unidades: implantacaoRes.data.values || [],
        clientes: clientes,
      };

      // Armazena no cache
      setCachedData(cacheKey, responseData);

      res.json(responseData);
    } catch (error) {
      res.status(500).json({
        error: `Falha ao buscar dados para a implantação '${implantacao}'.`,
        details: error && error.message ? error.message : String(error),
      });
    }
  });
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
      range: `'${sheetTitle}'!A:Q`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    let unidades = implantacaoRes.data.values || [];

    if (hideAvailable === "true") {
      unidades = unidades.filter(
        (u) => u[11] && normalizeStatus(u[11]) !== "disponivel"
      );
    }

    // Busca os dados da implantação do Supabase
    let imageUrl = "";
    let imageUrlAdicional = "";
    let dotSize = 16;
    let sigla = "";

    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("imagem_url, imagem_url_adicional, dot_size, sigla")
          .eq("nome", sheetTitle)
          .limit(1)
          .single();

        if (implData) {
          imageUrl = implData.imagem_url || "";
          imageUrlAdicional = implData.imagem_url_adicional || "";
          dotSize = implData.dot_size || 16;
          sigla = implData.sigla || "";
        }
      } catch (e) {
        console.error("Erro ao buscar dados da implantação no Supabase:", e);
      }
    }

    res.json({
      unidades,
      imageUrl,
      imageUrlAdicional: imageUrlAdicional || "",
      dotSize,
      sigla,
      sheetTitle, // Nome exato da planilha para conexão SSE
    });
  } catch (error) {
    res.status(500).json({
      error: `Falha ao buscar dados para a implantação '${implantacao}'.`,
    });
  }
});

// NOVO: Endpoint de polling rápido para verificação dupla (Sheets + Supabase)
// Retorna o status da unidade do banco que responder PRIMEIRO
app.get("/api/fast-poll-unit", async (req, res) => {
  const { implantacao, rowIndex } = req.query;

  if (!implantacao || !rowIndex) {
    return res
      .status(400)
      .json({ error: "Implantação e rowIndex são obrigatórios." });
  }

  // Verifica cache recente
  const cacheKey = `poll_${implantacao}_${rowIndex}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  // Verifica rate limit para polling
  const pollKey = `poll_${implantacao}_${rowIndex}`;
  const lastPoll = rateLimitMap.get(pollKey)?.[0] || 0;
  const timeSinceLastPoll = Date.now() - lastPoll;

  if (timeSinceLastPoll < RATE_LIMIT.polling.minInterval) {
    const waitTime = RATE_LIMIT.polling.minInterval - timeSinceLastPoll;
    return res.status(429).json({
      error: "Polling muito frequente",
      retryAfter: waitTime,
      suggestion: "Use cache ou aguarde antes de fazer novo polling",
    });
  }

  // Usa pooling para evitar requisições duplicadas
  return pooledRequest(pollKey, async () => {
    try {
      // Cria duas promises que competem entre si
        const supabasePromise = (async () => {
        if (!supabase) return null;

        try {
          let implData = null;
          try {
            implData = await findImplantacaoByName(implantacao);
          } catch (e) {
            console.error("[FIND_IMPLANT] erro ao localizar implantação (fast-poll):", e && e.message ? e.message : e);
          }

          if (!implData?.id) return null;

          const { data: unitData } = await supabase
            .from("unidades")
            .select("situacao, nome_unidade, coord_x, coord_y, simbolo")
            .eq("implantacao_id", implData.id)
            .eq("row_index", parseInt(rowIndex, 10))
            .limit(1)
            .single();

          if (!unitData) return null;

          return {
            source: "supabase",
            status: unitData.situacao || "Disponível",
            unitName: unitData.nome_unidade,
            coordX: unitData.coord_x,
            coordY: unitData.coord_y,
            simbolo: unitData.simbolo || null,
            timestamp: Date.now(),
          };
        } catch (e) {
          console.error("[FAST-POLL] Erro Supabase:", e.message);
          return null;
        }
      })();

      const sheetsPromise = (async () => {
        try {
          const sheets = await getSheetsClient();
          const resolved = await resolveSheetName(
            sheets,
            SPREADSHEET_ID_IMPLANTACAO,
            implantacao
          );

          if (!resolved?.found) return null;

          const sheetTitle = resolved.found;
          const range = `'${sheetTitle}'!C${rowIndex}:N${rowIndex}`;

          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range,
          });

          const row = response.data.values?.[0];
          if (!row) return null;

          return {
            source: "sheets",
            status: row[9] || "Disponível", // Coluna L (índice 9 no range C:N)
            unitName: row[0] || "", // Coluna C
            coordX: row[10] || "", // Coluna M
            coordY: row[11] || "", // Coluna N
            timestamp: Date.now(),
          };
        } catch (e) {
          console.error("[FAST-POLL] Erro Sheets:", e.message);
          return null;
        }
      })();

      // Promise.race retorna o primeiro que resolver (mais rápido)
      const fastestResult = await Promise.race([
        supabasePromise,
        sheetsPromise,
      ]);

      // Aguarda ambos para comparação (mas não bloqueia resposta)
      Promise.allSettled([supabasePromise, sheetsPromise]).then((results) => {
        const [supabaseResult, sheetsResult] = results;

        if (
          supabaseResult.status === "fulfilled" &&
          sheetsResult.status === "fulfilled"
        ) {
          const supabaseData = supabaseResult.value;
          const sheetsData = sheetsResult.value;

          if (supabaseData && sheetsData) {
            const statusMatch = supabaseData.status === sheetsData.status;
            if (!statusMatch) {
              console.warn(
                `[FAST-POLL] DIVERGÊNCIA detectada na linha ${rowIndex}:`,
                `Supabase="${supabaseData.status}" vs Sheets="${sheetsData.status}"`
              );
            }
          }
        }
      });

      if (!fastestResult) {
        return res
          .status(404)
          .json({ error: "Unidade não encontrada em nenhum banco." });
      }

      // Armazena no cache
      setCachedData(cacheKey, fastestResult);

      // Registra como mudança potencial se o status mudou
      const oldCached = dataCache.get(cacheKey);
      if (oldCached && oldCached.data.status !== fastestResult.status) {
        registerChange(implantacao);
        console.log(
          `[FAST-POLL] Mudança detectada em ${implantacao}/${rowIndex}: ${oldCached.data.status} → ${fastestResult.status}`
        );
      }

      res.json(fastestResult);
    } catch (error) {
      console.error("[FAST-POLL] Erro:", error);
      res.status(500).json({ error: "Falha no polling rápido." });
    }
  });
});

// Endpoint para obter informações sobre o intervalo de polling recomendado
app.get("/api/polling-config", async (req, res) => {
  const { implantacao } = req.query;

  if (!implantacao) {
    return res.status(400).json({ error: "Implantação é obrigatória." });
  }

  const recommendedInterval = getAdaptiveInterval(implantacao);
  const tracker = changeTracker.get(implantacao);

  res.json({
    implantacao,
    recommendedInterval,
    minInterval: RATE_LIMIT.polling.minInterval,
    cacheEnabled: true,
    cacheTTL: CACHE_TTL,
    recentChanges: tracker
      ? {
          lastChange: tracker.lastChange,
          changeCount: tracker.changeCount,
          timeSinceLastChange: Date.now() - tracker.lastChange,
        }
      : null,
    rateLimits: {
      sheets: `${RATE_LIMIT.sheets.maxRequests} req/${
        RATE_LIMIT.sheets.windowMs / 1000
      }s`,
      supabase: `${RATE_LIMIT.supabase.maxRequests} req/${
        RATE_LIMIT.supabase.windowMs / 1000
      }s`,
      polling: `1 req/${RATE_LIMIT.polling.minInterval / 1000}s por unidade`,
    },
  });
});

app.get("/api/implantacoes", verifyToken, async (req, res) => {
  try {
    console.log("[/api/implantacoes] Iniciando busca de implantações...");

    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    const { data: implantacoes, error } = await supabase
      .from("implantacoes")
      .select(
        "id, nome, imagem_url, imagem_url_adicional, dot_size, endereco, logo_url, cvcrm_id, sigla, cidade, estado"
      )
      .order("nome", { ascending: true });

    if (error) {
      console.error("[/api/implantacoes] Erro Supabase:", error);
      return res.status(500).json({
        error: "Falha ao buscar lista de implantações.",
        details: error.message,
      });
    }

    const result = (implantacoes || []).map((impl) => ({
      id: impl.id,
      nome: impl.nome,
      url: impl.imagem_url,
      imagem_url_adicional: impl.imagem_url_adicional || null,
      imagemUrlAdicional: impl.imagem_url_adicional || null,
      tamanhoPonto: impl.dot_size || 16,
      endereco: impl.endereco || "Endereço não informado",
      logoUrl: impl.logo_url || "/logo-uni.png",
      cvcrmId: impl.cvcrm_id || null,
      sigla: impl.sigla || null,
      cidade: impl.cidade || null,
      estado: impl.estado || null,
    }));

    console.log("[/api/implantacoes] Busca concluída. Total:", result.length);
    res.json(result);
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

// CORREÇÃO: Este endpoint agora lê do Supabase.
app.get("/api/config", verifyToken, async (req, res) => {
  try {
    console.log("[/api/config] Iniciando busca de configurações...");

    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    const { data: configRows, error } = await supabase
      .from("config")
      .select("key, value")
      .neq("key", "implantacaoAtual"); // Não retorna mais essa chave (sessão por usuário)

    if (error) {
      console.error("[/api/config] Erro Supabase:", error);
      return res.status(500).json({
        error: "Falha ao buscar configurações.",
        details: error.message,
      });
    }

    const config = (configRows || []).reduce((acc, row) => {
      if (row.key) {
        acc[row.key] = row.value;
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

// REMOVIDO: Endpoint /api/update-config não é mais necessário
// A implantação atual agora é armazenada no localStorage de cada usuário

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

// Serve a página fullscreen estática (procura caminhos possíveis entre ambientes)
app.get("/fullscreen", (req, res) => {
  const p = require("path");
  const fs = require("fs");

  const candidates = [
    p.resolve(__dirname, "../public/fullscreen.html"),
    p.resolve(__dirname, "../../frontend/public/fullscreen.html"),
    p.resolve(process.cwd(), "frontend", "public", "fullscreen.html"),
    p.resolve(process.cwd(), "public", "fullscreen.html"),
  ];

  const found = candidates.find((c) => {
    try {
      return fs.existsSync(c);
    } catch (e) {
      return false;
    }
  });

  if (found) {
    return res.sendFile(found);
  }

  console.error("/fullscreen: nenhum arquivo fullscreen.html encontrado. Candidates:", candidates);
  return res.status(404).send(
    "Fullscreen não encontrado no servidor. Verifique configuração de caminhos (procure em frontend/public/fullscreen.html)."
  );
});

// Rota útil: redireciona para a fullscreen da implantação atual definida em Config
app.get("/fullscreen/current", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).send("Supabase não configurado.");
    }

    // Busca a chave implantacaoAtual do Supabase
    const { data: configData, error } = await supabase
      .from("config")
      .select("value")
      .eq("key", "implantacaoAtual")
      .limit(1)
      .single();

    if (error || !configData || !configData.value) {
      return res.status(404).send("implantacaoAtual não encontrada na Config.");
    }

    const implantacaoAtual = configData.value;
    const encoded = encodeURIComponent(implantacaoAtual);
    return res.redirect(`/fullscreen?implantacao=${encoded}`);
  } catch (error) {
    console.error("Erro ao buscar implantacaoAtual:", error);
    return res.status(500).send("Erro ao buscar implantação atual.");
  }
});

// DEBUG: retorna o client_email do credentials.json e os títulos das abas do spreadsheet solicitado
// ==============================================================
// ENDPOINTS DE DEBUG: LISTAR / BAIXAR SCREENSHOTS (PROTEGIDOS)
// Requer que o backend tenha acesso ao diretório de screenshots
// (ex.: mesmo volume do worker montado no backend via docker-compose).
// ==============================================================
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.resolve(__dirname, "../worker/screenshots");

app.get("/api/debug/screenshots", verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "200", 10) || 200, 1000);
    if (!fs.existsSync(SCREENSHOT_DIR)) return res.json({ screenshots: [] });

    const files = await fs.promises.readdir(SCREENSHOT_DIR);
    const images = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      const full = path.join(SCREENSHOT_DIR, file);
      try {
        const stat = await fs.promises.stat(full);
        images.push({ file, size: stat.size, mtime: stat.mtime.getTime() });
      } catch (e) {
        // ignora arquivos que mudaram durante a leitura
      }
    }
    images.sort((a, b) => b.mtime - a.mtime);
    return res.json({ screenshots: images.slice(0, limit), dir: SCREENSHOT_DIR });
  } catch (err) {
    console.error('[DEBUG/SCRNSHT] erro listando screenshots', err);
    return res.status(500).json({ error: 'erro interno' });
  }
});

app.get("/api/debug/screenshots/:name", verifyToken, async (req, res) => {
  try {
    const name = sanitizeFilename(req.params.name);
    const full = path.join(SCREENSHOT_DIR, name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
    return res.download(full, name);
  } catch (err) {
    console.error('[DEBUG/SCRNSHT] erro servindo screenshot', err);
    return res.status(500).json({ error: 'erro interno' });
  }
});
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
  const userEmail = req.user?.email || "Sistema";

  if (!implantacao || !rowIndex || !reservationToken) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para reserva temporária." });
  }

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

      // Verifica se já existe reserva para esta unidade
      const existingReservation = tempReservations.get(tempReservationKey);
      if (existingReservation && Date.now() < existingReservation.expiresAt) {
        return res.status(409).json({
          error: `Esta unidade já está sendo reservada por outro usuário.`,
          code: "UNIT_BEING_RESERVED",
        });
      }

      const unitCheckRange = `'${sheetTitle}'!L${rowIndex}`;
      const unitCheckResult = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: unitCheckRange,
      });

      const rawStatus = unitCheckResult.data.values?.[0]?.[0] || "Disponível";
      const currentStatus = normalizeStatus(rawStatus);

      if (currentStatus !== "disponivel") {
        return res.status(409).json({
          error: `Esta unidade não está mais Disponível. Status atual: ${rawStatus}.`,
          code: "UNIT_NOT_AVAILABLE",
        });
      }

      // OPERAÇÃO ATÔMICA: Marca como RESERVANDO e armazena token ANTES de responder
      // Armazena o token de reserva temporária (em memória por 60 segundos)
      tempReservations.set(tempReservationKey, {
        token: reservationToken,
        userEmail,
        unitName,
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000, // 60 segundos
      });

      // Marca a unidade como "RESERVANDO" temporariamente
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!L${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [["RESERVANDO"]] },
      });

      console.log(
        `[RESERVE-TEMP] Reserva criada: ${tempReservationKey} por ${userEmail}`
      );

      return res.json({
        success: true,
        message: "Reserva temporária criada com sucesso.",
        reservationToken,
        expiresIn: 60000,
      });
    } catch (error) {
      lastError = error;
      console.error(
        `[RESERVE-TEMP] Tentativa ${attempt + 1}/${maxRetries} falhou:`,
        error
      );

      // Se não for a última tentativa, aguarda antes de tentar novamente
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1))
        );
      }
    }
  }

  console.error("[RESERVE-TEMP] Todas as tentativas falharam:", lastError);
  res.status(500).json({
    error: "Falha ao criar reserva temporária após múltiplas tentativas.",
  });
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
  const userEmail = req.user?.email || "Sistema";

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

    // Acquire lock for this row to avoid concurrent confirms/cancels
    const lockKey = `${sheetTitle}:${rowIndex}`;
    const lockOwner = reservationToken;
    const gotLock = await acquireLock(lockKey, lockOwner, 15000);
    if (!gotLock) {
      return res.status(409).json({ error: "Unidade em operação por outro usuário.", code: "UNIT_LOCKED" });
    }

    try {
      // Remove a reserva temporária
      tempReservations.delete(tempReservationKey);

      // Verifica novamente se a unidade ainda está Disponível
    const unitCheckRange = `'${sheetTitle}'!L${rowIndex}`;
    const unitCheckResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitCheckRange,
    });

    const rawStatus = unitCheckResult.data.values?.[0]?.[0] || "Disponível";
    const currentStatus = normalizeStatus(rawStatus);

    if (currentStatus !== "reservando" && currentStatus !== "disponivel") {
      return res.status(409).json({
        error: `Esta unidade não está mais Disponível. Status atual: ${rawStatus}.`,
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
          // Build payload: o array data[] representa G:L (5 colunas + situacao)
          const payload = {
            id_pre_cadastro: data[0] || null, // G: ID Pré-Cadastro (índice 0 do array data)
            cliente: data[1] || clientName || null, // H: Cliente (índice 1 do array data)
            documento: data[2] || null, // I: Documento (índice 2 do array data)
            corretor: data[3] || null, // J: Corretor (índice 3 do array data)
            imobiliaria: data[4] || null, // K: Imobiliária (índice 4 do array data)
            situacao: "Reservada", // L: Situação - CRÍTICO para SSE
            implantacao_id,
            nome_unidade:
              unitName || (existingUnit && existingUnit.nome_unidade) || null,
          };

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

          // ATUALIZAÇÃO DE PIX (SALDO): Transfere o histórico de PIX para a nova unidade
          // Isso garante que o saldo acompanhe o cliente mesmo se ele trocar de unidade ou cancelar/reservar
          if (payload.cliente && unitFullName) {
            let clientNameForPix = payload.cliente;

            // Se o nome do cliente parece ser um ID (número), tenta resolver o nome real na tabela de clientes
            if (/^\d+$/.test(clientNameForPix)) {
              const { data: clientData } = await supabase
                .from('clientes')
                .select('nome')
                .eq('id_pre_cadastro', clientNameForPix)
                .maybeSingle();
              
              if (clientData && clientData.nome) {
                clientNameForPix = clientData.nome;
              }
            }

            // Atualiza a unidade nos registros de PIX deste cliente
            const { error: pixUpdateError } = await supabase
              .from('historico_pix')
              .update({ unidade: unitFullName })
              .eq('implantacao_id', implantacao_id)
              .eq('cliente', clientNameForPix)
              .neq('unidade', unitFullName); // Move apenas o que não está na unidade atual

            if (pixUpdateError) {
              console.error("[SUPABASE] Erro ao transferir PIX na reserva:", pixUpdateError);
            }
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

    // Responde IMEDIATAMENTE ao cliente (não bloqueia)
    res.json({ success: true, message: `Reserva atualizada.` });

    // MIGRAÇÃO SSE → SUPABASE: Broadcast e sync em background (não bloqueantes)
    if (supabaseOk) {
      // Broadcast + Sync em background (fire-and-forget)
      (async () => {
        try {
          // Busca os dados completos da unidade do Supabase para o broadcast
          const { data: implData } = await supabase
            .from("implantacoes")
            .select("id")
            .eq("nome", sheetTitle)
            .limit(1)
            .single();

          if (implData?.id) {
            const { data: unitDataFromSupabase } = await supabase
              .from("unidades")
              .select("*")
              .eq("implantacao_id", implData.id)
              .eq("row_index", parseInt(rowIndex, 10))
              .limit(1)
              .single();

                  if (unitDataFromSupabase) {
              // Converte dados do Supabase para formato array
              const unitDataArray = supabaseUnitToArray(unitDataFromSupabase);

                    // Broadcast IMEDIATO com dados do Supabase (não espera Sheets)
                    await broadcastEvent(sheetTitle, "unitUpdated", {
                      rowIndex,
                      unitName,
                      unitData: unitDataArray,
                      changeType: "reserve",
                      actor: userEmail,
                      ts: Date.now(),
                    });
              console.log(
                `[SSE] Broadcast de reserva enviado para linha ${rowIndex}`
              );
            }
          }
        } catch (e) {
          console.warn(
            "[SSE] Falha ao buscar dados do Supabase para broadcast:",
            e.message
          );
          // Fallback: broadcast sem dados (busca do Sheets)
          try {
            await broadcastEvent(sheetTitle, "unitUpdated", {
              rowIndex,
              unitName,
              changeType: "reserve",
              actor: userEmail,
              ts: Date.now(),
            });
          } catch (err) {
            console.error("[SSE] Falha no broadcast fallback:", err.message);
          }
        }

        // Sync com Sheets em background
        try {
          const dataWithStatus = [...data, "Reservada"];
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            range: `'${sheetTitle}'!G${rowIndex}:L${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [dataWithStatus] },
          });
          console.log(
            `[SHEETS] Sync background concluído para reserva na linha ${rowIndex}`
          );
        } catch (e) {
          console.error(
            `[SHEETS] Falha no sync background da reserva:`,
            e.message
          );
        }
      })();

      // release lock for this confirm operation
      try {
        await releaseLock(lockKey, lockOwner);
      } catch (e) {
        console.warn("[LOCK] falha ao liberar lock (confirm-reservation):", e && e.message ? e.message : e);
      }

      return;
    }

    // --- Fallback para Google Sheets se o Supabase falhou ---
    const dataWithStatus = [...data, "Reservada"];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!G${rowIndex}:L${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [dataWithStatus] },
    });

    await broadcastEvent(sheetTitle, "unitUpdated", { rowIndex, unitName });

    const unidadeInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!C${rowIndex}:C${rowIndex}`,
    });
    unitFullName = `${unidadeInfo.data.values[0][0]}`;

    res.json({
      success: true,
      message: `Reserva atualizada (via fallback).`,
    });

    // release lock for this confirm operation (fallback path)
    try {
      await releaseLock(lockKey, lockOwner);
    } catch (e) {
      console.warn("[LOCK] falha ao liberar lock (confirm-reservation fallback):", e && e.message ? e.message : e);
    }
  } catch (error) {
    try {
      if (typeof lockKey !== 'undefined' && typeof lockOwner !== 'undefined') {
        await releaseLock(lockKey, lockOwner);
      }
    } catch (e) {
      // ignore
    }
    res.status(500).json({ error: "Falha ao processar a reserva." });
  }
 } catch (error) {
    console.error(`[HISTÓRICO] Erro ao adicionar entrada:`, error.message || error);
  }
});

// Endpoint para cancelar uma reserva temporária
app.post("/api/cancel-temp-reservation", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, reservationToken } = req.body;
  const userEmail = req.user?.email || "Sistema";

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
    // Acquire lock for this cancel-temp operation
    const lockKey = `${sheetTitle}:${rowIndex}`;
    const lockOwner = reservationToken;
    const gotLock = await acquireLock(lockKey, lockOwner, 15000);
    if (!gotLock) {
      return res.status(409).json({ error: "Unidade em operação por outro usuário.", code: "UNIT_LOCKED" });
    }

    try {
      // Remove a reserva temporária
      tempReservations.delete(tempReservationKey);

      // Verifica o status atual antes de reverter
    const statusCheck = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!L${rowIndex}`,
    });

    const currentStatus = statusCheck.data.values?.[0]?.[0] || "";
    const normalized = normalizeStatus(currentStatus);

    // Só reverte se ainda estiver "RESERVANDO"
    if (normalized === "reservando") {
      // Restaura o status da unidade para Disponível
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!L${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [["Disponível"]] },
      });

      // Notifica outros clientes sobre a mudança (inclui metadata)
      await broadcastEvent(sheetTitle, "unitUpdated", {
        rowIndex,
        unitName: tempReservation.unitName,
        changeType: "cancel-temp",
        actor: tempReservation.userEmail,
        ts: Date.now(),
      });

      console.log(`[CANCEL-TEMP] Reserva cancelada: ${tempReservationKey}`);
    } else {
      console.log(
        `[CANCEL-TEMP] Unidade ${tempReservationKey} já está como '${currentStatus}', não será revertida.`
      );
    }
    res.json({
      success: true,
      message: "Reserva temporária cancelada com sucesso.",
    });
    // release lock
    try { await releaseLock(lockKey, lockOwner); } catch (e) {}
    
  } catch (error) {
    console.error("Erro ao cancelar reserva temporária:", error);
    try { if (typeof lockKey !== 'undefined' && typeof lockOwner !== 'undefined') await releaseLock(lockKey, lockOwner); } catch (e) {}
    res.status(500).json({ error: "Falha ao cancelar reserva temporária." });
  }
 } catch (error) {
    console.error(`[HISTÓRICO] Erro ao adicionar entrada:`, error.message || error);
  }
});

// Endpoint para RESERVA ESPONTÂNEA
app.post("/api/spontaneous-update", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, unitName, manualData, hideAvailable } =
    req.body;
  const userEmail = req.user?.email || "Sistema";
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

    // VERIFICAÇÃO PRÉVIA: Checa se a unidade ainda está Disponível
    const unitCheckRange = `'${sheetTitle}'!K${rowIndex}`;
    const unitCheckResult = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: unitCheckRange,
    });

    const rawStatus = unitCheckResult.data.values?.[0]?.[0] || "Disponível";
    const currentStatus = normalizeStatus(rawStatus);

    if (currentStatus !== "disponivel") {
      return res.status(409).json({
        error: `Esta unidade não está mais Disponível. Status atual: ${rawStatus}.`,
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
            situacao: "Reservada",
            implantacao_id,
            nome_unidade:
              unitName || (existingUnit && existingUnit.nome_unidade) || null,
          };

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

          // ATUALIZAÇÃO DE PIX (SALDO) - Reserva Espontânea
          if (payload.cliente && unitFullName) {
            let clientNameForPix = payload.cliente;

            // Resolve ID -> Nome
            if (/^\d+$/.test(clientNameForPix)) {
              const { data: clientData } = await supabase
                .from('clientes')
                .select('nome')
                .eq('id_pre_cadastro', clientNameForPix)
                .maybeSingle();
              
              if (clientData && clientData.nome) {
                clientNameForPix = clientData.nome;
              }
            }

            const { error: pixUpdateError } = await supabase
              .from('historico_pix')
              .update({ unidade: unitFullName })
              .eq('implantacao_id', implantacao_id)
              .eq('cliente', clientNameForPix)
              .neq('unidade', unitFullName);

            if (pixUpdateError) console.error("[SUPABASE] Erro ao transferir PIX (Espontânea):", pixUpdateError);
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
            "Reservada",
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
      "Reservada",
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
  const userEmail = req.user?.email || "Sistema"; // Declaração no escopo principal da função

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
    // Acquire per-row lock to avoid concurrent cancels/reserves
    const lockKey = `${sheetTitle}:${unitRowIndex}`;
    const lockOwner = userEmail;
    const gotLock = await acquireLock(lockKey, lockOwner, 15000);
    if (!gotLock) {
      return res.status(409).json({ error: "Unidade em operação por outro usuário.", code: "UNIT_LOCKED" });
    }
    if (supabase) {
      try {
        const { data: implData } = await supabase // Usa o nome completo resolvido
          .from("implantacoes")
          .select("id")
          .eq("nome", sheetTitle)
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
            const { error: updateError } = await supabase
              .from("unidades")
              .update({
                id_pre_cadastro: null,
                cliente: null,
                documento: null,
                corretor: null,
                imobiliaria: null,
                situacao: "Disponível", // CRÍTICO para SSE
              })
              .eq("id", existingUnit.id);

            if (updateError) {
              console.error(
                "[CANCELAMENTO] Erro ao atualizar unidade no Supabase:",
                updateError
              );
              supabaseOk = false;
            } else {
              supabaseOk = true;
              
              // CORREÇÃO: Marcar pagamentos associados como cancelados
              try {
                await supabase
                  .from("pagamentos")
                  .update({ status: "cancelado" })
                  .eq("unidade", unitFullName)
                  .eq("implantacao", sheetTitle);
                console.log(`[CANCELAMENTO] Pagamentos da unidade ${unitFullName} marcados como cancelados`);
              } catch (payErr) {
                console.error("[CANCELAMENTO] Erro ao cancelar pagamentos:", payErr);
              }
            }
          } else {
            // Se a unidade não existe no Supabase (pode acontecer se a sincronização falhou antes),
            // não há o que cancelar no banco, mas o fallback para o Sheets ainda é importante.
            console.warn(
              `[CANCELAMENTO] Unidade com rowIndex ${unitRowIndex} não encontrada no Supabase para a implantação '${sheetTitle}'. Procedendo com fallback para Sheets.`
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
        }
      } catch (e) {
        console.error(
          "Supabase: erro ao persistir cancelamento:",
          e.message || e
        );
        supabaseOk = false;
      }
    }

    // Responde IMEDIATAMENTE ao cliente (não bloqueia)
    res.json({
      success: true,
      message: `Cancelamento efetuado com sucesso${
        !supabaseOk ? " (via fallback)" : ""
      }`,
    });

    // MIGRAÇÃO SSE → SUPABASE: Broadcast e sync em background (não bloqueantes)
    (async () => {
      let broadcastSuccess = false;

      if (supabase) {
        try {
          const { data: implData } = await supabase
            .from("implantacoes")
            .select("id")
            .eq("nome", sheetTitle)
            .limit(1)
            .single();

          if (implData?.id) {
            const { data: unitDataFromSupabase } = await supabase
              .from("unidades")
              .select("*")
              .eq("implantacao_id", implData.id)
              .eq("row_index", parseInt(unitRowIndex, 10))
              .limit(1)
              .single();

            if (unitDataFromSupabase) {
              // Converte dados do Supabase para formato array
              const unitDataArray = supabaseUnitToArray(unitDataFromSupabase);

              // Broadcast IMEDIATO com dados do Supabase (inclui metadata)
              await broadcastEvent(sheetTitle, "unitUpdated", {
                rowIndex: unitRowIndex,
                unitName: unitFullName || unitDataFromSupabase.nome_unidade,
                unitData: unitDataArray,
                changeType: "cancel",
                actor: userEmail,
                ts: Date.now(),
              });

              console.log(
                `[SSE] Broadcast de cancelamento enviado via Supabase para linha ${unitRowIndex}`
              );
              broadcastSuccess = true;
            }
          }
        } catch (e) {
          console.warn(
            "[SSE] Falha ao buscar dados do Supabase para broadcast do cancelamento:",
            e.message
          );
        }
      }

      // Fallback: Broadcast sem dados do Supabase (busca do Sheets)
      if (!broadcastSuccess) {
        try {
          await broadcastEvent(sheetTitle, "unitUpdated", {
            rowIndex: unitRowIndex,
            unitName: unitFullName,
            changeType: "cancel",
            actor: userEmail,
            ts: Date.now(),
          });
          console.log(
            `[SSE] Broadcast de cancelamento enviado via fallback (Sheets) para linha ${unitRowIndex}`
          );
        } catch (err) {
          console.error("[SSE] Falha no broadcast fallback:", err.message);
        }
      }

      // Sync com Sheets em background
      if (supabaseOk) {
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            resource: {
              valueInputOption: "USER_ENTERED",
              data: [
                {
                  range: `'${sheetTitle}'!G${unitRowIndex}:L${unitRowIndex}`,
                  values: [["", "", "", "", "", "Disponível"]],
                },
              ],
            },
          });
          console.log(
            `[SHEETS] Sync background concluído para cancelamento na linha ${unitRowIndex}`
          );
        } catch (e) {
          console.error(
            `[SHEETS] Falha no sync background do cancelamento:`,
            e.message
          );
        }
      } else {
        // fallback to Sheets (legacy)
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
            resource: {
              valueInputOption: "USER_ENTERED",
              data: [
                {
                  range: `'${sheetTitle}'!G${unitRowIndex}:L${unitRowIndex}`,
                  values: [["", "", "", "", "", "Disponível"]],
                },
              ],
            },
          });
          console.log(
            `[SHEETS] Fallback sync concluído para linha ${unitRowIndex}`
          );
        } catch (e) {
          console.error(`[SHEETS] Falha no fallback sync:`, e.message);
        }
      }

      // Tentar notificar o CVCRM para cancelar a reserva associada (não bloqueante)
      (async () => {
        try {
          let reservaId = null;
          try {
            const pagResp = await supabase
              .from('pagamentos')
              .select('id, reserva_id')
              .ilike('unidade', `%${unitFullName}%`)
              .order('data_processamento', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pagResp && pagResp.data && pagResp.data.reserva_id) reservaId = pagResp.data.reserva_id;
          } catch (e) {}

          if (!reservaId) {
            try {
              const histResp = await supabase
                .from('historico')
                .select('reserva_url, acao')
                .ilike('unidade_nome', `%${unitFullName}%`)
                .order('timestamp_iso', { ascending: false })
                .limit(5);
              if (histResp && histResp.data && Array.isArray(histResp.data)) {
                for (const h of histResp.data) {
                  if (h && h.reserva_url) {
                    const m = (h.reserva_url || "").match(/reservas\/(\d+)/);
                    if (m) { reservaId = m[1]; break; }
                  }
                  if (h && h.acao && h.acao.toString().toLowerCase().includes('reserva processad')) {
                    if (h.reserva_url) {
                      const m = (h.reserva_url || "").match(/reservas\/(\d+)/);
                      if (m) { reservaId = m[1]; break; }
                    }
                  }
                }
              }
            } catch (e) {}
          }

          if (reservaId) {
            try {
              const headers = {
                accept: 'application/json',
                'content-type': 'application/json',
                email: 'tech@vcaconstrutora.com.br',
                token: '00501c7d41012e83bdd763c09125a6d995924e61',
              };
              const payload = { idreserva_cv: String(reservaId) };
              console.log('[CVCRM] Request headers:', headers);
              console.log('[CVCRM] Request payload:', payload);
              const resp = await fetch('https://vca.cvcrm.com.br/api/v1/comercial/reservas/cancelar-reserva', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
              });
              let respText = await resp.text();
              let respBody;
              try { respBody = JSON.parse(respText); } catch (err) { respBody = respText; }
              console.log(`[CVCRM] Cancel request sent for reserva ${reservaId} - status ${resp.status} - body:`, respBody);
            } catch (e) {
              console.warn('[CVCRM] Falha ao chamar API de cancelamento:', e && e.message ? e.message : e);
            }
          }
        } catch (e) {
          // non-blocking
        }
      })();
      // release per-row lock after background work
      try {
        await releaseLock(lockKey, lockOwner);
      } catch (e) {
        console.warn('[LOCK] falha ao liberar lock (cancel-reservation):', e && e.message ? e.message : e);
      }
    })();
  } catch (error) {
    console.error("Erro ao cancelar a reserva:", error);
    try { if (typeof lockKey !== 'undefined' && typeof lockOwner !== 'undefined') await releaseLock(lockKey, lockOwner); } catch (e) {}
    res.status(500).json({ error: "Falha ao cancelar a reserva." });
  }
});

// NOVO: Endpoint para TROCAR unidade
app.post("/api/change-unit", verifyToken, async (req, res) => {
  const { implantacao, oldUnitIndex, newUnitIndex } = req.body;
  const userEmail = req.user?.email || "Sistema";

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
      `'${sheetTitle}'!G${oldRow}:O${oldRow}`, // Dados da unidade antiga (G:O)
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

    // 2. Preparar dados para atualização (G:O)
    const dataToTransfer = [
      oldUnitData[0] || "", // G: id_pre_cadastro (índice 0)
      oldUnitData[1] || "", // H: cliente (índice 1)
      oldUnitData[2] || "", // I: documento (índice 2)
      oldUnitData[3] || "", // J: corretor (índice 3)
      oldUnitData[4] || "", // K: imobiliária (índice 4)
      "Reservada", // L: situação (será forçada como Reservada)
      "", // M: coord_x (não transferir) - Limpa na nova unidade
      "", // N: coord_y (não transferir) - Limpa na nova unidade
      oldUnitData[8] || "", // O: IDENTIFICADOR (índice 8)
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: [
              // Limpa dados da unidade antiga e a torna Disponível (G:L e O:O)
          {
            range: `'${sheetTitle}'!G${oldRow}:L${oldRow}`,
            values: [["", "", "", "", "", "Disponível"]],
          },
          {
            range: `'${sheetTitle}'!O${oldRow}:O${oldRow}`,
            values: [[""]],
          },
          // Transfere dados para a nova unidade preservando coordenadas (M:N)
          {
            range: `'${sheetTitle}'!G${newRow}:L${newRow}`,
            values: [
              [
                dataToTransfer[0], // G: id_pre_cadastro
                dataToTransfer[1], // H: cliente
                dataToTransfer[2], // I: documento
                dataToTransfer[3], // J: corretor
                dataToTransfer[4], // K: imobiliária
                dataToTransfer[5], // L: situação
              ],
            ],
          },
          {
            range: `'${sheetTitle}'!O${newRow}:O${newRow}`,
            values: [[dataToTransfer[8]]],
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

    // 4.5. Persistir a troca no Supabase (limpar unidade antiga e transferir para nova)
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", sheetTitle)
          .limit(1)
          .single();

        if (implData?.id) {
          const implantacao_id = implData.id;

          // Limpa a unidade antiga (torna Disponível)
          await supabase
            .from("unidades")
            .update({
              id_pre_cadastro: null,
              cliente: null,
              documento: null,
              corretor: null,
              imobiliaria: null,
              situacao: "Disponível",
            })
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", oldRow);

          // Transfere dados para a nova unidade (torna Reservada)
          await supabase
            .from("unidades")
            .update({
              id_pre_cadastro: dataToTransfer[0] || null,
              cliente: dataToTransfer[1] || null,
              documento: dataToTransfer[2] || null,
              corretor: dataToTransfer[3] || null,
              imobiliaria: dataToTransfer[4] || null,
              situacao: "Reservada",
            })
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", newRow);

          // ATUALIZAÇÃO DE PIX: Transfere o histórico de PIX para a nova unidade
          // Isso garante que o saldo acompanhe o cliente
          let clientNameForPix = dataToTransfer[1];

          // Se o nome do cliente parece ser um ID (número), tenta resolver o nome real na tabela de clientes
          // pois o historico_pix geralmente salva o Nome e não o ID.
          if (clientNameForPix && /^\d+$/.test(clientNameForPix)) {
            const { data: clientData } = await supabase
              .from('clientes')
              .select('nome')
              .eq('id_pre_cadastro', clientNameForPix)
              .maybeSingle();
            
            if (clientData && clientData.nome) {
              clientNameForPix = clientData.nome;
            }
          }

          if (clientNameForPix) {
            const { error: pixUpdateError } = await supabase
              .from('historico_pix')
              .update({ unidade: newUnitName })
              .eq('implantacao_id', implantacao_id)
              .eq('cliente', clientNameForPix)
              .eq('unidade', oldUnitName);

            if (pixUpdateError) {
              console.error("[SUPABASE] Erro ao transferir PIX:", pixUpdateError);
            }
          }
          // --- Tentar cancelar reserva no CVCRM para a unidade antiga e enfileirar job para nova unidade ---
          (async () => {
            try {
              // 1) tentar obter reserva_id do historico ou pagamentos para a unidade antiga
              let reservaId = null;
              try {
                const pagResp = await supabase
                  .from('pagamentos')
                  .select('id, reserva_id')
                  .ilike('unidade', `%${oldUnitName}%`)
                  .order('data_processamento', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (pagResp && pagResp.data && pagResp.data.reserva_id) reservaId = pagResp.data.reserva_id;
              } catch (e) {}

              if (!reservaId) {
                try {
                  const histResp = await supabase
                    .from('historico')
                    .select('reserva_url, acao')
                    .ilike('unidade_nome', `%${oldUnitName}%`)
                    .order('timestamp_iso', { ascending: false })
                    .limit(5);
                  if (histResp && histResp.data && Array.isArray(histResp.data)) {
                    for (const h of histResp.data) {
                      if (h && h.reserva_url) {
                        const m = (h.reserva_url || "").match(/reservas\/(\d+)/);
                        if (m) { reservaId = m[1]; break; }
                      }
                    }
                  }
                } catch (e) {}
              }

              if (reservaId) {
                try {
                  const headers = {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    email: 'tech@vcaconstrutora.com.br',
                    token: '00501c7d41012e83bdd763c09125a6d995924e61',
                  };
                  const payload = { idreserva_cv: String(reservaId) };
                  console.log('[CVCRM] Request headers (change-unit):', headers);
                  console.log('[CVCRM] Request payload (change-unit):', payload);
                  const resp = await fetch('https://vca.cvcrm.com.br/api/v1/comercial/reservas/cancelar-reserva', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify(payload),
                    });
                    let respText = await resp.text();
                    let respBody;
                    try { respBody = JSON.parse(respText); } catch (err) { respBody = respText; }
                    console.log(`[CVCRM] Cancel request sent for reserva ${reservaId} (change-unit) - status ${resp.status} - body:`, respBody);
                  } catch (e) {
                    console.warn('[CVCRM] Falha ao chamar API de cancelamento (change-unit):', e && e.message ? e.message : e);
                  }
              }

              // 2) Tentar clonar pagamento existente para nova unidade e enfileirar job
              try {
                const pagExisting = await supabase
                  .from('pagamentos')
                  .select('*')
                  .ilike('unidade', `%${oldUnitName}%`)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (pagExisting && pagExisting.data && pagExisting.data.id) {
                  const oldPag = pagExisting.data;
                  const { data: newPag, error: newPagErr } = await supabase.from('pagamentos').insert({
                    cliente_id: oldPag.cliente_id || null,
                    unidade: newUnitName,
                    valor_total: oldPag.valor_total || oldPag.valorTotal || null,
                    valor_unidade: oldPag.valor_unidade || oldPag.valorUnidade || null,
                    valor_pix: oldPag.valor_pix || oldPag.valorPix || null,
                    valor_dinheiro: oldPag.valor_dinheiro || oldPag.valorDinheiro || null,
                    valor_cartao: oldPag.valor_cartao || oldPag.valorCartao || null,
                    valor_cheque: oldPag.valor_cheque || oldPag.valorCheque || null,
                    tipo_pagamento: oldPag.tipo_pagamento || oldPag.tipoPagamento || 'presencial',
                    tipo_venda: oldPag.tipo_venda || oldPag.tipoVenda || null,
                    plano_padrao: oldPag.plano_padrao || oldPag.planoPadrao || null,
                    dia_vencimento: oldPag.dia_vencimento || oldPag.diaVencimento || null,
                    status: 'pendente',
                    created_at: new Date().toISOString()
                  }).select().single();

                  if (!newPagErr && newPag && newPag.id) {
                    // enqueue job
                    try {
                      const jobPayload = { pagamento_id: newPag.id, implantacao: sheetTitle, timestamp: Date.now() };
                      await redis.lpush('fila_reservas', JSON.stringify(jobPayload));
                      console.log(`[API] Transfer job enqueued for pagamento ${newPag.id}`);
                    } catch (e) {
                      console.warn('[API] Falha ao enfileirar job de transferência:', e && e.message ? e.message : e);
                    }
                  }
                }
              } catch (e) {}
            } catch (e) {
              // non-blocking
            }
          })();

          console.log(
            `[SUPABASE] Troca de unidade persistida: ${oldUnitName} (linha ${oldRow}) -> ${newUnitName} (linha ${newRow})`
          );
        }
      } catch (e) {
        console.error(
          "[SUPABASE] Erro ao persistir troca de unidade:",
          e.message || e
        );
      }
    }

    // 5. MIGRAÇÃO SSE → SUPABASE: Buscar dados do Supabase se disponível, senão usar Sheets
    let oldUnitDataArray, newUnitDataArray;

    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", sheetTitle)
          .limit(1)
          .single();

        if (implData?.id) {
          // Busca as duas unidades do Supabase em paralelo
          const [oldUnitResult, newUnitResult] = await Promise.all([
            supabase
              .from("unidades")
              .select("*")
              .eq("implantacao_id", implData.id)
              .eq("row_index", parseInt(oldUnitIndex, 10) + 2)
              .limit(1)
              .single(),
            supabase
              .from("unidades")
              .select("*")
              .eq("implantacao_id", implData.id)
              .eq("row_index", parseInt(newUnitIndex, 10) + 2)
              .limit(1)
              .single(),
          ]);

          if (oldUnitResult.data && newUnitResult.data) {
            oldUnitDataArray = supabaseUnitToArray(oldUnitResult.data);
            newUnitDataArray = supabaseUnitToArray(newUnitResult.data);
          }
        }
      } catch (e) {
        console.warn(
          "[SSE] Falha ao buscar dados do Supabase para broadcast da troca, usando Sheets:",
          e.message
        );
      }
    }

    // Fallback: Se não conseguiu do Supabase, busca do Sheets
    if (!oldUnitDataArray || !newUnitDataArray) {
      const rangesToReadAfter = [
        `'${sheetTitle}'!A${oldRow}:O${oldRow}`,
        `'${sheetTitle}'!A${newRow}:O${newRow}`,
      ];
      const batchGetAfter = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        ranges: rangesToReadAfter,
      });

      const [oldUnitFullData, newUnitFullData] = batchGetAfter.data.valueRanges;
      oldUnitDataArray = oldUnitFullData.values?.[0] || [];
      newUnitDataArray = newUnitFullData.values?.[0] || [];
    }

    // Responde IMEDIATAMENTE ao cliente (não bloqueia)
    res.json({ success: true, message: "Troca de unidade realizada." });

    // Broadcast em background (não bloqueante)
    (async () => {
      try {
        await broadcastEvent(sheetTitle, "unitUpdated", {
          rowIndex: oldRow,
          unitData: oldUnitDataArray,
        });
        console.log(
          `[SSE] Broadcast de troca enviado para unidade antiga (linha ${oldRow})`
        );

        await broadcastEvent(sheetTitle, "unitUpdated", {
          rowIndex: newRow,
          unitData: newUnitDataArray,
        });
        console.log(
          `[SSE] Broadcast de troca enviado para unidade nova (linha ${newRow})`
        );
      } catch (err) {
        console.error("[SSE] Falha no broadcast de troca:", err.message);
      }
    })();
  } catch (err) {
    console.error("Erro ao trocar unidade:", err);
    res.status(500).json({ error: "Falha ao realizar a troca de unidade." });
  }
});

// Endpoint para ATUALIZAR COORDENADAS
app.post("/api/update-coords", verifyToken, async (req, res) => {
  const { implantacao, implantacaoRef, implantacao_ref, rowIndex, coordX, coordY, coordXAd, coordYAd, letra, mappingLayer } = req.body;
  // support both camelCase and snake_case
  const refOverride = implantacaoRef || implantacao_ref || null;
  const userEmail = req.user?.email || "Sistema";
  if (!implantacao || !rowIndex) {
    return res
      .status(400)
      .json({ error: "Índice da linha e implantação são obrigatórios." });
  }
  // Prefer primary coords (coordX/coordY). If only additional coords were provided,
  // use them as the primary coordinates (they now map to M/N).
  let finalCoordX = coordX;
  let finalCoordY = coordY;
  if ((finalCoordX === undefined || finalCoordX === null || finalCoordX === "") && (coordXAd !== undefined && coordXAd !== null && coordXAd !== "")) {
    finalCoordX = coordXAd;
  }
  if ((finalCoordY === undefined || finalCoordY === null || finalCoordY === "") && (coordYAd !== undefined && coordYAd !== null && coordYAd !== "")) {
    finalCoordY = coordYAd;
  }
  const hasPrimary = finalCoordX !== undefined && finalCoordY !== undefined && finalCoordX !== null && finalCoordY !== null && finalCoordX !== "" && finalCoordY !== "";
  if (!hasPrimary) {
    return res.status(400).json({
      error: "Forneça coordenadas primárias (coordX/coordY). Se usar coordXAd/coordYAd, serão aplicadas nas colunas primárias.",
    });
  }
  try {
    const sheets = await getSheetsClient();
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);
    if (error) return res.status(404).json({ error: error, ...details });

    // Sempre gravamos em M:N (colunas M e N). Aceitamos coordXAd/coordYAd como
    // fallback se coordX/coordY não forem fornecidos.
    const x = (finalCoordX !== undefined && finalCoordX !== null && String(finalCoordX).trim() !== "")
      ? finalCoordX
      : (coordXAd !== undefined ? coordXAd : null);
    const y = (finalCoordY !== undefined && finalCoordY !== null && String(finalCoordY).trim() !== "")
      ? finalCoordY
      : (coordYAd !== undefined ? coordYAd : null);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!M${rowIndex}:N${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[x || "", y || ""]] },
    });

    // Escreve referência de implantação na coluna Q (implantacao_ref)
    try {
      // If frontend provided an explicit implantacao_ref override, write that; otherwise write the implantacao used to resolve the sheet
      const refToWrite = refOverride || implantacao || "";
      // DEBUG: log what we're about to write so we can trace mismatches between layers
      console.log(`[MAPPING] Writing implantacao_ref to sheet='${sheetTitle}' row=${rowIndex} refToWrite='${refToWrite}' refOverride='${refOverride}' implantacao='${implantacao}'`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!Q${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[refToWrite]] },
      });
    } catch (e) {
      console.warn('[MAPPING] falha ao gravar implantacao_ref na planilha:', e && e.message ? e.message : e);
    }

    // Atualiza a letra na coluna S se fornecida
    if (letra !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${sheetTitle}'!S${rowIndex}`,
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
          // Sempre persiste em coord_x/coord_y e grava implantacao_ref
          const updatePayload = {
            coord_x: x || null,
            coord_y: y || null,
            implantacao_ref: (refOverride || implantacao) || null,
          };
          // DEBUG: log Supabase update intent
          console.log(`[MAPPING][SUPABASE] update unidades implantacao_id=${implantacao_id} row_index=${rowIndex} payload=${JSON.stringify(updatePayload)}`);

          const { error: upErr } = await supabase
            .from("unidades")
            .update(updatePayload)
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
    let historyAction = "Mapeamento Adicionado";
    if (mappingLayer) {
      historyAction = `Mapeamento Adicionado (camada: ${mappingLayer})`;
    }
    await addHistoryEntry(
      sheets,
      sheetTitle,
      unitFullName,
      historyAction,
      null,
      null,
      userEmail
    );

    // Responde IMEDIATAMENTE ao cliente (não bloqueia)
    res.json({
      success: true,
      message: `Coordenadas atualizadas e histórico registrado para '${unitFullName}'.`,
    });

    // Broadcast em background (não bloqueante)
    (async () => {
      try {
        await broadcastEvent(sheetTitle, "unitUpdated", {
          rowIndex,
          unitName: unitFullName,
        });
        console.log(
          `[SSE] Broadcast de atualização de coordenadas enviado para linha ${rowIndex}`
        );
      } catch (err) {
        console.error("[SSE] Falha no broadcast de coordenadas:", err.message);
      }
    })();
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar coordenadas." });
  }
});

// Endpoint para LIMPAR COORDENADAS
app.post("/api/clear-coords", verifyToken, async (req, res) => {
  // Extrai os dados
  const { implantacao, rowIndex, clearAd } = req.body;
  const userEmail = req.user?.email || "Sistema";

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

    // Limpa coordenadas na camada solicitada: M:N (primária) ou O:P (adicional)
    const batchData = [];
    const coordRange = clearAd ? `'${sheetTitle}'!O${rowIndex}:P${rowIndex}` : `'${sheetTitle}'!M${rowIndex}:N${rowIndex}`;
    batchData.push({
      range: coordRange,
      values: [["", ""]],
    });
    // Sempre limpa a letra na coluna S
    batchData.push({ range: `'${sheetTitle}'!S${rowIndex}`, values: [[""]] });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: batchData,
      },
    });

    // Also clear the corresponding supabase unidade coords when available
    if (supabase) {
      try {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", sheetTitle)
          .limit(1)
          .single();
        const implantacao_id = implData && implData.id ? implData.id : null;
        if (implantacao_id) {
          const updatePayload = clearAd
            ? { coord_x_ad: null, coord_y_ad: null, implantacao_ref: null }
            : { coord_x: null, coord_y: null, implantacao_ref: null };
          await supabase
            .from("unidades")
            .update(updatePayload)
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(rowIndex, 10));
        }
      } catch (e) {
        console.warn("Supabase: falha ao limpar coordenadas no banco (non-blocking)", e && e.message ? e.message : e);
      }
    }

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

    // Responde IMEDIATAMENTE ao cliente (não bloqueia)
    res.json({
      success: true,
      message: `Coordenadas removidas e histórico registrado para '${unitFullName}'.`,
    });

    // Broadcast em background (não bloqueante)
    (async () => {
      try {
        await broadcastEvent(sheetTitle, "unitUpdated", {
          rowIndex,
          unitName: unitFullName,
        });
        console.log(
          `[SSE] Broadcast de remoção de coordenadas enviado para linha ${rowIndex}`
        );
      } catch (err) {
        console.error("[SSE] Falha no broadcast de remoção:", err.message);
      }
    })();
  } catch (error) {
    console.error("Erro ao limpar coordenadas na planilha:", error);
    res.status(500).json({ error: "Falha ao limpar coordenadas." });
  }
});

// CORREÇÃO: Endpoint público para atualizar tamanho do ponto (dot_size)
app.post("/api/update-dot-size", async (req, res) => {
  const { implantacaoName, newSize } = req.body;

  if (!implantacaoName || newSize === undefined) {
    return res
      .status(400)
      .json({ error: "Nome da implantação e novo tamanho são obrigatórios." });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    const { data, error } = await supabase
      .from("implantacoes")
      .update({ dot_size: parseInt(newSize, 10) })
      .eq("nome", implantacaoName)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar dot_size:", error);
      return res.status(500).json({
        error: "Falha ao atualizar tamanho do ponto.",
        detail: error && error.message ? error.message : String(error),
      });
    }

    if (!data) {
      return res.status(404).json({
        error: `Implantação '${implantacaoName}' não encontrada.`,
      });
    }

    res.json({
      success: true,
      message: `Tamanho do ponto atualizado para ${newSize}px.`,
      updated: data,
    });
  } catch (error) {
    console.error("Erro ao atualizar dot_size (catch):", error);
    res.status(500).json({
      error: "Falha ao atualizar o tamanho do ponto.",
      detail: error && error.message ? error.message : String(error),
    });
  }
});

app.post("/api/toggle-block-unit", verifyToken, async (req, res) => {
  const { implantacao, rowIndex, newStatus, password, motivo } = req.body;
  const userEmail = req.user?.email || "Sistema"; // Declaração no escopo principal

  const normalizedNewStatus = normalizeStatus(newStatus);
  if (
    !implantacao ||
    !rowIndex ||
    !newStatus ||
    !["bloqueada", "disponivel"].includes(normalizedNewStatus)
  ) {
    return res
      .status(400)
      .json({ error: "Dados inválidos para bloquear/desbloquear unidade." });
  }

  // Validação de motivo obrigatório para BLOQUEAR
  if (normalizedNewStatus === "bloqueada") {
    if (!motivo || motivo.trim() === "") {
      return res.status(400).json({
        error: "Motivo é obrigatório para bloquear unidades.",
      });
    }
  }

  // Validação de senha apenas para DESBLOQUEAR
  if (normalizedNewStatus === "disponivel") {
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

    // Atualiza coluna L (status/situacao) no Sheets
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!L${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newStatus]] },
    });

    // Atualiza coluna P (motivo) na planilha mestre quando aplicável
    try {
      if (normalizedNewStatus === "bloqueada") {
        // grava o motivo na coluna P
        const motivoToWrite = motivo ? motivo.trim() : "";
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${sheetTitle}'!P${rowIndex}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[motivoToWrite]] },
        });
      } else if (normalizedNewStatus === "disponivel") {
        // limpa o motivo quando desbloquear
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${sheetTitle}'!P${rowIndex}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[""]] },
        });
      }
    } catch (sheetMotivoError) {
      console.warn(
        `Aviso: falha ao atualizar coluna P (motivo) na planilha ${SPREADSHEET_ID_IMPLANTACAO}:`,
        sheetMotivoError
      );
    }

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
          const updateData = { situacao: newStatus };

          // Se está bloqueando, adiciona o motivo
          if (normalizedNewStatus === "bloqueada" && motivo) {
            updateData.motivo = motivo.trim();
          }

          // Se está desbloqueando, limpa o motivo
          if (normalizedNewStatus === "disponivel") {
            updateData.motivo = null;
          }

          const { error: updateError } = await supabase
            .from("unidades")
            .update(updateData)
            .eq("implantacao_id", implantacao_id)
            .eq("row_index", parseInt(rowIndex, 10));

          if (updateError) {
            console.error(
              "Supabase: Erro ao atualizar status da unidade para Bloqueada/Disponível:",
              updateError
            );
          } else {
            console.log(
              `[BLOCK] Unidade ${rowIndex} ${
                normalizedNewStatus === "bloqueada"
                  ? "bloqueada"
                  : "desbloqueada"
              } com sucesso${
                normalizedNewStatus === "bloqueada"
                  ? " - Motivo: " + motivo
                  : ""
              }`
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
    const acao =
      normalizeStatus(newStatus) === "bloqueada" ? "Bloqueada" : "Desbloqueada";

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

// =================================================================
// NOVA LÓGICA DE PIX - Planilha Separada (ID: 1p2cFQIvT2Gq23VmfGUpvmCo3MK2Y5LkudR7ekrmkTdY)
// =================================================================

// Helper: Adiciona um novo PIX na planilha de PIX
async function addPixToSheet(
  sheets,
  implantacao,
  cliente,
  unidade,
  identificador,
  payloadEmv,
  valor,
  statusPagamento
) {
  // Persist PIX to Supabase `historico_pix` table
  try {
    const insertObj = {
      implantacao_nome: implantacao || null,
      cliente: cliente || null,
      unidade: unidade || null,
      identificador: identificador,
      payload_emv: payloadEmv,
      valor: typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor),
      status_pagamento: statusPagamento || 'PENDENTE',
      data_criacao: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('historico_pix')
      .insert(insertObj)
      .select()
      .single();

    if (error) {
      // If unique constraint on identificador fails, return that error upward
      console.error('[PIX] Erro ao inserir historico_pix:', error);
      throw error;
    }

    return data;
  } catch (e) {
    console.error('[PIX] Falha ao salvar PIX no Supabase:', e && e.message ? e.message : e);
    throw e;
  }
}

// Helper: Busca todos os PIX de um cliente/unidade específica usando Supabase
async function getPixByClienteUnidade(_sheets, implantacao, cliente, unidade) {
  try {
    let query = supabase.from('historico_pix').select('id, implantacao_id, implantacao_nome, cliente, unidade, identificador, payload_emv, valor, status_pagamento, data_criacao, data_pagamento, created_at').order('created_at', { ascending: false });

    if (implantacao) {
      query = query.eq('implantacao_nome', implantacao);
    }
    if (cliente) {
      query = query.eq('cliente', cliente);
    }
    if (unidade) {
      query = query.eq('unidade', unidade);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[PIX] Erro ao consultar historico_pix:', error);
      return [];
    }

    // Map to previous expected shape
    const pixList = (data || []).map((r) => ({
      id: r.id,
      implantacao_id: r.implantacao_id,
      implantacao_nome: r.implantacao_nome,
      cliente: r.cliente,
      unidade: r.unidade,
      identificador: r.identificador,
      payloadEmv: r.payload_emv,
      valor: Number(r.valor) || 0,
      statusPagamento: r.status_pagamento || 'PENDENTE',
      dataHora: r.data_criacao || r.created_at || null,
      data_pagamento: r.data_pagamento || null,
    }));

    return pixList;
  } catch (error) {
    console.error('[PIX] Exceção ao buscar historico_pix:', error);
    return [];
  }
}

// Endpoint: Criar um novo PIX
app.post("/api/pix/create", verifyToken, async (req, res) => {
  const { implantacao, cliente, unidade, identificador, payloadEmv, valor } =
    req.body;

  if (
    !implantacao ||
    !cliente ||
    !unidade ||
    !identificador ||
    !payloadEmv ||
    !valor
  ) {
    return res.status(400).json({ error: "Dados incompletos para criar PIX." });
  }

  try {
    // Insere o PIX na tabela historico_pix do Supabase
    await addPixToSheet(
      null,
      implantacao,
      cliente,
      unidade,
      identificador,
      payloadEmv,
      valor,
      "PENDENTE"
    );

    res.json({
      success: true,
      message: "PIX criado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao criar PIX:", error);
    res.status(500).json({ error: "Falha ao criar PIX." });
  }
});

// Endpoint: Buscar todos os PIX de um cliente/unidade
app.get("/api/pix/list", verifyToken, async (req, res) => {
  const { implantacao, cliente, unidade } = req.query;

  if (!implantacao || !cliente) {
    return res.status(400).json({ error: "Parâmetros incompletos. Implantação e Cliente são obrigatórios." });
  }

  try {
    const pixList = await getPixByClienteUnidade(
      null,
      implantacao,
      cliente,
      unidade
    );

    // Calcula totais APENAS dos PIX com status "PAGO"
    const pixPagos = pixList.filter(
      (pix) => pix.statusPagamento?.toUpperCase() === "PAGO"
    );
    const valorTotal = pixPagos.reduce((sum, pix) => sum + pix.valor, 0);
    const numeroParcelas = pixPagos.length;

    res.json({
      pixList, // Retorna todos os PIX (para histórico)
      valorTotal, // Soma apenas dos pagos
      numeroParcelas, // Conta apenas os pagos
    });
  } catch (error) {
    console.error("Erro ao listar PIX:", error);
    res.status(500).json({ error: "Falha ao listar PIX." });
  }
});

// Endpoint: Dashboard Diretoria - agregados de reservas/pagamentos/unidades
app.get("/api/diretoria", verifyToken, async (req, res) => {
  try {
    // Buscar unidades para estatísticas gerais
    const { data: unidadesData, error: unidadesErr } = await supabase
      .from("unidades")
      .select("*");

    if (unidadesErr) {
      console.error("Erro ao buscar unidades:", unidadesErr);
    }

    // Buscar pagamentos válidos através da VIEW
    const { data: pagamentosValidosData, error: viewErr } = await supabase
      .from("view_diretoria_pagamentos")
      .select("*")
      .eq("pagamento_valido", true);

    if (viewErr) {
      console.error("Erro ao buscar view_diretoria_pagamentos:", viewErr);
    }

    const unidades = unidadesData || [];
    const pagamentosValidos = pagamentosValidosData || [];

    const toNumber = (v) => {
      if (v == null) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    // CORREÇÃO: Filtrar apenas unidades com situação EXATAMENTE igual a "Reservada"
    const reservedUnits = (unidades || []).filter((u) => {
      const situacao = (u.situacao || "").toString().trim();
      return situacao === "Reservada";
    });

    const countBy = (arr, key) => {
      return arr.reduce((acc, cur) => {
        const k = (cur && cur[key]) || "(Sem)";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
    };

    // Usar dados da VIEW que já tem join com unidades
    const unidadesReservadasPorTipologia = countBy(pagamentosValidos, "tipologia");
    const unidadesReservadasPorImobiliaria = countBy(pagamentosValidos, "imobiliaria");
    const unidadesReservadasPorCorretor = countBy(pagamentosValidos, "corretor");

    // Calcular totais apenas dos pagamentos válidos (já filtrados pela VIEW)
    const totalValorUnidadesReservadas = pagamentosValidos.reduce(
      (s, p) => s + toNumber(p.valor_unidade || p.valor_total),
      0
    );

    const totalPix = pagamentosValidos.reduce(
      (s, p) => s + toNumber(p.valor_pix),
      0
    );

    const totalCartao = pagamentosValidos.reduce(
      (s, p) => s + toNumber(p.valor_cartao),
      0
    );

    const totalDinheiro = pagamentosValidos.reduce(
      (s, p) => s + toNumber(p.valor_dinheiro),
      0
    );

    const totalCheque = pagamentosValidos.reduce(
      (s, p) => s + toNumber(p.valor_cheque),
      0
    );

    // CORREÇÃO: Contar apenas unidades únicas com situação "Reservada", não quantidade de pagamentos
    const quantidadeReservas = reservedUnits.length;

    const unidadesBloqueadas = (unidades || []).filter(
      (u) => (u.situacao || "").toString().trim() === "Bloqueada"
    ).length;

    const unidadesDisponiveis = (unidades || []).filter(
      (u) => (u.situacao || "").toString().trim() === "Disponível"
    ).length;

    res.json({
      unidadesReservadasPorTipologia: unidadesReservadasPorTipologia,
      unidadesReservadasPorImobiliaria: unidadesReservadasPorImobiliaria,
      unidadesReservadasPorCorretor: unidadesReservadasPorCorretor,
      totalValorUnidadesReservadas,
      totalPix,
      totalCartao,
      totalDinheiro,
      totalCheque,
      quantidadeReservas,
      unidadesBloqueadas,
      unidadesDisponiveis,
    });
  } catch (error) {
    console.error("Erro no endpoint /api/diretoria:", error);
    res.status(500).json({ error: "Erro ao calcular dashboard da diretoria." });
  }
});

// NOVO: Endpoint para buscar último PIX pendente de uma unidade
app.get("/api/pix/pending", verifyToken, async (req, res) => {
  const { implantacao, cliente, unidade } = req.query;

  if (!implantacao || !cliente || !unidade) {
    return res.status(400).json({ error: "Parâmetros incompletos." });
  }

  try {
    const pixList = await getPixByClienteUnidade(
      null,
      implantacao,
      cliente,
      unidade
    );

    // Busca o último PIX pendente (ordenado por data)
    const pendingPix = pixList.find((pix) => (pix.statusPagamento || '').toUpperCase() === "PENDENTE");

    if (pendingPix) {
      res.json({
        hasPending: true,
        pixData: pendingPix,
      });
    } else {
      res.json({
        hasPending: false,
        pixData: null,
      });
    }
  } catch (error) {
    console.error("Erro ao buscar PIX pendente:", error);
    res.status(500).json({ error: "Falha ao buscar PIX pendente." });
  }
});

// Endpoint: Transferir PIX de uma unidade para outra (troca de unidade)
app.post("/api/pix/transfer", verifyToken, async (req, res) => {
  const { implantacao, cliente, unidadeAntiga, unidadeNova } = req.body;

  if (!implantacao || !cliente || !unidadeAntiga || !unidadeNova) {
    return res
      .status(400)
      .json({ error: "Dados incompletos para transferência." });
  }

  try {
    // Atualiza historico_pix no Supabase: troca unidade nas entradas correspondentes
    const { data: updated, error } = await supabase
      .from('historico_pix')
      .update({ unidade: unidadeNova })
      .eq('implantacao_nome', implantacao)
      .eq('cliente', cliente)
      .eq('unidade', unidadeAntiga)
      .select();

    if (error) {
      console.error('Erro ao transferir PIX no Supabase:', error);
      return res.status(500).json({ error: 'Falha ao transferir PIX.' });
    }

    res.json({
      success: true,
      message: `${(updated || []).length} PIX(s) transferidos com sucesso.`,
      pixTransferidos: (updated || []).length,
    });
  } catch (error) {
    console.error("Erro ao transferir PIX:", error);
    res.status(500).json({ error: "Falha ao transferir PIX." });
  }
});

// NOVO: Endpoint para atualizar status do PIX (Supabase + Google Sheets)
app.post("/api/pix/update-status", verifyToken, async (req, res) => {
  const { identificador, status, dataPagamento } = req.body;

  if (!identificador || !status) {
    return res.status(400).json({ error: "Identificador e status são obrigatórios." });
  }

  try {
    // 1. Atualiza no Supabase
    const updateData = {
      status_pagamento: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'PAGO' && dataPagamento) {
      updateData.data_pagamento = dataPagamento;
    }

    const { data: pixData, error: supabaseError } = await supabase
      .from('historico_pix')
      .update(updateData)
      .eq('identificador', identificador)
      .select()
      .single();

    if (supabaseError) {
      console.error('Erro ao atualizar PIX no Supabase:', supabaseError);
      return res.status(500).json({ error: 'Erro ao atualizar no Supabase', details: supabaseError.message });
    }

    // 2. Broadcast via SSE para notificar frontends conectados sobre mudança de status
    try {
      const implantacao = pixData.implantacao_nome || null;
      const unitName = pixData.unidade || null;
      const payload = {
        pagamento_id: pixData.id || null,
        identificador: identificador,
        pagamentos_status: status,
        unitName: unitName,
      };

      if (implantacao) {
        await broadcastEvent(implantacao, 'unitUpdated', payload);
      } else {
        // Broadcast to all implantacoes as fallback
        for (const imp of Array.from(sseClients.keys())) {
          try {
            await broadcastEvent(imp, 'unitUpdated', payload);
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (bErr) {
      console.warn('[PIX] falha ao broadcast de update-status via SSE:', bErr && bErr.message ? bErr.message : bErr);
    }

    res.json({
      success: true,
      message: "Status do PIX atualizado com sucesso.",
      data: pixData,
    });
  } catch (error) {
    console.error("Erro ao atualizar status do PIX:", error);
    res.status(500).json({ error: "Falha ao atualizar status do PIX." });
  }
});

// ANTIGO: Endpoint para atualizar dados do PIX (DEPRECATED - manter por compatibilidade)
app.post("/api/update-pix-data", verifyToken, async (req, res) => {
  const {
    implantacao,
    rowIndex,
    identificador,
    payloadEmv,
    valor,
    statusPagamento,
  } = req.body;
  const userEmail = req.user?.email || "Sistema";

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
    const {
      found: sheetTitle,
      error,
      ...details
    } = await resolveSheetName(sheets, SPREADSHEET_ID_IMPLANTACAO, implantacao);

    if (error) return res.status(404).json({ error: error, ...details });

    // CORREÇÃO: Lê os dados atuais ANTES para garantir que F-J não serão apagadas
    const verifyBeforeRange = `'${sheetTitle}'!F${rowIndex}:O${rowIndex}`;
    const beforeData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: verifyBeforeRange,
    });
    const beforeRow = beforeData.data.values?.[0] || [];
    // Atualiza APENAS as colunas O, P, Q, R (PIX) sem tocar em F-K
    // The sheet only supports up to column O; write only the identificador into O.
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${sheetTitle}'!O${rowIndex}:O${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[identificador || ""]],
      },
    });

    // VERIFICAÇÃO: Confirma que F-J não foram alteradas
    const afterData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: verifyBeforeRange,
    });
    const afterRow = afterData.data.values?.[0] || [];
    // CRÍTICO: Busca a linha COMPLETA (A-S) para enviar via SSE
    const fullRowRange = `'${sheetTitle}'!A${rowIndex}:O${rowIndex}`;
    const fullRowData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: fullRowRange,
    });
    const fullRow = fullRowData.data.values?.[0] || [];
    // CORREÇÃO CRÍTICA: Envia broadcast SSE com dados COMPLETOS da unidade
    await broadcastEvent(sheetTitle, "unitUpdated", {
      rowIndex,
      unitData: fullRow,
    });

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
  const userEmail = req.user?.email || "Sistema";

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

// NOVO: Endpoint para registrar pagamento (Sinal/Entrada)
app.post("/api/add-payment", verifyToken, async (req, res) => {
  const {
    implantacao,
    implantacaoId,
    clientName,
    unitName,
    idPreCadastro,
    pagamento
  } = req.body;
  const userEmail = req.user?.email || "Sistema";

  if (!pagamento) {
    return res.status(400).json({ error: "Dados de pagamento incompletos." });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    // Resolver implantacao_id se não vier no body
    let finalImplantacaoId = implantacaoId;
    if (!finalImplantacaoId && implantacao) {
        const { data: implData } = await supabase
          .from("implantacoes")
          .select("id")
          .eq("nome", implantacao)
          .maybeSingle();
        finalImplantacaoId = implData?.id;
    }

    // 1. Buscar cliente_id
    let clienteId = null;
    if (idPreCadastro) {
      const { data: clientData } = await supabase
        .from("clientes")
        .select("id")
        .eq("id_pre_cadastro", idPreCadastro)
        .maybeSingle();
      clienteId = clientData?.id;
    }
    
    if (!clienteId && clientName && finalImplantacaoId) {
       const { data: clientData } = await supabase
        .from("clientes")
        .select("id")
        .eq("nome", clientName)
        .eq("implantacao_id", finalImplantacaoId)
        .maybeSingle();
       clienteId = clientData?.id;
    }

    // 2. Inserir em pagamentos
    const { data: pagamentoInserido, error } = await supabase.from("pagamentos").insert({
      cliente_id: clienteId,
      unidade: unitName,
      valor_total: pagamento.valorTotal,
      valor_unidade: pagamento.valorUnidade,
      valor_pix: pagamento.valorPix,
      valor_dinheiro: pagamento.valorDinheiro,
      valor_cartao: pagamento.valorCartao,
      valor_cheque: pagamento.valorCheque,
      tipo_pagamento: "presencial",
      tipo_venda: pagamento.tipoVenda,
      plano_padrao: pagamento.planoSelecionado,
      dia_vencimento: pagamento.diaVencimento,
      status: "pendente",
      created_at: new Date().toISOString()
    }).select().single();

    if (error) {
        console.error("Erro Supabase ao inserir pagamento:", error);
        throw error;
    }

    // 3. Adicionar ao histórico
    const sheets = await getSheetsClient();
    await addHistoryEntry(
        sheets,
        implantacao,
        unitName,
        "Pagamento Registrado",
        clientName,
        null, 
        userEmail
    );

    // 4. ENFILEIRAR JOB NO REDIS
    if (pagamentoInserido) {
        const jobPayload = {
            pagamento_id: pagamentoInserido.id,
            implantacao: implantacao,
            timestamp: Date.now()
        };
        
        await redis.lpush("fila_reservas", JSON.stringify(jobPayload));
        console.log(`[API] Job de pagamento ${pagamentoInserido.id} enviado para a fila Redis.`);
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Erro ao adicionar pagamento:", error);
    res.status(500).json({ error: "Falha ao registrar pagamento." });
  }
});

// NOVO: Endpoint para atuar como proxy para a API do Santander
app.post("/api/santander/gerapix", verifyToken, async (req, res) => {
  const SANTANDER_API_URL = "https://gatewaypix.suportevca.com.br/api/gerapix";
  try {
    // O corpo da requisição (req.body) já vem do frontend no formato correto.
    // Apenas repassamos para a API do Santander.
    const response = await fetch(SANTANDER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const responseData = await response.json();

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
  const userEmail = req.user?.email || "Sistema"; // Declaração no escopo principal

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
      range: `'${implantacao}'!A:H`,
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
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    const { data, error } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", req.user?.uid || null)
      .maybeSingle();

    // Se usuário não existe, cria um registro
    if (!data && !error) {
      const { error: insertError } = await supabase.from("users").insert({
        id: req.user?.uid || null,
        email: req.user?.email || "Sistema",
        full_name: null,
      });

      if (insertError) {
        console.error("Erro ao criar usuário:", insertError);
      }
      return res.json({ full_name: null });
    }

    if (error) {
      console.error("Erro ao buscar full_name:", error);
      return res.status(500).json({ error: "Falha ao buscar nome completo." });
    }

    res.json({ full_name: data?.full_name || null });
  } catch (error) {
    console.error("Exceção em /api/user/full-name:", error);
    res.status(500).json({ error: "Falha ao buscar nome completo." });
  }
});

app.post("/api/user/full-name", verifyToken, async (req, res) => {
  const { full_name } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: "Nome completo é obrigatório." });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    // Tenta atualizar, se não existir, cria
    const { error: updateError } = await supabase
      .from("users")
      .update({ full_name: full_name.trim() })
      .eq("id", req.user?.uid || null);

    // Se erro indicar que não existe, cria o registro
    if (updateError) {
      const { error: insertError } = await supabase.from("users").insert({
        id: req.user?.uid || null,
        email: req.user?.email || "Sistema",
        full_name: full_name.trim(),
      });

      if (insertError) {
        console.error("Erro ao criar usuário:", insertError);
        return res
          .status(500)
          .json({ error: "Falha ao atualizar nome completo." });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Exceção em POST /api/user/full-name:", error);
    res.status(500).json({ error: "Falha ao atualizar nome completo." });
  }
});

// =================================================================
// CRUD DE IMPLANTAÇÕES (EMPREENDIMENTOS)
// =================================================================

// Listar todas as implantações
app.get("/api/implantacoes", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não está configurado." });
    }

    const { data, error } = await supabase
      .from("implantacoes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error("Erro ao listar implantações:", error);
    res.status(500).json({ error: "Falha ao listar implantações." });
  }
});

// Criar nova implantação
app.post(
  "/api/implantacoes",
  verifyToken,
  upload.fields([
    { name: "imagem", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "imagem_adicional", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("=== POST /api/implantacoes INICIADO ===");
      console.log("User:", req.user?.email);
      console.log("Body recebido:", req.body);
      console.log(
        "Files recebidos:",
        req.files ? Object.keys(req.files) : "nenhum"
      );

      if (!supabase) {
        console.error("❌ Supabase não configurado");
        return res
          .status(500)
          .json({ error: "Supabase não está configurado." });
      }

      const { nome, endereco, cidade, estado, cvcrm_id } = req.body;
      console.log("Campos extraídos:", {
        nome,
        endereco,
        cidade,
        estado,
        cvcrm_id,
      });

      if (!nome || !endereco || !cidade || !estado) {
        console.error("❌ Campos obrigatórios faltando");
        return res.status(400).json({
          error: "Nome, endereço, cidade e estado são obrigatórios.",
        });
      }

      let imageUrl = "";
      let logoUrl = "";
      let imageAdicionalUrl = "";

      // Upload da imagem da implantação para Supabase Storage (se fornecida)
      if (req.files && req.files.imagem && req.files.imagem[0]) {
        console.log("📤 Iniciando upload da imagem...");
        const file = req.files.imagem[0];
        const sanitizedName = sanitizeFilename(file.originalname);
        const fileName = `implantacao_${Date.now()}_${sanitizedName}`;
        console.log("Nome do arquivo:", fileName);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("implantacoes")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("❌ Erro ao fazer upload da imagem:", uploadError);
          return res.status(500).json({
            error: "Falha ao fazer upload da imagem.",
            details: uploadError.message,
          });
        }

        // Gerar URL pública da imagem
        const { data: urlData } = supabase.storage
          .from("implantacoes")
          .getPublicUrl(fileName);

        imageUrl = urlData?.publicUrl || "";
        console.log("✅ Imagem uploaded:", imageUrl);
      } else {
        console.log("ℹ️ Nenhuma imagem fornecida");
      }

      // Upload da logo para Supabase Storage (se fornecida)
      if (req.files && req.files.logo && req.files.logo[0]) {
        console.log("📤 Iniciando upload da logo...");
        const file = req.files.logo[0];
        const sanitizedName = sanitizeFilename(file.originalname);
        const fileName = `logo_${Date.now()}_${sanitizedName}`;
        console.log("Nome do arquivo:", fileName);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("implantacoes")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("❌ Erro ao fazer upload da logo:", uploadError);
          return res.status(500).json({
            error: "Falha ao fazer upload da logo.",
            details: uploadError.message,
          });
        }

        // Gerar URL pública da logo
        const { data: urlData } = supabase.storage
          .from("implantacoes")
          .getPublicUrl(fileName);

        logoUrl = urlData?.publicUrl || "";
        console.log("✅ Logo uploaded:", logoUrl);
      } else {
        console.log("ℹ️ Nenhuma logo fornecida");
      }

      // Upload da imagem adicional (se fornecida)
      if (req.files && req.files.imagem_adicional && req.files.imagem_adicional[0]) {
        console.log("📤 Iniciando upload da imagem adicional...");
        const file = req.files.imagem_adicional[0];
        const sanitizedName = sanitizeFilename(file.originalname);
        const fileName = `implantacao_adicional_${Date.now()}_${sanitizedName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("implantacoes")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("❌ Erro ao fazer upload da imagem adicional:", uploadError);
          return res.status(500).json({ error: "Falha ao fazer upload da imagem adicional.", details: uploadError.message });
        }

        const { data: urlData } = supabase.storage
          .from("implantacoes")
          .getPublicUrl(fileName);

        imageAdicionalUrl = urlData?.publicUrl || "";
        console.log("✅ Imagem adicional uploaded:", imageAdicionalUrl);
      } else {
        console.log("ℹ️ Nenhuma imagem adicional fornecida");
      }

      // Inserir implantação no banco
      console.log("💾 Inserindo implantação no banco...");
      const insertPayload = {
        nome: nome.trim(),
        imagem_url: imageUrl || null,
        imagem_url_adicional: imageAdicionalUrl || null,
        logo_url: logoUrl || null,
        dot_size: 15,
        endereco: endereco.trim(),
        cidade: cidade.trim(),
        estado: estado.trim(),
        cvcrm_id: cvcrm_id?.trim() || null,
        sigla: null,
      };
      console.log("Payload:", insertPayload);

      const { data, error } = await supabase
        .from("implantacoes")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("❌ Erro Supabase ao inserir implantação:", error);
        console.error("Código do erro:", error.code);
        console.error("Detalhes:", error.details);
        console.error("Hint:", error.hint);
        throw error;
      }

      console.log("✅ Implantação criada com sucesso:", data);
      res.status(201).json(data);
    } catch (error) {
      console.error("❌❌❌ EXCEÇÃO ao criar implantação:", error);
      console.error("Stack:", error.stack);
      res.status(500).json({
        error: "Falha ao criar implantação.",
        details: error.message || String(error),
      });
    }
  }
);

// Atualizar implantação existente
// Atualizar implantação existente
app.put(
  "/api/implantacoes/:id",
  verifyToken,
  upload.fields([
    { name: "imagem", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "imagem_adicional", maxCount: 1 },
  ]),
  (req, res, next) => {
    try {
      console.log("[MULTER DONE] middleware - arquivos recebidos:",
        req.files ? Object.keys(req.files) : "(nenhum)");
      if (req.files) {
        for (const k of Object.keys(req.files)) {
          const arr = req.files[k];
          console.log(`[MULTER DONE] file[${k}] count=${arr.length}`, arr.map(f => ({ originalname: f.originalname, size: f.size || (f.buffer && f.buffer.length) || 0 })));
        }
      }
    } catch (e) {
      console.warn('[MULTER DONE] erro ao logar req.files', e && e.message);
    }
    next();
  },
  async (req, res) => {
    try {
      if (!supabase) {
        return res
          .status(500)
          .json({ error: "Supabase não está configurado." });
      }

      const { id } = req.params;
      const { nome, endereco, cidade, estado, cvcrm_id } = req.body;

      // Logs para diagnosticar upload via UI
      try {
        const auth = req.headers.authorization || req.headers.Authorization || "";
        const authSummary = auth ? `${auth.slice(0, 20)}...` : "(nenhum)";
        console.log(`[PUT /api/implantacoes/${id}] Autorization:`, authSummary);
        console.log(`[PUT /api/implantacoes/${id}] body keys:`, Object.keys(req.body || {}));
        console.log(`[PUT /api/implantacoes/${id}] body sample: nome='${(nome||"").slice(0,40)}' endereco='${(endereco||"").slice(0,40)}' cidade='${cidade||""}' estado='${estado||""}'`);
        const filesInfo = {};
        if (req.files) {
          for (const k of Object.keys(req.files)) {
            const arr = req.files[k];
            filesInfo[k] = arr.map((f) => ({ originalname: f.originalname, size: f.size || (f.buffer && f.buffer.length) || 0 }));
          }
        }
        console.log(`[PUT /api/implantacoes/${id}] files:`, filesInfo);
      } catch (e) {
        console.warn(`[PUT /api/implantacoes/${id}] erro ao logar req:`, e && e.message);
      }

      if (!nome || !endereco || !cidade || !estado) {
        return res.status(400).json({
          error: "Nome, endereço, cidade e estado são obrigatórios.",
        });
      }

      // Buscar implantação atual
      const { data: currentData, error: fetchError } = await supabase
        .from("implantacoes")
        .select("imagem_url, logo_url")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      let imageUrl = currentData?.imagem_url || "";
      let logoUrl = currentData?.logo_url || "";

      // Upload de nova imagem da implantação (se fornecida) - usando helper robusto
      if (req.files && req.files.imagem && req.files.imagem[0]) {
        try {
          const file = req.files.imagem[0];
          const { filename: uploadedName, publicUrl } = await uploadFileToSupabaseStorage(
            "implantacoes",
            file,
            "implantacao_"
          );
          imageUrl = publicUrl || imageUrl;
        } catch (e) {
          console.error("[PUT] Falha ao enviar imagem para storage:", e && e.message ? e.message : e);
          // não interromperemos imediatamente; registramos e continuamos (pode ser apenas logo)
          return res.status(500).json({ error: "Falha ao enviar imagem para storage.", details: e && e.message ? e.message : String(e) });
        }
      }

      // Upload de nova logo (se fornecida) - usando helper robusto
      if (req.files && req.files.logo && req.files.logo[0]) {
        try {
          const file = req.files.logo[0];
          const { filename: uploadedName, publicUrl } = await uploadFileToSupabaseStorage(
            "implantacoes",
            file,
            "logo_"
          );
          logoUrl = publicUrl || logoUrl;
        } catch (e) {
          console.error("[PUT] Falha ao enviar logo para storage:", e && e.message ? e.message : e);
          return res.status(500).json({ error: "Falha ao enviar logo para storage.", details: e && e.message ? e.message : String(e) });
        }
      }

      // Upload de nova imagem adicional (se fornecida)
      if (req.files && req.files.imagem_adicional && req.files.imagem_adicional[0]) {
        try {
          const file = req.files.imagem_adicional[0];
          const { filename: uploadedName, publicUrl } = await uploadFileToSupabaseStorage(
            "implantacoes",
            file,
            "implantacao_adicional_"
          );
          imageAdicionalUrl = publicUrl || imageAdicionalUrl;
        } catch (e) {
          console.error("[PUT] Falha ao enviar imagem adicional para storage:", e && e.message ? e.message : e);
          return res.status(500).json({ error: "Falha ao enviar imagem adicional para storage.", details: e && e.message ? e.message : String(e) });
        }
      }

      // Atualizar implantação no banco
      const { data, error } = await supabase
        .from("implantacoes")
        .update({
          nome: nome.trim(),
          imagem_url: imageUrl,
          imagem_url_adicional: imageAdicionalUrl || null,
          logo_url: logoUrl,
          endereco: endereco.trim(),
          cidade: cidade.trim(),
          estado: estado.trim(),
          cvcrm_id: cvcrm_id?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error("Erro ao atualizar implantação:", error);
      res.status(500).json({ error: "Falha ao atualizar implantação." });
    }
  }
);

// Deletar implantação
// Deletar implantação
app.delete("/api/implantacoes/:id", verifyToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase não está configurado." });
    }

    const { id } = req.params;

    const { error } = await supabase.from("implantacoes").delete().eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar implantação:", error);
    res.status(500).json({ error: "Falha ao deletar implantação." });
  }
});

// =================================================================
// CSV IMPORT ENDPOINTS
// =================================================================

// Endpoint para importar unidades via CSV/XLSX para o Google Sheets
// Cria a aba automaticamente se não existir
app.post(
  "/api/import-unidades",
  verifyToken,
  upload.single("csv"),
  async (req, res) => {
    try {
      console.log("📥 [IMPORT UNIDADES] Iniciando importação...");
      const { implantacao } = req.body;

      if (!implantacao) {
        return res
          .status(400)
          .json({ error: "Nome da implantação é obrigatório." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não fornecido." });
      }

      console.log("📥 [IMPORT UNIDADES] Implantação:", implantacao);
      console.log("📥 [IMPORT UNIDADES] Tipo de arquivo:", req.file.mimetype);

      const sheets = await getSheetsClient();

      // Verifica se a aba já existe
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      });

      const existingSheet = spreadsheet.data.sheets.find(
        (s) => s.properties.title === implantacao
      );

      // Se não existir, cria a aba com cabeçalho padrão
      if (!existingSheet) {
        console.log("📥 [IMPORT UNIDADES] Criando nova aba:", implantacao);

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: implantacao,
                  },
                },
              },
            ],
          },
        });

        // Adiciona cabeçalho padrão (A..O)
        const header = [
          "etapa",
          "bloco",
          "nome_unidade",
          "area_privativa",
          "tipologia",
          "valor_do_imovel",
          "id_pre_cadastro",
          "cliente",
          "documento",
          "corretor",
          "imobiliaria",
          "situacao",
          "coord_x",
          "coord_y",
          "Simbolo",
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${implantacao}'!A1:O1`,
          valueInputOption: "RAW",
          resource: {
            values: [header],
          },
        });

        console.log("✅ [IMPORT UNIDADES] Aba criada com cabeçalho");
      }

      let dataLines = [];

      // Helper: normaliza nome de header
      function normalizeHeader(h) {
        if (!h && h !== 0) return "";
        return String(h)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      }

      function splitCsvLine(line, delimiter) {
        const result = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
          }
          if (ch === delimiter && !inQuotes) {
            result.push(cur);
            cur = "";
            continue;
          }
          cur += ch;
        }
        result.push(cur);
        return result.map((c) => c.trim());
      }

      function parseArea(value) {
        if (value === null || value === undefined || value === "") return null;
        const s = String(value).replace(/\s/g, "").replace(/m2|m²/gi, "").replace(/,/g, ".");
        const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
        return isNaN(n) ? null : n;
      }

      function formatAreaBr(num) {
        if (num === null || num === undefined) return "";
        return Number(num).toFixed(2).toString().replace(".", ",") + "m²";
      }

      function parseCurrencyToNumber(value) {
        if (value === null || value === undefined || value === "") return null;
        const s = String(value).replace(/\s/g, "").replace(/R\$|\$/g, "");
        // Remove thousands dots and keep comma as decimal
        const cleaned = s.replace(/\./g, "").replace(/,/g, ".");
        const n = parseFloat(cleaned.replace(/[^0-9.\-]/g, ""));
        return isNaN(n) ? null : n;
      }

      function formatCurrencyBr(num) {
        if (num === null || num === undefined) return "";
        try {
          return Number(num).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
        } catch (e) {
          return String(num);
        }
      }

      // Função que monta uma linha no formato da planilha A:O a partir de um objeto {header: value}
      function buildSheetRowFromObj(obj) {
        // obj keys are normalized headers
        const etapa = obj["etapa"] || "";
        const bloco = obj["bloco"] || "";
        const nome_unidade = obj["unidade"] || obj["nome_unidade"] || obj["unidade_nome"] || obj["nome"] || "";
        const raw_area = obj["area_privativa"] || obj["área_privativa"] || obj["area"] || "";
        const areaNum = parseArea(raw_area);
        const areaFormatted = areaNum !== null ? formatAreaBr(areaNum) : (raw_area || "");
        const tipologia = obj["tipologia"] || obj["tipo"] || "";
        const raw_valor = obj["valor_do_imovel"] || obj["valor"] || obj["valor_imovel"] || "";
        const valorNum = parseCurrencyToNumber(raw_valor);
        const valorFormatted = valorNum !== null ? formatCurrencyBr(valorNum) : (raw_valor || "");
        const id_pre_cadastro = obj["id_pre_cadastro"] || "";
        const cliente = obj["cliente"] || "";
        const documento = obj["documento"] || "";
        const corretor = obj["corretor"] || "";
        const imobiliaria = obj["imobiliaria"] || "";
        const situacao = obj["situacao"] || obj["situação"] || "Disponível";
        const coord_x = obj["coord_x"] || "";
        const coord_y = obj["coord_y"] || "";
        const simbolo = obj["simbolo"] || "";

        // Retorna exatamente 15 colunas (A..O)
        return [
          etapa,
          bloco,
          nome_unidade,
          areaFormatted,
          tipologia,
          valorFormatted,
          id_pre_cadastro,
          cliente,
          documento,
          corretor,
          imobiliaria,
          situacao,
          coord_x,
          coord_y,
          simbolo,
        ];
      }

      // Detecta se é XLSX ou CSV
      if (
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        req.file.originalname.endsWith(".xlsx")
      ) {
        console.log("📥 [IMPORT UNIDADES] Processando arquivo XLSX...");

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log("📥 [IMPORT UNIDADES] Total de linhas no XLSX:", jsonData.length);

        const headerRow = jsonData[0] || [];
        const normalizedHeaders = headerRow.map(normalizeHeader);

        const rows = jsonData.slice(1).filter((row) => {
          return (
            row &&
            row.length > 0 &&
            row.some((cell) => cell !== null && cell !== undefined && cell !== "")
          );
        });

        // Converte cada row em objeto usando o header
        const objs = rows.map((row) => {
          const obj = {};
          for (let i = 0; i < normalizedHeaders.length; i++) {
            if (normalizedHeaders[i]) obj[normalizedHeaders[i]] = row[i] !== undefined ? row[i] : "";
          }
          return obj;
        });

        dataLines = objs.map((o) => buildSheetRowFromObj(o));

        console.log("📥 [IMPORT UNIDADES] Linhas de dados após filtro:", dataLines.length);
      } else {
        console.log("📥 [IMPORT UNIDADES] Processando arquivo CSV...");

        const csvContent = req.file.buffer.toString("utf-8");
        const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());

        // Detecta delimitador pela primeira linha
        const first = lines[0] || "";
        let delimiter = ";";
        if (first.includes("\t")) delimiter = "\t";
        else if (first.includes(";")) delimiter = ";";
        else if (first.includes(",")) delimiter = ",";

        const headerLine = lines[0];
        const headerParts = splitCsvLine(headerLine, delimiter).map(normalizeHeader);
        const hasHeader = headerParts.some((h) => h && h.includes("etapa"));
        const dataRows = hasHeader ? lines.slice(1) : lines;

        console.log("📥 [IMPORT UNIDADES] Linhas de dados:", dataRows.length);

        const objs = dataRows.map((ln) => {
          const parts = splitCsvLine(ln, delimiter);
          const obj = {};
          if (hasHeader) {
            for (let i = 0; i < headerParts.length; i++) {
              if (headerParts[i]) obj[headerParts[i]] = parts[i] !== undefined ? parts[i] : "";
            }
          } else {
            // Sem header — assume ordem do usuário: ETAPA,BLOCO,UNIDADE,AREA,TIPOLOGIA,SITUACAO,VALOR_DO_IMOVEL
            obj["etapa"] = parts[0] || "";
            obj["bloco"] = parts[1] || "";
            obj["unidade"] = parts[2] || "";
            obj["area_privativa"] = parts[3] || "";
            obj["tipologia"] = parts[4] || "";
            obj["situacao"] = parts[5] || "";
            obj["valor_do_imovel"] = parts[6] || "";
          }
          return obj;
        });

        dataLines = objs.map((o) => buildSheetRowFromObj(o));
      }

      const unidadesToInsert = dataLines.filter((cols) => Array.isArray(cols) && cols.length >= 3 && cols[0] && cols[1] && cols[2]);

      // Garantir exatamente 15 colunas (A..O) por linha antes de gravar
      const EXPECTED_COLS = 15;
      const sanitizedUnidades = unidadesToInsert.map((row, idx) => {
        const r = Array.isArray(row) ? row.slice(0, EXPECTED_COLS) : [];
        if (r.length > EXPECTED_COLS) {
          console.warn(`⚠️ [IMPORT UNIDADES] Linha ${idx + 1} foi truncada de ${r.length} para ${EXPECTED_COLS} colunas.`);
        }
        while (r.length < EXPECTED_COLS) r.push("");
        return r;
      });

      if (sanitizedUnidades.length === 0) {
        return res
          .status(400)
          .json({ error: "Nenhuma unidade válida encontrada no arquivo." });
      }

      console.log(
        "📥 [IMPORT UNIDADES] Unidades a inserir:",
        sanitizedUnidades.length
      );

      // 1. LIMPA dados existentes (mantém apenas o cabeçalho)
      console.log("🗑️ [IMPORT UNIDADES] Limpando dados existentes...");

      // Busca quantas linhas existem
      const existingData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${implantacao}'!A:O`,
      });

      const existingRowCount = existingData.data.values?.length || 0;

      if (existingRowCount > 1) {
        // Limpa da linha 2 em diante (preserva cabeçalho)
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
          range: `'${implantacao}'!A2:O${existingRowCount}`,
        });
        console.log(
          `✅ [IMPORT UNIDADES] ${
            existingRowCount - 1
          } linhas antigas removidas`
        );
      }

      // 2. Insere novos dados no Google Sheets (fonte primária)
      const appendResult = await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${implantacao}'!A2:O${sanitizedUnidades.length + 1}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: sanitizedUnidades,
        },
      });

      console.log("✅ [IMPORT UNIDADES] Importação no Sheets concluída");

      // 3. NOVO: Sincronizar com Supabase (limpa e reinsere)
      if (supabase) {
        try {
          console.log(
            "🔄 [IMPORT UNIDADES] Iniciando sincronização com Supabase..."
          );

          // Busca o ID da implantação no Supabase
          const { data: implData, error: implError } = await supabase
            .from("implantacoes")
            .select("id")
            .eq("nome", implantacao)
            .limit(1)
            .single();

          if (implError || !implData) {
            console.warn(
              `⚠️ [IMPORT UNIDADES] Implantação '${implantacao}' não encontrada no Supabase. Sync ignorado.`
            );
          } else {
            const implantacao_id = implData.id;

            // LIMPA unidades existentes desta implantação no Supabase
            console.log(
              "🗑️ [IMPORT UNIDADES] Limpando unidades existentes no Supabase..."
            );
            const { error: deleteError } = await supabase
              .from("unidades")
              .delete()
              .eq("implantacao_id", implantacao_id);

            if (deleteError) {
              console.error(
                "❌ [IMPORT UNIDADES] Erro ao limpar Supabase:",
                deleteError.message
              );
            } else {
              console.log(
                "✅ [IMPORT UNIDADES] Unidades antigas removidas do Supabase"
              );
            }

            // Busca o número da linha inicial (sempre será 2 após limpeza)
            const startRow = 2;

            console.log(
              `📍 [IMPORT UNIDADES] Inserindo ${sanitizedUnidades.length} unidades no Supabase a partir da linha ${startRow}`
            );

            // Prepara os dados para inserção no Supabase (usar linhas sanitizadas)
            const supabaseUnits = sanitizedUnidades.map((row, index) => {
              const rowIndex = startRow + index;

              return {
                implantacao_id,
                row_index: rowIndex,
                etapa: row[0] || null, // A - etapa
                bloco: row[1] || null, // B - bloco
                nome_unidade: row[2] || `Unidade ${rowIndex}`, // C - nome_unidade
                area: (function(v){ try { const n = parseFloat(String(v).replace(/\s/g,'').replace(/m2|m²/gi,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,'')); return isNaN(n)?null:n }catch(e){return null}})(row[3]) || null, // D - area_privativa (numeric)
                tipo: row[4] || null, // E - tipologia
                valor: (function(v){ try { const s = String(v||'').replace(/\s/g,'').replace(/R\$|\$/g,'').replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,''); const n = parseFloat(s); return isNaN(n)?null:n }catch(e){return null}})(row[5]) || null, // F - valor_do_imovel (numeric)
                id_pre_cadastro: row[6] || null, // G
                cliente: row[7] || null, // H
                documento: row[8] || null, // I
                corretor: row[9] || null, // J
                imobiliaria: row[10] || null, // K
                situacao: row[11] || "Disponível", // L
                coord_x: row[12] || null, // M
                coord_y: row[13] || null, // N
                simbolo: row[14] || null, // O
                // Colunas antigas para compatibilidade
                area_privativa: row[3] || null,
                tipologia: row[4] || null,
              };
            });

            // Insere no Supabase em lote
            const { data: insertedData, error: insertError } = await supabase
              .from("unidades")
              .insert(supabaseUnits)
              .select();

            if (insertError) {
              console.error(
                "❌ [IMPORT UNIDADES] Erro ao inserir no Supabase:",
                insertError.message
              );
              // Não falha a importação se o Supabase der erro
            } else {
              console.log(
                `✅ [IMPORT UNIDADES] ${insertedData.length} unidades inseridas no Supabase`
              );
            }
          }
        } catch (supabaseError) {
          console.error(
            "❌ [IMPORT UNIDADES] Erro na sincronização com Supabase:",
            supabaseError.message
          );
          // Não falha a importação se o Supabase der erro
        }
      }

      console.log("✅ [IMPORT UNIDADES] Processo completo");

      // Broadcast para notificar que as unidades foram atualizadas
      await broadcastEvent(implantacao, "unitsImported", {
        imported: sanitizedUnidades.length,
        message: "Unidades importadas com sucesso",
      });

      res.json({
        success: true,
        message: `${sanitizedUnidades.length} unidades importadas com sucesso na planilha '${implantacao}' e sincronizadas com Supabase.`,
        imported: sanitizedUnidades.length,
      });
    } catch (error) {
      console.error("❌ [IMPORT UNIDADES] Erro:", error);
      res.status(500).json({
        error: "Falha ao importar unidades.",
        details: error.message,
      });
    }
  }
);

// mapCsvToSheets removed — parsing consolidated above (header-aware, CSV/XLSX)

// NOVO: Endpoint para sincronizar unidades existentes do Sheets → Supabase
app.post("/api/sync-sheets-to-supabase", verifyToken, async (req, res) => {
  try {
    console.log("🔄 [SYNC] Iniciando sincronização Sheets → Supabase");

    const { implantacao } = req.body;

    if (!implantacao) {
      return res
        .status(400)
        .json({ error: "Nome da implantação é obrigatório." });
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase não está configurado." });
    }

    const sheets = await getSheetsClient();

    // 1. Busca o ID da implantação no Supabase
    const { data: implData, error: implError } = await supabase
      .from("implantacoes")
      .select("id")
      .eq("nome", implantacao)
      .limit(1)
      .single();

    if (implError || !implData) {
      return res.status(404).json({
        error: `Implantação '${implantacao}' não encontrada no Supabase.`,
      });
    }

    const implantacao_id = implData.id;
    console.log("📍 [SYNC] Implantação ID:", implantacao_id);

    // 2. Busca todas as unidades do Google Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      range: `'${implantacao}'!A2:O`, // Ignora cabeçalho
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: "Nenhuma unidade encontrada no Sheets para sincronizar.",
        synced: 0,
      });
    }

    console.log(`📊 [SYNC] ${rows.length} linhas encontradas no Sheets`);

    // 3. Prepara os dados para inserção/atualização no Supabase
    const supabaseUnits = rows.map((row, index) => {
      const rowIndex = index + 2; // +2 porque linha 1 é cabeçalho

      return {
        implantacao_id,
        row_index: rowIndex,
        etapa: row[0] || null, // A
        bloco: row[1] || null, // B
        nome_unidade: row[2] || `Unidade ${rowIndex}`, // C
        area: (function(v){ try { const n = parseFloat(String(v).replace(/\s/g,'').replace(/m2|m²/gi,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,'')); return isNaN(n)?null:n }catch(e){return null}})(row[3]) || null, // D (numeric)
        tipo: row[4] || null, // E
        valor: (function(v){ try { const s = String(v||'').replace(/\s/g,'').replace(/R\$|\$/g,'').replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,''); const n = parseFloat(s); return isNaN(n)?null:n }catch(e){return null}})(row[5]) || null, // F (numeric)
        id_pre_cadastro: row[6] || null, // G
        cliente: row[7] || null, // H
        documento: row[8] || null, // I
        corretor: row[9] || null, // J
        imobiliaria: row[10] || null, // K
        situacao: row[11] || "Disponível", // L
        coord_x: row[12] || null, // M
        coord_y: row[13] || null, // N
        simbolo: row[14] || null, // O
        // Colunas antigas para compatibilidade
        area_privativa: row[3] || null,
        tipologia: row[4] || null,
      };
    });

    // 4. Limpa unidades existentes desta implantação no Supabase
    console.log("🗑️ [SYNC] Limpando unidades existentes no Supabase...");
    const { error: deleteError } = await supabase
      .from("unidades")
      .delete()
      .eq("implantacao_id", implantacao_id);

    if (deleteError) {
      throw new Error(`Erro ao limpar unidades: ${deleteError.message}`);
    }

    // 5. Insere todas as unidades no Supabase
    console.log("💾 [SYNC] Inserindo unidades no Supabase...");
    const { data: insertedData, error: insertError } = await supabase
      .from("unidades")
      .insert(supabaseUnits)
      .select();

    if (insertError) {
      throw new Error(`Erro ao inserir unidades: ${insertError.message}`);
    }

    console.log(`✅ [SYNC] ${insertedData.length} unidades sincronizadas`);

    res.json({
      success: true,
      message: `${insertedData.length} unidades sincronizadas do Sheets para o Supabase.`,
      synced: insertedData.length,
    });
  } catch (error) {
    console.error("❌ [SYNC] Erro:", error);
    res.status(500).json({
      error: "Falha ao sincronizar unidades.",
      details: error.message,
    });
  }
});

// Endpoint para contar unidades configuradas na planilha
app.get(
  "/api/implantacoes/:nome/unidades/count",
  verifyToken,
  async (req, res) => {
    try {
      const { nome } = req.params;
      console.log("📊 [COUNT UNIDADES] Contando unidades para:", nome);

      const sheets = await getSheetsClient();

      // Verifica se a aba existe
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
      });

      const existingSheet = spreadsheet.data.sheets.find(
        (s) => s.properties.title === nome
      );

      if (!existingSheet) {
        return res.json({ count: 0, configured: false });
      }

      // Busca dados da aba (ignora cabeçalho na linha 1)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_IMPLANTACAO,
        range: `'${nome}'!A2:O`,
      });

      const rows = response.data.values || [];
      const count = rows.filter((row) => row[0] || row[2]).length; // Conta linhas com etapa ou nome_unidade

      console.log("📊 [COUNT UNIDADES] Total:", count);

      res.json({ count, configured: count > 0 });
    } catch (error) {
      console.error("❌ [COUNT UNIDADES] Erro:", error);
      res.status(500).json({
        error: "Falha ao contar unidades.",
        details: error.message,
      });
    }
  }
);

// Endpoint para buscar clientes por implantacao_id
app.get("/api/clientes/:implantacao_id", verifyToken, async (req, res) => {
  try {
    const { implantacao_id } = req.params;

    if (!implantacao_id) {
      return res.status(400).json({ error: "implantacao_id é obrigatório." });
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado." });
    }

    const { data: clientes, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("implantacao_id", parseInt(implantacao_id, 10))
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      return res.status(500).json({
        error: "Falha ao buscar clientes.",
        details: error.message,
      });
    }

    res.json({ clientes: clientes || [] });
  } catch (error) {
    console.error("Erro no endpoint de busca de clientes:", error);
    res.status(500).json({
      error: "Falha ao buscar clientes.",
      details: error.message,
    });
  }
});

// Middleware global de tratamento de erros (DEVE VIR APÓS TODAS AS ROTAS)
app.use((err, req, res, next) => {
  console.error("❌❌❌ ERRO NÃO TRATADO ❌❌❌");
  console.error("Path:", req.method, req.path);
  console.error("Error:", err);
  console.error("Stack:", err.stack);

  res.status(500).json({
    error: "Erro interno do servidor",
    message: err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// =================================================================
// ENDPOINT: Importação de Clientes (XLSX → Supabase)
// =================================================================
app.post(
  "/api/import-clientes",
  verifyToken,
  upload.single("clientes"),
  async (req, res) => {
    try {
      console.log("📥 [IMPORT CLIENTES] Iniciando importação...");

      const { implantacao_id } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não fornecido." });
      }

      // Verifica se Supabase está configurado
      if (!supabase) {
        return res.status(500).json({
          error: "Supabase não está configurado no servidor.",
        });
      }

      console.log("📥 [IMPORT CLIENTES] Tipo de arquivo:", req.file.mimetype);
      console.log("📥 [IMPORT CLIENTES] Implantação ID:", implantacao_id);

      let dataLines = [];

      // Detecta se é XLSX
      if (
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        req.file.originalname.endsWith(".xlsx")
      ) {
        console.log("📥 [IMPORT CLIENTES] Processando arquivo XLSX...");

        // Parse XLSX
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Converte para array de arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log(
          "📥 [IMPORT CLIENTES] Total de linhas no XLSX:",
          jsonData.length
        );

        // Remove cabeçalho (primeira linha)
        dataLines = jsonData.slice(1).filter((row) => {
          // Remove linhas vazias
          return (
            row &&
            row.length > 0 &&
            row.some(
              (cell) => cell !== null && cell !== undefined && cell !== ""
            )
          );
        });

        console.log(
          "📥 [IMPORT CLIENTES] Linhas de dados após filtro:",
          dataLines.length
        );
      } else {
        return res.status(400).json({
          error: "Formato de arquivo não suportado. Use .xlsx",
        });
      }

      // Mapear XLSX → Supabase clientes table
      // Estrutura esperada: Id, Cliente, CPF/CNPJ, Corretor, Imobiliária
      const clientesToInsert = dataLines
        .map((cols) => {
          // Valida se há pelo menos as colunas básicas (Id, Cliente)
          if (!Array.isArray(cols) || cols.length < 2 || !cols[0] || !cols[1]) {
            console.log(
              "⚠️ [IMPORT CLIENTES] Linha ignorada (colunas insuficientes):",
              cols
            );
            return null;
          }

          const clientData = {
            id_pre_cadastro: String(cols[0] || "").trim(),
            nome: String(cols[1] || "").trim(),
            documento: String(cols[2] || "")
              .trim()
              .replace(/[^0-9]/g, ""), // Remove formatação
            corretor: String(cols[3] || "").trim(),
            imobiliaria: String(cols[4] || "").trim(),
            status: "PODE RESERVAR",
          };

          // Adiciona implantacao_id se foi fornecido
          if (implantacao_id) {
            clientData.implantacao_id = parseInt(implantacao_id, 10);
          }

          return clientData;
        })
        .filter((row) => row !== null); // Remove linhas inválidas

      if (clientesToInsert.length === 0) {
        return res
          .status(400)
          .json({ error: "Nenhum cliente válido encontrado no arquivo." });
      }

      console.log(
        "📥 [IMPORT CLIENTES] Clientes a inserir:",
        clientesToInsert.length
      );

      // TRUNCATE na tabela clientes (remove todos os registros)
      console.log("🗑️ [IMPORT CLIENTES] Limpando tabela clientes...");

      // Primeiro verifica se há dados na tabela
      const { count } = await supabase
        .from("clientes")
        .select("*", { count: "exact", head: true });

      if (count > 0) {
        // Usa gt (greater than) com um valor impossível de UUID para deletar tudo
        const { error: deleteError } = await supabase
          .from("clientes")
          .delete()
          .gte("created_at", "1970-01-01"); // Deleta tudo criado após 1970

        if (deleteError) {
          console.error(
            "❌ [IMPORT CLIENTES] Erro ao limpar tabela:",
            deleteError
          );
          return res.status(500).json({
            error: "Erro ao limpar tabela de clientes.",
            details: deleteError.message,
          });
        }
        console.log("✅ [IMPORT CLIENTES] Tabela clientes limpa");
      } else {
        console.log("ℹ️ [IMPORT CLIENTES] Tabela clientes já está vazia");
      }

      // Insert em lotes (Supabase tem limite de 1000 registros por request)
      const batchSize = 1000;
      let totalInserted = 0;

      for (let i = 0; i < clientesToInsert.length; i += batchSize) {
        const batch = clientesToInsert.slice(i, i + batchSize);
        console.log(
          `📥 [IMPORT CLIENTES] Inserindo lote ${
            Math.floor(i / batchSize) + 1
          }...`
        );

        const { data: insertData, error: insertError } = await supabase
          .from("clientes")
          .insert(batch);

        if (insertError) {
          console.error(
            "❌ [IMPORT CLIENTES] Erro ao inserir lote:",
            insertError
          );
          return res.status(500).json({
            error: "Erro ao inserir clientes no Supabase.",
            details: insertError.message,
            insertedSoFar: totalInserted,
          });
        }

        totalInserted += batch.length;
        console.log(
          `✅ [IMPORT CLIENTES] Lote inserido. Total: ${totalInserted}`
        );
      }

      console.log(
        `✅ [IMPORT CLIENTES] Importação concluída. Total: ${totalInserted} clientes`
      );

      // Broadcast para notificar que os clientes foram importados
      // Se há implantacao_id, usa o nome da implantação; senão, broadcast genérico
      if (implantacao_id) {
        try {
          const { data: implData } = await supabase
            .from("implantacoes")
            .select("nome")
            .eq("id", parseInt(implantacao_id, 10))
            .single();

          if (implData?.nome) {
            await broadcastEvent(implData.nome, "clientsImported", {
              total: totalInserted,
              message: "Clientes importados com sucesso",
            });
          }
        } catch (e) {
          console.warn(
            "[IMPORT CLIENTES] Falha ao enviar broadcast:",
            e.message
          );
        }
      }

      res.json({
        success: true,
        message: `${totalInserted} clientes importados com sucesso.`,
        total: totalInserted,
      });
    } catch (error) {
      console.error("❌ [IMPORT CLIENTES] Erro:", error);
      res.status(500).json({
        error: "Erro ao importar clientes.",
        details: error.message,
      });
    }
  }
);

// ESTA LINHA DEVE SER SEMPRE A ÚLTIMA ANTES DE EXPORTAR O MÓDULO (SE APLICÁVEL)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Servidor rodando na porta ${PORT}`);
  console.log(`✓ Acesse em http://localhost:${PORT}`);

  // Inicia listeners Realtime para pagamentos (não bloqueante)
  try {
    setupPagamentosRealtime();
  } catch (e) {
    console.warn('[REALTIME] falha ao iniciar listeners de pagamentos:', e && e.message ? e.message : e);
  }
});

// Endpoint de teste para upload ao Supabase Storage
app.post(
  "/api/test-upload",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("[TEST-UPLOAD] headers authorization:", req.headers.authorization ? req.headers.authorization.slice(0, 30) + '...' : '(nenhum)');
      console.log("[TEST-UPLOAD] req.file:", req.file ? { originalname: req.file.originalname, size: req.file.size || (req.file.buffer && req.file.buffer.length) } : null);

      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado no campo 'file'" });
      }

      const result = await uploadFileToSupabaseStorage("implantacoes", req.file, "test_");
      return res.json({ success: true, publicUrl: result.publicUrl, filename: result.filename });
    } catch (e) {
      console.error("[TEST-UPLOAD] erro:", e && e.message ? e.message : e);
      return res.status(500).json({ error: "Falha no upload de teste", details: e && e.message ? e.message : String(e) });
    }
  }
);