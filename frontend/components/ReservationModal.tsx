// src/components/ReservationModal.tsx

import { useState, useMemo, useEffect } from "react";
import Select from "react-select";
import { customSelectStyles } from "../styles/selectStyles";

interface OptionType {
  value: string;
  label: string;
}

interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
}

interface ReservationModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  clientes: string[][];
  onReserve: (data: string | ManualData) => void;
  initialMode: "select" | "manual";
  onBlockClick: () => void; // Prop para o botão de bloquear
}

export function ReservationModal({
  show,
  onClose,
  unitData,
  clientes,
  onReserve,
  initialMode,
  onBlockClick,
}: ReservationModalProps) {
  const [view, setView] = useState<"select" | "manual">(initialMode);
  const [selectedClient, setSelectedClient] = useState<OptionType | null>(null);
  const [manualData, setManualData] = useState<ManualData>({
    id: "",
    cliente: "",
    documento: "",
    corretor: "",
  });

  useEffect(() => {
    if (show) {
      setView(initialMode);
      setSelectedClient(null);
      setManualData({ id: "", cliente: "", documento: "", corretor: "" });
    }
  }, [show, initialMode]);

  const clientOptions: OptionType[] = useMemo(
    () =>
      clientes.map((cliente) => ({
        value: cliente[0],
        label: `${cliente[1]} - (Doc: ${cliente[2]})`,
      })),
    [clientes]
  );

  if (!show || !unitData) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setManualData((prev) => ({ ...prev, [name]: value }));
  };

  const handleReserveClick = () => {
    if (view === "select") {
      if (selectedClient) onReserve(selectedClient.value);
    } else {
      if (!manualData.cliente.trim()) {
        alert("O nome do Cliente é obrigatório.");
        return;
      }
      onReserve(manualData);
    }
  };

  const isConfirmDisabled =
    view === "select" ? !selectedClient : !manualData.cliente.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          Reservar Unidade: <strong>{unitData[3]}</strong>
        </h2>

        {view === "select" ? (
          <>
            <div className="form-group">
              <label htmlFor="client-select">Buscar Cliente na Lista</label>
              <Select<OptionType>
                id="client-select"
                options={clientOptions}
                value={selectedClient}
                onChange={(opt) => setSelectedClient(opt as OptionType | null)}
                placeholder="Digite para buscar um cliente..."
                styles={customSelectStyles}
                isClearable
              />
            </div>
            <a
              href="#"
              className="switch-view-link"
              onClick={() => setView("manual")}
            >
              Cliente não está na lista? Preenchimento manual.
            </a>
          </>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor="id">ID Pré-Cadastro (Opcional)</label>
              <input
                type="text"
                id="id"
                name="id"
                value={manualData.id}
                onChange={handleInputChange}
                className="modal-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="cliente">Cliente</label>
              <input
                type="text"
                id="cliente"
                name="cliente"
                value={manualData.cliente}
                onChange={handleInputChange}
                required
                className="modal-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="documento">Documento Cliente</label>
              <input
                type="text"
                id="documento"
                name="documento"
                value={manualData.documento}
                onChange={handleInputChange}
                className="modal-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="corretor">Corretor</label>
              <input
                type="text"
                id="corretor"
                name="corretor"
                value={manualData.corretor}
                onChange={handleInputChange}
                className="modal-input"
              />
            </div>
            <a
              href="#"
              className="switch-view-link"
              onClick={() => setView("select")}
            >
              Voltar para a busca na lista.
            </a>
          </>
        )}

        <button
          className="modal-reserve-button"
          onClick={handleReserveClick}
          disabled={isConfirmDisabled}
        >
          Confirmar Reserva
        </button>

        <button className="modal-block-button" onClick={onBlockClick}>
          Bloquear esta Unidade
        </button>
      </div>
    </div>
  );
}
