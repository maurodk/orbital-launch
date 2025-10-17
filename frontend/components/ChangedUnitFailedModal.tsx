// frontend/components/ChangeUnitFailedModal.tsx
interface ChangeUnitFailedModalProps {
  show: boolean;
  onClose: () => void;
  message: string;
}

export function ChangeUnitFailedModal({
  show,
  onClose,
  message,
}: ChangeUnitFailedModalProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        <h2>Falha na Troca de Unidade</h2>
        <p>Não foi possível concluir a troca da unidade.</p>
        <p style={{ color: "#d9534f", fontWeight: "bold", marginTop: "15px" }}>
          Motivo: {message}
        </p>
        <button
          className="modal-reserve-button"
          onClick={onClose}
          style={{ marginTop: "25px" }}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
