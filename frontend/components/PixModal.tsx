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
  const [contatoDDI, setContatoDDI] = useState("55");
  const [contatoDDD, setContatoDDD] = useState("");
  const [contatoNumero, setContatoNumero] = useState("");
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);
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
      setContatoDDI("55");
      setContatoDDD("");
      setContatoNumero("");
      setIsResendModalOpen(false);
      setIsResending(false);
      setResendMessage("");
      setCurrentPixId(null);
      setShowPaymentSuccess(false);
      setClienteNome("");
      setClienteDocumento("");
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
            .maybeSingle(); // Permite 0 ou 1 resultado

          if (error) {
            console.error('Erro ao buscar dados do cliente:', error);
            setClienteNome("");
            setClienteDocumento("");
          } else if (data) {
            setClienteNome(data.nome || "");
            setClienteDocumento(data.documento || "");
          } else {
            // Nenhum cliente encontrado - usa dados do unitData como fallback
            setClienteNome("");
            setClienteDocumento("");
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
      let telefoneCliente = (unitData?.[9] || "").replace(/\D/g, "");

      if (telefoneCliente) {
        if (!telefoneCliente.startsWith("55") && telefoneCliente.length <= 11) {
           telefoneCliente = `55${telefoneCliente}`;
        }
        
        if (telefoneCliente.startsWith("55")) {
          setContatoDDI("55");
          setContatoDDD(telefoneCliente.substring(2, 4));
          setContatoNumero(telefoneCliente.substring(4));
        } else {
          setContatoDDI("55");
          setContatoDDD(telefoneCliente.substring(0, 2));
          setContatoNumero(telefoneCliente.substring(2));
        }
      }
    }
  }, [show, unitData]);

  // Extrai o nome do cliente após o "-", removendo espaços extras
  const extrairNomeCliente = (nome: string): string => {
    if (!nome) return "";
    
    // Se contiver "-", pega a parte após o "-"
    if (nome.includes("-")) {
      const partes = nome.split("-");
      return partes.slice(1).join("-").trim();
    }
    
    return nome.trim();
  };

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
          .maybeSingle(); // Permite 0 ou 1 resultado

        if (error) {
          console.error('Erro ao verificar status do PIX:', error);
          return;
        }

        if (data) {
          // Verifica se o PIX foi PAGO
          if (data.status_pagamento === 'PAGO') {
            setShowPaymentSuccess(true);
            
            // Fecha o modal após 4 segundos
            setTimeout(() => {
              onClose();
              setShowPaymentSuccess(false);
              setCurrentPixId(null);
            }, 4000);
          }
          // Verifica se o PIX EXPIROU - apenas mostra mensagem, não fecha o modal
          else if (data.status_pagamento === 'EXPIRADO') {
            console.log('[PixModal] PIX expirado detectado');
            
            // Apenas mostra mensagem de expiração - o cancelamento automático é feito pelo MainPage
            if (!error) {
              setError('Este PIX expirou. A reserva foi cancelada automaticamente.');
            }
          }
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
    setIsResendModalOpen(false);
    // O contato do cliente não é resetado para permitir a geração de um novo PIX para o mesmo número
  };

  const handleSendNotification = async (identificador?: string) => {
    const targetIdentificador = identificador || currentPixId;
    const targetContato = `${contatoDDI}${contatoDDD}${contatoNumero}`;
    
    if (!targetContato || targetContato.length < 10 || !targetIdentificador) {
      if (!identificador) {
        setResendSuccess(false);
        setResendMessage("Dados de contato ou PIX inválidos.");
      }
      return;
    }

    if (!identificador) {
      setIsResending(true);
      setResendMessage("");
    }

    try {
      if (BOTMAKER_TOKEN) {
        const appToken = localStorage.getItem("token");
        
        await axios.post(
          `${apiUrl}/api/botmaker/trigger-intent`,
          {
            nomeCliente: extrairNomeCliente(clienteNome || unitData?.[7] || "N/A")
              .replace(/[^\p{L} ]/gu, "")
              .trimStart()
              .replace(/ +/g, " ")
              .slice(0, 25),
            nomeEmpreendimento: implantacaoNome,
            unidade: unitData?.[2] || "N/A",
            contatoCliente: targetContato,
            identificadorPix: targetIdentificador,
          },
          {
            headers: {
              Authorization: `Bearer ${appToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (!identificador) {
          setResendSuccess(true);
          setResendMessage("Notificação reenviada com sucesso!");
        }
      } else if (!identificador) {
         setResendSuccess(false);
         setResendMessage("Token de notificação não configurado.");
      }
    } catch (botmakerError) {
      console.error("Erro ao disparar webhook Botmaker:", botmakerError);
      if (!identificador) {
        setResendSuccess(false);
        setResendMessage("Erro ao reenviar notificação.");
      }
    } finally {
      if (!identificador) setIsResending(false);
    }
  };

  const handleGenerateQr = async () => {
    if (valor <= 0) {
      setError("O valor deve ser maior que zero.");
      return;
    }

    if (valor < 1000) {
      setError("O valor mínimo para gerar PIX é R$ 1000,00");
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
      nome: extrairNomeCliente(clienteNome || unitData?.[7] || "CLIENTE")
        .replace(/[^\p{L} ]/gu, "") // Remove tudo que não for letra ou espaço
        .trimStart() // Remove espaços iniciais
        .replace(/ +/g, " ") // Deixa apenas um espaço entre os nomes
        .slice(0, 25),
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
      await handleSendNotification(identificador);

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
              <label>Contato (WhatsApp)</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select 
                  value={contatoDDI}
                  onChange={(e) => setContatoDDI(e.target.value)}
                  className="contato-input"
                  style={{ width: "80px", padding: "8px" }}
                >
                  <option value="55">+55</option>
                  <option value="1">+1</option>
                  <option value="351">+351</option>
                  <option value="33">+33</option>
                  <option value="34">+34</option>
                  <option value="39">+39</option>
                  <option value="44">+44</option>
                  <option value="49">+49</option>
                </select>
                <input
                  type="text"
                  value={contatoDDD}
                  onChange={(e) => setContatoDDD(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="DDD"
                  className="contato-input"
                  style={{ width: "70px", padding: "8px" }}
                />
                <input
                  type="text"
                  value={contatoNumero}
                  onChange={(e) => setContatoNumero(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="Número"
                  className="contato-input"
                  style={{ flex: 1, padding: "8px" }}
                />
              </div>
              <small>Número que receberá a notificação do PIX gerado.</small>
            </div>
            <div className="form-group">
              <label htmlFor="pix-valor">Valor do PIX (R$)</label>
              <input
                id="pix-valor"
                type="text"
                value={displayValor}
                onChange={handleValorChange}
                placeholder="R$ 1.000,00"
                className="valor-input"
              />
            </div>
            {error && <p className="modal-error">{error}</p>}
            <button
              className="modal-reserve-button"
              onClick={handleGenerateQr}
              disabled={isGenerating || valor < 1000}
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
                  onClick={() => {
                    setIsResendModalOpen(true);
                    setResendMessage("");
                  }}
                  style={{ marginTop: "20px", width: "100%", padding: "12px", background: "none", border: "1px solid #3b82f6", color: "#3b82f6", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ marginRight: "8px" }}>📤</span> Reenviar Notificação
                </button>

                <button
                  className="modal-block-button"
                  onClick={handleShowFormAgain}
                  style={{ marginTop: "15px" }}
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

      {/* Modal de Reenvio de PIX */}
      {isResendModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => !isResending && setIsResendModalOpen(false)}>
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: "400px", 
              width: "90%", 
              background: "#1e1e1e", 
              border: "1px solid #333",
              borderTop: "4px solid #3b82f6",
              padding: "24px" 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, color: "#eaeaea", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#3b82f6" }}>📤</span> Reenviar PIX
              </h3>
              <button 
                onClick={() => setIsResendModalOpen(false)} 
                disabled={isResending}
                style={{ background: "none", border: "none", color: "#888", fontSize: "1.5rem", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>
            
            <p style={{ color: "#aaa", fontSize: "0.9rem", marginBottom: "20px", lineHeight: "1.4" }}>
              Confirme ou altere o número do WhatsApp que receberá a nova notificação do PIX com o código copia e cola.
            </p>

            <div className="form-group" style={{ textAlign: "left", marginBottom: "24px" }}>
              <label style={{ fontSize: "14px", color: "#ccc", marginBottom: "8px", display: "block" }}>Contato (WhatsApp)</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select 
                  value={contatoDDI}
                  onChange={(e) => setContatoDDI(e.target.value)}
                  className="contato-input"
                  style={{ width: "80px", padding: "10px", background: "#2a2a2a", color: "#fff", border: "1px solid #444", borderRadius: "6px" }}
                >
                  <option value="55">+55</option>
                  <option value="1">+1</option>
                  <option value="351">+351</option>
                  <option value="33">+33</option>
                  <option value="34">+34</option>
                  <option value="39">+39</option>
                  <option value="44">+44</option>
                  <option value="49">+49</option>
                </select>
                <input
                  type="text"
                  value={contatoDDD}
                  onChange={(e) => setContatoDDD(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="DDD"
                  className="contato-input"
                  style={{ width: "70px", padding: "10px", background: "#2a2a2a", color: "#fff", border: "1px solid #444", borderRadius: "6px" }}
                />
                <input
                  type="text"
                  value={contatoNumero}
                  onChange={(e) => setContatoNumero(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="Número"
                  className="contato-input"
                  style={{ flex: 1, padding: "10px", background: "#2a2a2a", color: "#fff", border: "1px solid #444", borderRadius: "6px" }}
                />
              </div>
            </div>
            
            <button 
              className="modal-reserve-button" 
              onClick={() => handleSendNotification()}
              disabled={isResending}
              style={{ 
                width: "100%", 
                padding: "12px", 
                background: isResending ? "#444" : "#3b82f6", 
                color: "#fff", 
                border: "none", 
                borderRadius: "6px", 
                fontWeight: "bold", 
                cursor: isResending ? "not-allowed" : "pointer",
                transition: "background 0.2s"
              }}
            >
              {isResending ? "Enviando..." : "Confirmar Reenvio"}
            </button>
            
            {resendMessage && (
              <div style={{ 
                marginTop: "16px", 
                padding: "10px", 
                borderRadius: "6px", 
                background: resendSuccess ? "rgba(106, 215, 0, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${resendSuccess ? "rgba(106, 215, 0, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                color: resendSuccess ? "#6ad700" : "#ef4444", 
                textAlign: "center", 
                fontSize: "14px"
              }}>
                {resendMessage}
              </div>
            )}
            
            <button 
              onClick={() => setIsResendModalOpen(false)}
              disabled={isResending}
              style={{ 
                width: "100%", 
                padding: "12px", 
                marginTop: "10px",
                background: "transparent", 
                color: "#888", 
                border: "none", 
                cursor: isResending ? "not-allowed" : "pointer",
                fontSize: "14px"
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
