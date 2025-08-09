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

  // MUDANÇA AQUI: O nome do cliente agora vem do índice 5
  const clientName = unitData[5] || "N/A";
  const unitName = unitData[3] || "N/A"; // Permanece no índice 3

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
