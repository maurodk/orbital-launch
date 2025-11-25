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
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (implantation) {
      setNome(implantation.nome || "");
      setEndereco(implantation.endereco || "");
      setCidade(implantation.cidade || "");
      setEstado(implantation.estado || "");
      setCvcrmId(implantation.cvcrm_id || "");
      setCurrentImageUrl(implantation.url || "");
      setImagemFile(null);
    }
  }, [implantation]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImagemFile(e.target.files[0]);
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

      await axios.put(
        `${apiUrl}/api/implantacoes/${implantation.id}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
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
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "30px",
          borderRadius: "8px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
          Editar Empreendimento
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "bold",
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
                border: "1px solid #ccc",
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
                border: "1px solid #ccc",
              }}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
            <div style={{ flex: 2 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
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
                  border: "1px solid #ccc",
                }}
                required
              />
            </div>

            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
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
                  border: "1px solid #ccc",
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
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "bold",
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
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "bold",
              }}
            >
              Imagem da Implantação (opcional)
            </label>
            {currentImageUrl && !imagemFile && (
              <div style={{ marginBottom: "10px" }}>
                <img
                  src={currentImageUrl}
                  alt="Implantação atual"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "200px",
                    objectFit: "contain",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                  }}
                />
                <small
                  style={{ display: "block", color: "#666", marginTop: "5px" }}
                >
                  Imagem atual
                </small>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
            {imagemFile && (
              <small style={{ color: "#666", marginTop: "5px" }}>
                Nova imagem selecionada: {imagemFile.name}
              </small>
            )}
          </div>

          {error && (
            <div
              style={{
                backgroundColor: "#fee",
                color: "#c00",
                padding: "10px",
                borderRadius: "4px",
                marginBottom: "15px",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: "10px 20px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                backgroundColor: "white",
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
                backgroundColor: "#007bff",
                color: "white",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
