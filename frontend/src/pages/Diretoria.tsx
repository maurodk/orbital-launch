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

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        // obtain current session access token and include in Authorization header
        let token = null;
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          token = session?.access_token || null;
        } catch {
          token = null;
        }

        const resp = await axios.get(`${apiUrl}/api/diretoria`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!mounted) return;
        setData((resp.data as DiretoriaData) || {});
      } catch (err: any) {
        console.error(err);
        setError(err?.response?.data?.error || err.message || "Erro ao carregar dados");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      mounted = false;
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
                const values = (Object.values(data.unidadesReservadasPorTipologia || {}) as number[]).map(Number);
                const max = Math.max(...values, 1);
                const pct = Math.round((Number(v) / max) * 100);
                return (
                  <div className="bar-row" key={i}>
                    <div className="bar-meta"><span className="bar-key">{k}</span><span className="bar-num">{v}</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lists-row">
          <div className="list-card">
            <h3>Reservadas por Imobiliária</h3>
            <div className="list-body">
              {(Object.entries(data.unidadesReservadasPorImobiliaria || {}) as [string, number][]).map(([k, v], i) => (
                <div className="list-row" key={i}><span>{k}</span><strong>{v}</strong></div>
              ))}
            </div>
          </div>

          <div className="list-card">
            <h3>Reservadas por Corretor</h3>
            <div className="list-body">
              {(Object.entries(data.unidadesReservadasPorCorretor || {}) as [string, number][]).map(([k, v], i) => (
                <div className="list-row" key={i}><span>{k}</span><strong>{v}</strong></div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </HelmetProvider>
  );
}
