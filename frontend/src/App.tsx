// src/App.tsx - VERSÃO COM A CORREÇÃO DO TIPO 'ApiResponse'

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { FloorPlan } from "../components/FloorPlan";
import { ReservationModal } from "../components/ReservationModal";
import { ReservationList } from "../components/ReservationList";
import { CancelModal } from "../components/CancelModal";
import { MappingSidebar } from "../components/MappingSidebar";
import { ImplantationSwitcher } from "../components/ImplantationSwitcher";
import "./App.css";

const API_URL = "https://simulador-implantacao.onrender.com";

interface ApiResponse {
  unidades: string[][];
  clientes: string[][];
}

interface AppConfig {
  implantacaoAtual?: string;
}

interface Implantation {
  nome: string;
  url: string;
}

function App() {
  const [unidades, setUnidades] = useState<string[][]>([]);
  const [clientes, setClientes] = useState<string[][]>([]);
  const [implantacoes, setImplantacoes] = useState<Implantation[]>([]);
  const [selectedImplantationName, setSelectedImplantationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [switching, setSwitching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [unitToMapIndex, setUnitToMapIndex] = useState<number | null>(null);

  const clientesDisponiveis = useMemo(() => {
    return clientes.filter((c) => c && c[5] === "PODE RESERVAR");
  }, [clientes]);

  const fetchUnitData = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
      // <<< CORREÇÃO AQUI: Adicionado o tipo <ApiResponse> >>>
      const response = await axios.get<ApiResponse>(
        `${API_URL}/api/data?implantacao=${implantacaoName}`
      );
      setUnidades(response.data.unidades.slice(1) || []);
      setClientes(response.data.clientes.slice(1) || []);
    } catch (err) {
      console.error(`Erro ao carregar dados para ${implantacaoName}`, err);
      setError(`Não foi possível carregar os dados para "${implantacaoName}".`);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [configRes, implantacoesRes] = await Promise.all([
          axios.get<AppConfig>(`${API_URL}/api/config`),
          axios.get<Implantation[]>(`${API_URL}/api/implantacoes`),
        ]);

        const allImplantations = implantacoesRes.data || [];
        setImplantacoes(allImplantations);

        const currentImplantationName =
          configRes.data.implantacaoAtual || allImplantations[0]?.nome || "";
        setSelectedImplantationName(currentImplantationName);

        const currentImplantation = allImplantations.find(
          (imp) => imp.nome === currentImplantationName
        );
        if (currentImplantation) {
          setImageUrl(currentImplantation.url);
          await fetchUnitData(currentImplantation.nome);
        }

        setError(null);
      } catch (err) {
        setError("Falha ao carregar a configuração inicial.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleImplantationChange = async (newName: string) => {
    const newImplantation = implantacoes.find((imp) => imp.nome === newName);
    if (!newImplantation || newName === selectedImplantationName) return;

    setSelectedImplantationName(newName);
    setImageUrl(newImplantation.url);

    await fetchUnitData(newName);

    try {
      await axios.post(`${API_URL}/api/update-config`, {
        key: "implantacaoAtual",
        value: newName,
      });
    } catch (error) {
      console.error("Falha ao salvar a implantação selecionada.", error);
      alert("Não foi possível salvar sua escolha.");
    }
  };

  const handleUpdateImageUrl = async (newUrl: string) => {
    setImageUrl(newUrl);
    try {
      await axios.post(`${API_URL}/api/update-config`, {
        key: "imagemPlantaAtual",
        value: newUrl,
      });
    } catch (error) {
      console.error("Falha ao salvar a nova URL da imagem", error);
      alert(
        "Não foi possível salvar a nova imagem. Verifique o link e tente novamente."
      );
    }
  };

  const handleCloseModals = () => {
    setIsReserveModalOpen(false);
    setIsCancelModalOpen(false);
    setSelectedUnitIndex(null);
  };

  const handleClearCoords = async (unitIndexToClear: number) => {
    const unit = unidades[unitIndexToClear];
    if (!unit) return;
    const isConfirmed = window.confirm(
      `Tem certeza que deseja remover o mapeamento da unidade "${unit[3]}"?`
    );
    if (!isConfirmed) return;
    const updatedUnidades = [...unidades];
    updatedUnidades[unitIndexToClear][10] = "";
    updatedUnidades[unitIndexToClear][11] = "";
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitIndexToClear + 2;
      await axios.post(`${API_URL}/api/clear-coords`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao remover o mapeamento na planilha.");
      console.error(err);
    }
  };

  const handleUnitClick = (unitIndex: number) => {
    if (isMappingMode) {
      const hasCoords = unidades[unitIndex][10] && unidades[unitIndex][11];
      if (hasCoords) {
        handleClearCoords(unitIndex);
      }
      return;
    }
    setSelectedUnitIndex(unitIndex);
    const status = unidades[unitIndex][9]?.toLowerCase();
    if (status === "disponível") {
      setIsReserveModalOpen(true);
    } else if (status === "reservada") {
      setIsCancelModalOpen(true);
    }
  };

  const handleReserveUnit = async (selectedClientId: string) => {
    if (selectedUnitIndex === null) return;

    const clientData = clientes.find((c) => c[0] === selectedClientId);
    if (!clientData) {
      console.error("Cliente selecionado não encontrado no estado local.");
      return;
    }

    const clientName = clientData[1];
    const unitName = unidades[selectedUnitIndex][3];

    // MUDANÇA PRINCIPAL AQUI: Montando o array para as colunas E até J
    const dataToUpdate = [
      clientData[0], // E (4): ID PRÉ-CADASTRO
      clientData[1], // F (5): Cliente
      clientData[2], // G (6): Documento cliente
      clientData[3], // H (7): Corretor
      clientData[4], // I (8): Imobiliária
      "RESERVADA", // J (9): SITUAÇÃO UNIDADE
    ];

    // ATUALIZAÇÃO OTIMISTA DO ESTADO LOCAL
    const updatedUnidades = [...unidades];
    const targetUnidade = updatedUnidades[selectedUnitIndex];
    // MUDANÇA: Atualizando os índices de 4 a 9 com os novos dados
    Object.assign(targetUnidade, {
      4: dataToUpdate[0],
      5: dataToUpdate[1],
      6: dataToUpdate[2],
      7: dataToUpdate[3],
      8: dataToUpdate[4],
      9: dataToUpdate[5],
    });
    setUnidades(updatedUnidades);

    // Lógica de atualização do cliente (sem mudanças, já correta)
    const updatedClientes = clientes.map((c) =>
      c[0] === selectedClientId ? [...c.slice(0, 5), "JA RESERVOU"] : c
    );
    setClientes(updatedClientes);

    handleCloseModals();

    // Envio para o backend (sem mudanças, pois o backend recebe o array e o range corretos)
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/update`, {
        rowIndex: sheetRowIndex,
        data: dataToUpdate,
        clientName: clientName,
        implantacao: selectedImplantationName,
        unitName: unitName,
      });
    } catch (err) {
      setError("Falha ao salvar a reserva na planilha.");
      console.error(err);
    }
  };

  const handleCancelReservation = async () => {
    if (selectedUnitIndex === null) return;

    const unidadeAlvo = unidades[selectedUnitIndex];
    const clientNameToRelease = unidadeAlvo[5]; // Pega o nome do cliente do índice 5

    // ATUALIZAÇÃO OTIMISTA DO ESTADO LOCAL
    const updatedUnidades = [...unidades];

    // Garante que os índices 4 a 9 sejam atualizados corretamente
    Object.assign(updatedUnidades[selectedUnitIndex], {
      4: "", // Limpa o ID PRÉ-CADASTRO (índice 4)
      5: "", // Limpa Cliente
      6: "", // Limpa Documento
      7: "", // Limpa Corretor
      8: "", // Limpa Imobiliária
      9: "DISPONÍVEL", // Define SITUAÇÃO (índice 9) como DISPONÍVEL
    });
    setUnidades(updatedUnidades);

    // Lógica para atualizar o status do cliente localmente
    if (clientNameToRelease) {
      const updatedClientes = clientes.map((c) =>
        c[1] === clientNameToRelease ? [...c.slice(0, 5), "PODE RESERVAR"] : c
      );
      setClientes(updatedClientes);
    }

    handleCloseModals();

    // Envia a requisição para o backend
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/cancel-reservation`, {
        unitRowIndex: sheetRowIndex,
        clientName: clientNameToRelease,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao cancelar a reserva.");
      console.error(err);
    }
  };

  const handleMapClickAndSaveCoords = async (x: number, y: number) => {
    if (unitToMapIndex === null) return;
    const coordX = x.toFixed(3);
    const coordY = y.toFixed(3);
    const updatedUnidades = [...unidades];
    updatedUnidades[unitToMapIndex][10] = coordX;
    updatedUnidades[unitToMapIndex][11] = coordY;
    setUnidades(updatedUnidades);
    try {
      const sheetRowIndex = unitToMapIndex + 2;
      await axios.post(`${API_URL}/api/update-coords`, {
        rowIndex: sheetRowIndex,
        coordX,
        coordY,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao salvar as coordenadas.");
      console.error(err);
    }
    setUnitToMapIndex(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Carregando dados...</p>
      </div>
    );
  }

  if (error) {
    return <p style={{ color: "#d9534f", textAlign: "center" }}>{error}</p>;
  }

  return (
    <div className={`page-wrapper ${isMappingMode ? "sidebar-visible" : ""}`}>
      {isMappingMode && (
        <MappingSidebar
          unidades={unidades}
          onSelectUnit={setUnitToMapIndex}
          selectedUnitIndex={unitToMapIndex}
          currentImageUrl={imageUrl}
          onUpdateImage={handleUpdateImageUrl}
        />
      )}

      <div className="app-container">
        {/* <<< CÓDIGO RESTAURADO AQUI >>> */}
        {switching && (
          <div className="switching-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}

        <div>
          <main className="main-content">
            <img
              src="/logo.png"
              alt="Logo da VCA Construtora"
              className="main-logo"
            />
            <h1>Espelho de Implantação Humanizada</h1>

            <div className="top-controls">
              <div className="controls-left">
                <ImplantationSwitcher
                  implantacoes={implantacoes}
                  selected={selectedImplantationName}
                  onChange={handleImplantationChange}
                />
                <button
                  className={`toggle-mapping-button ${
                    isMappingMode ? "active" : ""
                  }`}
                  onClick={() => setIsMappingMode(!isMappingMode)}
                >
                  Modo Mapeamento
                </button>
              </div>
              <div className="view-switcher">
                <button
                  className={view === "map" ? "active" : ""}
                  onClick={() => setView("map")}
                >
                  Mapa Visual
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  onClick={() => setView("list")}
                >
                  Lista para Reserva
                </button>
              </div>
            </div>

            <div className="view-content">
              {view === "map" && imageUrl && (
                <FloorPlan
                  imageUrl={imageUrl}
                  unidades={unidades}
                  isMappingMode={isMappingMode}
                  unitToMapIndex={unitToMapIndex}
                  onUnitClick={handleUnitClick} // Já estava correto
                  onMapClick={handleMapClickAndSaveCoords}
                />
              )}
              {view === "list" && (
                <ReservationList
                  unidades={unidades}
                  // MUDANÇA: Passando a mesma função 'handleUnitClick'
                  // que o mapa usa. Isso já resolve a lógica do frontend.
                  onUnitClick={handleUnitClick}
                />
              )}
            </div>

            <ReservationModal
              show={isReserveModalOpen}
              onClose={handleCloseModals}
              unitData={
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
              }
              clientes={clientesDisponiveis}
              onReserve={handleReserveUnit}
            />
            <CancelModal
              show={isCancelModalOpen}
              onClose={handleCloseModals}
              unitData={
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
              }
              onConfirmCancel={handleCancelReservation}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
