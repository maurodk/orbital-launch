// src/components/ReservationModal.tsx

import { useState, useMemo, useEffect } from "react";
import Select from "react-select";
import { customSelectStyles } from "../styles/selectStyles";
import { supabase } from "../src/supabaseClient";
import "./ReservationModal.css";

interface OptionType {
  value: string;
  label: string;
}

interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
}

interface PaymentData {
  pagamentoPresencial: boolean;
  valor: string;
  tipoPagamento: "pix" | "dinheiro" | "cartao" | "cheque" | null;
  tipoVenda: "cef" | "facilita" | null;
  planosPadrao: boolean;
  planoSelecionado: string | null;
  diaVencimento: 5 | 15 | 25;
}

type ModalStep = "cliente" | "pagamento";

interface ReservationModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  implantacaoId: number | null;
  sheetRowIndex: number | null;
  clientes: string[][];
  onReserve: (data: { cliente: string | ManualData; pagamento: PaymentData }) => void;
  initialMode: "select" | "manual";
  onBlockClick: () => void;
}

export function ReservationModal({
  show,
  onClose,
  unitData,
  implantacaoId,
  sheetRowIndex,
  clientes,
  onReserve,
  initialMode,
  onBlockClick,
}: ReservationModalProps) {
  const [step, setStep] = useState<ModalStep>("cliente");
  const [view, setView] = useState<"select" | "manual">(initialMode);
  const [selectedClient, setSelectedClient] = useState<OptionType | null>(null);
  const [manualData, setManualData] = useState<ManualData>({
    id: "",
    cliente: "",
    documento: "",
    corretor: "",
  });
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

  const planosPadrao = [
    { id: "plano1", label: "10% + 100x" },
    { id: "plano2", label: "10% + 36x" },
    { id: "plano3", label: "10% + 36x + 03 Intermediárias + 64x" },
  ];

  useEffect(() => {
    if (show) {
      setStep("cliente");
      setView(initialMode);
      setSelectedClient(null);
      setManualData({ id: "", cliente: "", documento: "", corretor: "" });
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
  }, [show, initialMode]);

  useEffect(() => {
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
          console.warn("[ReservationModal] Falha ao buscar valor da unidade:", error);
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

  const clientOptions: OptionType[] = useMemo(
    () => {
      console.log("🔍 [ReservationModal] Total de clientes recebidos:", clientes.length);
      console.log("🔍 [ReservationModal] Clientes:", clientes);
      
      const filtered = clientes.filter((cliente) => cliente && cliente[1] && cliente[1].trim() !== "");
      console.log("🔍 [ReservationModal] Clientes após filtro:", filtered.length);
      
      const options = filtered.map((cliente, index) => ({
        value: cliente[0] || `temp_${index}`,
        label: `${cliente[1]} - (Doc: ${cliente[2] || "Sem documento"})`,
      }));
      
      console.log("🔍 [ReservationModal] Opções geradas:", options);
      return options;
    },
    [clientes]
  );

  if (!show || !unitData) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setManualData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdvanceToPayment = () => {
    if (view === "select") {
      if (!selectedClient) {
        alert("Selecione um cliente.");
        return;
      }
    } else {
      if (!manualData.cliente.trim()) {
        alert("O nome do Cliente é obrigatório.");
        return;
      }
    }
    setStep("pagamento");
  };

  const handleConfirmReservation = () => {
    const clientData = view === "select" ? selectedClient!.value : manualData;
    onReserve({ cliente: clientData, pagamento: paymentData });
  };

  const clientSelectDisabled = view === "select" ? !selectedClient : !manualData.cliente.trim();
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
      .replace(/\./g, "")
      .replace(",", ".")
  );
  const valorPix = Number.isFinite(valorPixNumber) ? valorPixNumber : null;

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
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className={`modal-content ${step === "pagamento" && paymentData.pagamentoPresencial ? "payment-expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          Reservar Unidade: <strong>{unitData[2]}</strong>
        </h2>

        {/* ETAPA 1: SELEÇÃO DE CLIENTE */}
        {step === "cliente" && (
          <>
            {view === "select" ? (
              <>
                <div className="form-group">
                  <label htmlFor="client-select">Buscar Cliente na Lista</label>
                  <Select<OptionType>
                    id="client-select"
                    options={clientOptions}
                    value={selectedClient}
                    onChange={(opt) => setSelectedClient(opt as OptionType | null)}
                    placeholder="Digite para buscar um cliente..."
                    styles={customSelectStyles}
                    isClearable
                  />
                </div>
                <a
                  href="#"
                  className="switch-view-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setView("manual");
                  }}
                >
                  Cliente não está na lista? Preenchimento manual.
                </a>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="id">ID Pré-Cadastro (Opcional)</label>
                  <input
                    type="text"
                    id="id"
                    name="id"
                    value={manualData.id}
                    onChange={handleInputChange}
                    className="modal-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cliente">Cliente</label>
                  <input
                    type="text"
                    id="cliente"
                    name="cliente"
                    value={manualData.cliente}
                    onChange={handleInputChange}
                    required
                    className="modal-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="documento">Documento Cliente</label>
                  <input
                    type="text"
                    id="documento"
                    name="documento"
                    value={manualData.documento}
                    onChange={handleInputChange}
                    className="modal-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="corretor">Corretor</label>
                  <input
                    type="text"
                    id="corretor"
                    name="corretor"
                    value={manualData.corretor}
                    onChange={handleInputChange}
                    className="modal-input"
                  />
                </div>
                <a
                  href="#"
                  className="switch-view-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setView("select");
                  }}
                >
                  Voltar para a busca na lista.
                </a>
              </>
            )}

            <button
              className="modal-reserve-button"
              onClick={handleAdvanceToPayment}
              disabled={clientSelectDisabled}
            >
              Próximo: Pagamento
            </button>

            <button className="modal-block-button" onClick={onBlockClick}>
              Bloquear esta Unidade
            </button>
          </>
        )}

        {/* ETAPA 2: PAGAMENTO */}
        {step === "pagamento" && (
          <>
            <div className="payment-step-container">
              <div className="form-group">
                <label>
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
                  <span style={{ marginLeft: "8px" }}>Pagamento Presencial</span>
                </label>
              </div>

              {paymentData.pagamentoPresencial && (
                <>
                  {/* VALOR */}
                  <div className="form-group">
                    <label htmlFor="valor-input">Valor (PIX / Sinal 1)</label>
                    <input
                      type="text"
                      id="valor-input"
                      className="modal-input"
                      placeholder="Digite o valor"
                      value={paymentData.valor}
                      onChange={(e) =>
                        setPaymentData((prev) => ({
                          ...prev,
                          valor: e.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* TIPO DE PAGAMENTO */}
                  <div className="form-group">
                    <label>Tipo de Pagamento</label>
                    <div className="payment-type-options compact-options">
                      {["pix", "dinheiro", "cartao", "cheque"].map((tipo) => (
                        <label key={tipo} className="radio-label">
                          <input
                            type="radio"
                            name="tipoPagamento"
                            value={tipo}
                            checked={paymentData.tipoPagamento === tipo}
                            onChange={(e) =>
                              setPaymentData((prev) => ({
                                ...prev,
                                tipoPagamento: e.target.value as PaymentData["tipoPagamento"],
                              }))
                            }
                          />
                          <span style={{ marginLeft: "8px", textTransform: "capitalize" }}>
                            {tipo === "pix" ? "PIX" : tipo === "dinheiro" ? "Dinheiro" : tipo === "cartao" ? "Cartão" : "Cheque"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* TIPO DE VENDA */}
                  <div className="form-group">
                    <label>Tipo de Venda</label>
                    <div className="sale-type-options compact-options">
                      {[
                        { value: "cef", label: "CEF" },
                        { value: "facilita", label: "Facilita" },
                      ].map((type) => (
                        <label key={type.value} className="radio-label">
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
                          <span style={{ marginLeft: "8px" }}>{type.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* PLANO PADRÃO (apenas para Facilita) */}
                  {paymentData.tipoVenda === "facilita" && (
                    <>
                      <div className="form-group">
                        <label>
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
                          <span style={{ marginLeft: "8px" }}>Plano Padrão</span>
                        </label>
                      </div>

                      {paymentData.planosPadrao && (
                        <div className="form-group">
                          <label>Selecione um Plano</label>
                          <div className="plano-options compact-options">
                            {planosPadrao.map((plano) => (
                              <label key={plano.id} className="radio-label">
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
                                <span style={{ marginLeft: "8px" }}>{plano.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {paymentData.planosPadrao && paymentData.planoSelecionado === "plano1" && (
                        <div className="form-group plan-config">
                          <label>Configuração de vencimentos (Plano 1)</label>

                          <div className="compact-row">
                            <span className="muted">Dia fixo (Sinal 3, Sinal 4 e Parcelamento):</span>
                            <div className="compact-options inline-options">
                              {[5, 15, 25].map((dia) => (
                                <label key={dia} className="radio-label compact-pill">
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
                                  <span style={{ marginLeft: "8px" }}>{String(dia).padStart(2, "0")}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="plan-preview">
                            <div className="plan-preview-header">
                              <span className="muted">Prévia (datas e valores)</span>
                              <span className="muted">
                                {valorUnidadeLoading
                                  ? "Buscando valor da unidade..."
                                  : valorUnidade
                                    ? `Unidade: ${formatarBRL(valorUnidade)}`
                                    : "Unidade: valor não encontrado"}
                              </span>
                            </div>

                            {!valorPix && (
                              <div className="warning">Informe o valor do PIX para gerar a prévia.</div>
                            )}

                            {plano1Preview && (
                              <div className="plan-preview-grid">
                                <div className="plan-row">
                                  <span className="plan-title">Sinal 1 (PIX)</span>
                                  <span className="plan-meta">{plano1Preview.vencSinal1}</span>
                                  <span className="plan-value">{formatarBRL(valorPix!)}</span>
                                </div>
                                <div className="plan-row">
                                  <span className="plan-title">Sinal 2</span>
                                  <span className="plan-meta">{plano1Preview.vencSinal2}</span>
                                  <span className="plan-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="plan-row">
                                  <span className="plan-title">Sinal 3</span>
                                  <span className="plan-meta">{plano1Preview.vencSinal3}</span>
                                  <span className="plan-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="plan-row">
                                  <span className="plan-title">Sinal 4</span>
                                  <span className="plan-meta">{plano1Preview.vencSinal4}</span>
                                  <span className="plan-value">{formatarBRL(plano1Preview.valorSinal234)}</span>
                                </div>
                                <div className="plan-row">
                                  <span className="plan-title">Parcelamento (100x)</span>
                                  <span className="plan-meta">{plano1Preview.vencParcel}</span>
                                  <span className="plan-value">{formatarBRL(plano1Preview.valorParcela100)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="modal-buttons">
              <button
                className="modal-back-button"
                onClick={() => setStep("cliente")}
              >
                ← Voltar
              </button>
              <button
                className="modal-reserve-button"
                onClick={handleConfirmReservation}
                disabled={paymentConfirmDisabled}
              >
                Confirmar Reserva
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
