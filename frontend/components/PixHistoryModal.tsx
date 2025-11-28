// frontend/components/PixHistoryModal.tsx

import { useState, useEffect } from "react";
import axios from "axios";
import "./PixHistoryModal.css";

interface PixRecord {
  rowIndex: number;
  dataHora: string;
  cliente: string;
  unidade: string;
  identificador: string;
  payloadEmv: string;
  valor: number;
  statusPagamento: string;
}

interface PixHistoryModalProps {
  show: boolean;
  onClose: () => void;
  implantacao: string;
  cliente: string;
  unidade: string;
}

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";
const apiUrl = AWS_API_URL;

export function PixHistoryModal({
  show,
  onClose,
  implantacao,
  cliente,
  unidade,
}: PixHistoryModalProps) {
  const [pixList, setPixList] = useState<PixRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [valorTotal, setValorTotal] = useState(0);
  const [numeroParcelas, setNumeroParcelas] = useState(0);

  const fetchPixHistory = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${apiUrl}/api/pix/list`, {
        params: { implantacao, cliente, unidade },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPixList(response.data.pixList || []);
      setValorTotal(response.data.valorTotal || 0);
      setNumeroParcelas(response.data.numeroParcelas || 0);
    } catch (error) {
      console.error("Erro ao buscar histórico PIX:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && implantacao && cliente && unidade) {
      fetchPixHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, implantacao, cliente, unidade]);

  if (!show) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const normalized = status?.toUpperCase();
    if (normalized === "PAGO") {
      return <span className="status-badge paid">✓ PAGO</span>;
    }
    return <span className="status-badge pending">⏳ PENDENTE</span>;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content pix-history-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        <h2>Histórico de PIX - {unidade}</h2>
        <p className="pix-history-client">Cliente: {cliente}</p>

        {loading ? (
          <div className="loading-state">Carregando...</div>
        ) : (
          <>
            <div className="pix-summary">
              <div className="summary-item">
                <span className="summary-label">Total de PIX:</span>
                <span className="summary-value">{numeroParcelas}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Valor Total:</span>
                <span className="summary-value total">
                  {formatCurrency(valorTotal)}
                </span>
              </div>
            </div>

            {pixList.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum PIX encontrado para esta unidade.</p>
              </div>
            ) : (
              <div className="pix-list">
                {pixList.map((pix, index) => (
                  <div key={index} className="pix-record">
                    <div className="pix-record-header">
                      <span className="pix-date">{pix.dataHora}</span>
                      {getStatusBadge(pix.statusPagamento)}
                    </div>
                    <div className="pix-record-body">
                      <div className="pix-field">
                        <strong>Valor:</strong> {formatCurrency(pix.valor)}
                      </div>
                      <div className="pix-field">
                        <strong>Identificador:</strong>{" "}
                        <code>{pix.identificador}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button className="modal-close-footer-button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
