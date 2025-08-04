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

const API_URL = "http://localhost:3001";

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
    return clientes.filter((c) => c && c[6] === "PODE RESERVAR");
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
    updatedUnidades[unitIndexToClear][11] = "";
    updatedUnidades[unitIndexToClear][12] = "";
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
      const hasCoords = unidades[unitIndex][11] && unidades[unitIndex][12];
      if (hasCoords) {
        handleClearCoords(unitIndex);
      }
      return;
    }
    setSelectedUnitIndex(unitIndex);
    const status = unidades[unitIndex][10]?.toLowerCase();
    if (status === "disponível") {
      setIsReserveModalOpen(true);
    } else if (status === "reservada") {
      setIsCancelModalOpen(true);
    }
  };

  const handleReserveUnit = async (selectedClientName: string) => {
    if (selectedUnitIndex === null) return;
    const clientData = clientes.find((c) => c[0] === selectedClientName);
    if (!clientData) return;
    const dataToUpdate = [
      selectedClientName,
      clientData[1],
      clientData[2],
      clientData[3],
      clientData[4],
      clientData[5],
      "RESERVADA",
    ];
    const updatedUnidades = [...unidades];
    const targetUnidade = updatedUnidades[selectedUnitIndex];
    Object.assign(targetUnidade, {
      4: dataToUpdate[0],
      5: dataToUpdate[1],
      6: dataToUpdate[2],
      7: dataToUpdate[3],
      8: dataToUpdate[4],
      9: dataToUpdate[5],
      10: dataToUpdate[6],
    });
    setUnidades(updatedUnidades);
    const updatedClientes = clientes.map((c) =>
      c[0] === selectedClientName ? [...c.slice(0, 6), "JA RESERVOU"] : c
    );
    setClientes(updatedClientes);
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/update`, {
        rowIndex: sheetRowIndex,
        data: dataToUpdate,
        clientName: selectedClientName,
        implantacao: selectedImplantationName,
      });
    } catch (err) {
      setError("Falha ao salvar a reserva na planilha.");
      console.error(err);
    }
  };

  const handleCancelReservation = async () => {
    if (selectedUnitIndex === null) return;
    const unidadeAlvo = unidades[selectedUnitIndex];
    const clientNameToRelease = unidadeAlvo[4];
    const updatedUnidades = [...unidades];
    Object.assign(updatedUnidades[selectedUnitIndex], {
      4: "",
      5: "",
      6: "",
      7: "",
      8: "",
      9: "",
      10: "DISPONÍVEL",
    });
    setUnidades(updatedUnidades);
    if (clientNameToRelease) {
      const updatedClientes = clientes.map((c) =>
        c[0] === clientNameToRelease ? [...c.slice(0, 6), "PODE RESERVAR"] : c
      );
      setClientes(updatedClientes);
    }
    handleCloseModals();
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
    updatedUnidades[unitToMapIndex][11] = coordX;
    updatedUnidades[unitToMapIndex][12] = coordY;
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
                  onUnitClick={handleUnitClick}
                  onMapClick={handleMapClickAndSaveCoords}
                />
              )}
              {view === "list" && (
                <ReservationList
                  unidades={unidades}
                  onReserveClick={handleUnitClick}
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
