import { useState } from "react";
import "./PasswordModal.css";

interface PasswordModalProps {
  onSuccess: () => void;
}

export function PasswordModal({ onSuccess }: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "diretorvca2026") {
      localStorage.setItem("diretoriaAuth", "true");
      onSuccess();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="password-modal-overlay">
      <div className="password-modal-content">
        <div className="password-modal-icon">🔒</div>
        <h2>Acesso Restrito</h2>
        <p>Esta página requer autenticação</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite a senha"
            autoFocus
            className={error ? "error" : ""}
          />
          {error && <span className="error-message">Senha incorreta</span>}
          <button type="submit">Acessar</button>
        </form>
      </div>
    </div>
  );
}
