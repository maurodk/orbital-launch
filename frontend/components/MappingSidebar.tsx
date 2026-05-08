import { useEffect, useMemo, useState } from "react";
import { FiChevronDown, FiChevronUp, FiPlusCircle } from "react-icons/fi";

interface UnitItem {
  unidade: string[];
  originalIndex: number;
}

interface GroupedUnits {
  [blockName: string]: UnitItem[];
}

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
  contentHeight?: number | null;
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
  contentHeight = null,
}: MappingSidebarProps) {
  const primaryOwner = implantacaoPrimary || "";
  const additionalOwner =
    implantacaoAdditional ||
    (implantacaoPrimary ? `${implantacaoPrimary}+adicional` : "");

  const groupedUnits = useMemo<GroupedUnits>(() => {
    return unidades.reduce((acc, unidade, index) => {
      const ownerImplantacao = (unidade[16] || "").toString();
      const currentImplantacao =
        activeLayer === "additional"
          ? implantacaoAdditional || implantacaoPrimary || ""
          : implantacaoPrimary || "";

      if (
        currentImplantacao &&
        ownerImplantacao &&
        ownerImplantacao !== currentImplantacao
      ) {
        return acc;
      }

      const blockName = unidade[3] || "Sem Bloco";
      if (!acc[blockName]) {
        acc[blockName] = [];
      }

      acc[blockName].push({ unidade, originalIndex: index });
      return acc;
    }, {} as GroupedUnits);
  }, [unidades, activeLayer, implantacaoPrimary, implantacaoAdditional]);

  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [localDotSize, setLocalDotSize] = useState(dotSize);

  useEffect(() => {
    setLocalDotSize(dotSize);
  }, [dotSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localDotSize !== dotSize) {
        onDotSizeChange(localDotSize);
        onSaveDotSize();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localDotSize, dotSize, onDotSizeChange, onSaveDotSize]);

  const handleDotSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setLocalDotSize(newSize);
    onDotSizeChange(newSize);
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
        ? prev.filter((name) => name !== blockName)
        : [...prev, blockName]
    );
  };

  const isUnitMappedForActiveLayer = (unidade: string[]) => {
    const coordX = unidade[12];
    const coordY = unidade[13];
    const hasCoords =
      typeof coordX !== "undefined" &&
      coordX !== null &&
      coordX.toString().trim() !== "" &&
      typeof coordY !== "undefined" &&
      coordY !== null &&
      coordY.toString().trim() !== "";

    const owner = (unidade[16] || "").toString();

    if (activeLayer === "additional") {
      return hasCoords && owner === additionalOwner;
    }

    return hasCoords && (!owner || owner === primaryOwner);
  };

  const sidebarStyle =
    contentHeight && contentHeight > 0
      ? { height: `${contentHeight}px`, maxHeight: `${contentHeight}px` }
      : undefined;

  return (
    <aside className="mapping-sidebar" style={sidebarStyle}>
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
        {(Object.entries(groupedUnits) as [string, UnitItem[]][]).map(
          ([blockName, unitItems]) => {
            const isOpen = openGroups.includes(blockName);
            const mappedCount = unitItems.filter(({ unidade }) =>
              isUnitMappedForActiveLayer(unidade)
            ).length;
            const totalCount = unitItems.length;
            const isFullyMapped = totalCount > 0 && mappedCount === totalCount;
            const isPartiallyMapped = mappedCount > 0 && mappedCount < totalCount;

            return (
              <div key={blockName} className="unit-group">
                <button
                  className="group-header"
                  onClick={() => handleToggleGroup(blockName)}
                >
                  <div className="group-header-title">
                    <strong>{blockName}</strong>
                    <span>{totalCount} UNIDADES</span>
                  </div>
                  <div className="group-header-meta">
                    <span
                      className={`group-mapping-badge ${
                        isFullyMapped
                          ? "complete"
                          : isPartiallyMapped
                            ? "partial"
                            : "pending"
                      }`}
                    >
                      {isFullyMapped ? "100%" : `${mappedCount}/${totalCount}`}
                    </span>
                    {isOpen ? <FiChevronUp /> : <FiChevronDown />}
                  </div>
                </button>

                {isOpen && (
                  <div className="group-content">
                    {unitItems.map(({ unidade, originalIndex }) => {
                      const isMapped = isUnitMappedForActiveLayer(unidade);
                      const isSelected = originalIndex === selectedUnitIndex;
                      const rawStatus = unidade[11] || "Disponível";
                      const status = rawStatus
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .trim();

                      return (
                        <div
                          key={originalIndex}
                          data-mapped={isMapped}
                          className={`unit-item ${isSelected ? "selected" : ""}`}
                        >
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
