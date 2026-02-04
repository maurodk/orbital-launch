// frontend/src/components/ReservationList.tsx - VERSÃO CORRIGIDA

import { useState, useEffect } from "react";
import { supabase } from "../src/supabaseClient";
import {
  FiSearch,
  FiLock,
  FiUnlock,
  FiPrinter,
  FiClock,
  FiUserPlus,
  FiEdit,
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
  const [isPaymentProcessed, setIsPaymentProcessed] = useState(false);
  const [canChangeOrCancel, setCanChangeOrCancel] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Verifica se o pagamento já foi processado com sucesso pelo worker
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!showManageModal || selectedUnitIndex === null) {
        setIsPaymentProcessed(false);
        setCanChangeOrCancel(true);
        setIsProcessing(false);
        return;
      }

      const unitTuple = unidades.find(([, idx]) => idx === selectedUnitIndex);
      if (!unitTuple) return;

      const [unitData] = unitTuple;
      const unitName = unitData[2]; // Coluna C - nome_unidade
      const paymentStatus = (unitData[20] || '').toString().toLowerCase(); // Coluna U - status pagamento

      // Verifica se está em processamento
      if (paymentStatus === 'processando') {
        setIsProcessing(true);
        setIsPaymentProcessed(false);
        return;
      }

      setIsProcessing(false);

      try {
        // Busca as últimas ações no histórico para esta unidade (ordenado por mais recente)
        const { data, error } = await supabase
          .from("historico")
          .select("acao, timestamp_iso")
          .eq("unidade_nome", unitName)
          .order("timestamp_iso", { ascending: false })
          .limit(10); // Pega as 10 últimas ações para ter contexto suficiente

        if (error) {
          console.error("Erro ao verificar histórico:", error);
          setIsPaymentProcessed(false);
          return;
        }

        if (!data || data.length === 0) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const paymentAction = "Pagamento Registrado";
        const workerProcessAction = "Reserva processada (Worker)";
        
        // Ações que resetam completamente o ciclo
        const fullResetActions = ["Cancelada", "Reservada"];
        
        // Encontra índices das ações relevantes
        const paymentIndex = data.findIndex(h => h.acao === paymentAction);
        const workerProcessIndex = data.findIndex(h => h.acao === workerProcessAction);
        
        // Se não há pagamento registrado, tudo liberado
        if (paymentIndex === -1) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }
        
        // Verifica se há reset completo ANTES do pagamento (mais recente)
        const hasFullResetBeforePayment = data.slice(0, paymentIndex).some(h => 
          fullResetActions.includes(h.acao)
        );
        
        // Se houver reset completo, libera tudo
        if (hasFullResetBeforePayment) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }
        
        // Há pagamento sem reset completo posterior
        // Botão de pagamento fica desabilitado se há "Pagamento Registrado" ou "Reserva processada (Worker)"
        const hasWorkerProcessBeforePayment = workerProcessIndex !== -1 && workerProcessIndex < paymentIndex;
        setIsPaymentProcessed(true); // Sempre desabilita o botão de pagamento
        
        // Botões de trocar/cancelar: libera se há "Reserva processada (Worker)" DEPOIS do pagamento
        setCanChangeOrCancel(hasWorkerProcessBeforePayment);
      } catch (err) {
        console.error("Erro ao verificar status do pagamento:", err);
        setIsPaymentProcessed(false);
      }
    };

    checkPaymentStatus();
  }, [showManageModal, selectedUnitIndex, unidades]);

  // ReservationList: no debug logs — presentation only (history drives status visibility)

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
        <div className="selection-mode-controls">
          <button
            onClick={onToggleSelectionMode}
            className="selection-mode-button"
          >
            {isSelectionMode
              ? `Seleção: ${selectedUnits.size} unidade(s)`
              : "Seleção em Cadeia"}
          </button>

          {isSelectionMode && selectedUnits.size > 0 && (
            <button
              onClick={onBulkBlock}
              className="bulk-block-button"
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
            <colgroup>
              {isSelectionMode && <col style={{ width: 40 }} />}
              <col style={{ width: 220 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 220 }} />
            </colgroup>
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
            <tbody data-reservation-list="true" data-count={unidades.length}>
              {unidades.length > 0 ? (
                <>
                  {unidades.map(([unitData, originalIndex]) => {
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
                  const paymentStatus = unitData[20]?.toUpperCase(); // Coluna U? - Pagamento (alinhado com SSE / merged[20])
                  const clientName = unitData[7] || "—"; // Coluna H - cliente
                  const brokerName = unitData[9] || "—"; // Coluna J - corretor
                  const tipologia = unitData[4] || "—"; // Coluna E - tipologia
                  const motivo = unitData[19] || ""; // Coluna T - motivo (assumindo que está nessa posição)

                  return (
                    <tr key={`unit-${originalIndex}`}>
                      {isSelectionMode && (
                        <td className="selection-cell">
                          <input
                            type="checkbox"
                            checked={selectedUnits.has(originalIndex)}
                            onChange={() => onToggleUnitSelection(originalIndex)}
                            aria-label={`Selecionar ${unitData[2]}`}
                            className="selection-checkbox"
                          />
                        </td>
                      )}

                      <td className="unit-cell">
                        <span className="unit-name" title={unitData[2]}>{unitData[2]}</span>
                      </td>

                      <td className="typology-cell">{tipologia}</td>

                      <td className="status-cell">
                        <div className="status-inner">
                          <span className={`status-badge ${normalizedStatus}`}>{rawStatus}</span>
                        </div>
                      </td>
                      {isBlocked && motivo ? (
                        <td colSpan={2} className="blocked-cell">
                          <strong>Motivo do bloqueio:</strong>&nbsp;{motivo}
                        </td>
                      ) : (
                        <>
                          <td className="client-cell">{clientName}</td>
                          <td className="broker-cell">{brokerName}</td>
                        </>
                      )}

                      <td className="action-cell">
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
                })}
                </>
              ) : (
                <tr>
                  <td colSpan={isSelectionMode ? 7 : 6} className="no-results-message">
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
              <p className="manage-modal-subtitle">
                {isProcessing 
                  ? "⏳ Processamento em andamento... Aguarde a conclusão do worker." 
                  : isPaymentProcessed 
                  ? "Plano de pagamento já foi processado. Você pode trocar de unidade ou cancelar a reserva." 
                  : "Selecione uma ação para a unidade selecionada"
                }
              </p>
            </div>
            
            <div className="manage-actions-grid">
              <button
                className="manage-action-card payment"
                disabled={isPaymentProcessed || isProcessing}
                onClick={() => {
                  if (isPaymentProcessed || isProcessing) return;
                  onPaymentClick(selectedUnitIndex);
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                <div className="action-icon-wrapper"><FiDollarSign size={24} /></div>
                <div className="action-details">
                  <span className="action-title">Pagamento</span>
                  <span className="action-desc">
                    {isProcessing 
                      ? "Aguarde o processamento..." 
                      : isPaymentProcessed 
                      ? "Plano já foi processado" 
                      : "Registrar ou visualizar pagamentos"
                    }
                  </span>
                </div>
              </button>

              <button
                className="manage-action-card change"
                disabled={!canChangeOrCancel || isProcessing}
                onClick={() => {
                  if (!canChangeOrCancel || isProcessing) return;
                  onChangeUnitClick(selectedUnitIndex);
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                <div className="action-icon-wrapper"><FiRefreshCw size={24} /></div>
                <div className="action-details">
                  <span className="action-title">Trocar Unidade</span>
                  <span className="action-desc">
                    {isProcessing 
                      ? "Aguarde o processamento..." 
                      : !canChangeOrCancel 
                      ? "Aguarde o processamento do plano" 
                      : "Mover reserva para outra unidade"
                    }
                  </span>
                </div>
              </button>

              <button
                className="manage-action-card cancel"
                disabled={!canChangeOrCancel || isProcessing}
                onClick={() => {
                  if (!canChangeOrCancel || isProcessing) return;
                  // Trigger cancel reservation flow
                  // Find the tuple with matching originalIndex
                  const unitTuple = unidades.find(([, idx]) => idx === selectedUnitIndex);
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
                  <span className="action-desc">
                    {isProcessing 
                      ? "Aguarde o processamento..." 
                      : !canChangeOrCancel 
                      ? "Aguarde o processamento do plano" 
                      : "Liberar unidade para venda"
                    }
                  </span>
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
            .manage-action-card:disabled,
            .manage-action-card[disabled] {
              opacity: 0.5;
              cursor: not-allowed;
              transform: none;
            }
            .manage-action-card:disabled:hover,
            .manage-action-card[disabled]:hover {
              transform: none;
              border-color: #333;
              background: #2a2a2a;
            }
            .manage-action-card:disabled .action-icon-wrapper,
            .manage-action-card[disabled] .action-icon-wrapper {
              opacity: 0.6;
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
      {/* Local table styles to keep rows aligned */}
      <style>{`
        /* Container principal */
        .reservation-list-container {
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .list-filters-sticky {
          flex-shrink: 0;
        }

        .table-scroll-container {
          flex: 1;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 768px) {
          .reservation-list-container {
            font-size: 12px;
          }
        }

        @media (max-width: 640px) {
          .reservation-list-container {
            font-size: 11px;
          }
        }

        @media (max-width: 480px) {
          .reservation-list-container {
            font-size: 10px;
          }
        }

        /* Controles de modo de seleção */
        .selection-mode-controls {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .selection-mode-button {
          padding: 8px 12px;
          background-color: #2a2a2a;
          color: #ffffff;
          border: 1px solid #444;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: bold;
          transition: all 0.2s;
        }

        .selection-mode-button:hover {
          background-color: #333;
        }

        .selection-mode-button.active,
        button.selection-mode-button:has([data-selected]) {
          background-color: #6ad700;
          border-color: #6ad700;
        }

        .bulk-block-button {
          padding: 8px 12px;
          background-color: #ff4444;
          color: #ffffff;
          border: 1px solid #ff4444;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: bold;
          transition: all 0.2s;
        }

        .bulk-block-button:hover {
          background-color: #ff5555;
        }

        @media (max-width: 768px) {
          .selection-mode-controls {
            gap: 8px;
            margin-top: 8px;
          }
          .selection-mode-button,
          .bulk-block-button {
            padding: 6px 10px;
            font-size: 10px;
          }
        }

        @media (max-width: 640px) {
          .selection-mode-controls {
            gap: 6px;
            margin-top: 6px;
          }
          .selection-mode-button,
          .bulk-block-button {
            padding: 5px 8px;
            font-size: 9px;
            flex: 1 1 auto;
          }
        }

        @media (max-width: 480px) {
          .selection-mode-button,
          .bulk-block-button {
            padding: 4px 6px;
            font-size: 8px;
            min-width: 0;
          }
        }

        .reservation-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .reservation-table th,
        .reservation-table td {
          vertical-align: middle;
          padding: 12px 16px;
          line-height: 1.2;
          overflow: hidden;
        }

        .reservation-table thead th {
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
          padding: 14px 16px;
        }

        /* Ajustes de alinhamento por coluna para que o header fique centralizado
           visualmente alinhado com as linhas de dados */
        .unit-cell { text-align: left; }
        .typology-cell { text-align: left; }
        .client-cell, .broker-cell { text-align: left; }
        .status-cell { text-align: center; }
        .action-cell { text-align: center; }

        .reservation-table th, .reservation-table td {
          box-sizing: border-box;
        }

        .selection-cell { width: 40px; text-align: center; }
        .selection-checkbox { width: 16px; height: 16px; cursor: pointer; }

        .unit-cell { min-width: 220px; }
        .unit-content { display: inline-flex; align-items: center; gap: 8px; }
        .unit-name { display: inline-block; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 500; color: #d6d6d6; }
        .cvcrm-icon { width: 16px; height: 16px; display: inline-block; }

        .typology-cell { max-width: 240px; white-space: normal; word-break: break-word; }

        .status-cell { text-align: center; width: 140px; }
        .status-inner { display: flex; align-items: center; justify-content: center; }
        .status-badge { display: inline-flex; align-items: center; justify-content: center; height: 28px; padding: 4px 10px; border-radius: 6px; font-size: 12px; }

        .client-cell, .broker-cell { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .blocked-cell { background-color: #3a2a2a; font-style: italic; color: #ffa500; padding: 12px; text-align: left; border-left: 3px solid #ffa500; }

        .action-cell { width: 220px; }
        .action-buttons-cell { display: flex; gap: 8px; align-items: center; justify-content: center; }

        /* Tablets e telas médias (paisagem móvel) */
        @media (max-width: 1024px) {
          .reservation-table th, .reservation-table td { padding: 8px 10px; font-size: 13px; }
          .reservation-table thead th { font-size: 11px; padding: 10px 8px; }
          .unit-cell { min-width: 140px; }
          .unit-name { max-width: 140px; font-size: 13px; }
          .typology-cell { max-width: 180px; font-size: 12px; }
          .status-cell { width: 110px; }
          .status-badge { height: 24px; padding: 3px 8px; font-size: 11px; }
          .client-cell, .broker-cell { max-width: 140px; font-size: 12px; }
          .action-cell { width: 180px; }
          .action-buttons-cell { gap: 6px; }
          .action-buttons-cell button { padding: 6px 10px; font-size: 12px; }
          .action-buttons-cell .button-icon { width: 14px; height: 14px; }
        }

        /* Telas médias/pequenas - esconder corretor */
        @media (max-width: 900px) {
          .broker-cell { display: none; }
          .reservation-table thead th:nth-child(6) { display: none; }
          .unit-name { max-width: 120px; font-size: 12px; }
          .client-cell { max-width: 120px; font-size: 12px; }
          .action-cell { width: auto; }
          .action-buttons-cell { flex-wrap: wrap; gap: 5px; }
          .action-buttons-cell button { padding: 5px 8px; min-width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; }
          .action-buttons-cell button .button-text { display: none; }
          .action-buttons-cell .pix-button-in-table img { width: 16px; height: 16px; }
        }

        /* Mobile paisagem - mais compacto */
        @media (max-width: 768px) {
          .reservation-table th, .reservation-table td { padding: 6px 8px; font-size: 12px; }
          .reservation-table thead th { font-size: 10px; padding: 8px 6px; }
          .unit-cell { min-width: 100px; }
          .unit-name { max-width: 100px; font-size: 12px; }
          .typology-cell { max-width: 120px; font-size: 11px; }
          .status-cell { width: 90px; }
          .status-badge { height: 22px; padding: 2px 6px; font-size: 10px; }
          .client-cell { max-width: 100px; font-size: 11px; }
          .action-buttons-cell button { padding: 4px 6px; min-width: 28px; height: 28px; font-size: 11px; }
          .action-buttons-cell .button-icon { width: 13px; height: 13px; }
        }

        /* Mobile retrato - mínimo essencial */
        @media (max-width: 640px) {
          .reservation-table th, .reservation-table td { padding: 5px 6px; font-size: 11px; }
          .reservation-table thead th { font-size: 9px; padding: 6px 4px; }
          .typology-cell { display: none; }
          .reservation-table thead th:nth-child(3) { display: none; }
          .client-cell { display: none; }
          .reservation-table thead th:nth-child(5) { display: none; }
          .unit-cell { min-width: 90px; }
          .unit-name { max-width: 90px; font-size: 11px; }
          .status-cell { width: 80px; }
          .status-badge { height: 20px; padding: 2px 5px; font-size: 9px; }
          .action-buttons-cell { gap: 4px; }
          .action-buttons-cell button { padding: 4px 5px; min-width: 26px; height: 26px; }
          .action-buttons-cell .button-icon { width: 12px; height: 12px; }
          .action-buttons-cell .pix-button-in-table img { width: 14px; height: 14px; }
          .table-wrapper { overflow-x: auto; }
          .blocked-cell { font-size: 10px; padding: 8px; }
        }

        /* Telas muito pequenas */
        @media (max-width: 480px) {
          .reservation-table th, .reservation-table td { padding: 4px 5px; font-size: 10px; }
          .reservation-table thead th { font-size: 8px; padding: 5px 3px; }
          .unit-cell { min-width: 80px; }
          .unit-name { max-width: 80px; font-size: 10px; }
          .status-cell { width: 70px; }
          .status-badge { height: 18px; padding: 1px 4px; font-size: 8px; white-space: nowrap; }
          .action-buttons-cell { gap: 3px; flex-wrap: nowrap; }
          .action-buttons-cell button { padding: 3px 4px; min-width: 24px; height: 24px; }
          .action-buttons-cell .button-icon { width: 11px; height: 11px; }
          .action-buttons-cell .pix-button-in-table img { width: 12px; height: 12px; }
          .selection-cell { width: 30px; }
          .selection-checkbox { width: 14px; height: 14px; }
          .blocked-cell { font-size: 9px; padding: 6px; }
        }
      `}</style>
    </div>
  );
}
