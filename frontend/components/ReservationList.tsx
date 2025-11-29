// frontend/src/components/ReservationList.tsx - VERSÃO CORRIGIDA

import { useState } from "react";
import {
  FiSearch,
  FiLock,
  FiUnlock,
  FiPrinter,
  FiClock,
  FiUserPlus,
  FiEdit,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
} from "react-icons/fi";

interface ReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onHistoryClick: (unitName: string) => void;
  onChangeUnitClick: (unitIndex: number) => void; // <-- NOVO
  onSpontaneousClick: (unitIndex: number) => void;
  onBlockClick: (unitIndex: number) => void;
  onPrintClick: (unitIndex: number) => void;
  onPixClick: (unitIndex: number) => void; // Nova prop para o PIX
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
  onSpontaneousClick,
  onChangeUnitClick, // <-- NOVO
  onBlockClick,
  onHistoryClick,
  onPrintClick,
  onPixClick,
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
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );

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
                              {isAvailable && <FiCheckCircle />}
                              {isReserved && <FiXCircle />}
                              {!isAvailable && !isReserved && <FiAlertCircle />}
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
                                  setSelectedUnitIndex(originalIndex);
                                  setShowReserveModal(true);
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

      {/* Modal de Reserva */}
      {showReserveModal && selectedUnitIndex !== null && (
        <div
          className="modal-overlay"
          onClick={() => setShowReserveModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Selecione o Tipo de Reserva</h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button
                className="modal-action-button"
                onClick={() => {
                  onUnitClick(selectedUnitIndex);
                  setShowReserveModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                Apto
              </button>
              <button
                className="modal-action-button"
                onClick={() => {
                  onSpontaneousClick(selectedUnitIndex);
                  setShowReserveModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                Espontâneo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciar */}
      {showManageModal && selectedUnitIndex !== null && (
        <div
          className="modal-overlay"
          onClick={() => setShowManageModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Gerenciar Unidade</h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button
                className="modal-action-button"
                onClick={() => {
                  onChangeUnitClick(selectedUnitIndex);
                  setShowManageModal(false);
                  setSelectedUnitIndex(null);
                }}
              >
                Trocar Unidade
              </button>
              <button
                className="modal-action-button danger"
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
                Cancelar Reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
