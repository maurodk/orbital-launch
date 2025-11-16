import { useState, useEffect } from "react";

interface PrintConfigModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (config: PrintConfig) => void;
  pixValue?: string;
}

export type SaleType = "CEF" | "FACILITA";
export type PlanType = "PADRAO" | "BLACK";

export interface PrintConfig {
  hasRegistro: boolean;
  paymentType: "PIX" | "DINHEIRO";
  paymentValue: string;
  saleType: SaleType;
  planType?: PlanType;
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
  const [displayValue, setDisplayValue] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("CEF");
  const [planType, setPlanType] = useState<PlanType>("PADRAO");

  useEffect(() => {
    if (show && pixValue) {
      const numericValue = parseFloat(pixValue.replace(/[^\d]/g, "")) / 100;
      setPaymentValue(numericValue.toString());
      setDisplayValue(formatCurrency(numericValue));
    }
  }, [show, pixValue]);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, "");

    if (!rawValue) {
      setDisplayValue("");
      setPaymentValue("0");
      return;
    }

    const numericValue = parseInt(rawValue, 10) / 100;
    setPaymentValue(numericValue.toString());
    setDisplayValue(formatCurrency(numericValue));
  };

  const handleConfirm = () => {
    onConfirm({
      hasRegistro,
      paymentType,
      paymentValue:
        displayValue || formatCurrency(parseFloat(paymentValue || "0")),
      saleType,
      planType: saleType === "FACILITA" ? planType : undefined,
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
          <label>Tipo de Venda</label>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button
              onClick={() => setSaleType("CEF")}
              style={{
                flex: 1,
                padding: "10px",
                background:
                  saleType === "CEF"
                    ? "var(--accent-green)"
                    : "var(--bg-dark-tertiary)",
                color:
                  saleType === "CEF"
                    ? "var(--bg-dark-primary)"
                    : "var(--text-secondary)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              CEF
            </button>
            <button
              onClick={() => setSaleType("FACILITA")}
              style={{
                flex: 1,
                padding: "10px",
                background:
                  saleType === "FACILITA"
                    ? "var(--accent-green)"
                    : "var(--bg-dark-tertiary)",
                color:
                  saleType === "FACILITA"
                    ? "var(--bg-dark-primary)"
                    : "var(--text-secondary)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Facilita
            </button>
          </div>
        </div>

        {saleType === "FACILITA" && (
          <div className="form-group">
            <label>Tipo de Plano</label>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                onClick={() => setPlanType("PADRAO")}
                style={{
                  flex: 1,
                  padding: "10px",
                  background:
                    planType === "PADRAO"
                      ? "var(--accent-green)"
                      : "var(--bg-dark-tertiary)",
                  color:
                    planType === "PADRAO"
                      ? "var(--bg-dark-primary)"
                      : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Plano Padrão
              </button>
              <button
                onClick={() => setPlanType("BLACK")}
                style={{
                  flex: 1,
                  padding: "10px",
                  background:
                    planType === "BLACK"
                      ? "var(--accent-green)"
                      : "var(--bg-dark-tertiary)",
                  color:
                    planType === "BLACK"
                      ? "var(--bg-dark-primary)"
                      : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Condição Black
              </button>
            </div>
          </div>
        )}

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
            value={displayValue}
            onChange={handleValueChange}
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
