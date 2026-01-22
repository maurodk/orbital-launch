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
                    <td data-label="Data e Hora">{entry[1]}</td>
                    <td data-label="Ação">
                      <span
                        className={`action-pill action-${entry[3]
                          ?.toLowerCase()
                          .replace(/\s+/g, "-")
                          .replace(/[()]/g, "")}`}
                      >
                        {entry[3]}
                      </span>
                    </td>
                    <td data-label="Cliente">{entry[4]}</td>
                    <td data-label="Corretor">{entry[5]}</td>
                    <td data-label="Usuário">{entry[6]}</td>
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
      <style>{`
        .history-modal-content { max-width:900px; width:96%; padding:20px; }
        .history-search-wrapper { position:relative; display:flex; gap:8px; align-items:center; margin-bottom:12px; }
        .history-search-wrapper .search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9aa0a6; pointer-events:none; }
        .history-search-wrapper .search-input { flex:1; padding:8px 10px 8px 40px; border-radius:8px; background:#121212; border:1px solid #272727; color:#e6e6e6; }

        .history-table { width:100%; border-collapse:collapse; }
        .history-table thead th { text-align:left; font-size:12px; color:#9aa0a6; padding:10px 8px; }
        .history-table tbody td { padding:10px 8px; border-top:1px solid rgba(255,255,255,0.03); color:#e6e6e6; font-size:14px; }

        .action-pill { display:inline-block; padding:6px 12px; border-radius:999px; font-weight:700; font-size:0.85rem; color:#fff; background:#2a2a2a; }
        .action-pill.action-reserva-processada-worker { background: linear-gradient(180deg,#16a34a,#15803d); }
        .action-pill.action-erro-ao-processar-reserva-worker { background: linear-gradient(180deg,#ef4444,#dc2626); }
        .action-pill.action-pagamento-registrado { background: linear-gradient(180deg,#f59e0b,#d97706); }

        @media (max-width:640px) {
          .history-table thead { display:none; }
          .history-table, .history-table tbody, .history-table tr, .history-table td { display:block; width:100%; }
          .history-table tr { margin-bottom:12px; background:#0d0d0d; padding:12px; border-radius:10px; }
          .history-table td { padding:6px 0; border:none; }
          .history-table td:before { content: attr(data-label); display:block; font-size:12px; color:#9aa0a6; margin-bottom:6px; }
        }
      `}</style>
    </div>
  );
}
