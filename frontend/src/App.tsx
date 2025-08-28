// src/App.tsx - VERSÃO COM CORREÇÃO FINAL BASEADA NO MANUAL ATUAL

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

const API_URL = "https://simulador-implantacao.onrender.com"; // URL da API, ajuste conforme necessário

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
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [unitForHistory, setUnitForHistory] = useState<string[] | null>(null);
  const [isIdleModalOpen, setIsIdleModalOpen] = useState(false);

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
      const response = await axios.get<string[][]>(
        `${API_URL}/api/history/${implantacaoName}`
      );
      setHistory(response.data || []);
    } catch (err) {
      console.error(`Erro ao carregar histórico para ${implantacaoName}`, err);
      setHistory([]); // Limpa o histórico em caso de erro
    }
  };

  const handleOpenUnitHistory = (unitIndex: number) => {
    const unitData = unidades[unitIndex];
    if (unitData) {
      setUnitForHistory(unitData);
      setIsHistoryModalOpen(true);
    }
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
        `${API_URL}/api/data?implantacao=${implantacaoName}`
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
            axios.get<AppConfig>(`${API_URL}/api/config`),
            axios.get<Implantation[]>(`${API_URL}/api/implantacoes`),
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
      await axios.post(`${API_URL}/api/update-config`, {
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
      await axios.post(`${API_URL}/api/update-config`, {
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
      await axios.post(`${API_URL}/api/update-dot-size`, {
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
    setBlockModalState({ isOpen: false, isBlocking: true });
    setSelectedUnitIndex(null);
  };

  const handleClearCoords = async (unitIndexToClear: number) => {
    const unit = unidades[unitIndexToClear];
    if (!unit) return;
    const isConfirmed = window.confirm(
      `Tem certeza que deseja remover o mapeamento da unidade "${unit[3]}"?`
    );
    if (!isConfirmed) return;
    const updatedUnidades = [...unidades];
    updatedUnidades[unitIndexToClear][11] = "";
    updatedUnidades[unitIndexToClear][12] = "";
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitIndexToClear + 2;
      await axios.post(`${API_URL}/api/clear-coords`, {
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
      setBlockModalState({ isOpen: true, isBlocking: false });
    }
  };

  const handleSpontaneousUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setReservationModalState({ isOpen: true, mode: "manual" });
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setBlockModalState({ isOpen: true, isBlocking: true });
  };

  const handleToggleBlockUnit = async (
    newStatus: "BLOQUEADA" | "DISPONÍVEL"
  ) => {
    if (selectedUnitIndex === null) return;
    const updatedUnidades = [...unidades];
    updatedUnidades[selectedUnitIndex][10] = newStatus;
    setUnidades(updatedUnidades);
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/toggle-block-unit`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        newStatus: newStatus,
      });
    } catch (err) {
      setError(
        `Falha ao ${
          newStatus === "BLOQUEADA" ? "bloquear" : "desbloquear"
        } a unidade.`
      );
      console.error(err);
    }
    await fetchHistory(selectedImplantationName);
  };

  const handleReserveUnit = async (selectedClientId: string) => {
    if (selectedUnitIndex === null) return;
    const clientData = clientes.find((c) => c[0] === selectedClientId);
    if (!clientData) {
      console.error("Dados do cliente não encontrados!");
      return;
    }

    const clientName = clientData[1];
    const unitName = unidades[selectedUnitIndex][2];

    // Dados para enviar ao backend (colunas F até K)
    const dataToBackend = [
      clientData[0], // ID Pré-Cadastro
      clientData[1], // Cliente
      clientData[2], // Documento
      clientData[3], // Corretor
      clientData[4] || "", // Imobiliária (garante que seja string)
      "RESERVADA", // Situação
    ];

    // ATUALIZAÇÃO DE ESTADO (Forma correta e imutável)
    setUnidades(
      unidades.map((unidade, index) => {
        if (index === selectedUnitIndex) {
          const newUnit = [...unidade];
          newUnit[5] = dataToBackend[0];
          newUnit[6] = dataToBackend[1];
          newUnit[7] = dataToBackend[2];
          newUnit[8] = dataToBackend[3];
          newUnit[9] = dataToBackend[4];
          newUnit[10] = dataToBackend[5];
          return newUnit;
        }
        return unidade;
      })
    );

    const updatedClientes = clientes.map((c) =>
      c[0] === selectedClientId ? [...c.slice(0, 5), "JA RESERVOU"] : c
    );
    setClientes(updatedClientes);
    handleCloseModals();

    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/update`, {
        rowIndex: sheetRowIndex,
        data: dataToBackend, // Usa a variável correta
        clientName: clientName,
        implantacao: selectedImplantationName,
        unitName: unitName,
      });
    } catch (err) {
      setError("Falha ao salvar a reserva na planilha.");
      console.error(err);
    }
    await fetchHistory(selectedImplantationName);
  };

  const handleSpontaneousReserve = async (manualData: ManualData) => {
    if (selectedUnitIndex === null) return;

    // FORMA CORRETA (IMUTÁVEL)
    setUnidades(
      unidades.map((unidade, index) => {
        if (index === selectedUnitIndex) {
          const newUnit = [...unidade];
          newUnit[5] = manualData.id;
          newUnit[6] = manualData.cliente;
          newUnit[7] = manualData.documento;
          newUnit[8] = manualData.corretor;
          newUnit[9] = ""; // Imobiliária
          newUnit[10] = "RESERVADA";
          return newUnit;
        }
        return unidade;
      })
    );
    handleCloseModals();

    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      const unitName = unidades[selectedUnitIndex][2];
      await axios.post(`${API_URL}/api/spontaneous-update`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        unitName: unitName,
        manualData: manualData,
      });
    } catch (err) {
      setError("Falha ao salvar a reserva espontânea na planilha.");
      console.error(err);
    }
    await fetchHistory(selectedImplantationName);
  };

  const handleReserve = (data: string | ManualData) => {
    if (typeof data === "string") {
      handleReserveUnit(data);
    } else {
      handleSpontaneousReserve(data);
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
      await axios.post(`${API_URL}/api/cancel-reservation`, {
        unitRowIndex: sheetRowIndex,
        clientName: clientNameToRelease,
        implantacao: selectedImplantationName,
        idPreCadastro: idPreCadastro,
        brokerName: brokerNameToLog,
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
      await axios.post(`${API_URL}/api/update-coords`, {
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
      axios.post(`${API_URL}/api/log-print`, {
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
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
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
              onConfirm={() =>
                handleToggleBlockUnit(
                  blockModalState.isBlocking ? "BLOQUEADA" : "DISPONÍVEL"
                )
              }
            />
            <UnitHistoryModal
              show={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              unitData={unitForHistory}
              historyForUnit={history.filter(
                (entry) =>
                  unitForHistory &&
                  entry[2] === `${unitForHistory[1]} - ${unitForHistory[2]}`
              )}
            />
            <IdleTimeoutModal
              show={isIdleModalOpen}
              onContinue={resetIdleTimer} // "Continuar" simplesmente reinicia o cronômetro
              onLogout={handleLogout} // "Sair" chama a função de deslogar
            />
          </main>
        </div>
      </div>
      <div style={{ display: "none" }}>
        <TermoDeReserva ref={printComponentRef} data={termoParaImprimir} />
      </div>
    </div>
  );
}

export default App;
