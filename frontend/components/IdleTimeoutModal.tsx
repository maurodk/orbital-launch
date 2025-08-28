// frontend/src/components/IdleTimeoutModal.tsx

import { useState, useEffect } from "react";

interface IdleTimeoutModalProps {
  show: boolean;
  onContinue: () => void;
  onLogout: () => void;
  countdownSeconds?: number;
}

export function IdleTimeoutModal({
  show,
  onContinue,
  onLogout,
  countdownSeconds = 60,
}: IdleTimeoutModalProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);

  useEffect(() => {
    if (!show) {
      setCountdown(countdownSeconds); // Reseta o contador quando o modal fecha
      return;
    }

    // Inicia a contagem regressiva
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onLogout(); // Desloga quando o tempo acaba
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Limpa o intervalo quando o componente é desmontado ou o modal fecha
    return () => clearInterval(interval);
  }, [show, onLogout, onContinue, countdownSeconds]);

  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{ maxWidth: "450px", textAlign: "center" }}
      >
        <h2>Sua sessão está prestes a expirar</h2>
        <p style={{ margin: "20px 0", fontSize: "1rem" }}>
          Por motivos de segurança, você será desconectado em:
        </p>
        <p
          style={{
            fontSize: "2rem",
            fontWeight: "bold",
            color: "var(--accent-green)",
            margin: "10px 0 30px",
          }}
        >
          {countdown} segundos
        </p>
        <p>Deseja continuar sua sessão?</p>

        <div style={{ display: "flex", gap: "15px", marginTop: "25px" }}>
          <button
            className="modal-block-button"
            style={{ width: "100%", margin: 0 }}
            onClick={onLogout}
          >
            Sair Agora
          </button>
          <button
            className="modal-reserve-button"
            style={{ width: "100%", margin: 0 }}
            onClick={onContinue}
          >
            Continuar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
