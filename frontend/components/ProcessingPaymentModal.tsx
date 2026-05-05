// src/components/ProcessingPaymentModal.tsx

import { useState, useEffect } from "react";
import "./VerifyingModal.css";

interface ProcessingPaymentModalProps {
  show: boolean;
  paymentState?: {
    isProcessing: boolean;
    currentStep: string;
    progress: number;
    error: string | null;
    success: boolean;
  };
}

const PAYMENT_STEPS = [
  "Iniciando processamento...",
  "Salvando dados de pagamento...",
  "Gerando plano de pagamento...",
  "Criando parcelas...",
  "Finalizando processo...",
];

export function ProcessingPaymentModal({
  show,
  paymentState,
}: ProcessingPaymentModalProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!show) {
      setProgress(0);
      setCurrentStep(0);
      return;
    }

    if (paymentState?.progress !== undefined) {
      setProgress(paymentState.progress);
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95 && !paymentState?.success) return prev;
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, 100);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= PAYMENT_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(stepInterval);
    };
  }, [show, paymentState?.success, paymentState?.progress]);

  if (!show) {
    return null;
  }

  const getStatusIcon = () => {
    if (paymentState?.error) return "❌";
    if (paymentState?.success) return "✅";
    return "💳";
  };

  const getStatusColor = () => {
    if (paymentState?.error) return "#ff4757";
    if (paymentState?.success) return "#2ed573";
    return "#ffa502";
  };

  return (
    <div className="modal-overlay verifying-modal-overlay">
      <div className="modal-content verifying-modal-content">
        <div className="verifying-header">
          <div
            className="verifying-icon"
            style={{
              backgroundColor: getStatusColor(),
              animation: paymentState?.error
                ? "shake 0.5s ease-in-out"
                : "pulse 2s infinite",
            }}
          >
            {getStatusIcon()}
          </div>
          <h2 className="verifying-title">
            {paymentState?.error
              ? "Erro no Pagamento"
              : paymentState?.success
              ? "Pagamento Concluído"
              : "Processando Pagamento"}
          </h2>
        </div>

        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{progress}%</span>
        </div>

        <div className="current-step">
          <p className="step-text">
            {paymentState?.currentStep || PAYMENT_STEPS[currentStep]}
          </p>
        </div>

        <div className="reservation-info">
          {paymentState?.success && (
            <div className="success-info">
              <div className="info-item">
                <span className="info-icon">✓</span>
                <span className="info-text">Pagamento registrado com sucesso</span>
              </div>
            </div>
          )}

          {paymentState?.error && (
            <div className="error-info">
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span className="error-text">{paymentState.error}</span>
              </div>
            </div>
          )}
        </div>

        <div className="user-tips">
          <p className="tip-text">
            {paymentState?.error
              ? "Por favor, tente novamente ou entre em contato com o suporte."
              : paymentState?.success
              ? "O pagamento foi processado com sucesso!"
              : "Não feche esta janela durante o processamento."}
          </p>
        </div>
      </div>
    </div>
  );
}
