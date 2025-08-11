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
}: MappingSidebarProps) {
  // Agrupamento de unidades
  const groupedUnits = useMemo<GroupedUnits>(() => {
    return unidades.reduce((acc, unidade, index) => {
      const blockName = unidade[2] || "Sem Bloco";
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
                    {/* Agora o TypeScript sabe o tipo de 'unitItems', então 'unidade' e 'originalIndex' não são mais 'any' */}
                    {unitItems.map(({ unidade, originalIndex }) => {
                      const isMapped = unidade[10] && unidade[10].trim() !== "";
                      const isSelected = originalIndex === selectedUnitIndex;

                      return (
                        <div
                          key={originalIndex}
                          data-mapped={isMapped}
                          className={`unit-item ${
                            isSelected ? "selected" : ""
                          }`}
                        >
                          <span
                            className="unit-status"
                            data-mapped={isMapped}
                          />
                          <span className="unit-name">{unidade[3]}</span>
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
