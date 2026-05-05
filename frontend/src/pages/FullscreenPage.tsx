// src/pages/FullscreenPage.tsx
// Página pública de visualização fullscreen das unidades com suporte a camadas primária/adicional
// Dados são buscados 100% do Supabase com Realtime para atualizações instantâneas

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BlockMappingOverlay } from "../../components/BlockMappingOverlay";
import { FullscreenAdOverlay } from "../../components/FullscreenAdOverlay";
import {
  normalizePropagandaRuntime,
  type PropagandaRuntime,
} from "../types/propaganda";

interface UnitData {
  etapa: string;
  bloco: string;
  nome_unidade: string;
  area_privativa: string;
  tipologia: string;
  id_pre_cadastro: string;
  cliente: string;
  documento: string;
  corretor: string;
  imobiliaria: string;
  situacao: string;
  coord_x: string;
  coord_y: string;
  coord_x_ad: string;
  coord_y_ad: string;
  implantacao_ref: string;
  simbolo: string;
  raw: string[];
}

interface BlockMapping {
  id?: string;
  nome_bloco: string;
  x: number;
  y: number;
  width: number;
  height: number;
  implantacao_ref?: string;
}

interface BlockStats {
  total: number;
  reservadas: number;
  bloqueadas: number;
  disponiveis: number;
}

interface ImplantacaoData {
  unidades: string[][];
  imageUrl: string;
  imageUrlAdicional?: string;
  dotSize: number;
  sigla?: string;
  sheetTitle?: string;
}

function normalizeSearchValue(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickAvailableImageUrl(
  data: Pick<ImplantacaoData, "imageUrl" | "imageUrlAdicional"> | null,
  layer: "primary" | "additional"
): string {
  if (!data) return "";

  const primary = String(data.imageUrl || "").trim();
  const additional = String(data.imageUrlAdicional || "").trim();

  if (layer === "additional") {
    return additional || primary || "";
  }

  return primary || additional || "";
}

export function FullscreenPage() {
  const [searchParams] = useSearchParams();
  const implantacao = searchParams.get("implantacao") || "";
  const adicionalParam = searchParams.get("adicional")?.toLowerCase() === "true";

  const [activeLayer, setActiveLayer] = useState<"primary" | "additional">(
    adicionalParam ? "additional" : "primary"
  );
  const [data, setData] = useState<ImplantacaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("Conectando...");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Controles visuais
  const [dotSize, setDotSize] = useState(() => {
    const saved = localStorage.getItem(`dot-size-${implantacao}`);
    return saved ? parseInt(saved, 10) : 16;
  });
  const [colorDisponivel, setColorDisponivel] = useState(
    localStorage.getItem("dot-color-disponivel") || "#6ad700"
  );
  const [colorReservada, setColorReservada] = useState(
    localStorage.getItem("dot-color-Reservada") || "#d9534f"
  );
  const [hideDisponivel, setHideDisponivel] = useState(
    localStorage.getItem("hide-disponivel") === "true"
  );
  const [showControls, setShowControls] = useState(true);
  const [showCursor, setShowCursor] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [implantacaoId, setImplantacaoId] = useState<number | null>(null);
  const [propagandaRuntime, setPropagandaRuntime] = useState<PropagandaRuntime | null>(
    null
  );

  // Estados para blocos vendidos
  const [blockMappings, setBlockMappings] = useState<BlockMapping[]>([]);

  // Touch/pinch zoom state
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isPanningTouch, setIsPanningTouch] = useState(false);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const propagandaChannelRef = useRef<RealtimeChannel | null>(null);
  const autoRefreshRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef<boolean>(false);  // Controle para evitar múltiplas chamadas simultâneas
  const dataRef = useRef<ImplantacaoData | null>(null);  // Ref para acessar data atual sem causar re-render

  // Parse unidades to structured format
  const parsedUnidades = useMemo((): UnitData[] => {
    if (!data?.unidades) return [];

    // Remove header if present
    const rows =
      data.unidades.length > 0 &&
      data.unidades[0][0]?.toString().toLowerCase().includes("etapa")
        ? data.unidades.slice(1)
        : data.unidades;

    return rows.map((u) => ({
      etapa: u[1] || "",                   // B - etapa
      bloco: u[3] || "",                   // D - bloco
      nome_unidade: u[2] || "",            // C - nome_unidade
      area_privativa: u[5] || "",          // F - area_privativa
      tipologia: u[4] || "",               // E - tipologia
      id_pre_cadastro: u[6] || "",         // G - id_pre_cadastro
      cliente: u[7] || "",                 // H - cliente
      documento: u[8] || "",               // I - documento
      corretor: u[9] || "",                // J - corretor
      imobiliaria: u[10] || "",            // K - imobiliaria
      situacao: u[11] || "Disponível",     // L - situacao
      coord_x: u[12] || "",                // M - coord_x
      coord_y: u[13] || "",                // N - coord_y
      coord_x_ad: u[14] || "",             // O - coord_x_ad
      coord_y_ad: u[15] || "",             // P - coord_y_ad
      implantacao_ref: u[16] || "",        // Q - implantacao_ref
      simbolo: u[18] || "",                // S - simbolo
      raw: u,
    }));
  }, [data?.unidades]);

  // Filter units by active layer
  const filteredUnidades = useMemo(() => {
    const primaryOwnerLower = implantacao.toLowerCase();
    const additionalOwnerLower = `${primaryOwnerLower}+adicional`;

    console.log("[Fullscreen] Filtering units:", {
      total: parsedUnidades.length,
      activeLayer,
      implantacao,
    });

    const filtered = parsedUnidades.filter((unit) => {
      const owner = (unit.implantacao_ref || "").trim();
      const ownerLower = owner.toLowerCase();
      const coordX = unit.coord_x;
      const coordY = unit.coord_y;

      // Skip units without coordinates
      if (!coordX && coordX !== "0") return false;
      if (!coordY && coordY !== "0") return false;

      // Se não há owner definido (legado), mostrar na camada primária
      if (!owner || owner === "") {
        return activeLayer === "primary";
      }

      if (activeLayer === "additional") {
        // Show units that belong to additional layer
        const isAdditional =
          ownerLower === additionalOwnerLower ||
          ownerLower.endsWith("+adicional") ||
          ownerLower.includes("adicional");
        return isAdditional;
      } else {
        // Show units that belong to primary layer
        const isAdditional =
          ownerLower.includes("adicional") ||
          ownerLower.includes("+adicional");
        if (isAdditional) return false;
        // Aceitar se owner contém o nome da implantação (case-insensitive)
        return ownerLower.includes(primaryOwnerLower) || ownerLower === primaryOwnerLower;
      }
    });

    console.log("[Fullscreen] Filtered result:", filtered.length, "units");
    return filtered;
  }, [parsedUnidades, activeLayer, implantacao]);

  // Calcular estatísticas de blocos para overlay de vendido
  const blockStats = useMemo<Record<string, BlockStats>>(() => {
    const stats: Record<string, BlockStats> = {};
    
    if (!data?.unidades) return stats;
    
    data.unidades.forEach((unidade) => {
      const bloco = unidade[3]; // Coluna D - bloco
      const etapa = unidade[1]; // Coluna B - etapa
      const situacao = (unidade[11] || "Disponível")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
      
      if (!bloco || bloco.trim() === "") return;
      
      // Concatenar bloco + etapa para criar chave única
      const blocoKey = etapa && etapa.trim() !== "" ? `${bloco} - ${etapa}` : bloco;
      
      if (!stats[blocoKey]) {
        stats[blocoKey] = { total: 0, reservadas: 0, bloqueadas: 0, disponiveis: 0 };
      }
      
      stats[blocoKey].total++;
      
      if (situacao === "reservada") {
        stats[blocoKey].reservadas++;
      } else if (situacao === "bloqueada") {
        stats[blocoKey].bloqueadas++;
      } else if (situacao === "disponivel") {
        stats[blocoKey].disponiveis++;
      }
    });
    
    return stats;
  }, [data?.unidades]);

  // Atualizar ref quando data mudar
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadPropagandaRuntime = useCallback(async () => {
    try {
      const { data: runtimeData, error: runtimeError } = await supabase
        .from("propaganda_runtime")
        .select("*")
        .eq("scope", "global")
        .maybeSingle();

      if (runtimeError) {
        throw runtimeError;
      }

      setPropagandaRuntime(
        normalizePropagandaRuntime(
          (runtimeData || null) as Record<string, unknown> | null
        )
      );
    } catch (runtimeError) {
      console.error("[Fullscreen] Erro ao carregar runtime de propaganda:", runtimeError);
    }
  }, []);

  // Carregar mapeamentos de blocos vendidos
  useEffect(() => {
    const loadBlockMappings = async () => {
      if (!implantacaoId || !implantacao) return;
      
      const currentLayerRef = activeLayer === "additional"
        ? `${implantacao}+adicional`
        : implantacao;
      
      try {
        const { data: mappings, error } = await supabase
          .from("blocos_mapping")
          .select("*")
          .eq("implantacao_id", implantacaoId)
          .eq("implantacao_ref", currentLayerRef);
        
        if (error) throw error;
        setBlockMappings(mappings || []);
      } catch (error) {
        console.error("Erro ao carregar mapeamentos de blocos:", error);
      }
    };
    
    loadBlockMappings();
  }, [implantacaoId, implantacao, activeLayer]);

  // Fetch data function - busca 100% do Supabase com retry logic
  const fetchData = useCallback(async (isRefresh = false) => {
    if (!implantacao) return;

    // Evitar múltiplas chamadas simultâneas
    if (isFetchingRef.current) {
      console.log("[Fullscreen] Fetch já em andamento, ignorando chamada duplicada");
      return;
    }

    isFetchingRef.current = true;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Fullscreen] Tentativa ${attempt}/${MAX_RETRIES} - Buscando dados do Supabase para:`, implantacao);
        
        // 1. Buscar implantação pelo nome ou sigla
        // Busca todas as correspondências e pega a primeira (ordenado por nome para pegar TORRE 1 antes de TORRE 2)
        const normalizedSearch = normalizeSearchValue(implantacao);
        const { data: implList, error: implError } = await supabase
          .from("implantacoes")
          .select("id, nome, imagem_url, imagem_url_adicional, dot_size, sigla")
          .or(`sigla.ilike.%${implantacao}%,nome.ilike.%${implantacao}%`)
          .order("nome", { ascending: true });

        if (implError) {
          console.error(`[Fullscreen] Erro ao buscar implantação (tentativa ${attempt}):`, implError);
          throw implError;
        }

        const rankedImplantacoes = (implList || []).sort((left, right) => {
          const leftName = normalizeSearchValue(left.nome || left.sigla || "");
          const rightName = normalizeSearchValue(right.nome || right.sigla || "");
          const leftExact = leftName === normalizedSearch ? 0 : leftName.includes(normalizedSearch) ? 1 : 2;
          const rightExact = rightName === normalizedSearch ? 0 : rightName.includes(normalizedSearch) ? 1 : 2;
          return leftExact - rightExact;
        });

        if (!rankedImplantacoes || rankedImplantacoes.length === 0) {
          console.error(`[Fullscreen] Implantação não encontrada (tentativa ${attempt})`);
          // Se é refresh e já temos dados, não mostrar erro crítico
          if (isRefresh && dataRef.current) {
            console.log("[Fullscreen] Mantendo dados existentes após erro de refresh");
            setConnectionStatus("Erro ao atualizar (mantendo dados)");
            isFetchingRef.current = false;
            return;
          }
          throw new Error(`Implantação "${implantacao}" não encontrada no banco de dados`);
        }

        // Se encontrou múltiplas, logar e pegar a primeira (TORRE 1 vem antes de TORRE 2 em ordem alfabética)
        if (rankedImplantacoes.length > 1) {
          console.log("[Fullscreen] Múltiplas implantações encontradas:", rankedImplantacoes.map(i => i.nome));
        }
        
        const implData = rankedImplantacoes[0];

        console.log("[Fullscreen] Implantação encontrada:", implData.nome, "ID:", implData.id);
        console.log("[Fullscreen] Imagem URL:", implData.imagem_url);
        console.log("[Fullscreen] Imagem URL Adicional:", implData.imagem_url_adicional);
        setImplantacaoId(implData.id);

        // 2. Buscar todas as unidades dessa implantação
        const { data: unidadesData, error: unidadesError } = await supabase
          .from("unidades")
          .select("*")
          .eq("implantacao_id", implData.id)
          .order("row_index", { ascending: true });

        if (unidadesError) {
          console.error(`[Fullscreen] Erro ao buscar unidades (tentativa ${attempt}):`, unidadesError);
          throw unidadesError;
        }

        console.log("[Fullscreen] Unidades encontradas:", unidadesData?.length || 0);

        // 3. Converter unidades do formato Supabase para o formato esperado (array de arrays)
        // Mantém compatibilidade com estrutura de colunas do Google Sheets
        const unidadesArray = (unidadesData || []).map((u) => [
          u.row_index?.toString() || "",    // 0  A - row_index
          u.etapa || "",                    // 1  B - etapa
          u.nome_unidade || "",             // 2  C - nome_unidade
          u.bloco || "",                    // 3  D - bloco
          u.tipologia || "",                // 4  E - tipologia
          u.area_privativa || "",           // 5  F - area_privativa
          u.id_pre_cadastro || "",          // 6  G - id_pre_cadastro
          u.cliente || "",                  // 7  H - cliente
          u.documento || "",                // 8  I - documento
          u.corretor || "",                 // 9  J - corretor
          u.imobiliaria || "",              // 10 K - imobiliaria
          u.situacao || "Disponível",       // 11 L - situacao
          u.coord_x?.toString() || "",      // 12 M - coord_x
          u.coord_y?.toString() || "",      // 13 N - coord_y
          u.coord_x_ad?.toString() || "",   // 14 O - coord_x_ad
          u.coord_y_ad?.toString() || "",   // 15 P - coord_y_ad
          u.implantacao_ref || "",          // 16 Q - implantacao_ref
          "",                               // 17 R - placeholder
          u.simbolo || "",                  // 18 S - simbolo
          u.motivo || "",                   // 19 T - motivo
        ]);

        // 4. Montar objeto de dados no formato esperado
        const newData: ImplantacaoData = {
          unidades: unidadesArray,
          imageUrl: implData.imagem_url || "",
          imageUrlAdicional: implData.imagem_url_adicional || "",
          dotSize: implData.dot_size || 16,
          sigla: implData.sigla || "",
          sheetTitle: implData.nome,
        };

        // 5. Salvar no cache local
        try {
          localStorage.setItem(`fullscreen-cache-${implantacao}`, JSON.stringify(newData));
          localStorage.setItem(`fullscreen-cache-timestamp-${implantacao}`, Date.now().toString());
        } catch (cacheErr) {
          console.warn("[Fullscreen] Erro ao salvar cache:", cacheErr);
        }

        setData(newData);
        
        // Usar dotSize do localStorage se existir, senão usar o do Supabase
        const savedDotSize = localStorage.getItem(`dot-size-${implantacao}`);
        if (!savedDotSize) {
          setDotSize(newData.dotSize);
        }
        
        setLastUpdated(new Date());
        setError(null);
        setConnectionStatus("Conectado");
        console.log("[Fullscreen] Dados carregados com sucesso do Supabase");
        
        // Sucesso - sair do loop de retry
        if (setLoading) setLoading(false);
        isFetchingRef.current = false;
        return;
        
      } catch (err) {
        console.error(`[Fullscreen] Erro na tentativa ${attempt}/${MAX_RETRIES}:`, err);
        
        // Se não é a última tentativa, aguardar antes de tentar novamente
        if (attempt < MAX_RETRIES) {
          console.log(`[Fullscreen] Aguardando ${RETRY_DELAY}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        
        // Última tentativa falhou
        console.error("[Fullscreen] Todas as tentativas falharam");
        
        // Tentar carregar do cache local como fallback
        try {
          const cachedData = localStorage.getItem(`fullscreen-cache-${implantacao}`);
          const cachedTimestamp = localStorage.getItem(`fullscreen-cache-timestamp-${implantacao}`);
          
          if (cachedData) {
            const parsedCache = JSON.parse(cachedData);
            setData(parsedCache);
            
            const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp, 10) : 0;
            const cacheAgeMinutes = Math.floor(cacheAge / 60000);
            
            console.log(`[Fullscreen] Usando dados do cache (${cacheAgeMinutes} minutos atrás)`);
            setConnectionStatus(`Offline - Cache (${cacheAgeMinutes}min atrás)`);
            setError(null);
            
            if (setLoading) setLoading(false);
            isFetchingRef.current = false;
            return;
          }
        } catch (cacheErr) {
          console.error("[Fullscreen] Erro ao carregar cache:", cacheErr);
        }
        
        // Se é refresh e já temos dados, manter os dados existentes
        if (isRefresh && dataRef.current) {
          console.log("[Fullscreen] Mantendo dados existentes após falha de refresh");
          setConnectionStatus("Erro ao atualizar (mantendo dados)");
          isFetchingRef.current = false;
          return;
        }
        
        const message = err instanceof Error ? err.message : "Não foi possível carregar os dados. Verifique sua conexão.";
        setError(message);
        setConnectionStatus("Desconectado");
      } finally {
        if (setLoading) setLoading(false);
        isFetchingRef.current = false;
      }
    }
  }, [implantacao]);

  // Supabase Realtime - Subscribe to unidades table
  useEffect(() => {
    if (!implantacaoId) {
      console.log("[Realtime] Aguardando implantacaoId...");
      return;
    }

    console.log("[Realtime] Configurando subscription para implantacao_id:", implantacaoId);

    const channel = supabase
      .channel(`unidades-fullscreen-${implantacaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "unidades",
          filter: `implantacao_id=eq.${implantacaoId}`,
        },
        (payload) => {
          console.log("[Realtime] Evento recebido:", payload);
          
          const eventType = payload.eventType;
          const newRecord = payload.new as Record<string, unknown> | null;
          const oldRecord = payload.old as Record<string, unknown> | null;

          if (eventType === "UPDATE" && newRecord) {
            const nomeUnidade = newRecord.nome_unidade as string || "";
            const situacao = newRecord.situacao as string || "Disponível";
            console.log(`[Realtime] UPDATE - Unidade: ${nomeUnidade}, Status: ${situacao}`);
            
            // Recarregar dados completos (isRefresh = true para não limpar em caso de erro)
            fetchData(true);
            setConnectionStatus("Atualizado em tempo real");
          } else if (eventType === "INSERT" && newRecord) {
            console.log("[Realtime] INSERT - Nova unidade:", newRecord.nome_unidade);
            fetchData(true);
          } else if (eventType === "DELETE" && oldRecord) {
            console.log("[Realtime] DELETE - Unidade removida:", oldRecord.nome_unidade);
            fetchData(true);
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Status da subscription:", status);
        if (status === "SUBSCRIBED") {
          setConnectionStatus("Conectado em tempo real");
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("Erro na conexão");
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      console.log("[Realtime] Removendo subscription...");
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implantacaoId]);

  useEffect(() => {
    loadPropagandaRuntime();

    const channel = supabase
      .channel("propaganda-runtime-fullscreen")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "propaganda_runtime",
          filter: "scope=eq.global",
        },
        (payload) => {
          console.log("[Fullscreen] Runtime de propaganda atualizado:", payload);
          const nextRuntime = normalizePropagandaRuntime(
            (payload.new || payload.old || null) as Record<string, unknown> | null
          );
          setPropagandaRuntime(nextRuntime);
        }
      )
      .subscribe((status) => {
        console.log("[Fullscreen] Status Realtime propaganda:", status);
      });

    propagandaChannelRef.current = channel;

    return () => {
      if (propagandaChannelRef.current) {
        supabase.removeChannel(propagandaChannelRef.current);
      }
    };
  }, [loadPropagandaRuntime]);

  // Initial load
  useEffect(() => {
    if (!implantacao) {
      setError('Parâmetro "implantacao" não encontrado na URL.');
      setLoading(false);
      return;
    }

    // Fazer fetch inicial apenas uma vez
    fetchData();

    // Auto-refresh every 30 seconds (fallback) - usa isRefresh = true
    autoRefreshRef.current = window.setInterval(() => {
      console.log("[Fullscreen] Auto-refresh (30s)");
      fetchData(true);
    }, 30000);

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implantacao]);

  // Ocultar barra de rolagem do navegador (mantendo funcionalidade do scroll)
  useEffect(() => {
    // Criar estilo para esconder scrollbar mas manter scroll
    const style = document.createElement('style');
    style.id = 'hide-scrollbar-style';
    style.textContent = `
      html, body {
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
      }
      html::-webkit-scrollbar, body::-webkit-scrollbar {
        display: none; /* Chrome/Safari/Opera */
        width: 0;
        height: 0;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      const existingStyle = document.getElementById('hide-scrollbar-style');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Toggle controles ao clicar/tocar na tela
  const toggleControls = () => {
    setShowControls(prev => !prev);
  };

  // Mostrar controles e cursor ao mover o mouse (para PC)
  useEffect(() => {
    let mouseTimeout: number | null = null;
    
    const handleMouseMove = () => {
      setShowControls(true);
      setShowCursor(true);
      
      // Limpar timeout anterior
      if (mouseTimeout) {
        clearTimeout(mouseTimeout);
      }
      
      // Ocultar após 3 segundos sem movimento
      mouseTimeout = window.setTimeout(() => {
        setShowControls(false);
        setShowCursor(false);
      }, 3000);
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (mouseTimeout) {
        clearTimeout(mouseTimeout);
      }
    };
  }, []);

  // Save colors to localStorage
  useEffect(() => {
    localStorage.setItem("dot-color-disponivel", colorDisponivel);
    localStorage.setItem("dot-color-Reservada", colorReservada);
  }, [colorDisponivel, colorReservada]);

  // Save hide toggle to localStorage
  useEffect(() => {
    localStorage.setItem("hide-disponivel", String(hideDisponivel));
  }, [hideDisponivel]);

  // Save dot size to localStorage
  useEffect(() => {
    if (implantacao) {
      localStorage.setItem(`dot-size-${implantacao}`, String(dotSize));
    }
  }, [dotSize, implantacao]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Erro ao ativar fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Touch handlers for mobile pinch-to-zoom and pan
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevenir comportamento apenas se não for clique nos controles
    if ((e.target as HTMLElement).closest('[data-controls]')) return;

    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      setLastTouchDistance(getTouchDistance(e.touches));
      setIsPanningTouch(false);
    } else if (e.touches.length === 1) {
      // Touch simples - pode ser pan (se zoom > 1) ou toggle de controles
      setTouchStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      
      if (zoom > 1) {
        // Se com zoom, preparar para pan
        setIsPanningTouch(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      // Pinch zoom
      e.preventDefault();
      const newDistance = getTouchDistance(e.touches);
      const scale = newDistance / lastTouchDistance;
      
      setZoom((prev) => {
        const newZoom = prev * scale;
        return Math.min(Math.max(newZoom, 0.5), 5);
      });
      
      setLastTouchDistance(newDistance);
    } else if (e.touches.length === 1 && isPanningTouch && touchStartPos && zoom > 1) {
      // Pan com um dedo (quando zoom > 1)
      e.preventDefault();
      const deltaX = e.touches[0].clientX - touchStartPos.x;
      const deltaY = e.touches[0].clientY - touchStartPos.y;
      
      setPan(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      
      setTouchStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setLastTouchDistance(null);
    }
    
    if (e.touches.length === 0) {
      // Touch terminou - se não moveu muito, é um tap (toggle controles)
      if (touchStartPos && !isPanningTouch) {
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPos.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.y);
        
        // Se moveu menos de 10px, considerar como tap
        if (deltaX < 10 && deltaY < 10) {
          toggleControls();
        }
      }
      
      setIsPanningTouch(false);
      setTouchStartPos(null);
    }
  };

  // Get status color
  const getStatusColor = (status: string): string => {
    const normalizedStatus = status
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if (normalizedStatus === "disponivel") return colorDisponivel;
    if (normalizedStatus === "reservada" || normalizedStatus === "bloqueada")
      return colorReservada;
    return "#6c757d";
  };

  // Get image URL based on layer
  const currentImageUrl = useMemo(() => {
    return pickAvailableImageUrl(data, activeLayer);
  }, [data, activeLayer]);

  const hasAnyPlantImage = useMemo(() => {
    return Boolean(String(data?.imageUrl || "").trim() || String(data?.imageUrlAdicional || "").trim());
  }, [data]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#221f25",
          color: "#fff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <p style={{ padding: 20 }}>{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#221f25",
          color: "#fff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <>
      {/* Meta tag para sugerir orientação landscape */}
      <style>{`
        @media screen and (max-width: 768px) {
          body {
            transform: rotate(0deg);
          }
        }
      `}</style>
      
      <div
        style={{
          margin: 0,
          fontFamily: "Inter, system-ui, sans-serif",
          backgroundColor: "#221f25",
          color: "#fff",
          height: "100vh",
          overflow: "hidden",
          position: "relative",
        }}
      >
      <FullscreenAdOverlay runtime={propagandaRuntime} />

      {/* Top Bar - OVERLAY (não soma altura) */}
      <div
        data-controls
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "10px 16px",
          background: "rgba(11, 11, 11, 0.9)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderBottom: "1px solid #333",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(-100%)",
          pointerEvents: showControls ? "auto" : "none",
          zIndex: 1000,
        }}
      >
        <img
          src="/logo.png"
          alt="Logo"
          style={{ height: 30 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span style={{ fontSize: 18, fontWeight: 600 }}>
          Espelho - {implantacao}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: "#888" }}>
              Atualizado: {lastUpdated.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
          <span style={{ fontSize: 14, color: "#ccc" }}>
            {connectionStatus}
          </span>
        </div>

        {/* Layer Select - sempre mostra se houver imagem adicional OU se houver unidades com implantacao_ref adicional */}
        {(data?.imageUrlAdicional || parsedUnidades.some(u => u.implantacao_ref?.toLowerCase().includes('adicional'))) && (
          <select
            value={activeLayer}
            onChange={(e) =>
              setActiveLayer(e.target.value as "primary" | "additional")
            }
            style={{
              background: "#333",
              color: "#fff",
              border: "1px solid #555",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            <option value="primary">Camada Primária</option>
            <option value="additional">Camada Adicional</option>
          </select>
        )}

        {/* Refresh Button */}
        <button
          onClick={() => fetchData(true)}
          style={{
            background: "#333",
            border: "1px solid #555",
            color: "#fff",
            width: 36,
            height: 36,
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Atualizar dados"
        >
          🔄
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          style={{
            background: "#333",
            border: "1px solid #555",
            color: "#fff",
            width: 36,
            height: 36,
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Tela cheia"
        >
          ⛶
        </button>
      </div>

      {/* Floor Plan Wrapper - agora ocupa 100vh sempre */}
      <div
        ref={wrapperRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          overflow: zoom > 1 ? "auto" : "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#000",
          cursor: showCursor ? "default" : "none",
          touchAction: "none", // Desabilita gestos padrão do navegador para controle manual
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {hasAnyPlantImage ? (
          <div
            ref={imageContainerRef}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: "center center",
              transition: "transform 0.1s ease-out",
            }}
          >
            <img
              src={currentImageUrl}
              alt="Planta"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                opacity: 0.9,
                pointerEvents: "none",
                userSelect: "none",
              }}
              draggable={false}
              onError={(event) => {
                const target = event.currentTarget;
                const fallbackUrl = pickAvailableImageUrl(
                  {
                    imageUrl: activeLayer === "primary" ? "" : data?.imageUrl || "",
                    imageUrlAdicional:
                      activeLayer === "additional" ? "" : data?.imageUrlAdicional || "",
                  },
                  activeLayer
                );

                if (fallbackUrl && target.src !== fallbackUrl) {
                  target.src = fallbackUrl;
                  return;
                }

                target.style.display = "none";
              }}
            />

            {/* Overlay de blocos vendidos */}
            <BlockMappingOverlay
              blockMappings={blockMappings}
              blockStats={blockStats}
              activeLayer={activeLayer}
              implantacaoName={implantacao}
            />

            {/* Unit Indicators */}
            {filteredUnidades.map((unit, index) => {
              const normalizedStatus = unit.situacao
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();

              // Hide disponivel if toggle is on
              if (hideDisponivel && normalizedStatus === "disponivel") {
                return null;
              }

              return (
                <div
                  key={`unit-${index}-${unit.nome_unidade}`}
                  title={`Unidade: ${unit.nome_unidade}\nStatus: ${unit.situacao}`}
                  style={{
                    position: "absolute",
                    left: `${unit.coord_x}%`,
                    top: `${unit.coord_y}%`,
                    transform: "translate(-50%, -50%)",
                    width: dotSize,
                    height: dotSize,
                    borderRadius: "50%",
                    backgroundColor: getStatusColor(unit.situacao),
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    boxShadow: "0 0 8px rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "help",
                    transition: "background-color 0.3s ease",
                  }}
                >
                  {unit.simbolo && (
                    <span
                      style={{
                        fontSize: Math.max(dotSize * 0.25, 6),
                        fontWeight: "bold",
                        color: "white",
                        textShadow: "0 0 2px rgba(0, 0, 0, 0.5)",
                        pointerEvents: "none",
                      }}
                    >
                      {unit.simbolo}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              padding: 20,
              textAlign: "center",
            }}
          >
            <p>Nenhuma imagem da planta foi configurada para esta implantação.</p>
          </div>
        )}
      </div>

      {/* Dot Size Control */}
      <div
        data-controls
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          background: "rgba(0, 0, 0, 0.85)",
          padding: "12px 18px",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9999,
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          minWidth: 200,
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(20px)",
          pointerEvents: showControls ? "auto" : "none",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        <label
          style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center" }}
        >
          Tamanho do Ponto
        </label>
        <input
          type="range"
          min="5"
          max="50"
          value={dotSize}
          onChange={(e) => setDotSize(Number(e.target.value))}
          style={{ width: "100%", cursor: "pointer" }}
        />
        <div
          style={{
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            color: "#6ad700",
          }}
        >
          {dotSize}px
        </div>

        {/* Zoom Controls */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 8, paddingTop: 8 }}>
          <label
            style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center", display: "block" }}
          >
            Zoom: {Math.round(zoom * 100)}%
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.05, 0.5))}
              style={{
                flex: 1,
                padding: "6px",
                background: "#333",
                border: "1px solid #555",
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              −
            </button>
            <button
              onClick={resetZoom}
              style={{
                flex: 1,
                padding: "6px",
                background: "#333",
                border: "1px solid #555",
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              Reset
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.05, 5))}
              style={{
                flex: 1,
                padding: "6px",
                background: "#333",
                border: "1px solid #555",
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Color Control */}
      <div
        data-controls
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.85)",
          padding: "12px 18px",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          zIndex: 9999,
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(20px)",
          pointerEvents: showControls ? "auto" : "none",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={colorDisponivel}
            onChange={(e) => setColorDisponivel(e.target.value)}
            style={{ width: 30, height: 30, border: "none", cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "#ccc" }}>Disponível</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={colorReservada}
            onChange={(e) => setColorReservada(e.target.value)}
            style={{ width: 30, height: 30, border: "none", cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "#ccc" }}>Reservada</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <input
            type="checkbox"
            id="hide-disponivel"
            checked={hideDisponivel}
            onChange={(e) => setHideDisponivel(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <label
            htmlFor="hide-disponivel"
            style={{ fontSize: 12, color: "#ccc", cursor: "pointer" }}
          >
            Ocultar disponíveis
          </label>
        </div>
      </div>
    </div>
    </>
  );
}
