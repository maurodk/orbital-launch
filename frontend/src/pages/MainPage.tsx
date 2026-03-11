// src/pages/MainPage.tsx

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { useReactToPrint } from "react-to-print";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { FloorPlan } from "../../components/FloorPlan";
import { ReservationModal } from "../../components/ReservationModal";
import { PaymentModal, type PaymentData } from "../../components/PaymentModal";
import { ProcessingPaymentModal } from "../../components/ProcessingPaymentModal";
import { PaymentSuccessModal } from "../../components/PaymentSuccessModal";
import { ReservationList } from "../../components/ReservationList";
import { CancelModal } from "../../components/CancelModal";
import { BlockModal } from "../../components/BlockModal";
import { MappingSidebar } from "../../components/MappingSidebar";
import { ImplantationSwitcher } from "../../components/ImplantationSwitcher";
import { Header } from "../../components/Header";
import { HamburgerMenu } from "../../components/HamburgerMenu";
import { BlockMappingTool } from "../../components/BlockMappingTool";
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

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";

// SEMPRE usa AWS (backend está na EC2)
const apiUrl = import.meta.env.DEV ? "http://localhost:3000" : AWS_API_URL;

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
  cidade?: string;
  estado?: string;
  planosConfig?: { habilitado: boolean; planos: string[] } | null;
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

// Função para extrair o nome do cliente após o "-", removendo espaços extras
const extrairNomeCliente = (nome: string): string => {
  if (!nome) return "";
  
  // Se contiver "-", pega a parte após o "-"
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

interface BlockMapping {
  id?: string;
  nome_bloco: string;
  x: number;
  y: number;
  width: number;
  height: number;
  implantacao_ref?: string;
}

interface BlockStats {
  total: number;
  reservadas: number;
  bloqueadas: number;
  disponiveis: number;
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
  const navigate = useNavigate();

  // Auto-redirect para layout mobile em smartphones e tablets
  useEffect(() => {
    const isMobileDevice =
      window.innerWidth <= 1024 || navigator.maxTouchPoints > 0;
    if (isMobileDevice) {
      navigate("/mobile", { replace: true });
    }
  }, [navigate]);

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
  const [activeLayer, setActiveLayer] = useState<"primary" | "additional">(
    "primary"
  );
  const [dotSize, setDotSize] = useState<number>(16);
  const [hideAvailable, setHideAvailable] = useState<boolean>(false);
  const [unitLetter, setUnitLetter] = useState<string>("");
  const [reservationModalState, setReservationModalState] = useState({
    isOpen: false,
    mode: "select" as "select" | "manual",
  });
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string>("/logo-uni.png");
  
  // Proteção contra sobrescrita após mapeamento
  const recentlyMappedUnits = useRef<Set<number>>(new Set());
  
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
    // <-- NOVO
    isOpen: false,
    unitIndex: null as number | null,
  });
  const [paymentModalState, setPaymentModalState] = useState({
    isOpen: false,
    unitIndex: null as number | null,
  });
  // Estados para modais de processamento e sucesso do pagamento
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [processingPaymentState, setProcessingPaymentState] = useState({
    isProcessing: false,
    currentStep: '',
    progress: 0,
    error: null as string | null,
    success: false,
  });
  const [isPaymentSuccessModalOpen, setIsPaymentSuccessModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Disponível" | "Reservada" | "Bloqueada"
  >("all");
  const [unidadesCount, setUnidadesCount] = useState<number>(0);
  const [unidadesConfigured, setUnidadesConfigured] = useState<boolean>(false);
  const [clientesCount, setClientesCount] = useState<number>(0);
  const [clientesConfigured, setClientesConfigured] = useState<boolean>(false);
  const [userDisplayName, setUserDisplayName] = useState<string>("");

  // Estados para seleção em cadeia
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  // Estados para mapeamento de blocos vendidos
  const [isBlockMappingMode, setIsBlockMappingMode] = useState(false);
  const [blockMappings, setBlockMappings] = useState<BlockMapping[]>([]);
  const [selectedBlockToMap, setSelectedBlockToMap] = useState<string>("");

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

  // Extrair implantacao do contexto atual
  const implantacao = selectedImplantationName;

  const reservationManager = useReservationManager(apiUrl);
  
  // Hook para refresh automático do token (mantém sessão ativa)
  useTokenRefresh();

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

  const handleNavigateToPayments = () => {
    navigate("/pagamentos");
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
      // Buscar o ID da implantação pelo nome
      const { data: implantacaoData, error: implantacaoError } = await supabase
        .from("implantacoes")
        .select("id")
        .eq("nome", implantacaoName)
        .single();

      if (implantacaoError || !implantacaoData) {
        console.error(`Erro ao buscar implantação ${implantacaoName}:`, implantacaoError);
        setHistory([]);
        return;
      }

      // Buscar histórico do Supabase (limitado aos 100 mais recentes para performance)
      const { data: historicoData, error: historicoError } = await supabase
        .from("historico")
        .select("*")
        .eq("implantacao_id", implantacaoData.id)
        .order("timestamp_iso", { ascending: false })
        .limit(100);

      if (historicoError) {
        console.error(`Erro ao carregar histórico para ${implantacaoName}:`, historicoError);
        setHistory([]);
        return;
      }

      // Transformar os dados do Supabase para o formato esperado pelos componentes
      // Formato esperado: [id, data_formatada, unidade_nome, acao, cliente, corretor, usuario, reserva_url]
      const formattedHistory = (historicoData || []).map((item) => [
        String(item.id), // Índice 0: ID
        item.data_formatada || new Date(item.timestamp_iso).toLocaleString("pt-BR"), // Índice 1: Data formatada
        item.unidade_nome || "", // Índice 2: Unidade
        item.acao || "", // Índice 3: Ação
        item.cliente || "", // Índice 4: Cliente
        item.corretor || "", // Índice 5: Corretor
        item.usuario || "", // Índice 6: Usuário
        item.reserva_url || "", // Índice 7: URL da reserva
      ]);

      setHistory(formattedHistory);
    } catch (err) {
      console.error(`Erro ao carregar histórico para ${implantacaoName}:`, err);
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
    // A verificação `c && c[1]` garante que apenas clientes com nome sejam incluídos.
    // Índice [0] = id_pre_cadastro (pode ser null), [1] = nome (obrigatório)
    
    const filtered = clientes.filter((c) => c && c[1] && c[1].trim() !== "");
    
    return filtered;
  }, [clientes]);

  // NOVO: Memo para unidades disponíveis para o modal de troca
  const availableUnitsForChange = useMemo(() => {
    return unidades.reduce<{ unit: string[]; originalIndex: number }[]>(
      (acc, unit, index) => {
        const normalizedStatus = (unit[11] || "Disponível")
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

        const unitName = normalize(data[2]);           // C - nome_unidade
        const blockName = normalize(data[3]);          // D - bloco
        const tipologia = normalize(data[4]);          // E - tipologia
        const clientName = normalize(data[7]);         // H - cliente
        const brokerName = normalize(data[9]);         // J - corretor
        const term = normalize(searchTerm);

        // Normaliza statusFilter para comparação
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

  // Array filtrado apenas com os dados das unidades para o FloorPlan
  const filteredUnidadesForMap: string[][] = useMemo(() => {
    return filteredUnidades.map(([data]) => data);
  }, [filteredUnidades]);

  // Mapa de índices filtrados para índices originais
  const filteredIndexMap: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    filteredUnidades.forEach(([, originalIndex], filteredIndex) => {
      map[filteredIndex] = originalIndex;
    });
    return map;
  }, [filteredUnidades]);

  // Calcular estatísticas de cada bloco
  const blockStats = useMemo<Record<string, BlockStats>>(() => {
    const stats: Record<string, BlockStats> = {};
    
    unidades.forEach((unidade) => {
      const bloco = unidade[3]; // Coluna D - bloco
      const etapa = unidade[1]; // Coluna B - etapa
      const situacao = (unidade[11] || "Disponível")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
      
      if (!bloco || bloco.trim() === "") return;
      
      // Concatenar bloco + etapa para criar chave única
      const blocoKey = etapa && etapa.trim() !== "" ? `${bloco} - ${etapa}` : bloco;
      
      if (!stats[blocoKey]) {
        stats[blocoKey] = { total: 0, reservadas: 0, bloqueadas: 0, disponiveis: 0 };
      }
      
      stats[blocoKey].total++;
      
      if (situacao === "reservada") {
        stats[blocoKey].reservadas++;
      } else if (situacao === "bloqueada") {
        stats[blocoKey].bloqueadas++;
      } else if (situacao === "disponivel") {
        stats[blocoKey].disponiveis++;
      }
    });
    
    return stats;
  }, [unidades]);

  // Lista de blocos disponíveis (concatenando bloco + etapa)
  const availableBlocks = useMemo(() => {
    const blocks = unidades
      .map(u => {
        const bloco = u[3]; // Coluna D - bloco
        const etapa = u[1]; // Coluna B - etapa
        if (!bloco || bloco.trim() === "") return null;
        return etapa && etapa.trim() !== "" ? `${bloco} - ${etapa}` : bloco;
      })
      .filter((b): b is string => b !== null);
    
    return [...new Set(blocks)].sort();
  }, [unidades]);

  const fetchUnitData = useCallback(async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
      // Buscar implantação por nome para obter o ID
      const { data: implantacaoData, error: implantacaoError } = await supabase
        .from('implantacoes')
        .select('id')
        .eq('nome', implantacaoName)
        .single();

      if (implantacaoError || !implantacaoData) {
        console.error('Erro ao buscar implantação:', implantacaoError);
        setError(`Implantação "${implantacaoName}" não encontrada.`);
        return;
      }

      const implantacaoId = implantacaoData.id;

      // Buscar unidades diretamente do Supabase
      const { data: unidadesSupabase, error: unidadesError } = await supabase
        .from('unidades')
        .select('*')
        .eq('implantacao_id', implantacaoId)
        .order('row_index', { ascending: true });

      if (unidadesError) {
        console.error('Erro ao buscar unidades:', unidadesError);
        setError(`Não foi possível carregar as unidades para "${implantacaoName}".`);
        return;
      }

      // Buscar clientes diretamente do Supabase
      const { data: clientesSupabase, error: clientesError } = await supabase
        .from('clientes')
        .select('*')
        .eq('implantacao_id', implantacaoId);

      if (clientesError) {
        console.error('Erro ao buscar clientes:', clientesError);
        // Não retorna erro aqui, apenas log, pois clientes não é crítico
      }

      // Converter unidades do formato Supabase para o formato array esperado pelo frontend
      // Mantém compatibilidade com estrutura de colunas do Google Sheets
      const unidadesData = (unidadesSupabase || []).map((u) => [
        u.row_index?.toString() || "",       // [0] A - row_index
        u.etapa || "",                       // [1] B - etapa
        u.nome_unidade || "",                // [2] C - nome_unidade
        u.bloco || "",                       // [3] D - bloco
        u.tipologia || "",                   // [4] E - tipologia
        u.area_privativa || "",              // [5] F - area_privativa
        u.id_pre_cadastro || "",             // [6] G - id_pre_cadastro
        u.cliente || "",                     // [7] H - cliente
        u.documento || "",                   // [8] I - documento
        u.corretor || "",                    // [9] J - corretor
        u.imobiliaria || "",                 // [10] K - imobiliaria
        u.situacao || "Disponível",          // [11] L - situacao
        u.coord_x?.toString() || "",         // [12] M - coord_x
        u.coord_y?.toString() || "",         // [13] N - coord_y
        "",                                  // [14] O - placeholder
        "",                                  // [15] P - placeholder
        u.implantacao_ref || "",             // [16] Q - implantacao_ref
        "",                                  // [17] R - placeholder
        u.simbolo || "",                     // [18] S - simbolo (letra)
        u.motivo || "",                      // [19] T - motivo
        "",                                  // [20] U - pagamento (placeholder)
      ]);

      // Converter clientes do formato Supabase para o formato array esperado
      const clientesData = (clientesSupabase || []).map((c) => [
        c.id || "",          // [0] ID
        c.nome || "",        // [1] Nome
        c.documento || "",   // [2] Documento (CPF/CNPJ)
        c.corretor || "",    // [3] Corretor
        c.telefone || "",    // [4] Telefone
      ]);

      setUnidades(unidadesData);
      setClientes(clientesData);
    } catch (err) {
      console.error(`Erro ao carregar dados para ${implantacaoName}`, err);
      setError(`Não foi possível carregar os dados para "${implantacaoName}".`);
    } finally {
      setSwitching(false);
    }
  }, []);

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
          } catch {
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
              localStorage.removeItem("selectedImplantacao");
            }
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

    const unsubscribe = auth.onAuthStateChange((callbackUser) => {
      if (callbackUser) {
        // Atualiza o usuário imediatamente a partir do evento de auth
        // para garantir que a tela de Login seja substituída pela MainPage
        setUser(callbackUser);
        if (!axios.defaults.headers.common["Authorization"]) {
          // Se o usuário acabou de fazer login, carrega os dados
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

  // Carregar mapeamentos de blocos do Supabase
  useEffect(() => {
    if (!currentImplantation?.id) return;
    
    const loadBlockMappings = async () => {
      try {
        const { data, error } = await supabase
          .from("blocos_mapping")
          .select("*")
          .eq("implantacao_id", currentImplantation.id);
        
        if (error) {
          console.error("Erro ao carregar mapeamentos de blocos:", error);
          return;
        }
        
        setBlockMappings(data || []);
      } catch (error) {
        console.error("Erro ao carregar mapeamentos de blocos:", error);
      }
    };
    
    loadBlockMappings();
  }, [currentImplantation?.id]);

  // Helper para verificar se usuário está interagindo com uma unidade específica
  const isUserInteractingWithUnit = useCallback((unitIndex: number): boolean => {
    // Verifica se a unidade foi mapeada recentemente (nos últimos 3 segundos)
    if (recentlyMappedUnits.current.has(unitIndex)) {
      return true;
    }
    
    return (
      selectedUnitIndex === unitIndex ||
      pixModalState.unitIndex === unitIndex ||
      pixOptionsModalState.unitIndex === unitIndex ||
      pixHistoryModalState.unitIndex === unitIndex ||
      paymentModalState.unitIndex === unitIndex ||
      changeUnitModalState.unitIndex === unitIndex ||
      (reservationModalState.isOpen && selectedUnitIndex === unitIndex) ||
      (blockModalState.isOpen && selectedUnitIndex === unitIndex) ||
      unitToMapIndex === unitIndex
    );
  }, [
    selectedUnitIndex,
    pixModalState.unitIndex,
    pixOptionsModalState.unitIndex,
    pixHistoryModalState.unitIndex,
    paymentModalState.unitIndex,
    changeUnitModalState.unitIndex,
    reservationModalState.isOpen,
    blockModalState.isOpen,
    unitToMapIndex
  ]);

  // Monitor historico_pix para cancelar automaticamente reservas quando PIX expira
  useEffect(() => {
    if (!currentImplantation?.id || !selectedImplantationName) return;

    console.log('[PixExpiredMonitor] Iniciando monitoramento de PIX expirado para implantação:', selectedImplantationName);

    const pixChannel = supabase
      .channel(`pix-expired-monitor-${currentImplantation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'historico_pix',
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

            console.log('[PixExpiredMonitor] Mudança detectada no historico_pix:', newRecord);

            // Verifica se o status mudou para EXPIRADO
            if (newRecord.status_pagamento?.toUpperCase() === 'EXPIRADO') {
              console.log('[PixExpiredMonitor] PIX EXPIRADO detectado!', {
                cliente: newRecord.cliente,
                unidade: newRecord.unidade,
                identificador: newRecord.identificador,
              });

              // Verifica se existe algum PIX PAGO ou PENDENTE para este cliente + unidade
              const { data: pixAtivos } = await supabase
                .from('historico_pix')
                .select('id, status_pagamento')
                .eq('cliente', newRecord.cliente)
                .eq('unidade', newRecord.unidade)
                .eq('implantacao_nome', newRecord.implantacao_nome)
                .in('status_pagamento', ['PAGO', 'PENDENTE'])
                .limit(1);

              if (pixAtivos && pixAtivos.length > 0) {
                console.log('[PixExpiredMonitor] Ignorado - cliente ainda tem PIX ativo (PAGO ou PENDENTE) nesta unidade.');
                return;
              }

              console.log('[PixExpiredMonitor] Nenhum PIX ativo restante. Liberando unidade...');

              // 1. Atualiza a tabela unidades direto no Supabase
              const { error: updateError } = await supabase
                .from('unidades')
                .update({
                  id_pre_cadastro: null,
                  cliente: null,
                  documento: null,
                  corretor: null,
                  imobiliaria: null,
                  situacao: 'Disponível',
                  updated_at: new Date().toISOString(),
                })
                .eq('implantacao_id', currentImplantation.id)
                .eq('nome_unidade', newRecord.unidade);

              if (updateError) {
                console.error('[PixExpiredMonitor] Erro ao liberar unidade no Supabase:', updateError);
              } else {
                console.log('[PixExpiredMonitor] Unidade liberada no Supabase:', newRecord.unidade);
              }

              // 2. Atualiza estado local + chama backend para Sheets/histórico/SSE
              setUnidades((currentUnidades) => {
                const unitIndex = currentUnidades.findIndex(
                  (u) => u[2] === newRecord.unidade
                );

                if (unitIndex === -1) {
                  console.warn('[PixExpiredMonitor] Unidade não encontrada no estado local:', newRecord.unidade);
                  return currentUnidades;
                }

                const unidadeAlvo = currentUnidades[unitIndex];
                const clientNameToRelease = unidadeAlvo[7];
                const idPreCadastro = unidadeAlvo[6];
                const brokerNameToLog = unidadeAlvo[9] || "N/A";

                // Chama o backend para cancelar no Sheets + histórico + SSE
                (async () => {
                  try {
                    const sheetRowIndex = unitIndex + 2;
                    await axios.post(
                      `${apiUrl}/api/cancel-reservation`,
                      {
                        unitRowIndex: sheetRowIndex,
                        clientName: clientNameToRelease,
                        implantacao: selectedImplantationName,
                        idPreCadastro: idPreCadastro,
                        brokerName: brokerNameToLog,
                        reason: 'PIX_EXPIRADO',
                      },
                      {
                        headers: {
                          Authorization: `Bearer ${localStorage.getItem("token")}`,
                        },
                      }
                    );
                    console.log('[PixExpiredMonitor] Backend notificado (Sheets/histórico/SSE)');
                    await fetchHistory(selectedImplantationName);
                  } catch (err) {
                    console.error('[PixExpiredMonitor] Erro ao notificar backend:', err);
                  }
                })();

                // Libera o cliente para nova reserva
                if (clientNameToRelease) {
                  setClientes((currentClientes) =>
                    currentClientes.map((c) =>
                      c[1] === clientNameToRelease
                        ? [...c.slice(0, 5), "PODE RESERVAR"]
                        : c
                    )
                  );
                }

                return currentUnidades.map((unidade, index) => {
                  if (index === unitIndex) {
                    const newUnit = [...unidade];
                    newUnit[6] = "";  // id_pre_cadastro
                    newUnit[7] = "";  // cliente
                    newUnit[8] = "";  // documento
                    newUnit[9] = "";  // corretor
                    newUnit[10] = ""; // imobiliaria
                    newUnit[11] = "Disponível"; // situacao
                    return newUnit;
                  }
                  return unidade;
                });
              });
            }
          } catch (error) {
            console.error('[PixExpiredMonitor] Erro ao processar PIX expirado:', error);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[PixExpiredMonitor] Removendo canal de monitoramento');
      supabase.removeChannel(pixChannel).catch((e) =>
        console.error('[PixExpiredMonitor] Erro ao remover canal:', e)
      );
    };
  }, [currentImplantation?.id, selectedImplantationName]);

  useEffect(() => {
    const sigla =
      currentImplantation?.sigla || gerarSigla(selectedImplantationName);
    if (!sigla) {
      return;
    }

    // Setup Supabase Realtime subscription for immediate updates
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (currentImplantation?.id) {
      realtimeChannel = supabase
        .channel(`mainpage-unidades-${currentImplantation.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'unidades',
            filter: `implantacao_id=eq.${currentImplantation.id}`,
          },
          async (payload) => {
            console.log('Realtime unidades change:', payload);
            
            // Verificar se há alguma unidade sendo editada
            const hasActiveInteraction = unidades.some((_, idx) => isUserInteractingWithUnit(idx));
            
            if (hasActiveInteraction) {
              console.log('[Realtime] Update pausado - usuário interagindo com unidade');
              return;
            }
            
            // Verifica se a mudança é de outra camada para evitar refresh desnecessário
            if (payload.new && typeof payload.new === 'object' && 'implantacao_ref' in payload.new) {
              const changedRef = (payload.new as Record<string, unknown>).implantacao_ref || '';
              const currentLayerRef = activeLayer === 'additional' 
                ? `${selectedImplantationName}+adicional` 
                : selectedImplantationName;
              
              // Se a mudança é de outra camada, ignora para não atrapalhar mapeamento simultâneo
              if (changedRef !== currentLayerRef && changedRef !== '' && currentLayerRef !== '') {
                console.log('[Realtime] Update ignorado - mudança em outra camada');
                return;
              }
            }
            
            // Refresh unit data when any change occurs
            await fetchUnitData(selectedImplantationName).catch((e) =>
              console.error('Erro ao atualizar unidades via Realtime:', e)
            );
          }
        )
        .subscribe();
    }

    // Intelligent SSE connection with backoff, network detection and polling-fallback.
    let es: EventSource | null = null;
    let reconnectAttempts = 0;
    let consecutivePollingFailures = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const MAX_POLLING_FAILURES = 3;
    let stopped = false;

    const createEventSource = () => {
      if (es) {
        try {
          es.close();
        } catch {
          void 0;
        }
      }

      // Attach token to EventSource as query param (EventSource cannot set headers)
      const token = localStorage.getItem("token");
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
      es = new EventSource(
        `${apiUrl}/api/events?implantacao=${encodeURIComponent(
          selectedImplantationName
        )}${tokenParam}`
      );

      // Reset on successful open
      es.onopen = () => {
        reconnectAttempts = 0;
        consecutivePollingFailures = 0;
      };

      // Error handler: try reconnection with exponential backoff, and use polling fallback
      es.onerror = async () => {
        // Silenciado: SSE erro/fechamento é normal em timeout/reconexão (ERR_HTTP2_PROTOCOL_ERROR)

        // If offline, wait for navigator to come back
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          console.warn("Cliente offline, aguardando reconexão de rede...");
          return;
        }

        reconnectAttempts++;

        // Try polling fallback immediately to validate data layer
        try {
          // Use low-level axios checks so we can inspect HTTP status codes
          const token = localStorage.getItem("token");
          const headers = token ? { Authorization: `Bearer ${token}` } : {};

          const unitsResp = await axios.get(
            `${apiUrl}/api/data?implantacao=${encodeURIComponent(
              selectedImplantationName
            )}`,
            { headers }
          );
          const historyResp = await axios.get(
            `${apiUrl}/api/history/${encodeURIComponent(
              selectedImplantationName
            )}`,
            { headers }
          );

          // If either returned 401, treat it as auth issue (do not increment failure counter)
          if (unitsResp.status === 401 || historyResp.status === 401) {
            console.warn(
              "SSE polling-fallback: auth issue (401). Skipping reload counter increment."
            );
          } else {
            // successful polling -> reset failure counter
            consecutivePollingFailures = 0;
          }
        } catch (pollErr) {
          // If axios threw and there's a response, check status using axios.isAxiosError
          if (axios.isAxiosError(pollErr) && pollErr.response?.status === 401) {
            console.warn(
              "SSE polling-fallback: auth issue (401). Skipping reload counter increment."
            );
          } else {
            console.error("Polling-fallback falhou:", pollErr);
            consecutivePollingFailures++;
          }
        }

        if (
          reconnectAttempts >= MAX_RECONNECT_ATTEMPTS &&
          consecutivePollingFailures >= MAX_POLLING_FAILURES
        ) {
          console.error(
            "SSE instável e polling-fallback falhando — acionando hard refresh"
          );
          // Controlled hard refresh: preserve sessionStorage if possible
          try {
            window.location.reload();
          } catch (reloadErr) {
            console.error("Falha ao recarregar página:", reloadErr);
          }
          return;
        }

        // schedule reconnect with exponential backoff (cap 30s)
        const delay = Math.min(
          2000 * Math.pow(2, reconnectAttempts - 1),
          30000
        );
        setTimeout(() => {
          if (!stopped) createEventSource();
        }, delay);
      };

      const handleUnitUpdate = async (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          const { unitData, rowIndex, pagamentos_status, unitName } = eventData;

          const normalize = (s: unknown) =>
            String(s || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();

          if (unitData && Array.isArray(unitData) && typeof rowIndex === "number") {
            const idx = rowIndex - 2;
            
            // SKIP: Não atualizar se usuário está interagindo com esta unidade
            if (isUserInteractingWithUnit(idx)) {
              console.log(`[SSE] Update pausado - usuário editando unidade ${idx}`);
              return;
            }
            
            setUnidades((currentUnidades) => {
              if (idx < 0 || idx >= currentUnidades.length) return currentUnidades;
              const copy = currentUnidades.slice();
              const existing = Array.isArray(copy[idx]) ? copy[idx].slice() : [];

              // Merge incoming unitData into existing row: only overwrite when payload provides a non-empty value.
              const maxLen = Math.max(existing.length, unitData.length);
              const merged = new Array(maxLen);
              for (let i = 0; i < maxLen; i++) {
                const incoming = unitData[i];
                // Proteção extra: nunca sobrescrever dados estruturais importantes com vazios
                const isStructuralField = i <= 5 || i === 11; // índices 0-5 (row_index, etapa, nome, bloco, tipologia, area) e 11 (situacao)
                if (typeof incoming !== "undefined" && incoming !== null && incoming !== "" && (!isStructuralField || String(incoming).trim() !== "")) {
                  merged[i] = incoming;
                } else {
                  merged[i] = existing[i] || "";
                }
              }

              if (typeof pagamentos_status !== "undefined") merged[20] = pagamentos_status;
              
              // COMPARAÇÃO: Evitar re-render se dados são idênticos
              if (JSON.stringify(existing) === JSON.stringify(merged)) {
                console.log(`[SSE] Sem mudanças na unidade ${idx} - skip re-render`);
                return currentUnidades;
              }
              
              copy[idx] = merged;
              return copy;
            });
            return;
          }

          if (typeof pagamentos_status !== "undefined") {
            setUnidades((currentUnidades) => {
              const copy = currentUnidades.slice();
              if (typeof rowIndex === "number") {
                const idx = rowIndex - 2;
                
                // SKIP: Não atualizar se usuário está interagindo com esta unidade
                if (isUserInteractingWithUnit(idx)) {
                  console.log(`[SSE] Update de pagamento pausado - usuário editando unidade ${idx}`);
                  return currentUnidades;
                }
                
                if (idx >= 0 && idx < copy.length) {
                  const row = Array.isArray(copy[idx]) ? copy[idx].slice() : copy[idx];
                  
                  // COMPARAÇÃO: Evitar re-render se status não mudou
                  if (row[20] === pagamentos_status) {
                    return currentUnidades;
                  }
                  
                  row[20] = pagamentos_status;
                  copy[idx] = row;
                }
                return copy;
              }

              if (unitName) {
                const target = normalize(unitName);
                for (let i = 0; i < copy.length; i++) {
                  const name = normalize(copy[i][2]);
                  if (name === target) {
                    // SKIP: Não atualizar se usuário está interagindo com esta unidade
                    if (isUserInteractingWithUnit(i)) {
                      console.log(`[SSE] Update de pagamento pausado - usuário editando unidade ${i}`);
                      return currentUnidades;
                    }
                    
                    const row = Array.isArray(copy[i]) ? copy[i].slice() : copy[i];
                    
                    // COMPARAÇÃO: Evitar re-render se status não mudou
                    if (row[20] === pagamentos_status) {
                      return currentUnidades;
                    }
                    
                    row[20] = pagamentos_status;
                    copy[i] = row;
                    break;
                  }
                }
                return copy;
              }

              return currentUnidades;
            });
            return;
          }
        } catch (e) {
          console.error("Erro ao processar evento SSE:", e);
        }
      };

      const handleHistoryUpdate = (event?: MessageEvent) => {
        try {
          if (event && event.data) {
            const parsed = JSON.parse(event.data || "{}");
            
            console.log("[SSE historyUpdated] Payload recebido:", parsed);
            
            // Se o SSE enviar um objeto do Supabase diretamente
            if (parsed && parsed.historico) {
              const item = parsed.historico;
              const newRow = [
                String(item.id),
                item.data_formatada || new Date(item.timestamp_iso).toLocaleString("pt-BR"),
                item.unidade_nome || "",
                item.acao || "",
                item.cliente || "",
                item.corretor || "",
                item.usuario || "",
                item.reserva_url || "",
              ];
              
              console.log("[SSE historyUpdated] Adicionando row (formato objeto):", newRow);
              
              setHistory((current) => {
                // Evita duplicatas comparando o ID
                if (current.length > 0 && current[0] && current[0][0] === newRow[0]) {
                  return current;
                }
                return [newRow, ...current];
              });
              return;
            }
            
            // Formato antigo (array) - mantido para compatibilidade
            if (parsed && parsed.row && Array.isArray(parsed.row)) {
              const newRow = parsed.row;
              
              console.log("[SSE historyUpdated] Adicionando row (formato array):", newRow);
              
              setHistory((current) => {
                if (current.length > 0 && current[0] && current[0][0] === newRow[0]) {
                  return current;
                }
                return [newRow, ...current];
              });
              return;
            }
          }
        } catch (e) {
          console.error("Erro ao processar payload SSE historyUpdated:", e);
        }

        // Fallback: buscar histórico completo se SSE não incluiu os dados
        console.log("[SSE historyUpdated] Usando fallback - buscando histórico completo");
        fetchHistory(selectedImplantationName).catch((e) =>
          console.error("Erro ao recarregar histórico via SSE:", e)
        );
      };

      const handleUnitsImported = async () => {
        await fetchUnitData(selectedImplantationName).catch((e) =>
          console.error("Erro ao recarregar unidades via SSE:", e)
        );
        try {
          const token = localStorage.getItem("token");
          const countResponse = await axios.get(
            `${apiUrl}/api/implantacoes/${encodeURIComponent(
              selectedImplantationName
            )}/unidades/count`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setUnidadesCount(countResponse.data.count || 0);
          setUnidadesConfigured(countResponse.data.configured || false);
        } catch {
          void 0;
        }
      };

      const handleClientsImported = async () => {
        if (currentImplantation?.id) {
          try {
            const { count: clientesCount, error: clientesError } =
              await supabase
                .from("clientes")
                .select("*", { count: "exact", head: true })
                .eq("implantacao_id", currentImplantation.id);

            if (clientesError) throw clientesError;

            setClientesCount(clientesCount || 0);
            setClientesConfigured((clientesCount || 0) > 0);
          } catch (error) {
            console.error("Erro ao verificar clientes importados:", error);
          }
        }
      };

      es.addEventListener("unitUpdated", handleUnitUpdate);
      es.addEventListener("historyUpdated", handleHistoryUpdate);
      es.addEventListener("unitsImported", handleUnitsImported);
      es.addEventListener("clientsImported", handleClientsImported);
    };

    // start SSE
    createEventSource();

    // network oscillation detection
    const handleOnline = () => {
      reconnectAttempts = 0;
      createEventSource();
    };

    const handleOffline = () => {
      console.warn("Network offline detected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      stopped = true;
      try {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      } catch {
        void 0;
      }
      try {
        if (es) es.close();
      } catch {
        void 0;
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel).catch((e) =>
          console.error('Erro ao remover canal Realtime:', e)
        );
      }
    };
  }, [selectedImplantationName, currentImplantation, fetchUnitData, isUserInteractingWithUnit, unidades, activeLayer]);

  const handleImplantationChange = async (newName: string) => {
    const newImplantation = implantacoes.find((imp) => imp.nome === newName);
    if (!newImplantation || newName === selectedImplantationName) return;

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

  // Handler para salvar mapeamento de bloco desenhado
  const handleRectangleComplete = async (rect: { startX: number; startY: number; width: number; height: number }) => {
    if (!selectedBlockToMap || !currentImplantation) return;
    
    const currentLayerRef = activeLayer === "additional"
      ? `${selectedImplantationName}+adicional`
      : selectedImplantationName;

    try {
      const { error } = await supabase
        .from("blocos_mapping")
        .upsert({
          implantacao_id: currentImplantation.id || "",
          nome_bloco: selectedBlockToMap,
          x: rect.startX,
          y: rect.startY,
          width: rect.width,
          height: rect.height,
          implantacao_ref: currentLayerRef,
        })
        .select()
        .single();

      if (error) throw error;

      // Recarregar mapeamentos
      const { data } = await supabase
        .from("blocos_mapping")
        .select("*")
        .eq("implantacao_id", currentImplantation.id || "")
        .eq("implantacao_ref", currentLayerRef);
      
      setBlockMappings(data || []);
      alert(`Mapeamento do bloco "${selectedBlockToMap}" salvo com sucesso!`);
      setSelectedBlockToMap(""); // Limpa seleção após salvar
    } catch (error) {
      console.error("Erro ao salvar mapeamento:", error);
      alert("Erro ao salvar mapeamento. Tente novamente.");
    }
  };

  // Handler para salvar mapeamento de bloco colado via CTRL+V
  const handleBlockMappingPaste = async (blockName: string, rect: { startX: number; startY: number; width: number; height: number }) => {
    if (!blockName || !currentImplantation) return;

    const currentLayerRef = activeLayer === "additional"
      ? `${selectedImplantationName}+adicional`
      : selectedImplantationName;

    try {
      const { error } = await supabase
        .from("blocos_mapping")
        .upsert({
          implantacao_id: currentImplantation.id || "",
          nome_bloco: blockName,
          x: rect.startX,
          y: rect.startY,
          width: rect.width,
          height: rect.height,
          implantacao_ref: currentLayerRef,
        })
        .select()
        .single();

      if (error) throw error;

      // Recarregar mapeamentos
      const { data } = await supabase
        .from("blocos_mapping")
        .select("*")
        .eq("implantacao_id", currentImplantation.id || "")
        .eq("implantacao_ref", currentLayerRef);

      setBlockMappings(data || []);
      alert(`Mapeamento do bloco "${blockName}" salvo com sucesso!`);
    } catch (error) {
      console.error("Erro ao salvar mapeamento colado:", error);
      alert("Erro ao salvar mapeamento. Tente novamente.");
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

  const handleClearCoords = async (unitIndexToClear: number) => {
    const unit = unidades[unitIndexToClear];
    if (!unit) return;
    const isConfirmed = window.confirm(
      `Tem certeza que deseja remover o mapeamento da unidade "${unit[2]}"?`
    );
    if (!isConfirmed) return;
    const updatedUnidades = [...unidades];
    // Sempre limpa as colunas primárias M:N (coord_x / coord_y)
    updatedUnidades[unitIndexToClear][12] = ""; // Coluna M - coord_x
    updatedUnidades[unitIndexToClear][13] = ""; // Coluna N - coord_y
    // Remove symbol/letter when clearing
    updatedUnidades[unitIndexToClear][18] = ""; // Coluna S - Simbolo (letra)
    // Remove também o owner localmente para manter a UI consistente
    updatedUnidades[unitIndexToClear][16] = ""; // Coluna Q - implantacao_ref
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitIndexToClear + 2;
      // clear primary coords and implantacao_ref for the implantation context
      const implantacaoForClear = selectedImplantationName;
      const implantacaoRefForClear = activeLayer === "additional" ? `${selectedImplantationName}+adicional` : undefined;

      await axios.post(`${apiUrl}/api/clear-coords`, {
        rowIndex: sheetRowIndex,
        implantacao: implantacaoForClear,
        implantacaoRef: implantacaoRefForClear,
        clearAd: false,
      });
    } catch (err) {
      setError("Falha ao remover o mapeamento na planilha.");
      console.error(err);
    }
  };

  const handleUnitClick = (unitIndex: number) => {
    if (isMappingMode) {
      // Ao clicar no modo mapeamento, remove o mapeamento primário (M:N)
      const coordXIndex = 12; // M
      const coordYIndex = 13; // N
      const hasCoords =
        unidades[unitIndex] &&
        unidades[unitIndex][coordXIndex] &&
        unidades[unitIndex][coordXIndex].toString().trim() !== "" &&
        unidades[unitIndex][coordYIndex] &&
        unidades[unitIndex][coordYIndex].toString().trim() !== "";
      if (hasCoords) {
        handleClearCoords(unitIndex);
      }
      return;
    }
    setSelectedUnitIndex(unitIndex);
    const rawStatus = unidades[unitIndex][11] || "Disponível"; // Coluna L - situacao
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

  // Handler para FloorPlan que converte índice filtrado para índice original
  const handleFloorPlanUnitClick = (filteredIndex: number) => {
    const originalIndex = filteredIndexMap[filteredIndex];
    if (typeof originalIndex === 'number') {
      handleUnitClick(originalIndex);
    }
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    const unitData = unidades[unitIndex];
    const rawStatus = unitData[11] || "Disponível"; // Coluna L - situacao
    const normalizedStatus = rawStatus
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const isBlocked = normalizedStatus === "bloqueada";
    setBlockModalState({ isOpen: true, isBlocking: !isBlocked, apiError: "" });
  };

  const handlePixActionClick = async (unitIndex: number) => {
    const unit = unidades[unitIndex];
    if (!unit) return;

    const unidade = unit[2]; // Coluna C - Nome da unidade

    try {
      // Busca se existe PIX pendente — usa dados da própria unidade (cliente / id_pre_cadastro)
      const clienteParam = (unit[7] || "").toString(); // Coluna H - cliente
      const idPreCadastroParam = (unit[6] || "").toString(); // Coluna G - id_pre_cadastro
      const response = await axios.get(
        `${apiUrl}/api/pix/pending?implantacao=${encodeURIComponent(
          implantacao
        )}&cliente=${encodeURIComponent(clienteParam)}&id_pre_cadastro=${encodeURIComponent(idPreCadastroParam)}&unidade=${encodeURIComponent(
          unidade
        )}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      const { hasPending } = response.data;

      // Abre modal de opções
      setPixOptionsModalState({
        isOpen: true,
        unitIndex: unitIndex,
        hasPendingPix: hasPending,
      });
    } catch (error) {
      console.error("Erro ao verificar PIX pendente:", error);
      // Mesmo com erro, abre o modal sem PIX pendente
      setPixOptionsModalState({
        isOpen: true,
        unitIndex: unitIndex,
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

    const unidade = unit[2]; // Coluna C - Nome da unidade

    // Fecha o modal de opções
    setPixOptionsModalState({
      isOpen: false,
      unitIndex: null,
      hasPendingPix: false,
    });

    if (option === "pending") {
      // Busca dados do PIX pendente e abre PixModal em modo visualização
      try {
        const clienteParam = (unit[7] || "").toString(); // Coluna H - cliente
        const idPreCadastroParam = (unit[6] || "").toString(); // Coluna G - id_pre_cadastro
        const response = await axios.get(
          `${apiUrl}/api/pix/pending?implantacao=${encodeURIComponent(
            implantacao
          )}&cliente=${encodeURIComponent(clienteParam)}&id_pre_cadastro=${encodeURIComponent(idPreCadastroParam)}&unidade=${encodeURIComponent(unidade)}`,
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
            unitIndex: unitIndex,
            showPending: true,
            pendingPixData: pixData,
          });
        }
      } catch (error) {
        console.error("Erro ao buscar PIX pendente:", error);
        alert("Erro ao buscar PIX pendente.");
      }
    } else if (option === "new") {
      // Abre PixModal em modo geração
      setPixModalState({
        isOpen: true,
        unitIndex: unitIndex,
        showPending: false,
        pendingPixData: null,
      });
    } else if (option === "history") {
      // Abre PixHistoryModal
      setPixHistoryModalState({
        isOpen: true,
        unitIndex: unitIndex,
      });
    }
  };

  const handleChangeUnitClick = (unitIndex: number) => {
    // <-- NOVO
    setSelectedUnitIndex(unitIndex);
    setChangeUnitModalState({ isOpen: true, unitIndex: unitIndex });
  };

  const handlePaymentClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setPaymentModalState({ isOpen: true, unitIndex: unitIndex });
  };

  const handleConfirmPayment = async (paymentData: PaymentData) => {
    if (paymentModalState.unitIndex === null) return;

    const unitIndex = paymentModalState.unitIndex;
    const unitData = unidades[unitIndex];
    const sheetRowIndex = unitIndex + 2;

    // Fechar PaymentModal e abrir ProcessingPaymentModal
    setPaymentModalState({ isOpen: false, unitIndex: null });
    setIsProcessingPayment(true);
    setProcessingPaymentState({
      isProcessing: true,
      currentStep: 'Iniciando processamento...',
      progress: 10,
      error: null,
      success: false,
    });

    try {
      // Simular etapas do processamento (pode ser substituído por SSE ou polling real)
      setProcessingPaymentState((prev) => ({ ...prev, currentStep: 'Salvando dados de pagamento...', progress: 30 }));

      const clientName = extrairNomeCliente(unitData[7]) || ""; // Coluna H - cliente (extrai após "-")
      const unitName = unitData[2] || ""; // Coluna C - nome_unidade
      const idPreCadastro = unitData[6] || ""; // Coluna G - id_pre_cadastro

      const requestPayload = {
        implantacao: selectedImplantationName,
        implantacaoId: currentImplantation?.id,
        rowIndex: sheetRowIndex,
        clientName: clientName,
        unitName: unitName,
        idPreCadastro: idPreCadastro,
        pagamento: {
          pagamentoPresencial: paymentData.pagamentoPresencial,
          pagamentoRemoto: paymentData.pagamentoRemoto,
          tipoPagamento: paymentData.tipoPagamento,
          valorTotal: paymentData.valorTotal,
          valorPix: paymentData.valorPix,
          valorDinheiro: paymentData.valorDinheiro,
          valorCartao: paymentData.valorCartao,
          valorCheque: paymentData.valorCheque,
          tipoVenda: paymentData.tipoVenda,
          planoSelecionado: paymentData.planoSelecionado,
          diaVencimento: paymentData.diaVencimento,
          valorUnidade: paymentData.valorUnidade,
          observacao: paymentData.observacao,
        },
      };

      await axios.post(
        `${apiUrl}/api/add-payment`,
        requestPayload
      );

      setProcessingPaymentState((prev) => ({ ...prev, currentStep: 'Gerando plano de pagamento...', progress: 60 }));
      // Simular delay/processamento
      await new Promise((res) => setTimeout(res, 600));
      setProcessingPaymentState((prev) => ({ ...prev, currentStep: 'Finalizando processo...', progress: 90 }));
      await new Promise((res) => setTimeout(res, 400));

      setProcessingPaymentState((prev) => ({ ...prev, currentStep: 'Pagamento concluído!', progress: 100, isProcessing: false, success: true }));

      // Fechar modal de processamento e abrir de sucesso
      setTimeout(() => {
        setIsProcessingPayment(false);
        setIsPaymentSuccessModalOpen(true);
      }, 800);

      // Recarregar dados
      await fetchUnitData(selectedImplantationName);
      await fetchHistory(selectedImplantationName);
    } catch (error: unknown) {
      const apiError = (() => {
        const errObj = error as unknown as Record<string, unknown>;
        const resp = errObj['response'] as Record<string, unknown> | undefined;
        const data = resp?.['data'] as Record<string, unknown> | undefined;
        return (
          (data?.['error'] as string | undefined) ||
          (errObj['message'] as string | undefined)
        );
      })();

      setProcessingPaymentState((prev) => ({
        ...prev,
        isProcessing: false,
        error: apiError || 'Erro desconhecido',
        currentStep: 'Erro ao processar pagamento',
      }));
      setTimeout(() => {
        setIsProcessingPayment(false);
      }, 2000);
    }
  };

  const handleToggleBlockUnit = async (
    newStatus: "Bloqueada" | "Disponível",
    password?: string,
    motivo?: string
  ) => {
    if (selectedUnitIndex === null) return;

    // Se está bloqueando, não precisa de senha, mas precisa de motivo
    if (newStatus === "Bloqueada") {
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
        motivo: motivo,
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
          newStatus === "Bloqueada" ? "bloquear" : "desbloquear"
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

    // Solicita o motivo do bloqueio em massa
    const motivo = window.prompt(
      `Digite o motivo do bloqueio para ${selectedUnits.size} unidade(s):`
    );

    if (!motivo || motivo.trim() === "") {
      alert("Motivo é obrigatório para bloquear unidades.");
      return;
    }

    const confirmMsg = `Tem certeza que deseja bloquear ${selectedUnits.size} unidade(s) com o motivo:\n"${motivo}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const promises = Array.from(selectedUnits).map(async (unitIndex) => {
        const sheetRowIndex = unitIndex + 2;
        return axios.post(`${apiUrl}/api/toggle-block-unit`, {
          rowIndex: sheetRowIndex,
          implantacao: selectedImplantationName,
          newStatus: "Bloqueada",
          motivo: motivo.trim(),
        });
      });

      await Promise.all(promises);

      // Atualiza o estado local
      const updatedUnidades = [...unidades];
      selectedUnits.forEach((unitIndex) => {
        updatedUnidades[unitIndex][11] = "Bloqueada"; // Coluna L - situacao
      });
      setUnidades(updatedUnidades);

      // Limpa seleção e sai do modo de seleção
      setSelectedUnits(new Set());
      setIsSelectionMode(false);

      await fetchHistory(selectedImplantationName);
      alert(`${selectedUnits.size} unidade(s) Bloqueada(s) com sucesso!`);
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
      const oldUnitData = unidades[changeUnitModalState.unitIndex];
      const newUnitData = unidades[newUnitIndex];
      const cliente = extrairNomeCliente(oldUnitData[7]); // Nome do cliente (extrai após "-")
      const unidadeAntiga = oldUnitData[2]; // Nome da unidade antiga
      const unidadeNova = newUnitData[2]; // Nome da unidade nova

      // Transfere os PIX para a nova unidade
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

      // Realiza a troca de unidade no Sheets
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
          clientData[0], // G: id_pre_cadastro
          clientData[1], // H: cliente
          clientData[2], // I: documento
          clientData[3], // J: corretor
          clientData[4] || "", // K: imobiliária
        ];
        clientName = clientData[1];
      } else if (manualData) {
        dataToBackend = [
          manualData.id, // G: id_pre_cadastro
          manualData.cliente, // H: cliente
          manualData.documento, // I: documento
          manualData.corretor, // J: corretor
          "", // K: imobiliária (vazio para manual)
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
                newUnit[6] = clientData[0]; // G: id_pre_cadastro
                newUnit[7] = clientData[1]; // H: cliente
                newUnit[8] = clientData[2]; // I: documento
                newUnit[9] = clientData[3]; // J: corretor
                newUnit[10] = clientData[4] || ""; // K: imobiliária
                newUnit[11] = "Reservada"; // L: situacao
              } else if (manualData) {
                newUnit[6] = manualData.id; // G: id_pre_cadastro
                newUnit[7] = manualData.cliente; // H: cliente
                newUnit[8] = manualData.documento; // I: documento
                newUnit[9] = manualData.corretor; // J: corretor
                newUnit[10] = ""; // K: imobiliária
                newUnit[11] = "Reservada"; // L: situacao
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

  const handleReserve = (data: { cliente: string | ManualData }) => {
    const { cliente } = data;
    if (typeof cliente === "string") {
      handleReserveUnit(cliente);
    } else {
      handleReserveUnit(cliente);
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
          newUnit[11] = "Disponível"; // Coluna L - situacao
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
    
    // Cópia profunda para evitar mutação do estado original
    const updatedUnidades = unidades.map(u => [...u]);

    // Sempre grava nas colunas primárias M:N (coord_x / coord_y)
    updatedUnidades[unitToMapIndex][12] = coordX; // Coluna M - coord_x
    updatedUnidades[unitToMapIndex][13] = coordY; // Coluna N - coord_y

    updatedUnidades[unitToMapIndex][18] = unitLetter; // Coluna S - Simbolo (letra)
    // Atualiza localmente o campo implantacao_ref (col Q index 16) para refletir a camada
    const ownerToSet = activeLayer === "additional" ? `${selectedImplantationName}+adicional` : selectedImplantationName;
    updatedUnidades[unitToMapIndex][16] = ownerToSet; // Coluna Q - implantacao_ref
    
    try {
      const sheetRowIndex = unitToMapIndex + 2;
      const implantacaoForPayload = selectedImplantationName;

      // implantacaoRef explicitly marks additional-layer mappings when needed
      const implantacaoRefValue = activeLayer === "additional" ? `${selectedImplantationName}+adicional` : selectedImplantationName;

      const payload: Record<string, unknown> = {
        rowIndex: sheetRowIndex,
        letra: unitLetter,
        implantacao: implantacaoForPayload,
        coordX: coordX,
        coordY: coordY,
        implantacaoRef: implantacaoRefValue, // Sempre envia para marcar a camada
      };

      // Retry logic para lidar com conflitos de concorrência
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          await axios.post(`${apiUrl}/api/update-coords`, payload);
          break; // Sucesso, sai do loop
        } catch (err: unknown) {
          attempts++;
          const axiosError = err as { response?: { status?: number } };
          
          // Se for erro 500 e ainda tem tentativas, aguarda e tenta novamente
          if (axiosError.response?.status === 500 && attempts < maxAttempts) {
            console.log(`[MAPPING] Tentativa ${attempts} falhou, aguardando ${attempts * 500}ms antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, attempts * 500)); // Backoff exponencial
            continue;
          }
          
          // Se não for 500 ou acabaram as tentativas, lança o erro
          throw err;
        }
      }
      
      // Só atualiza o estado após confirmação do backend
      setUnidades(updatedUnidades);
      
      // Marca temporariamente que esta unidade foi mapeada para evitar sobrescrita imediata
      recentlyMappedUnits.current.add(unitToMapIndex);
      setTimeout(() => {
        recentlyMappedUnits.current.delete(unitToMapIndex);
      }, 3000); // Protege por 3 segundos
    } catch (err: unknown) {
      console.error("Erro ao salvar coordenadas:", err);
      
      const axiosError = err as { response?: { status?: number }; code?: string; message?: string };
      
      // Mensagem de erro mais amigável dependendo do tipo
      if (axiosError.response?.status === 500) {
        setError("Erro no servidor ao salvar. Tente novamente em alguns segundos.");
      } else if (axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout')) {
        setError("Tempo esgotado ao salvar. Verifique sua conexão.");
      } else {
        setError("Falha ao salvar as coordenadas. Tente novamente.");
      }
    }
    setUnitToMapIndex(null);
    setUnitLetter(""); // Limpa a letra após salvar
  };

  const handleConfirmPixData = async (
    valor: number,
    identificador: string,
    payloadEmv: string
  ) => {
    if (pixModalState.unitIndex === null) return;

    const unitData = unidades[pixModalState.unitIndex];
    const idPreCadastro = unitData[6]; // ID do pré-cadastro
    const unidade = unitData[2]; // Nome da unidade

    try {
      // Busca o nome correto do cliente no Supabase usando id_pre_cadastro
      let clienteNome = unitData[7] || "N/A"; // Fallback para o nome do unitData
      
      if (idPreCadastro) {
        const { data: clienteData } = await supabase
          .from('clientes')
          .select('nome')
          .eq('id_pre_cadastro', idPreCadastro)
          .maybeSingle(); // Permite 0 ou 1 resultado
        
        if (clienteData?.nome) {
          clienteNome = clienteData.nome;
        }
      }

      // Extrai o nome correto do cliente (remove número + hifen antes do nome)
      const clienteNomeExtraido = extrairNomeCliente(clienteNome);

      // Salva o PIX diretamente no Supabase na tabela historico_pix
      const { error: pixError } = await supabase
        .from('historico_pix')
        .insert({
          implantacao_id: currentImplantation?.id || null,
          implantacao_nome: selectedImplantationName,
          cliente: clienteNomeExtraido,
          unidade: unidade,
          identificador: identificador,
          payload_emv: payloadEmv,
          valor: valor,
          status_pagamento: 'PENDENTE',
          data_criacao: new Date().toISOString(),
        });

      if (pixError) {
        console.error('Erro ao salvar PIX no Supabase:', pixError);
        throw new Error(pixError.message || "Erro ao salvar PIX no banco de dados.");
      }

      // Não fecha o modal — o PixModal exibirá o QR Code automaticamente
      console.log('[handleConfirmPixData] PIX salvo com sucesso. QR Code será exibido no modal.');
    } catch (error: unknown) {
      console.error("Erro ao salvar PIX:", error);
      const err = error as Error;
      throw new Error(
        err.message || "Erro ao salvar dados do PIX."
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
        clientName: extrairNomeCliente(unitData[7]) || "N/D", // Coluna H - cliente (extrai após "-")
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
      clienteNome: extrairNomeCliente(unitData[7]) || "N/D", // Coluna H - cliente (extrai após "-")
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

      <div className={`page-wrapper ${isMappingMode || isBlockMappingMode ? "sidebar-visible" : ""}`}>
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
          onBlockMappingClick={() => setIsBlockMappingMode(!isBlockMappingMode)}
          onPaymentHistoryClick={handleNavigateToPayments}
          onLogout={handleLogout}
        />

        <div className={`app-container ${view === "list" ? "list-view" : ""}`}>
          {isMappingMode && (
            <MappingSidebar
              unidades={unidades}
              implantacaoPrimary={selectedImplantationName}
              implantacaoAdditional={selectedImplantationName ? `${selectedImplantationName}+adicional` : ""}
              onSelectUnit={setUnitToMapIndex}
              selectedUnitIndex={unitToMapIndex}
              dotSize={dotSize}
              onDotSizeChange={setDotSize}
              onSaveDotSize={handleSaveDotSize}
              unitLetter={unitLetter}
              onLetterChange={setUnitLetter}
              activeLayer={activeLayer}
            />
          )}
          {isBlockMappingMode && currentImplantation && (
            <BlockMappingTool
              isActive={isBlockMappingMode}
              onToggle={setIsBlockMappingMode}
              implantacaoId={currentImplantation.id || ""}
              implantacaoName={selectedImplantationName}
              availableBlocks={availableBlocks}
              activeLayer={activeLayer}
              onMappingsChange={setBlockMappings}
              onSelectedBlockChange={setSelectedBlockToMap}
              currentMappings={blockMappings}
            />
          )}
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
                      <div className="layer-toggle-group" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                        <button
                          className={`layer-toggle ${activeLayer === "primary" ? "active" : ""}`}
                          onClick={() => setActiveLayer("primary")}
                        >
                          Principal
                        </button>
                        <button
                          className={`layer-toggle ${activeLayer === "additional" ? "active" : ""}`}
                          onClick={() => setActiveLayer("additional")}
                        >
                          Adicional
                        </button>
                      </div>

                      {/* additional implantation selector removed; additional layer uses primary implantation */}
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
                    activeLayer={activeLayer}
                    additionalImageUrl={
                      // safely access potential alternate image URL fields
                      (() => {
                        if (!currentImplantation) return "";
                        const c = currentImplantation as unknown as Record<string, unknown>;
                        return (
                          (c["imagem_url_adicional"] as string | undefined) ||
                          (c["imagemUrlAdicional"] as string | undefined) ||
                          ""
                        );
                      })()
                    }
                    unidades={filteredUnidadesForMap}
                    isMappingMode={isMappingMode}
                    unitToMapIndex={unitToMapIndex}
                    onUnitClick={handleFloorPlanUnitClick}
                    onMapClick={handleMapClickAndSaveCoords}
                    dotSize={dotSize}
                    hideAvailable={hideAvailable}
                    unitLetter={unitLetter}
                    implantacaoPrimary={selectedImplantationName}
                    implantacaoAdditional={selectedImplantationName ? `${selectedImplantationName}+adicional` : ""}
                    blockMappings={blockMappings}
                    blockStats={blockStats}
                    isBlockMappingMode={isBlockMappingMode}
                    selectedBlockToMap={selectedBlockToMap}
                    onRectangleComplete={handleRectangleComplete}
                    onBlockMappingPaste={handleBlockMappingPaste}
                  />
                )}
                {view === "list" && (
                  <ReservationList
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


              <PaymentModal
                show={paymentModalState.isOpen}
                onClose={handleCloseModals}
                unitData={
                  paymentModalState.unitIndex !== null
                    ? unidades[paymentModalState.unitIndex]
                    : null
                }
                implantacaoId={currentImplantation?.id ? Number(currentImplantation.id) : null}
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
