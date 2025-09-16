// src/components/MappingTool.tsx
import Select, { type SingleValue, type StylesConfig } from "react-select";

// O tipo de dado que o dropdown receberá
interface MappedUnitOption {
  value: number;
  label: string;
}

// O tipo de dado que vem do App.tsx
interface UnidadeNaoMapeada {
  unidade: string[];
  originalIndex: number;
}

interface MappingToolProps {
  isMappingMode: boolean;
  onToggleMappingMode: (enabled: boolean) => void;
  unidadesNaoMapeadas: UnidadeNaoMapeada[]; // Alterado aqui
  selectedUnitIndex: number | null;
  onSelectUnit: (index: number | null) => void;
  customSelectStyles: StylesConfig<MappedUnitOption, false>;
}

export function MappingTool({
  isMappingMode,
  onToggleMappingMode,
  unidadesNaoMapeadas,
  selectedUnitIndex,
  onSelectUnit,
  customSelectStyles,
}: MappingToolProps) {
  // Adapta os dados para o formato que o react-select precisa
  const unitOptions: MappedUnitOption[] = unidadesNaoMapeadas.map((item) => ({
    value: item.originalIndex,
    label: item.unidade[2], // Nome da unidade (Coluna C)
  }));

  const handleSelectChange = (
    selectedOption: SingleValue<MappedUnitOption>
  ) => {
    onSelectUnit(selectedOption ? selectedOption.value : null);
  };

  return (
    <div className="mapping-tool-container">
      <div className="toggle-switch">
        <input
          type="checkbox"
          id="mapping-toggle"
          checked={isMappingMode}
          // Adicionar esta linha para chamar a função quando o estado mudar
          onChange={(e) => onToggleMappingMode(e.target.checked)}
        />
        <label htmlFor="mapping-toggle">Modo Mapeamento</label>
      </div>
      {isMappingMode && (
        <div className="mapping-controls">
          <p>1. Selecione a unidade que deseja posicionar:</p>
          <Select<MappedUnitOption>
            options={unitOptions}
            value={
              unitOptions.find((opt) => opt.value === selectedUnitIndex) || null
            }
            onChange={handleSelectChange}
            placeholder="Selecione uma unidade não mapeada..."
            styles={customSelectStyles}
          />
          <p>2. Clique no local exato no mapa abaixo.</p>
        </div>
      )}
    </div>
  );
}
