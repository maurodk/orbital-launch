// frontend/components/EditImplantationModal.tsx

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

export function EditImplantationModal({
  isOpen,
  onClose,
  onSuccess,
  apiUrl,
  implantation,
}: EditImplantationModalProps) {
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cvcrmId, setCvcrmId] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [currentLogoUrl, setCurrentLogoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [error, setError] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);

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
    }
  }, [implantation]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validar tamanho (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError("A imagem não pode exceder 50MB");
        e.target.value = "";
        return;
      }

      setImagemFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setCurrentImageUrl(previewUrl);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validar tamanho (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError("A logo não pode exceder 50MB");
        e.target.value = "";
        return;
      }

      setLogoFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setCurrentLogoUrl(previewUrl);
    }
  };

  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
        setError("Apenas arquivos CSV ou XLSX são permitidos");
        e.target.value = "";
        return;
      }

      setCsvFile(file);
      setError("");
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) {
      setError("Selecione um arquivo CSV ou XLSX primeiro");
      return;
    }

    if (!implantation) {
      setError("Implantação não encontrada");
      return;
    }

    setIsImportingCsv(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Token de autenticação não encontrado");
        setIsImportingCsv(false);
        return;
      }

      const formData = new FormData();
      formData.append("csv", csvFile);
      formData.append("implantacao", implantation.nome);

      const response = await axios.post(
        `${apiUrl}/api/import-unidades`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert(`✅ ${response.data.message}`);
      setCsvFile(null);
      const fileInput = document.getElementById(
        "edit-csv-import-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Erro ao importar CSV:", err);
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error || "Erro ao importar unidades do CSV";
      setError(errorMessage);
    } finally {
      setIsImportingCsv(false);
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

      await axios.put(
        `${apiUrl}/api/implantacoes/${implantation.id}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

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
          maxWidth: "800px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#eaeaea" }}>
          Editar Empreendimento
        </h2>

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
            {/* Preview da Implantação */}
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

            {/* Preview da Logo */}
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

              {/* Seção de Importação de Unidades via CSV */}
              <div
                style={{
                  marginBottom: "20px",
                  padding: "15px",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "4px",
                  border: "1px solid #2a2a2a",
                }}
              >
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: "#eaeaea",
                  }}
                >
                  📊 Importar Unidades (CSV)
                </label>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    marginBottom: "10px",
                  }}
                >
                  Formato: ETAPA, BLOCO, UNIDADE, ÁREA PRIVATIVA, TIPOLOGIA,
                  SITUAÇÃO, VALOR DO IMOVEL
                </p>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <input
                    id="edit-csv-import-input"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleCsvChange}
                    disabled={isImportingCsv || isLoading}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #2a2a2a",
                      backgroundColor: "#2a2a2a",
                      color: "#eaeaea",
                      cursor:
                        isImportingCsv || isLoading ? "not-allowed" : "pointer",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleImportCsv}
                    disabled={!csvFile || isImportingCsv || isLoading}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor:
                        !csvFile || isImportingCsv || isLoading
                          ? "#444"
                          : "#6ad700",
                      color:
                        !csvFile || isImportingCsv || isLoading
                          ? "#888"
                          : "#121212",
                      cursor:
                        !csvFile || isImportingCsv || isLoading
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isImportingCsv ? "Importando..." : "Importar"}
                  </button>
                </div>
                {csvFile && !isImportingCsv && (
                  <small
                    style={{
                      color: "#6ad700",
                      marginTop: "5px",
                      display: "block",
                    }}
                  >
                    ✓ {csvFile.name}
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
