// src/components/VerifyingModal.tsx

import { useState, useEffect } from "react";
import "./VerifyingModal.css";

interface VerifyingModalProps {
  show: boolean;
  reservationState?: {
    isReserving: boolean;
    reservationToken: string | null;
    expiresAt: number | null;
    error: string | null;
  };
}

export function VerifyingModal({
  show,
  reservationState,
}: VerifyingModalProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Iniciando processo de reserva...",
    "Verificando disponibilidade...",
    "Criando reserva temporária...",
    "Confirmando reserva...",
    "Finalizando processo...",
  ];

  useEffect(() => {
    if (!show) {
      setProgress(0);
      setCurrentStep(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, 100);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) return prev;
        return prev + 1;
      });
    }, 800);

    return () => {
      clearInterval(interval);
      clearInterval(stepInterval);
    };
  }, [show]);

  if (!show) {
    return null;
  }

  const getTimeRemaining = () => {
    if (!reservationState?.expiresAt) return null;
    const remaining = Math.max(0, reservationState.expiresAt - Date.now());
    return Math.ceil(remaining / 1000);
  };

  const timeRemaining = getTimeRemaining();

  const getStatusIcon = () => {
    if (reservationState?.error) return "❌";
    if (reservationState?.reservationToken) return "✅";
    return "⏳";
  };

  const getStatusColor = () => {
    if (reservationState?.error) return "#ff4757";
    if (reservationState?.reservationToken) return "#2ed573";
    return "#ffa502";
  };

  return (
    <div className="modal-overlay verifying-modal-overlay">
      <div className="modal-content verifying-modal-content">
        {/* Header com ícone animado */}
        <div className="verifying-header">
          <div
            className="verifying-icon"
            style={{
              backgroundColor: getStatusColor(),
              animation: reservationState?.error
                ? "shake 0.5s ease-in-out"
                : "pulse 2s infinite",
            }}
          >
            {getStatusIcon()}
          </div>
          <h2 className="verifying-title">
            {reservationState?.error
              ? "Erro na Reserva"
              : "Processando Reserva"}
          </h2>
        </div>

        {/* Barra de progresso */}
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{progress}%</span>
        </div>

        {/* Status atual */}
        <div className="current-step">
          <p className="step-text">{steps[currentStep]}</p>
        </div>

        {/* Informações da reserva */}
        <div className="reservation-info">
          {reservationState?.reservationToken && (
            <div className="success-info">
              <div className="info-item">
                <span className="info-icon">🔒</span>
                <span className="info-text">Reserva temporária ativa</span>
              </div>
              {timeRemaining && (
                <div className="info-item">
                  <span className="info-icon">⏱️</span>
                  <span className="info-text">Expira em {timeRemaining}s</span>
                </div>
              )}
            </div>
          )}

          {reservationState?.error && (
            <div className="error-info">
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span className="error-text">{reservationState.error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Dicas para o usuário */}
        <div className="user-tips">
          <p className="tip-text">
            {reservationState?.error
              ? "Por favor, tente novamente ou entre em contato com o suporte."
              : "Não feche esta janela durante o processo de reserva."}
          </p>
        </div>
      </div>
    </div>
  );
}
