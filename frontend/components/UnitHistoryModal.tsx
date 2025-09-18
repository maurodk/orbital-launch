// frontend/src/components/UnitHistoryModal.tsx

import { useMemo } from "react";

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
  // Filtra o histórico para mostrar apenas as entradas da unidade selecionada
  const historyForUnit = useMemo(() => {
    if (!unitName) return [];
    // A coluna 2 (índice 2) no histórico contém o nome da unidade
    return fullHistory.filter((entry) => entry[2] === unitName);
  }, [fullHistory, unitName]);

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
