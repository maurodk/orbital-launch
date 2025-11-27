// frontend/src/components/BlockModal.tsx

import { useState } from "react";

interface BlockModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  onConfirm: (password: string) => void;
  isBlocking: boolean;
  apiError?: string;
  // A prop clearApiError não é mais necessária aqui
}

export function BlockModal({
  show,
  onClose,
  unitData,
  onConfirm,
  isBlocking,
  apiError,
}: BlockModalProps) {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  if (!show || !unitData) return null;

  const unitName = unitData[2] || "N/A";
  const title = isBlocking ? `Bloquear Unidade` : `Desbloquear Unidade`;
  const message = isBlocking
    ? `Tem certeza que deseja bloquear a unidade "${unitName}"? Ela ficará inDisponível para reservas.`
    : `Para desbloquear a unidade "${unitName}", digite a senha de acesso:`;
  const buttonText = isBlocking
    ? "Sim, Bloquear Unidade"
    : "Desbloquear Unidade";

  // Usando classes condicionais para reutilizar estilos ou aplicar novos
  const confirmButtonClass = isBlocking
    ? "modal-cancel-button" // Usando a classe do botão de cancelar (vermelho) para a ação de bloqueio
    : "modal-reserve-button";

  const handleConfirm = () => {
    if (!isBlocking && !password.trim()) {
      setPasswordError("Senha é obrigatória para esta operação.");
      return;
    }
    setPasswordError("");
    onConfirm(password); // A limpeza do erro agora é feita no App.tsx antes da chamada
  };

  const handleClose = () => {
    setPassword("");
    setPasswordError("");
    // A limpeza do erro da API também é tratada no App.tsx ao fechar o modal
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={handleClose}>
          ×
        </button>
        <h2>
          {title}: <strong>{unitName}</strong>
        </h2>
        <p
          style={{ marginTop: "25px", marginBottom: "15px", lineHeight: "1.6" }}
        >
          {message}
        </p>

        {!isBlocking && (
          <div style={{ marginBottom: "20px" }}>
            <input
              type="password"
              placeholder="Digite a senha de acesso"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                // Limpa o erro de validação local ao digitar
                // O erro da API será limpo no App.tsx na próxima tentativa de submissão
                if (passwordError) setPasswordError("");
              }}
              style={{
                width: "100%",
                padding: "10px",
                border: passwordError ? "2px solid #d9534f" : "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
            />
            {passwordError && (
              <p
                style={{
                  color: "#d9534f",
                  fontSize: "12px",
                  marginTop: "5px",
                  marginBottom: "0",
                }}
              >
                {passwordError}
              </p>
            )}
            {/* Exibe o erro vindo da API diretamente da prop */}
            {apiError && (
              <p
                style={{
                  color: "#d9534f",
                  fontSize: "12px",
                  marginTop: "5px",
                  marginBottom: "0",
                }}
              >
                {apiError}
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            className="modal-block-button" // Botão de cancelar (estilo cinza/borda)
            onClick={handleClose}
            style={{
              width: "100%",
              margin: 0,
              color: "#ccc",
              borderColor: "#555",
            }}
          >
            Cancelar
          </button>
          <button
            className={confirmButtonClass}
            onClick={handleConfirm}
            style={{ width: "100%", margin: 0 }}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
