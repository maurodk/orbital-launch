// frontend/components/NewImplantationModal.tsx

import { useState } from "react";
import axios from "axios";

interface NewImplantationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  apiUrl: string;
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

export function NewImplantationModal({
  isOpen,
  onClose,
  onSuccess,
  apiUrl,
}: NewImplantationModalProps) {
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imagemAdicionalFile, setImagemAdicionalFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [adicionalPreviewUrl, setAdicionalPreviewUrl] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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
      setImagePreviewUrl(previewUrl);
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
      setLogoPreviewUrl(previewUrl);
    }
  };

  const handleAdditionalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validar tamanho (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError("A imagem adicional não pode exceder 50MB");
        e.target.value = "";
        return;
      }

      setImagemAdicionalFile(file);
      const previewUrl = URL.createObjectURL(file);
      setAdicionalPreviewUrl(previewUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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

    console.log("ðŸš€ [FRONTEND] Iniciando criação de empreendimento");
    console.log("ðŸ“‹ [FRONTEND] Dados do formulário:", {
      nome,
      endereco,
      cidade,
      estado,
      hasImagem: !!imagemFile,
      hasLogo: !!logoFile,
    });

    try {
      const formData = new FormData();
      formData.append("nome", nome.trim());
      formData.append("endereco", endereco.trim());
      formData.append("cidade", cidade.trim());
      formData.append("estado", estado);
      if (imagemFile) {
        formData.append("imagem", imagemFile);
      }
      if (imagemAdicionalFile) {
        formData.append("imagem_adicional", imagemAdicionalFile);
      }
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      console.log("ðŸ“¦ [FRONTEND] FormData preparado");

      const token = localStorage.getItem("token");
      console.log("ðŸ”‘ [FRONTEND] Token existe?", !!token);

      if (!token) {
        console.error("Erro: [FRONTEND] Token não encontrado!");
        throw new Error("Token de autenticação não encontrado");
      }

      console.log(
        "ðŸ“¡ [FRONTEND] Enviando requisição para:",
        `${apiUrl}/api/implantacoes`
      );

      const response = await axios.post(
        `${apiUrl}/api/implantacoes`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("OK [FRONTEND] Resposta recebida:", response.data);

      // Limpar formulário
      setNome("");
      setEndereco("");
      setCidade("");
      setEstado("");
      setImagemFile(null);
      setImagemAdicionalFile(null);
      setLogoFile(null);
      setImagePreviewUrl(null);
      setAdicionalPreviewUrl(null);
      setLogoPreviewUrl(null);

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Erro: [FRONTEND] Erro ao criar empreendimento");

      if (axios.isAxiosError(err)) {
        console.error("ðŸ“Š [FRONTEND] Detalhes do erro Axios:", {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          config: {
            url: err.config?.url,
            method: err.config?.method,
            headers: err.config?.headers,
          },
        });
      } else {
        console.error("ðŸ“Š [FRONTEND] Erro não-Axios:", err);
      }

      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          "Erro ao criar empreendimento. Tente novamente."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

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
          border: "2px solid #2563eb",
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
          + Novo Lançamento
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
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt="Preview da implantação"
                  style={{
                    width: "100%",
                    maxHeight: "250px",
                    objectFit: "contain",
                    border: "1px solid #2a2a2a",
                    borderRadius: "4px",
                    backgroundColor: "#2a2a2a",
                    cursor: "pointer",
                  }}
                  onClick={() => setZoomedImage(imagePreviewUrl)}
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
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt="Preview da logo"
                  style={{
                    width: "100%",
                    maxHeight: "150px",
                    objectFit: "contain",
                    border: "1px solid #2a2a2a",
                    borderRadius: "4px",
                    backgroundColor: "#2a2a2a",
                    cursor: "pointer",
                  }}
                  onClick={() => setZoomedImage(logoPreviewUrl)}
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
            {/* Preview da Imagem Adicional */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "10px",
                  fontWeight: "bold",
                  color: "#eaeaea",
                }}
              >
                Imagem Adicional (opcional)
              </label>
              {adicionalPreviewUrl ? (
                <img
                  src={adicionalPreviewUrl}
                  alt="Preview adicional"
                  style={{
                    width: "100%",
                    maxHeight: "150px",
                    objectFit: "contain",
                    border: "1px solid #2a2a2a",
                    borderRadius: "4px",
                    backgroundColor: "#2a2a2a",
                    cursor: "pointer",
                  }}
                  onClick={() => setZoomedImage(adicionalPreviewUrl)}
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
                  Upload - Imagem Adicional (opcional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAdditionalFileChange}
                  style={{ width: "100%" }}
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

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                    color: "#eaeaea",
                  }}
                >
                  Imagem da Implantação (opcional)
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
                      color: "#2563eb",
                      marginTop: "5px",
                      display: "block",
                    }}
                  >
                    Arquivo selecionado: {imagemFile.name}
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
                  Logo do Termo de Reserva (opcional)
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
                      color: "#2563eb",
                      marginTop: "5px",
                      display: "block",
                    }}
                  >
                    Arquivo selecionado: {logoFile.name}
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
                    backgroundColor: "#2563eb",
                    color: "#121212",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  {isLoading ? "Criando..." : "Criar Empreendimento"}
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
                  setImageScale((prev: number) =>
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
