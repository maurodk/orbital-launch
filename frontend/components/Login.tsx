// frontend/src/components/Login.tsx

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebaseConfig"; // Importa a nossa config

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // O login foi bem-sucedido. O App.tsx vai detectar a mudança e redirecionar.
    } catch (err) {
      setError("Falha no login. Verifique seu e-mail e senha.");
      console.error(err);
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleLogin} className="login-form">
        <img src="/logo.png" alt="Logo VCA" className="main-logo" />
        <h2>Acesso ao Sistema</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
        />
        {error && <p className="login-error">{error}</p>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}
