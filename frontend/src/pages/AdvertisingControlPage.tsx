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
import { apiUrl } from "../config/api";
import "./AdvertisingControlPage.css";

const DEFAULT_TRANSITION_STYLE = "architectural-curtain";
const DEFAULT_MAIN_MEDIA_DURATION_SECONDS = 8;
const DEFAULT_TRANSITION_DURATION_SECONDS = 1.2;

type CampaignAssetSlot = "main" | "entry" | "exit";

interface SelectedCampaignAsset extends PropagandaMediaAsset {
  slot: CampaignAssetSlot;
}

interface CampaignDraft {
  nome: string;
  descricao: string;
  isActive: boolean;
  storageFolder: string;
  mainAsset: SelectedCampaignAsset | null;
  mainMuted: boolean;
  mainVolume: number;
  entryAsset: SelectedCampaignAsset | null;
  entryMuted: boolean;
  entryVolume: number;
  exitAsset: SelectedCampaignAsset | null;
  exitMuted: boolean;
  exitVolume: number;
}

interface CampaignAudioDraft {
  mainMuted: boolean;
  mainVolume: number;
  entryMuted: boolean;
  entryVolume: number;
  exitMuted: boolean;
  exitVolume: number;
}

const emptyDraft: CampaignDraft = {
  nome: "",
  descricao: "",
  isActive: true,
  storageFolder: "",
  mainAsset: null,
  mainMuted: false,
  mainVolume: 1,
  entryAsset: null,
  entryMuted: false,
  entryVolume: 1,
  exitAsset: null,
  exitMuted: false,
  exitVolume: 1,
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

  if (mime === "video/mp4" || mime === "video/webm" || name.endsWith(".mp4") || name.endsWith(".webm")) return "mp4";
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

function getFallbackAssetDurationSeconds(slot: CampaignAssetSlot): number {
  return slot === "main"
    ? DEFAULT_MAIN_MEDIA_DURATION_SECONDS
    : DEFAULT_TRANSITION_DURATION_SECONDS;
}

function readVideoDurationSeconds(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();

      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
        return;
      }

      reject(new Error("Duracao de video invalida."));
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Falha ao ler metadata do video."));
    };

    video.src = url;
  });
}

async function resolveAssetDurationSeconds(
  asset: Pick<PropagandaMediaAsset, "mediaType" | "publicUrl"> | null,
  slot: CampaignAssetSlot
): Promise<number> {
  if (!asset || !asset.publicUrl) {
    return 0;
  }

  if (asset.mediaType !== "mp4") {
    return getFallbackAssetDurationSeconds(slot);
  }

  try {
    return await readVideoDurationSeconds(asset.publicUrl);
  } catch {
    return getFallbackAssetDurationSeconds(slot);
  }
}

async function calculateCampaignDurationSeconds(input: {
  mainAsset: Pick<PropagandaMediaAsset, "mediaType" | "publicUrl"> | null;
  entryAsset: Pick<PropagandaMediaAsset, "mediaType" | "publicUrl"> | null;
  exitAsset: Pick<PropagandaMediaAsset, "mediaType" | "publicUrl"> | null;
}): Promise<number> {
  const [entryDuration, mainDuration, exitDuration] = await Promise.all([
    resolveAssetDurationSeconds(input.entryAsset, "entry"),
    resolveAssetDurationSeconds(input.mainAsset, "main"),
    resolveAssetDurationSeconds(input.exitAsset, "exit"),
  ]);

  return Math.max(1, Math.ceil(entryDuration + mainDuration + exitDuration));
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function volumePercentToUnit(value: number): number {
  return clampVolume(value / 100);
}

function volumeUnitToPercent(value: number): number {
  return Math.round(clampVolume(value) * 100);
}

function getCampaignAudioDraft(campaign: PropagandaCampaign): CampaignAudioDraft {
  return {
    mainMuted: campaign.mediaMuted,
    mainVolume: campaign.mediaVolume,
    entryMuted: campaign.transitionEntryMuted,
    entryVolume: campaign.transitionEntryVolume,
    exitMuted: campaign.transitionExitMuted,
    exitVolume: campaign.transitionExitVolume,
  };
}

function getDraftAudioValues(draft: CampaignDraft, slot: CampaignAssetSlot) {
  if (slot === "main") {
    return { muted: draft.mainMuted, volume: draft.mainVolume };
  }

  if (slot === "entry") {
    return { muted: draft.entryMuted, volume: draft.entryVolume };
  }

  return { muted: draft.exitMuted, volume: draft.exitVolume };
}

function buildCampaignAudioPayload(audio: CampaignAudioDraft): Record<string, unknown> {
  return {
    mediaMuted: audio.mainMuted,
    mediaVolume: clampVolume(audio.mainVolume),
    transitionMediaMuted: audio.entryMuted,
    transitionMediaVolume: clampVolume(audio.entryVolume),
    transitionEntryMuted: audio.entryMuted,
    transitionEntryVolume: clampVolume(audio.entryVolume),
    transitionExitMuted: audio.exitMuted,
    transitionExitVolume: clampVolume(audio.exitVolume),
  };
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

function getCampaignSlotAsset(
  campaign: PropagandaCampaign,
  slot: CampaignAssetSlot
): PropagandaMediaAsset | null {
  if (slot === "main") {
    if (!campaign.mediaType || !campaign.mediaUrl) {
      return null;
    }

    return {
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
    };
  }

  if (slot === "entry") {
    if (!campaign.transitionEntryMediaUrl || !campaign.transitionEntryMediaType) {
      return null;
    }

    return {
      name: getAssetFileName({
        name: campaign.nome,
        path: campaign.transitionEntryMediaPath || campaign.transitionEntryMediaUrl,
        publicUrl: campaign.transitionEntryMediaUrl,
        mediaType: campaign.transitionEntryMediaType,
        mimeType: null,
        size: null,
        createdAt: null,
        updatedAt: null,
      }),
      path: campaign.transitionEntryMediaPath || campaign.transitionEntryMediaUrl,
      publicUrl: campaign.transitionEntryMediaUrl,
      mediaType: campaign.transitionEntryMediaType,
      mimeType: null,
      size: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  if (!campaign.transitionExitMediaUrl || !campaign.transitionExitMediaType) {
    return null;
  }

  return {
    name: getAssetFileName({
      name: campaign.nome,
      path: campaign.transitionExitMediaPath || campaign.transitionExitMediaUrl,
      publicUrl: campaign.transitionExitMediaUrl,
      mediaType: campaign.transitionExitMediaType,
      mimeType: null,
      size: null,
      createdAt: null,
      updatedAt: null,
    }),
    path: campaign.transitionExitMediaPath || campaign.transitionExitMediaUrl,
    publicUrl: campaign.transitionExitMediaUrl,
    mediaType: campaign.transitionExitMediaType,
    mimeType: null,
    size: null,
    createdAt: null,
    updatedAt: null,
  };
}

function buildCampaignAssetPayload(
  slot: CampaignAssetSlot,
  asset: PropagandaMediaAsset | null
): Record<string, unknown> {
  if (slot === "main") {
    return {
      mediaType: asset?.mediaType ?? null,
      mediaUrl: asset?.publicUrl ?? null,
      mediaPath: asset?.path ?? null,
    };
  }

  if (slot === "entry") {
    return {
      transitionMediaType: asset?.mediaType ?? null,
      transitionMediaUrl: asset?.publicUrl ?? null,
      transitionMediaPath: asset?.path ?? null,
      transitionEntryMediaType: asset?.mediaType ?? null,
      transitionEntryMediaUrl: asset?.publicUrl ?? null,
      transitionEntryMediaPath: asset?.path ?? null,
    };
  }

  return {
    transitionExitMediaType: asset?.mediaType ?? null,
    transitionExitMediaUrl: asset?.publicUrl ?? null,
    transitionExitMediaPath: asset?.path ?? null,
  };
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
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState(0);
  const [campaignAudioDrafts, setCampaignAudioDrafts] = useState<Record<number, CampaignAudioDraft>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [uploadingExistingAssetKey, setUploadingExistingAssetKey] = useState<string | null>(null);

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

  useEffect(() => {
    setCampaignAudioDrafts((current) => {
      const next: Record<number, CampaignAudioDraft> = {};
      campaigns.forEach((campaign) => {
        next[campaign.id] = current[campaign.id] || getCampaignAudioDraft(campaign);
      });
      return next;
    });
  }, [campaigns]);

  useEffect(() => {
    if (campaigns.length === 0) {
      setSelectedCampaignId(null);
      return;
    }

    setSelectedCampaignId((current) => {
      if (current && campaigns.some((campaign) => campaign.id === current)) {
        return current;
      }

      if (runtime?.activeCampaignId && campaigns.some((campaign) => campaign.id === runtime.activeCampaignId)) {
        return runtime.activeCampaignId;
      }

      return campaigns.find((campaign) => campaign.isActive)?.id || campaigns[0]?.id || null;
    });
  }, [campaigns, runtime?.activeCampaignId]);

  const activeCampaign = useMemo(() => {
    if (!runtime?.activeCampaignId) return null;
    return campaigns.find((campaign) => campaign.id === runtime.activeCampaignId) || null;
  }, [campaigns, runtime?.activeCampaignId]);

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  const selectedAssetsCount = [draft.mainAsset, draft.entryAsset, draft.exitAsset].filter(
    Boolean
  ).length;

  useEffect(() => {
    let cancelled = false;

    const syncEstimatedDuration = async () => {
      if (!draft.mainAsset && !draft.entryAsset && !draft.exitAsset) {
        setEstimatedDurationSeconds(0);
        return;
      }

      const duration = await calculateCampaignDurationSeconds({
        mainAsset: draft.mainAsset,
        entryAsset: draft.entryAsset,
        exitAsset: draft.exitAsset,
      });

      if (!cancelled) {
        setEstimatedDurationSeconds(duration);
      }
    };

    void syncEstimatedDuration();

    return () => {
      cancelled = true;
    };
  }, [draft.entryAsset, draft.exitAsset, draft.mainAsset]);

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

      const calculatedDurationSeconds = await calculateCampaignDurationSeconds({
        mainAsset: draft.mainAsset,
        entryAsset: draft.entryAsset,
        exitAsset: draft.exitAsset,
      });

      await axios.post(`${apiUrl}/api/propaganda/campaigns`, {
        nome: draft.nome,
        descricao: draft.descricao,
        storageFolder: draft.storageFolder,
        mediaType: draft.mainAsset.mediaType,
        mediaUrl: draft.mainAsset.publicUrl,
        mediaPath: draft.mainAsset.path,
        mediaMuted: draft.mainMuted,
        mediaVolume: clampVolume(draft.mainVolume),
        durationSeconds: calculatedDurationSeconds,
        transitionStyle: DEFAULT_TRANSITION_STYLE,
        transitionMediaType: draft.entryAsset.mediaType,
        transitionMediaUrl: draft.entryAsset.publicUrl,
        transitionMediaPath: draft.entryAsset.path,
        transitionMediaMuted: draft.entryMuted,
        transitionMediaVolume: clampVolume(draft.entryVolume),
        transitionEntryMediaType: draft.entryAsset.mediaType,
        transitionEntryMediaUrl: draft.entryAsset.publicUrl,
        transitionEntryMediaPath: draft.entryAsset.path,
        transitionEntryMuted: draft.entryMuted,
        transitionEntryVolume: clampVolume(draft.entryVolume),
        transitionExitMediaType: draft.exitAsset.mediaType,
        transitionExitMediaUrl: draft.exitAsset.publicUrl,
        transitionExitMediaPath: draft.exitAsset.path,
        transitionExitMuted: draft.exitMuted,
        transitionExitVolume: clampVolume(draft.exitVolume),
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

  const updateCampaign = useCallback(async (campaignId: number, payload: Record<string, unknown>) => {
    try {
      setSaving(true);
      setError(null);
      const response = await axios.put(`${apiUrl}/api/propaganda/campaigns/${campaignId}`, payload);
      await loadData();
      return response.data?.campaign || null;
    } catch (requestError: unknown) {
      console.error("Erro ao atualizar campanha:", requestError);
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || requestError.message);
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Falha ao atualizar campanha.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [loadData]);

  const updateDraftAudio = (slot: CampaignAssetSlot, changes: Partial<{ muted: boolean; volume: number }>) => {
    setDraft((current) => {
      if (slot === "main") {
        return {
          ...current,
          mainMuted: changes.muted ?? current.mainMuted,
          mainVolume: changes.volume != null ? clampVolume(changes.volume) : current.mainVolume,
        };
      }

      if (slot === "entry") {
        return {
          ...current,
          entryMuted: changes.muted ?? current.entryMuted,
          entryVolume: changes.volume != null ? clampVolume(changes.volume) : current.entryVolume,
        };
      }

      return {
        ...current,
        exitMuted: changes.muted ?? current.exitMuted,
        exitVolume: changes.volume != null ? clampVolume(changes.volume) : current.exitVolume,
      };
    });
  };

  const updateCampaignAudioDraft = (
    campaignId: number,
    slot: CampaignAssetSlot,
    changes: Partial<{ muted: boolean; volume: number }>
  ) => {
    setCampaignAudioDrafts((current) => {
      const existing = current[campaignId];
      if (!existing) {
        return current;
      }

      const next = { ...existing };
      if (slot === "main") {
        next.mainMuted = changes.muted ?? next.mainMuted;
        next.mainVolume = changes.volume != null ? clampVolume(changes.volume) : next.mainVolume;
      } else if (slot === "entry") {
        next.entryMuted = changes.muted ?? next.entryMuted;
        next.entryVolume = changes.volume != null ? clampVolume(changes.volume) : next.entryVolume;
      } else {
        next.exitMuted = changes.muted ?? next.exitMuted;
        next.exitVolume = changes.volume != null ? clampVolume(changes.volume) : next.exitVolume;
      }

      return {
        ...current,
        [campaignId]: next,
      };
    });
  };

  const saveCampaignAudio = async (campaign: PropagandaCampaign) => {
    const audioDraft = campaignAudioDrafts[campaign.id];
    if (!audioDraft) return;

    await updateCampaign(campaign.id, buildCampaignAudioPayload(audioDraft));
    setFeedback(`Audio da campanha ${campaign.nome} atualizado.`);
  };

  const replaceCampaignAsset = useCallback(
    async (campaign: PropagandaCampaign, slot: CampaignAssetSlot, file: File | null) => {
      if (!file) return;

      const folderKey = campaign.storageFolder || buildDraftFolderKey(campaign.nome);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignKey", folderKey);
      if (slot === "main") {
        formData.append("category", "main");
      } else {
        formData.append("category", "transition");
        formData.append("transitionPart", slot === "entry" ? "entry" : "exit");
      }

      const currentMainAsset = getCampaignSlotAsset(campaign, "main");
      const currentEntryAsset = getCampaignSlotAsset(campaign, "entry");
      const currentExitAsset = getCampaignSlotAsset(campaign, "exit");
      const previousAsset = getCampaignSlotAsset(campaign, slot);

      try {
        setUploadingExistingAssetKey(`${campaign.id}:${slot}`);
        setError(null);
        setFeedback(null);

        const uploadResponse = await axios.post(`${apiUrl}/api/propaganda/media/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });

        const media = uploadResponse.data?.media as PropagandaMediaAsset | undefined;
        if (!media) {
          throw new Error("Resposta invalida do upload da midia.");
        }

        const nextAsset: PropagandaMediaAsset = {
          ...media,
          mediaType: media.mediaType || inferUploadMediaType(file),
        };

        const calculatedDurationSeconds = await calculateCampaignDurationSeconds({
          mainAsset: slot === "main" ? nextAsset : currentMainAsset,
          entryAsset: slot === "entry" ? nextAsset : currentEntryAsset,
          exitAsset: slot === "exit" ? nextAsset : currentExitAsset,
        });

        const updatedCampaign = await updateCampaign(campaign.id, {
          storageFolder: folderKey,
          durationSeconds: calculatedDurationSeconds,
          ...buildCampaignAssetPayload(slot, nextAsset),
        });

        if (!updatedCampaign) {
          throw new Error("Falha ao atualizar campanha com a nova midia.");
        }

        if (previousAsset?.path && previousAsset.path !== nextAsset.path) {
          await axios.delete(`${apiUrl}/api/propaganda/media`, {
            data: { path: previousAsset.path },
          });
        }

        setFeedback(`${getAssetLabel(slot)} atualizada na campanha ${campaign.nome}.`);
      } catch (requestError: unknown) {
        console.error("Erro ao substituir midia da campanha:", requestError);
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.error || requestError.message);
        } else if (requestError instanceof Error) {
          setError(requestError.message);
        } else {
          setError("Falha ao substituir midia da campanha.");
        }
      } finally {
        setUploadingExistingAssetKey(null);
      }
    },
    [updateCampaign]
  );

  const removeCampaignAsset = useCallback(
    async (campaign: PropagandaCampaign, slot: CampaignAssetSlot) => {
      const existingAsset = getCampaignSlotAsset(campaign, slot);
      if (!existingAsset) return;

      const confirmed = window.confirm(
        `Remover ${getAssetLabel(slot).toLowerCase()} da campanha ${campaign.nome}?`
      );

      if (!confirmed) return;

      const currentMainAsset = getCampaignSlotAsset(campaign, "main");
      const currentEntryAsset = getCampaignSlotAsset(campaign, "entry");
      const currentExitAsset = getCampaignSlotAsset(campaign, "exit");

      try {
        setSaving(true);
        setError(null);
        setFeedback(null);

        const calculatedDurationSeconds = await calculateCampaignDurationSeconds({
          mainAsset: slot === "main" ? null : currentMainAsset,
          entryAsset: slot === "entry" ? null : currentEntryAsset,
          exitAsset: slot === "exit" ? null : currentExitAsset,
        });

        await axios.put(`${apiUrl}/api/propaganda/campaigns/${campaign.id}`, {
          durationSeconds: calculatedDurationSeconds,
          ...buildCampaignAssetPayload(slot, null),
        });

        if (existingAsset.path) {
          await axios.delete(`${apiUrl}/api/propaganda/media`, {
            data: { path: existingAsset.path },
          });
        }

        setFeedback(`${getAssetLabel(slot)} removida da campanha ${campaign.nome}.`);
        await loadData();
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
    [loadData]
  );

  const triggerCampaign = async (campaign: PropagandaCampaign) => {
    if (!campaign.mediaType || !campaign.mediaUrl) {
      setError(`A campanha ${campaign.nome} nao possui midia principal para exibicao.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFeedback(null);

      const calculatedDurationSeconds = await calculateCampaignDurationSeconds({
        mainAsset: {
          mediaType: campaign.mediaType,
          publicUrl: campaign.mediaUrl,
        },
        entryAsset: campaign.transitionEntryMediaUrl
          ? {
              mediaType: campaign.transitionEntryMediaType || "image",
              publicUrl: campaign.transitionEntryMediaUrl,
            }
          : null,
        exitAsset: campaign.transitionExitMediaUrl
          ? {
              mediaType: campaign.transitionExitMediaType || "image",
              publicUrl: campaign.transitionExitMediaUrl,
            }
          : null,
      });

      await axios.post(`${apiUrl}/api/propaganda/trigger`, {
        campaignId: campaign.id,
        durationSeconds: calculatedDurationSeconds,
      });
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
                  className="ads-select"
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
                <p className="ads-panel__eyebrow">Disparo manual</p>
                <h2>Seletor de campanhas</h2>
              </div>
            </div>

            <div className="ads-form">
              <label>
                <span>Campanha para exibicao imediata</span>
                <select
                  className="ads-select"
                  value={selectedCampaignId || ""}
                  onChange={(event) =>
                    setSelectedCampaignId(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">Selecione uma campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.nome}
                      {!campaign.mediaUrl ? " - sem midia principal" : campaign.isActive ? "" : " - inativa"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ads-quick-trigger-card">
                <strong>{selectedCampaign?.nome || "Nenhuma campanha selecionada"}</strong>
                <p>
                  {selectedCampaign
                    ? selectedCampaign.mediaUrl
                      ? selectedCampaign.isActive
                        ? "Pronta para disparo manual na fullscreen."
                        : "Ative a campanha antes de disparar."
                      : "Envie uma midia principal para liberar a exibicao."
                    : "Escolha uma campanha para acionar rapidamente quando houver varias cadastradas."}
                </p>
              </div>

              <button
                type="button"
                className="ads-button ads-button--primary"
                onClick={() => selectedCampaign && void triggerCampaign(selectedCampaign)}
                disabled={
                  saving ||
                  !selectedCampaign ||
                  !selectedCampaign.isActive ||
                  !selectedCampaign.mediaUrl ||
                  !selectedCampaign.mediaType
                }
              >
                Exibir campanha selecionada
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
                <p>Nome, duracao automatica e status da campanha.</p>
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
                const audioDraft = campaignAudioDrafts[campaign.id] || getCampaignAudioDraft(campaign);
                const savedAssets = (["main", "entry", "exit"] as CampaignAssetSlot[]).map((slot) => ({
                  slot,
                  preview: getCampaignSlotAsset(campaign, slot),
                }));

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
                        <span>{campaign.durationSeconds}s calculados</span>
                        <span>{campaign.storageFolder || "Pasta nao definida"}</span>
                      </div>
                    </div>

                    <div className="ads-campaign-card__assets">
                      {savedAssets.map(({ slot, preview }) => {
                        const slotMuted = slot === "main"
                          ? audioDraft.mainMuted
                          : slot === "entry"
                            ? audioDraft.entryMuted
                            : audioDraft.exitMuted;
                        const slotVolume = slot === "main"
                          ? audioDraft.mainVolume
                          : slot === "entry"
                            ? audioDraft.entryVolume
                            : audioDraft.exitVolume;

                        return (
                          <div key={`${campaign.id}-${slot}`} className="ads-simple-asset">
                            <span>{slot === "main" ? "Midia principal" : slot === "entry" ? "Entrada" : "Saida"}</span>
                            <div className="ads-simple-asset__preview">
                              {renderAssetPreview(
                                preview,
                                slot === "main" ? campaign.nome : `${campaign.nome} ${slot}`
                              )}
                            </div>
                            <div className="ads-audio-controls">
                              <label className="ads-audio-controls__toggle">
                                <input
                                  type="checkbox"
                                  checked={!slotMuted}
                                  onChange={(event) =>
                                    updateCampaignAudioDraft(campaign.id, slot, {
                                      muted: !event.target.checked,
                                    })
                                  }
                                />
                                <span>{slotMuted ? "Mutado" : "Com audio"}</span>
                              </label>
                              <label className="ads-audio-controls__range">
                                <span>Volume {volumeUnitToPercent(slotVolume)}%</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={volumeUnitToPercent(slotVolume)}
                                  onChange={(event) =>
                                    updateCampaignAudioDraft(campaign.id, slot, {
                                      volume: volumePercentToUnit(Number(event.target.value)),
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <div className="ads-asset-inline-actions">
                              <label className="ads-button ads-button--ghost ads-upload-button">
                                <input
                                  type="file"
                                  accept="video/mp4,video/webm,image/gif,image/svg+xml,image/png,image/jpeg,image/webp"
                                  onChange={(event) => {
                                    void replaceCampaignAsset(campaign, slot, event.target.files?.[0] || null);
                                    event.target.value = "";
                                  }}
                                  disabled={saving || uploadingExistingAssetKey === `${campaign.id}:${slot}`}
                                />
                                {uploadingExistingAssetKey === `${campaign.id}:${slot}`
                                  ? "Enviando..."
                                  : preview
                                    ? "Substituir"
                                    : "Enviar"}
                              </label>
                              <button
                                type="button"
                                className="ads-button ads-button--ghost"
                                onClick={() => void removeCampaignAsset(campaign, slot)}
                                disabled={!preview || saving || Boolean(uploadingExistingAssetKey)}
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="ads-campaign-card__actions">
                      <button
                        type="button"
                        className="ads-button ads-button--ghost"
                        onClick={() => void saveCampaignAudio(campaign)}
                        disabled={saving}
                      >
                        Salvar audio
                      </button>
                      <button
                        type="button"
                        className="ads-button ads-button--primary"
                        onClick={() => void triggerCampaign(campaign)}
                        disabled={saving || !campaign.isActive || !campaign.mediaUrl || !campaign.mediaType}
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
                    <p>
                      Duracao calculada automaticamente: <strong>{estimatedDurationSeconds > 0 ? `${estimatedDurationSeconds}s` : "Aguardando arquivos"}</strong>
                    </p>
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
                    ] as [CampaignAssetSlot, SelectedCampaignAsset | null][]).map(([slot, asset]) => {
                        const audioValues = getDraftAudioValues(draft, slot);
                        return (
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

                        <div className="ads-audio-controls ads-audio-controls--card">
                          <label className="ads-audio-controls__toggle">
                            <input
                              type="checkbox"
                              checked={!audioValues.muted}
                              onChange={(event) =>
                                updateDraftAudio(slot, { muted: !event.target.checked })
                              }
                            />
                            <span>{audioValues.muted ? "Mutado" : "Com audio"}</span>
                          </label>
                          <label className="ads-audio-controls__range">
                            <span>Volume {volumeUnitToPercent(audioValues.volume)}%</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={volumeUnitToPercent(audioValues.volume)}
                              onChange={(event) =>
                                updateDraftAudio(slot, {
                                  volume: volumePercentToUnit(Number(event.target.value)),
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="ads-upload-card__actions">
                          <label className="ads-button ads-button--primary ads-upload-button">
                            <input
                              type="file"
                              accept="video/mp4,video/webm,image/gif,image/svg+xml,image/png,image/jpeg,image/webp"
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
                        );
                      }
                    )}
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
