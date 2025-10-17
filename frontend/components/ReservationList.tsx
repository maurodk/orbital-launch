// frontend/src/components/ReservationList.tsx - VERSÃO CORRIGIDA

import { useState, useEffect, useRef } from "react";
import { FiSearch, FiLock, FiPrinter, FiClock } from "react-icons/fi";

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
  statusFilter: "all" | "disponível" | "reservada" | "bloqueada";
  setStatusFilter: (
    status: "all" | "disponível" | "reservada" | "bloqueada"
  ) => void;
  totalUnidades: number;
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
}: ReservationListProps) {
  const totalEncontrado = unidades.length;
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Hook para fechar o menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuIndex(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleMenuToggle = (index: number) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
  };

  const handleMenuAction = (action: (index: number) => void, index: number) => {
    action(index);
    setOpenMenuIndex(null); // Fecha o menu após a ação
  };

  return (
    <div className="reservation-list-container">
      {/* O cabeçalho e os filtros permanecem os mesmos */}
      <div className="list-filters-header">
        <div className="search-input-wrapper">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por unidade ou bloco..."
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
            className={statusFilter === "disponível" ? "active" : ""}
            onClick={() => setStatusFilter("disponível")}
          >
            Disponíveis
          </button>
          <button
            className={statusFilter === "reservada" ? "active" : ""}
            onClick={() => setStatusFilter("reservada")}
          >
            Reservadas
          </button>
          <button
            className={statusFilter === "bloqueada" ? "active" : ""}
            onClick={() => setStatusFilter("bloqueada")}
          >
            Bloqueadas
          </button>
        </div>
      </div>

      <div className="results-counter">
        <p>
          Exibindo <strong>{totalEncontrado}</strong> de{" "}
          <strong>{totalUnidades}</strong> unidades.
        </p>
      </div>

      {/* A tabela com a lógica corrigida */}
      <div className="table-wrapper">
        <table className="reservation-table">
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Bloco</th>
              <th>Status</th>
              <th>Cliente</th>
              <th>Corretor</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {unidades.length > 0 ? (
              unidades.map(([unitData, originalIndex]) => {
                const status = unitData[10]?.toLowerCase() || "disponível";
                const isAvailable = status === "disponível";
                const isReserved = status === "reservada";
                const paymentStatus = unitData[16]?.toUpperCase(); // Coluna Q
                const clientName = unitData[6] || "—";
                const brokerName = unitData[8] || "—";

                return (
                  <tr key={unitData[2] || originalIndex}>
                    <td>{unitData[2]}</td>
                    <td>{unitData[1]}</td>
                    <td>
                      <span className={`status-pill ${status}`}>
                        {unitData[10]}
                      </span>
                    </td>
                    <td>{clientName}</td>
                    <td>{brokerName}</td>
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
                              onClick={() => onUnitClick(originalIndex)}
                            >
                              Reservar
                            </button>
                            <button
                              className="reserve-button-in-table spontaneous"
                              onClick={() => onSpontaneousClick(originalIndex)}
                            >
                              Espontâneo
                            </button>
                            <button
                              className="block-button-in-table"
                              title="Bloquear Unidade"
                              onClick={() => onBlockClick(originalIndex)}
                            >
                              <FiLock size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className="manage-menu-container"
                              ref={
                                openMenuIndex === originalIndex ? menuRef : null
                              }
                            >
                              <button
                                className="reserve-button-in-table manage"
                                onClick={() => handleMenuToggle(originalIndex)}
                              >
                                Gerenciar
                              </button>
                              {openMenuIndex === originalIndex && (
                                <div className="manage-dropdown-menu">
                                  <button
                                    onClick={() =>
                                      handleMenuAction(
                                        onChangeUnitClick,
                                        originalIndex
                                      )
                                    }
                                  >
                                    Trocar Unidade
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleMenuAction(
                                        onUnitClick,
                                        originalIndex
                                      )
                                    }
                                  >
                                    Cancelar Reserva
                                  </button>
                                </div>
                              )}
                            </div>
                            {isReserved &&
                              (paymentStatus === "PAGO" ? (
                                <button
                                  className="print-button-in-table"
                                  title="Imprimir Termo de Reserva"
                                  onClick={() => onPrintClick(originalIndex)}
                                >
                                  <FiPrinter size={16} />
                                </button>
                              ) : (
                                <button
                                  className="pix-button-in-table" // Estilo a ser criado
                                  title="Gerar PIX para Pagamento"
                                  onClick={() => onPixClick(originalIndex)}
                                >
                                  <img src="/pix.png" alt="PIX" />
                                </button>
                              ))}
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
  );
}
