import { useState, useCallback, useRef } from "react";
import axios from "axios";

interface ReservationState {
  isReserving: boolean;
  reservationToken: string | null;
  expiresAt: number | null;
  error: string | null;
}

interface ReservationManager {
  reservationState: ReservationState;
  createTempReservation: (
    implantacao: string,
    rowIndex: number,
    unitName: string
  ) => Promise<{ success: boolean; token?: string }>;
  confirmReservation: (
    implantacao: string,
    rowIndex: number,
    data: any,
    clientName: string,
    unitName: string,
    reservationToken: string
  ) => Promise<boolean>;
  cancelTempReservation: (
    implantacao: string,
    rowIndex: number
  ) => Promise<void>;
  clearError: () => void;
}

export function useReservationManager(apiUrl: string): ReservationManager {
  const [reservationState, setReservationState] = useState<ReservationState>({
    isReserving: false,
    reservationToken: null,
    expiresAt: null,
    error: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const generateReservationToken = useCallback(() => {
    return `reservation_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }, []);

  const createTempReservation = useCallback(
    async (
      implantacao: string,
      rowIndex: number,
      unitName: string,
      retryCount = 0
    ): Promise<{ success: boolean; token?: string }> => {
      const maxRetries = 3;
      const baseDelay = 1000; // 1 segundo

      try {
        setReservationState((prev) => ({
          ...prev,
          isReserving: true,
          error: null,
        }));

        const reservationToken = generateReservationToken();

        const response = await axios.post(`${apiUrl}/api/reserve-temp`, {
          implantacao,
          rowIndex,
          unitName,
          reservationToken,
        });

        if (response.data.success) {
          const expiresAt = Date.now() + response.data.expiresIn;
          setReservationState((prev) => ({
            ...prev,
            reservationToken,
            expiresAt,
            isReserving: false,
          }));

          // Configura timeout para limpar a reserva temporária automaticamente
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          timeoutRef.current = setTimeout(() => {
            setReservationState((prev) => ({
              ...prev,
              reservationToken: null,
              expiresAt: null,
            }));
          }, response.data.expiresIn);

          return { success: true, token: reservationToken };
        }

        return { success: false };
      } catch (error: any) {
        console.error(
          `Erro ao criar reserva temporária (tentativa ${retryCount + 1}):`,
          error
        );

        // Se é um erro de conflito (409) ou não é um erro de rede, não tenta novamente
        if (error.response?.status === 409 || error.response?.status === 400) {
          let errorMessage = "Erro ao criar reserva temporária.";
          if (error.response?.data?.error) {
            errorMessage = error.response.data.error;
          }

          setReservationState((prev) => ({
            ...prev,
            isReserving: false,
            error: errorMessage,
          }));

          return { success: false };
        }

        // Se ainda há tentativas disponíveis e é um erro de rede, tenta novamente
        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Backoff exponencial
          console.log(`Tentando novamente em ${delay}ms...`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          return createTempReservation(
            implantacao,
            rowIndex,
            unitName,
            retryCount + 1
          );
        }

        // Se esgotou as tentativas
        let errorMessage =
          "Erro ao criar reserva temporária após múltiplas tentativas.";
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }

        setReservationState((prev) => ({
          ...prev,
          isReserving: false,
          error: errorMessage,
        }));

        return { success: false };
      }
    },
    [apiUrl, generateReservationToken]
  );

  const confirmReservation = useCallback(
    async (
      implantacao: string,
      rowIndex: number,
      data: any,
      clientName: string,
      unitName: string,
      reservationToken: string,
      retryCount = 0
    ): Promise<boolean> => {
      const maxRetries = 3;
      const baseDelay = 1000; // 1 segundo

      try {
        if (!reservationToken) {
          throw new Error("Token de reserva não encontrado");
        }

        const response = await axios.post(`${apiUrl}/api/confirm-reservation`, {
          implantacao,
          rowIndex,
          data,
          clientName,
          unitName,
          reservationToken,
        });

        if (response.data.success) {
          // Limpa o estado da reserva
          setReservationState({
            isReserving: false,
            reservationToken: null,
            expiresAt: null,
            error: null,
          });

          // Limpa o timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          return true;
        }

        return false;
      } catch (error: any) {
        console.error(
          `Erro ao confirmar reserva (tentativa ${retryCount + 1}):`,
          error
        );

        // Se é um erro de conflito (409) ou não é um erro de rede, não tenta novamente
        if (
          error.response?.status === 409 ||
          error.response?.status === 400 ||
          error.response?.status === 403
        ) {
          let errorMessage = "Erro ao confirmar reserva.";
          if (error.response?.data?.error) {
            errorMessage = error.response.data.error;
          }

          setReservationState((prev) => ({
            ...prev,
            error: errorMessage,
          }));

          return false;
        }

        // Se ainda há tentativas disponíveis e é um erro de rede, tenta novamente
        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Backoff exponencial
          console.log(`Tentando confirmar novamente em ${delay}ms...`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          return confirmReservation(
            implantacao,
            rowIndex,
            data,
            clientName,
            unitName,
            reservationToken,
            retryCount + 1
          );
        }

        // Se esgotou as tentativas
        let errorMessage =
          "Erro ao confirmar reserva após múltiplas tentativas.";
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }

        setReservationState((prev) => ({
          ...prev,
          error: errorMessage,
        }));

        return false;
      }
    },
    [apiUrl]
  );

  const cancelTempReservation = useCallback(
    async (implantacao: string, rowIndex: number): Promise<void> => {
      try {
        if (!reservationState.reservationToken) {
          return;
        }

        await axios.post(`${apiUrl}/api/cancel-temp-reservation`, {
          implantacao,
          rowIndex,
          reservationToken: reservationState.reservationToken,
        });

        // Limpa o estado da reserva
        setReservationState({
          isReserving: false,
          reservationToken: null,
          expiresAt: null,
          error: null,
        });

        // Limpa o timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } catch (error: any) {
        console.error("Erro ao cancelar reserva temporária:", error);
        // Mesmo com erro, limpa o estado local
        setReservationState({
          isReserving: false,
          reservationToken: null,
          expiresAt: null,
          error: null,
        });
      }
    },
    [apiUrl, reservationState.reservationToken]
  );

  const clearError = useCallback(() => {
    setReservationState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    reservationState,
    createTempReservation,
    confirmReservation,
    cancelTempReservation,
    clearError,
  };
}
