// src/components/MappingSidebar.tsx

// <<< CORREÇÃO 1: Adicionar 'useMemo' à lista de imports do React >>>
import { useState, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronUp, FiPlusCircle } from "react-icons/fi";

// Interface para um único item de unidade com seu índice original
interface UnitItem {
  unidade: string[];
  originalIndex: number;
}

// Interface para o objeto de unidades agrupadas
interface GroupedUnits {
  [blockName: string]: UnitItem[];
}

// Interface de props do componente
interface MappingSidebarProps {
  unidades: string[][];
  onSelectUnit: (index: number) => void;
  selectedUnitIndex: number | null;
  dotSize: number;
  onDotSizeChange: (newSize: number) => void;
  onSaveDotSize: () => void;
  unitLetter: string;
  onLetterChange: (letter: string) => void;
  activeLayer?: "primary" | "additional";
  implantacaoPrimary?: string;
  implantacaoAdditional?: string;
}

export function MappingSidebar({
  unidades,
  onSelectUnit,
  selectedUnitIndex,
  dotSize,
  onDotSizeChange,
  onSaveDotSize,
  unitLetter,
  onLetterChange,
  activeLayer = "primary",
  implantacaoPrimary = "",
  implantacaoAdditional = "",
}: MappingSidebarProps) {
  // Agrupamento de unidades
  const groupedUnits = useMemo<GroupedUnits>(() => {
    return unidades.reduce((acc, unidade, index) => {
      // Filter by implantacao_ref (col Q index 16) based on active layer context
      const ownerImplantacao = (unidade[16] || "").toString();
      const currentImplantacao =
        activeLayer === "additional"
          ? implantacaoAdditional || implantacaoPrimary || ""
          : implantacaoPrimary || "";
      if (currentImplantacao && ownerImplantacao && ownerImplantacao !== currentImplantacao) {
        return acc; // skip units owned by other implantation
      }

      const blockName = unidade[1] || "Sem Bloco"; // Coluna B - bloco
      if (!acc[blockName]) {
        acc[blockName] = [];
      }
      acc[blockName].push({ unidade, originalIndex: index });
      return acc;
    }, {} as GroupedUnits);
  }, [unidades]);

  const [openGroups, setOpenGroups] = useState<string[]>(
    Object.keys(groupedUnits)
  );

  const [localDotSize, setLocalDotSize] = useState(dotSize);

  useEffect(() => {
    setLocalDotSize(dotSize);
  }, [dotSize]);

  // Debounce para auto-save do tamanho do ponto
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localDotSize !== dotSize) {
        onDotSizeChange(localDotSize);
        onSaveDotSize();
      }
    }, 500); // Salva 500ms após parar de ajustar

    return () => clearTimeout(timer);
  }, [localDotSize, dotSize, onDotSizeChange, onSaveDotSize]);

  const handleDotSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setLocalDotSize(newSize);
    onDotSizeChange(newSize); // Atualiza visualmente em tempo real
  };

  const handleIncreaseDotSize = () => {
    if (localDotSize < 40) {
      const newSize = localDotSize + 2;
      setLocalDotSize(newSize);
      onDotSizeChange(newSize);
    }
  };

  const handleDecreaseDotSize = () => {
    if (localDotSize > 8) {
      const newSize = localDotSize - 2;
      setLocalDotSize(newSize);
      onDotSizeChange(newSize);
    }
  };

  const handleToggleGroup = (blockName: string) => {
    setOpenGroups((prev) =>
      prev.includes(blockName)
        ? prev.filter((b) => b !== blockName)
        : [...prev, blockName]
    );
  };

  return (
    <aside className="mapping-sidebar">
      <h3 className="sidebar-title">Unidades para Mapear</h3>

      <div className="sidebar-controls">
        <div className="form-group">
          <label htmlFor="unit-letter-input">Letra da Unidade (Opcional)</label>
          <input
            id="unit-letter-input"
            type="text"
            maxLength={1}
            value={unitLetter}
            onChange={(e) => onLetterChange(e.target.value.toUpperCase())}
            placeholder="Ex: A"
            className="sidebar-input"
            style={{ textTransform: "uppercase", textAlign: "center" }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="dot-size-slider">
            Tamanho do Ponto: {localDotSize}px
          </label>
          <div className="volume-control">
            <button
              onClick={handleDecreaseDotSize}
              className="volume-button"
              title="Diminuir tamanho"
              disabled={localDotSize <= 8}
            >
              -
            </button>
            <input
              id="dot-size-slider"
              type="range"
              min="8"
              max="40"
              value={localDotSize}
              onChange={handleDotSizeChange}
              className="dot-size-slider"
            />
            <button
              onClick={handleIncreaseDotSize}
              className="volume-button"
              title="Aumentar tamanho"
              disabled={localDotSize >= 40}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="unit-groups-container">
        {/* <<< CORREÇÃO 2: Adicionar o tipo correto para Object.entries >>> */}
        {(Object.entries(groupedUnits) as [string, UnitItem[]][]).map(
          ([blockName, unitItems]) => {
            const isOpen = openGroups.includes(blockName);
            return (
              <div key={blockName} className="unit-group">
                <button
                  className="group-header"
                  onClick={() => handleToggleGroup(blockName)}
                >
                  <div className="group-header-title">
                    <strong>{blockName}</strong>
                    <span>{unitItems.length} UNIDADES</span>
                  </div>
                  {isOpen ? <FiChevronUp /> : <FiChevronDown />}
                </button>

                {isOpen && (
                  <div className="group-content">
                    {unitItems.map(({ unidade, originalIndex }) => {
                      // Considera mapeamento de acordo com a camada ativa
                      const isAdLayer = (activeLayer === "additional");
                      const coordXIndex = isAdLayer ? 14 : 12; // O or M
                      const coordYIndex = isAdLayer ? 15 : 13; // P or N
                      const hasCoords =
                        unidade[coordXIndex] &&
                        unidade[coordXIndex].toString().trim() !== "" &&
                        unidade[coordYIndex] &&
                        unidade[coordYIndex].toString().trim() !== "";
                      const isMapped = hasCoords;
                      const isSelected = originalIndex === selectedUnitIndex;
                      // Normaliza o status: minúscula + remove acentos para classe CSS
                      const rawStatus = unidade[11] || "Disponível"; // Coluna L - situacao
                      const status = rawStatus
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .trim();

                      return (
                        <div
                          key={originalIndex}
                          data-mapped={isMapped}
                          className={`unit-item ${
                            isSelected ? "selected" : ""
                          }`}
                        >
                          {/* <<< MUDANÇA 2: Adiciona a classe de status ao span >>> */}
                          <span className={`unit-status ${status}`} />
                          <span className="unit-name">{unidade[2]}</span>
                          {!isMapped && (
                            <button
                              className="select-unit-button"
                              onClick={() => onSelectUnit(originalIndex)}
                              title="Selecionar esta unidade para mapear"
                            >
                              <FiPlusCircle />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>
    </aside>
  );
}
