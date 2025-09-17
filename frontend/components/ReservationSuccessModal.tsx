// src/components/ReservationSuccessModal.tsx

import { useEffect } from "react";

interface ReservationSuccessModalProps {
  show: boolean;
  onClose: () => void;
  unitName: string | null;
}

export function ReservationSuccessModal({
  show,
  onClose,
  unitName,
}: ReservationSuccessModalProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); // Fecha automaticamente após 3 segundos

      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ textAlign: "center" }}>
        <div className="success-checkmark">
          <div className="check-icon"></div>
        </div>
        <h2>Reserva Confirmada!</h2>
        <p>
          A unidade <strong>{unitName || ""}</strong> agora é sua.
        </p>
      </div>
    </div>
  );
}
