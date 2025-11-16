import { useState, useEffect } from "react";
import "./PixCountdown.css";

interface PixCountdownProps {
  pixTimestamp?: string; // ISO 8601 timestamp (opcional agora)
  unitName: string; // Nome da unidade para buscar no histórico
  implantacaoNome: string; // Nome da implantação
  onExpire?: () => void;
}

export function PixCountdown({
  pixTimestamp,
  unitName,
  implantacaoNome,
  onExpire,
}: PixCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [historicTimestamp, setHistoricTimestamp] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  // Busca o timestamp do histórico quando não há timestamp fornecido
  useEffect(() => {
    if (pixTimestamp) {
      setHistoricTimestamp(pixTimestamp);
      setLoading(false);
      return;
    }

    // Busca do histórico via API
    const fetchPixTimestamp = async () => {
      try {
        const apiUrl =
          process.env.NODE_ENV === "development"
            ? import.meta.env.VITE_LOCALHOST_API_URL
            : import.meta.env.VITE_AWS_API_URL;

        const token = localStorage.getItem("supabase_token");
        const response = await fetch(
          `${apiUrl}/api/history/${encodeURIComponent(implantacaoNome)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const historyData = await response.json();

          // Busca o registro mais recente de "PIX Gerado" para esta unidade
          const pixEntry = historyData
            .reverse() // Mais recente primeiro
            .find(
              (entry: string[]) =>
                entry[2] === unitName && // Coluna C: Unidade
                entry[3] === "PIX Gerado" // Coluna D: Ação
            );

          if (pixEntry && pixEntry[0]) {
            setHistoricTimestamp(pixEntry[0]); // Coluna A: Timestamp ISO
          }
        }
      } catch (error) {
        console.error(
          "[PixCountdown] Erro ao buscar timestamp do histórico:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPixTimestamp();
  }, [pixTimestamp, unitName, implantacaoNome]);

  useEffect(() => {
    if (!historicTimestamp || loading) return;

    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const pixDate = new Date(historicTimestamp).getTime();
      const elapsed = now - pixDate;
      const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutos em ms
      const remaining = Math.max(0, TIMEOUT_MS - elapsed);
      return remaining;
    };

    // Atualiza imediatamente
    setTimeRemaining(calculateTimeRemaining());

    // Atualiza a cada segundo
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      // Se expirou, chama callback
      if (remaining === 0 && onExpire) {
        onExpire();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [historicTimestamp, loading, onExpire]);

  // Mostra loading enquanto busca
  if (loading) {
    return (
      <div className="pix-countdown countdown-safe">
        <span className="countdown-icon">⏱️</span>
        <span className="countdown-text">...</span>
      </div>
    );
  }

  // Se não encontrou timestamp, não mostra nada
  if (!historicTimestamp) {
    return null;
  }

  // Converte ms para minutos e segundos
  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  // Determina a classe CSS baseada no tempo restante
  const getStatusClass = () => {
    if (minutes >= 30) return "countdown-safe"; // Verde
    if (minutes >= 10) return "countdown-warning"; // Amarelo
    return "countdown-danger"; // Vermelho
  };

  // Se expirou, mostra mensagem
  if (timeRemaining === 0) {
    return (
      <div className="pix-countdown countdown-expired">
        <span className="countdown-icon">⏰</span>
        <span className="countdown-text">Expirado</span>
      </div>
    );
  }

  return (
    <div className={`pix-countdown ${getStatusClass()}`}>
      <span className="countdown-icon">⏱️</span>
      <span className="countdown-time">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
