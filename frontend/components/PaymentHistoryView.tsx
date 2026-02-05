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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pixHistory, setPixHistory] = useState<PixHistory[]>([]);
  const [reservesWithoutPayment, setReservesWithoutPayment] = useState<ReserveWithoutPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [activeTab, setActiveTab] = useState<"geral" | "pix" | "pendentes">("geral");

  useEffect(() => {
    loadPaymentData();
  }, []);

  const loadPaymentData = async () => {
    setLoading(true);
    let formattedPayments: Payment[] = [];
    try {
      // Buscar pagamentos com informações do cliente
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
          clientes:cliente_id (
            nome
          )
        `)
        .order("data_criacao", { ascending: false });

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
        }));
        setPayments(formattedPayments);
      }

      // Buscar histórico de PIX
      const { data: pixData, error: pixError } = await supabase
        .from("historico_pix")
        .select("*")
        .order("data_criacao", { ascending: false });

      if (pixError) {
        console.error("Erro ao buscar histórico PIX:", pixError);
      } else {
        setPixHistory(pixData || []);
      }

      // Buscar reservas sem pagamento (histórico de reservas)
      const { data: historicoData, error: historicoError } = await supabase
        .from("historico")
        .select("unidade_nome, cliente, corretor, timestamp_iso, acao")
        .or('acao.ilike.%Reserva processada%,acao.ilike.%Pagamento Registrado%')
        .order("timestamp_iso", { ascending: false });

      if (historicoError) {
        console.error("Erro ao buscar histórico:", historicoError);
      } else {
        // Filtrar apenas reservas que não tem pagamento correspondente
        const historicoFormatted = (historicoData || []).map((h) => ({
          unidade_nome: h.unidade_nome,
          cliente: h.cliente,
          corretor: h.corretor,
          data: h.timestamp_iso,
          acao: h.acao,
        }));

        // Verificar quais reservas não têm pagamento
        const unidadesComPagamento = new Set(
          formattedPayments.map((p) => p.unidade)
        );
        const pendentes = historicoFormatted.filter(
          (h) => !unidadesComPagamento.has(h.unidade_nome)
        );
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
    if (payment.valor_pix > 0) methods.push(`PIX: ${formatCurrency(payment.valor_pix)}`);
    if (payment.valor_dinheiro > 0) methods.push(`Dinheiro: ${formatCurrency(payment.valor_dinheiro)}`);
    if (payment.valor_cartao > 0) methods.push(`Cartão: ${formatCurrency(payment.valor_cartao)}`);
    if (payment.valor_cheque > 0) methods.push(`Cheque: ${formatCurrency(payment.valor_cheque)}`);
    return methods.length > 0 ? methods.join(" | ") : "Nenhum pagamento registrado";
  };

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
        .payment-history-container {
          padding: 15px;
          background-color: #1e1e1e;
          color: #eaeaea;
          min-height: 100vh;
        }

        .payment-history-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .payment-history-header h1 {
          color: #6ad700;
          font-size: 24px;
          margin: 0;
        }

        .tabs-container {
          display: flex;
          gap: 5px;
          margin-bottom: 20px;
          border-bottom: 2px solid #2a2a2a;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .tab-button {
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: #eaeaea;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .tab-button:hover {
          color: #6ad700;
        }

        .tab-button.active {
          color: #6ad700;
          border-bottom-color: #6ad700;
        }

        .filters-section {
          background-color: #2a2a2a;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .search-wrapper {
          position: relative;
          margin-bottom: 15px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #6ad700;
        }

        .search-input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          background-color: #1e1e1e;
          border: 1px solid #6ad700;
          border-radius: 6px;
          color: #eaeaea;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #6ad700;
          box-shadow: 0 0 0 2px rgba(106, 215, 0, 0.2);
        }

        .status-filters {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .filter-button {
          padding: 8px 16px;
          background-color: #1e1e1e;
          border: 1px solid #6ad700;
          border-radius: 6px;
          color: #eaeaea;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .filter-button:hover {
          background-color: #6ad700;
          color: #1e1e1e;
        }

        .filter-button.active {
          background-color: #6ad700;
          color: #1e1e1e;
          font-weight: bold;
        }

        .table-wrapper {
          overflow-x: auto;
          background-color: #2a2a2a;
          border-radius: 8px;
          padding: 10px;
          -webkit-overflow-scrolling: touch;
        }

        .payment-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 800px;
        }

        .payment-table th {
          background-color: #1e1e1e;
          color: #6ad700;
          padding: 10px 8px;
          text-align: left;
          font-weight: 600;
          position: sticky;
          top: 0;
          z-index: 10;
          white-space: nowrap;
        }

        .payment-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #3a3a3a;
          vertical-align: middle;
        }

        .payment-table tr:hover {
          background-color: #333333;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-badge.processado {
          background-color: rgba(40, 167, 69, 0.2);
          color: #28a745;
        }

        .status-badge.pendente {
          background-color: rgba(255, 193, 7, 0.2);
          color: #ffc107;
        }

        .status-badge.expirado {
          background-color: rgba(220, 53, 69, 0.2);
          color: #dc3545;
        }

        .status-badge.erro {
          background-color: rgba(220, 53, 69, 0.2);
          color: #dc3545;
        }

        .payment-methods {
          font-size: 12px;
          color: #b0b0b0;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6c757d;
        }

        .empty-state-icon {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 20px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          background-color: #2a2a2a;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #3a3a3a;
        }

        .stat-label {
          font-size: 12px;
          color: #b0b0b0;
          margin-bottom: 8px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #6ad700;
        }

        .pix-status-PENDENTE {
          color: #ffc107;
        }

        .pix-status-PAGO {
          color: #28a745;
        }

        .pix-status-CANCELADO {
          color: #dc3545;
        }

        /* Responsividade Mobile */
        @media (max-width: 768px) {
          .payment-history-container {
            padding: 10px;
          }

          .payment-history-header h1 {
            font-size: 20px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .stat-card {
            padding: 15px;
          }

          .stat-value {
            font-size: 20px;
          }

          .stat-label {
            font-size: 11px;
          }

          .tab-button {
            padding: 8px 12px;
            font-size: 13px;
          }

          .filters-section {
            padding: 15px;
          }

          .filter-button {
            padding: 6px 12px;
            font-size: 12px;
          }

          .payment-table {
            font-size: 12px;
          }

          .payment-table th,
          .payment-table td {
            padding: 8px 6px;
          }

          .status-badge {
            padding: 3px 8px;
            font-size: 11px;
          }

          .payment-methods {
            font-size: 11px;
          }
        }

        @media (max-width: 480px) {
          .payment-history-header h1 {
            font-size: 18px;
          }

          .payment-history-header svg {
            width: 24px;
            height: 24px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .stat-card {
            padding: 12px;
          }

          .tab-button {
            padding: 8px 10px;
            font-size: 12px;
          }
        }
      `}</style>

      <div className="payment-history-header">
        <FiDollarSign size={32} color="#6ad700" />
        <h1>Histórico de Pagamentos</h1>
      </div>

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
  );
}
