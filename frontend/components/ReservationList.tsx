// src/components/ReservationList.tsx

interface ReservationListProps {
  unidades: string[][];
  onReserveClick: (unitIndex: number) => void;
}

export function ReservationList({
  unidades,
  onReserveClick,
}: ReservationListProps) {
  return (
    <div className="reservation-list-container">
      <table className="reservation-table">
        <thead>
          <tr>
            <th>Unidade</th>
            <th>Bloco</th>
            <th>Status</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((unidade, index) => {
            const status = unidade[10]?.toLowerCase() || "disponível";
            const isAvailable = status === "disponível";

            return (
              <tr key={unidade[3] || index}>
                <td>{unidade[3]}</td>
                <td>{unidade[2]}</td>
                <td>
                  <span className={`status-pill ${status}`}>{unidade[10]}</span>
                </td>
                <td>
                  <button
                    className="reserve-button-in-table"
                    onClick={() => onReserveClick(index)}
                    disabled={!isAvailable}
                  >
                    Reservar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
