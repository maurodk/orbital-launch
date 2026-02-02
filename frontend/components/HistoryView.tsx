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
                {filteredHistory.map((entry, index) => {
                  // Extrai nome do usuário do email (parte antes do @)
                  const userEmail = entry[6] || "";
                  const userName = userEmail.includes("@")
                    ? userEmail.split("@")[0]
                    : userEmail;

                  // Formata a unidade se for troca (substitui -> por seta bonita)
                  const unidadeFormatted = entry[2]?.includes("->")
                    ? entry[2].replace(/\s*->\s*/g, " → ")
                    : entry[2];

                  return (
                    <tr key={index}>
                      <td data-label="Data e Hora">{entry[1]}</td>
                      <td data-label="Unidade">{unidadeFormatted}</td>
                      <td data-label="Ação">
                        <span
                          className={`action-pill action-${entry[3]
                            ?.toLowerCase()
                            .replace(/\s+/g, "-")
                            .replace(/[()]/g, "")}`}
                        >
                          {entry[3]}
                        </span>
                        {/* Se existir reserva_url na coluna H (índice 7), mostra ícone linkado */}
                        {entry[7] && (
                          <a href={entry[7]} target="_blank" rel="noreferrer">
                            <img src="/cvcrm.ico" alt="cvcrm" style={{ width: 16, height: 16, marginLeft: 6 }} onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none'}} />
                          </a>
                        )}
                      </td>
                      <td data-label="Cliente">{entry[4]}</td>
                      <td data-label="Corretor">{entry[5]}</td>
                      <td data-label="Usuário">{userName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-history">
            Nenhum registro de histórico encontrado com os filtros aplicados.
          </p>
        )}
      </div>
      <style>{`
        .history-search-wrapper { position:relative; display:flex; gap:8px; align-items:center; margin-bottom:12px; }
        .history-search-wrapper .search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9aa0a6; pointer-events:none; }
        .history-search-wrapper .search-input { flex:1; padding:8px 10px 8px 40px; border-radius:8px; background:#111; border:1px solid #272727; color:#e6e6e6; }

        .history-table { width:100%; border-collapse:collapse; }
        .history-table thead th { text-align:left; font-size:12px; color:#9aa0a6; padding:10px 8px; }
        .history-table tbody td { padding:10px 8px; border-top:1px solid rgba(255,255,255,0.03); color:#e6e6e6; font-size:14px; }

        .action-pill { display:inline-block; padding:6px 12px; border-radius:999px; font-weight:700; font-size:0.85rem; color:#fff; background:#2a2a2a; }
        .action-pill.action-reserva-processada-worker { background: linear-gradient(180deg,#16a34a,#15803d); box-shadow: 0 2px 8px rgba(22,163,74,0.3); }
        .action-pill.action-erro-ao-processar-reserva-worker { background: linear-gradient(180deg,#ef4444,#dc2626); box-shadow: 0 2px 8px rgba(239,68,68,0.4); animation: pulse-error 2s infinite; }
        .action-pill.action-pagamento-registrado { background: linear-gradient(180deg,#f59e0b,#d97706); box-shadow: 0 2px 8px rgba(245,158,11,0.3); }
        .action-pill.action-reserva-criada { background: linear-gradient(180deg,#10b981,#059669); }
        .action-pill.action-reserva-cancelada { background: linear-gradient(180deg,#f43f5e,#e11d48); }
        .action-pill.action-unidade-bloqueada { background: linear-gradient(180deg,#f97316,#ea580c); }
        .action-pill.action-unidade-desbloqueada { background: linear-gradient(180deg,#14b8a6,#0d9488); }
        .action-pill.action-troca-de-unidade { background: linear-gradient(180deg,#3b82f6,#2563eb); }
        
        @keyframes pulse-error {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

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
