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
const DEFAULT_TRANSITION_STYLE = "architectural-curtain";

type CampaignAssetSlot = "main" | "entry" | "exit";

interface SelectedCampaignAsset extends PropagandaMediaAsset {
  slot: CampaignAssetSlot;
}

interface CampaignDraft {
  nome: string;
  descricao: string;
  durationSeconds: number;
  isActive: boolean;
  storageFolder: string;
  mainAsset: SelectedCampaignAsset | null;
  entryAsset: SelectedCampaignAsset | null;
  exitAsset: SelectedCampaignAsset | null;
}

const emptyDraft: CampaignDraft = {
  nome: "",
  descricao: "",
  durationSeconds: 20,
  isActive: true,
  storageFolder: "",
  mainAsset: null,
  entryAsset: null,
  exitAsset: null,
};

function slugifyCampaignName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
}

function buildDraftFolderKey(name: string): string {
  const base = slugifyCampaignName(name) || "campanha";
  return `${base}-${Date.now().toString(36)}`;
}

function inferUploadMediaType(file: File): PropagandaMediaType {
  const mime = String(file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime === "video/mp4" || name.endsWith(".mp4")) return "mp4";
  if (mime === "image/gif" || name.endsWith(".gif")) return "gif";
  if (mime === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  return "image";
}

function getAssetLabel(slot: CampaignAssetSlot): string {
  if (slot === "main") return "Midia principal";
  if (slot === "entry") return "Transicao de entrada";
  return "Transicao de saida";
}

function getAssetHint(slot: CampaignAssetSlot): string {
  if (slot === "main") return "Arquivo principal do loop da campanha.";
  if (slot === "entry") return "Transicao exibida antes da peca principal.";
  return "Transicao exibida ao encerrar a campanha.";
}

function getAssetFileName(asset: PropagandaMediaAsset | null): string {
  if (!asset) return "";
  const chunks = String(asset.path || asset.name || "").split("/");
  return chunks[chunks.length - 1] || asset.name;
}

function formatMediaType(mediaType: PropagandaMediaType | null | undefined): string {
  return mediaType ? mediaType.toUpperCase() : "Sem midia";
}

function formatRuntimeStatus(runtime: PropagandaRuntime | null): string {
  if (!runtime) return "Carregando";
  return runtime.status === "playing" ? "Em exibicao" : "Aguardando";
}

function assetToPreview(
  asset:
    | Pick<
        PropagandaMediaAsset,
        "name" | "path" | "publicUrl" | "mediaType" | "mimeType" | "size" | "createdAt" | "updatedAt"
      >
    | null
): PropagandaMediaAsset | null {
  return asset
    ? {
        name: asset.name,
        path: asset.path,
        publicUrl: asset.publicUrl,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        size: asset.size,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      }
    : null;
}

function renderAssetPreview(asset: PropagandaMediaAsset | null, alt: string) {
  if (!asset) {
    return <div className="ads-simple-asset__empty">Nenhum arquivo enviado</div>;
  }

  if (asset.mediaType === "mp4") {
    return <video src={asset.publicUrl} muted controls preload="metadata" />;
  }

  return <img src={asset.publicUrl} alt={alt} />;
}

export function AdvertisingControlPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [campaigns, setCampaigns] = useState<PropagandaCampaign[]>([]);
  const [runtime, setRuntime] = useState<PropagandaRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCampaignId, setScheduleCampaignId] = useState<number | null>(
    null
  );
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [draftFolderLocked, setDraftFolderLocked] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<CampaignAssetSlot | null>(
    null
  );
  const [cleaningDraft, setCleaningDraft] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem("diretoriaAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [campaignsResponse, runtimeResponse] = await Promise.all([
        axios.get(`${apiUrl}/api/propaganda/campaigns`),
        axios.get(`${apiUrl}/api/propaganda/runtime`),
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
    void loadData();
  }, [isAuthenticated, loadData]);

  const activeCampaign = useMemo(() => {
    if (!runtime?.activeCampaignId) return null;
    return campaigns.find((campaign) => campaign.id === runtime.activeCampaignId) || null;
  }, [campaigns, runtime?.activeCampaignId]);

  const selectedAssetsCount = [draft.mainAsset, draft.entryAsset, draft.exitAsset].filter(
    Boolean
  ).length;

  const resetDraft = useCallback(() => {
    setDraft(emptyDraft);
    setDraftFolderLocked(false);
    setUploadingSlot(null);
  }, []);

  const openCreateModal = () => {
    resetDraft();
    setDraft((current) => ({
      ...current,
      storageFolder: buildDraftFolderKey(""),
    }));
    setIsCreateModalOpen(true);
    setError(null);
    setFeedback(null);
  };

  const uploadDraftAsset = useCallback(
    async (slot: CampaignAssetSlot, file: File | null) => {
      if (!file) return;

      const folderKey = draft.storageFolder || buildDraftFolderKey(draft.nome);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignKey", folderKey);
      if (slot === "main") {
        formData.append("category", "main");
      } else {
        formData.append("category", "transition");
        formData.append("transitionPart", slot === "entry" ? "entry" : "exit");
      }

      try {
        setUploadingSlot(slot);
        setError(null);
        setFeedback(null);

        const response = await axios.post(`${apiUrl}/api/propaganda/media/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });

        const media = response.data?.media as PropagandaMediaAsset | undefined;
        if (!media) {
          throw new Error("Resposta invalida do upload da midia.");
        }

        const selectedAsset: SelectedCampaignAsset = {
          ...media,
          slot,
          mediaType: media.mediaType || inferUploadMediaType(file),
        };

        setDraft((current) => ({
          ...current,
          storageFolder: folderKey,
          mainAsset: slot === "main" ? selectedAsset : current.mainAsset,
          entryAsset: slot === "entry" ? selectedAsset : current.entryAsset,
          exitAsset: slot === "exit" ? selectedAsset : current.exitAsset,
        }));
        setDraftFolderLocked(true);
        setFeedback(`${getAssetLabel(slot)} enviada para a pasta da campanha.`);
      } catch (requestError: unknown) {
        console.error("Erro ao enviar midia da campanha:", requestError);
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.error || requestError.message);
        } else if (requestError instanceof Error) {
          setError(requestError.message);
        } else {
          setError("Falha ao enviar midia da campanha.");
        }
      } finally {
        setUploadingSlot(null);
      }
    },
    [draft.nome, draft.storageFolder]
  );

  const removeDraftAsset = useCallback(
    async (slot: CampaignAssetSlot) => {
      const asset =
        slot === "main"
          ? draft.mainAsset
          : slot === "entry"
            ? draft.entryAsset
            : draft.exitAsset;

      if (!asset) return;

      try {
        setSaving(true);
        setError(null);
        await axios.delete(`${apiUrl}/api/propaganda/media`, {
          data: { path: asset.path },
        });

        setDraft((current) => ({
          ...current,
          mainAsset: slot === "main" ? null : current.mainAsset,
          entryAsset: slot === "entry" ? null : current.entryAsset,
          exitAsset: slot === "exit" ? null : current.exitAsset,
        }));
        setFeedback(`${getAssetLabel(slot)} removida da pasta da campanha.`);
      } catch (requestError: unknown) {
        console.error("Erro ao remover midia da campanha:", requestError);
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.error || requestError.message);
        } else if (requestError instanceof Error) {
          setError(requestError.message);
        } else {
          setError("Falha ao remover midia da campanha.");
        }
      } finally {
        setSaving(false);
      }
    },
    [draft.entryAsset, draft.exitAsset, draft.mainAsset]
  );

  const closeCreateModal = useCallback(async () => {
    const uploadedAssets = [draft.mainAsset, draft.entryAsset, draft.exitAsset].filter(
      Boolean
    ) as SelectedCampaignAsset[];

    if (uploadedAssets.length === 0) {
      resetDraft();
      setIsCreateModalOpen(false);
      return;
    }

    const confirmed = window.confirm(
      "Descartar esta campanha tambem removera os arquivos ja enviados. Deseja continuar?"
    );

    if (!confirmed) return;

    try {
      setCleaningDraft(true);
      setError(null);
      await Promise.all(
        uploadedAssets.map((asset) =>
          axios.delete(`${apiUrl}/api/propaganda/media`, {
            data: { path: asset.path },
          })
        )
      );
      resetDraft();
      setIsCreateModalOpen(false);
      setFeedback("Rascunho descartado e arquivos removidos.");
    } catch (requestError: unknown) {
      console.error("Erro ao descartar campanha:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao descartar a campanha em criacao.");
      }
    } finally {
      setCleaningDraft(false);
    }
  }, [draft.entryAsset, draft.exitAsset, draft.mainAsset, resetDraft]);

  const persistCampaign = async () => {
    if (!draft.nome.trim()) {
      setError("Informe o nome da campanha.");
      return;
    }

    if (!draft.mainAsset || !draft.entryAsset || !draft.exitAsset) {
      setError("Envie a midia principal e as duas partes da transicao antes de salvar.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFeedback(null);

      await axios.post(`${apiUrl}/api/propaganda/campaigns`, {
        nome: draft.nome,
        descricao: draft.descricao,
        storageFolder: draft.storageFolder,
        mediaType: draft.mainAsset.mediaType,
        mediaUrl: draft.mainAsset.publicUrl,
        mediaPath: draft.mainAsset.path,
        durationSeconds: draft.durationSeconds,
        transitionStyle: DEFAULT_TRANSITION_STYLE,
        transitionMediaType: draft.entryAsset.mediaType,
        transitionMediaUrl: draft.entryAsset.publicUrl,
        transitionMediaPath: draft.entryAsset.path,
        transitionEntryMediaType: draft.entryAsset.mediaType,
        transitionEntryMediaUrl: draft.entryAsset.publicUrl,
        transitionEntryMediaPath: draft.entryAsset.path,
        transitionExitMediaType: draft.exitAsset.mediaType,
        transitionExitMediaUrl: draft.exitAsset.publicUrl,
        transitionExitMediaPath: draft.exitAsset.path,
        isActive: draft.isActive,
      });

      resetDraft();
      setIsCreateModalOpen(false);
      setFeedback("Campanha criada com sucesso.");
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
      setSaving(true);
      setError(null);
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
    } finally {
      setSaving(false);
    }
  };

  const triggerCampaign = async (campaignId: number) => {
    try {
      setSaving(true);
      setError(null);
      setFeedback(null);
      await axios.post(`${apiUrl}/api/propaganda/trigger`, { campaignId });
      setFeedback("Campanha enviada para a fullscreen.");
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
      setFeedback("Exibicao global interrompida.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao parar exibicao:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao interromper exibicao.");
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
      setFeedback("Loop global atualizado.");
      await loadData();
    } catch (requestError: unknown) {
      console.error("Erro ao salvar loop global:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao salvar loop global.");
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
      <div className="ads-page">
        <Helmet>
          <title>Propagandas</title>
        </Helmet>

        <div className="ads-page__backdrop" />

        <header className="ads-page__header">
          <div>
            <p className="ads-page__eyebrow">Propaganda Programada</p>
            <h1>Controle de campanhas</h1>
            <p className="ads-page__subtitle">
              Fluxo simples de criacao por modal, com loop global mantido no backend.
            </p>
          </div>

          <div className="ads-page__header-actions">
            <button
              type="button"
              className="ads-button ads-button--ghost"
              onClick={() => void loadData()}
              disabled={loading || saving}
            >
              Atualizar
            </button>
            <button
              type="button"
              className="ads-button ads-button--danger"
              onClick={() => void stopPlayback()}
              disabled={saving || runtime?.status !== "playing"}
            >
              Parar exibicao
            </button>
            <button
              type="button"
              className="ads-button ads-button--primary"
              onClick={openCreateModal}
            >
              Nova campanha
            </button>
          </div>
        </header>

        {error && <div className="ads-banner ads-banner--error">{error}</div>}
        {feedback && <div className="ads-banner ads-banner--success">{feedback}</div>}

        <section className="ads-kpis">
          <article className="ads-kpi ads-kpi--accent">
            <span className="ads-kpi__label">Status atual</span>
            <strong className="ads-kpi__value">{formatRuntimeStatus(runtime)}</strong>
            <p>{activeCampaign?.nome || runtime?.activeCampaignName || "Nenhuma campanha em exibicao"}</p>
          </article>

          <article className="ads-kpi">
            <span className="ads-kpi__label">Proximo disparo</span>
            <strong className="ads-kpi__value ads-kpi__value--small">
              {runtime?.nextRunAt
                ? new Date(runtime.nextRunAt).toLocaleString("pt-BR")
                : "Nao agendado"}
            </strong>
            <p>Loop compartilhado por toda a fullscreen.</p>
          </article>

          <article className="ads-kpi">
            <span className="ads-kpi__label">Campanhas cadastradas</span>
            <strong className="ads-kpi__value">{campaigns.length}</strong>
            <p>{campaigns.filter((campaign) => campaign.isActive).length} ativas para disparo.</p>
          </article>
        </section>

        <section className="ads-layout">
          <article className="ads-panel ads-panel--compact">
            <div className="ads-panel__head">
              <div>
                <p className="ads-panel__eyebrow">Loop global</p>
                <h2>Agenda automatica</h2>
              </div>
            </div>

            <div className="ads-form">
              <label className="ads-switch-row">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(event) => setScheduleEnabled(event.target.checked)}
                />
                <span>Habilitar disparos automaticos</span>
              </label>

              <label>
                <span>Campanha do loop</span>
                <select
                  value={scheduleCampaignId || ""}
                  onChange={(event) =>
                    setScheduleCampaignId(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">Selecione uma campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Intervalo em minutos</span>
                <input
                  type="number"
                  min="1"
                  max="240"
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(Number(event.target.value || 1))}
                />
              </label>

              <button
                type="button"
                className="ads-button ads-button--primary"
                onClick={() => void saveSchedule()}
                disabled={saving}
              >
                Salvar loop global
              </button>
            </div>
          </article>

          <article className="ads-panel ads-panel--compact">
            <div className="ads-panel__head">
              <div>
                <p className="ads-panel__eyebrow">Novo fluxo</p>
                <h2>Como funciona</h2>
              </div>
            </div>

            <div className="ads-checklist">
              <div>
                <strong>1. Criar por modal</strong>
                <p>Nome, duracao e status da campanha.</p>
              </div>
              <div>
                <strong>2. Enviar 3 arquivos</strong>
                <p>Midia principal, transicao de entrada e transicao de saida.</p>
              </div>
              <div>
                <strong>3. Pasta automatica</strong>
                <p>
                  Cada campanha grava arquivos em <em>Midias</em> e <em>Transicoes</em> dentro da propria pasta.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="ads-panel ads-panel--full">
          <div className="ads-panel__head">
            <div>
              <p className="ads-panel__eyebrow">Campanhas disponiveis</p>
              <h2>Acionamento e status</h2>
            </div>
          </div>

          {loading ? (
            <div className="ads-empty">Carregando campanhas...</div>
          ) : campaigns.length === 0 ? (
            <div className="ads-empty">Nenhuma campanha cadastrada ainda.</div>
          ) : (
            <div className="ads-campaign-list">
              {campaigns.map((campaign) => {
                const mainPreview = assetToPreview({
                  name: getAssetFileName({
                    name: campaign.nome,
                    path: campaign.mediaPath || campaign.mediaUrl,
                    publicUrl: campaign.mediaUrl,
                    mediaType: campaign.mediaType,
                    mimeType: null,
                    size: null,
                    createdAt: null,
                    updatedAt: null,
                  }),
                  path: campaign.mediaPath || campaign.mediaUrl,
                  publicUrl: campaign.mediaUrl,
                  mediaType: campaign.mediaType,
                  mimeType: null,
                  size: null,
                  createdAt: null,
                  updatedAt: null,
                });
                const entryPreview = campaign.transitionEntryMediaUrl
                  ? assetToPreview({
                      name: getAssetFileName({
                        name: campaign.nome,
                        path:
                          campaign.transitionEntryMediaPath || campaign.transitionEntryMediaUrl,
                        publicUrl: campaign.transitionEntryMediaUrl,
                        mediaType: campaign.transitionEntryMediaType || "image",
                        mimeType: null,
                        size: null,
                        createdAt: null,
                        updatedAt: null,
                      }),
                      path:
                        campaign.transitionEntryMediaPath || campaign.transitionEntryMediaUrl,
                      publicUrl: campaign.transitionEntryMediaUrl,
                      mediaType: campaign.transitionEntryMediaType || "image",
                      mimeType: null,
                      size: null,
                      createdAt: null,
                      updatedAt: null,
                    })
                  : null;
                const exitPreview = campaign.transitionExitMediaUrl
                  ? assetToPreview({
                      name: getAssetFileName({
                        name: campaign.nome,
                        path:
                          campaign.transitionExitMediaPath || campaign.transitionExitMediaUrl,
                        publicUrl: campaign.transitionExitMediaUrl,
                        mediaType: campaign.transitionExitMediaType || "image",
                        mimeType: null,
                        size: null,
                        createdAt: null,
                        updatedAt: null,
                      }),
                      path:
                        campaign.transitionExitMediaPath || campaign.transitionExitMediaUrl,
                      publicUrl: campaign.transitionExitMediaUrl,
                      mediaType: campaign.transitionExitMediaType || "image",
                      mimeType: null,
                      size: null,
                      createdAt: null,
                      updatedAt: null,
                    })
                  : null;

                return (
                  <article key={campaign.id} className="ads-campaign-card">
                    <div className="ads-campaign-card__top">
                      <div>
                        <div className="ads-campaign-card__title-row">
                          <h3>{campaign.nome}</h3>
                          <span
                            className={`ads-status-pill ${campaign.isActive ? "is-active" : "is-inactive"}`}
                          >
                            {campaign.isActive ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                        <p>{campaign.descricao || "Sem descricao cadastrada."}</p>
                      </div>

                      <div className="ads-campaign-card__meta">
                        <span>{campaign.durationSeconds}s</span>
                        <span>{campaign.storageFolder || "Pasta nao definida"}</span>
                      </div>
                    </div>

                    <div className="ads-campaign-card__assets">
                      <div className="ads-simple-asset">
                        <span>Midia principal</span>
                        <div className="ads-simple-asset__preview">
                          {renderAssetPreview(mainPreview, campaign.nome)}
                        </div>
                      </div>

                      <div className="ads-simple-asset">
                        <span>Entrada</span>
                        <div className="ads-simple-asset__preview">
                          {renderAssetPreview(entryPreview, `${campaign.nome} entrada`)}
                        </div>
                      </div>

                      <div className="ads-simple-asset">
                        <span>Saida</span>
                        <div className="ads-simple-asset__preview">
                          {renderAssetPreview(exitPreview, `${campaign.nome} saida`)}
                        </div>
                      </div>
                    </div>

                    <div className="ads-campaign-card__actions">
                      <button
                        type="button"
                        className="ads-button ads-button--primary"
                        onClick={() => void triggerCampaign(campaign.id)}
                        disabled={saving || !campaign.isActive}
                      >
                        Exibir agora
                      </button>
                      <button
                        type="button"
                        className="ads-button ads-button--ghost"
                        onClick={() => void updateCampaign(campaign.id, { isActive: !campaign.isActive })}
                        disabled={saving}
                      >
                        {campaign.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {isCreateModalOpen && (
          <div className="ads-modal" role="dialog" aria-modal="true">
            <div className="ads-modal__backdrop" onClick={() => void closeCreateModal()} />
            <div className="ads-modal__panel">
              <div className="ads-modal__head">
                <div>
                  <p className="ads-panel__eyebrow">Nova campanha</p>
                  <h2>Criar campanha por modal</h2>
                  <p>
                    A campanha sera organizada em uma pasta propria com <strong>Midias</strong> e <strong>Transicoes</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  className="ads-button ads-button--ghost"
                  onClick={() => void closeCreateModal()}
                  disabled={saving || cleaningDraft}
                >
                  Fechar
                </button>
              </div>

              <div className="ads-modal__content">
                <section className="ads-modal__section">
                  <div className="ads-form ads-form--modal">
                    <label>
                      <span>Nome da campanha</span>
                      <input
                        value={draft.nome}
                        onChange={(event) => {
                          const nextName = event.target.value;
                          setDraft((current) => ({
                            ...current,
                            nome: nextName,
                            storageFolder:
                              current.storageFolder && draftFolderLocked
                                ? current.storageFolder
                                : buildDraftFolderKey(nextName),
                          }));
                        }}
                        placeholder="Lancamento, institucional, plantao..."
                      />
                    </label>

                    <label>
                      <span>Duracao em segundos</span>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={draft.durationSeconds}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            durationSeconds: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </label>

                    <label className="ads-form__span-2">
                      <span>Descricao</span>
                      <textarea
                        rows={3}
                        value={draft.descricao}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, descricao: event.target.value }))
                        }
                        placeholder="Resumo rapido sobre quando e como essa campanha deve ser usada."
                      />
                    </label>

                    <label className="ads-switch-row ads-form__span-2">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, isActive: event.target.checked }))
                        }
                      />
                      <span>Salvar campanha ja ativa</span>
                    </label>
                  </div>

                  <div className="ads-folder-preview">
                    <span>Pasta da campanha</span>
                    <strong>{draft.storageFolder || buildDraftFolderKey(draft.nome)}</strong>
                    <p>Depois do primeiro upload, a pasta fica travada para manter a organizacao dos arquivos.</p>
                  </div>
                </section>

                <section className="ads-modal__section">
                  <div className="ads-modal__section-head">
                    <div>
                      <h3>Arquivos da campanha</h3>
                      <p>Envie exatamente os tres arquivos usados na peca.</p>
                    </div>
                    <span>{selectedAssetsCount}/3 enviados</span>
                  </div>

                  <div className="ads-upload-grid">
                    {([
                      ["main", draft.mainAsset],
                      ["entry", draft.entryAsset],
                      ["exit", draft.exitAsset],
                    ] as [CampaignAssetSlot, SelectedCampaignAsset | null][]).map(([slot, asset]) => (
                      <article key={slot} className="ads-upload-card">
                        <div className="ads-upload-card__head">
                          <div>
                            <strong>{getAssetLabel(slot)}</strong>
                            <p>{getAssetHint(slot)}</p>
                          </div>
                          <span>{formatMediaType(asset?.mediaType)}</span>
                        </div>

                        <div className="ads-upload-card__preview">
                          {renderAssetPreview(asset, getAssetLabel(slot))}
                        </div>

                        <div className="ads-upload-card__meta">
                          <strong>{asset ? getAssetFileName(asset) : "Nenhum arquivo enviado"}</strong>
                          <p>
                            {slot === "main"
                              ? "Bucket > campanha > Midias"
                              : "Bucket > campanha > Transicoes"}
                          </p>
                        </div>

                        <div className="ads-upload-card__actions">
                          <label className="ads-button ads-button--primary ads-upload-button">
                            <input
                              type="file"
                              accept="video/mp4,image/gif,image/svg+xml,image/png,image/jpeg,image/webp"
                              onChange={(event) => {
                                void uploadDraftAsset(slot, event.target.files?.[0] || null);
                                event.target.value = "";
                              }}
                              disabled={Boolean(uploadingSlot) || saving || cleaningDraft}
                            />
                            {uploadingSlot === slot
                              ? "Enviando..."
                              : asset
                                ? "Substituir"
                                : "Enviar arquivo"}
                          </label>
                          <button
                            type="button"
                            className="ads-button ads-button--ghost"
                            onClick={() => void removeDraftAsset(slot)}
                            disabled={!asset || saving || cleaningDraft || Boolean(uploadingSlot)}
                          >
                            Remover
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <div className="ads-modal__footer">
                <button
                  type="button"
                  className="ads-button ads-button--ghost"
                  onClick={() => void closeCreateModal()}
                  disabled={saving || cleaningDraft}
                >
                  {cleaningDraft ? "Limpando..." : "Cancelar"}
                </button>
                <button
                  type="button"
                  className="ads-button ads-button--primary"
                  onClick={() => void persistCampaign()}
                  disabled={saving || cleaningDraft || Boolean(uploadingSlot)}
                >
                  {saving ? "Salvando..." : "Salvar campanha"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HelmetProvider>
  );
}
