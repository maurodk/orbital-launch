// src/components/PaymentSuccessModal.tsx

import { useEffect, useState } from "react";

interface PaymentSuccessModalProps {
  show: boolean;
  onClose: () => void;
  unitName: string | null;
}

export function PaymentSuccessModal({
  show,
  onClose,
  unitName,
}: PaymentSuccessModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (show) {
      const confettiTimer = setTimeout(() => {
        setShowConfetti(true);
      }, 200);

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

  if (!show) return null;

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
          <h2 className="success-title">💳 Pagamento Registrado!</h2>
          <div className="success-message">
            <p className="success-unit">
              O pagamento da unidade <span className="unit-highlight">{unitName || ""}</span>{" "}
              foi registrado com sucesso!
            </p>
            <p className="success-subtitle">
              Parabéns! O pagamento foi processado com sucesso.
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
