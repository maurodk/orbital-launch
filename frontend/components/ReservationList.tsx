// src/components/ReservationList.tsx

// src/components/ReservationList.tsx

interface ReservationListProps {
  unidades: string[][];
  // MUDANÇA: Renomeando a prop para ser mais genérica,
  // pois agora ela vai lidar tanto com reserva quanto com cancelamento.
  onUnitClick: (unitIndex: number) => void;
}

export function ReservationList({
  unidades,
  onUnitClick, // Usando a nova prop
}: ReservationListProps) {
  return (
    <div className="reservation-list-container">
      <table className="reservation-table">
        <thead>
          <tr>
            <th>Unidade</th>
            <th>Bloco</th>
            <th>Status</th>
            <th>Cliente</th>{" "}
            {/* MUDANÇA: Adicionando coluna do cliente para contexto */}
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((unidade, index) => {
            const status = unidade[9]?.toLowerCase() || "disponível";
            const isAvailable = status === "disponível";
            const clientName = unidade[5] || "—"; // Pega o nome do cliente da coluna F (índice 5)

            return (
              <tr key={unidade[3] || index}>
                <td>{unidade[3]}</td>
                <td>{unidade[2]}</td>
                <td>
                  <span className={`status-pill ${status}`}>{unidade[9]}</span>
                </td>
                <td>{clientName}</td> {/* Exibe o nome do cliente */}
                <td>
                  <button
                    // MUDANÇA: O botão agora se adapta para "Reservar" ou "Gerenciar"
                    className={`reserve-button-in-table ${
                      !isAvailable ? "reserved" : ""
                    }`}
                    onClick={() => onUnitClick(index)} // MUDANÇA: Chama a função onUnitClick
                  >
                    {isAvailable ? "Reservar" : "Gerenciar"}
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
