import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Helmet, HelmetProvider } from "@dr.pogodin/react-helmet";
import { PasswordModal } from "../../components/PasswordModal";
import {
  normalizePropagandaCampaign,
  normalizePropagandaRuntime,
  type PropagandaCampaign,
  type PropagandaMediaAsset,
  type PropagandaMediaType,
  type PropagandaRuntime,
} from "../types/propaganda";
import "./AdvertisingControlPage.css";

const AWS_API_URL =
  import.meta.env.VITE_AWS_API_URL ||
  "https://apitelaodigital.suportevca.com.br";
const apiUrl = import.meta.env.DEV ? "http://localhost:3000" : AWS_API_URL;

type UploadTarget = "main" | "transition";

interface CampaignFormState {
  nome: string;
  descricao: string;
  mediaType: PropagandaMediaType;
  mediaUrl: string;
  mediaPath: string;
  durationSeconds: number;
  transitionStyle: string;
  transitionMediaType: PropagandaMediaType | "";
  transitionMediaUrl: string;
  transitionMediaPath: string;
  isActive: boolean;
}

interface UploadPreview {
  name: string;
  mediaType: PropagandaMediaType;
  objectUrl: string;
}

const initialFormState: CampaignFormState = {
  nome: "",
  descricao: "",
  mediaType: "mp4",
  mediaUrl: "",
  mediaPath: "",
  durationSeconds: 20,
  transitionStyle: "architectural-curtain",
  transitionMediaType: "",
  transitionMediaUrl: "",
  transitionMediaPath: "",
  isActive: true,
};

function inferUploadMediaType(file: File): PropagandaMediaType {
  const mime = String(file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime === "video/mp4" || name.endsWith(".mp4")) return "mp4";
  if (mime === "image/gif" || name.endsWith(".gif")) return "gif";
  if (mime === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  return "image";
}

function formatMediaTypeLabel(mediaType: PropagandaMediaType | ""): string {
  return mediaType ? mediaType.toUpperCase() : "Sem mídia";
}

export function AdvertisingControlPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [campaigns, setCampaigns] = useState<PropagandaCampaign[]>([]);
  const [mediaAssets, setMediaAssets] = useState<PropagandaMediaAsset[]>([]);
  const [runtime, setRuntime] = useState<PropagandaRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("main");
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignFormState>(initialFormState);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCampaignId, setScheduleCampaignId] = useState<number | null>(
    null
  );
  const [intervalMinutes, setIntervalMinutes] = useState(15);

  useEffect(() => {
    const auth = localStorage.getItem("diretoriaAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (uploadPreview?.objectUrl) {
        URL.revokeObjectURL(uploadPreview.objectUrl);
      }
    };
  }, [uploadPreview]);

  const activeCampaign = useMemo(() => {
    if (!runtime?.activeCampaignId) return null;
    return campaigns.find((campaign) => campaign.id === runtime.activeCampaignId) || null;
  }, [campaigns, runtime?.activeCampaignId]);

  const selectedMainAsset = useMemo(() => {
    if (!form.mediaPath) return null;
    return mediaAssets.find((asset) => asset.path === form.mediaPath) || null;
  }, [form.mediaPath, mediaAssets]);

  const selectedTransitionAsset = useMemo(() => {
    if (!form.transitionMediaPath) return null;
    return mediaAssets.find((asset) => asset.path === form.transitionMediaPath) || null;
  }, [form.transitionMediaPath, mediaAssets]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [campaignsResponse, runtimeResponse, mediaResponse] = await Promise.all([
        axios.get(`${apiUrl}/api/propaganda/campaigns`),
        axios.get(`${apiUrl}/api/propaganda/runtime`),
        axios.get(`${apiUrl}/api/propaganda/media`),
      ]);

      const normalizedRuntime = normalizePropagandaRuntime(
        (runtimeResponse.data?.runtime || null) as Record<string, unknown> | null
      );

      setCampaigns(
        ((campaignsResponse.data?.campaigns || []) as Record<string, unknown>[]).map(
          normalizePropagandaCampaign
        )
      );
      setRuntime(normalizedRuntime);
      setMediaAssets(
        (mediaResponse.data?.media as PropagandaMediaAsset[] | undefined) || []
      );
      setScheduleEnabled(Boolean(normalizedRuntime?.scheduleEnabled));
      setScheduleCampaignId(normalizedRuntime?.scheduleCampaignId || null);
      setIntervalMinutes(normalizedRuntime?.intervalMinutes || 15);
      setError(null);
    } catch (requestError: unknown) {
      console.error("Erro ao carregar propaganda:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao carregar dados de propaganda.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated, loadData]);

  const assignMediaAsset = useCallback((asset: PropagandaMediaAsset, target: UploadTarget) => {
    setForm((current) => {
      if (target === "transition") {
        return {
          ...current,
          transitionMediaType: asset.mediaType,
          transitionMediaUrl: asset.publicUrl,
          transitionMediaPath: asset.path,
        };
      }

      return {
        ...current,
        mediaType: asset.mediaType,
        mediaUrl: asset.publicUrl,
        mediaPath: asset.path,
      };
    });

    setFeedback(
      `Mídia ${asset.name} selecionada para ${
        target === "transition" ? "transição" : "peça principal"
      }.`
    );
  }, []);

  const clearAssignedMedia = useCallback((target: UploadTarget) => {
    setForm((current) => {
      if (target === "transition") {
        return {
          ...current,
          transitionMediaType: "",
          transitionMediaUrl: "",
          transitionMediaPath: "",
        };
      }

      return {
        ...current,
        mediaType: "image",
        mediaUrl: "",
        mediaPath: "",
      };
    });
  }, []);

  const handleMediaUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;

      if (uploadPreview?.objectUrl) {
        URL.revokeObjectURL(uploadPreview.objectUrl);
      }

      setUploadPreview({
        name: file.name,
        mediaType: inferUploadMediaType(file),
        objectUrl: URL.createObjectURL(file),
      });
      setUploadProgress(0);

      try {
        setUploadingMedia(true);
        setError(null);
        setFeedback(null);

        const formData = new FormData();
        formData.append("file", file);

        const response = await axios.post(
          `${apiUrl}/api/propaganda/media/upload`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
            timeout: 120000,
            onUploadProgress: (progressEvent) => {
              if (!progressEvent.total) return;
              setUploadProgress(
                Math.round((progressEvent.loaded / progressEvent.total) * 100)
              );
            },
          }
        );

        const uploadedMedia = response.data?.media as PropagandaMediaAsset | undefined;
        if (uploadedMedia) {
          assignMediaAsset(uploadedMedia, uploadTarget);
        }

        setFeedback("Upload concluído no bucket de propagandas.");
        await loadData();
      } catch (requestError: unknown) {
        console.error("Erro ao enviar mídia:", requestError);
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.error || requestError.message);
        } else if (requestError instanceof Error) {
          setError(requestError.message);
        } else {
          setError("Falha ao enviar mídia para o storage.");
        }
      } finally {
        setUploadingMedia(false);
      }
    },
    [assignMediaAsset, loadData, uploadPreview?.objectUrl, uploadTarget]
  );

  const promptRenameMedia = async (asset: PropagandaMediaAsset) => {
    const suggestedName = asset.name.replace(/\.[^.]+$/, "");
    const newName = window.prompt("Novo nome para a mídia:", suggestedName);

    if (!newName || newName.trim() === suggestedName) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.put(`${apiUrl}/api/propaganda/media/rename`, {
        path: asset.path,
        newName: newName.trim(),
      });
      setFeedback("Mídia renomeada com sucesso.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao renomear mídia:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao renomear mídia.");
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteMedia = async (asset: PropagandaMediaAsset) => {
    const confirmed = window.confirm(
      `Excluir a mídia ${asset.name}? Isso remove o arquivo do bucket.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.delete(`${apiUrl}/api/propaganda/media`, {
        data: { path: asset.path },
      });

      if (form.mediaPath === asset.path) {
        clearAssignedMedia("main");
      }
      if (form.transitionMediaPath === asset.path) {
        clearAssignedMedia("transition");
      }

      setFeedback("Mídia excluída do bucket.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao excluir mídia:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao excluir mídia.");
      }
    } finally {
      setSaving(false);
    }
  };

  const persistCampaign = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);

    try {
      await axios.post(`${apiUrl}/api/propaganda/campaigns`, {
        nome: form.nome,
        descricao: form.descricao,
        mediaType: form.mediaType,
        mediaUrl: form.mediaUrl,
        mediaPath: form.mediaPath,
        durationSeconds: form.durationSeconds,
        transitionStyle: form.transitionStyle,
        transitionMediaType: form.transitionMediaType || null,
        transitionMediaUrl: form.transitionMediaUrl || null,
        transitionMediaPath: form.transitionMediaPath || null,
        isActive: form.isActive,
      });

      setForm(initialFormState);
      setFeedback("Campanha salva com sucesso.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao salvar campanha:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao salvar campanha.");
      }
    } finally {
      setSaving(false);
    }
  };

  const updateCampaign = async (campaignId: number, payload: Record<string, unknown>) => {
    try {
      setError(null);
      setFeedback(null);
      await axios.put(`${apiUrl}/api/propaganda/campaigns/${campaignId}`, payload);
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao atualizar campanha:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao atualizar campanha.");
      }
    }
  };

  const triggerCampaign = async (campaignId: number) => {
    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.post(`${apiUrl}/api/propaganda/trigger`, { campaignId });
      setFeedback("Propaganda disparada na fullscreen.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao disparar campanha:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao disparar campanha.");
      }
    } finally {
      setSaving(false);
    }
  };

  const stopPlayback = async () => {
    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.post(`${apiUrl}/api/propaganda/stop`);
      setFeedback("Exibição interrompida.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao parar exibição:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao interromper exibição.");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.put(`${apiUrl}/api/propaganda/runtime`, {
        scheduleEnabled,
        scheduleCampaignId,
        intervalMinutes,
      });
      setFeedback("Agenda global atualizada.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao salvar agenda:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao salvar agenda.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return <PasswordModal onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <HelmetProvider>
      <div className="ads-control-page">
        <Helmet>
          <title>Controle de Propagandas</title>
        </Helmet>

        <header className="ads-control-page__header">
          <div>
            <p className="ads-control-page__eyebrow">Propaganda Programada</p>
            <h1>Controle Global de Fullscreen</h1>
            <p className="ads-control-page__subtitle">
              Gerencie bucket, transição e peça principal na mesma tela.
            </p>
          </div>

          <div className="ads-control-page__actions">
            <button type="button" onClick={loadData} disabled={loading || saving}>
              Atualizar
            </button>
            <button type="button" className="danger" onClick={stopPlayback} disabled={saving}>
              Parar exibição
            </button>
          </div>
        </header>

        {error && <div className="ads-control-page__alert ads-control-page__alert--error">{error}</div>}
        {feedback && (
          <div className="ads-control-page__alert ads-control-page__alert--success">
            {feedback}
          </div>
        )}

        <section className="ads-control-page__grid">
          <article className="ads-card ads-card--highlight">
            <span className="ads-card__label">Status atual</span>
            <strong className="ads-card__value">
              {runtime?.status === "playing" ? "Em exibição" : "Aguardando"}
            </strong>
            <p>{activeCampaign?.nome || runtime?.activeCampaignName || "Nenhuma campanha no ar"}</p>
          </article>

          <article className="ads-card">
            <span className="ads-card__label">Próximo disparo</span>
            <strong className="ads-card__value">
              {runtime?.nextRunAt ? new Date(runtime.nextRunAt).toLocaleString("pt-BR") : "Não agendado"}
            </strong>
            <p>Agenda global sincronizada pelo backend.</p>
          </article>

          <article className="ads-card">
            <span className="ads-card__label">Origem do disparo</span>
            <strong className="ads-card__value">{runtime?.triggerSource || "manual"}</strong>
            <p>Duração atual: {runtime?.activeDurationSeconds || 0}s</p>
          </article>
        </section>

        <section className="ads-panel ads-panel--full ads-upload-panel">
          <div className="ads-panel__head">
            <div>
              <p className="ads-panel__eyebrow">Upload com drag and drop</p>
              <h2>Bucket de mídias</h2>
            </div>
            <div className="ads-upload-targets">
              <button
                type="button"
                className={uploadTarget === "main" ? "is-selected" : "secondary"}
                onClick={() => setUploadTarget("main")}
              >
                Próximo upload: peça
              </button>
              <button
                type="button"
                className={uploadTarget === "transition" ? "is-selected" : "secondary"}
                onClick={() => setUploadTarget("transition")}
              >
                Próximo upload: transição
              </button>
            </div>
          </div>

          <div
            className={`ads-dropzone ${isDragActive ? "is-drag-active" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) {
                setIsDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              void handleMediaUpload(event.dataTransfer.files?.[0] || null);
            }}
          >
            <div className="ads-dropzone__copy">
              <strong>Solte o arquivo aqui</strong>
              <p>MP4, GIF, SVG, PNG, JPG ou WEBP. O envio vai direto para o bucket propagandas.</p>
            </div>
            <label className="ads-upload-box__button">
              <input
                type="file"
                accept="video/mp4,image/gif,image/svg+xml,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void handleMediaUpload(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
                disabled={uploadingMedia}
              />
              {uploadingMedia ? "Enviando..." : "Selecionar arquivo"}
            </label>
          </div>

          {(uploadPreview || uploadingMedia) && (
            <div className="ads-upload-preview">
              <div className="ads-upload-preview__media">
                {uploadPreview?.mediaType === "mp4" ? (
                  <video src={uploadPreview.objectUrl} controls muted />
                ) : uploadPreview ? (
                  <img src={uploadPreview.objectUrl} alt={uploadPreview.name} />
                ) : null}
              </div>
              <div className="ads-upload-preview__meta">
                <strong>{uploadPreview?.name || "Upload em andamento"}</strong>
                <span>Destino atual: {uploadTarget === "transition" ? "Transição" : "Peça principal"}</span>
                <div className="ads-progress">
                  <div className="ads-progress__bar" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p>{uploadProgress}% enviado</p>
              </div>
            </div>
          )}
        </section>

        <div className="ads-control-page__columns">
          <section className="ads-panel">
            <div className="ads-panel__head">
              <div>
                <p className="ads-panel__eyebrow">Nova campanha</p>
                <h2>Cadastro rápido</h2>
              </div>
            </div>

            <div className="ads-form-grid">
              <label>
                <span>Nome</span>
                <input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Campanha de lançamento" />
              </label>

              <label>
                <span>Duração em segundos</span>
                <input type="number" min="5" max="300" value={form.durationSeconds} onChange={(event) => setForm((current) => ({ ...current, durationSeconds: Number(event.target.value || 0) }))} />
              </label>

              <label className="span-2">
                <span>Descrição</span>
                <textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} placeholder="Uso institucional, campanha sazonal, lembrete de plantão..." />
              </label>

              <label className="span-2">
                <span>Fallback visual da transição</span>
                <input value={form.transitionStyle} onChange={(event) => setForm((current) => ({ ...current, transitionStyle: event.target.value }))} />
              </label>

              <label className="ads-checkbox span-2">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Campanha ativa para disparos</span>
              </label>
            </div>

            <div className="ads-media-assignment-grid">
              <div className="ads-assignment-card">
                <div className="ads-assignment-card__head">
                  <div>
                    <p>Peça principal</p>
                    <strong>{selectedMainAsset?.name || "Nenhuma mídia selecionada"}</strong>
                  </div>
                  <span>{formatMediaTypeLabel(form.mediaType)}</span>
                </div>
                {selectedMainAsset ? (
                  <div className="ads-assignment-card__preview">
                    {selectedMainAsset.mediaType === "mp4" ? (
                      <video src={selectedMainAsset.publicUrl} muted controls />
                    ) : (
                      <img src={selectedMainAsset.publicUrl} alt={selectedMainAsset.name} />
                    )}
                  </div>
                ) : (
                  <div className="ads-assignment-card__empty">Selecione uma mídia da biblioteca</div>
                )}
                <div className="ads-assignment-card__actions">
                  <button type="button" className="secondary" onClick={() => setUploadTarget("main")}>Próximo upload para peça</button>
                  <button type="button" className="secondary" onClick={() => clearAssignedMedia("main")}>Limpar</button>
                </div>
              </div>

              <div className="ads-assignment-card">
                <div className="ads-assignment-card__head">
                  <div>
                    <p>Transição de abertura e fechamento</p>
                    <strong>{selectedTransitionAsset?.name || "Sem mídia específica"}</strong>
                  </div>
                  <span>{formatMediaTypeLabel(form.transitionMediaType)}</span>
                </div>
                {selectedTransitionAsset ? (
                  <div className="ads-assignment-card__preview">
                    {selectedTransitionAsset.mediaType === "mp4" ? (
                      <video src={selectedTransitionAsset.publicUrl} muted controls />
                    ) : (
                      <img src={selectedTransitionAsset.publicUrl} alt={selectedTransitionAsset.name} />
                    )}
                  </div>
                ) : (
                  <div className="ads-assignment-card__empty">Se nada for selecionado, o overlay usa a cortina arquitetônica padrão.</div>
                )}
                <div className="ads-assignment-card__actions">
                  <button type="button" className="secondary" onClick={() => setUploadTarget("transition")}>Próximo upload para transição</button>
                  <button type="button" className="secondary" onClick={() => clearAssignedMedia("transition")}>Limpar</button>
                </div>
              </div>
            </div>

            <div className="ads-panel__footer">
              <button type="button" onClick={persistCampaign} disabled={saving}>Salvar campanha</button>
            </div>
          </section>

          <section className="ads-panel">
            <div className="ads-panel__head">
              <div>
                <p className="ads-panel__eyebrow">Agenda automática</p>
                <h2>Loop global</h2>
              </div>
            </div>

            <div className="ads-form-grid">
              <label className="ads-checkbox span-2">
                <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} />
                <span>Habilitar disparo automático</span>
              </label>

              <label className="span-2">
                <span>Campanha agendada</span>
                <select value={scheduleCampaignId || ""} onChange={(event) => setScheduleCampaignId(event.target.value ? Number(event.target.value) : null)}>
                  <option value="">Selecione uma campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.nome}</option>
                  ))}
                </select>
              </label>

              <label className="span-2">
                <span>Intervalo em minutos</span>
                <input type="number" min="1" max="240" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value || 1))} />
              </label>
            </div>

            <div className="ads-panel__footer">
              <button type="button" onClick={saveSchedule} disabled={saving}>Salvar agenda</button>
            </div>
          </section>
        </div>

        <section className="ads-panel ads-panel--full">
          <div className="ads-panel__head">
            <div>
              <p className="ads-panel__eyebrow">Biblioteca do bucket</p>
              <h2>Escolha independente para transição e peça</h2>
            </div>
          </div>

          {mediaAssets.length === 0 ? (
            <div className="ads-empty">Nenhuma mídia encontrada no bucket de propagandas.</div>
          ) : (
            <div className="ads-media-grid">
              {mediaAssets.map((asset) => {
                const isMainSelected = asset.path === form.mediaPath;
                const isTransitionSelected = asset.path === form.transitionMediaPath;

                return (
                  <article key={asset.path} className={`ads-media-card ${isMainSelected || isTransitionSelected ? "is-selected" : ""}`}>
                    <div className="ads-media-card__preview">
                      {asset.mediaType === "mp4" ? (
                        <video src={asset.publicUrl} muted controls />
                      ) : (
                        <img src={asset.publicUrl} alt={asset.name} />
                      )}
                    </div>
                    <div className="ads-media-card__body">
                      <strong>{asset.name}</strong>
                      <span>{asset.mediaType.toUpperCase()}</span>
                      <div className="ads-media-card__badges">
                        {isMainSelected && <em>Em uso como peça</em>}
                        {isTransitionSelected && <em>Em uso como transição</em>}
                      </div>
                    </div>
                    <div className="ads-media-card__actions">
                      <button type="button" onClick={() => assignMediaAsset(asset, "main")}>Usar na peça</button>
                      <button type="button" className="secondary" onClick={() => assignMediaAsset(asset, "transition")}>Usar na transição</button>
                      <button type="button" className="secondary" onClick={() => promptRenameMedia(asset)}>Renomear</button>
                      <button type="button" className="danger" onClick={() => deleteMedia(asset)}>Excluir</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="ads-panel ads-panel--full">
          <div className="ads-panel__head">
            <div>
              <p className="ads-panel__eyebrow">Campanhas disponíveis</p>
              <h2>Disparo manual e gerenciamento</h2>
            </div>
          </div>

          {loading ? (
            <div className="ads-empty">Carregando campanhas...</div>
          ) : campaigns.length === 0 ? (
            <div className="ads-empty">Nenhuma campanha cadastrada ainda.</div>
          ) : (
            <div className="ads-list">
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="ads-item">
                  <div className="ads-item__preview-grid">
                    <div className="ads-item__preview-block">
                      <span>Peça principal</span>
                      <div className="ads-item__preview">
                        {campaign.mediaType === "mp4" ? (
                          <video src={campaign.mediaUrl} muted preload="metadata" controls />
                        ) : (
                          <img src={campaign.mediaUrl} alt={campaign.nome} />
                        )}
                      </div>
                    </div>
                    <div className="ads-item__preview-block">
                      <span>Transição</span>
                      <div className="ads-item__preview">
                        {campaign.transitionMediaUrl ? (
                          campaign.transitionMediaType === "mp4" ? (
                            <video src={campaign.transitionMediaUrl} muted preload="metadata" controls />
                          ) : (
                            <img src={campaign.transitionMediaUrl} alt={`${campaign.nome} transição`} />
                          )
                        ) : (
                          <div className="ads-item__fallback">Cortina padrão: {campaign.transitionStyle}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ads-item__content">
                    <div className="ads-item__topline">
                      <div>
                        <h3>{campaign.nome}</h3>
                        <p>{campaign.descricao || "Sem descrição"}</p>
                      </div>
                      <span className={`ads-pill ${campaign.isActive ? "is-active" : "is-paused"}`}>{campaign.isActive ? "Ativa" : "Inativa"}</span>
                    </div>

                    <div className="ads-item__meta">
                      <span>Peça: {campaign.mediaType.toUpperCase()}</span>
                      <span>Transição: {formatMediaTypeLabel(campaign.transitionMediaType || "")}</span>
                      <span>{campaign.durationSeconds}s</span>
                      <span>{campaign.transitionStyle}</span>
                    </div>

                    <div className="ads-item__actions">
                      <button type="button" onClick={() => triggerCampaign(campaign.id)} disabled={saving || !campaign.isActive}>Exibir agora</button>
                      <button type="button" className="secondary" onClick={() => updateCampaign(campaign.id, { isActive: !campaign.isActive })}>
                        {campaign.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </HelmetProvider>
  );
}