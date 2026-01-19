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
  cliente: string;
  unidade: string;
}



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
  const [displayClientName, setDisplayClientName] = useState(cliente);

  // Atualiza o nome exibido quando a prop muda
  useEffect(() => {
    setDisplayClientName(cliente);
  }, [cliente]);

  // Busca histórico de PIX do Supabase
  const fetchPixHistory = async () => {
    setLoading(true);
    try {
      // RESOLUÇÃO DE NOME: Se o cliente for um ID (ex: "1"), buscamos o nome real na tabela de clientes
      let clienteNomeBusca = cliente;
      let clientResolved = false;
      
      if (cliente) {
        // Tenta buscar por id_pre_cadastro para garantir que temos o nome correto
        // Usando .select() e .limit(1) ao invés de maybeSingle para evitar erros se houver duplicatas
        const { data: clienteData, error: clientError } = await supabase
          .from("clientes")
          .select("nome")
          .eq("id_pre_cadastro", cliente)
          .limit(1);

        if (clientError) {
           console.error("[PixHistoryModal] Erro ao buscar cliente:", clientError);
        }

        if (clienteData && clienteData.length > 0 && clienteData[0].nome) {
          clienteNomeBusca = clienteData[0].nome;
          clientResolved = true;
          setDisplayClientName(clienteNomeBusca);
        }
      }

      let query = supabase
        .from("historico_pix")
        .select("*")
        .order("data_criacao", { ascending: false });

      // Lógica de filtro aprimorada:
      // 1. Se o nome foi resolvido (ou se o cliente original já parecia um nome), filtra pelo nome.
      // 2. Se o cliente parece um ID numérico e NÃO foi resolvido, ignoramos o filtro de cliente e usamos apenas a unidade (fallback).
      // 3. Se o cliente não é numérico (é um nome), usamos ele.
      
      const isNumericId = /^\d+$/.test(cliente);
      const shouldUseClientFilter = clientResolved || !isNumericId;

      if (shouldUseClientFilter && clienteNomeBusca) {
        query = query.eq("cliente", clienteNomeBusca);
      }
      if (implantacao) {
        query = query.eq("implantacao_nome", implantacao);
      }
      
      // Se não estamos filtrando por cliente (porque falhou a resolução de ID),
      // OU se temos a unidade e o filtro de cliente não foi aplicado (fallback), filtramos por unidade.
      // Isso garante que se o ID do cliente não for encontrado, ao menos mostramos o histórico da unidade.
      if (unidade && !shouldUseClientFilter) {
        query = query.eq("unidade", unidade);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Se encontramos dados e o nome do cliente não foi resolvido (fallback),
      // usamos o nome do cliente do primeiro registro encontrado para exibir na UI.
      if (data && data.length > 0 && !clientResolved && isNumericId) {
        if (data[0].cliente) {
          setDisplayClientName(data[0].cliente);
        }
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
        <p className="pix-history-client">Cliente: {displayClientName}</p>

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
