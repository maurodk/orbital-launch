import { useState, useMemo, useEffect } from "react";
import Select, { type SingleValue } from "react-select";
import { customSelectStyles } from "../styles/selectStyles";

interface AvailableUnit {
  unit: string[];
  originalIndex: number;
}

interface ChangeUnitModalProps {
  show: boolean;
  onClose: () => void;
  currentUnit: string[] | null;
  availableUnits: AvailableUnit[];
  onConfirm: (newUnitIndex: number) => void;
}

interface UnitOption {
  value: number; // Armazena o índice original da unidade
  label: string;
}

export function ChangeUnitModal({
  show,
  onClose,
  currentUnit,
  availableUnits,
  onConfirm,
}: ChangeUnitModalProps) {
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState("");

  // Efeito para resetar o estado interno quando o modal é aberto
  useEffect(() => {
    if (show) {
      setSelectedUnit(null);
      setIsChanging(false);
      setError("");
    }
  }, [show]);

  const unitOptions: UnitOption[] = useMemo(() => {
    return availableUnits.map((item) => ({
      value: item.originalIndex, // CORREÇÃO: Usar 'item' em vez de 'unit' e 'index'
      label: `Unidade: ${item.unit[2]} | Bloco: ${item.unit[1]} | Tipologia: ${item.unit[4]}`,
    }));
  }, [availableUnits]);

  const handleSelectChange = (selectedOption: SingleValue<UnitOption>) => {
    setSelectedUnit(selectedOption);
    setError("");
  };

  const handleConfirm = async () => {
    if (!selectedUnit) {
      setError("Por favor, selecione uma nova unidade.");
      return;
    }

    setIsChanging(true);
    setError("");
    try {
      await onConfirm(selectedUnit.value);
      onClose(); // Fecha o modal em caso de sucesso
    } catch (e: any) {
      // 'any' é aceitável aqui para capturar qualquer tipo de erro.
      setError(e.message || "Ocorreu um erro ao tentar trocar a unidade.");
    } finally {
      setIsChanging(false);
    }
  };

  if (!show || !currentUnit) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        <h2>Trocar Unidade</h2>
        <p>
          Cliente: <strong>{currentUnit[6]}</strong>
        </p>
        <p>
          Unidade Atual: <strong>{currentUnit[2]}</strong>
        </p>

        <div className="form-group">
          <label htmlFor="new-unit-select">Selecione a Nova Unidade</label>
          <Select<UnitOption>
            id="new-unit-select"
            options={unitOptions}
            value={selectedUnit}
            onChange={handleSelectChange}
            placeholder="Buscar unidade Disponível..."
            styles={customSelectStyles}
            isClearable
            noOptionsMessage={() => "Nenhuma unidade Disponível encontrada."}
          />
        </div>

        {error && <p className="modal-error">{error}</p>}

        <button
          className="modal-reserve-button"
          onClick={handleConfirm}
          disabled={!selectedUnit || isChanging}
        >
          {isChanging ? "Trocando..." : "Confirmar Troca"}
        </button>
      </div>
    </div>
  );
}
