// src/components/ReservationModal.tsx
import { useState, useMemo } from "react";
import Select, { type SingleValue } from "react-select";
import { customSelectStyles } from "../styles/selectStyles"; // Importando os estilos do novo local

// O tipo OptionType agora é local para este componente, pois é onde ele é usado
interface OptionType {
  value: string;
  label: string;
}

interface ReservationModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  clientes: string[][];
  onReserve: (selectedClientName: string) => void;
}

export function ReservationModal({
  show,
  onClose,
  unitData,
  clientes,
  onReserve,
}: ReservationModalProps) {
  const [selectedClient, setSelectedClient] = useState<OptionType | null>(null);

  const clientOptions: OptionType[] = useMemo(
    () =>
      clientes.map((cliente) => ({
        value: cliente[0],
        label: `${cliente[0]} - (Doc: ${cliente[1]})`,
      })),
    [clientes]
  );

  if (!show || !unitData) {
    return null;
  }

  const handleClientChange = (selectedOption: SingleValue<OptionType>) => {
    setSelectedClient(selectedOption);
  };

  const handleReserveClick = () => {
    if (!selectedClient) {
      alert("Por favor, selecione um cliente.");
      return;
    }
    onReserve(selectedClient.value);
    setSelectedClient(null); // Limpa o campo após a reserva
  };

  const handleClose = () => {
    setSelectedClient(null); // Limpa o campo ao fechar
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={handleClose}>
          ×
        </button>
        <h2>
          Reservar Unidade: <strong>{unitData[3]}</strong>
        </h2>
        <p>
          <strong>Bloco:</strong> {unitData[2]}
        </p>

        <div className="form-group">
          <label htmlFor="client-select">Buscar Cliente</label>
          <Select<OptionType>
            id="client-select"
            options={clientOptions}
            value={selectedClient}
            onChange={handleClientChange}
            placeholder="Digite para buscar um cliente..."
            noOptionsMessage={() => "Nenhum cliente encontrado"}
            isClearable
            styles={customSelectStyles}
          />
        </div>

        <button
          className="modal-reserve-button"
          onClick={handleReserveClick}
          disabled={!selectedClient}
        >
          Confirmar Reserva
        </button>
      </div>
    </div>
  );
}
