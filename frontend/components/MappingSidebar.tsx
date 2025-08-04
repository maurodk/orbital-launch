// src/components/MappingSidebar.tsx - VERSÃO FINAL E COMPLETA

import { useMemo, useState, useEffect } from "react";
import {
  FiChevronDown,
  FiChevronUp,
  FiPlusCircle,
  FiSave,
} from "react-icons/fi";

interface UnitItem {
  unidade: string[];
  originalIndex: number;
}

interface GroupedUnits {
  [blockName: string]: UnitItem[];
}

// Interface com as novas props
interface MappingSidebarProps {
  unidades: string[][];
  onSelectUnit: (index: number) => void;
  selectedUnitIndex: number | null;
  currentImageUrl: string;
  onUpdateImage: (newUrl: string) => void;
}

export function MappingSidebar({
  unidades,
  onSelectUnit,
  selectedUnitIndex,
  currentImageUrl,
  onUpdateImage,
}: MappingSidebarProps) {
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

  // --- LÓGICA PARA O INPUT DE IMAGEM ---
  const [newImageUrl, setNewImageUrl] = useState(currentImageUrl);

  useEffect(() => {
    setNewImageUrl(currentImageUrl);
  }, [currentImageUrl]);

  const handleFiSaveClick = () => {
    if (
      newImageUrl &&
      newImageUrl.trim() !== "" &&
      newImageUrl !== currentImageUrl
    ) {
      onUpdateImage(newImageUrl);
    }
  };
  // --- FIM DA LÓGICA PARA O INPUT ---

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
        {Object.entries(groupedUnits).map(([blockName, unitItems]) => {
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
                    const isMapped = unidade[11] && unidade[11].trim() !== "";
                    const isSelected = originalIndex === selectedUnitIndex;

                    return (
                      <div
                        key={originalIndex}
                        data-mapped={isMapped}
                        className={`unit-item ${isSelected ? "selected" : ""}`}
                      >
                        <span className="unit-status" data-mapped={isMapped} />
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
        })}
      </div>

      {/* --- JSX PARA O INPUT DE IMAGEM --- */}
      <div className="sidebar-footer">
        <label htmlFor="image-url-input">URL da Imagem da Planta</label>
        <div className="input-group">
          <input
            id="image-url-input"
            type="text"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            placeholder="Cole a nova URL da imagem aqui"
          />
          <button onClick={handleFiSaveClick} title="Salvar nova imagem">
            <FiSave size={18} /> Salvar Imagem
          </button>
        </div>
      </div>
    </aside>
  );
}
