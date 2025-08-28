// frontend/src/components/TermoDeReserva.tsx

import { forwardRef } from "react";
import "./TermoDeReserva.css";
// ATENÇÃO: Verifique se o caminho e o nome do arquivo da imagem estão corretos!
import backgroundShape from "../src/assets/shape.png";

// Interface com todos os dados que o termo precisa
export interface TermoData {
  clienteNome: string;
  clienteCpf: string;
  unidadeDesc: string; // Ex: "BL 01 - APT 101"
  tipologia: string;
  areaPrivativa: string;
  etapa: string;
  empreendimentoNome: string;
  empreendimentoEndereco: string;
  corretorNome: string;
  dataAtual: string; // Ex: "Vitória da Conquista, 26 de Julho de 2024"
  logoEmpreendimentoUrl: string;
  dataHoraImpressao: string; // <-- ADICIONE ESTA LINHA
}

interface TermoDeReservaProps {
  data: TermoData | null;
}

export const TermoDeReserva = forwardRef<HTMLDivElement, TermoDeReservaProps>(
  ({ data }, ref) => {
    if (!data) return null;

    return (
      <div id="print-container" ref={ref}>
        {/* Camada 1: O Timbrado (fica no fundo) */}
        <div
          className="termo-background-shape"
          style={{ backgroundImage: `url(${backgroundShape})` }}
        ></div>

        {/* Camada 2: O Conteúdo (fica na frente, com fundo transparente) */}
        <div className="termo-page">
          <header className="termo-header">
            <img
              src={data.logoEmpreendimentoUrl}
              alt="Logo do Empreendimento"
              className="logo-uni"
            />
            <img
              src="/logo-vca.png"
              alt="VCA Construtora"
              className="logo-vca"
            />
          </header>

          <main className="termo-main">
            <h1>TERMO DE RESERVA DE UNIDADE</h1>

            <p className="termo-paragraph">
              Pelo presente instrumento, o(a){" "}
              <strong>{data.clienteNome}</strong>, inscrito(a) no CPF nº{" "}
              <strong>{data.clienteCpf}</strong>, doravante denominado(a)
              COMPRADOR(A), declara estar ciente e de acordo com a reserva da
              unidade <strong>{data.unidadeDesc}</strong>, de tipologia{" "}
              <strong>{data.tipologia}</strong>, com área privativa de{" "}
              <strong>{data.areaPrivativa}</strong>, pertencente à{" "}
              <strong>{data.etapa}</strong>, integrante do empreendimento
              denominado <strong>{data.empreendimentoNome}</strong>, localizado
              no endereço <strong>{data.empreendimentoEndereco}</strong> a ser
              incorporado.
            </p>
            <p className="termo-paragraph">
              A presente reserva é formalizada mediante as condições previamente
              apresentadas e discutidas com o(a) Corretor(a){" "}
              <strong>{data.corretorNome}</strong>, responsável pela
              intermediação da venda.
            </p>
            <p className="termo-paragraph">
              O(a) COMPRADOR(A) declara estar ciente de que a presente reserva
              não constitui contrato definitivo de compra e venda, estando a
              efetivação da aquisição vinculada à assinatura do instrumento
              contratual próprio e ao cumprimento integral das condições
              comerciais e documentais estabelecidas pela
              incorporadora/construtora.
            </p>
            <p className="termo-paragraph">
              E por estarem de acordo, firmam o presente termo em{" "}
              {data.dataAtual}.
            </p>

            <div className="termo-tables">
              <table>
                <thead>
                  <tr>
                    <th>SÉRIE</th>
                    <th>PARCELAS</th>
                    <th>VALOR</th>
                    <th>DATA DE PAGAMENTO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>FINANCIAMENTO CEF</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>SUBSÍDIO</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>FGTS</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>SINAL</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>ENTRADA/MENSAL</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              <div className="table-title">TABELA DE REGISTRO</div>
              <table>
                <thead>
                  <tr>
                    <th>SÉRIE</th>
                    <th>PARCELAS</th>
                    <th>VALOR</th>
                    <th>DATA DE PAGAMENTO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="termo-lgpd">
              <h3>AUTORIZAÇÃO PARA TRATAMENTO DE DADOS PESSOAIS</h3>
              <p>
                Em conformidade com os critérios previstos na Lei nº 13.709/2018
                (Lei Geral de Proteção de Dados Pessoais - LGPD), conforme
                redação dada pela Lei nº 13.853/2019, consinto que a empresa VCA
                Construtora, CNPJ 15.464.677/0001-58, realize o tratamento dos
                meus dados pessoais com a finalidade de análise de crédito,
                coleta e processamento de dados necessários para a execução da
                venda e para a confecção do Contrato de Compromisso de Compra e
                Venda, com ou sem alienação fiduciária da unidade mencionada.
              </p>
            </div>
          </main>

          <footer className="termo-footer">
            <div className="termo-footer-signatures">
              <div className="signature-line">
                <p>Assinatura do Comprador:</p>
              </div>
              <div className="signature-line">
                <p>Assinatura do Corretor:</p>
              </div>
            </div>
            <div className="termo-print-timestamp">
              Termo gerado em: {data.dataHoraImpressao}
            </div>
          </footer>
        </div>
      </div>
    );
  }
);
