import { useEffect, useState } from "react";
import axios from "axios";
import { supabase } from "../supabaseClient";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";
const apiUrl = import.meta.env.DEV ? "http://localhost:3000" : AWS_API_URL;

export function Diretoria() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

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
        } catch (e) {
          // fallback: no session available
          token = null;
        }

        const resp = await axios.get(`${apiUrl}/api/diretoria`, {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : undefined,
        });
        if (!mounted) return;
        setData(resp.data);
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

  if (loading) return <div>Carregando dashboard...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <HelmetProvider>
      <div style={{ padding: 16 }}>
        <Helmet>
          <title>Diretoria — Dashboard</title>
        </Helmet>
        <h1>Diretoria</h1>

        <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, padding: 12, border: "1px solid #ddd" }}>
            <strong>Quantidade de reservas</strong>
            <div style={{ fontSize: 24 }}>{data.quantidadeReservas ?? 0}</div>
          </div>

          <div style={{ minWidth: 220, padding: 12, border: "1px solid #ddd" }}>
            <strong>Unidades bloqueadas</strong>
            <div style={{ fontSize: 24 }}>{data.unidadesBloqueadas ?? 0}</div>
          </div>

          <div style={{ minWidth: 220, padding: 12, border: "1px solid #ddd" }}>
            <strong>Unidades disponíveis</strong>
            <div style={{ fontSize: 24 }}>{data.unidadesDisponiveis ?? 0}</div>
          </div>
        </section>

        <section style={{ marginTop: 20 }}>
          <h2>Totais por forma de pagamento</h2>
          <ul>
            <li>PIX: R$ {Number(data.totalPix ?? 0).toFixed(2)}</li>
            <li>Cartão: R$ {Number(data.totalCartao ?? 0).toFixed(2)}</li>
            <li>Dinheiro: R$ {Number(data.totalDinheiro ?? 0).toFixed(2)}</li>
            <li>Cheque: R$ {Number(data.totalCheque ?? 0).toFixed(2)}</li>
          </ul>

          <h3>Valor total das unidades reservadas</h3>
          <div>R$ {Number(data.totalValorUnidadesReservadas ?? 0).toFixed(2)}</div>
        </section>

        <section style={{ marginTop: 20 }}>
          <h2>Unidades Reservadas por Tipologia</h2>
          <pre>{JSON.stringify(data.unidadesReservadasPorTipologia || {}, null, 2)}</pre>

          <h2>Unidades Reservadas por Imobiliária</h2>
          <pre>{JSON.stringify(data.unidadesReservadasPorImobiliaria || {}, null, 2)}</pre>

          <h2>Unidades Reservadas por Corretor</h2>
          <pre>{JSON.stringify(data.unidadesReservadasPorCorretor || {}, null, 2)}</pre>
        </section>
      </div>
    </HelmetProvider>
  );
}
