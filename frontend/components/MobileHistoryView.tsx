// frontend/components/MobileHistoryView.tsx — Histórico mobile com cards

import { useState, useMemo } from "react";
import { FiSearch } from "react-icons/fi";

interface MobileHistoryViewProps {
  history: string[][];
}

export function MobileHistoryView({ history }: MobileHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHistory = useMemo(() => {
    if (!searchTerm.trim()) return history;
    const term = searchTerm.toLowerCase();
    return history.filter((entry) =>
      [entry[2], entry[3], entry[4], entry[5], entry[6]].some((field) =>
        field?.toLowerCase().includes(term)
      )
    );
  }, [history, searchTerm]);

  const getActionClass = (action: string) => {
    if (!action) return "";
    return `action-${action
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[()]/g, "")}`;
  };

  return (
    <>
      {/* Filtros */}
      <div className="mobile-filters">
        <div className="mobile-search-wrapper">
          <FiSearch className="mobile-search-icon" />
          <input
            type="text"
            className="mobile-search-input"
            placeholder="Filtrar por unidade, ação, cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="mobile-results-counter">
        <strong>{filteredHistory.length}</strong> registros
      </div>

      {/* Lista de cards do histórico */}
      <div className="mobile-content">
        {filteredHistory.length === 0 ? (
          <div className="mobile-empty-state">
            <span className="mobile-empty-icon">📋</span>
            <span className="mobile-empty-text">
              Nenhum registro de histórico encontrado
            </span>
          </div>
        ) : (
          <div className="mobile-history-list">
            {filteredHistory.map((entry, index) => {
              const date = entry[1] || "";
              const unitName = entry[2]?.includes("->")
                ? entry[2].replace(/\s*->\s*/g, " → ")
                : entry[2] || "";
              const action = entry[3] || "";
              const client = entry[4] || "";
              const broker = entry[5] || "";
              const userEmail = entry[6] || "";
              const userName = userEmail.includes("@")
                ? userEmail.split("@")[0]
                : userEmail;
              const reservaUrl = entry[7] || "";

              return (
                <div key={index} className="mobile-history-card">
                  {/* Topo: unidade + ação */}
                  <div className="mobile-history-top">
                    <span className="mobile-history-unit">{unitName}</span>
                    <span
                      className={`mobile-history-action-pill ${getActionClass(action)}`}
                    >
                      {action}
                    </span>
                    {reservaUrl && (
                      <a
                        href={reservaUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img
                          src="/cvcrm.ico"
                          alt="cvcrm"
                          className="mobile-history-cvcrm-link"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </a>
                    )}
                  </div>

                  {/* Detalhes */}
                  <div className="mobile-history-details">
                    {client && (
                      <div className="mobile-history-detail">
                        <span className="mobile-history-detail-label">
                          Cliente:
                        </span>
                        <span className="mobile-history-detail-value">
                          {client}
                        </span>
                      </div>
                    )}
                    {broker && (
                      <div className="mobile-history-detail">
                        <span className="mobile-history-detail-label">
                          Corretor:
                        </span>
                        <span className="mobile-history-detail-value">
                          {broker}
                        </span>
                      </div>
                    )}
                    {userName && (
                      <div className="mobile-history-detail">
                        <span className="mobile-history-detail-label">
                          Usuário:
                        </span>
                        <span className="mobile-history-detail-value">
                          {userName}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Data */}
                  <span className="mobile-history-date">{date}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
