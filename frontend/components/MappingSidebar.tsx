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
}: MappingSidebarProps) {
  // Agrupamento de unidades
  const groupedUnits = useMemo<GroupedUnits>(() => {
    return unidades.reduce((acc, unidade, index) => {
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
                      // Verifica se AMBAS as coordenadas (M e N) estão preenchidas
                      const isMapped =
                        unidade[12] && // Coluna M - coord_x
                        unidade[12].trim() !== "" &&
                        unidade[13] && // Coluna N - coord_y
                        unidade[13].trim() !== "";
                      const isSelected = originalIndex === selectedUnitIndex;
                      // <<< MUDANÇA 1: Pega o status da unidade e converte para minúsculas >>>
                      const status = unidade[11]?.toLowerCase() || "Disponível"; // Coluna L - situacao

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
