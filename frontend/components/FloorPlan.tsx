// src/components/FloorPlan.tsx - VERSÃO OTIMIZADA COM PERFORMANCE

import {
  type MouseEvent,
  useRef,
  useState,
  useEffect,
  useMemo,
  memo,
} from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch";
import { FiZoomIn, FiZoomOut, FiMaximize, FiRefreshCcw } from "react-icons/fi";
import { BlockMappingOverlay } from "./BlockMappingOverlay";
import { BlockDrawingOverlay } from "./BlockDrawingOverlay";

// Interface para mapeamento de blocos
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

// Interface atualizada com as novas props
interface FloorPlanProps {
  imageUrl: string;
  unidades: string[][];
  isMappingMode: boolean;
  unitToMapIndex: number | null;
  onMapClick: (x: number, y: number) => void;
  onUnitClick: (unitIndex: number) => void;
  dotSize: number;
  hideAvailable: boolean;
  unitLetter?: string;
  activeLayer?: "primary" | "additional";
  additionalImageUrl?: string;
  implantacao?: string;
  implantacaoPrimary?: string;
  implantacaoAdditional?: string;
  blockMappings?: BlockMapping[];
  blockStats?: Record<string, BlockStats>;
  isBlockMappingMode?: boolean;
  selectedBlockToMap?: string;
  onRectangleComplete?: (rect: { startX: number; startY: number; width: number; height: number }) => void;
  onBlockMappingPaste?: (blockName: string, rect: { startX: number; startY: number; width: number; height: number }) => void;
}

const Controls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <>
      <button
        onClick={() => zoomIn()}
        className="control-button"
        title="Aproximar"
      >
        <FiZoomIn size={20} color="#b0b0b0" />
      </button>
      <button
        onClick={() => zoomOut()}
        className="control-button"
        title="Afastar"
      >
        <FiZoomOut size={20} color="#b0b0b0" />
      </button>
      <button
        onClick={() => resetTransform()}
        className="control-button"
        title="Resetar Zoom"
      >
        <FiRefreshCcw size={20} color="#b0b0b0" />
      </button>
    </>
  );
};

export const FloorPlan = memo(function FloorPlan({
  imageUrl,
  unidades,
  isMappingMode,
  unitToMapIndex,
  onMapClick,
  onUnitClick,
  dotSize,
  hideAvailable,
  unitLetter,
  // add optional props with sensible defaults
  activeLayer = "primary",
  additionalImageUrl = "",
  implantacao = "",
  implantacaoPrimary = "",
  implantacaoAdditional = "",
  blockMappings = [],
  blockStats = {},
  isBlockMappingMode = false,
  selectedBlockToMap = "",
  onRectangleComplete,
  onBlockMappingPaste,
}: FloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimeout = useRef<number | null>(null);

  // Memoiza as unidades renderizáveis para evitar recálculos
  const renderedUnits = useMemo(() => {
    return unidades
      .map((unidade, index) => {
        // Always read primary coordinates M:N (coord_x / coord_y)
        const coordXIndex = 12; // Coluna M - coord_x
        const coordYIndex = 13; // Coluna N - coord_y
        const coordX = unidade[coordXIndex];
        const coordY = unidade[coordYIndex];
        const letra = unidade[18]; // Coluna S - Simbolo
        const ownerImplantacao = (unidade[16] || "").toString(); // Coluna Q - implantacao_ref
        // Determine owners
        const primaryOwner = implantacaoPrimary || implantacao || "";
        const additionalOwner = implantacaoAdditional || (implantacaoPrimary ? implantacaoPrimary + "+adicional" : "");
        const isAdLayer = activeLayer === "additional";

        // Filter by implantacao_ref when owners are available:
        // - additional layer: only units with owner === additionalOwner
        // - primary layer: units with owner === '' (legacy) or owner === primaryOwner
        if (primaryOwner || additionalOwner) {
          if (isAdLayer) {
            if (!ownerImplantacao || ownerImplantacao !== additionalOwner) return null;
          } else {
            if (ownerImplantacao && ownerImplantacao !== primaryOwner) return null;
          }
        }
        const rawStatus = unidade[11] || "Disponível"; // Coluna L - situacao
        const normalizedStatus = rawStatus
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        const isAvailable = normalizedStatus === "disponivel";

        // Filtra unidades que não devem ser renderizadas
        if ((isAvailable && hideAvailable) || !coordX || !coordY) {
          return null;
        }

        return {
          index,
          coordX,
          coordY,
          letra,
          normalizedStatus,
          unitName: unidade[2], // Coluna C - nome_unidade
          rawStatus: unidade[11], // Coluna L - situacao
        };
      })
      .filter(Boolean); // Remove nulls
  }, [unidades, hideAvailable, activeLayer, implantacao, implantacaoPrimary, implantacaoAdditional]);

  const scheduleHideControls = () => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    hideControlsTimeout.current = window.setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  const handleMouseEnterMap = () => {
    setShowControls(true);
    scheduleHideControls();
  };

  const handleMouseEnterControls = () => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
  };

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  const handleMapClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isMappingMode || unitToMapIndex === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;
    onMapClick(percentX, percentY);
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="floor-plan-wrapper"
      onMouseEnter={handleMouseEnterMap}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={8}
        limitToBounds={true}
        panning={{ disabled: isBlockMappingMode, velocityDisabled: true }}
        wheel={{ disabled: isBlockMappingMode }}
        pinch={{ disabled: isBlockMappingMode }}
        doubleClick={{ disabled: isBlockMappingMode }}
      >
        <div
          className={`controls-bar ${showControls ? "visible" : ""}`}
          onMouseEnter={handleMouseEnterControls}
          onMouseLeave={scheduleHideControls}
        >
          <Controls />
          <button
            onClick={handleFullscreen}
            className="control-button"
            title="Tela Cheia"
          >
            <FiMaximize size={20} color="#b0b0b0" />
          </button>
        </div>

        <TransformComponent
          wrapperClass="transform-wrapper-class"
          contentClass="transform-content-class"
        >
          <div
            className={`floor-plan-container ${
              isMappingMode ? "mapping-mode-active" : ""
            } ${unitToMapIndex !== null ? "placing-mode" : ""}`}
            onClick={handleMapClick}
          >
            <img
              src={activeLayer === "additional" && additionalImageUrl ? additionalImageUrl : imageUrl}
              alt="Planta Humanizada do Empreendimento"
              className="floor-plan-image"
            />

            {/* Overlay de blocos vendidos */}
            <BlockMappingOverlay
              blockMappings={blockMappings}
              blockStats={blockStats}
              activeLayer={activeLayer}
              implantacaoName={implantacao || implantacaoPrimary || ""}
            />

            {/* Contornos dos mapeamentos existentes visíveis durante o modo de mapeamento */}
            {isBlockMappingMode && blockMappings
              .filter((mapping) => {
                const currentLayerRef = activeLayer === "additional"
                  ? `${implantacao || implantacaoPrimary}+adicional`
                  : (implantacao || implantacaoPrimary || "");
                const mappingRef = mapping.implantacao_ref || (implantacao || implantacaoPrimary || "");
                return mappingRef === currentLayerRef;
              })
              .map((mapping) => (
                <div
                  key={`outline-${mapping.id || mapping.nome_bloco}`}
                  className="block-mapping-outline"
                  style={{
                    left: `${mapping.x}%`,
                    top: `${mapping.y}%`,
                    width: `${mapping.width}%`,
                    height: `${mapping.height}%`,
                  }}
                  title={mapping.nome_bloco}
                >
                  <span className="block-mapping-label">{mapping.nome_bloco}</span>
                </div>
              ))
            }

            {/* Overlay de desenho para mapeamento de blocos */}
            {isBlockMappingMode && onRectangleComplete && (
              <BlockDrawingOverlay
                selectedBlock={selectedBlockToMap}
                onRectangleComplete={onRectangleComplete}
                containerRef={containerRef}
                existingMappings={blockMappings.filter((mapping) => {
                  const currentLayerRef = activeLayer === "additional"
                    ? `${implantacao || implantacaoPrimary}+adicional`
                    : (implantacao || implantacaoPrimary || "");
                  const mappingRef = mapping.implantacao_ref || (implantacao || implantacaoPrimary || "");
                  return mappingRef === currentLayerRef;
                })}
                availableBlocks={[]}
                onPasteMapping={onBlockMappingPaste}
              />
            )}

            {renderedUnits.map((unit) => {
              if (!unit) return null;

              const {
                index,
                coordX,
                coordY,
                letra,
                normalizedStatus,
                unitName,
                rawStatus,
              } = unit;

              return (
                <div
                  key={unitName || index}
                  className={`unit-indicator ${normalizedStatus}`}
                  style={{
                    left: `${coordX}%`,
                    top: `${coordY}%`,
                    width: `${dotSize}px`,
                    height: `${dotSize}px`,
                    border: "1px solid rgba(255, 252, 252, 1)",
                  }}
                  title={`Unidade: ${unitName}\nStatus: ${rawStatus}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnitClick(index);
                  }}
                >
                  {letra && (
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        fontSize: `${Math.max(dotSize * 0.25, 6)}px`,
                        fontWeight: "bold",
                        color: "white",
                        textShadow: "0 0 2px rgba(0,0,0,0.5)",
                        pointerEvents: "none",
                      }}
                    >
                      {letra}
                    </span>
                  )}
                </div>
              );
            })}
            {isMappingMode && unitToMapIndex !== null && unitLetter && (
              <div
                style={{
                  position: "absolute",
                  bottom: "20px",
                  right: "20px",
                  background: "rgba(0, 0, 0, 0.8)",
                  color: "white",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  zIndex: 1000,
                  pointerEvents: "none",
                }}
              >
                Letra selecionada: <strong>{unitLetter}</strong>
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
});
