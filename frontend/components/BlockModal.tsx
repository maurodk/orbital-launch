// frontend/src/components/BlockModal.tsx

import React, { useState, useEffect } from "react";

interface BlockModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  onConfirm: (password: string) => void;
  isBlocking: boolean;
  apiError?: string; // Prop opcional para receber o erro da API
}

export function BlockModal({
  show,
  onClose,
  unitData,
  onConfirm,
  isBlocking,
  apiError, // Recebe a prop
}: BlockModalProps) {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [internalApiError, setInternalApiError] = useState(apiError || "");

  // Sincroniza o erro da API vindo das props com o estado interno
  useEffect(() => {
    setInternalApiError(apiError || "");
  }, [apiError]);

  if (!show || !unitData) return null;

  const unitName = unitData[2] || "N/A";
  const title = isBlocking ? `Bloquear Unidade` : `Desbloquear Unidade`;
  const message = isBlocking
    ? `Para bloquear a unidade "${unitName}", digite a senha de acesso:`
    : `Esta unidade está bloqueada. Para desbloqueá-la, digite a senha de acesso:`;
  const buttonText = isBlocking ? "Bloquear Unidade" : "Desbloquear Unidade";

  // Usando classes condicionais para reutilizar estilos ou aplicar novos
  const confirmButtonClass = isBlocking
    ? "modal-block-button"
    : "modal-reserve-button";

  const handleConfirm = () => {
    if (!password.trim()) {
      setPasswordError("Senha é obrigatória para esta operação.");
      return;
    }
    setPasswordError("");
    setInternalApiError(""); // Limpa o erro da API ao tentar novamente
    onConfirm(password);
    setPassword("");
  };

  const handleClose = () => {
    setPassword("");
    setInternalApiError("");
    setPasswordError("");
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

        <div style={{ marginBottom: "20px" }}>
          <input
            type="password"
            placeholder="Digite a senha de acesso"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (internalApiError) setInternalApiError("");
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
          {/* Exibe o erro vindo da API */}
          {internalApiError && (
            <p
              style={{
                color: "#d9534f",
                fontSize: "12px",
                marginTop: "5px",
                marginBottom: "0",
              }}
            >
              {internalApiError}
            </p>
          )}
        </div>

        <button
          className={confirmButtonClass}
          onClick={handleConfirm}
          style={{ width: "100%" }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
