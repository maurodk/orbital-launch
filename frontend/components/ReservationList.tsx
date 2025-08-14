// frontend/src/components/ReservationList.tsx - VERSÃO CORRIGIDA

import { FiSearch, FiLock, FiPrinter } from "react-icons/fi";

interface ReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onSpontaneousClick: (unitIndex: number) => void;
  onBlockClick: (unitIndex: number) => void;
  onPrintClick: (unitIndex: number) => void; // Prop agora será usada
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
  onBlockClick,
  onPrintClick, // Agora está sendo usado
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  totalUnidades,
}: ReservationListProps) {
  const totalEncontrado = unidades.length;

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
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {unidades.length > 0 ? (
              unidades.map(([unitData, originalIndex]) => {
                const status = unitData[10]?.toLowerCase() || "disponível";
                const isAvailable = status === "disponível";
                const isReserved = status === "reservada"; // Variável agora será usada
                const clientName = unitData[6] || "—";

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
                    <td>
                      <div className="action-buttons-cell">
                        {isAvailable ? (
                          // Botões para unidades disponíveis
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
                          // Botões para unidades não disponíveis (Reservada ou Bloqueada)
                          <>
                            <button
                              className="reserve-button-in-table reserved"
                              onClick={() => onUnitClick(originalIndex)}
                            >
                              Gerenciar
                            </button>
                            {/* **CORREÇÃO AQUI**: Mostra o botão de impressão APENAS se estiver reservada */}
                            {isReserved && (
                              <button
                                className="print-button-in-table"
                                title="Imprimir Termo de Reserva"
                                onClick={() => onPrintClick(originalIndex)} // **CORREÇÃO AQUI**: Chama a função
                              >
                                <FiPrinter size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="no-results-message">
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
