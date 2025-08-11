// frontend/components/ReservationList.tsx - VERSÃO COMPLETA E CORRIGIDA

import { FiSearch } from "react-icons/fi";

// A interface de props correta para este componente
interface ReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onSpontaneousClick: (unitIndex: number) => void; // Prop para o novo botão
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: "all" | "disponível" | "reservada";
  setStatusFilter: (status: "all" | "disponível" | "reservada") => void;
  totalUnidades: number;
}

// A função que estava faltando, agora completa e exportada
export function ReservationList({
  unidades,
  onUnitClick,
  onSpontaneousClick,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  totalUnidades,
}: ReservationListProps) {
  const totalEncontrado = unidades.length;

  return (
    <div className="reservation-list-container">
      {/* --- SEÇÃO DE FILTROS E BUSCA --- */}
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
        </div>
      </div>

      {/* --- CONTADOR DE RESULTADOS --- */}
      <div className="results-counter">
        <p>
          Exibindo <strong>{totalEncontrado}</strong> de{" "}
          <strong>{totalUnidades}</strong> unidades.
        </p>
      </div>

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
                const status = unitData[9]?.toLowerCase() || "disponível";
                const isAvailable = status === "disponível";
                const clientName = unitData[5] || "—";

                return (
                  <tr key={unitData[3] || originalIndex}>
                    <td>{unitData[3]}</td>
                    <td>{unitData[2]}</td>
                    <td>
                      <span className={`status-pill ${status}`}>
                        {unitData[9]}
                      </span>
                    </td>
                    <td>{clientName}</td>
                    <td>
                      {isAvailable ? (
                        <div className="action-buttons-cell">
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
                        </div>
                      ) : (
                        <button
                          className="reserve-button-in-table reserved"
                          onClick={() => onUnitClick(originalIndex)}
                        >
                          Gerenciar
                        </button>
                      )}
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
