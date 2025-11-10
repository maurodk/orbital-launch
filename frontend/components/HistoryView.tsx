// frontend/components/HistoryView.tsx

import { useState, useMemo } from "react";
import { FiSearch } from "react-icons/fi";

interface HistoryViewProps {
  history: string[][];
}

export function HistoryView({ history }: HistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHistory = useMemo(() => {
    if (!searchTerm.trim()) {
      return history;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    return history.filter((entry) =>
      // Busca na Unidade(2), Ação(3), Cliente(4), Corretor(5), e Usuário(6)
      [entry[2], entry[3], entry[4], entry[5], entry[6]].some((field) =>
        field?.toLowerCase().includes(lowercasedTerm)
      )
    );
  }, [history, searchTerm]);

  return (
    <div className="history-container">
      <div className="history-filters-sticky">
      <div className="history-search-wrapper">
        <FiSearch className="search-icon" />
        <input
          type="text"
          placeholder="Filtrar por unidade, ação, cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      </div>

      <div className="history-scroll-container">
      {filteredHistory.length > 0 ? (
        <div className="table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Data e Hora</th>
                <th>Unidade</th>
                <th>Ação</th>
                <th>Cliente</th>
                <th>Corretor</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((entry, index) => (
                <tr key={index}>
                  <td>{entry[1]}</td>
                  <td>{entry[2]}</td>
                  <td>
                    <span
                      className={`action-pill action-${entry[3]
                        ?.toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[()]/g, "")}`}
                    >
                      {entry[3]}
                    </span>
                  </td>
                  <td>{entry[4]}</td>
                  <td>{entry[5]}</td>
                  <td>{entry[6]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-history">
          Nenhum registro de histórico encontrado com os filtros aplicados.
        </p>
      )}
      </div>
    </div>
  );
}
