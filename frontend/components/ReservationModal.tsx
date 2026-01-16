// src/components/ReservationModal.tsx

import { useState, useMemo, useEffect } from "react";
import Select from "react-select";
import { customSelectStyles } from "../styles/selectStyles";
import "./ReservationModal.css";

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
  implantacaoId: number | null;
  sheetRowIndex: number | null;
  clientes: string[][];
  onReserve: (data: { cliente: string | ManualData }) => void;
  initialMode: "select" | "manual";
  onBlockClick: () => void;
}

export function ReservationModal({
  show,
  onClose,
  unitData,
  implantacaoId,
  sheetRowIndex,
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
    () => {
      console.log("🔍 [ReservationModal] Total de clientes recebidos:", clientes.length);
      console.log("🔍 [ReservationModal] Clientes:", clientes);
      
      const filtered = clientes.filter((cliente) => cliente && cliente[1] && cliente[1].trim() !== "");
      console.log("🔍 [ReservationModal] Clientes após filtro:", filtered.length);
      
      const options = filtered.map((cliente, index) => ({
        value: cliente[0] || `temp_${index}`,
        label: `${cliente[1]} - (Doc: ${cliente[2] || "Sem documento"})`,
      }));
      
      console.log("🔍 [ReservationModal] Opções geradas:", options);
      return options;
    },
    [clientes]
  );

  if (!show || !unitData) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setManualData((prev) => ({ ...prev, [name]: value }));
  };



  const handleConfirmReservation = () => {
    if (view === "select") {
      if (!selectedClient) {
        alert("Selecione um cliente.");
        return;
      }
    } else {
      if (!manualData.cliente.trim()) {
        alert("O nome do Cliente é obrigatório.");
        return;
      }
    }
    const clientData = view === "select" ? selectedClient!.value : manualData;
    onReserve({ cliente: clientData });
  };

  const clientSelectDisabled = view === "select" ? !selectedClient : !manualData.cliente.trim();

  return (
    <div className="modal-overlay reservation-modal-overlay" onClick={onClose}>
      <div 
        className="modal-content reservation-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        {/* Unit Info Header */}
        <div className="unit-info-header">
          <div className="unit-icon">🏠</div>
          <div className="unit-details">
            <div className="unit-label">Reservando</div>
            <div className="unit-name">{unitData[2]}</div>
          </div>
        </div>

        {/* SELEÇÃO DE CLIENTE */}
        <div className="step-content step-cliente fade-in">
          <div className="step-content step-cliente fade-in">
            <div className="client-mode-tabs">
              <button
                className={`mode-tab ${view === "select" ? "active" : ""}`}
                onClick={() => setView("select")}
              >
                <span className="tab-icon">🔍</span>
                Buscar Cliente
              </button>
              <button
                className={`mode-tab ${view === "manual" ? "active" : ""}`}
                onClick={() => setView("manual")}
              >
                <span className="tab-icon">✏️</span>
                Preencher Manual
              </button>
            </div>

            {view === "select" ? (
              <div className="client-select-container fade-in">
                <div className="form-group">
                  <label htmlFor="client-select">
                    <span className="label-icon">👤</span>
                    Selecione um Cliente
                  </label>
                  <Select<OptionType>
                    id="client-select"
                    options={clientOptions}
                    value={selectedClient}
                    onChange={(opt) => setSelectedClient(opt as OptionType | null)}
                    placeholder="Digite para buscar um cliente..."
                    styles={customSelectStyles}
                    isClearable
                    noOptionsMessage={() => "Nenhum cliente encontrado"}
                  />
                </div>
              </div>
            ) : (
              <div className="client-manual-container fade-in">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="id">
                      <span className="label-icon">🆔</span>
                      ID Pré-Cadastro
                    </label>
                    <input
                      type="text"
                      id="id"
                      name="id"
                      value={manualData.id}
                      onChange={handleInputChange}
                      className="modal-input"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cliente">
                      <span className="label-icon">👤</span>
                      Nome do Cliente <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="cliente"
                      name="cliente"
                      value={manualData.cliente}
                      onChange={handleInputChange}
                      required
                      className="modal-input"
                      placeholder="Digite o nome completo"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="documento">
                      <span className="label-icon">📄</span>
                      Documento (CPF/CNPJ)
                    </label>
                    <input
                      type="text"
                      id="documento"
                      name="documento"
                      value={manualData.documento}
                      onChange={handleInputChange}
                      className="modal-input"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="corretor">
                      <span className="label-icon">🤝</span>
                      Corretor
                    </label>
                    <input
                      type="text"
                      id="corretor"
                      name="corretor"
                      value={manualData.corretor}
                      onChange={handleInputChange}
                      className="modal-input"
                      placeholder="Nome do corretor"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="action-buttons">
              <button
                className="btn-primary btn-confirm"
                onClick={handleConfirmReservation}
                disabled={clientSelectDisabled}
              >
                <span className="btn-icon">✓</span>
                Confirmar Reserva
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
