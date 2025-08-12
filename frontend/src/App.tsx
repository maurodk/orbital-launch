// src/App.tsx - VERSÃO COMPLETA COM FUNCIONALIDADE DE BLOQUEIO

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { FloorPlan } from "../components/FloorPlan";
import { ReservationModal } from "../components/ReservationModal";
import { ReservationList } from "../components/ReservationList";
import { CancelModal } from "../components/CancelModal";
import { BlockModal } from "../components/BlockModal"; // Importa o novo modal
import { MappingSidebar } from "../components/MappingSidebar";
import { ImplantationSwitcher } from "../components/ImplantationSwitcher";
import "./App.css";

const API_URL = "https://simulador-implantacao.onrender.com"; // Usando localhost para desenvolvimento

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
  tamanhoPonto?: number;
}

interface ManualData {
  id: string;
  cliente: string;
  documento: string;
  corretor: string;
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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(
    null
  );
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [unitToMapIndex, setUnitToMapIndex] = useState<number | null>(null);
  const [dotSize, setDotSize] = useState<number>(16);
  const [hideAvailable, setHideAvailable] = useState<boolean>(true);

  const [reservationModalState, setReservationModalState] = useState({
    isOpen: false,
    mode: "select" as "select" | "manual",
  });

  // Novo estado para o modal de bloqueio
  const [blockModalState, setBlockModalState] = useState({
    isOpen: false,
    isBlocking: true,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "disponível" | "reservada" | "bloqueada"
  >("all");

  const clientesDisponiveis = useMemo(() => {
    return clientes.filter((c) => c && c[5] === "PODE RESERVAR");
  }, [clientes]);

  const filteredUnidades: [string[], number][] = useMemo(() => {
    return unidades
      .map((unidade, index) => ({ data: unidade, originalIndex: index }))
      .filter(({ data }) => {
        const unitStatus = data[9]?.toLowerCase() || "disponível";
        const unitName = data[3]?.toLowerCase() || "";
        const blockName = data[2]?.toLowerCase() || "";
        const term = searchTerm.toLowerCase();
        const statusMatch =
          statusFilter === "all" || unitStatus === statusFilter;
        const searchMatch = unitName.includes(term) || blockName.includes(term);
        return statusMatch && searchMatch;
      })
      .map((item) => [item.data, item.originalIndex]);
  }, [unidades, searchTerm, statusFilter]);

  const fetchUnitData = async (implantacaoName: string) => {
    if (!implantacaoName) return;
    setSwitching(true);
    try {
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
          setDotSize(currentImplantation.tamanhoPonto || 16);
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
    setDotSize(newImplantation.tamanhoPonto || 16);
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

  const handleSaveDotSize = async () => {
    if (!selectedImplantationName) return;
    const newSize = dotSize;
    try {
      await axios.post(`${API_URL}/api/update-dot-size`, {
        implantacaoName: selectedImplantationName,
        newSize: newSize,
      });
      alert(
        `Tamanho do ponto (${newSize}px) salvo com sucesso para a implantação ${selectedImplantationName}!`
      );
    } catch (error) {
      console.error("Falha ao salvar o tamanho do ponto.", error);
      alert("Não foi possível salvar a alteração. Tente novamente.");
    }
  };

  const handleCloseModals = () => {
    setReservationModalState({ isOpen: false, mode: "select" });
    setIsCancelModalOpen(false);
    setBlockModalState({ isOpen: false, isBlocking: true });
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
      setReservationModalState({ isOpen: true, mode: "select" });
    } else if (status === "reservada") {
      setIsCancelModalOpen(true);
    } else if (status === "bloqueada") {
      setBlockModalState({ isOpen: true, isBlocking: false });
    }
  };

  const handleSpontaneousUnitClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setReservationModalState({ isOpen: true, mode: "manual" });
  };

  const handleBlockActionClick = (unitIndex: number) => {
    setSelectedUnitIndex(unitIndex);
    setBlockModalState({ isOpen: true, isBlocking: true });
  };

  const handleToggleBlockUnit = async (
    newStatus: "BLOQUEADA" | "DISPONÍVEL"
  ) => {
    if (selectedUnitIndex === null) return;
    const updatedUnidades = [...unidades];
    updatedUnidades[selectedUnitIndex][9] = newStatus;
    setUnidades(updatedUnidades);
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      await axios.post(`${API_URL}/api/toggle-block-unit`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        newStatus: newStatus,
      });
    } catch (err) {
      setError(
        `Falha ao ${
          newStatus === "BLOQUEADA" ? "bloquear" : "desbloquear"
        } a unidade.`
      );
      console.error(err);
    }
  };

  const handleReserveUnit = async (selectedClientId: string) => {
    if (selectedUnitIndex === null) return;
    const clientData = clientes.find((c) => c[0] === selectedClientId);
    if (!clientData) {
      return;
    }
    const clientName = clientData[1];
    const unitName = unidades[selectedUnitIndex][3];
    const dataToUpdate = [
      clientData[0],
      clientData[1],
      clientData[2],
      clientData[3],
      clientData[4],
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
    });
    setUnidades(updatedUnidades);
    const updatedClientes = clientes.map((c) =>
      c[0] === selectedClientId ? [...c.slice(0, 5), "JA RESERVOU"] : c
    );
    setClientes(updatedClientes);
    handleCloseModals();
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

  const handleSpontaneousReserve = async (manualData: ManualData) => {
    if (selectedUnitIndex === null) return;
    const updatedUnidades = [...unidades];
    const targetUnidade = updatedUnidades[selectedUnitIndex];
    Object.assign(targetUnidade, {
      4: manualData.id,
      5: manualData.cliente,
      6: manualData.documento,
      7: manualData.corretor,
      8: "",
      9: "RESERVADA",
    });
    setUnidades(updatedUnidades);
    handleCloseModals();
    try {
      const sheetRowIndex = selectedUnitIndex + 2;
      const unitName = unidades[selectedUnitIndex][3];
      await axios.post(`${API_URL}/api/spontaneous-update`, {
        rowIndex: sheetRowIndex,
        implantacao: selectedImplantationName,
        unitName: unitName,
        manualData: manualData,
      });
    } catch (err) {
      setError("Falha ao salvar a reserva espontânea na planilha.");
      console.error(err);
    }
  };

  const handleReserve = (data: string | ManualData) => {
    if (typeof data === "string") {
      handleReserveUnit(data);
    } else {
      handleSpontaneousReserve(data);
    }
  };

  const handleCancelReservation = async () => {
    if (selectedUnitIndex === null) return;
    const unidadeAlvo = unidades[selectedUnitIndex];
    const clientNameToRelease = unidadeAlvo[5];
    const idPreCadastro = unidadeAlvo[4];
    const updatedUnidades = [...unidades];
    Object.assign(updatedUnidades[selectedUnitIndex], {
      4: "",
      5: "",
      6: "",
      7: "",
      8: "",
      9: "DISPONÍVEL",
    });
    setUnidades(updatedUnidades);
    if (clientNameToRelease) {
      const updatedClientes = clientes.map((c) =>
        c[1] === clientNameToRelease ? [...c.slice(0, 5), "PODE RESERVAR"] : c
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
        idPreCadastro: idPreCadastro,
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
          dotSize={dotSize}
          onDotSizeChange={setDotSize}
          onSaveDotSize={handleSaveDotSize}
        />
      )}
      <div className="app-container">
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
              <div className="controls-right">
                <div className="filter-checkbox-wrapper">
                  <input
                    type="checkbox"
                    id="hide-available-toggle"
                    checked={hideAvailable}
                    onChange={(e) => setHideAvailable(e.target.checked)}
                  />
                  <label htmlFor="hide-available-toggle">
                    Ocultar Disponíveis
                  </label>
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
                  dotSize={dotSize}
                  hideAvailable={hideAvailable}
                />
              )}
              {view === "list" && (
                <ReservationList
                  unidades={filteredUnidades}
                  onUnitClick={handleUnitClick}
                  onSpontaneousClick={handleSpontaneousUnitClick}
                  onBlockClick={handleBlockActionClick}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  totalUnidades={unidades.length}
                />
              )}
            </div>
            <ReservationModal
              show={reservationModalState.isOpen}
              onClose={handleCloseModals}
              unitData={
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
              }
              clientes={clientesDisponiveis}
              onReserve={handleReserve}
              initialMode={reservationModalState.mode}
              onBlockClick={() => {
                if (selectedUnitIndex === null) return;
                handleCloseModals();
                setTimeout(
                  () => handleBlockActionClick(selectedUnitIndex),
                  150
                );
              }}
            />
            <CancelModal
              show={isCancelModalOpen}
              onClose={handleCloseModals}
              unitData={
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
              }
              onConfirmCancel={handleCancelReservation}
            />
            <BlockModal
              show={blockModalState.isOpen}
              onClose={handleCloseModals}
              unitData={
                selectedUnitIndex !== null ? unidades[selectedUnitIndex] : null
              }
              isBlocking={blockModalState.isBlocking}
              onConfirm={() =>
                handleToggleBlockUnit(
                  blockModalState.isBlocking ? "BLOQUEADA" : "DISPONÍVEL"
                )
              }
            />
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
