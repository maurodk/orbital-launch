// src/pages/MobilePage.tsx — Layout mobile-first dedicado

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { useReactToPrint } from "react-to-print";
import { useNavigate } from "react-router-dom";
import { FiLogOut, FiList, FiClock } from "react-icons/fi";

import { MobileReservationList } from "../../components/MobileReservationList";
import { MobileHistoryView } from "../../components/MobileHistoryView";
import { ReservationModal } from "../../components/ReservationModal";
import { PaymentModal, type PaymentData } from "../../components/PaymentModal";
import { ProcessingPaymentModal } from "../../components/ProcessingPaymentModal";
import { PaymentSuccessModal } from "../../components/PaymentSuccessModal";
import { CancelModal } from "../../components/CancelModal";
import { BlockModal } from "../../components/BlockModal";
import {
  TermoDeReserva,
  type TermoData,
} from "../../components/TermoDeReserva";
import { UnitHistoryModal } from "../../components/UnitHistoryModal";
import { auth, supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";
import { Login } from "../../components/Login";
import { VerifyingModal } from "../../components/VerifyingModal";
import { ReservationFailedModal } from "../../components/ReservationFailedModal";
import { ReservationSuccessModal } from "../../components/ReservationSuccessModal";
import { PixModal } from "../../components/PixModal";
import { PixOptionsModal } from "../../components/PixOptionsModal";
import { PixHistoryModal } from "../../components/PixHistoryModal";
import { ChangeUnitSuccessModal } from "../../components/ChangeUnitSuccessModal";
import { ChangeUnitFailedModal } from "../../components/ChangedUnitFailedModal";
import { ChangeUnitModal } from "../../components/ChangeUnitModal";
import {
  PrintConfigModal,
  type PrintConfig,
} from "../../components/PrintConfigModal";
import { FullNameModal } from "../../components/FullNameModal";
import "../../components/PixModal.css";
import { useReservationManager } from "../hooks/useReservationManager";
import { useTokenRefresh } from "../hooks/useTokenRefresh";
import "./MobilePage.css";

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";
const apiUrl = import.meta.env.DEV ? "http://localhost:3000" : AWS_API_URL;

interface Implantation {
  id?: string;
  nome: string;
  url: string;
  tamanhoPonto?: number;
  endereco?: string;
  logoUrl?: string;
  sigla?: string;
  cidade?: string;
  estado?: string;
  planosConfig?: { habilitado: boolean; planos: string[] } | null;
}

const gerarSigla = (nome: string): string => {
  if (!nome) return "";
  return nome
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
};

const extrairNomeCliente = (nome: string): string => {
  if (!nome) return "";
  if (nome.includes("-")) {
    const partes = nome.split("-");
    return partes.slice(1).join("-").trim();
  }
  return nome.trim();
};

interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
}

const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return "XXX.XXX.XXX-XX";
  const onlyNums = cpf.replace(/[^\d]/g, "");
  if (onlyNums.length !== 11) return onlyNums;
  return onlyNums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

export function MobilePage() {
  const navigate = useNavigate();

  // Se desktop, redireciona para /
  useEffect(() => {
    const isDesktop =
      window.innerWidth > 1024 && navigator.maxTouchPoints === 0;
    if (isDesktop) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  // ===================== AUTH =====================
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ===================== DATA =====================
  const [unidades, setUnidades] = useState<string[][]>([]);
  const [clientes, setClientes] = useState<string[][]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [currentImplantation, setCurrentImplantation] =
    useState<Implantation | null>(null);
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string>("/logo-uni.png");
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [history, setHistory] = useState<string[][]>([]);
  const [userDisplayName, setUserDisplayName] = useState("");

  // ===================== MOBILE VIEW =====================
  const [mobileTab, setMobileTab] = useState<"list" | "history">("list");

  // ===================== LIST STATE =====================
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Disponível" | "Reservada" | "Bloqueada"
  >("all");
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // ===================== MODALS =====================
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );
  const [reservationModalState, setReservationModalState] = useState({
    isOpen: false,
    mode: "select" as "select" | "manual",
  });
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [blockModalState, setBlockModalState] = useState({
    isOpen: false,
    isBlocking: true,
    apiError: "",
  });
  const [pixModalState, setPixModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
    showPending: false,
    pendingPixData: null as {
      identificador: string;
      payloadEmv: string;
      valor: number;
    } | null,
  });
  const [pixOptionsModalState, setPixOptionsModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
    hasPendingPix: false,
  });
  const [pixHistoryModalState, setPixHistoryModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [changeUnitModalState, setChangeUnitModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [paymentModalState, setPaymentModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [processingPaymentState, setProcessingPaymentState] = useState({
    isProcessing: false,
    currentStep: "",
    progress: 0,
    error: null as string | null,
    success: false,
  });
  const [isPaymentSuccessModalOpen, setIsPaymentSuccessModalOpen] =
    useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedUnitForHistory, setSelectedUnitForHistory] = useState<
    string | null
  >(null);
  const [isVerifyingModalOpen, setIsVerifyingModalOpen] = useState(false);
  const [isReservationFailedModalOpen, setIsReservationFailedModalOpen] =
    useState(false);
  const [reservationFailedMessage, setReservationFailedMessage] = useState("");
  const [isReservationSuccessModalOpen, setIsReservationSuccessModalOpen] =
    useState(false);
  const [isChangeUnitSuccessModalOpen, setIsChangeUnitSuccessModalOpen] =
    useState(false);
  const [changeUnitSuccessData, setChangeUnitSuccessData] = useState<{
    oldUnitName: string;
    newUnitName: string;
  } | null>(null);
  const [isChangeUnitFailedModalOpen, setIsChangeUnitFailedModalOpen] =
    useState(false);
  const [changeUnitFailedMessage, setChangeUnitFailedMessage] = useState("");
  const [isPrintConfigModalOpen, setIsPrintConfigModalOpen] = useState(false);
  const [pendingPrintUnitIndex, setPendingPrintUnitIndex] = useState<
    number | null
  >(null);
  const [showFullNameModal, setShowFullNameModal] = useState(false);
  const [termoParaImprimir, setTermoParaImprimir] = useState<TermoData | null>(
    null
  );
  const printComponentRef = useRef<HTMLDivElement>(null);

  const implantacao = selectedImplantationName;
  const reservationManager = useReservationManager(apiUrl);
  useTokenRefresh();

  // ===================== PRINT =====================
  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    onAfterPrint: () => setTermoParaImprimir(null),
  });

  useEffect(() => {
    if (termoParaImprimir) handlePrint();
  }, [termoParaImprimir, handlePrint]);

  // ===================== DATA FETCHING =====================
  const fetchHistory = useCallback(async (implantacaoName: string) => {
    if (!implantacaoName) return;
    try {
      const { data: implantacaoData, error: implantacaoError } = await supabase
        .from("implantacoes")
        .select("id")
        .eq("nome", implantacaoName)
        .single();

      if (implantacaoError || !implantacaoData) {
        setHistory([]);
        return;
      }

      const { data: historicoData, error: historicoError } = await supabase
        .from("historico")
        .select("*")
        .eq("implantacao_id", implantacaoData.id)
        .order("timestamp_iso", { ascending: false })
        .limit(100);

      if (historicoError) {
        setHistory([]);
        return;
      }

      const formattedHistory = (historicoData || []).map((item) => [
        String(item.id),
        item.data_formatada ||
          new Date(item.timestamp_iso).toLocaleString("pt-BR"),
        item.unidade_nome || "",
        item.acao || "",
        item.cliente || "",
        item.corretor || "",
        item.usuario || "",
        item.reserva_url || "",
      ]);

      setHistory(formattedHistory);
    } catch {
      setHistory([]);
    }
  }, []);

  const fetchUnitData = useCallback(async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
      const { data: implantacaoData, error: implantacaoError } = await supabase
        .from("implantacoes")
        .select("id")
        .eq("nome", implantacaoName)
        .single();

      if (implantacaoError || !implantacaoData) {
        setError(`Implantação "${implantacaoName}" não encontrada.`);
        return;
      }

      const implantacaoId = implantacaoData.id;

      const { data: unidadesSupabase, error: unidadesError } = await supabase
        .from("unidades")
        .select("*")
        .eq("implantacao_id", implantacaoId)
        .order("row_index", { ascending: true });

      if (unidadesError) {
        setError(
          `Não foi possível carregar as unidades para "${implantacaoName}".`
        );
        return;
      }

      const { data: clientesSupabase } = await supabase
        .from("clientes")
        .select("*")
        .eq("implantacao_id", implantacaoId);

      const unidadesData = (unidadesSupabase || []).map((u) => [
        u.row_index?.toString() || "",
        u.etapa || "",
        u.nome_unidade || "",
        u.bloco || "",
        u.tipologia || "",
        u.area_privativa || "",
        u.id_pre_cadastro || "",
        u.cliente || "",
        u.documento || "",
        u.corretor || "",
        u.imobiliaria || "",
        u.situacao || "Disponível",
        u.coord_x?.toString() || "",
        u.coord_y?.toString() || "",
        "",
        "",
        u.implantacao_ref || "",
        "",
        u.simbolo || "",
        u.motivo || "",
        "",
      ]);

      const clientesData = (clientesSupabase || []).map((c) => [
        c.id || "",
        c.nome || "",
        c.documento || "",
        c.corretor || "",
        c.telefone || "",
      ]);

      setUnidades(unidadesData);
      setClientes(clientesData);
    } catch {
      setError(`Não foi possível carregar os dados para "${implantacaoName}".`);
    } finally {
      setSwitching(false);
    }
  }, []);

  // ===================== AUTH CHECK =====================
  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          localStorage.setItem("token", session.access_token);
          axios.defaults.headers.common[
            "Authorization"
          ] = `Bearer ${session.access_token}`;
        } else {
          setAuthLoading(false);
          return;
        }

        try {
          const implantacoesRes = await axios.get<Implantation[]>(
            `${apiUrl}/api/implantacoes`
          );

          try {
            const fullNameRes = await axios.get(
              `${apiUrl}/api/user/full-name`
            );
            const fullName = fullNameRes.data.full_name;
            if (fullName) setUserDisplayName(fullName);
            if (!fullName) setShowFullNameModal(true);
          } catch {
            setShowFullNameModal(true);
          }

          const allImplantations = implantacoesRes.data || [];
          setImplantacoes(allImplantations);

          const lastUsed = localStorage.getItem("selectedImplantacao");

          if (lastUsed) {
            const found = allImplantations.find(
              (impl) => impl.nome === lastUsed
            );
            if (found) {
              setSelectedImplantationName(lastUsed);
              setCurrentImplantation(found);
              setCurrentLogoUrl(found.logoUrl || "/logo-uni.png");
              await fetchUnitData(found.nome);
              await fetchHistory(found.nome);
            } else {
              localStorage.removeItem("selectedImplantacao");
            }
          }
          setError(null);
        } catch {
          setError(
            "Falha ao carregar os dados da aplicação. Tente recarregar a página."
          );
        }
      } else {
        localStorage.removeItem("token");
        delete axios.defaults.headers.common["Authorization"];
        setUnidades([]);
        setClientes([]);
        setHistory([]);
        setImplantacoes([]);
      }

      setAuthLoading(false);
    };

    checkUser();

    const unsubscribe = auth.onAuthStateChange((callbackUser) => {
      if (callbackUser) {
        setUser(callbackUser);
        if (!axios.defaults.headers.common["Authorization"]) {
          checkUser();
        }
      } else {
        setUser(null);
        localStorage.removeItem("token");
        delete axios.defaults.headers.common["Authorization"];
        setUnidades([]);
        setClientes([]);
        setHistory([]);
        setImplantacoes([]);
      }
    });

    return () => {
      unsubscribe.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===================== INTERACTION GUARD =====================
  const isUserInteractingWithUnit = useCallback(
    (unitIndex: number): boolean => {
      return (
        selectedUnitIndex === unitIndex ||
        pixModalState.unitIndex === unitIndex ||
        pixOptionsModalState.unitIndex === unitIndex ||
        pixHistoryModalState.unitIndex === unitIndex ||
        paymentModalState.unitIndex === unitIndex ||
        changeUnitModalState.unitIndex === unitIndex ||
        (reservationModalState.isOpen && selectedUnitIndex === unitIndex) ||
        (blockModalState.isOpen && selectedUnitIndex === unitIndex)
      );
    },
    [
      selectedUnitIndex,
      pixModalState.unitIndex,
      pixOptionsModalState.unitIndex,
      pixHistoryModalState.unitIndex,
      paymentModalState.unitIndex,
      changeUnitModalState.unitIndex,
      reservationModalState.isOpen,
      blockModalState.isOpen,
    ]
  );

  // ===================== PIX EXPIRY MONITOR =====================
  useEffect(() => {
    if (!currentImplantation?.id || !selectedImplantationName) return;

    const pixChannel = supabase
      .channel(`mobile-pix-expired-${currentImplantation.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "historico_pix",
          filter: `implantacao_nome=eq.${selectedImplantationName}`,
        },
        async (payload) => {
          try {
            const newRecord = payload.new as {
              id: string;
              status_pagamento: string;
              cliente: string;
              unidade: string;
              implantacao_nome: string;
              identificador: string;
            };

            if (newRecord.status_pagamento?.toUpperCase() !== "EXPIRADO")
              return;

            const { data: pixAtivos } = await supabase
              .from("historico_pix")
              .select("id, status_pagamento")
              .eq("cliente", newRecord.cliente)
              .eq("unidade", newRecord.unidade)
              .eq("implantacao_nome", newRecord.implantacao_nome)
              .in("status_pagamento", ["PAGO", "PENDENTE"])
              .limit(1);

            if (pixAtivos && pixAtivos.length > 0) return;

            await supabase
              .from("unidades")
              .update({
                id_pre_cadastro: null,
                cliente: null,
                documento: null,
                corretor: null,
                imobiliaria: null,
                situacao: "Disponível",
                updated_at: new Date().toISOString(),
              })
              .eq("implantacao_id", currentImplantation.id)
              .eq("nome_unidade", newRecord.unidade);

            setUnidades((cur) => {
              const idx = cur.findIndex((u) => u[2] === newRecord.unidade);
              if (idx === -1) return cur;

              const unitAlvo = cur[idx];
              const clientNameToRelease = unitAlvo[7];
              const idPreCadastro = unitAlvo[6];
              const brokerNameToLog = unitAlvo[9] || "N/A";

              (async () => {
                try {
                  const sheetRowIndex = idx + 2;
                  await axios.post(
                    `${apiUrl}/api/cancel-reservation`,
                    {
                      unitRowIndex: sheetRowIndex,
                      clientName: clientNameToRelease,
                      implantacao: selectedImplantationName,
                      idPreCadastro,
                      brokerName: brokerNameToLog,
                      reason: "PIX_EXPIRADO",
                    },
                    {
                      headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                      },
                    }
                  );
                  await fetchHistory(selectedImplantationName);
                } catch (err) {
                  console.error("[Mobile PixMonitor] Erro:", err);
                }
              })();

              if (clientNameToRelease) {
                setClientes((curC) =>
                  curC.map((c) =>
                    c[1] === clientNameToRelease
                      ? [...c.slice(0, 5), "PODE RESERVAR"]
                      : c
                  )
                );
              }

              return cur.map((u, i) => {
                if (i === idx) {
                  const n = [...u];
                  n[6] = "";
                  n[7] = "";
                  n[8] = "";
                  n[9] = "";
                  n[10] = "";
                  n[11] = "Disponível";
                  return n;
                }
                return u;
              });
            });
          } catch (err) {
            console.error("[Mobile PixMonitor] Process error:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(pixChannel).catch(() => void 0);
    };
  }, [currentImplantation?.id, selectedImplantationName, fetchHistory]);

  // ===================== REALTIME + SSE =====================
  useEffect(() => {
    if (!selectedImplantationName || !currentImplantation) return;

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (currentImplantation?.id) {
      realtimeChannel = supabase
        .channel(`mobile-unidades-${currentImplantation.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "unidades",
            filter: `implantacao_id=eq.${currentImplantation.id}`,
          },
          async () => {
            const hasActive = unidades.some((_, idx) =>
              isUserInteractingWithUnit(idx)
            );
            if (hasActive) return;
            await fetchUnitData(selectedImplantationName).catch(() => void 0);
          }
        )
        .subscribe();
    }

    // SSE
    let es: EventSource | null = null;
    let reconnectAttempts = 0;
    let stopped = false;

    const createEventSource = () => {
      if (es) {
        try {
          es.close();
        } catch {
          void 0;
        }
      }

      const token = localStorage.getItem("token");
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
      es = new EventSource(
        `${apiUrl}/api/events?implantacao=${encodeURIComponent(
          selectedImplantationName
        )}${tokenParam}`
      );

      es.onopen = () => {
        reconnectAttempts = 0;
      };

      es.onerror = () => {
        reconnectAttempts++;
        if (reconnectAttempts > 5) return;
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);
        setTimeout(() => {
          if (!stopped) createEventSource();
        }, delay);
      };

      const handleUnitUpdate = (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          const { unitData, rowIndex, pagamentos_status, unitName } = eventData;

          const normalize = (s: unknown) =>
            String(s || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();

          if (
            unitData &&
            Array.isArray(unitData) &&
            typeof rowIndex === "number"
          ) {
            const idx = rowIndex - 2;
            if (isUserInteractingWithUnit(idx)) return;

            setUnidades((cur) => {
              if (idx < 0 || idx >= cur.length) return cur;
              const copy = cur.slice();
              const existing = Array.isArray(copy[idx])
                ? copy[idx].slice()
                : [];
              const maxLen = Math.max(existing.length, unitData.length);
              const merged = new Array(maxLen);
              for (let i = 0; i < maxLen; i++) {
                const incoming = unitData[i];
                const isStructural = i <= 5 || i === 11;
                if (
                  typeof incoming !== "undefined" &&
                  incoming !== null &&
                  incoming !== "" &&
                  (!isStructural || String(incoming).trim() !== "")
                ) {
                  merged[i] = incoming;
                } else {
                  merged[i] = existing[i] || "";
                }
              }
              if (typeof pagamentos_status !== "undefined")
                merged[20] = pagamentos_status;
              if (JSON.stringify(existing) === JSON.stringify(merged))
                return cur;
              copy[idx] = merged;
              return copy;
            });
            return;
          }

          if (typeof pagamentos_status !== "undefined") {
            setUnidades((cur) => {
              const copy = cur.slice();
              if (typeof rowIndex === "number") {
                const idx = rowIndex - 2;
                if (isUserInteractingWithUnit(idx)) return cur;
                if (idx >= 0 && idx < copy.length) {
                  const row = Array.isArray(copy[idx])
                    ? copy[idx].slice()
                    : copy[idx];
                  if (row[20] === pagamentos_status) return cur;
                  row[20] = pagamentos_status;
                  copy[idx] = row;
                }
                return copy;
              }
              if (unitName) {
                const target = normalize(unitName);
                for (let i = 0; i < copy.length; i++) {
                  if (normalize(copy[i][2]) === target) {
                    if (isUserInteractingWithUnit(i)) return cur;
                    const row = Array.isArray(copy[i])
                      ? copy[i].slice()
                      : copy[i];
                    if (row[20] === pagamentos_status) return cur;
                    row[20] = pagamentos_status;
                    copy[i] = row;
                    break;
                  }
                }
                return copy;
              }
              return cur;
            });
          }
        } catch {
          void 0;
        }
      };

      const handleHistoryUpdate = (event?: MessageEvent) => {
        try {
          if (event?.data) {
            const parsed = JSON.parse(event.data);
            if (parsed?.historico) {
              const item = parsed.historico;
              const newRow = [
                String(item.id),
                item.data_formatada ||
                  new Date(item.timestamp_iso).toLocaleString("pt-BR"),
                item.unidade_nome || "",
                item.acao || "",
                item.cliente || "",
                item.corretor || "",
                item.usuario || "",
                item.reserva_url || "",
              ];
              setHistory((cur) => {
                if (cur.length > 0 && cur[0]?.[0] === newRow[0]) return cur;
                return [newRow, ...cur];
              });
              return;
            }
            if (parsed?.row && Array.isArray(parsed.row)) {
              const newRow = parsed.row;
              setHistory((cur) => {
                if (cur.length > 0 && cur[0]?.[0] === newRow[0]) return cur;
                return [newRow, ...cur];
              });
              return;
            }
          }
        } catch {
          void 0;
        }
        fetchHistory(selectedImplantationName).catch(() => void 0);
      };

      es.addEventListener("unitUpdated", handleUnitUpdate);
      es.addEventListener("historyUpdated", handleHistoryUpdate);
    };

    createEventSource();

    const handleOnline = () => {
      reconnectAttempts = 0;
      createEventSource();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      stopped = true;
      window.removeEventListener("online", handleOnline);
      try {
        if (es) es.close();
      } catch {
        void 0;
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel).catch(() => void 0);
      }
    };
  }, [
    selectedImplantationName,
    currentImplantation,
    fetchUnitData,
    fetchHistory,
    isUserInteractingWithUnit,
    unidades,
  ]);

  // ===================== MEMOS =====================
  const clientesDisponiveis = useMemo(() => {
    return clientes.filter((c) => c && c[1] && c[1].trim() !== "");
  }, [clientes]);

  const availableUnitsForChange = useMemo(() => {
    return unidades.reduce<{ unit: string[]; originalIndex: number }[]>(
      (acc, unit, index) => {
        const ns = (unit[11] || "Disponível")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        if (ns === "disponivel") acc.push({ unit, originalIndex: index });
        return acc;
      },
      []
    );
  }, [unidades]);

  const filteredUnidades: [string[], number][] = useMemo(() => {
    return unidades
      .map((unidade, index) => ({ data: unidade, originalIndex: index }))
      .filter(({ data }) => {
        const rawStatus = data[11] || "Disponível";
        const normalizedStatus = rawStatus
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

        const normalize = (s: unknown) =>
          String(s || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

        const unitName = normalize(data[2]);
        const blockName = normalize(data[3]);
        const tipologia = normalize(data[4]);
        const clientName = normalize(data[7]);
        const brokerName = normalize(data[9]);
        const term = normalize(searchTerm);

        const normalizedFilter =
          statusFilter === "all"
            ? "all"
            : statusFilter
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();

        const statusMatch =
          normalizedFilter === "all" || normalizedStatus === normalizedFilter;
        const searchMatch =
          unitName.includes(term) ||
          blockName.includes(term) ||
          tipologia.includes(term) ||
          clientName.includes(term) ||
          brokerName.includes(term);
        return statusMatch && searchMatch;
      })
      .map((item) => [item.data, item.originalIndex]);
  }, [unidades, searchTerm, statusFilter]);

  // ===================== HANDLERS =====================
  const handleImplantationChange = async (newName: string) => {
    const newImpl = implantacoes.find((imp) => imp.nome === newName);
    if (!newImpl || newName === selectedImplantationName) return;

    localStorage.setItem("selectedImplantacao", newName);
    setSelectedImplantationName(newName);
    setCurrentImplantation(newImpl);
    setCurrentLogoUrl(newImpl.logoUrl || "/logo-uni.png");
    setSwitching(true);

    try {
      await fetchUnitData(newName);
      await fetchHistory(newName);
    } catch {
      setError("Falha ao carregar dados da nova implantação.");
    } finally {
      setSwitching(false);
    }
  };

  const handleCloseModals = () => {
    setReservationModalState({ isOpen: false, mode: "select" });
    setIsCancelModalOpen(false);
    setBlockModalState({ isOpen: false, isBlocking: true, apiError: "" });
    setPixModalState({
      isOpen: false,
      unitIndex: null,
      showPending: false,
      pendingPixData: null,
    });
    setPixOptionsModalState({
      isOpen: false,
      unitIndex: null,
      hasPendingPix: false,
    });
    setPixHistoryModalState({ isOpen: false, unitIndex: null });
    setChangeUnitModalState({ isOpen: false, unitIndex: null });
    setPaymentModalState({ isOpen: false, unitIndex: null });
    setIsChangeUnitSuccessModalOpen(false);
    setIsChangeUnitFailedModalOpen(false);
    setSelectedUnitIndex(null);
  };

  const handleOpenUnitHistory = (unitName: string) => {
    setSelectedUnitForHistory(unitName);
    setShowHistoryModal(true);
  };

  const handleUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    const rawStatus = unidades[unitIndex][11] || "Disponível";
    const ns = rawStatus
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (ns === "disponivel") {
      setReservationModalState({ isOpen: true, mode: "select" });
    } else if (ns === "reservada") {
      setIsCancelModalOpen(true);
    } else if (ns === "bloqueada") {
      setBlockModalState({ isOpen: true, isBlocking: false, apiError: "" });
    }
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    const ns = (unidades[unitIndex][11] || "Disponível")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const isBlocked = ns === "bloqueada";
    setBlockModalState({ isOpen: true, isBlocking: !isBlocked, apiError: "" });
  };

  const handlePixActionClick = async (unitIndex: number) => {
    const unit = unidades[unitIndex];
    if (!unit) return;
    const unidade = unit[2];
    try {
      const clienteParam = (unit[7] || "").toString();
      const idPreCadastroParam = (unit[6] || "").toString();
      const response = await axios.get(
        `${apiUrl}/api/pix/pending?implantacao=${encodeURIComponent(
          implantacao
        )}&cliente=${encodeURIComponent(
          clienteParam
        )}&id_pre_cadastro=${encodeURIComponent(
          idPreCadastroParam
        )}&unidade=${encodeURIComponent(unidade)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setPixOptionsModalState({
        isOpen: true,
        unitIndex,
        hasPendingPix: response.data.hasPending,
      });
    } catch {
      setPixOptionsModalState({
        isOpen: true,
        unitIndex,
        hasPendingPix: false,
      });
    }
  };

  const handlePixOptionSelect = async (
    option: "pending" | "new" | "history"
  ) => {
    const unitIndex = pixOptionsModalState.unitIndex;
    if (unitIndex === null) return;
    const unit = unidades[unitIndex];
    if (!unit) return;
    const unidade = unit[2];

    setPixOptionsModalState({
      isOpen: false,
      unitIndex: null,
      hasPendingPix: false,
    });

    if (option === "pending") {
      try {
        const clienteParam = (unit[7] || "").toString();
        const idPreCadastroParam = (unit[6] || "").toString();
        const response = await axios.get(
          `${apiUrl}/api/pix/pending?implantacao=${encodeURIComponent(
            implantacao
          )}&cliente=${encodeURIComponent(
            clienteParam
          )}&id_pre_cadastro=${encodeURIComponent(
            idPreCadastroParam
          )}&unidade=${encodeURIComponent(unidade)}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        const { pixData } = response.data;
        if (pixData) {
          setPixModalState({
            isOpen: true,
            unitIndex,
            showPending: true,
            pendingPixData: pixData,
          });
        }
      } catch {
        alert("Erro ao buscar PIX pendente.");
      }
    } else if (option === "new") {
      setPixModalState({
        isOpen: true,
        unitIndex,
        showPending: false,
        pendingPixData: null,
      });
    } else if (option === "history") {
      setPixHistoryModalState({ isOpen: true, unitIndex });
    }
  };

  const handleChangeUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setChangeUnitModalState({ isOpen: true, unitIndex });
  };

  const handlePaymentClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setPaymentModalState({ isOpen: true, unitIndex });
  };

  const handleConfirmPayment = async (paymentData: PaymentData) => {
    if (paymentModalState.unitIndex === null) return;
    const unitIndex = paymentModalState.unitIndex;
    const unitData = unidades[unitIndex];
    const sheetRowIndex = unitIndex + 2;

    setPaymentModalState({ isOpen: false, unitIndex: null });
    setIsProcessingPayment(true);
    setProcessingPaymentState({
      isProcessing: true,
      currentStep: "Iniciando processamento...",
      progress: 10,
      error: null,
      success: false,
    });

    try {
      setProcessingPaymentState((prev) => ({
        ...prev,
        currentStep: "Salvando dados de pagamento...",
        progress: 30,
      }));

      const clientName = extrairNomeCliente(unitData[7]) || "";
      const unitName = unitData[2] || "";
      const idPreCadastro = unitData[6] || "";

      await axios.post(`${apiUrl}/api/add-payment`, {
        implantacao: selectedImplantationName,
        implantacaoId: currentImplantation?.id,
        rowIndex: sheetRowIndex,
        clientName,
        unitName,
        idPreCadastro,
        pagamento: {
          pagamentoPresencial: paymentData.pagamentoPresencial,
          valorTotal: paymentData.valorTotal,
          valorPix: paymentData.valorPix,
          valorDinheiro: paymentData.valorDinheiro,
          valorCartao: paymentData.valorCartao,
          valorCheque: paymentData.valorCheque,
          tipoVenda: paymentData.tipoVenda,
          planoSelecionado: paymentData.planoSelecionado,
          diaVencimento: paymentData.diaVencimento,
          valorUnidade: paymentData.valorUnidade,
        },
      });

      setProcessingPaymentState((prev) => ({
        ...prev,
        currentStep: "Gerando plano de pagamento...",
        progress: 60,
      }));
      await new Promise((res) => setTimeout(res, 600));
      setProcessingPaymentState((prev) => ({
        ...prev,
        currentStep: "Finalizando processo...",
        progress: 90,
      }));
      await new Promise((res) => setTimeout(res, 400));
      setProcessingPaymentState((prev) => ({
        ...prev,
        currentStep: "Pagamento concluído!",
        progress: 100,
        isProcessing: false,
        success: true,
      }));

      setTimeout(() => {
        setIsProcessingPayment(false);
        setIsPaymentSuccessModalOpen(true);
      }, 800);

      await fetchUnitData(selectedImplantationName);
      await fetchHistory(selectedImplantationName);
    } catch (error: unknown) {
      const apiError = (() => {
        const errObj = error as Record<string, unknown>;
        const resp = errObj["response"] as Record<string, unknown> | undefined;
        const data = resp?.["data"] as Record<string, unknown> | undefined;
        return (
          (data?.["error"] as string | undefined) ||
          (errObj["message"] as string | undefined)
        );
      })();
      setProcessingPaymentState((prev) => ({
        ...prev,
        isProcessing: false,
        error: apiError || "Erro desconhecido",
        currentStep: "Erro ao processar pagamento",
      }));
      setTimeout(() => setIsProcessingPayment(false), 2000);
    }
  };

  const handleToggleBlockUnit = async (
    newStatus: "Bloqueada" | "Disponível",
    password?: string,
    motivo?: string
  ) => {
    if (selectedUnitIndex === null) return;
    if (newStatus === "Bloqueada") password = undefined;

    setBlockModalState((prev) => ({ ...prev, apiError: "" }));

    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${apiUrl}/api/toggle-block-unit`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        newStatus,
        password,
        motivo,
      });

      const updated = [...unidades];
      updated[selectedUnitIndex][11] = newStatus;
      setUnidades(updated);
      handleCloseModals();
      await fetchHistory(selectedImplantationName);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setBlockModalState((prev) => ({
        ...prev,
        apiError:
          error.response?.data?.error ||
          `Falha ao ${newStatus === "Bloqueada" ? "bloquear" : "desbloquear"} a unidade.`,
      }));
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) setSelectedUnits(new Set());
  };

  const toggleUnitSelection = (unitIndex: number) => {
    setSelectedUnits((prev) => {
      const s = new Set(prev);
      if (s.has(unitIndex)) s.delete(unitIndex);
      else s.add(unitIndex);
      return s;
    });
  };

  const handleBulkBlock = async () => {
    if (selectedUnits.size === 0) {
      alert("Nenhuma unidade selecionada.");
      return;
    }
    const motivo = window.prompt(
      `Digite o motivo do bloqueio para ${selectedUnits.size} unidade(s):`
    );
    if (!motivo || motivo.trim() === "") {
      alert("Motivo é obrigatório para bloquear unidades.");
      return;
    }
    if (
      !window.confirm(
        `Bloquear ${selectedUnits.size} unidade(s) com motivo:\n"${motivo}"?`
      )
    )
      return;

    try {
      await Promise.all(
        Array.from(selectedUnits).map(async (unitIndex) => {
          const sheetRowIndex = unitIndex + 2;
          return axios.post(`${apiUrl}/api/toggle-block-unit`, {
            rowIndex: sheetRowIndex,
            implantacao: selectedImplantationName,
            newStatus: "Bloqueada",
            motivo: motivo.trim(),
          });
        })
      );

      const updated = [...unidades];
      selectedUnits.forEach((i) => {
        updated[i][11] = "Bloqueada";
      });
      setUnidades(updated);
      setSelectedUnits(new Set());
      setIsSelectionMode(false);
      await fetchHistory(selectedImplantationName);
      alert(`${selectedUnits.size} unidade(s) bloqueada(s) com sucesso!`);
    } catch {
      alert("Falha ao bloquear algumas unidades.");
    }
  };

  const handleChangeUnit = async (newUnitIndex: number) => {
    if (changeUnitModalState.unitIndex === null)
      throw new Error("Unidade de origem não selecionada.");

    try {
      const oldUnitData = unidades[changeUnitModalState.unitIndex];
      const newUnitData = unidades[newUnitIndex];
      const cliente = extrairNomeCliente(oldUnitData[7]);
      const unidadeAntiga = oldUnitData[2];
      const unidadeNova = newUnitData[2];

      await axios.post(
        `${apiUrl}/api/pix/transfer`,
        {
          implantacao: selectedImplantationName,
          cliente,
          unidadeAntiga,
          unidadeNova,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      await axios.post(`${apiUrl}/api/change-unit`, {
        implantacao: selectedImplantationName,
        oldUnitIndex: changeUnitModalState.unitIndex,
        newUnitIndex,
      });

      setChangeUnitSuccessData({
        oldUnitName: unidadeAntiga,
        newUnitName: unidadeNova,
      });
      setIsChangeUnitSuccessModalOpen(true);

      await fetchUnitData(selectedImplantationName);
      await fetchHistory(selectedImplantationName);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error ||
        "Falha ao realizar a troca de unidade.";
      setChangeUnitFailedMessage(errorMessage);
      setIsChangeUnitFailedModalOpen(true);
      throw new Error(errorMessage);
    }
  };

  const handleReserveUnit = async (
    selectedClientIdOrManualData: string | ManualData
  ) => {
    if (selectedUnitIndex === null) return;

    handleCloseModals();
    setIsVerifyingModalOpen(true);

    let clientData: string[] | undefined;
    let manualData: ManualData | undefined;

    if (typeof selectedClientIdOrManualData === "string") {
      clientData = clientes.find(
        (c) => c[0] === selectedClientIdOrManualData
      );
      if (!clientData) {
        setIsVerifyingModalOpen(false);
        return;
      }
    } else {
      manualData = selectedClientIdOrManualData;
    }

    const unitName = unidades[selectedUnitIndex][2];
    const sheetRowIndex = selectedUnitIndex + 2;

    try {
      const tempResult = await reservationManager.createTempReservation(
        selectedImplantationName,
        sheetRowIndex,
        unitName
      );

      if (!tempResult.success || !tempResult.token) {
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao criar reserva temporária."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 2000));

      let dataToBackend: string[];
      let clientName: string;

      if (clientData) {
        dataToBackend = [
          clientData[0],
          clientData[1],
          clientData[2],
          clientData[3],
          clientData[4] || "",
        ];
        clientName = clientData[1];
      } else if (manualData) {
        dataToBackend = [
          manualData.id,
          manualData.cliente,
          manualData.documento,
          manualData.corretor,
          "",
        ];
        clientName = manualData.cliente;
      } else {
        throw new Error("Dados do cliente não encontrados");
      }

      const confirmSuccess = await reservationManager.confirmReservation(
        selectedImplantationName,
        sheetRowIndex,
        dataToBackend,
        clientName,
        unitName,
        tempResult.token!
      );

      if (confirmSuccess) {
        setIsVerifyingModalOpen(false);
        setIsReservationSuccessModalOpen(true);
        setUnidades(
          unidades.map((u, i) => {
            if (i === selectedUnitIndex) {
              const n = [...u];
              if (clientData) {
                n[6] = clientData[0];
                n[7] = clientData[1];
                n[8] = clientData[2];
                n[9] = clientData[3];
                n[10] = clientData[4] || "";
                n[11] = "Reservada";
              } else if (manualData) {
                n[6] = manualData.id;
                n[7] = manualData.cliente;
                n[8] = manualData.documento;
                n[9] = manualData.corretor;
                n[10] = "";
                n[11] = "Reservada";
              }
              return n;
            }
            return u;
          })
        );

        if (clientData) {
          const rid = clientData[0];
          setClientes((cc) =>
            cc.map((c) => {
              if (c[0] === rid) {
                const u = [...c];
                u[5] = "JA RESERVOU";
                return u;
              }
              return c;
            })
          );
        }

        await fetchHistory(selectedImplantationName);
      } else {
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao confirmar reserva."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);
        await fetchUnitData(selectedImplantationName);
      }
    } catch {
      await reservationManager.cancelTempReservation(
        selectedImplantationName,
        sheetRowIndex
      );
      setReservationFailedMessage("Erro inesperado durante a reserva.");
      setIsReservationFailedModalOpen(true);
      setIsVerifyingModalOpen(false);
      await fetchUnitData(selectedImplantationName);
    }
  };

  const handleReserve = (data: { cliente: string | ManualData }) => {
    handleReserveUnit(data.cliente);
  };

  const handleCancelReservation = async () => {
    if (selectedUnitIndex === null) return;
    const unitAlvo = unidades[selectedUnitIndex];
    const clientNameToRelease = unitAlvo[7];
    const idPreCadastro = unitAlvo[6];
    const brokerNameToLog = unitAlvo[9] || "N/A";

    setUnidades(
      unidades.map((u, i) => {
        if (i === selectedUnitIndex) {
          const n = [...u];
          n[6] = "";
          n[7] = "";
          n[8] = "";
          n[9] = "";
          n[10] = "";
          n[11] = "Disponível";
          return n;
        }
        return u;
      })
    );

    if (clientNameToRelease) {
      setClientes((cc) =>
        cc.map((c) =>
          c[1] === clientNameToRelease
            ? [...c.slice(0, 5), "PODE RESERVAR"]
            : c
        )
      );
    }
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${apiUrl}/api/cancel-reservation`, {
        unitRowIndex: sheetRowIndex,
        clientName: clientNameToRelease,
        implantacao: selectedImplantationName,
        idPreCadastro,
        brokerName: brokerNameToLog,
      });
    } catch {
      setError("Falha ao cancelar a reserva.");
    }
    await fetchHistory(selectedImplantationName);
  };

  const handleConfirmPixData = async (
    valor: number,
    identificador: string,
    payloadEmv: string
  ) => {
    if (pixModalState.unitIndex === null) return;
    const unitData = unidades[pixModalState.unitIndex];
    const idPreCadastro = unitData[6];
    const unidade = unitData[2];

    try {
      let clienteNome = unitData[7] || "N/A";
      if (idPreCadastro) {
        const { data: cd } = await supabase
          .from("clientes")
          .select("nome")
          .eq("id_pre_cadastro", idPreCadastro)
          .maybeSingle();
        if (cd?.nome) clienteNome = cd.nome;
      }

      const { error: pixError } = await supabase
        .from("historico_pix")
        .insert({
          implantacao_id: currentImplantation?.id || null,
          implantacao_nome: selectedImplantationName,
          cliente: extrairNomeCliente(clienteNome),
          unidade,
          identificador,
          payload_emv: payloadEmv,
          valor,
          status_pagamento: "PENDENTE",
          data_criacao: new Date().toISOString(),
        });

      if (pixError) throw new Error(pixError.message);
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(err.message || "Erro ao salvar dados do PIX.");
    }
  };

  const handleOpenPrintConfig = (unitIndex: number) => {
    setPendingPrintUnitIndex(unitIndex);
    setIsPrintConfigModalOpen(true);
  };

  const handlePrepareAndPrint = async (config: PrintConfig) => {
    if (pendingPrintUnitIndex === null) return;
    const unitIndex = pendingPrintUnitIndex;
    const unitData = unidades[unitIndex];
    const impData = implantacoes.find(
      (imp) => imp.nome === selectedImplantationName
    );

    if (!unitData || !impData) {
      alert("Erro: Dados da unidade não encontrados.");
      return;
    }

    const unitFullName = unitData[2];
    const brokerName = unitData[9] || "N/A";

    const dataHoraImpressao = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    try {
      axios.post(`${apiUrl}/api/log-print`, {
        implantacao: selectedImplantationName,
        unitName: unitFullName,
        clientName: extrairNomeCliente(unitData[7]) || "N/D",
        brokerName,
      });
      await fetchHistory(selectedImplantationName);
    } catch {
      void 0;
    }

    const today = new Date();
    const formattedDate = `Vitória da Conquista, ${today.toLocaleDateString(
      "pt-BR",
      { day: "numeric" }
    )} de ${today.toLocaleDateString("pt-BR", {
      month: "long",
    })} de ${today.toLocaleDateString("pt-BR", { year: "numeric" })}`;

    const termoData: TermoData = {
      clienteNome: extrairNomeCliente(unitData[7]) || "N/D",
      clienteCpf: formatCPF(unitData[8]) || "N/D",
      unidadeDesc: unitData[2],
      tipologia: unitData[4] || "N/D",
      areaPrivativa: unitData[3] || "N/D",
      etapa: unitData[0] || "N/D",
      empreendimentoNome: impData.nome,
      empreendimentoEndereco: impData.endereco || "Endereço não informado",
      corretorNome: unitData[9] || "N/D",
      dataAtual: formattedDate,
      logoEmpreendimentoUrl: currentLogoUrl,
      dataHoraImpressao,
      hasRegistro: config.hasRegistro,
      paymentType: config.paymentType,
      paymentValue: config.paymentValue,
      paymentDate: today.toLocaleDateString("pt-BR"),
      saleType: config.saleType,
      planType: config.planType,
    };

    setTermoParaImprimir(termoData);
    setPendingPrintUnitIndex(null);
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  // ===================== RENDER =====================
  if (error) {
    return (
      <div className="mobile-loading">
        <p style={{ color: "#d9534f", textAlign: "center", padding: "20px" }}>
          {error}
        </p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="mobile-loading">
        <div className="mobile-loading-spinner" />
        <span className="mobile-loading-text">Verificando autenticação...</span>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <HelmetProvider>
      <Helmet>
        <title>Implantação Digital - Mobile</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </Helmet>

      <div className="mobile-page">
        {/* ═══ HEADER ═══ */}
        <div className="mobile-header">
          <div className="mobile-header-left">
            <img
              src="/logo-uni.png"
              alt="Logo"
              className="mobile-header-logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            {userDisplayName && (
              <span className="mobile-header-title">
                Olá, {userDisplayName}
              </span>
            )}
          </div>
          <div className="mobile-header-right">
            {implantacoes.length > 0 && (
              <select
                className="mobile-implantation-select"
                value={selectedImplantationName}
                onChange={(e) => handleImplantationChange(e.target.value)}
              >
                {!selectedImplantationName && (
                  <option value="">Selecione...</option>
                )}
                {implantacoes.map((imp) => (
                  <option key={imp.nome} value={imp.nome}>
                    {imp.nome}
                  </option>
                ))}
              </select>
            )}
            <button className="mobile-logout-btn" onClick={handleLogout}>
              <FiLogOut size={18} />
            </button>
          </div>
        </div>

        {/* ═══ LOADING OVERLAY ═══ */}
        {switching && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              zIndex: 999,
            }}
          >
            <div className="mobile-loading-spinner" />
          </div>
        )}

        {/* ═══ ACTIVE TAB CONTENT ═══ */}
        {mobileTab === "list" && (
          <MobileReservationList
            unidades={filteredUnidades}
            onUnitClick={handleUnitClick}
            onBlockClick={handleBlockActionClick}
            onPrintClick={handleOpenPrintConfig}
            onChangeUnitClick={handleChangeUnitClick}
            onPixClick={handlePixActionClick}
            onPaymentClick={handlePaymentClick}
            onHistoryClick={handleOpenUnitHistory}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            totalUnidades={unidades.length}
            isSelectionMode={isSelectionMode}
            selectedUnits={selectedUnits}
            onToggleUnitSelection={toggleUnitSelection}
            onToggleSelectionMode={toggleSelectionMode}
            onBulkBlock={handleBulkBlock}
          />
        )}
        {mobileTab === "history" && <MobileHistoryView history={history} />}

        {/* ═══ BOTTOM TAB BAR ═══ */}
        <div className="mobile-tab-bar">
          <button
            className={`mobile-tab ${mobileTab === "list" ? "active" : ""}`}
            onClick={() => setMobileTab("list")}
          >
            <FiList className="mobile-tab-icon" />
            <span>Lista</span>
          </button>
          <button
            className={`mobile-tab ${mobileTab === "history" ? "active" : ""}`}
            onClick={() => setMobileTab("history")}
          >
            <FiClock className="mobile-tab-icon" />
            <span>Histórico</span>
          </button>
        </div>

        {/* ═══ MODALS ═══ */}
        <ReservationModal
          show={reservationModalState.isOpen}
          onClose={handleCloseModals}
          unitData={
            selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
          }
          clientes={clientesDisponiveis}
          onReserve={handleReserve}
          initialMode={reservationModalState.mode}
        />
        <CancelModal
          show={isCancelModalOpen}
          onClose={handleCloseModals}
          unitData={
            selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
          }
          onConfirmCancel={handleCancelReservation}
        />
        <BlockModal
          show={blockModalState.isOpen}
          onClose={handleCloseModals}
          unitData={
            selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
          }
          isBlocking={blockModalState.isBlocking}
          apiError={blockModalState.apiError}
          onConfirm={(password = "", motivo = "") =>
            handleToggleBlockUnit(
              blockModalState.isBlocking ? "Bloqueada" : "Disponível",
              password,
              motivo
            )
          }
        />
        <UnitHistoryModal
          show={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          unitName={selectedUnitForHistory}
          fullHistory={history}
        />
        <PixModal
          show={pixModalState.isOpen}
          onClose={handleCloseModals}
          unitData={
            pixModalState.unitIndex !== null
              ? unidades[pixModalState.unitIndex]
              : null
          }
          implantacaoNome={selectedImplantationName}
          implantacaoSigla={
            currentImplantation?.sigla ||
            gerarSigla(selectedImplantationName)
          }
          implantacaoCidade={currentImplantation?.cidade}
          showPending={pixModalState.showPending}
          pendingPixData={pixModalState.pendingPixData || undefined}
          onConfirm={handleConfirmPixData}
        />
        <PixOptionsModal
          show={pixOptionsModalState.isOpen}
          onClose={handleCloseModals}
          onSelectOption={handlePixOptionSelect}
          hasPendingPix={pixOptionsModalState.hasPendingPix}
          unitName={
            pixOptionsModalState.unitIndex !== null
              ? unidades[pixOptionsModalState.unitIndex]?.[2] || ""
              : ""
          }
        />
        <PixHistoryModal
          show={pixHistoryModalState.isOpen}
          onClose={handleCloseModals}
          implantacao={selectedImplantationName}
          unitData={
            pixHistoryModalState.unitIndex !== null
              ? unidades[pixHistoryModalState.unitIndex] || null
              : null
          }
        />
        <ChangeUnitModal
          show={changeUnitModalState.isOpen}
          onClose={handleCloseModals}
          currentUnit={
            changeUnitModalState.unitIndex !== null
              ? unidades[changeUnitModalState.unitIndex]
              : null
          }
          availableUnits={availableUnitsForChange}
          onConfirm={handleChangeUnit}
        />
        <ChangeUnitSuccessModal
          show={isChangeUnitSuccessModalOpen}
          onClose={handleCloseModals}
          changeData={changeUnitSuccessData}
        />
        <ChangeUnitFailedModal
          show={isChangeUnitFailedModalOpen}
          onClose={handleCloseModals}
          message={changeUnitFailedMessage}
        />
        <PaymentModal
          show={paymentModalState.isOpen}
          onClose={handleCloseModals}
          unitData={
            paymentModalState.unitIndex !== null
              ? unidades[paymentModalState.unitIndex]
              : null
          }
          implantacaoId={
            currentImplantation?.id
              ? Number(currentImplantation.id)
              : null
          }
          planosConfig={currentImplantation?.planosConfig ?? null}
          sheetRowIndex={
            paymentModalState.unitIndex !== null
              ? paymentModalState.unitIndex + 2
              : null
          }
          onConfirm={handleConfirmPayment}
        />
        <ProcessingPaymentModal
          show={isProcessingPayment}
          paymentState={processingPaymentState}
        />
        <PaymentSuccessModal
          show={isPaymentSuccessModalOpen}
          onClose={() => setIsPaymentSuccessModalOpen(false)}
          unitName={
            paymentModalState.unitIndex !== null
              ? unidades[paymentModalState.unitIndex]?.[2] || null
              : null
          }
        />
        <VerifyingModal
          show={isVerifyingModalOpen}
          reservationState={reservationManager.reservationState}
        />
        <ReservationFailedModal
          show={isReservationFailedModalOpen}
          onClose={() => setIsReservationFailedModalOpen(false)}
          message={reservationFailedMessage}
          unitData={
            selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
          }
        />
        <ReservationSuccessModal
          show={isReservationSuccessModalOpen}
          onClose={() => setIsReservationSuccessModalOpen(false)}
          unitName={
            selectedUnitIndex !== null
              ? unidades[selectedUnitIndex]?.[2]
              : null
          }
        />
        <PrintConfigModal
          show={isPrintConfigModalOpen}
          onClose={() => {
            setIsPrintConfigModalOpen(false);
            setPendingPrintUnitIndex(null);
          }}
          onConfirm={handlePrepareAndPrint}
          pixValue={
            pendingPrintUnitIndex !== null
              ? unidades[pendingPrintUnitIndex]?.[15] || ""
              : ""
          }
        />
        <FullNameModal
          show={showFullNameModal}
          onConfirm={async (fullName) => {
            try {
              await axios.post(`${apiUrl}/api/user/full-name`, {
                full_name: fullName,
              });
              setShowFullNameModal(false);
            } catch {
              alert("Erro ao salvar nome. Tente novamente.");
            }
          }}
        />

        {/* Impressão invisível */}
        <div style={{ display: "none" }}>
          <TermoDeReserva ref={printComponentRef} data={termoParaImprimir} />
        </div>
      </div>
    </HelmetProvider>
  );
}
