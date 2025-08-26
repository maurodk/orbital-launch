// frontend/src/components/HistoryView.tsx
interface HistoryViewProps {
  history: string[][];
}

export function HistoryView({ history }: HistoryViewProps) {
  if (history.length === 0) {
    return (
      <div className="history-container empty-history">
        <p>Nenhum registro de histórico encontrado para este empreendimento.</p>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>Data e Hora</th>
              <th>Unidade</th>
              <th>Ação</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry, index) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
