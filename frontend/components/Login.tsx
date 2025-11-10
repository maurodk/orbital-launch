import { useState } from "react";
import { auth } from "../src/supabaseClient";
import "./Login.css";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await auth.signInWithEmailAndPassword(email, password);
      if (signInError) throw signInError;
    } catch (err: any) {
      setError(err.message || "Falha no login. Verifique seu e-mail e senha.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="login-gradient"></div>
      </div>
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <img src="/logo.png" alt="Logo VCA" className="login-logo" />
            <h1 className="login-title">Espelho Digital</h1>
            <p className="login-subtitle">Sistema de Implantação Humanizada</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                disabled={loading}
              />
            </div>
            <div className="input-group">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
            {error && (
              <div className="login-error">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? (
                <>
                  <span className="button-spinner"></span>
                  <span>Entrando...</span>
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
