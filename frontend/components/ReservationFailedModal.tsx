// src/components/ReservationFailedModal.tsx

interface ReservationFailedModalProps {
  show: boolean;
  onClose: () => void;
  message: string;
  unitData: string[] | null;
}

export function ReservationFailedModal({
  show,
  onClose,
  message,
  unitData,
}: ReservationFailedModalProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Falha na Reserva</h2>
        <p>
          Não foi possível reservar a unidade{" "}
          <strong>{unitData?.[2] || ""}</strong>.
        </p>
        <p style={{ color: "#d9534f", fontWeight: "bold" }}>{message}</p>
        <button className="modal-reserve-button" onClick={onClose}>
          Entendi
        </button>
      </div>
    </div>
  );
}
