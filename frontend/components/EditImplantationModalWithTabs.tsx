// frontend/components/EditImplantationModalWithTabs.tsx

import { useState, useEffect } from "react";
import axios from "axios";

interface Implantation {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cvcrm_id?: string;
  url?: string;
  logo_url?: string;
}

interface EditImplantationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
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

type TabType = "edit" | "import";

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
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [currentLogoUrl, setCurrentLogoUrl] = useState("");
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

  useEffect(() => {
    if (implantation) {
      setNome(implantation.nome || "");
      setEndereco(implantation.endereco || "");
      setCidade(implantation.cidade || "");
      setEstado(implantation.estado || "");
      setCvcrmId(implantation.cvcrm_id || "");
      setCurrentImageUrl(implantation.url || "");
      setCurrentLogoUrl(implantation.logo_url || "");
      setImagemFile(null);
      setLogoFile(null);
      setUnidadesFile(null);
      setClientesFile(null);
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

  const handleUnidadesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith(".xlsx")) {
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
      if (!file.name.endsWith(".xlsx")) {
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

      const response = await axios.post(`${apiUrl}/api/import-unidades`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      alert(`✅ ${response.data.message}`);
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

      const response = await axios.post(`${apiUrl}/api/import-clientes`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      alert(`✅ ${response.data.message}`);
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
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const token = localStorage.getItem("token");
      if (!token) {
        setError("Token de autenticação não encontrado");
        setIsLoading(false);
        return;
      }

      await axios.put(`${apiUrl}/api/implantacoes/${implantation.id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
