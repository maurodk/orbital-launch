// src/components/PaymentModal.tsx

import { useState, useEffect } from "react";
import { supabase } from "../src/supabaseClient";
import "./ReservationModal.css";

interface PaymentData {
  pagamentoPresencial: boolean;
  valor: string;
  tipoPagamento: "pix" | "dinheiro" | "cartao" | "cheque" | null;
  tipoVenda: "cef" | "facilita" | null;
  planosPadrao: boolean;
  planoSelecionado: string | null;
  diaVencimento: 5 | 15 | 25;
}

interface PaymentModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  implantacaoId: number | null;
  sheetRowIndex: number | null;
  onConfirm: (paymentData: PaymentData) => void;
}

export function PaymentModal({
  show,
  onClose,
  unitData,
  implantacaoId,
  sheetRowIndex,
  onConfirm,
}: PaymentModalProps) {
  const [paymentData, setPaymentData] = useState<PaymentData>({
    pagamentoPresencial: false,
    valor: "",
    tipoPagamento: null,
    tipoVenda: null,
    planosPadrao: false,
    planoSelecionado: null,
    diaVencimento: 15,
  });

  const [valorUnidade, setValorUnidade] = useState<number | null>(null);
  const [valorUnidadeLoading, setValorUnidadeLoading] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const planosPadrao = [
    { id: "plano1", label: "10% + 100x" },
    if (paymentConfirmDisabled || isSubmitting) return;
    setIsSubmitting(true);
    onConfirm(paymentData);
    setTimeout(() => setIsSubmitting(false), 2000); // Evita duplo clique
    { id: "plano3", label: "10% + 36x + 03 Intermediárias + 64x" },
  ];

  useEffect(() => {
    if (show) {
      setPaymentData({
        pagamentoPresencial: false,
        valor: "",
        tipoPagamento: null,
        tipoVenda: null,
        planosPadrao: false,
        planoSelecionado: null,
        diaVencimento: 15,
      });
    }
            className="btn-primary btn-confirm"
            onClick={handleConfirmPayment}
            disabled={paymentConfirmDisabled || isSubmitting}
    let cancelled = false;

    async function carregarValorUnidade() {
      if (!show || !implantacaoId || !sheetRowIndex) return;
      setValorUnidadeLoading(true);
      try {
        const { data, error } = await supabase
          .from("unidades")
          .select("valor")
          .eq("implantacao_id", implantacaoId)
          .eq("row_index", sheetRowIndex)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.warn("[PaymentModal] Falha ao buscar valor da unidade:", error);
          setValorUnidade(null);
          return;
        }

        const raw = data?.valor;
        const parsed = raw === null || raw === undefined ? null : Number(String(raw).replace(/\./g, "").replace(",", "."));
        setValorUnidade(Number.isFinite(parsed as number) ? (parsed as number) : null);
      } finally {
        if (!cancelled) setValorUnidadeLoading(false);
      }
    }

    carregarValorUnidade();
    return () => {
      cancelled = true;
    };
  }, [show, implantacaoId, sheetRowIndex]);

  if (!show || !unitData) {
    return null;
  }

  const formatCurrency = (value: string): string => {
    const numbers = value.replace(/\D/g, "");
    if (!numbers) return "";
    const amount = parseInt(numbers) / 100;
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentData((prev) => ({
      ...prev,
      valor: e.target.value,
    }));
  };

  const handleValorBlur = () => {
    if (paymentData.valor) {
      const formatted = formatCurrency(paymentData.valor);
      setPaymentData((prev) => ({
        ...prev,
        valor: formatted,
      }));
    }
  };

  const handleConfirmPayment = () => {
    onConfirm(paymentData);
  };

  const paymentConfirmDisabled = paymentData.pagamentoPresencial ? (
    !paymentData.valor.trim() || !paymentData.tipoPagamento || !paymentData.tipoVenda ||
    (paymentData.tipoVenda === "facilita" && paymentData.planosPadrao && !paymentData.planoSelecionado)
  ) : false;

  const exibirVencimentosPlano1 =
    paymentData.pagamentoPresencial &&
    paymentData.tipoVenda === "facilita" &&
    paymentData.planosPadrao &&
    paymentData.planoSelecionado === "plano1";

  const valorPixNumber = Number(
    String(paymentData.valor || "")
      .replace(/R\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
  );
  const valorPix = Number.isFinite(valorPixNumber) && valorPixNumber > 0 ? valorPixNumber : null;

  const formatarBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
    if (!valorUnidade || !valorPix) return null;

    const diaBase = paymentData.diaVencimento;

    const hoje = new Date();
    const vencSinal1 = hoje;
    const vencSinal2 = addDias(hoje, 7);
    const vencSinal3 = mesSeguinteNoDia(vencSinal2, diaBase);
    const vencSinal4 = mesSeguinteNoDia(vencSinal3, diaBase);
    const vencParcel = mesSeguinteNoDia(vencSinal4, diaBase);

    const valorDez = Math.round(valorUnidade * 0.1 * 100) / 100;
    const valorSinal234 = Math.round((valorDez / 3) * 100) / 100;
    const valorParcelTotal = (valorUnidade - valorPix) - valorDez;
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

  return (
    <div className="modal-overlay reservation-modal-overlay" onClick={onClose}>
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
                checked={paymentData.pagamentoPresencial}
                onChange={(e) =>
                  setPaymentData((prev) => ({
                    ...prev,
                    pagamentoPresencial: e.target.checked,
                  }))
                }
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                <span className="toggle-icon">💳</span>
                Pagamento Presencial
              </span>
            </label>
          </div>

          {paymentData.pagamentoPresencial && (
            <div className="payment-details-container slide-down">
              {/* Valor */}
              <div className="payment-card">
                <div className="card-header">
                  <span className="card-icon">💰</span>
                  <span className="card-title">Valor do Pagamento</span>
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    id="valor-input"
                    className="modal-input input-large"
                    placeholder="R$ 0,00"
                    value={paymentData.valor}
                    onChange={handleValorChange}
                    onBlur={handleValorBlur}
                  />
                </div>
              </div>

              {/* Tipo de Pagamento e Tipo de Venda lado a lado */}
              <div className="payment-grid">
                <div className="payment-card">
                  <div className="card-header">
                    <span className="card-icon">💳</span>
                    <span className="card-title">Tipo de Pagamento</span>
                  </div>
                  <div className="payment-options">
                    {[
                      { value: "pix", label: "PIX", icon: "📱" },
                      { value: "dinheiro", label: "Dinheiro", icon: "💵" },
                      { value: "cartao", label: "Cartão", icon: "💳" },
                      { value: "cheque", label: "Cheque", icon: "📝" },
                    ].map((tipo) => (
                      <label 
                        key={tipo.value} 
                        className={`option-pill ${paymentData.tipoPagamento === tipo.value ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="tipoPagamento"
                          value={tipo.value}
                          checked={paymentData.tipoPagamento === tipo.value}
                          onChange={(e) =>
                            setPaymentData((prev) => ({
                              ...prev,
                              tipoPagamento: e.target.value as PaymentData["tipoPagamento"],
                            }))
                          }
                        />
                        <span className="option-icon">{tipo.icon}</span>
                        <span className="option-label">{tipo.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

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
                        className={`option-pill ${paymentData.tipoVenda === type.value ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="tipoVenda"
                          value={type.value}
                          checked={paymentData.tipoVenda === type.value}
                          onChange={(e) =>
                            setPaymentData((prev) => ({
                              ...prev,
                              tipoVenda: e.target.value as PaymentData["tipoVenda"],
                              planosPadrao: false,
                              planoSelecionado: null,
                            }))
                          }
                        />
                        <span className="option-icon">{type.icon}</span>
                        <span className="option-label">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* PLANO PADRÃO (apenas para Facilita) */}
              {paymentData.tipoVenda === "facilita" && (
                <div className="payment-card slide-down">
                  <div className="card-header">
                    <span className="card-icon">📋</span>
                    <span className="card-title">Plano de Pagamento</span>
                  </div>
                  
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={paymentData.planosPadrao}
                      onChange={(e) =>
                        setPaymentData((prev) => ({
                          ...prev,
                          planosPadrao: e.target.checked,
                          planoSelecionado: null,
                        }))
                      }
                    />
                    <span>Usar Plano Padrão</span>
                  </label>

                  {paymentData.planosPadrao && (
                    <div className="plano-selection fade-in">
                      <div className="plano-options">
                        {planosPadrao.map((plano) => (
                          <label 
                            key={plano.id} 
                            className={`plano-card ${paymentData.planoSelecionado === plano.id ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="planoSelecionado"
                              value={plano.id}
                              checked={paymentData.planoSelecionado === plano.id}
                              onChange={(e) =>
                                setPaymentData((prev) => ({
                                  ...prev,
                                  planoSelecionado: e.target.value,
                                }))
                              }
                            />
                            <span className="plano-label">{plano.label}</span>
                            <span className="plano-check">✓</span>
                          </label>
                        ))}
                      </div>

                      {paymentData.planoSelecionado === "plano1" && (
                        <div className="plano-config fade-in">
                          <div className="config-row">
                            <span className="config-label">Dia de Vencimento:</span>
                            <div className="day-options">
                              {[5, 15, 25].map((dia) => (
                                <label 
                                  key={dia} 
                                  className={`day-pill ${paymentData.diaVencimento === dia ? "selected" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name="diaVencimento"
                                    value={dia}
                                    checked={paymentData.diaVencimento === dia}
                                    onChange={() =>
                                      setPaymentData((prev) => ({
                                        ...prev,
                                        diaVencimento: dia as 5 | 15 | 25,
                                      }))
                                    }
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
                                <span className="preview-value">{formatarBRL(valorUnidade)}</span>
                              ) : (
                                <span className="preview-error">Valor não encontrado</span>
                              )}
                            </div>

                            {!valorPix && (
                              <div className="preview-warning">
                                ⚠️ Informe o valor do pagamento para gerar a prévia
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
                                  <span className="preview-item-value">{formatarBRL(valorPix!)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">2️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 2</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal2}</span>
                                  </div>
                                  <span className="preview-item-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">3️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 3</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal3}</span>
                                  </div>
                                  <span className="preview-item-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row">
                                  <span className="preview-item-icon">4️⃣</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">Sinal 4</span>
                                    <span className="preview-item-date">{plano1Preview.vencSinal4}</span>
                                  </div>
                                  <span className="preview-item-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="preview-row highlight">
                                  <span className="preview-item-icon">📅</span>
                                  <div className="preview-item-info">
                                    <span className="preview-item-label">100 Parcelas</span>
                                    <span className="preview-item-date">A partir de {plano1Preview.vencParcel}</span>
                                  </div>
                                  <span className="preview-item-value">{formatarBRL(plano1Preview.valorParcela100)}</span>
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

          {!paymentData.pagamentoPresencial && (
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
