// components/BlockMappingOverlay.tsx
import { useState, useEffect } from "react";
import "./BlockMappingOverlay.css";

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

interface BlockMappingOverlayProps {
  blockMappings: BlockMapping[];
  blockStats: Record<string, BlockStats>;
  activeLayer?: "primary" | "additional";
  implantacaoName: string;
}

export function BlockMappingOverlay({
  blockMappings,
  blockStats,
  activeLayer = "primary",
  implantacaoName,
}: BlockMappingOverlayProps) {
  const [visibleBlocks, setVisibleBlocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Anima entrada dos blocos vendidos um por um
    const soldBlocks = Object.entries(blockStats)
      .filter(([_, stats]) => {
        const percentReserved = stats.total > 0 ? (stats.reservadas / stats.total) * 100 : 0;
        return percentReserved === 100;
      })
      .map(([blockName]) => blockName);

    soldBlocks.forEach((blockName, index) => {
      setTimeout(() => {
        setVisibleBlocks((prev) => new Set([...prev, blockName]));
      }, index * 200);
    });

    // Remove blocos que não estão mais 100% vendidos
    setVisibleBlocks((prev) => {
      const newSet = new Set(prev);
      Array.from(prev).forEach((blockName) => {
        if (!soldBlocks.includes(blockName)) {
          newSet.delete(blockName);
        }
      });
      return newSet;
    });
  }, [blockStats]);

  const currentLayerRef = activeLayer === "additional" 
    ? `${implantacaoName}+adicional` 
    : implantacaoName;

  return (
    <>
      {blockMappings
        .filter((mapping) => {
          // Filtra por camada
          const mappingRef = mapping.implantacao_ref || implantacaoName;
          return mappingRef === currentLayerRef;
        })
        .map((mapping) => {
          const stats = blockStats[mapping.nome_bloco];
          if (!stats || stats.total === 0) return null;

          const percentReserved = (stats.reservadas / stats.total) * 100;
          const isSold = percentReserved === 100;
          const isVisible = visibleBlocks.has(mapping.nome_bloco);

          if (!isSold) return null;

          return (
            <div
              key={`${mapping.id || mapping.nome_bloco}`}
              className={`block-sold-overlay ${isVisible ? "visible" : ""}`}
              style={{
                left: `${mapping.x}%`,
                top: `${mapping.y}%`,
                width: `${mapping.width}%`,
                height: `${mapping.height}%`,
              }}
            >
              <div className="block-sold-content">
                <div className="block-sold-badge">
                  <svg
                    className="block-sold-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="block-sold-text">VENDIDO</span>
                </div>
                <div className="block-sold-name">{mapping.nome_bloco}</div>
              </div>
            </div>
          );
        })}
    </>
  );
}
