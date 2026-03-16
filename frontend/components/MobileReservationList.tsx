// frontend/components/MobileReservationList.tsx — Lista mobile com cards accordion

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../src/supabaseClient";
import {
  FiSearch,
  FiLock,
  FiUnlock,
  FiClock,
  FiUserPlus,
  FiChevronDown,
  FiDollarSign,
  FiRefreshCw,
} from "react-icons/fi";

interface MobileReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onHistoryClick: (unitName: string) => void;
  onChangeUnitClick: (unitIndex: number) => void;
  onBlockClick: (unitIndex: number) => void;
  onPrintClick: (unitIndex: number) => void;
  onPixClick: (unitIndex: number) => void;
  onPaymentClick: (unitIndex: number) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: "all" | "Disponível" | "Reservada" | "Bloqueada";
  setStatusFilter: (
    status: "all" | "Disponível" | "Reservada" | "Bloqueada"
  ) => void;
  totalUnidades: number;
  isSelectionMode: boolean;
  selectedUnits: Set<number>;
  onToggleUnitSelection: (unitIndex: number) => void;
  onToggleSelectionMode: () => void;
  onBulkBlock: () => void;
}

export function MobileReservationList({
  unidades,
  onUnitClick,
  onChangeUnitClick,
  onBlockClick,
  onHistoryClick,
  onPixClick,
  onPaymentClick,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  totalUnidades,
  isSelectionMode,
  selectedUnits,
  onToggleUnitSelection,
  onToggleSelectionMode,
  onBulkBlock,
}: MobileReservationListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [manageIndex, setManageIndex] = useState<number | null>(null);
  const [isPaymentProcessed, setIsPaymentProcessed] = useState(false);
  const [canChangeOrCancel, setCanChangeOrCancel] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleExpand = useCallback(
    (idx: number) => {
      setExpandedIndex((prev) => (prev === idx ? null : idx));
    },
    []
  );

  // Verificar status de pagamento quando abre gerenciar
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (manageIndex === null) {
        setIsPaymentProcessed(false);
        setCanChangeOrCancel(true);
        setIsProcessing(false);
        return;
      }

      const unitTuple = unidades.find(([, idx]) => idx === manageIndex);
      if (!unitTuple) return;

      const [unitData] = unitTuple;
      const unitName = unitData[2];
      const paymentStatus = (unitData[20] || "").toString().toLowerCase();

      if (paymentStatus === "processando") {
        setIsProcessing(true);
        setIsPaymentProcessed(false);
        return;
      }
      setIsProcessing(false);

      try {
        const { data, error } = await supabase
          .from("historico")
          .select("acao, timestamp_iso")
          .eq("unidade_nome", unitName)
          .order("timestamp_iso", { ascending: false })
          .limit(10);

        if (error || !data || data.length === 0) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const mostRecentAction = data[0]?.acao || "";
        if (mostRecentAction === "Erro ao registrar pagamento (Worker)") {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const paymentAction = "Pagamento Registrado";
        const workerProcessAction = "Reserva processada (Worker)";
        const fullResetActions = ["Cancelada", "Reservada"];

        const paymentIdx = data.findIndex((h) => h.acao === paymentAction);
        const workerProcessIdx = data.findIndex(
          (h) => h.acao === workerProcessAction
        );

        if (paymentIdx === -1) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const hasFullResetBeforePayment = data
          .slice(0, paymentIdx)
          .some((h) => fullResetActions.includes(h.acao));

        if (hasFullResetBeforePayment) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const hasWorkerProcessBeforePayment =
          workerProcessIdx !== -1 && workerProcessIdx < paymentIdx;
        setIsPaymentProcessed(true);
        setCanChangeOrCancel(hasWorkerProcessBeforePayment);
      } catch {
        setIsPaymentProcessed(false);
      }
    };

    checkPaymentStatus();
  }, [manageIndex, unidades]);

  const getStatusClass = (situacao: string) => {
    const s = situacao?.toLowerCase().trim();
    if (s === "disponível" || s === "disponivel") return "disponivel";
    if (s === "reservada") return "reservada";
    if (s === "bloqueada") return "bloqueada";
    return "";
  };

  const getStatusLabel = (situacao: string) => {
    const s = situacao?.toLowerCase().trim();
    if (s === "disponível" || s === "disponivel") return "Disponível";
    if (s === "reservada") return "Reservada";
    if (s === "bloqueada") return "Bloqueada";
    return situacao || "—";
  };

  return (
    <>
      {/* Filtros */}
      <div className="mobile-filters">
        <div className="mobile-search-wrapper">
          <FiSearch className="mobile-search-icon" />
          <input
            type="text"
            className="mobile-search-input"
            placeholder="Buscar unidade, bloco, tipologia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="mobile-status-filters">
          <button
            className={`mobile-status-pill ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Todas
          </button>
          <button
            className={`mobile-status-pill ${statusFilter === "Disponível" ? "active" : ""}`}
            onClick={() => setStatusFilter("Disponível")}
          >
            Disponíveis
          </button>
          <button
            className={`mobile-status-pill ${statusFilter === "Reservada" ? "active-reservada" : ""}`}
            onClick={() => setStatusFilter("Reservada")}
          >
            Reservadas
          </button>
          <button
            className={`mobile-status-pill ${statusFilter === "Bloqueada" ? "active-bloqueada" : ""}`}
            onClick={() => setStatusFilter("Bloqueada")}
          >
            Bloqueadas
          </button>
        </div>
      </div>

      {/* Barra de seleção */}
      <div className="mobile-selection-bar">
        <span className="mobile-results-counter" style={{ padding: 0 }}>
          <strong>{unidades.length}</strong> de {totalUnidades} unidades
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isSelectionMode && selectedUnits.size > 0 && (
            <button className="mobile-bulk-block-btn" onClick={onBulkBlock}>
              <FiLock style={{ marginRight: 4 }} />
              Bloquear ({selectedUnits.size})
            </button>
          )}
          <button
            className={`mobile-selection-toggle ${isSelectionMode ? "active" : ""}`}
            onClick={onToggleSelectionMode}
          >
            {isSelectionMode ? "Cancelar" : "Selecionar"}
          </button>
        </div>
      </div>

      {/* Lista de cards */}
      <div className="mobile-content">
        {unidades.length === 0 ? (
          <div className="mobile-empty-state">
            <span className="mobile-empty-icon">🔍</span>
            <span className="mobile-empty-text">
              Nenhuma unidade encontrada
            </span>
          </div>
        ) : (
          <div className="mobile-card-list">
            {unidades.map(([unit, rowIndex]) => {
              const situacao = unit[11] || "";
              const statusClass = getStatusClass(situacao);
              const statusLabel = getStatusLabel(situacao);
              const isExpanded = expandedIndex === rowIndex;
              const isManaging = manageIndex === rowIndex;

              const unitName = unit[2] || "—";
              const tipologia = unit[4] || "—";
              const bloco = unit[3] || "—";
              const areaPrivativa = unit[5] || "—";
              const cliente = unit[7] || "—";
              const corretor = unit[9] || "—";
              const motivo = unit[19] || "";

              return (
                <div
                  key={rowIndex}
                  className={`mobile-unit-card ${isExpanded ? "expanded" : ""}`}
                >
                  {/* Header do card */}
                  <div
                    className="mobile-card-header"
                    onClick={() => {
                      if (isSelectionMode && statusClass === "disponivel") {
                        onToggleUnitSelection(rowIndex);
                      } else {
                        toggleExpand(rowIndex);
                      }
                    }}
                  >
                    {isSelectionMode && statusClass === "disponivel" && (
                      <input
                        type="checkbox"
                        className="mobile-card-checkbox"
                        checked={selectedUnits.has(rowIndex)}
                        onChange={() => onToggleUnitSelection(rowIndex)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <span className="mobile-card-unit-name">{unitName}</span>
                    <span className={`mobile-card-status ${statusClass}`}>
                      {statusLabel}
                    </span>
                    <span
                      className={`mobile-card-chevron ${isExpanded ? "open" : ""}`}
                    >
                      <FiChevronDown />
                    </span>
                  </div>

                  {/* Body expandido */}
                  <div
                    className={`mobile-card-body ${isExpanded ? "open" : ""}`}
                  >
                    <div className="mobile-card-details">
                      <div className="mobile-detail-row">
                        <span className="mobile-detail-label">Bloco</span>
                        <span className="mobile-detail-value">{bloco}</span>
                      </div>
                      <div className="mobile-detail-row">
                        <span className="mobile-detail-label">Tipologia</span>
                        <span className="mobile-detail-value">{tipologia}</span>
                      </div>
                      <div className="mobile-detail-row">
                        <span className="mobile-detail-label">Área</span>
                        <span className="mobile-detail-value">
                          {areaPrivativa}
                        </span>
                      </div>
                      {statusClass === "reservada" && (
                        <>
                          <div className="mobile-detail-row">
                            <span className="mobile-detail-label">
                              Cliente
                            </span>
                            <span className="mobile-detail-value">
                              {cliente}
                            </span>
                          </div>
                          <div className="mobile-detail-row">
                            <span className="mobile-detail-label">
                              Corretor
                            </span>
                            <span className="mobile-detail-value">
                              {corretor}
                            </span>
                          </div>
                        </>
                      )}
                      {statusClass === "bloqueada" && motivo && (
                        <div className="mobile-block-reason">
                          Motivo: {motivo}
                        </div>
                      )}
                    </div>

                    {/* Ações do card */}
                    <div className="mobile-card-actions">
                      {/* Histórico — sempre disponível */}
                      <button
                        className="mobile-action-btn history"
                        onClick={(e) => {
                          e.stopPropagation();
                          onHistoryClick(unitName);
                        }}
                        title="Histórico"
                      >
                        <FiClock />
                      </button>

                      {/* DISPONÍVEL: Reservar + Bloquear */}
                      {statusClass === "disponivel" && (
                        <>
                          <button
                            className="mobile-action-btn reserve"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnitClick(rowIndex);
                            }}
                          >
                            <FiUserPlus size={14} />
                            Reservar
                          </button>
                          <button
                            className="mobile-action-btn block"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBlockClick(rowIndex);
                            }}
                            title="Bloquear"
                          >
                            <FiLock />
                          </button>
                        </>
                      )}

                      {/* RESERVADA: Gerenciar / ações internas */}
                      {statusClass === "reservada" && !isManaging && (
                        <>
                          <button
                            className="mobile-action-btn manage"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManageIndex(rowIndex);
                            }}
                          >
                            <FiRefreshCw size={14} />
                            Gerenciar
                          </button>
                          <button
                            className="mobile-action-btn pix"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPixClick(rowIndex);
                            }}
                            title="PIX"
                          >
                            PIX
                          </button>
                        </>
                      )}

                      {/* RESERVADA em modo gerenciar */}
                      {statusClass === "reservada" && isManaging && (
                        <>
                          {isProcessing ? (
                            <span
                              style={{
                                color: "#f59e0b",
                                fontSize: "0.78rem",
                                padding: "8px",
                              }}
                            >
                              ⏳ Processando pagamento...
                            </span>
                          ) : (
                            <>
                              <button
                                className="mobile-action-btn"
                                style={{
                                  background: "rgba(59,130,246,0.15)",
                                  color: "#3b82f6",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeUnitClick(rowIndex);
                                }}
                                disabled={!canChangeOrCancel}
                              >
                                <FiRefreshCw size={14} />
                                Trocar
                              </button>
                              <button
                                className="mobile-action-btn"
                                style={{
                                  background: "rgba(239,68,68,0.15)",
                                  color: "#ef4444",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUnitClick(rowIndex);
                                }}
                                disabled={!canChangeOrCancel}
                              >
                                Cancelar
                              </button>
                              <button
                                className="mobile-action-btn"
                                style={{
                                  background: "rgba(245,158,11,0.15)",
                                  color: "#f59e0b",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPaymentClick(rowIndex);
                                }}
                                disabled={isPaymentProcessed}
                              >
                                <FiDollarSign size={14} />
                                Pagto
                              </button>
                              <button
                                className="mobile-action-btn history"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setManageIndex(null);
                                }}
                                title="Voltar"
                                style={{ color: "#ef4444" }}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {/* BLOQUEADA: Desbloquear */}
                      {statusClass === "bloqueada" && (
                        <button
                          className="mobile-action-btn unlock"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBlockClick(rowIndex);
                          }}
                        >
                          <FiUnlock size={14} />
                          Desbloquear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
