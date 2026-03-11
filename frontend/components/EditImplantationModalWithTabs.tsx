// frontend/components/EditImplantationModalWithTabs.tsx

import { useState, useEffect } from "react";
import axios from "axios";
import type { AxiosResponse } from "axios";

interface PlanosConfig {
  habilitado: boolean;
  planos: string[];
}

type ImplantationUpdatePayload = {
  id?: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cvcrm_id?: string;
  planosConfig?: PlanosConfig | null;
};

interface Implantation {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cvcrm_id?: string;
  url?: string;
  logo_url?: string;
  imagem_url_adicional?: string;
  imagemUrlAdicional?: string;
  planosConfig?: PlanosConfig | null;
}

interface EditImplantationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedImplantation?: ImplantationUpdatePayload) => void | Promise<void>;
  apiUrl: string;
  implantation: Implantation | null;
}

const ESTADOS_BRASILEIROS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const PLANOS_PADRAO_OPTIONS = [
  { id: "plano1", label: "10% + 100x" },
  { id: "plano2", label: "10% + 48x" },
  { id: "plano3", label: "10% + 100x + 04 Intermediárias (8,5%)" },
  { id: "plano4", label: "À vista" },
  { id: "plano5", label: "À vista em 3x" },
  { id: "plano6", label: "36x mensais" },
];

type TabType = "edit" | "import" | "planos";

export function EditImplantationModal({
  isOpen,
  onClose,
  onSuccess,
  apiUrl,
  implantation,
}: EditImplantationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("edit");

  // Estados da aba de Edição
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cvcrmId, setCvcrmId] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imagemAdicionalFile, setImagemAdicionalFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [currentLogoUrl, setCurrentLogoUrl] = useState("");
  const [currentAdditionalImageUrl, setCurrentAdditionalImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);

  // Estados da aba de Importação
  const [unidadesFile, setUnidadesFile] = useState<File | null>(null);
  const [clientesFile, setClientesFile] = useState<File | null>(null);
  const [isImportingUnidades, setIsImportingUnidades] = useState(false);
  const [isImportingClientes, setIsImportingClientes] = useState(false);
  const [importError, setImportError] = useState("");

  // Estados da aba de Plano de Pagamento
  const [planosHabilitado, setPlanosHabilitado] = useState(false);
  const [planosSelecionados, setPlanosSelecionados] = useState<string[]>([]);
  const [isSavingPlanos, setIsSavingPlanos] = useState(false);
  const [planosError, setPlanosError] = useState("");
  const [planosSaved, setPlanosSaved] = useState(false);

  useEffect(() => {
    if (implantation) {
      setNome(implantation.nome || "");
      setEndereco(implantation.endereco || "");
      setCidade(implantation.cidade || "");
      setEstado(implantation.estado || "");
      setCvcrmId(implantation.cvcrm_id || "");
      setCurrentImageUrl(implantation.url || "");
      setCurrentLogoUrl(implantation.logo_url || "");
      // suportar campos alternativos que possam conter a imagem adicional
      const maybeAd = implantation.imagem_url_adicional || implantation.imagemUrlAdicional || "";
      setCurrentAdditionalImageUrl(maybeAd || "");
      setImagemFile(null);
      setLogoFile(null);
      setUnidadesFile(null);
      setClientesFile(null);
      // Carregar config de planos
      const pc = implantation.planosConfig;
      setPlanosHabilitado(pc?.habilitado ?? false);
      setPlanosSelecionados(pc?.planos ?? []);
      setPlanosSaved(false);
      setPlanosError("");
    }
  }, [implantation]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        setError("A imagem não pode exceder 50MB");
        e.target.value = "";
        return;
      }
      setImagemFile(file);
      const previewUrl = URL.createObjectURL(file);
      setCurrentImageUrl(previewUrl);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        setError("A logo não pode exceder 50MB");
        e.target.value = "";
        return;
      }
      setLogoFile(file);
      const previewUrl = URL.createObjectURL(file);
      setCurrentLogoUrl(previewUrl);
    }
  };

  const handleAdditionalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        setError("A imagem adicional não pode exceder 50MB");
        e.target.value = "";
        return;
      }
      setImagemAdicionalFile(file);
      const previewUrl = URL.createObjectURL(file);
      setCurrentAdditionalImageUrl(previewUrl);
    }
  };

  const handleUnidadesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Aceita .xlsx e .xls, case-insensitive
      if (!/\.xlsx?$/i.test(file.name)) {
        setImportError("Apenas arquivos XLSX são permitidos");
        e.target.value = "";
        return;
      }
      setUnidadesFile(file);
      setImportError("");
    }
  };

  const handleClientesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Aceita .xlsx e .xls, case-insensitive
      if (!/\.xlsx?$/i.test(file.name)) {
        setImportError("Apenas arquivos XLSX são permitidos");
        e.target.value = "";
        return;
      }
      setClientesFile(file);
      setImportError("");
    }
  };

  const handleImportUnidades = async () => {
    if (!unidadesFile) {
      setImportError("Selecione um arquivo XLSX primeiro");
      return;
    }
    if (!implantation) {
      setImportError("Implantação não encontrada");
      return;
    }

    setIsImportingUnidades(true);
    setImportError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setImportError("Token de autenticação não encontrado");
        setIsImportingUnidades(false);
        return;
      }

      const formData = new FormData();
      formData.append("csv", unidadesFile);
      formData.append("implantacao", implantation.nome);

      let response: AxiosResponse<{ message?: string }> | undefined;
      try {
        console.log("[IMPORT-UNIDADES] Enviando formData keys:", Array.from(formData.keys()));
        console.log("[IMPORT-UNIDADES] arquivo:", unidadesFile?.name, unidadesFile?.size);
        response = await axios.post(`${apiUrl}/api/import-unidades`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        });
        console.log("[IMPORT-UNIDADES] resposta recebida", response && response.data);
      } catch (errUnknown) {
        const errMsg = errUnknown instanceof Error ? errUnknown.message : String(errUnknown);
        console.error("[IMPORT-UNIDADES] erro na requisição", errMsg);
        throw errUnknown;
      }

      alert(`✅ ${response?.data?.message}`);
      setUnidadesFile(null);
      const fileInput = document.getElementById(
        "unidades-import-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Erro ao importar unidades:", err);
      const error = err as { response?: { data?: { error?: string } } };
      setImportError(
        error.response?.data?.error || "Erro ao importar unidades"
      );
    } finally {
      setIsImportingUnidades(false);
    }
  };

  const handleImportClientes = async () => {
    if (!clientesFile) {
      setImportError("Selecione um arquivo XLSX primeiro");
      return;
    }

    if (!implantation?.id) {
      setImportError("ID da implantação não encontrado");
      return;
    }

    setIsImportingClientes(true);
    setImportError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setImportError("Token de autenticação não encontrado");
        setIsImportingClientes(false);
        return;
      }

      const formData = new FormData();
      formData.append("clientes", clientesFile);
      formData.append("implantacao_id", implantation.id);

      let response: AxiosResponse<{ message?: string }> | undefined;
      try {
        console.log("[IMPORT-CLIENTES] Enviando formData keys:", Array.from(formData.keys()));
        console.log("[IMPORT-CLIENTES] arquivo:", clientesFile?.name, clientesFile?.size);
        response = await axios.post(`${apiUrl}/api/import-clientes`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        });
        console.log("[IMPORT-CLIENTES] resposta recebida", response && response.data);
      } catch (errUnknown) {
        const errMsg = errUnknown instanceof Error ? errUnknown.message : String(errUnknown);
        console.error("[IMPORT-CLIENTES] erro na requisição", errMsg);
        throw errUnknown;
      }

      alert(`✅ ${response?.data?.message}`);
      setClientesFile(null);
      const fileInput = document.getElementById(
        "clientes-import-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // Recarrega a página para atualizar a lista de clientes
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Erro ao importar clientes:", err);
      const error = err as { response?: { data?: { error?: string } } };
      setImportError(
        error.response?.data?.error || "Erro ao importar clientes"
      );
    } finally {
      setIsImportingClientes(false);
    }
  };

  const handleSavePlanos = async () => {
    if (!implantation) return;
    setIsSavingPlanos(true);
    setPlanosError("");
    setPlanosSaved(false);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setPlanosError("Token de autenticação não encontrado");
        setIsSavingPlanos(false);
        return;
      }

      const planosConfig: PlanosConfig = {
        habilitado: planosHabilitado,
        planos: planosHabilitado ? planosSelecionados : [],
      };

      const formData = new FormData();
      formData.append("nome", implantation.nome);
      formData.append("endereco", implantation.endereco || "");
      formData.append("cidade", implantation.cidade || "");
      formData.append("estado", implantation.estado || "");
      if (implantation.cvcrm_id) {
        formData.append("cvcrm_id", implantation.cvcrm_id);
      }
      formData.append("planos_config", JSON.stringify(planosConfig));

      await axios.put(`${apiUrl}/api/implantacoes/${implantation.id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      });

      setPlanosSaved(true);
      onSuccess({
        ...implantation,
        planosConfig,
      });
    } catch (err) {
      console.error("Erro ao salvar planos:", err);
      const error = err as { response?: { data?: { error?: string } } };
      setPlanosError(
        error.response?.data?.error || "Erro ao salvar configuração de planos."
      );
    } finally {
      setIsSavingPlanos(false);
    }
  };

  const handleTogglePlano = (planoId: string) => {
    setPlanosSelecionados((prev) =>
      prev.includes(planoId)
        ? prev.filter((p) => p !== planoId)
        : [...prev, planoId]
    );
    setPlanosSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!implantation) return;
    if (!nome.trim()) {
      setError("Nome do empreendimento é obrigatório");
      return;
    }
    if (!endereco.trim()) {
      setError("Endereço é obrigatório");
      return;
    }
    if (!cidade.trim()) {
      setError("Cidade é obrigatória");
      return;
    }
    if (!estado) {
      setError("Estado é obrigatório");
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("nome", nome.trim());
      formData.append("endereco", endereco.trim());
      formData.append("cidade", cidade.trim());
      formData.append("estado", estado);
      if (cvcrmId.trim()) {
        formData.append("cvcrm_id", cvcrmId.trim());
      }
      if (imagemFile) {
        formData.append("imagem", imagemFile);
      }
      if (imagemAdicionalFile) {
        formData.append("imagem_adicional", imagemAdicionalFile);
      }
      if (logoFile) {
        formData.append("logo", logoFile);
      }
      // Preservar config de planos na edição geral
      const planosConfig: PlanosConfig = {
        habilitado: planosHabilitado,
        planos: planosHabilitado ? planosSelecionados : [],
      };
      formData.append("planos_config", JSON.stringify(planosConfig));

      const token = localStorage.getItem("token");
      if (!token) {
        setError("Token de autenticação não encontrado");
        setIsLoading(false);
        return;
      }

      try {
        console.log("[PUT-IMPLANTA] Enviando formData keys:", Array.from(formData.keys()));
        console.log("[PUT-IMPLANTA] imagem:", imagemFile?.name, imagemFile?.size, "logo:", logoFile?.name, logoFile?.size);
        const response = await axios.put(`${apiUrl}/api/implantacoes/${implantation.id}`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        });
        console.log("[PUT-IMPLANTA] resposta recebida", response && response.data);
      } catch (errUnknown) {
        const errMsg = errUnknown instanceof Error ? errUnknown.message : String(errUnknown);
        console.error("[PUT-IMPLANTA] erro na requisição", errMsg);
        throw errUnknown;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Erro ao atualizar empreendimento:", err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          "Erro ao atualizar empreendimento. Tente novamente."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !implantation) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1e1e1e",
          border: "2px solid #6ad700",
          padding: "30px",
          borderRadius: "8px",
          maxWidth: "900px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#eaeaea" }}>
          Gerenciar Empreendimento
        </h2>

        {/* Abas */}
        <div
          style={{
            display: "flex",
            borderBottom: "2px solid #2a2a2a",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={() => setActiveTab("edit")}
            style={{
              padding: "12px 24px",
              border: "none",
              borderBottom:
                activeTab === "edit"
                  ? "3px solid #6ad700"
                  : "3px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === "edit" ? "#6ad700" : "#b0b0b0",
              cursor: "pointer",
              fontWeight: "bold",
              transition: "all 0.2s",
            }}
          >
            Edição
          </button>
          <button
            onClick={() => setActiveTab("import")}
            style={{
              padding: "12px 24px",
              border: "none",
              borderBottom:
                activeTab === "import"
                  ? "3px solid #6ad700"
                  : "3px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === "import" ? "#6ad700" : "#b0b0b0",
              cursor: "pointer",
              fontWeight: "bold",
              transition: "all 0.2s",
            }}
          >
            Importação
          </button>
          <button
            onClick={() => setActiveTab("planos")}
            style={{
              padding: "12px 24px",
              border: "none",
              borderBottom:
                activeTab === "planos"
                  ? "3px solid #6ad700"
                  : "3px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === "planos" ? "#6ad700" : "#b0b0b0",
              cursor: "pointer",
              fontWeight: "bold",
              transition: "all 0.2s",
            }}
          >
            Plano de Pagamento
          </button>
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === "edit" && (
          <div style={{ display: "flex", gap: "30px" }}>
            {/* Coluna esquerda - Preview das imagens */}
            <div
              style={{
                flex: "0 0 300px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "10px",
                    fontWeight: "bold",
                    color: "#eaeaea",
                  }}
                >
                  Imagem da Implantação
                </label>
                {currentImageUrl ? (
                  <img
                    src={currentImageUrl}
                    alt="Implantação atual"
                    style={{
                      width: "100%",
                      maxHeight: "250px",
                      objectFit: "contain",
                      border: "1px solid #2a2a2a",
                      borderRadius: "4px",
                      backgroundColor: "#2a2a2a",
                      cursor: "pointer",
                    }}
                    onClick={() => setZoomedImage(currentImageUrl)}
                    title="Clique para expandir"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "250px",
                      border: "1px dashed #2a2a2a",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#b0b0b0",
                    }}
                  >
                    Sem imagem
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "10px",
                    fontWeight: "bold",
                    color: "#eaeaea",
                  }}
                >
                  Logo do Termo de Reserva
                </label>
                {currentLogoUrl ? (
                  <img
                    src={currentLogoUrl}
                    alt="Logo atual"
                    style={{
                      width: "100%",
                      maxHeight: "150px",
                      objectFit: "contain",
                      border: "1px solid #2a2a2a",
                      borderRadius: "4px",
                      backgroundColor: "#2a2a2a",
                      cursor: "pointer",
                    }}
                    onClick={() => setZoomedImage(currentLogoUrl)}
                    title="Clique para expandir"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "150px",
                      border: "1px dashed #2a2a2a",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#b0b0b0",
                      fontSize: "14px",
                    }}
                  >
                    Sem logo
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "10px",
                    fontWeight: "bold",
                    color: "#eaeaea",
                  }}
                >
                  Imagem Adicional
                </label>
                {currentAdditionalImageUrl ? (
                  <img
                    src={currentAdditionalImageUrl}
                    alt="Imagem adicional"
                    style={{
                      width: "100%",
                      maxHeight: "150px",
                      objectFit: "contain",
                      border: "1px solid #2a2a2a",
                      borderRadius: "4px",
                      backgroundColor: "#2a2a2a",
                      cursor: "pointer",
                    }}
                    onClick={() => setZoomedImage(currentAdditionalImageUrl)}
                    title="Clique para expandir"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "150px",
                      border: "1px dashed #2a2a2a",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#b0b0b0",
                      fontSize: "14px",
                    }}
                  >
                    Sem imagem adicional
                  </div>
                )}
              </div>
            </div>

            {/* Coluna direita - Formulário */}
            <div style={{ flex: 1 }}>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "15px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    Nome do Empreendimento *
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    Endereço *
                  </label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                    required
                  />
                </div>

                <div
                  style={{ display: "flex", gap: "10px", marginBottom: "15px" }}
                >
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "5px",
                        fontWeight: "bold",
                        color: "#eaeaea",
                      }}
                    >
                      Estado *
                    </label>
                    <select
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #2a2a2a",
                        backgroundColor: "#2a2a2a",
                        color: "#eaeaea",
                      }}
                      required
                    >
                      <option value="">Selecione</option>
                      {ESTADOS_BRASILEIROS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 2 }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "5px",
                        fontWeight: "bold",
                        color: "#eaeaea",
                      }}
                    >
                      Cidade *
                    </label>
                    <input
                      type="text"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #2a2a2a",
                        backgroundColor: "#2a2a2a",
                        color: "#eaeaea",
                      }}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    ID no CVCRM (opcional)
                  </label>
                  <input
                    type="text"
                    value={cvcrmId}
                    onChange={(e) => setCvcrmId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    Alterar Imagem da Implantação (opcional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                  />
                  {imagemFile && (
                    <small
                      style={{
                        color: "#6ad700",
                        marginTop: "5px",
                        display: "block",
                      }}
                    >
                      Nova imagem selecionada: {imagemFile.name}
                    </small>
                  )}
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    Alterar Logo do Termo de Reserva (opcional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                  />
                  {logoFile && (
                    <small
                      style={{
                        color: "#6ad700",
                        marginTop: "5px",
                        display: "block",
                      }}
                    >
                      Nova logo selecionada: {logoFile.name}
                    </small>
                  )}
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                      color: "#eaeaea",
                    }}
                  >
                    Alterar Imagem Adicional (opcional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAdditionalChange}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                    }}
                  />
                  {imagemAdicionalFile && (
                    <small
                      style={{
                        color: "#6ad700",
                        marginTop: "5px",
                        display: "block",
                      }}
                    >
                      Nova imagem adicional selecionada: {imagemAdicionalFile.name}
                    </small>
                  )}
                </div>

                {error && (
                  <div
                    style={{
                      backgroundColor: "#2a2a2a",
                      color: "#d9534f",
                      padding: "10px",
                      borderRadius: "4px",
                      border: "1px solid #d9534f",
                      marginBottom: "15px",
                    }}
                  >
                    {error}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                      cursor: isLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: "#6ad700",
                      color: "#121212",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontWeight: "bold",
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === "import" && (
          <div>
            {/* Importação de Unidades */}
            <div
              style={{
                marginBottom: "30px",
                padding: "20px",
                backgroundColor: "#1a1a1a",
                borderRadius: "8px",
                border: "1px solid #2a2a2a",
              }}
            >
              <h3
                style={{ marginTop: 0, marginBottom: "10px", color: "#6ad700" }}
              >
                📊 Importar Unidades (XLSX)
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "#888",
                  marginBottom: "15px",
                }}
              >
                Formato esperado: ETAPA, BLOCO, UNIDADE, ÁREA PRIVATIVA,
                TIPOLOGIA, SITUAÇÃO e VALOR DO IMÓVEL
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "#d9534f",
                  marginBottom: "15px",
                }}
              >
                ⚠️ A importação irá <strong>sobrescrever</strong> todas as
                unidades atuais desta implantação.
              </p>
              <div
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <input
                  id="unidades-import-input"
                  type="file"
                  accept=".xlsx"
                  onChange={handleUnidadesFileChange}
                  disabled={isImportingUnidades}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #2a2a2a",
                    backgroundColor: "#2a2a2a",
                    color: "#eaeaea",
                    cursor: isImportingUnidades ? "not-allowed" : "pointer",
                  }}
                />
                <button
                  type="button"
                  onClick={handleImportUnidades}
                  disabled={!unidadesFile || isImportingUnidades}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "none",
                    backgroundColor:
                      !unidadesFile || isImportingUnidades ? "#444" : "#6ad700",
                    color:
                      !unidadesFile || isImportingUnidades ? "#888" : "#121212",
                    cursor:
                      !unidadesFile || isImportingUnidades
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isImportingUnidades ? "Importando..." : "Importar Unidades"}
                </button>
              </div>
              {unidadesFile && !isImportingUnidades && (
                <small
                  style={{
                    color: "#6ad700",
                    marginTop: "8px",
                    display: "block",
                  }}
                >
                  ✓ {unidadesFile.name}
                </small>
              )}
            </div>

            {/* Importação de Clientes */}
            <div
              style={{
                padding: "20px",
                backgroundColor: "#1a1a1a",
                borderRadius: "8px",
                border: "1px solid #2a2a2a",
              }}
            >
              <h3
                style={{ marginTop: 0, marginBottom: "10px", color: "#6ad700" }}
              >
                👥 Importar Clientes Aptos (XLSX)
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "#888",
                  marginBottom: "15px",
                }}
              >
                Formato esperado: ID do Pré-cadastro, Cliente, CPF/CNPJ,
                Corretor e Imobiliária
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "#d9534f",
                  marginBottom: "15px",
                }}
              >
                ⚠️ A importação irá <strong>sobrescrever</strong> todos os
                clientes aptos atuais.
              </p>
              <div
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <input
                  id="clientes-import-input"
                  type="file"
                  accept=".xlsx"
                  onChange={handleClientesFileChange}
                  disabled={isImportingClientes}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #2a2a2a",
                    backgroundColor: "#2a2a2a",
                    color: "#eaeaea",
                    cursor: isImportingClientes ? "not-allowed" : "pointer",
                  }}
                />
                <button
                  type="button"
                  onClick={handleImportClientes}
                  disabled={!clientesFile || isImportingClientes}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "none",
                    backgroundColor:
                      !clientesFile || isImportingClientes ? "#444" : "#6ad700",
                    color:
                      !clientesFile || isImportingClientes ? "#888" : "#121212",
                    cursor:
                      !clientesFile || isImportingClientes
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isImportingClientes ? "Importando..." : "Importar Clientes"}
                </button>
              </div>
              {clientesFile && !isImportingClientes && (
                <small
                  style={{
                    color: "#6ad700",
                    marginTop: "8px",
                    display: "block",
                  }}
                >
                  ✓ {clientesFile.name}
                </small>
              )}
            </div>

            {importError && (
              <div
                style={{
                  backgroundColor: "#2a2a2a",
                  color: "#d9534f",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #d9534f",
                  marginTop: "20px",
                }}
              >
                {importError}
              </div>
            )}
          </div>
        )}

        {activeTab === "planos" && (
          <div>
            <p
              style={{
                fontSize: "14px",
                color: "#b0b0b0",
                marginBottom: "20px",
                lineHeight: "1.5",
              }}
            >
              Configure quais planos de pagamento estarão disponíveis após a
              reserva de unidades neste empreendimento. Quando desabilitado, o
              fluxo do Worker (automação de séries de pagamento) não será
              executado.
            </p>

            {/* Toggle habilitar/desabilitar */}
            <div
              style={{
                padding: "20px",
                backgroundColor: "#1a1a1a",
                borderRadius: "8px",
                border: "1px solid #2a2a2a",
                marginBottom: "20px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  color: "#eaeaea",
                  fontWeight: "bold",
                  fontSize: "15px",
                }}
              >
                <input
                  type="checkbox"
                  checked={planosHabilitado}
                  onChange={(e) => {
                    setPlanosHabilitado(e.target.checked);
                    setPlanosSaved(false);
                  }}
                  style={{
                    width: "20px",
                    height: "20px",
                    accentColor: "#6ad700",
                    cursor: "pointer",
                  }}
                />
                Habilitar Plano de Pagamento (Worker)
              </label>
              <p
                style={{
                  fontSize: "12px",
                  color: "#888",
                  marginTop: "8px",
                  marginBottom: 0,
                  marginLeft: "32px",
                }}
              >
                {planosHabilitado
                  ? "O Worker irá processar as séries de pagamento após a reserva."
                  : "O Worker NÃO será acionado para este empreendimento."}
              </p>
            </div>

            {/* Lista de planos */}
            {planosHabilitado && (
              <div
                style={{
                  padding: "20px",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "8px",
                  border: "1px solid #2a2a2a",
                  marginBottom: "20px",
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: "15px",
                    color: "#6ad700",
                    fontSize: "15px",
                  }}
                >
                  Planos Disponíveis
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    marginBottom: "15px",
                  }}
                >
                  Selecione os planos que estarão disponíveis para os corretores
                  no momento da reserva:
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {PLANOS_PADRAO_OPTIONS.map((plano) => (
                    <label
                      key={plano.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "12px 16px",
                        backgroundColor: planosSelecionados.includes(plano.id)
                          ? "rgba(106, 215, 0, 0.1)"
                          : "#2a2a2a",
                        borderRadius: "6px",
                        border: planosSelecionados.includes(plano.id)
                          ? "1px solid #6ad700"
                          : "1px solid #333",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={planosSelecionados.includes(plano.id)}
                        onChange={() => handleTogglePlano(plano.id)}
                        style={{
                          width: "18px",
                          height: "18px",
                          accentColor: "#6ad700",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          color: planosSelecionados.includes(plano.id)
                            ? "#eaeaea"
                            : "#b0b0b0",
                          fontWeight: planosSelecionados.includes(plano.id)
                            ? "bold"
                            : "normal",
                        }}
                      >
                        {plano.label}
                      </span>
                    </label>
                  ))}
                </div>
                {planosHabilitado && planosSelecionados.length === 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#d9534f",
                      marginTop: "10px",
                      marginBottom: 0,
                    }}
                  >
                    ⚠️ Selecione pelo menos um plano de pagamento.
                  </p>
                )}
              </div>
            )}

            {planosError && (
              <div
                style={{
                  backgroundColor: "#2a2a2a",
                  color: "#d9534f",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #d9534f",
                  marginBottom: "15px",
                }}
              >
                {planosError}
              </div>
            )}

            {planosSaved && (
              <div
                style={{
                  backgroundColor: "rgba(106, 215, 0, 0.1)",
                  color: "#6ad700",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #6ad700",
                  marginBottom: "15px",
                }}
              >
                ✅ Configuração de planos salva com sucesso!
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSavingPlanos}
                style={{
                  padding: "10px 20px",
                  borderRadius: "4px",
                  border: "1px solid #2a2a2a",
                  backgroundColor: "#2a2a2a",
                  color: "#eaeaea",
                  cursor: isSavingPlanos ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePlanos}
                disabled={
                  isSavingPlanos ||
                  (planosHabilitado && planosSelecionados.length === 0)
                }
                style={{
                  padding: "10px 20px",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor:
                    isSavingPlanos ||
                    (planosHabilitado && planosSelecionados.length === 0)
                      ? "#444"
                      : "#6ad700",
                  color:
                    isSavingPlanos ||
                    (planosHabilitado && planosSelecionados.length === 0)
                      ? "#888"
                      : "#121212",
                  cursor:
                    isSavingPlanos ||
                    (planosHabilitado && planosSelecionados.length === 0)
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: "bold",
                  opacity: isSavingPlanos ? 0.6 : 1,
                }}
              >
                {isSavingPlanos ? "Salvando..." : "Salvar Planos"}
              </button>
            </div>
          </div>
        )}

        {/* Modal de Zoom */}
        {zoomedImage && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.95)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10001,
              overflow: "hidden",
            }}
            onClick={() => {
              setZoomedImage(null);
              setImageScale(1);
            }}
          >
            <div
              style={{
                position: "relative",
                maxWidth: "90vw",
                maxHeight: "90vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={zoomedImage}
                alt="Imagem expandida"
                style={{
                  maxWidth: imageScale === 1 ? "100%" : "none",
                  maxHeight: imageScale === 1 ? "90vh" : "none",
                  width: imageScale !== 1 ? `${imageScale * 100}%` : "auto",
                  objectFit: "contain",
                  borderRadius: "8px",
                  cursor: imageScale > 1 ? "grab" : "default",
                  transition: "transform 0.2s ease",
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  setImageScale((prev) =>
                    Math.min(Math.max(1, prev + delta), 5)
                  );
                }}
              />
              {imageScale > 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "20px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "rgba(106, 215, 0, 0.9)",
                    color: "#121212",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    pointerEvents: "none",
                  }}
                >
                  {Math.round(imageScale * 100)}%
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
