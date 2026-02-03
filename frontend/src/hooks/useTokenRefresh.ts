// Hook para gerenciar refresh automático de token
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import axios from 'axios';

const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // Renovar 5 minutos antes de expirar

export function useTokenRefresh() {
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);

  const updateTokenEverywhere = useCallback((newToken: string) => {
    // Atualizar no localStorage
    localStorage.setItem('token', newToken);
    
    // Atualizar no axios global
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    
    console.log('[TokenRefresh] Token atualizado em todos os lugares');
  }, []);

  const refreshToken = useCallback(async (force = false) => {
    // Evitar múltiplos refreshes simultâneos
    if (isRefreshingRef.current && !force) {
      console.log('[TokenRefresh] Refresh já em andamento, ignorando...');
      return null;
    }

    try {
      isRefreshingRef.current = true;
      console.log('[TokenRefresh] Iniciando refresh do token...');

      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error('[TokenRefresh] Erro ao renovar token:', error);
        
        // Se falhar, tentar obter sessão atual
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          updateTokenEverywhere(sessionData.session.access_token);
          return sessionData.session.access_token;
        }
        
        return null;
      }

      if (data?.session?.access_token) {
        updateTokenEverywhere(data.session.access_token);
        console.log('[TokenRefresh] Token renovado com sucesso');
        return data.session.access_token;
      }

      return null;
    } catch (error) {
      console.error('[TokenRefresh] Exceção ao renovar token:', error);
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [updateTokenEverywhere]);

  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    // Limpar timer anterior
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const now = Date.now();
    const timeUntilExpiry = expiresAt * 1000 - now;
    const refreshTime = timeUntilExpiry - TOKEN_REFRESH_MARGIN;

    if (refreshTime <= 0) {
      // Token já expirou ou está prestes a expirar, renovar imediatamente
      console.log('[TokenRefresh] Token expirado/expirando, renovando imediatamente');
      refreshToken();
    } else {
      console.log(`[TokenRefresh] Próximo refresh agendado em ${Math.round(refreshTime / 1000 / 60)} minutos`);
      
      refreshTimerRef.current = setTimeout(() => {
        refreshToken();
      }, refreshTime);
    }
  }, [refreshToken]);

  const decodeToken = useCallback((token: string): { exp: number } | null => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('[TokenRefresh] Erro ao decodificar token:', error);
      return null;
    }
  }, []);

  // Interceptor do axios para detectar 403 e renovar token automaticamente
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Se receber 403 (token expirado) e não for retry
        if (error.response?.status === 403 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          console.log('[TokenRefresh] 403 detectado - tentando renovar token');
          const newToken = await refreshToken(true);
          
          if (newToken) {
            // Atualizar o header da requisição original
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            
            // Retry da requisição original
            return axios(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, [refreshToken]);

  // Configurar refresh automático baseado na sessão
  useEffect(() => {
    let isMounted = true;

    const setupAutoRefresh = async () => {
      try {
        // Obter sessão atual
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token && isMounted) {
          // Atualizar token em todos os lugares
          updateTokenEverywhere(session.access_token);
          
          // Decodificar token para pegar tempo de expiração
          const decoded = decodeToken(session.access_token);
          
          if (decoded?.exp) {
            console.log(`[TokenRefresh] Token expira em: ${new Date(decoded.exp * 1000).toLocaleString('pt-BR')}`);
            scheduleTokenRefresh(decoded.exp);
          }
        }
      } catch (error) {
        console.error('[TokenRefresh] Erro ao configurar auto-refresh:', error);
      }
    };

    setupAutoRefresh();

    // Listener para mudanças na sessão
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        console.log('[TokenRefresh] Auth state mudou:', event);

        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          updateTokenEverywhere(session.access_token);
          
          const decoded = decodeToken(session.access_token);
          if (decoded?.exp) {
            scheduleTokenRefresh(decoded.exp);
          }
        } else if (event === 'SIGNED_IN' && session?.access_token) {
          updateTokenEverywhere(session.access_token);
          
          const decoded = decodeToken(session.access_token);
          if (decoded?.exp) {
            scheduleTokenRefresh(decoded.exp);
          }
        } else if (event === 'SIGNED_OUT') {
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
          }
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleTokenRefresh, updateTokenEverywhere, decodeToken]);

  return { refreshToken };
}
