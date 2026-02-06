// frontend/components/PixHistoryModal.tsx

import { useState, useEffect } from "react";
import { supabase } from "../src/supabaseClient";
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
  unitData: string[] | null;
}



export function PixHistoryModal({
  show,
  onClose,
  implantacao,
  unitData,
}: PixHistoryModalProps) {
  const [pixList, setPixList] = useState<PixRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [valorTotal, setValorTotal] = useState(0);
  const [numeroParcelas, setNumeroParcelas] = useState(0);
  const [pixPagos, setPixPagos] = useState(0);
  const [pixPendentes, setPixPendentes] = useState(0);
  const [pixExpirados, setPixExpirados] = useState(0);
  const [resolvedClientName, setResolvedClientName] = useState("");

  const unidade = unitData?.[2] || "";

  // Resolve o nome do cliente via id_pre_cadastro (consistente com PaymentModal)
  useEffect(() => {
    if (!unitData) {
      setResolvedClientName("");
      return;
    }

    const idPreCadastro = unitData[6];
    let clienteNome = unitData[7] || "";

    if (idPreCadastro) {
      (async () => {
        const { data: clienteData } = await supabase
          .from('clientes')
          .select('nome')
          .eq('id_pre_cadastro', idPreCadastro)
          .maybeSingle();

        if (clienteData?.nome) {
          setResolvedClientName(clienteData.nome);
        } else {
          setResolvedClientName(clienteNome);
        }
      })();
    } else {
      setResolvedClientName(clienteNome);
    }
  }, [unitData]);

  // Busca histórico de PIX do Supabase
  const fetchPixHistory = async () => {
    setLoading(true);
    try {
      console.log("[PixHistoryModal] Props recebidas:", { resolvedClientName, unidade, implantacao });

      // Construir a query base - buscar apenas PIX do cliente atual
      let query = supabase
        .from("historico_pix")
        .select("*")
        .order("data_criacao", { ascending: false });

      // Filtro por implantação (obrigatório)
      if (implantacao) {
        query = query.eq("implantacao_nome", implantacao);
      }
      
      // Filtro por cliente (obrigatório) - mostra apenas PIX do cliente atual
      if (resolvedClientName) {
        query = query.eq("cliente", resolvedClientName);
      } else {
        // Se não houver cliente, não busca nada
        console.log("[PixHistoryModal] Nenhum cliente resolvido, não buscando PIX");
        setPixList([]);
        setLoading(false);
        return;
      }

      console.log("[PixHistoryModal] Filtros aplicados:", { 
        implantacao, 
        cliente: resolvedClientName
      });

      const { data, error } = await query;
      if (error) throw error;

      console.log("[PixHistoryModal] Resultados da query:", { 
        total: data?.length, 
        registros: data 
      });

      // Garante que valor é número
      const parsedData = (data || []).map((item) => ({
        ...item,
        valor: typeof item.valor === "string" ? Number(item.valor.replace(/,/g, ".")) : Number(item.valor)
      }));

      setPixList(parsedData);

      // Calcula totais e estatísticas por status
      const pixPagosList = parsedData.filter((pix) => pix.status_pagamento?.toUpperCase() === "PAGO");
      const pixPendentesList = parsedData.filter((pix) => pix.status_pagamento?.toUpperCase() === "PENDENTE");
      const pixExpiradosList = parsedData.filter((pix) => pix.status_pagamento?.toUpperCase() === "EXPIRADO");

      setValorTotal(
        pixPagosList.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0)
      );
      setNumeroParcelas(parsedData.length);
      setPixPagos(pixPagosList.length);
      setPixPendentes(pixPendentesList.length);
      setPixExpirados(pixExpiradosList.length);
    } catch (error) {
      console.error("Erro ao buscar histórico PIX:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && resolvedClientName && unidade) {
      fetchPixHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, resolvedClientName, unidade]);

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
    if (normalized === "EXPIRADO") {
      return <span className="status-badge expired">✕ EXPIRADO</span>;
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
        <p className="pix-history-client">Cliente: {resolvedClientName}</p>

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
                <span className="summary-label">Pagos:</span>
                <span className="summary-value" style={{color: "var(--accent-green)"}}>{pixPagos}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Pendentes:</span>
                <span className="summary-value" style={{color: "#ffa726"}}>{pixPendentes}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Expirados:</span>
                <span className="summary-value" style={{color: "#f44336"}}>{pixExpirados}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Valor Pago:</span>
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
