// src/components/VerifyingModal.tsx

interface VerifyingModalProps {
  show: boolean;
}

export function VerifyingModal({ show }: VerifyingModalProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: "center" }}>
        <div className="loading-spinner" style={{ margin: "20px auto" }}></div>
        <h2>Verificando Reserva...</h2>
        <p>Aguarde um momento, estamos garantindo a sua unidade.</p>
      </div>
    </div>
  );
}
