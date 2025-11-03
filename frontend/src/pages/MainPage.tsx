// src/pages/MainPage.tsx

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { useReactToPrint } from "react-to-print";

import { FloorPlan } from "../../components/FloorPlan";
import { ReservationModal } from "../../components/ReservationModal";
import { ReservationList } from "../../components/ReservationList";
import { CancelModal } from "../../components/CancelModal";
import { BlockModal } from "../../components/BlockModal";
import { MappingSidebar } from "../../components/MappingSidebar";
import { ImplantationSwitcher } from "../../components/ImplantationSwitcher";
import {
  TermoDeReserva,
  type TermoData,
} from "../../components/TermoDeReserva";
import { HistoryView } from "../../components/HistoryView";
import { UnitHistoryModal } from "../../components/UnitHistoryModal";
import { type User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { Login } from "../../components/Login";
import { IdleTimeoutModal } from "../../components/IdleTimeoutModal";
import { VerifyingModal } from "../../components/VerifyingModal";
import { ReservationFailedModal } from "../../components/ReservationFailedModal";
import { ReservationSuccessModal } from "../../components/ReservationSuccessModal";
import { PixModal } from "../../components/PixModal"; // Importa o novo modal
import { ChangeUnitSuccessModal } from "../../components/ChangeUnitSuccessModal"; // <-- NOVO
import { ChangeUnitFailedModal } from "../../components/ChangedUnitFailedModal";
import { ChangeUnitModal } from "../../components/ChangeUnitModal"; // <-- NOVO
import "../../components/PixModal.css"; // Importa o CSS do novo modal
import { useReservationManager } from "../hooks/useReservationManager";

const API_URL = "https://simulador-implantacao.onrender.com";
const localApiUrl = "http://localhost:3001";
const apiUrl = process.env.NODE_ENV === "development" ? localApiUrl : API_URL;

interface ApiResponse {
  unidades: string[][];
  clientes: string[][];
}
export interface AppConfig {
  implantacaoAtual?: string;
}
interface Implantation {
  nome: string;
  url: string;
  tamanhoPonto?: number;
  endereco?: string;
  logoUrl?: string;
  sigla?: string;
}

// Função para gerar sigla a partir do nome
const gerarSigla = (nome: string): string => {
  if (!nome) return "";
  // Gera um acrônimo pegando a primeira letra de cada palavra.
  return nome
    .split(" ")
    .map((palavra) => palavra.charAt(0))
    .join("")
    .toUpperCase();
};

interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
}

const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) {
    return "XXX.XXX.XXX-XX";
  }
  const onlyNums = cpf.replace(/[^\d]/g, "");
  if (onlyNums.length !== 11) {
    return onlyNums;
  }
  return onlyNums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

export function MainPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [unidades, setUnidades] = useState<string[][]>([]);
  const [clientes, setClientes] = useState<string[][]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [switching, setSwitching] = useState<boolean>(false);
  const [currentImplantation, setCurrentImplantation] =
    useState<Implantation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list" | "history">("map");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [unitToMapIndex, setUnitToMapIndex] = useState<number | null>(null);
  const [dotSize, setDotSize] = useState<number>(16);
  const [hideAvailable, setHideAvailable] = useState<boolean>(true);
  const [unitLetter, setUnitLetter] = useState<string>("");
  const [reservationModalState, setReservationModalState] = useState({
    isOpen: false,
    mode: "select" as "select" | "manual",
  });
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string>("/logo-uni.png");
  const [blockModalState, setBlockModalState] = useState({
    isOpen: false,
    isBlocking: true,
    apiError: "",
  });
  const [pixModalState, setPixModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [changeUnitModalState, setChangeUnitModalState] = useState({
    // <-- NOVO
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "disponível" | "reservada" | "bloqueada"
  >("all");

  const [termoParaImprimir, setTermoParaImprimir] = useState<TermoData | null>(
    null
  );
  const printComponentRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[][]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedUnitForHistory, setSelectedUnitForHistory] = useState<
    string | null
  >(null);
  const [isIdleModalOpen, setIsIdleModalOpen] = useState(false);
  const [isVerifyingModalOpen, setIsVerifyingModalOpen] = useState(false);
  const [isReservationFailedModalOpen, setIsReservationFailedModalOpen] =
    useState(false);
  const [reservationFailedMessage, setReservationFailedMessage] = useState("");
  const [isReservationSuccessModalOpen, setIsReservationSuccessModalOpen] =
    useState(false);

  // NOVO: Estados para modais de troca de unidade
  const [isChangeUnitSuccessModalOpen, setIsChangeUnitSuccessModalOpen] =
    useState(false);
  const [changeUnitSuccessData, setChangeUnitSuccessData] = useState<{
    oldUnitName: string;
    newUnitName: string;
  } | null>(null);
  const [isChangeUnitFailedModalOpen, setIsChangeUnitFailedModalOpen] =
    useState(false);
  const [changeUnitFailedMessage, setChangeUnitFailedMessage] = useState("");
  const reservationManager = useReservationManager(apiUrl);

  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    onAfterPrint: () => setTermoParaImprimir(null),
  });

  useEffect(() => {
    if (termoParaImprimir) {
      handlePrint();
    }
  }, [termoParaImprimir, handlePrint]);

  const fetchHistory = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    try {
      const response = await axios.get<string[][]>(
        `${apiUrl}/api/history/${implantacaoName}`
      );
      setHistory(response.data || []);
    } catch (err) {
      console.error(`Erro ao carregar histórico para ${implantacaoName}`, err);
      setHistory([]);
    }
  };

  const handleOpenUnitHistory = (unitName: string) => {
    setSelectedUnitForHistory(unitName);
    setShowHistoryModal(true);
  };

  const clientesDisponiveis = useMemo(() => {
    // Alteração: Remover o filtro de status para que todos os clientes
    // apareçam na lista, independentemente de já terem reservado ou não.
    // A verificação `c && c[0]` garante que apenas linhas de cliente válidas sejam incluídas.
    return clientes.filter((c) => c && c[0]);
  }, [clientes]);

  // NOVO: Memo para unidades disponíveis para o modal de troca
  const availableUnitsForChange = useMemo(() => {
    return unidades.reduce<{ unit: string[]; originalIndex: number }[]>(
      (acc, unit, index) => {
        if ((unit[10]?.toLowerCase() || "disponível") === "disponível") {
          acc.push({ unit, originalIndex: index });
        }
        return acc;
      },
      []
    );
  }, [unidades]);

  const filteredUnidades: [string[], number][] = useMemo(() => {
    return unidades
      .map((unidade, index) => ({ data: unidade, originalIndex: index }))
      .filter(({ data }) => {
        const unitStatus = data[10]?.toLowerCase() || "disponível";
        const unitName = data[2]?.toLowerCase() || "";
        const blockName = data[1]?.toLowerCase() || "";
        const term = searchTerm.toLowerCase();
        const statusMatch =
          statusFilter === "all" || unitStatus === statusFilter;
        const searchMatch = unitName.includes(term) || blockName.includes(term);
        return statusMatch && searchMatch;
      })
      .map((item) => [item.data, item.originalIndex]);
  }, [unidades, searchTerm, statusFilter]);

  const fetchUnitData = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
      const response = await axios.get<ApiResponse>(
        `${apiUrl}/api/data?implantacao=${encodeURIComponent(implantacaoName)}`
      );
      setUnidades(response.data.unidades.slice(1) || []);
      setClientes(response.data.clientes.slice(1) || []);
    } catch (err) {
      console.error(`Erro ao carregar dados para ${implantacaoName}`, err);
      setError(`Não foi possível carregar os dados para "${implantacaoName}".`);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const token = await currentUser.getIdToken();
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        try {
          const [configRes, implantacoesRes] = await Promise.all([
            axios.get<AppConfig>(`${apiUrl}/api/config`),
            axios.get<Implantation[]>(`${apiUrl}/api/implantacoes`),
          ]);

          const allImplantations = implantacoesRes.data || [];
          setImplantacoes(allImplantations);

          // CORREÇÃO: Garante que a implantação da config seja a prioritária.
          // Se não houver, usa a primeira da lista como fallback.
          const currentImplantationName =
            configRes.data.implantacaoAtual ??
            (allImplantations[0]?.nome || "");
          setSelectedImplantationName(currentImplantationName);

          const foundImplantation = allImplantations.find(
            (imp) => imp.nome === currentImplantationName
          );

          if (foundImplantation) {
            setCurrentImplantation(foundImplantation);
            setImageUrl(foundImplantation.url);
            setDotSize(foundImplantation.tamanhoPonto || 16);
            setCurrentLogoUrl(foundImplantation.logoUrl || "/logo-uni.png");

            await fetchUnitData(foundImplantation.nome);
            await fetchHistory(foundImplantation.nome);
          }
          setError(null);
        } catch (err) {
          setError(
            "Falha ao carregar os dados da aplicação. Tente recarregar a página."
          );
          console.error(err);
        }
      } else {
        delete axios.defaults.headers.common["Authorization"];
        setUnidades([]);
        setClientes([]);
        setHistory([]);
        setImplantacoes([]);
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sigla =
      currentImplantation?.sigla || gerarSigla(selectedImplantationName);
    if (!sigla) {
      return;
    }

    const eventSource = new EventSource(
      `${apiUrl}/api/events?implantacao=${encodeURIComponent(
        selectedImplantationName
      )}`
    );

    const handleUnitUpdate = async (event: MessageEvent) => {
      try {
        const eventData = JSON.parse(event.data);
        const { unitData, rowIndex } = eventData;

        if (!unitData || !rowIndex) return; // Ignora eventos malformados
        console.log("SSE Recebido:", { unitData, rowIndex });

        setUnidades((currentUnidades) =>
          currentUnidades.map((unidade, index) => {
            if (index === rowIndex - 2) {
              return unitData;
            }
            return unidade;
          })
        );
      } catch (e) {
        console.error("Erro ao processar evento SSE:", e);
      }
    };

    // NOVO: Handler para o evento de atualização do histórico
    const handleHistoryUpdate = () => {
      console.log("SSE Recebido: historyUpdated. Recarregando histórico...");
      fetchHistory(selectedImplantationName);
    };

    eventSource.addEventListener("unitUpdated", handleUnitUpdate);
    eventSource.addEventListener("historyUpdated", handleHistoryUpdate);

    return () => {
      eventSource.removeEventListener("unitUpdated", handleUnitUpdate);
      eventSource.removeEventListener("historyUpdated", handleHistoryUpdate);
      eventSource.close();
    };
  }, [selectedImplantationName, currentImplantation]);

  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => {
      console.log("Usuário deslogado.");
      setIsIdleModalOpen(false);
    });
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    setIsIdleModalOpen(false);

    idleTimer.current = setTimeout(() => {
      setIsIdleModalOpen(true);
    }, INACTIVITY_TIMEOUT);
  }, [INACTIVITY_TIMEOUT]);

  useEffect(() => {
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keypress",
      "touchstart",
      "scroll",
    ];

    resetIdleTimer();

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimer);
    });

    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [resetIdleTimer]);

  const handleImplantationChange = async (newName: string) => {
    const newImplantation = implantacoes.find((imp) => imp.nome === newName);
    if (!newImplantation || newName === selectedImplantationName) return;
    setSelectedImplantationName(newName);
    setImageUrl(newImplantation.url);
    setDotSize(newImplantation.tamanhoPonto ?? 16);
    setCurrentImplantation(newImplantation);
    setCurrentLogoUrl(newImplantation.logoUrl || "/logo-uni.png");
    await fetchUnitData(newName);
    await fetchHistory(newName);

    // CORREÇÃO: Adiciona a chamada para salvar a implantação selecionada no backend.
    try {
      await axios.post(`${apiUrl}/api/update-config`, {
        key: "implantacaoAtual", // A config ainda usa o nome completo
        value: newName,
      });
    } catch (error) {
      // Log do erro sem bloquear a interface do usuário
      console.error(
        "Falha ao salvar a implantação selecionada no backend.",
        error
      );
      // Opcional: Mostrar um toast/alerta não-bloqueante para o usuário.
    }
  };

  const handleUpdateImageUrl = async (newUrl: string) => {
    setImageUrl(newUrl);
    try {
      await axios.post(`${apiUrl}/api/update-config`, {
        key: "imagemPlantaAtual",
        value: newUrl,
      });
    } catch (error) {
      console.error("Falha ao salvar a nova URL da imagem", error);
      alert(
        "Não foi possível salvar a nova imagem. Verifique o link e tente novamente."
      );
    }
  };

  const handleSaveDotSize = async () => {
    if (!selectedImplantationName) return;
    const newSize = dotSize;
    try {
      await axios.post(`${apiUrl}/api/update-dot-size`, {
        implantacaoName: selectedImplantationName,
        newSize: newSize,
      });
      alert(
        `Tamanho do ponto (${newSize}px) salvo com sucesso para a implantação ${selectedImplantationName}!`
      );
    } catch (error) {
      console.error("Falha ao salvar o tamanho do ponto.", error);
      alert("Não foi possível salvar a alteração. Tente novamente.");
    }
  };

  const handleCloseModals = () => {
    setReservationModalState({ isOpen: false, mode: "select" });
    setIsCancelModalOpen(false);
    setBlockModalState({ isOpen: false, isBlocking: true, apiError: "" });
    setPixModalState({ isOpen: false, unitIndex: null });
    setChangeUnitModalState({ isOpen: false, unitIndex: null }); // <-- NOVO
    setIsChangeUnitSuccessModalOpen(false); // NOVO
    setIsChangeUnitFailedModalOpen(false); // NOVO
    setSelectedUnitIndex(null);
  };

  const handleClearCoords = async (unitIndexToClear: number) => {
    const unit = unidades[unitIndexToClear];
    if (!unit) return;
    const isConfirmed = window.confirm(
      `Tem certeza que deseja remover o mapeamento da unidade "${unit[2]}"?`
    );
    if (!isConfirmed) return;
    const updatedUnidades = [...unidades];
    updatedUnidades[unitIndexToClear][11] = "";
    updatedUnidades[unitIndexToClear][12] = "";
    updatedUnidades[unitIndexToClear][17] = ""; // Limpa a letra também
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitIndexToClear + 2;
      await axios.post(`${apiUrl}/api/clear-coords`, {
        rowIndex: sheetRowIndex, // O backend resolverá o nome da aba pela sigla
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao remover o mapeamento na planilha.");
      console.error(err);
    }
  };

  const handleUnitClick = (unitIndex: number) => {
    if (isMappingMode) {
      const hasCoords = unidades[unitIndex][11] && unidades[unitIndex][12];
      if (hasCoords) {
        handleClearCoords(unitIndex);
      }
      return;
    }
    setSelectedUnitIndex(unitIndex);
    const status = unidades[unitIndex][10]?.toLowerCase();
    if (status === "disponível") {
      setReservationModalState({ isOpen: true, mode: "select" });
    } else if (status === "reservada") {
      setIsCancelModalOpen(true);
    } else if (status === "bloqueada") {
      setBlockModalState({ isOpen: true, isBlocking: false, apiError: "" });
    }
  };

  const handleSpontaneousUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setReservationModalState({ isOpen: true, mode: "manual" });
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setBlockModalState({ isOpen: true, isBlocking: true, apiError: "" });
  };

  const handlePixActionClick = (unitIndex: number) => {
    setPixModalState({
      isOpen: true,
      unitIndex: unitIndex,
    });
  };

  const handleChangeUnitClick = (unitIndex: number) => {
    // <-- NOVO
    setSelectedUnitIndex(unitIndex);
    setChangeUnitModalState({ isOpen: true, unitIndex: unitIndex });
  };

  const handleToggleBlockUnit = async (
    newStatus: "BLOQUEADA" | "DISPONÍVEL",
    password?: string
  ) => {
    if (selectedUnitIndex === null) return;
    if (newStatus === "BLOQUEADA") {
      password = undefined;
    }

    setBlockModalState((prev) => ({
      ...prev,
      apiError: "",
    }));

    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${apiUrl}/api/toggle-block-unit`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        newStatus: newStatus,
        password: password,
        hideAvailable: hideAvailable,
      });

      const updatedUnidades = [...unidades];
      updatedUnidades[selectedUnitIndex][10] = newStatus;
      setUnidades(updatedUnidades);

      handleCloseModals();
      await fetchHistory(selectedImplantationName);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        `Falha ao ${
          newStatus === "BLOQUEADA" ? "bloquear" : "desbloquear"
        } a unidade.`;
      setBlockModalState((prevState) => ({
        ...prevState,
        apiError: errorMessage,
      }));
      console.error(err);
    }
  };

  const handleChangeUnit = async (newUnitIndex: number) => {
    if (changeUnitModalState.unitIndex === null) {
      throw new Error("Unidade de origem não selecionada.");
    }

    try {
      await axios.post(`${apiUrl}/api/change-unit`, {
        implantacao: selectedImplantationName,
        oldUnitIndex: changeUnitModalState.unitIndex,
        newUnitIndex: newUnitIndex,
      });

      // NOVO: Prepara dados para o modal de sucesso
      const oldUnitName =
        unidades[changeUnitModalState.unitIndex]?.[2] || "N/A";
      const newUnitName = unidades[newUnitIndex]?.[2] || "N/A";
      setChangeUnitSuccessData({ oldUnitName, newUnitName });
      setIsChangeUnitSuccessModalOpen(true);

      // Força a atualização dos dados após a troca bem-sucedida
      await fetchUnitData(selectedImplantationName);
      await fetchHistory(selectedImplantationName);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        "Falha ao realizar a troca de unidade. Verifique o console para mais detalhes.";

      // NOVO: Ativa o modal de falha
      setChangeUnitFailedMessage(errorMessage);
      setIsChangeUnitFailedModalOpen(true);

      console.error("Erro ao trocar unidade:", err);
      // Lança o erro para que o modal possa exibi-lo
      throw new Error(errorMessage);
    } finally {
      // O modal será fechado pela lógica interna dele ao chamar onConfirm com sucesso
      // handleCloseModals();
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
      clientData = clientes.find((c) => c[0] === selectedClientIdOrManualData);
      if (!clientData) {
        console.error("Dados do cliente não encontrados!");
        setIsVerifyingModalOpen(false);
        return;
      }
    } else {
      manualData = selectedClientIdOrManualData;
    }

    const unitName = unidades[selectedUnitIndex][2];
    const sheetRowIndex = selectedUnitIndex + 2;

    try {
      const tempReservationResult =
        await reservationManager.createTempReservation(
          // O manager também usará a sigla
          selectedImplantationName,
          sheetRowIndex,
          unitName
        );

      if (!tempReservationResult.success || !tempReservationResult.token) {
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao criar reserva temporária. Tente novamente."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      let dataToBackend: string[];
      let clientName: string;

      if (clientData) {
        dataToBackend = [
          clientData[0],
          clientData[1],
          clientData[2],
          clientData[3],
          clientData[4] || "",
          "RESERVADA",
        ];
        clientName = clientData[1];
      } else if (manualData) {
        dataToBackend = [
          manualData.id,
          manualData.cliente,
          manualData.documento,
          manualData.corretor,
          "",
          "RESERVADA",
        ];
        clientName = manualData.cliente;
      } else {
        throw new Error("Dados do cliente não encontrados");
      }

      const confirmSuccess = await reservationManager.confirmReservation(
        selectedImplantationName, // O manager também usará a sigla
        sheetRowIndex,
        dataToBackend,
        clientName,
        unitName,
        tempReservationResult.token!
      );

      if (confirmSuccess) {
        setIsVerifyingModalOpen(false);
        setIsReservationSuccessModalOpen(true);
        setUnidades(
          unidades.map((unidade, index) => {
            if (index === selectedUnitIndex) {
              const newUnit = [...unidade];
              if (clientData) {
                newUnit[5] = clientData[0];
                newUnit[6] = clientData[1];
                newUnit[7] = clientData[2];
                newUnit[8] = clientData[3];
                newUnit[9] = clientData[4] || "";
                newUnit[10] = "RESERVADA";
              } else if (manualData) {
                newUnit[5] = manualData.id;
                newUnit[6] = manualData.cliente;
                newUnit[7] = manualData.documento;
                newUnit[8] = manualData.corretor;
                newUnit[9] = "";
                newUnit[10] = "RESERVADA";
              }
              return newUnit;
            }
            return unidade;
          })
        );

        if (clientData) {
          const reservedClientId = clientData[0];
          setClientes((currentClientes) =>
            currentClientes.map((cliente) => {
              if (cliente[0] === reservedClientId) {
                const updatedCliente = [...cliente];
                updatedCliente[5] = "JA RESERVOU";
                return updatedCliente;
              }
              return cliente;
            })
          );
        }

        await fetchHistory(selectedImplantationName);
      } else {
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao confirmar reserva. Tente novamente."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);

        await fetchUnitData(selectedImplantationName);
      }
    } catch (error: any) {
      console.error("Erro durante o processo de reserva:", error);

      await reservationManager.cancelTempReservation(
        selectedImplantationName, // O manager também usará a sigla
        sheetRowIndex
      );

      setReservationFailedMessage(
        "Erro inesperado durante a reserva. Tente novamente."
      );
      setIsReservationFailedModalOpen(true);
      setIsVerifyingModalOpen(false);

      await fetchUnitData(selectedImplantationName);
    }
  };

  const handleReserve = (data: string | ManualData) => {
    if (typeof data === "string") {
      handleReserveUnit(data);
    } else {
      handleReserveUnit(data);
    }
  };

  const handleCancelReservation = async () => {
    if (selectedUnitIndex === null) return;
    const unidadeAlvo = unidades[selectedUnitIndex];
    const clientNameToRelease = unidadeAlvo[6];
    const idPreCadastro = unidadeAlvo[5];
    const brokerNameToLog = unidadeAlvo[8] || "N/A";

    setUnidades(
      unidades.map((unidade, index) => {
        if (index === selectedUnitIndex) {
          const newUnit = [...unidade];
          newUnit[5] = "";
          newUnit[6] = "";
          newUnit[7] = "";
          newUnit[8] = "";
          newUnit[9] = "";
          newUnit[10] = "DISPONÍVEL";
          return newUnit;
        }
        return unidade;
      })
    );

    if (clientNameToRelease) {
      const updatedClientes = clientes.map((c) =>
        c[1] === clientNameToRelease ? [...c.slice(0, 5), "PODE RESERVAR"] : c
      );
      setClientes(updatedClientes);
    }
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${apiUrl}/api/cancel-reservation`, {
        unitRowIndex: sheetRowIndex,
        clientName: clientNameToRelease,
        implantacao: selectedImplantationName,
        idPreCadastro: idPreCadastro,
        brokerName: brokerNameToLog,
        hideAvailable: hideAvailable,
      });
    } catch (err) {
      setError("Falha ao cancelar a reserva.");
      console.error(err);
    }
    await fetchHistory(selectedImplantationName);
  };

  const handleMapClickAndSaveCoords = async (x: number, y: number) => {
    if (unitToMapIndex === null) return;
    const coordX = x.toFixed(3);
    const coordY = y.toFixed(3);
    const updatedUnidades = [...unidades];
    updatedUnidades[unitToMapIndex][11] = coordX;
    updatedUnidades[unitToMapIndex][12] = coordY;
    updatedUnidades[unitToMapIndex][17] = unitLetter; // Salva a letra
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitToMapIndex + 2;
      await axios.post(`${apiUrl}/api/update-coords`, {
        rowIndex: sheetRowIndex,
        coordX,
        coordY,
        letra: unitLetter,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao salvar as coordenadas.");
      console.error(err);
    }
    setUnitToMapIndex(null);
    setUnitLetter(""); // Limpa a letra após salvar
  };

  const handleConfirmPixData = async (
    txid: string,
    valor: number,
    identificador: string,
    payloadEmv: string,
    statusPagamento: string
  ) => {
    if (pixModalState.unitIndex === null) return;

    const sheetRowIndex = pixModalState.unitIndex + 2;

    try {
      await axios.post(`${apiUrl}/api/update-pix-data`, {
        implantacao: selectedImplantationName,
        rowIndex: sheetRowIndex,
        txid, // txid original (curto)
        valor,
        identificador, // txid longo da resposta do Santander
        payloadEmv,
        statusPagamento,
      });
      // Atualiza a UI localmente para refletir o status pendente
      const updatedUnidades = [...unidades];
      updatedUnidades[pixModalState.unitIndex][13] = identificador; // Coluna N
      updatedUnidades[pixModalState.unitIndex][14] = payloadEmv; // Coluna O
      updatedUnidades[pixModalState.unitIndex][15] = String(valor); // Coluna P
      updatedUnidades[pixModalState.unitIndex][16] = statusPagamento; // Coluna Q
      setUnidades(updatedUnidades);
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Erro ao salvar dados do PIX."
      );
    }
  };

  const handlePrepareAndPrint = async (unitIndex: number) => {
    const unitData = unidades[unitIndex];
    const impData = implantacoes.find(
      (imp) => imp.nome === selectedImplantationName
    );

    if (!unitData || !impData) {
      alert("Erro: Dados da unidade ou do empreendimento não encontrados.");
      return;
    }

    const unitFullName = `${unitData[2]}`;
    const brokerName = unitData[8] || "N/A";

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
        clientName: unitData[6] || "N/D",
        brokerName: brokerName,
      });
      await fetchHistory(selectedImplantationName);
    } catch (error) {
      console.error("Falha ao registrar a impressão no histórico.", error);
    }

    const today = new Date();
    const formattedDate = `Vitória da Conquista, ${today.toLocaleDateString(
      "pt-BR",
      { day: "numeric" }
    )} de ${today.toLocaleDateString("pt-BR", {
      month: "long",
    })} de ${today.toLocaleDateString("pt-BR", { year: "numeric" })}`;

    const termoData: TermoData = {
      clienteNome: unitData[6] || "N/D",
      clienteCpf: formatCPF(unitData[7]) || "N/D",
      unidadeDesc: `${unitData[2]}`,
      tipologia: unitData[4] || "N/D",
      areaPrivativa: unitData[3] || "N/D",
      etapa: unitData[0] || "N/D",
      empreendimentoNome: impData.nome,
      empreendimentoEndereco: impData.endereco || "Endereço não informado",
      corretorNome: unitData[8] || "N/D",
      dataAtual: formattedDate,
      logoEmpreendimentoUrl: currentLogoUrl,
      dataHoraImpressao: dataHoraImpressao,
    };

    setTermoParaImprimir(termoData);
  };

  if (error) {
    return <p style={{ color: "#d9534f", textAlign: "center" }}>{error}</p>;
  }

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Verificando autenticação...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <HelmetProvider>
      <Helmet>
        <title>Implantação Digital - VCA CONSTRUTORA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Helmet>

      <div className={`page-wrapper ${isMappingMode ? "sidebar-visible" : ""}`}>
        {isMappingMode && (
          <MappingSidebar
            unidades={unidades}
            onSelectUnit={setUnitToMapIndex}
            selectedUnitIndex={unitToMapIndex}
            currentImageUrl={imageUrl}
            onUpdateImage={handleUpdateImageUrl}
            dotSize={dotSize}
            onDotSizeChange={setDotSize}
            onSaveDotSize={handleSaveDotSize}
            unitLetter={unitLetter}
            onLetterChange={setUnitLetter}
          />
        )}
        <div className="app-container">
          {switching && (
            <div className="switching-overlay">
              <div className="loading-spinner"></div>
            </div>
          )}
          <div>
            <main className="main-content">
              <img
                src="/logo.png"
                alt="Logo da VCA Construtora"
                className="main-logo"
              />
              <h1>Espelho de Implantação Humanizada</h1>
              <div className="top-controls">
                <div className="controls-left">
                  <ImplantationSwitcher
                    implantacoes={implantacoes}
                    selected={selectedImplantationName}
                    onChange={handleImplantationChange}
                  />
                  {view === "map" && (
                    <button
                      className={`toggle-mapping-button ${
                        isMappingMode ? "active" : ""
                      }`}
                      onClick={() => setIsMappingMode(!isMappingMode)}
                    >
                      Modo Mapeamento
                    </button>
                  )}
                </div>
                <div className="controls-right">
                  <div className="user-greeting">
                    Logado como: <strong>{user.email}</strong>
                  </div>
                  <div className="filter-checkbox-wrapper">
                    <input
                      type="checkbox"
                      id="hide-available-toggle"
                      checked={hideAvailable}
                      onChange={(e) => setHideAvailable(e.target.checked)}
                    />
                    <label htmlFor="hide-available-toggle">
                      Ocultar Disponíveis
                    </label>
                  </div>
                  <div className="view-switcher">
                    <button
                      className={view === "map" ? "active" : ""}
                      onClick={() => setView("map")}
                    >
                      Mapa Visual
                    </button>
                    <button
                      className={view === "list" ? "active" : ""}
                      onClick={() => setView("list")}
                    >
                      Lista para Reserva
                    </button>
                    <button
                      className={view === "history" ? "active" : ""}
                      onClick={() => setView("history")}
                    >
                      Histórico Geral
                    </button>
                    <button
                      onClick={() => signOut(auth)}
                      className="logout-button"
                    >
                      Sair
                    </button>
                  </div>
                </div>
              </div>
              <div className="view-content">
                {view === "map" && imageUrl && (
                  <FloorPlan
                    imageUrl={imageUrl}
                    unidades={unidades}
                    isMappingMode={isMappingMode}
                    unitToMapIndex={unitToMapIndex}
                    onUnitClick={handleUnitClick}
                    onMapClick={handleMapClickAndSaveCoords}
                    dotSize={dotSize}
                    hideAvailable={hideAvailable}
                    unitLetter={unitLetter}
                  />
                )}
                {view === "list" && (
                  <ReservationList
                    unidades={filteredUnidades}
                    onUnitClick={handleUnitClick}
                    onSpontaneousClick={handleSpontaneousUnitClick}
                    onBlockClick={handleBlockActionClick}
                    onPrintClick={handlePrepareAndPrint}
                    onChangeUnitClick={handleChangeUnitClick} // <-- NOVO
                    onPixClick={handlePixActionClick}
                    onHistoryClick={handleOpenUnitHistory}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    totalUnidades={unidades.length}
                  />
                )}
                {view === "history" && <HistoryView history={history} />}
              </div>
              <ReservationModal
                show={reservationModalState.isOpen}
                onClose={handleCloseModals}
                unitData={
                  selectedUnitIndex !== null
                    ? unidades[selectedUnitIndex]
                    : null
                }
                clientes={clientesDisponiveis}
                onReserve={handleReserve}
                initialMode={reservationModalState.mode}
                onBlockClick={() => {
                  if (selectedUnitIndex === null) return;
                  handleCloseModals();
                  setTimeout(
                    () => handleBlockActionClick(selectedUnitIndex),
                    150
                  );
                }}
              />
              <CancelModal
                show={isCancelModalOpen}
                onClose={handleCloseModals}
                unitData={
                  selectedUnitIndex !== null
                    ? unidades[selectedUnitIndex]
                    : null
                }
                onConfirmCancel={handleCancelReservation}
              />
              <BlockModal
                show={blockModalState.isOpen}
                onClose={handleCloseModals}
                unitData={
                  selectedUnitIndex !== null
                    ? unidades[selectedUnitIndex]
                    : null
                }
                isBlocking={blockModalState.isBlocking}
                apiError={blockModalState.apiError}
                onConfirm={(password = "") =>
                  handleToggleBlockUnit(
                    blockModalState.isBlocking ? "BLOQUEADA" : "DISPONÍVEL",
                    password
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
                unidades={unidades}
                implantacaoNome={selectedImplantationName}
                implantacaoSigla={
                  currentImplantation?.sigla ||
                  gerarSigla(selectedImplantationName)
                }
                onConfirm={handleConfirmPixData}
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
                onConfirm={handleChangeUnit} // A chamada aqui está correta, a função que faltava.
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
              <IdleTimeoutModal
                show={isIdleModalOpen}
                onContinue={resetIdleTimer}
                onLogout={handleLogout}
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
                  selectedUnitIndex !== null
                    ? unidades[selectedUnitIndex]
                    : null
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
            </main>
          </div>
        </div>
        <div style={{ display: "none" }}>
          <TermoDeReserva ref={printComponentRef} data={termoParaImprimir} />
        </div>
      </div>
    </HelmetProvider>
  );
}
