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
}: FloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimeout = useRef<number | null>(null);

  // Memoiza as unidades renderizáveis para evitar recálculos
  const renderedUnits = useMemo(() => {
    return unidades
      .map((unidade, index) => {
        // Use M:N (coord_x / coord_y) for primary, O:P (coord_x_ad/coord_y_ad) for additional
        const coordXIndex = activeLayer === "additional" ? 14 : 12; // O or M
        const coordYIndex = activeLayer === "additional" ? 15 : 13; // P or N
        const coordX = unidade[coordXIndex];
        const coordY = unidade[coordYIndex];
        const letra = unidade[18]; // Coluna S - Simbolo
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
  }, [unidades, hideAvailable, activeLayer]);

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
        panning={{ velocityDisabled: true }}
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
