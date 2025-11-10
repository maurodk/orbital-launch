import { useState } from "react";
import "./FullNameModal.css";

interface FullNameModalProps {
  show: boolean;
  onConfirm: (fullName: string) => void;
}

export function FullNameModal({ show, onConfirm }: FullNameModalProps) {
  const [fullName, setFullName] = useState("");

  if (!show) return null;

  const handleSubmit = () => {
    if (fullName.trim()) {
      onConfirm(fullName.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content fullname-modal">
        <h2>Complete seu cadastro</h2>
        <p>Por favor, informe seu nome completo:</p>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Digite seu nome completo"
          autoFocus
          onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button onClick={handleSubmit} disabled={!fullName.trim()}>
          Confirmar
        </button>
      </div>
    </div>
  );
}
