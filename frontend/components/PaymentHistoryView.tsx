// frontend/components/PaymentHistoryView.tsx

import { useState, useEffect, useMemo } from "react";
import { 
  FiSearch, 
  FiDollarSign, 
  FiClock, 
  FiCheckCircle, 
  FiXCircle,
  FiCreditCard,
  FiSmartphone
} from "react-icons/fi";
import { supabase } from "../src/supabaseClient";
import { PasswordModal } from "./PasswordModal";

interface Payment {
  id: string;
  cliente_nome: string;
  unidade: string;
  valor_total: number;
  valor_pix: number;
  valor_dinheiro: number;
  valor_cartao: number;
  valor_cheque: number;
  status: string;
  data_criacao: string;
  data_processamento: string | null;
  plano_padrao: string | null;
  tipo_pagamento: string | null;
  observacao: string | null;
}

interface PixHistory {
  id: string;
  cliente: string;
  unidade: string;
  valor: number;
  status_pagamento: string;
  data_criacao: string;
  data_pagamento: string | null;
}

interface ReserveWithoutPayment {
  unidade_nome: string;
  cliente: string;
  corretor: string;
  data: string;
  acao: string;
}

type FilterStatus = "todos" | "pendente" | "processado" | "expirado";

export function PaymentHistoryView() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pixHistory, setPixHistory] = useState<PixHistory[]>([]);
  const [reservesWithoutPayment, setReservesWithoutPayment] = useState<ReserveWithoutPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [activeTab, setActiveTab] = useState<"geral" | "pix" | "pendentes">("geral");

  useEffect(() => {
    const auth = localStorage.getItem("diretoriaAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadPaymentData();
    }
  }, [isAuthenticated]);

  const loadPaymentData = async () => {
    setLoading(true);
    let formattedPayments: Payment[] = [];
    try {
      // Buscar pagamentos com informações do cliente (limitado aos 500 mais recentes)
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("pagamentos")
        .select(`
          id,
          unidade,
          valor_total,
          valor_pix,
          valor_dinheiro,
          valor_cartao,
          valor_cheque,
          status,
          data_criacao,
          data_processamento,
          plano_padrao,
          tipo_pagamento,
          observacao,
          clientes:cliente_id (
            nome
          )
        `)
        .order("data_criacao", { ascending: false })
        .limit(500);

      if (paymentsError) {
        console.error("Erro ao buscar pagamentos:", paymentsError);
      } else {
        formattedPayments = (paymentsData || []).map((p) => ({
          id: p.id,
          cliente_nome: (p.clientes as { nome?: string } | null)?.nome || "Cliente não encontrado",
          unidade: p.unidade,
          valor_total: p.valor_total || 0,
          valor_pix: p.valor_pix || 0,
          valor_dinheiro: p.valor_dinheiro || 0,
          valor_cartao: p.valor_cartao || 0,
          valor_cheque: p.valor_cheque || 0,
          status: p.status,
          data_criacao: p.data_criacao,
          data_processamento: p.data_processamento,
          plano_padrao: p.plano_padrao,
          tipo_pagamento: p.tipo_pagamento || null,
          observacao: p.observacao || null,
        }));
        setPayments(formattedPayments);
      }

      // Buscar histórico de PIX (limitado aos 300 mais recentes)
      const { data: pixData, error: pixError } = await supabase
        .from("historico_pix")
        .select("*")
        .order("data_criacao", { ascending: false })
        .limit(300);

      if (pixError) {
        console.error("Erro ao buscar histórico PIX:", pixError);
      } else {
        setPixHistory(pixData || []);
      }

      // Buscar reservas sem pagamento através da análise do histórico
      // Lógica: Se a última ação de uma unidade não for "Pagamento", "Cancelada" ou "Worker", 
      // então há uma reserva sem pagamento
      const { data: historicoData, error: historicoError } = await supabase
        .from("historico")
        .select("unidade_nome, cliente, corretor, timestamp_iso, acao")
        .order("timestamp_iso", { ascending: false })
        .limit(500);

      if (historicoError) {
        console.error("Erro ao buscar histórico:", historicoError);
      } else {
        // Agrupar histórico por unidade e pegar apenas a ação mais recente de cada uma
        const unidadesMaisRecentes = new Map<string, {
          unidade_nome: string;
          cliente: string;
          corretor: string;
          data: string;
          acao: string;
        }>();

        (historicoData || []).forEach((h) => {
          const unidadeNome = h.unidade_nome;
          if (!unidadeNome) return;

          // Se ainda não temos essa unidade no Map, adiciona (já está ordenado por mais recente)
          if (!unidadesMaisRecentes.has(unidadeNome)) {
            unidadesMaisRecentes.set(unidadeNome, {
              unidade_nome: unidadeNome,
              cliente: h.cliente || "",
              corretor: h.corretor || "",
              data: h.timestamp_iso,
              acao: h.acao || "",
            });
          }
        });

        // Filtrar unidades cuja última ação NÃO é pagamento, cancelamento ou processamento por worker
        const pendentes: ReserveWithoutPayment[] = [];
        unidadesMaisRecentes.forEach((registro) => {
          const acao = registro.acao.toLowerCase();
          
          // Se a última ação NÃO for uma dessas, significa que há reserva sem pagamento
          const isPagamento = acao.includes("pagamento registrado");
          const isWorkerProcessado = acao.includes("reserva processada (worker)");
          const isCancelada = acao.includes("cancelada") || acao.includes("cancelamento");
          
          if (!isPagamento && !isWorkerProcessado && !isCancelada) {
            pendentes.push(registro);
          }
        });

        setReservesWithoutPayment(pendentes);
      }
    } catch (error) {
      console.error("Erro geral ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = useMemo(() => {
    let filtered = payments;

    // Filtrar por status
    if (filterStatus !== "todos") {
      if (filterStatus === "expirado") {
        // Considerar expirado se status = pendente e data de criação > 30 dias
        filtered = filtered.filter((p) => {
          if (p.status !== "pendente") return false;
          const createdDate = new Date(p.data_criacao);
          const now = new Date();
          const diffDays = Math.floor(
            (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return diffDays > 30;
        });
      } else {
        filtered = filtered.filter((p) => p.status === filterStatus);
      }
    }

    // Filtrar por termo de busca
    if (searchTerm.trim()) {
      const lowercasedTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.cliente_nome.toLowerCase().includes(lowercasedTerm) ||
          p.unidade.toLowerCase().includes(lowercasedTerm)
      );
    }

    return filtered;
  }, [payments, filterStatus, searchTerm]);

  const filteredPixHistory = useMemo(() => {
    if (!searchTerm.trim()) return pixHistory;

    const lowercasedTerm = searchTerm.toLowerCase();
    return pixHistory.filter(
      (p) =>
        p.cliente.toLowerCase().includes(lowercasedTerm) ||
        p.unidade.toLowerCase().includes(lowercasedTerm)
    );
  }, [pixHistory, searchTerm]);

  const filteredReserves = useMemo(() => {
    if (!searchTerm.trim()) return reservesWithoutPayment;

    const lowercasedTerm = searchTerm.toLowerCase();
    return reservesWithoutPayment.filter(
      (r) =>
        r.cliente.toLowerCase().includes(lowercasedTerm) ||
        r.unidade_nome.toLowerCase().includes(lowercasedTerm) ||
        r.corretor.toLowerCase().includes(lowercasedTerm)
    );
  }, [reservesWithoutPayment, searchTerm]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processado":
        return <FiCheckCircle color="#28a745" size={18} />;
      case "pendente":
        return <FiClock color="#ffc107" size={18} />;
      case "erro":
        return <FiXCircle color="#dc3545" size={18} />;
      default:
        return <FiClock color="#6c757d" size={18} />;
    }
  };

  const getPaymentMethods = (payment: Payment) => {
    const methods = [];
    if (payment.tipo_pagamento === "remoto") methods.push(`Remoto: ${formatCurrency(payment.valor_total)}`);
    if (payment.valor_pix > 0) methods.push(`PIX: ${formatCurrency(payment.valor_pix)}`);
    if (payment.valor_dinheiro > 0) methods.push(`Dinheiro: ${formatCurrency(payment.valor_dinheiro)}`);
    if (payment.valor_cartao > 0) methods.push(`Cartão: ${formatCurrency(payment.valor_cartao)}`);
    if (payment.valor_cheque > 0) methods.push(`Cheque: ${formatCurrency(payment.valor_cheque)}`);
    if (payment.observacao) methods.push(`Obs: ${payment.observacao}`);
    return methods.length > 0 ? methods.join(" | ") : "Nenhum pagamento registrado";
  };

  if (!isAuthenticated) {
    return <PasswordModal onSuccess={() => setIsAuthenticated(true)} />;
  }

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#eaeaea" }}>
        Carregando histórico de pagamentos...
      </div>
    );
  }

  return (
    <div className="payment-history-container">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .payment-history-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
          color: #eaeaea;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .payment-history-header {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 25px 30px;
          background: rgba(42, 42, 42, 0.6);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(106, 215, 0, 0.2);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          flex-shrink: 0;
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .payment-history-header h1 {
          color: #2563eb;
          font-size: 28px;
          margin: 0;
          font-weight: 700;
          text-shadow: 0 2px 10px rgba(106, 215, 0, 0.3);
        }

        .payment-history-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 30px;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .payment-history-content::-webkit-scrollbar {
          width: 10px;
        }

        .payment-history-content::-webkit-scrollbar-track {
          background: rgba(42, 42, 42, 0.3);
          border-radius: 10px;
        }

        .payment-history-content::-webkit-scrollbar-thumb {
          background: rgba(106, 215, 0, 0.5);
          border-radius: 10px;
          transition: background 0.3s ease;
        }

        .payment-history-content::-webkit-scrollbar-thumb:hover {
          background: rgba(106, 215, 0, 0.7);
        }

        .tabs-container {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
          border-bottom: 2px solid rgba(106, 215, 0, 0.1);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 2px;
        }

        .tab-button {
          padding: 14px 28px;
          background: transparent;
          border: none;
          color: #9e9e9e;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
          border-bottom: 3px solid transparent;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          flex-shrink: 0;
          position: relative;
        }

        .tab-button::before {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 50%;
          width: 0;
          height: 3px;
          background: #2563eb;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateX(-50%);
        }

        .tab-button:hover {
          color: #2563eb;
          transform: translateY(-2px);
        }

        .tab-button:hover::before {
          width: 100%;
        }

        .tab-button.active {
          color: #2563eb;
        }

        .tab-button.active::before {
          width: 100%;
        }

        .filters-section {
          background: rgba(42, 42, 42, 0.6);
          backdrop-filter: blur(10px);
          padding: 25px;
          border-radius: 12px;
          margin-bottom: 30px;
          border: 1px solid rgba(106, 215, 0, 0.1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          transition: all 0.3s ease;
        }

        .filters-section:hover {
          border-color: rgba(106, 215, 0, 0.3);
          box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
        }

        .search-wrapper {
          position: relative;
          margin-bottom: 20px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #2563eb;
          z-index: 2;
          transition: all 0.3s ease;
        }

        .search-wrapper:focus-within .search-icon {
          transform: translateY(-50%) scale(1.1);
        }

        .search-input {
          width: 100%;
          padding: 14px 14px 14px 45px;
          background: rgba(30, 30, 30, 0.8);
          border: 2px solid rgba(106, 215, 0, 0.2);
          border-radius: 8px;
          color: #eaeaea;
          font-size: 15px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .search-input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(106, 215, 0, 0.15);
          transform: translateY(-2px);
        }

        .search-input::placeholder {
          color: #6c757d;
          transition: color 0.3s ease;
        }

        .search-input:focus::placeholder {
          color: #9e9e9e;
        }

        .status-filters {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .filter-button {
          padding: 10px 20px;
          background: rgba(30, 30, 30, 0.8);
          border: 2px solid rgba(106, 215, 0, 0.3);
          border-radius: 8px;
          color: #eaeaea;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .filter-button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(106, 215, 0, 0.3);
          transform: translate(-50%, -50%);
          transition: width 0.4s ease, height 0.4s ease;
        }

        .filter-button:hover::before {
          width: 300px;
          height: 300px;
        }

        .filter-button:hover {
          border-color: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(106, 215, 0, 0.3);
        }

        .filter-button.active {
          background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
          color: #0d0d0d;
          border-color: #2563eb;
          font-weight: bold;
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(106, 215, 0, 0.4);
        }

        .table-wrapper {
          overflow: auto;
          background: rgba(42, 42, 42, 0.6);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 0;
          -webkit-overflow-scrolling: touch;
          max-height: calc(100vh - 450px);
          border: 1px solid rgba(106, 215, 0, 0.1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          transition: all 0.3s ease;
          touch-action: pan-y;
        }

        .table-wrapper:hover {
          border-color: rgba(106, 215, 0, 0.2);
        }

        .payment-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          min-width: 900px;
        }

        .payment-table th {
          background: rgba(30, 30, 30, 0.95);
          color: #2563eb;
          padding: 16px 12px;
          text-align: left;
          font-weight: 700;
          position: sticky;
          top: 0;
          z-index: 10;
          white-space: nowrap;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.5px;
          border-bottom: 2px solid rgba(106, 215, 0, 0.3);
        }

        .payment-table td {
          padding: 16px 12px;
          border-bottom: 1px solid rgba(58, 58, 58, 0.5);
          vertical-align: middle;
          transition: all 0.2s ease;
        }

        .payment-table tbody tr {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .payment-table tbody tr:hover {
          background: rgba(106, 215, 0, 0.05);
          transform: scale(1.01);
          box-shadow: 0 2px 10px rgba(106, 215, 0, 0.1);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
        }

        .status-badge:hover {
          transform: scale(1.05);
        }

        .status-badge.processado {
          background: linear-gradient(135deg, rgba(40, 167, 69, 0.2) 0%, rgba(40, 167, 69, 0.3) 100%);
          color: #28a745;
          border: 1px solid rgba(40, 167, 69, 0.5);
        }

        .status-badge.pendente {
          background: linear-gradient(135deg, rgba(255, 193, 7, 0.2) 0%, rgba(255, 193, 7, 0.3) 100%);
          color: #ffc107;
          border: 1px solid rgba(255, 193, 7, 0.5);
        }

        .status-badge.expirado {
          background: linear-gradient(135deg, rgba(220, 53, 69, 0.2) 0%, rgba(220, 53, 69, 0.3) 100%);
          color: #dc3545;
          border: 1px solid rgba(220, 53, 69, 0.5);
        }

        .status-badge.erro {
          background: linear-gradient(135deg, rgba(220, 53, 69, 0.2) 0%, rgba(220, 53, 69, 0.3) 100%);
          color: #dc3545;
          border: 1px solid rgba(220, 53, 69, 0.5);
        }

        .payment-methods {
          font-size: 13px;
          color: #b0b0b0;
          line-height: 1.6;
        }

        .empty-state {
          text-align: center;
          padding: 80px 30px;
          color: #6c757d;
          animation: fadeIn 0.5s ease-out;
        }

        .empty-state-icon {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 25px;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .empty-state p {
          font-size: 16px;
          font-weight: 500;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .stat-card {
          background: rgba(42, 42, 42, 0.6);
          backdrop-filter: blur(10px);
          padding: 25px;
          border-radius: 12px;
          border: 1px solid rgba(106, 215, 0, 0.1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #2563eb 0%, #1e40af 100%);
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .stat-card:hover::before {
          transform: scaleX(1);
        }

        .stat-card:hover {
          border-color: rgba(106, 215, 0, 0.3);
          transform: translateY(-5px);
          box-shadow: 0 8px 30px rgba(106, 215, 0, 0.2);
        }

        .stat-label {
          font-size: 13px;
          color: #9e9e9e;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 800;
          color: #2563eb;
          text-shadow: 0 2px 10px rgba(106, 215, 0, 0.3);
          transition: all 0.3s ease;
        }

        .stat-card:hover .stat-value {
          transform: scale(1.1);
        }

        .pix-status-PENDENTE {
          color: #ffc107;
          font-weight: 700;
        }

        .pix-status-PAGO {
          color: #28a745;
          font-weight: 700;
        }

        .pix-status-CANCELADO {
          color: #dc3545;
          font-weight: 700;
        }

        /* Responsividade Mobile */
        @media (max-width: 1024px) {
          .payment-history-header {
            padding: 20px 25px;
          }

          .payment-history-header h1 {
            font-size: 24px;
          }

          .payment-history-content {
            padding: 20px;
          }

          .table-wrapper {
            max-height: calc(100vh - 550px);
          }
        }

        @media (max-width: 768px) {
          .payment-history-header {
            padding: 18px 20px;
          }

          .payment-history-header h1 {
            font-size: 22px;
          }

          .payment-history-content {
            padding: 15px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }

          .stat-card {
            padding: 20px;
          }

          .stat-value {
            font-size: 28px;
          }

          .stat-label {
            font-size: 12px;
          }

          .tab-button {
            padding: 12px 20px;
            font-size: 14px;
          }

          .filters-section {
            padding: 20px;
          }

          .filter-button {
            padding: 8px 16px;
            font-size: 13px;
          }

          .payment-table {
            font-size: 13px;
          }

          .payment-table th,
          .payment-table td {
            padding: 12px 10px;
          }

          .table-wrapper {
            max-height: calc(100vh - 500px);
          }
        }

        @media (max-width: 480px) {
          .payment-history-header {
            padding: 15px;
          }

          .payment-history-header h1 {
            font-size: 20px;
          }

          .payment-history-header svg {
            width: 26px;
            height: 26px;
          }

          .payment-history-content {
            padding: 12px;
            overflow-y: auto;
            overflow-x: hidden;
          }

          .stats-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .table-wrapper {
            max-height: calc(100vh - 550px);
            overflow-x: auto;
            overflow-y: auto;
          }

          .payment-table {
            min-width: 750px;
          }

          .stat-card {
            padding: 18px;
          }

          .stat-value {
            font-size: 26px;
          }

          .tab-button {
            padding: 10px 16px;
            font-size: 13px;
          }

          .filters-section {
            padding: 18px;
          }

          .filter-button {
            padding: 7px 14px;
            font-size: 12px;
          }

          .payment-table {
            font-size: 12px;
            min-width: 750px;
          }

          .table-wrapper {
            max-height: calc(100vh - 650px);
          }
        }
      `}</style>

      <div className="payment-history-header">
        <FiDollarSign size={32} color="#2563eb" />
        <h1>Histórico de Pagamentos</h1>
      </div>

      <div className="payment-history-content">
        {/* Estatísticas */}
        <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total de Pagamentos</div>
          <div className="stat-value">{payments.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pagamentos Pendentes</div>
          <div className="stat-value">
            {payments.filter((p) => p.status === "pendente").length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reservas sem Pagamento</div>
          <div className="stat-value">{reservesWithoutPayment.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Transações PIX</div>
          <div className="stat-value">{pixHistory.length}</div>
        </div>
      </div>

      {/* Abas */}
      <div className="tabs-container">
        <button
          className={`tab-button ${activeTab === "geral" ? "active" : ""}`}
          onClick={() => setActiveTab("geral")}
        >
          Pagamentos Gerais
        </button>
        <button
          className={`tab-button ${activeTab === "pix" ? "active" : ""}`}
          onClick={() => setActiveTab("pix")}
        >
          Histórico PIX
        </button>
        <button
          className={`tab-button ${activeTab === "pendentes" ? "active" : ""}`}
          onClick={() => setActiveTab("pendentes")}
        >
          Reservas sem Pagamento
        </button>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="search-wrapper">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por cliente ou unidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {activeTab === "geral" && (
          <div className="status-filters">
            <button
              className={`filter-button ${filterStatus === "todos" ? "active" : ""}`}
              onClick={() => setFilterStatus("todos")}
            >
              Todos
            </button>
            <button
              className={`filter-button ${filterStatus === "pendente" ? "active" : ""}`}
              onClick={() => setFilterStatus("pendente")}
            >
              Pendentes
            </button>
            <button
              className={`filter-button ${filterStatus === "processado" ? "active" : ""}`}
              onClick={() => setFilterStatus("processado")}
            >
              Concluídos
            </button>
            <button
              className={`filter-button ${filterStatus === "expirado" ? "active" : ""}`}
              onClick={() => setFilterStatus("expirado")}
            >
              Expirados
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo das abas */}
      {activeTab === "geral" && (
        <div className="table-wrapper">
          {filteredPayments.length > 0 ? (
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Unidade</th>
                  <th>Valor Total</th>
                  <th>Formas de Pagamento</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Data Criação</th>
                  <th>Data Processamento</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.cliente_nome}</td>
                    <td>{payment.unidade}</td>
                    <td style={{ fontWeight: "bold" }}>
                      {formatCurrency(payment.valor_total)}
                    </td>
                    <td>
                      <div className="payment-methods">
                        {getPaymentMethods(payment)}
                      </div>
                    </td>
                    <td>{payment.plano_padrao || "-"}</td>
                    <td>
                      <span className={`status-badge ${payment.status}`}>
                        {getStatusIcon(payment.status)}
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </span>
                    </td>
                    <td>{formatDate(payment.data_criacao)}</td>
                    <td>{formatDate(payment.data_processamento || "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiCreditCard size={64} color="#6c757d" />
              </div>
              <p>Nenhum pagamento encontrado com os filtros selecionados.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "pix" && (
        <div className="table-wrapper">
          {filteredPixHistory.length > 0 ? (
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Unidade</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Data Criação</th>
                  <th>Data Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {filteredPixHistory.map((pix) => (
                  <tr key={pix.id}>
                    <td>{pix.cliente}</td>
                    <td>{pix.unidade}</td>
                    <td style={{ fontWeight: "bold" }}>
                      {formatCurrency(pix.valor)}
                    </td>
                    <td>
                      <span className={`pix-status-${pix.status_pagamento}`}>
                        {pix.status_pagamento}
                      </span>
                    </td>
                    <td>{formatDate(pix.data_criacao)}</td>
                    <td>{formatDate(pix.data_pagamento || "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiSmartphone size={64} color="#6c757d" />
              </div>
              <p>Nenhuma transação PIX encontrada.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "pendentes" && (
        <div className="table-wrapper">
          {filteredReserves.length > 0 ? (
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Unidade</th>
                  <th>Corretor</th>
                  <th>Ação</th>
                  <th>Data da Reserva</th>
                </tr>
              </thead>
              <tbody>
                {filteredReserves.map((reserve, index) => (
                  <tr key={index}>
                    <td>{reserve.cliente}</td>
                    <td>{reserve.unidade_nome}</td>
                    <td>{reserve.corretor}</td>
                    <td>{reserve.acao}</td>
                    <td>{formatDate(reserve.data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiCheckCircle size={64} color="#28a745" />
              </div>
              <p>Todas as reservas possuem pagamento registrado!</p>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
