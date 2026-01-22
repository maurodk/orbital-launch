// frontend/src/components/ReservationList.tsx - VERSÃO CORRIGIDA

import { useState, useEffect } from "react";
import {
  FiSearch,
  FiLock,
  FiUnlock,
  FiPrinter,
  FiClock,
  FiUserPlus,
  FiEdit,
  FiCheckCircle,
  FiAlertCircle,
  FiDollarSign,
  FiRefreshCw,
  FiTrash2,
} from "react-icons/fi";

interface ReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onHistoryClick: (unitName: string) => void;
  onChangeUnitClick: (unitIndex: number) => void; // <-- NOVO
  onBlockClick: (unitIndex: number) => void;
  onPrintClick: (unitIndex: number) => void;
  onPixClick: (unitIndex: number) => void;
  onPaymentClick: (unitIndex: number) => void; // Nova prop para o botão Pagamento
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: "all" | "Disponível" | "Reservada" | "Bloqueada";
  setStatusFilter: (
    status: "all" | "Disponível" | "Reservada" | "Bloqueada"
  ) => void;
  totalUnidades: number;
  // Seleção em cadeia
  isSelectionMode: boolean;
  selectedUnits: Set<number>;
  onToggleUnitSelection: (unitIndex: number) => void;
  onToggleSelectionMode: () => void;
  onBulkBlock: () => void;
}

export function ReservationList({
  unidades,
  onUnitClick,
  onChangeUnitClick, // <-- NOVO
  onBlockClick,
  onHistoryClick,
  onPrintClick,
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
}: ReservationListProps) {
  const totalEncontrado = unidades.length;
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );

  useEffect(() => {
    try {
      const withStatus = unidades
        .map(([row, idx]) => ({ unit: row[2], status: row[20], idx }))
        .filter((r) => typeof r.status !== "undefined" && r.status !== null && r.status !== "");
      if (withStatus.length > 0) {
        console.debug('[UI DEBUG] ReservationList - unidades with pagamentos_status:', withStatus.slice(0,6));
      } else {
        console.debug('[UI DEBUG] ReservationList - no unidades have pagamentos_status set');
      }
    } catch (e) {
      console.debug('[UI DEBUG] ReservationList - error scanning unidades', e);
    }
  }, [unidades]);

  return (
    <div className="reservation-list-container">
      <div className="list-filters-sticky">
        <div className="list-filters-header">
          <div className="search-input-wrapper">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por unidade, bloco ou tipologia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="status-filter-buttons">
            <button
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => setStatusFilter("all")}
            >
              Todas
            </button>
            <button
              className={statusFilter === "Disponível" ? "active" : ""}
              onClick={() => setStatusFilter("Disponível")}
            >
              Disponíveis
            </button>
            <button
              className={statusFilter === "Reservada" ? "active" : ""}
              onClick={() => setStatusFilter("Reservada")}
            >
              Reservadas
            </button>
            <button
              className={statusFilter === "Bloqueada" ? "active" : ""}
              onClick={() => setStatusFilter("Bloqueada")}
            >
              Bloqueadas
            </button>
          </div>
        </div>

        {/* Botões de seleção em cadeia */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onToggleSelectionMode}
            style={{
              padding: "8px 12px",
              backgroundColor: isSelectionMode ? "#6ad700" : "#2a2a2a",
              color: "#ffffff",
              border: `1px solid ${isSelectionMode ? "#6ad700" : "#444"}`,
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: "bold",
              transition: "all 0.2s",
            }}
          >
            {isSelectionMode
              ? `Seleção: ${selectedUnits.size} unidade(s)`
              : "Seleção em Cadeia"}
          </button>

          {isSelectionMode && selectedUnits.size > 0 && (
            <button
              onClick={onBulkBlock}
              style={{
                padding: "8px 12px",
                backgroundColor: "#ff4444",
                color: "#ffffff",
                border: "1px solid #ff4444",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: "bold",
                transition: "all 0.2s",
              }}
            >
              Bloquear Selecionadas
            </button>
          )}
        </div>

        <div className="results-counter">
          <p>
            Exibindo <strong>{totalEncontrado}</strong> de{" "}
            <strong>{totalUnidades}</strong> unidades.
          </p>
        </div>
      </div>

      <div className="table-scroll-container">
        <div className="table-wrapper">
          <table className="reservation-table">
            <thead>
              <tr>
                {isSelectionMode && <th style={{ width: "40px" }}></th>}
                <th>Unidade</th>
                <th>Tipologia</th>
                <th>Status</th>
                <th>Cliente</th>
                <th>Corretor</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {unidades.length > 0 ? (
                unidades.map(([unitData, originalIndex]) => {
                  // Normaliza status: remove acentos, lowercase, trim
                  const rawStatus = unitData[11] || "Disponível"; // Coluna L - situacao
                  const normalizedStatus = rawStatus
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .trim();

                  const isAvailable = normalizedStatus === "disponivel";
                  const isReserved = normalizedStatus === "reservada";
                  const isBlocked = normalizedStatus === "bloqueada";
                  const paymentStatus = unitData[17]?.toUpperCase(); // Coluna R - Pagamento
                  // Novo: status do worker na tabela pagamentos (coluna 20, S)
                  const workerStatus = unitData[20]?.toLowerCase(); // Ex: 'processado' ou 'erro'
                  const clientName = unitData[7] || "—"; // Coluna H - cliente
                  const brokerName = unitData[9] || "—"; // Coluna J - corretor
                  const tipologia = unitData[4] || "—"; // Coluna E - tipologia
                  const motivo = unitData[19] || ""; // Coluna T - motivo (assumindo que está nessa posição)

                  return (
                    <tr key={unitData[2] || originalIndex}>
                      {isSelectionMode && (
                        <td style={{ textAlign: "center", padding: "8px" }}>
                          <input
                            type="checkbox"
                            checked={selectedUnits.has(originalIndex)}
                            onChange={() =>
                              onToggleUnitSelection(originalIndex)
                            }
                            style={{
                              cursor: "pointer",
                              width: "16px",
                              height: "16px",
                            }}
                          />
                        </td>
                      )}
                      <td>{unitData[2]}</td>
                      <td
                        style={{
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        {tipologia}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          <span className={`status-badge ${normalizedStatus}`}>
                            <span className="status-icon">
                              {isAvailable && <FiCheckCircle title="Disponível" />}
                              {isReserved && (() => {
                                const ws = (workerStatus || "").toLowerCase().trim();
                                if (ws === "processado" || ws === "processed" || ws === "ok") {
                                  return <FiCheckCircle title="Reserva processada no CVCRM" style={{ color: "#10b981" }} />;
                                }
                                if (ws === "erro" || ws === "error" || ws === "failed" || ws === "falha") {
                                  return <FiAlertCircle title="Erro ao processar reserva no CVCRM" style={{ color: "#ef4444" }} />;
                                }
                                // pending / registrado
                                if (ws === "pendente" || ws === "pending" || ws === "registrado") {
                                  return <FiClock title="Processamento pendente" style={{ color: "#f59e0b" }} />;
                                }
                                // fallback: show pending icon subtle
                                return <FiClock title="Processamento pendente" style={{ color: "#f59e0b" }} />;
                              })()}
                              {!isAvailable && !isReserved && <FiAlertCircle title="Status desconhecido" />}
                            </span>
                            <span className="status-text">{rawStatus}</span>
                          </span>
                          {/* REMOVIDO: PixCountdown - não há mais expiração automática */}
                        </div>
                      </td>
                      {isBlocked && motivo ? (
                        <td
                          colSpan={2}
                          style={{
                            backgroundColor: "#3a2a2a",
                            fontStyle: "italic",
                            color: "#ffa500",
                            padding: "12px",
                            textAlign: "left",
                            borderLeft: "3px solid #ffa500",
                          }}
                        >
                          <strong>Motivo do bloqueio:</strong> {motivo}
                        </td>
                      ) : (
                        <>
                          <td>{clientName}</td>
                          <td>{brokerName}</td>
                        </>
                      )}
                      <td>
                        <div className="action-buttons-cell">
                          {/* --- Botão de Histórico (SEMPRE VISÍVEL) --- */}
                          <button
                            className="history-button-in-table"
                            title="Ver Histórico da Unidade"
                            // MUDANÇA: Passa o nome da unidade (unitData[2]) para a função
                            onClick={() => onHistoryClick(unitData[2])}
                          >
                            <FiClock size={16} />
                          </button>

                          {/* --- Botões Condicionais (Reservar, Gerenciar, etc.) --- */}
                          {isAvailable ? (
                            <>
                              <button
                                className="reserve-button-in-table"
                                onClick={() => {
                                  onUnitClick(originalIndex);
                                }}
                              >
                                <FiUserPlus size={16} className="button-icon" />
                                <span className="button-text">Reservar</span>
                              </button>
                              <button
                                className="block-button-in-table"
                                title="Bloquear Unidade"
                                onClick={() => onBlockClick(originalIndex)}
                              >
                                <FiLock size={16} />
                              </button>
                            </>
                          ) : isReserved ? (
                            <>
                              <button
                                className="reserve-button-in-table manage"
                                onClick={() => {
                                  setSelectedUnitIndex(originalIndex);
                                  setShowManageModal(true);
                                }}
                              >
                                <FiEdit size={16} className="button-icon" />
                                <span className="button-text">Gerenciar</span>
                              </button>
                              <button
                                className="print-button-in-table"
                                title="Imprimir Termo de Reserva"
                                onClick={() => onPrintClick(originalIndex)}
                              >
                                <FiPrinter size={16} />
                              </button>
                              {paymentStatus !== "PAGO" && (
                                <button
                                  className="pix-button-in-table"
                                  title="Gerar PIX para Pagamento"
                                  onClick={() => onPixClick(originalIndex)}
                                >
                                  <img src="/pix.png" alt="PIX" />
                                </button>
                              )}
                            </>
                          ) : isBlocked ? (
                            // Quando bloqueada: mostrar apenas o botão de desbloqueio (e histórico já visível)
                            <>
                              <button
                                className="unlock-button-in-table"
                                title={
                                  motivo
                                    ? `Desbloquear Unidade — Motivo: ${motivo}`
                                    : "Desbloquear Unidade"
                                }
                                onClick={() => onBlockClick(originalIndex)}
                              >
                                <FiUnlock size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="reserve-button-in-table manage"
                                onClick={() => {
                                  setSelectedUnitIndex(originalIndex);
                                  setShowManageModal(true);
                                }}
                              >
                                <FiEdit size={16} className="button-icon" />
                                <span className="button-text">Gerenciar</span>
                              </button>
                              <button
                                className="unlock-button-in-table"
                                title={
                                  motivo
                                    ? `Desbloquear Unidade — Motivo: ${motivo}`
                                    : "Desbloquear Unidade"
                                }
                                onClick={() => onBlockClick(originalIndex)}
                              >
                                <FiUnlock size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="no-results-message">
                    Nenhuma unidade encontrada com os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Gerenciar */}
      {showManageModal && selectedUnitIndex !== null && (
        <div
          className="modal-overlay"
          onClick={() => setShowManageModal(false)}
        >
          <div className="modal-content manage-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="manage-modal-header">
              <h2>Gerenciar Unidade</h2>
              <p className="manage-modal-subtitle">Selecione uma ação para a unidade selecionada</p>
            </div>
            
            <div className="manage-actions-grid">
              <button
                className="manage-action-card payment"
                onClick={() => {
                  onPaymentClick(selectedUnitIndex);
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                <div className="action-icon-wrapper"><FiDollarSign size={24} /></div>
                <div className="action-details">
                  <span className="action-title">Pagamento</span>
                  <span className="action-desc">Registrar ou visualizar pagamentos</span>
                </div>
              </button>

              <button
                className="manage-action-card change"
                onClick={() => {
                  onChangeUnitClick(selectedUnitIndex);
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                <div className="action-icon-wrapper"><FiRefreshCw size={24} /></div>
                <div className="action-details">
                  <span className="action-title">Trocar Unidade</span>
                  <span className="action-desc">Mover reserva para outra unidade</span>
                </div>
              </button>

              <button
                className="manage-action-card cancel"
                onClick={() => {
                  // Trigger cancel reservation flow
                  // Find the tuple with matching originalIndex
                  const unitTuple = unidades.find(
                    ([_, idx]) => idx === selectedUnitIndex
                  );
                  if (unitTuple) {
                    const [unitData] = unitTuple;
                    if (unitData && unitData[11] === "Reservada") {
                      // Coluna L - situacao
                      onUnitClick(selectedUnitIndex); // Pass the originalIndex
                    }
                  }
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                <div className="action-icon-wrapper"><FiTrash2 size={24} /></div>
                <div className="action-details">
                  <span className="action-title">Cancelar Reserva</span>
                  <span className="action-desc">Liberar unidade para venda</span>
                </div>
              </button>
            </div>
            
            <button className="modal-close-text-btn" onClick={() => setShowManageModal(false)}>
              Fechar
            </button>
          </div>
          <style>{`
            .manage-modal-content {
              max-width: 600px;
              width: 95%;
              padding: 30px;
              background: #1e1e1e;
              border: 1px solid #333;
            }
            .manage-modal-header {
              text-align: center;
              margin-bottom: 30px;
            }
            .manage-modal-header h2 {
              font-size: 1.5rem;
              margin-bottom: 8px;
              color: #eaeaea;
            }
            .manage-modal-subtitle {
              color: #888;
              font-size: 0.9rem;
              margin: 0;
            }
            .manage-actions-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 15px;
            }
            @media (min-width: 500px) {
              .manage-actions-grid {
                grid-template-columns: 1fr 1fr;
              }
              .manage-action-card.cancel {
                grid-column: span 2;
              }
            }
            .manage-action-card {
              display: flex;
              align-items: center;
              gap: 15px;
              padding: 20px;
              background: #2a2a2a;
              border: 1px solid #333;
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.2s ease;
              text-align: left;
            }
            .manage-action-card:hover {
              transform: translateY(-2px);
              border-color: #444;
              background: #333;
            }
            .action-icon-wrapper {
              width: 48px;
              height: 48px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .manage-action-card.payment .action-icon-wrapper {
              background: rgba(106, 215, 0, 0.1);
              color: #6ad700;
            }
            .manage-action-card.change .action-icon-wrapper {
              background: rgba(59, 130, 246, 0.1);
              color: #3b82f6;
            }
            .manage-action-card.cancel .action-icon-wrapper {
              background: rgba(239, 68, 68, 0.1);
              color: #ef4444;
            }
            .manage-action-card:hover.payment .action-icon-wrapper {
              background: #6ad700;
              color: #121212;
            }
            .manage-action-card:hover.change .action-icon-wrapper {
              background: #3b82f6;
              color: white;
            }
            .manage-action-card:hover.cancel .action-icon-wrapper {
              background: #ef4444;
              color: white;
            }
            .action-details {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .action-title {
              font-weight: 600;
              font-size: 1rem;
              color: #eaeaea;
            }
            .action-desc {
              font-size: 0.8rem;
              color: #888;
            }
            .modal-close-text-btn {
              background: none;
              border: none;
              color: #666;
              width: 100%;
              padding: 15px;
              margin-top: 10px;
              cursor: pointer;
              font-size: 0.9rem;
            }
            .modal-close-text-btn:hover {
              color: #eaeaea;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
