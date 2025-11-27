// src/pages/MainPage.tsx

import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { useReactToPrint } from "react-to-print";
import { Settings } from "lucide-react";

import { FloorPlan } from "../../components/FloorPlan";
import { ReservationModal } from "../../components/ReservationModal";
import { ReservationList } from "../../components/ReservationList";
import { CancelModal } from "../../components/CancelModal";
import { BlockModal } from "../../components/BlockModal";
import { MappingSidebar } from "../../components/MappingSidebar";
import { ImplantationSwitcher } from "../../components/ImplantationSwitcher";
import { Header } from "../../components/Header";
import { HamburgerMenu } from "../../components/HamburgerMenu";
import { NewImplantationModal } from "../../components/NewImplantationModal";
import { EditImplantationModal } from "../../components/EditImplantationModalWithTabs";
import {
  TermoDeReserva,
  type TermoData,
} from "../../components/TermoDeReserva";
import { HistoryView } from "../../components/HistoryView";
import { UnitHistoryModal } from "../../components/UnitHistoryModal";
import { auth, supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";
import { Login } from "../../components/Login";

import { VerifyingModal } from "../../components/VerifyingModal";
import { ReservationFailedModal } from "../../components/ReservationFailedModal";
import { ReservationSuccessModal } from "../../components/ReservationSuccessModal";
import { PixModal } from "../../components/PixModal";
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

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";

// SEMPRE usa AWS (backend está na EC2)
const apiUrl = AWS_API_URL;

console.log("🌐 [CONFIG] Ambiente:", import.meta.env.MODE);
console.log("🌐 [CONFIG] API URL:", apiUrl);

interface ApiResponse {
  unidades: string[][];
  clientes: string[][];
  sheetNotFound?: boolean;
  message?: string;
}
export interface AppConfig {
  implantacaoAtual?: string;
}
interface Implantation {
  id?: string;
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
  const [showContent, setShowContent] = useState(false);
  const [unidades, setUnidades] = useState<string[][]>([]);
  const [clientes, setClientes] = useState<string[][]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [switching, setSwitching] = useState<boolean>(false);
  const [currentImplantation, setCurrentImplantation] =
    useState<Implantation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list" | "history">(
    window.innerWidth <= 768 ? "list" : "map"
  );
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [unitToMapIndex, setUnitToMapIndex] = useState<number | null>(null);
  const [dotSize, setDotSize] = useState<number>(16);
  const [hideAvailable, setHideAvailable] = useState<boolean>(false);
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
  const [unidadesCount, setUnidadesCount] = useState<number>(0);
  const [unidadesConfigured, setUnidadesConfigured] = useState<boolean>(false);
  const [clientesCount, setClientesCount] = useState<number>(0);
  const [clientesConfigured, setClientesConfigured] = useState<boolean>(false);
  const [userDisplayName, setUserDisplayName] = useState<string>("");

  // Estados para seleção em cadeia
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  const [termoParaImprimir, setTermoParaImprimir] = useState<TermoData | null>(
    null
  );
  const printComponentRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[][]>([]);
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPrintConfigModalOpen, setIsPrintConfigModalOpen] = useState(false);
  const [pendingPrintUnitIndex, setPendingPrintUnitIndex] = useState<
    number | null
  >(null);
  const [showFullNameModal, setShowFullNameModal] = useState(false);
  // Removido userFullName - não está sendo usado no momento
  const reservationManager = useReservationManager(apiUrl);

  // Estados para os novos modais
  const [isNewImplantationModalOpen, setIsNewImplantationModalOpen] =
    useState(false);
  const [isEditImplantationModalOpen, setIsEditImplantationModalOpen] =
    useState(false);
  const [implantationToEdit, setImplantationToEdit] = useState<
    | (Implantation & {
        id: string;
        cidade: string;
        estado: string;
        cvcrm_id?: string;
      })
    | null
  >(null);

  // Função para recarregar implantações
  const fetchImplantations = async () => {
    try {
      const response = await axios.get<Implantation[]>(
        `${apiUrl}/api/implantacoes`
      );
      setImplantacoes(response.data || []);
    } catch (err) {
      console.error("Erro ao buscar implantações:", err);
    }
  };

  // Handlers para os novos modais
  const handleOpenNewImplantation = () => {
    setIsNewImplantationModalOpen(true);
  };

  const handleOpenEditImplantation = () => {
    if (!currentImplantation) return;
    // Buscar dados completos da implantação (incluindo id, cidade, estado)
    axios
      .get(`${apiUrl}/api/implantacoes`)
      .then((res) => {
        const fullData = res.data.find(
          (imp: Implantation) => imp.nome === currentImplantation.nome
        );
        if (fullData) {
          setImplantationToEdit(fullData);
          setIsEditImplantationModalOpen(true);
        }
      })
      .catch((err) => console.error("Erro ao buscar implantação:", err));
  };

  const handleImplantationSuccess = async () => {
    await fetchImplantations();
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

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
        const normalizedStatus = (unit[10] || "disponível")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        if (normalizedStatus === "disponivel") {
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
        // Normaliza status: remove acentos, lowercase, trim
        const rawStatus = data[10] || "disponível";
        const normalizedStatus = rawStatus
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

        const unitName = data[2]?.toLowerCase() || "";
        const blockName = data[1]?.toLowerCase() || "";
        const tipologia = data[4]?.toLowerCase() || ""; // Coluna E - Tipologia
        const clientName = data[6]?.toLowerCase() || "";
        const brokerName = data[8]?.toLowerCase() || "";
        const term = searchTerm
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // Normaliza statusFilter para comparação
        const normalizedFilter =
          statusFilter === "all"
            ? "all"
            : statusFilter.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  const fetchUnitData = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
      const response = await axios.get<ApiResponse>(
        `${apiUrl}/api/data?implantacao=${encodeURIComponent(implantacaoName)}`
      );

      // Verifica se a planilha existe
      if (response.data.sheetNotFound) {
        setUnidades([]);
        setClientes([]);
        console.log(
          `ℹ️ Planilha '${implantacaoName}' ainda não existe (sem unidades importadas)`
        );
      } else {
        setUnidades(response.data.unidades.slice(1) || []);
        setClientes(response.data.clientes.slice(1) || []);
      }
    } catch (err) {
      console.error(`Erro ao carregar dados para ${implantacaoName}`, err);
      setError(`Não foi possível carregar os dados para "${implantacaoName}".`);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          // Salva o token no localStorage para uso em outros componentes
          localStorage.setItem("token", session.access_token);
          axios.defaults.headers.common[
            "Authorization"
          ] = `Bearer ${session.access_token}`;
        } else {
          console.warn("Sessão não encontrada após login");
          setAuthLoading(false);
          return;
        }

        try {
          // Busca lista de implantações disponíveis
          const implantacoesRes = await axios.get<Implantation[]>(
            `${apiUrl}/api/implantacoes`
          );

          // Busca full_name separadamente para não bloquear o fluxo principal
          try {
            const fullNameRes = await axios.get(`${apiUrl}/api/user/full-name`);
            const fullName = fullNameRes.data.full_name;
            if (fullName) {
              setUserDisplayName(fullName);
            }
            if (!fullName) {
              setShowFullNameModal(true);
            }
          } catch (err) {
            console.log("Erro ao buscar full_name (não crítico):", err);
            setShowFullNameModal(true);
          }

          const allImplantations = implantacoesRes.data || [];
          setImplantacoes(allImplantations);

          // Tentar recuperar a última implantação usada pelo usuário (localStorage)
          const lastUsedImplantacao = localStorage.getItem(
            "selectedImplantacao"
          );

          if (lastUsedImplantacao) {
            // Verifica se a implantação ainda existe
            const implExists = allImplantations.some(
              (impl) => impl.nome === lastUsedImplantacao
            );

            if (implExists) {
              console.log(
                "✅ Restaurando última implantação usada:",
                lastUsedImplantacao
              );
              const foundImplantation = allImplantations.find(
                (imp) => imp.nome === lastUsedImplantacao
              );

              if (foundImplantation) {
                setSelectedImplantationName(lastUsedImplantacao);
                setCurrentImplantation(foundImplantation);
                setImageUrl(foundImplantation.url);
                setDotSize(foundImplantation.tamanhoPonto || 16);
                setCurrentLogoUrl(foundImplantation.logoUrl || "/logo-uni.png");

                await fetchUnitData(foundImplantation.nome);
                await fetchHistory(foundImplantation.nome);

                // Fetch unit count for badge display
                try {
                  const token = localStorage.getItem("token");
                  const countResponse = await axios.get(
                    `${apiUrl}/api/implantacoes/${encodeURIComponent(
                      foundImplantation.nome
                    )}/unidades/count`,
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );
                  setUnidadesCount(countResponse.data.count || 0);
                  setUnidadesConfigured(countResponse.data.configured || false);
                } catch (err) {
                  console.log("Erro ao buscar contagem de unidades:", err);
                }

                // Verifica se há clientes importados no Supabase
                if (foundImplantation?.id) {
                  try {
                    const { count: clientesCount, error: clientesError } =
                      await supabase
                        .from("clientes")
                        .select("*", { count: "exact", head: true })
                        .eq("implantacao_id", foundImplantation.id);

                    if (clientesError) throw clientesError;

                    setClientesCount(clientesCount || 0);
                    setClientesConfigured((clientesCount || 0) > 0);
                  } catch (error) {
                    console.error(
                      "Erro ao verificar clientes importados:",
                      error
                    );
                  }
                }
              }
            } else {
              console.log(
                "⚠️ Última implantação usada não existe mais. Aguardando seleção manual."
              );
              localStorage.removeItem("selectedImplantacao");
            }
          } else {
            console.log(
              "ℹ️ Nenhuma implantação selecionada anteriormente. Aguardando seleção."
            );
          }
          setError(null);
        } catch (err) {
          setError(
            "Falha ao carregar os dados da aplicação. Tente recarregar a página."
          );
          console.error(err);
        }
      } else {
        // Remove o token do localStorage ao fazer logout
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

    const unsubscribe = auth.onAuthStateChange((user) => {
      if (user && !axios.defaults.headers.common["Authorization"]) {
        // Se o usuário acabou de fazer login, recarrega os dados
        checkUser();
      } else if (!user) {
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

  const handleImplantationChange = async (newName: string) => {
    const newImplantation = implantacoes.find((imp) => imp.nome === newName);
    if (!newImplantation || newName === selectedImplantationName) return;

    console.log("🔄 Trocando implantação para:", newName);

    // Salva a escolha no localStorage (sessão por usuário)
    localStorage.setItem("selectedImplantacao", newName);

    setSelectedImplantationName(newName);
    setImageUrl(newImplantation.url);
    setDotSize(newImplantation.tamanhoPonto ?? 16);
    setCurrentImplantation(newImplantation);
    setCurrentLogoUrl(newImplantation.logoUrl || "/logo-uni.png");
    setSwitching(true);

    try {
      await fetchUnitData(newName);
      await fetchHistory(newName);

      // Fetch unit count for badge display
      const token = localStorage.getItem("token");
      const countResponse = await axios.get(
        `${apiUrl}/api/implantacoes/${encodeURIComponent(
          newName
        )}/unidades/count`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setUnidadesCount(countResponse.data.count || 0);
      setUnidadesConfigured(countResponse.data.configured || false);
    } catch (error) {
      console.error("❌ Erro ao trocar implantação:", error);
      setError("Falha ao carregar dados da nova implantação.");
    } finally {
      setSwitching(false);
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
    updatedUnidades[unitIndexToClear][12] = ""; // Coluna M - coord_x
    updatedUnidades[unitIndexToClear][13] = ""; // Coluna N - coord_y
    updatedUnidades[unitIndexToClear][18] = ""; // Coluna S - Simbolo (letra)
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
      const hasCoords = unidades[unitIndex][12] && unidades[unitIndex][13]; // Colunas M e N
      if (hasCoords) {
        handleClearCoords(unitIndex);
      }
      return;
    }
    setSelectedUnitIndex(unitIndex);
    const rawStatus = unidades[unitIndex][11] || "disponível"; // Coluna L - situacao
    const normalizedStatus = rawStatus
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (normalizedStatus === "disponivel") {
      setReservationModalState({ isOpen: true, mode: "select" });
    } else if (normalizedStatus === "reservada") {
      setIsCancelModalOpen(true);
    } else if (normalizedStatus === "bloqueada") {
      setBlockModalState({ isOpen: true, isBlocking: false, apiError: "" });
    }
  };

  const handleSpontaneousUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setReservationModalState({ isOpen: true, mode: "manual" });
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    const unitData = unidades[unitIndex];
    const status = unitData[11]?.toUpperCase(); // Coluna L - situacao
    const isBlocked = status === "BLOQUEADA";
    setBlockModalState({ isOpen: true, isBlocking: !isBlocked, apiError: "" });
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
      updatedUnidades[selectedUnitIndex][11] = newStatus; // Coluna L - situacao
      setUnidades(updatedUnidades);

      handleCloseModals();
      await fetchHistory(selectedImplantationName);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error ||
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

  // Handlers para seleção em cadeia
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedUnits(new Set()); // Limpa seleção ao sair do modo
    }
  };

  const toggleUnitSelection = (unitIndex: number) => {
    setSelectedUnits((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(unitIndex)) {
        newSet.delete(unitIndex);
      } else {
        newSet.add(unitIndex);
      }
      return newSet;
    });
  };

  const handleBulkBlock = async () => {
    if (selectedUnits.size === 0) {
      alert("Nenhuma unidade selecionada.");
      return;
    }

    const confirmMsg = `Tem certeza que deseja bloquear ${selectedUnits.size} unidade(s)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const promises = Array.from(selectedUnits).map(async (unitIndex) => {
        const sheetRowIndex = unitIndex + 2;
        return axios.post(`${apiUrl}/api/toggle-block-unit`, {
          rowIndex: sheetRowIndex,
          implantacao: selectedImplantationName,
          newStatus: "BLOQUEADA",
          hideAvailable: hideAvailable,
        });
      });

      await Promise.all(promises);

      // Atualiza o estado local
      const updatedUnidades = [...unidades];
      selectedUnits.forEach((unitIndex) => {
        updatedUnidades[unitIndex][11] = "BLOQUEADA"; // Coluna L - situacao
      });
      setUnidades(updatedUnidades);

      // Limpa seleção e sai do modo de seleção
      setSelectedUnits(new Set());
      setIsSelectionMode(false);

      await fetchHistory(selectedImplantationName);
      alert(`${selectedUnits.size} unidade(s) bloqueada(s) com sucesso!`);
    } catch (error) {
      console.error("Erro ao bloquear unidades em cadeia:", error);
      alert("Falha ao bloquear algumas unidades. Verifique o console.");
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error ||
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

    const unitName = unidades[selectedUnitIndex][2]; // Coluna C - nome_unidade
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
    } catch (error: unknown) {
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
    const clientNameToRelease = unidadeAlvo[7]; // Coluna H - cliente
    const idPreCadastro = unidadeAlvo[6]; // Coluna G - id_pre_cadastro
    const brokerNameToLog = unidadeAlvo[9] || "N/A"; // Coluna J - corretor

    setUnidades(
      unidades.map((unidade, index) => {
        if (index === selectedUnitIndex) {
          const newUnit = [...unidade];
          newUnit[6] = ""; // Coluna G - id_pre_cadastro
          newUnit[7] = ""; // Coluna H - cliente
          newUnit[8] = ""; // Coluna I - documento
          newUnit[9] = ""; // Coluna J - corretor
          newUnit[10] = ""; // Coluna K - imobiliaria
          newUnit[11] = "DISPONÍVEL"; // Coluna L - situacao
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
    updatedUnidades[unitToMapIndex][12] = coordX; // Coluna M - coord_x
    updatedUnidades[unitToMapIndex][13] = coordY; // Coluna N - coord_y
    updatedUnidades[unitToMapIndex][18] = unitLetter; // Coluna S - Simbolo (letra)
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
      updatedUnidades[pixModalState.unitIndex][14] = identificador; // Coluna O - IDENTIFICADOR
      updatedUnidades[pixModalState.unitIndex][15] = payloadEmv; // Coluna P - Payload
      updatedUnidades[pixModalState.unitIndex][16] = String(valor); // Coluna Q - Valor
      updatedUnidades[pixModalState.unitIndex][17] = statusPagamento; // Coluna R - Pagamento
      // REMOVIDO: Coluna R não é mais usada para timestamp
      setUnidades(updatedUnidades);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      throw new Error(
        err.response?.data?.error || "Erro ao salvar dados do PIX."
      );
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
      alert("Erro: Dados da unidade ou do empreendimento não encontrados.");
      return;
    }

    const unitFullName = `${unitData[2]}`; // Coluna C - nome_unidade
    const brokerName = unitData[9] || "N/A"; // Coluna J - corretor

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
        clientName: unitData[7] || "N/D", // Coluna H - cliente
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

    const paymentDate = today.toLocaleDateString("pt-BR");

    const termoData: TermoData = {
      clienteNome: unitData[7] || "N/D", // Coluna H - cliente
      clienteCpf: formatCPF(unitData[8]) || "N/D", // Coluna I - documento
      unidadeDesc: `${unitData[2]}`, // Coluna C - nome_unidade
      tipologia: unitData[4] || "N/D", // Coluna E - tipologia
      areaPrivativa: unitData[3] || "N/D", // Coluna D - area_privativa
      etapa: unitData[0] || "N/D", // Coluna A - etapa
      empreendimentoNome: impData.nome,
      empreendimentoEndereco: impData.endereco || "Endereço não informado",
      corretorNome: unitData[9] || "N/D", // Coluna J - corretor
      dataAtual: formattedDate,
      logoEmpreendimentoUrl: currentLogoUrl,
      dataHoraImpressao: dataHoraImpressao,
      hasRegistro: config.hasRegistro,
      paymentType: config.paymentType,
      paymentValue: config.paymentValue,
      paymentDate: paymentDate,
      saleType: config.saleType,
      planType: config.planType,
    };

    setTermoParaImprimir(termoData);
    setPendingPrintUnitIndex(null);
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

  // Trigger fade-in animation after user is authenticated
  if (user && !showContent) {
    setTimeout(() => setShowContent(true), 50);
  }

  return (
    <HelmetProvider>
      <Helmet>
        <title>Implantação Digital - VCA CONSTRUTORA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Helmet>

      <div className={`page-wrapper ${isMappingMode ? "sidebar-visible" : ""}`}>
        {/* Header - fixo apenas quando não estiver no mapa visual */}
        <Header title="Lançamento - Espelho Digital" isFixed={view !== "map"} />

        {/* Menu Hamburger flutuante */}
        <HamburgerMenu
          onNewImplantationClick={handleOpenNewImplantation}
          onMapViewClick={() => setView("map")}
          onListViewClick={() => {
            setView("list");
            setIsMappingMode(false);
          }}
          onHistoryClick={() => {
            setView("history");
            setIsMappingMode(false);
          }}
          onLogout={handleLogout}
        />

        {isMappingMode && (
          <MappingSidebar
            unidades={unidades}
            onSelectUnit={setUnitToMapIndex}
            selectedUnitIndex={unitToMapIndex}
            dotSize={dotSize}
            onDotSizeChange={setDotSize}
            onSaveDotSize={handleSaveDotSize}
            unitLetter={unitLetter}
            onLetterChange={setUnitLetter}
          />
        )}
        <div className={`app-container ${view === "list" ? "list-view" : ""}`}>
          {switching && (
            <div className="switching-overlay">
              <div className="loading-spinner"></div>
            </div>
          )}
          <div>
            <main className="main-content">
              {/* Nova organização dos controles */}
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    view === "list" || view === "history"
                      ? "flex-start"
                      : "space-between",
                  alignItems: "flex-start",
                  marginBottom: "20px",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
                className="main-controls-container"
              >
                {/* Esquerda: User greeting e Switcher quando em list/history, ou Modo Mapeamento quando em map */}
                <div
                  style={{
                    display: "flex",
                    flexDirection:
                      view === "list" || view === "history" ? "row" : "column",
                    gap: "10px",
                    alignItems:
                      view === "list" || view === "history"
                        ? "center"
                        : "flex-start",
                  }}
                >
                  {view === "map" && (
                    <>
                      <button
                        className={`toggle-mapping-button ${
                          isMappingMode ? "active" : ""
                        }`}
                        onClick={() => setIsMappingMode(!isMappingMode)}
                      >
                        Modo Mapeamento
                      </button>
                      <div
                        className="filter-checkbox-wrapper"
                        style={{ marginLeft: 0 }}
                      >
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
                    </>
                  )}
                  {(view === "list" || view === "history") && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "20px",
                        width: "100%",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Esquerda: Saudação e Seletor */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "20px",
                          flexWrap: "wrap",
                        }}
                      >
                        {userDisplayName && (
                          <div className="user-greeting">
                            Olá, <strong>{userDisplayName}</strong>
                          </div>
                        )}
                        <ImplantationSwitcher
                          implantacoes={implantacoes}
                          selected={selectedImplantationName}
                          onChange={handleImplantationChange}
                        />
                      </div>

                      {/* Direita: Indicadores */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        {/* Indicadores de unidades e clientes na list/history view */}
                        {unidadesConfigured && (
                          <div
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "#2a2a2a",
                              color: "#ffffff",
                              borderRadius: "4px",
                              fontSize: "11px",
                              textAlign: "center",
                              border: "1px solid #6ad700",
                              lineHeight: "1.3",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#6ad700" }}
                            >
                              Unidades configuradas
                            </div>
                            <div>
                              Quantidade: <strong>{unidadesCount}</strong>{" "}
                              Unidades
                            </div>
                          </div>
                        )}
                        {!unidadesConfigured && selectedImplantationName && (
                          <div
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "#2a2a2a",
                              color: "#ffffff",
                              borderRadius: "4px",
                              fontSize: "11px",
                              textAlign: "center",
                              border: "1px solid #ffa500",
                              lineHeight: "1.3",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#ffa500" }}
                            >
                              ⚠️ Sem unidades
                            </div>
                          </div>
                        )}
                        {clientesConfigured && selectedImplantationName && (
                          <div
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "#2a2a2a",
                              color: "#ffffff",
                              borderRadius: "4px",
                              fontSize: "11px",
                              textAlign: "center",
                              border: "1px solid #6ad700",
                              lineHeight: "1.3",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#6ad700" }}
                            >
                              Clientes Aptos
                            </div>
                            <div>
                              Quantidade: <strong>{clientesCount}</strong>{" "}
                              Clientes
                            </div>
                          </div>
                        )}
                        {!clientesConfigured && selectedImplantationName && (
                          <div
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "#2a2a2a",
                              color: "#ffffff",
                              borderRadius: "4px",
                              fontSize: "11px",
                              textAlign: "center",
                              border: "1px solid #ffa500",
                              lineHeight: "1.3",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#ffa500" }}
                            >
                              ⚠️ Sem clientes
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Direita: Seletor de empreendimento e configurações (apenas em map view) */}
                {view === "map" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                    }}
                  >
                    {view === "map" && userDisplayName && (
                      <div className="user-greeting">
                        Olá, <strong>{userDisplayName}</strong>
                      </div>
                    )}
                    {view === "map" && (
                      <ImplantationSwitcher
                        implantacoes={implantacoes}
                        selected={selectedImplantationName}
                        onChange={handleImplantationChange}
                      />
                    )}
                    {unidadesConfigured && (
                      <div
                        style={{
                          padding: "8px 12px",
                          backgroundColor: "#2a2a2a",
                          color: "#ffffff",
                          borderRadius: "4px",
                          fontSize: "12px",
                          textAlign: "center",
                          border: "1px solid #6ad700",
                          lineHeight: "1.4",
                        }}
                      >
                        <div style={{ fontWeight: "bold", color: "#6ad700" }}>
                          Unidades configuradas
                        </div>
                        <div>
                          Quantidade: <strong>{unidadesCount}</strong> Unidades
                        </div>
                      </div>
                    )}
                    {!unidadesConfigured && selectedImplantationName && (
                      <div
                        style={{
                          padding: "8px 12px",
                          backgroundColor: "#2a2a2a",
                          color: "#ffffff",
                          borderRadius: "4px",
                          fontSize: "12px",
                          textAlign: "center",
                          border: "1px solid #ffa500",
                          lineHeight: "1.4",
                        }}
                      >
                        <div style={{ fontWeight: "bold", color: "#ffa500" }}>
                          ⚠️ Sem unidades
                        </div>
                        <div style={{ fontSize: "11px" }}>
                          Importe as unidades via configurações
                        </div>
                      </div>
                    )}
                    {clientesConfigured && selectedImplantationName && (
                      <div
                        style={{
                          padding: "8px 12px",
                          backgroundColor: "#2a2a2a",
                          color: "#ffffff",
                          borderRadius: "4px",
                          fontSize: "12px",
                          textAlign: "center",
                          border: "1px solid #6ad700",
                          lineHeight: "1.4",
                        }}
                      >
                        <div style={{ fontWeight: "bold", color: "#6ad700" }}>
                          Clientes importados
                        </div>
                        <div>
                          Quantidade: <strong>{clientesCount}</strong> Clientes
                        </div>
                      </div>
                    )}
                    {!clientesConfigured && selectedImplantationName && (
                      <div
                        style={{
                          padding: "8px 12px",
                          backgroundColor: "#2a2a2a",
                          color: "#ffffff",
                          borderRadius: "4px",
                          fontSize: "12px",
                          textAlign: "center",
                          border: "1px solid #ffa500",
                          lineHeight: "1.4",
                        }}
                      >
                        <div style={{ fontWeight: "bold", color: "#ffa500" }}>
                          ⚠️ Sem clientes
                        </div>
                        <div style={{ fontSize: "11px" }}>
                          Importe os clientes via configurações
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleOpenEditImplantation}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "transparent",
                        color: "#6ad700",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "18px",
                        transition: "all 0.3s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#2a2a2a";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                      title="Configurar empreendimento"
                    >
                      <Settings size={20} />
                    </button>
                  </div>
                )}
              </div>
              <div
                className={`mobile-menu-modal ${
                  isMobileMenuOpen ? "active" : ""
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div
                  className="mobile-menu-content"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mobile-menu-header">
                    <span className="mobile-menu-title">Menu</span>
                    <button
                      className="mobile-menu-close"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mobile-menu-items">
                    <button
                      className={`mobile-menu-item ${
                        view === "list" ? "active" : ""
                      }`}
                      onClick={() => {
                        setView("list");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Lista para Reserva
                    </button>
                    <button
                      className={`mobile-menu-item ${
                        view === "history" ? "active" : ""
                      }`}
                      onClick={() => {
                        setView("history");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Histórico Geral
                    </button>
                    <button
                      className="mobile-menu-item logout"
                      onClick={() => {
                        auth.signOut();
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sair
                    </button>
                  </div>
                </div>
              </div>
              <div className="top-controls"></div>
              <div className="view-content">
                {view === "map" && imageUrl && window.innerWidth > 768 && (
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
                    onPrintClick={handleOpenPrintConfig}
                    onChangeUnitClick={handleChangeUnitClick}
                    onPixClick={handlePixActionClick}
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
                  } catch (err) {
                    console.error("Erro ao salvar full_name:", err);
                    alert("Erro ao salvar nome. Tente novamente.");
                  }
                }}
              />
            </main>
          </div>
        </div>
        <div style={{ display: "none" }}>
          <TermoDeReserva ref={printComponentRef} data={termoParaImprimir} />
        </div>

        {/* Novos Modais */}
        <NewImplantationModal
          isOpen={isNewImplantationModalOpen}
          onClose={() => setIsNewImplantationModalOpen(false)}
          onSuccess={handleImplantationSuccess}
          apiUrl={apiUrl}
        />
        <EditImplantationModal
          isOpen={isEditImplantationModalOpen}
          onClose={() => setIsEditImplantationModalOpen(false)}
          onSuccess={handleImplantationSuccess}
          apiUrl={apiUrl}
          implantation={implantationToEdit}
        />
      </div>
    </HelmetProvider>
  );
}
