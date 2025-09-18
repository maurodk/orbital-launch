// frontend/src/components/UnitHistoryModal.tsx

import { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";

interface UnitHistoryModalProps {
  show: boolean;
  onClose: () => void;
  unitName: string | null; // <-- MUDANÇA: Recebe o nome da unidade para filtrar
  fullHistory: string[][]; // <-- MUDANÇA: Recebe o histórico completo
}

export function UnitHistoryModal({
  show,
  onClose,
  unitName,
  fullHistory,
}: UnitHistoryModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filtra o histórico para mostrar apenas as entradas da unidade selecionada
  const historyForUnit = useMemo(() => {
    if (!unitName) return [];

    const unitHistory = fullHistory.filter((entry) => entry[2] === unitName);

    if (!searchTerm.trim()) {
      return unitHistory;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    return unitHistory.filter((entry) =>
      // Busca na Ação (3), Cliente (4), Corretor (5), e Usuário (6)
      [entry[3], entry[4], entry[5], entry[6]].some((field) =>
        field?.toLowerCase().includes(lowercasedTerm)
      )
    );
  }, [fullHistory, unitName, searchTerm]);

  if (!show || !unitName) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content history-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          Histórico da Unidade: <strong>{unitName}</strong>
        </h2>

        <div className="history-search-wrapper">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Filtrar por ação, cliente, corretor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="history-modal-body">
          {historyForUnit.length > 0 ? (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Data e Hora</th>
                  <th>Ação</th>
                  <th>Cliente</th>
                  <th>Corretor</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {historyForUnit.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry[1]}</td>
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
          ) : (
            <p className="no-history-message">
              Nenhum histórico encontrado para esta unidade.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
