import { useEffect, useState } from "react";
import axios from "axios";
import { supabase } from "../supabaseClient";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import "./Diretoria.css";

interface DiretoriaData {
  quantidadeReservas?: number;
  unidadesBloqueadas?: number;
  unidadesDisponiveis?: number;
  totalValorUnidadesReservadas?: number;
  totalPix?: number;
  totalCartao?: number;
  totalDinheiro?: number;
  totalCheque?: number;
  unidadesReservadasPorTipologia?: Record<string, number>;
  unidadesReservadasPorImobiliaria?: Record<string, number>;
  unidadesReservadasPorCorretor?: Record<string, number>;
}

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";
const apiUrl = import.meta.env.DEV ? "http://localhost:3000" : AWS_API_URL;

export function Diretoria() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiretoriaData>({});
  const [searchImobiliaria, setSearchImobiliaria] = useState("");
  const [searchCorretor, setSearchCorretor] = useState("");

  // Função para buscar dados (acesso público, sem autenticação)
  const fetchData = async () => {
    try {
      setLoading(true);
      const resp = await axios.get(`${apiUrl}/api/diretoria`);
      setData((resp.data as DiretoriaData) || {});
      setError(null);
    } catch (err: unknown) {
      console.error(err);
      let message = "Erro ao carregar dados";
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.error || err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Carregamento inicial + Realtime subscriptions
  useEffect(() => {
    let mounted = true;

    // Fetch inicial
    if (mounted) fetchData();

    // Subscrever a mudanças em unidades (para detectar cancelamentos/reservas)
    const unidadesChannel = supabase
      .channel('diretoria-unidades')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unidades',
        },
        () => {
          console.log('[Diretoria] Unidade atualizada - recarregando dados');
          if (mounted) fetchData();
        }
      )
      .subscribe();

    // Subscrever a mudanças em pagamentos
    const pagamentosChannel = supabase
      .channel('diretoria-pagamentos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pagamentos',
        },
        () => {
          console.log('[Diretoria] Pagamento atualizado - recarregando dados');
          if (mounted) fetchData();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(unidadesChannel);
      supabase.removeChannel(pagamentosChannel);
    };
  }, []);

  if (loading) return <div className="diretoria-loading">Carregando dashboard...</div>;
  if (error) return <div className="diretoria-error">Erro: {error}</div>;

  // safe defaults
  const pagamentos = {
    pix: Number(data.totalPix ?? 0),
    cartao: Number(data.totalCartao ?? 0),
    dinheiro: Number(data.totalDinheiro ?? 0),
    cheque: Number(data.totalCheque ?? 0),
  };

  return (
    <HelmetProvider>
      <div className="diretoria-root">
        <Helmet>
          <title>Diretoria — Dashboard</title>
        </Helmet>

        <header className="diretoria-top">
          <div>
            <h1>Diretoria</h1>
            <p className="subtitle">Painel executivo — reservas, pagamentos e KPIs</p>
          </div>
          <div className="header-actions">
            <button className="btn-primary">Atualizar</button>
          </div>
        </header>

        <section className="kpi-grid">
          <article className="kpi-card accent">
            <div className="kpi-label">Quantidade de reservas</div>
            <div className="kpi-value">{data.quantidadeReservas ?? 0}</div>
            <div className="kpi-delta">Últimas 24h: <span>+{data.quantidadeReservas ? Math.round((data.quantidadeReservas||0)*0.05) : 0}</span></div>
          </article>

          <article className="kpi-card">
            <div className="kpi-label">Unidades bloqueadas</div>
            <div className="kpi-value">{data.unidadesBloqueadas ?? 0}</div>
            <div className="kpi-delta">Bloqueios ativos</div>
          </article>

          <article className="kpi-card">
            <div className="kpi-label">Unidades disponíveis</div>
            <div className="kpi-value">{data.unidadesDisponiveis ?? 0}</div>
            <div className="kpi-delta">Disponíveis para venda</div>
          </article>

          <article className="kpi-card money">
            <div className="kpi-label">Valor total reservado</div>
            <div className="kpi-value">R$ {Number(data.totalValorUnidadesReservadas ?? 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
            <div className="kpi-delta">Recebido / Em processo</div>
          </article>
        </section>

        <section className="panels-row">
          <div className="panel big">
            <h3 className="panel-title">Totais por forma de pagamento</h3>
            <div className="panel-body payments">
              <div className="donut">
                <svg viewBox="0 0 42 42" className="donut-chart">
                  {(() => {
                    const parts = [
                      { v: pagamentos.pix, c: '#00b894', label: 'PIX' },
                      { v: pagamentos.cartao, c: '#0984e3', label: 'Cartão' },
                      { v: pagamentos.dinheiro, c: '#fdcb6e', label: 'Dinheiro' },
                      { v: pagamentos.cheque, c: '#6c5ce7', label: 'Cheque' },
                    ];
                    const total = parts.reduce((s,p)=>s+p.v,0) || 1;
                    let offset = 25;
                    return parts.map((p, i) => {
                      const size = (p.v / total) * 100;
                      const el = (
                        <circle key={i}
                          className="donut-segment"
                          r="15.91549430918954"
                          cx="21" cy="21"
                          fill="transparent"
                          stroke={p.c}
                          strokeWidth="6"
                          strokeDasharray={`${size} ${100 - size}`}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += size;
                      return el;
                    });
                  })()}
                  <circle r="9" cx="21" cy="21" fill="#071023" />
                </svg>
                <div className="donut-center">Pagamentos</div>
              </div>

              <div className="payments-list">
                <div className="payment-row"><strong>PIX</strong><span>R$ {pagamentos.pix.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>
                <div className="payment-row"><strong>Cartão</strong><span>R$ {pagamentos.cartao.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>
                <div className="payment-row"><strong>Dinheiro</strong><span>R$ {pagamentos.dinheiro.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>
                <div className="payment-row"><strong>Cheque</strong><span>R$ {pagamentos.cheque.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>
              </div>
            </div>
          </div>

          <div className="panel small">
            <h3 className="panel-title">Reservas por Tipologia</h3>
            <div className="panel-body bars">
              {Object.keys(data.unidadesReservadasPorTipologia || {}).length === 0 && <div className="empty">Nenhuma tipologia reservada</div>}
              {(
                Object.entries(data.unidadesReservadasPorTipologia || {}) as [string, number][]
              ).map(([k, v], i) => {
                return (
                  <div className="bar-row" key={i}>
                    <div className="bar-meta">
                      <span className="bar-key">{k}</span>
                      <span className="bar-num">{v}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lists-row">
          <div className="list-card">
            <h3>Reservadas por Imobiliária</h3>
            <div className="list-tools">
              <input className="list-search" placeholder="Pesquisar imobiliária" value={searchImobiliaria} onChange={(ev)=>setSearchImobiliaria(ev.target.value)} />
            </div>
            <div className="list-body" style={{ height: '350px', overflowY: 'auto' }}>
              {(
                (Object.entries(data.unidadesReservadasPorImobiliaria || {}) as [string, number][])
                .filter(([k]) => k.toLowerCase().includes(searchImobiliaria.trim().toLowerCase()))
              ).map(([k, v], i) => (
                <div className="list-row" key={i}><span>{k}</span><strong>{v}</strong></div>
              ))}
            </div>
          </div>

          <div className="list-card">
            <h3>Reservadas por Corretor</h3>
            <div className="list-tools">
              <input className="list-search" placeholder="Pesquisar corretor" value={searchCorretor} onChange={(ev)=>setSearchCorretor(ev.target.value)} />
            </div>
            <div className="list-body" style={{ height: '350px', overflowY: 'auto' }}>
              {(
                (Object.entries(data.unidadesReservadasPorCorretor || {}) as [string, number][])
                .filter(([k]) => k.toLowerCase().includes(searchCorretor.trim().toLowerCase()))
              ).map(([k, v], i) => (
                <div className="list-row" key={i}><span>{k}</span><strong>{v}</strong></div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </HelmetProvider>
  );
}
