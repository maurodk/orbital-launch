import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";

import { FloorPlan } from "../../components/FloorPlan";
import { MappingSidebar } from "../../components/MappingSidebar";
import { ImplantationSwitcher } from "../../components/ImplantationSwitcher";
import { auth } from "../../firebaseConfig";
import { Login } from "../../components/Login";
import type { AppConfig } from "./MainPage";

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL || "http://34.204.204.81:3000";
const LOCALHOST_API_URL =
  import.meta.env.VITE_LOCALHOST_API_URL || "http://localhost:3000";
const apiUrl =
  process.env.NODE_ENV === "development" ? LOCALHOST_API_URL : AWS_API_URL;

interface CvcrmUnit {
  idunidade: number;
  unidade: string;
  situacao: string;
  bloco: string;
  coord_x?: string | null;
  coord_y?: string | null;
}

interface Implantation {
  nome: string;
  url: string;
  tamanhoPonto?: number;
  cvcrmId?: string | null;
}

/**
 * Transforma os dados da API do CVCRM para o formato string[][]
 * que os componentes existentes (FloorPlan, MappingSidebar) esperam.
 */
function transformCvcrmData(cvcrmUnits: CvcrmUnit[]): string[][] {
  if (!cvcrmUnits) return [];
  return cvcrmUnits.map((unit) => {
    // Mapeia o status para o formato esperado
    const status = unit.situacao.toUpperCase();
    const disponibilidade = status === "DISPONIVEL" ? "DISPONÍVEL" : status;

    // Cria um array de strings na ordem esperada pelos componentes
    // Colunas não existentes no CVCRM podem ser preenchidas com ""
    return [
      "", // 0: Etapa/Andar (não disponível no CVCRM)
      unit.bloco || "", // 1: Bloco
      unit.unidade, // 2: Nome da Unidade
      "", // 3: Área Privativa (não disponível)
      "", // 4: Tipologia (não disponível)
      "", // 5: ID Pré-Cadastro (não disponível)
      "", // 6: Cliente (não disponível)
      "", // 7: Documento (não disponível)
      "", // 8: Corretor (não disponível)
      "", // 9: Imobiliária (não disponível)
      disponibilidade, // 10: Situação
      unit.coord_x || "", // 11: Coordenada X
      unit.coord_y || "", // 12: Coordenada Y
    ];
  });
}

export function CVCrmMappingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cvcrmUnidades, setCvcrmUnidades] = useState<CvcrmUnit[]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [dotSize, setDotSize] = useState<number>(16);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMappingMode = true; // Sempre em modo mapeamento
  const [unitToMapIndex, setUnitToMapIndex] = useState<number | null>(null);
  const [unitLetter, setUnitLetter] = useState<string>("");

  // Transforma os dados do CVCRM para o formato que os componentes esperam
  const unidadesFormatadas = useMemo(
    // REMOVIDO: O filtro anterior foi removido. Agora transformamos todas as unidades recebidas.
    () => transformCvcrmData(cvcrmUnidades),
    [cvcrmUnidades]
  );

  // Efeito para carregar a lista de implantações e a configuração inicial
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAuthLoading(false);
        return;
      }
      const token = await currentUser.getIdToken();
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      try {
        const [configRes, implantacoesRes] = await Promise.all([
          axios.get<AppConfig>(`${apiUrl}/api/config`),
          axios.get<Implantation[]>(`${apiUrl}/api/implantacoes`),
        ]);

        const allImplantations = implantacoesRes.data || [];
        setImplantacoes(allImplantations);

        const initialImplantationName =
          configRes.data.implantacaoAtual || allImplantations[0]?.nome || "";
        setSelectedImplantationName(initialImplantationName);

        // CORREÇÃO: Define a imagem e o dotSize da implantação inicial
        const initialImplantation = allImplantations.find(
          (imp) => imp.nome === initialImplantationName
        );
        if (initialImplantation) {
          setImageUrl(initialImplantation.url);
          setDotSize(initialImplantation.tamanhoPonto || 16);
        }
      } catch (err) {
        console.error("Erro ao carregar configurações iniciais:", err);
        setError("Falha ao carregar configurações. Tente novamente.");
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Efeito para buscar dados quando a implantação selecionada muda
  useEffect(() => {
    // Encontra a implantação completa para obter o cvcrmId
    const currentImplantation = implantacoes.find(
      (imp) => imp.nome === selectedImplantationName
    );

    if (!currentImplantation || !currentImplantation.cvcrmId) {
      // Se não houver implantação ou ID, limpa os dados e para
      setCvcrmUnidades([]);
      return;
    }

    const fetchDataForImplantation = async () => {
      setLoading(true);
      setError(null);
      try {
        // Busca as unidades do CVCRM e as coordenadas salvas em paralelo
        const [unitsRes, coordsRes] = await Promise.all([
          axios.get<{ unidades: CvcrmUnit[] }>(
            `${apiUrl}/api/cvcrm/units?cvcrmId=${currentImplantation.cvcrmId}`
          ),
          axios.get<{ [key: string]: { coord_x: string; coord_y: string } }>(
            `${apiUrl}/api/cvcrm/get-coords?implantacao=${selectedImplantationName}`
          ),
        ]);

        const cvcrmUnits = unitsRes.data.unidades || [];
        const savedCoords = coordsRes.data || {};

        // Mescla as coordenadas salvas com os dados do CVCRM
        const unitsWithCoords = cvcrmUnits.map((unit) => {
          const coords = savedCoords[unit.idunidade];
          return {
            ...unit,
            coord_x: coords?.coord_x || null,
            coord_y: coords?.coord_y || null,
          };
        });

        setCvcrmUnidades(unitsWithCoords);
      } catch (err) {
        console.error("Erro ao carregar dados do CVCRM:", err);
        setError("Falha ao carregar os dados. Tente novamente.");
      } finally {
        setLoading(false);
      }
    };

    fetchDataForImplantation();
  }, [selectedImplantationName, implantacoes]);

  const handleImplantationChange = async (newName: string) => {
    const newImplantation = implantacoes.find((imp) => imp.nome === newName);
    if (!newImplantation || newName === selectedImplantationName) return;

    // Atualiza o estado, o que vai disparar o useEffect acima para buscar os novos dados
    setSelectedImplantationName(newName);
    setImageUrl(newImplantation.url);
    setDotSize(newImplantation.tamanhoPonto || 16);

    try {
      await axios.post(`${apiUrl}/api/update-config`, {
        key: "implantacaoAtual", // Usando a mesma chave da página principal
        value: newName,
      });
    } catch (error) {
      console.error("Falha ao salvar a implantação selecionada.", error);
      // Não bloqueia a UI, apenas loga o erro
    }
    setUnitToMapIndex(null);
  };

  const handleMapClickAndSaveCoords = async (x: number, y: number) => {
    if (unitToMapIndex === null) return;

    const unitToUpdate = cvcrmUnidades[unitToMapIndex]; // Usa o array completo, já que não há mais filtro
    if (!unitToUpdate) return;

    const coordX = x.toFixed(3);
    const coordY = y.toFixed(3);

    // Atualiza o estado local imediatamente para feedback visual
    setCvcrmUnidades((prev) =>
      prev.map((unit) =>
        unit.idunidade === unitToUpdate.idunidade
          ? { ...unit, coord_x: coordX, coord_y: coordY }
          : unit
      )
    );

    // Salva as coordenadas no backend
    try {
      await axios.post(`${apiUrl}/api/cvcrm/update-coords`, {
        idunidade: unitToUpdate.idunidade,
        unitName: unitToUpdate.unidade,
        coordX,
        coordY,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao salvar as coordenadas.");
      console.error(err);
      // Reverte o estado local em caso de erro para manter a consistência
      setCvcrmUnidades((prev) =>
        prev.map((unit) =>
          unit.idunidade === unitToUpdate.idunidade ? unitToUpdate : unit
        )
      );
    }

    console.log(
      `Salvando Coordenadas para ${unitToUpdate.unidade} (ID: ${unitToUpdate.idunidade}):`,
      { coordX, coordY }
    );

    setUnitToMapIndex(null); // Desseleciona a unidade após o mapeamento
  };

  const handleClearCoords = async (unitIndex: number) => {
    const unitToClear = cvcrmUnidades[unitIndex];
    if (!unitToClear) return;

    const isConfirmed = window.confirm(
      `Tem certeza que deseja remover o mapeamento da unidade "${unitToClear.unidade}"?`
    );
    if (!isConfirmed) return;

    // Atualiza o estado local para remover as coordenadas
    setCvcrmUnidades((prev) =>
      prev.map((unit) =>
        unit.idunidade === unitToClear.idunidade
          ? { ...unit, coord_x: null, coord_y: null }
          : unit
      )
    );

    // Envia a atualização para o backend (salvando coordenadas vazias)
    try {
      await axios.post(`${apiUrl}/api/cvcrm/update-coords`, {
        idunidade: unitToClear.idunidade,
        unitName: unitToClear.unidade,
        coordX: "", // Envia string vazia para limpar
        coordY: "", // Envia string vazia para limpar
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao remover o mapeamento.");
      console.error(err);
      // Reverte o estado em caso de erro
      setCvcrmUnidades((prev) =>
        prev.map((unit) =>
          unit.idunidade === unitToClear.idunidade ? unitToClear : unit
        )
      );
    }
  };

  const handleSaveDotSize = async () => {
    if (!selectedImplantationName) return;
    try {
      await axios.post(`${apiUrl}/api/update-dot-size`, {
        implantacaoName: selectedImplantationName,
        newSize: dotSize,
      });
      // Atualiza o estado local da implantação para refletir a mudança
      setImplantacoes((prev) =>
        prev.map((imp) =>
          imp.nome === selectedImplantationName
            ? { ...imp, tamanhoPonto: dotSize }
            : imp
        )
      );
      alert(`Tamanho do ponto (${dotSize}px) salvo com sucesso!`);
    } catch (error) {
      console.error("Falha ao salvar o tamanho do ponto.", error);
      alert("Não foi possível salvar a alteração. Tente novamente.");
    }
  };

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Verificando autenticação...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>
          Carregando dados do CVCRM...
          <br />
          <small>(Isso pode levar alguns segundos)</small>
        </p>
      </div>
    );
  }

  if (error) {
    return <p style={{ color: "#d9534f", textAlign: "center" }}>{error}</p>;
  }

  return (
    <HelmetProvider>
      <Helmet>
        <title>Mapeamento CVCRM - VCA</title>
      </Helmet>
      <div className="page-wrapper sidebar-visible">
        <MappingSidebar
          unidades={unidadesFormatadas}
          onSelectUnit={setUnitToMapIndex}
          selectedUnitIndex={unitToMapIndex}
          currentImageUrl={imageUrl}
          onUpdateImage={setImageUrl} // Simplificado por enquanto
          dotSize={dotSize}
          onDotSizeChange={setDotSize}
          onSaveDotSize={handleSaveDotSize}
          unitLetter={unitLetter}
          onLetterChange={setUnitLetter}
        />
        <div className="app-container">
          <h1>Mapeamento de Unidades - CVCRM</h1>
          <div className="top-controls-cvcrm">
            <Link to="/" style={{ color: "var(--accent-green)" }}>
              &larr; Voltar para a página principal
            </Link>
            <ImplantationSwitcher
              implantacoes={implantacoes}
              selected={selectedImplantationName}
              onChange={handleImplantationChange}
            />
          </div>
          <FloorPlan
            imageUrl={imageUrl}
            unidades={unidadesFormatadas}
            isMappingMode={isMappingMode}
            unitToMapIndex={unitToMapIndex}
            onUnitClick={(unitIndex: number) => {
              // Se estiver em modo de mapeamento, o clique em um ponto existente o remove.
              const hasCoords =
                unidadesFormatadas[unitIndex] &&
                unidadesFormatadas[unitIndex][11];
              if (isMappingMode && hasCoords) {
                handleClearCoords(unitIndex);
              }
            }}
            onMapClick={handleMapClickAndSaveCoords}
            dotSize={dotSize}
            hideAvailable={false} // Sempre mostrar todas as unidades
          />
        </div>
      </div>
    </HelmetProvider>
  );
}
