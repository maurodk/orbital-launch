// frontend/src/components/UnitHistoryModal.tsx

interface UnitHistoryModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  historyForUnit: string[][];
}

export function UnitHistoryModal({
  show,
  onClose,
  unitData,
  historyForUnit,
}: UnitHistoryModalProps) {
  if (!show || !unitData) return null;

  const unitFullName = `${unitData[2]}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          Histórico da Unidade: <strong>{unitFullName}</strong>
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
