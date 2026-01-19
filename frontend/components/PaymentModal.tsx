// src/components/PaymentModal.tsx

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../src/supabaseClient";
import "./ReservationModal.css";

export interface PaymentData {
  pagamentoPresencial: boolean;
  valorTotal: number;
  valorPix: number;
  valorDinheiro: number;
  valorCartao: number;
  valorCheque: number;
  tipoVenda: "cef" | "facilita" | null;
  planosPadrao: boolean;
  planoSelecionado: string | null;
  diaVencimento: 5 | 15 | 25;
  valorUnidade: number | null;
}

interface PaymentModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  implantacaoId: string | number | null;
  sheetRowIndex: number | null;
  onConfirm: (paymentData: PaymentData) => void;
}

interface ExtraPayment {
  id: string;
  tipo: "dinheiro" | "cartao" | "cheque";
  valor: number;
}

interface PixRecord {
  id: string;
  valor: number;
  data_pagamento: string;
  updated_at: string;
}

export function PaymentModal({
  show,
  onClose,
  unitData,
  implantacaoId,
  sheetRowIndex,
  onConfirm,
}: PaymentModalProps) {
  const [pagamentoPresencial, setPagamentoPresencial] = useState(false);
  const [tipoVenda, setTipoVenda] = useState<"cef" | "facilita" | null>(null);
  const [planosPadrao, setPlanosPadrao] = useState(false);
  const [planoSelecionado, setPlanoSelecionado] = useState<string | null>(null);
  const [diaVencimento, setDiaVencimento] = useState<5 | 15 | 25>(15);

  // Novos estados para pagamentos múltiplos
  const [pixPagos, setPixPagos] = useState<PixRecord[]>([]);
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);
  const [newPaymentType, setNewPaymentType] = useState<"dinheiro" | "cartao" | "cheque">("dinheiro");
  const [newPaymentValue, setNewPaymentValue] = useState("");

  const [valorUnidade, setValorUnidade] = useState<number | null>(null);
  const [valorUnidadeLoading, setValorUnidadeLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const planosPadraoOptions = [
    { id: "plano1", label: "10% + 100x" },
    { id: "plano2", label: "10% + 36x" },
    { id: "plano3", label: "10% + 36x + 03 Intermediárias + 64x" },
  ];

  // Cálculos de totais
  const totalPix = useMemo(() => pixPagos.reduce((acc, curr) => acc + Number(curr.valor), 0), [pixPagos]);
  const totalExtra = useMemo(() => extraPayments.reduce((acc, curr) => acc + curr.valor, 0), [extraPayments]);
  const valorTotalPagamento = totalPix + totalExtra;

  // Totais individuais para envio
  const totalDinheiro = useMemo(() => extraPayments.filter(p => p.tipo === 'dinheiro').reduce((acc, curr) => acc + curr.valor, 0), [extraPayments]);
  const totalCartao = useMemo(() => extraPayments.filter(p => p.tipo === 'cartao').reduce((acc, curr) => acc + curr.valor, 0), [extraPayments]);
  const totalCheque = useMemo(() => extraPayments.filter(p => p.tipo === 'cheque').reduce((acc, curr) => acc + curr.valor, 0), [extraPayments]);

  const handleConfirmPayment = () => {
    if (paymentConfirmDisabled || isSubmitting) return;
    setIsSubmitting(true);
    
    const paymentData: PaymentData = {
      pagamentoPresencial,
      valorTotal: valorTotalPagamento,
      valorPix: totalPix,
      valorDinheiro: totalDinheiro,
      valorCartao: totalCartao,
      valorCheque: totalCheque,
      tipoVenda,
      planosPadrao,
      planoSelecionado,
      diaVencimento,
      valorUnidade
    };

    onConfirm(paymentData);
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  const handleAddExtraPayment = () => {
    const val = parseFloat(newPaymentValue.replace(/\./g, '').replace(',', '.'));
    if (!val || val <= 0) return;

    const newPayment: ExtraPayment = {
      id: Math.random().toString(36).substr(2, 9),
      tipo: newPaymentType,
      valor: val
    };

    setExtraPayments([...extraPayments, newPayment]);
    setNewPaymentValue("");
  };

  const handleRemoveExtraPayment = (id: string) => {
    setExtraPayments(extraPayments.filter(p => p.id !== id));
  };

  useEffect(() => {
    if (show) {
      // Reset states
      setPagamentoPresencial(false);
      setTipoVenda(null);
      setPlanosPadrao(false);
      setPlanoSelecionado(null);
      setDiaVencimento(15);
      setExtraPayments([]);
      setNewPaymentValue("");
      setPixPagos([]);
    }

    let cancelled = false;

    async function fetchData() {
      if (!show || !implantacaoId || !unitData) return;
      
      setValorUnidadeLoading(true);
      try {
        // 1. Buscar valor da unidade
        const { data: unitDbData, error: unitError } = await supabase
          .from("unidades")
          .select("valor")
          .eq("implantacao_id", implantacaoId)
          .eq("row_index", sheetRowIndex)
          .maybeSingle();

        if (!cancelled && !unitError) {
          const raw = unitDbData?.valor;
          const parsed = raw === null || raw === undefined ? null : Number(String(raw).replace(/\./g, "").replace(",", "."));
          setValorUnidade(Number.isFinite(parsed as number) ? (parsed as number) : null);
        }

        // 2. Buscar PIX pagos
        const { data: pixData, error: pixError } = await supabase
          .from("historico_pix")
          .select("id, valor, data_pagamento, updated_at")
          .eq("implantacao_id", implantacaoId)
          .eq("unidade", unitData[2]) // Nome da unidade
          .eq("status_pagamento", "PAGO");

        if (!cancelled && !pixError && pixData) {
          setPixPagos(pixData);
        }

      } finally {
        if (!cancelled) setValorUnidadeLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [show, implantacaoId, sheetRowIndex, unitData]);

  if (!show || !unitData) {
    return null;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleNewValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setNewPaymentValue("");
      return;
    }
    const val = parseInt(raw) / 100;
    setNewPaymentValue(val.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  };

  const paymentConfirmDisabled = pagamentoPresencial ? (
    valorTotalPagamento <= 0 || !tipoVenda ||
    (tipoVenda === "facilita" && planosPadrao && !planoSelecionado)
  ) : false;

  const exibirVencimentosPlano1 =
    pagamentoPresencial &&
    tipoVenda === "facilita" &&
    planosPadrao &&
    planoSelecionado === "plano1";

  const exibirVencimentosPlano2 =
    pagamentoPresencial &&
    tipoVenda === "facilita" &&
    planosPadrao &&
    planoSelecionado === "plano2";

  const exibirVencimentosPlano3 =
    pagamentoPresencial &&
    tipoVenda === "facilita" &&
    planosPadrao &&
    planoSelecionado === "plano3";

  const formatarData = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const addDias = (d: Date, dias: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + dias);
    return r;
  };

  const mesSeguinteNoDia = (d: Date, dia: 5 | 15 | 25) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + 1);
    r.setDate(dia);
    return r;
  };

  const plano1Preview = (() => {
    if (!exibirVencimentosPlano1) return null;
    if (!valorUnidade || valorTotalPagamento <= 0) return null;

    const diaBase = diaVencimento;

    const hoje = new Date();
    const vencSinal1 = hoje;
    const vencSinal2 = addDias(hoje, 7);
    const vencSinal3 = mesSeguinteNoDia(vencSinal2, diaBase);
    const vencSinal4 = mesSeguinteNoDia(vencSinal3, diaBase);
    const vencParcel = mesSeguinteNoDia(vencSinal4, diaBase);

    const saldoRestante = valorUnidade - valorTotalPagamento;
    const valorDez = Math.round(saldoRestante * 0.1 * 100) / 100;
    const valorSinal234 = Math.round((valorDez / 3) * 100) / 100;
    const valorParcelTotal = saldoRestante - (valorSinal234 * 3);
    const valorParcela100 = Math.round((valorParcelTotal / 100) * 100) / 100;

    return {
      vencSinal1: formatarData(vencSinal1),
      vencSinal2: formatarData(vencSinal2),
      vencSinal3: formatarData(vencSinal3),
      vencSinal4: formatarData(vencSinal4),
      vencParcel: formatarData(vencParcel),
      valorDez,
      valorSinal234,
      valorParcelTotal,
      valorParcela100,
    };
  })();

  const plano2Preview = (() => {
    if (!exibirVencimentosPlano2) return null;
    if (!valorUnidade || valorTotalPagamento <= 0) return null;

    const diaBase = diaVencimento;
    const hoje = new Date();
    const vencSinal1 = hoje;
    const vencSinal2 = addDias(hoje, 7);
    const vencSinal3 = mesSeguinteNoDia(vencSinal2, diaBase);
    const vencSinal4 = mesSeguinteNoDia(vencSinal3, diaBase);
    const vencParcel = mesSeguinteNoDia(vencSinal4, diaBase);

    const saldoRestante = valorUnidade - valorTotalPagamento;
    const valorDez = Math.round(saldoRestante * 0.1 * 100) / 100;
    const valorSinal234 = Math.round((valorDez / 3) * 100) / 100;
    // O valor restante para parcelar é: Total - PIX (Sinal 1) - (Sinal 2 + Sinal 3 + Sinal 4)
    const valorParcelTotal = saldoRestante - (valorSinal234 * 3);
    const valorParcela36 = Math.round((valorParcelTotal / 36) * 100) / 100;

    return {
      vencSinal1: formatarData(vencSinal1),
      vencSinal2: formatarData(vencSinal2),
      vencSinal3: formatarData(vencSinal3),
      vencSinal4: formatarData(vencSinal4),
      vencParcel: formatarData(vencParcel),
      valorDez,
      valorSinal234,
      valorParcelTotal,
      valorParcela36,
    };
  })();

  const plano3Preview = (() => {
    if (!exibirVencimentosPlano3) return null;
    if (!valorUnidade || valorTotalPagamento <= 0) return null;

    const diaBase = diaVencimento;
    const hoje = new Date();
    const vencSinal1 = hoje;
    const vencSinal2 = addDias(hoje, 7);
    const vencSinal3 = mesSeguinteNoDia(vencSinal2, diaBase);
    const vencSinal4 = mesSeguinteNoDia(vencSinal3, diaBase);
    const vencParcel1 = mesSeguinteNoDia(vencSinal4, diaBase);
    // Intermediária: 1 ano após o Sinal 4
    const vencInter = new Date(vencSinal4);
    vencInter.setFullYear(vencInter.getFullYear() + 1);

    const saldoRestante = valorUnidade - valorTotalPagamento;
    const valorDez = Math.round(saldoRestante * 0.1 * 100) / 100;
    const valorSinal234 = Math.round((valorDez / 3) * 100) / 100;
    
    const valorP1Total = Math.round(saldoRestante * 0.24 * 100) / 100;
    const valorParcela36 = Math.round((valorP1Total / 36) * 100) / 100;

    const valorInterTotal = Math.round(saldoRestante * 0.08 * 100) / 100;
    const valorParcelaInter = Math.round((valorInterTotal / 3) * 100) / 100;

    // O último parcelamento absorve qualquer diferença de arredondamento para fechar o valor total
    // Saldo = Total - PIX - Sinais(2,3,4) - P1 - Intermediária
    const valorP2Total = saldoRestante - (valorSinal234 * 3) - valorP1Total - valorInterTotal;
    const valorParcela64 = Math.round((valorP2Total / 64) * 100) / 100;

    return {
      vencSinal1: formatarData(vencSinal1),
      vencSinal2: formatarData(vencSinal2),
      vencSinal3: formatarData(vencSinal3),
      vencSinal4: formatarData(vencSinal4),
      vencParcel1: formatarData(vencParcel1),
      vencInter: formatarData(vencInter),
      valorSinal234,
      valorParcela36,
      valorParcelaInter,
      valorParcela64
    };
  })();

  return (
    <div className="modal-overlay reservation-modal-overlay" onClick={onClose}>
      <style>{`
        .payment-total-highlight {
          background: linear-gradient(135deg, rgba(106, 215, 0, 0.05) 0%, rgba(30, 30, 30, 0.5) 100%);
          border: 1px solid var(--accent-green);
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .payment-total-label {
          font-size: 1.1rem;
          color: var(--text-primary);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .payment-total-value {
          font-size: 1.8rem;
          color: var(--accent-green);
          font-weight: 800;
          text-shadow: 0 0 15px rgba(106, 215, 0, 0.2);
          letter-spacing: -0.5px;
        }
        
        /* Estilos para linhas de pagamento (PIX e Outros) */
        .payment-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          margin-bottom: 10px;
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          transition: background-color 0.2s;
        }
        .payment-item-row:hover {
          background-color: rgba(255, 255, 255, 0.06);
        }
        .payment-item-date, .payment-item-type {
          color: var(--text-secondary);
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .payment-item-value {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 1rem;
        }
        
        /* Estilos para o Dropdown no tema escuro */
        select.modal-input {
          background-color: #2a2a2a;
          color: #eaeaea;
          border: 1px solid #444;
          cursor: pointer;
        }
        select.modal-input option {
          background-color: #2a2a2a;
          color: #eaeaea;
        }

        /* Destaque para o Total PIX */
        .payment-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          padding: 12px 16px;
          background-color: rgba(106, 215, 0, 0.1);
          border: 1px solid rgba(106, 215, 0, 0.2);
          border-radius: 8px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .payment-total-row strong {
          color: var(--accent-green);
          font-size: 1.1rem;
        }

        /* Layout do formulário de outros pagamentos */
        .add-payment-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .payment-input-group {
          display: flex;
          gap: 10px;
          align-items: stretch;
        }
        .payment-input-group .modal-input {
          flex: 1;
        }
        .add-payment-btn {
          width: 46px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--accent-green);
          color: #121212;
          border: none;
          border-radius: 8px;
          font-size: 1.5rem;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s, background-color 0.2s;
        }
        .add-payment-btn:hover:not(:disabled) {
          transform: scale(1.05);
          background-color: #5cc000;
        }
        .add-payment-btn:disabled {
          background-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.3);
          cursor: not-allowed;
        }
      `}</style>
      <div 
        className="modal-content reservation-modal-content payment-step-active"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        {/* Unit Info Header */}
        <div className="unit-info-header">
          <div className="unit-icon">💳</div>
          <div className="unit-details">
            <div className="unit-label">Pagamento</div>
            <div className="unit-name">{unitData[2]}</div>
          </div>
        </div>

        {/* PAGAMENTO */}
        <div className="step-content step-pagamento fade-in">
          <div className="payment-toggle-card">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={pagamentoPresencial}
                onChange={(e) => setPagamentoPresencial(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                <span className="toggle-icon">💳</span>
                Pagamento Presencial
              </span>
            </label>
          </div>

          {pagamentoPresencial && (
            <div className="payment-details-container slide-down">
              
              {/* SEÇÃO DE PIX PAGOS */}
              <div className="payment-card">
                <div className="card-header">
                  <span className="card-icon">📱</span>
                  <span className="card-title">PIX Confirmados</span>
                </div>
                {pixPagos.length > 0 ? (
                  <div className="pix-list-container">
                    {pixPagos.map((pix) => (
                      <div key={pix.id} className="payment-item-row">
                        <span className="payment-item-date">
                          📅 {new Date(pix.updated_at || pix.data_pagamento).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="payment-item-value">
                          {formatCurrency(Number(pix.valor))}
                        </span>
                      </div>
                    ))}
                    <div className="payment-total-row">
                      <span>Total PIX:</span>
                      <strong>{formatCurrency(totalPix)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state-small">Nenhum PIX confirmado para esta unidade.</div>
                )}
              </div>

              {/* SEÇÃO DE OUTROS PAGAMENTOS */}
              <div className="payment-card">
                <div className="card-header">
                  <span className="card-icon">💵</span>
                  <span className="card-title">Outros Pagamentos</span>
                </div>
                
                {extraPayments.length > 0 && (
                  <div className="extra-payments-list">
                    {extraPayments.map((payment) => (
                      <div key={payment.id} className="payment-item-row">
                        <span className="payment-item-type">
                          {payment.tipo === 'dinheiro' ? '💵 Dinheiro' : 
                           payment.tipo === 'cartao' ? '💳 Cartão' : '📝 Cheque'}
                        </span>
                        <span className="payment-item-value">
                          {formatCurrency(payment.valor)}
                        </span>
                        <button 
                          className="remove-payment-btn"
                          onClick={() => handleRemoveExtraPayment(payment.id)}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="add-payment-form">
                  <select 
                    className="modal-input"
                    value={newPaymentType}
                    onChange={(e) => setNewPaymentType(e.target.value as any)}
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao">Cartão</option>
                    <option value="cheque">Cheque</option>
                  </select>
                  <div className="payment-input-group">
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="R$ 0,00"
                      value={newPaymentValue}
                      onChange={handleNewValueChange}
                    />
                    <button 
                      className="add-payment-btn"
                      onClick={handleAddExtraPayment}
                      disabled={!newPaymentValue}
                      title="Adicionar"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* VALOR TOTAL */}
              <div className="payment-total-highlight">
                <span className="payment-total-label">
                  <span style={{ fontSize: '1.4rem' }}>💰</span>
                  Valor Total:
                </span>
                <span className="payment-total-value">
                  {formatCurrency(valorTotalPagamento)}
                </span>
              </div>

              {/* TIPO DE VENDA */}
              <div className="payment-card">
                <div className="card-header">
                  <span className="card-icon">🏦</span>
                  <span className="card-title">Tipo de Venda</span>
                </div>
                <div className="payment-options">
                  {[
                    { value: "cef", label: "CEF", icon: "🏛️" },
                    { value: "facilita", label: "Facilita", icon: "⚡" },
                  ].map((type) => (
                    <label 
                      key={type.value} 
                      className={`option-pill ${tipoVenda === type.value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="tipoVenda"
                        value={type.value}
                        checked={tipoVenda === type.value}
                        onChange={(e) => {
                          setTipoVenda(e.target.value as "cef" | "facilita");
                          setPlanosPadrao(false);
                          setPlanoSelecionado(null);
                        }}
                      />
                      <span className="option-icon">{type.icon}</span>
                      <span className="option-label">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* PLANO PADRÃO (apenas para Facilita) */}
              {tipoVenda === "facilita" && (
                <div className="payment-card slide-down">
                  <div className="card-header">
                    <span className="card-icon">📋</span>
                    <span className="card-title">Plano de Pagamento</span>
                  </div>
                  
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={planosPadrao}
                      onChange={(e) => {
                        setPlanosPadrao(e.target.checked);
                        setPlanoSelecionado(null);
                      }}
                    />
                    <span>Usar Plano Padrão</span>
                  </label>

                  {planosPadrao && (
                    <div className="plano-selection fade-in">
                      <div className="plano-options">
                        {planosPadraoOptions.map((plano) => (
                          <label 
                            key={plano.id} 
                            className={`plano-card ${planoSelecionado === plano.id ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="planoSelecionado"
                              value={plano.id}
                              checked={planoSelecionado === plano.id}
                              onChange={(e) => setPlanoSelecionado(e.target.value)}
                            />
                            <span className="plano-label">{plano.label}</span>
                            <span className="plano-check">✓</span>
                          </label>
                        ))}
                      </div>

                      {(planoSelecionado === "plano1" || planoSelecionado === "plano2" || planoSelecionado === "plano3") && (
                        <div className="plano-config fade-in">
                          <div className="config-row">
                            <span className="config-label">Dia de Vencimento:</span>
                            <div className="day-options">
                              {[5, 15, 25].map((dia) => (
                                <label 
                                  key={dia} 
                                  className={`day-pill ${diaVencimento === dia ? "selected" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name="diaVencimento"
                                    value={dia}
                                    checked={diaVencimento === dia}
                                    onChange={() => setDiaVencimento(dia as 5 | 15 | 25)}
                                  />
                                  <span>Dia {dia}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="plan-preview">
                            <div className="preview-header">
                              <span className="preview-title">📊 Prévia de Pagamento</span>
                              {valorUnidadeLoading ? (
                                <span className="preview-loading">Carregando...</span>
                              ) : valorUnidade ? (
                                <span className="preview-value">{formatCurrency(valorUnidade)}</span>
                              ) : (
                                <span className="preview-error">Valor não encontrado</span>
                              )}
                            </div>

                            {valorTotalPagamento <= 0 && (
                              <div className="preview-warning">
                                ⚠️ Adicione pagamentos para gerar a prévia
                              </div>
                            )}

                            {plano1Preview && (
                              <div className="preview-grid">
                                <div className="preview-row">
                                  <span className="preview-item-icon">1️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 1 (PIX)</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal1}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(valorTotalPagamento)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">2️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 2</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal2}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">3️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 3</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal3}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">4️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 4</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal4}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row highlight">
                                  <span className="preview-item-icon">📅</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">100 Parcelas</span>
                                    <span className="preview-item-date">A partir de {plano1Preview.vencParcel}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano1Preview.valorParcela100)}</span>
                                </div>
                              </div>
                            )}

                            {plano2Preview && (
                              <div className="preview-grid">
                                <div className="preview-row">
                                  <span className="preview-item-icon">1️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 1 (PIX)</span>
                                    <span className="preview-item-date">{plano2Preview.vencSinal1}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(valorTotalPagamento)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">2️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 2</span>
                                    <span className="preview-item-date">{plano2Preview.vencSinal2}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano2Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">3️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 3</span>
                                    <span className="preview-item-date">{plano2Preview.vencSinal3}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano2Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">4️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 4</span>
                                    <span className="preview-item-date">{plano2Preview.vencSinal4}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano2Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row highlight">
                                  <span className="preview-item-icon">📅</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">36 Parcelas</span>
                                    <span className="preview-item-date">A partir de {plano2Preview.vencParcel}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano2Preview.valorParcela36)}</span>
                                </div>
                              </div>
                            )}

                            {plano3Preview && (
                              <div className="preview-grid">
                                <div className="preview-row">
                                  <span className="preview-item-icon">1️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 1 (PIX)</span>
                                    <span className="preview-item-date">{plano3Preview.vencSinal1}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(valorTotalPagamento)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">2️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 2</span>
                                    <span className="preview-item-date">{plano3Preview.vencSinal2}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">3️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 3</span>
                                    <span className="preview-item-date">{plano3Preview.vencSinal3}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">4️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 4</span>
                                    <span className="preview-item-date">{plano3Preview.vencSinal4}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">📅</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">36 Parcelas (24%)</span>
                                    <span className="preview-item-date">A partir de {plano3Preview.vencParcel1}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorParcela36)}</span>
                                </div>
                                <div className="preview-row highlight">
                                  <span className="preview-item-icon">⭐</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">3 Intermediárias (8%)</span>
                                    <span className="preview-item-date">A partir de {plano3Preview.vencInter}</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorParcelaInter)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">📅</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">64 Parcelas (58%)</span>
                                    <span className="preview-item-date">Após as 36x</span>
                                  </div>
                                  <span className="preview-item-value">{formatCurrency(plano3Preview.valorParcela64)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!pagamentoPresencial && (
            <div className="no-payment-card fade-in">
              <div className="no-payment-icon">✓</div>
              <p className="no-payment-text">Sem pagamento presencial necessário</p>
              <p className="no-payment-subtext">Prossiga para confirmar o pagamento</p>
            </div>
          )}

          <div className="action-buttons">
            <button
              className="btn-primary btn-confirm"
              onClick={handleConfirmPayment}
              disabled={paymentConfirmDisabled}
            >
              <span className="btn-icon">✓</span>
              Confirmar Pagamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
