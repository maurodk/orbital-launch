import { useState, useEffect, useCallback, useRef } from "react";

interface PollingData {
  source: "supabase" | "sheets";
  status: string;
  unitName: string;
  coordX: string;
  coordY: string;
  timestamp: number;
  fromCache?: boolean;
}

interface PollingConfig {
  implantacao: string;
  recommendedInterval: number;
  minInterval: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  recentChanges: {
    lastChange: number;
    changeCount: number;
    timeSinceLastChange: number;
  } | null;
  rateLimits: {
    sheets: string;
    supabase: string;
    polling: string;
  };
}

interface UseIntelligentPollingProps {
  implantacao: string;
  rowIndex?: number;
  enabled?: boolean;
  onDataChange?: (newData: PollingData) => void;
  onError?: (error: Error) => void;
}

interface UseIntelligentPollingReturn {
  data: PollingData | null;
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
  refetch: () => Promise<void>;
  config: PollingConfig | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Hook React para polling inteligente de unidades
 *
 * Funcionalidades:
 * - Polling automático com intervalo adaptativo
 * - Cache de 5 segundos
 * - Rate limiting (3s mínimo entre polls)
 * - Detecção de mudanças
 * - Exponential backoff quando não há mudanças
 * - Pooling de requisições
 *
 * @example
 * ```tsx
 * const { data, loading, fromCache, refetch } = useIntelligentPolling({
 *   implantacao: 'Minha Implantação',
 *   rowIndex: 5,
 *   onDataChange: (newData) => {
 *     console.log('Mudança detectada!', newData);
 *   },
 * });
 * ```
 */
export function useIntelligentPolling({
  implantacao,
  rowIndex,
  enabled = true,
  onDataChange,
  onError,
}: UseIntelligentPollingProps): UseIntelligentPollingReturn {
  const [data, setData] = useState<PollingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [config, setConfig] = useState<PollingConfig | null>(null);
  const [pollingInterval, setPollingInterval] = useState(3000);

  const previousDataRef = useRef<PollingData | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Busca configuração de polling ao montar
  useEffect(() => {
    if (!enabled || !implantacao) return;

    const fetchConfig = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/polling-config?implantacao=${encodeURIComponent(
            implantacao
          )}`
        );

        if (response.ok) {
          const configData = await response.json();
          setConfig(configData);
          setPollingInterval(configData.recommendedInterval);
        }
      } catch (err) {
        console.warn(
          "[useIntelligentPolling] Falha ao buscar configuração:",
          err
        );
      }
    };

    fetchConfig();
  }, [implantacao, enabled]);

  // Função para buscar dados
  const fetchData = useCallback(async () => {
    if (!implantacao) return;

    setLoading(true);
    setError(null);

    try {
      let url: string;

      if (rowIndex !== undefined) {
        // Polling de unidade específica
        url = `${API_BASE_URL}/api/fast-poll-unit?implantacao=${encodeURIComponent(
          implantacao
        )}&rowIndex=${rowIndex}`;
      } else {
        // Busca dados gerais da implantação
        url = `${API_BASE_URL}/api/data?implantacao=${encodeURIComponent(
          implantacao
        )}`;
      }

      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limit excedido
        const errorData = await response.json();
        const retryAfter = errorData.retryAfter || 3000;

        console.warn(
          `[useIntelligentPolling] Rate limit excedido. Aguardando ${retryAfter}ms`
        );

        // Aumenta o intervalo de polling
        setPollingInterval((prev) => Math.min(prev * 1.5, 30000));

        throw new Error(
          `Rate limit excedido. Aguarde ${Math.ceil(retryAfter / 1000)}s`
        );
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const newData = await response.json();

      if (!isMountedRef.current) return;

      // Verifica se está usando cache
      const isFromCache = newData.fromCache === true;
      setFromCache(isFromCache);
      setData(newData);

      // Detecta mudanças
      if (previousDataRef.current && onDataChange) {
        const hasChanged =
          previousDataRef.current.status !== newData.status ||
          previousDataRef.current.unitName !== newData.unitName;

        if (hasChanged) {
          onDataChange(newData);
          // Reduz intervalo quando há mudanças
          setPollingInterval(3000);
        } else if (!isFromCache) {
          // Aumenta intervalo quando não há mudanças
          setPollingInterval((prev) => Math.min(prev * 1.2, 30000));
        }
      }

      previousDataRef.current = newData;
    } catch (err) {
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      if (onError) {
        onError(error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [implantacao, rowIndex, onDataChange, onError]);

  // Função para forçar atualização
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Polling automático
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Busca inicial
    fetchData();

    // Configura polling
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      fetchData();
    }, pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollingInterval, fetchData]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    fromCache,
    refetch,
    config,
  };
}

export default useIntelligentPolling;
