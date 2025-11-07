import { useState, useEffect } from "react";

interface PrintConfigModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (config: PrintConfig) => void;
  pixValue?: string;
}

export interface PrintConfig {
  hasRegistro: boolean;
  paymentType: "PIX" | "DINHEIRO";
  paymentValue: string;
}

export function PrintConfigModal({
  show,
  onClose,
  onConfirm,
  pixValue = "",
}: PrintConfigModalProps) {
  const [hasRegistro, setHasRegistro] = useState(false);
  const [paymentType, setPaymentType] = useState<"PIX" | "DINHEIRO">("PIX");
  const [paymentValue, setPaymentValue] = useState("");

  useEffect(() => {
    if (show && pixValue) {
      setPaymentValue(pixValue);
    }
  }, [show, pixValue]);

  const handleConfirm = () => {
    onConfirm({
      hasRegistro,
      paymentType,
      paymentValue,
    });
    onClose();
  };

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>Configurar Termo de Reserva</h2>

        <div className="form-group">
          <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="checkbox"
              checked={hasRegistro}
              onChange={(e) => setHasRegistro(e.target.checked)}
              style={{ width: "20px", height: "20px" }}
            />
            <span>Possui Registro</span>
          </label>
        </div>

        <div className="form-group">
          <label>Tipo de Pagamento</label>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button
              onClick={() => setPaymentType("PIX")}
              style={{
                flex: 1,
                padding: "10px",
                background:
                  paymentType === "PIX"
                    ? "var(--accent-green)"
                    : "var(--bg-dark-tertiary)",
                color:
                  paymentType === "PIX"
                    ? "var(--bg-dark-primary)"
                    : "var(--text-secondary)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              PIX
            </button>
            <button
              onClick={() => setPaymentType("DINHEIRO")}
              style={{
                flex: 1,
                padding: "10px",
                background:
                  paymentType === "DINHEIRO"
                    ? "var(--accent-green)"
                    : "var(--bg-dark-tertiary)",
                color:
                  paymentType === "DINHEIRO"
                    ? "var(--bg-dark-primary)"
                    : "var(--text-secondary)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              DINHEIRO
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Valor do Pagamento (opcional)</label>
          <input
            type="text"
            value={paymentValue}
            onChange={(e) => setPaymentValue(e.target.value)}
            placeholder="R$ 0,00"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "var(--bg-dark-tertiary)",
              border: "2px solid var(--bg-dark-tertiary)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontSize: "1rem",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleConfirm}
          className="modal-reserve-button"
          style={{ marginTop: "10px" }}
        >
          Gerar e Imprimir Termo
        </button>
      </div>
    </div>
  );
}
