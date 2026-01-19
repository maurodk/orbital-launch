// frontend/components/PixHistoryModal.tsx

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import "./PixHistoryModal.css";

interface PixRecord {
  id: string;
  implantacao_id: number | null;
  implantacao_nome: string | null;
  cliente: string | null;
  unidade: string | null;
  identificador: string;
  payload_emv: string;
  valor: number;
  status_pagamento: string | null;
  data_criacao: string | null;
  data_pagamento: string | null;
}

interface PixHistoryModalProps {
  show: boolean;
  onClose: () => void;
  implantacao: string;
  cliente: string;
  unidade: string;
}


// Supabase config
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


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

  // Busca histórico de PIX do Supabase
  const fetchPixHistory = async () => {
    setLoading(true);
    try {
      // Loga os valores usados no filtro
      // eslint-disable-next-line no-console
      console.log("[PixHistoryModal] Filtro cliente:", cliente, "unidade:", unidade);

      let query = supabase
        .from("historico_pix")
        .select("*")
        .order("data_criacao", { ascending: false });

      if (cliente) {
        query = query.eq("cliente", cliente);
      }
      if (implantacao) {
        query = query.eq("implantacao_nome", implantacao);
      }
      if (unidade) {
        query = query.eq("unidade", unidade);
      }

      const { data, error } = await query;
      if (error) throw error;

      // DEBUG: Mostra o que veio do Supabase
      // eslint-disable-next-line no-console
      console.log("[PixHistoryModal] Supabase data:", data);

      if ((data || []).length === 0) {
        // Busca todos os registros para debug
        const { data: allData, error: allError } = await supabase
          .from("historico_pix")
          .select("*")
          .order("data_criacao", { ascending: false });
        // eslint-disable-next-line no-console
        console.log("[PixHistoryModal] TODOS OS REGISTROS historico_pix:", allData);
      }

      // Garante que valor é número
      const parsedData = (data || []).map((item) => ({
        ...item,
        valor: typeof item.valor === "string" ? Number(item.valor.replace(/,/g, ".")) : Number(item.valor)
      }));

      setPixList(parsedData);

      // Calcula totais apenas dos PIX pagos
      const pixPagos = parsedData.filter((pix) => pix.status_pagamento?.toUpperCase() === "PAGO");

      setValorTotal(
        pixPagos.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0)
      );
      setNumeroParcelas(pixPagos.length);
    } catch (error) {
      console.error("Erro ao buscar histórico PIX:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && cliente && unidade) {
      fetchPixHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, cliente, unidade]);

  if (!show) return null;


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };


  const getStatusBadge = (status: string | null) => {
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
                {pixList.map((pix) => (
                  <div key={pix.id} className="pix-record">
                    <div className="pix-record-header">
                      <span className="pix-date">{pix.data_pagamento ? new Date(pix.data_pagamento).toLocaleString("pt-BR") : (pix.data_criacao ? new Date(pix.data_criacao).toLocaleString("pt-BR") : "-")}</span>
                      {getStatusBadge(pix.status_pagamento)}
                    </div>
                    <div className="pix-record-body">
                      <div className="pix-field">
                        <strong>Valor:</strong> {formatCurrency(Number(pix.valor))}
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
