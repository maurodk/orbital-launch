// src/components/CancelModal.tsx

interface CancelModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  onConfirmCancel: () => void;
}

export function CancelModal({
  show,
  onClose,
  unitData,
  onConfirmCancel,
}: CancelModalProps) {
  if (!show || !unitData) return null;

  // Coluna H - cliente, Coluna C - nome_unidade
  const clientName = unitData[7] || "N/A";
  const unitName = unitData[2] || "N/A";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          Cancelar Reserva da Unidade: <strong>{unitName}</strong>
        </h2>
        <p>Esta unidade está reservada para o cliente:</p>
        <p className="client-name-display">{clientName}</p>
        <p>Tem certeza de que deseja cancelar esta reserva?</p>

        <button className="modal-cancel-button" onClick={onConfirmCancel}>
          Sim, Cancelar Reserva
        </button>
      </div>
    </div>
  );
}
