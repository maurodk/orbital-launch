// src/components/MappingSidebar.tsx

// <<< CORREÇÃO 1: Adicionar 'useMemo' à lista de imports do React >>>
import { useState, useEffect, useMemo } from "react";
import {
  FiChevronDown,
  FiChevronUp,
  FiPlusCircle,
  FiSave,
} from "react-icons/fi";

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
  currentImageUrl: string;
  onUpdateImage: (newUrl: string) => void;
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
  currentImageUrl,
  onUpdateImage,
  dotSize,
  onDotSizeChange,
  onSaveDotSize,
  unitLetter,
  onLetterChange,
}: MappingSidebarProps) {
  // Agrupamento de unidades
  const groupedUnits = useMemo<GroupedUnits>(() => {
    return unidades.reduce((acc, unidade, index) => {
      const blockName = unidade[1] || "Sem Bloco";
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

  const [newImageUrl, setNewImageUrl] = useState(currentImageUrl);
  const [localDotSize, setLocalDotSize] = useState(dotSize);

  useEffect(() => {
    setNewImageUrl(currentImageUrl);
    setLocalDotSize(dotSize);
  }, [currentImageUrl, dotSize]);

  const handleImageURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewImageUrl(e.target.value);
  };

  const handleSaveImage = () => {
    if (
      newImageUrl &&
      newImageUrl.trim() !== "" &&
      newImageUrl !== currentImageUrl
    ) {
      onUpdateImage(newImageUrl);
    }
  };

  const handleSizeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10) || 0;
    setLocalDotSize(newSize);
    onDotSizeChange(newSize);
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
                        unidade[11] &&
                        unidade[11].trim() !== "" &&
                        unidade[12] &&
                        unidade[12].trim() !== "";
                      const isSelected = originalIndex === selectedUnitIndex;
                      // <<< MUDANÇA 1: Pega o status da unidade e converte para minúsculas >>>
                      const status = unidade[10]?.toLowerCase() || "disponível";

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

      <div className="sidebar-footer">
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
          <label htmlFor="image-url-input">URL da Imagem da Planta</label>
          <div className="input-group">
            <input
              id="image-url-input"
              type="text"
              value={newImageUrl}
              onChange={handleImageURLChange}
              placeholder="Cole a nova URL da imagem aqui"
              className="sidebar-input"
            />
            <button
              onClick={handleSaveImage}
              className="sidebar-button"
              title="Salvar nova imagem"
            >
              <FiSave size={18} />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="dot-size-input">Tamanho do Ponto (px)</label>
          <div className="input-group">
            <input
              id="dot-size-input"
              type="number"
              value={localDotSize}
              onChange={handleSizeInputChange}
              className="sidebar-input"
              min="1"
            />
            <button
              onClick={onSaveDotSize}
              className="sidebar-button"
              title="Salvar tamanho do ponto para esta implantação"
            >
              <FiSave size={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
