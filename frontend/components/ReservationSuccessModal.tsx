// src/components/ReservationSuccessModal.tsx

import React, { useEffect, useState } from "react";

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
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (show) {
      // Inicia a animação de confete após um pequeno delay
      const confettiTimer = setTimeout(() => {
        setShowConfetti(true);
      }, 200);

      // Fecha automaticamente após 4 segundos
      const closeTimer = setTimeout(() => {
        onClose();
      }, 4000);

      return () => {
        clearTimeout(confettiTimer);
        clearTimeout(closeTimer);
        setShowConfetti(false);
      };
    }
  }, [show, onClose]);

  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content success-modal"
        style={{ textAlign: "center" }}
      >
        {showConfetti && <div className="confetti-container"></div>}

        <div className="success-checkmark">
          <div className="check-icon"></div>
        </div>

        <div className="success-content">
          <h2 className="success-title">🎉 Reserva Confirmada!</h2>
          <div className="success-message">
            <p className="success-unit">
              A unidade <span className="unit-highlight">{unitName || ""}</span>{" "}
              agora é sua!
            </p>
            <p className="success-subtitle">
              Parabéns! Sua reserva foi processada com sucesso.
            </p>
          </div>

          <div className="success-actions">
            <button
              className="success-close-button"
              onClick={onClose}
              autoFocus
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
