// frontend/src/components/PixModal.tsx

import { useState, useEffect, useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import axios from "axios";
import "./PixModal.css";

interface PixModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  unidades: string[][];
  implantacaoNome: string;
  implantacaoSigla: string;
  onConfirm: (
    txid: string,
    valor: number,
    identificador: string,
    payloadEmv: string,
    statusPagamento: string
  ) => Promise<void>;
}

// Estrutura de dados para os estados e cidades permitidos
const CIDADES_POR_ESTADO: { [key: string]: string[] } = {
  BA: ["VITORIA DA CONQUISTA", "SALVADOR", "FEIRA DE SANTANA", "ITABUNA"],
  SP: ["SAO PAULO", "CAMPINAS", "GUARULHOS", "SANTOS", "SAO JOSE DOS CAMPOS"],
  RJ: ["RIO DE JANEIRO", "NITEROI", "DUQUE DE CAXIAS", "NOVA IGUACU"],
  MG: ["BELO HORIZONTE", "UBERLANDIA", "CONTAGEM", "JUIZ DE FORA"],
  PR: ["CURITIBA", "LONDRINA", "MARINGA"],
  SC: ["FLORIANOPOLIS", "JOINVILLE", "BLUMENAU"],
  RS: ["PORTO ALEGRE", "CAXIAS DO SUL", "PELOTAS"],
  PE: ["RECIFE", "JABOATAO DOS GUARARAPES", "OLINDA"],
  CE: ["FORTALEZA", "CAUCAIA", "JUAZEIRO DO NORTE"],
  DF: ["BRASILIA"],
  GO: ["GOIANIA", "APARECIDA DE GOIANIA", "ANAPOLIS"],
  AM: ["MANAUS"],
};

const ESTADOS_PERMITIDOS = Object.keys(CIDADES_POR_ESTADO);

export function PixModal({
  show,
  onClose,
  unitData,
  unidades,
  implantacaoNome,
  implantacaoSigla,
  onConfirm,
}: PixModalProps) {
  const [valor, setValor] = useState(0);
  const [displayValor, setDisplayValor] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [estado, setEstado] = useState(ESTADOS_PERMITIDOS[0]);
  const [cidade, setCidade] = useState(
    CIDADES_POR_ESTADO[ESTADOS_PERMITIDOS[0]][0]
  );
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPaid, setIsPaid] = useState(false); // NOVO: Estado para controlar a confirmação de pagamento

  // ALTERAÇÃO: Apontar para o nosso próprio backend que atuará como proxy
  const apiUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : "https://simulador-implantacao.onrender.com";
  const PIX_API_URL = `${apiUrl}/api/santander/gerapix`;

  useEffect(() => {
    // Reseta o estado quando o modal é fechado ou a unidade muda
    if (!show) {
      setValor(0);
      setDisplayValor("");
      setIsGenerating(false);
      setShowQr(false);
      setPayload(null);
      setError("");
      setIsPaid(false); // Reseta o estado de pagamento
      // Reseta para o estado e cidade padrão
      const defaultEstado = ESTADOS_PERMITIDOS[0];
      setEstado(defaultEstado);
      setCidade(CIDADES_POR_ESTADO[defaultEstado][0]);
    }
  }, [show]);

  // NOVO: Efeito para reagir à atualização de status em tempo real
  useEffect(() => {
    // Verifica se o status do pagamento (coluna Q, índice 16) mudou para "PAGO"
    if (show && unitData && unitData[16]?.toUpperCase() === "PAGO") {
      setIsPaid(true); // Ativa a animação de sucesso

      // Fecha o modal automaticamente após 3 segundos
      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer); // Limpa o timer se o componente for desmontado
    }
  }, [unitData, show, onClose]);

  // NOVO: Efeito para iniciar o polling (verificação periódica) do status do pagamento
  useEffect(() => {
    if (showQr && !isPaid) {
      const sheetRowIndex = unitData
        ? unidades.findIndex((u) => u[2] === unitData[2]) + 2
        : null;
      if (!sheetRowIndex) return;

      const interval = setInterval(async () => {
        try {
          // Chama o novo endpoint para forçar a atualização
          await axios.post(`${apiUrl}/api/refresh-unit`, {
            implantacao: implantacaoNome,
            rowIndex: sheetRowIndex,
          });
        } catch (error) {
          console.error("Falha ao verificar status do PIX:", error);
        }
      }, 3000); // Verifica a cada 3 segundos

      // Limpa o intervalo quando o modal é fechado ou o pagamento é confirmado
      return () => clearInterval(interval);
    }
  }, [showQr, isPaid, unitData, implantacaoNome, unidades, apiUrl]);

  const txid = useMemo(() => {
    if (!unitData || !implantacaoSigla) return "";
    const unitIdentifier = (unitData[2] || "").replace(/[^A-Z0-9]/gi, "");
    return `${implantacaoSigla}${unitIdentifier}`;
  }, [unitData, implantacaoSigla]);

  // Atualiza a cidade quando o estado muda
  useEffect(() => {
    if (estado) {
      setCidade(CIDADES_POR_ESTADO[estado][0]);
    }
  }, [estado]);

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
        let cpfLimpo = (unitData?.[7] || "").replace(/\D/g, "");
        if (cpfLimpo.length <= 10) {
          cpfLimpo = cpfLimpo.padStart(11, "0");
        }
        return cpfLimpo;
      })(),
      nome: (unitData?.[6] || "CLIENTE").slice(0, 25),
      cidade: cidade.slice(0, 15),
      chave: "58571081000160",
      solicitacaoPagador: "SINAL 01 - RESERVA DE IMÓVEL",
      expiracao: 600,
      infoAdicionais: [
        {
          nome: "Campo 2",
          valor:
            "Efetuar o pagamento do sinal oficializará a reserva de sua unidade.",
        },
      ],
    };

    try {
      const response = await axios.post(PIX_API_URL, requestBody);

      if (!response.data.sucesso || !response.data.payloadEmv) {
        throw new Error(
          response.data.mensagem || "Erro ao gerar QR Code no servidor."
        );
      }

      const { identificador, payloadEmv } = response.data;

      // Chama a função onConfirm para salvar os dados na planilha
      await onConfirm(txid, valor, identificador, payloadEmv, "PENDENTE");

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

  // Se o pagamento foi confirmado, mostra a animação de sucesso
  if (isPaid) {
    return (
      <div className="modal-overlay">
        <div className="modal-content pix-modal-content payment-success-animation">
          <div className="success-checkmark">
            <div className="check-icon"></div>
          </div>
          <h2>Pagamento Confirmado!</h2>
          <p>
            A reserva da unidade <strong>{unitData[2]}</strong> foi
            oficializada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content pix-modal-content">
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        <h2>
          Pagamento PIX para Unidade <strong>{unitData[2]}</strong>
        </h2>

        {!showQr ? (
          <>
            <div className="form-group">
              <label>TXID (Gerado automaticamente)</label>
              <input type="text" value={txid} readOnly />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Cliente</label>
                <input type="text" value={unitData[6] || "N/A"} readOnly />
              </div>
              <div className="form-group">
                <label>Corretor</label>
                <input type="text" value={unitData[8] || "N/A"} readOnly />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pix-estado">Estado</label>
                <select
                  id="pix-estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="modal-select"
                >
                  {ESTADOS_PERMITIDOS.map((est) => (
                    <option key={est} value={est}>
                      {est}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pix-cidade">Cidade</label>
                <select
                  id="pix-cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="modal-select"
                  disabled={!estado}
                >
                  {(CIDADES_POR_ESTADO[estado] || []).map((cid) => (
                    <option key={cid} value={cid}>
                      {cid}
                    </option>
                  ))}
                </select>
              </div>
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
                Payload para o QR Code não encontrado na planilha.
              </p>
            )}
            <p className="waiting-payment-text">
              Aguardando confirmação de pagamento...
            </p>
            <small>
              O status da unidade será atualizado automaticamente para "PAGO"
              assim que o pagamento for confirmado.
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
