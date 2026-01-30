// src/pages/FullscreenPage.tsx
// Página pública de visualização fullscreen das unidades com suporte a camadas primária/adicional
// Dados são buscados 100% do Supabase com Realtime para atualizações instantâneas

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

interface ImplantacaoData {
  unidades: string[][];
  imageUrl: string;
  imageUrlAdicional?: string;
  dotSize: number;
  sigla?: string;
  sheetTitle?: string;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [implantacaoId, setImplantacaoId] = useState<number | null>(null);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const autoRefreshRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mouseTimeoutRef = useRef<number | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

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
      etapa: u[0] || "",
      bloco: u[1] || "",
      nome_unidade: u[2] || "",
      area_privativa: u[3] || "",
      tipologia: u[4] || "",
      id_pre_cadastro: u[6] || "",
      cliente: u[7] || "",
      documento: u[8] || "",
      corretor: u[9] || "",
      imobiliaria: u[10] || "",
      situacao: u[11] || "Disponível",
      coord_x: u[12] || "",
      coord_y: u[13] || "",
      coord_x_ad: u[14] || "",
      coord_y_ad: u[15] || "",
      implantacao_ref: u[16] || "",
      simbolo: u[18] || "",
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

  // Fetch data function - busca 100% do Supabase
  const fetchData = useCallback(async () => {
    if (!implantacao) return;

    try {
      console.log("[Fullscreen] Buscando dados do Supabase para:", implantacao);
      
      // 1. Buscar implantação pelo nome ou sigla
      // Busca todas as correspondências e pega a primeira (ordenado por nome para pegar TORRE 1 antes de TORRE 2)
      const { data: implList, error: implError } = await supabase
        .from("implantacoes")
        .select("id, nome, imagem_url, imagem_url_adicional, dot_size, sigla")
        .or(`sigla.ilike.${implantacao},nome.ilike.%${implantacao}%`)
        .order("nome", { ascending: true });

      if (implError || !implList || implList.length === 0) {
        console.error("[Fullscreen] Implantação não encontrada:", implError);
        setError("Implantação não encontrada");
        setLoading(false);
        return;
      }

      // Se encontrou múltiplas, logar e pegar a primeira (TORRE 1 vem antes de TORRE 2 em ordem alfabética)
      if (implList.length > 1) {
        console.log("[Fullscreen] Múltiplas implantações encontradas:", implList.map(i => i.nome));
      }
      
      const implData = implList[0];

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
        console.error("[Fullscreen] Erro ao buscar unidades:", unidadesError);
        throw unidadesError;
      }

      console.log("[Fullscreen] Unidades encontradas:", unidadesData?.length || 0);

      // 3. Converter unidades do formato Supabase para o formato esperado (array de arrays)
      const unidadesArray = (unidadesData || []).map((u) => [
        u.etapa || "",                    // 0
        u.bloco || "",                    // 1
        u.nome_unidade || "",             // 2
        u.area_privativa || "",           // 3
        u.tipologia || "",                // 4
        "",                               // 5 (vazio)
        u.id_pre_cadastro || "",          // 6
        u.cliente || "",                  // 7
        u.documento || "",                // 8
        u.corretor || "",                 // 9
        u.imobiliaria || "",              // 10
        u.situacao || "Disponível",       // 11
        u.coord_x?.toString() || "",      // 12
        u.coord_y?.toString() || "",      // 13
        u.coord_x_ad?.toString() || "",   // 14
        u.coord_y_ad?.toString() || "",   // 15
        u.implantacao_ref || "",          // 16
        "",                               // 17 (vazio)
        u.simbolo || "",                  // 18
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

      setData(newData);
      
      // Usar dotSize do localStorage se existir, senão usar o do Supabase
      const savedDotSize = localStorage.getItem(`dot-size-${implantacao}`);
      if (!savedDotSize) {
        setDotSize(newData.dotSize);
      }
      
      setLastUpdated(new Date());
      setError(null);
      console.log("[Fullscreen] Dados carregados com sucesso do Supabase");
      
    } catch (err) {
      console.error("Erro ao buscar dados do Supabase:", err);
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
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
            
            // Recarregar dados completos (mesmo comportamento do cron de 30s)
            fetchData();
            setConnectionStatus("Atualizado em tempo real");
          } else if (eventType === "INSERT" && newRecord) {
            console.log("[Realtime] INSERT - Nova unidade:", newRecord.nome_unidade);
            fetchData();
          } else if (eventType === "DELETE" && oldRecord) {
            console.log("[Realtime] DELETE - Unidade removida:", oldRecord.nome_unidade);
            fetchData();
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
  }, [implantacaoId]);

  // Initial load
  useEffect(() => {
    if (!implantacao) {
      setError('Parâmetro "implantacao" não encontrado na URL.');
      setLoading(false);
      return;
    }

    fetchData();

    // Auto-refresh every 30 seconds (fallback)
    autoRefreshRef.current = window.setInterval(() => {
      fetchData();
    }, 30000);

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [implantacao, fetchData]);

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

  // Fullscreen detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      // Ocultar controles imediatamente ao entrar em fullscreen
      // Mostrar controles ao sair do fullscreen
      setShowControls(!isNowFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Mostrar/ocultar controles ao mover o mouse no modo fullscreen
  useEffect(() => {
    const handleMouseMove = () => {
      if (!isFullscreen) return;

      // Mostrar controles
      setShowControls(true);

      // Limpar timeout anterior
      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }

      // Ocultar após 2 segundos sem movimento
      mouseTimeoutRef.current = window.setTimeout(() => {
        if (document.fullscreenElement) {
          setShowControls(false);
        }
      }, 2000);
    };

    if (isFullscreen) {
      document.addEventListener("mousemove", handleMouseMove);
      // Ocultar imediatamente ao entrar em fullscreen
      setShowControls(false);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }
    };
  }, [isFullscreen]);

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

  // Zoom handlers - clique esquerdo aumenta, clique direito diminui
  const handleClick = (e: React.MouseEvent) => {
    // Não aplicar zoom se clicar nos controles
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    
    if (e.button === 0) {
      // Clique esquerdo - aumenta zoom
      setZoom((prev) => Math.min(prev + 0.05, 5));
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Clique direito - diminui zoom
    setZoom((prev) => Math.max(prev - 0.05, 0.5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Iniciar pan com botão do meio ou se zoom > 1 com shift+clique
    if (e.button === 1 || (zoom > 1 && e.shiftKey && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
    if (!data) return "";
    if (activeLayer === "additional" && data.imageUrlAdicional) {
      return data.imageUrlAdicional;
    }
    return data.imageUrl;
  }, [data, activeLayer]);

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
    <div
      style={{
        margin: 0,
        fontFamily: "Inter, system-ui, sans-serif",
        backgroundColor: "#221f25",
        color: "#fff",
        height: "100vh",
        overflow: "auto",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          padding: "10px 16px",
          background: "#0b0b0b",
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderBottom: "1px solid #333",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(-100%)",
          pointerEvents: showControls ? "auto" : "none",
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
          onClick={fetchData}
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

      {/* Floor Plan Wrapper */}
      <div
        ref={wrapperRef}
        style={{
          position: "relative",
          width: "100%",
          height: isFullscreen ? "100vh" : "calc(100vh - 51px)",
          overflow: zoom > 1 ? "auto" : "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#000",
          cursor: isPanning ? "grabbing" : "zoom-in",
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {currentImageUrl ? (
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
              transition: isPanning ? "none" : "transform 0.1s ease-out",
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
          <p style={{ padding: 20 }}>Imagem da planta não configurada.</p>
        )}
      </div>

      {/* Dot Size Control */}
      <div
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
  );
}
