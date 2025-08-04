// src/components/FloorPlan.tsx - VERSÃO FINAL E COMPLETA

import { type MouseEvent, useRef, useState, useEffect } from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch";
import { FiZoomIn, FiZoomOut, FiMaximize, FiRefreshCcw } from "react-icons/fi";

// Interface com a nova prop
interface FloorPlanProps {
  imageUrl: string;
  unidades: string[][];
  isMappingMode: boolean;
  unitToMapIndex: number | null;
  onMapClick: (x: number, y: number) => void;
  onUnitClick: (unitIndex: number) => void;
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

export function FloorPlan({
  imageUrl, // <<< MUDANÇA 1: Adicionar 'imageUrl' aqui
  unidades,
  isMappingMode,
  unitToMapIndex,
  onMapClick,
  onUnitClick,
}: FloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimeout = useRef<number | null>(null);

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
              // <<< MUDANÇA 2: Usar a prop 'imageUrl' aqui >>>
              src={imageUrl}
              alt="Planta Humanizada do Empreendimento"
              className="floor-plan-image"
            />

            {unidades.map((unidade, index) => {
              const coordX = unidade[11];
              const coordY = unidade[12];
              const status = unidade[10]?.toLowerCase() || "disponível";

              if (!coordX || !coordY) return null;

              return (
                <div
                  key={unidade[3] || index}
                  className={`unit-indicator ${status}`}
                  style={{ left: `${coordX}%`, top: `${coordY}%` }}
                  title={`Unidade: ${unidade[3]}\nStatus: ${unidade[10]}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnitClick(index);
                  }}
                />
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
