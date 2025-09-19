// src/App.tsx - VERSÃO COM CORREÇÃO FINAL BASEADA NO MANUAL ATUAL

import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { useReactToPrint } from "react-to-print";
import { FloorPlan } from "../components/FloorPlan";
import { ReservationModal } from "../components/ReservationModal";
import { ReservationList } from "../components/ReservationList";
import { CancelModal } from "../components/CancelModal";
import { BlockModal } from "../components/BlockModal";
import { MappingSidebar } from "../components/MappingSidebar";
import { ImplantationSwitcher } from "../components/ImplantationSwitcher";
import { TermoDeReserva, type TermoData } from "../components/TermoDeReserva";
import "./App.css";
import "../components/TermoDeReserva.css";
import { HistoryView } from "../components/HistoryView";
import { UnitHistoryModal } from "../components/UnitHistoryModal";
import { type User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { Login } from "../components/Login";
import { IdleTimeoutModal } from "../components/IdleTimeoutModal"; // Importe o novo modal

import { VerifyingModal } from "../components/VerifyingModal";
import { ReservationFailedModal } from "../components/ReservationFailedModal";
import { ReservationSuccessModal } from "../components/ReservationSuccessModal";
import { useReservationManager } from "./hooks/useReservationManager";
const API_URL = "https://simulador-implantacao.onrender.com"; // URL da API, ajuste conforme necessário
const localApiUrl = "http://localhost:3001"; // URL do seu backend local
const apiUrl = process.env.NODE_ENV === "development" ? localApiUrl : API_URL;
// ... (interfaces permanecem as mesmas)
interface ApiResponse {
  unidades: string[][];
  clientes: string[][];
}
interface AppConfig {
  implantacaoAtual?: string;
}
interface Implantation {
  nome: string;
  url: string;
  tamanhoPonto?: number;
  endereco?: string;
  logoUrl?: string; // <-- MUDANÇA AQUI
}
interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
}

const formatCPF = (cpf: string | null | undefined): string => {
  // Se o CPF for nulo, indefinido ou uma string vazia, retorna o placeholder.
  if (!cpf) {
    return "XXX.XXX.XXX-XX";
  }

  // 1. Remove todos os caracteres que não são dígitos
  const onlyNums = cpf.replace(/[^\d]/g, "");

  // 2. Se a string limpa não tiver 11 dígitos, retorna o que foi limpo (para não quebrar)
  if (onlyNums.length !== 11) {
    return onlyNums;
  }

  // 3. Aplica a máscara de formatação e retorna
  return onlyNums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

function App() {
  // ... (todos os states permanecem os mesmos)
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [unidades, setUnidades] = useState<string[][]>([]);
  const [clientes, setClientes] = useState<string[][]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [switching, setSwitching] = useState<boolean>(false);
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
  const [reservationModalState, setReservationModalState] = useState({
    isOpen: false,
    mode: "select" as "select" | "manual",
  });
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string>("/logo-uni.png");
  const [blockModalState, setBlockModalState] = useState({
    isOpen: false,
    isBlocking: true,
    apiError: "", // Adiciona um campo para o erro da API
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "disponível" | "reservada" | "bloqueada"
  >("all");

  const [termoParaImprimir, setTermoParaImprimir] = useState<TermoData | null>(
    null
  );
  const printComponentRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[][]>([]); // Para o histórico geral
  const [showHistoryModal, setShowHistoryModal] = useState(false); // Renomeado para clareza
  const [selectedUnitForHistory, setSelectedUnitForHistory] = useState<
    string | null
  >(null); // <-- NOVO ESTADO
  const [isIdleModalOpen, setIsIdleModalOpen] = useState(false);
  const [isVerifyingModalOpen, setIsVerifyingModalOpen] = useState(false);
  const [isReservationFailedModalOpen, setIsReservationFailedModalOpen] =
    useState(false);
  const [reservationFailedMessage, setReservationFailedMessage] = useState("");
  const [isReservationSuccessModalOpen, setIsReservationSuccessModalOpen] =
    useState(false);

  // Hook para gerenciar reservas temporárias
  const reservationManager = useReservationManager(apiUrl);

  // --- CORREÇÃO FINAL APLICADA AQUI, SEGUINDO O MANUAL ATUAL ---
  const handlePrint = useReactToPrint({
    contentRef: printComponentRef, // A propriedade correta é 'contentRef'
    onAfterPrint: () => setTermoParaImprimir(null),
  });

  useEffect(() => {
    // Quando 'termoParaImprimir' tiver dados, chamamos a função de impressão sem argumentos.
    if (termoParaImprimir) {
      handlePrint();
    }
  }, [termoParaImprimir, handlePrint]);
  // --- FIM DA CORREÇÃO ---

  const fetchHistory = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    try {
      const response = await axios.get<string[][]>( // eslint-disable-line no-unused-vars
        `${apiUrl}/api/history/${implantacaoName}`
      );
      setHistory(response.data || []);
    } catch (err) {
      console.error(`Erro ao carregar histórico para ${implantacaoName}`, err);
      setHistory([]); // Limpa o histórico em caso de erro
    }
  };

  // <-- FUNÇÃO ATUALIZADA
  const handleOpenUnitHistory = (unitName: string) => {
    setSelectedUnitForHistory(unitName); // Armazena o nome da unidade
    setShowHistoryModal(true); // Abre o modal
  };

  // ... (o resto do componente, que já está correto, continua abaixo)

  const clientesDisponiveis = useMemo(() => {
    return clientes.filter((c) => c && c[5] === "PODE RESERVAR");
  }, [clientes]);

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
        `${apiUrl}/api/data?implantacao=${implantacaoName}`
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
  // Este useEffect agora gerencia a autenticação E o carregamento de dados
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

          const currentImplantationName =
            configRes.data.implantacaoAtual || allImplantations[0]?.nome || "";
          setSelectedImplantationName(currentImplantationName);

          const currentImplantation = allImplantations.find(
            (imp) => imp.nome === currentImplantationName
          );

          if (currentImplantation) {
            setImageUrl(currentImplantation.url);
            setDotSize(currentImplantation.tamanhoPonto || 16);
            setCurrentLogoUrl(currentImplantation.logoUrl || "/logo-uni.png");

            await fetchUnitData(currentImplantation.nome);
            await fetchHistory(currentImplantation.nome);
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

      // Esta é a linha mais importante. Ela só roda depois de tudo.
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Efeito para conectar aos Server-Sent Events (SSE) para atualizações em tempo real
  useEffect(() => {
    // Só conecta se tivermos uma implantação selecionada
    if (!selectedImplantationName) {
      return;
    }

    // Cria a conexão com o endpoint de eventos do backend
    const eventSource = new EventSource(
      `${apiUrl}/api/events?implantacao=${selectedImplantationName}`
    );

    // Handler para a mensagem 'unit-updated' enviada pelo servidor
    const handleUnitUpdate = async (event: MessageEvent) => {
      try {
        const { unitData, rowIndex } = JSON.parse(event.data);
        console.log("SSE Recebido:", { unitData, rowIndex });

        // Atualiza o estado local da unidade específica de forma imutável
        setUnidades((currentUnidades) =>
          currentUnidades.map((unidade, index) => {
            // O rowIndex do backend é baseado em 1 e a planilha começa na linha 1.
            // O array de unidades começa em 0, então subtraímos 2 (1 pelo cabeçalho, 1 pelo índice 0).
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

    // Adiciona o listener para o evento específico 'unitUpdated'
    eventSource.addEventListener("unitUpdated", handleUnitUpdate);

    // Função de limpeza: fecha a conexão SSE quando o componente desmonta
    // ou quando a implantação selecionada muda.
    return () => {
      eventSource.removeEventListener("unitUpdated", handleUnitUpdate);
      eventSource.close();
    }; // Roda este efeito sempre que a implantação selecionada mudar
  }, [selectedImplantationName]);

  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutos em milissegundos

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => {
      console.log("Usuário deslogado.");
      setIsIdleModalOpen(false);
    });
  }, []);

  const resetIdleTimer = useCallback(() => {
    // Limpa o cronômetro anterior
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    // Limpa o modal de aviso se estiver aberto
    setIsIdleModalOpen(false);

    // Inicia um novo cronômetro
    idleTimer.current = setTimeout(() => {
      // Quando o tempo esgotar, abre o modal de aviso
      setIsIdleModalOpen(true);
    }, INACTIVITY_TIMEOUT);
  }, [INACTIVITY_TIMEOUT]);

  // useEffect para adicionar e remover os event listeners de atividade
  useEffect(() => {
    // Lista de eventos que contam como atividade
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keypress",
      "touchstart",
      "scroll",
    ];

    // Inicia o cronômetro quando o componente monta
    resetIdleTimer();

    // Adiciona os listeners para reiniciar o cronômetro em qualquer atividade
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimer);
    });

    // Função de limpeza para remover os listeners quando o componente desmonta
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
    setDotSize(newImplantation.tamanhoPonto || 16);
    setCurrentLogoUrl(newImplantation.logoUrl || "/logo-uni.png");
    await fetchUnitData(newName);
    await fetchHistory(newName);
    try {
      await axios.post(`${apiUrl}/api/update-config`, {
        key: "implantacaoAtual",
        value: newName,
      });
    } catch (error) {
      console.error("Falha ao salvar a implantação selecionada.", error);
      alert("Não foi possível salvar sua escolha.");
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
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitIndexToClear + 2;
      await axios.post(`${apiUrl}/api/clear-coords`, {
        rowIndex: sheetRowIndex,
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
    // Abre o modal de confirmação para bloqueio
    setBlockModalState({ isOpen: true, isBlocking: true, apiError: "" });
  };

  const handleToggleBlockUnit = async (
    newStatus: "BLOQUEADA" | "DISPONÍVEL",
    password?: string
  ) => {
    if (selectedUnitIndex === null) return;
    // Se for um bloqueio, a senha não é necessária.
    // O modal de confirmação chama onConfirm sem senha.
    if (newStatus === "BLOQUEADA") {
      password = undefined;
    }

    // Limpa o erro da API antes de tentar a operação
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
        hideAvailable: hideAvailable, // Envia o estado do filtro
      });

      // Só atualiza o estado local APÓS a resposta bem-sucedida do backend
      const updatedUnidades = [...unidades];
      updatedUnidades[selectedUnitIndex][10] = newStatus;
      setUnidades(updatedUnidades);

      handleCloseModals();
      // Limpa a senha do modal após o sucesso
      // (O componente BlockModal não tem acesso a `setPassword`, então fazemos aqui indiretamente)
      await fetchHistory(selectedImplantationName);
    } catch (err: any) {
      // Melhoria: Exibir a mensagem de erro específica do backend (ex: "Senha incorreta") no modal
      const errorMessage =
        err.response?.data?.error ||
        `Falha ao ${
          newStatus === "BLOQUEADA" ? "bloquear" : "desbloquear"
        } a unidade.`;
      // Em vez de usar alert() e setError(), passamos o erro para o estado do modal
      setBlockModalState((prevState) => ({
        ...prevState,
        apiError: errorMessage,
      }));
      // Não definimos o erro global para evitar a quebra da página
      console.error(err);
    }
  };

  const handleReserveUnit = async (
    selectedClientIdOrManualData: string | ManualData
  ) => {
    if (selectedUnitIndex === null) return;

    // 1. Fecha todos os modais e abre o de verificação
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
      // 2. Cria uma reserva temporária (lock)
      const tempReservationResult =
        await reservationManager.createTempReservation(
          selectedImplantationName,
          sheetRowIndex,
          unitName
        );

      if (!tempReservationResult.success || !tempReservationResult.token) {
        // Se falhou ao criar reserva temporária, mostra erro
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao criar reserva temporária. Tente novamente."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);
        return;
      }

      // 3. Aguarda um tempo para o usuário ver o modal de verificação
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 4. Confirma a reserva definitiva
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
        selectedImplantationName,
        sheetRowIndex,
        dataToBackend,
        clientName,
        unitName,
        tempReservationResult.token!
      );

      if (confirmSuccess) {
        // 5. Se a reserva foi bem-sucedida, atualiza o estado local
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
          const reservedClientId = clientData[0]; // O ID do cliente está na coluna 0
          setClientes((currentClientes) =>
            currentClientes.map((cliente) => {
              if (cliente[0] === reservedClientId) {
                const updatedCliente = [...cliente];
                updatedCliente[5] = "JA RESERVOU"; // Atualiza o status na coluna F (índice 5)
                return updatedCliente;
              }
              return cliente;
            })
          );
        }

        await fetchHistory(selectedImplantationName);
      } else {
        // 6. Se a confirmação falhou, mostra erro
        setReservationFailedMessage(
          reservationManager.reservationState.error ||
            "Erro ao confirmar reserva. Tente novamente."
        );
        setIsReservationFailedModalOpen(true);
        setIsVerifyingModalOpen(false);

        // Recarrega os dados para garantir sincronização
        await fetchUnitData(selectedImplantationName);
      }
    } catch (error: any) {
      console.error("Erro durante o processo de reserva:", error);

      // Cancela a reserva temporária se existir
      await reservationManager.cancelTempReservation(
        selectedImplantationName,
        sheetRowIndex
      );

      setReservationFailedMessage(
        "Erro inesperado durante a reserva. Tente novamente."
      );
      setIsReservationFailedModalOpen(true);
      setIsVerifyingModalOpen(false);

      // Recarrega os dados
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
    const brokerNameToLog = unidadeAlvo[8] || "N/A"; // <-- ADICIONE ESTA LINHA para pegar o nome do corretor

    // FORMA CORRETA (IMUTÁVEL)
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
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitToMapIndex + 2;
      await axios.post(`${apiUrl}/api/update-coords`, {
        rowIndex: sheetRowIndex,
        coordX,
        coordY,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao salvar as coordenadas.");
      console.error(err);
    }
    setUnitToMapIndex(null);
  };

  const handlePrepareAndPrint = async (unitIndex: number) => {
    // <-- MUDANÇA AQUI (async)
    const unitData = unidades[unitIndex];
    const impData = implantacoes.find(
      (imp) => imp.nome === selectedImplantationName
    );

    if (!unitData || !impData) {
      alert("Erro: Dados da unidade ou do empreendimento não encontrados.");
      return;
    }

    const unitFullName = `${unitData[2]}`;
    const brokerName = unitData[8] || "N/A"; // <-- ADICIONE ESTA LINHA

    const dataHoraImpressao = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // <-- LÓGICA NOVA COMEÇA AQUI -->
    try {
      // Registra o evento de impressão no backend (sem esperar a conclusão)
      axios.post(`${apiUrl}/api/log-print`, {
        implantacao: selectedImplantationName,
        unitName: unitFullName,
        clientName: unitData[6] || "N/D",
        brokerName: brokerName,
      });
      await fetchHistory(selectedImplantationName); // E ADICIONE ESTA LINHA
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
      dataHoraImpressao: dataHoraImpressao, // <-- ADICIONE ESTA LINHA
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
                  <button
                    className={`toggle-mapping-button ${
                      isMappingMode ? "active" : ""
                    }`}
                    onClick={() => setIsMappingMode(!isMappingMode)}
                  >
                    Modo Mapeamento
                  </button>
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
                    {/* ADICIONE O BOTÃO ABAIXO */}
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
                  />
                )}
                {view === "list" && (
                  <ReservationList
                    unidades={filteredUnidades}
                    onUnitClick={handleUnitClick}
                    onSpontaneousClick={handleSpontaneousUnitClick}
                    onBlockClick={handleBlockActionClick}
                    onPrintClick={handlePrepareAndPrint}
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
                onConfirm={(
                  password = "" // Garante que a senha seja opcional na chamada
                ) =>
                  handleToggleBlockUnit(
                    blockModalState.isBlocking ? "BLOQUEADA" : "DISPONÍVEL",
                    password
                  )
                }
              />
              {/* CHAMADA DO MODAL CORRIGIDA */}
              <UnitHistoryModal
                show={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                unitName={selectedUnitForHistory}
                fullHistory={history}
              />
              <IdleTimeoutModal
                show={isIdleModalOpen}
                onContinue={resetIdleTimer} // "Continuar" simplesmente reinicia o cronômetro
                onLogout={handleLogout} // "Sair" chama a função de deslogar
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

export default App;
