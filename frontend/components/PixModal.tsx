// frontend/src/components/PixModal.tsx

import { useState, useEffect, useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import axios from "axios";
import { supabase } from "../src/supabaseClient";
import "./PixModal.css";
import "./ReservationModal.css";

interface PixModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  implantacaoNome: string;
  implantacaoSigla: string;
  implantacaoCidade?: string;
  showPending?: boolean; // NOVO: Se true, mostra PIX pendente (sem opção de gerar novo)
  pendingPixData?: {
    // NOVO: Dados do PIX pendente
    identificador: string;
    payloadEmv: string;
    valor: number;
  };
  onConfirm: (
    valor: number,
    identificador: string,
    payloadEmv: string
  ) => Promise<void>;
}

export function PixModal({
  show,
  onClose,
  unitData,
  implantacaoNome,
  implantacaoSigla,
  implantacaoCidade,
  showPending = false,
  pendingPixData,
  onConfirm,
}: PixModalProps) {
  const [valor, setValor] = useState(0);
  const [displayValor, setDisplayValor] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [contatoCliente, setContatoCliente] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteDocumento, setClienteDocumento] = useState("");
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [currentPixId, setCurrentPixId] = useState<string | null>(null);

  // ALTERAÇÃO: Apontar para o nosso próprio backend que atuará como proxy
  const AWS_API_URL =
    import.meta.env.VITE_AWS_API_URL || "http://34.204.204.81:3000";
  const LOCALHOST_API_URL =
    import.meta.env.VITE_LOCALHOST_API_URL || "http://localhost:3001";
  const apiUrl =
    process.env.NODE_ENV === "development" ? LOCALHOST_API_URL : AWS_API_URL;
  const PIX_API_URL = `${apiUrl}/api/santander/gerapix`;
  const BOTMAKER_TOKEN = import.meta.env.VITE_BOTMAKER_TOKEN || "";

  useEffect(() => {
    if (!show) {
      setValor(0);
      setDisplayValor("");
      setIsGenerating(false);
      setShowQr(false);
      setPayload(null);
      setError("");
      setContatoCliente("");
    } else if (showPending && pendingPixData) {
      setPayload(pendingPixData.payloadEmv);
      setValor(pendingPixData.valor);
      setDisplayValor(
        new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(pendingPixData.valor)
      );
      setShowQr(true);
    }
  }, [show, showPending, pendingPixData]);

  // Busca os dados do cliente no Supabase usando id_pre_cadastro
  useEffect(() => {
    const buscarDadosCliente = async () => {
      if (show && unitData && unitData[6]) {
        const idPreCadastro = unitData[6]; // Coluna G - id_pre_cadastro
        
        setLoadingCliente(true);
        try {
          const { data, error } = await supabase
            .from('clientes')
            .select('nome, documento')
            .eq('id_pre_cadastro', idPreCadastro)
            .single();

          if (error) {
            console.error('Erro ao buscar dados do cliente:', error);
            setClienteNome("");
            setClienteDocumento("");
          } else if (data) {
            setClienteNome(data.nome || "");
            setClienteDocumento(data.documento || "");
          }
        } catch (err) {
          console.error('Erro ao buscar cliente no Supabase:', err);
          setClienteNome("");
          setClienteDocumento("");
        } finally {
          setLoadingCliente(false);
        }
      }
    };

    buscarDadosCliente();
  }, [show, unitData]);

  // Preenche o contato do cliente automaticamente
  useEffect(() => {
    if (show && unitData) {
      const telefoneCliente = (unitData?.[9] || "").replace(/\D/g, "");

      if (telefoneCliente) {
        setContatoCliente(
          telefoneCliente.startsWith("55")
            ? telefoneCliente
            : `55${telefoneCliente}`
        );
      }
    }
  }, [show, unitData]);

  // Monitora mudanças no status do PIX no Supabase em tempo real
  useEffect(() => {
    if (!show || !currentPixId) return;

    // Polling a cada 3 segundos para verificar o status
    const checkPixStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('historico_pix')
          .select('status_pagamento, data_pagamento')
          .eq('identificador', currentPixId)
          .single();

        if (error) {
          console.error('Erro ao verificar status do PIX:', error);
          return;
        }

        if (data && data.status_pagamento === 'PAGO') {
          setShowPaymentSuccess(true);
          
          // Fecha o modal após 4 segundos
          setTimeout(() => {
            onClose();
            setShowPaymentSuccess(false);
            setCurrentPixId(null);
          }, 4000);
        }
      } catch (err) {
        console.error('Erro ao verificar PIX:', err);
      }
    };

    // Verifica imediatamente
    checkPixStatus();

    // Depois verifica a cada 3 segundos
    const intervalId = setInterval(checkPixStatus, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [show, currentPixId, onClose]);

  const txid = useMemo(() => {
    if (!unitData || !implantacaoSigla) return "";
    const unitIdentifier = (unitData[2] || "").replace(/[^A-Z0-9]/gi, "");
    return `${implantacaoSigla}${unitIdentifier}`;
  }, [unitData, implantacaoSigla]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, "");

    if (!rawValue) {
      setDisplayValor("");
      setValor(0);
      return;
    }

    const numericValue = parseInt(rawValue, 10) / 100;
    setValor(numericValue);

    const formattedValue = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numericValue);

    setDisplayValor(formattedValue);
  };



  // NOVO: Função para voltar à tela de geração de um novo PIX
  const handleShowFormAgain = () => {
    setShowQr(false);
    setPayload(null);
    setValor(0);
    setDisplayValor("");
    setError("");
    // O contato do cliente não é resetado para permitir a geração de um novo PIX para o mesmo número
  };

  const handleGenerateQr = async () => {
    if (valor <= 0) {
      setError("O valor deve ser maior que zero.");
      return;
    }
    setError("");
    setIsGenerating(true);

    const requestBody = {
      txid: txid,
      valor: valor.toFixed(2),
      cpf: (() => {
        // Usa o documento do Supabase, se disponível
        let cpfLimpo = (clienteDocumento || "").replace(/\D/g, "");
        if (!cpfLimpo) {
          // Fallback para unitData se não encontrou no Supabase
          cpfLimpo = (unitData?.[7] || "").replace(/\D/g, "");
        }
        if (cpfLimpo.length <= 10) {
          cpfLimpo = cpfLimpo.padStart(11, "0");
        }
        return cpfLimpo;
      })(),
      nome: (clienteNome || unitData?.[7] || "CLIENTE").slice(0, 25),
      cidade: (implantacaoCidade || "Vitoria da Conquista").slice(0, 15),
      chave: "58571081000160",
      solicitacaoPagador: "SINAL 01 - RESERVA DE IMÓVEL",
      expiracao: 2400,
    };

    try {
      const response = await axios.post(PIX_API_URL, requestBody);

      if (!response.data.sucesso || !response.data.payloadEmv) {
        throw new Error(
          response.data.mensagem || "Erro ao gerar QR Code no servidor."
        );
      }

      const { identificador, payloadEmv } = response.data;

      // Guarda o identificador para monitoramento
      setCurrentPixId(identificador);

      // Chama a função onConfirm para salvar os dados no Supabase
      await onConfirm(valor, identificador, payloadEmv);

      // NOVO: Dispara o webhook da Botmaker (API externa)
      try {
        if (contatoCliente && BOTMAKER_TOKEN) {
          const botmakerPayload = {
            nomeCliente: clienteNome || unitData?.[7] || "N/A",
            nomeEmpreendimento: implantacaoNome,
            unidade: unitData?.[2] || "N/A",
            contatoCliente: contatoCliente,
            identificadorPix: identificador,
          };
          
          console.log("[BOTMAKER] Iniciando chamada à API Botmaker");
          console.log("[BOTMAKER] URL:", `${apiUrl}/api/botmaker/trigger-intent`);
          console.log("[BOTMAKER] Payload:", JSON.stringify(botmakerPayload, null, 2));
          console.log("[BOTMAKER] Token presente:", BOTMAKER_TOKEN ? "Sim" : "Não");
          console.log("[BOTMAKER] Token length:", BOTMAKER_TOKEN.length);
          
          const botmakerResponse = await axios.post(
            `${apiUrl}/api/botmaker/trigger-intent`,
            botmakerPayload,
            {
              headers: {
                Authorization: `Bearer ${BOTMAKER_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          
          console.log("[BOTMAKER] Resposta recebida com sucesso");
          console.log("[BOTMAKER] Status:", botmakerResponse.status);
          console.log("[BOTMAKER] Data:", JSON.stringify(botmakerResponse.data, null, 2));
        } else {
          console.warn(
            "[BOTMAKER] Webhook não disparado: Telefone do cliente ou token não encontrado."
          );
          console.warn("[BOTMAKER] contatoCliente:", contatoCliente || "(vazio)");
          console.warn("[BOTMAKER] BOTMAKER_TOKEN presente:", BOTMAKER_TOKEN ? "Sim" : "Não");
        }
      } catch (botmakerError) {
        console.error(
          "[BOTMAKER] Falha ao disparar o webhook da Botmaker:",
          botmakerError
        );
        if (axios.isAxiosError(botmakerError)) {
          console.error("[BOTMAKER] Status:", botmakerError.response?.status);
          console.error("[BOTMAKER] Dados da resposta:", botmakerError.response?.data);
          console.error("[BOTMAKER] Headers:", botmakerError.response?.headers);
          console.error("[BOTMAKER] Mensagem de erro:", botmakerError.message);
        }
      }

      setPayload(payloadEmv);
      setShowQr(true);
    } catch (e: unknown) {
      let errorMessage =
        "Falha ao gerar QR Code. Verifique os dados e tente novamente.";
      if (axios.isAxiosError(e)) {
        errorMessage = e.response?.data?.mensagem || e.message;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      }
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!show || !unitData) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content pix-modal-content">
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        
        {showPaymentSuccess ? (
          <div className="payment-success-animation">
            <div className="success-checkmark">
              <div className="check-icon"></div>
            </div>
            <h2>Pagamento Confirmado!</h2>
            <p>O PIX foi recebido com sucesso.</p>
          </div>
        ) : (
          <>
            <h2>
              Pagamento PIX para Unidade <strong>{unitData[2]}</strong>
            </h2>

            {!showQr ? (
          <>
            {loadingCliente ? (
              <div className="loading-cliente">
                <p>Carregando dados do cliente...</p>
              </div>
            ) : (
              <>
                {clienteNome && (
                  <div className="info-cliente">
                    <p><strong>Cliente:</strong> {clienteNome}</p>
                    <p><strong>CPF:</strong> {clienteDocumento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
                  </div>
                )}
              </>
            )}
            <div className="form-group">
              <label>TXID (Gerado automaticamente)</label>
              <input type="text" value={txid} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="pix-contato">Contato (WhatsApp)</label>
              <input
                id="pix-contato"
                type="text"
                value={contatoCliente}
                onChange={(e) => setContatoCliente(e.target.value)}
                placeholder="5577912345678"
                className="contato-input"
              />
              <small>Número que receberá a notificação do PIX gerado.</small>
            </div>
            <div className="form-group">
              <label htmlFor="pix-valor">Valor do PIX (R$)</label>
              <input
                id="pix-valor"
                type="text"
                value={displayValor}
                onChange={handleValorChange}
                placeholder="R$ 0,00"
                className="valor-input"
              />
            </div>
            {error && <p className="modal-error">{error}</p>}
            <button
              className="modal-reserve-button"
              onClick={handleGenerateQr}
              disabled={isGenerating || valor <= 0}
            >
              {isGenerating ? "Gerando..." : "Gerar QR Code"}
            </button>
          </>
        ) : (
          <div className="qr-code-container">
            <h3>Aponte a câmera para o QR Code</h3>
            {payload ? (
              <div className="qr-code-wrapper">
                <QRCodeCanvas
                  value={payload}
                  size={256}
                  level={"H"}
                  includeMargin={true}
                />
              </div>
            ) : (
              <p className="modal-error">
                Payload para o QR Code não encontrado.
              </p>
            )}
            {showPending ? (
              <>
                <p className="waiting-payment-text">
                  PIX pendente de pagamento
                </p>
                <small>
                  Este PIX ainda está aguardando confirmação. Não é possível
                  gerar um novo até que este seja pago ou expire.
                </small>
              </>
            ) : (
              <>
                <p className="waiting-payment-text">
                  Aguardando confirmação de pagamento...
                </p>
                <small>
                  O PIX será registrado assim que o pagamento for confirmado.
                </small>
                <button
                  className="modal-block-button"
                  onClick={handleShowFormAgain}
                >
                  Gerar Novo PIX
                </button>
              </>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
